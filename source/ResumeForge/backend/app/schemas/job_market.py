# SPDX-License-Identifier: Apache-2.0
"""Contracts for public job discovery and local resume matching."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from .graduate import JobDegreeFloor

SourceId = Literal[
    "huawei",
    "tencent",
    "bosch",
    "syngenta",
    "lesaffre",
    "avery_dennison",
    "nielsen_iq",
    "eurofins",
    "vitol",
    "yili",
]
SourceStatus = Literal["idle", "updated", "partial", "failed"]
Skill = Annotated[str, Field(min_length=1, max_length=80)]
City = Annotated[str, Field(min_length=1, max_length=40)]
Excerpt = Annotated[str, Field(min_length=1, max_length=600)]


class MarketJob(BaseModel):
    id: str
    source_id: SourceId
    company: str
    title: str
    family: str
    cities: list[str]
    kind: Literal["campus", "trainee", "full_time"]
    url: str = Field(pattern=r"^https://[^\s]+$", max_length=512)
    listed_date: date | None = None
    requirements: str
    responsibilities: str
    experience_requirement: str = ""


class SourceSnapshot(BaseModel):
    attempted_at: datetime
    checked_at: datetime | None = None
    status: SourceStatus
    jobs: list[MarketJob] = Field(default_factory=list)


class MarketSnapshot(BaseModel):
    sources: dict[SourceId, SourceSnapshot] = Field(default_factory=dict)


class MarketSourceInfo(BaseModel):
    id: SourceId
    name: str
    url: str
    status: SourceStatus
    checked_at: datetime | None = None
    count: int
    current: bool


class MarketSummary(BaseModel):
    sources: list[MarketSourceInfo]
    count: int
    current_count: int


class MarketBrowseItem(BaseModel):
    job: MarketJob
    source_name: str
    checked_at: datetime | None
    current: bool


class MarketBrowse(BaseModel):
    market: MarketSummary
    items: list[MarketBrowseItem]
    total: int
    page: int
    page_size: int


class CareerProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    degree: JobDegreeFloor = "unknown"
    graduation_year: int | None = Field(default=None, ge=1980, le=2100)
    major: str = Field(default="", max_length=120)
    direction: str = Field(default="", max_length=160)
    cities: list[City] = Field(default_factory=list, max_length=10)
    skills: list[Skill] = Field(default_factory=list, max_length=40)
    experience: list[Excerpt] = Field(default_factory=list, max_length=12)


class ScorePart(BaseModel):
    """匹配分的一个组成项：界面直接画成横条，用户能看出分数从哪来。"""

    key: Literal["direction", "skills", "city", "entry"]
    value: int = Field(ge=0, le=100)
    weight: int = Field(ge=0, le=100)


class MatchGap(BaseModel):
    """差距/待核实项。

    ``key`` 交给前端做文案映射，``values`` 只带具体名词（缺哪几项能力、岗位要求什么学历），
    不在后端拼中文句子——多语言文案由界面负责。
    """

    key: Literal[
        "degree_unspecified",
        "degree_unconfirmed",
        "experience_required",
        "missing_skills",
        "city_mismatch",
        "no_evidence",
        "graduation_check",
    ]
    values: list[str] = Field(default_factory=list)


class SkillState(BaseModel):
    """岗位要求里的一项技能，相对"这份画像"处于什么状态。

    - ``found``：技能栏里已经写了（匹配分算它的分）。
    - ``mentioned``：技能栏没写，但**经历描述里提到过**——最划算的一档，写进技能栏分数就涨。
    - ``missing``：简历里完全没提，要么补经历，要么确认这份岗位不需要它。

    与 ``check_skills`` 的区别：``check_skills`` 只给"没命中的那几个"（历史契约，界面上
    是一句"缺技能"），这里给**全量三态**并按 found→mentioned→missing 排序，界面据此
    分组显示、并允许一键把 mentioned 的写进技能栏。
    """

    term: str
    state: Literal["found", "mentioned", "missing"]


class MatchedJob(BaseModel):
    job: MarketJob
    checked_at: datetime
    current: bool
    fit: Literal["strong", "possible"]
    matched_skills: list[str]
    evidence: str
    direction_match: bool
    city_match: bool
    degree_floor: JobDegreeFloor
    eligibility_notes: list[
        Literal["degree_unspecified", "degree_unconfirmed", "graduation_check", "experience_check"]
    ]
    check_skills: list[str]
    # 岗位要求技能的**全量三态**（上限 12 条，见 SkillState）。空列表 = 旧后端或该岗位
    # 的任职要求里没有可识别的技能词，前端此时退回只显示 check_skills 那一句。
    skill_states: list[SkillState] = Field(default_factory=list)
    # 规则匹配度：0–100，只由下面四项组成，权重固定，可复算。不是录取概率。
    score: int = Field(default=0, ge=0, le=100)
    score_parts: list[ScorePart] = Field(default_factory=list)
    gaps: list[MatchGap] = Field(default_factory=list)
    # 本地向量模型的语义相近度（0–100）。只在入选名单上计算，用于同分排序；
    # 不参与 score，避免"同一个分数在不同条目上口径不同"。没有模型时为 null。
    relatedness: int | None = Field(default=None, ge=0, le=100)


class CareerMatches(BaseModel):
    market: MarketSummary
    matches: list[MatchedJob]
    relevant_count: int
    method: Literal["semantic", "rules"]


class CareerDiagnosisPart(BaseModel):
    """诊断分的一个组成项，界面上画成横条。"""

    key: Literal["keyword", "quantified", "action", "readiness"]
    value: int = Field(ge=0, le=100)
    weight: int = Field(ge=0, le=100)


class CareerDiagnosisTerm(BaseModel):
    """岗位关键词与简历里的覆盖状态。

    ``found`` 技能清单里就有；``mentioned`` 只写在经历描述里（容易被筛掉，
    但转述成技能栏就能补上）；``missing`` 完全没提。
    """

    term: str
    state: Literal["found", "mentioned", "missing"]


class CareerDiagnosisIssue(BaseModel):
    key: Literal[
        "missing_keyword",
        "mentioned_only",
        "no_numbers",
        "weak_verb",
        "no_experience",
        "few_skills",
    ]
    values: list[str] = Field(default_factory=list)
    # 指回用户自己填的原文，界面直接展示，不生成"改好的句子"。
    excerpt: str = ""


class CareerDiagnosis(BaseModel):
    score: int = Field(ge=0, le=100)
    parts: list[CareerDiagnosisPart]
    coverage: float = Field(ge=0, le=1)
    terms: list[CareerDiagnosisTerm] = Field(default_factory=list)
    issues: list[CareerDiagnosisIssue] = Field(default_factory=list)
    job_title: str
    company: str


class CareerDiagnosisRequest(BaseModel):
    profile: CareerProfile
    job: MarketJob


class PostingCheckRequest(BaseModel):
    url: str = Field(min_length=1, max_length=600)


class PostingCheck(BaseModel):
    status: Literal["found", "cached", "not_found", "unsupported"]
    checked_at: datetime | None = None
    jobs: list[MarketJob] = Field(default_factory=list)


class CareerMaterialFile(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    mime_type: str = Field(default="", max_length=100)
    data: str = Field(min_length=20, max_length=3_000_000)


class CareerExpectedField(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    value: str = Field(min_length=1, max_length=120)


class CareerMaterialRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file: CareerMaterialFile
    expected: list[CareerExpectedField] = Field(default_factory=list, max_length=8)
    allow_ocr: bool = False


class CareerMaterialFinding(BaseModel):
    label: str
    value: str
    status: Literal["text_found", "needs_review"]
    excerpt: str = ""


class CareerMaterialResult(BaseModel):
    name: str
    method: Literal["document_text", "image_ocr", "mixed"]
    text: str
    warnings: list[str]
    findings: list[CareerMaterialFinding]
