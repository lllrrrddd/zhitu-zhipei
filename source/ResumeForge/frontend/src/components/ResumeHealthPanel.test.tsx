// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import { t } from "../i18n";
import { HEALTH_HISTORY_KEY, HEALTH_TODO_KEY } from "../features/resume/healthCheck";
import ResumeHealthPanel from "./ResumeHealthPanel";
import type { AtsCheckResult } from "../types/ats";

const apiMocks = vi.hoisted(() => ({ runAtsCheck: vi.fn() }));
vi.mock("../api/ats", () => apiMocks);
// 风险扫描是另一个面板的事：这里只验证"没跑过时给出提示"，不触发任务。
vi.mock("../features/resume/riskScanStore", () => ({
  useRiskScan: () => ({ status: "idle" }),
}));

/** 问题标题来自后端（中文），是**数据**不是界面文案：抽成常量，断言与 fixture 同源。 */
const ISSUE_TITLE = "问题";

function issueTitle(index: number): string {
  return `${ISSUE_TITLE} ${index}`;
}

function ats(score: number, issues: number): AtsCheckResult {
  return {
    resume_id: 1,
    score,
    disclaimer: "本地规则估计，不代表真实 ATS 解析结果",
    summary: {},
    subscores: { format: 70, keyword: 50, position: 100 },
    issues: Array.from({ length: issues }, (_, index) => ({
      category: "format" as const,
      severity: "high" as const,
      title: issueTitle(index + 1),
      detail: "",
      evidence: [],
      suggestion: "按建议改一处。",
    })),
    matched_keywords: [],
    missing_keywords: [],
    coverage_ratio: 0.5,
  };
}

function renderPanel(signature?: string) {
  return render(
    <App>
      <ResumeHealthPanel resumeId={1} signature={signature} />
    </App>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  apiMocks.runAtsCheck.mockReset();
});

it("挂载不发请求：先给说明卡与「开始体检」", () => {
  renderPanel();
  expect(screen.getByText(t("resumeHealth.intro.title"))).toBeInTheDocument();
  expect(screen.getByRole("button", { name: t("resumeHealth.action.run") })).toBeInTheDocument();
  expect(apiMocks.runAtsCheck).not.toHaveBeenCalled();
});

it("体检后显示分数、问题清单与待处理条数，并把结果记进本机历史", async () => {
  apiMocks.runAtsCheck.mockResolvedValue(ats(62, 2));
  renderPanel();
  fireEvent.click(screen.getByRole("button", { name: t("resumeHealth.action.run") }));

  expect(await screen.findByText("62")).toBeInTheDocument();
  expect(screen.getByText(t("resumeHealth.open", { count: 2 }))).toBeInTheDocument();
  expect(screen.getByText(issueTitle(1))).toBeInTheDocument();
  await waitFor(() => expect(window.localStorage.getItem(HEALTH_HISTORY_KEY)).not.toBeNull());
});

it("标记「已改好」后待处理条数减少，并记住这条", async () => {
  apiMocks.runAtsCheck.mockResolvedValue(ats(62, 2));
  renderPanel();
  fireEvent.click(screen.getByRole("button", { name: t("resumeHealth.action.run") }));
  await screen.findByText(issueTitle(1));

  fireEvent.click(screen.getAllByRole("button", { name: t("resumeHealth.action.markDone") })[0]);

  expect(screen.getByText(t("resumeHealth.open", { count: 1 }))).toBeInTheDocument();
  expect(screen.getByText(t("resumeHealth.state.done"))).toBeInTheDocument();
  const stored = JSON.parse(window.localStorage.getItem(HEALTH_TODO_KEY) ?? "{}");
  expect(Object.values(stored["1"] ?? {})).toEqual(["done"]);
});

it("复检后显示「较上次 +N 分」", async () => {
  apiMocks.runAtsCheck.mockResolvedValueOnce(ats(60, 2));
  renderPanel();
  fireEvent.click(screen.getByRole("button", { name: t("resumeHealth.action.run") }));
  await screen.findByText("60");

  apiMocks.runAtsCheck.mockResolvedValueOnce(ats(72, 1));
  fireEvent.click(screen.getByRole("button", { name: t("resumeHealth.action.rerun") }));

  expect(
    await screen.findByText(t("resumeHealth.delta.change", { delta: "+12" })),
  ).toBeInTheDocument();
  expect(screen.getByText(t("resumeHealth.delta.previous", { score: 60 }))).toBeInTheDocument();
});

it("简历改过之后（签名不一致）提示重新体检", async () => {
  apiMocks.runAtsCheck.mockResolvedValue(ats(62, 1));
  const first = renderPanel("sig-old");
  fireEvent.click(screen.getByRole("button", { name: t("resumeHealth.action.run") }));
  await screen.findByText("62");
  first.unmount();

  renderPanel("sig-new");
  expect(await screen.findByText(t("resumeHealth.stale"))).toBeInTheDocument();
});

it("体检失败时显示错误并可重试", async () => {
  apiMocks.runAtsCheck.mockRejectedValue(new Error("boom"));
  renderPanel();
  fireEvent.click(screen.getByRole("button", { name: t("resumeHealth.action.run") }));
  expect(await screen.findByText("boom")).toBeInTheDocument();
  // 按钮的 loading 图标自带 aria-label，可访问名会变成「loading开始体检」，用正则匹配文字部分。
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: new RegExp(t("resumeHealth.action.run")) }),
    ).toBeEnabled(),
  );
});
