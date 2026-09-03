# -*- coding: utf-8 -*-
"""
MultiSegmentPromptEditor — 多段提示词可视化编辑节点
====================================================
基于 H3 六段式提示词 JSON 结构的可视化编辑器。

能力：
  - 顶层 6 大模块（整体风格 / 角色档案 / 音色档案 / 道具档案 / 场景档案 / 分镜序列）以 Tab 切换；
  - 列表型模块（角色/音色/道具/场景档案）支持点击添加、点击删除条目，每条为多行文本框；
  - 分镜序列支持添加/删除分镜，每个分镜可展开折叠，内含 10 个字段的多行文本编辑；
  - 用户完全不接触原始 JSON，所有操作通过可视化 UI 完成；
  - 后端仅负责 JSON 校验与透传输出。

后端只负责：
  1) 暴露 prompt_json（前端自动管理的 JSON 字符串）一个 widget；
  2) execute 时校验 JSON 格式并输出格式化后的 JSON 字符串。
所有 UI 与交互逻辑由前端扩展 web/js/multi_segment_prompt_editor.js 实现。
"""

import json


# 分镜对象的标准字段顺序（前端渲染与后端校验共用）
SHOT_FIELDS = [
    "编号", "类型", "标题",
    "subject_definitions", "summary", "retention_analysis",
    "detailed_description", "环境音", "BGM", "Negative",
]

# 顶层模块定义：名称 -> 类型（str / list_str / list_shot）
MODULES = [
    ("整体风格", "str"),
    ("角色档案", "list_str"),
    ("音色档案", "list_str"),
    ("道具档案", "list_str"),
    ("场景档案", "list_str"),
    ("分镜序列", "list_shot"),
]

DEFAULT_DATA = {
    "整体风格": "",
    "角色档案": [""],
    "音色档案": [""],
    "道具档案": [""],
    "场景档案": [""],
    "分镜序列": [{
        "编号": 1, "类型": "", "标题": "",
        "subject_definitions": "", "summary": "", "retention_analysis": "",
        "detailed_description": "", "环境音": "", "BGM": "", "Negative": "",
    }],
}


class MultiSegmentPromptEditor:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt_json": ("STRING", {
                    "multiline": True,
                    "default": json.dumps(DEFAULT_DATA, ensure_ascii=False),
                    "tooltip": "前端自动管理的完整提示词JSON（六段式结构），请勿手工修改。",
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

        # 规范化：确保顶层模块存在且类型正确
        if not isinstance(data, dict):
            data = {}
        for name, mtype in MODULES:
            if name not in data:
                if mtype == "str":
                    data[name] = ""
                elif mtype == "list_str":
                    data[name] = [""]
                elif mtype == "list_shot":
                    data[name] = [dict(zip(SHOT_FIELDS, [1, "", "", "", "", "", "", "", "", ""]))]

        # 规范化分镜字段
        shots = data.get("分镜序列")
        if isinstance(shots, list):
            for i, shot in enumerate(shots):
                if isinstance(shot, dict):
                    for f in SHOT_FIELDS:
                        if f not in shot:
                            shot[f] = 1 if f == "编号" else ""

        return (json.dumps(data, ensure_ascii=False, indent=2),)
