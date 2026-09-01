# pkg · Offline Dependencies / 离线依赖目录

Openkit 的**离线依赖引导目录**。所有可选后端依赖在**开发阶段**就已下载并保存于此，用户从仓库下载后**无需联网、无需手动安装任何依赖**即可直接使用。

This directory holds Openkit's **offline dependencies**. Optional backend wheels are downloaded during development and stored here, so users get a working plugin after a plain clone — no network, no manual `pip install`, no conflicts.

## Layout / 目录结构

| Path / 路径 | Purpose / 作用 |
|---|---|
| `wheels/` | Binary wheels of optional backends (e.g. `av-*.whl` for PyAV) / 可选后端的二进制 wheel |
| `site/` | Auto-created on first use; wheels are installed here with `pip --target` / 首次使用时自动生成，离线安装目标 |
| `vendored/` | (Optional) pure-Python helpers, added to `sys.path` directly / 可选纯 Python 依赖，直接入 path |
| `__init__.py` | `bootstrap()` / `ensure()` entry points / 引导入口 |

## How it works / 工作原理

1. On plugin import, `pkg.bootstrap()` is called by the nodes.
2. Missing binary backends are installed **offline** from `wheels/` into the plugin's own `pkg/site/` via `pip install --target`.
3. `pkg/site` is added to `sys.path` only for this plugin — your global Python environment and other plugins stay untouched.
4. If a backend still cannot be loaded, nodes degrade gracefully (e.g. video decoding falls back to `ffmpeg`, then `torchaudio`).

在插件导入时 `pkg.bootstrap()` 自动执行；缺失的二进制后端从 `wheels/` **离线**安装到插件私有 `pkg/site/`；仅对本插件注入 `sys.path`，不污染全局环境、不与其他插件冲突；仍不可用时节点优雅降级到其它后端。

## Policy / 原则

- **能不依赖就不依赖**：优先用小的自包含实现。
- **好依赖直接复用**：可靠、好用、体积合理的依赖（如 PyAV）打包离线复用，不重复造轮子。
- **零门槛**：用户 clone 即用，不需要安装依赖，不会因依赖冲突增加使用成本。
