# SPDX-License-Identifier: Apache-2.0
"""Contracts for public job discovery and local resume matching."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from .graduate import JobDegreeFloor

SourceId = Literal["huawei", "tencent", "bosch", "syngenta"]
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


class CareerProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    degree: JobDegreeFloor = "unknown"
    graduation_year: int | None = Field(default=None, ge=1980, le=2100)
    major: str = Field(default="", max_length=120)
    direction: str = Field(default="", max_length=160)
    cities: list[City] = Field(default_factory=list, max_length=10)
    skills: list[Skill] = Field(default_factory=list, max_length=40)
    experience: list[Excerpt] = Field(default_factory=list, max_length=12)


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


class CareerMatches(BaseModel):
    market: MarketSummary
    matches: list[MatchedJob]
    relevant_count: int
    method: Literal["semantic", "rules"]


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
