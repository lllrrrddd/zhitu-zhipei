# SPDX-License-Identifier: Apache-2.0
"""Structured, bounded input for the graduate job-fit prototype."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Degree = Literal["bachelor", "master", "doctor"]
JobDegreeFloor = Literal["unknown", "bachelor", "master", "doctor"]
ApplicationStatus = Literal["unknown", "past_reported_deadline", "verified_closed"]


class GraduateProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=80)
    degree: Degree
    graduation_year: int = Field(ge=2020, le=2100)
    major: str = Field(min_length=1, max_length=120)
    target_cities: list[str] = Field(default_factory=list, max_length=20)
    evidence: dict[str, str] = Field(default_factory=dict)

    @field_validator("evidence")
    @classmethod
    def evidence_is_bounded(cls, value: dict[str, str]) -> dict[str, str]:
        if len(value) > 50 or any(
            not skill.strip() or len(skill) > 80 or not excerpt.strip() or len(excerpt) > 1000
            for skill, excerpt in value.items()
        ):
            raise ValueError("能力证据最多 50 条，每条名称和依据须在长度限制内")
        return value


class GraduateJob(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=40)
    company: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=120)
    city: str = Field(min_length=1, max_length=80)
    degree_floor: JobDegreeFloor
    degree_exception: bool = False
    graduation_year: int | None = Field(default=None, ge=2020, le=2100)
    preferred_majors: list[str] = Field(default_factory=list, max_length=30)
    core_skills: list[str] = Field(default_factory=list, max_length=40)
    preferred_skills: list[str] = Field(default_factory=list, max_length=40)
    source_url: str = Field(min_length=1, max_length=500, pattern=r"^https://[^\s]+$")
    source_checked_at: date | None = None
    detail_source_url: str | None = Field(default=None, max_length=500, pattern=r"^https://[^\s]+$")
    posted_date: str | None = Field(default=None, max_length=32)
    application_status: ApplicationStatus = "unknown"


class GraduateRankRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile: GraduateProfile
    jobs: list[GraduateJob] = Field(min_length=1, max_length=50)

    @field_validator("jobs")
    @classmethod
    def job_ids_are_unique(cls, jobs: list[GraduateJob]) -> list[GraduateJob]:
        if len({job.id for job in jobs}) != len(jobs):
            raise ValueError("岗位编号不能重复")
        return jobs


class GraduateDraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=20, max_length=20000)


class GraduateJobDraft(BaseModel):
    company: str = ""
    title: str = ""
    city: str = ""
    degree_floor: JobDegreeFloor = "unknown"
    graduation_year: int | None = None
    preferred_majors: list[str] = Field(default_factory=list)
    core_skills: list[str] = Field(default_factory=list)
    source_url: str = ""
    application_status: ApplicationStatus = "unknown"
    source_fragments: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
