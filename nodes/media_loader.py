"""MiniMax H3 Multi-Segment Media Loader for Openkit.

Loads a full set of H3 reference media (pictures / videos / audios) for up to
32 video segments, mirroring the upstream Fantastic loader's capabilities:
  - per-segment budgets: 9 pictures, 3 videos, 3 audio clips (split
    soundtracks count toward the audio budget),
  - video trim (start/end seconds) and crop (normalised rect),
  - video soundtrack split-off (paired / standalone / off).

Outputs are kept simple and flexible:
  - references_all : every segment's bundle (batch workflows),
  - references     : a single segment selected by ``video_index``,
  - segment_count  : how many segments were loaded.
"""

import json

import folder_paths

from . import media_io

MAX_TRACKS = 32
PICTURES = 9
VIDEOS = 3
AUDIOS = 3

NODE_CLASS = "MiniMaxH3MediaLoader"


class MiniMaxH3MediaLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "tracks_data": (
                    "STRING",
                    {
                        "default": "[]",
                        "multiline": False,
                        "display_name": "滑轨数据",
                        "tooltip": "JSON 多段素材数据，由面板自动维护。",
                    },
                ),
                "video_index": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": MAX_TRACKS - 1,
                        "step": 1,
                        "display_name": "视频索引",
                        "tooltip": "指定素材输出哪一段（0 起）。越界或为空时指定素材输出空 bundle。",
                    },
                ),
            },
        }

    RETURN_TYPES = ("H3_REFS", "H3_REFS", "INT")
    RETURN_NAMES = ("全部素材", "指定素材", "段数")
    OUTPUT_TOOLTIPS = (
        "全部段的 H3 参考素材 bundle（批量流程用）。",
        "由「视频索引」路由出的单段素材 bundle（单段流程用）。",
        "当前已配置的段数。",
    )
    FUNCTION = "load_segments"
    CATEGORY = "Openkit"
    DESCRIPTION = (
        "MiniMax H3 多段素材加载：最多 32 条滑轨，每条滑轨是一个视频段的完整参考素材集"
        "（≤9 参考图 + ≤3 参考视频 + ≤3 参考音频，视频音轨可分离）。"
        "输出三路：全部素材 / 指定素材（按视频索引路由）/ 段数。"
        "面板支持拖拽/文件选择、预览播放、视频裁剪 Trim、图片/视频裁切 Crop、排序、开关、预设。"
    )

    @staticmethod
    def _parse_tracks(tracks_data):
        try:
            tracks = json.loads(tracks_data or "[]")
        except (json.JSONDecodeError, TypeError):
            tracks = []
        if not isinstance(tracks, list):
            tracks = []
        return tracks[:MAX_TRACKS]

    @staticmethod
    def _partition(items):
        pictures, videos, video_audios, audios = [], [], [], []
        for item in items:
            if isinstance(item, dict) and item.get("enabled") is False:
                continue
            kind = item.get("kind") if isinstance(item, dict) else None
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

    @staticmethod
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

    @staticmethod
    def _load_segment(items):
        pictures, videos, video_audios, audios = MiniMaxH3MediaLoader._partition(items)
        segment = {"items": items, "pictures": [], "videos": [],
                   "video_audios": [], "audios": []}

        for item in pictures[:PICTURES]:
            try:
                segment["pictures"].append(
                    media_io.load_image(item.get("file", ""), crop=item.get("crop")))
            except Exception as exc:
                print(f"[Openkit MediaLoader] picture load failed: {exc}")

        for item in videos[:VIDEOS]:
            start, end = MiniMaxH3MediaLoader._trim(item)
            try:
                segment["videos"].append(
                    media_io.load_video_frames(
                        item.get("file", ""), start=start, end=end,
                        crop=item.get("crop")))
            except Exception as exc:
                print(f"[Openkit MediaLoader] video load failed: {exc}")
                segment["videos"].append(None)

        for i in video_audios[:AUDIOS]:
            if not i:
                segment["video_audios"].append(None)
                continue
            start, end = MiniMaxH3MediaLoader._trim(i)
            try:
                segment["video_audios"].append(
                    media_io.extract_audio(i.get("file", ""), start=start, end=end))
            except Exception as exc:
                print(f"[Openkit MediaLoader] soundtrack extract failed: {exc}")
                segment["video_audios"].append(None)

        for item in audios[:AUDIOS]:
            start, end = MiniMaxH3MediaLoader._trim(item)
            try:
                if item.get("kind") == "video":
                    segment["audios"].append(
                        media_io.extract_audio(item.get("file", ""), start=start, end=end))
                else:
                    segment["audios"].append(
                        media_io.load_audio(item.get("file", ""), start=start, end=end))
            except Exception as exc:
                print(f"[Openkit MediaLoader] audio load failed: {exc}")
                segment["audios"].append(None)

        segment["tags"] = MiniMaxH3MediaLoader._compute_tags(items)
        return segment

    @staticmethod
    def _compute_tags(items):
        """item -> H3 tag, with segment-local ordinals (1-based per type).

        Returns {'tags': main tag per item, 'extra': split-soundtrack tag per
        item} so a paired video keeps both its <Video N> and its <Audio N>.
        """
        on = [i for i in items if isinstance(i, dict) and i.get("enabled") is not False]
        tags = {}
        extra = {}
        p = v = a = 0
        for it in on:
            if it.get("kind") == "picture":
                tags[id(it)] = f"<Picture {p + 1}>"
                p += 1
        for it in on:
            if it.get("kind") != "video":
                continue
            if it.get("has_audio") and it.get("audio_mode", "paired") == "paired":
                extra[id(it)] = f"<Audio {a + 1}>"
                a += 1
            tags[id(it)] = f"<Video {v + 1}>"
            v += 1
        for it in on:
            if it.get("kind") == "audio":
                tags[id(it)] = f"<Audio {a + 1}>"
                a += 1
            elif it.get("kind") == "video" and it.get("has_audio") and it.get("audio_mode") == "standalone":
                extra[id(it)] = f"<Audio {a + 1}>"
                a += 1
        return {"tags": tags, "extra": extra}

    def load_segments(self, tracks_data, video_index):
        tracks = self._parse_tracks(tracks_data)
        segments = []
        for track in tracks:
            items = track.get("items", []) if isinstance(track, dict) else []
            if not isinstance(items, list):
                items = []
            seg = self._load_segment(items)
            seg["name"] = track.get("name", "") if isinstance(track, dict) else ""
            segments.append(seg)

        selected = None
        if 0 <= video_index < len(segments):
            selected = segments[video_index]

        bundle_all = {"segments": segments, "segment_count": len(segments),
                      "selected_index": video_index if 0 <= video_index < len(segments) else -1}
        bundle_sel = {"segments": [selected] if selected is not None else [],
                      "segment_count": 1 if selected is not None else 0,
                      "selected_index": video_index if selected is not None else -1}
        return (bundle_all, bundle_sel, len(segments))


NODE_CLASS_MAPPINGS = {NODE_CLASS: MiniMaxH3MediaLoader}
NODE_DISPLAY_NAME_MAPPINGS = {NODE_CLASS: "H3 多段素材加载"}
