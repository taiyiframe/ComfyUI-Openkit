# -*- coding: utf-8 -*-
"""
TabStringMultiline — 多 Tab 页多行字符串节点
============================================
由 ComfyUI 内置节点 PrimitiveStringMultiline 重写扩展而来，注册到 Openkit 插件。

能力：
  - 前端提供动态个数的 Tab 页（不固定，点击「+」可新增，上限 64）多行文本编辑；
  - Tab 页标签支持双击编辑标题；
  - 顶部「Tab索引」输入（0 开始的整数）决定节点最终输出哪个 Tab 页的内容；
  - 点击 Tab 页或「联动切换」按钮，Tab 索引随之联动切换输出。

后端只负责：
  1) 暴露「Tab索引」整数输入 与 tabs_content（前端自动管理的 JSON）两个 widget；
  2) execute 时解析 tabs_content JSON，取 Tab索引 对应的 Tab 页文本输出。
所有 Tab 页 UI 与联动逻辑由前端扩展 web/js/tab_string_multiline.js 实现。
"""

import json


class TabStringMultiline:
    MAX_TAB_COUNT = 64

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Tab索引": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": cls.MAX_TAB_COUNT - 1,
                    "step": 1,
                    "control_after_generate": "fixed",
                    "tooltip": "选择输出哪个 Tab 页的内容，索引从 0 开始（0=Tab 0，1=Tab 1…）。点击其右侧的「联动切换」按钮，可把下方 Tab 页自动切换到对应索引的页。",
                }),
                "tabs_content": ("STRING", {
                    "multiline": True,
                    "default": "{}",
                    "tooltip": "前端自动管理的全部 Tab 页内容与标题（JSON），请勿手工修改。",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("文本",)
    FUNCTION = "execute"
    CATEGORY = "Openkit/工具"

    def execute(self, Tab索引=0, tabs_content="{}"):
        try:
            idx = int(Tab索引)
        except (TypeError, ValueError):
            idx = 0

        try:
            data = json.loads(tabs_content) if isinstance(tabs_content, str) and tabs_content else {}
        except Exception:
            data = {}

        tabs = data.get("tabs") if isinstance(data, dict) else None
        if not isinstance(tabs, list):
            tabs = []

        if 0 <= idx < len(tabs):
            text = tabs[idx]
        elif tabs:
            text = tabs[0]
        else:
            text = ""

        return (str(text),)
