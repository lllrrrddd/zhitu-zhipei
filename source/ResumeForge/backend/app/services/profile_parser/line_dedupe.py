# SPDX-License-Identifier: Apache-2.0
"""重复行收敛：把 PDF/Word 文本层里的重复副本合成一份。

真实简历里重复很常见：Word 文本框与正文同时存在、艺术字标题被导出两遍、
PDF 文本层把同一段落重复写入。实测样本里出现过

    个人简历个人简历
    个人简历
    个人简历

以及 ``教育背景教育背景`` 后紧跟三行 ``教育背景``。重复行不会被后续解析器当成
噪声——它会原样变成重复的教育条目、重复技能，用户在校对页看到的是"识别了三遍"，
并且同一条经历会因为字段互补关系不同而被拆成两条。

这里只做两件保守的事：

1. 把"同一行的 2–4 份连续副本"折叠成一份（行内自我重复）；
2. 丢掉与紧邻上一条**内容完全相同**（忽略空白差异）的行。

不做跨行去重：同一个项目里两条一模一样的要点、两年同名的课程，都属于真实内容，
删掉就是丢信息。
"""

import re

# 折叠倍数：真实样本里最多见到 4 份连写。
_REPEAT_FACTORS = (4, 3, 2)

# 太短的行不折叠："本科"、"硕士"、"一等奖" 连写两次更可能是真实的两条记录。
_MIN_REPEAT_UNIT = 4


def _repeat_unit(line: str) -> str:
    """返回行内自我重复的最小单元；不是自我重复则返回空串。"""
    compact = re.sub(r"\s+", "", line)
    if len(compact) < _MIN_REPEAT_UNIT * 2:
        return ""
    for factor in _REPEAT_FACTORS:
        if len(compact) % factor:
            continue
        unit = compact[: len(compact) // factor]
        if len(unit) >= _MIN_REPEAT_UNIT and unit * factor == compact:
            return unit
    return ""


def _dedupe_repeated_lines(lines: list[str]) -> list[str]:
    result: list[str] = []
    last_compact = ""
    for line in lines:
        if not line.strip():
            result.append(line)
            # 空行是分区边界：跨区不算重复，避免把两个分区各自的"本科"当成副本。
            last_compact = ""
            continue
        unit = _repeat_unit(line)
        candidate = unit or line
        compact = re.sub(r"\s+", "", candidate)
        if compact == last_compact:
            # 与紧邻上一条完全同文（只差空白）——重复副本，丢弃后一条。
            continue
        result.append(candidate)
        last_compact = compact
    return result
