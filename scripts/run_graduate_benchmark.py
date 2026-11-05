"""Run the app's current score and ranking on the structured graduate fixtures.

This is an offline baseline. It bypasses resume OCR, JD extraction, and LLM
judgement, so its metrics must not be presented as end-to-end product accuracy.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "evaluation" / "graduate_benchmark_v0"
BACKEND = ROOT / "source" / "ResumeForge" / "backend"
sys.path.insert(0, str(BACKEND))

from app.schemas.job_match import JobMatchResult, MatchCondition
from app.schemas.job_match_batch import JobMatchBatchItem
from app.services.job.job_match import finalize_match_result
from app.services.job.job_match_batch import sort_batch_items
from app.services.match_scoring import score_match_result

DEGREE_RANK = {"bachelor": 1, "master": 2, "doctor": 3}
SCORING_FILES = (
    "app/services/job/job_match.py",
    "app/services/job/job_match_batch.py",
    "app/services/match_scoring.py",
)


def read_data(name: str) -> dict:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def degree_status(profile: dict, job: dict) -> str:
    if DEGREE_RANK[profile["degree"]] >= DEGREE_RANK[job["degree_floor"]]:
        return "matched"
    if job["degree_exception"]:
        return "to_confirm"
    return "real_gap"


def make_item(profile: dict, job: dict, job_number: int) -> JobMatchBatchItem:
    evidence = {key.casefold(): value for key, value in profile["evidence"].items()}
    conditions = [
        MatchCondition(
            label=skill,
            jd_quote=skill,
            status="matched"
            if skill.casefold() in evidence
            else "evidence_insufficient",
            evidence=evidence.get(skill.casefold(), "资料中未提供"),
        )
        for skill in job["core_skills"]
    ]
    degree = MatchCondition(
        label="学历要求",
        jd_quote=job["degree_floor"],
        status=degree_status(profile, job),
        evidence=profile["degree"],
    )
    result = finalize_match_result(
        JobMatchResult(hard_conditions=[degree], core_abilities=conditions)
    )
    payload = {
        "title": job["title"],
        "company": job["company"],
        "location": job["city"],
        "description": " ".join(job["core_skills"]),
        "requirements": job["degree_floor"],
    }
    profile_text = json.dumps(profile, ensure_ascii=False)
    score = score_match_result(result, payload, profile_text, "")
    return JobMatchBatchItem(
        job_id=job_number,
        job_title=job["title"],
        company=job["company"],
        status="completed",
        result=result,
        reference_score=score,
        analysis_source="local",
    )


def ndcg_at_k(ranked: list[str], relevant: set[str], k: int) -> float | None:
    if not relevant:
        return None
    dcg = sum(
        1 / math.log2(index + 2)
        for index, job_id in enumerate(ranked[:k])
        if job_id in relevant
    )
    ideal = sum(1 / math.log2(index + 2) for index in range(min(k, len(relevant))))
    return round(dcg / ideal, 4)


def run() -> dict:
    profiles = read_data("profiles.json")["profiles"]
    jobs = read_data("jobs.json")["jobs"]
    labels = {item["profile_id"]: item for item in read_data("labels.json")["labels"]}
    active_jobs = [
        (index, job)
        for index, job in enumerate(jobs, 1)
        if job["application_status"] != "past_reported_deadline"
    ]
    numbers = {index: job["id"] for index, job in active_jobs}
    runs = []
    for profile in profiles:
        ranked_items = sort_batch_items(
            [make_item(profile, job, index) for index, job in active_jobs]
        )
        ranked_ids = [numbers[item.job_id] for item in ranked_items]
        label = labels[profile["id"]]
        relevant = set(label["relevant_job_ids"])
        blocked = set(label["hard_block_job_ids"])
        top_five = set(ranked_ids[:5])
        runs.append(
            {
                "profile_id": profile["id"],
                "relevant_count": len(relevant),
                "recall_at_5": round(len(relevant & top_five) / len(relevant), 4)
                if relevant
                else None,
                "precision_at_5": round(
                    len(relevant & top_five) / min(5, len(ranked_ids)), 4
                ),
                "ndcg_at_10": ndcg_at_k(ranked_ids, relevant, 10),
                "hard_block_in_top_5": sorted(blocked & top_five),
                "irrelevant_in_top_5": [
                    job_id for job_id in ranked_ids[:5] if job_id not in relevant
                ],
                "top_10": [
                    {
                        "job_id": numbers[item.job_id],
                        "hard_gate": item.result.hard_gate,
                        "reference_score": item.reference_score.score,
                        "provisional_relevant": numbers[item.job_id] in relevant,
                    }
                    for item in ranked_items[:10]
                ],
            }
        )
    return {
        "scope": "structured-fixture offline baseline; not end-to-end product accuracy",
        "input_sha256": {
            name: sha256(DATA / name)
            for name in ("profiles.json", "jobs.json", "labels.json")
        },
        "code_sha256": {name: sha256(BACKEND / name) for name in SCORING_FILES},
        "profile_count": len(profiles),
        "active_job_count": len(active_jobs),
        "excluded_past_deadline_count": len(jobs) - len(active_jobs),
        "labels": "author provisional, not independently reviewed",
        "runs": runs,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write JSON to this path")
    args = parser.parse_args()
    result_json = json.dumps(run(), ensure_ascii=False, indent=2) + "\n"
    if args.output is None:
        print(result_json, end="")
    else:
        args.output.write_text(result_json, encoding="utf-8")
