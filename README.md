# ComfyUI-OpenToolkit

Personal ComfyUI utility node collection.
个人专属 ComfyUI 工具节点集合。

## Nodes / 节点列表

### 1. JSON提取 (JsonExtractor)

Extracts multiple fields from JSON data and outputs them as separate ports. Supports concatenated JSON objects, shot indexing, and intelligent character/prop/scene archive matching.

从 JSON 数据中按字段提取并输出多个端口，支持多 JSON 对象拼接输入、分镜序列定位、角色/道具/场景档案智能匹配与索引输出。

**Inputs / 输入:**
- `json` — JSON string or object (forced input) / JSON 字符串或对象（强制输入）
- `索引` — Shot index number (INT, default 1) / 分镜编号
- `档案选择` — character / voice / prop / scene archive / 角色档案 / 音色档案 / 道具档案 / 场景档案
- `角色输出` / `道具输出` / `场景输出` — toggles / 开关
- `BGM输出` — toggle (off outputs N/A) / 开关（关时输出 N/A）
- `情节输出` — toggle (on outputs pure plot text) / 开关（开时输出纯情节文本）

**Outputs / 输出 (10 ports):**
1. 整体风格 (STRING)
2. 档案 (STRING)
3. 档案编码 (INT)
4. 分镜序列 (STRING)
5. 角色道具场景 (STRING)
6. 角色索引 (STRING)
7. 道具索引 (STRING)
8. 场景索引 (STRING)
9. 索引时长 (FLOAT)
10. 场景判断 (BOOLEAN)

## Directory Structure / 目录结构

```
ComfyUI-OpenToolkit/
├── __init__.py            # Plugin entry, aggregates node mappings / 插件入口
├── nodes/
│   ├── __init__.py        # Sub-package exports / 子包导出
│   └── json_extractor.py  # JsonExtractor implementation / 节点实现
├── web/                   # Frontend extensions / 前端扩展
├── requirements.txt       # Dependencies / 依赖声明
├── pyproject.toml         # Project metadata / 项目元信息
└── README.md              # This file / 说明文档
```

## Adding New Nodes / 新增节点步骤

1. Create a new `.py` file under `nodes/`.
2. Import and append the class to `NODE_CLASS_MAPPINGS` and `NODE_DISPLAY_NAME_MAPPINGS` in `nodes/__init__.py`.
3. Restart ComfyUI.

1. 在 `nodes/` 下新建 `.py` 文件，编写节点类。
2. 在 `nodes/__init__.py` 中导入并追加到两个映射字典。
3. 重启 ComfyUI。
