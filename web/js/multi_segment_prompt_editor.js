/* MultiSegmentPromptEditor — 多段提示词可视化编辑节点（前端扩展 · 多级Tab版）
 *
 * 基于 H3 六段式提示词 JSON 结构的可视化编辑器：
 *  - 顶层 7 大模块以 Tab 切换：整体风格 / 角色档案 / 音色档案 / 道具档案 / 场景档案 / 关键帧档案 / 分镜序列；
 *  - 列表型模块（角色/音色/道具/场景/关键帧档案）采用二级子 Tab 页，每条一个 Tab，点击「+」添加、「×」删除（二次确认）；
 *  - 分镜序列采用二级子 Tab 页，每个分镜一个 Tab；分镜内「运镜」采用三级子 Tab 页；
 *  - 分镜类型字段为下拉框（文戏/武戏）+ 秒数下拉框（5-12秒），组合为"文戏：10秒"；
 *  - 整体风格文本框自适应节点面板大小并随缩放适配；
 *  - 最细粒度字段全部为多行文本框；用户完全不接触原始 JSON。
 *
 * 数据模型（node._data）与 JSON 完全一致。
 * 原生 widget（prompt_json）被隐藏，值通过隐藏 widget 序列化。
 */
import { app } from "../../../scripts/app.js";
import { OKT } from "./openkit_i18n.js";
import { injectOpenkitUI, oktSurface } from "./openkit_ui.js";

const NODE_NAME = "MultiSegmentPromptEditor";

// 本文件只翻译 UI 操作文案（按钮/提示/占位符/校验错误/默认名）；
// JSON key 与 value（整体风格/角色档案/…/编号/类型/文戏/武戏等）为数据契约，绝不翻译。
const LANG_PAIRS = [
  ["Item {n}", "条目 {n}"],
  ["Click to switch; double-click to rename", "点击切换；双击编辑标题"],
  ["Delete this item", "删除该条目"],
  ["Add one", "添加一条"],
  ["Preview JSON", "预览 JSON"],
  ["Back to editor", "返回编辑"],
  ["Click to switch to JSON preview/edit mode; click again to return to visual editing",
    "点击切换到 JSON 预览/编辑模式，再次点击返回可视化编辑"],
  [", please fix it before switching back", "，请修正后再切换"],
  ["Cancel", "取消"],
  ["Confirm Delete", "确认删除"],
  ["JSON format error: {msg}", "JSON 格式错误：{msg}"],
  ["Root must be an object", "根节点必须是对象"],
  ["Shot #{n} lacks a valid number (编号)", "第 {n} 个分镜缺少有效编号"],
  ["Shot #{n} type format error (should be 「文戏：N秒」 or 「武戏：N秒」)",
    "第 {n} 个分镜类型格式错误（应为「文戏：N秒」或「武戏：N秒」）"],
  ["Shot #{n} duration {dur} out of range (must be 5-12s)",
    "第 {n} 个分镜秒数 {dur} 超出范围（必须为 5-12 秒）"],
  ["Shot #{n} is missing the type field", "第 {n} 个分镜缺少类型字段"],
  ["Duplicate shot numbers: {list}", "分镜编号重复：{list}"],
  ["Shot numbers not ascending: shot #{a} ({x}) ≥ shot #{b} ({y})",
    "分镜编号未按从小到大排列：第 {a} 个分镜编号 {x} ≥ 第 {b} 个分镜编号 {y}"],
  ["Shot validation failed: {detail}. Please fix it before switching back.",
    "分镜校验未通过：{detail}。请修正后再切换。"],
  ["Validate", "校验格式"],
  ["Validate whether the current JSON format is correct", "校验当前 JSON 格式是否正确"],
  ["Paste or edit the full JSON here…", "在此粘贴或编辑完整 JSON…"],
  ["Validation passed, data synced", "格式校验通过，数据已同步"],
  ["Enter {key} here…", "在此输入{key}…"],
  ["empty", "空"],
  ["Delete item #{n} ({label}) in 「{key}」? This cannot be undone.",
    "确定要删除「{key}」第 {n} 条（{label}）吗？\n删除后内容将丢失且不可恢复。"],
  ["Enter content of item #{n} ({key}) here…", "在此输入第 {n} 条{key}内容…"],
  ["untitled", "未命名"],
  ["Delete shot #{n} 「{title}」? All fields (including camera moves) will be lost and cannot be undone.",
    "确定要删除第 {n} 个分镜「{title}」吗？\n删除后所有字段（含运镜）将丢失且不可恢复。"],
  ["Shot {num}", "分镜{num}"],
  ["Number is auto-generated, not editable", "编号自动生成，不可编辑"],
  ["Enter shot title…", "输入分镜标题…"],
  ["Enter shot summary…", "输入分镜摘要…"],
  ["Camera moves (edit one by one)", "运镜（逐条编辑）"],
  ["Delete camera move #{n} ({label})? This cannot be undone.",
    "确定要删除第 {n} 条运镜（{label}）吗？\n删除后内容将丢失且不可恢复。"],
  ["Enter description of camera move #{n}…", "输入第 {n} 条运镜描述…"],
  ["Enter ambient sound description…", "输入环境音描述…"],
  ["Enter BGM description…", "输入BGM描述…"],
  ["Project {n}", "项目 {n}"],
  ["Add project", "添加项目"],
  ["Delete project", "删除项目"],
  ["Rename project (double-click tab title)", "双击项目 Tab 标题可重命名"],
  ["Delete project #{n} ({name})? All modules and shots inside will be lost and cannot be undone.",
    "确定要删除第 {n} 个项目「{name}」吗？\n项目内所有模块与分镜将丢失且不可恢复。"],
  ["Maximum {n} projects reached", "已达最多 {n} 个项目上限"],
  ["Enter project name…", "输入项目名称…"],
  ["untitled project", "未命名项目"],
];
OKT.addPairs(LANG_PAIRS);
const tr = (t, p) => OKT.tr(t, p);

const MODULES = [
  { key: "整体风格", type: "str" },
  { key: "角色档案", type: "list_str" },
  { key: "音色档案", type: "list_str" },
  { key: "道具档案", type: "list_str" },
  { key: "场景档案", type: "list_str" },
  { key: "关键帧档案", type: "list_str" },
  { key: "分镜序列", type: "list_shot" },
];

const SHOT_FIELDS = [
  { key: "编号", type: "int", label: "编号" },
  { key: "类型", type: "shot_type", label: "类型" },
  { key: "标题", type: "text", label: "标题" },
  { key: "摘要", type: "textarea", label: "摘要" },
  { key: "运镜", type: "list_str", label: "运镜" },
  { key: "环境音", type: "textarea", label: "环境音" },
  { key: "BGM", type: "textarea", label: "BGM" },
];

const SHOT_TYPES = ["文戏", "武戏"];
const SHOT_DURATIONS = [5, 6, 7, 8, 9, 10, 11, 12];

// 最外层项目 Tab 上限（与素材加载节点第一层 Tab 数量一致）
const MAX_PROJECT_TABS = 32;

const DEFAULT_SHOT = {
  "编号": 1, "类型": "文戏：10秒", "标题": "",
  "摘要": "", "运镜": [""], "环境音": "", "BGM": "",
};

const DEFAULT_DATA = {
  "整体风格": "",
  "角色档案": [""],
  "音色档案": [""],
  "道具档案": [""],
  "场景档案": [""],
  "关键帧档案": [""],
  "分镜序列": [Object.assign({}, DEFAULT_SHOT)],
};

/* ============ CSS ============ */
const CSS = `
.mspe-root{display:flex;flex-direction:column;gap:6px;width:100%;height:100%;
  min-height:0;box-sizing:border-box;padding:8px;background:var(--ok-bg);
  border:1px solid var(--ok-line);border-radius:8px;font-family:var(--ok-font);
  color:var(--ok-text);font-size:12px;overflow:hidden;}
.mspe-tabbar{display:flex;gap:2px;flex:0 0 auto;flex-wrap:wrap;align-items:center;
  border-bottom:1px solid var(--ok-line);padding-bottom:4px;}
.mspe-tab{display:inline-flex;align-items:center;gap:4px;
  background:var(--ok-panel-2);border:1px solid var(--ok-line-2);color:var(--ok-dim);border-radius:6px 6px 0 0;
  padding:4px 10px;font-size:11px;cursor:pointer;user-select:none;
  max-width:180px;}
.mspe-tab:hover{background:var(--ok-panel);color:var(--ok-text);}
.mspe-tab.active{background:var(--ok-accent-bg);color:var(--ok-accent);border-color:var(--ok-accent-2);border-bottom-color:var(--ok-accent-bg);}
.mspe-tab-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mspe-tab-idx{font-size:10px;color:var(--ok-dim);background:var(--ok-line);border-radius:3px;
  padding:0 4px;font-family:var(--ok-mono);flex:0 0 auto;}
.mspe-tab-x{flex:0 0 auto;margin-left:6px;font-size:11px;line-height:1;
  color:var(--ok-dim);padding:1px 3px;border-radius:3px;cursor:pointer;}
.mspe-tab-x:hover{color:var(--ok-err);background:var(--ok-line-2);}
.mspe-tab-add{display:inline-flex;align-items:center;justify-content:center;
  background:transparent;border:1px dashed var(--ok-line-2);color:var(--ok-dim);border-radius:6px;
  padding:4px 10px;font-size:13px;font-weight:600;cursor:pointer;flex:0 0 auto;}
.mspe-tab-add:hover{background:var(--ok-panel);color:var(--ok-text);border-color:var(--ok-line-2);}
/* 最外层项目 Tab 栏（层级高于模块 Tab，视觉区分） */
.mspe-projbar{display:flex;gap:3px;flex:0 0 auto;flex-wrap:wrap;align-items:center;
  padding:4px 6px;background:var(--ok-panel-2);border:1px solid var(--ok-line-2);
  border-radius:6px;}
.mspe-proj-tab{display:inline-flex;align-items:center;gap:5px;
  background:var(--ok-bg);border:1px solid var(--ok-line-2);color:var(--ok-dim);
  border-radius:5px;padding:4px 10px;font-size:12px;cursor:pointer;user-select:none;
  max-width:200px;transition:background .15s,color .15s,border-color .15s;}
.mspe-proj-tab:hover{background:var(--ok-panel);color:var(--ok-text);}
.mspe-proj-tab.active{background:var(--ok-accent-bg);color:var(--ok-accent);
  border-color:var(--ok-accent-2);font-weight:600;}
.mspe-proj-idx{font-size:10px;color:var(--ok-dim);background:var(--ok-line);
  border-radius:3px;padding:0 5px;font-family:var(--ok-mono);flex:0 0 auto;}
.mspe-proj-tab.active .mspe-proj-idx{background:var(--ok-accent-2);color:var(--ok-accent-bg);}
.mspe-proj-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mspe-proj-x{flex:0 0 auto;margin-left:4px;font-size:11px;line-height:1;
  color:var(--ok-dim);padding:1px 3px;border-radius:3px;cursor:pointer;}
.mspe-proj-x:hover{color:var(--ok-err);background:var(--ok-line-2);}
.mspe-proj-add{display:inline-flex;align-items:center;justify-content:center;
  background:transparent;border:1px dashed var(--ok-line-2);color:var(--ok-dim);
  border-radius:5px;padding:4px 12px;font-size:14px;font-weight:600;cursor:pointer;flex:0 0 auto;}
.mspe-proj-add:hover{background:var(--ok-panel);color:var(--ok-text);border-color:var(--ok-line-2);}
.mspe-proj-rename{width:140px;background:var(--ok-bg);color:var(--ok-text);
  border:1px solid var(--ok-accent-2);border-radius:4px;padding:2px 6px;
  font-size:12px;font-family:var(--ok-font);outline:none;}
.mspe-content{flex:1;min-height:120px;overflow-y:auto;overflow-x:hidden;
  display:flex;flex-direction:column;gap:8px;padding-top:6px;}
.mspe-textarea{width:100%;flex:1;min-height:80px;background:var(--ok-panel-2);color:var(--ok-text);
  border:1px solid var(--ok-line-2);border-radius:6px;padding:6px;font-size:12px;
  font-family:var(--ok-mono);resize:none;box-sizing:border-box;
  white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;
  overflow-y:auto;overflow-x:hidden;line-height:1.6;}
.mspe-textarea:focus{outline:none;border-color:var(--ok-accent-2);}
.mspe-textarea.fit{flex:1 1 auto;min-height:0;}
.mspe-textinput{width:100%;background:var(--ok-panel-2);color:var(--ok-text);border:1px solid var(--ok-line-2);
  border-radius:4px;padding:3px 6px;font-size:12px;font-family:var(--ok-mono);
  box-sizing:border-box;}
.mspe-textinput:focus{outline:none;border-color:var(--ok-accent-2);}
.mspe-intinput{width:70px;background:var(--ok-panel-2);color:var(--ok-text);border:1px solid var(--ok-line-2);
  border-radius:4px;padding:3px 6px;font-size:12px;font-family:var(--ok-mono);
  box-sizing:border-box;text-align:center;}
.mspe-intinput:focus{outline:none;border-color:var(--ok-accent-2);}
.mspe-select{background:var(--ok-panel-2);color:var(--ok-text);border:1px solid var(--ok-line-2);
  border-radius:4px;padding:3px 6px;font-size:12px;font-family:var(--ok-mono);
  box-sizing:border-box;cursor:pointer;}
.mspe-select:focus{outline:none;border-color:var(--ok-accent-2);}
.mspe-field-row{display:flex;flex-direction:column;gap:2px;margin-bottom:6px;}
.mspe-field-row.inline{flex-direction:row;align-items:center;gap:8px;}
.mspe-field-label{font-size:11px;color:var(--ok-dim);letter-spacing:.02em;
  display:flex;align-items:center;gap:4px;flex:0 0 auto;}
.mspe-section-label{font-size:11px;color:var(--ok-dim);margin:4px 0 2px;letter-spacing:.03em;
  border-left:3px solid var(--ok-line-2);padding-left:6px;}
.mspe-empty{color:var(--ok-dim);font-size:12px;padding:16px;text-align:center;
  border:1px dashed var(--ok-line);border-radius:6px;}
.mspe-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;
  display:flex;align-items:center;justify-content:center;}
.mspe-modal-box{background:var(--ok-panel-2);border:1px solid var(--ok-line-2);border-radius:8px;
  padding:16px 18px;min-width:280px;max-width:420px;box-shadow:0 8px 30px rgba(0,0,0,.5);}
.mspe-modal-msg{color:var(--ok-text);font-size:13px;line-height:1.6;margin-bottom:14px;
  white-space:pre-wrap;word-break:break-all;}
.mspe-modal-btns{display:flex;justify-content:flex-end;gap:8px;}
.mspe-modal-btn{background:var(--ok-panel);border:1px solid var(--ok-line);color:var(--ok-text);
  border-radius:var(--ok-radius);padding:5px 14px;font-size:12px;cursor:pointer;
  font-family:var(--ok-font);transition:background var(--ok-transition), border-color var(--ok-transition);}
.mspe-modal-btn:hover{background:var(--ok-panel-2);}
.mspe-modal-btn.ok{background:#8b3a3a;border-color:#b05252;color:#fff;}
.mspe-modal-btn.ok:hover{background:#a04545;}
.mspe-shot-type-row{display:flex;align-items:center;gap:6px;}
.mspe-colon{color:var(--ok-dim);font-size:12px;}
.mspe-toolbar{display:flex;align-items:center;justify-content:space-between;
  gap:6px;flex:0 0 auto;margin-bottom:2px;}
.mspe-preview-btn{background:var(--ok-panel);border:1px solid var(--ok-line);color:var(--ok-text);
  border-radius:var(--ok-radius);padding:4px 12px;font-size:11px;cursor:pointer;flex:0 0 auto;
  font-family:var(--ok-font);transition:background var(--ok-transition), border-color var(--ok-transition);}
.mspe-preview-btn:hover{background:var(--ok-panel-2);border-color:var(--ok-line-2);}
.mspe-preview-btn.active{background:#3a5a40;border-color:#4a7c59;color:#fff;}
.mspe-preview-textarea{width:100%;flex:1;min-height:0;background:#0d1015;
  color:#c8d5c8;border:1px solid var(--ok-line);border-radius:6px;padding:8px;
  font-size:11px;font-family:var(--ok-mono);resize:none;
  box-sizing:border-box;white-space:pre-wrap;overflow-wrap:break-word;
  word-break:break-word;overflow-y:auto;overflow-x:hidden;line-height:1.6;
  height:100%;}
.mspe-preview-textarea:focus{outline:none;border-color:#4a7c59;}
.mspe-preview-textarea.error{border-color:#b05252;background:#1a0d0d;}
.mspe-preview-toolbar{display:flex;align-items:center;gap:8px;flex:0 0 auto;
  margin-bottom:4px;}
.mspe-validate-btn{background:#2b4a3a;border:1px solid #3a6b4a;color:#a8d5a8;
  border-radius:var(--ok-radius);padding:4px 12px;font-size:11px;cursor:pointer;
  font-family:var(--ok-font);flex:0 0 auto;}
.mspe-validate-btn:hover{background:#335a45;border-color:#4a7c59;}
.mspe-validate-msg{font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;}
.mspe-validate-msg.ok{color:var(--ok-ok);}
.mspe-validate-msg.err{color:var(--ok-err);}
.mspe-validate-msg.warn{color:var(--ok-warn);}
.mspe-tab-rename{width:120px;background:var(--ok-panel-2);color:var(--ok-text);
  border:1px solid var(--ok-line-2);border-radius:4px;padding:1px 4px;font-size:11px;
  box-sizing:border-box;font-family:var(--ok-font);}
.mspe-edit-dialog{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;
  display:flex;align-items:center;justify-content:center;}
.mspe-edit-box{background:var(--ok-panel-2);border:1px solid var(--ok-line-2);border-radius:8px;
  padding:14px 16px;min-width:400px;max-width:600px;width:80vw;
  box-shadow:0 8px 30px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:8px;}
.mspe-edit-title{color:var(--ok-text);font-size:13px;font-weight:500;}
.mspe-edit-textarea{width:100%;min-height:160px;background:var(--ok-panel-2);color:var(--ok-text);
  border:1px solid var(--ok-line-2);border-radius:6px;padding:6px;font-size:12px;
  font-family:var(--ok-mono);resize:vertical;box-sizing:border-box;
  white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;
  overflow-y:auto;overflow-x:hidden;line-height:1.6;}
.mspe-edit-textarea:focus{outline:none;border-color:var(--ok-accent-2);}
.mspe-edit-btns{display:flex;justify-content:flex-end;gap:8px;}
.mspe-num-display{display:inline-flex;align-items:center;justify-content:center;
  min-width:40px;background:var(--ok-panel-2);color:var(--ok-text);border:1px solid var(--ok-line-2);
  border-radius:4px;padding:3px 8px;font-size:12px;font-family:var(--ok-mono);
  box-sizing:border-box;cursor:default;user-select:none;}
`;

let cssDone = false;
function injectCSS() {
  if (cssDone) return;
  const s = document.createElement("style");
  s.textContent = CSS;
  document.head.append(s);
  cssDone = true;
}

/* ============ 工具函数 ============ */
function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function parseShotType(typeStr) {
  // 解析 "文戏：10秒" -> { category: "文戏", duration: 10 }
  if (!typeStr) return { category: "文戏", duration: 10 };
  const m = typeStr.match(/^(文戏|武戏)[：:]\s*(\d+)\s*秒?/);
  if (m) return { category: m[1], duration: parseInt(m[2], 10) };
  return { category: "文戏", duration: 10 };
}

function formatShotType(category, duration) {
  return category + "：" + duration + "秒";
}

function truncate(str, len) {
  if (!str) return "";
  const s = str.replace(/\n/g, " ").trim();
  return s.length > len ? s.slice(0, len) + "…" : s;
}

/* ============ 通用 Tab 栏构建 ============ */
/**
 * 构建一个 Tab 栏并返回控制对象。
 * @param {Object} opts
 *   items: 当前条目数组
 *   getLabel: (item, idx) => string  Tab 显示名（不含编号）
 *   getIdx: (item, idx) => string|number  自定义编号显示（默认数组索引+1）
 *   curIdx: 当前激活索引
 *   onSelect: (idx) => void
 *   onAdd: () => void
 *   onDelete: (idx) => void
 *   onRename: (idx, newName) => void  双击编辑标题回调
 *   showAdd / showDelete: boolean
 */
function buildTabBar(opts) {
  const bar = makeEl("div", "mspe-tabbar");
  const items = opts.items || [];
  items.forEach((item, i) => {
    const tab = makeEl("div", "mspe-tab" + (i === opts.curIdx ? " active" : ""));
    const idxVal = typeof opts.getIdx === "function" ? opts.getIdx(item, i) : (i + 1);
    const idxTag = makeEl("span", "mspe-tab-idx", "#" + idxVal);
    const nameEl = makeEl("span", "mspe-tab-name", opts.getLabel(item, i) || tr("条目 {n}", { n: i + 1 }));
    tab.append(idxTag, nameEl);
    tab.title = tr("点击切换；双击编辑标题");
    tab.addEventListener("click", (ev) => {
      ev.stopPropagation();
      opts.onSelect(i);
    });
    // 双击编辑标题（绑定在整个 tab 上，stopPropagation 防止 ComfyUI 画布拦截）
    if (typeof opts.onRename === "function") {
      tab.addEventListener("dblclick", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        // 如果点的是删除按钮则不触发
        if (ev.target.classList.contains("mspe-tab-x")) return;
        const inp = makeEl("input", "mspe-tab-rename");
        inp.value = opts.getLabel(item, i) || "";
        inp.maxLength = 60;
        nameEl.textContent = "";
        nameEl.append(inp);
        inp.focus();
        inp.select();
        const commit = () => {
          const v = inp.value.trim();
          opts.onRename(i, v);
        };
        inp.addEventListener("blur", commit);
        inp.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter") { inp.blur(); }
          else if (e.key === "Escape") { inp.value = opts.getLabel(item, i) || ""; inp.blur(); }
        });
        // 阻止 input 上的点击冒泡到 tab
        inp.addEventListener("click", (e) => e.stopPropagation());
        inp.addEventListener("dblclick", (e) => e.stopPropagation());
      });
    }
    if (opts.showDelete !== false) {
      const x = makeEl("span", "mspe-tab-x", "×");
      x.title = tr("删除该条目");
      x.addEventListener("click", (ev) => {
        ev.stopPropagation();
        opts.onDelete(i);
      });
      tab.append(x);
    }
    bar.append(tab);
  });
  if (opts.showAdd !== false) {
    const add = makeEl("div", "mspe-tab-add", "+");
    add.title = tr("添加一条");
    add.addEventListener("click", () => opts.onAdd());
    bar.append(add);
  }
  return bar;
}

/* ============ 注册扩展 ============ */
app.registerExtension({
  name: "Openkit.MultiSegmentPromptEditor",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      injectOpenkitUI();
      injectCSS();

      this._tabs = [{ name: tr("未命名项目"), data: deepClone(DEFAULT_DATA) }];
      this._activeTab = 0;
      this._data = this._tabs[0].data;
      this._curModule = 0;
      this._previewMode = false;
      // 各 list_str 模块的当前子项索引
      this._curItem = {};
      MODULES.forEach((m) => { if (m.type === "list_str") this._curItem[m.key] = 0; });
      this._curShot = 0;
      this._curMove = 0; // 当前分镜内的运镜索引

      // 隐藏原生 widget（tab_index 选择输出项目；prompt_json 存多项目结构）
      const tabIdxW = this.widgets?.find((w) => w.name === "tab_index");
      if (tabIdxW) {
        tabIdxW.hidden = true;
        tabIdxW.type = "hidden";
        tabIdxW.computeSize = () => [0, -4];
        tabIdxW.options = tabIdxW.options || {};
        tabIdxW.options.control_after_generate = "fixed";
      }
      const jsonW = this.widgets?.find((w) => w.name === "prompt_json");
      if (jsonW) {
        jsonW.hidden = true;
        jsonW.type = "hidden";
        jsonW.computeSize = () => [0, -4];
        jsonW.serializeValue = () => {
          this._syncJson();
          return jsonW.value;
        };
      }

      // 根容器
      const root = makeEl("div", "mspe-root");
      oktSurface(root);
      // 工具栏：预览按钮
      const toolbar = makeEl("div", "mspe-toolbar");
      const spacer = makeEl("div");
      spacer.style.flex = "1";
      const previewBtn = makeEl("button", "mspe-preview-btn", tr("预览 JSON"));
      previewBtn.title = tr("点击切换到 JSON 预览/编辑模式，再次点击返回可视化编辑");
      previewBtn.addEventListener("click", () => {
        if (this._previewMode) {
          // 从预览切回编辑：先校验 JSON 格式
          const ta = this._dom.content.querySelector(".mspe-preview-textarea");
          if (ta) {
            const result = this._validateJson(ta.value);
            if (!result.ok) {
              this._showValidateMsg("err", result.error + tr("，请修正后再切换"));
              return;
            }
            // 格式正确且编号无问题，更新数据（同步到当前项目）
            this._tabs[this._activeTab].data = result.data;
            this._data = result.data;
            this._syncJson();
          }
          this._previewMode = false;
          previewBtn.classList.remove("active");
          previewBtn.textContent = tr("预览 JSON");
        } else {
          this._previewMode = true;
          previewBtn.classList.add("active");
          previewBtn.textContent = tr("返回编辑");
        }
        this._renderContent();
      });
      toolbar.append(spacer, previewBtn);
      const projectTabbar = makeEl("div", "mspe-projbar");
      const topTabbar = makeEl("div", "mspe-tabbar");
      const content = makeEl("div", "mspe-content");
      root.append(toolbar, projectTabbar, topTabbar, content);

      const domWidget = this.addDOMWidget("mspe_panel", "div", root, {
        getMinHeight: () => 360,
        getMaxHeight: () => undefined,
        getHeight: () => Math.max(360, (this.size?.[1] || 0) - 34),
        hideOnZoom: false,
        serialize: false,
      });
      domWidget.computeLayoutSize = () => {
        const nw = Math.max(440, this.size?.[0] || 440);
        const nh = Math.max(400, (this.size?.[1] || 0) - 34);
        return {
          minHeight: 400, minWidth: 440,
          maxHeight: 100000, maxWidth: 100000,
          preferredWidth: nw,   // 关键：驱动 .dom-widget 宽度随节点缩放，缺省退化 width:0 塌缩
          preferredHeight: nh,  // 关键：高度随节点高度，面板内容 flex 自适应
        };
      };
      // 关键根治：ComfyUI 布局可能把 widget.width 误设成极小值导致面板塌缩；
      // 用 getter 恒返回节点宽度，读时永远正确、写时忽略，彻底消除塌缩。
      Object.defineProperty(domWidget, "width", {
        configurable: true,
        get: () => Math.max(440, this.size?.[0] || 440),
        set: () => {},
      });
      domWidget.beforeQueued = () => { this._syncJson(); };
      this.size[0] = Math.max(440, this.size[0] || 0);
      this.size[1] = Math.max(400, this.size[1] || 0);

      this._dom = { root, toolbar, previewBtn, projectTabbar, topTabbar, content };

      /* ---- 二次确认 ---- */
      this._confirm = (msg, onOk) => {
        const ov = makeEl("div", "mspe-modal");
        const box = makeEl("div", "mspe-modal-box");
        const m = makeEl("div", "mspe-modal-msg", msg);
        const btns = makeEl("div", "mspe-modal-btns");
        const cancel = makeEl("button", "mspe-modal-btn", tr("取消"));
        const ok = makeEl("button", "mspe-modal-btn ok", tr("确认删除"));
        const close = () => ov.remove();
        cancel.addEventListener("click", close);
        ok.addEventListener("click", () => { close(); onOk(); });
        btns.append(cancel, ok);
        box.append(m, btns);
        ov.append(box);
        document.body.append(ov);
      };

      /* ---- 同步 JSON（序列化多项目结构） ---- */
      this._syncJson = () => {
        const w = this.widgets?.find((x) => x.name === "prompt_json");
        if (w) {
          const state = {
            tabs: this._tabs.map((t) => ({ name: t.name, data: t.data })),
            active: this._activeTab,
          };
          w.value = JSON.stringify(state, null, 2);
        }
      };

      /* ---- 最外层项目 Tab 渲染与操作 ---- */
      this._renderProjectTabs = () => {
        const bar = this._dom.projectTabbar;
        if (!bar) return;
        bar.innerHTML = "";
        this._tabs.forEach((t, idx) => {
          const tab = makeEl("div", "mspe-proj-tab" + (idx === this._activeTab ? " active" : ""));
          tab.title = tr("双击项目 Tab 标题可重命名");
          const idxEl = makeEl("span", "mspe-proj-idx", String(idx + 1));
          const nameEl = makeEl("span", "mspe-proj-name", t.name || tr("未命名项目"));
          nameEl.style.flex = "1 1 auto";
          nameEl.style.minWidth = "0";
          const x = makeEl("span", "mspe-proj-x", "×");
          x.title = tr("删除项目");
          x.addEventListener("click", (e) => {
            e.stopPropagation();
            this._deleteProject(idx);
          });
          nameEl.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            this._renameProject(idx, nameEl);
          });
          tab.addEventListener("click", () => this._switchProject(idx));
          tab.append(idxEl, nameEl, x);
          bar.append(tab);
        });
        const add = makeEl("div", "mspe-proj-add", "+");
        add.title = tr("添加项目");
        add.addEventListener("click", () => this._addProject());
        bar.append(add);
      };

      this._switchProject = (idx) => {
        if (idx === this._activeTab || idx < 0 || idx >= this._tabs.length) return;
        this._activeTab = idx;
        this._data = this._tabs[idx].data;
        this._curModule = 0;
        this._previewMode = false;
        if (this._dom?.previewBtn) {
          this._dom.previewBtn.classList.remove("active");
          this._dom.previewBtn.textContent = tr("预览 JSON");
        }
        MODULES.forEach((m) => { if (m.type === "list_str") this._curItem[m.key] = 0; });
        this._curShot = 0;
        this._curMove = 0;
        this._syncJson();
        this._renderProjectTabs();
        this._renderTopTabs();
        this._renderContent();
      };

      this._addProject = () => {
        if (this._tabs.length >= MAX_PROJECT_TABS) {
          this._showValidateMsg("err", tr("已达最多 {n} 个项目上限", { n: MAX_PROJECT_TABS }));
          return;
        }
        const n = this._tabs.length + 1;
        this._tabs.push({ name: tr("项目 {n}", { n }), data: deepClone(DEFAULT_DATA) });
        this._switchProject(this._tabs.length - 1);
      };

      this._deleteProject = (idx) => {
        if (this._tabs.length <= 1) return; // 至少保留一个
        const t = this._tabs[idx];
        this._confirm(
          tr("确定要删除第 {n} 个项目「{name}」吗？\n项目内所有模块与分镜将丢失且不可恢复。",
             { n: idx + 1, name: t.name || tr("未命名项目") }),
          () => {
            this._tabs.splice(idx, 1);
            if (this._activeTab >= this._tabs.length) this._activeTab = this._tabs.length - 1;
            if (this._activeTab < 0) this._activeTab = 0;
            this._data = this._tabs[this._activeTab].data;
            this._curModule = 0;
            MODULES.forEach((m) => { if (m.type === "list_str") this._curItem[m.key] = 0; });
            this._curShot = 0;
            this._curMove = 0;
            this._syncJson();
            this._renderProjectTabs();
            this._renderTopTabs();
            this._renderContent();
          }
        );
      };

      this._renameProject = (idx, nameEl) => {
        const t = this._tabs[idx];
        const input = makeEl("input", "mspe-proj-rename");
        input.value = t.name || "";
        input.placeholder = tr("输入项目名称…");
        nameEl.replaceWith(input);
        input.focus();
        input.select();
        const commit = () => {
          const v = input.value.trim();
          t.name = v || tr("未命名项目");
          this._syncJson();
          this._renderProjectTabs();
        };
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); input.blur(); }
          else if (e.key === "Escape") { input.value = t.name || ""; input.blur(); }
        });
      };

      /* ---- JSON 校验（含分镜编号重复/顺序检查，编号问题等同格式错误） ---- */
      this._validateJson = (text) => {
        // 1. 格式校验
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          return { ok: false, error: tr("JSON 格式错误：{msg}", { msg: e.message }) };
        }
        if (typeof data !== "object" || data === null || Array.isArray(data)) {
          return { ok: false, error: tr("根节点必须是对象") };
        }

        // 2. 分镜序列检查（编号重复/顺序/类型秒数范围，问题等同格式错误）
        const shots = data["分镜序列"];
        if (Array.isArray(shots) && shots.length > 0) {
          const nums = [];
          const problems = [];
          shots.forEach((s, i) => {
            // 编号检查
            const n = s ? parseInt(s["编号"], 10) : NaN;
            if (Number.isNaN(n)) {
              problems.push(tr("第 {n} 个分镜缺少有效编号", { n: i + 1 }));
            } else {
              nums.push({ idx: i, num: n });
            }
            // 类型字段秒数范围检查（5-12秒，与下拉框一致）
            if (s && typeof s["类型"] === "string") {
              const parsed = parseShotType(s["类型"]);
              if (parsed.category !== "文戏" && parsed.category !== "武戏") {
                problems.push(tr("第 {n} 个分镜类型格式错误（应为「文戏：N秒」或「武戏：N秒」）", { n: i + 1 }));
              } else if (parsed.duration < 5 || parsed.duration > 12) {
                problems.push(tr("第 {n} 个分镜秒数 {dur} 超出范围（必须为 5-12 秒）",
                  { n: i + 1, dur: parsed.duration }));
              }
            } else if (s) {
              problems.push(tr("第 {n} 个分镜缺少类型字段", { n: i + 1 }));
            }
          });

          // 编号重复检查
          const seen = {};
          const dups = [];
          nums.forEach((item) => {
            if (seen[item.num]) dups.push(item.num);
            seen[item.num] = true;
          });
          if (dups.length > 0) {
            problems.push(tr("分镜编号重复：{list}", { list: dups.join("、") }));
          }

          // 编号顺序检查
          for (let i = 1; i < nums.length; i++) {
            if (nums[i].num <= nums[i - 1].num) {
              problems.push(tr("分镜编号未按从小到大排列：第 {a} 个分镜编号 {x} ≥ 第 {b} 个分镜编号 {y}",
                { a: nums[i - 1].idx + 1, x: nums[i - 1].num, b: nums[i].idx + 1, y: nums[i].num }));
              break;
            }
          }

          if (problems.length > 0) {
            return { ok: false, error: tr("分镜校验未通过：{detail}。请修正后再切换。",
              { detail: problems.join("；") }) };
          }
        }

        return { ok: true, data: data };
      };

      /* ---- 显示校验提示（type: ok / warn / err） ---- */
      this._showValidateMsg = (type, msg) => {
        const el = this._dom.content.querySelector(".mspe-validate-msg");
        if (el) {
          el.textContent = msg;
          el.className = "mspe-validate-msg " + type;
        }
        const ta = this._dom.content.querySelector(".mspe-preview-textarea");
        if (ta) {
          ta.classList.toggle("error", type === "err");
        }
      };

      /* ---- 渲染顶层 Tab ---- */
      this._renderTopTabs = () => {
        const bar = this._dom.topTabbar;
        bar.innerHTML = "";
        MODULES.forEach((m, i) => {
          const tab = makeEl("div", "mspe-tab" + (i === this._curModule ? " active" : ""));
          tab.textContent = m.key;
          tab.title = m.key;
          tab.addEventListener("click", () => {
            this._curModule = i;
            this._renderTopTabs();
            this._renderContent();
          });
          bar.append(tab);
        });
      };

      /* ---- 渲染内容区 ---- */
      this._renderContent = () => {
        const c = this._dom.content;
        c.innerHTML = "";

        // 预览/编辑 JSON 模式
        if (this._previewMode) {
          this._dom.topTabbar.style.display = "none";
          // 工具栏：校验按钮 + 提示信息
          const ptoolbar = makeEl("div", "mspe-preview-toolbar");
          const validateBtn = makeEl("button", "mspe-validate-btn", tr("校验格式"));
          validateBtn.title = tr("校验当前 JSON 格式是否正确");
          const msgEl = makeEl("span", "mspe-validate-msg", "");
          ptoolbar.append(validateBtn, msgEl);
          // 可编辑文本框
          const ta = makeEl("textarea", "mspe-preview-textarea");
          ta.spellcheck = false;
          ta.value = JSON.stringify(this._data, null, 2);
          ta.placeholder = tr("在此粘贴或编辑完整 JSON…");
          validateBtn.addEventListener("click", () => {
            const result = this._validateJson(ta.value);
            if (!result.ok) {
              this._showValidateMsg("err", result.error);
            } else {
              this._tabs[this._activeTab].data = result.data;
              this._data = result.data;
              this._syncJson();
              this._showValidateMsg("ok", tr("格式校验通过，数据已同步"));
            }
          });
          c.append(ptoolbar, ta);
          return;
        }

        // 编辑模式：显示顶层 Tab 栏
        this._dom.topTabbar.style.display = "";
        const mod = MODULES[this._curModule];
        const data = this._data;

        if (mod.type === "str") {
          this._renderStrModule(c, mod.key, data[mod.key]);
        } else if (mod.type === "list_str") {
          this._renderListStrModule(c, mod.key, data[mod.key]);
        } else if (mod.type === "list_shot") {
          this._renderListShotModule(c, data[mod.key]);
        }
      };

      /* ---- 整体风格：自适应大文本框 ---- */
      this._renderStrModule = (container, key, value) => {
        const label = makeEl("div", "mspe-field-label", key);
        const ta = makeEl("textarea", "mspe-textarea fit");
        ta.value = value || "";
        ta.placeholder = tr("在此输入{key}…", { key });
        ta.spellcheck = false;
        ta.addEventListener("input", () => {
          this._data[key] = ta.value;
          this._syncJson();
        });
        container.append(label, ta);
      };

      /* ---- 列表型模块：二级子 Tab ---- */
      this._renderListStrModule = (container, key, list) => {
        if (!Array.isArray(list)) list = [];
        const curIdx = this._curItem[key] || 0;

        const tabbar = buildTabBar({
          items: list,
          curIdx: Math.min(curIdx, list.length - 1),
          getLabel: (item) => truncate(item, 16) || tr("空"),
          onSelect: (i) => {
            this._curItem[key] = i;
            this._renderContent();
          },
          onAdd: () => {
            this._data[key].push("");
            this._curItem[key] = this._data[key].length - 1;
            this._syncJson();
            this._renderContent();
          },
          onDelete: (i) => {
            if (this._data[key].length <= 1) return;
            const label = truncate(this._data[key][i], 20) || tr("空");
            this._confirm(
              tr("确定要删除「{key}」第 {n} 条（{label}）吗？\n删除后内容将丢失且不可恢复。",
                { key, n: i + 1, label }),
              () => {
                this._data[key].splice(i, 1);
                if (this._curItem[key] >= this._data[key].length) {
                  this._curItem[key] = this._data[key].length - 1;
                }
                this._syncJson();
                this._renderContent();
              });
          },
          onRename: (i, newName) => {
            if (newName) {
              this._data[key][i] = newName;
              this._syncJson();
            }
            this._renderContent();
          },
        });
        container.append(tabbar);

        const idx = Math.min(curIdx, list.length - 1);
        if (list.length > 0) {
          const ta = makeEl("textarea", "mspe-textarea fit");
          ta.value = list[idx] || "";
          ta.placeholder = tr("在此输入第 {n} 条{key}内容…", { n: idx + 1, key });
          ta.spellcheck = false;
          ta.addEventListener("input", () => {
            this._data[key][idx] = ta.value;
            this._syncJson();
            // 更新 Tab 标签
            const nameEl = tabbar.children[idx]?.querySelector(".mspe-tab-name");
            if (nameEl) nameEl.textContent = truncate(ta.value, 16) || tr("空");
          });
          container.append(ta);
        }
      };

      /* ---- 分镜序列：二级子 Tab + 分镜内容（含运镜三级 Tab） ---- */
      this._renderListShotModule = (container, shots) => {
        if (!Array.isArray(shots)) shots = [];
        const curIdx = Math.min(this._curShot, shots.length - 1);

        const tabbar = buildTabBar({
          items: shots,
          curIdx: curIdx,
          getIdx: (shot) => shot["编号"] || (curIdx + 1),
          getLabel: (shot) => truncate(shot["标题"], 14) || tr("未命名"),
          onSelect: (i) => {
            this._curShot = i;
            this._curMove = 0;
            this._renderContent();
          },
          onAdd: () => {
            const maxNum = shots.reduce((m, s) => Math.max(m, parseInt(s["编号"], 10) || 0), 0);
            const ns = deepClone(DEFAULT_SHOT);
            ns["编号"] = maxNum + 1;
            shots.push(ns);
            this._curShot = shots.length - 1;
            this._curMove = 0;
            this._syncJson();
            this._renderContent();
          },
          onDelete: (i) => {
            if (shots.length <= 1) return;
            const title = truncate(shots[i]["标题"], 20) || tr("未命名");
            this._confirm(
              tr("确定要删除第 {n} 个分镜「{title}」吗？\n删除后所有字段（含运镜）将丢失且不可恢复。",
                { n: shots[i]["编号"] || (i + 1), title }),
              () => {
                shots.splice(i, 1);
                if (this._curShot >= shots.length) this._curShot = shots.length - 1;
                this._curMove = 0;
                this._syncJson();
                this._renderContent();
              });
          },
          onRename: (i, newName) => {
            shots[i]["标题"] = newName || tr("分镜{num}", { num: shots[i]["编号"] || (i + 1) });
            this._syncJson();
            this._renderContent();
          },
        });
        container.append(tabbar);

        if (shots.length === 0) return;
        const shot = shots[curIdx];

        // 编号（只读，与 Tab 标题编号一致，自动显示不可编辑）
        const rowNum = makeEl("div", "mspe-field-row inline");
        rowNum.append(makeEl("div", "mspe-field-label", tr("编号")));
        const numDisplay = makeEl("span", "mspe-num-display", String(shot["编号"] ?? (curIdx + 1)));
        numDisplay.title = tr("编号自动生成，不可编辑");
        rowNum.append(numDisplay);
        container.append(rowNum);

        // 类型：文戏/武戏 下拉 + 秒数 5-12 下拉
        const rowType = makeEl("div", "mspe-field-row inline");
        rowType.append(makeEl("div", "mspe-field-label", tr("类型")));
        const typeWrap = makeEl("div", "mspe-shot-type-row");
        const parsed = parseShotType(shot["类型"]);
        const selCat = makeEl("select", "mspe-select");
        SHOT_TYPES.forEach((t) => {
          const opt = makeEl("option", null, t);
          opt.value = t;
          if (t === parsed.category) opt.selected = true;
          selCat.append(opt);
        });
        const colon = makeEl("span", "mspe-colon", "：");
        const selDur = makeEl("select", "mspe-select");
        SHOT_DURATIONS.forEach((d) => {
          const opt = makeEl("option", null, d + "秒");
          opt.value = String(d);
          if (d === parsed.duration) opt.selected = true;
          selDur.append(opt);
        });
        const updateType = () => {
          shot["类型"] = formatShotType(selCat.value, parseInt(selDur.value, 10));
          this._syncJson();
        };
        selCat.addEventListener("change", updateType);
        selDur.addEventListener("change", updateType);
        typeWrap.append(selCat, colon, selDur);
        rowType.append(typeWrap);
        container.append(rowType);

        // 标题
        const rowTitle = makeEl("div", "mspe-field-row");
        rowTitle.append(makeEl("div", "mspe-field-label", tr("标题")));
        const titleInp = makeEl("input", "mspe-textinput");
        titleInp.value = shot["标题"] || "";
        titleInp.placeholder = tr("输入分镜标题…");
        titleInp.addEventListener("input", () => {
          shot["标题"] = titleInp.value;
          this._syncJson();
          const nameEl = tabbar.children[curIdx]?.querySelector(".mspe-tab-name");
          if (nameEl) nameEl.textContent = truncate(titleInp.value, 14) || tr("未命名");
        });
        rowTitle.append(titleInp);
        container.append(rowTitle);

        // 摘要
        const rowSum = makeEl("div", "mspe-field-row");
        rowSum.append(makeEl("div", "mspe-field-label", tr("摘要")));
        const sumTa = makeEl("textarea", "mspe-textarea");
        sumTa.value = shot["摘要"] || "";
        sumTa.placeholder = tr("输入分镜摘要…");
        sumTa.spellcheck = false;
        sumTa.style.minHeight = "80px";
        sumTa.addEventListener("input", () => { shot["摘要"] = sumTa.value; this._syncJson(); });
        rowSum.append(sumTa);
        container.append(rowSum);

        // 运镜：三级子 Tab
        container.append(makeEl("div", "mspe-section-label", tr("运镜（逐条编辑）")));
        const moves = shot["运镜"] || [];
        if (!Array.isArray(moves) || moves.length === 0) {
          shot["运镜"] = [""];
        }
        const moveCur = Math.min(this._curMove, shot["运镜"].length - 1);
        const moveBar = buildTabBar({
          items: shot["运镜"],
          curIdx: moveCur,
          getLabel: (item) => truncate(item, 14) || "空",
          onSelect: (i) => {
            this._curMove = i;
            this._renderContent();
          },
          onAdd: () => {
            shot["运镜"].push("");
            this._curMove = shot["运镜"].length - 1;
            this._syncJson();
            this._renderContent();
          },
          onDelete: (i) => {
            if (shot["运镜"].length <= 1) return;
            const label = truncate(shot["运镜"][i], 20) || tr("空");
            this._confirm(
              tr("确定要删除第 {n} 条运镜（{label}）吗？\n删除后内容将丢失且不可恢复。",
                { n: i + 1, label }),
              () => {
                shot["运镜"].splice(i, 1);
                if (this._curMove >= shot["运镜"].length) {
                  this._curMove = shot["运镜"].length - 1;
                }
                this._syncJson();
                this._renderContent();
              });
          },
          onRename: (i, newName) => {
            if (newName) {
              shot["运镜"][i] = newName;
              this._syncJson();
            }
            this._renderContent();
          },
        });
        container.append(moveBar);
        const moveTa = makeEl("textarea", "mspe-textarea");
        moveTa.value = shot["运镜"][moveCur] || "";
        moveTa.placeholder = tr("输入第 {n} 条运镜描述…", { n: moveCur + 1 });
        moveTa.spellcheck = false;
        moveTa.style.minHeight = "100px";
        moveTa.addEventListener("input", () => {
          shot["运镜"][moveCur] = moveTa.value;
          this._syncJson();
          const nameEl = moveBar.children[moveCur]?.querySelector(".mspe-tab-name");
          if (nameEl) nameEl.textContent = truncate(moveTa.value, 14) || tr("空");
        });
        container.append(moveTa);

        // 环境音
        const rowEnv = makeEl("div", "mspe-field-row");
        rowEnv.append(makeEl("div", "mspe-field-label", tr("环境音")));
        const envTa = makeEl("textarea", "mspe-textarea");
        envTa.value = shot["环境音"] || "";
        envTa.placeholder = tr("输入环境音描述…");
        envTa.spellcheck = false;
        envTa.style.minHeight = "60px";
        envTa.addEventListener("input", () => { shot["环境音"] = envTa.value; this._syncJson(); });
        rowEnv.append(envTa);
        container.append(rowEnv);

        // BGM
        const rowBgm = makeEl("div", "mspe-field-row");
        rowBgm.append(makeEl("div", "mspe-field-label", tr("BGM")));
        const bgmTa = makeEl("textarea", "mspe-textarea");
        bgmTa.value = shot["BGM"] || "";
        bgmTa.placeholder = tr("输入BGM描述…");
        bgmTa.spellcheck = false;
        bgmTa.style.minHeight = "50px";
        bgmTa.addEventListener("input", () => { shot["BGM"] = bgmTa.value; this._syncJson(); });
        rowBgm.append(bgmTa);
        container.append(rowBgm);
      };

      /* ---- 从隐藏 widget 加载数据（多项目结构，兼容旧单 JSON 格式） ---- */
      this._load = () => {
        const jsonW = this.widgets?.find((x) => x.name === "prompt_json");
        let raw = {};
        try { raw = JSON.parse(jsonW?.value || "{}"); } catch (e) { raw = {}; }

        // 解析为项目列表：新格式 {tabs:[{name,data}], active:N}；旧格式为单个 JSON 对象
        let tabs, active;
        if (raw && typeof raw === "object" && Array.isArray(raw.tabs) && raw.tabs.length > 0) {
          tabs = raw.tabs.map((t) => {
            if (t && typeof t === "object") {
              return {
                name: typeof t.name === "string" ? t.name : tr("未命名项目"),
                data: t.data && typeof t.data === "object" ? t.data : {},
              };
            }
            return { name: tr("未命名项目"), data: {} };
          });
          active = (typeof raw.active === "number" && raw.active >= 0 && raw.active < tabs.length)
            ? raw.active : 0;
        } else {
          // 旧格式迁移：单个提示词 JSON → 单项目
          tabs = [{ name: tr("未命名项目"), data: raw && typeof raw === "object" ? raw : {} }];
          active = 0;
        }
        // 上限保护
        if (tabs.length > MAX_PROJECT_TABS) tabs = tabs.slice(0, MAX_PROJECT_TABS);
        if (active >= tabs.length) active = tabs.length - 1;

        // 规范化每个项目的 data
        const normalizeData = (data) => {
          const merged = deepClone(DEFAULT_DATA);
          for (const m of MODULES) {
            if (data[m.key] == null) continue;
            if (m.type === "str") {
              merged[m.key] = String(data[m.key]);
            } else if (m.type === "list_str") {
              if (Array.isArray(data[m.key])) {
                merged[m.key] = data[m.key].map((v) => (v == null ? "" : String(v)));
                if (merged[m.key].length === 0) merged[m.key] = [""];
              }
            } else if (m.type === "list_shot") {
              if (Array.isArray(data[m.key])) {
                merged[m.key] = data[m.key].map((s) => {
                  const shot = deepClone(DEFAULT_SHOT);
                  if (s && typeof s === "object") {
                    SHOT_FIELDS.forEach((f) => {
                      if (s[f.key] != null) {
                        if (f.type === "int") shot[f.key] = parseInt(s[f.key], 10) || 1;
                        else if (f.type === "list_str") {
                          shot[f.key] = Array.isArray(s[f.key])
                            ? s[f.key].map((v) => (v == null ? "" : String(v)))
                            : [""];
                        }
                        else shot[f.key] = String(s[f.key]);
                      }
                    });
                  }
                  return shot;
                });
                if (merged[m.key].length === 0) merged[m.key] = [deepClone(DEFAULT_SHOT)];
              }
            }
          }
          return merged;
        };

        this._tabs = tabs.map((t) => ({ name: t.name, data: normalizeData(t.data) }));
        this._activeTab = active;
        this._data = this._tabs[active].data;
        this._curModule = 0;
        this._previewMode = false;
        if (this._dom?.previewBtn) {
          this._dom.previewBtn.classList.remove("active");
          this._dom.previewBtn.textContent = tr("预览 JSON");
        }
        MODULES.forEach((m) => { if (m.type === "list_str") this._curItem[m.key] = 0; });
        this._curShot = 0;
        this._curMove = 0;
        this._renderProjectTabs();
        this._renderTopTabs();
        this._renderContent();
      };

      this._load();
      // 语言切换时：重设预览按钮文案并整体重渲染（数据契约内容不翻译）。
      this._mspeLocalize = () => {
        if (this._dom?.previewBtn) {
          this._dom.previewBtn.textContent = this._previewMode ? tr("返回编辑") : tr("预览 JSON");
          this._dom.previewBtn.title = tr("点击切换到 JSON 预览/编辑模式，再次点击返回可视化编辑");
        }
        this._renderProjectTabs();
        this._renderTopTabs();
        this._renderContent();
      };
      return r;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      setTimeout(() => {
        if (typeof this._load === "function") this._load();
      }, 0);
      return r;
    };
  },
});

// 全局语言切换联动：切换语言后刷新所有 MultiSegmentPromptEditor 节点。
window.addEventListener("openkit:langchange", () => {
  try {
    (app.graph?._nodes || []).forEach((n) => {
      if (n?.type !== NODE_NAME) return;
      if (typeof n._mspeLocalize === "function") n._mspeLocalize();
    });
    OKT.applyNodeTitles();
  } catch (e) { /* one node failing must not stop the rest */ }
});
