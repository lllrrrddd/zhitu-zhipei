# SPDX-License-Identifier: Apache-2.0
"""Rank public jobs using confirmed resume facts and optional local semantic similarity."""

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime

from pypinyin import lazy_pinyin

from ..schemas.graduate import JobDegreeFloor
from ..schemas.job_market import (
    CareerMatches,
    CareerProfile,
    MarketJob,
    MarketSnapshot,
    MatchedJob,
    MatchGap,
    ScorePart,
)
from .job_market_catalog import is_current, summarize_market
from .job_market_embeddings import semantic_scores

_DEGREES = {"unknown": 0, "bachelor": 1, "master": 2, "doctor": 3}
_DEGREE_LABELS = {"本科": "bachelor", "学士": "bachelor", "硕士": "master", "博士": "doctor"}
_EXPLICIT_DEGREE = re.compile(r"(本科|学士|硕士|博士)(?:研究生)?\s*(?:及|或)以上")
_EXPLICIT_YEAR = re.compile(r"(?:限|仅限|面向|招聘对象[：: ]*)\s*(20\d{2})\s*届")
_EXPERIENCE = re.compile(
    r"(?:至少|不少于)\s*\d+\s*年.{0,14}经验|\d+\s*年(?:及)?以上.{0,18}经验"
    r"|\b\d+\s*\+?\s*years?\s+(?:of\s+)?(?:.{0,35})experience"
    r"|\b(?:at least|minimum)\s+\d+\s+years?\b",
    re.I,
)
_PREFERENCE = re.compile(r"优先|preferred|desirable|a plus", re.I)
_GENERIC_SKILLS = {"python", "sql", "excel", "linux", "git", "office", "英语"}
_CHEMISTRY_HINTS = (
    "应用化学",
    "化学工程",
    "化学分析",
    "化学类",
    "物理化学",
    "电化学",
    "化工技术",
    "化工研发",
    "chemistry",
    "chemical",
    "chemist",
)
_MATERIAL_TITLE_HINTS = ("材料", "电池", "高分子", "material", "materials", "battery", "polymer")
_FOOD_HINTS = ("食品", "乳品", "营养", "food science", "food technology", "nutrition")

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
    ),
    (
        "数据科学",
        "数据分析",
        "数据挖掘",
        "data science",
        "data scientist",
        "data analyst",
        "data analytics",
        "data modeling",
        "consumer insights",
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
        "material",
        "materials",
    ),
    _CHEMISTRY_HINTS,
    (
        "工艺",
        "仿真",
        "机械",
        "制造",
        "热设计",
        "暖通",
        "液压",
    ),
    ("自动化", "automation", "智能制造", "控制工程", "机电", "robotics", "机器人", "plc"),
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
    (
        "食品",
        "食品科学",
        "食品研发",
        "食品工程",
        "食品安全",
        "food science",
        "food safety",
        "food technology",
        "baking",
    ),
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


def _requires_experience(requirements: str) -> bool:
    for match in _EXPERIENCE.finditer(requirements):
        preceding = requirements[max(0, match.start() - 25) : match.start()]
        if re.match(r"1\s*year", match.group(), re.I) and re.search(
            r"fresh\s+(?:graduates?\s+)?or\s*$", preceding, re.I
        ):
            continue
        return True
    return False


def _city_key(city: str) -> str:
    return "".join(lazy_pinyin(_normalize(city).removesuffix("市"))).replace(" ", "")


@dataclass(frozen=True)
class _Candidate:
    match: MatchedJob
    score: float


# 分数口径：四项加权（权重合计 100），再按经验门槛扣分。权重固定、不随结果变化，
# 因此同一个画像 + 同一个岗位在任何时候都能算出同一个分数。
_SCORE_WEIGHTS = {"direction": 40, "skills": 30, "city": 10, "entry": 20}
# 岗位明确要求工作经验时额外扣分：毕业生投这类岗位的"匹配度"不应看起来和应届岗一样高。
_EXPERIENCE_PENALTY = 20


def _entry_value(job: MarketJob, experience_required: bool) -> int:
    """入职门槛友好度：校招/管培 100，社招但未写明经验 85，要求经验 0。"""
    if experience_required:
        return 0
    return 100 if job.kind in ("campus", "trainee") else 85


def _score(
    *,
    exact_title: bool,
    direction_match: bool,
    specific: list[str],
    matched: list[str],
    city_match: bool,
    entry: int,
    experience_required: bool,
) -> tuple[int, list[ScorePart]]:
    direction = 100 if exact_title else (85 if direction_match else 0)
    if specific:
        skills = round(min(len(specific), 3) / 3 * 100)
    elif matched:
        # 只命中 Python/SQL 这类通用工具时不给满分：它几乎出现在每份简历里。
        skills = 40
    else:
        skills = 0
    parts = [
        ScorePart(key="direction", value=direction, weight=_SCORE_WEIGHTS["direction"]),
        ScorePart(key="skills", value=skills, weight=_SCORE_WEIGHTS["skills"]),
        ScorePart(key="city", value=100 if city_match else 0, weight=_SCORE_WEIGHTS["city"]),
        ScorePart(key="entry", value=entry, weight=_SCORE_WEIGHTS["entry"]),
    ]
    weighted = sum(part.value * part.weight for part in parts) / 100
    total = weighted - (_EXPERIENCE_PENALTY if experience_required else 0)
    return max(0, min(100, round(total))), parts


def _gaps(
    *,
    floor: JobDegreeFloor,
    profile: CareerProfile,
    notes: list[str],
    check_skills: list[str],
    city_match: bool,
    evidence: str,
) -> list[MatchGap]:
    """把"为什么不是满分"拆成可读的条目，供界面逐条展示。"""
    gaps: list[MatchGap] = []
    if "degree_unspecified" in notes:
        gaps.append(MatchGap(key="degree_unspecified"))
    if "degree_unconfirmed" in notes:
        gaps.append(MatchGap(key="degree_unconfirmed"))
    if "experience_check" in notes:
        gaps.append(MatchGap(key="experience_required"))
    if "graduation_check" in notes:
        gaps.append(MatchGap(key="graduation_check"))
    if check_skills:
        gaps.append(MatchGap(key="missing_skills", values=check_skills[:5]))
    if not city_match:
        gaps.append(MatchGap(key="city_mismatch", values=list(profile.cities[:3])))
    if not evidence:
        # 只有方向/技能名称对得上，简历里找不到对应原文——这类"可能合适"最需要人核对。
        gaps.append(MatchGap(key="no_evidence"))
    return gaps


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
    if job.kind == "campus":
        years.update(re.findall(r"(?<!\d)(20\d{2})届校招", job.title))
    if profile.graduation_year and len(years) == 1 and str(profile.graduation_year) not in years:
        return None

    title = _normalize(job.title)
    text = _normalize(f"{job.title}\n{job.requirements}\n{job.responsibilities}")
    wanted = [part.strip() for part in re.split(r"[，,、/；;]", profile.direction) if part.strip()]
    exact_title = any(_has(title, term) for term in wanted)
    job_directions = _domains(title)
    related_materials = (
        any(_has(_normalize(profile.direction), term) for term in _CHEMISTRY_HINTS)
        and any(_has(title, term) for term in _MATERIAL_TITLE_HINTS)
        and any(_has(_normalize(job.requirements), term) for term in _CHEMISTRY_HINTS)
    )
    related_food = (
        job.source_id == "yili"
        and any(_has(_normalize(profile.direction), term) for term in _FOOD_HINTS)
        and _has(title, "研发")
        and any(_has(_normalize(job.requirements), term) for term in _FOOD_HINTS)
    )
    direction_match = (
        exact_title or bool(directions & job_directions) or related_materials or related_food
    )
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
        (
            job.experience_requirement
            and not re.search(r"不限|无要求|无经验", job.experience_requirement)
        )
        or _requires_experience(job.requirements)
        or re.search(r"\b(?:senior|sr\.?|manager|director)\b|高级|资深|主管", job.title, re.I)
    )
    if experience_required:
        notes.append("experience_check")

    strong = direction_match and bool(specific or len(matched) >= 2) and not experience_required
    total, parts = _score(
        exact_title=exact_title,
        direction_match=direction_match,
        specific=specific,
        matched=matched,
        city_match=city_match,
        entry=_entry_value(job, experience_required),
        experience_required=experience_required,
    )
    missing = sorted(req_skills - confirmed_skills)[:5]
    gaps = _gaps(
        floor=floor,
        profile=profile,
        notes=notes,
        check_skills=missing,
        city_match=city_match,
        evidence=evidence,
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
            check_skills=missing,
            score=total,
            score_parts=parts,
            gaps=gaps,
        ),
        # 排序沿用原来的相对分：它在"硬门槛优先"之后才参与比较，改动它会影响
        # 既有的排序断言；对外的 0–100 分只负责解释，不改变结果顺序的语义。
        score=total,
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
    for item in shortlist:
        similarity = semantic.get(item.match.job.id)
        if similarity is not None:
            item.match.relatedness = max(0, min(100, round(similarity * 100)))
    shortlist.sort(
        key=lambda item: (
            item.match.current,
            item.score + 30 * semantic.get(item.match.job.id, 0),
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
