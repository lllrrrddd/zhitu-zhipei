// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { buildComparisonRows, comparisonRowsToMarkdown } from "./comparisonRows";
import type { JobMatchBatchItem, MatchCondition, MatchStatus } from "../../types";

function condition(status: MatchStatus): MatchCondition {
  return { label: "条件", jd_quote: "原文", status, evidence: "" };
}

function item(
  id: number,
  options: {
    score?: number | null;
    rank?: number | null;
    hard?: MatchStatus[];
    core?: MatchStatus[];
    bonus?: MatchStatus[];
  } = {},
): JobMatchBatchItem {
  return {
    job_id: id,
    job_title: `岗位-${id}`,
    company: `公司-${id}`,
    status: "completed",
    rank: options.rank ?? null,
    reference_score:
      options.score === null
        ? null
        : { score: options.score ?? 70, dimensions: [], disclaimer: "本地规则估计" },
    result: {
      hard_conditions: (options.hard ?? []).map(condition),
      core_abilities: (options.core ?? []).map(condition),
      bonus_items: (options.bonus ?? []).map(condition),
    } as never,
    model: "",
    analysis_source: "new",
    error: "",
  };
}

describe("横向对比行", () => {
  it("按参考分从高到低排，没分的排最后", () => {
    const rows = buildComparisonRows([
      item(1, { score: 60 }),
      item(2, { score: null }),
      item(3, { score: 88 }),
    ]);
    expect(rows.map((row) => row.jobId)).toEqual([3, 1, 2]);
  });

  it("同分时按后端给的名次排", () => {
    const rows = buildComparisonRows([
      item(1, { score: 70, rank: 2 }),
      item(2, { score: 70, rank: 1 }),
    ]);
    expect(rows.map((row) => row.jobId)).toEqual([2, 1]);
  });

  it("硬性条件按状态计数：matched 计满足、real_gap 计未满足", () => {
    const rows = buildComparisonRows([
      item(1, { hard: ["matched", "real_gap", "to_confirm"], core: ["matched", "matched"] }),
    ]);
    expect(rows[0].hard).toEqual({ total: 3, matched: 1, blocked: 1 });
    expect(rows[0].core).toEqual({ total: 2, matched: 2, blocked: 0 });
    expect(rows[0].bonus).toEqual({ total: 0, matched: 0, blocked: 0 });
  });

  it("没有结果（失败项）时三类条件都记 0，而不是崩掉", () => {
    const failed: JobMatchBatchItem = {
      ...item(9),
      status: "failed",
      result: null,
      reference_score: null,
      error: "超时",
    };
    const rows = buildComparisonRows([failed]);
    expect(rows[0]).toMatchObject({
      score: null,
      hard: { total: 0, matched: 0, blocked: 0 },
      core: { total: 0, matched: 0, blocked: 0 },
    });
  });
});

describe("复制为 Markdown", () => {
  it("表头 + 分隔行 + 每岗一行，缺分/缺名次用 - 占位", () => {
    const rows = buildComparisonRows([
      item(1, { score: 82, rank: 1, hard: ["matched"], core: ["matched", "real_gap"] }),
      item(2, { score: null }),
    ]);
    const md = comparisonRowsToMarkdown(rows, ["岗位", "名次", "分", "硬", "核", "加"]);
    const lines = md.split("\n");
    expect(lines[0]).toBe("| 岗位 | 名次 | 分 | 硬 | 核 | 加 |");
    expect(lines[1]).toBe("| --- | --- | --- | --- | --- | --- |");
    // 岗位与公司拼在一起，分数与计数按行给
    expect(lines[2]).toBe("| 岗位-1（公司-1） | 1 | 82 | 1/1 | 1/2 | 0/0 |");
    expect(lines[3]).toBe("| 岗位-2（公司-2） | - | - | 0/0 | 0/0 | 0/0 |");
  });
});
