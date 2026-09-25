"""Sol-Attn (arXiv 2607.24027) for MiniMax-H3, via comfy-kitchen's CUDA kernels.

Openkit 移植版：经典 ComfyUI API（非 V3 ComfyNode），适配当前 comfy_kitchen
sol_attn 内核签名（workspace 内建 / tail / topk_ratio）。

单文件节点：在 model 上安装 optimized_attention_override（per-model patch，
按 sigma 调度 dense 预热），带 H3 的 conditioning sink、视频段 Morton 重排、
per-block tau/dense 门控与 override 链式拼接。需要带 ``sol_attn`` 的
comfy_kitchen（bf16/fp16、head_dim 128、sm_80+）；其余情况回退到现有 attention 后端。
"""

import logging
import re
import sys
from functools import partial

# ---------------------------------------------------------------------------
# 软导入：torch / comfy_kitchen 缺失时不让整个插件 import 失败，仅在节点执行
# 时给出中文报错。ComfyUI 运行时 torch 一定存在；这里主要为独立测试/缺依赖时不崩。
# ---------------------------------------------------------------------------

try:
    import torch
except Exception:  # pragma: no cover - 纯防御
    torch = None

try:
    import comfy_kitchen as _ck
    from comfy_kitchen.backends import cuda as _ck_cuda
    _CK_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - 可选依赖
    _ck = None
    _ck_cuda = None
    _CK_IMPORT_ERROR = exc

HEAD_DIM = 128
BLOCK_SIZE = 64  # 内核块大小；排列按此网格对齐

_stats = {"sparse": 0, "dense_fallback": 0, "outside_range": 0,
          "dense_block": 0, "errors": 0}
_seen = set()
_BLOCK_INDEX_HOOKED = set()


def parse_blocks(spec, count):
    """Parse "0-3,47,-1" into absolute block indices; negatives count from the end."""
    out = set()
    for part in "".join(str(spec).split()).split(","):   # tolerate any whitespace
        if not part:
            continue
        match = re.fullmatch(r"(-?\d+)(?:-(-?\d+))?", part)
        if match is None:
            raise ValueError(f"cannot parse block spec {part!r}; "
                             "use indices and ranges like '0-3,47,-1'")
        first = int(match.group(1))
        last = first if match.group(2) is None else int(match.group(2))
        first = first if first >= 0 else count + first
        last = last if last >= 0 else count + last
        if first > last:
            first, last = last, first
        out.update(range(max(first, 0), min(last, count - 1) + 1))
    return frozenset(out)


def parse_tau_profile(spec, count):
    """Parse "0-30=2.0; 39-42=0.9" into {block: tau}.

    Entries are separated by ';' or newlines, so a multiline text node works as
    well as a single line, and '#' starts a comment. Blocks not listed keep the
    node's base tau; the block side takes dense_blocks syntax, so "0-2,47=1.8"
    is valid. Later entries win where they overlap.
    """
    profile = {}
    for entry in re.split(r"[;\n]", str(spec)):
        entry = entry.split("#", 1)[0].strip()
        if not entry:
            continue
        blocks, sep, value = entry.partition("=")
        if not sep:
            raise ValueError(f"tau_profile entry {entry!r} needs '=', e.g. '39-42=0.9'")
        try:
            level = float(value)
        except ValueError:
            raise ValueError(f"tau_profile entry {entry!r} has a non-numeric tau")
        for block in parse_blocks(blocks, count):
            profile[block] = level
    return profile


def _install_block_index(model):
    """Publish the running block index into transformer_options."""
    blocks = getattr(model, "blocks", None)
    if blocks is None:
        return False
    if id(model) in _BLOCK_INDEX_HOOKED:
        return True

    def make_hook(index):
        def hook(_module, _args, kwargs):
            options = kwargs.get("transformer_options")
            if isinstance(options, dict):
                options["sol_block"] = index
            return None
        return hook

    for index, block in enumerate(blocks):
        block.register_forward_pre_hook(make_hook(index), with_kwargs=True)
    _BLOCK_INDEX_HOOKED.add(id(model))
    return True


def sol_attn_stats():
    """Dispatch counters since process start (or last reset)."""
    return dict(_stats)


def reset_sol_attn_stats():
    for key in _stats:
        _stats[key] = 0
    _seen.clear()


def _log_once(key, message):
    if key not in _seen:
        _seen.add(key)
        logging.info(f"[sol_attn] {message}")


def _log_kernel_failure(exc):
    # Full traceback on the first occurrence of each distinct failure; a short
    # line on repeats so a failing run stays diagnosable without spam.
    key = ("kernel_failure", type(exc).__name__, str(exc))
    first = key not in _seen
    _seen.add(key)
    logging.error(f"[sol_attn] kernel failed ({exc}); falling back", exc_info=first)


# ---------------------------------------------------------------------------
# Morton (Z-order) reordering of H3's video span. Inlined from the reference
# pack's _morton.py / _morton_h3.py, minus the Wan path.
# ---------------------------------------------------------------------------

_PERM_CACHE = {}


def morton_perm(grid, device, curve="3d"):
    """Z-order permutation and its inverse.

    curve="3d"       interleave t/h/w equally.
    curve="2d_frame" Z-order within each frame, frames left in original order.
                     Use this when the temporal axis is not uniformly spaced --
                     MiniMax-H3's FRAME_PER_TOKEN is (1, 4, 4, 4, 4), so
                     index-adjacent frames are 1 or 4 real frames apart and a 3D
                     curve groups temporally distant tokens together.
    """
    key = (tuple(int(x) for x in grid), curve)
    hit = _PERM_CACHE.get(key)
    if hit is None:
        frames, height, width = key[0]
        linear = torch.arange(frames * height * width, dtype=torch.int64)
        area = height * width
        z = linear // area
        rem = linear - z * area
        y = rem // width
        x = rem - y * width

        def part1by2(value):
            value = value & 0x1FFFFF
            value = (value | (value << 32)) & 0x1F00000000FFFF
            value = (value | (value << 16)) & 0x1F0000FF0000FF
            value = (value | (value << 8)) & 0x100F00F00F00F00F
            value = (value | (value << 4)) & 0x10C30C30C30C30C3
            value = (value | (value << 2)) & 0x1249249249249249
            return value

        if curve == "2d_frame":
            # frame index stays the most significant key, so frames never mix
            code = (z << 42) | part1by2(x) | (part1by2(y) << 1)
        else:
            code = part1by2(x) | (part1by2(y) << 1) | (part1by2(z) << 2)
        perm = linear[torch.argsort(code)]
        hit = (perm, torch.argsort(perm))
        _PERM_CACHE[key] = hit
    return hit[0].to(device), hit[1].to(device)


def _h3_log_once(message):
    _log_once(("h3", message), f"H3 Morton: {message}")


_INSTALLED = set()
_PATCHED_LAYOUTS = set()
_DEVICE_CACHE = {}
# id(position_ids) -> (layout, span). The layout is kept alive deliberately so
# the id cannot be recycled underneath us; there is one entry per distinct shape.
_SPANS = {}


def _perm_for(grid, curve, device, start):
    """Morton permutation for a video span starting at absolute row ``start``.

    The kernels block from absolute position 0, so a span that does not start on
    a block boundary splits every Z-order cell across two blocks, joining
    opposite ends of the volume. Rotating by the misalignment realigns the
    cells; the ragged group it displaces lands in the block shared with the
    conditioning rows, which the exact-KV sink already keeps exact.
    """
    pad = (-int(start)) % BLOCK_SIZE
    key = (tuple(grid), curve, str(device), pad)
    hit = _DEVICE_CACHE.get(key)
    if hit is None:
        perm, inverse = morton_perm(grid, device, curve)
        if pad:
            perm = torch.roll(perm, pad)
            inverse = torch.argsort(perm)
        hit = (perm, inverse)
        _DEVICE_CACHE[key] = hit
    return hit


def _video_span(layout, latent_t, latent_h, latent_w):
    """(start, stop, grid) for the target video segment, or None.

    The grid is stored rather than a permutation so the curve can be changed
    between runs without rebuilding layouts.
    """
    segments = getattr(layout, "segments", None)
    if not segments:
        return None
    span = next(((a, b) for a, b, kind in segments if kind == "video"), None)
    if span is None:
        return None
    start, stop = span
    grid = (int(latent_t), int(latent_h) // 2, int(latent_w) // 2)
    if grid[0] * grid[1] * grid[2] != stop - start:
        logging.info(f"[sol_attn] H3 Morton skipped: video segment {stop - start} rows "
                     f"does not match grid {grid}")
        return None
    return start, stop, grid


def _patch_packed_layout(module):
    """Register the video span of every PackedLayout built, without mutating it."""
    layout_cls = getattr(module, "PackedLayout", None)
    if layout_cls is None:
        raise RuntimeError(f"{module.__name__} has no PackedLayout")
    if id(layout_cls) in _PATCHED_LAYOUTS:
        return
    original_init = layout_cls.__init__

    def __init__(self, text_len, latent_t, latent_h, latent_w, audio_t, *args, **kwargs):
        original_init(self, text_len, latent_t, latent_h, latent_w, audio_t, *args, **kwargs)
        try:
            span = _video_span(self, latent_t, latent_h, latent_w)
        except Exception as exc:                      # never break model construction
            logging.info(f"[sol_attn] H3 Morton span resolution failed: {exc}")
            span = None
        segs = getattr(self, "segments", []) or []
        bounds = next(((a, b) for a, b, kind in segs if kind == "video"), None)
        # Target audio is the segment immediately before video; sink_q only
        # needs THOSE query rows dense, not the (possibly huge) reference rows.
        audio = next(((a, b) for a, b, kind in segs if kind == "audio"), None)
        if torch.is_tensor(getattr(self, "position_ids", None)) and bounds is not None:
            _SPANS[id(self.position_ids)] = (self, bounds, audio, span)

    layout_cls.__init__ = __init__
    _PATCHED_LAYOUTS.add(id(layout_cls))


def install_h3_morton(model):
    """Idempotently install the reorder. Inert without transformer_options['sol_morton']."""
    if id(model) in _INSTALLED:
        return
    for attr in ("rope_freqs", "_forward", "blocks"):
        if not hasattr(model, attr):
            raise RuntimeError(f"MiniMax-H3 Morton needs .{attr} on the diffusion model")

    _patch_packed_layout(sys.modules[type(model).__module__])

    original_forward = model._forward
    original_rope_freqs = model.rope_freqs

    def _forward(x, timestep, context, transformer_options={}, **kwargs):
        previous = getattr(model, "_sol_morton_active", False)
        model._sol_morton_active = bool(transformer_options.get("sol_morton"))
        model._sol_morton_curve = transformer_options.get("sol_morton_curve", "3d")
        model._sol_transformer_options = transformer_options
        try:
            return original_forward(x, timestep, context,
                                    transformer_options=transformer_options, **kwargs)
        finally:
            model._sol_morton_active = previous
            model._sol_morton_span = None
            model._sol_morton_state = None
            model._sol_transformer_options = None
            transformer_options.pop("sol_h3_video_span", None)
            transformer_options.pop("sol_h3_audio_span", None)

    def rope_freqs(position_ids, device):
        """Publish the layout only. Permuting happens in the block hook, which is
        the single place that sees the tokens and the rope table together."""
        model._sol_morton_span = None
        model._sol_morton_state = None
        entry = _SPANS.get(id(position_ids))
        if entry is None:
            _h3_log_once("no layout registered; Morton and the conditioning sink are inactive")
            return original_rope_freqs(position_ids, device)

        _layout, bounds, audio, span = entry
        # Publish the video-segment boundary so the attention override can keep
        # the conditioning rows (text / audio / reference) exact.
        options = getattr(model, "_sol_transformer_options", None)
        if options is not None:
            options["sol_h3_video_span"] = bounds
            options["sol_h3_audio_span"] = audio
        if getattr(model, "_sol_morton_active", False):
            if span is None:
                _h3_log_once("video grid does not match the segment; Morton inactive")
            else:
                model._sol_morton_span = span
        return original_rope_freqs(position_ids, device)

    def pre_hook(module, args):
        # Blocks are called as block(h, t_emb, mod_segments, rope_freqs, ...).
        if len(args) < 4:
            return None

        if module is not first:
            state = getattr(model, "_sol_morton_state", None)
            if state is None:
                return None
            # Hidden states are already reordered; reuse the table built once.
            return args[:3] + (state[1],) + tuple(args[4:])

        model._sol_morton_state = None
        span = getattr(model, "_sol_morton_span", None)
        if span is None:
            return None
        start, stop, grid = span
        h, rope = args[0], args[3]

        # One decision, both tensors in hand. Splitting this across rope_freqs
        # and the hook is what corrupts output when the two guards disagree.
        if not torch.is_tensor(h) or h.ndim != 2 or h.shape[0] < stop:
            _h3_log_once(f"hidden states do not cover the video span {(start, stop)}; inactive")
            return None
        if not torch.is_tensor(rope) or rope.ndim < 2 or rope.shape[1] != h.shape[0]:
            _h3_log_once(f"rope table {tuple(rope.shape) if torch.is_tensor(rope) else type(rope)} "
                      f"does not match {h.shape[0]} tokens; inactive")
            return None

        curve = getattr(model, "_sol_morton_curve", "3d")
        _h3_log_once(f"ACTIVE: video span [{start}, {stop}), grid {grid}, "
                     f"curve {curve}")
        perm, inverse = _perm_for(grid, curve, h.device, start)
        h = h.clone()
        h[start:stop] = h[start:stop][perm]

        # rope_rotation_table is elementwise per row, so permuting the table is
        # identical to permuting position_ids -- and keeps the decision here.
        full = torch.arange(rope.shape[1], device=rope.device)
        full[start:stop] = perm + start
        rope = rope.index_select(1, full)

        model._sol_morton_state = (inverse, rope)
        return (h,) + args[1:3] + (rope,) + tuple(args[4:])

    def post_hook(_module, _args, output):
        state = getattr(model, "_sol_morton_state", None)
        span = getattr(model, "_sol_morton_span", None)
        model._sol_morton_state = None
        if state is None or span is None:
            return None
        start, stop, _grid = span
        inverse, _rope = state
        if not torch.is_tensor(output) or output.shape[0] < stop:
            logging.error("[sol_attn] H3 Morton: block stack changed the token count "
                          f"({tuple(output.shape)}); cannot restore order")
            return None
        output = output.clone()
        output[start:stop] = output[start:stop][inverse]
        return output

    first = model.blocks[0]
    model._forward = _forward
    model.rope_freqs = rope_freqs
    for block in model.blocks:
        block.register_forward_pre_hook(pre_hook)
    model.blocks[-1].register_forward_hook(post_hook)
    _INSTALLED.add(id(model))


# ---------------------------------------------------------------------------
# 内核调用层（适配当前 comfy_kitchen sol_attn 签名）：
#   sol_attn(q,k,v,tau=1.0,scale=None,sink_blocks=None,sink_q=None,
#            key_bias=None,topk_ratio=0.0,tail=True,block_len=None,
#            coarse_gate=None,token_aug=0)
# workspace 完全内建；head 分块 / max_blocks / reuse_qkv_memory 已移除。
# ---------------------------------------------------------------------------

def _ineligible(q, k, mask, dim_head, min_tokens):
    """Why this call can't use Sol-Attn, or None if it can. q/k are BTHD."""
    if _ck is None or not hasattr(_ck, "sol_attn"):
        return "comfy_kitchen sol_attn unavailable"
    if q.device.type != "cuda":
        return "not cuda"
    if q.dtype not in (torch.bfloat16, torch.float16):
        return f"dtype {q.dtype} (kernel needs bf16/fp16)"
    if dim_head != HEAD_DIM:
        return f"head_dim {dim_head} != 128"
    if mask is not None:
        return "masked attention"
    if q.shape[1] != k.shape[1] or q.shape != k.shape:
        return f"cross-attention / qk mismatch {tuple(q.shape)} vs {tuple(k.shape)}"
    if q.shape[1] < min_tokens:
        return f"seq {q.shape[1]} < {min_tokens}"
    return None


def _sol_call(q, k, v, tau, scale, sink_blocks, sink_q, tail, topk_ratio):
    kw = dict(tau=tau, scale=scale, sink_blocks=list(sink_blocks), sink_q=list(sink_q),
              topk_ratio=topk_ratio, tail=tail)
    try:
        return _ck_cuda.sol_attn(q, k, v, **kw)
    except ValueError as e:
        if "contiguous" in str(e) or "aligned" in str(e) or "stride" in str(e):
            return _ck_cuda.sol_attn(q.contiguous(), k.contiguous(), v.contiguous(), **kw)
        raise


def _run(q, k, v, heads, skip_reshape, skip_output_reshape, scale, tau, min_tokens, verbose,
         sink_blocks=(0, 0), sink_q=(0, 0), routed_cap_percent=0, centroid_tail=True,
         reuse_qkv_memory=False, workspace_cache=None):
    """Returns the attention output, or None if this call should stay dense."""
    if skip_reshape:
        b, _, _, dim_head = q.shape          # BHND
        qs, ks, vs = (t.transpose(1, 2) for t in (q, k, v))
    else:
        b, _, dim_head = q.shape             # B, N, heads*dim_head
        dim_head //= heads
        qs, ks, vs = (t.view(b, -1, heads, dim_head) for t in (q, k, v))

    reason = _ineligible(qs, ks, None, dim_head, min_tokens)
    if reason is not None:
        _stats["dense_fallback"] += 1
        if verbose:
            _log_once((tuple(qs.shape), reason), f"dense {tuple(qs.shape)}: {reason}")
        return None

    # routed_cap_percent>0 映射为 SLA top-k 模式（topk_ratio>0 会忽略 tau）；
    # 默认 0 时不传 topk_ratio，保持 tau 阈值行为。reuse_qkv_memory 已被新内核
    # 移除（恒新分配输出），入参保留但内部忽略。
    topk_ratio = (routed_cap_percent / 100.0) if routed_cap_percent else 0.0
    out = _sol_call(qs, ks, vs, tau=tau, scale=scale, sink_blocks=sink_blocks, sink_q=sink_q,
                    tail=bool(centroid_tail), topk_ratio=topk_ratio)
    _stats["sparse"] += 1
    if verbose:
        _log_once((tuple(qs.shape), "sparse"), f"sparse {tuple(qs.shape)} tau={tau}")

    if skip_output_reshape:
        return out.transpose(1, 2)           # BHND
    return out.reshape(b, -1, heads * dim_head)


def _sink_blocks(transformer_options, tokens, mode):
    """(exact-KV blocks, dense-query blocks) for MiniMax-H3's conditioning rows.

    H3 packs [text][cond][ref][audio][video] into one sequence; sparsifying the
    conditioning rows costs sync and prompt adherence. exact_kv measures ~3%,
    exact_kv_and_rows ~17%, so exact-KV is the default and rows are opt-in.
    """
    if mode == "off":
        return (0, 0), (0, 0)
    span = (transformer_options or {}).get("sol_h3_video_span")
    if span is None:
        return (0, 0), (0, 0)
    video_start, video_stop = span
    if tokens < video_stop or video_start <= 0:
        return (0, 0), (0, 0)
    blocks = (0, (video_start + BLOCK_SIZE - 1) // BLOCK_SIZE)
    if mode != "exact_kv_and_rows":
        return blocks, (0, 0)
    # Dense-query protection exists for the TARGET AUDIO rows; reference rows
    # only need the exact-KV side. Fall back to the whole conditioning range
    # when the layout did not publish an audio span.
    audio = (transformer_options or {}).get("sol_h3_audio_span")
    if audio is None:
        return blocks, blocks
    audio_start, _audio_stop = audio
    return blocks, (audio_start // BLOCK_SIZE, blocks[1])


def make_override(tau=1.0, min_tokens=4096,
                  sigma_start=None, sigma_end=None, verbose=False,
                  sink_conditioning="exact_kv", dense_blocks=frozenset(),
                  tau_profile=None, previous=None, routed_cap_percent=0,
                  centroid_tail=True, reuse_qkv_memory=False):
    """Build an optimized_attention_override callable.

    ``previous`` chains any override already installed on the model: every path
    that declines hands off to it first, falling through to ``func`` only if
    there is none.
    """
    workspace_cache = {}

    def override(func, q, k, v, heads, mask=None, attn_precision=None,
                 skip_reshape=False, skip_output_reshape=False, **kwargs):

        def dense():
            target = func if previous is None else partial(previous, func)
            return target(q, k, v, heads, mask=mask, attn_precision=attn_precision,
                          skip_reshape=skip_reshape,
                          skip_output_reshape=skip_output_reshape, **kwargs)

        if mask is not None:
            _stats["dense_fallback"] += 1
            return dense()

        # Depth gates: a block can be kept dense outright or given its own tau.
        block = None
        if dense_blocks or tau_profile:
            block = kwargs.get("transformer_options", {}).get("sol_block")
        if block in dense_blocks:
            _stats["dense_block"] += 1
            return dense()
        block_tau = tau_profile.get(block, tau) if tau_profile else tau

        # Sampling-percentage gate, so the paper's dense warm-up steps work.
        if sigma_start is not None or sigma_end is not None:
            sigmas = kwargs.get("transformer_options", {}).get("sigmas")
            if sigmas is not None:
                sigma = float(sigmas[0])
                if (sigma_start is not None and sigma > sigma_start) or \
                   (sigma_end is not None and sigma < sigma_end):
                    _stats["outside_range"] += 1
                    return dense()

        tokens = q.shape[2] if skip_reshape else q.shape[1]
        sink, sink_q = _sink_blocks(kwargs.get("transformer_options"), tokens,
                                    sink_conditioning)
        if verbose and sink != (0, 0):
            _log_once((tokens, sink, sink_q),
                      f"conditioning sink: KV blocks {sink} exact, dense query blocks {sink_q}")

        try:
            out = _run(q, k, v, heads, skip_reshape, skip_output_reshape,
                       kwargs.get("scale", None), block_tau, min_tokens, verbose,
                       sink, sink_q, routed_cap_percent, centroid_tail,
                       reuse_qkv_memory, workspace_cache)
        except Exception as exc:
            _stats["errors"] += 1
            _log_kernel_failure(exc)
            return dense()
        return dense() if out is None else out

    return override


def _compose_module_patch(module, patched_forward):
    """Gate an object-patched attention forward (e.g. KJNodes' mem-efficient
    Sage): calls Sol-Attn would take run the stock forward and reach the
    override; the rest keeps the patch. Gate params come from
    transformer_options["sol_compose"]; when absent the patch runs as-is.
    """
    stock = type(module).forward

    def forward(*args, **kwargs):
        options = kwargs.get("transformer_options")
        if not isinstance(options, dict):
            options = next((a for a in args if isinstance(a, dict) and "sol_compose" in a), {})
        gate = options.get("sol_compose")
        x = args[0] if args else None
        # KJNodes' low-VRAM block patch hands x over in a single-item list.
        tensor = x[0] if isinstance(x, list) and len(x) == 1 and torch.is_tensor(x[0]) else x
        take = gate is not None and torch.is_tensor(tensor) and tensor.device.type == "cuda" \
            and tensor.dtype == torch.bfloat16 and tensor.ndim in (2, 3)
        if take:
            # H3 packs tokens first (s, dim); Wan/LTX2 are batch-first.
            tokens = tensor.shape[0] if tensor.ndim == 2 else tensor.shape[1]
            take = tokens >= gate["min_tokens"]
        if take:
            sigmas = options.get("sigmas")
            if sigmas is not None:
                sigma = float(sigmas[0])
                take = not (sigma > gate["sigma_start"] or sigma < gate["sigma_end"])
        if take:
            delegate = options.get("sol_take_forward")
            if delegate is not None:
                # a cooperating patch's forward that reaches optimized_attention while
                # keeping its own low-VRAM behavior; preferred over the stock forward
                return delegate(module, *args, **kwargs)
            if tensor is not x:
                x.clear()  # the stock forward wants the tensor; consume the hand-off list
                args = (tensor,) + args[1:]
            return stock(module, *args, **kwargs)
        return patched_forward(*args, **kwargs)

    forward._sol_composed = True
    return forward


_COMPOSE_HOOKED = set()


def _install_compose_hooks(model, attn_attr):
    """Compose at sampling time, once all object patches are applied: a node
    downstream of ours overwrites the same object-patch key, so execute-time
    composition alone loses. The pre-hooks re-wrap any foreign attn forward
    before each block runs; inert unless sol_compose is published.
    """
    if id(model) in _COMPOSE_HOOKED:
        return

    def pre_hook(block, args):
        attn = getattr(block, attn_attr, None)
        if attn is None:
            return None
        fwd = attn.__dict__.get("forward")
        if fwd is None or getattr(fwd, "_sol_composed", False):
            return None
        if getattr(fwd, "_uses_optimized_attention", False):
            return None  # patch routes through optimized_attention; the override composes directly
        if getattr(fwd, "__func__", None) is type(attn).forward:
            return None  # unpatch leaves the stock forward as an instance attr
        attn.forward = _compose_module_patch(attn, fwd)
        _log_once(("composed", attn_attr),
                  f"composing with a patched {attn_attr}.forward; Sol-Attn takes "
                  "eligible self-attention calls, the patch keeps the rest")
        return None

    for block in model.blocks:
        block.register_forward_pre_hook(pre_hook)
    _COMPOSE_HOOKED.add(id(model))


def _apply_patch(model, *, tau, start_percent, end_percent, min_tokens,
                 sink_conditioning, morton, morton_curve, dense_blocks,
                 verbose, tau_profile, routed_cap_percent=0,
                 centroid_tail=True, reuse_qkv_memory=False):
    diffusion_model = model.get_model_object("diffusion_model")
    is_h3 = hasattr(diffusion_model, "rope_freqs") and hasattr(diffusion_model, "_forward")

    # H3 publishes its segment layout from the same hooks Morton uses, so the
    # conditioning sink needs them installed even when reordering is off.
    reorder = False
    if is_h3 and (morton or sink_conditioning != "off"):
        install_h3_morton(diffusion_model)
        reorder = morton
    elif morton:
        logging.warning(
            f"[sol_attn] Morton skipped: {type(diffusion_model).__name__} is not "
            "MiniMax-H3. Sol-Attn itself still applies.")

    blocks = getattr(diffusion_model, "blocks", None)
    count = len(blocks) if blocks is not None else 0
    dense = parse_blocks(dense_blocks, count)
    profile = parse_tau_profile(tau_profile or "", count)
    if (dense or profile) and not _install_block_index(diffusion_model):
        logging.warning(
            f"[sol_attn] dense_blocks/tau_profile ignored: "
            f"{type(diffusion_model).__name__} has no .blocks list to index")
        dense, profile = frozenset(), {}
    if dense:
        logging.info(f"[sol_attn] keeping blocks {sorted(dense)} dense of {count}")

    model_sampling = model.get_model_object("model_sampling")
    sigma_start = float(model_sampling.percent_to_sigma(start_percent))
    sigma_end = float(model_sampling.percent_to_sigma(end_percent))

    m = model.clone()
    previous = m.model_options["transformer_options"].get("optimized_attention_override")
    if previous is not None:
        logging.info("[sol_attn] chaining onto an existing attention override")

    # Forward-level patches bypass optimized_attention entirely; gate each one.
    composed = []
    for key, patched in list(m.object_patches.items()):
        if not key.endswith(".forward"):
            continue
        owner = key.rsplit(".", 2)[-2].lower()
        if "attn" not in owner or "cross" in owner or owner == "attn2":
            continue  # Sol-Attn never takes cross-attention; leave it patched
        if getattr(patched, "_uses_optimized_attention", False):
            continue
        module = m.get_model_object(key[: -len(".forward")])
        m.add_object_patch(key, _compose_module_patch(module, patched))
        composed.append(key)
    if composed:
        logging.info(f"[sol_attn] composed with {len(composed)} patched attention forward(s)")
    if is_h3:
        _install_compose_hooks(diffusion_model, "attn")

    m.model_options["transformer_options"]["sol_compose"] = {
        "sigma_start": sigma_start, "sigma_end": sigma_end,
        "min_tokens": min_tokens}
    m.model_options["transformer_options"]["optimized_attention_override"] = \
        make_override(tau=tau, min_tokens=min_tokens,
                      sigma_start=sigma_start, sigma_end=sigma_end,
                      verbose=verbose, sink_conditioning=sink_conditioning,
                      dense_blocks=dense, tau_profile=profile, previous=previous,
                      routed_cap_percent=routed_cap_percent,
                      centroid_tail=centroid_tail, reuse_qkv_memory=reuse_qkv_memory)
    if reorder:
        m.model_options["transformer_options"]["sol_morton"] = True
        m.model_options["transformer_options"]["sol_morton_curve"] = morton_curve
    reset_sol_attn_stats()
    return m


# ---------------------------------------------------------------------------
# 节点类（经典 ComfyUI API）
# ---------------------------------------------------------------------------

class OpenkitSolAttnMiniMax:
    CATEGORY = "Openkit/效率工具"
    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("model",)
    FUNCTION = "patch"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "tau": ("FLOAT", {"default": 1.3, "min": 0.0, "max": 4.0, "step": 0.05,
                                  "tooltip": "阈值 beta。越大越稀疏：1.0 约保留 16% 块精确，"
                                             "1.5 约 7%，2.0 约 2.7%。"}),
                "start_percent": ("FLOAT", {"default": 0.2, "min": 0.0, "max": 1.0, "step": 0.01,
                                            "tooltip": "在此之前走 dense（论文默认 0.2）。"}),
                "end_percent": ("FLOAT", {"default": 0.9, "min": 0.0, "max": 1.0, "step": 0.01}),
                "min_tokens": ("INT", {"default": 12288, "min": 0, "max": 1 << 20, "step": 512,
                                       "tooltip": "短于此长度的序列保持 dense。"}),
                "sink_conditioning": (["exact_kv", "exact_kv_and_rows", "off"],
                                      {"default": "exact_kv_and_rows",
                                       "tooltip": "exact_kv：所有 query 精确看 text/audio/ref 行（约 3% 开销）。"
                                                  "exact_kv_and_rows：额外让目标 audio 的 query 行走 dense。"}),
                "morton": ("BOOLEAN", {"default": False,
                                       "tooltip": "把视频 token 重排为 Morton（Z 序），使每个 64-token 块是紧凑 3D 邻域。"}),
                "morton_curve": (["3d", "2d_frame"], {"default": "2d_frame",
                                                     "tooltip": "2d_frame 在帧内做 Z 序、保留帧顺序，适合 H3 非均匀时间轴。"}),
                "centroid_tail": ("BOOLEAN", {"default": True,
                                              "tooltip": "每个 64-token query 块在质心处评估池化分支一次，约 1.4x 更快。"}),
                "routed_cap_percent": ("INT", {"default": 0, "min": 0, "max": 100, "step": 5,
                                               "tooltip": "把 routed 块列表限制为序列的百分比；0=不限制。"
                                                          "注意：>0 会切换为 SLA top-k 模式并忽略 tau。"}),
                "reuse_qkv_memory": ("BOOLEAN", {"default": False,
                                                 "tooltip": "新版内核恒新分配输出，此参数已忽略（仅保留入参兼容）。"}),
                "verbose": ("BOOLEAN", {"default": False}),
                "dense_blocks": ("STRING", {"default": "",
                                            "tooltip": "保持 dense 的 transformer 块，如 '0-2,-1'。首尾块对近似最敏感。"}),
            },
            "optional": {
                "tau_profile": ("STRING", {"default": "", "multiline": True,
                                           "tooltip": "按块覆盖基础 tau，'块=tau' 用 ';' 或换行分隔。"}),
            },
        }

    def patch(self, model, tau, start_percent, end_percent, min_tokens, sink_conditioning,
              morton, morton_curve, centroid_tail, routed_cap_percent, reuse_qkv_memory,
              verbose, dense_blocks, tau_profile=""):
        if _ck is None:
            raise RuntimeError(f"comfy_kitchen 不可用: {_CK_IMPORT_ERROR}；本节点为可选 GPU 增强，"
                               "需安装带 sol_attn 内核的 comfy_kitchen")
        if not hasattr(_ck, "sol_attn"):
            raise RuntimeError("comfy_kitchen 没有 sol_attn 内核；请更新 comfy_kitchen 版本")
        m = _apply_patch(model, tau=tau, start_percent=start_percent, end_percent=end_percent,
                         min_tokens=min_tokens, sink_conditioning=sink_conditioning,
                         morton=morton, morton_curve=morton_curve, dense_blocks=dense_blocks,
                         verbose=verbose, tau_profile=tau_profile,
                         routed_cap_percent=routed_cap_percent, centroid_tail=centroid_tail,
                         reuse_qkv_memory=reuse_qkv_memory)
        return (m,)
