"""引号/台词保护掩码：在解析时保护引号内和 <d>...</d> 台词标签内的内容不被切分。"""

import re

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
