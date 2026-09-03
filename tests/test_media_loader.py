# -*- coding: utf-8 -*-
"""Offline logic test for MiniMaxH3MediaLoader + ReferenceSplitter (Fant replica)."""
import io
import sys
import os
import json
import types
import importlib

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

nodes_dir = r"D:\ComfyUI_ROB2900_H3\ComfyUI\custom_nodes\ComfyUI-Openkit\nodes"

pkg = types.ModuleType("nodes")
pkg.__path__ = [nodes_dir]
sys.modules["nodes"] = pkg

fp = types.ModuleType("folder_paths")
fp.get_input_directory = lambda: "input"
sys.modules["folder_paths"] = fp

import torch
fake_io = types.ModuleType("nodes.media_io")
def _fake_img(file, crop=None):
    return torch.zeros(1, 64, 64, 3)
def _fake_vid(file, fps=24, max_frames=None, start=None, end=None, crop=None):
    return torch.zeros(3, 64, 64, 3)
def _fake_audio(file, start=None, end=None):
    return {"waveform": torch.zeros(1, 1, 1000), "sample_rate": 32000}
fake_io.load_image = _fake_img
fake_io.load_video_frames = _fake_vid
fake_io.load_audio = _fake_audio
fake_io.extract_audio = _fake_audio
sys.modules["nodes.media_io"] = fake_io

ml = importlib.import_module("nodes.media_loader")

# ---- Test 1: partition ----
items = [
    {"kind": "picture", "file": "a.png"},
    {"kind": "picture", "file": "b.png", "enabled": False},
    {"kind": "video", "file": "v1.mp4", "has_audio": True, "audio_mode": "paired"},
    {"kind": "video", "file": "v2.mp4", "has_audio": True, "audio_mode": "standalone"},
    {"kind": "audio", "file": "a1.wav"},
]
pics, vids, vauds, auds = ml._partition(items)
print("Test1 partition:", len(pics), len(vids), len([x for x in vauds if x]), len(auds))
assert len(pics) == 1
assert len(vids) == 2
assert [x is not None for x in vauds].count(True) == 1
assert len(auds) == 2

# ---- Test 2: load_media bundle ----
state = json.dumps(items, ensure_ascii=False)
loader = ml.MiniMaxH3MediaLoader()
bundle = loader.load_media(state)[0]
print("Test2 bundle:", {k: len(v) for k, v in bundle.items() if k != "items"})
assert len(bundle["pictures"]) == 1
assert len(bundle["videos"]) == 2
assert bundle["video_audios"][0] is not None
assert bundle["video_audios"][1] is None
assert len(bundle["audios"]) == 2
assert bundle["items"] == items

# ---- Test 3: corrupt state rejected ----
try:
    loader.load_media("{ not json")
    assert False, "corrupt state should raise"
except ValueError as e:
    print("Test3 corrupt state rejected:", str(e)[:40])

# ---- Test 4: budget validation ----
too_many = json.dumps([{"kind": "picture", "file": f"p{i}.png"} for i in range(17)])
res = ml._validate_state(too_many)
print("Test4 17 pictures ->", res)
assert "17 pictures" in str(res)
too_aud = json.dumps([{"kind": "audio", "file": f"a{i}.wav"} for i in range(9)])
res = ml._validate_state(too_aud)
print("Test4b 9 audios ->", res)
assert "9 audio clips" in str(res)

# ---- Test 5: splitter category lists + scalars ----
splitter = ml.MiniMaxH3ReferenceSplitter()
out = splitter.split(bundle)
assert len(out) == 4 + ml.VIDEOS + ml.VIDEO_AUDIOS + ml.AUDIOS == 18
assert isinstance(out[0], list) and len(out[0]) == 1   # keyframes (1 picture)
assert isinstance(out[1], list) and out[1] == []        # characters empty
assert isinstance(out[2], list) and out[2] == []        # props empty
assert isinstance(out[3], list) and out[3] == []        # scenes empty
assert out[4] is not None          # video_1
assert out[7] is not None          # video_audio_1
assert out[10] is not None         # audio_1
assert out[17] is None             # audio_8 (empty)
print("Test5 splitter outputs:", len(out),
      "= 4 cat-lists +", ml.VIDEOS, "vids +", ml.VIDEO_AUDIOS, "vA +", ml.AUDIOS, "aud")

# ---- Test 6: empty bundle ----
out2 = splitter.split(None)
assert all(o == [] for o in out2[:4])
assert all(o is None for o in out2[4:])
print("Test6 empty bundle -> 4 empty lists + 9 None OK")

# ---- Test 8: picture category + number sorting ----
pics = [
    {"kind": "picture", "file": "s2.png", "category": "场景", "number": 2},
    {"kind": "picture", "file": "r1.png", "category": "角色", "number": 1},
    {"kind": "picture", "file": "k3.png", "category": "关键帧", "number": 3},
    {"kind": "picture", "file": "p1.png", "category": "道具", "number": 1},
    {"kind": "picture", "file": "k1.png", "category": "关键帧", "number": 1},
    {"kind": "picture", "file": "legacy.png"},           # no category -> 关键帧
]
state8 = json.dumps(pics, ensure_ascii=False)
b8 = loader.load_media(state8)[0]
order = [b8["picture_meta"][i][0] + str(b8["picture_meta"][i][1])
         for i in range(len(b8["picture_meta"]))]
# 关键帧: legacy(0)->k1->k3, then 角色1, 道具1, 场景2
assert order[0] == "关键帧0" and order[1] == "关键帧1" and order[2] == "关键帧3", order
assert order[3] == "角色1" and order[4] == "道具1" and order[5] == "场景2", order
o8 = splitter.split(b8)
assert [o8[0].__len__(), o8[1].__len__(), o8[2].__len__(), o8[3].__len__()] == [3, 1, 1, 1]
print("Test8 category+number sorting OK: 关键帧3 角色1 道具1 场景1")

print("ALL TESTS PASSED")

# ---- Test 7: 1-based track_index routing ----
multi = json.dumps({"tracks": [
  {"name": "T1", "items": [{"kind": "picture", "file": "a.png"}]},
  {"name": "T2", "items": [{"kind": "video", "file": "b.mp4", "has_audio": True}]},
  {"name": "T3", "items": [{"kind": "audio", "file": "c.wav"}]},
]}, ensure_ascii=False)
r = loader.load_media(multi, 1)   # 1-based: track 1
assert r[1]["items"][0]["kind"] == "picture", r[1]
r = loader.load_media(multi, 3)   # 1-based: track 3
assert r[1]["items"][0]["kind"] == "audio", r[1]
r = loader.load_media(multi, 99)  # clamp to last track
assert r[1]["items"][0]["kind"] == "audio", r[1]
r = loader.load_media(multi, 0)   # below min -> track 1
assert r[1]["items"][0]["kind"] == "picture", r[1]
assert r[2] == 3
print("Test7 1-based track_index routing OK (1/3/99/0 -> picture/audio/audio/picture, count=3)")
