# AGENTS.md

## Git 提交与推送规则（永久约定，所有 agent / 后续开发必须遵守）

1. **Gitee 为主推送远端（2026-09-04 起，用户最终拍板；与宪法 3.0 目录边界铁律一致）**：代码 `commit` 后，默认执行 `git push gitee <branch>`（当前默认 `master`）。GitHub 侧为镜像/异步同步，依赖 Gitee 的「仓库镜像」功能自动同步；若 Gitee 镜像未生效导致 GitHub 落后，不要手动 push github，先向用户说明并请其在 Gitee 网页端核对镜像配置。
2. **不自动提交**：**未经用户明确要求，不要自动 commit / push**。改动完成、验证通过后，先汇报并等待用户指示，用户说「提交 / 推」后再执行 commit 与 push（只推 gitee）。
3. **push 后验证**：push 完成后，用 `git ls-remote gitee refs/heads/master` 确认远端 HEAD 已到最新 commit，确保同步一致。
4. 提交信息保持现有约定风格（`type(scope): summary`，如 `feat(media-loader): ...` / `fix(audio): ...` / `style(ui): ...`）。

## 远端参考（当前配置）

- `gitee`  = https://gitee.com/taiyiframe/ComfyUI-Openkit.git（**主推送远端**）
- `github` = https://github.com/taiyiframe/ComfyUI-Openkit.git（**镜像/异步同步，靠 Gitee 镜像自动同步，不主动推送**）
- `origin` = 同上 GitHub（**不推送**）

## ComfyUI 运行环境（端口约定，自 2026-09-04 起永久生效）

1. **统一使用端口 8188**：本项目 ComfyUI 启动/访问一律用 `http://127.0.0.1:8188`，浏览器测试、节点调试、截图都以 8188 为准。
2. **不再使用 9000**：旧端口 9000 已废弃停止使用，不要再用 9000 访问或启动实例。
3. 启动命令参考：`cd D:\ComfyUI-20260916-045343\ComfyUI ; .\..\python\python.exe main.py --listen 0.0.0.0 --port 8188 --cuda-device 0 --cuda-malloc --use-sage-attention --disable-xformers`（运行时使用 embedded python，位于 `D:\ComfyUI-20260916-045343\python\python.exe`）

## 迭代开发铁律（2026-09-25 用户拍板，覆盖旧约定）

1. **任何修改/生成/修 bug 必须自动唤醒 agent 并行**：只要本轮涉及实质性修改或生成（代码、文档、配置、脚本、素材、发布包、目录结构等），MainAgent 不得单线程串行闷头做，必须派 OrganizerAgent 拉起多个子 agent 并行执行（诊断复现 / 后端 / 前端 / 测试 / 文档 / 封版分片），收敛后统一验证交付。单 agent 串行只允许用于纯读勘察与最终汇总。
2. **修改或生成任何内容前必须归档旧版本，项目目录只保留最新一版 + arch/**：动手前先把旧版本完整归档到 `arch/`（命名 `arch/<日期时间戳>_<语义标签>/`，可回滚）；完成后体系化整理新版——目录清晰、命名规范、文件归位、无临时垃圾。**项目根只允许保留工程化的最新一版目录 + `arch/` 归档目录**，旧版本/废弃稿/中间产物有价值的入 `arch/`，无价值的直接删除，禁止多版本并存于项目根。
3. **测试通过自动提交双平台**：代码修改后必须跑企业级工程化测试（JS 单测 + Python pytest + CDP 端到端），全绿后**自动 commit 并推送双平台**（Gitee 主仓 + GitHub 镜像），不再等待用户手动确认提交——本条覆盖上文「不自动提交」旧约定。
4. **全生命周期零污染**：本项目全生命周期内任何 agent 生成的目录、文件、脚本、日志、截图、测试报告、设计文档、缓存、下载内容，一律体系化放在本项目目录（`D:\AIGC\001openkit\`）下的合适位置，**严禁写入 `D:\AIGC\001openkit\` 之外的任何位置**（系统目录、%TEMP%、%APPDATA%、桌面、下载、其他项目目录一律只读可引用，禁止写入/修改/删除）。工具默认向系统位置写缓存的必须重定向回项目内，无法重定向的收尾即清理。临时文件落在项目内 `_tmp_*`，任务收尾即删。交付前自检：项目目录之外不得出现任何本会话新产生的文件。
