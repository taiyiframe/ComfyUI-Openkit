# -*- coding: utf-8 -*-
"""Simulate ComfyUI loading the Openkit plugin's nodes package."""
import io
import sys
import types
import importlib

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

root = r"D:\ComfyUI_ROB2900_H3\ComfyUI\custom_nodes\ComfyUI-Openkit"

fp = types.ModuleType("folder_paths")
fp.get_input_directory = lambda: "input"
fp.get_output_directory = lambda: "output"
fp.get_user_directory = lambda: "user"
fp.get_temp_directory = lambda: "temp"
fp.get_annotated_filepath = lambda p: p
sys.modules["folder_paths"] = fp

server_mod = types.ModuleType("server")
server_mod.PromptServer = None
sys.modules["server"] = server_mod

sys.path.insert(0, root)
nodes = importlib.import_module("nodes")

print("NODE_CLASS_MAPPINGS:", list(nodes.NODE_CLASS_MAPPINGS.keys()))
print("NODE_DISPLAY_NAME_MAPPINGS:", nodes.NODE_DISPLAY_NAME_MAPPINGS)

assert "MediaLoader" in nodes.NODE_CLASS_MAPPINGS
assert "ReferenceSplitter" in nodes.NODE_CLASS_MAPPINGS
assert "JsonExtractor" in nodes.NODE_CLASS_MAPPINGS
assert "MultiframeRef" in nodes.NODE_CLASS_MAPPINGS
assert "SubjectRefTagReplacement" in nodes.NODE_CLASS_MAPPINGS

# Loader contract (multi-tab).
loader = nodes.NODE_CLASS_MAPPINGS["MediaLoader"]
inputs = loader.INPUT_TYPES()
assert "media_state" in inputs["required"]
assert "tab_index" in inputs["required"]
assert loader.RETURN_TYPES == ("MEDIA_REFS", "INT")
assert loader.RETURN_NAMES == ("指定素材", "Tab索引")
assert loader.FUNCTION == "load_media"
assert loader.CATEGORY == "Openkit"
assert loader.VALIDATE_INPUTS("[]") is True
assert loader.VALIDATE_INPUTS("{ not json") != True
print("Loader contract OK: multi-tab -> 指定素材 / Tab索引")

# Splitter contract (unbounded v2: 4 category lists + videos + video_audios + audios).
splitter = nodes.NODE_CLASS_MAPPINGS["ReferenceSplitter"]
sinputs = splitter.INPUT_TYPES()
assert sinputs["required"]["references"][0] == "MEDIA_REFS"
assert isinstance(sinputs["required"]["references"][1], dict)
assert "tooltip" in sinputs["required"]["references"][1]
assert splitter.RETURN_NAMES == ("关键帧", "角色", "道具", "场景", "视频", "视频音轨", "音频")
assert len(splitter.OUTPUT_TOOLTIPS) == 7
assert len(splitter.RETURN_TYPES) == 7
assert splitter.OUTPUT_IS_LIST == (True,) * 7
assert splitter.RETURN_TYPES[:4] == ("IMAGE", "IMAGE", "IMAGE", "IMAGE")
assert splitter.RETURN_TYPES[4] == "IMAGE"
assert splitter.RETURN_TYPES[5] == "AUDIO"
assert splitter.RETURN_TYPES[6] == "AUDIO"
print("Splitter contract OK: 4 category lists + videos + video_audios + audios (unbounded)")

assert "nodes.media_routes" in sys.modules
print("media_routes imported safely")

print("PACKAGE LOAD TEST PASSED")
