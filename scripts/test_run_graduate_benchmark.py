"""Guard the offline graduate benchmark's hard-gate and reporting rules."""

from __future__ import annotations

import run_graduate_benchmark as benchmark


def test_degree_exception_stays_to_confirm() -> None:
    profile = {"degree": "master"}
    job = {"degree_floor": "doctor", "degree_exception": True}
    assert benchmark.degree_status(profile, job) == "to_confirm"
    job["degree_exception"] = False
    assert benchmark.degree_status(profile, job) == "real_gap"


def test_baseline_excludes_expired_posts_and_reports_false_positives() -> None:
    result = benchmark.run()
    runs = {item["profile_id"]: item for item in result["runs"]}
    assert result["excluded_past_deadline_count"] == 2
    assert all(not item["hard_block_in_top_5"] for item in result["runs"])
    assert runs["P-FIN"]["precision_at_5"] == 0
    assert runs["P-MAT"]["recall_at_5"] < 1
    assert all(
        item["job_id"] not in {"J12", "J13"}
        for run in result["runs"]
        for item in run["top_10"]
    )
