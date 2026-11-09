# SPDX-License-Identifier: Apache-2.0
"""规则匹配分与差距清单的契约测试。

分数必须可解释、可复算：权重固定为 方向 40 / 技能 30 / 城市 10 / 入职门槛 20，
要求工作经验的岗位另扣 20 分；同一画像 + 同一岗位两次计算结果必须相同。
"""

import asyncio
from datetime import UTC, datetime

import pytest
from app.schemas.job_market import CareerProfile, MarketJob, MarketSnapshot, SourceSnapshot
from app.services import job_market_match


def _job(
    job_id: str,
    title: str,
    *,
    requirements: str = "熟悉 Linux、Docker、Kubernetes。",
    cities: list[str] | None = None,
    kind: str = "campus",
) -> MarketJob:
    return MarketJob(
        id=f"tencent-{job_id}",
        source_id="tencent",
        company="测试公司",
        title=title,
        family=title,
        cities=cities or ["深圳"],
        kind=kind,
        url=f"https://careers.tencent.com/jobdesc.html?postId={job_id}",
        requirements=requirements,
        responsibilities="负责平台稳定性建设。",
    )


def _snapshot(*jobs: MarketJob) -> MarketSnapshot:
    now = datetime.now(UTC)
    return MarketSnapshot(
        sources={
            "tencent": SourceSnapshot(
                attempted_at=now, checked_at=now, status="updated", jobs=list(jobs)
            )
        }
    )


@pytest.fixture(autouse=True)
def _no_embeddings(monkeypatch):
    async def empty(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(job_market_match, "semantic_scores", empty)


PROFILE = CareerProfile(
    degree="master",
    graduation_year=2027,
    direction="运维工程师",
    cities=["深圳"],
    skills=["Linux", "Docker", "Kubernetes"],
    experience=["负责校内系统容器化改造，使用 Kubernetes 部署并接入监控"],
)


def test_score_is_breakdown_of_four_parts():
    matches = asyncio.run(
        job_market_match.match_market(PROFILE, _snapshot(_job("1", "云平台运维工程师")))
    ).matches
    match = matches[0]
    assert [part.key for part in match.score_parts] == ["direction", "skills", "city", "entry"]
    assert sum(part.weight for part in match.score_parts) == 100
    assert all(0 <= part.value <= 100 for part in match.score_parts)
    assert 0 <= match.score <= 100
    # 全项满分时应当接近 100：方向对、技能全中、城市对、校招门槛友好。
    assert match.score >= 90
    assert not [gap for gap in match.gaps if gap.key == "no_evidence"]


def test_experience_requirement_lowers_score_and_adds_gap():
    fresh, senior = asyncio.run(
        job_market_match.match_market(
            PROFILE,
            _snapshot(
                _job("2", "云平台运维工程师"),
                _job(
                    "3",
                    "高级运维工程师",
                    requirements="三年以上工作经验，熟悉 Linux、Docker、Kubernetes。",
                    kind="full_time",
                ),
            ),
        )
    ).matches
    assert fresh.score > senior.score
    assert [gap.key for gap in senior.gaps if gap.key == "experience_required"]
    entry = next(part for part in senior.score_parts if part.key == "entry")
    assert entry.value == 0


def test_missing_skills_and_city_are_reported_as_gaps():
    matches = asyncio.run(
        job_market_match.match_market(
            PROFILE,
            _snapshot(
                _job(
                    "4",
                    "平台运维工程师",
                    requirements="熟悉 Linux、Ansible、Prometheus。",
                    cities=["上海"],
                )
            ),
        )
    ).matches
    assert matches, "方向相同的岗位不应被硬门槛过滤"
    gaps = {gap.key for gap in matches[0].gaps}
    assert "city_mismatch" in gaps
    assert "missing_skills" in gaps


def test_score_is_reproducible():
    snapshot = _snapshot(_job("5", "云平台运维工程师"))
    first = asyncio.run(job_market_match.match_market(PROFILE, snapshot)).matches[0]
    second = asyncio.run(job_market_match.match_market(PROFILE, snapshot)).matches[0]
    assert first.score == second.score
    assert [(part.key, part.value) for part in first.score_parts] == [
        (part.key, part.value) for part in second.score_parts
    ]


def test_skill_states_split_found_mentioned_and_missing():
    """岗位要求技能要全量三态可读：已具备 / 只在经历里提到 / 完全没提。"""
    profile = CareerProfile(
        degree="master",
        graduation_year=2027,
        direction="运维工程师",
        cities=["深圳"],
        skills=["Linux"],
        experience=["负责校内系统容器化改造，使用 Docker 部署并接入监控"],
    )
    match = asyncio.run(
        job_market_match.match_market(
            profile,
            _snapshot(_job("6", "云平台运维工程师", requirements="熟悉 Linux、Docker、Ansible。")),
        )
    ).matches[0]
    states = {item.term: item.state for item in match.skill_states}
    assert states["Linux"] == "found"
    # 技能栏没写、经历里写过：这是"写进技能栏就能涨分"的那一档。
    assert states["Docker"] == "mentioned"
    assert states["Ansible"] == "missing"
    order = [item.state for item in match.skill_states]
    rank = {"found": 0, "mentioned": 1, "missing": 2}
    assert order == sorted(order, key=lambda state: rank[state])
    # 老契约不变：check_skills 只给"技能栏和经历都没有"的那几项（Docker 写在经历里，
    # 算分口径上算命中，所以不在其中）。
    assert "Linux" not in match.check_skills
    assert set(match.check_skills) == {"Ansible"}
    # 两者的差就是新加的那一档：Docker 在经历里、不在技能栏。
    mentioned = {item.term for item in match.skill_states if item.state == "mentioned"}
    assert mentioned == {"Docker"}


def test_skill_states_are_capped_and_never_exceed_job_requirements():
    """技能对比列表有上限，且只包含岗位要求里真的写了的词。"""
    requirements = (
        "熟悉 Linux、Docker、Kubernetes、Ansible、Prometheus、MySQL、Redis、"
        "Nginx、Kafka、Grafana、Terraform、Jenkins、Git、Shell、Python。"
    )
    match = asyncio.run(
        job_market_match.match_market(
            PROFILE, _snapshot(_job("7", "云平台运维工程师", requirements=requirements))
        )
    ).matches[0]
    assert 0 < len(match.skill_states) <= 12
    required = job_market_match._mentions(job_market_match._normalize(requirements))
    assert {item.term for item in match.skill_states} <= required
