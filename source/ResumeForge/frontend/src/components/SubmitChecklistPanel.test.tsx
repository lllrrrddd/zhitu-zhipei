// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import { t } from "../i18n";
import SubmitChecklistPanel from "./SubmitChecklistPanel";
import type { AtsCheckResult } from "../types/ats";

const atsMocks = vi.hoisted(() => ({ runAtsCheck: vi.fn() }));
const jobMocks = vi.hoisted(() => ({ getJob: vi.fn() }));
vi.mock("../api/ats", () => atsMocks);
vi.mock("../api/jobs", () => jobMocks);

/** 岗位名是用户数据（后端返回），断言用常量。 */
const JOB_TITLE = "平台运维工程师";
/** antd 会给两个汉字按钮插空格（「重试」→「重 试」），用常量正则匹配，避免在断言里写中文。 */
const RETRY_PATTERN = new RegExp("重\\s*试");
const COMPANY = "测试公司";

function atsResult(overrides: Partial<AtsCheckResult> = {}): AtsCheckResult {
  return {
    resume_id: 7,
    score: 70,
    disclaimer: "本地规则估计，不代表真实 ATS 解析结果",
    summary: {},
    subscores: { format: 80, keyword: 60, position: 100 },
    issues: [],
    matched_keywords: ["Linux"],
    missing_keywords: ["Kubernetes"],
    coverage_ratio: 0.5,
    ...overrides,
  };
}

function renderPanel(jobId: number | null = 3) {
  return render(
    <App>
      <SubmitChecklistPanel resumeId={7} jobId={jobId} />
    </App>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  atsMocks.runAtsCheck.mockReset().mockResolvedValue(atsResult());
  jobMocks.getJob
    .mockReset()
    .mockResolvedValue({
      id: 3,
      title: JOB_TITLE,
      company: COMPANY,
      description: "JD 正文",
      requirements: "要求",
    });
});

it("没有关联岗位时说明原因，不发请求", () => {
  renderPanel(null);
  expect(screen.getByText(t("submitChecklist.noJob"))).toBeInTheDocument();
  expect(jobMocks.getJob).not.toHaveBeenCalled();
  expect(atsMocks.runAtsCheck).not.toHaveBeenCalled();
});

it("自动核对给出关键词覆盖与高危条数", async () => {
  atsMocks.runAtsCheck.mockResolvedValue(
    atsResult({
      issues: [
        { category: "format", severity: "high", title: "联系方式缺失", detail: "", evidence: [] },
        { category: "keyword", severity: "low", title: "小问题", detail: "", evidence: [] },
      ],
    }),
  );
  renderPanel();

  expect(
    await screen.findByText(t("submitChecklist.auto.coverage.line", { matched: 1, total: 2 })),
  ).toBeInTheDocument();
  expect(screen.getByText(t("submitChecklist.auto.issues.line", { count: 1 }))).toBeInTheDocument();
  // 缺失词要点名
  expect(
    screen.getByText(t("submitChecklist.auto.coverage.missing", { values: "Kubernetes" })),
  ).toBeInTheDocument();
});

it("勾选人工项会记到本机，并更新完成度", async () => {
  renderPanel();
  const first = await screen.findByRole("checkbox", {
    name: t("submitChecklist.manual.contact"),
  });
  fireEvent.click(first);

  expect(
    screen.getByText(t("submitChecklist.progress", { done: 1, total: 6 })),
  ).toBeInTheDocument();
  const stored = JSON.parse(window.localStorage.getItem("rf.resume.submitChecklist.v1") ?? "{}");
  expect(stored["7:3"]).toEqual({ contact: true });
});

it("复制清单：含勾选标记与关键词覆盖", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  renderPanel();
  await screen.findByText(t("submitChecklist.auto.coverage.line", { matched: 1, total: 2 }));

  fireEvent.click(screen.getByRole("button", { name: t("submitChecklist.copy") }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  const text = writeText.mock.calls[0][0] as string;
  expect(text).toContain(t("submitChecklist.copy.title", { job: `${JOB_TITLE} · ${COMPANY}` }));
  expect(text).toContain("- [ ] ");
  expect(await screen.findByText(t("submitChecklist.copied"))).toBeInTheDocument();
});

it("读岗位失败时给错误与重试，不静默", async () => {
  jobMocks.getJob.mockRejectedValueOnce(new Error("boom"));
  renderPanel();
  expect(await screen.findByText("boom")).toBeInTheDocument();
  // antd 会给两个汉字的按钮自动插空格（「重试」渲染成「重 试」），所以用正则匹配。
  expect(screen.getByText(RETRY_PATTERN)).toBeInTheDocument();
});
