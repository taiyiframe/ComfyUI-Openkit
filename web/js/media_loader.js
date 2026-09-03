/* Media Loader — frontend
 * On-node panel: drag-and-drop plus a file picker, previews with playback,
 * drag-to-reorder, and per-video audio split routing.
 *
 * Tag numbers shown here follow the native node's presentation order:
 * images, then videos (a paired soundtrack's <Audio N> emitted just before
 * its <Video N>), then standalone audio. Ordinals are 1-based per type.
 */
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

export const LOADER_NAME = "MediaLoader";
export const SPLITTER_NAME = "ReferenceSplitter";
export const MAX = { picture: 32, video: 3, audio: 8 };
// Reference policy: 2-15s per reference clip, 15s total per media type.
export const TRIM_FPS = 24;   // timeline fps; used for frame-stepping
export const CLIP = { min: 2, max: 15, totalPerType: 15 };

// Picture classification: each reference image carries a category (one of the
// four below) plus an optional per-category number. The panel keeps pictures
// ordered as 关键帧 1,2,3… → 角色 1,2,3… → 道具 1,2,3… → 场景 1,2,3…
export const PIC_CATEGORIES = ["关键帧", "角色", "道具", "场景"];
export const PIC_CAT_PRIORITY = { "关键帧": 0, "角色": 1, "道具": 2, "场景": 3 };

export function picCategory(it) {
  const c = it && it.category;
  return PIC_CATEGORIES.includes(c) ? c : "关键帧";
}

export function picNumber(it) {
  const n = parseInt(it && it.number, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function picSortKey(it) {
  return (PIC_CAT_PRIORITY[picCategory(it)] ?? 99) * 1000 + picNumber(it);
}

/** Next free number inside one category for a freshly uploaded picture. */
export function nextPicNumber(items, category) {
  let hi = 0;
  (items || []).forEach((i) => {
    if (i && i.kind === "picture" && picCategory(i) === category) {
      const n = picNumber(i);
      if (n > hi) hi = n;
    }
  });
  return hi + 1;
}

/** Reassign compact 1..n numbers inside each category, in the current
 *  item-list order. Called after drag-to-reorder so slot positions and the
 *  read-only numbers stay logically consistent when pictures are swapped
 *  between slots. Only touches pictures; video/audio are unaffected. */
export function renumberPictures(items) {
  const buckets = new Map();
  (items || []).forEach((i) => {
    if (i && i.kind === "picture") {
      const cat = picCategory(i);
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat).push(i);
    }
  });
  buckets.forEach((list) => {
    list.forEach((it, idx) => { it.number = idx + 1; });
  });
}

/** Order the item list so pictures come first (sorted by category+number),
 *  then videos, then audios; each group keeps its previous relative order. */
export function reorderForDisplay(items) {
  const pics = (items || []).filter((i) => i.kind === "picture")
    .sort((a, b) => picSortKey(a) - picSortKey(b));
  const vids = (items || []).filter((i) => i.kind === "video");
  const auds = (items || []).filter((i) => i.kind === "audio");
  return [...pics, ...vids, ...auds];
}

/** Audio clips in play, counting split soundtracks — they spend the same
 *  budget as standalone clips even though they use a different slot group. */
export function audioCount(all) {
  return (all || []).filter(isOn).reduce((n, it) => {
    if (it.kind === "audio") return n + 1;
    if (it.kind === "video" && it.has_audio &&
        (it.audio_mode || "off") !== "off") return n + 1;
    return n;
  }, 0);
}

/** Duration actually sent: the trimmed span when a trim is set. */
export function effDuration(it) {
  const full = it.duration || 0;
  const t = it.trim;
  if (!t || (!t.start && !t.end)) return full;
  const a = Math.max(0, t.start || 0);
  const b = t.end ? Math.min(t.end, full || t.end) : full;
  return Math.max(0, b - a);
}

/** Total seconds per media type, for the 15s-per-type ceiling. */
export function durations(all) {
  const on = (all || []).filter(isOn);
  const sum = (list) => list.reduce((t, i) => t + effDuration(i), 0);
  return {
    video: sum(on.filter((i) => i.kind === "video")),
    audio: sum(on.filter((i) => i.kind === "audio" ||
      (i.kind === "video" && i.has_audio && (i.audio_mode || "off") !== "off"))),
  };
}

/* ---------------------------------------------------------------- utils */

/* ---------------------------------------------------------------- i18n */

/* 节点 UI 固定为中文展示（Load files / Clear media / 展开拆分器等按钮均为中文）。
   setUiLang() 仍保留，可在控制台手动切换为英文。 */
let uiLang = "zh";
try { localStorage.setItem("mmxLoaderLang", "zh"); } catch (e) { /* ignore */ }

const LANG_PAIRS = [
  ["Expand Native-output splitter", "展开输出拆分器"],
  ["Clear media", "清空媒体"],
  ["Load files…", "加载文件…"],
  ["or drop files on any slot", "或将文件拖到任意槽位"],
  ["pictures", "图片"],
  ["videos", "视频"],
  ["AUDIO", "音频"],
  ["picture", "图片"],
  ["video", "视频"],
  ["audio", "音频"],
  ["load preset…", "加载预设…"],
  ["no presets saved", "暂无已保存预设"],
  ["preset", "预设"],
  ["save as", "另存为"],
  ["Save", "保存"],
  ["Delete", "删除"],
  ["Cancel", "取消"],
  ["Apply", "应用"],
  ["Close", "关闭"],
  ["Play", "播放"],
  ["Unload", "清空"],
  ["Remove", "移除"],
  ["off", "关"],
  ["paired", "配对"],
  ["alone", "独立"],
  ["standalone", "独立"],
  ["tag order sent to the model", "发送给模型的标签顺序"],
  ["nothing loaded yet", "尚未加载"],
  ["split audio", "音轨拆分"],
  ["where the track comes out", "音轨输出位置"],
  ["Reference Splitter not found — restart ComfyUI", "未找到 Reference Splitter — 请重启 ComfyUI"],
  ["Splitter is already connected", "Splitter 已连接"],
  ["Splitter added — wire its slots to the downstream video node", "已添加 Splitter — 将其输出接到下游视频生成节点"],
  ["Media Loader", "素材加载器"],
  ["Nothing loaded to save.", "没有可保存的素材。"],
  ["Give the preset a name.", "请为预设命名。"],
  ["Pick a preset first.", "请先选择预设。"],
  ["Videos need PyAV or ffmpeg on the server.", "视频解码需要服务端安装 PyAV 或 ffmpeg。"],
  ["What do off / paired / alone do?", "关 / 配对 / 独立是什么意思？"],
  ["Ignore this video's audio", "忽略此视频的音轨"],
  ["Soundtrack pairs with this video, labelled just before it", "音轨与此视频配对，标签排在其前面"],
  ["Soundtrack becomes a separate reference, numbered after the videos", "音轨作为独立参考，编号排在视频之后"],
  ["Remove every loaded reference from this node", "从本节点移除所有已加载素材"],
  ["Load a saved reference set", "加载已保存的素材预设"],
  ["Save the current set", "保存当前素材组"],
  ["Delete the selected preset", "删除选中的预设"],
  ["Use only part of this clip", "仅使用此片段的一部分"],
  ["Crop this image", "裁剪此图片"],
  ["Crop the frame", "裁剪画面"],
  ["\u25a3 Crop", "\u25a3 裁剪"],
  ["freeform", "自由"],
  ["playhead", "播放头"],
  ["Preset name", "预设名称"],
  ["Reset the crop", "重置裁剪"],
  ["Reset", "重置"],
  ["Previous frame (\u2190)", "上一帧（\u2190）"],
  ["Next frame (\u2192)", "下一帧（\u2192）"],
  ["\u21ba Reset", "\u21ba 重置"],
  ["\u{1F4F7} Use frame", "\u{1F4F7} 使用此帧"],
  ["Drag to move the start of the kept range", "拖动调整保留区间的开始"],
  ["Drag to move the end of the kept range", "拖动调整保留区间的结束"],
  ["Set start to the playhead  ( [ )", "将开始时间设为播放头（[）"],
  ["Set end to the playhead  ( ] )", "将结束时间设为播放头（]）"],
  ["Jump the playhead to the clip's first frame", "将播放头跳到片段第一帧"],
  ["Jump the playhead to the clip's last frame — then step back one frame", "将播放头跳到片段最后一帧 — 然后回退一帧"],
  ["Switch off — kept here but not sent to the model", "关闭 — 保留但不会发送给模型"],
  ["Switch on", "开启"],
  ["Switch to English", "切换到英文"],
  ["Switch to Chinese", "切换到中文"],
  ["Couldn't read that frame.", "无法读取该帧。"],
  ["Frame isn't ready yet — let the preview load, then try again.",
    "画面还没准备好 — 等预览加载后再试。"],
  ["Kept span is under 2s. Reference models are typically trained on 2\u201315s reference clips; shorter ones tend to be weakly followed or ignored. Widen the range, or pad short files (like sound effects) with silence before loading.",
    "保留区间不足 2 秒。参考模型通常使用 2–15 秒参考片段；更短的内容通常效果弱或不被采用。请拉宽区间，或先给短文件（如音效）补静音再加载。"],
  ["← → step a frame (shift = 10) · space play · [ ] set start/end here · home/end jump",
    "← → 逐帧（shift=10 帧）· 空格播放 · [ ] 在此设置起止 · home/end 跳转"],
  ["← → step a frame (shift = 10) · space play · [ ] set start/end here · home/end jump · C capture frame",
    "← → 逐帧（shift=10 帧）· 空格播放 · [ ] 在此设置起止 · home/end 跳转 · C 截取帧"],
  ["The video's audio is ignored — nothing is extracted and no tag is created. Worth doing when the sound is irrelevant, since it also frees one of your twelve reference slots.",
    "视频音轨被忽略 — 不提取、也不创建标签。当声音无关紧要时建议使用，因为它还能腾出一个参考槽位。"],
  ["Use paired when the sound genuinely belongs to that footage: on-screen dialogue where lip sync matters, diegetic action sounds that need to land on the same frames, or video-editing tasks where you're keeping the original soundtrack. The temporal binding is the whole point.",
    "当声音确实属于该画面时使用“配对”：需要对口型的画面内对白、必须落在相同帧上的画面内动作音，或保留原始音轨的视频编辑任务。时间绑定正是它的意义所在。"],
  ["Use alone when you want the audio as a reference rather than as that clip's soundtrack — borrowing a speaker's voice timbre for a different character, referencing a music style, or lifting ambience. Also the right choice when you're not reusing the video's visuals in sync, since a binding you don't want can pull the generation toward reproducing that clip's timing.",
    "当你想把音频当作参考而不是该片段的音轨时使用“独立”：为不同角色借用说话人的音色、参考音乐风格或提取环境声。当你不打算同步复用该视频画面时也应选它，因为多余的绑定会把生成结果拉向复刻该片段的节奏。"],
  ["The extracted track always gets its own AUDIO output — ComfyUI has no combined video-with-sound type, so the split is a wiring requirement. The mode decides which group it joins, which sets the native slot, the tag number, and whether the model binds it to that video's frames. Either way it occupies a reference slot, so a video with audio counts as two of your twelve.",
    "拆出的音轨始终有独立的 AUDIO 输出 — ComfyUI 没有音视频合并类型，因此拆分是连线要求。模式决定它进入哪个分组，从而决定原生槽位、标签编号以及模型是否将其绑定到该视频的画面。无论哪种方式它都占用一个参考槽位，因此带音轨的视频会占用你的 12 个额度中的两个。"],
];

const ZH_RULES = [
  [/^uploading (\d+)…$/, "正在上传 $1…"],
  [/^All (\d+) picture slots are full — remove one before capturing a frame\.$/, "所有 $1 个图片槽位已满 — 请先移除一个再截取帧。"],
  [/^All (\d+) (\w+) slots are full — (.+) skipped\.$/, "所有 $1 个 $2 槽位已满 — 已跳过 $3。"],
  [/^This loader takes (\d+) audio clips in total, and split video soundtracks count too — (.+) skipped\.$/, "本加载器总共支持 $1 段音频（视频拆分音轨也算）— 已跳过 $2。"],
  [/^(.+) loaded with its audio off — already using (\d+) audio clips\.$/, "$1 已加载但音轨关闭 — 已在用 $2 段音频。"],
  [/^Already using (\d+) audio clips — switch another off first\.$/, "已在用 $1 段音频 — 请先关闭其他音轨。"],
  [/^Saved "(.+)" \((\d+) items?\)\.$/, "已保存“$1”（$2 个素材）。"],
  [/^Loaded "(.+)"\.$/, "已加载“$1”。"],
  [/^Deleted "(.+)"\.$/, "已删除“$1”。"],
  [/^Load failed: (.+)$/, "加载失败：$1"],
  [/^Save failed: (.+)$/, "保存失败：$1"],
  [/^Delete failed: (.+)$/, "删除失败：$1"],
  [/^Unloaded (\d+) item\(s\)\. Files remain in ComfyUI's input folder\.$/, "已清空 $1 个素材；文件仍保留在 ComfyUI input 文件夹。"],
  [/^Remove all (\d+) item\(s\) from this node\? The files stay in your ComfyUI input folder\.$/, "从本节点移除全部 $1 个素材？文件仍保留在 input 文件夹。"],
  [/^Delete "(.+)"\? Your media files are not removed\.$/, "删除“$1”？媒体文件不会被删除。"],
  [/^Empty (\w+) slot (\d+) — click to browse or drop a file$/, (m, k, i) => `空的 ${tr(k)} 槽位 ${i} — 点击浏览或拖入文件`],
  [/^(\w+) (\d+)$/, (m, w, n) => `${tr(w)} ${n}`],
  [/^Trimmed to (.+) — click to edit$/, "已修剪为 $1 — 点击编辑"],
  [/^([\d.]+)s kept$/, "保留 $1 秒"],
  [/^⚠ Frame at (.+) is outside the kept range$/, "⚠ $1 处的帧超出保留范围"],
  [/^Start time in seconds$/, "开始时间（秒）"],
  [/^End time in seconds$/, "结束时间（秒）"],
  [/^Use only the final (\d+) seconds$/, "仅使用最后 $1 秒"],
  [/^last (\d+)s$/, "最后 $1 秒"],
  [/^That would exceed the (\d+)-file limit — switch something off or remove it first\.$/, "这会使素材总数超过 $1 个限制 — 请先关闭或移除一些。"],
  [/^Capturing frame at ([\d.]+)s…$/, "正在截取 $1 秒处的帧…"],
  [/^Added (\d+)×(\d+) frame from ([\d.]+)s( \(cropped\))? as a picture reference\.$/, (m, w, h, t, cr) => `已添加 ${w}×${h} 的 ${t} 秒帧${cr ? "（已裁剪）" : ""}作为图片参考。`],
  [/^Capture failed: (.+)$/, "截取失败：$1"],
  [/^(\S+): (.+)$/, "$1：$2"],
];

/** Reverse rules: turn rule-generated Chinese back into English so a surface
 *  built in one language can be fully re-localised after a switch. */
const EN_RULES = [
  [/^保留 ([\d.]+) 秒$/, (m, n) => `${n}s kept`],
  [/^⚠ (.+) 处的帧超出保留范围$/, (m, t) => `\u26a0 Frame at ${t} is outside the kept range`],
  [/^开始时间（秒）$/, "Start time in seconds"],
  [/^结束时间（秒）$/, "End time in seconds"],
  [/^正在上传 (\d+)…$/, (m, n) => `uploading ${n}…`],
  [/^最后 (\d+) 秒$/, (m, n) => `last ${n}s`],
  [/^仅使用最后 (\d+) 秒$/, (m, n) => `Use only the final ${n} seconds`],
  [/^所有 (\d+) 个图片槽位已满 — 请先移除一个再截取帧。$/, (m, n) => `All ${n} picture slots are full — remove one before capturing a frame.`],
  [/^这会使素材总数超过 (\d+) 个限制 — 请先关闭或移除一些。$/, (m, n) => `That would exceed the ${n}-file limit — switch something off or remove it first.`],
  [/^正在截取 ([\d.]+) 秒处的帧…$/, (m, t) => `Capturing frame at ${t}s…`],
  [/^已添加 (\d+)×(\d+) 的 ([\d.]+) 秒帧(（已裁剪）)?作为图片参考。$/, (m, w, h, t, cr) => `Added ${w}\u00d7${h} frame from ${t}s${cr ? " (cropped)" : ""} as a picture reference.`],
  [/^截取失败：(.+)$/, (m, e) => `Capture failed: ${e}`],
  [/^加载失败：(.+)$/, (m, e) => `Load failed: ${e}`],
  [/^保存失败：(.+)$/, (m, e) => `Save failed: ${e}`],
  [/^删除失败：(.+)$/, (m, e) => `Delete failed: ${e}`],
  [/^已保存“(.+)”（(\d+) 个素材）。$/, (m, n, c) => `Saved "${n}" (${c} items).`],
  [/^已加载“(.+)”。$/, (m, n) => `Loaded "${n}".`],
  [/^已删除“(.+)”。$/, (m, n) => `Deleted "${n}".`],
  [/^已清空 (\d+) 个素材；文件仍保留在 ComfyUI input 文件夹。$/, (m, n) => `Unloaded ${n} item(s). Files remain in ComfyUI's input folder.`],
  [/^从本节点移除全部 (\d+) 个素材？文件仍保留在 input 文件夹。$/, (m, n) => `Remove all ${n} item(s) from this node? The files stay in your ComfyUI input folder.`],
  [/^删除“(.+)”？媒体文件不会被删除。$/, (m, n) => `Delete "${n}"? Your media files are not removed.`],
  [/^空的 (\S+) 槽位 (\d+) — 点击浏览或拖入文件$/, (m, k, i) => `Empty ${tr(k)} slot ${i} — click to browse or drop a file`],
];

function tr(text) {
  if (typeof text !== "string" || !text) return text;
  if (uiLang === "zh") {
    for (const [en, zh] of LANG_PAIRS) {
      if (text === en) return zh;
    }
    for (const [re, out] of ZH_RULES) {
      if (re.test(text)) return text.replace(re, out);
    }
  } else {
    for (const [en, zh] of LANG_PAIRS) {
      if (text === zh) return en;
    }
    for (const [re, out] of EN_RULES) {
      if (re.test(text)) return text.replace(re, out);
    }
  }
  return text;
}

function setUiLang(lang) {
  uiLang = lang === "zh" ? "zh" : "en";
  try { localStorage.setItem("mmxLoaderLang", uiLang); } catch (e) { /* ignore */ }
}

/** Keep a normalised crop rect at the requested pixel aspect ratio while
 *  fitting inside the remaining canvas. Both bounds are honoured, so dragging
 *  to an edge can never distort the locked ratio. */
function applyAspectLock(crop, aspect, vw, vh) {
  if (!crop || aspect === "free") return;
  const target = parseFloat(aspect);
  if (!Number.isFinite(target) || target <= 0) return;
  const ratio = (target * vh) / vw; // normalised w / h for the target ratio
  const maxW = 1 - crop.x;
  const maxH = 1 - crop.y;
  let w = crop.w;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  if (w > maxW) {
    w = maxW;
    h = w / ratio;
  }
  crop.w = Math.max(0.05, Math.min(w, maxW));
  crop.h = Math.max(0.05, Math.min(h, maxH));
}

/** Belt-and-braces: translate any text node / tooltip that el() may have
 *  missed (e.g. stale panels, dynamically assigned textContent). */
function localizeDom(root) {
  if (!root || typeof document === "undefined") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const node of textNodes) {
    const text = node.nodeValue || "";
    const translated = tr(text);
    if (translated !== text) node.nodeValue = translated;
  }
  root.querySelectorAll?.("[title], [placeholder]").forEach((target) => {
    const title = target.getAttribute("title");
    if (title) target.setAttribute("title", tr(title));
    const placeholder = target.getAttribute("placeholder");
    if (placeholder) target.setAttribute("placeholder", tr(placeholder));
  });
}

/** Auto-correct any text that appears inside a loader surface, so stale DOM
 *  or late textContent assignments can never leak the wrong language. */
function observeLanguage(root) {
  if (!root || typeof MutationObserver === "undefined") return;
  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => localizeDom(root), 30);
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true });
  return observer;
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    const value = (k === "title" || k === "placeholder") ? tr(v) : v;
    if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k === "class") e.className = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k.startsWith("on") && typeof v === "function")
      e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in e) {
      // Some DOM properties are read-only (input.list, input.form, ...);
      // assigning throws in strict mode, so fall back to the attribute.
      try { e[k] = value; } catch (err) { e.setAttribute(k, value); }
    }
    else e.setAttribute(k, value);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null) continue;
    e.append(c.nodeType ? c : document.createTextNode(tr(String(c))));
  }
  return e;
}

export function viewURL(annotated) {
  let name = String(annotated || ""), type = "input";
  const m = name.match(/^(.*)\s\[(input|output|temp)\]$/);
  if (m) { name = m[1]; type = m[2]; }
  let sub = "";
  const slash = name.lastIndexOf("/");
  if (slash >= 0) { sub = name.slice(0, slash); name = name.slice(slash + 1); }
  return api.apiURL(`/view?filename=${encodeURIComponent(name)}` +
    `&subfolder=${encodeURIComponent(sub)}&type=${type}`);
}

export function fmtSpan(item) {
  const t = item.trim || {};
  const a = t.start || 0;
  const b = t.end || item.duration || 0;
  return `${a.toFixed(1)}\u2013${b.toFixed(1)}s`;
}

function fmtDur(s) {
  if (s == null) return "";
  return s >= 60
    ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`
    : `${(Math.round(s * 10) / 10).toFixed(1)}s`;
}

/** Tag numbering, mirroring the reference model's node ordering. */
/** An item counts unless it has been switched off. */
export function isOn(item) {
  return item && item.enabled !== false;
}

export function computeTags(all) {
  const items = (all || []).filter(isOn);
  const tags = new Map();      // item -> "<Picture 1>"
  const extra = new Map();     // item -> tag for a split-off soundtrack
  let p = 0, v = 0, a = 0;
  items.forEach((it) => { if (it.kind === "picture") tags.set(it, `<Picture ${++p}>`); });
  items.forEach((it) => {
    if (it.kind !== "video") return;
    if (it.has_audio && (it.audio_mode || "paired") === "paired")
      extra.set(it, `<Audio ${++a}>`);
    tags.set(it, `<Video ${++v}>`);
  });
  items.forEach((it) => {
    if (it.kind === "audio") tags.set(it, `<Audio ${++a}>`);
    else if (it.kind === "video" && it.has_audio && it.audio_mode === "standalone")
      extra.set(it, `<Audio ${++a}>`);
  });
  return { tags, extra };
}

export function fileCount(all) {
  let n = 0;
  (all || []).filter(isOn).forEach((it) => {
    n += 1;
    if (it.kind === "video" && it.has_audio && (it.audio_mode || "paired") !== "off")
      n += 1;
  });
  return n;
}

/* --------------------------------------------------- renderer detection */

/** True when the Vue renderer (Nodes 2.0) appears to be active.
 *  Detection is best-effort and never throws: when unsure we assume Vue,
 *  because the Vue-safe paths also work under LiteGraph. */
export function isVueNodes() {
  try {
    const s = app.ui?.settings;
    const flag = s?.getSettingValue?.("Comfy.VueNodes.Enabled")
      ?? s?.getSettingValue?.("Comfy.Node.VueNodes")
      ?? s?.getSettingValue?.("LiteGraph.VueNodes.Enabled");
    if (typeof flag === "boolean") return flag;
    if (document.querySelector(".vue-nodes, [data-vue-node], .lg-node-vue"))
      return true;
    return false;
  } catch (e) {
    return false;
  }
}

/** Apply a canvas-only layout hook if this renderer still honours it. */
export function applyCanvasSizing(node, widget, width, height) {
  try {
    if (widget) {
      // Honoured by LiteGraph; harmless if Vue owns layout instead.
      widget.computedHeight = height;
      widget.computeSize = () => [width, height];
    }
    const min = node.computeSize?.();
    node.size[0] = Math.max(width, node.size[0] || 0);
    node.size[1] = Math.max(min?.[1] || 0, height, node.size[1] || 0);
  } catch (e) {
    /* Vue may own layout entirely; the CSS height keeps the panel intact. */
  }
}

/** Nodes fed by one of this node's outputs. Renderer-agnostic. */
export function outputTargets(node, slot) {
  try {
    const direct = node.getOutputNodes?.(slot);
    if (Array.isArray(direct) && direct.length) return direct;
  } catch (e) { /* fall through to the link table */ }
  const out = [];
  try {
    for (const id of node.outputs?.[slot]?.links || []) {
      const link = app.graph.links?.[id];
      const target = link && app.graph.getNodeById?.(link.target_id);
      if (target) out.push(target);
    }
  } catch (e) { /* nothing wired */ }
  return out;
}

export function safeCanvasFocus(node) {
  try {
    const canvas = app.canvas;
    if (!canvas || typeof canvas.centerOnNode !== "function") return false;
    canvas.centerOnNode(node);
    if (typeof canvas.selectNode === "function") canvas.selectNode(node);
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ css */

export const PANEL_H = 476;
export const NODE_W = 900;

const CSS = `
.mml-panel{font-family:system-ui,sans-serif;color:#d7dbe2;font-size:12px;
  background:#191c22;border:1px solid #2a2f3a;border-radius:8px;padding:8px;
  display:flex;flex-direction:column;gap:6px;box-sizing:border-box;
  width:100%;height:100%;min-height:476px;overflow:hidden;}
.mml-cols{flex:1;min-height:132px;display:grid;
  grid-template-columns:minmax(0,7fr) minmax(0,3fr);
  gap:9px;overflow:hidden;}
.mml-col{display:flex;flex-direction:column;gap:5px;min-width:0;overflow:hidden;}
.mml-modal .mml-panel{border:0;height:100%;min-height:0;}
.mml-overlay{position:fixed;inset:0;z-index:10040;background:rgba(8,10,14,.62);
  display:flex;align-items:center;justify-content:center;}
.mml-modal{width:min(960px,94vw);height:min(520px,92vh);background:#191c22;
  border:1px solid #303642;border-radius:10px;display:flex;flex-direction:column;
  overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.55);}
.mml-modalhead{display:flex;align-items:center;gap:10px;padding:9px 13px;
  background:#1e222a;border-bottom:1px solid #2a2f3a;font-size:13px;
  font-weight:500;color:#d7dbe2;font-family:system-ui,sans-serif;}
.mml-modalhead button{margin-left:auto;background:none;border:0;color:#8a93a3;
  font-size:17px;cursor:pointer;}
.mml-modalhead button:hover{color:#fff;}
.mml-modalbody{flex:1;min-height:0;padding:8px;overflow:auto;}
.mml-panel.drop{border-color:#6f86b8;background:#1d2330;}
.mml-top{display:flex;align-items:center;gap:8px;flex:0 0 auto;}
.mml-btn{background:#2b3140;border:1px solid #3a4252;color:#d7dbe2;border-radius:6px;
  padding:4px 10px;font-size:11px;cursor:pointer;}
.mml-btn:hover{background:#333b4d;}
.mml-presetrow{flex:0 0 auto;display:flex;align-items:center;gap:5px;}
.mml-presetlbl{font-size:10px;text-transform:uppercase;letter-spacing:.07em;
  color:#6b7484;}
.mml-preset{flex:1;min-width:0;background:#12151b;color:#c9cfda;
  border:1px solid #2e3440;border-radius:6px;padding:3px 6px;font-size:11px;
  font-family:system-ui,sans-serif;}
.mml-preset:focus{outline:none;border-color:#4a5568;}
.mml-btn.mml-sm{padding:3px 9px;font-size:10px;}
.mml-btn.mml-danger{border-color:#7a3a3a;color:#f0a0a0;}
.mml-btn.mml-danger:hover{background:#3a2020;}
.mml-presetname{flex:1;min-width:0;background:#12151b;color:#dde2ea;
  border:1px solid #4a5568;border-radius:6px;padding:3px 7px;font-size:11px;
  font-family:system-ui,sans-serif;}
.mml-presetname:focus{outline:none;border-color:#6f86b8;}
.mml-presetwarn{flex:1;min-width:0;font-size:10px;color:#e0a94c;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
.mml-topspace{flex:1;}
.mml-count{font-size:10px;color:#8a93a3;font-family:ui-monospace,monospace;}
.mml-count.over{color:#f07070;}
.mml-msg{flex:0 0 auto;font-size:10px;min-height:12px;color:#e0a94c;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
.mml-msg.err{color:#f07070;}
.mml-sec{flex:0 0 auto;display:flex;align-items:center;font-size:10px;
  text-transform:uppercase;letter-spacing:.07em;color:#6b7484;}
.mml-sec span{margin-left:auto;text-transform:none;letter-spacing:0;color:#5c6472;
  font-family:ui-monospace,monospace;}

.mml-pics{flex:1;min-height:0;display:grid;
  grid-template-columns:repeat(8,minmax(0,1fr));
  grid-auto-rows:minmax(96px,1fr);gap:5px;}
/* 视频区：每条缩短为约 1/3 高度（窄竖条），不再撑满右栏 */
.mml-vids{flex:0 0 auto;display:grid;grid-template-rows:repeat(3,60px);gap:5px;
  grid-template-columns:minmax(0,1fr);}
.mml-spacer{flex:0 0 auto;min-height:0;}
/* 音频区：与视频同样高度、同样宽度，一行一个竖着排列 */
.mml-auds{flex:0 0 auto;display:grid;grid-auto-rows:60px;gap:5px;
  grid-template-columns:minmax(0,1fr);}

.mml-slot{border:1px dashed #2b313d;border-radius:6px;background:#141820;
  display:flex;align-items:center;justify-content:center;gap:5px;color:#4d5563;
  font-size:10px;cursor:pointer;overflow:hidden;min-width:0;min-height:0;}
.mml-slot:hover{border-color:#59637a;color:#8a93a3;}
.mml-slot.hot{border-color:#6f86b8;background:#1b2230;color:#9db4dc;}
.mml-slot.filled{border-style:solid;border-color:#2e3440;background:#12151b;cursor:default;
  display:block;position:relative;min-width:0;min-height:0;overflow:hidden;}
.mml-slot.filled.pic{border-color:#6d5527;}
.mml-slot.filled.vid{border-color:#255c6b;}
.mml-slot.filled.aud{border-color:#4c3d6e;}
.mml-slot.dragging{opacity:.35;}
.mml-slot.over{outline:1px solid #6f86b8;outline-offset:1px;}

.mml-dims{position:absolute;right:3px;top:27px;padding:1px 4px;border-radius:4px;
  background:rgba(8,10,14,.85);color:#dfe4ec;font-size:8px;line-height:1.2;
  font-family:ui-monospace,monospace;pointer-events:none;letter-spacing:0;
  text-shadow:0 1px 2px rgba(0,0,0,.9);z-index:2;}
.mml-dims:empty{display:none;}
.mml-lightdims{font-size:10px;color:#8a93a3;font-family:ui-monospace,monospace;}
.mml-pic{position:absolute;left:0;right:0;top:24px;bottom:0;width:100%;
  object-fit:cover;object-position:center center;
  display:block;cursor:zoom-in;background:#0d1015;}
.mml-picbar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;
  gap:4px;padding:1px 4px;background:rgba(10,12,16,.82);min-width:0;overflow:hidden;}
.mml-picmeta{position:absolute;left:0;right:0;top:0;display:flex;gap:3px;
  padding:2px 3px;background:rgba(10,12,16,.88);z-index:3;min-width:0;align-items:center;
  box-sizing:border-box;height:22px;border-bottom:1px solid rgba(255,255,255,.08);}
.mml-piccat{flex:1 1 0;min-width:6.5ch;width:0;box-sizing:border-box;
  font-family:ui-monospace,monospace;font-size:9px;background:rgba(255,255,255,.08);color:#ffffff;
  border:1px solid rgba(255,255,255,.2);border-radius:3px;padding:1px 2px;outline:none;height:18px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:1;text-align:center;
  -webkit-appearance:none;appearance:none;}
.mml-piccat option{background:#1c212b;color:#ffffff;}
.mml-picnum{flex:0 0 auto;min-width:3ch;box-sizing:border-box;
  font-family:ui-monospace,monospace;font-size:9px;background:transparent;color:#e0a94c;
  border:none;border-radius:3px;padding:1px 4px;outline:none;height:18px;
  text-align:center;opacity:1;font-weight:600;}
.mml-piccat:focus{border-color:#ffffff;background:rgba(0,0,0,.15);}
.mml-tag{font-family:ui-monospace,monospace;font-size:9px;white-space:nowrap;}
.mml-tag.pic{color:#e0a94c;} .mml-tag.vid{color:#4cc3e0;} .mml-tag.aud{color:#b48ce8;}
.mml-x{cursor:pointer;color:#7a8393;font-size:11px;line-height:1;}
.mml-x:hover{color:#e05a5a;}

.mml-row{display:flex;align-items:center;gap:6px;padding:0 6px;height:100%;
  box-sizing:border-box;min-width:0;overflow:hidden;}
.mml-vthumb{flex:1 1 auto;min-width:60px;max-width:45%;height:calc(100% - 8px);
  width:auto;border-radius:4px;object-fit:cover;background:#0d1015;
  flex-shrink:1;cursor:zoom-in;}
.mml-meta{min-width:0;flex:1;}
.mml-name{font-size:9px;color:#6b7484;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;}
.mml-play{width:20px;height:20px;border-radius:50%;border:1px solid #3a4252;background:#20242d;
  color:#c9cfda;font-size:9px;line-height:1;cursor:pointer;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;padding:0;}
.mml-play:hover{border-color:#59637a;}
.mml-bar{flex:1;height:3px;background:#2a2f3a;border-radius:2px;min-width:16px;
  cursor:pointer;position:relative;}
.mml-bar i{position:absolute;left:0;top:0;bottom:0;background:#7d63b8;border-radius:2px;
  display:block;width:0;}
.mml-time{font-size:9px;color:#6b7484;font-family:ui-monospace,monospace;flex-shrink:0;}
.mml-seg{display:inline-flex;border:1px solid #2e3440;border-radius:4px;overflow:hidden;
  flex-shrink:0;}
.mml-seg button{background:none;border:0;color:#6b7484;font-size:9px;padding:1px 5px;
  cursor:pointer;}
.mml-seg button.on{background:#3a2f56;color:#e2d6f8;}
.mml-power{cursor:pointer;color:#4d5563;font-size:11px;line-height:1;flex-shrink:0;
  user-select:none;}
.mml-power.on{color:#7ec87e;}
.mml-power:hover{color:#a8e6a8;}
.mml-slot.filled.off{opacity:.42;border-style:dashed;}
.mml-slot.filled.off .mml-power{opacity:1;color:#6b7484;}
.mml-slot.filled.off:hover{opacity:.7;}
.mml-segstack{display:flex;flex-direction:column;align-items:center;gap:2px;
  flex-shrink:0;}
.mml-segtag{font-size:9px;}
.mml-trimok{border-color:#3e5240;color:#7ec87e;}
.mml-trimbtn{cursor:pointer;color:#e0a94c;opacity:.65;font-size:15px;line-height:1;
  flex-shrink:0;user-select:none;}
.mml-trimbtn:hover{opacity:1;}
.mml-trimbtn.on{opacity:1;text-shadow:0 0 6px rgba(224,169,76,.55);}
.mml-tmover{position:fixed;inset:0;background:rgba(8,10,14,.72);z-index:10050;
  display:flex;align-items:center;justify-content:center;}
.mml-tmmodal{width:min(640px,92vw);background:#191c22;border:1px solid #303642;
  border-radius:10px;box-shadow:0 24px 64px rgba(0,0,0,.55);display:flex;
  flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif;}
.mml-tmhead{display:flex;align-items:center;gap:8px;padding:8px 12px;
  border-bottom:1px solid #2a2f3a;background:#1b1f27;}
.mml-tmtitle{flex:1;min-width:0;font-size:12px;color:#dde2ea;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
.mml-tmstage{position:relative;background:#000;line-height:0;}
.mml-tmfit{margin:0 auto;}
.mml-tmvideo{width:100%;height:100%;object-fit:contain;display:block;}
.mml-tmcropwrap{position:absolute;inset:0;}
.mml-tmcrop{position:absolute;border:1px solid rgba(255,255,255,.7);cursor:move;
  background:none;box-shadow:0 0 0 4000px rgba(0,0,0,.45);}
.mml-tmcrop.locked{cursor:default;border-color:rgba(255,255,255,.35);}
.mml-tmcrop.locked .mml-tmcorner{display:none;}
.mml-tmcorner{position:absolute;width:9px;height:9px;background:rgba(255,255,255,.85);
  border-radius:2px;}
.mml-tmcorner.nw{left:-6px;top:-6px;cursor:nwse-resize;}
.mml-tmcorner.ne{right:-6px;top:-6px;cursor:nesw-resize;}
.mml-tmcorner.sw{left:-6px;bottom:-6px;cursor:nesw-resize;}
.mml-tmcorner.se{right:-6px;bottom:-6px;cursor:nwse-resize;}
.mml-tmcropbar{display:flex;align-items:center;gap:6px;}
.mml-tmcropinfo{font-size:10px;color:#4cc3e0;font-family:ui-monospace,monospace;}
.mml-tmaspect{background:#12151b;color:#c9cfda;border:1px solid #2e3440;
  border-radius:6px;padding:2px 5px;font-size:11px;}
.mml-btn.on{background:#173642;border-color:#4cc3e0;color:#9fe3f5;}
.mml-tmtimeline{position:relative;padding:8px 14px 4px;}
.mml-tmwave{display:block;width:100%;height:46px;margin-bottom:2px;}
.mml-tmruler{position:relative;height:16px;}
.mml-tmtick{position:absolute;transform:translateX(-50%);font-size:9px;
  color:#6b7484;}
.mml-tmtick::before{content:"";position:absolute;left:50%;top:-3px;width:1px;
  height:3px;background:#3a4252;}
.mml-tmbar{position:relative;height:20px;background:#12151b;border-radius:5px;
  margin:2px 0 6px;cursor:pointer;}
.mml-tmsel{position:absolute;top:0;bottom:0;background:#1f6f96;border-radius:5px;}
.mml-tmhandle{position:absolute;top:-3px;bottom:-3px;width:9px;background:#4cc3e0;
  border-radius:3px;transform:translateX(-50%);cursor:ew-resize;z-index:2;}
.mml-tmhandle:hover{background:#7fd8ee;box-shadow:0 0 6px rgba(76,195,224,.7);}
.mml-tmplayhead{position:absolute;top:-5px;bottom:-5px;width:2px;
  background:#ffb84d;transform:translateX(-50%);pointer-events:none;z-index:4;
  box-shadow:0 0 0 1px rgba(0,0,0,.65), 0 0 7px rgba(255,184,77,.85);}
.mml-tmplayhead::before{content:"";position:absolute;left:50%;top:-4px;
  width:0;height:0;transform:translateX(-50%);
  border-left:4px solid transparent;border-right:4px solid transparent;
  border-top:5px solid #ffb84d;}
.mml-tmnow{display:flex;gap:5px;align-items:center;height:14px;
  font-size:9px;color:#8a6a33;text-transform:uppercase;letter-spacing:.06em;}
.mml-tmplaytime{color:#ffb84d;font-family:ui-monospace,monospace;
  text-transform:none;letter-spacing:0;font-size:10px;}
.mml-tmfoot{display:flex;align-items:center;gap:5px;padding:8px 12px 0;
  flex-wrap:wrap;}
.mml-tmfoot.act{padding:8px 12px 4px;border-top:1px solid #23272f;margin-top:8px;}
.mml-tmgap{width:8px;}
.mml-tmspace{flex:1;}
.mml-tmnum{width:52px;background:#12151b;color:#dde2ea;border:1px solid #2e3440;
  border-radius:6px;padding:3px 6px;font-size:11px;text-align:right;
  font-family:ui-monospace,monospace;}
.mml-tmnum:focus{outline:none;border-color:#4cc3e0;}
.mml-tmdash{color:#5c6472;font-size:11px;}
.mml-tmoutside{font-size:10px;color:#f07070;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;text-transform:none;letter-spacing:0;}
.mml-tmplayhead.out{background:#f07070;
  box-shadow:0 0 0 1px rgba(0,0,0,.65), 0 0 7px rgba(240,112,112,.85);}
.mml-tmplayhead.out::before{border-top-color:#f07070;}
.mml-tmkeys{padding:0 12px 10px;font-size:10px;color:#5c6472;}
.mml-tmreadout{font-size:11px;color:#8a93a3;font-family:ui-monospace,monospace;}
.mml-tmreadout.bad{color:#f07070;}
.mml-btn.primary{background:#1f4f7d;border-color:#3d7fbf;color:#dbeafe;}
.mml-trimrow{display:flex;align-items:center;flex-wrap:nowrap;gap:3px;
  padding:0 5px;height:100%;overflow:hidden;}
.mml-trimlbl{font-size:9px;text-transform:uppercase;letter-spacing:.07em;
  color:#6b7484;}
.mml-triminput{width:38px;background:#12151b;color:#dde2ea;
  border:1px solid #2e3440;border-radius:5px;padding:2px 6px;font-size:11px;}
.mml-triminput:focus{outline:none;border-color:#4a5568;}
.mml-trimdash{color:#6b7484;}
.mml-trimof{font-size:10px;color:#6b7484;}
.mml-trimerr{flex-basis:100%;font-size:10px;color:#f07070;}
.mml-trimerr:empty{display:none;}

.mml-order{flex:0 0 auto;background:#1a2230;border:1px solid #2b3a52;border-radius:6px;
  padding:4px 7px;height:42px;box-sizing:border-box;overflow:hidden;}
.mml-order b{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.07em;
  color:#6f86b8;font-weight:500;margin-bottom:1px;}
.mml-order div{font-family:ui-monospace,monospace;font-size:9px;color:#9db4dc;
  line-height:1.35;overflow:hidden;}

.mml-light{position:fixed;inset:0;z-index:10050;background:rgba(8,10,14,.75);
  display:flex;align-items:center;justify-content:center;}
.mml-lightbox{max-width:80vw;max-height:80vh;background:#1e222a;border:1px solid #3a4252;
  border-radius:10px;overflow:hidden;padding:8px;}
.mml-lightbox img,.mml-lightbox video{max-width:76vw;max-height:68vh;display:block;}
.mml-lightcap{display:flex;align-items:center;gap:8px;padding-top:6px;font-size:11px;
  color:#8a93a3;}
.mml-helpbtn{margin-left:5px;width:13px;height:13px;line-height:1;padding:0;
  border-radius:50%;border:1px solid #3a4252;background:#20242d;color:#8a93a3;
  font-size:9px;cursor:pointer;font-family:system-ui,sans-serif;}
.mml-helpbtn:hover{border-color:#6f86b8;color:#c9cfda;}
.mml-help{position:fixed;z-index:10055;width:370px;max-height:min(560px,88vh);
  background:#1e222a;border:1px solid #3a4252;border-radius:9px;overflow:hidden;
  display:flex;flex-direction:column;box-shadow:0 14px 36px rgba(0,0,0,.55);
  font-family:system-ui,sans-serif;}
.mml-helphead{display:flex;align-items:center;padding:7px 10px;background:#232833;
  border-bottom:1px solid #2a2f3a;font-size:11px;text-transform:uppercase;
  letter-spacing:.07em;color:#8a93a3;}
.mml-helphead button{margin-left:auto;background:none;border:0;color:#6b7484;
  font-size:13px;cursor:pointer;line-height:1;}
.mml-helphead button:hover{color:#fff;}
.mml-helpbody{overflow:auto;padding:9px 10px;}
.mml-helpbody p{margin:0;font-size:11px;line-height:1.55;color:#aab2c0;}
.mml-helprow{display:flex;gap:8px;margin-bottom:9px;}
.mml-helpmode{flex:0 0 auto;font-family:ui-monospace,monospace;font-size:10px;
  border-radius:9px;padding:1px 7px;height:16px;line-height:14px;
  border:1px solid #363d4a;background:#20242d;color:#8a93a3;}
.mml-helpmode.paired{border-color:#7d63b8;background:#3a2f56;color:#e2d6f8;}
.mml-helpmode.alone{border-color:#2c6f81;background:#1d3a44;color:#a5e2f0;}
.mml-helpsub{font-size:10px;text-transform:uppercase;letter-spacing:.07em;
  color:#6b7484;margin:12px 0 6px;padding-top:8px;border-top:1px solid #2a2f3a;}
.mml-wirerow{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:6px;}
.mml-wirerow code{font-family:ui-monospace,monospace;font-size:10px;color:#9db4dc;
  background:#181c24;border-radius:4px;padding:1px 5px;}
.mml-arrow{color:#5c6472;font-size:10px;}
.mml-tags{font-family:ui-monospace,monospace;font-size:9px;color:#6b7484;
  flex-basis:100%;padding-left:2px;}
.mml-helpnote{margin-top:10px !important;padding-top:9px;
  border-top:1px solid #2a2f3a;color:#8a93a3 !important;}
.mml-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10060;
  background:#2b3140;color:#fff;border:1px solid #4a5568;border-radius:8px;
  padding:8px 16px;font-size:13px;font-family:system-ui,sans-serif;}
.mml-tabs{display:flex;flex-direction:column;width:100%;box-sizing:border-box;}
.mml-tabs-head{display:flex;align-items:center;gap:4px;padding:5px 4px;flex:0 0 auto;
  flex-wrap:wrap;background:#1b1f27;border:1px solid #2a2f3a;border-radius:6px;}
.mml-tabs-body{display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;
  overflow-y:auto;}
.mml-topbar{display:flex;align-items:center;gap:6px;padding:4px 6px;flex:0 0 auto;
  background:#1b1f27;border:1px solid #2a2f3a;border-radius:6px;}
.mml-toplabel{font-size:11px;color:#8a93a3;flex:0 0 auto;letter-spacing:.03em;}
.mml-topidx{width:56px;background:#12151b;color:#dde2ea;border:1px solid #4a5568;
  border-radius:6px;padding:3px 6px;font-size:12px;font-family:ui-monospace,monospace;}
.mml-topidx:focus{outline:none;border-color:#6f86b8;}
.mml-topbtn{background:#2b3140;border:1px solid #3a4252;color:#d7dbe2;border-radius:6px;
  padding:4px 10px;font-size:11px;cursor:pointer;flex:0 0 auto;white-space:nowrap;}
.mml-topbtn:hover{background:#333b4d;}
/* Tab 页签（样式与多Tab字符串节点的 Tab 一致） */
.mml-tab{display:inline-flex;align-items:center;gap:4px;
  background:#232833;border:1px solid #2e3440;color:#8a93a3;border-radius:6px;
  padding:3px 6px 3px 8px;font-size:11px;cursor:pointer;user-select:none;
  max-width:200px;flex:0 0 auto;}
.mml-tab:hover{background:#2b3140;color:#c9cfda;}
.mml-tab.active{background:#3a4252;color:#fff;border-color:#4a5568;}
.mml-tab-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mml-tab-count{font-size:9px;color:#7fc1a5;background:#1c2a26;border:1px solid #2f4a40;
  border-radius:8px;padding:0 4px;font-family:ui-monospace,monospace;flex:0 0 auto;}
/* 关闭按钮与标题保持较长间距（≥4 个汉字，em 单位随字号等比缩放，
   任意画布 zoom/节点缩放下视觉间距恒定），避免误触 */
.mml-tab-x{flex:0 0 auto;margin-left:4.2em;width:14px;height:14px;line-height:12px;
  text-align:center;border-radius:50%;color:#8a93a3;font-size:11px;cursor:pointer;}
.mml-tab-x:hover{color:#ff6b6b;background:#454f63;}
.mml-tab.mml-add{background:transparent;border:1px dashed #3a4252;color:#8a93a3;
  font-size:14px;padding:2px 10px;}
.mml-tab.mml-add:hover{background:#2b3140;color:#d7dbe2;border-color:#4a5568;}
.mml-tab-edit{width:120px;background:#171a21;color:#ddd;border:1px solid #4a5568;
  border-radius:3px;padding:1px 6px;font-size:11px;outline:none;}
/* 关闭确认弹窗 */
.mml-modal-overlay{position:fixed;inset:0;z-index:10080;background:rgba(8,10,14,.72);
  display:flex;align-items:center;justify-content:center;}
.mml-modal-box{background:#232833;border:1px solid #3a4252;border-radius:10px;
  min-width:320px;max-width:420px;padding:18px 20px;box-shadow:0 8px 30px rgba(0,0,0,.5);}
.mml-modal-msg{font-size:13px;line-height:1.6;color:#e3e7ee;white-space:pre-line;
  margin-bottom:16px;}
.mml-modal-btns{display:flex;justify-content:flex-end;gap:10px;}
.mml-tab-block{border:1px solid #3a3f4b;border-radius:4px;background:#20242e;
  overflow:hidden;display:flex;flex-direction:column;flex:1 1 auto;min-height:0;}
.mml-tab-block .mml-panel{flex:1;min-height:0;height:auto;overflow:hidden;}
.mml-del{background:#5a2a2a;border-color:#7f3a3a;}
.mml-del:hover{background:#7a3a3a;}
`;

let cssDone = false;
function injectCSS() {
  if (cssDone) return;
  document.head.append(el("style", { textContent: CSS }));
  cssDone = true;
}

/* ------------------------------------------------------------------ */
/* Trim / crop modal                                                   */
/* ------------------------------------------------------------------ */

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

/** Popout editor for a clip's trim range and (for video) a crop rect.
 *  Writes item.trim {start,end} and item.crop {x,y,w,h} on Apply only. */
class TrimModal {
  constructor(panel, item) {
    this.panel = panel;
    this.item = item;
    this.dur = item.duration || 0;
    this.start = item.trim?.start || 0;
    this.end = item.trim?.end ?? this.dur;
    this.crop = item.crop ? { ...item.crop } : null;
    this.cropMode = false;
    this.aspect = "free";
    this.drag = null;
    injectCSS();
    this.build();
    document.body.append(this.overlay);
    window.addEventListener("keydown", this.onKey = (e) => this.key(e));
  }

  /** Keyboard control. Typing in a field always wins. */
  key(e) {
    const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === "Escape") {
      if (!typing) this.close();
      return;
    }
    if (typing) return;

    const frame = 1 / (this.item.fps || TRIM_FPS);
    const jump = e.shiftKey ? frame * 10 : frame;
    const at = this.media?.currentTime || 0;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault(); this.seek(at - jump); break;
      case "ArrowRight":
        e.preventDefault(); this.seek(at + jump); break;
      case "Home":
        e.preventDefault(); this.seek(this.start); break;
      case "End":
        e.preventDefault(); this.seek(Math.max(this.start, this.end - frame));
        break;
      case " ":
        e.preventDefault(); this.playBtn.click(); break;
      case "[":
        e.preventDefault();
        this.start = Math.min(at, this.end - 0.1); this.layoutTimeline(); break;
      case "]":
        e.preventDefault();
        this.end = Math.max(at, this.start + 0.1); this.layoutTimeline(); break;
      case "c": case "C":
        if (this.item.kind === "video") { e.preventDefault(); this.captureFrame(); }
        break;
      default: break;
    }
  }

  close() {
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    try { this.media?.pause?.(); } catch (e) {}
    this.overlay.remove();
  }

  apply() {
    const it = this.item;
    const eps = 0.05;
    if (this.start <= eps && this.end >= this.dur - eps) delete it.trim;
    else it.trim = { start: +this.start.toFixed(2),
      end: this.end >= this.dur - eps ? null : +this.end.toFixed(2) };
    if (this.crop && it.kind === "video") it.crop = this.crop;
    else delete it.crop;
    this.close();
    this.panel.commit();
  }

  /* ---- media preview ---------------------------------------------- */

  buildMedia() {
    const url = viewURL(this.item.file);
    if (this.item.kind === "video") {
      this.media = el("video", { class: "mml-tmvideo", src: url, muted: true,
        playsInline: true, loop: false, preload: "auto" });
    } else {
      this.media = el("audio", { src: url, preload: "auto" });
    }
    // keep playback inside the selected range
    this.media.addEventListener("loadedmetadata", () => {
      this.fitStage(this.media.videoWidth, this.media.videoHeight);
      this.updatePlayhead();
    });
    this.media.addEventListener("seeked", () => this.updatePlayhead());
    this.media.addEventListener("timeupdate", () => {
      if (this.media.currentTime >= this.end - 0.02) {
        this.media.currentTime = this.start;
      }
      this.updatePlayhead();
    });
    this.playBtn = el("button", { class: "mml-btn mml-sm",
      onclick: () => {
        if (this.media.paused) {
          if (this.media.currentTime < this.start ||
              this.media.currentTime >= this.end - 0.02)
            this.media.currentTime = this.start;
          this.media.play();
          this.playBtn.textContent = "\u23f8";
          this.startTicking();
        } else { this.media.pause(); this.playBtn.textContent = "\u25b6"; }
      } }, "\u25b6");
  }

  /** Size the preview stage to the media's real aspect so normalised crop
   *  coordinates map 1:1 to the actual pixels (no letterbox drift). */
  fitStage(vw, vh) {
    if (!this.stage || !vw || !vh) return;
    const maxW = Math.min(620, (window.innerWidth || 900) * 0.85);
    const maxH = 340;
    const scale = Math.min(maxW / vw, maxH / vh, 1);
    this.stage.style.width = `${Math.max(32, Math.round(vw * scale))}px`;
    this.stage.style.height = `${Math.max(32, Math.round(vh * scale))}px`;
  }

  seek(t, pause = true) {
    if (pause && !this.media.paused) {
      this.media.pause(); this.playBtn.textContent = "\u25b6";
    }
    try { this.media.currentTime = Math.min(Math.max(t, 0), this.dur); }
    catch (e) {}
    this.updatePlayhead();
  }

  /* ---- audio waveform --------------------------------------------- */

  async drawWave(canvas) {
    try {
      const resp = await fetch(viewURL(this.item.file));
      const buf = await resp.arrayBuffer();
      const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
      const audio = await ctx2.decodeAudioData(buf);
      const data = audio.getChannelData(0);
      const g = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height, N = 240;
      const per = Math.floor(data.length / N);
      g.clearRect(0, 0, W, H);
      g.fillStyle = "#7d63b8";
      for (let i = 0; i < N; i++) {
        let peak = 0;
        for (let j = i * per; j < (i + 1) * per; j += 16)
          peak = Math.max(peak, Math.abs(data[j]));
        const h = Math.max(1, peak * H * 0.92);
        g.fillRect(i * (W / N), (H - h) / 2, W / N - 1, h);
      }
      ctx2.close();
    } catch (e) { /* waveform is decoration; the ruler still works */ }
  }

  /* ---- timeline ---------------------------------------------------- */

  buildTimeline() {
    this.ruler = el("div", { class: "mml-tmruler" });
    const ticks = 8;
    for (let i = 0; i <= ticks; i++) {
      this.ruler.append(el("span", { class: "mml-tmtick",
        style: { left: `${(i / ticks) * 100}%` } },
        fmt(this.dur * (i / ticks))));
    }
    this.selEl = el("div", { class: "mml-tmsel" });
    this.hStart = el("div", { class: "mml-tmhandle s",
      title: "Drag to move the start of the kept range",
      onmousedown: (e) => this.handleDown(e, "s") });
    this.hEnd = el("div", { class: "mml-tmhandle e",
      title: "Drag to move the end of the kept range",
      onmousedown: (e) => this.handleDown(e, "e") });
    this.playhead = el("div", { class: "mml-tmplayhead" });
    this.playTime = el("span", { class: "mml-tmplaytime" });
    this.outside = el("span", { class: "mml-tmoutside" });
    this.bar = el("div", { class: "mml-tmbar",
      onmousedown: (e) => this.barDown(e) },
      this.selEl, this.hStart, this.hEnd, this.playhead);
    if (this.item.kind === "audio") {
      this.wave = el("canvas", { class: "mml-tmwave", width: 560, height: 46 });
      this.drawWave(this.wave);
    }
    const num = (label, get, set) => {
      const input = el("input", { class: "mml-tmnum", type: "text",
        inputmode: "decimal", title: `${label} time in seconds` });
      input.addEventListener("focus", () => { this.typing = input; input.select(); });
      input.addEventListener("blur", () => {
        if (this.typing === input) this.typing = null;
        this.layoutTimeline();               // snap display back to the value
      });
      const commit = () => {
        const v = parseFloat(input.value.replace(",", "."));
        if (Number.isNaN(v)) { this.layoutTimeline(); return; }
        set(Math.min(Math.max(v, 0), this.dur));
        this.seek(get());
        this.layoutTimeline();
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { commit(); input.blur(); }
        if (e.key === "Escape") { this.layoutTimeline(); input.blur();
          e.stopPropagation(); }           // don't close the modal on field-escape
      });
      return input;
    };
    this.numStart = num("Start", () => this.start,
      (v) => { this.start = Math.min(v, this.end - 0.1); });
    this.numEnd = num("End", () => this.end,
      (v) => { this.end = Math.max(v, this.start + 0.1); });
    this.readout = el("span", { class: "mml-tmreadout" });
    this.layoutTimeline();
    return el("div", { class: "mml-tmtimeline" },
      this.wave || null, this.ruler, this.bar,
      el("div", { class: "mml-tmnow" },
        this.outside,
        el("span", { class: "mml-tmspace" }),
        el("span", {}, "playhead"), this.playTime));
  }

  /** Time under the pointer, clamped to the clip. */
  timeAt(e) {
    const r = this.bar.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * this.dur;
    return Math.min(Math.max(t, 0), this.dur);
  }

  /** Clicking the bar scrubs the playhead only — the range is left alone.
   *  Handles have their own listener, so the two can't be confused. */
  barDown(e) {
    e.preventDefault();
    this.drag = "playhead";
    this.seek(this.timeAt(e));
    this.dragListen();
  }

  handleDown(e, which) {
    e.preventDefault();
    e.stopPropagation();               // don't also scrub
    this.drag = which;
    this.dragListen();
  }

  dragListen() {
    const move = (ev) => this.barMove(ev);
    const up = () => {
      this.drag = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  barMove(e) {
    if (!this.drag) return;
    const t = this.timeAt(e);
    if (this.drag === "playhead") { this.seek(t); return; }
    if (this.drag === "s") this.start = Math.min(t, this.end - 0.1);
    else this.end = Math.max(t, this.start + 0.1);
    this.seek(t);                      // preview follows the handle being moved
    this.layoutTimeline();
  }

  layoutTimeline() {
    const p = (t) => `${(this.dur ? t / this.dur : 0) * 100}%`;
    this.selEl.style.left = p(this.start);
    this.selEl.style.width = p(this.end - this.start);
    this.hStart.style.left = p(this.start);
    this.hEnd.style.left = p(this.end);
    const span = this.end - this.start;
    if (this.numStart && this.typing !== this.numStart)
      this.numStart.value = this.start.toFixed(2);
    if (this.numEnd && this.typing !== this.numEnd)
      this.numEnd.value = this.end.toFixed(2);
    this.readout.textContent = tr(`${span.toFixed(1)}s kept`);
    this.checkOutside();
    const bad = span < CLIP.min;
    this.readout.classList.toggle("bad", bad);
    this.readout.title = bad
      ? tr(`Kept span is under ${CLIP.min}s. Reference models are typically trained on ` +
          `${CLIP.min}\u2013${CLIP.max}s reference clips; shorter ones tend to be ` +
          "weakly followed or ignored. Widen the range, or pad short files " +
          "(like sound effects) with silence before loading.") : "";
  }

  updatePlayhead() {
    if (!this.playhead || !this.dur) return;
    const t = this.media?.currentTime || 0;
    // Clamp a little inside the bar: at exactly 0% or 100% the centred
    // marker is half outside and reads as missing.
    const pct = Math.min(Math.max((t / this.dur) * 100, 0.4), 99.6);
    this.playhead.style.left = `${pct}%`;
    this.playTime.textContent = fmt(t);
    this.checkOutside(t);
  }

  /** Warn when the previewed frame falls outside what will be sent. */
  checkOutside(t) {
    if (!this.outside) return;
    const at = t === undefined ? (this.media?.currentTime || 0) : t;
    const out = at < this.start - 0.001 || at > this.end + 0.001;
    this.outside.textContent = tr(out
      ? `\u26a0 Frame at ${fmt(at)} is outside the kept range`
      : "");
    this.playhead.classList.toggle("out", out);
  }

  /** Keep the marker moving during playback; timeupdate alone is too coarse. */
  tick() {
    this.updatePlayhead();
    if (this.media && !this.media.paused && !this.media.ended) {
      this.raf = requestAnimationFrame(() => this.tick());
    } else this.raf = null;
  }

  startTicking() {
    if (!this.raf) this.tick();
  }

  /* ---- crop -------------------------------------------------------- */

  buildCrop() {
    if (this.item.kind !== "video") return null;
    this.cropRect = el("div", { class: "mml-tmcrop",
      onmousedown: (e) => this.cropDown(e, "move") },
      ...["nw", "ne", "sw", "se"].map((c) =>
        el("div", { class: `mml-tmcorner ${c}`,
          onmousedown: (e) => { e.stopPropagation(); this.cropDown(e, c); } })));
    this.cropWrap = el("div", { class: "mml-tmcropwrap" }, this.cropRect);
    this.cropInfo = el("span", { class: "mml-tmcropinfo" });
    this.cropBtn = el("button", { class: "mml-btn mml-sm",
      title: "Crop the frame",
      onclick: () => {
        this.cropMode = !this.cropMode;
        if (this.cropMode && !this.crop)
          this.crop = { x: 0, y: 0, w: 1, h: 1 };
        if (!this.cropMode && this.crop &&
            this.crop.w > 0.995 && this.crop.h > 0.995) this.crop = null;
        if (!this.cropMode) this.seek(this.media?.currentTime || 0, false);
        this.syncCrop();
      } }, "\u25a3 Crop");
    this.aspectEl = el("select", { class: "mml-tmaspect",
      onchange: (e) => { this.aspect = e.target.value; this.forceAspect(); } },
      [["free", "freeform"], ["1", "1:1"], [String(16 / 9), "16:9"],
       [String(9 / 16), "9:16"]].map(([v, l]) => el("option", { value: v }, l)));
    return el("span", { class: "mml-tmcropbar" },
      this.cropBtn, this.aspectEl, this.cropInfo);
  }

  forceAspect() {
    const vw = (this.item && this.item.width) || 16;
    const vh = (this.item && this.item.height) || 9;
    applyAspectLock(this.crop, this.aspect, vw, vh);
    this.syncCrop();
  }

  cropDown(e, mode) {
    if (!this.cropMode) return;
    e.preventDefault();
    const wrap = this.cropWrap.getBoundingClientRect();
    const c0 = { ...this.crop, mx: e.clientX, my: e.clientY };
    const move = (ev) => {
      const dx = (ev.clientX - c0.mx) / wrap.width;
      const dy = (ev.clientY - c0.my) / wrap.height;
      const c = this.crop;
      if (mode === "move") {
        c.x = Math.min(Math.max(c0.x + dx, 0), 1 - c.w);
        c.y = Math.min(Math.max(c0.y + dy, 0), 1 - c.h);
      } else {
        if (mode.includes("w")) { c.x = Math.min(Math.max(c0.x + dx, 0), c0.x + c0.w - 0.05);
          c.w = c0.w + (c0.x - c.x); }
        if (mode.includes("e")) c.w = Math.min(Math.max(c0.w + dx, 0.05), 1 - c.x);
        if (mode.includes("n")) { c.y = Math.min(Math.max(c0.y + dy, 0), c0.y + c0.h - 0.05);
          c.h = c0.h + (c0.y - c.y); }
        if (mode.includes("s")) c.h = Math.min(Math.max(c0.h + dy, 0.05), 1 - c.y);
      }
      if (this.aspect !== "free") this.forceAspect();
      this.syncCrop();
    };
    const up = () => { window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  syncCrop() {
    if (!this.cropWrap) return;
    // The rect stays on screen whenever a crop exists — only editing is
    // toggled — so you can always see what the frame will be cut to.
    const show = this.cropMode || !!this.crop;
    this.cropWrap.style.display = show ? "" : "none";
    this.cropWrap.style.pointerEvents = this.cropMode ? "" : "none";
    this.cropRect.classList.toggle("locked", !this.cropMode);
    this.cropBtn.classList.toggle("on", !!this.crop);
    this.aspectEl.style.display = this.cropMode ? "" : "none";
    if (this.crop && this.cropRect) {
      const c = this.crop;
      Object.assign(this.cropRect.style, {
        left: `${c.x * 100}%`, top: `${c.y * 100}%`,
        width: `${c.w * 100}%`, height: `${c.h * 100}%`,
      });
      const vw = this.item.width, vh = this.item.height;
      this.cropInfo.textContent = vw
        ? `${Math.round(c.w * vw)} \u00d7 ${Math.round(c.h * vh)}` : "";
    } else this.cropInfo.textContent = "";
  }

  /* ---- capture the displayed frame as a picture reference ---------- */

  async captureFrame() {
    const panel = this.panel;
    // Same limits a dropped file would hit, checked before doing any work.
    if (panel.count("picture") >= MAX.picture) {
      panel.say(`All ${MAX.picture} picture slots are full \u2014 remove one ` +
        "before capturing a frame.", true);
      panel.render();
      this.close();
      return;
    }

    const v = this.media;
    const W = v.videoWidth, H = v.videoHeight;
    if (!W || !H) { panel.say("Frame isn't ready yet \u2014 let the preview " +
      "load, then try again.", true); panel.render(); return; }

    // Honour an active crop so the still matches what the video would send.
    const c = this.crop;
    const sx = c ? Math.round(c.x * W) : 0;
    const sy = c ? Math.round(c.y * H) : 0;
    const sw = c ? Math.max(16, Math.round(c.w * W)) : W;
    const sh = c ? Math.max(16, Math.round(c.h * H)) : H;

    const canvas = document.createElement("canvas");
    canvas.width = sw; canvas.height = sh;
    canvas.getContext("2d").drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);

    const at = this.media.currentTime;
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) { panel.say("Couldn't read that frame.", true); panel.render(); return; }

    const base = (this.item.name || "video").replace(/\.[^.]+$/, "");
    const stamp = at.toFixed(2).replace(".", "-");
    const file = new File([blob], `${base}_frame_${stamp}s.png`,
      { type: "image/png" });

    this.close();
    panel.busy += 1;
    panel.say(`Capturing frame at ${at.toFixed(2)}s\u2026`);
    panel.render();
    try {
      const info = await uploadFile(file);
      panel.items.push({
        kind: "picture",
        file: info.file,
        name: info.original || info.name,
        duration: null,
        width: sw,
        height: sh,
        has_audio: false,
        audio_mode: "off",
      });
      panel.say(`Added ${sw}\u00d7${sh} frame from ${at.toFixed(2)}s` +
        (c ? " (cropped)" : "") + " as a picture reference.");
      panel.commit();
    } catch (err) {
      panel.say(`Capture failed: ${err.message}`, true);
      panel.render();
    } finally {
      panel.busy = Math.max(0, panel.busy - 1);
    }
  }

  /* ---- assembly ---------------------------------------------------- */

  build() {
    this.buildMedia();
    const isVid = this.item.kind === "video";
    const stage = isVid
      ? el("div", { class: "mml-tmstage mml-tmfit" }, this.media, this.cropBar = null,
          (this.cropUI = this.buildCrop(), this.cropWrap))
      : null;
    this.stage = stage;

    const chips = [2, 3].map((secs) =>
      this.dur > secs ? el("button", { class: "mml-btn mml-sm",
        title: `Use only the final ${secs} seconds`,
        onclick: () => { this.start = this.dur - secs; this.end = this.dur;
          this.seek(this.start); this.layoutTimeline(); } },
        `last ${secs}s`) : null);

    this.overlay = el("div", { class: "mml-tmover",
      onmousedown: (e) => { if (e.target === this.overlay) this.close(); } },
      el("div", { class: "mml-tmmodal" + (isVid ? "" : " audio") },
        el("div", { class: "mml-tmhead" },
          el("span", { class: "mml-tmtitle" },
            `\u2702 ${this.item.name}`),
          isVid ? this.cropUI : null,
          el("button", { class: "mml-x", onclick: () => this.close() }, "\u2715")),
        stage,
        this.buildTimeline(),
        el("div", { class: "mml-tmfoot" },
          el("button", { class: "mml-btn mml-sm", title: "Previous frame (\u2190)",
            onclick: () => this.seek((this.media?.currentTime || 0) -
              1 / (this.item.fps || TRIM_FPS)) }, "\u25c0|"),
          this.playBtn,
          el("button", { class: "mml-btn mml-sm", title: "Next frame (\u2192)",
            onclick: () => this.seek((this.media?.currentTime || 0) +
              1 / (this.item.fps || TRIM_FPS)) }, "|\u25b6"),
          el("span", { class: "mml-tmgap" }),
          el("button", { class: "mml-btn mml-sm",
            title: "Set start to the playhead  ( [ )",
            onclick: () => { this.start =
              Math.min(this.media?.currentTime || 0, this.end - 0.1);
              this.layoutTimeline(); } }, "\u21e4 start"),
          this.numStart, el("span", { class: "mml-tmdash" }, "\u2013"),
          this.numEnd,
          el("button", { class: "mml-btn mml-sm",
            title: "Set end to the playhead  ( ] )",
            onclick: () => { this.end =
              Math.max(this.media?.currentTime || 0, this.start + 0.1);
              this.layoutTimeline(); } }, "end \u21e5"),
          this.readout,
          el("span", { class: "mml-tmspace" }),
          el("button", { class: "mml-btn mml-sm",
            title: "Jump the playhead to the clip's first frame",
            onclick: () => this.seek(0) }, "\u23ee First"),
          el("button", { class: "mml-btn mml-sm",
            title: "Jump the playhead to the clip's last frame \u2014 " +
                   "then \u{1F4F7} to capture it",
            onclick: () => this.seek(Math.max(0,
              this.dur - 1 / (this.item.fps || TRIM_FPS))) },
            "Last \u23ed")),
        el("div", { class: "mml-tmfoot act" },
          ...chips,
          isVid ? el("button", { class: "mml-btn mml-sm",
            title: "Add the frame shown above as a picture reference  ( C )",
            onclick: () => this.captureFrame() }, "\u{1F4F7} Use frame") : null,
          el("span", { class: "mml-tmspace" }),
          (this.item.trim || this.item.crop)
            ? el("button", { class: "mml-btn mml-sm",
                title: "Whole clip, no crop",
                onclick: () => { this.start = 0; this.end = this.dur;
                  this.crop = null; this.cropMode = false;
                  this.syncCrop(); this.layoutTimeline(); } }, "\u21ba Reset")
            : null,
          el("button", { class: "mml-btn mml-sm primary",
            onclick: () => this.apply() }, "Apply"),
          el("button", { class: "mml-btn mml-sm",
            onclick: () => this.close() }, "Cancel")),
        el("div", { class: "mml-tmkeys" },
          "\u2190 \u2192 step a frame (shift = 10) \u00b7 space play \u00b7 " +
          "[ ] set start/end here \u00b7 home/end jump" +
          (isVid ? " \u00b7 C capture frame" : ""))));
    this.syncCrop();
    this.seek(this.start, false);
  }
}

/* ------------------------------------------------- image crop modal */

/** Popout editor for cropping a picture reference to a chosen aspect ratio.
 *  Writes item.crop {x,y,w,h} (normalised 0..1) on Apply only. */
class ImageCropModal {
  constructor(panel, item) {
    this.panel = panel;
    this.item = item;
    this.crop = item.crop ? { ...item.crop } : { x: 0, y: 0, w: 1, h: 1 };
    this.aspect = "free";
    this.drag = null;
    this.naturalW = 0;
    this.naturalH = 0;
    injectCSS();
    this.build();
    document.body.append(this.overlay);
  }

  close() {
    try { this.overlay.remove(); } catch (e) { /* already gone */ }
  }

  apply() {
    const c = this.crop;
    const eps = 0.05;
    if (!c || (c.w >= 1 - eps && c.h >= 1 - eps && c.x <= eps && c.y <= eps)) {
      delete this.item.crop;
    } else {
      this.item.crop = {
        x: +c.x.toFixed(4), y: +c.y.toFixed(4),
        w: +c.w.toFixed(4), h: +c.h.toFixed(4),
      };
    }
    this.close();
    this.panel.commit();
  }

  forceAspect() {
    const vw = this.naturalW || (this.item && this.item.width) || 16;
    const vh = this.naturalH || (this.item && this.item.height) || 9;
    applyAspectLock(this.crop, this.aspect, vw, vh);
    this.syncCrop();
  }

  cropDown(e, mode) {
    if (!this.crop) return;
    e.preventDefault();
    const wrap = this.cropWrap.getBoundingClientRect();
    const c0 = { ...this.crop, mx: e.clientX, my: e.clientY };
    const move = (ev) => {
      const dx = (ev.clientX - c0.mx) / wrap.width;
      const dy = (ev.clientY - c0.my) / wrap.height;
      const c = this.crop;
      if (mode === "move") {
        c.x = Math.min(Math.max(c0.x + dx, 0), 1 - c.w);
        c.y = Math.min(Math.max(c0.y + dy, 0), 1 - c.h);
      } else {
        if (mode.includes("w")) {
          c.x = Math.min(Math.max(c0.x + dx, 0), c0.x + c0.w - 0.05);
          c.w = c0.w + (c0.x - c.x);
        }
        if (mode.includes("e")) c.w = Math.min(Math.max(c0.w + dx, 0.05), 1 - c.x);
        if (mode.includes("n")) {
          c.y = Math.min(Math.max(c0.y + dy, 0), c0.y + c0.h - 0.05);
          c.h = c0.h + (c0.y - c.y);
        }
        if (mode.includes("s")) c.h = Math.min(Math.max(c0.h + dy, 0.05), 1 - c.y);
      }
      if (this.aspect !== "free") this.forceAspect();
      this.syncCrop();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  syncCrop() {
    if (!this.cropWrap || !this.crop) return;
    const c = this.crop;
    Object.assign(this.cropRect.style, {
      left: `${c.x * 100}%`, top: `${c.y * 100}%`,
      width: `${c.w * 100}%`, height: `${c.h * 100}%`,
    });
    this.cropInfo.textContent = this.naturalW
      ? `${Math.round(c.w * this.naturalW)} \u00d7 ${Math.round(c.h * this.naturalH)}`
      : "";
  }

  /** Size the preview stage to the image's real aspect (see TrimModal). */
  fitStage(vw, vh) {
    if (!this.stage || !vw || !vh) return;
    const maxW = Math.min(620, (window.innerWidth || 900) * 0.85);
    const maxH = 340;
    const scale = Math.min(maxW / vw, maxH / vh, 1);
    this.stage.style.width = `${Math.max(32, Math.round(vw * scale))}px`;
    this.stage.style.height = `${Math.max(32, Math.round(vh * scale))}px`;
  }

  build() {
    const url = viewURL(this.item.file);
    const img = el("img", { class: "mml-tmvideo", src: url, draggable: false,
      onload: () => {
        this.naturalW = img.naturalWidth || 0;
        this.naturalH = img.naturalHeight || 0;
        this.fitStage(this.naturalW, this.naturalH);
        this.syncCrop();
      } });
    this.cropRect = el("div", { class: "mml-tmcrop",
      onmousedown: (e) => this.cropDown(e, "move") },
      ...["nw", "ne", "sw", "se"].map((corner) =>
        el("div", { class: `mml-tmcorner ${corner}`,
          onmousedown: (e) => { e.stopPropagation(); this.cropDown(e, corner); } })));
    this.cropWrap = el("div", { class: "mml-tmcropwrap" }, this.cropRect);
    this.cropInfo = el("span", { class: "mml-tmcropinfo" });
    this.aspectEl = el("select", { class: "mml-tmaspect",
      onchange: (e) => { this.aspect = e.target.value; this.forceAspect(); } },
      [["free", "freeform"], ["1", "1:1"], [String(4 / 3), "4:3"],
       [String(3 / 2), "3:2"], [String(16 / 9), "16:9"],
       [String(9 / 16), "9:16"], [String(3 / 4), "3:4"],
       [String(2 / 3), "2:3"], [String(21 / 9), "21:9"]]
        .map(([value, label]) => el("option", { value }, label)));

    this.stage = el("div", { class: "mml-tmstage mml-tmfit" }, img, this.cropWrap);

    this.overlay = el("div", { class: "mml-tmover",
      onmousedown: (e) => { if (e.target === this.overlay) this.close(); } },
      el("div", { class: "mml-tmmodal" },
        el("div", { class: "mml-tmhead" },
          el("span", { class: "mml-tmtitle" }, `\u2702 ${this.item.name}`),
          el("button", { class: "mml-x", onclick: () => this.close() }, "\u2715")),
        this.stage,
        el("div", { class: "mml-tmfoot" },
          this.aspectEl, this.cropInfo,
          el("button", { class: "mml-btn mml-sm",
            title: "Reset the crop",
            onclick: () => {
              this.crop = { x: 0, y: 0, w: 1, h: 1 };
              this.aspect = "free";
              this.aspectEl.value = "free";
              this.syncCrop();
            } }, "\u21ba Reset"),
          el("button", { class: "mml-btn mml-sm primary",
            onclick: () => this.apply() }, "Apply"),
          el("button", { class: "mml-btn mml-sm",
            onclick: () => this.close() }, "Cancel"))));
    this.syncCrop();
  }
}

function lightbox(item, tag) {
  const url = viewURL(item.file);
  const media = item.kind === "video"
    ? el("video", { src: url, controls: true, autoplay: true, loop: true })
    : el("img", { src: url });
  if (!item.width) {
    media.addEventListener(item.kind === "video" ? "loadedmetadata" : "load",
      () => {
        const w = media.naturalWidth || media.videoWidth;
        const h = media.naturalHeight || media.videoHeight;
        if (!w) return;
        item.width = w; item.height = h;
        const cap = overlay.querySelector(".mml-lightdims");
        if (cap) cap.textContent = dimsLabel(w, h);
      });
  }
  const overlay = el("div", { class: "mml-light",
    onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    el("div", { class: "mml-lightbox" }, media,
      el("div", { class: "mml-lightcap" },
        el("span", { class: `mml-tag ${tag.startsWith("<Video") ? "vid" : "pic"}` }, tag),
        el("span", {}, item.name),
        el("span", { class: "mml-lightdims" },
          dimsLabel(item.width, item.height)),
        el("button", { class: "mml-btn", style: { marginLeft: "auto" },
          onclick: () => overlay.remove() }, "Close"))));
  const esc = (e) => {
    if (e.key === "Escape") { overlay.remove(); window.removeEventListener("keydown", esc); }
  };
  window.addEventListener("keydown", esc);
  document.body.append(overlay);
}

// The ratios ComfyUI's resolution selector offers, so the badge speaks the
// same vocabulary as the preset you'd pick to match a reference.
const ASPECTS = [
  [1, 1, "Square"], [2, 3, "Portrait Photo"], [3, 2, "Photo"],
  [3, 4, "Portrait Standard"], [4, 3, "Standard"],
  [9, 16, "Portrait Widescreen"], [16, 9, "Widescreen"],
  [9, 21, "Portrait Ultrawide"], [21, 9, "Ultrawide"],
];

/** Nearest standard ratio to w:h, with how far off it is. */
function nearestAspect(w, h) {
  const target = w / h;
  let best = ASPECTS[0], bestErr = Infinity;
  for (const a of ASPECTS) {
    const err = Math.abs(a[0] / a[1] - target) / target;
    if (err < bestErr) { bestErr = err; best = a; }
  }
  return { a: best[0], b: best[1], name: best[2], err: bestErr };
}

/** Ratio as a decimal, normalised to 1 on the short side: "2.35:1", "1:1.85". */
function decimalRatio(w, h) {
  return w >= h ? `${(w / h).toFixed(2)}:1` : `1:${(h / w).toFixed(2)}`;
}

/** "1290\u00d7720 \u00b7 16:9", "\u224816:9" when close, or a plain decimal
 *  when no standard ratio is near enough to name honestly. */
function dimsLabel(w, h) {
  if (!w || !h) return "";
  const n = nearestAspect(w, h);
  if (n.err > 0.10) return `${w}\u00d7${h} \u00b7 ${decimalRatio(w, h)}`;
  return `${w}\u00d7${h} \u00b7 ${n.err <= 0.005 ? "" : "\u2248"}${n.a}:${n.b}`;
}

/** Longer form for tooltips: names the preset and the exact ratio. */
function dimsTitle(name, w, h) {
  if (!w || !h) return name;
  const n = nearestAspect(w, h);
  if (n.err <= 0.005)
    return `${name}\n${w}\u00d7${h} \u2014 ${n.a}:${n.b} (${n.name})`;
  return `${name}\n${w}\u00d7${h} \u2014 ${decimalRatio(w, h)}, ` +
    `closest preset ${n.a}:${n.b} (${n.name}, ${(n.err * 100).toFixed(1)}% off)`;
}

/** CSS clip-path (inset percentages) for a normalised crop rect, used to make
 *  the panel thumbnail show exactly the cropped region. */
function cropClip(crop) {
  if (!crop) return undefined;
  const x = Math.max(0, Math.min(1, crop.x || 0));
  const y = Math.max(0, Math.min(1, crop.y || 0));
  const w = Math.max(0, Math.min(1 - x, crop.w || 1));
  const h = Math.max(0, Math.min(1 - y, crop.h || 1));
  return `inset(${(y * 100).toFixed(2)}% ${((1 - x - w) * 100).toFixed(2)}% ` +
    `${((1 - y - h) * 100).toFixed(2)}% ${(x * 100).toFixed(2)}%)`;
}

/** Recalculate the video thumbnail's clip so the panel preview shows exactly
 *  the cropped region even when the preview box is stretched to any size
 *  (object-fit:cover letterboxing differs per box aspect). */
function applyPreviewCrop(videoEl, item) {
  if (!videoEl) return;
  if (!item.crop) { videoEl.style.clipPath = ""; return; }
  const vw = item.width, vh = item.height;
  const bw = videoEl.clientWidth, bh = videoEl.clientHeight;
  if (!vw || !vh || !bw || !bh) { videoEl.style.clipPath = cropClip(item.crop); return; }
  const scale = Math.max(bw / vw, bh / vh);
  const dw = vw * scale, dh = vh * scale;
  const ox = (bw - dw) / 2, oy = (bh - dh) / 2;
  const c = item.crop;
  const left = ox + c.x * dw;
  const top = oy + c.y * dh;
  const right = bw - (left + c.w * dw);
  const bottom = bh - (top + c.h * dh);
  const clamp = (v, max) => Math.min(max, Math.max(0, v));
  videoEl.style.clipPath = `inset(${clamp(top, bh)}px ${clamp(right, bw)}px ` +
    `${clamp(bottom, bh)}px ${clamp(left, bw)}px)`;
}

/* --------------------------------------------------------- audio player */

function miniPlayer(url, trim) {
  const fill = el("i");
  const bar = el("div", { class: "mml-bar" }, fill);
  const time = el("span", { class: "mml-time" }, "0:00");
  const btn = el("button", { class: "mml-play", title: "Play" }, "\u25b6");
  let audio = null;

  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const ensure = () => {
    if (audio) return audio;
    audio = new Audio(url);
    audio.addEventListener("loadedmetadata", () => {
      if (trim && trim.start) audio.currentTime = Math.min(trim.start, audio.duration || 0);
    });
    audio.addEventListener("timeupdate", () => {
      if (trim && trim.end && audio.currentTime >= trim.end) {
        audio.pause();
        btn.textContent = "\u25b6";
        audio.currentTime = trim.start || 0;
        return;
      }
      if (audio.duration) {
        fill.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
        time.textContent = fmt(audio.currentTime);
      }
    });
    audio.addEventListener("ended", () => { btn.textContent = "\u25b6"; });
    return audio;
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const a = ensure();
    if (a.paused) { a.play().catch(() => {}); btn.textContent = "\u23f8"; }
    else { a.pause(); btn.textContent = "\u25b6"; }
  });
  bar.addEventListener("click", (e) => {
    e.stopPropagation();
    const a = ensure();
    const r = bar.getBoundingClientRect();
    if (a.duration) a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
  });
  return { btn, bar, time, stop: () => { if (audio) { audio.pause(); } } };
}

/* ------------------------------------------------------------- uploading */

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

/* --------------------------------------------------------------- panel */

class LoaderPanel {
  constructor(node, opts = {}) {
    this.node = node;
    this.store = opts.store || null;   // per-tab data source, if any
    this.tabId = opts.tabId || 0;
    (node._mmlPanels = node._mmlPanels || []).push(this);
    this.items = this.read();
    this.busy = 0;
    this.presets = [];
    this.presetName = "";
    this.presetPrompt = null;   // "save" | "delete" while confirming inline
    this.unloadPrompt = false;  // confirming "unload all media"
    this.trimOpen = null;       // item whose trim editor is expanded
    this.msg = "";
    this.msgErr = false;
    this.players = [];
    injectCSS();

    this.root = el("div", { class: "mml-panel" });
    this.picker = el("input", {
      type: "file", multiple: true, style: { display: "none" },
      accept: "image/*,video/*,audio/*",
      onchange: (e) => { this.add([...e.target.files]); e.target.value = ""; },
    });
    this.root.append(this.picker);
    this._langObserver = observeLanguage(this.root);

    this.root.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault(); e.stopPropagation();
      this.root.classList.add("drop");
    });
    this.root.addEventListener("dragleave", (e) => {
      if (e.target === this.root) this.root.classList.remove("drop");
    });
    this.root.addEventListener("drop", (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault(); e.stopPropagation();
      this.root.classList.remove("drop");
      this.add([...e.dataTransfer.files]);
    });

    this.render();
    this.refreshPresets();
  }

  async refreshPresets() {
    try {
      const data = await presetApi("");
      this.presets = data.presets || [];
      this.render();
    } catch (e) { /* routes unavailable; the row stays empty */ }
  }

  async savePreset(name) {
    if (!this.items.length) {
      this.say("Nothing loaded to save.", true); this.render(); return;
    }
    if (!name) { this.say("Give the preset a name.", true); this.render(); return; }
    try {
      const res = await presetApi("/save", { name, items: this.items });
      this.presetName = res.name;
      this.presetPrompt = null;
      this.say(`Saved "${res.name}" (${res.count} item${res.count === 1 ? "" : "s"}).`);
      await this.refreshPresets();
    } catch (err) {
      this.say(`Save failed: ${err.message}`, true);
      this.render();
    }
  }

  async loadPreset(name) {
    if (!name) return;
    try {
      const res = await presetApi("/load", { name });
      this.items = res.items || [];
      this.presetName = res.name;
      if (res.missing?.length) {
        this.say(`Loaded "${res.name}" — ${res.missing.length} file(s) no longer ` +
          `on disk and were skipped: ${res.missing.join(", ")}`, true);
      } else {
        this.say(`Loaded "${res.name}".`);
      }
      this.commit();
    } catch (err) {
      this.say(`Load failed: ${err.message}`, true);
      this.render();
    }
  }

  async deletePreset() {
    try {
      const res = await presetApi("/delete", { name: this.presetName });
      this.say(`Deleted "${res.deleted}".`);
      this.presetName = "";
      this.presetPrompt = null;
      await this.refreshPresets();
    } catch (err) {
      this.say(`Delete failed: ${err.message}`, true);
      this.render();
    }
  }

  widget() { return this.store ? null : this.node.widgets?.find((w) => w.name === "media_state"); }

  read() {
    if (this.store) {
      try { const v = this.store.read(); return Array.isArray(v) ? v : []; }
      catch (e) { return []; }
    }
    try {
      const v = JSON.parse(this.widget()?.value || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  commit() {
    if (this.store) this.store.write(this.items);
    else { const w = this.widget(); if (w) w.value = JSON.stringify(this.items); }
    try { this.node.setDirtyCanvas?.(true, true); } catch (e) { /* Vue redraws itself */ }
    this.render();
    // A modal and the on-node panel can be open at once; keep every panel
    // that shares this data source (same tab) current.
    (this.node._mmlPanels || []).forEach((p) => {
      if (p !== this && p.store === this.store) { p.items = p.read(); p.render(); }
    });
  }

  applyWidgetLabels() {
    const node = this.node;
    node.widgets?.forEach((widget) => {
      if (widget && widget._mmxBase) {
        widget.name = tr(widget._mmxBase);
        if (widget.label !== undefined) widget.label = widget.name;
      }
    });
    try { node.graph?.setDirtyCanvas?.(true, true); } catch (e) { /* Vue redraws */ }
  }

  count(kind) { return this.items.filter((i) => i.kind === kind).length; }

  say(text, isError) {
    this.msg = text || "";
    this.msgErr = !!isError;
  }

  async add(files) {
    if (!files.length) return;
    this.say("");
    const caps = await capabilities();
    for (const file of files) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const guess = /^(png|jpe?g|webp|bmp|gif|tiff?)$/.test(ext) ? "picture"
        : /^(mp4|mov|mkv|webm|avi|m4v|mpe?g)$/.test(ext) ? "video"
        : /^(wav|mp3|flac|ogg|m4a|aac|opus)$/.test(ext) ? "audio" : null;
      if (!guess) { this.say(`${file.name}: unsupported file type.`, true); continue; }
      if (this.count(guess) >= MAX[guess]) {
        this.say(`All ${MAX[guess]} ${guess} slots are full — ${file.name} skipped.`, true);
        continue;
      }
      if (guess === "audio" && audioCount(this.items) >= MAX.audio) {
        this.say(`This loader takes ${MAX.audio} audio clips in total, and split video ` +
          `soundtracks count too — ${file.name} skipped.`, true);
        continue;
      }
      if (guess === "video" && !caps.video) {
        this.say("Videos need PyAV or ffmpeg on the server.", true);
        continue;
      }
      this.busy += 1; this.render();
      try {
        const info = await uploadFile(file);
        // Don't spend an audio clip the budget can't cover — the soundtrack
        // stays available, just switched off until room is made.
        const budgetFull = audioCount(this.items) >= MAX.audio;
        const pairable = info.kind === "video" && info.has_audio;
        const base = {
          kind: info.kind,
          file: info.file,
          name: info.original || info.name,
          duration: info.duration ?? null,
          width: info.width ?? null,
          height: info.height ?? null,
          has_audio: !!info.has_audio,
          audio_mode: pairable && !budgetFull ? "paired" : "off",
        };
        // A picture always gets a category (forced dropdown) and a number:
        // it lands in "关键帧" at the next free number by default.
        if (info.kind === "picture") {
          base.category = "关键帧";
          base.number = nextPicNumber(this.items, "关键帧");
        }
        this.items.push(base);
        if (pairable && budgetFull)
          this.say(`${info.original || info.name} loaded with its audio off — ` +
            `already using ${MAX.audio} audio clips.`, true);
      } catch (err) {
        this.say(`${file.name}: ${err.message}`, true);
      } finally {
        this.busy -= 1;
      }
    }
    this.items = reorderForDisplay(this.items);
    this.commit();
  }

  resort() {
    this.items = reorderForDisplay(this.items);
    this.commit();
  }

  trimBtn(item) {
    if (item.kind === "picture" || !item.duration) return null;
    const active = (item.trim && (item.trim.start || item.trim.end)) || item.crop;
    return el("span", {
      class: "mml-trimbtn" + (active ? " on" : ""),
      title: active
        ? `Trimmed to ${fmtSpan(item)} — click to edit`
        : "Use only part of this clip",
      onclick: (e) => {
        e.stopPropagation();
        new TrimModal(this, item);
      },
    }, "\u2702");
  }

  cropImageBtn(item) {
    return el("span", { class: "mml-trimbtn",
      title: "Crop this image",
      onclick: (e) => {
        e.stopPropagation();
        new ImageCropModal(this, item);
      } }, "\u2702");
  }

  // Category dropdown + read-only number shown in the title bar above every
  // picture thumbnail. Switching category auto-assigns the next free number
  // within that category (1-based, first gap), so the user only picks the
  // category and never edits numbers manually.
  picMetaRow(item) {
    const cat = picCategory(item);
    const numEl = el("span", { class: "mml-picnum",
      title: "分类内编号（自动分配，不可编辑）" },
      `#${picNumber(item) || "—"}`);
    const select = el("select", { class: "mml-piccat",
      title: "分类（关键帧 / 角色 / 道具 / 场景），切换后自动编号",
      onchange: (e) => {
        const newCat = e.target.value;
        item.category = newCat;
        // Auto-assign the first unused number in the new category.
        const used = new Set();
        this.items.forEach((it) => {
          if (it !== item && it.kind === "picture" &&
              picCategory(it) === newCat) {
            used.add(picNumber(it));
          }
        });
        let n = 1;
        while (used.has(n)) n += 1;
        item.number = n;
        numEl.textContent = `#${n}`;
        this.resort();
      } },
      PIC_CATEGORIES.map((c) =>
        el("option", { value: c, selected: c === cat }, c)));
    return el("div", { class: "mml-picmeta" }, select, numEl);
  }


  unloadAll() {
    const n = this.items.length;
    this.items = [];
    this.unloadPrompt = false;
    this.presetName = "";          // no longer showing a saved set
    this.say(`Unloaded ${n} item(s). Files remain in ComfyUI's input folder.`);
    this.commit();
  }

  toggle(item) {
    item.enabled = item.enabled === false;
    this.commit();
  }

  powerBtn(item) {
    const on = isOn(item);
    return el("span", {
      class: "mml-power" + (on ? " on" : ""),
      title: on ? "Switch off — kept here but not sent to the model"
        : "Switch on",
      onclick: (e) => { e.stopPropagation(); this.toggle(item); },
    }, on ? "\u25c9" : "\u25cb");
  }

  remove(item) {
    this.items = this.items.filter((i) => i !== item);
    this.commit();
  }

  swap(from, to) {
    if (from === to || from < 0 || to < 0 ||
        from >= this.items.length || to >= this.items.length) return;
    const tmp = this.items[from];
    this.items[from] = this.items[to];
    this.items[to] = tmp;
    // After a drag-to-reorder, renumber each picture category so slot
    // positions and their read-only numbers stay consistent, then re-sort
    // (pictures stay grouped 关键帧→角色→道具→场景 by the new numbers;
    // video/audio keep their relative order). Pictures only get renumbered.
    renumberPictures(this.items);
    this.resort();
  }

  reorderable(node, item) {
    node.draggable = true;
    // The whole media tile is the drag handle. Images/videos/audio have native
    // HTML5 drag behaviour which would hijack the gesture, so disable it on the
    // inner media elements - dragging the picture/player itself reorders.
    node.querySelectorAll("img, video, audio").forEach((mediaEl) => {
      mediaEl.setAttribute("draggable", "false");
      mediaEl.addEventListener("dragstart", (e) => e.preventDefault());
    });
    node.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(this.items.indexOf(item)));
      node.classList.add("dragging");
    });
    node.addEventListener("dragend", () => node.classList.remove("dragging"));
    node.addEventListener("dragover", (e) => {
      if (e.dataTransfer.types.includes("Files")) return;
      e.preventDefault(); e.stopPropagation();
      node.classList.add("over");
    });
    node.addEventListener("dragleave", () => node.classList.remove("over"));
    node.addEventListener("drop", (e) => {
      if (e.dataTransfer.types.includes("Files")) return;
      e.preventDefault(); e.stopPropagation();
      node.classList.remove("over");
      const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
      if (!isNaN(from)) this.swap(from, this.items.indexOf(item));
    });
    return node;
  }

  /** An always-present empty slot: click to browse, drop to fill. */
  emptySlot(kind, index) {
    const slot = el("div", { class: "mml-slot",
      title: `Empty ${kind} slot ${index} \u2014 click to browse or drop a file`,
      onclick: () => this.picker.click() },
      el("span", {}, `${kind} ${index}`));
    slot.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault(); e.stopPropagation();
      slot.classList.add("hot");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("hot"));
    slot.addEventListener("drop", (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault(); e.stopPropagation();
      slot.classList.remove("hot");
      this.root.classList.remove("drop");
      this.add([...e.dataTransfer.files]);
    });
    return slot;
  }

  render() {
    this.players.forEach((p) => p.stop());
    this.players = [];

    const { tags, extra } = computeTags(this.items);
    const pics = this.items.filter((i) => i.kind === "picture");
    const vids = this.items.filter((i) => i.kind === "video");
    const auds = this.items.filter((i) => i.kind === "audio");
    const kids = [this.picker];

    kids.push(el("div", { class: "mml-top" },
      el("button", { class: "mml-btn", onclick: () => this.picker.click() },
        "Load files\u2026"),
      el("button", { class: "mml-btn mml-sm",
        title: uiLang === "zh" ? "Switch to English" : "Switch to Chinese",
        onclick: () => {
          try {
            setUiLang(uiLang === "zh" ? "en" : "zh");
            this.applyWidgetLabels();
            // Keep every panel of this node (on-node + any modal) in sync.
            (this.node._mmlPanels || []).forEach((p) => p.render());
            localizeDom(this.root);
            document.querySelectorAll?.(".mml-light, .mml-help, .mml-tmmodal, .mml-toast")
              .forEach((popup) => localizeDom(popup));
          } catch (err) {
            console.error("[Media Loader] language switch failed", err);
          }
        } },
        uiLang === "zh" ? "EN" : "中"),
      el("span", { style: { fontSize: "10px", color: "#6b7484" } },
        this.busy ? `uploading ${this.busy}\u2026` : "or drop files on any slot"),
      el("span", { class: "mml-topspace" }),
      this.items.length
        ? el("button", { class: "mml-btn mml-sm",
            title: "Remove every loaded reference from this node",
            onclick: () => { this.unloadPrompt = true; this.render(); } },
            "Clear media")
        : null,
      el("span", { class: "mml-count" + (pics.length > MAX.picture ? " over" : "") },
        `\u{1F5BC} ${pics.length} / ${MAX.picture}`),
      el("span", { class: "mml-count" + (audioCount(this.items) > MAX.audio ? " over" : ""),
        style: { marginLeft: "6px" },
        title: "Audio clips in play, including split video soundtracks" },
        `\u266a ${audioCount(this.items)}/${MAX.audio}`)));

    const select = el("select", { class: "mml-preset",
      title: "Load a saved reference set",
      onchange: (e) => { const v = e.target.value; if (v) this.loadPreset(v); } },
      el("option", { value: "" }, this.presets.length
        ? "load preset\u2026" : "no presets saved"),
      this.presets.map((n) =>
        el("option", { value: n, selected: n === this.presetName }, n)));
    if (this.unloadPrompt) {
      kids.push(el("div", { class: "mml-presetrow" },
        el("span", { class: "mml-presetwarn" },
          `Remove all ${this.items.length} item(s) from this node? ` +
          "The files stay in your ComfyUI input folder."),
        el("button", { class: "mml-btn mml-sm mml-danger",
          onclick: () => this.unloadAll() }, "Unload"),
        el("button", { class: "mml-btn mml-sm",
          onclick: () => { this.unloadPrompt = false; this.render(); } },
          "Cancel")));
    }

    if (this.presetPrompt === "save") {
      const input = el("input", { type: "text", class: "mml-presetname",
        placeholder: "Preset name",
        value: this.presetName ||
          `refs ${new Date().toISOString().slice(0, 10)}` });
      const go = () => this.savePreset(input.value.trim());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") go();
        if (e.key === "Escape") { this.presetPrompt = null; this.render(); }
      });
      setTimeout(() => { input.focus(); input.select(); }, 0);
      kids.push(el("div", { class: "mml-presetrow" },
        el("span", { class: "mml-presetlbl" }, "save as"), input,
        el("button", { class: "mml-btn mml-sm", onclick: go }, "Save"),
        el("button", { class: "mml-btn mml-sm",
          onclick: () => { this.presetPrompt = null; this.render(); } }, "Cancel")));
    } else if (this.presetPrompt === "delete") {
      kids.push(el("div", { class: "mml-presetrow" },
        el("span", { class: "mml-presetwarn" },
          `Delete "${this.presetName}"? Your media files are not removed.`),
        el("button", { class: "mml-btn mml-sm mml-danger",
          onclick: () => this.deletePreset() }, "Delete"),
        el("button", { class: "mml-btn mml-sm",
          onclick: () => { this.presetPrompt = null; this.render(); } }, "Cancel")));
    } else {
      kids.push(el("div", { class: "mml-presetrow" },
        el("span", { class: "mml-presetlbl" }, "preset"),
        select,
        el("button", { class: "mml-btn mml-sm", title: "Save the current set",
          onclick: () => { this.presetPrompt = "save"; this.render(); } }, "Save"),
        el("button", { class: "mml-btn mml-sm", title: "Delete the selected preset",
          onclick: () => {
            if (!this.presetName) { this.say("Pick a preset first.", true); }
            else this.presetPrompt = "delete";
            this.render();
          } }, "Delete")));
    }

    const audio = audioCount(this.items);
    const dur = durations(this.items);
    const problems = [];
    if (audio > MAX.audio)
      problems.push(`${audio} audio clips in play (limit ${MAX.audio}); split ` +
        "soundtracks count. Switch one to off.");
    if (dur.video > CLIP.totalPerType)
      problems.push(`Reference video totals ${dur.video.toFixed(1)}s ` +
        `(limit ${CLIP.totalPerType}s).`);
    if (dur.audio > CLIP.totalPerType)
      problems.push(`Reference audio totals ${dur.audio.toFixed(1)}s ` +
        `(limit ${CLIP.totalPerType}s).`);
    const short = this.items.filter((i) => isOn(i) && i.kind !== "picture" &&
      i.duration && effDuration(i) < CLIP.min);
    if (short.length)
      problems.push(`${short.map((i) => i.name).join(", ")}: shorter than ` +
        `${CLIP.min}s. The model was trained on ${CLIP.min}\u2013${CLIP.max}s ` +
        "reference clips, so very short ones may be weakly followed or " +
        "ignored \u2014 pad with silence or use a longer take.");
    if (!this.items.some((i) => isOn(i) && (i.kind === "picture" ||
        i.kind === "video")) && audio)
      problems.push("Audio can't be sent alone — add an image or video.");

    kids.push(el("div", { class: "mml-msg" + (this.msgErr || problems.length ? " err" : "") },
      problems.length ? problems[0] : this.msg));

    const left = el("div", { class: "mml-col" });
    const right = el("div", { class: "mml-col" });
    kids.push(el("div", { class: "mml-cols" }, left, right));

    left.append(el("div", { class: "mml-sec" }, "pictures",
      el("span", {}, `${pics.length}/${MAX.picture}`)));
    const picCells = [];
    pics.forEach((it) => {
      const tag = (tags.get(it) || "").slice(1, -1);
      picCells.push(this.reorderable(el("div",
        { class: "mml-slot filled pic" + (isOn(it) ? "" : " off") },
        // Title bar at top: category dropdown + auto-assigned read-only number
        this.picMetaRow(it),
        (() => {
          // Badge and img are SIBLINGS in the slot: .mml-pic is absolutely
          // positioned against the slot, so wrapping it breaks its sizing.
          const badge = el("span", { class: "mml-dims" },
            dimsLabel(it.width, it.height));
          const img = el("img", { class: "mml-pic", src: viewURL(it.file),
            title: dimsTitle(it.name, it.width, it.height),
            style: it.crop ? { clipPath: cropClip(it.crop) } : null,
            onload: () => {
              // Items from before dimensions were stored learn them here.
              if (!it.width && img.naturalWidth) {
                it.width = img.naturalWidth;
                it.height = img.naturalHeight;
                badge.textContent = dimsLabel(it.width, it.height);
                img.title = dimsTitle(it.name, it.width, it.height);
                this.commit();
              }
            },
            onclick: () => new ImageCropModal(this, it) });
          applyPreviewCrop(img, it);
          if (typeof ResizeObserver !== "undefined") {
            new ResizeObserver(() => applyPreviewCrop(img, it)).observe(img);
          }
          return [img, badge];
        })(),
        el("div", { class: "mml-picbar" },
          this.powerBtn(it),
          el("span", { class: "mml-tag pic" }, isOn(it) ? tag : "off"),
          this.cropImageBtn(it),
          el("span", { class: "mml-x", title: "Remove",
            onclick: () => this.remove(it) }, "\u2715"))), it));
    });
    for (let i = pics.length; i < MAX.picture; i++)
      picCells.push(this.emptySlot("picture", i + 1));
    left.append(el("div", { class: "mml-pics" }, picCells));

    right.append(el("div", { class: "mml-sec" }, "videos",
      el("button", { class: "mml-helpbtn",
        title: "What do off / paired / alone do?",
        onclick: (e) => { e.stopPropagation(); splitHelp(e.currentTarget); } }, "?"),
      el("span", {}, `${vids.length}/${MAX.video}`)));
    const vidCells = [];
    vids.forEach((it) => {
      const mode = it.audio_mode || "off";
      const splitTag = extra.get(it);
      const vthumb = el("video", { class: "mml-vthumb",
        style: { clipPath: cropClip(it.crop) },
        onloadedmetadata: (e) => {
          const t = it.trim;
          if (t && t.start) try { e.target.currentTime = t.start; } catch (_) {}
        }, src: viewURL(it.file), muted: true,
        preload: "metadata",
        onmouseenter: (e) => e.target.play().catch(() => {}),
        onmouseleave: (e) => e.target.pause(),
        onclick: () => new TrimModal(this, it) });
      applyPreviewCrop(vthumb, it);
      if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(() => applyPreviewCrop(vthumb, it)).observe(vthumb);
      }
      const row = el("div", { class: "mml-row" },
        this.powerBtn(it),
        vthumb,
        el("div", { class: "mml-meta" },
          el("div", { class: "mml-tag vid" },
            isOn(it) ? (tags.get(it) || "").slice(1, -1) : "off"),
          el("div", { class: "mml-name", title: it.name }, it.name)));
      if (it.has_audio && isOn(it)) {
        row.append(el("div", { class: "mml-segstack" },
          el("span", { class: "mml-tag aud mml-segtag" },
            mode === "off" ? "\u2014" : (splitTag || "").slice(1, -1)),
          el("span", { class: "mml-seg" },
            [["off", "关"], ["paired", "配对"], ["alone", "独立"]].map(([label, text]) => {
              const m = label === "alone" ? "standalone" : label;
              const turningOn = m !== "off" && mode === "off";
              return el("button", { class: m === mode ? "on" : "",
                title: m === "paired"
                  ? "Soundtrack pairs with this video, labelled just before it"
                  : m === "standalone"
                    ? "Soundtrack becomes a separate reference, numbered after the videos"
                    : "Ignore this video's audio",
                onclick: () => {
                  if (turningOn && audioCount(this.items) >= MAX.audio) {
                    this.say(`Already using ${MAX.audio} audio clips \u2014 ` +
                      "switch another off first.", true);
                    this.render();
                    return;
                  }
                  it.audio_mode = m;
                  this.commit();
                } }, text);
            }))));
      }
      row.append(
        this.trimBtn(it),
        el("span", { class: "mml-x", title: "Remove",
          onclick: () => this.remove(it) }, "\u2715"));
      const vcell = el("div", { class: "mml-slot filled vid" + (isOn(it) ? "" : " off") },
        row);
      vidCells.push(this.reorderable(vcell, it));
    });
    for (let i = vids.length; i < MAX.video; i++)
      vidCells.push(this.emptySlot("video", i + 1));
    right.append(el("div", { class: "mml-vids" }, vidCells));

    right.append(el("div", { class: "mml-sec" }, "AUDIO",
      el("span", {}, `${auds.length}/${MAX.audio}`)));
    const audCells = [];
    auds.forEach((it) => {
      const player = miniPlayer(viewURL(it.file), it.trim);
      this.players.push(player);
      const arow = el("div", { class: "mml-row" },
          this.powerBtn(it),
          player.btn,
          el("div", { class: "mml-meta", style: { flex: "0 0 auto", maxWidth: "38%" } },
            el("div", { class: "mml-tag aud" },
              isOn(it) ? (tags.get(it) || "").slice(1, -1) : "off"),
            el("div", { class: "mml-name", title: it.name }, it.name)),
          player.bar, player.time,
          this.trimBtn(it),
          el("span", { class: "mml-x", title: "Remove",
            onclick: () => this.remove(it) }, "\u2715"));
      const acell = el("div",
        { class: "mml-slot filled aud" + (isOn(it) ? "" : " off") },
        arow);
      audCells.push(this.reorderable(acell, it));
    });
    for (let i = auds.length; i < MAX.audio; i++)
      audCells.push(this.emptySlot("audio", i + 1));
    right.append(el("div", { class: "mml-auds" }, audCells),
      el("div", { class: "mml-spacer" }));

    const order = [];
    pics.filter(isOn).forEach((i) => order.push((tags.get(i) || "").slice(1, -1)));
    vids.filter(isOn).forEach((i) => {
      if (extra.has(i) && i.audio_mode === "paired")
        order.push(`[${(extra.get(i) || "").slice(1, -1)}]`);
      order.push((tags.get(i) || "").slice(1, -1));
    });
    this.items.filter(isOn).forEach((i) => {
      if (i.kind === "audio") order.push((tags.get(i) || "").slice(1, -1));
      else if (i.kind === "video" && i.audio_mode === "standalone" && extra.has(i))
        order.push(`[${(extra.get(i) || "").slice(1, -1)}]`);
    });
    kids.push(el("div", { class: "mml-order" },
      el("b", {}, "tag order sent to the model"),
      el("div", {}, order.length ? order.join(" \u00b7 ") : "nothing loaded yet")));

    this.root.replaceChildren(...kids.filter(Boolean));
    localizeDom(this.root);
  }
}

/* --------------------------------------------------------- help popover */

const SPLIT_HELP = [
  ["off", "The video's audio is ignored — nothing is extracted and no tag is " +
    "created. Worth doing when the sound is irrelevant, since it also frees " +
    "one of your twelve reference slots."],
  ["paired", "Use paired when the sound genuinely belongs to that footage: " +
    "on-screen dialogue where lip sync matters, diegetic action sounds that " +
    "need to land on the same frames, or video-editing tasks where you're " +
    "keeping the original soundtrack. The temporal binding is the whole point."],
  ["alone", "Use alone when you want the audio as a reference rather than as " +
    "that clip's soundtrack \u2014 borrowing a speaker's voice timbre for a " +
    "different character, referencing a music style, or lifting ambience. Also " +
    "the right choice when you're not reusing the video's visuals in sync, " +
    "since a binding you don't want can pull the generation toward reproducing " +
    "that clip's timing."],
];

const SPLIT_WIRING = [
  ["paired", "video_audio_N", "ref_video_audio_0", "<Audio 1> then <Video 1>"],
  ["alone", "audio_N", "ref_audio_0", "<Video 1> first, audio numbered after all videos"],
];

function splitHelp(anchor) {
  const rows = SPLIT_HELP.map(([mode, body]) =>
    el("div", { class: "mml-helprow" },
      el("span", { class: `mml-helpmode ${mode}` }, mode),
      el("p", {}, body)));

  const wiring = SPLIT_WIRING.map(([mode, out, native, tags]) =>
    el("div", { class: "mml-wirerow" },
      el("span", { class: `mml-helpmode ${mode}` }, mode),
      el("code", {}, out), el("span", { class: "mml-arrow" }, "\u2192"),
      el("code", {}, native),
      el("span", { class: "mml-tags" }, tags)));

  const box = el("div", { class: "mml-help" },
    el("div", { class: "mml-helphead" }, "split audio",
      el("button", { title: "Close", onclick: () => close() }, "\u2715")),
    el("div", { class: "mml-helpbody" },
      rows,
      el("div", { class: "mml-helpsub" }, "where the track comes out"),
      wiring,
      el("p", { class: "mml-helpnote" },
        "The extracted track always gets its own AUDIO output \u2014 ComfyUI has " +
        "no combined video-with-sound type, so the split is a wiring " +
        "requirement. The mode decides which group it joins, which sets the " +
        "native slot, the tag number, and whether the model binds it to that " +
        "video's frames. Either way it occupies a reference slot, so a video " +
        "with audio counts as two of your twelve.")));

  const r = anchor.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(r.left - 40, window.innerWidth - 380))}px`;
  box.style.top = `${Math.min(r.bottom + 6, window.innerHeight - 380)}px`;

  const away = (e) => { if (!box.contains(e.target) && e.target !== anchor) close(); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  function close() {
    box.remove();
    document.removeEventListener("mousedown", away, true);
    window.removeEventListener("keydown", esc);
  }
  document.addEventListener("mousedown", away, true);
  window.addEventListener("keydown", esc);
  document.body.append(box);
}

function flash(text) {
  const t = el("div", { class: "mml-toast" }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}

/** Spawn a Reference Splitter and wire this loader's bundle into it.
 *  Global singleton: the whole canvas shares ONE splitter node, so if one
 *  already exists anywhere we just focus it instead of creating a duplicate.
 *  The bundle is taken from tab_references (the current Tab), never the
 *  merged references, so the splitter sees exactly the selected Tab's set. */
export function addSplitter(node) {
  const existing = (app.graph?._nodes || []).find((n) => n.type === SPLITTER_NAME);
  if (existing) {
    safeCanvasFocus(existing);
    flash("已存在展开节点，全局共用一个，不会重复生成");
    return existing;
  }
  let sp = null;
  try {
    sp = LiteGraph.createNode(SPLITTER_NAME);
  } catch (e) { sp = null; }
  if (!sp) {
    flash("未找到展开节点定义，请重启 ComfyUI 后重试");
    return null;
  }
  app.graph.add(sp);
  try {
    sp.pos = [node.pos[0] + ((node.size?.[0] || NODE_W) + 60), node.pos[1]];
  } catch (e) { /* let the renderer place it */ }
  // 接入当前 Tab 的指定素材（output 0 = 指定素材，原 tab_references），
  // 保证展开即正确拆分当前页素材。
  node.connect(0, sp, 0);
  try { app.graph.setDirtyCanvas(true, true); } catch (e) { /* Vue redraws */ }
  flash("已展开拆分节点，请将其输出接到下游视频生成节点");
  return sp;
}

export function openLoaderModal(node, targetPanel) {
  injectCSS();
  const panel = new LoaderPanel(node, { store: targetPanel ? targetPanel.store : null });
  const close = () => {
    node._mmlPanels = (node._mmlPanels || []).filter((p) => p !== panel);
    panel.players.forEach((p) => p.stop());
    overlay.remove();
    window.removeEventListener("keydown", esc);
    (targetPanel || node._mmlPanel)?.render();
  };
  const esc = (e) => { if (e.key === "Escape") close(); };
  const overlay = el("div", { class: "mml-overlay",
    onmousedown: (e) => { if (e.target === overlay) close(); } },
    el("div", { class: "mml-modal" },
      el("div", { class: "mml-modalhead" }, "Media Loader",
        el("button", { title: "Close", onclick: close }, "\u2715")),
      el("div", { class: "mml-modalbody" }, panel.root)));
  window.addEventListener("keydown", esc);
  document.body.append(overlay);
  return panel;
}

/* -------------------------------------------------------- multi-tab */

const MAX_TABS = 32;
const TAB_H = 30;
// Full expanded height of one tab's loader panel: tall enough that every
// section (pictures 4×8, videos 1-3, audios 1-8, tag order) is visible with
// no clipping. The canvas height strictly follows the sum over tabs.
const TAB_PANEL_H = 880;

class MultiTabManager {
  constructor(node) {
    this.node = node;
    this.tabs = [];   // { name, items, panel } — 每个 tab 一套完整素材
    this._curTab = 0;
    this.root = el("div", { class: "mml-tabs" });
    this.topbar = this.buildTopbar();
    this.head = el("div", { class: "mml-tabs-head" });
    this.body = el("div", { class: "mml-tabs-body" });
    this.root.append(this.topbar, this.head, this.body);
    this._load();
    this._ensurePanels();
    if (!this.tabs.length) this.addTab();
    this.renderBody();
  }

  /** 顶部自定义 DOM 栏：Tab索引 输入 + 联动切换 + 展开拆分（样式与多Tab字符串节点顶部一致）。 */
  buildTopbar() {
    const input = el("input", { type: "number", min: 0, step: 1, value: "0",
      class: "mml-topidx",
      title: "Tab索引：从 0 开始，决定「tab_references（指定素材）」输出哪个 Tab 页的素材" });
    input.addEventListener("change", () => {
      let v = parseInt(input.value, 10);
      if (isNaN(v)) v = 0;
      const maxV = Math.max(0, this.tabs.length - 1);
      v = Math.max(0, Math.min(maxV, v));
      input.value = String(v);
      this.syncTopbar();
    });
    this._topInput = input;
    const linkBtn = el("button", { class: "mml-topbtn",
      title: "修改 Tab 索引后点击，下方 Tab 页自动切换到对应索引，并联动切换输出",
      onclick: () => this.linkSwitch() }, "联动切换");
    const expandBtn = el("button", { class: "mml-topbtn",
      title: "展开一个全局共用的素材拆分节点；已存在展开节点时不会重复生成，会自动定位到已有的那个",
      onclick: () => addSplitter(this.node) }, "展开输出拆分器");
    return el("div", { class: "mml-topbar" },
      el("span", { class: "mml-toplabel" }, "Tab索引"), input, linkBtn, expandBtn);
  }

  /** 把顶部输入框的值写回隐藏的 tab_index widget（供后端读取）。 */
  syncTopbar() {
    const w = this.node.widgets?.find((x) => x.name === "tab_index");
    if (w) w.value = parseInt(this._topInput?.value, 10) || 0;
  }

  _stateWidget() {
    return this.node.widgets?.find((w) => w.name === "media_state");
  }

  _load() {
    let data = null;
    try {
      const raw = this._stateWidget()?.value;
      data = raw ? JSON.parse(raw) : null;
    } catch (e) { data = null; }
    let arr = null;
    if (Array.isArray(data)) arr = data;
    else if (data && Array.isArray(data.tabs)) arr = data.tabs;
    else if (data && Array.isArray(data.items))
      arr = [{ name: data.name || "Track 1", items: data.items }];
    if (arr) arr.forEach((t, i) => {
      this.tabs.push({
        name: (t && t.name) || `Tab ${i}`,
        items: Array.isArray(t && t.items) ? t.items : [],
        panel: null,
      });
    });
  }

  _ensurePanels() {
    // Every tab must hold its own complete LoaderPanel. Tabs restored
    // from a saved workflow arrive with panel:null (the panel is never
    // serialized) — build one for each so the full loader always renders.
    this.tabs.forEach((t, i) => {
      if (!t.panel) t.panel = new LoaderPanel(this.node, {
        store: this.makeStore(t), tabId: i });
    });
  }

  makeStore(tab) {
    return {
      read: () => tab.items,
      write: (items) => { tab.items = items; this.serialize(); },
    };
  }

  addTab() {
    if (this.tabs.length >= MAX_TABS) return;
    const tab = { name: `Tab ${this.tabs.length}`, items: [], panel: null };
    this.tabs.push(tab);
    tab.panel = new LoaderPanel(this.node, {
      store: this.makeStore(tab), tabId: this.tabs.length - 1 });
    this.setCurTab(this.tabs.length - 1);   // 新增后自动切到新 Tab
    this.serialize();
    this.resize();
  }

  /** 关闭一个 Tab（会先弹确认）：内容会丢失。始终至少保留 1 个 Tab。 */
  closeTab(i) {
    if (this.tabs.length <= 1) return;
    const t = this.tabs[i];
    if (!t) return;
    const name = (t.name || "").trim() || `Tab ${i}`;
    this.confirm(
      `确定要关闭 Tab「${name}」吗？\n关闭后该页素材将丢失，且不可恢复。`,
      () => {
        if (t.panel) {
          this.node._mmlPanels = (this.node._mmlPanels || [])
            .filter((p) => p !== t.panel);
          t.panel.root.remove();
        }
        this.tabs.splice(i, 1);
        let cur = this._curTab;
        if (cur >= this.tabs.length) cur = this.tabs.length - 1;
        if (cur < 0) cur = 0;
        this.setCurTab(cur);
        this.serialize();
        this.resize();
      });
  }

  clearTab(i) {
    const t = this.tabs[i];
    if (!t || !t.panel) return;
    // Clear through the panel's own store so the write propagates to this
    // tab only; mutating tab.items directly would leave the panel's
    // snapshot pointing at the old array and commit() would write it back.
    t.panel.items = [];
    t.panel.commit();
  }

  /** 点击 Tab 页签：切到该 Tab，并联动更新顶部 Tab索引 输入框（输出跟随）。 */
  setCurTab(i) {
    if (i < 0 || i >= this.tabs.length) return;
    this._curTab = i;
    const w = this.node.widgets?.find((x) => x.name === "tab_index");
    if (w) {
      if (w.options) w.options.max = Math.max(0, this.tabs.length - 1);
      w.value = i;
    }
    if (this._topInput) {
      this._topInput.max = String(Math.max(0, this.tabs.length - 1));
      this._topInput.value = String(i);
    }
    this.renderBody();
  }

  /** 双击 Tab 标签：就地编辑标题。 */
  renameTab(i) {
    const t = this.tabs[i];
    if (!t) return;
    const tabEl = this.head?.children?.[i];
    if (!tabEl) return;
    const nameEl = tabEl.querySelector?.(".mml-tab-name");
    if (!nameEl) return;
    const inp = el("input", { class: "mml-tab-edit", value: t.name || `Tab ${i}` });
    nameEl.replaceWith(inp);
    inp.focus();
    inp.select();
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      const v = inp.value.trim();
      t.name = v || `Tab ${i}`;
      this.serialize();
      this.renderBody();
    };
    inp.addEventListener("blur", finish);
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { inp.blur(); }
      else if (e.key === "Escape") { inp.value = t.name; inp.blur(); }
    });
  }

  /** 自定义确认弹窗（全屏遮罩），不依赖 window.confirm（在画布上下文不可靠）。 */
  confirm(msg, onOk) {
    const overlay = el("div", { class: "mml-modal-overlay" });
    const box = el("div", { class: "mml-modal-box" });
    const msgEl = el("div", { class: "mml-modal-msg" }, msg);
    const btns = el("div", { class: "mml-modal-btns" });
    const cancel = el("button", { class: "mml-btn", textContent: "取消" });
    const ok = el("button", { class: "mml-btn mml-del", textContent: "确认关闭" });
    const close = (val) => { overlay.remove(); };
    cancel.addEventListener("click", () => close());
    ok.addEventListener("click", () => { close(); onOk && onOk(); });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    btns.append(cancel, ok);
    box.append(msgEl, btns);
    overlay.append(box);
    document.body.append(overlay);
    return { close, overlay };
  }

  serialize() {
    const w = this._stateWidget();
    if (!w) return;
    const tmp = w.callback;
    w.callback = null;
    w.value = JSON.stringify({
      tabs: this.tabs.map((t) => ({ name: t.name, items: t.items })),
    });
    w.callback = tmp;
    try { this.node.graph?.setDirtyCanvas?.(true, true); } catch (e) { /* Vue redraws */ }
  }

  reload() {
    this.tabs.forEach((t) => {
      if (t.panel)
        this.node._mmlPanels = (this.node._mmlPanels || [])
          .filter((p) => p !== t.panel);
    });
    this.tabs = [];
    this.body.innerHTML = "";
    this._load();
    this._ensurePanels();
    if (!this.tabs.length) this.addTab();
    else this.renderBody();
    this.serialize();
    this.resize();
    this.syncTabIndex();
  }

  _txt(zh, en) { return uiLang === "zh" ? zh : en; }

  renderBody() {
    this.body.innerHTML = "";
    this.head.innerHTML = "";
    // Tab 栏：每个 Tab 一个页签（点击切换、双击改名、× 关闭），末尾「+」新增。
    this.tabs.forEach((t, i) => {
      const cnt = t.panel ? fileCount(t.items) : 0;
      const tab = el("div", {
        class: "mml-tab" + (i === this._curTab ? " active" : ""),
        title: `Tab ${i}（点击切换 · 双击改名）`,
      });
      const nameEl = el("span", { class: "mml-tab-name" },
        (t.name || "").trim() || `Tab ${i}`);
      tab.append(nameEl);
      if (cnt > 0) tab.append(el("span", { class: "mml-tab-count" }, `${cnt}`));
      tab.addEventListener("click", (e) => {
        if (e.target && (e.target.classList?.contains("mml-tab-x"))) return;
        this.setCurTab(i);
      });
      tab.addEventListener("dblclick", (e) => {
        if (e.target && (e.target.classList?.contains("mml-tab-x"))) return;
        this.renameTab(i);
      });
      const x = el("span", { class: "mml-tab-x", title: "关闭该 Tab（会先确认）",
        textContent: "×" });
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeTab(i);
      });
      tab.append(x);
      this.head.append(tab);
    });
    // 「+」新增 Tab
    const addBtn = el("button", { class: "mml-tab mml-add",
      title: "新增一个 Tab（每页一套完整的素材）", onclick: () => this.addTab() }, "+");
    this.head.append(addBtn);
    this.head.append(el("span", { class: "mml-count" },
      `${this.tabs.length} / ${MAX_TABS}`));
    // 只展示当前 Tab 的素材面板
    const cur = this.tabs[this._curTab];
    if (cur) {
      const block = el("div", { class: "mml-tab-block" }, );
      if (cur.panel) block.append(cur.panel.root);
      this.body.append(block);
    }
    this.resize();
  }

  height() {
    // Tab 模式下画布高度 = 顶部栏 + Tab 栏 + 单个素材面板高度。
    // 素材面板由 LoaderPanel 完整渲染，用户仍可拖动右下角自由缩放（只增不减）。
    let h = 40 + 34 + TAB_H + TAB_PANEL_H;
    return h + 8;
  }

  minHeight() { return 40 + 34 + TAB_H + TAB_PANEL_H + 8; }

  resize() {
    // Two-way auto-fit that never fights the user's free bottom-right drag:
    //  - content grew (tab added)  -> grow the canvas to fit;
    //  - canvas is still glued to the previous content height and the
    //    content shrank (tab removed/collapsed) -> shrink back;
    //  - a height the user dragged to is never overwritten.
    // node.size[1] is the content height plus the ~34px node header, so
    // tab "last fitted canvas height" in the same space.
    const w = Math.max(NODE_W, this.node.size?.[0] || 0);
    const target = this.height() + 34;
    const cur = this.node.size?.[1] || 0;
    const last = this._lastContentH || target;
    if (target > cur + 1 || (cur > target + 40 && cur <= last + 4)) {
      try { this.node.setSize?.([w, target]); } catch (e) { this.node.size = [w, target]; }
      try { this.node.graph?.setDirtyCanvas?.(true, true); } catch (e) { /* Vue redraws */ }
    }
    this._lastContentH = target;
  }

  syncTabIndex() {
    // Tab索引 is 0-based, min 0, max = last tab index (tab count - 1).
    // Kept in sync with every add/remove/reload; also mirrors the top DOM bar.
    const w = this.node.widgets?.find((x) => x.name === "tab_index");
    const maxV = Math.max(0, this.tabs.length - 1);
    let v = w ? parseInt(w.value ?? 0, 10) : NaN;
    if (isNaN(v) || v < 0) v = 0;
    else if (v > maxV) v = maxV;
    // 自动对齐：仅当当前索引指向的 Tab 没有任何素材时，才回退到第一条
    // 有素材的 Tab（兼容旧工作流里保存的旧值指向空 Tab 的情况）。用户
    // 主动选中的有素材 Tab 不会被回退。
    let filled = -1;
    this.tabs.forEach((t, i) => { if (filled < 0 && (t.items?.length || 0) > 0) filled = i; });
    const curEmpty = (this.tabs[v]?.items?.length || 0) === 0;
    if (curEmpty && filled >= 0 && filled !== v) v = filled;
    if (w) {
      if (w.options) { w.options.min = 0; w.options.max = maxV; }
      w.value = v;
    }
    // 顶部输入框显示与最终生效索引保持完全一致（含自动回退后的值）
    if (this._topInput) {
      this._topInput.max = String(maxV);
      this._topInput.value = String(v);
    }
    // 若索引因回退而变化，让当前 Tab 跟随，保持"看到的 = 输出的"
    if (v !== this._curTab) { this._curTab = v; this.renderBody(); }
    try { this.node.graph?.setDirtyCanvas?.(true, true); } catch (e) { /* Vue redraws */ }
  }

  /** 联动切换：按顶部「Tab索引」的值，切到对应 Tab 页并联动输出。 */
  linkSwitch() {
    const n = this.tabs.length;
    let v = parseInt(this._topInput?.value, 10);
    if (isNaN(v)) v = 0;
    v = Math.max(0, Math.min(n - 1, v));
    this.setCurTab(v);
  }
}

/* ------------------------------------------------------------ extension */

// Chinese hover tooltips for every input/output port of the loader and the
// splitter. Applied imperatively on node creation so they take effect on a
// page refresh without needing a backend restart.
const PICTURES = 32;
const VIDEOS = 3;
const VIDEO_AUDIOS = 3;
const AUDIOS = 8;

const TOOLTIP_IN = {
  media_state: "多 Tab 素材状态（隐藏，由节点面板自动维护，无需手动编辑）。\n每个 Tab 页对应一套完整的素材，面板写入一条 {\"name\":\"...\",\"items\":[...]}，整体为 JSON 字符串 {\"tabs\":[{...}]}。\n若状态被误改坏，节点会提示清除后重新添加素材。",
  tab_index: "指定「tab_references（指定素材）」输出哪个 Tab 页的整套素材。\n从 0 开始计数（0 = 第一个 Tab）。\n数值超过当前 Tab 总数时自动收敛到最后一个；新增/关闭 Tab 后面板会自动更新输入框上限。\n修改数值后点击其右侧的「联动切换」按钮，可把输出切换到对应编号 Tab 并展示该页素材。",
  references: "要拆分的参考 bundle，通常来自 MediaLoader 的「指定素材」输出。\n超宽的 bundle 会被裁剪到前 N 个槽位。",
};
// 按端口索引映射（0/1）而非端口名：后端 RETURN_NAMES 改为中文后，
// 端口显示名会变为「指定素材 / Tab索引」，用索引映射在改名前后都稳定。
const TOOLTIP_OUT_LOADER = {
  0: "指定素材（tab_references）：仅输出「Tab索引」选中的那个 Tab 页的参考 bundle。索引越界自动收敛到最后一个。\n适用于按编号逐段生成视频时，只取当前这一段对应的整套素材。",
  1: "Tab索引（tab_index）：当前实际选中并输出的 Tab 页索引（0-based）。\n当输入索引越界或选中空 Tab 时，会自动收敛到有效 Tab，此输出反映最终生效的索引。",
};
const TOOLTIP_OUT_SPLITTER = {};
for (const cat of ["关键帧", "角色", "道具", "场景"])
  TOOLTIP_OUT_SPLITTER[cat] =
    `${cat}图片列表：本分类下所有参考图，按用户设定的编号升序排列。每张图为一个 IMAGE tensor，列表顺序即编号顺序（${cat} 1、${cat} 2…）。没有该分类图片时输出空列表。`;
for (let i = 1; i <= VIDEOS; i++)
  TOOLTIP_OUT_SPLITTER[`video_${i}`] =
    `video_${i}（参考视频 ${i}/${VIDEOS}）：输入 bundle 中第 ${i} 个参考视频（IMAGE 序列）。没有第 ${i} 个视频时输出为空。`;
for (let i = 1; i <= VIDEO_AUDIOS; i++)
  TOOLTIP_OUT_SPLITTER[`video_audio_${i}`] =
    `video_audio_${i}（视频配对音轨 ${i}/${VIDEO_AUDIOS}）：第 ${i} 个参考视频的配对音轨（AUDIO），仅在对应视频开启音轨并选择「配对」模式时才有输出，否则为空。`;
for (let i = 1; i <= AUDIOS; i++)
  TOOLTIP_OUT_SPLITTER[`audio_${i}`] =
    `audio_${i}（独立音频 ${i}/${AUDIOS}）：输入 bundle 中第 ${i} 个独立音频（AUDIO）。包含「独立」模式的视频音轨；没有第 ${i} 个时输出为空。`;

function applyTooltips(node, inTips, outTips) {
  for (const inp of node.inputs || [])
    if (inTips[inp.name]) inp.tooltip = inTips[inp.name];
  // 输出优先按端口索引取提示（loader 的中文端口名可能因后端改名而变化），
  // 拆分器等仍按端口名取提示，两者都不存在时跳过。
  (node.outputs || []).forEach((out, i) => {
    const t = outTips[i] ?? (outTips[out.name] ?? null);
    if (t) out.tooltip = t;
  });
  for (const wd of node.widgets || []) {
    if (inTips[wd.name]) {
      wd.tooltip = inTips[wd.name];
      if (wd.options) wd.options.tooltip = inTips[wd.name];
    }
  }
}

/**
 * 彻底禁用 tab_index 的自动值控件（increment/randomize）。
 * ComfyUI 前端会在 spec 未声明 control_after_generate 时，为 number/combo
 * widget 自动挂一个「值控件」（linkedWidgets[0]），它每次运行后会自动把
 * tab_index +1 或随机化——这正是"第一次输出秦、第二次输出汉"的根源。
 * 后端 spec 的 control_after_generate:"fixed" 已阻止新节点创建它；这里再
 * 兜底处理旧工作流里残留的值控件：置为 fixed、隐藏并从 widgets 中移除，
 * 保证滑轨索引只由顶部输入框 / 联动切换决定，运行前后保持不变。
 */
function killTabIndexValueControl(node) {
  const w = node.widgets?.find((x) => x.name === "tab_index");
  if (!w) return;
  if (Array.isArray(w.linkedWidgets)) {
    for (const lw of [...w.linkedWidgets]) {
      if (!lw) continue;
      lw.value = "fixed";
      lw.hidden = true;
      lw.type = "hidden";
      lw.serialize = false;
      if (typeof lw.computeSize === "function") lw.computeSize = () => [0, -4];
      const li = node.widgets?.indexOf(lw);
      if (li != null && li >= 0) node.widgets?.splice(li, 1);
    }
    w.linkedWidgets = [];
  }
  if (w.options) w.options.control_after_generate = "fixed";
  w.control_after_generate = "fixed";
}

app.registerExtension({
  name: "Openkit.MediaLoader",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    const isLoader = nodeData.name === LOADER_NAME;
    const isSplitter = nodeData.name === SPLITTER_NAME;
    if (!isLoader && !isSplitter) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      // 端口（inputs/outputs）在节点创建后由 ComfyUI 填充，立即 + 延迟各补一次，
      // 保证每个输入/输出端口都带上中文悬停说明。
      const applyNow = () => applyTooltips(this, TOOLTIP_IN,
        isLoader ? TOOLTIP_OUT_LOADER : TOOLTIP_OUT_SPLITTER);
      applyNow();
      setTimeout(applyNow, 0);
      setTimeout(applyNow, 80);
      if (isSplitter) {
        // Free bottom-right resize for the splitter. ComfyUI's built-in
        // computeSize already stops it from shrinking below full content
        // (all ports stay visible), while letting it grow freely.
        this.resizable = true;
        return r;
      }
      if (!isLoader) return r;

      injectCSS();
      const w = this.widgets?.find((w) => w.name === "media_state");
      if (w) {
        w.hidden = true;
        w.type = "hidden";
        w.computeSize = () => [0, -4];
      }
      // Built-in widgets go first: in Nodes 2.0 a widget added after a DOM
      // widget anchors to the node's bottom and leaves a gap on resize.
      const splitterBtn = this.addWidget("button", "展开输出拆分器", null,
        () => addSplitter(this));
      if (splitterBtn) splitterBtn._mmxBase = "展开输出拆分器";
      const linkSwitchBtn = this.addWidget("button", "联动切换", null,
        () => this._mmlTabsManager?.linkSwitch());
      if (linkSwitchBtn) linkSwitchBtn.title =
        "修改 Tab 索引后点击，下方 Tab 页自动切换到对应索引，并联动切换输出";
      // 原生控件（Tab索引 / 联动切换 / 展开拆分）的外观由顶部自定义 DOM 栏
      // 接管（与多Tab字符串节点顶部样式一致）；这里隐藏原生 widget，功能与
      // 序列化仍由它们承担。
      const idxW = this.widgets?.find((x) => x.name === "tab_index");
      [idxW, splitterBtn, linkSwitchBtn].forEach((x) => {
        if (x) { x.hidden = true; x.type = "hidden"; x.computeSize = () => [0, -4]; }
      });

      this._mmlTabsManager = new MultiTabManager(this);
      const widget = this.addDOMWidget("mml_panel", "div", this._mmlTabsManager.root, {
        getMinHeight: () => 200,
        getMaxHeight: () => undefined,
        // Follow the node's own height so dragging the bottom-right handle
        // freely resizes every material panel (content scrolls/fills inside).
        getHeight: () => Math.max(120, (this.size?.[1] || 0) - 34),
        hideOnZoom: false,
        serialize: false,
      });
      widget.computeLayoutSize = () => {
        const mgr = this._mmlTabsManager;
        const prefW = Math.max(NODE_W, this.size?.[0] || NODE_W);
        const prefH = Math.max(300, (mgr ? mgr.height() : TAB_PANEL_H) + 34);
        return {
          minHeight: 300,
          minWidth: NODE_W,   // 900：与 onResize 一致，避免画布布局把素材面板挤窄
          maxHeight: 100000,
          maxWidth: 100000,
          preferredWidth: prefW,   // 关键：Vue 布局用 preferredWidth 设 .dom-widget 宽度，
          preferredHeight: prefH,  // 缺省会退化为 width:0 导致面板塌缩。
        };
      };
      // 关键根治：Vue(Nodes 2.0) 布局读 widget.width 决定 .dom-widget 宽度。
      // ComfyUI 布局某次会把 widget.width 误设成极小的值（如 119）导致面板塌缩。
      // 用 getter 恒返回节点宽度，读时永远正确、写时忽略，彻底消除塌缩。
      Object.defineProperty(widget, "width", {
        configurable: true,
        get: () => Math.max(NODE_W, this.size?.[0] || NODE_W),
        set: () => {},
      });
      // queue 前把顶部输入框的最新值写回隐藏的 tab_index widget，
      // 保证输出始终与用户看到的「滑轨索引」一致（含未触发 change 的情况）。
      widget.beforeQueued = () => {
        const mgr = this._mmlTabsManager;
        if (mgr?.syncTopbar) mgr.syncTopbar();
        if (mgr?.syncTabIndex) mgr.syncTabIndex();
      };
      this.size[0] = Math.max(NODE_W, this.size[0] || 0);
      this.size[1] = Math.max(this._mmlTabsManager.height() + 34, this.size[1] || 0);
      this._mmlTabsManager.syncTabIndex();
      // 彻底禁用残留的自动值控件（increment/randomize），杜绝"每次运行索引 +1"
      killTabIndexValueControl(this);
      // queue 后把 tab_index 恢复为顶部输入框的值，对冲任何残留值控件副作用
      this.onAfterQueued = () => {
        const mgr = this._mmlTabsManager;
        if (mgr?.syncTopbar) mgr.syncTopbar();
      };
      // 宽度守卫：Vue 布局/拖动会直接改 node.size 而不触发 onResize，
      // 这里周期兜底，确保素材面板不会被挤窄（最小宽度 NODE_W=900）。
      const wGuard = setInterval(() => {
        const s = this.size;
        if (s && s[0] != null && s[0] < NODE_W) {
          s[0] = NODE_W;
          try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) { /* ignore */ }
        }
      }, 400);
      this._mmlWGuard = wGuard;
      const prevRemoved = this.onRemoved;
      this.onRemoved = function () {
        if (this._mmlWGuard) { clearInterval(this._mmlWGuard); this._mmlWGuard = null; }
        return prevRemoved?.apply(this, arguments);
      };
      return r;
    };

    // Canvas-only: Vue owns sizing there, so failure here must be harmless.
    const onResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      try {
        if (isLoader) {
          // 素材加载节点：保持最小宽度 900，避免素材面板被挤压错乱；
          // 高度跟随素材面板内容（最少为完整显示）。
          const min = this.computeSize();
          size[0] = Math.max(NODE_W, size[0]);
          const mgr = this._mmlTabsManager;
          const base = mgr ? mgr.height() + 34 : PANEL_H + 34;
          size[1] = Math.max(min[1], base, size[1]);
        }
        // 拆分节点：不做任何尺寸强制，恢复原生节点的自由缩放能力
        // （可任意缩小 / 放大，与普通 ComfyUI 节点行为一致）。
      } catch (e) { /* leave the size alone */ }
      return onResize?.apply(this, arguments);
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      setTimeout(() => {
        if (!isLoader) return r;   // 拆分节点不做任何尺寸/索引强制，恢复原生自由缩放
        if (this._mmlTabsManager) {
          this._mmlTabsManager.reload();
          this._mmlTabsManager.syncTabIndex();
        }
        // 强制「Tab索引」固定：彻底禁用旧工作流里残留的自动值控件
        // （increment/randomize，会导致每次运行索引自动 +1 / 随机，
        // 表现为"第一次输出秦、第二次输出汉"），使输出始终严格跟随
        // 顶部输入框/联动切换选中的 Tab。
        killTabIndexValueControl(this);
        this.size[0] = Math.max(NODE_W, this.size[0] || 0);
        this.size[1] = Math.max(
          (this._mmlTabsManager ? this._mmlTabsManager.height() : TAB_PANEL_H) + 34,
          this.size[1] || 0);
      }, 0);
      return r;
    };
  },
});
