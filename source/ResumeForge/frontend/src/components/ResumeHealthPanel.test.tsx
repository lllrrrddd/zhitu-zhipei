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

// 内容质量指标要读简历正文：这里给一份最小文档（两条弱动词、一条带数字）。
const resumeMocks = vi.hoisted(() => ({ getResume: vi.fn() }));
vi.mock("../api/resumes", () => resumeMocks);

const CONTENT = {
  version: 2,
  language: "zh-CN",
  header: { name: { value: "某人" } },
  sections: [
    {
      key: "experience",
      title: "实习经历",
      kind: "entries",
      layout: "stacked",
      entries: ["负责订单接口开发", "参与需求评审", "上线 3 个接口"].map((text, index) => ({
        id: `e${index}`,
        hidden: false,
        lock_content: false,
        lock_layout: false,
        layout: "stacked" as const,
        items: [
          {
            kind: "field",
            id: `i${index}`,
            key: "summary",
            label: "",
            value: text,
            format: "text",
            wrap: "none",
            body_style: "bullet",
            placement: "body",
            show_label: false,
            solo: false,
          },
        ],
      })),
    },
  ],
};
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
  resumeMocks.getResume.mockReset().mockResolvedValue({ content: CONTENT });
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
  // ATS 给了 2 条，内容质量再补 2 条（缺量化 + 弱动词）
  expect(screen.getByText(t("resumeHealth.open", { count: 4 }))).toBeInTheDocument();
  expect(screen.getByText(issueTitle(1))).toBeInTheDocument();
  await waitFor(() => expect(window.localStorage.getItem(HEALTH_HISTORY_KEY)).not.toBeNull());
});

it("标记「已改好」后待处理条数减少，并记住这条", async () => {
  apiMocks.runAtsCheck.mockResolvedValue(ats(62, 2));
  renderPanel();
  fireEvent.click(screen.getByRole("button", { name: t("resumeHealth.action.run") }));
  await screen.findByText(issueTitle(1));

  fireEvent.click(screen.getAllByRole("button", { name: t("resumeHealth.action.markDone") })[0]);

  expect(screen.getByText(t("resumeHealth.open", { count: 3 }))).toBeInTheDocument();
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

it("把量化比例与弱动词并进清单，并在头部给出两个指标", async () => {
  apiMocks.runAtsCheck.mockResolvedValue(ats(62, 0));
  renderPanel();
  fireEvent.click(screen.getByRole("button", { name: t("resumeHealth.action.run") }));

  // 3 条正文里 1 条带数字 → 33%，低于 40% 下限，于是出现"缺量化"这一条
  expect(
    await screen.findByText(
      t("resumeHealth.quality.noNumbers.title", { quantified: 1, bullets: 3 }),
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(t("resumeHealth.quality.weak.title", { count: 2 }))).toBeInTheDocument();
  // 头部两项指标
  expect(
    screen.getByText(t("resumeHealth.quality.ratio", { quantified: 1, bullets: 3 })),
  ).toBeInTheDocument();
  expect(screen.getByText("33%")).toBeInTheDocument();
  expect(screen.getByText(t("resumeHealth.quality.weak", { count: 2 }))).toBeInTheDocument();
  // 共 3 条待处理（ATS 0 条 + 质量 2 条？此处 ATS 给了 0 条，所以是 2 条）
  expect(screen.getByText(t("resumeHealth.open", { count: 2 }))).toBeInTheDocument();
});

it("简历内容取不到时体检失败并给出错误，不写入历史", async () => {
  apiMocks.runAtsCheck.mockResolvedValue(ats(70, 1));
  resumeMocks.getResume.mockRejectedValue(new Error("content unavailable"));
  renderPanel();
  fireEvent.click(screen.getByRole("button", { name: t("resumeHealth.action.run") }));
  expect(await screen.findByText("content unavailable")).toBeInTheDocument();
  expect(window.localStorage.getItem(HEALTH_HISTORY_KEY)).toBeNull();
});
