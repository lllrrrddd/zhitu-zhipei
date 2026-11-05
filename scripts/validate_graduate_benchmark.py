"""Validate the offline graduate job benchmark before using it in demos or tests."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1] / "evaluation" / "graduate_benchmark_v0"
DEGREE_RANK = {"bachelor": 1, "master": 2, "doctor": 3}
LABEL_FIELDS = (
    "relevant_job_ids",
    "requires_confirmation_job_ids",
    "hard_block_job_ids",
    "archived_relevant_job_ids",
)


def _read(name: str) -> dict:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def validate() -> dict[str, int]:
    profiles_data = _read("profiles.json")
    jobs_data = _read("jobs.json")
    labels_data = _read("labels.json")
    assert {profiles_data["version"], jobs_data["version"], labels_data["version"]} == {"0.1"}
    checked_date = date.fromisoformat(jobs_data["checked_date"])
    profiles = profiles_data["profiles"]
    jobs = jobs_data["jobs"]
    labels = labels_data["labels"]
    profile_ids = {item["id"] for item in profiles}
    job_ids = {item["id"] for item in jobs}
    assert len(profile_ids) == len(profiles) >= 5
    assert len(job_ids) == len(jobs) >= 10
    assert {item["profile_id"] for item in labels} == profile_ids
    jobs_by_id = {item["id"]: item for item in jobs}
    profiles_by_id = {item["id"]: item for item in profiles}

    for profile in profiles:
        assert profile["degree"] in DEGREE_RANK
        assert profile["evidence"] and all(profile["evidence"].values())
        assert profile["graduation_year"] == 2027
    for job in jobs:
        assert job["degree_floor"] in DEGREE_RANK
        assert job["application_status"] in {"unknown", "past_reported_deadline"}
        assert job["preferred_majors"]
        assert job["graduation_year"] == 2027
        for field in ("source_url", "detail_source_url"):
            if field in job:
                url = urlparse(job[field])
                assert url.scheme == "https" and url.netloc
        if job["posted_date"]:
            assert date.fromisoformat(job["posted_date"]) <= checked_date

    for label in labels:
        selected: list[str] = []
        for field in LABEL_FIELDS:
            selected.extend(label.get(field, []))
        assert len(selected) == len(set(selected))
        assert set(selected) <= job_ids
        profile = profiles_by_id[label["profile_id"]]
        for job_id in label["hard_block_job_ids"]:
            job = jobs_by_id[job_id]
            assert DEGREE_RANK[profile["degree"]] < DEGREE_RANK[job["degree_floor"]]
            assert not job["degree_exception"]
        for job_id in label.get("archived_relevant_job_ids", []):
            assert jobs_by_id[job_id]["application_status"] == "past_reported_deadline"

    return {
        "profiles": len(profiles),
        "jobs": len(jobs),
        "source_urls": len({job["source_url"] for job in jobs}),
        "initial_labels": len(labels),
    }


if __name__ == "__main__":
    print(json.dumps(validate(), ensure_ascii=False))
