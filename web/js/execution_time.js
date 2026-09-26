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
    "History": "历史记录", "Latest run": "最新运行", "Clear history": "清除历史",
    "No history yet": "暂无历史记录",
    "Clear this workflow's execution history?": "清除本工作流的全部执行历史记录？",
  },
  en: {
    "分": "m", "秒": "s",
    "Node ID": "Node ID", "Title": "Title", "Time": "Time", "Last": "Last",
    "Diff": "Diff", "VRAM": "VRAM", "Max": "Max", "Total": "Total",
    "Export CSV": "Export CSV",
    "History": "History", "Latest run": "Latest run", "Clear history": "Clear history",
    "No history yet": "No history yet",
    "Clear this workflow's execution history?": "Clear this workflow's execution history?",
  },
};
function t(s) {
  // 本模块词条以本地 I18N_MAP 为第一优先（含"分/秒"等单位，必须随语言切换），
  // 未收录的再回退 OKT.tr 全局字典。
  let lang = (OKT && OKT.lang) || "zh";
  try {
    const saved = localStorage.getItem("openkit_lang");
    if (saved) lang = saved;
  } catch (e) { /* ignore */ }
  const map = I18N_MAP[lang] || I18N_MAP.zh;
  if (map[s] !== undefined) return map[s];
  if (OKT && typeof OKT.tr === "function") {
    try { return OKT.tr(s); } catch (e) { /* ignore */ }
  }
  return s;
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

// 根据 total 数量级选统一单位，返回 "used/total unit"（如 6.9/16.0 GB）；total 为空返回 "—"
function fmtBytesPair(used, total) {
  if (total === null || total === undefined || total === 0) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(total) / Math.log(k));
  const unit = sizes[i] || "TB";
  const u = ((used || 0) / Math.pow(k, i)).toFixed(1);
  const t = (total / Math.pow(k, i)).toFixed(1);
  return u + "/" + t + " " + unit;
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

// 任务级独占量（后端 openkit.exec_live 实时推送 / openkit.exec_end 冻结）
let taskLiveVram = 0;   // 运行中：当前任务累计独占显存增量
let taskLiveRam = 0;    // 运行中：当前任务累计独占内存增量
let taskFinalVram = 0;  // 运行结束后冻结的任务独占显存
let taskFinalRam = 0;   // 运行结束后冻结的任务独占内存

// 表格列排序状态：null = 恢复 source.nodes 原始顺序；否则 {col, dir}，dir=1 升序 / -1 降序
let tableSort = null;
// 系统级实时显存/内存占用（轮询 /openkit_media/system_stats）；{vram:{used,total}|null, ram:{...}|null}
let sysStats = { vram: null, ram: null };
let sysStatsTimer = null;

/* ---------------- 历史持久化（按工作流结构 hash 隔离，LRU 淘汰） ----------------
 * localStorage["openkit_et_history_v1"] 结构：
 *   { "wf_<hash>": { workflow_name, runs: [
 *       { prompt_id, timestamp, total_ms, nodes:[{node,class_type,execution_time,vram_used}] } ] } }
 * - 每个工作流保留最近 MAX_RUNS_PER_WF 次；全局最多 MAX_WORKFLOWS 个工作流，超出按最近运行时间 LRU 淘汰
 * - hash 只覆盖节点(id,type)与连接拓扑，排除 pos/size/widgets_values，
 *   拖动节点、改 seed、改提示词不会让历史失效
 * - viewRun：用户在"历史记录"下拉中查看的某次运行（null = 显示当前实时数据）
 */
const HIST_KEY = "openkit_et_history_v1";
const MAX_RUNS_PER_WF = 10;
const MAX_WORKFLOWS = 50;
let viewRun = null; // { run, prev } 或 null

function fnvHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}

function workflowHash() {
  try {
    const nodes = (app.graph?._nodes || []).map((n) => [n.id, n.type]);
    const links = [];
    const ls = app.graph?.links;
    const pushLink = (l) => {
      if (!l) return;
      links.push([l.origin_id, l.origin_slot, l.target_id, l.target_slot]);
    };
    if (Array.isArray(ls)) ls.forEach(pushLink);
    else if (ls) Object.keys(ls).forEach((k) => pushLink(ls[k]));
    links.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return fnvHash(JSON.stringify({ n: nodes, l: links }));
  } catch (e) {
    return null;
  }
}

function readHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY)) || {}; }
  catch (e) { return {}; }
}

function _lastTs(slot) {
  const r = slot?.runs;
  return (r && r.length) ? r[r.length - 1].timestamp : 0;
}

function writeHistory(h) {
  const doWrite = (obj) => { localStorage.setItem(HIST_KEY, JSON.stringify(obj)); };
  try {
    doWrite(h);
    return true;
  } catch (e) {
    // 配额溢出：只保留最近 25 个工作流后重试一次，仍失败则放弃（不影响主功能）
    try {
      const keys = Object.keys(h).sort((a, b) => _lastTs(h[b]) - _lastTs(h[a]));
      keys.slice(25).forEach((k) => delete h[k]);
      doWrite(h);
      return true;
    } catch (e2) {
      console.warn("[Openkit ET] history persist failed:", e2);
      return false;
    }
  }
}

function recordRun(payload) {
  const hash = workflowHash();
  if (!hash) return;
  const h = readHistory();
  const key = "wf_" + hash;
  const wfName = app.graph?._workflow?.name || null;
  const slot = h[key] || { workflow_name: wfName, runs: [] };
  if (wfName) slot.workflow_name = wfName;
  slot.runs.push(payload);
  if (slot.runs.length > MAX_RUNS_PER_WF) slot.runs = slot.runs.slice(-MAX_RUNS_PER_WF);
  h[key] = slot;
  const keys = Object.keys(h);
  if (keys.length > MAX_WORKFLOWS) {
    keys.sort((a, b) => _lastTs(h[b]) - _lastTs(h[a]));
    keys.slice(MAX_WORKFLOWS).forEach((k) => delete h[k]);
  }
  writeHistory(h);
}

function getRuns() {
  const hash = workflowHash();
  if (!hash) return [];
  return readHistory()["wf_" + hash]?.runs || [];
}

function clearRuns() {
  const hash = workflowHash();
  if (!hash) return;
  const h = readHistory();
  delete h["wf_" + hash];
  writeHistory(h);
}

// 把某次运行回灌为节点 badge（灰色，标记 restored，区别于当前运行的亮黄）
function applyRunToBadges(run) {
  if (!app.graph) return;
  app.graph._nodes.forEach((n) => {
    delete n._ok_et_time;
    delete n._ok_et_vram;
    delete n._ok_et_ram;
    delete n._ok_et_restored;
  });
  if (!run) { app.graph.setDirtyCanvas(true, false); return; }
  (run.nodes || []).forEach((item) => {
    const n = app.graph.getNodeById(item.node);
    if (n && (!item.class_type || !n.type || item.class_type === n.type)) {
      n._ok_et_time = item.execution_time;
      n._ok_et_vram = item.vram_used;
      n._ok_et_ram = item.ram_used || 0;
      n._ok_et_restored = true;
    }
  });
  app.graph.setDirtyCanvas(true, false);
}

// 刷新后用最近一次运行填充表格数据（runningData 本是易失内存态）
function hydrateRunningFromRun(run) {
  if (!run) {
    runningData = { nodes: [], total: null };
    taskFinalVram = 0;
    taskFinalRam = 0;
  } else {
    runningData = {
      nodes: (run.nodes || []).map((n) => ({ ...n })),
      total: run.total_ms,
      restored: true,
    };
    taskFinalVram = run.task_vram || 0;
    taskFinalRam = run.task_ram || 0;
  }
  lastRunData = null;
}

function pad2(n) { return String(n).padStart(2, "0"); }
function fmtRunLabel(r) {
  const d = new Date(r.timestamp);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} · ${fmtTotal(r.total_ms)}`;
}

// 历史下拉选项：第 1 项"最新运行"，其后按时间倒序编号
function historyOptions() {
  const opts = [t("Latest run")];
  getRuns().slice().reverse().forEach((r, i) => opts.push(`${i + 1}. ${fmtRunLabel(r)}`));
  return opts;
}

// 用户从下拉选择某项
function selectHistory(label) {
  const desc = getRuns().slice().reverse(); // 最新在前
  if (!label || label === t("Latest run")) {
    viewRun = null;
    const latest = desc[0] || null;
    applyRunToBadges(latest);
    if (latest) hydrateRunningFromRun(latest);
    refreshTable();
    return;
  }
  const m = /^(\d+)\./.exec(label);
  if (!m) return;
  const idx = parseInt(m[1], 10) - 1;
  const run = desc[idx];
  if (!run) return;
  // 正序中该条的前一条作为 diff 对比基准
  const ascIdx = desc.length - 1 - idx;
  const all = getRuns();
  const prev = ascIdx > 0 ? all[ascIdx - 1] : null;
  viewRun = { run, prev };
  applyRunToBadges(run);
  refreshTable();
}

// 同步所有执行时间统计节点上的历史下拉
function syncHistoryWidgets(selectedLabel) {
  if (!app.graph) return;
  app.graph._nodes.forEach((node) => {
    if (node.comfyClass !== "OpenkitExecutionTime" || !node.widgets) return;
    const w = node.widgets.find((x) => x.name === "History");
    if (!w) return;
    if (w.options) w.options.values = historyOptions;
    if (selectedLabel !== undefined) w.value = selectedLabel;
  });
}

// 加载/切换工作流后恢复最近一次运行（badge + 表格 + 下拉）
function restoreAfterLoad() {
  let runs = getRuns();
  // 一次性迁移旧版单条记录 openkit_et_last_run：归属到当前工作流
  if (!runs.length) {
    try {
      const legacy = localStorage.getItem("openkit_et_last_run");
      if (legacy) {
        const old = JSON.parse(legacy);
        if (old && Array.isArray(old.nodes)) {
          recordRun({
            prompt_id: old.prompt_id || null,
            timestamp: old.timestamp || Date.now(),
            total_ms: old.total_ms,
            nodes: old.nodes,
          });
          runs = getRuns();
        }
        localStorage.removeItem("openkit_et_last_run");
      }
    } catch (e) { /* ignore */ }
  }
  const latest = runs.length ? runs[runs.length - 1] : null;
  viewRun = null;
  hydrateRunningFromRun(latest);
  applyRunToBadges(latest);
  refreshTable();
  syncHistoryWidgets(t("Latest run"));
  // 刷新顶部悬浮计时器（ensureTimer 在 setup 时已创建，此处仅更新显示）
  if (timerEl) {
    if (!isTimerMinimized() && timerTextEl) {
      timerTextEl.textContent = (runningData.total != null) ? fmtTotal(runningData.total) : fmtTotal(0);
    }
    updateMetricLine();
  }
}

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
let metricEl = null;     // 第二行：任务独占 显存/内存
let minBtn = null;
let timerAborted = false; // run interrupted/errored: keep red timer
const TIMER_POS_KEY = "openkit_et_timer_pos";
const TIMER_MIN_KEY = "openkit_et_timer_minimized";

function isTimerMinimized() {
  return !!timerEl && timerEl.classList.contains("ok-et-minimized");
}

// 顶部第二行：显存（绿）→ · → 内存（蓝），显示系统级实时占用/总量（来自 system_stats 轮询）
function updateMetricLine() {
  if (!metricEl) return;
  const vramPair = sysStats.vram ? fmtBytesPair(sysStats.vram.used, sysStats.vram.total) : "—";
  const ramPair = sysStats.ram ? fmtBytesPair(sysStats.ram.used, sysStats.ram.total) : "—";
  metricEl.innerHTML =
    '<span style="color:#a0d88a">显存 ' + vramPair + '</span>' +
    '<span style="margin:0 6px;color:#555">·</span>' +
    '<span style="color:#82c8e0">内存 ' + ramPair + '</span>';
}

// 应用/恢复最小化样式
function applyMinimize(minimized) {
  if (!timerEl || !timerTextEl) return;
  if (minimized) {
    timerEl.style.padding = "4px 8px";
    timerEl.style.fontSize = "12px";
    timerEl.style.flexDirection = "row";
    if (metricEl) metricEl.style.display = "none";
    timerTextEl.textContent = "●";
  } else {
    timerEl.style.padding = "6px 14px 5px";
    timerEl.style.fontSize = "15px";
    timerEl.style.flexDirection = "column";
    if (metricEl) metricEl.style.display = "";
    if (execStartTs !== null) timerTextEl.textContent = fmtTotal(performance.now() - execStartTs);
    else if (runningData.total !== null) timerTextEl.textContent = fmtTotal(runningData.total);
    else timerTextEl.textContent = fmtTotal(0);
  }
}

function ensureTimer() {
  if (timerEl) return;
  // 双计时器防护：若 Dev-Utils-fix 计时器已存在则跳过（功能完全重叠）
  try {
    if (document.getElementById("ty-et-total-timer")) {
      console.info("[Openkit ET] Dev-Utils-fix timer detected, skipping Openkit timer creation.");
      return;
    }
  } catch (e) { /* ignore */ }
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
    color: "#f0e68c",
    padding: "6px 14px 5px",
    borderRadius: "12px",
    fontFamily: '"Cascadia Code","Fira Code","Consolas",monospace',
    fontSize: "15px",
    fontWeight: "600",
    letterSpacing: "0.5px",
    cursor: "grab",
    userSelect: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    lineHeight: "1.3",
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
  });

  // 时间文本用独立 span；最小化按钮放在其外，避免 textContent 清除子元素
  timerTextEl = document.createElement("span");
  timerTextEl.textContent = fmtTotal(0);
  // 第二行：RAM / VRAM 实时指标
  metricEl = document.createElement("span");
  Object.assign(metricEl.style, {
    fontSize: "10px", fontWeight: "500", letterSpacing: "0.3px",
    marginTop: "1px", opacity: "0.85",
  });
  minBtn = document.createElement("span");
  minBtn.textContent = "−";
  Object.assign(minBtn.style, {
    marginLeft: "8px", cursor: "pointer", fontSize: "12px",
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
  // 第一行：时间 + 最小化按钮
  const row1 = document.createElement("span");
  Object.assign(row1.style, { display: "flex", alignItems: "center" });
  row1.appendChild(timerTextEl);
  row1.appendChild(minBtn);
  timerEl.appendChild(row1);
  timerEl.appendChild(metricEl);

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
  // 空闲时显示一次上次冻结的任务独占量（无运行时显示 0）
  updateMetricLine();
}

function showTimer() {
  ensureTimer();
  execStartTs = performance.now();
  timerAborted = false;
  timerEl.style.color = "#f0e68c";
  if (!isTimerMinimized()) timerTextEl.textContent = fmtTotal(0);
  updateMetricLine();
}

function updateTimer() {
  if (!timerEl || execStartTs === null) return;
  if (isTimerMinimized()) return;
  timerTextEl.textContent = fmtTotal(performance.now() - execStartTs);
  updateMetricLine();
}

function freezeTimer() {
  if (execStartTs !== null && timerEl) {
    if (!isTimerMinimized()) timerTextEl.textContent = fmtTotal(performance.now() - execStartTs);
    timerEl.style.color = timerAborted ? "#f07070" : "#aaaaaa";
  }
  execStartTs = null;
  // 冻结后用当前 live 值刷新一次第二行（中断/错误时即当前任务独占量）
  updateMetricLine();
}

// 轮询系统级显存/内存占用；失败静默保留上次值，不刷屏
async function pollSysStats() {
  try {
    const resp = await fetch("openkit_media/system_stats", { cache: "no-store" });
    if (!resp.ok) return;
    const data = await resp.json();
    sysStats.vram = data.vram || null;
    sysStats.ram = data.ram || null;
    updateMetricLine();
  } catch (e) { /* 静默保留上次值 */ }
}

function startSysStatsPolling() {
  if (sysStatsTimer !== null) return;
  pollSysStats(); // 首次立即取一次
  sysStatsTimer = setInterval(pollSysStats, 1500);
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
      text = fmtTime(node._ok_et_time)
        + " 显存 " + fmtBytes(node._ok_et_vram, 1)
        + " 内存 " + fmtBytes(node._ok_et_ram, 1);
    } else if (node._ok_et_running !== undefined) {
      text = fmtTime(performance.now() - node._ok_et_running)
        + " 显存 " + fmtBytes(node._ok_et_live_vram || 0, 1)
        + " 内存 " + fmtBytes(node._ok_et_live_ram || 0, 1);
    }
    if (!text) return r;

    ctx.save();
    ctx.font = "11px sans-serif";
    const tw = ctx.measureText(text).width;
    const padX = 7;
    const badgeY = -TITLE_H - 19;
    const bh = 17;
    const badgeColor = isRestored ? "#8a93a3" : "#f0e68c";

    // 无描边胶囊：柔和深色底 + 精致圆角，文字带轻微阴影
    ctx.fillStyle = isRestored ? "rgba(40,42,48,0.72)" : "rgba(28,30,38,0.78)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(0, badgeY, tw + padX * 2, bh, 8);
    } else {
      ctx.rect(0, badgeY, tw + padX * 2, bh);
    }
    ctx.fill();

    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = badgeColor;
    ctx.fillText(text, padX, badgeY + 12);
    ctx.restore();
  } catch (e) {
    console.warn("[Openkit ET] badge error:", e);
  }
  return r;
}

/* ---------------- 表格 ---------------- */

// 列排序取值：col 0=NodeID 1=Title 2=Time 3=Last 4=Diff 5=VRAM；无值返回 null（排末尾）
function sortNodeKey(item, col, prevPool) {
  const node = app.graph.getNodeById(item.node);
  const title = node?.title ?? item.class_type ?? String(item.node);
  const prev = prevPool.find((x) => x.node === item.node)?.execution_time;
  switch (col) {
    case 0: return item.node;
    case 1: return title;
    case 2: return item.execution_time;
    case 3: return prev !== undefined ? prev : null;
    case 4: return prev !== undefined ? (item.execution_time - prev) : null;
    case 5: return item.vram_used;
    default: return null;
  }
}

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
  ["Node ID", "Title", "Time", "Last", "Diff", "VRAM"].forEach((hdr, idx) => {
    const th = document.createElement("th");
    let label = t(hdr);
    if (tableSort && tableSort.col === idx) label += (tableSort.dir === 1 ? " ▲" : " ▼");
    th.textContent = label;
    Object.assign(th.style, thStyle);
    th.style.cursor = "pointer";
    th.title = "点击排序";
    th.onclick = () => {
      // 三态循环：升序 -> 降序 -> 恢复默认；切到别的列默认升序
      if (!tableSort || tableSort.col !== idx) tableSort = { col: idx, dir: 1 };
      else if (tableSort.dir === 1) tableSort = { col: idx, dir: -1 };
      else tableSort = null;
      refreshTable();
    };
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);
  table.appendChild(tbody);
  table.appendChild(tfoot);

  // 数据源：查看历史时用 viewRun，否则用当前（或刷新后恢复的）runningData
  const source = viewRun
    ? { nodes: viewRun.run.nodes || [], total: viewRun.run.total_ms }
    : runningData;
  const prevPool = viewRun ? (viewRun.prev?.nodes || []) : (lastRunData?.nodes || []);
  const prevTotal = viewRun ? viewRun.prev?.total_ms : lastRunData?.total;

  if (!source.nodes.length) return table;

  // 按 tableSort 生成排序后的节点拷贝（不改原数组）；tfoot 汇总行始终固定底部不参与排序
  let displayNodes = source.nodes;
  if (tableSort) {
    const col = tableSort.col;
    const dir = tableSort.dir;
    displayNodes = source.nodes.slice().sort((a, b) => {
      const va = sortNodeKey(a, col, prevPool);
      const vb = sortNodeKey(b, col, prevPool);
      const na = (va === null || va === undefined);
      const nb = (vb === null || vb === undefined);
      if (na && nb) return 0;
      if (na) return 1;   // 无值统一排末尾
      if (nb) return -1;
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb, "zh") * dir;
      return (va - vb) * dir;
    });
  }

  let maxTime = 0, maxVram = 0;

  displayNodes.forEach((item) => {
    const node = app.graph.getNodeById(item.node);
    const title = node?.title ?? item.class_type ?? item.node;
    const prev = prevPool.find((x) => x.node === item.node)?.execution_time;

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

  if (source.total !== null && source.total !== undefined) {
    let diffText = "", diffColor = "white";
    if (prevTotal !== undefined && prevTotal !== null) {
      const d = source.total - prevTotal;
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
    [t("Total"), "", fmtTime(source.total),
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
    startSysStatsPolling();

    // 工作流加载 / 切换工作流 tab 后恢复历史 badge 与表格
    // （graph.configure 会重建节点对象，易失的 _ok_et_* 属性全部丢失）
    try {
      const origLoad = app.loadGraphData;
      if (typeof origLoad === "function") {
        app.loadGraphData = async function (...args) {
          const r = await origLoad.apply(this, args);
          // 两次恢复（100ms / 500ms），兼容节点异步重建；操作幂等
          setTimeout(() => { try { restoreAfterLoad(); } catch (e) { /* ignore */ } }, 100);
          setTimeout(() => { try { restoreAfterLoad(); } catch (e) { /* ignore */ } }, 500);
          return r;
        };
      }
    } catch (e) { /* ignore */ }

    // 运行开始：重置数据
    api.addEventListener("execution_start", () => {
      startRaf();
      showTimer();
      if (runningData.total !== null) lastRunData = { ...runningData };
      // 重置任务级独占量
      taskLiveVram = 0;
      taskLiveRam = 0;
      taskFinalVram = 0;
      taskFinalRam = 0;
      app.graph._nodes.forEach((n) => {
        delete n._ok_et_time;
        delete n._ok_et_vram;
        delete n._ok_et_ram;
        delete n._ok_et_running;
        delete n._ok_et_restored;
        delete n._ok_et_live_vram;
        delete n._ok_et_live_ram;
      });
      runningData = { nodes: [], total: null, aborted: false };
      viewRun = null;
      syncHistoryWidgets(t("Latest run"));
    });

    // 节点运行中每 ~500ms 推送独占量（节点级 + 任务级）
    api.addEventListener("openkit.exec_live", ({ detail }) => {
      const node = app.graph.getNodeById(detail.node);
      if (node) {
        node._ok_et_live_vram = detail.vram_delta || 0;
        node._ok_et_live_ram = detail.ram_delta || 0;
      }
      taskLiveVram = detail.task_vram_delta || 0;
      taskLiveRam = detail.task_ram_delta || 0;
    });

    // 节点开始执行：实时计时
    api.addEventListener("executing", ({ detail }) => {
      // ComfyUI 0.34+ detail 可能是 {node, display_node, prompt_id} 对象或字符串
      const nodeId = typeof detail === "object" ? detail?.node : detail;
      if (!nodeId) return; // 运行结束
      const node = app.graph.getNodeById(nodeId);
      if (node) {
        node._ok_et_running = performance.now();
        node._ok_et_live_vram = 0;
        node._ok_et_live_ram = 0;
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
        node._ok_et_ram = detail.ram_used || 0;
        delete node._ok_et_running;
      }
      const idx = runningData.nodes.findIndex((x) => x.node === detail.node);
      const data = {
        node: detail.node,
        execution_time: detail.execution_time,
        vram_used: detail.vram_used,
        ram_used: detail.ram_used || 0,
        class_type: detail.class_type,
      };
      if (idx >= 0) runningData.nodes[idx] = data;
      else runningData.nodes.push(data);
      refreshTable();
    });

    // 运行结束
    api.addEventListener("openkit.exec_end", ({ detail }) => {
      stopRaf();
      // 冻结最终任务独占量
      taskFinalVram = detail.vram_used || 0;
      taskFinalRam = detail.ram_used || 0;
      freezeTimer();
      updateMetricLine();
      runningData.total = detail.execution_time;
      // 清除残留的运行中标记（pending/缓存节点可能未收到 exec_time）
      app.graph._nodes.forEach((n) => { delete n._ok_et_running; });
      // 持久化到按工作流隔离的历史（中断的不持久化）
      if (!runningData.aborted) {
        try {
          const payload = {
            prompt_id: currentPromptId || detail.prompt_id || null,
            timestamp: Date.now(),
            total_ms: detail.execution_time,
            task_vram: detail.vram_used || 0,
            task_ram: detail.ram_used || 0,
            nodes: runningData.nodes.map((n) => ({
              node: n.node,
              class_type: n.class_type,
              execution_time: n.execution_time,
              vram_used: n.vram_used,
              ram_used: n.ram_used || 0,
            })),
          };
          recordRun(payload);
        } catch (e) { /* ignore */ }
      }
      currentPromptId = null;
      viewRun = null;
      refreshTable();
      syncHistoryWidgets(t("Latest run"));
    });

    // 中断：立即停止计时器，红色冻结，清运行中状态
    // 注意：ComfyUI 前端事件名是 execution_interrupted，不是 interrupt（interrupt 不存在）
    api.addEventListener("execution_interrupted", () => {
      stopRaf();
      if (timerEl && execStartTs !== null) {
        if (!isTimerMinimized()) timerTextEl.textContent = fmtTotal(performance.now() - execStartTs);
        timerEl.style.color = "#f07070";
      }
      execStartTs = null;
      timerAborted = true;
      updateMetricLine();
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
      timerAborted = true;
      updateMetricLine();
      if (app?.graph) {
        app.graph._nodes.forEach((n) => { delete n._ok_et_running; });
        app.graph.setDirtyCanvas(true, false);
      // errored runs are not persisted
      runningData.aborted = true;
      }
    });

    // 后端上报单节点中断/异常：清除该节点运行中 badge
    api.addEventListener("openkit.exec_aborted", ({ detail }) => {
      if (detail?.node !== undefined) {
        const node = app.graph.getNodeById(detail.node);
        if (node) { delete node._ok_et_running; app.graph.setDirtyCanvas(true, false); }
      }
    });

    // 语言切换：刷新表格与画布 badge
    if (OKT && typeof OKT.onLangChange === "function") {
      OKT.onLangChange(() => {
        refreshTable();
        syncHistoryWidgets(viewRun ? undefined : t("Latest run"));
        app.graph?.setDirtyCanvas(true, false);
      });
    } else {
      // 无 OKT 回调时，轮询检测 localStorage 语言变化
      let _lastLang = (OKT && OKT.lang) || null;
      window.setInterval(() => {
        let lang = (OKT && OKT.lang) || "zh";
        try { lang = localStorage.getItem("openkit_lang") || lang; } catch (e) {}
        if (_lastLang !== null && lang !== _lastLang) {
          _lastLang = lang;
          refreshTable();
          syncHistoryWidgets(viewRun ? undefined : t("Latest run"));
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

        // 历史记录下拉：查看本工作流最近 10 次运行（刷新 / 切换 tab 后仍在）
        const historyWidget = this.addWidget(
          "combo", t("History"), t("Latest run"),
          (value) => { try { selectHistory(value); } catch (e) { /* ignore */ } },
          { values: historyOptions }
        );
        historyWidget.serialize = false;

        // 清除本工作流历史
        this.addWidget("button", t("Clear history"), null, () => {
          clearRuns();
          viewRun = null;
          hydrateRunningFromRun(null);
          applyRunToBadges(null);
          refreshTable();
          syncHistoryWidgets(t("Latest run"));
        });

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
    // 历史 badge 回灌统一在 app.loadGraphData 后的 restoreAfterLoad() 中
    // 按 workflow_hash + node_id + class_type 双键匹配完成，此处不再逐节点处理。
  },
});
