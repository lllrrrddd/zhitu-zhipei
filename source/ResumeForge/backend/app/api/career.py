# SPDX-License-Identifier: Apache-2.0
"""Public posting discovery and resume-based job search."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.job_market import (
    CareerMatches,
    CareerMaterialRequest,
    CareerMaterialResult,
    CareerProfile,
    MarketSummary,
    PostingCheck,
    PostingCheckRequest,
)
from ..services.career_material_check import inspect_material
from ..services.job_market_catalog import (
    check_posting,
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


@router.post("/market/refresh", response_model=MarketSummary)
async def refresh_postings(force: bool = False) -> MarketSummary:
    return summarize_market(await refresh_market(force=force))


@router.post("/match", response_model=CareerMatches)
async def find_matches(profile: CareerProfile) -> CareerMatches:
    if not (profile.direction or profile.major or profile.skills or profile.experience):
        raise HTTPException(status_code=422, detail="请补充专业、想找的岗位或技能，再查找岗位。")
    return await match_market(profile, await refresh_market())


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
        raise HTTPException(status_code=502, detail="图片文字识别失败，请换清晰图片重试") from exc
