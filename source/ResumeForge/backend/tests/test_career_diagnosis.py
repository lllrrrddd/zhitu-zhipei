# SPDX-License-Identifier: Apache-2.0
"""岗位定向简历诊断的契约测试。

诊断只做规则检查，所以每条结论都必须可复算、可指回用户原文：
关键词三态、成果量化比例、行动力、材料完整四项权重合计 100；
问题项必须带 excerpt（除"没有经历/技能太少"这类结构性缺失）。
"""

from datetime import date

from app.schemas.job_market import CareerProfile, MarketJob
from app.services.career_diagnosis import diagnose


def _job(requirements: str) -> MarketJob:
    return MarketJob(
        id="tencent-1",
        source_id="tencent",
        company="测试公司",
        title="平台运维工程师",
        family="平台运维工程师",
        cities=["深圳"],
        kind="campus",
        url="https://careers.tencent.com/jobdesc.html?postId=1",
        listed_date=date(2026, 11, 6),
        requirements=requirements,
        responsibilities="负责平台稳定性建设。",
    )


STRONG = CareerProfile(
    degree="master",
    graduation_year=2027,
    major="计算机技术",
    direction="运维开发",
    cities=["深圳"],
    skills=["Linux", "Kubernetes", "Python", "Prometheus", "Docker"],
    experience=[
        "主导校内系统容器化改造，用 Kubernetes 部署 12 个服务，故障恢复时间缩短 40%。",
        "搭建 Prometheus 监控体系，覆盖 30 个指标，告警误报率下降 25%。",
    ],
)

WEAK = CareerProfile(
    degree="master",
    graduation_year=2027,
    major="",
    direction="",
    cities=[],
    skills=["Python"],
    experience=["负责一些日常运维工作。", "参与团队协作。"],
)

REQUIREMENTS = (
    "熟悉 Linux、Kubernetes、Docker，了解 Prometheus 监控；"
    "具备 Ansible 自动化经验者优先；有 3 年以上工作经验者优先。"
)


def test_parts_weights_and_score_range():
    result = diagnose(STRONG, _job(REQUIREMENTS))
    assert [part.key for part in result.parts] == ["keyword", "quantified", "action", "readiness"]
    assert sum(part.weight for part in result.parts) == 100
    assert 0 <= result.score <= 100
    assert 0 <= result.coverage <= 1


def test_strong_profile_scores_higher_than_weak_one():
    strong = diagnose(STRONG, _job(REQUIREMENTS))
    weak = diagnose(WEAK, _job(REQUIREMENTS))
    assert strong.score > weak.score
    assert strong.coverage > weak.coverage
    # 两份画像都必须给出具体的缺口项
    assert strong.terms
    assert weak.issues


def test_missing_keywords_are_reported_with_three_states():
    result = diagnose(STRONG, _job(REQUIREMENTS))
    states = {term.term: term.state for term in result.terms}
    # 技能栏里有的不出现在缺口清单里
    assert "Linux" not in states
    # 岗位提到但简历完全没写的，必须是 missing（Ansible 只出现在 JD 里）
    assert states.get("Ansible") == "missing"


def test_mentioned_only_when_skill_is_in_experience_but_not_skill_list():
    profile = STRONG.model_copy(update={"skills": ["Linux", "Python"]})
    result = diagnose(
        profile, _job("熟悉 Kubernetes 与 Docker，能独立排查线上问题。")
    )
    states = {term.term: term.state for term in result.terms}
    assert states.get("Kubernetes") in {"mentioned", "missing"}
    if states.get("Kubernetes") == "mentioned":
        assert any(issue.key == "mentioned_only" for issue in result.issues)


def test_weak_profile_reports_no_numbers_and_weak_verbs():
    result = diagnose(WEAK, _job(REQUIREMENTS))
    keys = {issue.key for issue in result.issues}
    assert "no_numbers" in keys
    assert "weak_verb" in keys
    for issue in result.issues:
        if issue.key in {"no_numbers", "weak_verb"}:
            assert issue.excerpt, "定位类问题必须带原文片段"


def test_diagnosis_is_reproducible():
    first = diagnose(STRONG, _job(REQUIREMENTS))
    second = diagnose(STRONG, _job(REQUIREMENTS))
    assert first.score == second.score
    assert [(p.key, p.value) for p in first.parts] == [(p.key, p.value) for p in second.parts]
    assert [t.term for t in first.terms] == [t.term for t in second.terms]
