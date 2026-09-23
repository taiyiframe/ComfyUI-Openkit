import re

from ._text_protect import _build_dialogue_protect_mask


SECTION_NAMES = [
    "subject_definitions", "summary", "retention_analysis",
    "detailed_description", "overall_soundscape", "non_diegetic_music", "Negative"
]

SECTIONS_TO_SKIP = {"subject_definitions", "Negative"}


class SubjectRefTagReplacement:
    BELONG_BOUNDARY = '\u3002\uff01\uff1f!?\n\uff1b;\uff0c,'

    @staticmethod
    def _build_belong_pattern(name):
        boundary = SubjectRefTagReplacement.BELONG_BOUNDARY
        return re.compile(
            r'(?:(?<=</d>)|(?<![^\s' + boundary + r']))'
            r'(' + re.escape(name) + r')'
            r'(?:<Audio \d+>)?'
            r'([^\u3002\uff01\uff1f!?\uff1b;\n\r\uff1a:]*?)'
            r'[\uff1a:]\s*'
            r'(?=<d>)'
        )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "角色道具场景": ("STRING", {
                    "forceInput": True,
                    "multiline": True,
                    "tooltip": "接入 JSON提取节点的「角色道具场景」输出。每行 <Subject N>：名称，描述… 取第一个逗号前的名称作为查找对象，在分镜序列中替换为对应的 <Subject N> 标记。"
                }),
                "分镜序列": ("STRING", {
                    "forceInput": True,
                    "multiline": True,
                    "tooltip": "接入 JSON提取节点的「分镜序列」输出。文本中出现的角色/道具/场景名称将被替换为对应的 <Subject N> 标记（最长匹配优先），其余内容原样保留。\n"
                               "【段落规则】subject_definitions 定义段和 Negative 负面提示词段不替换；summary、retention_analysis、detailed_description、overall_soundscape 等引用段正常替换。\n"
                               "【台词归属特殊规则】说话者（名称或 <Subject N> 标记）后跟引导句+冒号+<d>台词时（如「沈惊鸿低声说：<d>…</d>」「<Subject 1>刹住脚步，胸口起伏，仰头急道：<d>…</d>」，引导句可含逗号等多动作描述），说话者替换为 <Subject N> 后追加 <Audio M> 音频标记；同一台词有多个候选说话者时（如「甲看向乙，乙说道：」）取离冒号最近者为说话者。\n"
                               "【兜底追溯】标准规则未命中时（说话者被「将/把」等字挡住，如「炽红火光将<Subject 4>…发抖：<d>…</d>」；或承前省略主语「他怒道：」），从冒号往前追溯最近的未保护 <Subject N> 标记或名称作为说话者（引号内/<d>内候选跳过）。\n"
                               "<Audio M> 按说话角色在分镜序列中首次说话的出现顺序编号：第一个说话的角色 <Audio 1>，第二个 <Audio 2>，第三个 <Audio 3>，最多三个。"
                }),
                "台词开关": ("BOOLEAN", {
                    "default": True,
                    "label_on": "保护台词",
                    "label_off": "正常替换",
                    "display_name": "台词保护",
                    "tooltip": "【台词保护】\n开启后，被以下格式包裹的「人物说话内容」中的名称不替换、原文保留：\n"
                               "● 半角双引号 / 单引号：\"...\"  '...'\n"
                               "● 中文弯引号：“...”  ‘...’\n"
                               "● 中文直角引号：「...」 『...』\n"
                               "● 台词标签：<d>...</d>\n"
                               "关闭时，整段文本正常执行名称替换。",
                }),
                "参考音频开关": ("BOOLEAN", {
                    "default": True,
                    "label_on": "输出<Audio M>",
                    "label_off": "输出<Subject N>",
                    "display_name": "参考音频",
                    "tooltip": "【参考音频】\n"
                               "开启后，台词归属特殊规则生效：`说话者+引导句+：<d>台词` 中说话者替换为 `<Subject N><Audio M>`\n"
                               "（如「沈惊鸿低声说：<d>…</d>」→「<Subject 1><Audio 1>低声说：<d>…</d>」），用于关联参考音频。\n"
                               "引导句允许逗号等多动作描述（如「刹住脚步，胸口起伏，仰头急道：」）；同一台词有多个候选说话者时（如「甲看向乙，乙说道：」）取离冒号最近者为说话者。\n"
                               "标准规则未命中时兜底追溯：从冒号往前追溯最近的未保护 <Subject N> 标记或名称作为说话者（说话者被「将/把」等字挡住或承前省略主语时生效，引号内/<d>内候选跳过）。\n"
                               "<Audio M> 按说话角色首次说话的出现顺序编号：第一个说话的角色 <Audio 1>，第二个 <Audio 2>，第三个 <Audio 3>，最多三个。\n"
                               "超过三个时不报错，第4个及以后的说话角色仍正常替换为 <Subject N>，只是不追加 <Audio M> 标记。\n"
                               "关闭后，不追加 <Audio M>，名称走普通替换输出 <Subject N>"
                               "（如「<Subject 1>低声说：<d>…</d>」），音色索引输出为空。",
                }),
                "角色索引": ("STRING", {
                    "forceInput": True,
                    "multiline": True,
                    "tooltip": "接入 JSON提取节点的「角色索引」输出。逗号分隔的数字串，第 N 个数字对应 <Subject N> 的音色索引，\n"
                               "如「0,4,1」：0 对应 <Subject 1>、4 对应 <Subject 2>、1 对应 <Subject 3>。\n"
                               "【音色索引输出】按说话顺序重新排列：只输出实际说话的角色对应的索引，未说话的角色不输出。\n"
                               "如 <Subject 3> 第一个说话、<Subject 2> 第二个说话、<Subject 1> 未说话，则音色索引输出「1,4」。\n"
                               "未连线或为空时，音色索引输出为空（不影响 <Audio M> 标记的追加）。",
                }),
            },
        }

    RETURN_TYPES = ("STRING", "STRING",)
    RETURN_NAMES = ("分镜序列", "音色索引",)
    FUNCTION = "replace_shot_names"
    CATEGORY = "Openkit"
    OUTPUT_NODE = True

    @staticmethod
    def _replace_with_protect(text, find_str, replace_str, mask):
        if not find_str:
            return text
        m = len(find_str)
        n = len(text)
        if m == 0 or m > n:
            return text
        out = []
        i = 0
        while i <= n - m:
            window_protected = False
            for k in range(m):
                if mask[i + k]:
                    window_protected = True
                    break
            if not window_protected and text[i:i + m] == find_str:
                out.append(replace_str)
                i += m
                continue
            out.append(text[i])
            i += 1
        while i < n:
            out.append(text[i])
            i += 1
        return "".join(out)

    @staticmethod
    def _parse_picture_names(text):
        pairs = []
        if not text:
            return pairs
        for line in text.split("\n"):
            m = re.match(r'^\s*<Subject\s+(\d+)>\s*[\uff1a:]\s*(.+?)\s*$', line)
            if not m:
                continue
            desc = m.group(2)
            name = ""
            for sep in ("\uff0c", ","):
                if sep in desc:
                    name = desc.split(sep)[0].strip()
                    break
            if not name:
                name = desc.strip()
            if name:
                pairs.append((name, f"<Subject {m.group(1)}>"))
        return pairs

    @staticmethod
    def _build_protect_mask(text):
        return _build_dialogue_protect_mask(text)

    @staticmethod
    def _parse_voice_indices(text):
        if not text:
            return []
        values = []
        for part in re.split(r'[,\uff0c]', str(text)):
            part = part.strip()
            if part and re.fullmatch(r'-?\d+', part):
                values.append(int(part))
        return values

    @staticmethod
    def _split_by_sections(text):
        pattern = re.compile(r'^(' + '|'.join(SECTION_NAMES) + r')\s*:', re.MULTILINE)
        matches = list(pattern.finditer(text))
        if not matches:
            return [("", text)]
        sections = []
        # 保留第一个标准段落之前的内容（如 JsonExtractor 的顶部自定义段落），不丢弃
        if matches[0].start() > 0:
            sections.append(("__prefix__", text[:matches[0].start()]))
        for i, m in enumerate(matches):
            name = m.group(1)
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            sections.append((name, text[start:end]))
        return sections

    @staticmethod
    def _join_sections(sections):
        return "".join(content for _, content in sections)

    @staticmethod
    def _scan_speaking_order(text, pairs, protect_enabled):
        mask = SubjectRefTagReplacement._build_protect_mask(text) if protect_enabled else None
        forms = []
        for name, tag in pairs:
            forms.append((name, tag))
        for _name, tag in pairs:
            if (tag, tag) not in forms:
                forms.append((tag, tag))

        hits = []
        for form, tag in forms:
            for m in SubjectRefTagReplacement._build_belong_pattern(form).finditer(text):
                if mask is not None:
                    if any(mask[k] for k in range(m.start(1), m.end(1))):
                        continue
                hits.append((m.end(), m.start(1), m.end(1), m.start(2), tag))
        by_target = {}
        for end, s1, e1, s2, tag in hits:
            cur = by_target.get(end)
            if cur is None or (s1, e1) > (cur[1], cur[2]):
                by_target[end] = (end, s1, e1, s2, tag)

        backtrack_pats = [
            (re.compile(re.escape(form) + r'(?:<Audio \d+>)?'), tag)
            for form, tag in forms
        ]
        for m in re.finditer(r'[\uff1a:]\s*(?=<d>)', text):
            target = m.end()
            if target in by_target:
                continue
            best = None
            for pat, tag in backtrack_pats:
                for bm in pat.finditer(text, 0, target):
                    s, e = bm.start(), bm.end()
                    if mask is not None and any(mask[k] for k in range(s, e)):
                        continue
                    if best is None or (s, e) > (best[0], best[1]):
                        best = (s, e, tag)
            if best is not None:
                by_target[target] = (target, best[0], best[1], best[1], best[2])

        winners = sorted(by_target.values(), key=lambda x: x[0])

        audio_by_tag = {}
        speaking_tags = []
        next_num = 1
        for _end, _s1, _e1, _s2, tag in winners:
            if tag not in audio_by_tag:
                if next_num <= 3:
                    audio_by_tag[tag] = f"<Audio {next_num}>"
                    speaking_tags.append(tag)
                    next_num += 1
        return audio_by_tag, speaking_tags, winners

    def replace_shot_names(self, 角色道具场景, 分镜序列, 台词开关, 参考音频开关, 角色索引):
        pairs = self._parse_picture_names(角色道具场景 or "")
        pairs.sort(key=lambda x: -len(x[0]))

        text = 分镜序列 or ""
        音色索引 = ""

        sections = self._split_by_sections(text)

        replaceable_indices = [i for i, (name, _) in enumerate(sections) if name not in SECTIONS_TO_SKIP]

        if 参考音频开关 and replaceable_indices:
            combined = ""
            offsets = {}
            for idx in replaceable_indices:
                name, content = sections[idx]
                offsets[idx] = len(combined)
                combined += content

            audio_by_tag, speaking_tags, winners = self._scan_speaking_order(combined, pairs, 台词开关)

            if speaking_tags:
                indices = self._parse_voice_indices(角色索引)
                if indices:
                    values = []
                    for tag in speaking_tags:
                        m = re.match(r'^<Subject (\d+)>$', tag)
                        if m:
                            n = int(m.group(1))
                            if 1 <= n <= len(indices):
                                values.append(str(indices[n - 1]))
                    音色索引 = ",".join(values)

            new_sections = []
            for idx, (name, content) in enumerate(sections):
                if idx not in replaceable_indices:
                    new_sections.append((name, content))
                    continue

                off = offsets[idx]
                seg_len = len(content)
                seg_winners = [
                    (end - off, s1 - off, e1 - off, s2 - off, tag)
                    for end, s1, e1, s2, tag in winners
                    if off <= s1 < off + seg_len
                ]

                replaced_ranges = []
                for _end, s1, _e1, s2, tag in sorted(seg_winners, key=lambda x: -x[0]):
                    audio = audio_by_tag.get(tag)
                    if audio:
                        if any(s1 < re_ and s2 > rs for rs, re_ in replaced_ranges):
                            continue
                        content = content[:s1] + tag + audio + content[s2:]
                        replaced_ranges.append((s1, s2))

                new_sections.append((name, content))
            sections = new_sections

        final_sections = []
        for idx, (name, content) in enumerate(sections):
            if name in SECTIONS_TO_SKIP:
                final_sections.append((name, content))
                continue

            for name_to_replace, tag in pairs:
                if 台词开关:
                    content = SubjectRefTagReplacement._replace_with_protect(
                        content, name_to_replace, tag,
                        SubjectRefTagReplacement._build_protect_mask(content))
                else:
                    content = content.replace(name_to_replace, tag)

            final_sections.append((name, content))

        result = SubjectRefTagReplacement._join_sections(final_sections)
        return (result, 音色索引)
