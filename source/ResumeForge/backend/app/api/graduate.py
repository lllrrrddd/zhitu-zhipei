# SPDX-License-Identifier: Apache-2.0
"""Graduate job-fit prototype: structured demo facts and deterministic ranking."""

import json
from pathlib import Path

from fastapi import APIRouter

from ..schemas.graduate import GraduateDraftRequest, GraduateJobDraft, GraduateRankRequest
from ..services.graduate_job_draft import parse_graduate_job_draft
from ..services.graduate_recommendation_rules import recommend

router = APIRouter(prefix="/api/graduate", tags=["graduate"])
DEMO_DIR = Path(__file__).resolve().parents[1] / "demo" / "graduate"


@router.get("/demo")
def get_demo() -> dict:
    """Bundled fictional profiles and public job fact summaries; no author labels."""
    job_set = json.loads((DEMO_DIR / "jobs.json").read_text(encoding="utf-8"))
    return {
        "profiles": json.loads((DEMO_DIR / "profiles.json").read_text(encoding="utf-8"))["profiles"],
        "jobs": job_set["jobs"],
        "checked_date": job_set["checked_date"],
        "notice": "画像为虚构资料；岗位开放状态未实时核实，实际投递须查看来源页面。",
    }


@router.get("/official")
def get_official_jobs() -> dict:
    """Fictional profiles paired with verified company recruitment page summaries."""
    job_set = json.loads((DEMO_DIR / "official_jobs.json").read_text(encoding="utf-8"))
    return {
        "profiles": json.loads((DEMO_DIR / "profiles.json").read_text(encoding="utf-8"))["profiles"],
        "jobs": job_set["jobs"],
        "summaries": job_set["summaries"],
        "checked_date": job_set["checked_date"],
        "notice": "画像为虚构资料；岗位链接指向企业官网，是否仍可申请请在官网核对。",
    }


@router.post("/recommend")
def rank_graduate_jobs(payload: GraduateRankRequest) -> dict:
    """Rank supplied confirmed facts without storing the profile or calling a model."""
    return recommend(
        payload.profile.model_dump(), [job.model_dump() for job in payload.jobs]
    )


@router.post("/parse-draft", response_model=GraduateJobDraft)
def draft_from_job_text(payload: GraduateDraftRequest) -> GraduateJobDraft:
    """Return local candidate facts; no model, network request or database write."""
    return parse_graduate_job_draft(payload.text)
