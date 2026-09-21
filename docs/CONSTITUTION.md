# ComfyUI-Openkit 设计宪法

> 本文件是项目最高约束，所有代码与文档变更必须遵守。

## 一、项目定位

- **目标**：ComfyUI 通用素材加载器（轻量、零第三方依赖、纯 stdlib）
- **核心价值**：素材无上限 + 编号双轨制 + 三栏布局 + 性能链路
- **许可证**：MulanPSL-2.0
- **当前节点**：8 个（JsonExtractor / MultiframeRef / ChooseImage / SubjectRefTagReplacement / MediaLoader / ReferenceSplitter / TabStringMultiline / MultiSegmentPromptEditor）+ 1 个未完成（ExecutionTime，重构后置）

## 二、目录结构（工程化标准）

```
ComfyUI-Openkit/
├── nodes/              # 后端节点（Python）
├── web/js/            # 前端脚本（JavaScript / LiteGraph 扩展）
├── tests/             # 测试（gitignore，不发布）
├── docs/              # 工程化文档
│   ├── evaluation/    # 技术评估报告
│   ├── design/        # 设计文档与节点规划
│   └── process/       # 开发流程规范
├── arch/              # 历史资料库归档（gitignore）
├── __init__.py        # 插件入口（ComfyUI 加载时最先执行）
├── README.md
├── LICENSE
├── pyproject.toml
├── requirements.txt   # 空 = 纯 stdlib
├── CHANGELOG.md
└── AGENTS.md
```

## 三、工作流规则（强制）

### 3.1 代码修改路径

1. **主仓修改**：所有代码变更必须在 `D:\AIGC\001openkit`（git 仓库根）
2. **运行时同步**：改完后同步到 `D:\ComfyUI-20260916-045343\ComfyUI\custom_nodes\ComfyUI-Openkit`
3. **双平台推送**：
   - **Gitee**：前台推送，确认成功即完成
   - **GitHub**：发起推送动作，不等待结果（失败不重试、不追问）

### 3.2 推送规范

- **Gitee**（主仓）：`https://gitee.com/taiyiframe/ComfyUI-Openkit.git`
- **GitHub**（镜像）：`https://github.com/taiyiframe/ComfyUI-Openkit.git`
- **账号**：双平台统一 `taiyiframe`（旧 `dbmcp` 废弃）
- **commit 格式**：`type(scope): 中文描述`（feat/fix/docs/chore）

## 四、数据契约铁律

- JSON key / 值、文戏 / 武戏、分类名**不翻译**
- 静态 UI 文案才走 `openkit_i18n.js`
- Lite Design 统一色 `#F0F050`
- 新增节点必须同时实现前后端 + i18n

## 五、技术债（三专家 PK 裁决，2026-09-19）

### 阻断（B1-B3，已部分修复）
- ~~B1 detached HEAD~~（已回 master）
- ~~B2 gitee 明文 token~~（已改 taiyiframe，凭据存 Windows）
- **B3 venv312 损坏**（仍未修复，py_compile/tests/E2E 无法运行）

### 严重（S 系列，待还）
- S1 splitter "无上限"名实不符（静默截断第 4 路视频 / 第 9 路音频）
- S2 长媒体全量解码 OOM（无 max_frames cap）
- S3-S7 ExecutionTime 重构项（事件源 / 懒加载 / CUDA 账本 / prompt_id 隔离 / i18n / RAF 自停）

## 六、节点规划（证据型，~18 个）

- **冻结** v1.0 的 49 节点规划（无使用证据，会摧毁零依赖优势）
- **唯一新建方向** = P0 六节点（按序）：
  1. MemoryCleanup
  2. Constant
  3. H3Resolution
  4. H3ConcatAV
  5. SigmaRefiner
  6. PreviewOverride

## 七、版本管理

- semver：主版本.次版本.补丁
- 发布前必须：py_compile 通过 + 关键节点 E2E（test0830-提示词h3节点开发工作流）
- CHANGELOG.md 同步更新
