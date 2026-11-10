// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { expect, it, vi } from "vitest";
import { t } from "../../i18n";
import JobComparisonTable from "./JobComparisonTable";
import type { JobMatchBatchItem, MatchStatus } from "../../types";

/** 岗位/公司名是**用户数据**（来自后端），断言与 fixture 用同一批常量。 */
const FIRST_TITLE = "平台运维工程师";
const SECOND_TITLE = "数据分析师";

function condition(status: MatchStatus) {
  return { label: "条件", jd_quote: "原文", status, evidence: "" };
}

function item(
  id: number,
  title: string,
  options: { score: number; rank: number | null; hard?: MatchStatus[]; core?: MatchStatus[] },
): JobMatchBatchItem {
  return {
    job_id: id,
    job_title: title,
    company: `公司-${id}`,
    status: "completed",
    rank: options.rank,
    reference_score: { score: options.score, dimensions: [], disclaimer: "本地规则估计" },
    result: {
      hard_conditions: (options.hard ?? []).map(condition),
      core_abilities: (options.core ?? []).map(condition),
      bonus_items: [],
    } as never,
    model: "",
    analysis_source: "new",
    error: "",
  };
}

const ITEMS = [
  item(1, FIRST_TITLE, { score: 66, rank: 2, hard: ["matched", "real_gap"], core: ["matched"] }),
  item(2, SECOND_TITLE, { score: 84, rank: 1, hard: ["matched"], core: ["matched", "real_gap"] }),
];

function renderTable(items: JobMatchBatchItem[] = ITEMS) {
  return render(
    <App>
      <JobComparisonTable items={items} />
    </App>,
  );
}

it("每个岗位一行：名次、参考分、三类条件的命中数", () => {
  renderTable();
  // 同名文本（1/1、1/2）会在不同列重复出现，所以按"行"来断言，而不是全页找文本。
  const rows = screen.getAllByRole("row");
  const first = rows.find((row) => row.textContent?.includes(FIRST_TITLE));
  const second = rows.find((row) => row.textContent?.includes(SECOND_TITLE));
  expect(first).toBeDefined();
  expect(second).toBeDefined();
  // 岗位一：名次 2、参考分 66、硬性条件 1/2（其中 1 条明确不满足）、核心能力 1/1、加分项 0/0
  expect(first!.textContent).toContain("66");
  expect(first!.textContent).toContain("1/2 · 未满足 1");
  expect(first!.textContent).toContain("1/1");
  // 岗位二：名次 1、参考分 84、硬性条件 1/1、核心能力 1/2（1 条不满足）
  expect(second!.textContent).toContain("84");
  expect(second!.textContent).toContain("1/2 · 未满足 1");
});

it("默认按参考分从高到低（第一行是分更高的那个）", () => {
  renderTable();
  const rows = screen.getAllByRole("row");
  // rows[0] 是表头
  expect(rows[1].textContent).toContain(SECOND_TITLE);
  expect(rows[2].textContent).toContain(FIRST_TITLE);
});

it("复制为表格：写进剪贴板并给出成功提示", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  renderTable();

  fireEvent.click(screen.getByRole("button", { name: t("jobMatchBatchResult.table.copy") }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  expect(writeText.mock.calls[0][0]).toContain(SECOND_TITLE);
  expect(await screen.findByText(t("jobMatchBatchResult.table.copied"))).toBeInTheDocument();
});

it("复制失败也不崩：给出失败提示", async () => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  renderTable();
  fireEvent.click(screen.getByRole("button", { name: t("jobMatchBatchResult.table.copy") }));
  expect(await screen.findByText(t("jobMatchBatchResult.table.copyFailed"))).toBeInTheDocument();
});

it("没有结果时说明还没可对比内容", () => {
  renderTable([]);
  expect(screen.getByText(t("jobMatchBatchResult.table.empty"))).toBeInTheDocument();
});
