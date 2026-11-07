# SPDX-License-Identifier: Apache-2.0
"""Rank public jobs using confirmed resume facts and optional local semantic similarity."""

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime

from pypinyin import lazy_pinyin

from ..schemas.graduate import JobDegreeFloor
from ..schemas.job_market import CareerMatches, CareerProfile, MarketJob, MarketSnapshot, MatchedJob
from .job_market_catalog import is_current, summarize_market
from .job_market_embeddings import semantic_scores

_DEGREES = {"unknown": 0, "bachelor": 1, "master": 2, "doctor": 3}
_DEGREE_LABELS = {"本科": "bachelor", "学士": "bachelor", "硕士": "master", "博士": "doctor"}
_EXPLICIT_DEGREE = re.compile(r"(本科|学士|硕士|博士)(?:研究生)?\s*(?:及|或)以上")
_EXPLICIT_YEAR = re.compile(r"(?:限|仅限|面向|招聘对象[：: ]*)\s*(20\d{2})\s*届")
_EXPERIENCE = re.compile(
    r"(?:至少|不少于)\s*\d+\s*年.{0,14}经验|\d+\s*年(?:及)?以上.{0,18}经验"
    r"|\b\d+\s*\+?\s+years?\s+of\s+.{0,35}experience",
    re.I,
)
_PREFERENCE = re.compile(r"优先|preferred|desirable|a plus", re.I)
_GENERIC_SKILLS = {"python", "sql", "excel", "linux", "git", "office", "英语"}

_DIRECTIONS = (
    (
        "人工智能",
        "ai",
        "大模型",
        "机器学习",
        "深度学习",
        "算法",
        "nlp",
        "rag",
        "数据科学",
        "数据分析",
        "数据挖掘",
        "data science",
    ),
    (
        "软件开发",
        "软件工程",
        "计算机",
        "后端",
        "前端",
        "软件设计",
        "software",
        "web开发",
        "系统开发",
    ),
    (
        "运维",
        "云计算",
        "云服务",
        "网络技术",
        "网络运维",
        "基础设施",
        "devops",
        "sre",
        "系统管理",
        "平台交付",
    ),
    ("网络安全", "信息安全", "安全与隐私", "cybersecurity"),
    ("集成电路", "微电子", "芯片", "数字电路", "半导体", "fpga", "硬件", "嵌入式", "电子系统"),
    (
        "材料",
        "电池",
        "高分子",
        "工艺",
        "仿真",
        "机械",
        "制造",
        "热设计",
        "暖通",
        "液压",
        "material",
    ),
    (
        "生物",
        "育种",
        "农业",
        "植物",
        "基因",
        "蛋白",
        "biology",
        "plant",
        "breeding",
        "protein",
        "genomics",
    ),
    ("财务", "财经", "会计", "金融", "审计", "税务", "finance", "accounting", "audit"),
    ("供应链", "采购", "物流", "供应设计", "supply chain", "procurement", "logistics"),
    ("设计师", "用户体验", "工业设计", "交互设计", "ux", "产品设计"),
    ("市场", "销售", "商务", "营销", "客户经理", "产品运营", "marketing", "sales"),
    ("法学", "法务", "律师", "legal"),
    ("食品", "食品科学", "食品研发", "食品工程", "食品安全", "food science"),
)
_SKILL_TERMS: dict[str, tuple[str, ...]] = {
    "Python": ("python",),
    "Java": ("java",),
    "C/C++": ("c++", "c/c++", "c语言"),
    "Go": ("golang", "go语言", "go language"),
    "SQL": ("sql", "mysql", "postgresql"),
    "PyTorch": ("pytorch",),
    "机器学习": ("机器学习", "machine learning"),
    "深度学习": ("深度学习", "deep learning"),
    "大语言模型": ("大语言模型", "大模型", "llm", "large language model"),
    "检索增强生成": ("rag", "检索增强", "retrieval-augmented"),
    "自然语言处理": ("nlp", "自然语言处理", "natural language processing"),
    "多模态": ("多模态", "multimodal"),
    "强化学习": ("强化学习", "reinforcement learning"),
    "计算机视觉": ("计算机视觉", "computer vision", "图像识别"),
    "Linux": ("linux",),
    "Shell": ("shell", "bash"),
    "Docker": ("docker",),
    "Kubernetes": ("kubernetes", "k8s"),
    "Ansible": ("ansible",),
    "监控告警": ("prometheus", "zabbix", "grafana", "监控告警", "observability"),
    "网络协议": ("tcp/ip", "路由协议", "网络协议"),
    "分布式": ("分布式", "distributed systems"),
    "数据库": ("数据库", "database"),
    "Verilog": ("verilog", "systemverilog"),
    "FPGA": ("fpga",),
    "EDA": ("eda", "cadence", "synopsys"),
    "有限元仿真": ("有限元", "ansys", "abaqus", "finite element"),
    "材料表征": ("材料表征", "xrd", "sem", "材料分析", "material characterization"),
    "失效分析": ("失效分析", "failure analysis"),
    "基因编辑": ("基因编辑", "crispr", "gene editing"),
    "测序": ("测序", "sequencing", "ngs"),
    "细胞培养": ("细胞培养", "cell culture"),
    "分子生物学": ("分子生物", "molecular biology"),
    "财务分析": ("财务分析", "financial analysis"),
    "会计": ("会计", "accounting"),
    "审计": ("审计", "audit"),
    "数据分析": ("数据分析", "data analysis", "数据挖掘"),
}


def _normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", value).casefold()


def _has(text: str, term: str) -> bool:
    term = _normalize(term.strip())
    if not term:
        return False
    if term.isascii():
        return re.search(rf"(?<![a-z0-9_]){re.escape(term)}(?![a-z0-9_])", text) is not None
    return term in text


def _domains(text: str) -> set[int]:
    return {
        index for index, words in enumerate(_DIRECTIONS) if any(_has(text, word) for word in words)
    }


def _mentions(text: str) -> set[str]:
    return {
        name
        for name, aliases in _SKILL_TERMS.items()
        if any(_has(text, alias) for alias in aliases)
    }


def _degree_floor(requirements: str) -> JobDegreeFloor:
    floors = {
        _DEGREE_LABELS[match]
        for line in re.split(r"[\n。；;]", requirements)
        if not _PREFERENCE.search(line) and not re.search(r"[、/或]硕士|[、/或]博士", line)
        for match in _EXPLICIT_DEGREE.findall(line)
    }
    if len(floors) == 1:
        return floors.pop()
    return "unknown"


def _city_key(city: str) -> str:
    return "".join(lazy_pinyin(_normalize(city).removesuffix("市"))).replace(" ", "")


@dataclass(frozen=True)
class _Candidate:
    match: MatchedJob
    score: float


def _assess(
    profile: CareerProfile,
    job: MarketJob,
    checked_at: datetime,
    current: bool,
    confirmed_skills: set[str],
    directions: set[int],
    cities: set[str],
) -> _Candidate | None:
    floor = _degree_floor(job.requirements)
    if profile.degree != "unknown" and _DEGREES[profile.degree] < _DEGREES[floor]:
        return None
    years = set(_EXPLICIT_YEAR.findall(job.requirements))
    if profile.graduation_year and len(years) == 1 and str(profile.graduation_year) not in years:
        return None

    title = _normalize(job.title)
    text = _normalize(f"{job.title}\n{job.requirements}\n{job.responsibilities}")
    wanted = [part.strip() for part in re.split(r"[，,、/；;]", profile.direction) if part.strip()]
    exact_title = any(_has(title, term) for term in wanted)
    job_directions = _domains(title)
    direction_match = exact_title or bool(directions & job_directions)
    req_skills = _mentions(_normalize(job.requirements))
    matched = sorted(confirmed_skills & _mentions(text))
    for skill in profile.skills:
        if not _mentions(_normalize(skill)) and len(skill) >= 2 and _has(text, skill):
            matched.append(skill)
    matched = list(dict.fromkeys(matched))
    specific = [skill for skill in matched if _normalize(skill) not in _GENERIC_SKILLS]
    # Skills are supporting evidence, not a substitute for the role the user chose.
    # Otherwise common tooling in a resume can surface a different profession.
    if not direction_match:
        return None

    city_match = bool(cities & {_city_key(city) for city in job.cities})
    evidence = next(
        (
            line
            for line in profile.experience
            if set(matched) & _mentions(_normalize(line))
            or any(_has(_normalize(line), skill) for skill in matched)
        ),
        "",
    )
    notes = []
    if floor == "unknown":
        notes.append("degree_unspecified")
    elif profile.degree == "unknown":
        notes.append("degree_unconfirmed")
    if job.kind == "campus":
        notes.append("graduation_check")
    experience_required = bool(
        (job.experience_requirement and not re.search(r"不限|无要求", job.experience_requirement))
        or _EXPERIENCE.search(job.requirements)
    )
    if experience_required:
        notes.append("experience_check")

    strong = direction_match and bool(specific or len(matched) >= 2) and not experience_required
    score = (
        13 * direction_match
        + 6 * exact_title
        + 3 * min(len(specific), 4)
        + min(len(matched), 4)
        + 3 * city_match
        + (2 if job.kind in ("campus", "trainee") else 0)
        - (18 if experience_required else 0)
    )
    return _Candidate(
        match=MatchedJob(
            job=job,
            checked_at=checked_at,
            current=current,
            fit="strong" if strong else "possible",
            matched_skills=matched[:6],
            evidence=evidence,
            direction_match=direction_match,
            city_match=city_match,
            degree_floor=floor,
            eligibility_notes=notes,
            check_skills=sorted(req_skills - confirmed_skills)[:5],
        ),
        score=score,
    )


async def match_market(profile: CareerProfile, snapshot: MarketSnapshot) -> CareerMatches:
    profile_text = _normalize("\n".join([*profile.skills, *profile.experience]))
    confirmed_skills = _mentions(profile_text)
    directions = _domains(_normalize(profile.direction))
    cities = {_city_key(city) for city in profile.cities}
    candidates: list[_Candidate] = []
    for source in snapshot.sources.values():
        if source.checked_at is None:
            continue
        current = is_current(source)
        for job in source.jobs:
            candidate = _assess(
                profile, job, source.checked_at, current, confirmed_skills, directions, cities
            )
            if candidate is not None:
                candidates.append(candidate)

    candidates.sort(key=lambda item: (item.match.current, item.score), reverse=True)
    shortlist_size = 14
    shortlist = candidates[:shortlist_size]
    semantic = await semantic_scores(profile, [item.match.job for item in shortlist])
    shortlist.sort(
        key=lambda item: (
            item.match.current,
            item.score + 9 * semantic.get(item.match.job.id, 0),
        ),
        reverse=True,
    )
    # Keep different job families visible when one posting publishes many separate directions.
    matches: list[MatchedJob] = []
    family_counts: dict[tuple[str, str], int] = {}
    for candidate in [*shortlist, *candidates[shortlist_size:]]:
        match = candidate.match
        family = (match.job.company, match.job.family)
        if family_counts.get(family, 0) >= 2:
            continue
        matches.append(match)
        family_counts[family] = family_counts.get(family, 0) + 1
        if len(matches) == 8:
            break
    return CareerMatches(
        market=summarize_market(snapshot),
        matches=matches,
        relevant_count=len(candidates),
        method="semantic" if semantic else "rules",
    )
