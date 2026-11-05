# SPDX-License-Identifier: Apache-2.0
"""Regression tests for hard-gate-first batch ranking."""

from app.schemas.job_match import JobMatchResult, MatchReferenceScore
from app.schemas.job_match_batch import JobMatchBatchItem
from app.services.job.job_match_batch import sort_batch_items


def test_batch_ranking_places_unmet_hard_gate_after_eligible_jobs() -> None:
    def item(job_id: int, gate: str, score: int) -> JobMatchBatchItem:
        return JobMatchBatchItem(
            job_id=job_id,
            status="completed",
            result=JobMatchResult(hard_gate=gate),
            reference_score=MatchReferenceScore(score=score),
        )

    ranked = sort_batch_items(
        [
            item(1, "unmet", 95),
            item(2, "unknown", 80),
            item(3, "met", 55),
        ]
    )
    assert [item.job_id for item in ranked] == [3, 2, 1]
    assert [item.rank for item in ranked] == [1, 2, 3]
