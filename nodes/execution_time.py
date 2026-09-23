"""
Openkit · 执行时间统计节点

功能：
- 在每个节点左上角显示执行耗时 + 峰值VRAM增量
- 顶部悬浮总计时器（可拖动）
- 节点内表格展示所有节点执行时间对比（与上次运行对比）
- 导出CSV

根因修复（适配 ComfyUI 0.34.0+）：
- 旧实现依赖 send_sync("executing") 事件记录开始时间，
  但缓存命中 / pending_async / pending_subgraph / lazy PENDING 分支
  不发送该事件，导致"有时候显示有时候不显示"。
- 本实现直接在 execution.execute 的 patch 入口记录开始时间，
  所有分支（含缓存命中）均覆盖。
"""

import time
import threading
import inspect
import os

import execution
import server

try:
    import torch
    _HAS_CUDA = torch.cuda.is_available()
except Exception:
    torch = None
    _HAS_CUDA = False


# ---------------------------------------------------------------------------
# 全局状态
# ---------------------------------------------------------------------------

_run_state = None  # 当前运行的状态字典
_patched = False


def _get_peak_vram():
    """返回当前进程峰值显存（bytes），无CUDA时返回0。"""
    if not _HAS_CUDA:
        return 0
    try:
        return torch.cuda.max_memory_allocated()
    except Exception:
        return 0


def _reset_peak_vram():
    """重置峰值显存统计。使用新版API，兼容旧版。"""
    if not _HAS_CUDA:
        return
    try:
        torch.cuda.reset_peak_memory_stats()
    except Exception:
        try:
            torch.cuda.reset_max_memory_allocated()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# execution.execute patch
# ---------------------------------------------------------------------------

def _make_execute_wrapper(origin_execute):
    """构造 execution.execute 的包装器，覆盖所有执行分支。

    仅支持 async 版本；sync 版本返回 None，调用方应跳过 patch。
    """
    if not inspect.iscoroutinefunction(origin_execute):
        return None  # 信号：不支持，调用方跳过
    async def openkit_execute(*args, **kwargs):
        return await _execute_wrapper_core(origin_execute, *args, **kwargs)
    return openkit_execute


async def _execute_wrapper_core(origin_execute, *args, **kwargs):
    """核心包装逻辑：入口记录开始时间，出口计算耗时并发送事件。"""
    global _run_state

    # 用签名绑定提取 current_item / prompt_id / server_obj，避免硬编码位置参数
    try:
        sig = inspect.signature(origin_execute)
        bound = sig.bind(*args, **kwargs)
        bound.apply_defaults()
        arguments = bound.arguments
        current_item = arguments.get("current_item")
        prompt_id = arguments.get("prompt_id")
        server_obj = arguments.get("server_obj")
        dynprompt = arguments.get("dynprompt")
    except Exception:
        arguments = {}
        current_item = args[3] if len(args) > 3 else None
        prompt_id = args[6] if len(args) > 6 else None
        server_obj = args[0] if len(args) > 0 else None
        dynprompt = args[1] if len(args) > 1 else None

    unique_id = current_item

    # 入口：记录开始时间和VRAM（所有分支均覆盖，包括缓存命中）
    start_time = time.perf_counter()
    _reset_peak_vram()
    start_vram = _get_peak_vram()

    # 获取节点类型用于日志
    try:
        class_type = dynprompt.get_node(unique_id).get('class_type', '?')
    except Exception:
        class_type = '?'

    # 执行原始函数：origin_execute 自身的异常必须正常透传（那是 ComfyUI 执行错误）
    try:
        result = await origin_execute(*args, **kwargs)
    except Exception:
        # 中断/异常：清理该节点已执行标记，通知前端 badge 复位
        if _run_state is not None and unique_id is not None:
            _run_state.get("executed_nodes", set()).discard(str(unique_id))
        try:
            if server_obj is not None and getattr(server_obj, "client_id", None) is not None:
                server_obj.send_sync(
                    "openkit.exec_aborted",
                    {"node": unique_id, "prompt_id": prompt_id},
                    server_obj.client_id,
                )
        except Exception:
            pass
        raise

    # PENDING 分支（异步节点尚未真正开始计算）：不发计时事件，发 scheduled 标记
    is_pending = False
    if isinstance(result, str) and result == "pending":
        is_pending = True
    elif isinstance(result, dict) and result.get("pending_async") is not None:
        is_pending = True
    elif isinstance(result, dict) and result.get("pending_subgraph") is not None:
        is_pending = True

    if is_pending:
        try:
            if server_obj is not None and getattr(server_obj, "client_id", None) is not None:
                server_obj.send_sync(
                    "openkit.exec_scheduled",
                    {
                        "node": unique_id,
                        "prompt_id": prompt_id,
                        "class_type": class_type,
                    },
                    server_obj.client_id,
                )
        except Exception:
            pass
        return result

    # 缓存命中节点（未触发 executing 事件）不发送假 ~0ms 计时
    if _run_state is not None and unique_id is not None:
        executed = _run_state.get("executed_nodes", set())
        if str(unique_id) not in executed:
            return result

    # 计时统计逻辑本身包 try/except，失败时不影响结果
    try:
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        end_vram = _get_peak_vram()
        vram_delta = max(0, end_vram - start_vram)

        if server_obj is not None and getattr(server_obj, "client_id", None) is not None:
            server_obj.send_sync(
                "openkit.exec_time",
                {
                    "node": unique_id,
                    "prompt_id": prompt_id,
                    "execution_time": elapsed_ms,
                    "vram_used": vram_delta,
                    "class_type": class_type,
                },
                server_obj.client_id,
            )
        else:
            # API 触发的运行无 client_id，不向前端推送，但记录日志
            print(f"[Openkit] API-triggered execution (no client_id): node={unique_id} time={elapsed_ms}ms")
    except Exception:
        pass

    return result


# ---------------------------------------------------------------------------
# send_sync patch（用于捕获 execution_start / execution_end）
# ---------------------------------------------------------------------------

def _make_send_sync_wrapper(origin_send_sync):
    """包装 PromptServer.send_sync，捕获运行开始/结束。"""

    def openkit_send_sync(self, event, data, sid=None):
        global _run_state

        if event == "execution_start":
            _run_state = {
                "start_time": time.perf_counter(),
                "nodes": {},
            }

        # 节点开始执行（仅真执行触发，缓存命中不触发此事件）：记录到已执行集合
        if event == "executing" and data is not None and _run_state is not None:
            node_val = data.get("node") if isinstance(data, dict) else data
            if node_val is not None:
                _run_state.setdefault("executed_nodes", set()).add(str(node_val))

        # 先调用原始函数
        origin_send_sync(self, event=event, data=data, sid=sid)

        # execution_end：executing 事件 data.node 为 None 时表示运行结束
        if event == "executing" and data is not None and _run_state is not None:
            if data.get("node") is None:
                total_ms = int((time.perf_counter() - _run_state["start_time"]) * 1000)
                try:
                    if sid is not None:
                        origin_send_sync(
                            self,
                            event="openkit.exec_end",
                            data={"execution_time": total_ms, "prompt_id": data.get("prompt_id")},
                            sid=sid,
                        )
                    else:
                        # API 触发的运行无 sid，不向前端推送，但记录日志
                        print(f"[Openkit] API-triggered execution_end (no sid): prompt_id={data.get('prompt_id')} time={total_ms}ms")
                except Exception:
                    pass
                _run_state = None

    return openkit_send_sync


# ---------------------------------------------------------------------------
# Patch 应用（后台线程轮询，避免 import 时属性不可用）
# ---------------------------------------------------------------------------

def _apply_patches():
    global _patched
    if _patched:
        return True

    try:
        # 1. Patch execution.execute
        origin_execute = getattr(execution, "execute", None)
        if origin_execute is None:
            return False
        # 避免重复patch
        if getattr(origin_execute, "_openkit_patched", False):
            _patched = True
            return True
        wrapped = _make_execute_wrapper(origin_execute)
        if wrapped is None:
            # sync 版本 execute：不支持 patch，跳过并告警
            print("[Openkit] ExecutionTime: execution.execute is sync (not coroutine), skipping patch.")
            return False
        wrapped._openkit_patched = True
        execution.execute = wrapped

        # 2. Patch PromptServer.send_sync
        ps = getattr(server, "PromptServer", None)
        if ps is None:
            return False
        origin_send = getattr(ps, "send_sync", None)
        if origin_send is None:
            return False
        if getattr(origin_send, "_openkit_patched", False):
            _patched = True
            return True
        wrapped_send = _make_send_sync_wrapper(origin_send)
        wrapped_send._openkit_patched = True
        ps.send_sync = wrapped_send

        _patched = True
        print("[Openkit] ExecutionTime patches applied.")
        return True
    except Exception as e:
        print(f"[Openkit] ExecutionTime patch failed: {e}")
        return False


def _poll_and_patch():
    """后台线程：轮询直到patch成功（最多30秒）。"""
    for _ in range(60):
        if _apply_patches():
            break
        time.sleep(0.5)


# 启动后台patch线程（可用 OPENKIT_DISABLE_EXECTIME=1 关闭）
if os.getenv("OPENKIT_DISABLE_EXECTIME") == "1":
    # 跳过所有 patch 和后台线程
    _patched = True
    print("[Openkit] ExecutionTime disabled via OPENKIT_DISABLE_EXECTIME=1.")
else:
    threading.Thread(target=_poll_and_patch, daemon=True).start()


# ---------------------------------------------------------------------------
# 节点定义
# ---------------------------------------------------------------------------

class OpenkitExecutionTime:
    """执行时间统计节点（虚拟节点，仅用于展示表格）。"""

    CATEGORY = "Openkit/效率工具"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "process"
    OUTPUT_NODE = True

    def process(self):
        return ()
