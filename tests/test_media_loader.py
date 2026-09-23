# -*- coding: utf-8 -*-
"""Offline logic test for MediaLoader + ReferenceSplitter (unbounded v2).

New semantics covered here:
  - No capacity caps: any number of pictures / videos / audios is accepted.
  - Array order is authoritative: bundles and splitter lists keep the item
    array order (no number-based re-sorting on the backend).
  - ReferenceSplitter now emits 7 unbounded lists:
    keyframes / characters / props / scenes / videos / video_audios / audios.
"""
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
loader = ml.MediaLoader()
bundle = loader.load_media(media_state=state)[0]
print("Test2 bundle:", {k: len(v) for k, v in bundle.items() if k != "items"})
assert len(bundle["pictures"]) == 1
assert len(bundle["videos"]) == 2
assert bundle["video_audios"][0] is not None
assert bundle["video_audios"][1] is None
assert len(bundle["audios"]) == 2
assert bundle["items"] == items

# ---- Test 3: corrupt state rejected ----
try:
    loader.load_media(media_state="{ not json")
    assert False, "corrupt state should raise"
except ValueError as e:
    print("Test3 corrupt state rejected:", str(e)[:40])

# ---- Test 4: NO capacity caps (unlimited) ----
too_many = json.dumps([{"kind": "picture", "file": f"p{i}.png"} for i in range(40)])
res = ml._validate_state(too_many)
print("Test4 40 pictures ->", res)
assert res is True

too_aud = json.dumps([{"kind": "audio", "file": f"a{i}.wav"} for i in range(20)])
res = ml._validate_state(too_aud)
print("Test4b 20 audios ->", res)
assert res is True

too_vid = json.dumps([{"kind": "video", "file": f"v{i}.mp4"} for i in range(10)])
res = ml._validate_state(too_vid)
print("Test4c 10 videos ->", res)
assert res is True

# Unlimited bundle actually carries everything in array order.
many_items = [{"kind": "picture", "file": f"p{i}.png"} for i in range(40)]
bundle40 = loader.load_media(media_state=json.dumps(many_items, ensure_ascii=False))[0]
print("Test4d bundle pictures:", len(bundle40["pictures"]))
assert len(bundle40["pictures"]) == 40

# ---- Test 5: splitter -> 4 picture lists + numbered media ports ----
splitter = ml.ReferenceSplitter()
out = splitter.split(bundle)
# 4 picture lists + MAX_AUDIOS(8) + MAX_VIDEOS(3) + MAX_VIDEO_AUDIOS(3) = 18
assert len(out) == 4 + splitter.MAX_AUDIOS + splitter.MAX_VIDEOS + splitter.MAX_VIDEO_AUDIOS, len(out)
assert isinstance(out[0], list) and len(out[0]) == 1   # keyframes (1 picture)
assert isinstance(out[1], list) and out[1] == []        # characters empty
assert isinstance(out[2], list) and out[2] == []        # props empty
assert isinstance(out[3], list) and out[3] == []        # scenes empty
# Media order: audios → videos → video_audios. Out[4..11] = 8 audios.
audios_out = out[4:4 + splitter.MAX_AUDIOS]
videos_out = out[4 + splitter.MAX_AUDIOS:4 + splitter.MAX_AUDIOS + splitter.MAX_VIDEOS]
vauds_out = out[4 + splitter.MAX_AUDIOS + splitter.MAX_VIDEOS:]
# bundle has 2 audios → first two filled, rest None
assert audios_out[0] is not None and audios_out[1] is not None
assert all(a is None for a in audios_out[2:]), audios_out
# 2 videos filled
assert videos_out[0] is not None and videos_out[1] is not None
assert videos_out[2] is None
# 1 paired soundtrack (only video 1 paired)
assert vauds_out[0] is not None
assert all(v is None for v in vauds_out[1:]), vauds_out
print("Test5 splitter 4 lists + numbered:", len(audios_out), "audios +",
      len(videos_out), "vids +", len(vauds_out), "vA")

# ---- Test 6: empty bundle ----
out2 = splitter.split(None)
assert all(o == [] for o in out2[:4])
assert all(o is None for o in out2[4:]), out2[4:]
print("Test6 empty bundle -> 4 empty lists + media ports None OK")

# ---- Test 7: 0-based tab_index routing ----
multi = json.dumps({"tabs": [
  {"name": "T1", "items": [{"kind": "picture", "file": "a.png"}]},
  {"name": "T2", "items": [{"kind": "video", "file": "b.mp4", "has_audio": True}]},
  {"name": "T3", "items": [{"kind": "audio", "file": "c.wav"}]},
]}, ensure_ascii=False)
r = loader.load_media(media_state=multi, tab_index=0)   # 0-based: tab 0
assert r[0]["items"][0]["kind"] == "picture", r[0]
assert r[1] == 0, r[1]
r = loader.load_media(media_state=multi, tab_index=2)   # 0-based: tab 2
assert r[0]["items"][0]["kind"] == "audio", r[0]
assert r[1] == 2, r[1]
r = loader.load_media(media_state=multi, tab_index=99)  # clamp to last tab
assert r[0]["items"][0]["kind"] == "audio", r[0]
assert r[1] == 2, r[1]
print("Test7 0-based tab_index routing OK (0/2/99 -> picture/audio/audio, idx=0/2/2)")

# ---- Test 8: array order is authoritative (no backend re-sort) ----
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
meta = [b8["picture_meta"][i] for i in range(len(b8["picture_meta"]))]
# Array order preserved verbatim (not re-sorted by number):
assert [m[0] for m in meta] == ["场景", "角色", "关键帧", "道具", "关键帧", "关键帧"], meta
o8 = splitter.split(b8)
assert [o8[0].__len__(), o8[1].__len__(), o8[2].__len__(), o8[3].__len__()] == [3, 1, 1, 1]
# Within each category, array order is kept (k3 before k1 before legacy).
assert [m[1] for m in meta if m[0] == "关键帧"] == [3, 1, 0]
print("Test8 array order authoritative + category grouping OK")

print("ALL TESTS PASSED")
