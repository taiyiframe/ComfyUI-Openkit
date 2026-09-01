/* Openkit · MiniMax H3 Media Loader — frontend
 * Multi-segment (up to 32 tracks) reference-media loader for MiniMax H3.
 * Each track holds one video segment's full reference set: pictures (<=9),
 * videos (<=3) and audios (<=3), with video trim / crop and per-video
 * soundtrack split routing, matching the upstream Fantastic loader.
 */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

export const LOADER_NAME = "MiniMaxH3MediaLoader";
export const MAX_TRACKS = 32;
export const MAX = { picture: 9, video: 3, audio: 3 };
export const TRIM_FPS = 24;
export const CLIP = { min: 2, max: 15 };

const CSS = `
.okl-media { --accent:#7aa2f7; --bg:#1e2030; --panel:#181a27; --line:#2c2f42;
  font: 12px/1.45 "Segoe UI",system-ui,sans-serif; color:#d5d8e8; background:var(--panel);
  border:1px solid var(--line); border-radius:8px; overflow:hidden; width:100%; }
.okl-media * { box-sizing:border-box; }
.okl-top { display:flex; gap:6px; align-items:center; padding:8px 10px; background:var(--bg); }
.okl-btn { background:#2c2f42; color:#d5d8e8; border:1px solid var(--line); border-radius:6px;
  padding:4px 10px; cursor:pointer; font-size:12px; }
.okl-btn:hover { border-color:var(--accent); }
.okl-btn.primary { background:var(--accent); color:#111; border-color:var(--accent); }
.okl-btn.danger:hover { border-color:#e06c75; color:#e06c75; }
.okl-btn:disabled { opacity:.4; cursor:not-allowed; }
.okl-tracks { display:flex; flex-wrap:wrap; gap:6px; padding:8px 10px; background:var(--bg);
  border-bottom:1px solid var(--line); }
.okl-track-tab { display:flex; align-items:center; gap:6px; background:#2c2f42; border:1px solid var(--line);
  border-radius:6px; padding:3px 8px; cursor:pointer; }
.okl-track-tab.active { border-color:var(--accent); background:#343a52; }
.okl-track-tab input { background:transparent; border:none; color:#d5d8e8; width:52px; font-size:12px; }
.okl-track-del { background:none; border:none; color:#e06c75; cursor:pointer; font-size:13px; padding:0 2px; }
.okl-body { padding:10px; }
.okl-sec { margin-bottom:10px; }
.okl-sec-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
.okl-sec-title { font-weight:600; color:#9aa5ce; }
.okl-sec-count { color:#5c6aa8; font-size:11px; }
.okl-grid { display:flex; flex-wrap:wrap; gap:8px; }
.okl-cell { position:relative; background:#22243a; border:1px solid var(--line); border-radius:8px;
  padding:6px; width:132px; }
.okl-cell.off { opacity:.45; }
.okl-thumb { width:120px; height:68px; object-fit:cover; border-radius:5px; background:#000; display:block; }
.okl-thumb.vid { background:#000; }
.okl-cell-info { margin-top:4px; font-size:10px; color:#8a91b8; overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap; max-width:120px; }
.okl-cell-tag { position:absolute; top:8px; left:8px; background:rgba(0,0,0,.72); color:#7aa2f7;
  font-size:10px; padding:1px 5px; border-radius:4px; }
.okl-cell-tools { display:flex; gap:4px; margin-top:4px; flex-wrap:wrap; }
.okl-mini { background:#2c2f42; border:1px solid var(--line); color:#c3c9e8; border-radius:4px;
  padding:1px 6px; font-size:10px; cursor:pointer; }
.okl-mini:hover { border-color:var(--accent); }
.okl-budget { display:flex; gap:12px; padding:6px 10px; background:var(--bg); border-top:1px solid var(--line);
  font-size:11px; color:#8a91b8; }
.okl-budget b { color:#d5d8e8; }
.okl-budget .warn { color:#e5c07b; }
.okl-add { border:1px dashed #4a4f6e; border-radius:8px; color:#5c6aa8; width:132px; height:88px;
  display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; gap:4px; }
.okl-add:hover { border-color:var(--accent); color:var(--accent); }
.okl-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#22243a;
  border:1px solid var(--accent); color:#d5d8e8; padding:8px 16px; border-radius:8px; z-index:99999;
  font-size:12px; box-shadow:0 4px 16px rgba(0,0,0,.4); }
.okl-toast.err { border-color:#e06c75; }
.okl-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center;
  justify-content:center; z-index:99990; }
.okl-modal { background:#181a27; border:1px solid #3a3f5c; border-radius:10px; padding:14px; width:560px;
  max-width:94vw; color:#d5d8e8; font:12px/1.45 "Segoe UI",system-ui,sans-serif; }
.okl-modal h3 { margin:0 0 10px; font-size:14px; color:#e2e6ff; }
.okl-stage { background:#000; border-radius:6px; overflow:hidden; margin-bottom:10px; min-height:120px;
  display:flex; align-items:center; justify-content:center; position:relative; }
.okl-stage video, .okl-stage img { max-width:100%; max-height:280px; display:block; }
.okl-crop-box { position:absolute; border:1.5px solid var(--accent); background:rgba(122,162,247,.12);
  cursor:move; }
.okl-crop-box .h { position:absolute; left:-4px; right:-4px; height:7px; cursor:ns-resize; }
.okl-crop-box .v { position:absolute; top:-4px; bottom:-4px; width:7px; cursor:ew-resize; }
.okl-crop-box .h.t { top:-4px; } .okl-crop-box .h.b { bottom:-4px; }
.okl-crop-box .v.l { left:-4px; } .okl-crop-box .v.r { right:-4px; }
.okl-crop-box .c { position:absolute; inset:0; cursor:move; }
.okl-modal-row { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
.okl-modal-row label { color:#9aa5ce; }
.okl-modal input[type=number], .okl-modal input[type=text] { background:#22243a; border:1px solid #3a3f5c;
  color:#d5d8e8; border-radius:5px; padding:3px 7px; width:72px; font-size:12px; }
.okl-modal input[type=range] { flex:1; min-width:120px; accent-color:var(--accent); }
.okl-modal .okl-btn { margin-right:6px; }
.okl-afb { display:flex; gap:6px; margin-top:6px; }
.okl-afb .okl-mini { padding:2px 8px; }
.okl-hint { color:#6b74a0; font-size:11px; margin-top:6px; }
`;

function injectCSS() {
  if (document.getElementById("okl-media-css")) return;
  const s = document.createElement("style");
  s.id = "okl-media-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

export function viewURL(annotated) {
  const m = String(annotated || "").match(/^(.*)\s\[(input|output|temp)\]$/);
  const type = m ? m[2] : "input";
  const name = m ? m[1] : String(annotated || "");
  const slash = name.lastIndexOf("/");
  const subfolder = slash >= 0 ? name.slice(0, slash) : "";
  const file = slash >= 0 ? name.slice(slash + 1) : name;
  const p = new URLSearchParams({ filename: file, type });
  if (subfolder) p.set("subfolder", subfolder);
  return `/view?${p.toString()}`;
}

export function isOn(item) { return item && item.enabled !== false; }

export function computeTags(items) {
  const on = (items || []).filter(isOn);
  const tags = new Map();
  const extra = new Map();
  let p = 0, v = 0, a = 0;
  on.forEach((it) => { if (it.kind === "picture") tags.set(it, `<Picture ${++p}>`); });
  on.forEach((it) => {
    if (it.kind !== "video") return;
    if (it.has_audio && (it.audio_mode || "paired") === "paired")
      extra.set(it, `<Audio ${++a}>`);
    tags.set(it, `<Video ${++v}>`);
  });
  on.forEach((it) => {
    if (it.kind === "audio") tags.set(it, `<Audio ${++a}>`);
    else if (it.kind === "video" && it.has_audio && it.audio_mode === "standalone")
      extra.set(it, `<Audio ${++a}>`);
  });
  return { tags, extra };
}

export function audioCount(items) {
  return (items || []).filter(isOn).reduce((n, it) => {
    if (it.kind === "audio") return n + 1;
    if (it.kind === "video" && it.has_audio && (it.audio_mode || "off") !== "off") return n + 1;
    return n;
  }, 0);
}

export function fileCount(items) {
  let n = 0;
  (items || []).filter(isOn).forEach((it) => {
    n += 1;
    if (it.kind === "video" && it.has_audio && (it.audio_mode || "paired") !== "off") n += 1;
  });
  return n;
}

export function effDuration(it) {
  const full = it.duration || 0;
  const t = it.trim;
  if (!t || (!t.start && !t.end)) return full;
  const a = Math.max(0, t.start || 0);
  const b = t.end ? Math.min(t.end, full || t.end) : full;
  return Math.max(0, b - a);
}

/* ------------------------------- API ------------------------------- */

let capsPromise = null;
function capabilities() {
  if (!capsPromise) {
    capsPromise = api.fetchApi("/openkit_media/capabilities")
      .then((r) => r.json())
      .catch(() => ({ video: true, av: false, ffmpeg: false }));
  }
  return capsPromise;
}

async function presetApi(path, body) {
  const opts = body
    ? { method: "POST", body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" } }
    : {};
  const resp = await api.fetchApi("/openkit_media/presets" + path, opts);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `request failed (${resp.status})`);
  return data;
}

async function uploadFile(file) {
  const body = new FormData();
  body.append("file", file, file.name);
  const resp = await api.fetchApi("/openkit_media/upload", { method: "POST", body });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `upload failed (${resp.status})`);
  return data;
}

/* --------------------------- Trim / Crop modal --------------------------- */

class MediaModal {
  constructor(panel, item, kind) {
    this.panel = panel;
    this.item = item;
    this.kind = kind; // "trim" (video/audio) or "crop" (picture/video)
    this.overlay = el("div", { class: "okl-overlay", onclick: () => this.close() });
    const isVideo = item.kind === "video";
    const title = this.kind === "trim"
      ? `${isVideo ? "视频" : "音频"}裁剪 · ${item.name || ""}`
      : `画面裁切 · ${item.name || ""}`;
    this.box = el("div", { class: "okl-modal", onclick: (e) => e.stopPropagation() });
    const stage = el("div", { class: "okl-stage" });
    this.stage = stage;
    const url = viewURL(item.file);

    if (this.kind === "trim") {
      this.media = el(isVideo ? "video" : "audio",
        { controls: "", src: url, style: isVideo ? {} : { width: "100%" } });
      if (isVideo) { this.media.muted = true; }
      stage.appendChild(this.media);
      this.buildTrimControls();
    } else {
      this.img = el("img", { src: url, draggable: "false" });
      stage.appendChild(this.img);
      // natural size for the crop overlay
      this.img.onload = () => {
        this.natW = this.img.naturalWidth;
        this.natH = this.img.naturalHeight;
        this.layoutCrop();
      };
      this.buildCropControls();
    }

    this.box.appendChild(el("h3", {}, title));
    this.box.appendChild(stage);
    this.box.appendChild(this.controls);
    this.overlay.appendChild(this.box);
    document.body.appendChild(this.overlay);
  }

  close() {
    if (this.media) { this.media.pause(); this.media.src = ""; }
    if (this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
  }

  /* ---- trim ---- */
  buildTrimControls() {
    const it = this.item;
    const full = it.duration || 0;
    const t = it.trim || {};
    let start = t.start || 0;
    let end = t.end || full;
    const row = el("div", { class: "okl-modal-row" });
    const sIn = el("input", { type: "number", value: start.toFixed(2), min: 0, step: 0.1 });
    const eIn = el("input", { type: "number", value: end.toFixed(2), min: 0, step: 0.1 });
    const range = el("input", { type: "range", min: 0, max: full || 60, value: start,
      step: 0.05, style: { flex: "1" } });
    const apply = () => {
      const s = Math.max(0, parseFloat(sIn.value) || 0);
      const e = Math.max(s, parseFloat(eIn.value) || full);
      if (e - s < 0.01) { this.panel.say("裁剪区间为空", true); return; }
      const trim = (s > 0 || e < full - 0.01) ? { start: +s.toFixed(2), end: +e.toFixed(2) } : null;
      if (trim) this.item.trim = trim; else delete this.item.trim;
      this.panel.commit(); this.panel.render();
      this.close();
    };
    row.append(
      el("label", {}, "起点"), sIn,
      el("label", {}, "终点"), eIn,
      el("label", {}, "预览"), range,
    );
    const barRow = el("div", { class: "okl-modal-row" });
    const playBtn = el("button", { class: "okl-btn", onclick: () => {
      if (this.media.paused) { this.media.currentTime = parseFloat(range.value) || 0; this.media.play(); }
      else this.media.pause();
    } }, "播放/暂停");
    const mkBtn = (label, fn) => el("button", { class: "okl-mini", onclick: () => fn() }, label);
    const shortcuts = el("div", { class: "okl-afb" },
      mkBtn("首2秒", () => { sIn.value = "0"; eIn.value = Math.min(full || 2, 2).toFixed(2); }),
      mkBtn("末2秒", () => { sIn.value = Math.max(0, (full || 2) - 2).toFixed(2); eIn.value = (full || 2).toFixed(2); }),
      mkBtn("清除", () => { sIn.value = "0"; eIn.value = (full || 0).toFixed(2); }),
    );
    range.addEventListener("input", () => {
      const t = parseFloat(range.value) || 0;
      if (this.media) this.media.currentTime = t;
    });
    if (this.media) {
      this.media.addEventListener("timeupdate", () => {
        if (Math.abs((this.media.currentTime || 0) - (parseFloat(range.value) || 0)) > 0.15)
          range.value = this.media.currentTime || 0;
      });
    }
    const foot = el("div", { class: "okl-modal-row" },
      el("button", { class: "okl-btn primary", onclick: apply }, "应用"),
      el("button", { class: "okl-btn", onclick: () => this.close() }, "取消"),
    );
    this.controls = el("div", {}, row, barRow, playBtn, shortcuts, foot,
      el("div", { class: "okl-hint" }, `时长 ${full ? full.toFixed(1) : "?"}s · 单段建议 ${CLIP.min}–${CLIP.max}s`));
  }

  /* ---- crop ---- */
  buildCropControls() {
    const it = this.item;
    const c = it.crop || { x: 0, y: 0, w: 1, h: 1 };
    this.crop = { ...c };
    const row = el("div", { class: "okl-modal-row" });
    const xIn = el("input", { type: "number", value: +(c.x || 0).toFixed(2), step: 0.05, min: 0, max: 0.95 });
    const yIn = el("input", { type: "number", value: +(c.y || 0).toFixed(2), step: 0.05, min: 0, max: 0.95 });
    const wIn = el("input", { type: "number", value: +(c.w || 1).toFixed(2), step: 0.05, min: 0.05, max: 1 });
    const hIn = el("input", { type: "number", value: +(c.h || 1).toFixed(2), step: 0.05, min: 0.05, max: 1 });
    const syncInputs = () => {
      xIn.value = this.crop.x.toFixed(2); yIn.value = this.crop.y.toFixed(2);
      wIn.value = this.crop.w.toFixed(2); hIn.value = this.crop.h.toFixed(2);
    };
    const apply = () => {
      const crop = { x: clamp01(parseFloat(xIn.value) || 0), y: clamp01(parseFloat(yIn.value) || 0) };
      crop.w = Math.min(1 - crop.x, Math.max(0.05, parseFloat(wIn.value) || 1));
      crop.h = Math.min(1 - crop.y, Math.max(0.05, parseFloat(hIn.value) || 1));
      const full = crop.x <= 0.005 && crop.y <= 0.005 && crop.w >= 0.995 && crop.h >= 0.995;
      if (full) delete this.item.crop; else this.item.crop = crop;
      this.panel.commit(); this.panel.render();
      this.close();
    };
    const foot = el("div", { class: "okl-modal-row" },
      el("button", { class: "okl-btn primary", onclick: apply }, "应用"),
      el("button", { class: "okl-btn", onclick: () => { delete this.item.crop; this.panel.commit(); this.panel.render(); this.close(); } }, "清除裁切"),
      el("button", { class: "okl-btn", onclick: () => this.close() }, "取消"),
    );
    this.controls = el("div", {},
      el("div", { class: "okl-modal-row" },
        el("label", {}, "x"), xIn, el("label", {}, "y"), yIn,
        el("label", {}, "宽"), wIn, el("label", {}, "高"), hIn),
      row, foot,
      el("div", { class: "okl-hint" }, "在画面上拖动/缩放裁切框，或直接输入归一化坐标（0–1）。"));
    row.append(el("div", { class: "okl-hint" }, ""));
    void syncInputs;
  }

  layoutCrop() {
    if (!this.natW || !this.natH) return;
    const stage = this.stage;
    const img = this.img;
    const rect = img.getBoundingClientRect();
    // overlay the crop box on the natural image rect
    const box = el("div", { class: "okl-crop-box" });
    const srect = stage.getBoundingClientRect();
    const px = rect.left - srect.left, py = rect.top - srect.top;
    const W = rect.width, H = rect.height;
    const upd = () => {
      const c = this.crop || { x: 0, y: 0, w: 1, h: 1 };
      box.style.left = `${px + c.x * W}px`;
      box.style.top = `${py + c.y * H}px`;
      box.style.width = `${c.w * W}px`;
      box.style.height = `${c.h * H}px`;
    };
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    const onMove = (mode) => {
      let start = null;
      const move = (e) => {
        const c = { ...(this.crop || { x: 0, y: 0, w: 1, h: 1 }) };
        const dx = (e.clientX - start.x) / W;
        const dy = (e.clientY - start.y) / H;
        if (mode === "move") {
          c.x = clamp01(c.x + dx); c.y = clamp01(c.y + dy);
          c.w = Math.min(1 - c.x, c.w); c.h = Math.min(1 - c.y, c.h);
        } else if (mode === "se") {
          c.w = clamp01(c.w + dx); c.h = clamp01(c.h + dy);
        } else if (mode === "s") { c.h = clamp01(c.h + dy); }
        else if (mode === "e") { c.w = clamp01(c.w + dx); }
        else if (mode === "n") { c.h = clamp01(c.h - dy); c.y = clamp01(c.y + dy); }
        else if (mode === "w") { c.w = clamp01(c.w - dx); c.x = clamp01(c.x + dx); }
        this.crop = c; upd();
      };
      const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
      return (e) => {
        e.preventDefault(); e.stopPropagation();
        start = { x: e.clientX, y: e.clientY };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      };
    };
    const mk = (cls, mode) => { const h = el("div", { class: cls, onmousedown: onMove(mode) }); box.appendChild(h); };
    mk("c", "move"); mk("h t", "n"); mk("h b", "s"); mk("v l", "w"); mk("v r", "e");
    // corner = combine: use 'se' for br corner approximation
    stage.appendChild(box);
    upd();
  }
}

function clamp01(v) { return Math.min(1, Math.max(0, v)); }

/* ------------------------------ LoaderPanel ------------------------------ */

class LoaderPanel {
  constructor(node) {
    this.node = node;
    this.root = el("div", { class: "okl-media" });
    this.picker = el("input", { type: "file", multiple: "", style: { display: "none" } });
    this.tracks = this.read();
    this.current = 0;
    this.busy = 0;
  }

  widget() { return this.node.widgets && this.node.widgets.find((w) => w.name === "tracks_data"); }

  read() {
    const w = this.widget();
    try { const v = JSON.parse(w && w.value || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }

  commit() {
    const w = this.widget();
    if (!w) return;
    const json = JSON.stringify(this.tracks);
    if (w.value === json) return;
    w.value = json;
    if (typeof w.callback === "function") { try { w.callback(json); } catch (e) {} }
  }

  say(text, isError) {
    const t = el("div", { class: "okl-toast" + (isError ? " err" : "") }, text);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  count(items, kind) { return (items || []).filter((i) => i.kind === kind).length; }

  async addFiles(track, kind, files) {
    if (!files || !files.length) return;
    const caps = await capabilities();
    const items = track.items;
    for (const file of files) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const guess = /^(png|jpe?g|webp|bmp|gif|tiff?)$/.test(ext) ? "picture"
        : /^(mp4|mov|mkv|webm|avi|m4v|mpe?g)$/.test(ext) ? "video"
        : /^(wav|mp3|flac|ogg|m4a|aac|opus)$/.test(ext) ? "audio" : null;
      if (!guess || guess !== kind) {
        this.say(`${file.name}: 类型与目标区不符`, true);
        continue;
      }
      if (this.count(items, guess) >= MAX[guess]) {
        this.say(`${file.name}: ${guess === "picture" ? "参考图" : guess === "video" ? "参考视频" : "参考音频"}已满 ${MAX[guess]} 个`, true);
        continue;
      }
      if (guess === "audio" && audioCount(items) >= MAX.audio) {
        this.say(`音频预算已满 ${MAX.audio} 个（含视频音轨）`, true);
        continue;
      }
      if (guess === "video" && !caps.video) {
        this.say("服务器缺少 PyAV 或 ffmpeg，无法解码视频", true);
        continue;
      }
      this.busy += 1; this.render();
      try {
        const info = await uploadFile(file);
        const budgetFull = audioCount(items) >= MAX.audio;
        const pairable = info.kind === "video" && info.has_audio;
        items.push({
          kind: info.kind,
          file: info.file,
          name: info.original || info.name,
          duration: info.duration ?? null,
          width: info.width ?? null,
          height: info.height ?? null,
          has_audio: !!info.has_audio,
          audio_mode: pairable && !budgetFull ? "paired" : "off",
        });
      } catch (err) {
        this.say(`${file.name}: ${err.message}`, true);
      } finally {
        this.busy -= 1;
      }
    }
    this.commit(); this.render();
  }

  /* ---- track management ---- */
  addTrack() {
    if (this.tracks.length >= MAX_TRACKS) { this.say(`最多 ${MAX_TRACKS} 条滑轨`, true); return; }
    const n = this.tracks.length + 1;
    this.tracks.push({ name: `段落${n}`, items: [] });
    this.current = this.tracks.length - 1;
    this.commit(); this.render();
  }

  removeTrack(i) {
    if (this.tracks.length <= 1) { this.say("至少保留一条滑轨", true); return; }
    this.tracks.splice(i, 1);
    if (this.current >= this.tracks.length) this.current = this.tracks.length - 1;
    this.commit(); this.render();
  }

  removeItem(track, item) {
    const i = track.items.indexOf(item);
    if (i >= 0) track.items.splice(i, 1);
    this.commit(); this.render();
  }

  toggleItem(item) {
    if (item.enabled === false) delete item.enabled; else item.enabled = false;
    this.commit(); this.render();
  }

  swapItem(track, item, dir) {
    const i = track.items.indexOf(item);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= track.items.length) return;
    const t = track.items[i]; track.items[i] = track.items[j]; track.items[j] = t;
    this.commit(); this.render();
  }

  /* ---- render ---- */
  render() {
    this.root.innerHTML = "";
    const tracks = this.tracks;
    const cur = Math.min(Math.max(this.current, 0), Math.max(tracks.length - 1, 0));
    this.current = cur;
    const track = tracks[cur] || { name: "段落1", items: [] };

    // header
    const top = el("div", { class: "okl-top" },
      el("button", { class: "okl-btn primary", onclick: () => this.addTrack() }, "＋ 添加段落"),
      el("span", { style: { color: "#6b74a0" } }, `${tracks.length}/${MAX_TRACKS}`),
      el("span", { style: { flex: "1" } }),
      el("button", { class: "okl-btn", onclick: () => this.presetsMenu(this.root.querySelector(".okl-preset-anchor")) }, "预设"),
    );
    this.root.appendChild(top);

    // track tabs
    const tabs = el("div", { class: "okl-tracks" });
    tracks.forEach((t, i) => {
      const nameIn = el("input", { value: t.name || `段落${i + 1}`, onchange: () => {
        t.name = nameIn.value.trim() || `段落${i + 1}`; this.commit();
      } });
      const tab = el("div", { class: "okl-track-tab" + (i === cur ? " active" : ""),
        onclick: (e) => { if (!e.target.closest("input") && !e.target.closest("button")) { this.current = i; this.render(); } } },
        nameIn,
        el("span", { style: { color: "#5c6aa8", fontSize: "10px" } }, `${t.items.filter(isOn).length}`),
        el("button", { class: "okl-track-del", title: "删除段落",
          onclick: (e) => { e.stopPropagation(); this.removeTrack(i); } }, "×"),
      );
      tabs.appendChild(tab);
    });
    this.root.appendChild(tabs);

    // body
    const body = el("div", { class: "okl-body" });
    body.appendChild(this.renderSection(track, "picture", "参考图", MAX.picture));
    body.appendChild(this.renderSection(track, "video", "参考视频", MAX.video));
    body.appendChild(this.renderSection(track, "audio", "参考音频", MAX.audio));
    this.root.appendChild(body);

    // budget
    const pics = this.count(track.items, "picture");
    const vids = this.count(track.items, "video");
    const auds = audioCount(track.items);
    const warn = auds >= MAX.audio;
    this.root.appendChild(el("div", { class: "okl-budget" },
      el("span", {}, "参考图 ", el("b", {}, `${pics}/${MAX.picture}`)),
      el("span", {}, "参考视频 ", el("b", {}, `${vids}/${MAX.video}`)),
      el("span", { class: warn ? "warn" : "" }, "参考音频(含音轨) ", el("b", {}, `${auds}/${MAX.audio}`)),
    ));

    this.applyPickers(track);
  }

  renderSection(track, kind, title, max) {
    const items = track.items.filter((i) => i.kind === kind);
    const { tags, extra } = computeTags(track.items);
    const sec = el("div", { class: "okl-sec" });
    sec.appendChild(el("div", { class: "okl-sec-head" },
      el("span", { class: "okl-sec-title" }, `${title} ${items.length}/${max}`),
    ));
    const grid = el("div", { class: "okl-grid" });
    items.forEach((item) => {
      const tag = tags.get(item) || "";
      const extraTag = extra.get(item) || "";
      const thumb = item.kind === "picture"
        ? el("img", { class: "okl-thumb", src: viewURL(item.file), draggable: "false" })
        : el("video", { class: "okl-thumb vid", src: viewURL(item.file), muted: "true",
            preload: "metadata", onmouseenter: (e) => { try { e.target.currentTime = 0.1; e.target.play(); } catch (err) {} },
            onmouseleave: (e) => { try { e.target.pause(); } catch (err) {} } });
      const info = [];
      if (item.kind === "video" && item.duration) info.push(`${item.duration}s`);
      if (item.kind === "video" && item.has_audio) info.push("含音轨");
      if (item.trim) info.push("已裁剪");
      if (item.crop) info.push("已裁切");
      const tools = el("div", { class: "okl-cell-tools" },
        el("button", { class: "okl-mini", onclick: () => this.toggleItem(item) },
          item.enabled === false ? "开启" : "关闭"),
        el("button", { class: "okl-mini", onclick: () => new MediaModal(this, item, "trim") },
          item.kind === "picture" ? "裁切" : "裁剪"),
        el("button", { class: "okl-mini", onclick: () => this.swapItem(track, item, -1) }, "←"),
        el("button", { class: "okl-mini", onclick: () => this.swapItem(track, item, 1) }, "→"),
        el("button", { class: "okl-mini", onclick: () => this.removeItem(track, item) }, "删除"),
      );
      if (item.kind === "video" && item.has_audio) {
        tools.appendChild(this.audioModeBtn(track, item));
      }
      const cell = el("div", { class: "okl-cell" + (item.enabled === false ? " off" : ""),
        draggable: "true",
        ondragstart: (e) => { e.dataTransfer.setData("text/plain", `${kind}:${track.items.indexOf(item)}`); },
        ondragover: (e) => e.preventDefault(),
        ondrop: (e) => { e.preventDefault(); this.handleDrop(track, kind, e); } },
        tag ? el("div", { class: "okl-cell-tag" }, tag + (extraTag ? ` ${extraTag}` : "")) : null,
        thumb,
        el("div", { class: "okl-cell-info" }, (item.name || "") + (info.length ? ` · ${info.join(" ")}` : "")),
        tools,
      );
      grid.appendChild(cell);
    });
    const addBtn = el("div", { class: "okl-add", onclick: () => this.pickerFor(kind).click() },
      el("span", { style: { fontSize: "18px" } }, "＋"),
      el("span", {}, `添加${title}`));
    addBtn.ondragover = (e) => e.preventDefault();
    addBtn.ondrop = (e) => { e.preventDefault(); const fs = e.dataTransfer.files; if (fs && fs.length) this.addFiles(track, kind, fs); };
    grid.appendChild(addBtn);
    sec.appendChild(grid);
    return sec;
  }

  audioModeBtn(track, item) {
    const modes = [
      ["paired", "音轨配对"],
      ["standalone", "音轨独立"],
      ["off", "音轨关闭"],
    ];
    const cur = item.audio_mode || "off";
    const next = modes[(modes.findIndex((m) => m[0] === cur) + 1) % modes.length][0];
    const label = (modes.find((m) => m[0] === cur) || modes[0])[1];
    return el("button", { class: "okl-mini", title: "点击切换音轨模式",
      onclick: () => { item.audio_mode = next; if (next !== "off") item.has_audio = true;
        this.commit(); this.render(); } }, label);
  }

  pickers = {};
  pickerFor(kind) {
    if (!this.pickers[kind]) {
      const p = el("input", { type: "file", multiple: "", accept:
        kind === "picture" ? "image/*" : kind === "video" ? "video/*" : "audio/*",
        style: { display: "none" } });
      p.addEventListener("change", () => {
        if (p.files && p.files.length && this.tracks[this.current])
          this.addFiles(this.tracks[this.current], kind, p.files);
        p.value = "";
      });
      this.pickers[kind] = p;
      this.root.appendChild(p);
    }
    return this.pickers[kind];
  }

  applyPickers(track) {
    // ensure per-section drop targets wired on add cells already handled in renderSection
  }

  handleDrop(track, kind, e) {
    const raw = e.dataTransfer.getData("text/plain");
    if (raw) {
      const [k, idx] = raw.split(":");
      if (k === kind) {
        const from = parseInt(idx, 10);
        const items = track.items;
        const to = items.findIndex((i) => i.kind === kind && !items.slice(0, from).includes(i));
        if (from >= 0 && from < items.length && to >= 0) {
          // simple reorder: move within same kind group
          const item = items[from];
          items.splice(from, 1);
          const tgt = items.filter((i) => i.kind === kind)[0];
          const pos = tgt ? items.indexOf(tgt) : items.length;
          items.splice(pos + (pos >= from ? 0 : 0), 0, item);
          this.commit(); this.render();
          return;
        }
      }
    }
    const fs = e.dataTransfer.files;
    if (fs && fs.length) this.addFiles(track, kind, fs);
  }

  presetsMenu(anchor) {
    const overlay = el("div", { class: "okl-overlay", onclick: () => overlay.remove() });
    const box = el("div", { class: "okl-modal", style: { width: "340px" }, onclick: (e) => e.stopPropagation() });
    const nameIn = el("input", { type: "text", placeholder: "预设名称" });
    const list = el("div", { style: { maxHeight: "220px", overflow: "auto", margin: "8px 0" } });
    const loadList = () => {
      list.innerHTML = "";
      presetApi("").then((d) => {
        (d.presets || []).forEach((n) => {
          list.appendChild(el("div", { class: "okl-modal-row" },
            el("button", { class: "okl-btn", onclick: async () => {
              try {
                const r = await presetApi("/load", { name: n });
                this.tracks = r.items && r.items.length ? r.items : this.tracks;
                this.commit(); this.render(); overlay.remove();
                this.say(`已加载预设 ${n}${r.missing && r.missing.length ? `（${r.missing.length} 个文件缺失已跳过）` : ""}`);
              } catch (err) { this.say(err.message, true); }
            } }, n),
            el("button", { class: "okl-mini danger", onclick: async () => {
              try { await presetApi("/delete", { name: n }); loadList(); } catch (err) { this.say(err.message, true); }
            } }, "删"),
          ));
        });
        if (!(d.presets || []).length) list.appendChild(el("div", { class: "okl-hint" }, "暂无预设"));
      }).catch((err) => this.say(err.message, true));
    };
    box.appendChild(el("h3", {}, "预设"));
    box.appendChild(el("div", { class: "okl-modal-row" }, nameIn,
      el("button", { class: "okl-btn primary", onclick: async () => {
        try { await presetApi("/save", { name: nameIn.value.trim(), items: this.tracks }); loadList(); }
        catch (err) { this.say(err.message, true); }
      } }, "保存当前")));
    box.appendChild(list);
    box.appendChild(el("button", { class: "okl-btn", onclick: () => overlay.remove() }, "关闭"));
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    loadList();
  }
}

/* ------------------------------ registration ------------------------------ */

app.registerExtension({
  name: "Openkit.H3MediaLoader",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== LOADER_NAME) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated && onNodeCreated.apply(this, arguments);
      injectCSS();
      const w = this.widgets && this.widgets.find((w) => w.name === "tracks_data");
      if (w) { w.hidden = true; w.type = "hidden"; w.computeSize = () => [0, -4]; }

      this._oklPanel = new LoaderPanel(this);
      const widget = this.addDOMWidget("okl_panel", "div", this._oklPanel.root, {
        getMinHeight: () => 460,
        getMaxHeight: () => 100000,
        getHeight: () => Math.max(460, (this.size && this.size[1] || 500) - 40),
        hideOnZoom: false,
        serialize: false,
      });
      if (widget.computeLayoutSize) {
        widget.computeLayoutSize = () => ({ minHeight: 460, minWidth: 520, maxHeight: 100000, maxWidth: 100000 });
      }
      this._oklPanel.render();
      return r;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure && onConfigure.apply(this, arguments);
      setTimeout(() => {
        if (this._oklPanel) {
          this._oklPanel.tracks = this._oklPanel.read();
          this._oklPanel.render();
        }
      }, 0);
      return r;
    };
  },
});
