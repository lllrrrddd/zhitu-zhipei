"""Public posting refresh and evidence ranking boundaries."""

import asyncio
from datetime import UTC, datetime

import httpx
import pytest
from app.api.career import find_matches
from app.schemas.job_market import CareerProfile, MarketJob, MarketSnapshot, SourceSnapshot
from app.services import job_market_catalog, job_market_match, job_market_sources
from app.services.job_market_sources import _smart_jobs, _yili_jobs
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


def test_browse_market_jobs_paginates_filters_and_preserves_original_links(client, tmp_path, monkeypatch):
    monkeypatch.setattr(job_market_catalog, "_cache_file", lambda: tmp_path / "jobs.json")
    jobs = [_job(str(index), f"云平台运维工程师 {index}") for index in range(21)]
    snapshot = MarketSnapshot(sources={
        "tencent": SourceSnapshot(
            attempted_at=datetime.now(UTC), checked_at=datetime.now(UTC),
            status="updated", jobs=jobs,
        )
    })
    job_market_catalog._write_market(snapshot)

    first = client.get("/api/career/market/jobs")
    assert first.status_code == 200
    assert first.json()["total"] == 21
    assert len(first.json()["items"]) == 20
    assert first.json()["items"][0]["job"]["url"].startswith(
        "https://careers.tencent.com/jobdesc.html?postId="
    )
    second = client.get("/api/career/market/jobs?page=2")
    assert len(second.json()["items"]) == 1
    filtered = client.get("/api/career/market/jobs?q=%E8%BF%90%E7%BB%B4&source_id=tencent")
    assert filtered.json()["total"] == 21
    assert client.get("/api/career/market/jobs?source_id=unknown").status_code == 422

    snapshot.sources["tencent"].status = "failed"
    job_market_catalog._write_market(snapshot)
    cached = client.get("/api/career/market/jobs")
    assert cached.json()["total"] == 21
    assert cached.json()["items"][0]["current"] is False
    assert client.get("/api/career/market/jobs?current_only=true").json()["total"] == 0


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


def test_new_employer_feed_keeps_only_verified_early_career_details():
    board = "NielsenIQ"
    base = f"https://api.smartrecruiters.com/v1/companies/{board}/postings"
    rows = [
        {"id": "101", "name": "Analyst, Data Modeling", "experienceLevel": {"id": "entry_level"}},
        {"id": "102", "name": "Senior Analyst", "experienceLevel": {"id": "mid_senior_level"}},
        {"id": "103", "name": "Analyst, Data Modeling", "experienceLevel": {"id": "entry_level"}},
    ]

    def respond(request: httpx.Request) -> httpx.Response:
        if str(request.url).startswith(base + "?"):
            return httpx.Response(200, json={"content": rows, "totalFound": 3})
        job_id = request.url.path.rsplit("/", 1)[-1]
        board_name = "OtherCompany" if job_id == "103" else board
        return httpx.Response(200, json={
            "id": job_id,
            "name": "Analyst, Data Modeling",
            "company": {"identifier": board_name},
            "location": {"country": "cn", "city": "Shanghai"},
            "postingUrl": f"https://jobs.smartrecruiters.com/{board}/{job_id}-analyst",
            "experienceLevel": {"id": "entry_level"},
            "jobAd": {"sections": {
                "qualifications": {"text": "Bachelor's degree in data science and SQL"},
                "jobDescription": {"text": "Analyze data"},
            }},
        })

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            return await _smart_jobs(client, "nielsen_iq")

    jobs, partial = asyncio.run(run())
    assert [job.id for job in jobs] == ["nielsen_iq-101"]
    assert jobs[0].company == "尼尔森IQ"
    assert partial is True
    assert job_market_catalog.posting_identity(jobs[0].url) == ("nielsen_iq", jobs[0].id)


def test_english_official_titles_match_chinese_directions_without_cross_domain(monkeypatch):
    async def no_embeddings(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(job_market_match, "semantic_scores", no_embeddings)
    now = datetime.now(UTC)
    jobs = [
        MarketJob(id=f"nielsen_iq-{index}", source_id="nielsen_iq", company="尼尔森IQ",
                  title=title, family=title, cities=["上海"], kind="full_time",
                  url=f"https://jobs.smartrecruiters.com/NielsenIQ/{index}-{index}",
                  requirements="SQL and research", responsibilities="Analyze data")
        for index, title in enumerate((
            "Analyst, Data Modeling", "Chemical Engineer", "Automation Engineer",
            "AI Engineer · 强化学习", "Manufacturing Safety Engineer",
        ), 1)
    ]
    jobs.extend([
        MarketJob(id="nielsen_iq-materials", source_id="nielsen_iq", company="尼尔森IQ",
                  title="Materials Analyst", family="Materials Analyst", cities=["上海"],
                  kind="full_time", url="https://jobs.smartrecruiters.com/NielsenIQ/8-materials",
                  requirements="Chemistry degree", responsibilities="Analyze materials"),
        MarketJob(id="nielsen_iq-optics", source_id="nielsen_iq", company="尼尔森IQ",
                  title="Materials Optical Design", family="Materials Optical Design",
                  cities=["上海"], kind="full_time",
                  url="https://jobs.smartrecruiters.com/NielsenIQ/9-optics",
                  requirements="Optical engineering degree", responsibilities="Design lenses"),
    ])
    snapshot = MarketSnapshot(sources={"nielsen_iq": SourceSnapshot(
        attempted_at=now, checked_at=now, status="updated", jobs=jobs,
    )})

    async def titles(direction: str) -> list[str]:
        result = await job_market_match.match_market(CareerProfile(direction=direction), snapshot)
        return [match.job.title for match in result.matches]

    assert asyncio.run(titles("数据分析师")) == ["Analyst, Data Modeling"]
    assert asyncio.run(titles("应用化学")) == ["Chemical Engineer", "Materials Analyst"]
    assert asyncio.run(titles("自动化工程师")) == ["Automation Engineer"]


def test_fresh_graduates_are_not_treated_as_experienced_candidates():
    assert not job_market_match._requires_experience(
        "Fresh or 1 year of working experience in consumer research"
    )
    assert job_market_match._requires_experience("Over 3 years of technical experience")
    assert job_market_match._requires_experience(
        "Fresh or 1 year of experience in research; minimum 5 years of management experience"
    )


def test_yili_campus_feed_checks_expiry_detail_and_direct_link(monkeypatch):
    from datetime import date

    monkeypatch.setattr(job_market_sources, "_china_today", lambda: date(2026, 11, 7))
    token = "a" * 32
    title = "伊利2027届校招-研发培训生（乳品）"
    rows = [
        {"postId": 123, "postName": title, "endDate": "2027-06-30", "workYears": "无经验"},
        {"postId": 456, "postName": "伊利2027届校招-研发培训生（过期）", "endDate": "2026-11-06"},
    ]

    def respond(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("gotoPostListForAjax"):
            html = (
                f"/wt/yili/web/json/position/list?operational={token} "
                f"/wt/yili/web/json/position/detail?operational={token}"
            )
            return httpx.Response(200, text=html)
        if path.endswith("/position/list"):
            assert request.url.params["recruitType"] == "1"
            return httpx.Response(200, json={"postList": rows, "pageCount": 1})
        if path.endswith("/position/detail"):
            assert request.url.params["postId"] == "123"
            return httpx.Response(200, json={"postInfo": {
                "postId": 123, "recruitType": 1, "postName": title,
                "endDate": "2027-06-30", "publishDate": "2026-11-07",
                "workPlace": "呼和浩特市", "serviceCondition": "2027届硕士及以上，食品科学专业",
                "workConcet": "负责乳品研发",
            }})
        assert path.endswith("/viewPositionInfoN1")
        assert request.url.params["postId"] == "123"
        return httpx.Response(200, text=f"<h1>{title}</h1>")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            return await _yili_jobs(client)

    jobs, partial = asyncio.run(run())
    assert not partial
    assert len(jobs) == 1
    assert jobs[0].kind == "campus"
    assert jobs[0].source_id == "yili"
    assert job_market_catalog.posting_identity(jobs[0].url) == ("yili", jobs[0].id)
    assert job_market_catalog.posting_identity(
        jobs[0].url.replace("yili.hotjob.cn", "yili.hotjob.cn.evil.test")
    ) is None

    now = datetime.now(UTC)
    snapshot = MarketSnapshot(sources={"yili": SourceSnapshot(
        attempted_at=now, checked_at=now, status="updated", jobs=jobs,
    )})
    monkeypatch.setattr(job_market_match, "semantic_scores", lambda *_args: asyncio.sleep(0, result={}))
    eligible = asyncio.run(job_market_match.match_market(
        CareerProfile(direction="食品研发", graduation_year=2027), snapshot
    ))
    wrong_year = asyncio.run(job_market_match.match_market(
        CareerProfile(direction="食品研发", graduation_year=2026), snapshot
    ))
    assert len(eligible.matches) == 1
    assert "experience_check" not in eligible.matches[0].eligibility_notes
    assert wrong_year.matches == []
