# ComfyUI-Openkit

Open, standardized ComfyUI utility node collection. No black-box encapsulation, every node is transparent and well-documented.

开放、规范的 ComfyUI 工具节点集合。无黑盒封装，每个节点均透明可控、文档完备。

---

## Features / 功能特性

- **JSON-driven prompt generation** — Extract structured data from JSON and generate MiniMax H3 six-part standard prompts
- **Multi-frame reference management** — Organize keyframes, image lists, and background layers with correct index ordering
- **Subject reference tag replacement** — Replace entity names with `<Subject N>` tags across all prompt sections
- **Multi-tab media loading** — Up to 32 tabs of reference bundles (pictures/videos/audios) with trim, crop, soundtracks, presets
- **Multi-segment prompt visual editor** — Edit complex H3 JSON through hierarchical tabs, no raw JSON exposure
- **Standard ComfyUI plugin structure** — Follows official conventions, easy to install and extend
- **Fully documented** — Every input, output, and internal logic is explained

- **JSON 驱动提示词生成** — 从 JSON 提取结构化数据，生成 MiniMax H3 六段式标准提示词
- **多帧参考管理** — 管理关键帧、图像列表与背景层，索引顺序正确
- **主体引用标签置换** — 在所有提示词段落中将实体名替换为 `<Subject N>` 标签
- **多 Tab 素材加载** — 最多 32 个 Tab 页参考素材集（图片/视频/音频），支持裁剪、剪辑、音轨、预设
- **多段提示词可视化编辑** — 通过层级化 Tab 编辑复杂 H3 JSON，无需接触原始 JSON
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
| `背景` | IMAGE | Background image (always last layer, not counted in 9-image limit) / 背景图（始终为最后一层，不计入 9 张上限） |
| `单帧模式` | BOOLEAN | When enabled, hides keyframe input / 启用时隐藏关键帧输入 |

**Outputs / 输出:**

| Port / 端口 | Type / 类型 | Description / 说明 |
|---|---|---|
| `图像` | IMAGE | Concatenated image batch in correct order / 按正确顺序拼接的图像批次 |
| `数量` | INT | Total image count (excluding background) / 图片总数（不含背景） |

---

### 3. ChooseImage (筛选图像)

Filter and select images from a batch by index range or criteria.

从图像批次中按索引范围或条件筛选选择图像。

---

### 4. SubjectRefTagReplacement (主体引用标签置换)

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

---

### 5. MediaLoader (素材加载)

Loads reference-media sets across multiple tabs on a single node. Each added tab (up to 32) is one segment's complete, **independent** reference bundle: pictures (up to 32), videos (≤3) and audios (≤8). Per-tab video trim, picture/video crop, soundtrack pairing, drag sorting, enable/disable, presets and tag display are all built in. Pictures carry a category (关键帧 / 角色 / 道具 / 场景) and an auto-assigned read-only number, sorted as 关键帧 → 角色 → 道具 → 场景.

单节点加载多 Tab 页参考素材集。每个 Tab 页（最多 32 个）= 一个视频段完整、**独立**的参考素材集：参考图（最多 32 张）、参考视频（≤3）、参考音频（≤8）。内置每 Tab 视频剪辑、图片/视频裁剪、音轨配对、拖拽排序、开关、预设与标签显示。每张参考图带分类（关键帧 / 角色 / 道具 / 场景）和自动分配的只读编号，按 关键帧 → 角色 → 道具 → 场景 顺序排列。

**Inputs / 输入:**

| Port / 端口 | Type / 类型 | Description / 说明 |
|---|---|---|
| media_state | STRING (hidden) | Multi-tab JSON `{"tabs":[{name,items}]}`, maintained by the panel / 多 Tab 素材 JSON，由面板自动维护（隐藏） |
| tab_index (Tab索引) | INT | Which tab 指定素材 outputs (0-based, clamped) / 指定 指定素材 输出哪个 Tab（从 0 开始，越界自动收敛） |

**Outputs / 输出:**

| Port / 端口 | Type / 类型 | Description / 说明 |
|---|---|---|
| 指定素材 | MEDIA_REFS | The bundle of the tab selected by tab_index / 按 Tab 索引路由的单 Tab 素材 bundle |
| Tab索引 | INT | Actual selected tab index after clamping/fallback (0-based) / 越界或空 Tab 自动收敛后实际生效的 Tab 索引 |

**Capabilities / 能力:**

- Up to 32 tabs, each holding one segment's pictures / videos / audios, **independent limits** / 最多 32 个 Tab，每 Tab 独立存放图/视频/音频，**上限互相独立**
- Per-tab capacity: up to 32 pictures, 3 videos, 8 audio clips / 每 Tab 容量：最多 32 图、3 视频、8 音频
- Tab add / delete / rename; add a tab with one click / Tab 增删/重命名，一键新增整套素材加载器
- Picture slot title bar: category dropdown + auto-assigned read-only number / 图片槽位顶部标题栏：分类下拉 + 自动分配只读编号
- Number auto-assignment: switching category picks first unused number in that category / 编号自适应：切换分类自动分配该分类下第一个未使用编号
- Video trim (start/end seconds) with preview / 视频剪辑（起止秒）带预览
- Picture & video crop (normalised rect, draggable) / 图片与视频裁剪（归一化矩形，可拖拽）
- Soundtrack routing per video: paired / standalone / off / 每个视频的音轨路由：配对 / 独立 / 关闭
- Drag sorting, enable/disable, delete, budget monitor / 拖拽排序、开关、删除、预算监控
- Presets: save / load / delete, stored in `ComfyUI/input/openkit/presets/media_loader/` / 预设：保存/加载/删除，存放在 `ComfyUI/input/openkit/presets/media_loader/`
- The splitter node (ReferenceSplitter) emits **4 category picture lists** (关键帧 / 角色 / 道具 / 场景), each ordered by number / 拆分节点输出 **4 个分类图片列表**（关键帧 / 角色 / 道具 / 场景），每类按编号排序

---

### 6. ReferenceSplitter (素材拆分)

Fan a `MEDIA_REFS` bundle out into individual slots: 4 category picture lists (关键帧/角色/道具/场景), 3 video slots, 3 video-audio slots, 8 audio slots.

将 `MEDIA_REFS` bundle 拆分为独立端口：4 个分类图片列表（关键帧/角色/道具/场景）、3 个视频端口、3 个视频音轨端口、8 个音频端口。

---

### 7. TabStringMultiline (多Tab字符串)

Multi-tab multiline string editor with add/delete tabs, double-click rename, and per-tab text content.

多 Tab 多行字符串编辑器，支持增删 Tab、双击重命名、每 Tab 独立文本内容。

---

### 8. MultiSegmentPromptEditor (多段提示词可视化编辑)

Visual editor for complex H3 six-part JSON prompts. Seven top-level modules (整体风格 / 角色档案 / 音色档案 / 道具档案 / 场景档案 / 关键帧档案 / 分镜序列) edited through hierarchical tabs. Shot sequence supports type dropdown (文戏/武戏 × 5–12秒), three-level nested tabs for camera moves, JSON preview/edit with format validation, and auto numbering checks.

复杂 H3 六段式 JSON 提示词的可视化编辑器。七个顶层模块（整体风格 / 角色档案 / 音色档案 / 道具档案 / 场景档案 / 关键帧档案 / 分镜序列）通过层级化 Tab 编辑。分镜序列支持类型下拉框（文戏/武戏 × 5–12秒）、运镜三级嵌套 Tab、JSON 预览/编辑与格式校验、编号自动检查。

---

## Installation / 安装方法

### Method 1: Git Clone / 方法一：Git 克隆

```bash
cd ComfyUI/custom_nodes/
git clone https://github.com/taiyiframe/ComfyUI-Openkit.git
# or Gitee mirror: https://gitee.com/dbmcp/ComfyUI-Openkit.git
```

### Method 2: Manual / 方法二：手动安装

1. Download the repository as ZIP
2. Extract to `ComfyUI/custom_nodes/ComfyUI-Openkit/`
3. Restart ComfyUI

1. 下载仓库 ZIP 包
2. 解压到 `ComfyUI/custom_nodes/ComfyUI-Openkit/`
3. 重启 ComfyUI

---

## Usage / 使用说明

### Basic Workflow / 基本工作流

1. **JsonExtractor** — Feed your JSON script, select archive type, get structured outputs and the complete H3 prompt
2. **MultiframeRef** — Connect your keyframe, image list, and background images in order
3. **SubjectRefTagReplacement** — Pass the generated prompt through this node to standardize subject tags
4. **MediaLoader** — Load per-tab reference media, route 指定素材 via Tab索引
5. **MultiSegmentPromptEditor** — Visually edit complex H3 JSON without raw JSON exposure
6. Connect outputs to your video generation node (e.g., MiniMax H3)

1. **JsonExtractor** — 输入 JSON 剧本，选择档案类型，获得结构化输出和完整的 H3 提示词
2. **MultiframeRef** — 按顺序连接关键帧、图像列表和背景图
3. **SubjectRefTagReplacement** — 将生成的提示词通过此节点标准化主体标签
4. **MediaLoader** — 加载各 Tab 参考素材，通过 Tab索引 取 指定素材
5. **MultiSegmentPromptEditor** — 可视化编辑复杂 H3 JSON，无需接触原始 JSON
6. 将输出连接到视频生成节点（如 MiniMax H3）

---

## Directory Structure / 目录结构

```
ComfyUI-Openkit/
├── __init__.py              # Plugin entry / 插件入口，注册节点映射
├── nodes/
│   ├── __init__.py          # Node class & display name mappings / 节点类与显示名映射
│   ├── json_extractor.py    # JsonExtractor implementation / JSON 提取节点
│   ├── multiframe_ref.py    # MultiframeRef implementation / 多帧参考节点
│   ├── choose_image.py      # ChooseImage implementation / 筛选图像节点
│   ├── subject_ref_tag_replacement.py  # SubjectRefTagReplacement / 主体标签置换节点
│   ├── media_loader.py      # MediaLoader implementation / 素材加载节点
│   ├── media_io.py          # Image/video/audio decoding helpers / 图/视频/音频解码辅助
│   └── media_routes.py      # Upload/probe/preset HTTP routes / 上传/探测/预设服务路由
├── web/
│   └── js/
│       ├── multiframe_ref.js  # Frontend dynamic input expansion / 前端动态输入扩展
│       ├── media_loader.js    # Media loader panel / 素材加载面板
│       ├── tab_string_multiline.js  # Multi-tab string editor / 多Tab字符串编辑器
│       └── multi_segment_prompt_editor.js  # Visual prompt editor / 可视化提示词编辑器
├── tests/
│   ├── test_media_loader.py # Loader logic tests / 加载节点逻辑测试
│   └── test_package_load.py # Package registration test / 插件包注册测试
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

## Acknowledgments / 特别鸣谢

<span style="color:#FFD700;">

- **https://github.com/yuan-SiO2/ComfyUI-Yuan-Tool.git**
- **https://github.com/oufeixinxinren/ComfyUI-MiniMax-ContextIR.git**

特别鸣谢上述插件的作者，Openkit 开放插件部分节点是在各位大佬优秀设计的基础之上进行再次创作，欢迎大家尽情享用。

Special thanks to the authors of the above plugins. Some nodes of the Openkit plugin are recreated based on the excellent designs of these great developers. Everyone is welcome to enjoy.

</span>

---

## License / 许可协议

本项目采用 **木兰宽松许可证第2版（Mulan Permissive Software License, Version 2, MulanPSL-2.0）**。
This project is licensed under the **Mulan Permissive Software License, Version 2 (MulanPSL-2.0)**.

- 可自由使用、复制、修改、合并、发布、分发、再许可和销售本软件
- 必须在所有副本中包含版权声明和许可声明
- 本软件按"原样"提供，不提供任何明示或暗示的保证

See [LICENSE](LICENSE) for full text. / 完整条款见 [LICENSE](LICENSE) 文件。
