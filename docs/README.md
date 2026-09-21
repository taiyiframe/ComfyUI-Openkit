# ComfyUI-Openkit 工程化目录结构

## 根目录

```
ComfyUI-Openkit/
├── arch/               # 历史资料库归档（不跟踪，已 gitignore）
├── docs/               # 工程化文档（架构说明、节点清单、部署指南）
├── nodes/              # 后端节点实现（Python）
├── web/js/             # 前端脚本（JavaScript，LiteGraph 扩展）
├── tests/              # 测试（已 gitignore，不发布）
├── pkg/                # 打包/发布辅助
├── __init__.py         # 插件入口（ComfyUI 加载时最先执行）
├── README.md           # 项目说明
├── LICENSE             # MulanPSL-2.0
├── pyproject.toml      # Python 项目元数据
├── requirements.txt    # 依赖（空 = 纯 stdlib）
├── CHANGELOG.md         # 版本变更记录
├── AGENTS.md           # Agent 协作规范
└── .gitignore
```

## 部署方式

后续所有 ComfyUI 环境下的 Openkit 统一从双平台下载：

- Gitee: https://gitee.com/taiyiframe/ComfyUI-Openkit
- GitHub: https://github.com/taiyiframe/ComfyUI-Openkit

```bash
cd ComfyUI/custom_nodes
git clone https://gitee.com/taiyiframe/ComfyUI-Openkit.git
```

## 双平台同步

- **主仓**：Gitee（前台推送并确认成功即完成）
- **镜像**：GitHub（异步同步，不阻塞）
- **账号**：双平台统一 `taiyiframe`（旧 `dbmcp` 已废弃）
