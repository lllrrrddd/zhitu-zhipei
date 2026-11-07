# SPDX-License-Identifier: Apache-2.0
"""岗位定向简历诊断：只做可解释的规则检查，不生成改写文本。

参考同类产品（Resume Matcher 的 JD Match / 关键词三态、国内 HR 常用的
关键词覆盖率与量化成果比例）后取的最小可用集：

* 关键词三态：``found``（技能清单里就有）、``mentioned``（只在经历描述里出现）、
  ``missing``（完全没提）。二态会冤枉"写在项目里但没写进技能栏"的人。
* 四项加权：关键词 40 / 成果量化 25 / 行动力 20 / 材料完整 15。
* 每条问题都带 ``excerpt`` 指回用户自己填的原文，不给"凭空优化后"的句子——
  编造数字和成果是简历工具最危险的功能。

刻意不做的：不判断"能不能过 ATS"（各家 ATS 规则不同，做不到就不说）、
不替用户写句子（改写由用户在自己的话里补事实）。
"""

from __future__ import annotations

import re

from ..schemas.job_market import (
    CareerDiagnosis,
    CareerDiagnosisIssue,
    CareerDiagnosisPart,
    CareerDiagnosisTerm,
    CareerProfile,
    MarketJob,
)

# 关键词权重：这三个分项合计 100。
_WEIGHTS = {"keyword": 40, "quantified": 25, "action": 20, "readiness": 15}

# 从 JD 里额外抓英文技术词（词表没覆盖的工具名），排除过于通用的词。
_ENGLISH_TERM_RE = re.compile(r"(?<![A-Za-z])[A-Za-z][A-Za-z0-9+#./-]{1,19}(?![A-Za-z])")
_TERM_STOPWORDS = {
    "and",
    "or",
    "the",
    "with",
    "for",
    "you",
    "your",
    "will",
    "are",
    "our",
    "team",
    "work",
    "role",
    "job",
    "year",
    "years",
    "plus",
    "etc",
    "http",
    "https",
    "com",
    "cn",
    "www",
    "ability",
    "skills",
    "skill",
    "experience",
    "good",
}
_MAX_TERMS = 12
_MAX_JD_CHARS = 4000

# 量化成果：百分比、金额、量级、倍数、时间缩短。
_NUMBER_RE = re.compile(
    r"\d+(?:\.\d+)?\s*(?:%|％|万|亿|千|w|k|人|次|条|个|项|天|小时|分钟|ms|s|倍)"
    r"|(?:提升|提升至|降低|下降|缩短|增长|提高|减少)\s*\d+"
    r"|\d+\s*(?:→|->|至)\s*\d+",
    re.IGNORECASE,
)
# 强动词：能体现主导与产出；「负责/参与/协助」这类只说明分工，不算。
_STRONG_VERBS = (
    "主导",
    "牵头",
    "设计",
    "搭建",
    "实现",
    "重构",
    "优化",
    "落地",
    "推动",
    "交付",
    "沉淀",
    "定位",
    "排查",
    "改造",
    "迁移",
    "上线",
    "验证",
    "复现",
    "构建",
    "建立",
    "提出",
    "独立完成",
    "自动化",
)
_WEAK_VERBS = ("负责", "参与", "协助", "配合", "帮助", "完成", "从事")
_MAX_EXCERPT = 80


def _profile_text(profile: CareerProfile) -> str:
    return " ".join([*profile.skills, *profile.experience])


def _clip(text: str) -> str:
    value = " ".join(str(text).split())
    return value if len(value) <= _MAX_EXCERPT else value[:_MAX_EXCERPT] + "…"


def _jd_terms(requirements: str, profile: CareerProfile) -> list[str]:
    """从岗位要求里取需要覆盖的关键词。

    先用 ``_SKILL_TERMS`` 词表把中文/英文混写的技能归一，再补上纯英文技术词；
    已经写进技能栏的词排在前面，让用户先看到"我还差什么"。
    """
    from .job_market_match import _mentions, _normalize

    text = _normalize((requirements or "")[:_MAX_JD_CHARS])
    terms = list(_mentions(text))
    haystack = text
    for raw in _ENGLISH_TERM_RE.findall((requirements or "")[:_MAX_JD_CHARS]):
        word = raw.strip(".-/")
        if len(word) < 2 or word.casefold() in _TERM_STOPWORDS:
            continue
        if word.casefold() in {term.casefold() for term in terms}:
            continue
        if not re.search(rf"(?<![A-Za-z]){re.escape(word)}(?![A-Za-z])", haystack, re.I):
            continue
        terms.append(word)
    return terms[:_MAX_TERMS]


def _term_state(term: str, profile: CareerProfile) -> str:
    from .job_market_match import _has, _normalize

    skills_text = _normalize(" ".join(profile.skills))
    experience_text = _normalize(" ".join(profile.experience))
    if _has(skills_text, term):
        return "found"
    if _has(experience_text, term):
        return "mentioned"
    return "missing"


def _quantified_ratio(profile: CareerProfile) -> tuple[float, list[str]]:
    """经历条目里带量化结果的比例，同时返回没有数字的那几条原文。"""
    items = [item for item in profile.experience if str(item).strip()]
    if not items:
        return 0.0, []
    with_numbers = [item for item in items if _NUMBER_RE.search(item)]
    without = [item for item in items if not _NUMBER_RE.search(item)]
    return len(with_numbers) / len(items), without


def _action_ratio(profile: CareerProfile) -> tuple[float, list[str]]:
    """条目开头是否用了强动词；只写「负责……」的条目单独挑出来。"""
    items = [item for item in profile.experience if str(item).strip()]
    if not items:
        return 0.0, []
    weak = [
        item
        for item in items
        if any(item.startswith(verb) for verb in _WEAK_VERBS)
        and not any(verb in item[:12] for verb in _STRONG_VERBS)
    ]
    return 1 - len(weak) / len(items), weak


def diagnose(profile: CareerProfile, job: MarketJob) -> CareerDiagnosis:
    terms = _jd_terms(job.requirements, profile)
    states = [(term, _term_state(term, profile)) for term in terms]
    total = len(states)
    if total:
        covered = sum(
            1.0 if state == "found" else 0.5 if state == "mentioned" else 0.0 for _, state in states
        )
        keyword_value = round(covered / total * 100)
    else:
        keyword_value = 0

    quantified_ratio, no_number_items = _quantified_ratio(profile)
    action_ratio, weak_items = _action_ratio(profile)

    readiness_hits = [
        bool(str(profile.direction).strip()),
        len(profile.skills) >= 5,
        bool(profile.experience),
        bool(str(profile.major).strip()),
    ]
    readiness_value = round(sum(readiness_hits) / len(readiness_hits) * 100)

    parts = [
        CareerDiagnosisPart(key="keyword", value=keyword_value, weight=_WEIGHTS["keyword"]),
        CareerDiagnosisPart(
            key="quantified", value=round(quantified_ratio * 100), weight=_WEIGHTS["quantified"]
        ),
        CareerDiagnosisPart(
            key="action", value=round(action_ratio * 100), weight=_WEIGHTS["action"]
        ),
        CareerDiagnosisPart(key="readiness", value=readiness_value, weight=_WEIGHTS["readiness"]),
    ]
    score = round(sum(part.value * part.weight for part in parts) / 100)

    issues: list[CareerDiagnosisIssue] = []
    missing = [term for term, state in states if state == "missing"]
    mentioned = [term for term, state in states if state == "mentioned"]
    if missing:
        issues.append(
            CareerDiagnosisIssue(
                key="missing_keyword", values=missing[:8], excerpt=_clip(job.requirements)
            )
        )
    if mentioned:
        issues.append(CareerDiagnosisIssue(key="mentioned_only", values=mentioned[:8]))
    for item in no_number_items[:2]:
        issues.append(CareerDiagnosisIssue(key="no_numbers", excerpt=_clip(item)))
    for item in weak_items[:2]:
        issues.append(CareerDiagnosisIssue(key="weak_verb", excerpt=_clip(item)))
    if not profile.experience:
        issues.append(CareerDiagnosisIssue(key="no_experience"))
    if len(profile.skills) < 5:
        issues.append(CareerDiagnosisIssue(key="few_skills", values=[str(len(profile.skills))]))

    return CareerDiagnosis(
        score=max(0, min(100, score)),
        parts=parts,
        coverage=round(keyword_value / 100, 2),
        terms=[
            CareerDiagnosisTerm(term=term, state=state)
            for term, state in states
            if state != "found"
        ],
        issues=issues,
        job_title=job.title,
        company=job.company,
    )
