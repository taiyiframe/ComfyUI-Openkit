import re
import json as _json


class AnyType(str):
    def __ne__(self, __value):
        return False


QUOTE_PAIRS = [
    ('"',  '"',  1),
    ("'",  "'",  2),
    ("\u201c",  "\u201d",  3),
    ("\u2018",  "\u2019",  4),
    ("\u300c", "\u300d", 5),
    ("\u300e", "\u300f", 6),
]


def _build_quote_protect_mask(text):
    n = len(text)
    mask = [False] * n
    if n == 0:
        return mask

    opening_map = {}
    closing_map = {}
    for op, cl, rk in QUOTE_PAIRS:
        opening_map.setdefault(op, []).append((cl, rk))
        closing_map.setdefault(cl, []).append((op, rk))

    stack = []
    i = 0
    while i < n:
        ch = text[i]
        if ch in opening_map:
            if ch in ('"', "'"):
                expected_rank = 1 if ch == '"' else 2
                if stack and stack[-1][0] == expected_rank:
                    _rank, _cl, start = stack.pop()
                    for k in range(start, i + 1):
                        mask[k] = True
                    i += 1
                    continue
            (closing_char, rank) = opening_map[ch][0]
            stack.append((rank, closing_char, i))
            i += 1
            continue
        if ch in closing_map:
            found = None
            for si in range(len(stack) - 1, -1, -1):
                if stack[si][1] == ch:
                    found = si
                    break
            if found is not None:
                _rank, _cl, start = stack.pop(found)
                for k in range(start, i + 1):
                    mask[k] = True
                i += 1
                continue
        i += 1
    return mask


DIALOGUE_TAG_RE = re.compile(r'<d>.*?</d>', re.DOTALL)


def _build_dialogue_protect_mask(text):
    mask = _build_quote_protect_mask(text)
    for m in DIALOGUE_TAG_RE.finditer(text):
        for k in range(m.start(), m.end()):
            mask[k] = True
    return mask


DEFAULT_NEGATIVE = (
    "Negative: No background music, no text, no watermark, no logo, "
    "no other people, no exaggerated expression, no camera static,"
    "No two moons shall appear. No multiple moons shall appear,"
    "Nothing more than in\u2011narrative music,"
)


class JsonExtractor:
    OUTPUT_NAMES = ("整体风格", "档案", "档案编码", "角色道具场景", "分镜序列", "关键帧索引", "角色索引", "道具索引", "场景索引", "索引时长", "场景判断")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "json": (AnyType("*"), {
                    "forceInput": True,
                    "tooltip": "JSON 数据输入，支持 JSON 字符串或对象。字符串可为多个 JSON 对象拼接，自动逐段解析合并提取。"
                }),
                "索引": ("INT", {
                    "default": 1,
                    "min": 1,
                    "step": 1,
                    "tooltip": "对应分镜序列/分镜情节中的「编号」值，选择该编号的分镜。"
                }),
                "档案选择": (["角色档案", "音色档案", "道具档案", "场景档案", "关键帧档案"], {
                    "default": "角色档案",
                    "tooltip": "选择「档案」输出端口输出的档案类型：角色档案、音色档案、道具档案、场景档案或关键帧档案。"
                }),
                "角色开关": ("BOOLEAN", {
                    "default": True,
                    "label_on": "输出",
                    "label_off": "不输出",
                    "display_name": "角色输出",
                    "tooltip": "控制「角色索引」端口：开=输出匹配到的角色档案0基序号，关=输出空文本。"
                }),
                "道具开关": ("BOOLEAN", {
                    "default": True,
                    "label_on": "输出",
                    "label_off": "不输出",
                    "display_name": "道具输出",
                    "tooltip": "控制「道具索引」端口：开=输出匹配到的道具档案0基序号，关=输出空文本。"
                }),
                "场景开关": ("BOOLEAN", {
                    "default": True,
                    "label_on": "输出",
                    "label_off": "不输出",
                    "display_name": "场景输出",
                    "tooltip": "控制「场景索引」端口：开=输出匹配到的场景档案0基序号，关=输出空文本。"
                }),
                "关键帧开关": ("BOOLEAN", {
                    "default": True,
                    "label_on": "输出",
                    "label_off": "不输出",
                    "display_name": "关键帧输出",
                    "tooltip": "控制「关键帧索引」端口：开=输出匹配到的关键帧档案0基序号，关=输出空文本。"
                }),
                "BGM开关": ("BOOLEAN", {
                    "default": True,
                    "label_on": "输出",
                    "label_off": "N/A",
                    "display_name": "BGM输出",
                    "tooltip": "控制「分镜序列」端口中 non_diegetic_music(BGM) 内容：开=正常输出 BGM，关=输出 N/A。"
                }),
                "情节开关": ("BOOLEAN", {
                    "default": False,
                    "label_on": "输出",
                    "label_off": "整合格式",
                    "display_name": "情节输出",
                    "tooltip": "控制「分镜序列」端口输出内容：开=输出「分镜情节」中该编号分镜的「情节」内容（纯文本，替代整合格式）；关=输出 H3 六段标准提示词 + 自定义段落。"
                }),
                "自定义段落": ("STRING", {
                    "multiline": True,
                    "default": DEFAULT_NEGATIVE,
                    "display_name": "自定义段落（末尾追加）",
                    "tooltip": "自定义段落，追加在分镜序列 H3 六段标准提示词末尾（如 Negative 提示词）。留空则不追加。"
                }),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "INT", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "FLOAT", "BOOLEAN")
    RETURN_NAMES = OUTPUT_NAMES
    FUNCTION = "extract_json"
    CATEGORY = "OpenToolkit"
    OUTPUT_NODE = True

    @staticmethod
    def _list_to_lines(val):
        if isinstance(val, (list, tuple)):
            lines = []
            for item in val:
                if item is None:
                    continue
                try:
                    s = str(item)
                except Exception:
                    continue
                if s:
                    lines.append(s)
            return "\n".join(lines)
        try:
            return str(val)
        except Exception:
            return ""

    @staticmethod
    def _parse_json_text(text):
        s = text.strip() if isinstance(text, str) else text
        if not s:
            return {}
        try:
            obj = _json.loads(s)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            pass
        decoder = _json.JSONDecoder()
        data = {}
        i = 0
        n = len(s)
        while i < n:
            while i < n and s[i] in " \t\r\n":
                i += 1
            if i >= n:
                break
            if s[i] not in "{[":
                i += 1
                continue
            try:
                obj, end = decoder.raw_decode(s, i)
            except Exception:
                i += 1
                continue
            if isinstance(obj, dict):
                data.update(obj)
            i = end
        return data

    @staticmethod
    def _extract_name(entry):
        s = str(entry) if entry is not None else ""
        for sep in ("\uff0c", ","):
            if sep in s:
                return s.split(sep)[0].strip()
        return s.strip()

    @staticmethod
    def _find_appearing_indices(text, char_names, prop_names):
        if not text:
            return [], []

        mask = _build_dialogue_protect_mask(text)
        n = len(text)

        all_names = []
        for i, name in enumerate(char_names):
            if name:
                all_names.append((name, 'char', i, len(name)))
        for i, name in enumerate(prop_names):
            if name:
                all_names.append((name, 'prop', i, len(name)))

        all_names.sort(key=lambda x: -x[3])

        consumed = [False] * n
        char_found = {}
        prop_found = {}

        for name, ntype, idx, m in all_names:
            if m == 0 or m > n:
                continue
            i = 0
            while i <= n - m:
                blocked = False
                for k in range(m):
                    if mask[i + k] or consumed[i + k]:
                        blocked = True
                        break
                if not blocked and text[i:i + m] == name:
                    pos = i
                    if ntype == 'char':
                        if idx not in char_found:
                            char_found[idx] = pos
                    else:
                        if idx not in prop_found:
                            prop_found[idx] = pos
                    for k in range(m):
                        consumed[i + k] = True
                    i += m
                else:
                    i += 1

        char_indices = [idx for idx, _ in sorted(char_found.items(), key=lambda x: x[1])]
        prop_indices = [idx for idx, _ in sorted(prop_found.items(), key=lambda x: x[1])]
        return char_indices, prop_indices

    @staticmethod
    def _find_keyframe_indices(text, keyframe_names):
        if not text or not keyframe_names:
            return []
        mask = _build_dialogue_protect_mask(text)
        n = len(text)
        all_names = [(name, i, len(name)) for i, name in enumerate(keyframe_names) if name]
        all_names.sort(key=lambda x: -x[2])
        consumed = [False] * n
        found = {}
        for name, idx, m in all_names:
            if m == 0 or m > n:
                continue
            i = 0
            while i <= n - m:
                blocked = False
                for k in range(m):
                    if mask[i + k] or consumed[i + k]:
                        blocked = True
                        break
                if not blocked and text[i:i + m] == name:
                    if idx not in found:
                        found[idx] = i
                    for k in range(m):
                        consumed[i + k] = True
                    i += m
                else:
                    i += 1
        return [idx for idx, _ in sorted(found.items(), key=lambda x: x[1])]

    @staticmethod
    def _max_duration_seconds(text):
        if not text:
            return 0.0
        pattern = r'(?:^|\n)\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:s|秒)?'
        matches = re.findall(pattern, text)
        if not matches:
            return 0.0
        end_times = [float(m[1]) for m in matches]
        return max(end_times) if end_times else 0.0

    @staticmethod
    def _type_duration_seconds(type_str):
        if not type_str:
            return None
        m = re.search(r'(\d+(?:\.\d+)?)', str(type_str))
        if not m:
            return None
        return float(m.group(1))

    @staticmethod
    def _build_subject_definitions(subjects):
        if not subjects:
            return ""
        lines = []
        for stype, desc, snum, pnum in subjects:
            d = desc.rstrip("。.")
            if stype == 'scene':
                lines.append(f"<Subject {snum}>：{d}。无参考图，由文字描述定义。")
            else:
                lines.append(f"<Subject {snum}>：{d}。完全参照 <Picture {pnum}> 外观。")
        return "\n".join(lines)

    @staticmethod
    def _build_retention_text(subjects):
        if not subjects:
            return ""
        lines = []
        for stype, desc, snum, pnum in subjects:
            lines.append(f"<Subject {snum}>：fully_preserved {desc}")
        return "\n".join(lines)

    @staticmethod
    def _build_subject_ref_list(subjects):
        if not subjects:
            return ""
        lines = []
        for stype, desc, snum, pnum in subjects:
            name = JsonExtractor._extract_name(desc)
            lines.append(f"<Subject {snum}>：{name}")
        return "\n".join(lines)

    @staticmethod
    def _detect_forced_no_bgm(data, shot_item=None):
        keywords = [
            "强制禁止出现背景音乐", "强制禁止背景音乐", "禁止出现背景音乐",
            "禁止背景音乐", "严禁背景音乐", "强制禁止BGM", "严禁BGM", "禁止BGM",
        ]
        texts = []
        if isinstance(data, dict):
            for key in ("整体风格", "摘要", "运镜", "环境音", "标题", "类型"):
                val = data.get(key, "")
                if isinstance(val, list):
                    texts.extend(str(v) for v in val)
                else:
                    texts.append(str(val))
        if shot_item and isinstance(shot_item, dict):
            for key in ("摘要", "运镜", "环境音", "标题", "类型", "整体风格"):
                val = shot_item.get(key, "")
                if isinstance(val, list):
                    texts.extend(str(v) for v in val)
                else:
                    texts.append(str(val))
        for text in texts:
            for kw in keywords:
                if kw in text:
                    return True
        return False

    @staticmethod
    def _build_detailed_overview(摘要, 类型):
        if not 摘要:
            return ""
        duration = JsonExtractor._type_duration_seconds(类型)
        duration_str = str(int(duration)) if duration is not None and duration == int(duration) else (str(duration) if duration is not None else "10")

        shot_type = "一镜到底"
        shot_types = [
            "一镜到底", "固定微推", "固定镜头", "推镜头", "拉镜头",
            "摇镜头", "移镜头", "跟镜头", "环绕镜头", "升降镜头",
            "手持跟拍", "斯坦尼康跟随", "固定机位", "缓慢推近",
        ]
        for st in shot_types:
            if st in 摘要[:30]:
                shot_type = st
                break

        processed = 摘要.strip()
        processed = re.sub(r'^\s*\d+(?:\.\d+)?\s*秒\s*[，,]?\s*', '', processed)
        scene_scales = ["远景", "全景", "中景", "近景", "特写", "大特写", "中近景", "中全景", "大全景"]
        changed = True
        while changed:
            changed = False
            for st in shot_types:
                new_p = re.sub(r'^\s*' + re.escape(st) + r'\s*[，,]?\s*', '', processed)
                if new_p != processed:
                    processed = new_p
                    changed = True
            for ss in scene_scales:
                new_p = re.sub(r'^\s*' + re.escape(ss) + r'\s*[，,]?\s*', '', processed)
                if new_p != processed:
                    processed = new_p
                    changed = True
        processed = processed.strip()

        return f"[{shot_type}] 0\u2013{duration_str}s，{processed}"

    @staticmethod
    def _build_detailed_description(主体定义, 摘要, retention_text, 整体风格, 运镜, 环境音, BGM, 类型="", bgm_enabled=True, 自定义段落="", 强制禁止BGM=False):
        if isinstance(运镜, str):
            shot_lines = 运镜.split("\n") if 运镜.strip() else []
        elif isinstance(运镜, list):
            shot_lines = 运镜
        else:
            shot_lines = []
        numbered = []
        for line in shot_lines:
            s = str(line) if line is not None else ""
            if s.strip():
                if s.startswith("→"):
                    numbered.append(s)
                else:
                    numbered.append(f"→{s}")
        blocks = []
        blocks.append("subject_definitions:" + ("\n" + 主体定义 if 主体定义 else ""))
        blocks.append("summary:" + ("\n" + 摘要 if 摘要 else ""))
        blocks.append("retention_analysis:" + ("\n" + retention_text if retention_text else ""))
        dd_block = "detailed_description:"
        overview = JsonExtractor._build_detailed_overview(摘要, 类型)
        if overview:
            dd_block += "\n" + overview
        if numbered:
            dd_block += "\n" + "\n".join(numbered)
        blocks.append(dd_block)
        blocks.append("overall_soundscape:" + ("\n" + 环境音 if 环境音 else ""))
        if 强制禁止BGM:
            blocks.append("non_diegetic_music:\nN/A. Strictly prohibited: no background music, no soundtrack, no instrumental music, no melodic accompaniment, no score, no musical elements of any kind. Only diegetic sound and ambient soundscape are permitted.")
        elif bgm_enabled:
            blocks.append("non_diegetic_music:" + ("\n" + BGM if BGM else ""))
        else:
            blocks.append("non_diegetic_music:\nN/A")
        if 自定义段落:
            blocks.append(自定义段落)
        return "\n\n".join(blocks)

    @staticmethod
    def _extract_scene_prefix(title):
        if not title:
            return ""
        prefix = title
        for sep in ("—", "-"):
            if sep in prefix:
                prefix = prefix.split(sep)[0]
                break
        return prefix.strip()

    @staticmethod
    def _match_scene_index(title, scenes):
        if not title or not isinstance(scenes, list) or not scenes:
            return -1
        prefix = JsonExtractor._extract_scene_prefix(title)
        if not prefix:
            return -1
        for idx, scene in enumerate(scenes):
            scene_str = str(scene) if scene is not None else ""
            scene_name = scene_str
            for sep in ("\uff0c", ","):
                if sep in scene_name:
                    scene_name = scene_name.split(sep)[0]
                    break
            scene_name = scene_name.strip()
            if not scene_name:
                continue
            if prefix in scene_name or scene_name in prefix:
                return idx
        return -1

    @staticmethod
    def _archive_indices_by_names(appearing, archive_names):
        if not isinstance(appearing, list):
            return None
        index_map = {name: i for i, name in enumerate(archive_names) if name}
        result = []
        for entry in appearing:
            if entry is None:
                continue
            name = str(entry)
            if name not in index_map:
                for sep in ("\uff0c", ","):
                    if sep in name:
                        name = name.split(sep)[0].strip()
                        break
            if name in index_map:
                idx = index_map[name]
                if idx not in result:
                    result.append(idx)
        return result

    def extract_json(self, json=None, 索引=1, 档案选择="角色档案", 角色开关=True, 道具开关=True, 场景开关=True, 关键帧开关=True, BGM开关=True, 情节开关=False, 自定义段落=""):
        data = json

        if isinstance(data, str):
            data = self._parse_json_text(data)

        if not isinstance(data, dict):
            data = {}

        整体风格 = self._list_to_lines(data.get("整体风格", ""))
        角色档案数据 = data.get("角色档案", [])
        音色档案数据 = data.get("音色档案", [])
        道具档案数据 = data.get("道具档案", [])
        场景档案数据 = data.get("场景档案", [])
        关键帧档案数据 = data.get("关键帧档案", [])

        档案表 = {
            "角色档案": 角色档案数据,
            "音色档案": 音色档案数据,
            "道具档案": 道具档案数据,
            "场景档案": 场景档案数据,
            "关键帧档案": 关键帧档案数据,
        }
        档案 = self._list_to_lines(档案表.get(档案选择, 角色档案数据))

        档案编码 = {
            "角色档案": 0,
            "音色档案": 1,
            "道具档案": 2,
            "场景档案": 3,
            "关键帧档案": 4,
        }.get(档案选择, 0)

        分镜序列数据 = data.get("分镜序列", [])
        分镜情节数据 = data.get("分镜情节", [])
        分镜序列文本 = ""
        运镜 = []
        环境音 = ""
        BGM = ""
        摘要 = ""
        matched_title = ""
        matched_type = ""
        情节条目 = None
        分镜序列条目 = None
        if isinstance(分镜情节数据, list):
            for item in 分镜情节数据:
                if isinstance(item, dict) and item.get("编号") == 索引:
                    情节条目 = item
                    break
        found_shot = 情节条目 is not None
        if isinstance(分镜序列数据, list):
            for item in 分镜序列数据:
                if isinstance(item, dict) and item.get("编号") == 索引:
                    分镜序列条目 = item
                    运镜 = item.get("运镜", [])
                    分镜序列文本 = self._list_to_lines(运镜)
                    环境音 = self._list_to_lines(item.get("环境音", ""))
                    BGM = self._list_to_lines(item.get("BGM", ""))
                    摘要 = self._list_to_lines(item.get("摘要", ""))
                    matched_title = str(item.get("标题", ""))
                    matched_type = str(item.get("类型", ""))
                    found_shot = True
                    break
        if 情节条目 is not None and not matched_title:
            matched_title = str(情节条目.get("标题", ""))
        if 情节条目 is not None and not matched_type:
            matched_type = str(情节条目.get("类型", ""))

        if not found_shot:
            角色道具场景 = ""
            角色索引 = ""
            道具索引 = ""
            场景索引 = ""
            关键帧索引 = ""
            索引时长 = 0.0
            subjects = []
            retention_text = ""
            主体定义 = ""
        else:
            char_names = [self._extract_name(e) for e in (角色档案数据 if isinstance(角色档案数据, list) else [])]
            prop_names = [self._extract_name(e) for e in (道具档案数据 if isinstance(道具档案数据, list) else [])]
            keyframe_names = [self._extract_name(e) for e in (关键帧档案数据 if isinstance(关键帧档案数据, list) else [])]

            出现角色 = 情节条目.get("出现角色") if 情节条目 is not None else None
            出现道具 = 情节条目.get("出现道具") if 情节条目 is not None else None
            出现关键帧 = 情节条目.get("出现关键帧") if 情节条目 is not None else None

            char_indices = self._archive_indices_by_names(出现角色, char_names)
            prop_indices = self._archive_indices_by_names(出现道具, prop_names)
            keyframe_indices = self._archive_indices_by_names(出现关键帧, keyframe_names)

            if char_indices is None or prop_indices is None:
                match_text = 分镜序列文本
                if 摘要:
                    match_text = match_text + "\n" + 摘要
                text_char, text_prop = self._find_appearing_indices(match_text, char_names, prop_names)
                if char_indices is None:
                    char_indices = text_char
                if prop_indices is None:
                    prop_indices = text_prop

            if keyframe_indices is None:
                match_text = 分镜序列文本
                if 摘要:
                    match_text = match_text + "\n" + 摘要
                keyframe_indices = self._find_keyframe_indices(match_text, keyframe_names)

            角色描述列表 = []
            if isinstance(角色档案数据, list):
                for i in char_indices:
                    if 0 <= i < len(角色档案数据) and 角色档案数据[i] is not None:
                        角色描述列表.append(str(角色档案数据[i]))
            道具描述列表 = []
            if isinstance(道具档案数据, list):
                for i in prop_indices:
                    if 0 <= i < len(道具档案数据) and 道具档案数据[i] is not None:
                        道具描述列表.append(str(道具档案数据[i]))
            关键帧描述列表 = []
            if isinstance(关键帧档案数据, list):
                for i in keyframe_indices:
                    if 0 <= i < len(关键帧档案数据) and 关键帧档案数据[i] is not None:
                        关键帧描述列表.append(str(关键帧档案数据[i]))

            出现场景 = 情节条目.get("出现场景") if 情节条目 is not None else None
            scene_names = [self._extract_name(e) for e in (场景档案数据 if isinstance(场景档案数据, list) else [])]
            idx = -1
            if isinstance(出现场景, str) and 出现场景.strip() and scene_names:
                target = 出现场景.strip()
                for si, sname in enumerate(scene_names):
                    if target == sname or (sname and (target in sname or sname in target)):
                        idx = si
                        break
            if idx < 0:
                idx = self._match_scene_index(matched_title, 场景档案数据)
            if idx < 0 and scene_names:
                scene_match_text = 分镜序列文本
                if 摘要:
                    scene_match_text = scene_match_text + "\n" + 摘要
                scene_text_matches = self._find_keyframe_indices(scene_match_text, scene_names)
                if scene_text_matches:
                    idx = scene_text_matches[0]
            场景描述 = ""
            if idx >= 0 and isinstance(场景档案数据, list) and idx < len(场景档案数据) and 场景档案数据[idx] is not None:
                场景描述 = str(场景档案数据[idx])

            角色索引 = ",".join(str(i) for i in char_indices) if 角色开关 else ""
            道具索引 = ",".join(str(i) for i in prop_indices) if 道具开关 else ""
            场景索引 = (str(idx) if idx >= 0 else "") if 场景开关 else ""
            关键帧索引 = ",".join(str(i) for i in keyframe_indices) if 关键帧开关 else ""

            subjects = []
            subject_counter = 1
            for desc in 角色描述列表:
                subjects.append(('char', desc, subject_counter, None))
                subject_counter += 1
            for desc in 道具描述列表:
                subjects.append(('prop', desc, subject_counter, None))
                subject_counter += 1
            if 场景描述:
                subjects.append(('scene', 场景描述, subject_counter, None))
                subject_counter += 1
            for desc in 关键帧描述列表:
                subjects.append(('keyframe', desc, subject_counter, None))
                subject_counter += 1

            pic_counter = 1
            for i, (stype, desc, snum, _) in enumerate(subjects):
                if stype == 'keyframe':
                    subjects[i] = (stype, desc, snum, pic_counter)
                    pic_counter += 1
            for i, (stype, desc, snum, pnum) in enumerate(subjects):
                if stype in ('char', 'prop') and pnum is None:
                    subjects[i] = (stype, desc, snum, pic_counter)
                    pic_counter += 1

            主体定义 = self._build_subject_definitions(subjects)
            retention_text = self._build_retention_text(subjects)
            subject_ref_lines = self._build_subject_ref_list(subjects)
            if subjects:
                角色道具场景 = subject_ref_lines + "\nretention_analysis:\n" + retention_text + "\n"
            else:
                角色道具场景 = ""

            索引时长 = self._type_duration_seconds(matched_type)
            if 索引时长 is None:
                索引时长 = self._max_duration_seconds(分镜序列文本)

        if 情节开关 and 情节条目 is not None and str(情节条目.get("情节") or "").strip():
            分镜序列整合 = str(情节条目.get("情节"))
        else:
            强制禁止BGM = self._detect_forced_no_bgm(data, 分镜序列条目)
            分镜序列整合 = self._build_detailed_description(主体定义, 摘要, retention_text, 整体风格, 运镜, 环境音, BGM, matched_type, BGM开关, 自定义段落, 强制禁止BGM)

        场景判断 = False
        if found_shot and isinstance(分镜序列数据, list):
            next_title = ""
            next_found = False
            for item in 分镜序列数据:
                if isinstance(item, dict) and item.get("编号") == 索引 + 1:
                    next_title = str(item.get("标题", ""))
                    next_found = True
                    break
            if next_found:
                curr_prefix = self._extract_scene_prefix(matched_title)
                next_prefix = self._extract_scene_prefix(next_title)
                if curr_prefix and next_prefix and curr_prefix == next_prefix:
                    场景判断 = True

        return {
            "result": [整体风格, 档案, 档案编码, 角色道具场景, 分镜序列整合, 关键帧索引, 角色索引, 道具索引, 场景索引, 索引时长, 场景判断]
        }
