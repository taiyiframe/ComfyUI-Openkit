/* MultiSegmentPromptEditor — 多段提示词可视化编辑节点（前端扩展）
 *
 * 基于 H3 六段式提示词 JSON 结构的可视化编辑器：
 *  - 顶层 6 大模块以 Tab 切换：整体风格 / 角色档案 / 音色档案 / 道具档案 / 场景档案 / 分镜序列；
 *  - 列表型模块（角色/音色/道具/场景档案）：每条为多行文本框，点击「+」添加，点击「×」删除；
 *  - 分镜序列：每个分镜为可展开折叠卡片，展开后显示 10 个字段（编号/类型/标题/subject_definitions/
 *    summary/retention_analysis/detailed_description/环境音/BGM/Negative），最细粒度为多行文本框；
 *  - 用户完全不接触原始 JSON，所有操作通过可视化 UI 完成；
 *  - 原生 widget（prompt_json）被隐藏，值通过隐藏 widget 序列化。
 *
 * 数据模型（node._data）：
 *   {
 *     "整体风格": str,
 *     "角色档案": [str, ...],
 *     "音色档案": [str, ...],
 *     "道具档案": [str, ...],
 *     "场景档案": [str, ...],
 *     "分镜序列": [{编号:int, 类型:str, 标题:str, subject_definitions:str, summary:str,
 *                   retention_analysis:str, detailed_description:str, 环境音:str, BGM:str, Negative:str}, ...]
 *   }
 */
import { app } from "../../../scripts/app.js";

const NODE_NAME = "MultiSegmentPromptEditor";

const MODULES = [
  { key: "整体风格", type: "str" },
  { key: "角色档案", type: "list_str" },
  { key: "音色档案", type: "list_str" },
  { key: "道具档案", type: "list_str" },
  { key: "场景档案", type: "list_str" },
  { key: "分镜序列", type: "list_shot" },
];

const SHOT_FIELDS = [
  { key: "编号", type: "int", label: "编号" },
  { key: "类型", type: "text", label: "类型" },
  { key: "标题", type: "text", label: "标题" },
  { key: "subject_definitions", type: "textarea", label: "subject_definitions" },
  { key: "summary", type: "textarea", label: "summary" },
  { key: "retention_analysis", type: "textarea", label: "retention_analysis" },
  { key: "detailed_description", type: "textarea", label: "detailed_description" },
  { key: "环境音", type: "textarea", label: "环境音" },
  { key: "BGM", type: "textarea", label: "BGM" },
  { key: "Negative", type: "textarea", label: "Negative" },
];

const DEFAULT_DATA = {
  "整体风格": "",
  "角色档案": [""],
  "音色档案": [""],
  "道具档案": [""],
  "场景档案": [""],
  "分镜序列": [{ "编号": 1, "类型": "", "标题": "", "subject_definitions": "", "summary": "", "retention_analysis": "", "detailed_description": "", "环境音": "", "BGM": "", "Negative": "" }],
};

/* ============ CSS ============ */
const CSS = `
.mspe-root{display:flex;flex-direction:column;gap:6px;width:100%;height:100%;
  min-height:320px;box-sizing:border-box;padding:8px;background:#191c22;
  border:1px solid #2a2f3a;border-radius:8px;font-family:system-ui,sans-serif;
  color:#d7dbe2;font-size:12px;overflow:hidden;}
.mspe-tabs{display:flex;gap:2px;flex:0 0 auto;flex-wrap:wrap;align-items:center;
  border-bottom:1px solid #2a2f3a;padding-bottom:4px;}
.mspe-tab{display:inline-flex;align-items:center;gap:4px;
  background:#232833;border:1px solid #2e3440;color:#8a93a3;border-radius:6px 6px 0 0;
  padding:4px 10px;font-size:11px;cursor:pointer;user-select:none;}
.mspe-tab:hover{background:#2b3140;color:#c9cfda;}
.mspe-tab.active{background:#3a4252;color:#fff;border-color:#4a5568;border-bottom-color:#3a4252;}
.mspe-content{flex:1;min-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;
  padding-top:4px;}
.mspe-textarea{width:100%;min-height:120px;background:#12151b;color:#dde2ea;
  border:1px solid #2e3440;border-radius:6px;padding:6px;font-size:12px;
  font-family:ui-monospace,Consolas,monospace;resize:vertical;box-sizing:border-box;
  white-space:pre;overflow:auto;line-height:1.5;}
.mspe-textarea:focus{outline:none;border-color:#4a5568;}
.mspe-textinput{width:100%;background:#12151b;color:#dde2ea;border:1px solid #2e3440;
  border-radius:4px;padding:3px 6px;font-size:12px;font-family:ui-monospace,monospace;
  box-sizing:border-box;}
.mspe-textinput:focus{outline:none;border-color:#4a5568;}
.mspe-intinput{width:70px;background:#12151b;color:#dde2ea;border:1px solid #2e3440;
  border-radius:4px;padding:3px 6px;font-size:12px;font-family:ui-monospace,monospace;
  box-sizing:border-box;text-align:center;}
.mspe-intinput:focus{outline:none;border-color:#4a5568;}
.mspe-field-label{font-size:11px;color:#8a93a3;margin-bottom:2px;letter-spacing:.02em;
  display:flex;align-items:center;gap:4px;}
.mspe-field-row{display:flex;flex-direction:column;gap:2px;margin-bottom:6px;}
.mspe-add-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;
  background:transparent;border:1px dashed #3a4252;color:#8a93a3;border-radius:6px;
  padding:6px 12px;font-size:12px;cursor:pointer;flex:0 0 auto;align-self:flex-start;}
.mspe-add-btn:hover{background:#2b3140;color:#d7dbe2;border-color:#4a5568;}
.mspe-item{display:flex;flex-direction:column;gap:4px;
  background:#1e222b;border:1px solid #2a2f3a;border-radius:6px;padding:8px;
  position:relative;}
.mspe-item-header{display:flex;align-items:center;gap:6px;flex:0 0 auto;}
.mspe-item-title{font-size:12px;color:#c9cfda;font-weight:500;flex:1;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mspe-item-idx{font-size:10px;color:#6b7280;background:#2a2f3a;border-radius:3px;
  padding:1px 5px;flex:0 0 auto;font-family:ui-monospace,monospace;}
.mspe-del-btn{flex:0 0 auto;background:transparent;border:none;color:#7b8494;
  font-size:14px;cursor:pointer;padding:2px 6px;border-radius:4px;line-height:1;}
.mspe-del-btn:hover{color:#ff6b6b;background:#454f63;}
.mspe-shot-card{background:#1e222b;border:1px solid #2a2f3a;border-radius:6px;
  overflow:hidden;}
.mspe-shot-header{display:flex;align-items:center;gap:6px;padding:6px 8px;
  background:#232833;cursor:pointer;user-select:none;}
.mspe-shot-header:hover{background:#2b3140;}
.mspe-shot-num{font-size:11px;color:#fff;background:#4a5568;border-radius:3px;
  padding:1px 6px;font-family:ui-monospace,monospace;flex:0 0 auto;}
.mspe-shot-title{font-size:12px;color:#c9cfda;flex:1;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
.mspe-shot-type{font-size:10px;color:#8a93a3;background:#2a2f3a;border-radius:3px;
  padding:1px 5px;flex:0 0 auto;}
.mspe-shot-toggle{font-size:10px;color:#8a93a3;flex:0 0 auto;}
.mspe-shot-body{padding:8px;display:none;flex-direction:column;gap:6px;
  border-top:1px solid #2a2f3a;}
.mspe-shot-card.expanded .mspe-shot-body{display:flex;}
.mspe-shot-card.expanded .mspe-shot-toggle{transform:rotate(90deg);}
.mspe-empty{color:#6b7280;font-size:12px;padding:12px;text-align:center;
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
.mspe-section-label{font-size:11px;color:#6b7280;margin:2px 0;letter-spacing:.03em;}
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

/* ============ 构建根 DOM ============ */
function buildRoot(node) {
  const root = makeEl("div", "mspe-root");

  // 顶部模块 Tab 栏
  const tabbar = makeEl("div", "mspe-tabs");
  MODULES.forEach((m, i) => {
    const tab = makeEl("div", "mspe-tab" + (i === 0 ? " active" : ""), m.key);
    tab.dataset.idx = String(i);
    tab.addEventListener("click", () => {
      node._mspeCurModule = i;
      node._mspeRefreshTabs();
      node._mspeRenderContent();
    });
    tabbar.append(tab);
  });

  // 内容区
  const content = makeEl("div", "mspe-content");

  root.append(tabbar, content);
  node._mspeDom = { tabbar, content };
  return root;
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
      this._mspeCurModule = 0;
      this._mspeExpandedShots = new Set([0]); // 默认展开第一个分镜

      // 隐藏原生 widget
      const jsonW = this.widgets?.find((w) => w.name === "prompt_json");
      if (jsonW) {
        jsonW.hidden = true;
        jsonW.type = "hidden";
        jsonW.computeSize = () => [0, -4];
        jsonW.serializeValue = () => {
          this._mspeSyncJson();
          return jsonW.value;
        };
      }

      const root = buildRoot(this);
      const domWidget = this.addDOMWidget("mspe_panel", "div", root, {
        getMinHeight: () => 320,
        getMaxHeight: () => undefined,
        getHeight: () => Math.max(320, (this.size?.[1] || 0) - 34),
        hideOnZoom: false,
        serialize: false,
      });
      domWidget.computeLayoutSize = () => ({
        minHeight: 360, minWidth: 420,
        maxHeight: 100000, maxWidth: 100000,
      });
      domWidget.beforeQueued = () => {
        this._mspeSyncJson();
      };
      this.size[0] = Math.max(420, this.size[0] || 0);
      this.size[1] = Math.max(360, this.size[1] || 0);

      /* ---- 实例方法 ---- */

      // 刷新 Tab 高亮
      this._mspeRefreshTabs = () => {
        const dom = this._mspeDom;
        if (!dom) return;
        Array.from(dom.tabbar.children).forEach((tab, i) => {
          tab.classList.toggle("active", i === this._mspeCurModule);
        });
      };

      // 同步数据到隐藏 widget
      this._mspeSyncJson = () => {
        const w = this.widgets?.find((x) => x.name === "prompt_json");
        if (w) w.value = JSON.stringify(this._data, null, 2);
      };

      // 二次确认弹窗
      this._mspeConfirm = (msg, onOk) => {
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

      // 渲染内容区（根据当前模块）
      this._mspeRenderContent = () => {
        const dom = this._mspeDom;
        if (!dom) return;
        dom.content.innerHTML = "";
        const mod = MODULES[this._mspeCurModule];
        const data = this._data;

        if (mod.type === "str") {
          this._mspeRenderStrModule(dom.content, mod.key, data[mod.key]);
        } else if (mod.type === "list_str") {
          this._mspeRenderListStrModule(dom.content, mod.key, data[mod.key]);
        } else if (mod.type === "list_shot") {
          this._mspeRenderListShotModule(dom.content, data[mod.key]);
        }
      };

      // 渲染字符串模块（整体风格）
      this._mspeRenderStrModule = (container, key, value) => {
        const label = makeEl("div", "mspe-field-label", key);
        const ta = makeEl("textarea", "mspe-textarea");
        ta.value = value || "";
        ta.placeholder = `在此输入${key}…`;
        ta.spellcheck = false;
        ta.addEventListener("input", () => {
          this._data[key] = ta.value;
          this._mspeSyncJson();
        });
        container.append(label, ta);
      };

      // 渲染字符串列表模块（角色/音色/道具/场景档案）
      this._mspeRenderListStrModule = (container, key, list) => {
        if (!Array.isArray(list)) list = [];
        list.forEach((item, idx) => {
          const wrap = makeEl("div", "mspe-item");
          const header = makeEl("div", "mspe-item-header");
          const idxTag = makeEl("span", "mspe-item-idx", `#${idx + 1}`);
          const title = makeEl("span", "mspe-item-title",
            (item || "").split("\n")[0].slice(0, 40) || `第 ${idx + 1} 条`);
          const del = makeEl("button", "mspe-del-btn", "×");
          del.title = "删除该条";
          del.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this._mspeConfirm(
              `确定要删除「${key}」第 ${idx + 1} 条吗？\n删除后内容将丢失且不可恢复。`,
              () => {
                this._data[key].splice(idx, 1);
                if (this._data[key].length === 0) this._data[key].push("");
                this._mspeSyncJson();
                this._mspeRenderContent();
              });
          });
          header.append(idxTag, title, del);
          const ta = makeEl("textarea", "mspe-textarea");
          ta.value = item || "";
          ta.placeholder = `在此输入第 ${idx + 1} 条${key}内容…`;
          ta.spellcheck = false;
          ta.addEventListener("input", () => {
            this._data[key][idx] = ta.value;
            title.textContent = ta.value.split("\n")[0].slice(0, 40) || `第 ${idx + 1} 条`;
            this._mspeSyncJson();
          });
          wrap.append(header, ta);
          container.append(wrap);
        });

        const addBtn = makeEl("button", "mspe-add-btn", "+ 添加一条");
        addBtn.addEventListener("click", () => {
          this._data[key].push("");
          this._mspeSyncJson();
          this._mspeRenderContent();
          // 滚动到底部
          setTimeout(() => { container.scrollTop = container.scrollHeight; }, 10);
        });
        container.append(addBtn);
      };

      // 渲染分镜序列模块
      this._mspeRenderListShotModule = (container, shots) => {
        if (!Array.isArray(shots)) shots = [];
        shots.forEach((shot, idx) => {
          const card = makeEl("div", "mspe-shot-card");
          if (this._mspeExpandedShots.has(idx)) card.classList.add("expanded");

          // 卡片头部
          const header = makeEl("div", "mspe-shot-header");
          const num = makeEl("span", "mspe-shot-num", `#${shot["编号"] || idx + 1}`);
          const title = makeEl("span", "mspe-shot-title", shot["标题"] || `分镜 ${idx + 1}`);
          const type = makeEl("span", "mspe-shot-type", shot["类型"] || "未设置");
          const toggle = makeEl("span", "mspe-shot-toggle", "▶");
          const del = makeEl("button", "mspe-del-btn", "×");
          del.title = "删除该分镜";
          del.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this._mspeConfirm(
              `确定要删除第 ${idx + 1} 个分镜「${shot["标题"] || "未命名"}」吗？\n删除后所有字段内容将丢失且不可恢复。`,
              () => {
                this._data["分镜序列"].splice(idx, 1);
                this._mspeExpandedShots.delete(idx);
                // 重新编号展开状态
                const newExpanded = new Set();
                this._mspeExpandedShots.forEach((i) => {
                  if (i < idx) newExpanded.add(i);
                  else if (i > idx) newExpanded.add(i - 1);
                });
                this._mspeExpandedShots = newExpanded;
                if (this._data["分镜序列"].length === 0) {
                  this._data["分镜序列"].push(deepClone(DEFAULT_DATA["分镜序列"][0]));
                  this._mspeExpandedShots.add(0);
                }
                this._mspeSyncJson();
                this._mspeRenderContent();
              });
          });
          header.append(num, title, type, toggle, del);
          header.addEventListener("click", () => {
            if (this._mspeExpandedShots.has(idx)) {
              this._mspeExpandedShots.delete(idx);
              card.classList.remove("expanded");
            } else {
              this._mspeExpandedShots.add(idx);
              card.classList.add("expanded");
            }
          });

          // 卡片 body：各字段
          const body = makeEl("div", "mspe-shot-body");
          SHOT_FIELDS.forEach((field) => {
            const row = makeEl("div", "mspe-field-row");
            const flabel = makeEl("div", "mspe-field-label", field.label);
            row.append(flabel);

            if (field.type === "int") {
              const inp = makeEl("input", "mspe-intinput");
              inp.type = "number";
              inp.value = shot[field.key] ?? idx + 1;
              inp.min = "0";
              inp.addEventListener("change", () => {
                const v = parseInt(inp.value, 10);
                shot[field.key] = Number.isNaN(v) ? idx + 1 : v;
                num.textContent = `#${shot[field.key]}`;
                this._mspeSyncJson();
              });
              row.append(inp);
            } else if (field.type === "text") {
              const inp = makeEl("input", "mspe-textinput");
              inp.value = shot[field.key] || "";
              inp.placeholder = `输入${field.label}…`;
              inp.addEventListener("input", () => {
                shot[field.key] = inp.value;
                if (field.key === "标题") title.textContent = inp.value || `分镜 ${idx + 1}`;
                if (field.key === "类型") type.textContent = inp.value || "未设置";
                this._mspeSyncJson();
              });
              row.append(inp);
            } else {
              const ta = makeEl("textarea", "mspe-textarea");
              ta.value = shot[field.key] || "";
              ta.placeholder = `输入${field.label}…`;
              ta.spellcheck = false;
              ta.style.minHeight = "60px";
              ta.addEventListener("input", () => {
                shot[field.key] = ta.value;
                this._mspeSyncJson();
              });
              row.append(ta);
            }
            body.append(row);
          });

          card.append(header, body);
          container.append(card);
        });

        const addBtn = makeEl("button", "mspe-add-btn", "+ 添加分镜");
        addBtn.addEventListener("click", () => {
          const maxNum = this._data["分镜序列"].reduce(
            (m, s) => Math.max(m, parseInt(s["编号"], 10) || 0), 0);
          const newShot = deepClone(DEFAULT_DATA["分镜序列"][0]);
          newShot["编号"] = maxNum + 1;
          this._data["分镜序列"].push(newShot);
          const newIdx = this._data["分镜序列"].length - 1;
          this._mspeExpandedShots.add(newIdx);
          this._mspeSyncJson();
          this._mspeRenderContent();
          setTimeout(() => { container.scrollTop = container.scrollHeight; }, 10);
        });
        container.append(addBtn);
      };

      // 从隐藏 widget 加载数据
      this._mspeLoad = () => {
        const jsonW = this.widgets?.find((x) => x.name === "prompt_json");
        let data = {};
        try {
          data = JSON.parse(jsonW?.value || "{}");
        } catch (e) { data = {}; }

        // 合并默认值，确保所有模块存在
        const merged = deepClone(DEFAULT_DATA);
        for (const m of MODULES) {
          if (data[m.key] != null) {
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
                  const shot = deepClone(DEFAULT_DATA["分镜序列"][0]);
                  if (s && typeof s === "object") {
                    SHOT_FIELDS.forEach((f) => {
                      if (s[f.key] != null) {
                        shot[f.key] = f.type === "int" ? (parseInt(s[f.key], 10) || 1) : String(s[f.key]);
                      }
                    });
                  }
                  return shot;
                });
                if (merged[m.key].length === 0) merged[m.key] = [deepClone(DEFAULT_DATA["分镜序列"][0])];
              }
            }
          }
        }
        this._data = merged;
        this._mspeExpandedShots = new Set([0]);
        this._mspeCurModule = 0;
        this._mspeRefreshTabs();
        this._mspeRenderContent();
      };

      this._mspeLoad();
      return r;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      setTimeout(() => {
        if (typeof this._mspeLoad === "function") this._mspeLoad();
      }, 0);
      return r;
    };
  },
});
