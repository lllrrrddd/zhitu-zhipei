# SPDX-License-Identifier: Apache-2.0
"""The graduate demo and rank endpoint preserve uncertainty and input limits."""

from app.main import app
from fastapi.testclient import TestClient


def test_demo_can_be_ranked_without_author_labels() -> None:
    client = TestClient(app)
    demo_response = client.get("/api/graduate/demo")
    assert demo_response.status_code == 200
    demo = demo_response.json()
    assert len(demo["profiles"]) == 5
    assert len(demo["jobs"]) == 14
    assert demo["checked_date"] == "2026-11-04"
    assert "labels" not in demo

    finance = next(profile for profile in demo["profiles"] if profile["id"] == "P-FIN")
    rank_response = client.post(
        "/api/graduate/recommend", json={"profile": finance, "jobs": demo["jobs"]}
    )
    assert rank_response.status_code == 200
    result = rank_response.json()
    assert result["directional_fits"] == []
    assert {item["job_id"] for item in result["expired"]} == {"J12", "J13"}
    assert {item["job_id"] for item in result["blocked"]} == {"J14"}


def test_user_supplied_evidence_can_change_a_review_into_directional_fit() -> None:
    client = TestClient(app)
    demo = client.get("/api/graduate/demo").json()
    profile = next(profile for profile in demo["profiles"] if profile["id"] == "P-IC")
    radio_job = next(job for job in demo["jobs"] if job["id"] == "J08")
    before = client.post(
        "/api/graduate/recommend", json={"profile": profile, "jobs": [radio_job]}
    ).json()
    assert before["directional_fits"] == []
    assert before["needs_review"][0]["job_id"] == "J08"

    confirmed = {**profile, "evidence": {**profile["evidence"], "ADS": "射频项目使用 ADS 仿真"}}
    after = client.post(
        "/api/graduate/recommend", json={"profile": confirmed, "jobs": [radio_job]}
    ).json()
    assert after["directional_fits"][0]["matched_core"] == ["ADS"]
    assert after["directional_fits"][0]["matched_evidence"]["ADS"] == [
        {"skill": "ADS", "excerpt": "射频项目使用 ADS 仿真"}
    ]


def test_mismatched_graduation_year_requires_confirmation() -> None:
    client = TestClient(app)
    demo = client.get("/api/graduate/demo").json()
    profile = {**demo["profiles"][0], "graduation_year": 2028}
    job = demo["jobs"][0]
    result = client.post(
        "/api/graduate/recommend", json={"profile": profile, "jobs": [job]}
    ).json()
    assert result["directional_fits"] == []
    assert "届别" in result["needs_review"][0]["reason"]


def test_unknown_degree_floor_never_becomes_a_directional_fit() -> None:
    client = TestClient(app)
    demo = client.get("/api/graduate/demo").json()
    job = {**demo["jobs"][0], "degree_floor": "unknown"}
    result = client.post(
        "/api/graduate/recommend",
        json={"profile": demo["profiles"][0], "jobs": [job]},
    ).json()
    assert result["directional_fits"] == []
    assert "学历底线未核对" in result["needs_review"][0]["reason"]


def test_blank_major_preference_cannot_count_as_a_major_match() -> None:
    client = TestClient(app)
    demo = client.get("/api/graduate/demo").json()
    profile = demo["profiles"][0]
    job = {**demo["jobs"][0], "preferred_majors": ["  "]}
    result = client.post(
        "/api/graduate/recommend", json={"profile": profile, "jobs": [job]}
    ).json()
    assert result["directional_fits"] == []
    assert result["needs_review"][0]["major_fit"] is False


def test_local_job_draft_extracts_candidates_with_source_fragments() -> None:
    client = TestClient(app)
    text = (
        "公司名称：示例科技\n岗位名称：算法工程师\n工作地点：上海\n"
        "学历要求：硕士及以上\n专业要求：计算机科学与技术、软件工程相关专业\n"
        "岗位要求：熟悉 PyTorch、Python、RAG。2027届毕业生。\n"
        "来源：https://example.org/job/1"
    )
    response = client.post("/api/graduate/parse-draft", json={"text": text})
    assert response.status_code == 200
    draft = response.json()
    assert (draft["company"], draft["title"], draft["city"]) == (
        "示例科技", "算法工程师", "上海"
    )
    assert draft["degree_floor"] == "master"
    assert draft["graduation_year"] == 2027
    assert draft["preferred_majors"] == ["计算机科学与技术", "软件工程"]
    assert set(draft["core_skills"]) >= {"Python", "PyTorch"}
    assert draft["source_url"] == "https://example.org/job/1"
    assert "硕士及以上" in draft["source_fragments"]["degree_floor"]


def test_ambiguous_degree_stays_unknown_and_request_is_bounded() -> None:
    client = TestClient(app)
    text = (
        "公司名称：示例科技\n岗位名称：算法工程师\n"
        "学历要求：本科及以上，硕士优先\n专业不限\n岗位要求：沟通能力"
    )
    draft = client.post("/api/graduate/parse-draft", json={"text": text}).json()
    assert draft["degree_floor"] == "unknown"
    assert draft["preferred_majors"] == []
    assert any("学历底线缺失或存在多个候选" in warning for warning in draft["warnings"])
    assert client.post("/api/graduate/parse-draft", json={"text": "x" * 20001}).status_code == 422


def test_preferred_degree_and_year_do_not_become_hard_requirements() -> None:
    client = TestClient(app)
    text = (
        "公司名称：示例科技\n岗位名称：算法工程师\n"
        "学历要求：博士优先\n招聘对象：2027届毕业生优先\n"
        "专业要求：计算机科学与技术\n来源：https://example.org/job/preferred"
    )
    draft = client.post("/api/graduate/parse-draft", json={"text": text}).json()
    assert draft["degree_floor"] == "unknown"
    assert draft["graduation_year"] is None
    assert any("学历优先条件" in warning for warning in draft["warnings"])
    assert any("毕业届别优先条件" in warning for warning in draft["warnings"])


def test_required_year_survives_unrelated_degree_preference() -> None:
    client = TestClient(app)
    text = (
        "公司名称：示例科技\n岗位名称：算法工程师\n"
        "招聘对象：2027届毕业生，博士优先\n"
        "学历要求：硕士及以上\n来源：https://example.org/job/required"
    )
    draft = client.post("/api/graduate/parse-draft", json={"text": text}).json()
    assert draft["degree_floor"] == "master"
    assert draft["graduation_year"] == 2027


def test_past_deadline_is_separated_from_unknown_opening_status() -> None:
    client = TestClient(app)
    text = (
        "公司名称：示例科技\n岗位名称：算法工程师\n工作地点：上海\n"
        "学历要求：硕士及以上\n专业要求：计算机科学与技术\n"
        "报名截止日期：2020-01-01\n来源：https://example.org/job/old"
    )
    draft = client.post("/api/graduate/parse-draft", json={"text": text}).json()
    assert draft["application_status"] == "past_reported_deadline"
    assert draft["source_fragments"]["application_status"] == "报名截止日期：2020-01-01"


def test_rank_rejects_untrusted_url_and_duplicate_job_ids() -> None:
    client = TestClient(app)
    demo = client.get("/api/graduate/demo").json()
    profile = demo["profiles"][0]
    job = demo["jobs"][0]
    bad_url = {**job, "source_url": "javascript:alert(1)"}
    assert (
        client.post("/api/graduate/recommend", json={"profile": profile, "jobs": [bad_url]})
        .status_code
        == 422
    )
    assert (
        client.post("/api/graduate/recommend", json={"profile": profile, "jobs": [job, job]})
        .status_code
        == 422
    )


def test_source_check_date_is_optional_but_must_be_a_real_date() -> None:
    client = TestClient(app)
    demo = client.get("/api/graduate/demo").json()
    job = demo["jobs"][0]
    profile = demo["profiles"][0]
    checked = {**job, "source_checked_at": "2026-11-05"}
    assert (
        client.post("/api/graduate/recommend", json={"profile": profile, "jobs": [checked]})
        .status_code
        == 200
    )
    invalid = {**job, "source_checked_at": "2026-02-30"}
    assert (
        client.post("/api/graduate/recommend", json={"profile": profile, "jobs": [invalid]})
        .status_code
        == 422
    )
