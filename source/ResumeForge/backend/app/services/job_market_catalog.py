# SPDX-License-Identifier: Apache-2.0
"""Refresh a shared cache of public postings without retaining any resume data."""

import asyncio
import logging
import os
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import parse_qs, urlsplit

import httpx

from .. import config
from ..schemas.job_market import (
    MarketSnapshot,
    MarketSourceInfo,
    MarketSummary,
    PostingCheck,
    SourceId,
    SourceSnapshot,
)
from .job_market_sources import SMART_BOARDS, SMART_HOST, SOURCE_INFO, YILI_HOST, fetch_source

logger = logging.getLogger(__name__)
_AUTO_INTERVAL = timedelta(minutes=30)
_MANUAL_INTERVAL = timedelta(minutes=1)
_FRESH_FOR = timedelta(minutes=45)
_running: asyncio.Task[MarketSnapshot] | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def _cache_file() -> Path:
    return config.DATA_DIR / "career-job-market.json"


def read_market() -> MarketSnapshot:
    try:
        return MarketSnapshot.model_validate_json(_cache_file().read_bytes())
    except FileNotFoundError:
        return MarketSnapshot()
    except (OSError, ValueError) as exc:
        logger.warning("Public job cache unreadable: %s", type(exc).__name__)
        return MarketSnapshot()


def _write_market(snapshot: MarketSnapshot) -> None:
    path = _cache_file()
    staged = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(dir=path.parent, delete=False) as output:
            staged = Path(output.name)
            output.write(snapshot.model_dump_json().encode("utf-8"))
        os.replace(staged, path)
    finally:
        if staged is not None:
            staged.unlink(missing_ok=True)


def is_current(source: SourceSnapshot) -> bool:
    return (
        source.checked_at is not None
        and source.status in ("updated", "partial")
        and _now() - source.checked_at <= _FRESH_FOR
    )


def summarize_market(snapshot: MarketSnapshot) -> MarketSummary:
    sources = []
    for source_id, (name, url) in SOURCE_INFO.items():
        state = snapshot.sources.get(source_id)
        sources.append(
            MarketSourceInfo(
                id=source_id,
                name=name,
                url=url,
                status=state.status if state else "idle",
                checked_at=state.checked_at if state else None,
                count=len(state.jobs) if state else 0,
                current=is_current(state) if state else False,
            )
        )
    return MarketSummary(
        sources=sources,
        count=sum(source.count for source in sources),
        current_count=sum(source.count for source in sources if source.current),
    )


async def _refresh(snapshot: MarketSnapshot, due: list[SourceId]) -> MarketSnapshot:
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(7, connect=4),
        limits=httpx.Limits(max_connections=12, max_keepalive_connections=8),
        follow_redirects=False,
    ) as client:

        async def refresh_source(source_id: SourceId) -> SourceSnapshot:
            try:
                jobs, partial = await asyncio.wait_for(fetch_source(client, source_id), timeout=35)
            except (
                httpx.HTTPError,
                TimeoutError,
                ValueError,
                KeyError,
                TypeError,
                AttributeError,
            ) as exc:
                logger.warning(
                    "Public job source %s unavailable: %s", source_id, type(exc).__name__
                )
                previous = snapshot.sources.get(source_id)
                return SourceSnapshot(
                    attempted_at=_now(),
                    checked_at=previous.checked_at if previous else None,
                    status="failed",
                    jobs=previous.jobs if previous else [],
                )
            checked = _now()
            return SourceSnapshot(
                attempted_at=checked,
                checked_at=checked,
                status="partial" if partial else "updated",
                jobs=jobs,
            )

        updates = await asyncio.gather(*(refresh_source(source_id) for source_id in due))
    snapshot.sources.update(zip(due, updates, strict=True))
    try:
        _write_market(snapshot)
    except OSError as exc:
        logger.warning("Public job cache could not be written: %s", type(exc).__name__)
    return snapshot


async def refresh_market(*, force: bool = False) -> MarketSnapshot:
    global _running
    if _running is not None and not _running.done():
        return await asyncio.shield(_running)
    snapshot = read_market()
    interval = _MANUAL_INTERVAL if force else _AUTO_INTERVAL
    now = _now()
    due = [
        source_id
        for source_id in SOURCE_INFO
        if source_id not in snapshot.sources
        or now - snapshot.sources[source_id].attempted_at >= interval
    ]
    if not due:
        return snapshot
    _running = asyncio.create_task(_refresh(snapshot, due))
    return await asyncio.shield(_running)


def posting_identity(raw_url: str) -> tuple[SourceId, str] | None:
    """Identify supported URLs. The supplied URL itself is never requested."""
    try:
        url = urlsplit(raw_url.strip())
        if url.scheme != "https":
            return None
        if url.netloc == "career.huawei.com" and url.path == "/cn/job-details":
            query = parse_qs(url.query, max_num_fields=20)
            ad_id = query.get("advertisementId", [""])[0]
            intent = query.get("positionIntentionId", [""])[0]
            if re.fullmatch(r"\d{1,20}", ad_id) and (
                not intent or re.fullmatch(r"\d{1,20}", intent)
            ):
                return "huawei", f"huawei-{ad_id}-{intent}"
        if url.netloc == "careers.tencent.com" and url.path == "/jobdesc.html":
            post_id = parse_qs(url.query, max_num_fields=20).get("postId", [""])[0]
            if re.fullmatch(r"\d{1,20}", post_id):
                return "tencent", f"tencent-{post_id}"
        if url.netloc == YILI_HOST and url.path == "/wt/yili/web/mobMobileWebsite/index/viewPositionInfoN1":
            query = parse_qs(url.query, max_num_fields=20)
            post_id = query.get("postId", [""])[0]
            recruit_type = query.get("recruitType", [""])[0]
            if re.fullmatch(r"\d{1,20}", post_id) and recruit_type == "1":
                return "yili", f"yili-{post_id}"
        if url.netloc == SMART_HOST:
            parts = url.path.strip("/").split("/")
            if len(parts) == 2:
                posting_id = parts[1].split("-", 1)[0]
                for source_id, board in SMART_BOARDS.items():
                    if board.casefold() == parts[0].casefold() and re.fullmatch(
                        r"\d{1,20}", posting_id
                    ):
                        return source_id, f"{source_id}-{posting_id}"
    except ValueError:
        return None
    return None


async def check_posting(url: str) -> PostingCheck:
    identity = posting_identity(url)
    if identity is None:
        return PostingCheck(status="unsupported")
    source_id, job_id = identity
    snapshot = await refresh_market()
    state = snapshot.sources.get(source_id)
    if state is None:
        return PostingCheck(status="not_found")
    jobs = [
        job
        for job in state.jobs
        if job.id == job_id or (job_id.endswith("-") and job.id.startswith(job_id))
    ]
    status = ("found" if is_current(state) else "cached") if jobs else "not_found"
    return PostingCheck(status=status, checked_at=state.checked_at, jobs=jobs[:6])
