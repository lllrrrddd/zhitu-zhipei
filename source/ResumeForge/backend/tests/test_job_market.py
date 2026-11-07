"""Public posting refresh and evidence ranking boundaries."""

import asyncio
from datetime import UTC, datetime

import pytest
from app.api.career import find_matches
from app.schemas.job_market import CareerProfile, MarketJob, MarketSnapshot, SourceSnapshot
from app.services import job_market_catalog, job_market_match
from fastapi import HTTPException


def _job(job_id: str, title: str, *, years: str = "", kind: str = "campus") -> MarketJob:
    return MarketJob(
        id=f"tencent-{job_id}",
        source_id="tencent",
        company="腾讯",
        title=title,
        family=title,
        cities=["深圳"],
        kind=kind,
        url=f"https://careers.tencent.com/jobdesc.html?postId={job_id}",
        requirements="熟悉 Linux、Docker、Kubernetes，具备监控告警经验",
        responsibilities="负责云平台运维和故障排查",
        experience_requirement=years,
    )


def test_refresh_keeps_last_verified_records_when_source_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(job_market_catalog, "_cache_file", lambda: tmp_path / "jobs.json")
    monkeypatch.setattr(
        job_market_catalog,
        "SOURCE_INFO",
        {"tencent": ("腾讯", "https://careers.tencent.com/search.html")},
    )
    job = _job("123", "云平台运维工程师")

    async def good(_client, _source_id):
        return [job], False

    monkeypatch.setattr(job_market_catalog, "fetch_source", good)
    first = asyncio.run(job_market_catalog.refresh_market())
    checked = first.sources["tencent"].checked_at
    assert first.sources["tencent"].jobs == [job]
    assert job_market_catalog.summarize_market(first).current_count == 1

    async def bad(_client, _source_id):
        raise ValueError("feed unavailable")

    monkeypatch.setattr(job_market_catalog, "fetch_source", bad)
    failed = asyncio.run(job_market_catalog._refresh(first, ["tencent"]))
    assert failed.sources["tencent"].checked_at == checked
    assert failed.sources["tencent"].jobs == [job]
    assert failed.sources["tencent"].status == "failed"
    assert job_market_catalog.summarize_market(failed).current_count == 0
    check = asyncio.run(job_market_catalog.check_posting(job.url))
    assert check.status == "cached"


def test_link_check_never_fetches_unknown_urls(monkeypatch):
    async def unexpected(*_args, **_kwargs):
        raise AssertionError("unexpected public feed request")

    monkeypatch.setattr(job_market_catalog, "refresh_market", unexpected)
    assert (
        job_market_catalog.posting_identity(
            "https://careers.tencent.com.evil.test/jobdesc.html?postId=123"
        )
        is None
    )
    assert (
        job_market_catalog.posting_identity(
            "https://evil@careers.tencent.com/jobdesc.html?postId=123"
        )
        is None
    )
    assert (
        asyncio.run(job_market_catalog.check_posting("https://unknown.example/job/1")).status
        == "unsupported"
    )


def test_experience_requirement_cannot_be_marked_strong(monkeypatch):
    async def no_embeddings(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(job_market_match, "semantic_scores", no_embeddings)
    now = datetime.now(UTC)
    snapshot = MarketSnapshot(
        sources={
            "tencent": SourceSnapshot(
                attempted_at=now,
                checked_at=now,
                status="updated",
                jobs=[
                    _job("123", "云平台运维工程师"),
                    _job("456", "高级运维工程师", years="三年以上工作经验", kind="full_time"),
                ],
            )
        }
    )
    profile = CareerProfile(
        degree="master",
        graduation_year=2027,
        direction="运维工程师",
        cities=["深圳"],
        skills=["Linux", "Docker", "Kubernetes"],
    )
    matches = asyncio.run(job_market_match.match_market(profile, snapshot)).matches
    assert len(matches) == 2
    assert matches[0].job.id == "tencent-123"
    assert matches[0].fit == "strong"
    assert matches[1].fit == "possible"
    assert "experience_check" in matches[1].eligibility_notes


def test_skills_alone_do_not_recommend_unrelated_job(monkeypatch):
    async def no_embeddings(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(job_market_match, "semantic_scores", no_embeddings)
    now = datetime.now(UTC)
    snapshot = MarketSnapshot(
        sources={"tencent": SourceSnapshot(
            attempted_at=now, checked_at=now, status="updated",
            jobs=[_job("chip", "芯片设计工程师")],
        )}
    )
    profile = CareerProfile(
        major="食品科学", direction="食品研发", skills=["Linux", "Docker", "Kubernetes"],
    )

    assert asyncio.run(job_market_match.match_market(profile, snapshot)).matches == []


def test_career_api_requires_confirmed_target_role(monkeypatch):
    async def should_not_refresh():
        raise AssertionError("must validate before requesting public job sources")

    monkeypatch.setattr("app.api.career.refresh_market", should_not_refresh)
    with pytest.raises(HTTPException) as error:
        asyncio.run(find_matches(CareerProfile(major="食品科学", skills=["Python"])))
    assert error.value.status_code == 422


def test_related_data_analysis_titles_match_without_identical_wording(monkeypatch):
    async def no_embeddings(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(job_market_match, "semantic_scores", no_embeddings)
    now = datetime.now(UTC)
    snapshot = MarketSnapshot(
        sources={"tencent": SourceSnapshot(
            attempted_at=now, checked_at=now, status="updated",
            jobs=[_job("data", "数据分析岗")],
        )}
    )
    profile = CareerProfile(direction="数据分析师", skills=["SQL"])
    matches = asyncio.run(job_market_match.match_market(profile, snapshot)).matches
    assert len(matches) == 1
