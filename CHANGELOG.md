# Changelog

本文件记录 ComfyUI-Openkit 的版本变更。格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### Added
- docs/ 工程化文档目录
- CHANGELOG.md
- OpenkitMemoryCleanup：合并显存/内存清理为单节点（5 个独立开关 + 重试次数），零第三方依赖，ctypes 实现 Windows 内存读取与进程工作集清理

## [0.2.0] - 2026-09-21

### Added
- OpenkitExecutionTime 执行时间统计节点（空输入 OUTPUT_NODE，幂等 patch `execution.execute`，统计节点耗时与峰值 VRAM，经 WebSocket 回传前端）

### Fixed
- 启动时静默 asyncio ProactorEventLoop 连接关闭异常（Windows 下 `proactor_events.py:165` FATAL traceback）

## [0.1.0] - 2026-09-05

### Added
- 8 个核心节点：JsonExtractor / MultiframeRef / ChooseImage / SubjectRefTagReplacement / MediaLoader / ReferenceSplitter / TabStringMultiline / MultiSegmentPromptEditor
- 素材无上限 + 编号双轨制
- 三栏布局 + P1 性能链路（窗口化虚拟渲染 / 事件委托 / 懒加载 / rAF 合并 / WeakMap uid 全局唯一）
- Lite Design（#F0F050 黄，三自绘面板节点接入）
- 全中英双语（i18n）
