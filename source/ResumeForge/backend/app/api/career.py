# SPDX-License-Identifier: Apache-2.0
"""Public posting discovery and resume-based job search."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.job_market import (
    CareerDiagnosis,
    CareerDiagnosisRequest,
    CareerMatches,
    CareerMaterialRequest,
    CareerMaterialResult,
    CareerProfile,
    MarketBrowse,
    MarketBrowseItem,
    MarketSummary,
    PostingCheck,
    PostingCheckRequest,
)
from ..services.career_diagnosis import diagnose
from ..services.career_material_check import inspect_material
from ..services.job_market_catalog import (
    check_posting,
    is_current,
    read_market,
    refresh_market,
    summarize_market,
)
from ..services.job_market_match import match_market
from ..services.llm.base import LLMError
from .interview_shared import _require_provider

router = APIRouter(prefix="/api/career", tags=["career"])


@router.get("/market", response_model=MarketSummary)
def market_summary() -> MarketSummary:
    return summarize_market(read_market())


@router.get("/market/jobs", response_model=MarketBrowse)
def browse_market_jobs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    q: str = Query(default="", max_length=100),
    source_id: str = Query(default="", max_length=40),
    current_only: bool = False,
) -> MarketBrowse:
    snapshot = read_market()
    market = summarize_market(snapshot)
    if source_id and source_id not in {source.id for source in market.sources}:
        raise HTTPException(status_code=422, detail="未知招聘来源。")
    needle = q.strip().casefold()
    items = [
        MarketBrowseItem(
            job=job,
            source_name=source.name,
            checked_at=state.checked_at,
            current=source.current,
        )
        for source in market.sources
        if not source_id or source.id == source_id
        for state in [snapshot.sources.get(source.id)]
        if state is not None and (not current_only or is_current(state))
        for job in state.jobs
        if not needle or needle in " ".join(
            (job.title, job.company, job.family, *job.cities)
        ).casefold()
    ]
    items.sort(key=lambda item: (
        item.job.listed_date.isoformat() if item.job.listed_date else "",
        item.checked_at.isoformat() if item.checked_at else "",
        item.job.id,
    ), reverse=True)
    start = (page - 1) * page_size
    return MarketBrowse(
        market=market, items=items[start:start + page_size], total=len(items),
        page=page, page_size=page_size,
    )


@router.post("/market/refresh", response_model=MarketSummary)
async def refresh_postings(force: bool = False) -> MarketSummary:
    return summarize_market(await refresh_market(force=force))


@router.post("/match", response_model=CareerMatches)
async def find_matches(profile: CareerProfile) -> CareerMatches:
    if not profile.direction:
        raise HTTPException(status_code=422, detail="未确认目标岗位方向。")
    return await match_market(profile, await refresh_market())


@router.post("/diagnose", response_model=CareerDiagnosis)
def diagnose_resume(payload: CareerDiagnosisRequest) -> CareerDiagnosis:
    """岗位定向诊断：关键词覆盖、成果量化、行动力、材料完整四项，纯规则可复算。"""
    return diagnose(payload.profile, payload.job)


@router.post("/check", response_model=PostingCheck)
async def verify_posting(payload: PostingCheckRequest) -> PostingCheck:
    return await check_posting(payload.url)


@router.post("/material/check", response_model=CareerMaterialResult)
async def check_material(payload: CareerMaterialRequest, db: Session = Depends(get_db)):
    try:
        return await inspect_material(payload, lambda: _require_provider(db)[0])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail="图片文字识别失败。") from exc
