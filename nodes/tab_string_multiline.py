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
            "optional": {
                # 接收上游节点「Tab索引」输出的连线输入。仅作连线端口（forceInput），
                # 不渲染独立控件；前端联动 broadcast 已即时切换显示，运行时连线值
                # 作为生效索引。用 -1 作哨兵：未连线时 ComfyUI 传 default=-1，
                # 据此回退到上方「Tab索引」widget 的值。
                "tab_index_in": ("INT", {
                    "default": -1,
                    "min": -1,
                    "max": cls.MAX_TAB_COUNT - 1,
                    "step": 1,
                    "forceInput": True,
                    "tooltip": "接收上游节点的 Tab索引 连线输入。有连线时优先使用此值；未连线（-1）时回退使用「Tab索引」控件值。",
                }),
            },
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("文本", "Tab索引")
    FUNCTION = "execute"
    CATEGORY = "Openkit/工具"

    def execute(self, Tab索引=0, tabs_content="{}", tab_index_in=-1):
        # 有连线输入(>=0)时优先用连线值；未连线传哨兵 -1，回退到 widget「Tab索引」
        raw_idx = tab_index_in if (tab_index_in is not None and tab_index_in >= 0) else Tab索引
        try:
            idx = int(raw_idx)
        except (TypeError, ValueError):
            idx = 0

        try:
            data = json.loads(tabs_content) if isinstance(tabs_content, str) and tabs_content else {}
        except Exception:
            data = {}

        tabs = data.get("tabs") if isinstance(data, dict) else None
        if not isinstance(tabs, list):
            tabs = []

        if not tabs:
            # 无任何 Tab 页：空串 + 索引 0
            text = ""
            idx = 0
        elif not (0 <= idx < len(tabs)):
            # P1修复: 越界钳制方向与前端联动语义对齐——钳到末页而非首页。
            # 旧实现钳首页(text=tabs[0])会让越界索引静默输出首Tab内容，与前端
            # setCurTab 越界不动的行为相反；现统一收敛到末页并打印告警。
            print(f"[Openkit] Tab索引越界: idx={idx}, tabs={len(tabs)}, 钳制到末页")
            idx = max(0, min(idx, len(tabs) - 1))
            text = tabs[idx]
        else:
            text = tabs[idx]

        return (str(text), idx)
