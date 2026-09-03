"""MiniMax H3 Media Loader / Reference Splitter for Openkit.

Multi-track faithful replica (legacy V2 API) of the Fantastic MiniMax H3
Media Loader and its Reference Splitter. Every capability of the original
node is available per track: drag-and-drop / file-picker loading, previews,
per-video audio split routing, trim, crop, presets and budget limits.

Each track is an independent H3 reference set. Every track is validated
against its own per-video H3 budget (9 pictures, 3 videos, 3 audio clips;
split soundtracks count toward the audio budget); the number of tracks is
not bounded by a combined-total constraint. The node exposes:
  - references        : all tracks merged into a single bundle (order kept)
  - track_references  : the bundle of the track selected by track_index
  - track_count       : number of tracks
"""

import json

from . import media_io

# Panel capacity per media type. The H3 per-video budget (9 pictures / 3
# audio) is enforced by a later node, not here: pictures are free up to the
# panel's own limit, videos stay at 3, audios at 8.
PICTURES = 32
VIDEOS = 3
VIDEO_AUDIOS = 3
AUDIOS = 8

H3_REFS = "H3_REFS"

DEFAULT_TRACK_NAME = "Track 1"

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


def _parse_tracks(media_state):
    """Parse media_state into a list of (name, items) tracks.

    Accepted shapes:
      - {"tracks": [{"name": "...", "items": [...]}, ...]}
      - {"name": "...", "items": [...]}            (single named track)
      - [...]                                      (legacy single raw list)
    Returns None when the payload is not valid JSON (corrupt state);
    otherwise always a list with at least one empty track.
    """
    try:
        data = json.loads(media_state or "null")
    except Exception:
        return None

    if isinstance(data, dict) and isinstance(data.get("tracks"), list):
        tracks = []
        for i, t in enumerate(data["tracks"]):
            if not isinstance(t, dict):
                continue
            name = t.get("name") or f"Track {i + 1}"
            items = t.get("items") if isinstance(t.get("items"), list) else []
            tracks.append((str(name), items))
        if not tracks:
            tracks = [(DEFAULT_TRACK_NAME, [])]
        return tracks

    if isinstance(data, dict) and isinstance(data.get("items"), list):
        name = data.get("name") or DEFAULT_TRACK_NAME
        return [(str(name), data["items"])]

    if isinstance(data, list):
        return [(DEFAULT_TRACK_NAME, data)]

    return [(DEFAULT_TRACK_NAME, [])]


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


def _pad(seq, n):
    return list(seq or []) + [None] * (n - len(seq or []))


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


def _validate_track(items):
    if not isinstance(items, list):
        return None
    pics = sum(1 for i in items if i.get("kind") == "picture")
    vids = sum(1 for i in items if i.get("kind") == "video")
    auds = sum(1 for i in items if i.get("kind") == "audio")
    if pics > PICTURES:
        return f"{pics} pictures loaded; this panel accepts up to {PICTURES}."
    if vids > VIDEOS:
        return f"{vids} videos loaded; this panel accepts up to {VIDEOS}."
    if auds > AUDIOS:
        return f"{auds} audio clips loaded; this panel accepts up to {AUDIOS}."
    return None


def _validate_state(media_state):
    tracks = _parse_tracks(media_state)
    if tracks is None:
        return "Media Loader state is corrupt; clear the node and re-add media."
    for name, items in tracks:
        err = _validate_track(items)
        if err:
            return f'Track "{name}": {err}'
    return True


def _build_bundle(items):
    """Build an H3_REFS bundle from one track's items."""
    pictures, videos, video_audios, audios = _partition(items)

    # Pictures are ordered 关键帧 → 角色 → 道具 → 场景, each group by number,
    # so both <Picture N> numbering and the splitter's category lists follow
    # the same explicit user-set order.
    pictures = sorted(pictures[:PICTURES], key=_pic_sort_key)
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
        for i in videos[:VIDEOS]
    ]
    vaud_t = [
        media_io.extract_audio(i["file"], start=_trim(i)[0], end=_trim(i)[1])
        if i else None
        for i in video_audios[:VIDEO_AUDIOS]
    ]
    aud_t = []
    for i in audios[:AUDIOS]:
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


class MiniMaxH3MediaLoader:
    """Multi-track drag-and-drop / file-picker loader for H3 reference media.

    Each added track is a complete, independent H3 reference set (pictures,
    videos, soundtracks, audios). Outputs:
      - references       : every track merged into a single bundle
      - track_references : the bundle of the track picked by track_index
      - track_count      : number of tracks
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
                                   "每个 Tab 页对应一套完整的 H3 素材，面板会写入一条 {\"name\":\"...\",\"items\":[...]}，"
                                   "整体为 JSON 字符串 {\"tracks\":[{...}]}。\n"
                                   "若状态被误改坏，节点会提示清除后重新添加素材。",
                    },
                ),
                "track_index": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 0,   # dynamic upper bound set by the panel (last track index)
                        "control_after_generate": "fixed",  # never auto-increment/randomize on re-run
                        "display_name": "Tab索引",
                        "tooltip": "指定「track_references（指定素材）」输出哪一个 Tab 页的整套素材。\n"
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

    RETURN_TYPES = (H3_REFS, H3_REFS, "INT")
    RETURN_NAMES = ("全部素材", "指定素材", "段数")
    OUTPUT_TOOLTIPS = (
        "references（全部素材）：把所有 Tab 的素材合并为一个 H3 参考 bundle，"
        "按 Tab 添加顺序排列，图片/视频/视频音轨/音频分别依次编号。\n"
        "适用于一次性把全部视频段的参考素材传给下游 H3 参考节点的场景。",
        "track_references（指定素材）：仅输出「Tab索引」选中的那个 Tab 页的 H3 参考 bundle。"
        "索引越界自动收敛到最后一个。\n"
        "适用于按编号逐段生成视频时，只取当前这一段对应的整套素材。",
        "track_count（段数）：当前已配置的 Tab 数量（整数）。\n"
        "用于下游判断总共有几个视频段，或配合循环按段分发素材。",
    )
    FUNCTION = "load_media"
    CATEGORY = "Openkit"
    DESCRIPTION = (
        "Multi-tab MiniMax H3 reference media loader. Every tab is a "
        "complete, independent H3 reference set (12 pictures / 3 videos / "
        "3 audio clips, per-video budget); the tabs are not bounded by a "
        "combined total. Use 'Tab索引' to pick the set for a given video "
        "shot and read 'track_references', or take the merged 'references'."
    )

    def load_media(self, media_state="[]", track_index=0):
        err = _validate_state(media_state)
        if err is not True:
            raise ValueError(err)
        tracks = _parse_tracks(media_state)
        if tracks is None:
            raise ValueError("Media Loader state is corrupt; clear the node and re-add media.")

        all_items = []
        for _name, items in tracks:
            all_items.extend(items)
        merged = _build_bundle(all_items)

        idx = 0
        if tracks:
            # 0-based user input (0 = first track) → 0-based index, clamped
            # to the last track so a stale too-high value stays valid.
            idx = max(0, min(int(track_index or 0), len(tracks) - 1))
            # Fallback (same rule as the front-end): if the selected track has
            # no media at all but some other track does, snap to the first
            # filled track. This keeps a stale pre-0-based saved index (e.g. 1
            # that used to mean "first track") from producing an empty / wrong
            # track_references output.
            filled = next(
                (i for i, (_n, items) in enumerate(tracks) if items), None)
            if filled is not None and not tracks[idx][1]:
                idx = filled
        track_bundle = _build_bundle(tracks[idx][1]) if tracks else merged

        return (merged, track_bundle, len(tracks))


class MiniMaxH3ReferenceSplitter:
    """Fan a `references` bundle out into individual slots."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "references": (
                    H3_REFS,
                    {
                        "tooltip": "要拆分的 H3 参考 bundle，通常来自 "
                                   "MiniMaxH3MediaLoader 的「references（全部素材）」"
                                   "或「track_references（指定素材）」输出。\n"
                                   "超宽的 bundle 会被裁剪到前 N 个槽位。",
                    },
                ),
            },
        }

    # The bundle arrives as a single dict (or an empty list when the source
    # yields nothing); declare INPUT_IS_LIST so ComfyUI passes it through
    # verbatim instead of slicing it (an empty list / dict would otherwise
    # crash the framework's slice_dict with IndexError / KeyError).
    INPUT_IS_LIST = True

    RETURN_TYPES = (
        ("IMAGE",) * 4
        + ("IMAGE",) * VIDEOS
        + ("AUDIO",) * VIDEO_AUDIOS
        + ("AUDIO",) * AUDIOS
    )
    RETURN_NAMES = (
        ("关键帧", "角色", "道具", "场景")
        + tuple(f"video_{i}" for i in range(1, VIDEOS + 1))
        + tuple(f"video_audio_{i}" for i in range(1, VIDEO_AUDIOS + 1))
        + tuple(f"audio_{i}" for i in range(1, AUDIOS + 1))
    )
    # The four category picture ports emit a LIST of IMAGE (one tensor per
    # picture, ordered by the user-set number); everything else stays scalar.
    OUTPUT_IS_LIST = (True,) * 4 + (False,) * (VIDEOS + VIDEO_AUDIOS + AUDIOS)
    OUTPUT_TOOLTIPS = (
        tuple(
            f"{cat}图片列表：本分类下所有参考图，按用户设定的编号升序排列。"
            f"每张图为一个 IMAGE tensor，列表顺序即编号顺序（{cat} 1、{cat} 2…）。"
            "没有该分类图片时输出空列表。"
            for cat in ("关键帧", "角色", "道具", "场景")
        )
        + tuple(
            f"video_{i}（参考视频 {i}/{VIDEOS}）：输入 bundle 中第 {i} 个参考视频（IMAGE 序列）。"
            f"没有第 {i} 个视频时输出为空。"
            for i in range(1, VIDEOS + 1)
        )
        + tuple(
            f"video_audio_{i}（视频配对音轨 {i}/{VIDEO_AUDIOS}）：第 {i} 个参考视频的配对音轨（AUDIO），"
            f"仅在对应视频开启音轨并选择「配对」模式时才有输出，否则为空。"
            for i in range(1, VIDEO_AUDIOS + 1)
        )
        + tuple(
            f"audio_{i}（独立音频 {i}/{AUDIOS}）：输入 bundle 中第 {i} 个独立音频（AUDIO）。"
            f"包含「独立」模式的视频音轨；没有第 {i} 个时输出为空。"
            for i in range(1, AUDIOS + 1)
        )
    )
    FUNCTION = "split"
    CATEGORY = "Openkit"
    DESCRIPTION = (
        "Split a MiniMax H3 references bundle into the four category picture "
        "lists (keyframes / characters / props / scenes) plus video / "
        "video_audio / audio slots. Picture lists follow the user-set number "
        "order; bundles wider than the H3 budget are clipped to the first N."
    )

    def split(self, references=None):
        if isinstance(references, (list, tuple)):
            if len(references) == 1 and isinstance(references[0], dict):
                references = references[0]
            else:
                references = {}
        bundle = references if isinstance(references, dict) else {}
        pics = (bundle.get("pictures") or [])[:PICTURES]
        meta = bundle.get("picture_meta") or []
        groups = {cat: [] for cat in PIC_CATEGORIES}
        for idx, t in enumerate(pics):
            cat = meta[idx][0] if idx < len(meta) and meta[idx] else "关键帧"
            if cat not in groups:
                cat = "关键帧"
            groups[cat].append(t)
        return tuple(
            [groups["关键帧"], groups["角色"], groups["道具"], groups["场景"]]
            + _pad((bundle.get("videos") or [])[:VIDEOS], VIDEOS)
            + _pad((bundle.get("video_audios") or [])[:VIDEO_AUDIOS], VIDEO_AUDIOS)
            + _pad((bundle.get("audios") or [])[:AUDIOS], AUDIOS)
        )


NODE_CLASS_MAPPINGS = {
    "MiniMaxH3MediaLoader": MiniMaxH3MediaLoader,
    "MiniMaxH3ReferenceSplitter": MiniMaxH3ReferenceSplitter,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "MiniMaxH3MediaLoader": "H3 素材加载",
    "MiniMaxH3ReferenceSplitter": "H3 素材拆分",
}
