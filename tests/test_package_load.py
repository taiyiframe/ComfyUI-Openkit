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
assert loader.RETURN_TYPES == ("MEDIA_REFS", "MEDIA_REFS", "INT")
assert loader.RETURN_NAMES == ("全部素材", "指定素材", "段数")
assert loader.FUNCTION == "load_media"
assert loader.CATEGORY == "Openkit"
assert loader.VALIDATE_INPUTS("[]") is True
assert loader.VALIDATE_INPUTS("{ not json") != True
print("Loader contract OK: multi-tab -> 全部素材 / 指定素材 / 段数")

# Splitter contract.
splitter = nodes.NODE_CLASS_MAPPINGS["ReferenceSplitter"]
sinputs = splitter.INPUT_TYPES()
assert sinputs["required"]["references"][0] == "MEDIA_REFS"
assert isinstance(sinputs["required"]["references"][1], dict)
assert "tooltip" in sinputs["required"]["references"][1]
assert splitter.RETURN_NAMES[:4] == ("关键帧", "角色", "道具", "场景")
assert len(splitter.OUTPUT_TOOLTIPS) == 18
assert len(splitter.RETURN_TYPES) == 18
assert splitter.OUTPUT_IS_LIST[:4] == (True, True, True, True)
assert all(v is False for v in splitter.OUTPUT_IS_LIST[4:])
assert splitter.RETURN_TYPES[0] == "IMAGE" and splitter.RETURN_TYPES[4] == "IMAGE"
assert splitter.RETURN_TYPES[7] == "AUDIO" and splitter.RETURN_TYPES[10] == "AUDIO"
print("Splitter contract OK: 4 category lists + 3 IMAGE + 3 AUDIO + 8 AUDIO")

assert "nodes.media_routes" in sys.modules
print("media_routes imported safely")

print("PACKAGE LOAD TEST PASSED")
