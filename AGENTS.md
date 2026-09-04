# AGENTS.md

## Git 提交与推送规则（永久约定，所有 agent / 后续开发必须遵守）

1. **只推送到 Gitee**：代码 `commit` 后，推送一律只执行 `git push gitee <branch>`（当前默认 `master`）。remote 名固定为 `gitee`。
2. **GitHub 由镜像自动同步**：Gitee 仓库已配置「镜像仓库管理 → 自动同步到 GitHub」（Gitee 侧功能，目标 https://github.com/taiyiframe/ComfyUI-Openkit.git）。**严禁手动 `git push github` 或 `git push origin`**——`origin` / `github` 都是镜像目标，手动推送会与镜像冲突或造成重复推送。
3. **每次 push 后验证**：`git push gitee` 完成后，**等待约 30 分钟**，再验证 GitHub 仓库的同步状态（用 `git ls-remote github refs/heads/master` 对比最新 commit hash 是否与 gitee 一致）。未到 30 分钟不要下"未同步"结论。
4. 提交信息保持现有约定风格（`type(scope): summary`，如 `feat(media-loader): ...` / `fix(audio): ...` / `style(ui): ...`）。

## 远端参考（当前配置）

- `gitee`  = https://gitee.com/dbmcp/ComfyUI-Openkit.git（**推送源，已带认证凭据**）
- `github` = https://github.com/taiyiframe/ComfyUI-Openkit.git（**镜像目标，禁止手动推送**）
- `origin` = 同上 GitHub（**镜像目标，禁止手动推送**）

## ComfyUI 运行环境（端口约定，自 2026-09-04 起永久生效）

1. **统一使用端口 8188**：本项目 ComfyUI 启动/访问一律用 `http://127.0.0.1:8188`，浏览器测试、节点调试、截图都以 8188 为准。
2. **不再使用 9000**：旧端口 9000 已废弃停止使用，不要再用 9000 访问或启动实例。
3. 启动命令参考：`cd D:\ComfyUI_ROB2900_H3\ComfyUI ; .\..\venv312\Scripts\python.exe main.py --listen 0.0.0.0 --port 8188 --cuda-device 0 --cuda-malloc --use-sage-attention --disable-xformers`
