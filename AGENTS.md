# AGENTS.md

## Git 提交与推送规则（永久约定，所有 agent / 后续开发必须遵守）

1. **只推 Gitee（2026-09-04 起，用户最终拍板）**：代码 `commit` 后，只执行 `git push gitee <branch>`（当前默认 `master`）。**不再 push github / origin**；GitHub 侧依赖 Gitee 的「仓库镜像」功能自动同步。若 Gitee 镜像未生效导致 GitHub 落后，不要手动 push github，先向用户说明并请其在 Gitee 网页端核对镜像配置。
2. **不自动提交**：**未经用户明确要求，不要自动 commit / push**。改动完成、验证通过后，先汇报并等待用户指示，用户说「提交 / 推」后再执行 commit 与 push（只推 gitee）。
3. **push 后验证**：push 完成后，用 `git ls-remote gitee refs/heads/master` 确认远端 HEAD 已到最新 commit，确保同步一致。
4. 提交信息保持现有约定风格（`type(scope): summary`，如 `feat(media-loader): ...` / `fix(audio): ...` / `style(ui): ...`）。

## 远端参考（当前配置）

- `gitee`  = https://gitee.com/dbmcp/ComfyUI-Openkit.git（**唯一推送远端**）
- `github` = https://github.com/taiyiframe/ComfyUI-Openkit.git（**保留为只读 fallback，不推送**；靠 Gitee 镜像同步）
- `origin` = 同上 GitHub（**不推送**）

## ComfyUI 运行环境（端口约定，自 2026-09-04 起永久生效）

1. **统一使用端口 8188**：本项目 ComfyUI 启动/访问一律用 `http://127.0.0.1:8188`，浏览器测试、节点调试、截图都以 8188 为准。
2. **不再使用 9000**：旧端口 9000 已废弃停止使用，不要再用 9000 访问或启动实例。
3. 启动命令参考：`cd D:\ComfyUI_ROB2900_H3\ComfyUI ; .\..\venv312\Scripts\python.exe main.py --listen 0.0.0.0 --port 8188 --cuda-device 0 --cuda-malloc --use-sage-attention --disable-xformers`
