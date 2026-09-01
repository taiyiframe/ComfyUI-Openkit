# -*- coding: utf-8 -*-
"""Simulate ComfyUI loading the Openkit plugin's nodes package."""
import io
import sys
import types
import importlib

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

root = r"D:\ComfyUI_ROB2900_H3\ComfyUI\custom_nodes\ComfyUI-Openkit"

# Stub ComfyUI core modules so the package imports outside ComfyUI.
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

# Import the nodes package the way ComfyUI's import hook would.
sys.path.insert(0, root)
nodes = importlib.import_module("nodes")

print("NODE_CLASS_MAPPINGS:", list(nodes.NODE_CLASS_MAPPINGS.keys()))
print("NODE_DISPLAY_NAME_MAPPINGS:", nodes.NODE_DISPLAY_NAME_MAPPINGS)

assert "MiniMaxH3MediaLoader" in nodes.NODE_CLASS_MAPPINGS
assert nodes.NODE_DISPLAY_NAME_MAPPINGS["MiniMaxH3MediaLoader"] == "H3 多段素材加载"
assert "JsonExtractor" in nodes.NODE_CLASS_MAPPINGS
assert "MultiframeRef" in nodes.NODE_CLASS_MAPPINGS
assert "SubjectRefTagReplacement" in nodes.NODE_CLASS_MAPPINGS

# Verify the loader node's I/O contract.
cls = nodes.NODE_CLASS_MAPPINGS["MiniMaxH3MediaLoader"]
inputs = cls.INPUT_TYPES()
assert "tracks_data" in inputs["required"]
assert "video_index" in inputs["required"]
assert cls.RETURN_TYPES == ("H3_REFS", "H3_REFS", "INT")
assert cls.RETURN_NAMES == ("全部素材", "指定素材", "段数")
assert cls.FUNCTION == "load_segments"
assert cls.CATEGORY == "Openkit"
print("INPUT_TYPES keys:", list(inputs["required"].keys()))
print("RETURN_TYPES:", cls.RETURN_TYPES)
print("LOADER NODE CONTRACT OK")

# media_routes should be importable without registering (PromptServer=None).
assert "nodes.media_routes" in sys.modules
print("media_routes imported safely (no routes registered outside ComfyUI)")

print("PACKAGE LOAD TEST PASSED")
