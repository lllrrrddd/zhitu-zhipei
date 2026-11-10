// SPDX-License-Identifier: Apache-2.0
/**
 * 批量匹配的**横向对比行**：把每个岗位压成一行，便于扫读。
 *
 * 为什么还要一层纯函数：卡片是"逐岗看结论"，名次卡是"为什么排这儿"，但用户真正做决定时
 * 会先把几个岗位摆成一张表比。行的口径固定下来（分、硬性条件、核心能力、加分项），
 * 表格与"复制为 Markdown"就同源，不会出现两处算法不一致。
 *
 * 口径说明：
 * - 参考分来自后端本地规则（`reference_score.score`），**不参与排序推导**，只是列出来；
 * - 硬性条件的 matched / blocked 按 `MatchStatus` 计数（`real_gap` 记 blocked）；
 * - 名次只取后端给的 `rank`（对比批次才有），前端不再自己排一个名次。
 */

import type { JobMatchBatchItem, MatchCondition, MatchStatus } from "../../types";

export interface ConditionTally {
  total: number;
  matched: number;
  /** 明确不满足（`real_gap`）。 */
  blocked: number;
}

export interface ComparisonRow {
  jobId: number;
  title: string;
  company: string;
  rank: number | null;
  score: number | null;
  hard: ConditionTally;
  core: ConditionTally;
  bonus: ConditionTally;
}

function tally(conditions: MatchCondition[] | undefined): ConditionTally {
  const list = conditions ?? [];
  let matched = 0;
  let blocked = 0;
  for (const condition of list) {
    const status: MatchStatus = condition.status;
    if (status === "matched") matched += 1;
    else if (status === "real_gap") blocked += 1;
  }
  return { total: list.length, matched, blocked };
}

/** 逐岗压成一行；按参考分从高到低排（没有分排最后），同分按名次。 */
export function buildComparisonRows(items: JobMatchBatchItem[]): ComparisonRow[] {
  return items
    .map((item) => ({
      jobId: item.job_id,
      title: item.job_title,
      company: item.company,
      rank: item.rank ?? null,
      score: item.reference_score?.score ?? null,
      hard: tally(item.result?.hard_conditions),
      core: tally(item.result?.core_abilities),
      bonus: tally(item.result?.bonus_items),
    }))
    .sort(
      (left, right) =>
        (right.score ?? -1) - (left.score ?? -1) ||
        (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER),
    );
}

/** 复制成 Markdown 表格：粘到笔记/邮件里还能读。 */
export function comparisonRowsToMarkdown(rows: ComparisonRow[], headers: string[]): string {
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const row of rows) {
    const cells = [
      `${row.title}（${row.company}）`,
      row.rank === null ? "-" : String(row.rank),
      row.score === null ? "-" : String(row.score),
      `${row.hard.matched}/${row.hard.total}`,
      `${row.core.matched}/${row.core.total}`,
      `${row.bonus.matched}/${row.bonus.total}`,
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}
