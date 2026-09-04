/* Openkit · 统一 i18n（中英双语）模块
 *
 * 全插件唯一翻译入口：window.OKT（同时作为 ES module 导出）。
 *  - 语言检测：localStorage('openkit_lang') → navigator.language（zh 开头默认中文，否则英文）
 *  - 双向翻译：字典 [en, zh] 对 + 中英正则规则，支持 {param} 占位符
 *  - 语言切换：持久化 + 派发 'openkit:langchange' 全局事件（各节点监听并刷新自身）
 *  - 节点标题：按语言更新 Openkit 各节点标题（仅覆盖默认名，不覆盖用户自定义标题）
 *
 * 铁律：JSON key/值（如"整体风格"/"文戏"）与用户输入（Tab 名/文本域内容）永远不经过本模块翻译，
 *       只翻译静态 UI 文案（按钮/标签/提示/占位符）。
 */
import { app } from "../../../scripts/app.js";

(function () {
  const STORE_KEY = "openkit_lang";

  /* ---------------- 字典（[en, zh] 对，双向查找） ---------------- */
  const DICT = [
    // 通用按钮
    ["Save", "保存"], ["Delete", "删除"], ["Cancel", "取消"], ["Apply", "应用"],
    ["Close", "关闭"], ["Play", "播放"], ["Reset", "重置"], ["Remove", "移除"],
    ["Clear media", "清空媒体"], ["Load files…", "加载文件…"],
    ["or drop files on any slot", "或将文件拖到任意槽位"],
    ["pictures", "图片"], ["videos", "视频"], ["AUDIO", "音频"],
    ["picture", "图片"], ["video", "视频"], ["audio", "音频"],
    ["load preset…", "加载预设…"], ["no presets saved", "暂无已保存预设"],
    ["preset", "预设"], ["save as", "另存为"],
    ["off", "关"], ["paired", "配对"], ["alone", "独立"], ["standalone", "独立"],
    ["Switch to English", "切换到英文"], ["Switch to Chinese", "切换到中文"],
    // 节点级
    ["Expand Native-output splitter", "展开输出拆分器"],
    ["Media Loader", "素材加载器"], ["Nothing loaded to save.", "没有可保存的素材。"],
    ["Give the preset a name.", "请为预设命名。"], ["Pick a preset first.", "请先选择预设。"],
    ["Videos need PyAV or ffmpeg on the server.", "视频解码需要服务端安装 PyAV 或 ffmpeg。"],
    ["Reference Splitter not found — restart ComfyUI", "未找到 Reference Splitter — 请重启 ComfyUI"],
    ["Splitter is already connected", "Splitter 已连接"],
    ["Splitter added — wire its slots to the downstream video node", "已添加 Splitter — 将其输出接到下游视频生成节点"],
    ["Remove every loaded reference from this node", "从本节点移除所有已加载素材"],
    ["Load a saved reference set", "加载已保存的素材预设"],
    ["Save the current set", "保存当前素材组"],
    ["Delete the selected preset", "删除选中的预设"],
    ["Use only part of this clip", "仅使用此片段的一部分"],
    ["Crop this image", "裁剪此图片"], ["Crop the frame", "裁剪画面"],
    ["\u25a3 Crop", "\u25a3 裁剪"], ["freeform", "自由"], ["playhead", "播放头"],
    ["Preset name", "预设名称"], ["Reset the crop", "重置裁剪"],
    ["Previous frame (\u2190)", "上一帧（\u2190）"], ["Next frame (\u2192)", "下一帧（\u2192）"],
    ["\u21ba Reset", "\u21ba 重置"], ["\u{1F4F7} Use frame", "\u{1F4F7} 使用此帧"],
    ["Drag to move the start of the kept range", "拖动调整保留区间的开始"],
    ["Drag to move the end of the kept range", "拖动调整保留区间的结束"],
    ["Set start to the playhead  ( [ )", "将开始时间设为播放头（[）"],
    ["Set end to the playhead  ( ] )", "将结束时间设为播放头（]）"],
    ["Jump the playhead to the clip's first frame", "将播放头跳到片段第一帧"],
    ["Jump the playhead to the clip's last frame — then step back one frame", "将播放头跳到片段最后一帧 — 然后回退一帧"],
    ["Switch off — kept here but not sent to the model", "关闭 — 保留但不会发送给模型"],
    ["Switch on", "开启"],
    ["Couldn't read that frame.", "无法读取该帧。"],
    ["Frame isn't ready yet — let the preview load, then try again.", "画面还没准备好 — 等预览加载后再试。"],
    ["tag order sent to the model", "发送给模型的标签顺序"],
    ["nothing loaded yet", "尚未加载"], ["split audio", "音轨拆分"],
    ["where the track comes out", "音轨输出位置"],
    ["What do off / paired / alone do?", "关 / 配对 / 独立是什么意思？"],
    ["Ignore this video's audio", "忽略此视频的音轨"],
    ["Soundtrack pairs with this video, labelled just before it", "音轨与此视频配对，标签排在其前面"],
    ["Soundtrack becomes a separate reference, numbered after the videos", "音轨作为独立参考，编号排在视频之后"],
    // 长说明（保留区段）
    ["Kept span is under 2s. Reference models are typically trained on 2\u201315s reference clips; shorter ones tend to be weakly followed or ignored. Widen the range, or pad short files (like sound effects) with silence before loading.",
      "保留区间不足 2 秒。参考模型通常使用 2–15 秒参考片段；更短的内容通常效果弱或不被采用。请拉宽区间，或先给短文件（如音效）补静音再加载。"],
    ["\u2190 \u2192 step a frame (shift = 10) \u00b7 space play \u00b7 [ ] set start/end here \u00b7 home/end jump",
      "← → 逐帧（shift=10 帧）· 空格播放 · [ ] 在此设置起止 · home/end 跳转"],
    ["\u2190 \u2192 step a frame (shift = 10) \u00b7 space play \u00b7 [ ] set start/end here \u00b7 home/end jump \u00b7 C capture frame",
      "← → 逐帧（shift=10 帧）· 空格播放 · [ ] 在此设置起止 · home/end 跳转 · C 截取帧"],
    ["The video's audio is ignored — nothing is extracted and no tag is created. Worth doing when the sound is irrelevant, since it also frees one of your twelve reference slots.",
      "视频音轨被忽略 — 不提取、也不创建标签。当声音无关紧要时建议使用，因为它还能腾出一个参考槽位。"],
    ["Use paired when the sound genuinely belongs to that footage: on-screen dialogue where lip sync matters, diegetic action sounds that need to land on the same frames, or video-editing tasks where you're keeping the original soundtrack. The temporal binding is the whole point.",
      "当声音确实属于该画面时使用“配对”：需要对口型的画面内对白、必须落在相同帧上的画面内动作音，或保留原始音轨的视频编辑任务。时间绑定正是它的意义所在。"],
    ["Use alone when you want the audio as a reference rather than as that clip's soundtrack — borrowing a speaker's voice timbre for a different character, referencing a music style, or lifting ambience. Also the right choice when you're not reusing the video's visuals in sync, since a binding you don't want can pull the generation toward reproducing that clip's timing.",
      "当你想把音频当作参考而不是该片段的音轨时使用“独立”：为不同角色借用说话人的音色、参考音乐风格或提取环境声。当你不打算同步复用该视频画面时也应选它，因为多余的绑定会把生成结果拉向复刻该片段的节奏。"],
    ["The extracted track always gets its own AUDIO output — ComfyUI has no combined video-with-sound type, so the split is a wiring requirement. The mode decides which group it joins, which sets the native slot, the tag number, and whether the model binds it to that video's frames. Either way it occupies a reference slot, so a video with audio counts as two of your twelve.",
      "拆出的音轨始终有独立的 AUDIO 输出 — ComfyUI 没有音视频合并类型，因此拆分是连线要求。模式决定它进入哪个分组，从而决定原生槽位、标签编号以及模型是否将其绑定到该视频的画面。无论哪种方式它都占用一个参考槽位，因此带音轨的视频会占用你的 12 个额度中的两个。"],
    // 素材加载节点 UI（media_loader 硬编码中文补丁）
    ["分类内编号（自动分配，不可编辑）", "Number in category (auto-assigned, read-only)"],
    ["分类（关键帧 / 角色 / 道具 / 场景），切换后自动编号", "Category (Keyframe / Character / Prop / Scene) — renumbered automatically on change"],
    ["已存在展开节点，全局共用一个，不会重复生成", "A splitter already exists — shared globally, not duplicated"],
    ["未找到展开节点定义，请重启 ComfyUI 后重试", "Splitter definition not found — restart ComfyUI and retry"],
    ["已展开拆分节点，请将其输出接到下游视频生成节点", "Splitter expanded — wire its outputs to the downstream video node"],
    ["联动切换", "Link & switch"],
    ["展开输出拆分器", "Expand output splitter"],
    ["Tab索引", "Tab index"],
    ["修改 Tab 索引后点击，下方 Tab 页自动切换到对应索引，并联动切换输出", "After editing the tab index, click to switch the tab below and sync the output"],
    ["展开一个全局共用的素材拆分节点；已存在展开节点时不会重复生成，会自动定位到已有的那个", "Expand a globally shared splitter; if one already exists it will be located instead of duplicated"],
    ["Tab索引：从 0 开始，决定「tab_references（指定素材）」输出哪个 Tab 页的素材", "Tab index: 0-based; decides which tab's media the 指定素材 output provides"],
    ["新增一个 Tab（每页一套完整的素材）", "Add a tab (a complete media set per tab)"],
    ["关闭该 Tab（会先确认）", "Close this tab (asks for confirmation)"],
    ["取消", "Cancel"], ["确认关闭", "Confirm close"],
    // 多Tab字符串节点
    ["Tab索引", "Tab index"],
    ["决定节点最终输出哪个 Tab 页的内容，索引从 0 开始", "Decides which tab page this node outputs; index starts at 0"],
    ["修改 Tab 索引后点击，下方 Tab 页自动切换到对应索引的页", "After editing the index, click to switch the tab below to that page"],
    ["在此输入当前 Tab 页的多行文本…", "Type multi-line text for the current tab here…"],
    ["点击切换该页（联动输出）；双击可编辑标题", "Click to switch (syncs output); double-click to rename"],
    ["关闭该 Tab 页（有内容会先确认）", "Close this tab (asks first if it has content)"],
    ["新增一个 Tab 页", "Add a tab page"],
    ["确定要关闭 Tab「{name}」吗？\n关闭后该页内容将丢失，且不可恢复。", "Close tab \"{name}\"? Its content will be lost and cannot be restored."],
    // 多段提示词可视化编辑节点
    ["预览 JSON", "Preview JSON"], ["返回编辑", "Back to edit"], ["校验格式", "Validate"],
    ["确认删除", "Confirm delete"],
    ["点击切换到 JSON 预览/编辑模式，再次点击返回可视化编辑", "Click to switch to JSON preview/edit mode; click again to return to the visual editor"],
    ["校验当前 JSON 格式是否正确", "Validate whether the current JSON is well-formed"],
    ["在此粘贴或编辑完整 JSON…", "Paste or edit the full JSON here…"],
    ["在此输入{key}…", "Type {key} here…"],
    ["在此输入第 {idx} 条{key}内容…", "Type the content of item {idx} ({key}) here…"],
    ["点击切换；双击编辑标题", "Click to switch; double-click to rename"],
    ["删除该条目", "Delete this item"], ["添加一条", "Add one"],
    ["编号自动生成，不可编辑", "Auto-generated number, read-only"],
    ["输入分镜标题…", "Type a shot title…"], ["输入分镜摘要…", "Type a shot summary…"],
    ["运镜（逐条编辑）", "Camera moves (edit one by one)"],
    ["输入第 {idx} 条运镜描述…", "Type camera-move {idx} description…"],
    ["输入环境音描述…", "Type ambience description…"], ["输入BGM描述…", "Type BGM description…"],
    ["编号", "Number"], ["类型", "Type"], ["标题", "Title"], ["摘要", "Summary"],
    ["运镜", "Camera moves"], ["环境音", "Ambience"], ["BGM", "BGM"],
    ["条目 {n}", "Item {n}"], ["空", "Empty"], ["未命名", "Untitled"],
    ["格式校验通过，数据已同步", "Validation passed; data synced"],
    ["格式校验未通过", "Validation failed"],
    // JSON 提取节点
    ["索引控制", "Index control"],
  ];

  // 字典规范化：约定 [en, zh]；中文在前（历史手误 / 后续 addPairs 传入）自动交换为 [en, zh]
  const CJK_RE = /[\u4e00-\u9fff]/;
  function normalizePair(p) {
    if (Array.isArray(p) && p.length >= 2 && CJK_RE.test(String(p[0])) && !CJK_RE.test(String(p[1]))) {
      return [String(p[1]), String(p[0])];
    }
    return p;
  }
  for (let i = 0; i < DICT.length; i++) DICT[i] = normalizePair(DICT[i]);

  /* ---------------- 英→中 规则（动态文案） ---------------- */
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
    [/^\u26a0 Frame at (.+) is outside the kept range$/, "⚠ $1 处的帧超出保留范围"],
    [/^Start time in seconds$/, "开始时间（秒）"],
    [/^End time in seconds$/, "结束时间（秒）"],
    [/^Use only the final (\d+) seconds$/, "仅使用最后 $1 秒"],
    [/^last (\d+)s$/, "最后 $1 秒"],
    [/^That would exceed the (\d+)-file limit — switch something off or remove it first\.$/, "这会使素材总数超过 $1 个限制 — 请先关闭或移除一些。"],
    [/^Capturing frame at ([\d.]+)s…$/, "正在截取 $1 秒处的帧…"],
    [/^Added (\d+)\u00d7(\d+) frame from ([\d.]+)s( \(cropped\))? as a picture reference\.$/, (m, w, h, t, cr) => `已添加 ${w}×${h} 的 ${t} 秒帧${cr ? "（已裁剪）" : ""}作为图片参考。`],
    [/^Capture failed: (.+)$/, "截取失败：$1"],
    [/^(\S+): (.+)$/, "$1：$2"],
  ];

  /* ---------------- 中→英 规则（反向还原） ---------------- */
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

  /* ---------------- 语言状态 ---------------- */
  function detect() {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved === "zh" || saved === "en") return saved;
    } catch (e) { /* ignore */ }
    try {
      const nav = (navigator.language || navigator.userLanguage || "zh").toLowerCase();
      return nav.indexOf("zh") === 0 ? "zh" : "en";
    } catch (e) { return "zh"; }
  }

  let lang = detect();

  function setLang(l) {
    const next = l === "en" ? "en" : "zh";
    lang = next;
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* ignore */ }
    try {
      window.dispatchEvent(new CustomEvent("openkit:langchange", { detail: { lang } }));
    } catch (e) { /* ignore */ }
  }

  /* ---------------- 翻译核心 ---------------- */
  function tr(text, params) {
    if (typeof text !== "string" || !text) return text;
    let out = null;
    if (lang === "zh") {
      for (const [en, zh] of DICT) { if (text === en) { out = zh; break; } }
      if (out == null) {
        for (const [re, fn] of ZH_RULES) {
          if (re.test(text)) { out = text.replace(re, fn); break; }
        }
      }
    } else {
      for (const [en, zh] of DICT) { if (text === zh) { out = en; break; } }
      if (out == null) {
        for (const [re, fn] of EN_RULES) {
          if (re.test(text)) { out = text.replace(re, fn); break; }
        }
      }
    }
    if (out == null) out = text;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        out = out.split("{" + k + "}").join(String(v));
      }
    }
    return out;
  }

  function addPairs(pairs) {
    for (const p of pairs || []) {
      const n = normalizePair(p);
      if (Array.isArray(n) && n.length >= 2 && n[0] !== n[1]) {
        DICT.push([String(n[0]), String(n[1])]);
      }
    }
  }
  function addRules(zh, en) {
    if (zh) for (const r of zh) ZH_RULES.push(r);
    if (en) for (const r of en) EN_RULES.push(r);
  }

  /* ---------------- DOM 翻译 ---------------- */
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

  function observeLanguage(root) {
    if (!root || typeof MutationObserver === "undefined") return null;
    let timer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => localizeDom(root), 30);
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return observer;
  }

  /* ---------------- 节点标题映射 ---------------- */
  const NODE_TITLES = {
    "JsonExtractor": ["JSON提取", "JSON Extractor"],
    "MultiframeRef": ["多帧参考", "Multiframe Reference"],
    "ChooseImage": ["筛选图像", "Select Image"],
    "SubjectRefTagReplacement": ["主体引用标签置换", "Subject Ref Tag Replacement"],
    "MediaLoader": ["素材加载", "Media Loader"],
    "ReferenceSplitter": ["素材拆分", "Reference Splitter"],
    "TabStringMultiline": ["多Tab字符串", "Multi-Tab String"],
    "MultiSegmentPromptEditor": ["多段提示词可视化编辑", "Multi-Segment Prompt Editor"],
  };

  function titleFor(cls) {
    const t = NODE_TITLES[cls];
    return t ? (lang === "zh" ? t[0] : t[1]) : null;
  }

  /** 按当前语言更新所有 Openkit 节点标题。仅当标题仍是默认名时才覆盖，
   *  用户自定义标题（双击改名）永不被覆盖。 */
  function applyNodeTitles() {
    try {
      const graph = app?.graph;
      if (!graph) return;
      for (const node of graph._nodes || []) {
        const cls = node?.type;
        if (!cls || !NODE_TITLES[cls]) continue;
        const [zhTitle, enTitle] = NODE_TITLES[cls];
        if (lang === "en") {
          if (node.title === zhTitle) node.title = enTitle;
        } else if (node.title === enTitle) {
          node.title = zhTitle;
        }
      }
      graph.setDirtyCanvas?.(true, true);
    } catch (e) { /* ignore */ }
  }

  const OKT = {
    STORE_KEY,
    get lang() { return lang; },
    setLang,
    detect,
    addPairs,
    addRules,
    t: tr,
    tr,
    localizeDom,
    observeLanguage,
    NODE_TITLES,
    titleFor,
    applyNodeTitles,
  };

  window.OKT = OKT;
  window.dispatchEvent?.(new CustomEvent("openkit:i18n-ready", { detail: { OKT } }));
})();

export const OKT = window.OKT;
