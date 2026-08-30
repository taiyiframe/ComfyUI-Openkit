# ComfyUI-OpenToolkit

Open, standardized ComfyUI utility node collection. No black-box encapsulation, every node is transparent and well-documented.

开放、规范的 ComfyUI 工具节点集合。无黑盒封装，每个节点均透明可控、文档完备。

---

## Features / 功能特性

- **JSON-driven prompt generation** — Extract structured data from JSON and generate MiniMax H3 six-part standard prompts
- **Multi-frame reference management** — Organize keyframes, image lists, and background layers with correct index ordering
- **Subject reference tag replacement** — Replace entity names with `<Subject N>` tags across all prompt sections
- **Standard ComfyUI plugin structure** — Follows official conventions, easy to install and extend
- **Fully documented** — Every input, output, and internal logic is explained

- **JSON 驱动提示词生成** — 从 JSON 提取结构化数据，生成 MiniMax H3 六段式标准提示词
- **多帧参考管理** — 管理关键帧、图像列表与背景层，索引顺序正确
- **主体引用标签置换** — 在所有提示词段落中将实体名替换为 `<Subject N>` 标签
- **标准 ComfyUI 插件结构** — 遵循官方规范，易于安装与扩展
- **完整文档** — 每个输入、输出及内部逻辑均有说明

---

## Nodes / 节点列表

### 1. JsonExtractor (JSON提取)

Extracts structured fields from JSON input and generates a complete MiniMax H3 six-part standard prompt. Supports character/prop/scene/keyframe archives, automatic subject definition generation, and intelligent entity-to-tag mapping.

从 JSON 输入中提取结构化字段，生成完整的 MiniMax H3 六段式标准提示词。支持角色/道具/场景/关键帧档案、主体定义自动生成、智能实体到标签的映射。

**Inputs / 输入:**

| Port / 端口 | Type / 类型 | Description / 说明 |
|---|---|---|
| `json` | STRING (required) | JSON string or object / JSON 字符串或对象 |
| `索引` | INT | Shot sequence index (default: 1) / 分镜序列编号（默认 1） |
| `档案选择` | COMBO | Select archive type: 角色档案 / 音色档案 / 道具档案 / 场景档案 / 关键帧档案 |
| `角色输出` | BOOLEAN | Toggle character archive output / 角色档案输出开关 |
| `道具输出` | BOOLEAN | Toggle prop archive output / 道具档案输出开关 |
| `场景输出` | BOOLEAN | Toggle scene archive output / 场景档案输出开关 |
| `关键帧输出` | BOOLEAN | Toggle keyframe archive output / 关键帧档案输出开关 |
| `BGM输出` | BOOLEAN | Toggle BGM output (off → outputs N/A) / BGM 输出开关（关则输出 N/A） |
| `情节输出` | BOOLEAN | Toggle pure plot text output / 纯情节文本输出开关 |
| `自定义段落（末尾追加）` | STRING | Custom text appended at the end (e.g., Negative prompt) / 末尾追加的自定义文本（如 Negative 提示词） |

**Outputs / 输出:**

| Port / 端口 | Type / 类型 | Description / 说明 |
|---|---|---|
| `整体风格` | STRING | Overall style description / 整体风格描述 |
| `档案` | STRING | Selected archive content / 选中的档案内容 |
| `档案编码` | INT | Selected archive index / 选中的档案索引编号 |
| `分镜序列` | STRING | Complete H3 six-part prompt / 完整的 H3 六段式提示词 |
| `角色道具场景` | STRING | Combined character/prop/scene text / 角色道具场景合并文本 |
| `关键帧索引` | STRING | Keyframe picture index tags / 关键帧图片索引标签 |
| `角色索引` | STRING | Character picture index tags / 角色图片索引标签 |
| `道具索引` | STRING | Prop picture index tags / 道具图片索引标签 |
| `场景索引` | STRING | Scene picture index tags / 场景图片索引标签 |
| `索引时长` | FLOAT | Shot duration in seconds / 分镜时长（秒） |
| `场景判断` | BOOLEAN | Whether current shot is a scene / 当前分镜是否为场景 |

**Generated H3 Prompt Structure / 生成的 H3 提示词结构:**

```
subject_definitions:    # Auto-generated from archives referenced in summary & camera moves
summary:                # Extracted from JSON 摘要 field
retention_analysis:     # Auto-generated for each subject with fully_preserved
detailed_description:   # Auto-generated overview + camera move segments (→ prefix)
overall_soundscape:     # Extracted from JSON 环境音 field
non_diegetic_music:     # Extracted from JSON BGM field (N/A when disabled)
[custom paragraph]      # Appended if provided (e.g., Negative: ...)
```

---

### 2. MultiframeRef (多帧参考)

Manages multi-frame reference images with fixed layout: keyframe first, then dynamic image list (1–7), background last. Background is always pinned to the bottom layer. Supports single-frame mode that hides the keyframe input.

管理多帧参考图片，固定布局：关键帧首位，动态图像列表（1–7）居中，背景末位。背景始终固定在最底层。支持单帧模式（隐藏关键帧输入）。

**Inputs / 输入:**

| Port / 端口 | Type / 类型 | Description / 说明 |
|---|---|---|
| `关键帧` | IMAGE | Keyframe reference image (Picture 1) / 关键帧参考图（Picture 1） |
| `图像列表1` | IMAGE | Reference image 1 (auto-expands to 图像列表2 when connected) / 参考图1（连接后自动展开图像列表2） |
| `图像列表2`–`图像列表7` | IMAGE | Dynamically expanded reference images / 动态扩展的参考图 |
| `背景` | IMAGE | Background image (always last layer, not counted in 9-image limit) / 背景图（始终为最后一层，不计入9张上限） |
| `单帧模式` | BOOLEAN | When enabled, hides keyframe input / 启用时隐藏关键帧输入 |

**Outputs / 输出:**

| Port / 端口 | Type / 类型 | Description / 说明 |
|---|---|---|
| `图像` | IMAGE | Concatenated image batch in correct order / 按正确顺序拼接的图像批次 |
| `数量` | INT | Total image count (excluding background) / 图片总数（不含背景） |

**Index Ordering / 索引顺序:**

1. Keyframe → `<Picture 1>`
2. Image list 1–7 → `<Picture 2>` – `<Picture 8>`
3. Background → always last layer (not counted in the 9-image H3 limit)

---

### 3. SubjectRefTagReplacement (主体引用标签置换)

Replaces entity names (characters, props, scenes, keyframes) with corresponding `<Subject N>` reference tags across all prompt sections **except** `subject_definitions` itself. This keeps definitions readable while ensuring consistent tag usage in summary, retention_analysis, detailed_description, and soundscape sections.

在除 `subject_definitions` 以外的所有提示词段落中，将实体名（角色、道具、场景、关键帧）替换为对应的 `<Subject N>` 引用标签。保持定义段可读，同时确保摘要、一致性分析、详细描述和环境声场段落中标签使用一致。

**Inputs / 输入:**

| Port / 端口 | Type / 类型 | Description / 说明 |
|---|---|---|
| `提示词` | STRING (required) | Full H3 six-part prompt text / 完整的 H3 六段式提示词文本 |
| `主体列表` | STRING | Newline-separated entity names to replace / 换行分隔的待替换实体名列表 |

**Outputs / 输出:**

| Port / 端口 | Type / 类型 | Description / 说明 |
|---|---|---|
| `提示词` | STRING | Prompt with entity names replaced by `<Subject N>` tags / 实体名已替换为 `<Subject N>` 标签的提示词 |

**Behavior / 行为:**

- `subject_definitions` section is **never** modified (definitions keep original names)
- All other sections (`summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`) have entity names replaced
- Tags are assigned in the order entities appear in `subject_definitions`
- 不修改 `subject_definitions` 段落（定义保留原始名称）
- 其他所有段落（`summary`、`retention_analysis`、`detailed_description`、`overall_soundscape`、`non_diegetic_music`）中的实体名被替换
- 标签按实体在 `subject_definitions` 中出现的顺序分配

---

## Installation / 安装方法

### Method 1: Git Clone / 方法一：Git 克隆

```bash
cd ComfyUI/custom_nodes/
git clone https://gitee.com/dbmcp/ComfyUI-OpenToolkit.git
# or mirror: https://github.com/dbmcp/ComfyUI-OpenToolkit.git
```

### Method 2: Manual / 方法二：手动安装

1. Download the repository as ZIP
2. Extract to `ComfyUI/custom_nodes/ComfyUI-OpenToolkit/`
3. Restart ComfyUI

1. 下载仓库 ZIP 包
2. 解压到 `ComfyUI/custom_nodes/ComfyUI-OpenToolkit/`
3. 重启 ComfyUI

---

## Usage / 使用说明

### Basic Workflow / 基本工作流

1. **JsonExtractor** — Feed your JSON script, select archive type, get structured outputs and the complete H3 prompt
2. **MultiframeRef** — Connect your keyframe, image list, and background images in order
3. **SubjectRefTagReplacement** — Pass the generated prompt through this node to standardize subject tags
4. Connect outputs to your video generation node (e.g., MiniMax H3)

1. **JsonExtractor** — 输入 JSON 剧本，选择档案类型，获得结构化输出和完整的 H3 提示词
2. **MultiframeRef** — 按顺序连接关键帧、图像列表和背景图
3. **SubjectRefTagReplacement** — 将生成的提示词通过此节点标准化主体标签
4. 将输出连接到视频生成节点（如 MiniMax H3）

### JSON Input Format / JSON 输入格式示例

```json
{
  "整体风格": "Overall style description...",
  "角色档案": ["Character 1 description...", "Character 2 description..."],
  "音色档案": ["Voice 1 description..."],
  "道具档案": ["Prop 1 description..."],
  "场景档案": ["Scene 1 description..."],
  "关键帧档案": ["Keyframe 1 description..."],
  "分镜序列": [
    {
      "编号": 1,
      "类型": "文戏：10秒",
      "标题": "Shot title",
      "摘要": "Summary text...",
      "运镜": ["→Camera move 1...", "→Camera move 2..."],
      "环境音": "Environmental sound description...",
      "BGM": "Background music or N/A"
    }
  ]
}
```

---

## Directory Structure / 目录结构

```
ComfyUI-OpenToolkit/
├── __init__.py              # Plugin entry / 插件入口，注册节点映射
├── nodes/
│   ├── __init__.py          # Node class & display name mappings / 节点类与显示名映射
│   ├── json_extractor.py    # JsonExtractor implementation / JSON 提取节点
│   ├── multiframe_ref.py    # MultiframeRef implementation / 多帧参考节点
│   └── subject_ref_tag_replacement.py  # SubjectRefTagReplacement / 主体标签置换节点
├── web/
│   └── js/
│       └── multiframe_ref.js  # Frontend dynamic input expansion / 前端动态输入扩展
├── requirements.txt         # Python dependencies / Python 依赖声明
├── pyproject.toml           # Project metadata / 项目元信息
├── .gitignore               # Git ignore rules / Git 忽略规则
└── README.md                # This file / 本说明文档
```

---

## Extending / 扩展开发

### Adding a New Node / 新增节点步骤

1. Create a new `.py` file under `nodes/` with your node class
2. Implement `INPUT_TYPES`, `RETURN_TYPES`, `FUNCTION`, `CATEGORY`, and the processing method
3. Import and register in `nodes/__init__.py`:
   - Add class to `NODE_CLASS_MAPPINGS`
   - Add display name to `NODE_DISPLAY_NAME_MAPPINGS`
4. Restart ComfyUI

1. 在 `nodes/` 下创建新的 `.py` 文件，编写节点类
2. 实现 `INPUT_TYPES`、`RETURN_TYPES`、`FUNCTION`、`CATEGORY` 及处理方法
3. 在 `nodes/__init__.py` 中导入并注册：
   - 将类添加到 `NODE_CLASS_MAPPINGS`
   - 将显示名添加到 `NODE_DISPLAY_NAME_MAPPINGS`
4. 重启 ComfyUI

### Frontend Extensions / 前端扩展

Place JavaScript files under `web/js/`. They are automatically loaded by ComfyUI on startup. Use for dynamic input visibility, custom widgets, or UI interactions.

JavaScript 文件放置在 `web/js/` 下，ComfyUI 启动时自动加载。用于动态输入显隐、自定义控件或 UI 交互。

---

## Compatibility / 兼容性

- ComfyUI latest stable / ComfyUI 最新稳定版
- Python 3.10+
- No external dependencies beyond ComfyUI core / 除 ComfyUI 核心外无外部依赖

---

## License / 许可证

Open source. Free to use, modify, and distribute.

开源项目，可自由使用、修改和分发。
