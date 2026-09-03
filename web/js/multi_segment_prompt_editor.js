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

const NODE_NAME = "MultiSegmentPromptEditor";

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
  min-height:0;box-sizing:border-box;padding:8px;background:#191c22;
  border:1px solid #2a2f3a;border-radius:8px;font-family:system-ui,sans-serif;
  color:#d7dbe2;font-size:12px;overflow:hidden;}
.mspe-tabbar{display:flex;gap:2px;flex:0 0 auto;flex-wrap:wrap;align-items:center;
  border-bottom:1px solid #2a2f3a;padding-bottom:4px;}
.mspe-tab{display:inline-flex;align-items:center;gap:4px;
  background:#232833;border:1px solid #2e3440;color:#8a93a3;border-radius:6px 6px 0 0;
  padding:4px 10px;font-size:11px;cursor:pointer;user-select:none;
  max-width:180px;}
.mspe-tab:hover{background:#2b3140;color:#c9cfda;}
.mspe-tab.active{background:#3a4252;color:#fff;border-color:#4a5568;border-bottom-color:#3a4252;}
.mspe-tab-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mspe-tab-idx{font-size:10px;color:#6b7280;background:#2a2f3a;border-radius:3px;
  padding:0 4px;font-family:ui-monospace,monospace;flex:0 0 auto;}
.mspe-tab-x{flex:0 0 auto;margin-left:6px;font-size:11px;line-height:1;
  color:#7b8494;padding:1px 3px;border-radius:3px;cursor:pointer;}
.mspe-tab-x:hover{color:#ff6b6b;background:#454f63;}
.mspe-tab-add{display:inline-flex;align-items:center;justify-content:center;
  background:transparent;border:1px dashed #3a4252;color:#8a93a3;border-radius:6px;
  padding:4px 10px;font-size:13px;font-weight:600;cursor:pointer;flex:0 0 auto;}
.mspe-tab-add:hover{background:#2b3140;color:#d7dbe2;border-color:#4a5568;}
.mspe-content{flex:1;min-height:120px;overflow-y:auto;overflow-x:hidden;
  display:flex;flex-direction:column;gap:8px;padding-top:6px;}
.mspe-textarea{width:100%;flex:1;min-height:80px;background:#12151b;color:#dde2ea;
  border:1px solid #2e3440;border-radius:6px;padding:6px;font-size:12px;
  font-family:ui-monospace,Consolas,monospace;resize:none;box-sizing:border-box;
  white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;
  overflow-y:auto;overflow-x:hidden;line-height:1.6;}
.mspe-textarea:focus{outline:none;border-color:#4a5568;}
.mspe-textarea.fit{flex:1 1 auto;min-height:0;}
.mspe-textinput{width:100%;background:#12151b;color:#dde2ea;border:1px solid #2e3440;
  border-radius:4px;padding:3px 6px;font-size:12px;font-family:ui-monospace,monospace;
  box-sizing:border-box;}
.mspe-textinput:focus{outline:none;border-color:#4a5568;}
.mspe-intinput{width:70px;background:#12151b;color:#dde2ea;border:1px solid #2e3440;
  border-radius:4px;padding:3px 6px;font-size:12px;font-family:ui-monospace,monospace;
  box-sizing:border-box;text-align:center;}
.mspe-intinput:focus{outline:none;border-color:#4a5568;}
.mspe-select{background:#12151b;color:#dde2ea;border:1px solid #2e3440;
  border-radius:4px;padding:3px 6px;font-size:12px;font-family:ui-monospace,monospace;
  box-sizing:border-box;cursor:pointer;}
.mspe-select:focus{outline:none;border-color:#4a5568;}
.mspe-field-row{display:flex;flex-direction:column;gap:2px;margin-bottom:6px;}
.mspe-field-row.inline{flex-direction:row;align-items:center;gap:8px;}
.mspe-field-label{font-size:11px;color:#8a93a3;letter-spacing:.02em;
  display:flex;align-items:center;gap:4px;flex:0 0 auto;}
.mspe-section-label{font-size:11px;color:#6b7280;margin:4px 0 2px;letter-spacing:.03em;
  border-left:3px solid #4a5568;padding-left:6px;}
.mspe-empty{color:#6b7280;font-size:12px;padding:16px;text-align:center;
  border:1px dashed #2a2f3a;border-radius:6px;}
.mspe-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;
  display:flex;align-items:center;justify-content:center;}
.mspe-modal-box{background:#232833;border:1px solid #4a5568;border-radius:8px;
  padding:16px 18px;min-width:280px;max-width:420px;box-shadow:0 8px 30px rgba(0,0,0,.5);}
.mspe-modal-msg{color:#dde2ea;font-size:13px;line-height:1.6;margin-bottom:14px;
  white-space:pre-wrap;word-break:break-all;}
.mspe-modal-btns{display:flex;justify-content:flex-end;gap:8px;}
.mspe-modal-btn{background:#2b3140;border:1px solid #3a4252;color:#d7dbe2;
  border-radius:6px;padding:5px 14px;font-size:12px;cursor:pointer;}
.mspe-modal-btn:hover{background:#333b4d;}
.mspe-modal-btn.ok{background:#8b3a3a;border-color:#b05252;color:#fff;}
.mspe-modal-btn.ok:hover{background:#a04545;}
.mspe-shot-type-row{display:flex;align-items:center;gap:6px;}
.mspe-colon{color:#8a93a3;font-size:12px;}
.mspe-toolbar{display:flex;align-items:center;justify-content:space-between;
  gap:6px;flex:0 0 auto;margin-bottom:2px;}
.mspe-preview-btn{background:#2b3140;border:1px solid #3a4252;color:#d7dbe2;
  border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;flex:0 0 auto;
  font-family:system-ui,sans-serif;}
.mspe-preview-btn:hover{background:#333b4d;border-color:#4a5568;}
.mspe-preview-btn.active{background:#3a5a40;border-color:#4a7c59;color:#fff;}
.mspe-preview-textarea{width:100%;flex:1;min-height:0;background:#0d1015;
  color:#c8d5c8;border:1px solid #2a2f3a;border-radius:6px;padding:8px;
  font-size:11px;font-family:ui-monospace,Consolas,monospace;resize:none;
  box-sizing:border-box;white-space:pre-wrap;overflow-wrap:break-word;
  word-break:break-word;overflow-y:auto;overflow-x:hidden;line-height:1.6;
  height:100%;}
.mspe-preview-textarea:focus{outline:none;border-color:#4a7c59;}
.mspe-preview-textarea.error{border-color:#b05252;background:#1a0d0d;}
.mspe-preview-toolbar{display:flex;align-items:center;gap:8px;flex:0 0 auto;
  margin-bottom:4px;}
.mspe-validate-btn{background:#2b4a3a;border:1px solid #3a6b4a;color:#a8d5a8;
  border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;
  font-family:system-ui,sans-serif;flex:0 0 auto;}
.mspe-validate-btn:hover{background:#335a45;border-color:#4a7c59;}
.mspe-validate-msg{font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;}
.mspe-validate-msg.ok{color:#52c41a;}
.mspe-validate-msg.err{color:#ff6b6b;}
.mspe-validate-msg.warn{color:#faad14;}
.mspe-tab-rename{width:120px;background:#12151b;color:#dde2ea;
  border:1px solid #4a5568;border-radius:4px;padding:1px 4px;font-size:11px;
  box-sizing:border-box;font-family:system-ui,sans-serif;}
.mspe-edit-dialog{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;
  display:flex;align-items:center;justify-content:center;}
.mspe-edit-box{background:#232833;border:1px solid #4a5568;border-radius:8px;
  padding:14px 16px;min-width:400px;max-width:600px;width:80vw;
  box-shadow:0 8px 30px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:8px;}
.mspe-edit-title{color:#dde2ea;font-size:13px;font-weight:500;}
.mspe-edit-textarea{width:100%;min-height:160px;background:#12151b;color:#dde2ea;
  border:1px solid #2e3440;border-radius:6px;padding:6px;font-size:12px;
  font-family:ui-monospace,Consolas,monospace;resize:vertical;box-sizing:border-box;
  white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;
  overflow-y:auto;overflow-x:hidden;line-height:1.6;}
.mspe-edit-textarea:focus{outline:none;border-color:#4a5568;}
.mspe-edit-btns{display:flex;justify-content:flex-end;gap:8px;}
.mspe-num-display{display:inline-flex;align-items:center;justify-content:center;
  min-width:40px;background:#12151b;color:#dde2ea;border:1px solid #2e3440;
  border-radius:4px;padding:3px 8px;font-size:12px;font-family:ui-monospace,monospace;
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
    const nameEl = makeEl("span", "mspe-tab-name", opts.getLabel(item, i) || ("条目 " + (i + 1)));
    tab.append(idxTag, nameEl);
    tab.title = "点击切换；双击编辑标题";
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
      x.title = "删除该条目";
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
    add.title = "添加一条";
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
      injectCSS();

      this._data = deepClone(DEFAULT_DATA);
      this._curModule = 0;
      this._previewMode = false;
      // 各 list_str 模块的当前子项索引
      this._curItem = {};
      MODULES.forEach((m) => { if (m.type === "list_str") this._curItem[m.key] = 0; });
      this._curShot = 0;
      this._curMove = 0; // 当前分镜内的运镜索引

      // 隐藏原生 widget
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
      // 工具栏：预览按钮
      const toolbar = makeEl("div", "mspe-toolbar");
      const spacer = makeEl("div");
      spacer.style.flex = "1";
      const previewBtn = makeEl("button", "mspe-preview-btn", "预览 JSON");
      previewBtn.title = "点击切换到 JSON 预览/编辑模式，再次点击返回可视化编辑";
      previewBtn.addEventListener("click", () => {
        if (this._previewMode) {
          // 从预览切回编辑：先校验 JSON 格式
          const ta = this._dom.content.querySelector(".mspe-preview-textarea");
          if (ta) {
            const result = this._validateJson(ta.value);
            if (!result.ok) {
              this._showValidateMsg("err", result.error + "，请修正后再切换");
              return;
            }
            // 格式正确且编号无问题，更新数据
            this._data = result.data;
            this._syncJson();
          }
          this._previewMode = false;
          previewBtn.classList.remove("active");
          previewBtn.textContent = "预览 JSON";
        } else {
          this._previewMode = true;
          previewBtn.classList.add("active");
          previewBtn.textContent = "返回编辑";
        }
        this._renderContent();
      });
      toolbar.append(spacer, previewBtn);
      const topTabbar = makeEl("div", "mspe-tabbar");
      const content = makeEl("div", "mspe-content");
      root.append(toolbar, topTabbar, content);

      const domWidget = this.addDOMWidget("mspe_panel", "div", root, {
        getMinHeight: () => 360,
        getMaxHeight: () => undefined,
        getHeight: () => Math.max(360, (this.size?.[1] || 0) - 34),
        hideOnZoom: false,
        serialize: false,
      });
      domWidget.computeLayoutSize = () => ({
        minHeight: 400, minWidth: 440,
        maxHeight: 100000, maxWidth: 100000,
      });
      domWidget.beforeQueued = () => { this._syncJson(); };
      this.size[0] = Math.max(440, this.size[0] || 0);
      this.size[1] = Math.max(400, this.size[1] || 0);

      this._dom = { root, toolbar, previewBtn, topTabbar, content };

      /* ---- 二次确认 ---- */
      this._confirm = (msg, onOk) => {
        const ov = makeEl("div", "mspe-modal");
        const box = makeEl("div", "mspe-modal-box");
        const m = makeEl("div", "mspe-modal-msg", msg);
        const btns = makeEl("div", "mspe-modal-btns");
        const cancel = makeEl("button", "mspe-modal-btn", "取消");
        const ok = makeEl("button", "mspe-modal-btn ok", "确认删除");
        const close = () => ov.remove();
        cancel.addEventListener("click", close);
        ok.addEventListener("click", () => { close(); onOk(); });
        btns.append(cancel, ok);
        box.append(m, btns);
        ov.append(box);
        document.body.append(ov);
      };

      /* ---- 同步 JSON ---- */
      this._syncJson = () => {
        const w = this.widgets?.find((x) => x.name === "prompt_json");
        if (w) w.value = JSON.stringify(this._data, null, 2);
      };

      /* ---- JSON 校验（含分镜编号重复/顺序检查，编号问题等同格式错误） ---- */
      this._validateJson = (text) => {
        // 1. 格式校验
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          return { ok: false, error: "JSON 格式错误：" + e.message };
        }
        if (typeof data !== "object" || data === null || Array.isArray(data)) {
          return { ok: false, error: "根节点必须是对象" };
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
              problems.push("第 " + (i + 1) + " 个分镜缺少有效编号");
            } else {
              nums.push({ idx: i, num: n });
            }
            // 类型字段秒数范围检查（5-12秒，与下拉框一致）
            if (s && typeof s["类型"] === "string") {
              const parsed = parseShotType(s["类型"]);
              if (parsed.category !== "文戏" && parsed.category !== "武戏") {
                problems.push("第 " + (i + 1) + " 个分镜类型格式错误（应为「文戏：N秒」或「武戏：N秒」）");
              } else if (parsed.duration < 5 || parsed.duration > 12) {
                problems.push("第 " + (i + 1) + " 个分镜秒数 " + parsed.duration +
                  " 超出范围（必须为 5-12 秒）");
              }
            } else if (s) {
              problems.push("第 " + (i + 1) + " 个分镜缺少类型字段");
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
            problems.push("分镜编号重复：" + dups.join("、"));
          }

          // 编号顺序检查
          for (let i = 1; i < nums.length; i++) {
            if (nums[i].num <= nums[i - 1].num) {
              problems.push("分镜编号未按从小到大排列：第 " + (nums[i - 1].idx + 1) +
                " 个分镜编号 " + nums[i - 1].num + " ≥ 第 " + (nums[i].idx + 1) +
                " 个分镜编号 " + nums[i].num);
              break;
            }
          }

          if (problems.length > 0) {
            return { ok: false, error: "分镜校验未通过：" + problems.join("；") + "。请修正后再切换。" };
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
          const validateBtn = makeEl("button", "mspe-validate-btn", "校验格式");
          validateBtn.title = "校验当前 JSON 格式是否正确";
          const msgEl = makeEl("span", "mspe-validate-msg", "");
          ptoolbar.append(validateBtn, msgEl);
          // 可编辑文本框
          const ta = makeEl("textarea", "mspe-preview-textarea");
          ta.spellcheck = false;
          ta.value = JSON.stringify(this._data, null, 2);
          ta.placeholder = "在此粘贴或编辑完整 JSON…";
          validateBtn.addEventListener("click", () => {
            const result = this._validateJson(ta.value);
            if (!result.ok) {
              this._showValidateMsg("err", result.error);
            } else {
              this._data = result.data;
              this._syncJson();
              this._showValidateMsg("ok", "格式校验通过，数据已同步");
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
        ta.placeholder = "在此输入" + key + "…";
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
          getLabel: (item) => truncate(item, 16) || "空",
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
            const label = truncate(this._data[key][i], 20) || "空";
            this._confirm(
              "确定要删除「" + key + "」第 " + (i + 1) + " 条（" + label + "）吗？\n删除后内容将丢失且不可恢复。",
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
          ta.placeholder = "在此输入第 " + (idx + 1) + " 条" + key + "内容…";
          ta.spellcheck = false;
          ta.addEventListener("input", () => {
            this._data[key][idx] = ta.value;
            this._syncJson();
            // 更新 Tab 标签
            const nameEl = tabbar.children[idx]?.querySelector(".mspe-tab-name");
            if (nameEl) nameEl.textContent = truncate(ta.value, 16) || "空";
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
          getLabel: (shot) => truncate(shot["标题"], 14) || "未命名",
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
            const title = truncate(shots[i]["标题"], 20) || "未命名";
            this._confirm(
              "确定要删除第 " + (shots[i]["编号"] || (i + 1)) + " 个分镜「" + title + "」吗？\n删除后所有字段（含运镜）将丢失且不可恢复。",
              () => {
                shots.splice(i, 1);
                if (this._curShot >= shots.length) this._curShot = shots.length - 1;
                this._curMove = 0;
                this._syncJson();
                this._renderContent();
              });
          },
          onRename: (i, newName) => {
            shots[i]["标题"] = newName || ("分镜" + (shots[i]["编号"] || (i + 1)));
            this._syncJson();
            this._renderContent();
          },
        });
        container.append(tabbar);

        if (shots.length === 0) return;
        const shot = shots[curIdx];

        // 编号（只读，与 Tab 标题编号一致，自动显示不可编辑）
        const rowNum = makeEl("div", "mspe-field-row inline");
        rowNum.append(makeEl("div", "mspe-field-label", "编号"));
        const numDisplay = makeEl("span", "mspe-num-display", String(shot["编号"] ?? (curIdx + 1)));
        numDisplay.title = "编号自动生成，不可编辑";
        rowNum.append(numDisplay);
        container.append(rowNum);

        // 类型：文戏/武戏 下拉 + 秒数 5-12 下拉
        const rowType = makeEl("div", "mspe-field-row inline");
        rowType.append(makeEl("div", "mspe-field-label", "类型"));
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
        rowTitle.append(makeEl("div", "mspe-field-label", "标题"));
        const titleInp = makeEl("input", "mspe-textinput");
        titleInp.value = shot["标题"] || "";
        titleInp.placeholder = "输入分镜标题…";
        titleInp.addEventListener("input", () => {
          shot["标题"] = titleInp.value;
          this._syncJson();
          const nameEl = tabbar.children[curIdx]?.querySelector(".mspe-tab-name");
          if (nameEl) nameEl.textContent = truncate(titleInp.value, 14) || "未命名";
        });
        rowTitle.append(titleInp);
        container.append(rowTitle);

        // 摘要
        const rowSum = makeEl("div", "mspe-field-row");
        rowSum.append(makeEl("div", "mspe-field-label", "摘要"));
        const sumTa = makeEl("textarea", "mspe-textarea");
        sumTa.value = shot["摘要"] || "";
        sumTa.placeholder = "输入分镜摘要…";
        sumTa.spellcheck = false;
        sumTa.style.minHeight = "80px";
        sumTa.addEventListener("input", () => { shot["摘要"] = sumTa.value; this._syncJson(); });
        rowSum.append(sumTa);
        container.append(rowSum);

        // 运镜：三级子 Tab
        container.append(makeEl("div", "mspe-section-label", "运镜（逐条编辑）"));
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
            const label = truncate(shot["运镜"][i], 20) || "空";
            this._confirm(
              "确定要删除第 " + (i + 1) + " 条运镜（" + label + "）吗？\n删除后内容将丢失且不可恢复。",
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
        moveTa.placeholder = "输入第 " + (moveCur + 1) + " 条运镜描述…";
        moveTa.spellcheck = false;
        moveTa.style.minHeight = "100px";
        moveTa.addEventListener("input", () => {
          shot["运镜"][moveCur] = moveTa.value;
          this._syncJson();
          const nameEl = moveBar.children[moveCur]?.querySelector(".mspe-tab-name");
          if (nameEl) nameEl.textContent = truncate(moveTa.value, 14) || "空";
        });
        container.append(moveTa);

        // 环境音
        const rowEnv = makeEl("div", "mspe-field-row");
        rowEnv.append(makeEl("div", "mspe-field-label", "环境音"));
        const envTa = makeEl("textarea", "mspe-textarea");
        envTa.value = shot["环境音"] || "";
        envTa.placeholder = "输入环境音描述…";
        envTa.spellcheck = false;
        envTa.style.minHeight = "60px";
        envTa.addEventListener("input", () => { shot["环境音"] = envTa.value; this._syncJson(); });
        rowEnv.append(envTa);
        container.append(rowEnv);

        // BGM
        const rowBgm = makeEl("div", "mspe-field-row");
        rowBgm.append(makeEl("div", "mspe-field-label", "BGM"));
        const bgmTa = makeEl("textarea", "mspe-textarea");
        bgmTa.value = shot["BGM"] || "";
        bgmTa.placeholder = "输入BGM描述…";
        bgmTa.spellcheck = false;
        bgmTa.style.minHeight = "50px";
        bgmTa.addEventListener("input", () => { shot["BGM"] = bgmTa.value; this._syncJson(); });
        rowBgm.append(bgmTa);
        container.append(rowBgm);
      };

      /* ---- 从隐藏 widget 加载数据 ---- */
      this._load = () => {
        const jsonW = this.widgets?.find((x) => x.name === "prompt_json");
        let data = {};
        try { data = JSON.parse(jsonW?.value || "{}"); } catch (e) { data = {}; }

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
        this._data = merged;
        this._curModule = 0;
        this._previewMode = false;
        if (this._dom?.previewBtn) {
          this._dom.previewBtn.classList.remove("active");
          this._dom.previewBtn.textContent = "预览 JSON";
        }
        MODULES.forEach((m) => { if (m.type === "list_str") this._curItem[m.key] = 0; });
        this._curShot = 0;
        this._curMove = 0;
        this._renderTopTabs();
        this._renderContent();
      };

      this._load();
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
