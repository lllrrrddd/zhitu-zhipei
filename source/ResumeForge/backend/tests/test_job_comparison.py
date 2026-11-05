# SPDX-License-Identifier: Apache-2.0
"""岗位横向对比的解析、降级排序与重排。"""

from __future__ import annotations

import json

import pytest
from app.schemas.job_match import JobMatchResult, MatchCondition
from app.schemas.job_match_batch import JobMatchBatchItem
from app.services.job.job_comparison import (
    local_comparison,
    parse_comparison,
    reorder_by_comparison,
)
from app.services.llm.base import LLMError


def _item(job_id: int, title: str, score: int, status: str = "completed") -> JobMatchBatchItem:
    result = (
        JobMatchResult(
            hard_conditions=[MatchCondition(label="本科及以上", status="matched")],
            advice=f"{title} 的投递建议",
        )
        if status == "completed"
        else None
    )
    return JobMatchBatchItem(
        job_id=job_id,
        job_title=title,
        company="示例公司",
        status="completed" if status == "completed" else "failed",
        reference_score={"score": score, "dimensions": [], "disclaimer": ""}
        if status == "completed"
        else None,
        result=result,
        error="" if status == "completed" else "模型调用失败",
    )


def _payload(job_ids: list[int]) -> str:
    items = [
        {
            "job_id": job_id,
            "rank": rank,
            "verdict": "best" if rank == 1 else "fair",
            "headline": f"岗位 {job_id} 的一句话定位",
            "reasons": ["硬性条件全部满足"],
            "concerns": [],
        }
        for rank, job_id in enumerate(job_ids, start=1)
    ]
    return (
        '{"summary": "更适合第一个岗位", "items": '
        + json.dumps(items, ensure_ascii=False)
        + ', "notes": ["仅供比较"]}'
    )


def test_parse_comparison_accepts_a_complete_ranking():
    result = parse_comparison(_payload([3, 7]), [3, 7])

    assert [item.rank for item in result.items] == [1, 2]
    assert result.summary == "更适合第一个岗位"


def test_parse_comparison_rejects_missing_jobs():
    with pytest.raises(LLMError) as excinfo:
        parse_comparison(_payload([3]), [3, 7])

    assert excinfo.value.retryable is True


def test_parse_comparison_rejects_percentages():
    raw = _payload([3, 7]).replace("硬性条件全部满足", "匹配度 82%")

    with pytest.raises(LLMError):
        parse_comparison(raw, [3, 7])


def test_local_comparison_orders_by_reference_score():
    comparison = local_comparison([_item(1, "岗位一", 55), _item(2, "岗位二", 80)])

    assert [item.job_id for item in comparison.items] == [2, 1]
    assert comparison.items[0].verdict == "best"
    assert comparison.summary.startswith("更适合 岗位二")


def test_local_comparison_prioritizes_hard_gate_over_reference_score():
    eligible = _item(1, "合格岗位", 55)
    blocked = _item(2, "门槛不符岗位", 95)
    eligible.result.hard_gate = "met"
    blocked.result.hard_gate = "unmet"

    comparison = local_comparison([blocked, eligible])

    assert [item.job_id for item in comparison.items] == [1, 2]
    assert comparison.items[1].verdict == "weak"


def test_model_comparison_rejects_unmet_gate_ranked_above_met_gate():
    with pytest.raises(LLMError, match="硬性"):
        parse_comparison(_payload([2, 1]), [1, 2], hard_gates={1: "met", 2: "unmet"})


def test_all_unmet_jobs_are_not_called_best():
    first = _item(1, "门槛不符甲", 95)
    second = _item(2, "门槛不符乙", 70)
    first.result.hard_gate = "unmet"
    second.result.hard_gate = "unmet"

    comparison = local_comparison([first, second])

    assert all(item.verdict == "weak" for item in comparison.items)
    assert "均有明确的硬性条件缺口" in comparison.summary
    with pytest.raises(LLMError, match="硬性"):
        parse_comparison(_payload([1, 2]), [1, 2], hard_gates={1: "unmet", 2: "unmet"})


def test_reorder_by_comparison_keeps_failed_items_last():
    items = [_item(1, "岗位一", 80), _item(2, "岗位二", 90), _item(3, "岗位三", 0, "failed")]
    comparison = local_comparison(items)

    ordered = reorder_by_comparison(items, comparison)

    assert [item.job_id for item in ordered] == [2, 1, 3]
    assert [item.rank for item in ordered] == [1, 2, None]
