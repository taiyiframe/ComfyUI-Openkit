/* TabStringMultiline — 多 Tab 页多行字符串节点（前端扩展）
 *
 * 由内置 PrimitiveStringMultiline 重写扩展而来：
 *  - 提供动态个数的 Tab 页多行文本展示与编辑（不固定 8 个）；
 *  - 最后一个 Tab 页后面有「+」按钮，点击可新增一个 Tab 页（上限 MAX_TAB_COUNT）；
 *  - Tab 页标签支持双击编辑标题；
 *  - 点击 Tab 页顶部：联动更新顶部「Tab索引」输入框并自动触发联动切换（输出切到当前页）；
 *  - 顶部「Tab索引」输入（0 开始的整数）决定节点最终输出哪个 Tab 页的内容，
 *    「联动切换」按钮：修改 Tab 索引后点击，下方 Tab 页自动切换到对应索引的页。
 *
 * 原生 widget（Tab索引 / tabs_content）被隐藏，所有 UI 由本扩展的 DOM 承载。
 * 值通过隐藏 widget 序列化：tabs_content 保存全部 Tab 内容与标题 JSON
 *   { "tabs": [...], "names": [...] }；
 * Tab索引 保存当前输出索引；queue 前（beforeQueued）统一同步确保后端拿到最新值。
 */
import { app } from "../../../scripts/app.js";
import { OKT } from "./openkit_i18n.js";
import { injectOpenkitUI, oktSurface } from "./openkit_ui.js";

const NODE_NAME = "TabStringMultiline";
const MAX_TAB_COUNT = 64;
// 本文件全部静态 UI 文案统一走 OKT.tr（用户输入 / 自动生成的 Tab 名不翻译）。
const tr = (t) => OKT.tr(t);

const CSS = `
.tsm-root{display:flex;flex-direction:column;gap:6px;width:100%;height:100%;
  min-height:260px;box-sizing:border-box;padding:6px;background:var(--ok-bg);
  border:1px solid var(--ok-line);border-radius:8px;font-family:var(--ok-font);
  color:var(--ok-text);font-size:12px;overflow:hidden;}
.tsm-top{display:flex;align-items:center;gap:6px;flex:0 0 auto;}
.tsm-toplabel{font-size:11px;color:var(--ok-dim);flex:0 0 auto;letter-spacing:.03em;}
.tsm-idx{width:56px;background:var(--ok-panel-2);color:var(--ok-text);border:1px solid var(--ok-line-2);
  border-radius:6px;padding:3px 6px;font-size:12px;font-family:var(--ok-mono);}
.tsm-idx:focus{outline:none;border-color:var(--ok-accent-2);}
.tsm-btn{background:var(--ok-panel);border:1px solid var(--ok-line);color:var(--ok-text);border-radius:var(--ok-radius);
  padding:4px 10px;font-size:11px;cursor:pointer;flex:0 0 auto;font-family:var(--ok-font);
  transition:background var(--ok-transition), border-color var(--ok-transition), color var(--ok-transition);}
.tsm-btn:hover{background:var(--ok-panel-2);}
.tsm-tabs{display:flex;gap:3px;flex:0 0 auto;flex-wrap:wrap;align-items:center;}
.tsm-tab{display:inline-flex;align-items:center;gap:4px;
  background:var(--ok-panel-2);border:1px solid var(--ok-line-2);color:var(--ok-dim);border-radius:6px;
  padding:3px 6px 3px 8px;font-size:11px;cursor:pointer;user-select:none;
  max-width:200px;}
.tsm-tab:hover{background:var(--ok-panel-2);color:var(--ok-text);}
.tsm-tab.active{background:var(--ok-accent-bg);color:var(--ok-accent);border-color:var(--ok-accent-2);}
.tsm-tab-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* 关闭按钮与标题保持较长间距（≥4 个汉字，em 单位随字号等比缩放，
   任意画布 zoom/节点缩放下视觉间距恒定），避免误触 */
.tsm-tab-x{flex:0 0 auto;margin-left:4.2em;font-size:11px;line-height:1;
  color:var(--ok-dim);padding:1px 3px;border-radius:3px;cursor:pointer;z-index:2;}
.tsm-tab-x:hover{color:var(--ok-err);background:var(--ok-line-2);}
/* 自定义二次确认弹窗（不依赖 window.confirm，避免在 ComfyUI 画布中被拦截） */
.tsm-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;
  display:flex;align-items:center;justify-content:center;}
.tsm-modal-box{background:var(--ok-panel-2);border:1px solid var(--ok-line-2);border-radius:8px;
  padding:16px 18px;min-width:300px;max-width:440px;box-shadow:0 8px 30px rgba(0,0,0,.5);}
.tsm-modal-msg{color:var(--ok-text);font-size:13px;line-height:1.6;margin-bottom:16px;
  white-space:pre-wrap;word-break:break-all;}
.tsm-modal-btns{display:flex;justify-content:flex-end;gap:8px;}
.tsm-modal-btns .tsm-btn{padding:5px 14px;font-size:12px;}
.tsm-modal-cancel{background:var(--ok-panel);}
.tsm-modal-ok{background:#8b3a3a;border-color:#b05252;color:#fff;}
.tsm-modal-ok:hover{background:#a04545;}
.tsm-tab.tsm-add{background:transparent;border:1px dashed var(--ok-line-2);color:var(--ok-dim);
  padding:3px 10px;font-size:13px;font-weight:600;}
.tsm-tab.tsm-add:hover{background:var(--ok-panel);color:var(--ok-text);border-color:var(--ok-line-2);}
.tsm-rename{width:140px;background:var(--ok-panel-2);color:var(--ok-text);border:1px solid var(--ok-line-2);
  border-radius:4px;padding:1px 4px;font-size:11px;box-sizing:border-box;}
.tsm-text{flex:1;min-height:120px;min-width:0;background:var(--ok-panel-2);color:var(--ok-text);
  border:1px solid var(--ok-line-2);border-radius:6px;padding:6px;font-size:12px;
  font-family:var(--ok-mono);resize:none;box-sizing:border-box;
  white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;
  overflow-y:auto;overflow-x:hidden;line-height:1.5;}
.tsm-text:focus{outline:none;border-color:var(--ok-accent-2);}
`;

let cssDone = false;
function injectCSS() {
  if (cssDone) return;
  const s = document.createElement("style");
  s.textContent = CSS;
  document.head.append(s);
  cssDone = true;
}

function buildRoot(node) {
  const root = document.createElement("div");
  root.className = "tsm-root";
  oktSurface(root);

  // 顶部：Tab索引 输入 + 联动切换按钮
  const top = document.createElement("div");
  top.className = "tsm-top";
  const label = document.createElement("span");
  label.className = "tsm-toplabel";
  label.textContent = tr("Tab索引");
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "0";
  input.step = "1";
  input.value = "0";
  input.className = "tsm-idx";
  input.title = tr("决定节点最终输出哪个 Tab 页的内容，索引从 0 开始");
  const linkBtn = document.createElement("button");
  linkBtn.className = "tsm-btn";
  linkBtn.textContent = tr("联动切换");
  linkBtn.title = tr("修改 Tab 索引后点击，下方 Tab 页自动切换到对应索引的页");
  linkBtn.addEventListener("click", () => {
    let v = parseInt(input.value, 10);
    if (Number.isNaN(v)) v = 0;
    const maxI = Math.max(0, node._tabs?.length - 1 || 0);
    v = Math.max(0, Math.min(maxI, v));
    input.value = String(v);
    node._tsmSetCurTab(v);
    node._tsmSyncIdx();
  });
  input.addEventListener("change", () => {
    let v = parseInt(input.value, 10);
    if (Number.isNaN(v)) v = 0;
    const maxI = Math.max(0, node._tabs?.length - 1 || 0);
    v = Math.max(0, Math.min(maxI, v));
    input.value = String(v);
    node._tsmSyncIdx();
  });
  top.append(label, input, linkBtn);

  // tab 栏：动态渲染（由 _tsmRefresh 填充：各 Tab 页 + 末尾「+」按钮）
  const tabbar = document.createElement("div");
  tabbar.className = "tsm-tabs";

  // 多行文本编辑器（编辑当前 Tab 页内容）
  const ta = document.createElement("textarea");
  ta.className = "tsm-text";
  ta.spellcheck = false;
  ta.placeholder = tr("在此输入当前 Tab 页的多行文本…");
  ta.addEventListener("input", () => {
    node._tabs[node._tsmCurTab] = ta.value;
    node._tsmSyncContent();
  });

  root.append(top, tabbar, ta);
  node._tsmDom = { input, tabbar, ta };
  return root;
}

app.registerExtension({
  name: "Openkit.TabStringMultiline",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      injectOpenkitUI();
      injectCSS();
      this._tabs = [""];
      this._names = [""];
      this._tsmCurTab = 0;

      // 隐藏原生 widget
      const contentW = this.widgets?.find((w) => w.name === "tabs_content");
      if (contentW) {
        contentW.hidden = true;
        contentW.type = "hidden";
        contentW.computeSize = () => [0, -4];
        // 保存时总是输出最新 JSON（编辑中的内容可能尚未写回 value）
        contentW.serializeValue = () => {
          this._tsmSyncContent();
          return contentW.value;
        };
      }
      const idxW = this.widgets?.find((w) => w.name === "Tab索引");
      if (idxW) {
        idxW.hidden = true;
        idxW.type = "hidden";
        idxW.computeSize = () => [0, -4];
        // 禁用 ComfyUI 自动值控件（increment/randomize）：否则每次运行后 Tab 索引
        // 会被自动 +1，导致点击 tab 后输出没有跟随当前页。
        if (Array.isArray(idxW.linkedWidgets)) {
          for (const lw of [...idxW.linkedWidgets]) {
            if (!lw) continue;
            lw.value = "fixed";
            lw.hidden = true;
            lw.type = "hidden";
            lw.serialize = false;
            const li = this.widgets?.indexOf(lw);
            if (li != null && li >= 0) this.widgets?.splice(li, 1);
          }
          idxW.linkedWidgets = [];
        }
        if (idxW.options) idxW.options.control_after_generate = "fixed";
        idxW.control_after_generate = "fixed";
        // queue / 保存时强制读 DOM 输入框的最新值并钳制：点击 Tab 页会把输入框
        // 同步为对应编号，这里保证输出严格跟随点击的当前页。
        idxW.serializeValue = () => {
          const dom = this._tsmDom;
          let v = parseInt(dom?.input?.value, 10) || 0;
          v = Math.max(0, Math.min(this._tabs.length - 1, v));
          idxW.value = v;
          if (dom) dom.input.value = String(v);
          this._tsmCurTab = v;
          return v;
        };
      }

      const root = buildRoot(this);
      const domWidget = this.addDOMWidget("tsm_panel", "div", root, {
        getMinHeight: () => 260,
        getMaxHeight: () => undefined,
        getHeight: () => Math.max(260, (this.size?.[1] || 0) - 34),
        hideOnZoom: false,
        serialize: false,
      });
      // 兼容 ComfyUI-Prompt-Assistant：把当前活动文本框暴露为 inputEl，
      // 并使用其白名单名称 "text"，使提示词小助手绿色按钮可挂载到本节点
      domWidget.inputEl = ta;
      domWidget.name = "text";
      domWidget.computeLayoutSize = () => {
        const nw = Math.max(380, this.size?.[0] || 380);
        const nh = Math.max(300, (this.size?.[1] || 0) - 34);
        return {
          minHeight: 300, minWidth: 380,
          maxHeight: 100000, maxWidth: 100000,
          preferredWidth: nw,   // 关键：驱动 .dom-widget 宽度随节点缩放，缺省退化 width:0 塌缩
          preferredHeight: nh,  // 关键：高度随节点高度，面板文本区 flex 自适应
        };
      };
      // 关键根治：ComfyUI 布局可能把 widget.width 误设成极小值导致面板塌缩；
      // 用 getter 恒返回节点宽度，读时永远正确、写时忽略，彻底消除塌缩。
      Object.defineProperty(domWidget, "width", {
        configurable: true,
        get: () => Math.max(380, this.size?.[0] || 380),
        set: () => {},
      });
      domWidget.beforeQueued = () => {
        this._tsmSyncIdx();
        this._tsmSyncContent();
      };
      this.size[0] = Math.max(380, this.size[0] || 0);
      this.size[1] = Math.max(300, this.size[1] || 0);

      // 节点方法（闭包挂到实例上，避免污染原型）
      this._tsmSetCurTab = (i) => {
        const maxI = Math.max(0, this._tabs.length - 1);
        this._tsmCurTab = Math.max(0, Math.min(maxI, i));
        if (this._tsmDom) this._tsmDom.input.value = String(this._tsmCurTab);
        this._tsmSyncIdx();
        this._tsmRefresh();
      };
      // 点击 Tab 页顶部：联动更新顶部 Tab 索引输入框，并自动触发联动切换（输出切到当前页）
      this._tsmOnTabClick = (i) => {
        this._tsmSetCurTab(i);
      };
      // 新增一个 Tab 页，并自动切换到新页（联动输出）
      this._tsmAddTab = () => {
        if (this._tabs.length >= MAX_TAB_COUNT) return;
        this._tabs.push("");
        this._names.push("");
        const i = this._tabs.length - 1;
        if (this._tsmDom) this._tsmDom.input.max = String(i);
        this._tsmSetCurTab(i);
        this._tsmSyncContent();
      };
      // 双击 Tab 标签：就地编辑标题
      this._tsmRenameTab = (i) => {
        const dom = this._tsmDom;
        if (!dom) return;
        const el = dom.tabbar.children[i];
        if (!el) return;
        const inp = document.createElement("input");
        inp.className = "tsm-rename";
        inp.value = this._names[i] || ("Tab " + i);
        inp.maxLength = 40;
        el.textContent = "";
        el.appendChild(inp);
        inp.focus();
        inp.select();
        const commit = () => {
          const v = inp.value.trim();
          this._names[i] = v;
          this._tsmSyncContent();
          this._tsmRefresh();
        };
        inp.addEventListener("blur", commit);
        inp.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter") { inp.blur(); }
          else if (e.key === "Escape") { inp.value = this._names[i] || ("Tab " + i); inp.blur(); }
        });
      };
      // 自定义二次确认弹窗：覆盖全屏，确保任何情况下都能弹出
      this._tsmConfirm = (msg, onOk) => {
        const ov = document.createElement("div");
        ov.className = "tsm-modal";
        const box = document.createElement("div");
        box.className = "tsm-modal-box";
        const m = document.createElement("div");
        m.className = "tsm-modal-msg";
        m.textContent = msg;
        const btns = document.createElement("div");
        btns.className = "tsm-modal-btns";
        const cancel = document.createElement("button");
        cancel.className = "tsm-btn tsm-modal-cancel";
        cancel.textContent = tr("取消");
        const ok = document.createElement("button");
        ok.className = "tsm-btn tsm-modal-ok";
        ok.textContent = tr("确认关闭");
        const close = () => ov.remove();
        cancel.addEventListener("click", close);
        ok.addEventListener("click", () => { close(); onOk(); });
        btns.append(cancel, ok);
        box.append(m, btns);
        ov.append(box);
        document.body.append(ov);
      };
      // 关闭一个 Tab 页：无论内容是否为空，一律弹出二次确认（内容会丢失）；
      // 始终至少保留一页。
      this._tsmCloseTab = (i) => {
        if (!this._tabs || this._tabs.length <= 1) return;
        const name = this._names[i] || ("Tab " + i);
        this._tsmConfirm(
          tr("确定要关闭 Tab「{name}」吗？\n关闭后该页内容将丢失，且不可恢复。", { name }),
          () => {
            this._tabs.splice(i, 1);
            this._names.splice(i, 1);
            let cur = this._tsmCurTab;
            if (cur >= this._tabs.length) cur = this._tabs.length - 1;
            this._tsmCurTab = cur;
            const dom = this._tsmDom;
            if (dom) {
              dom.input.max = String(Math.max(0, this._tabs.length - 1));
              dom.input.value = String(cur);
            }
            this._tsmSyncIdx();
            this._tsmSyncContent();
            this._tsmRefresh();
          });
      };
      this._tsmRefresh = () => {
        const dom = this._tsmDom;
        if (!dom) return;
        dom.tabbar.innerHTML = "";
        const n = this._tabs.length;
        for (let i = 0; i < n; i++) {
          const t = document.createElement("div");
          t.className = "tsm-tab" + (i === this._tsmCurTab ? " active" : "");
          const nameEl = document.createElement("span");
          nameEl.className = "tsm-tab-name";
          nameEl.textContent = this._names[i] || ("Tab " + i);
          t.appendChild(nameEl);
          t.dataset.idx = String(i);
          t.title = tr("点击切换该页（联动输出）；双击可编辑标题");
          t.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this._tsmOnTabClick(i);
          });
          t.addEventListener("dblclick", (ev) => {
            ev.stopPropagation();
            this._tsmRenameTab(i);
          });
          // 每个 Tab 页右上角 × 关闭按钮：关闭前若该页有内容则弹确认，防止误删
          const x = document.createElement("span");
          x.className = "tsm-tab-x";
          x.textContent = "×";
          x.title = tr("关闭该 Tab 页（有内容会先确认）");
          x.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this._tsmCloseTab(i);
          });
          t.append(x);
          dom.tabbar.append(t);
        }
        // 末尾「+」按钮
        const add = document.createElement("div");
        add.className = "tsm-tab tsm-add";
        add.textContent = "+";
        add.title = tr("新增一个 Tab 页");
        add.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._tsmAddTab();
        });
        dom.tabbar.append(add);
        // 更新 Tab索引 上限
        const maxI = Math.max(0, n - 1);
        dom.input.max = String(maxI);
        dom.ta.value = this._tabs[this._tsmCurTab] || "";
      };
      this._tsmSyncIdx = () => {
        const w = this.widgets?.find((x) => x.name === "Tab索引");
        if (w) w.value = parseInt(this._tsmDom?.input?.value, 10) || 0;
      };
      this._tsmSyncContent = () => {
        const w = this.widgets?.find((x) => x.name === "tabs_content");
        if (w) w.value = JSON.stringify({ tabs: this._tabs, names: this._names });
      };
      this._tsmLoad = () => {
        const contentW = this.widgets?.find((x) => x.name === "tabs_content");
        let data = {};
        try { data = JSON.parse(contentW?.value || "{}"); } catch (e) { /* 忽略 */ }
        const tabs = Array.isArray(data?.tabs) ? data.tabs : [];
        const names = Array.isArray(data?.names) ? data.names : [];
        this._tabs = tabs.length > 0 ? tabs.map((v) => (v == null ? "" : String(v))) : [""];
        this._names = names.map((v) => (v == null ? "" : String(v)));
        while (this._names.length < this._tabs.length) this._names.push("");
        // 裁剪末尾连续的空 Tab（无标题且无内容），避免历史数据残留一长串空页；
        // 默认只保留 1 个 Tab，需要时用末尾「+」按钮按需新增。
        while (this._tabs.length > 1) {
          const li = this._tabs.length - 1;
          const emptyTab = (this._tabs[li] || "").trim() === "";
          const emptyName = (this._names[li] || "").trim() === "";
          if (emptyTab && emptyName) {
            this._tabs.pop();
            this._names.pop();
          } else break;
        }
        const idxW = this.widgets?.find((x) => x.name === "Tab索引");
        let idx = 0;
        if (idxW && idxW.value != null) {
          const n = parseInt(idxW.value, 10);
          if (!Number.isNaN(n)) idx = n;
        }
        idx = Math.max(0, Math.min(this._tabs.length - 1, idx));
        if (this._tsmDom) {
          this._tsmDom.input.value = String(idx);
          this._tsmDom.input.max = String(Math.max(0, this._tabs.length - 1));
        }
        this._tsmCurTab = idx;
        this._tsmRefresh();
      };
      // 语言切换时重设本节点全部静态文案并重建 Tab 栏（用户数据不翻译）。
      this._tsmLocalize = () => {
        const dom = this._tsmDom;
        if (!dom) return;
        const topKids = dom.top?.children || [];
        if (topKids[0]) topKids[0].textContent = tr("Tab索引");
        dom.input.title = tr("决定节点最终输出哪个 Tab 页的内容，索引从 0 开始");
        if (topKids[2]) {
          topKids[2].textContent = tr("联动切换");
          topKids[2].title = tr("修改 Tab 索引后点击，下方 Tab 页自动切换到对应索引的页");
        }
        dom.ta.placeholder = tr("在此输入当前 Tab 页的多行文本…");
        this._tsmRefresh();
      };
      this._tsmLoad();
      return r;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      setTimeout(() => {
        if (typeof this._tsmLoad === "function") this._tsmLoad();
      }, 0);
      return r;
    };
  },
});

// 全局语言切换联动：切换语言后刷新所有 TabStringMultiline 节点。
window.addEventListener("openkit:langchange", () => {
  try {
    (app.graph?._nodes || []).forEach((n) => {
      if (n?.type !== NODE_NAME) return;
      if (typeof n._tsmLocalize === "function") n._tsmLocalize();
    });
    OKT.applyNodeTitles();
  } catch (e) { /* one node failing must not stop the rest */ }
});
