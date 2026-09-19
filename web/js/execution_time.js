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
  return m + "分" + s + "秒";
}

/* ---------------- 全局状态 ---------------- */

let runningData = { nodes: [], total: null };
let lastRunData = null;
let execStartTs = null;
let rafId = null;
let lastRafAt = 0;
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
const TIMER_POS_KEY = "openkit_et_timer_pos";

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
  timerEl.textContent = "0分0秒";

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
  timerEl.textContent = "0分0秒";
}

function updateTimer() {
  if (!timerEl || execStartTs === null) return;
  timerEl.textContent = fmtTotal(performance.now() - execStartTs);
}

function freezeTimer() {
  if (execStartTs !== null && timerEl) {
    timerEl.textContent = fmtTotal(performance.now() - execStartTs);
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

    ctx.fillStyle = "rgba(15,31,15,0.92)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(0, badgeY, tw + padX * 2, 18, 4);
    } else {
      ctx.rect(0, badgeY, tw + padX * 2, 18);
    }
    ctx.fill();
    ctx.strokeStyle = "#f0f050";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = "#f0f050";
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
  ["Node ID", "Title", "Time", "Last", "Diff", "VRAM"].forEach((t) => {
    const th = document.createElement("th");
    th.textContent = t;
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
    ["Max", "", fmtTime(maxTime), "", "", fmtBytes(maxVram, 1)].forEach((t, i) => {
      const td = document.createElement("td");
      td.style.textAlign = "right";
      td.textContent = t;
      trMax.appendChild(td);
    });
    tfoot.appendChild(trMax);

    const trTotal = document.createElement("tr");
    ["Total", "", fmtTime(runningData.total),
     prevTotal != null ? fmtTime(prevTotal) : "", diffText, ""].forEach((t, i) => {
      const td = document.createElement("td");
      td.style.textAlign = "right";
      td.textContent = t;
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
      });
      runningData = { nodes: [], total: null };
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
      refreshTable();
    });
  },

  // 对所有节点类型注入 badge 绘制（含无 onDrawForeground 的）
  async beforeRegisterNodeDef(nodeType) {
    try {
      const orig = nodeType.prototype.onDrawForeground;
      nodeType.prototype.onDrawForeground = function (ctx) {
        return drawBadge(this, orig, arguments);
      };
    } catch (e) {
      console.warn("[Openkit ET] beforeRegisterNodeDef error:", e);
    }

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

        this.addWidget("button", "Export CSV", null, () => {
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

  // 运行时创建的节点也注入 badge
  async nodeCreated(node) {
    if (node._ok_et_badged) return;
    try {
      const orig = node.onDrawForeground;
      node.onDrawForeground = function (ctx) {
        return drawBadge(this, orig, arguments);
      };
      node._ok_et_badged = true;
    } catch (e) { /* ignore */ }
  },

  async loadedGraphNode(node) {
    if (node._ok_et_badged) return;
    try {
      const orig = node.onDrawForeground;
      node.onDrawForeground = function (ctx) {
        return drawBadge(this, orig, arguments);
      };
      node._ok_et_badged = true;
    } catch (e) { /* ignore */ }
  },
});
