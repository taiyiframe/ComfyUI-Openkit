# AGENTS.md — ComfyUI-Openkit 项目顶层规则

> 本文件为项目最高优先级规则，任何子 agent / 脚本 / 会话执行任务时必须首先遵守。
> 与本文件冲突的口头指令、历史文档、临时约定，一律以本文件为准；修改本文件须显式留痕。

## 项目根与写入边界

- **工程根**：`D:\AIGC\001openkit\ComfyUI-Openkit\`（本 AGENTS.md 所在目录，git 仓库）
- **项目总根**：`D:\AIGC\001openkit\`（含 arch/、archives/、docs/、本代码仓库、index.md）
- **全生命周期零污染（铁律）**：本会话任何 agent 生成的目录、文件、脚本、日志、截图、测试报告、设计文档、缓存、下载内容，一律体系化放在 `D:\AIGC\001openkit\` 下合适子目录；**严禁写入该路径之外的任何位置**（系统目录、%TEMP%、%APPDATA%、桌面、下载、其他项目目录一律只读可引用，禁止写入/修改/删除）。工具默认向系统位置写缓存的必须重定向回项目内，无法重定向的收尾即清理。临时文件落在项目内 `_tmp_*`，任务收尾即删。交付前自检：项目目录之外不得出现任何本会话新产生的文件。

## ★ 迭代开发铁律（2026-09-25 用户拍板，覆盖一切旧约定）

### 1. 每次都必须自动唤醒 agent 并行
- 只要本轮涉及实质性修改或生成（代码、文档、配置、脚本、素材、发布包、目录结构等），MainAgent **不得单线程串行闷头做**，必须派 OrganizerAgent 拉起多个子 agent 并行执行（诊断复现 / 后端 / 前端 / 测试 / 文档 / 封版分片），收敛后统一验证交付。
- 单 agent 串行只允许用于纯读勘察与最终汇总。

### 2. 改前归档、改后体系化，项目根只留最新一版 + arch/
- **每次修改或生成任何内容前**，先把旧版本完整归档到 `arch/`（命名 `arch/<日期时间戳>_<语义标签>/`，可回滚）。
- 完成后**体系化整理新版**：目录清晰、命名规范、文件归位、无临时垃圾。
- **项目根只允许保留工程化的最新一版目录 + `arch/` 归档目录**；旧版本/废弃稿/中间产物有价值的入 `arch/`，无价值的直接删除，禁止多版本并存于项目根。

### 3. 企业级测试全绿后自动 commit 并推送双平台
- 代码修改后必须跑企业级工程化测试（JS 单测 + Python pytest + CDP 端到端），全绿后**自动 commit 并推送 Gitee + GitHub 双平台**，不再等待用户手动确认提交。
- 提交信息风格：`type(scope): summary`（如 `feat(media-loader): ...` / `fix(audio): ...` / `style(ui): ...`），含修复/变更摘要、关联 bug 或需求、测试结果摘要。
- push 后用 `git ls-remote` 分别确认 Gitee、GitHub 远端 HEAD 已到最新 commit。

## Git 远端配置

- `gitee`  = https://gitee.com/taiyiframe/ComfyUI-Openkit.git（主推送远端）
- `github` = https://github.com/taiyiframe/ComfyUI-Openkit.git（双平台同步推送，本条覆盖旧"仅 Gitee 镜像"约定）
- `origin` = 同上 GitHub
- 当前默认分支：`master`

## ComfyUI 运行环境（端口与启动命令，永久生效）

- **统一端口 8188**：启动/访问/浏览器测试/节点调试/截图一律用 `http://127.0.0.1:8188`；旧端口 9000 已废弃。
- 启动命令（用户固定配置，勿改参数）：
  ```
  D:\ComfyUI-20260916-045343\python\python.exe D:\ComfyUI-20260916-045343\ComfyUI\main.py --listen 127.0.0.1 --port 8188 --user-directory D:\ComfyUI-20260916-045343\ComfyUI\user --cuda-device 0 --cuda-malloc --lowvram --vram-headroom 0.5 --preview-method latent2rgb --use-sage-attention --disable-xformers --models-directory D:\models-MiniMax-H3 --output-directory D:\ComfyUI-Asset\output --input-directory D:\ComfyUI-Asset\input --temp-directory D:\ComfyUI-Asset\temp --fast-disk --disable-pinned-memory
  ```
- 模型目录：`D:\models-MiniMax-H3`；输出：`D:\ComfyUI-Asset\output`；输入：`D:\ComfyUI-Asset\input`；临时：`D:\ComfyUI-Asset\temp`。

## 通用约束

- 不下载模型、不擅自改 ComfyUI 核心配置、不碰用户固定启动参数。
- 不编造来源/URL/文献名；考据与变更标注确定度。
- 本 AGENTS.md 修改须留痕（在 CHANGELOG.md 或本文件末尾追加变更记录）。
