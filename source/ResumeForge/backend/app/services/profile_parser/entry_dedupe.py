# SPDX-License-Identifier: Apache-2.0
"""条目去重：把同一段经历被拆成的多条记录合回一条。

文本层重复（见 ``line_dedupe``）之外，教育条目还有第二个来源：同一行被当成两次
条目头、或者字段切分把 ``（211）`` 切进专业名，于是同一所学校出现 3–4 条。用户
在校对页看到"河南工业大学"重复四遍，不知道删哪一条。

这里的合并很克制——**只合并字段互不矛盾的同校记录**：

* 学校名先做归一（去空白、去括号内容），``华南师范大学（211）`` 与
  ``华南师范大学`` 视为同一所；
* 只有两条记录的（专业, 学历）中至少一方为空或相同才合并，避免把同校的本科与
  硕士合成一条；
* 合并时保留信息更全的那条，空字段由另一条补上，绝不覆盖已有值。
"""

import re


def _school_key(value: str) -> str:
    """学校名归一：去空白与 ``（211）`` 之类的标注后再比较。"""
    text = re.sub(r"[（(][^）)]*[）)]", "", str(value or ""))
    return re.sub(r"\s+", "", text).casefold()


def _is_bracket_only(value: str) -> bool:
    stripped = str(value or "").strip()
    return bool(stripped) and bool(re.fullmatch(r"[（(][^）)]*[）)]", stripped))


def _filled(entry: dict[str, str]) -> int:
    return sum(1 for value in entry.values() if str(value or "").strip())


def _merge_education_entries(entries: list[dict[str, str]]) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    for entry in entries:
        school = _school_key(entry.get("school", ""))
        target = None
        if school:
            for existing in merged:
                if _school_key(existing.get("school", "")) != school:
                    continue
                same_major = (
                    not entry.get("major")
                    or not existing.get("major")
                    or entry["major"] == existing["major"]
                    or _is_bracket_only(entry.get("major", ""))
                    or _is_bracket_only(existing.get("major", ""))
                )
                same_degree = (
                    not entry.get("degree")
                    or not existing.get("degree")
                    or entry["degree"] == existing["degree"]
                )
                if same_major and same_degree:
                    target = existing
                    break
        if target is None:
            merged.append(dict(entry))
            continue
        # 更全的那条留下：空字段由另一条补，已有值不覆盖。
        keep, other = (target, entry) if _filled(target) >= _filled(entry) else (entry, target)
        for field, value in other.items():
            if not str(keep.get(field, "")).strip() and str(value or "").strip():
                keep[field] = value
        # 括号碎片（如被切进专业名的 ``(211)``）在能给出真实值时让位。
        if (
            _is_bracket_only(keep.get("major", ""))
            and not _is_bracket_only(other.get("major", ""))
            and str(other.get("major", "")).strip()
        ):
            keep["major"] = other["major"]
        if keep is not target:
            merged[merged.index(target)] = keep
    return merged
