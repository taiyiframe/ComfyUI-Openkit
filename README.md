# ComfyUI-Openkit

Open, standardized ComfyUI utility node collection. No black-box encapsulation, every node is transparent and well-documented.

开放、规范的 ComfyUI 工具节点集合。无黑盒封装，每个节点均透明可控、文档完备。

---

## Features / 功能特性

- **JSON-driven prompt generation** — Extract structured data from JSON and generate MiniMax H3 six-part standard prompts
- **Multi-frame reference management** — Organize keyframes, image lists, and background layers with correct index ordering
- **Subject reference tag replacement** — Replace entity names with `<Subject N>` tags across all prompt sections
- **Multi-tab media loading** — Unlimited tabs of reference bundles (pictures/audios/videos, no media-count limits) with 3-column layout, trim, crop, soundtracks, presets
- **Multi-segment prompt visual editor** — Edit complex H3 JSON through hierarchical tabs, no raw JSON exposure
- **Unified original UI style** — Every node inherits ComfyUI native variables with an original "Openkit Lite" amber accent design (tokens: `openkit_ui.js`), consistent, adaptive, low-overhead
- **Full Chinese/English bilingual UI** — One-click language switch on every node (persisted), all static UI text localizes; JSON keys/values and your data are never touched
- **Extreme rendering performance** — Windowed virtual rendering (only visible cards exist in the DOM), container-level event delegation, lazy thumbnails, rAF-batched dimension-learning commits, and proactive media-buffer release keep memory and CPU minimal on unlimited media
- **Standard ComfyUI plugin structure** — Follows official conventions, easy to install and extend
- **Fully documented** — Every input, output, and internal logic is explained

- **JSON 驱动提示词生成** — 从 JSON 提取结构化数据，生成 MiniMax H3 六段式标准提示词
- **多帧参考管理** — 管理关键帧、图像列表与背景层，索引顺序正确
- **主体引用标签置换** — 在所有提示词段落中将实体名替换为 `<Subject N>` 标签
- **多 Tab 素材加载** — 不限 Tab 数量、参考素材（图片/音频/视频）数量无上限，三栏布局，支持裁剪、剪辑、音轨、预设
- **多段提示词可视化编辑** — 通过层级化 Tab 编辑复杂 H3 JSON，无需接触原始 JSON
- **统一原创 UI 风格** — 每个节点继承 ComfyUI 原生变量 + 原创「Openkit Lite」琥珀强调设计（tokens：`openkit_ui.js`），风格一致、自适应、低开销
- **全插件中英双语** — 每个节点一键切换语言（自动记忆），全部静态 UI 文案同步本地化；JSON 键/值与用户数据绝不翻译
- **极致渲染性能** — 窗口化虚拟渲染（DOM 中只存在可视区卡片）、容器级事件委托、缩略图懒加载、rAF 合并尺寸学习提交、重型媒体缓冲主动释放，素材无上限时内存与 CPU 占用极小
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

Loads reference-media sets across multiple tabs on a single node. Each added tab is one segment's complete, **independent** reference bundle with **no media-count limit** on pictures, videos, audios or soundtracks. Panel layout is three columns — **Pictures | Audio | Video** — each freely adding slots via a `+` button or drag-and-drop. Per-tab video trim, picture/video crop, soundtrack pairing, drag sorting, enable/disable, presets and tag display are all built in. Pictures carry a category (关键帧 / 角色 / 道具 / 场景) and an auto-assigned read-only number, sorted as 关键帧 → 角色 → 道具 → 场景.

单节点加载多 Tab 页参考素材集。每个 Tab 页 = 一个视频段完整、**独立**的参考素材集，**图片/视频/音频/音轨数量均无上限**。面板为三栏布局——**图片 | 音频 | 视频**，每栏通过 `+` 按钮或拖放自由增加槽位。内置每 Tab 视频剪辑、图片/视频裁剪、音轨配对、拖拽排序、开关、预设与标签显示。每张参考图带分类（关键帧 / 角色 / 道具 / 场景）和自动分配的只读编号，按 关键帧 → 角色 → 道具 → 场景 顺序排列。

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

- Unlimited tabs, each holding one segment's pictures / videos / audios, **independent limits** / 不限 Tab 数量，每 Tab 独立存放图/视频/音频，**各自独立无上限**
- No per-tab capacity limit: add as many pictures, videos, audio clips as you need / 每 Tab 容量无上限：图片、视频、音频数量自由添加
- Three-column layout (Pictures | Audio | Video) with per-column `+` slot button / 三栏布局（图片 | 音频 | 视频），每栏 `+` 按钮添加槽位
- Tab add / delete / rename; add a tab with one click / Tab 增删/重命名，一键新增整套素材加载器
- Picture slot title bar: category dropdown + auto-assigned read-only number / 图片槽位顶部标题栏：分类下拉 + 自动分配只读编号
- Number auto-assignment: switching category picks first unused number in that category / 编号自适应：切换分类自动分配该分类下第一个未使用编号
- Video trim (start/end seconds) with preview / 视频剪辑（起止秒）带预览
- Picture & video crop (normalised rect, draggable) / 图片与视频裁剪（归一化矩形，可拖拽）
- Soundtrack routing per video: paired / standalone / off / 每个视频的音轨路由：配对 / 独立 / 关闭
- Drag sorting, enable/disable, delete, budget monitor / 拖拽排序、开关、删除、预算监控
- Presets: save / load / delete, stored in `ComfyUI/input/openkit/presets/media_loader/` / 预设：保存/加载/删除，存放在 `ComfyUI/input/openkit/presets/media_loader/`
- The splitter node (ReferenceSplitter) emits **4 category picture list ports** (关键帧 / 角色 / 道具 / 场景) plus **numbered per-item media ports** in the order 音频 → 视频 → 视频音轨. The backend declares fixed maximums (8 audios / 3 videos / 3 video soundtracks); the canvas shows only the ports that actually carry data, so the port count follows the uploaded media automatically / 拆分节点输出 **4 个分类图片列表端口**（关键帧 / 角色 / 道具 / 场景）+ 按编号的独立媒体端口，顺序为 音频 → 视频 → 视频音轨。后端声明固定上限（音频 8 / 视频 3 / 视频音轨 3）；画布上只显示实际有数据的端口，端口数随上传媒体自动增减

---

### 6. ReferenceSplitter (素材拆分)

Fan a `MEDIA_REFS` bundle out into **4 category picture list ports** (关键帧/角色/道具/场景) plus **numbered per-item media ports** in the order 音频 → 视频 → 视频音轨. The backend declares fixed maximums (8 audios / 3 videos / 3 video soundtracks); the canvas shows only the ports that actually carry data.

将 `MEDIA_REFS` bundle 拆分为 **4 个分类图片列表端口**（关键帧/角色/道具/场景）+ 按编号的独立媒体端口，顺序为 音频 → 视频 → 视频音轨。后端声明固定上限（音频 8 / 视频 3 / 视频音轨 3）；画布上只显示实际有数据的端口。

---

### 7. TabStringMultiline (多Tab字符串)

Multi-tab multiline string editor with add/delete tabs, double-click rename, and per-tab text content. Supports Tab-index linkage: can act as both a linkage source (Tab index output) and a linkage target (tab_index_in input).

多 Tab 多行字符串编辑器，支持增删 Tab、双击重命名、每 Tab 独立文本内容。支持 Tab 索引联动：既可作为联动源（Tab 索引输出），也可作为联动目标（`tab_index_in` 输入）。

**Inputs / 输入:**

| Port / 端口 | Type / 类型 | Description / 说明 |
|---|---|---|
| `Tab索引` | INT (widget) | Current tab index selector (0-based) / 当前 Tab 索引选择器（从 0 开始） |
| `tab_index_in` | INT (forceInput, optional) | Linkage input port. Sentinel default `-1` means "not connected"; when wired, the connected value takes precedence over the widget at runtime / 联动输入端口。默认 `-1` 为哨兵值表示未连线；连线后运行时以连线值为准（覆盖 widget） |

**Outputs / 输出:**

| Port / 端口 | Type / 类型 | Description / 说明 |
|---|---|---|
| `文本` | STRING | Text content of the currently selected tab / 当前选中 Tab 的文本内容 |
| `Tab索引` | INT | The effective tab index after clamping/fallback / 越界收敛后实际生效的 Tab 索引 |

**Tab Linkage / Tab 联动:**

- This node can be a **linkage source**: its `Tab索引` (INT) output can be wired to downstream multi-tab nodes' `tab_index_in`; clicking the "link switch" button broadcasts the index along the wire graph with loop protection and out-of-range clamping / 本节点可作联动源：`Tab索引`(INT) 输出可接下游多 Tab 节点的 `tab_index_in`；点击「联动切换」按钮沿连线图广播索引，带环路防护与越界钳制
- This node can also be a **linkage target**: wire an upstream node's `Tab索引` output to this node's `tab_index_in`; at runtime the wired value overrides the widget / 本节点也可作联动目标：将上游节点的 `Tab索引` 输出接到本节点 `tab_index_in`，运行时连线值覆盖 widget
- **MediaLoader note**: MediaLoader's Tab linkage is a visual switch (it mutates the widget value). At runtime the widget value is authoritative — the runtime always reads the widget, not a live broadcast / MediaLoader 的 Tab 联动为视觉切换（修改 widget 值）；运行时以 widget 值为准，不依赖实时广播

---

### 8. MultiSegmentPromptEditor (多段提示词可视化编辑)

Visual editor for complex H3 six-part JSON prompts. Seven top-level modules (整体风格 / 角色档案 / 音色档案 / 道具档案 / 场景档案 / 关键帧档案 / 分镜序列) edited through hierarchical tabs. Shot sequence supports type dropdown (文戏/武戏 × 5–12秒), three-level nested tabs for camera moves, JSON preview/edit with format validation, and auto numbering checks.

复杂 H3 六段式 JSON 提示词的可视化编辑器。七个顶层模块（整体风格 / 角色档案 / 音色档案 / 道具档案 / 场景档案 / 关键帧档案 / 分镜序列）通过层级化 Tab 编辑。分镜序列支持类型下拉框（文戏/武戏 × 5–12秒）、运镜三级嵌套 Tab、JSON 预览/编辑与格式校验、编号自动检查。

---

### 9. OpenkitMemoryCleanup (显存内存清理)

Combined VRAM and RAM cleanup node. Optionally offloads all models, clears VRAM cache (gc + soft_empty_cache + free_memory flag), cleans file cache, enumerates and trims process working sets on Windows, and trims malloc on Linux. Zero third-party dependencies.

合并 VRAM 与 RAM 清理为单一节点。可选卸载全部模型、清理显存缓存（gc + soft_empty_cache + free_memory flag）、清理文件缓存、Windows 上枚举并修剪进程工作集、Linux 上 malloc_trim。零第三方依赖。

---

### 10. OpenkitExecutionTime (执行时间统计)

Virtual node that displays a per-node execution time and peak VRAM delta table with a draggable top floating timer. Patches `execution.execute` at the wrapper entry to record start time across all branches (including cache hits), and supports CSV export.

虚拟节点，展示各节点执行耗时与峰值显存增量对比表，带可拖动顶部悬浮总计时器。在 `execution.execute` 包装器入口记录开始时间，覆盖所有分支（含缓存命中），支持导出 CSV。

---

## Installation / 安装方法

### Method 1: Git Clone / 方法一：Git 克隆

```bash
cd ComfyUI/custom_nodes/
git clone https://github.com/taiyiframe/ComfyUI-Openkit.git
# or Gitee mirror: https://gitee.com/taiyiframe/ComfyUI-Openkit.git
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
│   ├── get_image.py         # ChooseImage implementation / 筛选图像节点
│   ├── subject_ref_tag_replacement.py  # SubjectRefTagReplacement / 主体标签置换节点
│   ├── media_loader.py      # MediaLoader + ReferenceSplitter / 素材加载与拆分节点
│   ├── tab_string_multiline.py  # TabStringMultiline / 多Tab字符串节点
│   ├── multi_segment_prompt_editor.py  # MultiSegmentPromptEditor / 多段提示词编辑器节点
│   ├── execution_time.py    # OpenkitExecutionTime / 执行时间统计节点
│   ├── memory_cleanup.py    # OpenkitMemoryCleanup / 显存内存清理节点
│   ├── media_io.py          # Image/video/audio decoding helpers / 图/视频/音频解码辅助
│   └── media_routes.py      # Upload/probe/preset HTTP routes / 上传/探测/预设服务路由
├── web/
│   └── js/
│       ├── openkit_i18n.js    # Unified EN/CN i18n module / 统一中英双语模块
│       ├── openkit_ui.js      # Lite Design tokens / 原创 UI 设计令牌
│       ├── multiframe_ref.js  # Frontend dynamic input expansion / 前端动态输入扩展
│       ├── media_loader.js    # Media loader panel / 素材加载面板
│       ├── json_extractor_control.js  # Index-control dropdown i18n / 索引控制下拉本地化
│       ├── tab_string_multiline.js  # Multi-tab string editor / 多Tab字符串编辑器
│       └── multi_segment_prompt_editor.js  # Visual prompt editor / 可视化提示词编辑器
├── tests/
│   ├── test_media_loader.py # Loader/splitter logic tests / 加载拆分节点逻辑测试
│   ├── test_package_load.py # Package registration test / 插件包注册测试
│   └── test_all_nodes.py    # All-nodes regression tests / 全节点回归测试
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
