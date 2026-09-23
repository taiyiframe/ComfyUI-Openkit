/* Openkit · 执行时间统计（Execution Time）
 *
 * 功能：
 *  - 每个节点左上角 badge 显示执行耗时 + 峰值VRAM增量
 *  - 顶部悬浮总计时器（可拖动）
 *  - 节点内表格展示所有节点执行时间（与上次运行对比）+ 导出CSV
 *
 * 适配 ComfyUI 0.34.0+：
 *  - 后端直接在 execution.execute patch 入口记录开始时间，
 *    缓存命中 / pending_async / pending_subgraph / lazy PENDING 均覆盖，
 *    解决旧实现"有时候显示有时候不显示"的问题。
 *  - 前端 beforeRegisterNodeDef 对所有节点类型（含无 onDrawForeground 的）
 *    统一注入 badge 绘制。
 */

import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";

/* ---------------- i18n ----------------
 * 优先使用 openkit_i18n.js 提供的 window.OKT；否则内置简单中英文切换。
 * 语言来源：OKT.lang（若存在）→ localStorage "openkit_lang" → 默认 zh。
 */
const OKT = window.OKT || null;
const I18N_MAP = {
  zh: {
    "分": "分", "秒": "秒",
    "Node ID": "节点ID", "Title": "标题", "Time": "耗时", "Last": "上次",
    "Diff": "差异", "VRAM": "显存", "Max": "最大", "Total": "总计",
    "Export CSV": "导出CSV",
  },
  en: {
    "分": "m", "秒": "s",
    "Node ID": "Node ID", "Title": "Title", "Time": "Time", "Last": "Last",
    "Diff": "Diff", "VRAM": "VRAM", "Max": "Max", "Total": "Total",
    "Export CSV": "Export CSV",
  },
};
function t(s) {
  if (OKT && typeof OKT.t === "function") {
    try { return OKT.t(s); } catch (e) { /* ignore */ }
  }
  let lang = (OKT && OKT.lang) || "zh";
  try {
    const saved = localStorage.getItem("openkit_lang");
    if (saved) lang = saved;
  } catch (e) { /* ignore */ }
  const map = I18N_MAP[lang] || I18N_MAP.zh;
  return map[s] !== undefined ? map[s] : s;
}

/* ---------------- 工具函数 ---------------- */

function fmtTime(ms) {
  return (ms / 1000).toFixed(2) + "s";
}

function fmtBytes(bytes, decimals) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = decimals || 1;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function fmtTotal(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + t("分") + s + t("秒");
}

/* ---------------- 全局状态 ---------------- */

let runningData = { nodes: [], total: null };
let lastRunData = null;
let execStartTs = null;
let rafId = null;
let lastRafAt = 0;
let currentPromptId = null; // 最近一次运行的 prompt_id（来自后端 exec_time detail）
const RAF_INTERVAL = 100; // ~10fps 刷新画布

function startRaf() {
  stopRaf();
  const tick = (now) => {
    if (now - lastRafAt >= RAF_INTERVAL) {
      lastRafAt = now;
      if (app?.graph) app.graph.setDirtyCanvas(true, false);
      updateTimer();
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopRaf() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  lastRafAt = 0;
}

/* ---------------- 总计时器悬浮窗 ---------------- */

let timerEl = null;
let timerTextEl = null; // 独立 span 装时间文本，避免 textContent 清除最小化按钮
let minBtn = null;
const TIMER_POS_KEY = "openkit_et_timer_pos";
const TIMER_MIN_KEY = "openkit_et_timer_minimized";

function isTimerMinimized() {
  return !!timerEl && timerEl.classList.contains("ok-et-minimized");
}

// 应用/恢复最小化样式
function applyMinimize(minimized) {
  if (!timerEl || !timerTextEl) return;
  if (minimized) {
    timerEl.style.padding = "4px 8px";
    timerEl.style.fontSize = "12px";
    timerTextEl.textContent = "●";
  } else {
    timerEl.style.padding = "5px 18px";
    timerEl.style.fontSize = "15px";
    if (execStartTs !== null) timerTextEl.textContent = fmtTotal(performance.now() - execStartTs);
    else if (runningData.total !== null) timerTextEl.textContent = fmtTotal(runningData.total);
    else timerTextEl.textContent = fmtTotal(0);
  }
}

function ensureTimer() {
  if (timerEl) return;
  timerEl = document.createElement("div");
  timerEl.id = "openkit-et-timer";

  let saved = null;
  try {
    const raw = localStorage.getItem(TIMER_POS_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (e) { /* ignore */ }

  Object.assign(timerEl.style, {
    position: "fixed",
    top: saved?.top || "45px",
    left: saved?.left || "50%",
    transform: saved ? "none" : "translateX(-50%)",
    zIndex: "9999",
    background: "rgba(0,0,0,0.78)",
    color: "#f0f050",
    padding: "5px 18px",
    borderRadius: "14px",
    fontFamily: '"Cascadia Code","Fira Code","Consolas",monospace',
    fontSize: "15px",
    fontWeight: "600",
    letterSpacing: "0.5px",
    cursor: "grab",
    userSelect: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
  });

  // 时间文本用独立 span；最小化按钮放在其外，避免 textContent 清除子元素
  timerTextEl = document.createElement("span");
  timerTextEl.textContent = fmtTotal(0);
  minBtn = document.createElement("span");
  minBtn.textContent = "−";
  Object.assign(minBtn.style, {
    marginLeft: "10px", cursor: "pointer", fontSize: "12px",
    opacity: "0.7", display: "inline-block", width: "14px", textAlign: "center",
  });
  minBtn.onclick = (e) => {
    e.stopPropagation();
    const minimized = timerEl.classList.toggle("ok-et-minimized");
    applyMinimize(minimized);
    try { localStorage.setItem(TIMER_MIN_KEY, minimized ? "1" : "0"); } catch (e) { /* ignore */ }
  };
  // 阻止按钮上的 mousedown 触发计时器拖动
  minBtn.addEventListener("mousedown", (e) => e.stopPropagation());
  minBtn.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: false });
  timerEl.appendChild(timerTextEl);
  timerEl.appendChild(minBtn);

  // 读取上次最小化状态
  try {
    if (localStorage.getItem(TIMER_MIN_KEY) === "1") {
      timerEl.classList.add("ok-et-minimized");
      applyMinimize(true);
    }
  } catch (e) { /* ignore */ }

  // 拖动
  let dragging = false, dx0, dy0, sl, st;
  const onDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    const p = e.touches ? e.touches[0] : e;
    dx0 = p.clientX; dy0 = p.clientY;
    sl = timerEl.offsetLeft; st = timerEl.offsetTop;
    timerEl.style.cursor = "grabbing";
    timerEl.style.transform = "none";
    if (e.preventDefault) e.preventDefault();
  };
  const onMove = (e) => {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    timerEl.style.left = Math.max(0, sl + p.clientX - dx0) + "px";
    timerEl.style.top = Math.max(0, st + p.clientY - dy0) + "px";
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    timerEl.style.cursor = "grab";
    try {
      localStorage.setItem(TIMER_POS_KEY, JSON.stringify({
        left: timerEl.style.left, top: timerEl.style.top,
      }));
    } catch (e) { /* ignore */ }
  };
  timerEl.addEventListener("mousedown", onDown);
  timerEl.addEventListener("touchstart", onDown, { passive: false });
  window.addEventListener("mousemove", onMove);
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchend", onUp);

  document.body.appendChild(timerEl);
}

function showTimer() {
  ensureTimer();
  execStartTs = performance.now();
  timerEl.style.color = "#f0f050";
  if (!isTimerMinimized()) timerTextEl.textContent = fmtTotal(0);
}

function updateTimer() {
  if (!timerEl || execStartTs === null) return;
  if (isTimerMinimized()) return;
  timerTextEl.textContent = fmtTotal(performance.now() - execStartTs);
}

function freezeTimer() {
  if (execStartTs !== null && timerEl) {
    if (!isTimerMinimized()) timerTextEl.textContent = fmtTotal(performance.now() - execStartTs);
    timerEl.style.color = "#aaaaaa";
  }
  execStartTs = null;
}

/* ---------------- Badge 绘制 ---------------- */

function drawBadge(node, orig, restArgs) {
  const ctx = restArgs[0];
  const r = orig ? orig.apply(node, restArgs) : undefined;

  try {
    const NO_TITLE = LiteGraph?.NO_TITLE ?? 0;
    const TITLE_H = LiteGraph?.NODE_TITLE_HEIGHT ?? 24;

    if (node.flags?.collapsed) return r;
    if (node.constructor?.title_mode === NO_TITLE) return r;

    let text = "";
    let isRestored = node._ok_et_restored === true;
    if (node._ok_et_time !== undefined) {
      text = fmtTime(node._ok_et_time) + "  VRAM " + fmtBytes(node._ok_et_vram, 1);
    } else if (node._ok_et_running !== undefined) {
      text = fmtTime(performance.now() - node._ok_et_running) + " …";
    }
    if (!text) return r;

    ctx.save();
    ctx.font = "11px sans-serif";
    const tw = ctx.measureText(text).width;
    const padX = 6;
    const badgeY = -TITLE_H - 18;
    const badgeColor = isRestored ? "#8a93a3" : "#f0f050";

    ctx.fillStyle = "rgba(15,31,15,0.92)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(0, badgeY, tw + padX * 2, 18, 4);
    } else {
      ctx.rect(0, badgeY, tw + padX * 2, 18);
    }
    ctx.fill();
    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = badgeColor;
    ctx.fillText(text, padX, badgeY + 13);
    ctx.restore();
  } catch (e) {
    console.warn("[Openkit ET] badge error:", e);
  }
  return r;
}

/* ---------------- 表格 ---------------- */

function buildTable() {
  const tbody = document.createElement("tbody");
  const tfoot = document.createElement("tfoot");
  tfoot.style.background = "var(--comfy-input-bg)";

  const thStyle = { whiteSpace: "nowrap", textAlign: "right" };
  const table = document.createElement("table");
  Object.assign(table.style, {
    border: "none", borderSpacing: "0", fontSize: "13px", width: "100%",
  });

  const thead = document.createElement("thead");
  thead.style.background = "var(--comfy-input-bg)";
  const trh = document.createElement("tr");
  ["Node ID", "Title", "Time", "Last", "Diff", "VRAM"].forEach((hdr) => {
    const th = document.createElement("th");
    th.textContent = t(hdr);
    Object.assign(th.style, thStyle);
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);
  table.appendChild(tbody);
  table.appendChild(tfoot);

  if (!runningData.nodes.length) return table;

  let maxTime = 0, maxVram = 0;

  runningData.nodes.forEach((item) => {
    const node = app.graph.getNodeById(item.node);
    const title = node?.title ?? item.class_type ?? item.node;
    const prev = lastRunData?.nodes?.find((x) => x.node === item.node)?.execution_time;

    let diffText = "", diffColor = "white";
    if (prev !== undefined) {
      const d = item.execution_time - prev;
      const pct = prev > 0 ? ((d * 100) / prev).toFixed(1) + "%" : "—";
      if (d > 0) { diffColor = "#ff6b6b"; diffText = "+" + fmtTime(d) + " / +" + pct; }
      else if (d === 0) { diffText = fmtTime(d); }
      else { diffColor = "#51cf66"; diffText = fmtTime(d) + " / " + pct; }
    }

    if (item.execution_time > maxTime) maxTime = item.execution_time;
    if (item.vram_used > maxVram) maxVram = item.vram_used;

    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.onclick = () => { if (node) app.canvas.selectNode(node, false); };
    [
      item.node, title, fmtTime(item.execution_time),
      prev !== undefined ? fmtTime(prev) : "",
      diffText, fmtBytes(item.vram_used, 1),
    ].forEach((txt, i) => {
      const td = document.createElement("td");
      td.style.textAlign = "right";
      td.textContent = txt;
      if (i === 4) td.style.color = diffColor;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  if (runningData.total !== null) {
    const prevTotal = lastRunData?.total;
    let diffText = "", diffColor = "white";
    if (prevTotal !== undefined && prevTotal !== null) {
      const d = runningData.total - prevTotal;
      const pct = prevTotal > 0 ? ((d * 100) / prevTotal).toFixed(1) + "%" : "—";
      if (d > 0) { diffColor = "#ff6b6b"; diffText = "+" + fmtTime(d) + " / +" + pct; }
      else if (d === 0) { diffText = fmtTime(d); }
      else { diffColor = "#51cf66"; diffText = fmtTime(d) + " / " + pct; }
    }

    const trMax = document.createElement("tr");
    [t("Max"), "", fmtTime(maxTime), "", "", fmtBytes(maxVram, 1)].forEach((cell) => {
      const td = document.createElement("td");
      td.style.textAlign = "right";
      td.textContent = cell;
      trMax.appendChild(td);
    });
    tfoot.appendChild(trMax);

    const trTotal = document.createElement("tr");
    [t("Total"), "", fmtTime(runningData.total),
     prevTotal != null ? fmtTime(prevTotal) : "", diffText, ""].forEach((cell, i) => {
      const td = document.createElement("td");
      td.style.textAlign = "right";
      td.textContent = cell;
      if (i === 4) td.style.color = diffColor;
      trTotal.appendChild(td);
    });
    tfoot.appendChild(trTotal);
  }

  return table;
}

function exportCSV(tableEl) {
  const rows = tableEl.querySelectorAll("tr");
  const csv = [];
  rows.forEach((row) => {
    const cells = row.querySelectorAll("td, th");
    const line = [];
    cells.forEach((c) => {
      let v = c.innerText.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s\s/gm, " ");
      v = v.replace(/"/g, '""');
      line.push('"' + v + '"');
    });
    csv.push(line.join(","));
  });
  const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "execution_time_" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function refreshTable() {
  app.graph._nodes.forEach((node) => {
    if (node.comfyClass !== "OpenkitExecutionTime" || !node.widgets) return;
    const tw = node.widgets.find((w) => w.name === "Table");
    if (!tw || !tw.inputEl) return;
    while (tw.inputEl.firstChild) tw.inputEl.removeChild(tw.inputEl.firstChild);
    tw.inputEl.appendChild(buildTable());
    const cs = node.computeSize();
    node.setSize([Math.max(node.size[0], cs[0]), Math.max(node.size[1], cs[1])]);
    app.graph.setDirtyCanvas(true);
  });
}

/* ---------------- 扩展注册 ---------------- */

// 实例层统一包装 badge 绘制（消除 nodeCreated / loadedGraphNode 重复）
function wrapNodeBadge(node) {
  if (node._ok_et_badged) return;
  try {
    const orig = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
      return drawBadge(this, orig, arguments);
    };
    node._ok_et_badged = true;
  } catch (e) { /* ignore */ }
}

app.registerExtension({
  name: "Openkit.ExecutionTime",

  async setup() {
    ensureTimer();

    // 运行开始：重置数据
    api.addEventListener("execution_start", () => {
      startRaf();
      showTimer();
      if (runningData.total !== null) lastRunData = { ...runningData };
      app.graph._nodes.forEach((n) => {
        delete n._ok_et_time;
        delete n._ok_et_vram;
        delete n._ok_et_running;
        delete n._ok_et_restored;
      });
      runningData = { nodes: [], total: null, aborted: false };
    });

    // 节点开始执行：实时计时
    api.addEventListener("executing", ({ detail }) => {
      // ComfyUI 0.34+ detail 可能是 {node, display_node, prompt_id} 对象或字符串
      const nodeId = typeof detail === "object" ? detail?.node : detail;
      if (!nodeId) return; // 运行结束
      const node = app.graph.getNodeById(nodeId);
      if (node) {
        node._ok_et_running = performance.now();
        app.graph.setDirtyCanvas(true, false);
      }
    });

    // 节点执行完成（后端patch发送）
    api.addEventListener("openkit.exec_time", ({ detail }) => {
      if (detail.prompt_id !== undefined && detail.prompt_id !== null) {
        currentPromptId = detail.prompt_id;
      }
      const node = app.graph.getNodeById(detail.node);
      if (node) {
        node._ok_et_time = detail.execution_time;
        node._ok_et_vram = detail.vram_used;
        delete node._ok_et_running;
      }
      const idx = runningData.nodes.findIndex((x) => x.node === detail.node);
      const data = {
        node: detail.node,
        execution_time: detail.execution_time,
        vram_used: detail.vram_used,
        class_type: detail.class_type,
      };
      if (idx >= 0) runningData.nodes[idx] = data;
      else runningData.nodes.push(data);
      refreshTable();
    });

    // 运行结束
    api.addEventListener("openkit.exec_end", ({ detail }) => {
      stopRaf();
      freezeTimer();
      runningData.total = detail.execution_time;
      // 持久化最近一次运行（中断的不持久化）
      if (!runningData.aborted) {
        try {
          const payload = {
            prompt_id: currentPromptId || detail.prompt_id || null,
            timestamp: Date.now(),
            total_ms: detail.execution_time,
            nodes: runningData.nodes.map((n) => ({
              node: n.node,
              class_type: n.class_type,
              execution_time: n.execution_time,
              vram_used: n.vram_used,
            })),
          };
          localStorage.setItem("openkit_et_last_run", JSON.stringify(payload));
        } catch (e) { /* ignore */ }
      }
      currentPromptId = null;
      refreshTable();
    });

    // 中断：立即停止计时器，红色冻结，清运行中状态
    api.addEventListener("interrupt", () => {
      stopRaf();
      if (timerEl && execStartTs !== null) {
        if (!isTimerMinimized()) timerTextEl.textContent = fmtTotal(performance.now() - execStartTs);
        timerEl.style.color = "#f07070";
      }
      execStartTs = null;
      // 清所有节点的运行中标记
      if (app?.graph) {
        app.graph._nodes.forEach((n) => { delete n._ok_et_running; });
        app.graph.setDirtyCanvas(true, false);
      }
      // 中断运行打 aborted 标记，不进 diff 对比池、不持久化
      runningData.aborted = true;
    });

    // 执行错误：同上处理
    api.addEventListener("execution_error", () => {
      stopRaf();
      if (timerEl && execStartTs !== null) {
        if (!isTimerMinimized()) timerTextEl.textContent = fmtTotal(performance.now() - execStartTs);
        timerEl.style.color = "#f07070";
      }
      execStartTs = null;
      if (app?.graph) {
        app.graph._nodes.forEach((n) => { delete n._ok_et_running; });
        app.graph.setDirtyCanvas(true, false);
      }
    });

    // 语言切换：刷新表格与画布 badge
    if (OKT && typeof OKT.onLangChange === "function") {
      OKT.onLangChange(() => { refreshTable(); app.graph?.setDirtyCanvas(true, false); });
    } else {
      // 无 OKT 回调时，轮询检测 localStorage 语言变化
      let _lastLang = (OKT && OKT.lang) || null;
      window.setInterval(() => {
        let lang = (OKT && OKT.lang) || "zh";
        try { lang = localStorage.getItem("openkit_lang") || lang; } catch (e) {}
        if (_lastLang !== null && lang !== _lastLang) {
          _lastLang = lang;
          refreshTable();
          app.graph?.setDirtyCanvas(true, false);
        } else {
          _lastLang = lang;
        }
      }, 1000);
    }
  },

  // 仅对本节点做特殊处理（表格 widget）；badge 包装统一在实例层 nodeCreated/loadedGraphNode
  async beforeRegisterNodeDef(nodeType) {
    // 本节点特殊处理：表格 widget
    if (nodeType.comfyClass === "OpenkitExecutionTime") {
      const origCompute = nodeType.prototype.computeSize || LGraphNode.prototype.computeSize;
      nodeType.prototype.computeSize = function () {
        const os = origCompute.apply(this, arguments);
        if (this.flags?.collapsed || !this.widgets) return os;
        const tw = this.widgets.find((w) => w.name === "Table");
        if (!tw || !tw.inputEl?.firstChild) return os;
        const el = tw.inputEl.firstChild;
        const rect = el.getBoundingClientRect();
        const thH = el.tHead?.getBoundingClientRect().height || 24;
        const unscaled = 24 * rect.height / thH;
        const maxH = 320;
        return [Math.max(os[0], 560), os[1] + Math.min(unscaled, maxH) - LiteGraph.NODE_WIDGET_HEIGHT];
      };

      nodeType.prototype.onNodeCreated = function () {
        const tableWidget = {
          type: "HTML",
          name: "Table",
          draw: function (ctx, node, widgetWidth, y) {
            const mx = 12, my = 0, mb = 12;
            const elRect = ctx.canvas.getBoundingClientRect();
            const transform = new DOMMatrix()
              .scaleSelf(elRect.width / ctx.canvas.width, elRect.height / ctx.canvas.height)
              .multiplySelf(ctx.getTransform())
              .translateSelf(mx, my + y);
            Object.assign(this.inputEl.style, {
              transformOrigin: "0 0",
              transform: transform,
              left: "0px",
              top: "0px",
              position: "absolute",
              width: (widgetWidth - mx * 2) + "px",
              height: (node.size[1] - (my + mb) - y) + "px",
              overflow: "auto",
            });
          },
        };
        tableWidget.inputEl = document.createElement("div");
        document.body.appendChild(tableWidget.inputEl);

        this.addWidget("button", t("Export CSV"), null, () => {
          exportCSV(tableWidget.inputEl.firstChild);
        });
        this.addCustomWidget(tableWidget);

        this.onRemoved = () => { tableWidget.inputEl.remove(); };
        this.serialize_widgets = false;
        this.isVirtualNode = true;

        tableWidget.inputEl.appendChild(buildTable());
        this.setSize(this.computeSize());
      };
    }
  },

  // 运行时创建的节点也注入 badge（新节点不回灌历史数据）
  async nodeCreated(node) {
    wrapNodeBadge(node);
  },

  async loadedGraphNode(node) {
    wrapNodeBadge(node);
    // 回灌持久化的执行时间（仅加载已保存图时）
    try {
      const raw = localStorage.getItem("openkit_et_last_run");
      if (raw) {
        const data = JSON.parse(raw);
        const found = data.nodes?.find((n) => String(n.node) === String(node.id));
        if (found) {
          node._ok_et_time = found.execution_time;
          node._ok_et_vram = found.vram_used;
          node._ok_et_restored = true;
        }
      }
    } catch (e) { /* ignore */ }
  },
});
