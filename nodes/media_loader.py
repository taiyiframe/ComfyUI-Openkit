"""Media Loader / Reference Splitter for Openkit.

Multi-tab faithful replica (legacy V2 API) of the media loader and its
Reference Splitter. Every capability of the original node is available per
tab: drag-and-drop / file-picker loading, previews, per-video audio split
routing, trim, crop, presets and budget limits.

Each tab is an independent reference set. Every tab is validated against
its own per-video budget (9 pictures, 3 videos, 3 audio clips; split
soundtracks count toward the audio budget); the number of tabs is not
bounded by a combined-total constraint. The node exposes:
  - references       : all tabs merged into a single bundle (order kept)
  - tab_references   : the bundle of the tab selected by tab_index
  - tab_count        : number of tabs
"""

import json

from . import media_io

# No capacity caps: pictures, videos, video soundtracks and audios all have
# NO upper limit. Every item is forwarded in array order; the bundle and the
# splitter lists never clip. (Downstream model budgets, if any, are the
# consumer's concern, not this loader's.)
MEDIA_REFS = "MEDIA_REFS"

DEFAULT_TAB_NAME = "Tab 1"

# Picture classification. Reference images are ordered as
# 关键帧 1,2,3… → 角色 1,2,3… → 道具 1,2,3… → 场景 1,2,3…
PIC_CATEGORIES = ("关键帧", "角色", "道具", "场景")
PIC_CAT_PRIORITY = {"关键帧": 0, "角色": 1, "道具": 2, "场景": 3}


def _pic_category(item):
    cat = item.get("category") if isinstance(item, dict) else None
    return cat if cat in PIC_CATEGORIES else "关键帧"


def _pic_number(item):
    try:
        n = int(item.get("number")) if isinstance(item, dict) else 0
        return n if n > 0 else 0
    except (TypeError, ValueError):
        return 0


def _pic_sort_key(item):
    return PIC_CAT_PRIORITY.get(_pic_category(item), 99) * 1000 + _pic_number(item)


def _parse_tabs(media_state):
    """Parse media_state into a list of (name, items) tabs.

    Accepted shapes:
      - {"tabs": [{"name": "...", "items": [...]}, ...]}
      - {"name": "...", "items": [...]}            (single named tab)
      - [...]                                      (legacy single raw list)
    Returns None when the payload is not valid JSON (corrupt state);
    otherwise always a list with at least one empty tab.
    """
    try:
        data = json.loads(media_state or "null")
    except Exception:
        return None

    if isinstance(data, dict) and isinstance(data.get("tabs"), list):
        tabs = []
        for i, t in enumerate(data["tabs"]):
            if not isinstance(t, dict):
                continue
            name = t.get("name") or f"Tab {i + 1}"
            items = t.get("items") if isinstance(t.get("items"), list) else []
            tabs.append((str(name), items))
        if not tabs:
            tabs = [(DEFAULT_TAB_NAME, [])]
        return tabs

    if isinstance(data, dict) and isinstance(data.get("items"), list):
        name = data.get("name") or DEFAULT_TAB_NAME
        return [(str(name), data["items"])]

    if isinstance(data, list):
        return [(DEFAULT_TAB_NAME, data)]

    return [(DEFAULT_TAB_NAME, [])]


def _partition(items):
    """Split items into the four native groups, preserving list order.

    A video's split audio goes to the paired group (its <Audio N> is
    emitted just before its <Video N>) or to the standalone group,
    depending on the item's audio_mode.
    """
    pictures, videos, video_audios, audios = [], [], [], []
    for item in items:
        if isinstance(item, dict) and item.get("enabled") is False:
            continue
        kind = item.get("kind")
        if kind == "picture":
            pictures.append(item)
        elif kind == "video":
            mode = item.get("audio_mode", "paired")
            has_audio = bool(item.get("has_audio"))
            videos.append(item)
            if has_audio and mode == "paired":
                video_audios.append(item)
            else:
                video_audios.append(None)
            if has_audio and mode == "standalone":
                audios.append(item)
        elif kind == "audio":
            audios.append(item)
    return pictures, videos, video_audios, audios


def _trim(item):
    trim = item.get("trim") if isinstance(item, dict) else None
    if not isinstance(trim, dict):
        return None, None

    def num(value):
        try:
            value = float(value)
            return value if value > 0 else None
        except (TypeError, ValueError):
            return None

    return num(trim.get("start")), num(trim.get("end"))


def _validate_tab(items):
    if not isinstance(items, list):
        return None
    # No capacity caps: any number of pictures/videos/audios is accepted.
    return None


def _validate_state(media_state):
    tabs = _parse_tabs(media_state)
    if tabs is None:
        return "Media Loader state is corrupt; clear the node and re-add media."
    for name, items in tabs:
        err = _validate_tab(items)
        if err:
            return f'Tab "{name}": {err}'
    return True


def _build_bundle(items):
    """Build a MEDIA_REFS bundle from one tab's items."""
    pictures, videos, video_audios, audios = _partition(items)

    # Pictures keep their array order — the array IS the user's drag/order
    # sequence. The panel keeps each category compactly numbered along that
    # order, so <Picture N> numbering and the splitter's category lists follow
    # the same explicit order. No count cap: every picture is forwarded.
    picture_meta = [(_pic_category(i), _pic_number(i)) for i in pictures]

    pic_t = [
        media_io.load_image(i["file"], crop=i.get("crop"))
        for i in pictures
    ]
    vid_t = [
        media_io.load_video_frames(
            i["file"],
            start=_trim(i)[0],
            end=_trim(i)[1],
            crop=i.get("crop"),
        )
        for i in videos
    ]
    vaud_t = [
        media_io.extract_audio(i["file"], start=_trim(i)[0], end=_trim(i)[1])
        if i else None
        for i in video_audios
    ]
    aud_t = []
    for i in audios:
        if i.get("kind") == "video":
            aud_t.append(media_io.extract_audio(
                i["file"], start=_trim(i)[0], end=_trim(i)[1]))
        else:
            aud_t.append(media_io.load_audio(
                i["file"], start=_trim(i)[0], end=_trim(i)[1]))

    return {
        "pictures": pic_t,
        "picture_meta": picture_meta,
        "videos": vid_t,
        "video_audios": vaud_t,
        "audios": aud_t,
        "items": items,
    }


class MediaLoader:
    """Multi-tab drag-and-drop / file-picker loader for reference media.

    Each added tab is a complete, independent reference set (pictures,
    videos, soundtracks, audios). Outputs:
      - tab_references   : the bundle of the tab picked by tab_index
      - tab_index        : index of the currently selected tab (0-based)
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "media_state": (
                    "STRING",
                    {
                        "default": "[]",
                        "multiline": True,
                        "display_name": "素材状态",
                        "tooltip": "多 Tab 素材状态（隐藏，由节点面板自动维护，无需手动编辑）。\n"
                                   "每个 Tab 页对应一套完整的素材，面板会写入一条 {\"name\":\"...\",\"items\":[...]}，"
                                   "整体为 JSON 字符串 {\"tabs\":[{...}]}。\n"
                                   "若状态被误改坏，节点会提示清除后重新添加素材。",
                    },
                ),
                "tab_index": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 0,   # dynamic upper bound set by the panel (last tab index)
                        "control_after_generate": "fixed",  # never auto-increment/randomize on re-run
                        "display_name": "Tab索引",
                        "tooltip": "指定「tab_references（指定素材）」输出哪一个 Tab 页的整套素材。\n"
                                   "从 0 开始计数（0 = 第一个 Tab 页）。\n"
                                   "数值超过当前 Tab 总数时自动收敛到最后一个；"
                                   "新增/关闭 Tab 页后面板会自动更新输入框上限。"
                                   "修改数值后点击「联动切换」按钮，可切换到对应编号 Tab 并把该页素材设为输出。",
                    },
                ),
            },
        }

    @classmethod
    def VALIDATE_INPUTS(cls, media_state="[]", **kwargs):
        return _validate_state(media_state)

    RETURN_TYPES = (MEDIA_REFS, "INT")
    RETURN_NAMES = ("指定素材", "Tab索引")
    OUTPUT_TOOLTIPS = (
        "tab_references（指定素材）：仅输出「Tab索引」选中的那个 Tab 页的参考 bundle。"
        "索引越界自动收敛到最后一个。\n"
        "适用于按编号逐段生成视频时，只取当前这一段对应的整套素材。",
        "tab_index（Tab索引）：当前实际选中并输出的 Tab 页索引（0-based）。\n"
        "当输入索引越界或选中空 Tab 时，会自动收敛到有效 Tab，此输出反映最终生效的索引。",
    )
    FUNCTION = "load_media"
    CATEGORY = "Openkit"
    DESCRIPTION = (
        "Multi-tab reference media loader. Every tab is a "
        "complete, independent reference set (unlimited pictures / 3 videos / "
        "8 audio clips); the tabs are not bounded by a combined total. Use "
        "'Tab索引' to pick the set for a given video shot and read '指定素材'."
    )

    def load_media(self, media_state="[]", tab_index=0):
        err = _validate_state(media_state)
        if err is not True:
            raise ValueError(err)
        tabs = _parse_tabs(media_state)
        if tabs is None:
            raise ValueError("Media Loader state is corrupt; clear the node and re-add media.")

        idx = 0
        if tabs:
            # 0-based user input (0 = first tab) → 0-based index, clamped
            # to the last tab so a stale too-high value stays valid.
            idx = max(0, min(int(tab_index or 0), len(tabs) - 1))
            # Fallback (same rule as the front-end): if the selected tab has
            # no media at all but some other tab does, snap to the first
            # filled tab. This keeps a stale pre-0-based saved index (e.g. 1
            # that used to mean "first tab") from producing an empty / wrong
            # tab_references output.
            filled = next(
                (i for i, (_n, items) in enumerate(tabs) if items), None)
            if filled is not None and not tabs[idx][1]:
                idx = filled
        tab_bundle = _build_bundle(tabs[idx][1]) if tabs else _build_bundle([])

        return (tab_bundle, idx)


class ReferenceSplitter:
    """Fan a `references` bundle out into per-item numbered outputs.

    The four category picture lists come first, then the media streams each
    get their own numbered port in the order 音频 (audios) → 视频 (videos) →
    视频音轨 (video soundtracks). The backend declares the maximum possible
    port count so ComfyUI's validator never walks off the RETURN_TYPES array;
    the front-end only ever *shows* the ports that actually carry data and
    hides the unused tail, so the canvas displays exactly the media that is
    uploaded.
    """

    # Maximum number of per-stream ports (matches the front-end caps).
    MAX_AUDIOS = 8
    MAX_VIDEOS = 3
    MAX_VIDEO_AUDIOS = 3
    # Aliases for the class-body tuple declarations (class body has no cls).
    _MAX_AUDIOS = MAX_AUDIOS
    _MAX_VIDEOS = MAX_VIDEOS
    _MAX_VIDEO_AUDIOS = MAX_VIDEO_AUDIOS

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "references": (
                    MEDIA_REFS,
                    {
                        "tooltip": "要拆分的参考 bundle，通常来自 "
                                   "MediaLoader 的「指定素材」输出。\n"
                                   "图片按四个分类列表输出；音频、视频、视频音轨"
                                   "各按编号拆成独立端口，数量随实际上传媒体动态显示。",
                    },
                ),
            },
        }

    # The bundle arrives as a single dict (or an empty list when the source
    # yields nothing); declare INPUT_IS_LIST so ComfyUI passes it through
    # verbatim instead of slicing it (an empty list / dict would otherwise
    # crash the framework's slice_dict with IndexError / KeyError).
    INPUT_IS_LIST = True

    # Fixed maximum length so the validator's RETURN_TYPES[port_index] lookup
    # is always in bounds; unused tail values are None.
    _MAX_AUDIOS = 8
    _MAX_VIDEOS = 3
    _MAX_VIDEO_AUDIOS = 3
    RETURN_TYPES = (
        ("IMAGE",) * 4
        + ("AUDIO",) * _MAX_AUDIOS
        + ("IMAGE",) * _MAX_VIDEOS
        + ("AUDIO",) * _MAX_VIDEO_AUDIOS
    )
    RETURN_NAMES = (
        ("关键帧", "角色", "道具", "场景")
        + tuple(f"音频{i + 1}" for i in range(_MAX_AUDIOS))
        + tuple(f"视频{i + 1}" for i in range(_MAX_VIDEOS))
        + tuple(f"视频音轨{i + 1}" for i in range(_MAX_VIDEO_AUDIOS))
    )
    # Only the four picture categories remain lists; media streams are single
    # ports (one clip per port).
    OUTPUT_IS_LIST = (
        (True,) * 4
        + (False,) * (_MAX_AUDIOS + _MAX_VIDEOS + _MAX_VIDEO_AUDIOS)
    )
    OUTPUT_TOOLTIPS = (
        tuple(
            f"{cat}图片列表：本分类下所有参考图，按用户设定的顺序排列。"
            f"每张图为一个 IMAGE tensor，列表顺序即编号顺序（{cat} 1、{cat} 2…）。"
            "没有该分类图片时输出空列表。"
            for cat in ("关键帧", "角色", "道具", "场景")
        )
        + tuple(
            f"音频{i + 1}：输入 bundle 中第 {i + 1} 个独立音频（AUDIO），"
            f"含「独立」模式的视频音轨。没有第 {i + 1} 个时输出为空。"
            for i in range(_MAX_AUDIOS)
        )
        + tuple(
            f"视频{i + 1}：输入 bundle 中第 {i + 1} 个参考视频（IMAGE 序列）。"
            f"没有第 {i + 1} 个视频时输出为空。"
            for i in range(_MAX_VIDEOS)
        )
        + tuple(
            f"视频音轨{i + 1}：第 {i + 1} 个参考视频的配对音轨（AUDIO），"
            f"仅在对应视频开启音轨并选择「配对」模式时才有输出，否则为空。"
            for i in range(_MAX_VIDEO_AUDIOS)
        )
    )
    FUNCTION = "split"
    CATEGORY = "Openkit"
    DESCRIPTION = (
        "Split a references bundle into the four category picture lists "
        "(keyframes / characters / props / scenes) plus numbered per-item "
        "media outputs in the order 音频 → 视频 → 视频音轨. Only the ports "
        "that actually carry data are shown on canvas; the count follows the "
        "uploaded media automatically."
    )

    def split(self, references=None):
        if isinstance(references, (list, tuple)):
            if len(references) == 1 and isinstance(references[0], dict):
                references = references[0]
            else:
                references = {}
        bundle = references if isinstance(references, dict) else {}
        pics = bundle.get("pictures") or []
        meta = bundle.get("picture_meta") or []
        groups = {cat: [] for cat in PIC_CATEGORIES}
        for idx, t in enumerate(pics):
            cat = meta[idx][0] if idx < len(meta) and meta[idx] else "关键帧"
            if cat not in groups:
                cat = "关键帧"
            groups[cat].append(t)
        # Video-audio list only carries the soundtracks that actually exist
        # (paired mode with audio), keeping order with the paired videos.
        vaud = [t for t in (bundle.get("video_audios") or []) if t is not None]
        audios = bundle.get("audios") or []
        videos = bundle.get("videos") or []
        # Pad every stream to the declared maximum (None for the missing tail).
        def pad(seq, n):
            return list(seq[:n]) + [None] * max(0, n - len(seq))
        return (
            groups["关键帧"],
            groups["角色"],
            groups["道具"],
            groups["场景"],
            *pad(audios, self.MAX_AUDIOS),
            *pad(videos, self.MAX_VIDEOS),
            *pad(vaud, self.MAX_VIDEO_AUDIOS),
        )


NODE_CLASS_MAPPINGS = {
    "MediaLoader": MediaLoader,
    "ReferenceSplitter": ReferenceSplitter,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "MediaLoader": "素材加载",
    "ReferenceSplitter": "素材拆分",
}
