# ComfyUI-Openkit 项目目录结构 Index

> 最后更新：2026-09-21

## 根目录

```
D:\AIGC\001openkit/
├── arch/                  # 历史资料库归档（不跟踪）
├── docs/                  # 工程化文档
├── nodes/                 # 后端节点
├── web/js/               # 前端脚本
├── tests/                 # 测试（gitignore）
├── pkg/                   # 打包辅助
├── __init__.py            # 插件入口
├── README.md              # 项目说明
├── LICENSE                # MulanPSL-2.0
├── pyproject.toml         # Python 元数据
├── requirements.txt       # 依赖（空 = 纯 stdlib）
├── CHANGELOG.md           # 版本变更
├── AGENTS.md              # Agent 协作规范
├── .gitignore
└── index.md               # 本文件
```

## docs/ 文档索引

| 路径 | 内容 |
|---|---|
| `docs/README.md` | 部署指南与双平台说明 |
| `docs/CONSTITUTION.md` | 设计宪法（最高约束） |
| `docs/evaluation/2026-09-19_三专家PK技术评估报告.md` | 三专家对抗式技术评估 |
| `docs/design/2026-09-04_全局UI性能优化改造_立项.md` | P0/P1/P2 性能优化立项 |
| `docs/design/节点体系规划_证据型.md` | 证据型节点规划（~18 个） |
| `docs/process/DEVELOPMENT_PROCESS.md` | 开发流程规范 |

## 关键路径

| 用途 | 路径 |
|---|---|
| 主仓（开发） | `D:\AIGC\001openkit` |
| 运行时（ComfyUI 20260916） | `D:\ComfyUI-20260916-045343\ComfyUI\custom_nodes\ComfyUI-Openkit` |
| 固定测试工作流 | `D:\ComfyUI-20260916-045343\ComfyUI\user\default\workflows\test0830-提示词h3节点开发.json` |
| Gitee（主仓） | `https://gitee.com/taiyiframe/ComfyUI-Openkit` |
| GitHub（镜像） | `https://github.com/taiyiframe/ComfyUI-Openkit` |

## 当前状态

- **Git HEAD**：`268e65a`（docs: 工程化目录结构 + CHANGELOG + 部署说明）
- **已提交节点**：8 个
- **未提交**：无（ExecutionTime 已提交 e7c0cc3，待重构）
- **技术债**：见 `docs/CONSTITUTION.md` 第五节
