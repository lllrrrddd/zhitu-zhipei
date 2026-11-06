# SPDX-License-Identifier: Apache-2.0
"""Read employer-published job lists and their matching detail records."""

import asyncio
import re
from collections import defaultdict
from collections.abc import Awaitable, Callable
from datetime import date
from html import unescape
from urllib.parse import urlencode, urlsplit

import httpx

from ..schemas.job_market import MarketJob, SourceId

HUAWEI_BOARD = "https://career.huawei.com/cn/campus-recruitment-job-list"
HUAWEI_DETAIL = "https://career.huawei.com/cn/job-details"
HUAWEI_API = "https://apigw-dgg-b0.huawei.com/api/apig/channelhw/recruitmentPosition/pub"
TENCENT_API = "https://careers.tencent.com/tencentcareer/api/post"
TENCENT_DETAIL = "https://careers.tencent.com/jobdesc.html"
SMART_API = "https://api.smartrecruiters.com/v1/companies"
SMART_HOST = "jobs.smartrecruiters.com"
SMART_BOARDS = {"bosch": "BoschGroup", "syngenta": "SyngentaGroup"}

SOURCE_INFO: dict[SourceId, tuple[str, str]] = {
    "huawei": ("华为校招", HUAWEI_BOARD),
    "tencent": ("腾讯招聘 · 运维岗位", "https://careers.tencent.com/search.html"),
    "bosch": ("博世 JMP 管培生", f"https://{SMART_HOST}/BoschGroup"),
    "syngenta": ("先正达集团中国岗位", f"https://{SMART_HOST}/SyngentaGroup"),
}

_HUAWEI_HEADERS = {
    "x-jalor-tenantAlias": "hcm",
    "x-language": "zh_CN",
    "x-Referer": "https://career.huawei.com/cn",
    "Referer": HUAWEI_BOARD,
}
_HUAWEI_FAMILY_LIMITS = {
    "研发类": 16,
    "服务类": 4,
    "供应链类": 4,
    "财经类": 3,
    "销售类": 3,
    "动力保障类": 3,
}
_DETAIL_CONCURRENCY = 4


def _text(value: object, max_chars: int) -> str:
    if not isinstance(value, str):
        return ""
    cleaned = re.sub(r"<(?:script|style)\b.*?</(?:script|style)>", "", value, flags=re.I | re.S)
    cleaned = re.sub(r"<(?:br\s*/?|/p|/div|/li)\s*>", "\n", cleaned, flags=re.I)
    cleaned = unescape(re.sub(r"<[^>]*>", "", cleaned))
    lines = (" ".join(line.split()) for line in cleaned.splitlines())
    text = "\n".join(line for line in lines if line)
    return text if len(text) <= max_chars else text[: max_chars - 1].rstrip() + "…"


def _date(value: object) -> date | None:
    if isinstance(value, str):
        match = re.fullmatch(r"(\d{4})年(\d{1,2})月(\d{1,2})日", value)
        try:
            if match:
                return date(*(int(part) for part in match.groups()))
            return date.fromisoformat(value[:10])
        except ValueError:
            pass
    return None


def _id(value: object) -> str:
    candidate = str(value)
    return candidate if re.fullmatch(r"[0-9]{1,20}", candidate) else ""


def _list(value: object) -> list[dict]:
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise ValueError("Unexpected public job list")
    return value


async def _huawei(client: httpx.AsyncClient, endpoint: str, payload: dict) -> object:
    response = await client.post(
        f"{HUAWEI_API}/{endpoint}",
        params={"X-HW-ID": "app_000000035886"},
        json=payload,
        headers=_HUAWEI_HEADERS,
    )
    response.raise_for_status()
    data = response.json()
    if data.get("status") != "SUCCESS":
        raise ValueError("Huawei job feed did not return success")
    return data["data"]


async def _collect_details(
    rows: list[dict], fetch: Callable[[dict], Awaitable[list[MarketJob]]]
) -> tuple[list[MarketJob], bool]:
    limit = asyncio.Semaphore(_DETAIL_CONCURRENCY)

    async def collect(row: dict) -> list[MarketJob] | None:
        async with limit:
            try:
                return await fetch(row)
            except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
                return None

    batches = await asyncio.gather(*(collect(row) for row in rows))
    jobs = {job.id: job for batch in batches if batch for job in batch}
    if rows and not jobs:
        raise ValueError("No usable job details could be read")
    return list(jobs.values()), any(batch is None for batch in batches)


async def _huawei_jobs(client: httpx.AsyncClient) -> tuple[list[MarketJob], bool]:
    rows: list[dict] = []
    for page in range(1, 4):
        data = await _huawei(
            client, "getJobPage", {"curPage": page, "pageSize": 100, "jobType": "CR"}
        )
        rows.extend(_list(data["result"]))
        total_pages = int(data["pageVO"]["totalPages"])
        if page >= total_pages:
            break
    if not rows and int(data["pageVO"]["totalRows"]) > 0:
        raise ValueError("Huawei job list is incomplete")

    # The parent posting is the stable entry on the public list. Only intentions returned
    # by that posting's job ID supply the location and requirement evidence we display.
    groups: dict[str, list[dict]] = defaultdict(list)
    seen: set[str] = set()
    for row in rows:
        job_id = _id(row.get("jobId"))
        if (
            row.get("scenarioName") != "应届生"
            or not _id(row.get("advertisementId"))
            or not job_id
            or job_id in seen
        ):
            continue
        seen.add(job_id)
        category = str(row.get("categoryName") or "")
        groups[category].append(row)
    chosen = [
        row
        for category, group in groups.items()
        for row in group[: _HUAWEI_FAMILY_LIMITS.get(category, 1)]
    ][:36]

    async def detail(row: dict) -> list[MarketJob]:
        job_id = _id(row["jobId"])
        ad_id = _id(row["advertisementId"])
        family = _text(row.get("jobName"), 120)
        data = await _huawei(client, "getPositionIntentionList", {"jobId": int(job_id)})
        jobs = []
        for item in _list(data):
            intent_id = _id(item.get("positionIntentionId"))
            intent = _text(item.get("positionIntention"), 100)
            requirements = _text(item.get("jobDemand"), 1600)
            if _id(item.get("jobId")) != job_id or not (intent_id and intent and requirements):
                continue
            cities = [
                city.strip()
                for city in _text(item.get("jobPlaceName"), 250).split("/")
                if city.strip()
            ]
            query = urlencode({"advertisementId": ad_id, "positionIntentionId": intent_id})
            jobs.append(
                MarketJob(
                    id=f"huawei-{ad_id}-{intent_id}",
                    source_id="huawei",
                    company="华为",
                    title=family if family == intent else f"{family} · {intent}",
                    family=family,
                    cities=list(dict.fromkeys(cities)),
                    kind="campus",
                    url=f"{HUAWEI_DETAIL}?{query}",
                    listed_date=_date(row.get("lastUpdateDate")),
                    requirements=requirements,
                    responsibilities=_text(item.get("jobResponsibilities"), 850),
                )
            )
        return jobs

    jobs, partial = await _collect_details(chosen, detail)
    return jobs, partial or total_pages > 3


async def _smart_jobs(
    client: httpx.AsyncClient, source_id: SourceId
) -> tuple[list[MarketJob], bool]:
    board = SMART_BOARDS[source_id]
    base = f"{SMART_API}/{board}/postings"
    params = {"country": "cn", "destination": "PUBLIC", "limit": "50"}
    if source_id == "bosch":
        params["q"] = "JMP"
    response = await client.get(base, params=params)
    response.raise_for_status()
    data = response.json()
    rows = _list(data["content"])
    total = int(data["totalFound"])
    if not rows and total > 0:
        raise ValueError("Employer job list is incomplete")
    chosen = [
        row
        for row in rows
        if _id(row.get("id"))
        and (source_id != "bosch" or re.search(r"\bJMP\b", str(row.get("name")), re.I))
    ]

    async def detail(row: dict) -> list[MarketJob]:
        posting_id = _id(row["id"])
        response = await client.get(f"{base}/{posting_id}")
        response.raise_for_status()
        data = response.json()
        company = data["company"]
        location = data["location"]
        url = data["postingUrl"]
        parts = urlsplit(url)
        path = parts.path.strip("/").split("/")
        if (
            _id(data.get("id")) != posting_id
            or company["identifier"].casefold() != board.casefold()
            or location["country"].casefold() != "cn"
            or parts.scheme != "https"
            or parts.netloc != SMART_HOST
            or len(path) != 2
            or path[0].casefold() != board.casefold()
            or path[1].split("-", 1)[0] != posting_id
        ):
            raise ValueError("Employer job detail does not match its public listing")
        sections = data["jobAd"]["sections"]
        title = _text(data["name"], 180)
        city = _text(location.get("city"), 60)
        requirements = _text(sections.get("qualifications", {}).get("text"), 1600)
        if not title or not requirements:
            return []
        return [
            MarketJob(
                id=f"{source_id}-{posting_id}",
                source_id=source_id,
                company="博世" if source_id == "bosch" else "先正达集团",
                title=title,
                family=title,
                cities=[city] if city else [],
                kind="trainee" if source_id == "bosch" else "full_time",
                url=url,
                listed_date=_date(data.get("releasedDate")),
                requirements=requirements,
                responsibilities=_text(sections.get("jobDescription", {}).get("text"), 850),
            )
        ]

    jobs, partial = await _collect_details(chosen, detail)
    return jobs, partial or len(rows) < total


async def _tencent_jobs(client: httpx.AsyncClient) -> tuple[list[MarketJob], bool]:
    response = await client.get(
        f"{TENCENT_API}/Query",
        params={
            "keyword": "运维",
            "pageIndex": 1,
            "pageSize": 30,
            "language": "zh-cn",
            "area": "cn",
        },
    )
    response.raise_for_status()
    result = response.json()
    if result.get("Code") != 200:
        raise ValueError("Tencent job list did not return success")
    rows = _list(result["Data"]["Posts"])
    if not rows and int(result["Data"]["Count"]) > 0:
        raise ValueError("Tencent job list is incomplete")
    chosen = [
        row
        for row in rows
        if _id(row.get("PostId"))
        and row.get("IsValid") is not False
        and re.search(r"运维|\bSRE\b|\bDevOps\b", str(row.get("RecruitPostName")), re.I)
    ][:20]

    async def detail(row: dict) -> list[MarketJob]:
        post_id = _id(row["PostId"])
        response = await client.get(
            f"{TENCENT_API}/ByPostId", params={"postId": post_id, "language": "zh-cn"}
        )
        response.raise_for_status()
        result = response.json()
        data = result["Data"]
        if result.get("Code") != 200 or _id(data.get("PostId")) != post_id:
            raise ValueError("Tencent job detail does not match the public list")
        requirements = _text(data.get("Requirement"), 1600)
        title = _text(data.get("RecruitPostName"), 180)
        city = _text(data.get("LocationName"), 60)
        if not title or not requirements:
            return []
        return [
            MarketJob(
                id=f"tencent-{post_id}",
                source_id="tencent",
                company="腾讯",
                title=title,
                family=title,
                cities=[city] if city else [],
                kind="full_time",
                url=f"{TENCENT_DETAIL}?postId={post_id}",
                listed_date=_date(data.get("LastUpdateTime")),
                requirements=requirements,
                responsibilities=_text(data.get("Responsibility"), 850),
                experience_requirement=_text(data.get("RequireWorkYearsName"), 80),
            )
        ]

    jobs, partial = await _collect_details(chosen, detail)
    return jobs, partial or len(rows) < int(result["Data"]["Count"])


async def fetch_source(
    client: httpx.AsyncClient, source_id: SourceId
) -> tuple[list[MarketJob], bool]:
    if source_id == "huawei":
        return await _huawei_jobs(client)
    if source_id == "tencent":
        return await _tencent_jobs(client)
    return await _smart_jobs(client, source_id)
