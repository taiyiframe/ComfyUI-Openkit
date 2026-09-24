# Changelog

本文件记录 ComfyUI-Openkit 的版本变更。格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### Added
- OpenkitMemoryCleanup：合并显存/内存清理为单节点（5 个独立开关 + 重试次数），零第三方依赖，ctypes 实现 Windows 内存读取与进程工作集清理
- OpenkitExecutionTime：badge 中文显示 + 内存显存双指标实时显示（commit 7f3d09c）
- OpenkitExecutionTime：节点/任务级独占显存内存采集 + WebSocket live 推送（`openkit.exec_live`）+ 顶部悬浮条顺序调整为 耗时→显存→内存（commit 38f179a）。注意：live 推送为前端↔后端 WebSocket 协议级变更，新增了 `openkit.exec_live` 消息类型
- TabStringMultiline Tab索引联动切换：多Tab字符串节点新增 `Tab索引`(INT) 输出端口 + `tab_index_in`(INT, forceInput) 输入端口，支持链式传播 / 环路防护 / 越界钳制（commit a7edf6a）

### Fixed
- 执行时间统计：与 Dev-Utils-fix 计时器共存时自动互斥让位（消除顶部双计时器）；中断事件名修正为内核真实事件 `execution_interrupted`（原监听不存在的 `interrupt`）；缓存命中节点不再发送假 ~0ms 计时；被中断节点 badge 正确复位；刷新/切工作流后从 localStorage 恢复最近一次耗时并校验 class_type，防止跨工作流 node_id 碰撞张冠李戴；显存标注修正为增量 `ΔVRAM`
- 素材加载：媒体路由与中英国际化修复
- 兼容：memory_cleanup 非 Windows 平台加载容错；插件入口管道容错；AnyType 共享修复

### Changed
- 发布树精简：开发资料 `tests/`、`AGENTS.md` 不再随插件发布（本地开发目录保留），发布仓库只含运行所需代码、离线依赖、README/CHANGELOG/LICENSE

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
