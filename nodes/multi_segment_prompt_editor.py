# -*- coding: utf-8 -*-
"""
MultiSegmentPromptEditor — 多段提示词可视化编辑节点
====================================================
基于 H3 六段式提示词 JSON 结构的可视化编辑器（多级 Tab 版）。

能力：
  - 顶层 7 大模块（整体风格 / 角色档案 / 音色档案 / 道具档案 / 场景档案 / 关键帧档案 / 分镜序列）以 Tab 切换；
  - 列表型模块（角色/音色/道具/场景/关键帧档案）采用二级子 Tab 页，每个子项一个 Tab，点击添加/删除（删除二次确认）；
  - 分镜序列采用二级子 Tab 页，每个分镜一个 Tab；分镜内运镜采用三级子 Tab 页；
  - 分镜类型字段为下拉框（文戏/武戏）+ 秒数下拉框（5-12秒），组合为"文戏：10秒"格式；
  - 整体风格文本框自适应节点面板大小并随缩放适配；
  - 最细粒度字段全部为多行文本框；用户完全不接触原始 JSON。

后端只负责：
  1) 暴露 prompt_json（前端自动管理的 JSON 字符串）一个 widget；
  2) execute 时校验 JSON 格式并输出格式化后的 JSON 字符串。
所有 UI 与交互逻辑由前端扩展 web/js/multi_segment_prompt_editor.js 实现。
"""

import json


# 分镜对象的标准字段（前端渲染与后端校验共用）
# type: int / text / textarea / list_str / shot_type
SHOT_FIELDS = [
    {"key": "编号", "type": "int", "label": "编号"},
    {"key": "类型", "type": "shot_type", "label": "类型"},
    {"key": "标题", "type": "text", "label": "标题"},
    {"key": "摘要", "type": "textarea", "label": "摘要"},
    {"key": "运镜", "type": "list_str", "label": "运镜"},
    {"key": "环境音", "type": "textarea", "label": "环境音"},
    {"key": "BGM", "type": "textarea", "label": "BGM"},
]

# 顶层模块定义：名称 -> 类型（str / list_str / list_shot）
MODULES = [
    ("整体风格", "str"),
    ("角色档案", "list_str"),
    ("音色档案", "list_str"),
    ("道具档案", "list_str"),
    ("场景档案", "list_str"),
    ("关键帧档案", "list_str"),
    ("分镜序列", "list_shot"),
]

DEFAULT_SHOT = {
    "编号": 1, "类型": "文戏：10秒", "标题": "",
    "摘要": "", "运镜": [""], "环境音": "", "BGM": "",
}

DEFAULT_DATA = {
    "整体风格": "",
    "角色档案": [""],
    "音色档案": [""],
    "道具档案": [""],
    "场景档案": [""],
    "关键帧档案": [""],
    "分镜序列": [dict(DEFAULT_SHOT)],
}


class MultiSegmentPromptEditor:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt_json": ("STRING", {
                    "multiline": True,
                    "default": json.dumps(DEFAULT_DATA, ensure_ascii=False),
                    "tooltip": "前端自动管理的完整提示词JSON（多级Tab可视化结构），请勿手工修改。",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("提示词JSON",)
    FUNCTION = "execute"
    CATEGORY = "Openkit/工具"

    def execute(self, prompt_json="{}"):
        try:
            data = json.loads(prompt_json) if isinstance(prompt_json, str) and prompt_json else {}
        except Exception:
            data = {}

        if not isinstance(data, dict):
            data = {}

        # 规范化顶层模块
        for name, mtype in MODULES:
            if name not in data:
                if mtype == "str":
                    data[name] = ""
                elif mtype == "list_str":
                    data[name] = [""]
                elif mtype == "list_shot":
                    data[name] = [dict(DEFAULT_SHOT)]

        # 规范化分镜字段
        shots = data.get("分镜序列")
        if isinstance(shots, list):
            for shot in shots:
                if isinstance(shot, dict):
                    for f in SHOT_FIELDS:
                        key = f["key"]
                        if key not in shot:
                            if f["type"] == "int":
                                shot[key] = 1
                            elif f["type"] == "shot_type":
                                shot[key] = "文戏：10秒"
                            elif f["type"] == "list_str":
                                shot[key] = [""]
                            else:
                                shot[key] = ""
                        elif f["type"] == "list_str" and not isinstance(shot[key], list):
                            shot[key] = [""]

        return (json.dumps(data, ensure_ascii=False, indent=2),)
