"""中英文混排名称的拆分与清洗。

勤鸟导出的资料里，中文名后面常常直接跟着英文名，例如：

- 课种：「瑜伽拉伸与声音共振 Yogic Stretch & Sound Resonance」
- 教室：「谈天说地 3 Connection 3」
- 教练：「Lisa Tang 汤双双」
- 卡产品：「健康评估Assessment」「合一文化节门票 At One Festival」

本系统的资料表（课种 / 教室 / 教练 / 卡产品）都有 name 与 name_en 两个字段，
这里把中英文拆开：中文写进 name，英文写进 name_en，界面与导出就不再中英文混排。
拆分只做「分家」，不改动文字内容本身，原文仍可在历史数据里追溯。
"""

import re

# 中文（含扩展 A 区与兼容汉字）
CJK_PATTERN = re.compile(r"[㐀-䶿一-鿿豈-﫿]")
# 拉丁字母：数字与中文标点不算英文，避免「1:1私教」「10节1:1私教课」被误拆。
LATIN_PATTERN = re.compile(r"[A-Za-z]")
# 英文名首尾的装饰性符号，拆分后统一去掉。
EN_TRIM = " \t|｜/／\\-–—_·:：,，.。;；'\"“”‘’()（）[]【】<>《》"
# 中文名首尾的装饰性符号。
NAME_TRIM = " \t-–—·|/\\:：,，;；"
# 混排词里英文部分短于这个长度时，视为中文名的一部分（如「太极FIT」「呼吸Pro」）。
MIN_LATIN_LENGTH = 4


def has_cjk(text: str) -> bool:
    return bool(CJK_PATTERN.search(text or ""))


def has_latin(text: str) -> bool:
    return bool(LATIN_PATTERN.search(text or ""))


def _split_mixed_token(token: str) -> tuple[str, str]:
    """一个词内部中英文混排时拆成（中文部分, 英文部分）。

    只有英文全部集中在词首或词尾、且英文够长（像正名而非缩写）时才拆；
    「太极FIT」「呼吸Pro伸展复原」这类英文只是中文名的一部分，整词保留在中文侧。
    """
    spans = list(LATIN_PATTERN.finditer(token))
    if not spans:
        return token.strip(), ""
    head = token[: spans[0].start()]
    tail = token[spans[-1].end() :]
    latin = token[spans[0].start() : spans[-1].end()].strip()
    if len(latin.replace(" ", "")) < MIN_LATIN_LENGTH:
        return token.strip(), ""
    if has_cjk(head) and not tail:
        # 中文 + 结尾的英文：健康评估Assessment
        return head.strip(), latin
    if has_cjk(tail) and not head.strip():
        # 开头的英文 + 中文：Xman运动康复私教
        return tail.strip(), latin
    return token.strip(), ""


def _balance_brackets(text: str) -> str:
    """去掉首尾符号后如果括号不配对，把右括号补回去（如「Dawu (Great Dance」）。"""
    for opener, closer in (("(", ")"), ("[", "]"), ("（", "）")):
        missing = text.count(opener) - text.count(closer)
        if missing > 0:
            text += closer * missing
    return text


def _token_kind(token: str) -> str:
    if has_latin(token) and has_cjk(token):
        return "mixed"
    if has_latin(token):
        return "latin"
    if has_cjk(token):
        return "cjk"
    return "punct"


def split_bilingual(text: str) -> tuple[str, str]:
    """把中英文混排的名称拆成（中文名, 英文名）。

    - 「瑜伽拉伸与声音共振 Yogic Stretch & Sound Resonance」→「瑜伽拉伸与声音共振」/「Yogic Stretch & Sound Resonance」
    - 「MY BARRE CARDIO 心肺加强」→「心肺加强」/「MY BARRE CARDIO」
    - 「健康评估Assessment」→「健康评估」/「Assessment」
    - 「太极FIT Taichi FIT」→「太极FIT」/「Taichi FIT」（FIT 是中文名的一部分，不拆）
    - 「国庆疗愈季 活力zumba舞蹈」→「国庆疗愈季 活力zumba舞蹈」/「」（英文夹在中文词中间，不拆）
    """
    raw = " ".join(str(text or "").split())
    if not raw:
        return "", ""
    tokens = [token for token in raw.split(" ") if token]
    kinds = [_token_kind(token) for token in tokens]
    name_parts: list[str] = []
    en_parts: list[str] = []
    for index, token in enumerate(tokens):
        kind = kinds[index]
        if kind == "latin":
            en_parts.append(token)
        elif kind == "cjk":
            name_parts.append(token)
        elif kind == "mixed":
            chinese, english = _split_mixed_token(token)
            if chinese:
                name_parts.append(chinese)
            if english:
                en_parts.append(english)
        else:
            # 纯符号（& · + 等）跟随相邻的一侧：挨着英文就进英文名，否则留在中文名里。
            neighbour = ""
            for step in (-1, 1):
                position = index + step
                while 0 <= position < len(kinds):
                    if kinds[position] != "punct":
                        neighbour = kinds[position]
                        break
                    position += step
                if neighbour:
                    break
            (en_parts if neighbour == "latin" else name_parts).append(token)
    if not name_parts:
        # 纯英文名称：整体作为名称，英文名不再重复一份。
        return raw, ""
    name = " ".join(name_parts).strip(NAME_TRIM)
    english = _balance_brackets(" ".join(en_parts).strip(EN_TRIM))
    if not english:
        return name, ""
    return name, english
