# -*- coding: utf-8 -*-
"""Offline logic test for MiniMaxH3MediaLoader (no ComfyUI needed)."""
import io
import sys
import os
import json
import types
import importlib

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

nodes_dir = r"D:\ComfyUI_ROB2900_H3\ComfyUI\custom_nodes\ComfyUI-Openkit\nodes"

# Register a fake 'nodes' package so relative imports in media_loader work.
pkg = types.ModuleType("nodes")
pkg.__path__ = [nodes_dir]
sys.modules["nodes"] = pkg

# Stub folder_paths.
fp = types.ModuleType("folder_paths")
fp.get_input_directory = lambda: "input"
sys.modules["folder_paths"] = fp

# Stub nodes.media_io with fake decoders.
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

# ---- Test 1: partition + tags ----
items = [
    {"kind": "picture", "file": "a.png"},
    {"kind": "picture", "file": "b.png", "enabled": False},
    {"kind": "video", "file": "v1.mp4", "has_audio": True, "audio_mode": "paired"},
    {"kind": "video", "file": "v2.mp4", "has_audio": True, "audio_mode": "standalone"},
    {"kind": "audio", "file": "a1.wav"},
]
pics, vids, vauds, auds = ml.MiniMaxH3MediaLoader._partition(items)
print("Test1 partition:", len(pics), len(vids), len([x for x in vauds if x]), len(auds))
assert len(pics) == 1, "disabled picture should be skipped"
assert len(vids) == 2
assert [x is not None for x in vauds].count(True) == 1, "only paired video yields soundtrack slot"
assert len(auds) == 2, "standalone video + audio both go to audios"

tags = ml.MiniMaxH3MediaLoader._compute_tags(items)
print("Test1 tags:", tags)
assert len(tags["tags"]) == 4, "picture + 2 videos + audio = 4 main tags"
assert len(tags["extra"]) == 2, "paired audio + standalone audio = 2 split tags"

# ---- Test 2: load_segments structure ----
tracks = json.dumps([
    {"name": "段落1", "items": items},
    {"name": "段落2", "items": [
        {"kind": "picture", "file": "c.png"},
        {"kind": "audio", "file": "a2.wav"},
    ]},
])
node = ml.MiniMaxH3MediaLoader()
all_b, sel_b, count = node.load_segments(tracks, 0)
print("Test2 count:", count)
assert count == 2
assert all_b["segment_count"] == 2
assert len(all_b["segments"][0]["pictures"]) == 1
assert len(all_b["segments"][0]["videos"]) == 2
assert all_b["segments"][0]["video_audios"][0] is not None
assert all_b["segments"][0]["video_audios"][1] is None
assert len(all_b["segments"][0]["audios"]) == 2
assert sel_b["segment_count"] == 1
assert sel_b["segments"][0]["name"] == "段落1"
print("Test2 selected name:", sel_b["segments"][0]["name"])

# ---- Test 3: video_index out of range -> empty selected ----
_, sel_b2, count2 = node.load_segments(tracks, 99)
print("Test3 out-of-range:", sel_b2["segment_count"])
assert sel_b2["segment_count"] == 0

# ---- Test 4: 32 track cap ----
big = json.dumps([{"name": f"段{i}", "items": [{"kind": "audio", "file": f"a{i}.wav"}]} for i in range(40)])
_, _, count3 = node.load_segments(big, 0)
print("Test4 40 tracks -> count:", count3)
assert count3 == 32, f"expected 32, got {count3}"

print("ALL TESTS PASSED")
