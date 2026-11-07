# SPDX-License-Identifier: Apache-2.0
"""个人资料文本的行、标题和字段起始规范化。"""

import re
from functools import lru_cache

from .entry_constants import _BULLET_RE, _EMAIL_RE, _NUMBERED_HEADING_RE, _PHONE_RE
from .line_dedupe import _dedupe_repeated_lines
from .section_constants import _RESET_SECTION_ALIASES, _SECTION_ALIASES


def _normalize_lines(text: str) -> list[str]:
    # 仅归一化全角拉丁字母/数字和不可见空白，保留中文标点的原始语义。
    normalized_chars: list[str] = []
    for char in text:
        codepoint = ord(char)
        if char == "\u3000":
            normalized_chars.append(" ")
        elif (
            0xFF10 <= codepoint <= 0xFF19
            or 0xFF21 <= codepoint <= 0xFF3A
            or 0xFF41 <= codepoint <= 0xFF5A
        ):
            normalized_chars.append(chr(codepoint - 0xFEE0))
        else:
            normalized_chars.append(char)
    normalized = "".join(normalized_chars)
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = normalized.replace("\u00a0", " ").replace("\u200b", "")
    normalized = normalized.replace("\u2028", "\n").replace("\u2029", "\n")
    lines: list[str] = []
    previous_blank = False
    for raw_line in normalized.split("\n"):
        line = raw_line.strip()
        if not line:
            if lines and not previous_blank:
                lines.append("")
            previous_blank = True
            continue
        lines.append(line)
        previous_blank = False
    while lines and lines[-1] == "":
        lines.pop()
    # PDF/Word 文本层会把同一行导出 2–4 遍；先收敛再分区，否则重复行会变成
    # 重复的教育条目与技能（见 line_dedupe 模块说明）。
    return _dedupe_repeated_lines(lines)


def _clean_line(line: str) -> str:
    return _BULLET_RE.sub("", line.lstrip("# ")).strip()


# 正文起点：简历前面被塞进整篇网页文章、封面说明或聊天记录时，这些文字会被当成
# "技能/项目"解析。判据要求**同时**满足：第一个分区标题之前有 800 字以上、
# 至少两段 40 字以上的长句、且完全没有电话/邮箱/"姓名"。真实简历的表头无论怎么
# 排都带联系方式，因此不会命中。
_PREFIX_MIN_CHARS = 800
_PREFIX_MIN_PROSE_LINES = 2
_PREFIX_PROSE_LINE_CHARS = 40


def _trim_non_resume_prefix(text: str) -> tuple[str, int]:
    """返回 (可能被裁剪的文本, 跳过的字符数)。"""
    lines = text.splitlines()
    first_heading = next(
        (index for index, line in enumerate(lines) if line.strip() and _heading_key(line)),
        None,
    )
    if first_heading is None or first_heading < 4:
        return text, 0
    prefix = "\n".join(lines[:first_heading])
    if len(prefix) < _PREFIX_MIN_CHARS:
        return text, 0
    if _PHONE_RE.search(prefix) or _EMAIL_RE.search(prefix) or "姓名" in prefix:
        return text, 0
    prose = sum(
        1 for line in lines[:first_heading] if len(line.strip()) >= _PREFIX_PROSE_LINE_CHARS
    )
    if prose < _PREFIX_MIN_PROSE_LINES:
        return text, 0
    return "\n".join(lines[first_heading:]), len(prefix)


def _compact_heading(value: str) -> str:
    """统一标题的编号、括号和中英文空白，容纳不同模板的复制结果。"""
    candidate = _NUMBERED_HEADING_RE.sub("", value.strip())
    candidate = candidate.rstrip("：:").strip()
    # 常见模板会在中文标题后附 ``(Education)`` 或 ``/ English``。
    english_section_words = (
        r"education(?:\s+(?:background|and\s+training))?|"
        r"(?:work|professional|campus|leadership|internship|extracurricular)\s+experience|"
        r"(?:work|professional|employment)\s+history|"
        r"projects?(?:\s+(?:and|&)\s+practice|\s+experience)?|"
        r"portfolio\s+projects?|"
        r"(?:technical\s+)?(?:skills?|expertise|proficiencies?)|"
        r"skills?\s+(?:and|&)\s+certifications|"
        r"programming\s+languages|tools\s+(?:and|&)\s+technologies|"
        r"awards?|honors?|certificates?|certifications?|summary|profile|"
        # 裸的 `Experience` / `Practice`：`工作经历 Experience`、`项目实践 Practice` 这类
        # 中文在前、英文只有一个词的写法，上面那些"work experience"组合都覆盖不到。
        r"experiences?|practices?"
    )
    candidate = re.sub(
        rf"\s*[（(](?:{english_section_words})[）)]\s*$", "", candidate, flags=re.IGNORECASE
    )
    candidate = re.sub(
        rf"\s*(?:/|｜|\|)\s*(?:{english_section_words})\s*$", "", candidate, flags=re.IGNORECASE
    )
    candidate = re.sub(
        rf"^(?:{english_section_words})\s*(?:/|｜|\|)\s*", "", candidate, flags=re.IGNORECASE
    )
    # 双语标题最省事的写法是**空格直接拼**（`教育经历 Education`、`Work Experience
    # 工作经历`）：英文那头既没有括号也没有斜线，上面三条规则都吃不到，整行 compact 之后
    # 变成 `教育经历education`，对不上任何别名 → 这行不算标题，它的内容被并进上一个分区
    # （用户实测：双语模板下 `Microsoft / Software Engineer` 同时进了教育和工作经历）。
    candidate = re.sub(rf"\s+(?:{english_section_words})\s*$", "", candidate, flags=re.IGNORECASE)
    candidate = re.sub(rf"^(?:{english_section_words})\s+", "", candidate, flags=re.IGNORECASE)
    return re.sub(r"[\s（）()【】\[\]·•_-]", "", candidate).casefold()


_COMPACT_SECTION_ALIASES = {
    key: {_compact_heading(alias) for alias in aliases} for key, aliases in _SECTION_ALIASES.items()
}
_COMPACT_RESET_ALIASES = {_compact_heading(alias) for alias in _RESET_SECTION_ALIASES}

# 这些标签在项目条目里几乎总是"字段名：值"的明细行（`技术栈：Java 17、Spring Boot`），
# 而不是新的分区标题。当成标题会把后面整段项目描述灌进技能区——实测一条简历因此产出
# 200 条"技能"，并全部进入岗位匹配的技能命中。只有标签单独成行时才认作分区标题。
_DETAIL_LABEL_HEADS = {
    "技术栈",
    "技术方案",
    "技术选型",
    "开发环境",
    "主要工作",
    "负责部分",
}


def _heading_parts(line: str) -> tuple[str | None, str]:
    clean = _clean_line(line)
    # 问答式简历常以问题句替代传统分区标题。
    if re.fullmatch(r".{0,12}(?:工作|实习)经历[？?]", clean):
        return "experiences", ""
    if re.fullmatch(r"大学是怎么度过的[？?]", clean):
        return "campus_experiences", ""
    if re.fullmatch(r".{0,12}哪些职业技能[？?]", clean):
        return "skills", ""
    if re.fullmatch(r".{0,12}如何评价自己[？?]", clean):
        return "summary", ""
    # 先尝试完整标题；随后处理“技能：Python、SQL”这种标题和内容同在一行。
    compact = _compact_heading(clean)
    for key, aliases in _COMPACT_SECTION_ALIASES.items():
        if compact in aliases:
            return key, ""

    numbered_removed = _NUMBERED_HEADING_RE.sub("", clean, count=1)
    # 带编号的（`四、技术栈：…`）是分区标题；项目条目里的 `技术栈：…` 没有编号，
    # 属于明细行。
    numbered = numbered_removed != clean
    for separator in ("：", ":"):
        if separator not in numbered_removed:
            continue
        heading, content = numbered_removed.split(separator, 1)
        heading_compact = _compact_heading(heading)
        if not numbered and heading_compact in _DETAIL_LABEL_HEADS and content.strip():
            continue
        for key, aliases in _COMPACT_SECTION_ALIASES.items():
            if heading_compact in aliases:
                return key, content.strip()
    # “教育背景 / Education” 和 “Projects - 项目经历” 等模板用横线连接
    # 中英文标题；只有两侧都能映射到同一分区时才接受，避免误切普通正文。
    for separator in ("/", "／", "|", "｜", "-", "—", "–"):
        if separator not in numbered_removed:
            continue
        left, right = (part.strip() for part in numbered_removed.split(separator, 1))
        left_key = next(
            (
                key
                for key, aliases in _COMPACT_SECTION_ALIASES.items()
                if _compact_heading(left) in aliases
            ),
            None,
        )
        right_key = next(
            (
                key
                for key, aliases in _COMPACT_SECTION_ALIASES.items()
                if _compact_heading(right) in aliases
            ),
            None,
        )
        if left_key and right_key and left_key == right_key:
            return left_key, ""
    return None, ""


def _heading_key(line: str) -> str | None:
    return _heading_parts(line)[0]


@lru_cache(maxsize=64)
def _field_start_pattern(labels: tuple[str, ...]) -> re.Pattern[str]:
    """缓存字段起始匹配器，粘贴大段文本时避免逐行重复编译。"""
    alternatives = "|".join(re.escape(label) for label in sorted(labels, key=len, reverse=True))
    return re.compile(rf"^(?:{alternatives})(?:\s*[:：]|\s+)", re.IGNORECASE)


def _starts_with_field(line: str, labels: tuple[str, ...]) -> bool:
    return bool(_field_start_pattern(labels).match(_clean_line(line)))
