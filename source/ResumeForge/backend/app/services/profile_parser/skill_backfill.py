# SPDX-License-Identifier: Apache-2.0
"""研究型简历的技能回抽：没有独立"技能"区时，从项目/经历描述里认能力词。

为什么要做：研究生简历常见写法是把能力写在项目里（"使用 HPLC 与电化学工作站完成
检测"、"UE5 NPR 渲染框架搭建"），完全没有"专业技能"这一节。原来的解析只认技能区，
这类画像会抽出 0 条技能，进入岗位匹配时技能项直接拿 0 分——不是简历差，是解析没读到。

两条硬约束：
* **只认词表里的词**（``skill_lexicon``），不做自由切词。宁可少抽，也不要把半句话
  当成技能（前几轮已经吃过"句子碎片进技能栏"的亏）。
* **只在不缺技能时不动手**：本来就有 3 条以上技能的简历，一个字段都不加，避免把
  正常简历的"项目描述"也塞进技能栏。
"""

from __future__ import annotations

from ..skill_lexicon import mentions

# 少于这个数才回抽：正常简历写 3 条以上技能，说明本来就有技能区。
MIN_SKILLS_BEFORE_BACKFILL = 3
# 回抽上限：宁可少给，也别把技能栏变成项目摘要。
MAX_BACKFILLED_SKILLS = 10


def backfill_skills(
    skills: list[dict[str, str]],
    texts: list[str],
) -> list[dict[str, str]]:
    """返回**新增**的技能条目（不含原有的），调用方负责追加并给出告警。"""
    if len(skills) >= MIN_SKILLS_BEFORE_BACKFILL:
        return []
    haystack = " ".join(text for text in texts if text)
    if not haystack.strip():
        return []
    existing = {str(item.get("name", "")).casefold() for item in skills}
    found = mentions(haystack)
    return [{"name": name, "level": ""} for name in found if name.casefold() not in existing][
        :MAX_BACKFILLED_SKILLS
    ]


def entry_texts(*groups: list[dict[str, str]]) -> list[str]:
    """把项目/经历条目里所有可能写能力的字段拼成文本。"""
    pieces: list[str] = []
    for group in groups:
        for item in group:
            for key in (
                "name",
                "role",
                "tech_stack",
                "description",
                "highlights",
                "organization",
                "company",
            ):
                value = str(item.get(key) or "").strip()
                if value:
                    pieces.append(value)
    return pieces
