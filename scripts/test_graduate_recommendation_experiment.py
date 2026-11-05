"""Boundary checks for the structured graduate recommendation experiment."""

import graduate_recommendation_experiment as experiment


def _fixtures() -> tuple[list[dict], list[dict]]:
    import json

    profiles = json.loads((experiment.DATA / "profiles.json").read_text(encoding="utf-8"))[
        "profiles"
    ]
    jobs = json.loads((experiment.DATA / "jobs.json").read_text(encoding="utf-8"))["jobs"]
    return profiles, jobs


def test_finance_profile_abstains_when_only_related_jobs_are_expired() -> None:
    profiles, jobs = _fixtures()
    result = experiment.recommend(next(p for p in profiles if p["id"] == "P-FIN"), jobs)
    assert result["directional_fits"] == []
    assert {item["job_id"] for item in result["expired"]} == {"J12", "J13"}


def test_degree_exception_is_reviewed_and_strict_doctorate_is_blocked() -> None:
    profiles, jobs = _fixtures()
    result = experiment.recommend(next(p for p in profiles if p["id"] == "P-BIO"), jobs)
    assert "J02" in {item["job_id"] for item in result["needs_review"]}
    assert "J14" in {item["job_id"] for item in result["blocked"]}


def test_domain_evidence_separates_digital_from_radio_frequency() -> None:
    profiles, jobs = _fixtures()
    result = experiment.recommend(next(p for p in profiles if p["id"] == "P-IC"), jobs)
    assert "J07" in {item["job_id"] for item in result["directional_fits"]}
    assert "J08" in {item["job_id"] for item in result["needs_review"]}


def test_missing_skill_evidence_does_not_become_a_hard_failure() -> None:
    profiles, jobs = _fixtures()
    profile = next(p for p in profiles if p["id"] == "P-MAT")
    job = next(j for j in jobs if j["id"] == "J10")
    assert experiment.assess(profile, job)["status"] == "review"
