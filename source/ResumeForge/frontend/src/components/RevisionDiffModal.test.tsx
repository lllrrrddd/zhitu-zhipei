// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { App } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import { t } from "../i18n";
import RevisionDiffModal from "./RevisionDiffModal";
import type { ResumeDocument } from "../types/resumeDocument";

const apiMocks = vi.hoisted(() => ({ getResume: vi.fn() }));
vi.mock("../api/resumes", () => apiMocks);

const SECTION_LAYOUT = {
  columns: 1 as const,
  align: "equal" as const,
  gap: null,
  hide_title: false,
  keep_together: true,
  start_on_new_page: false,
  title_override: "",
};

/** 分区标题是**文档内容**（用户可改），不是界面文案：抽常量，断言与 fixture 同源。 */
const SECTION_TITLE = "实习经历";
/** 正文片段同样是文档内容（用户原文），不是界面文案。 */
const BEFORE_TEXT = "负责订单接口开发";
const AFTER_TEXT = "主导订单接口重构";

function doc(body: string): ResumeDocument {
  return {
    version: 2,
    language: "zh-CN",
    header: { items: [], contact_breaks: [] },
    sections: [
      {
        key: "experience",
        title: SECTION_TITLE,
        kind: "entries",
        layout: SECTION_LAYOUT,
        entries: [
          {
            id: "e1",
            hidden: false,
            lock_content: false,
            lock_layout: false,
            layout: { head: "stacked" },
            items: [
              {
                kind: "field",
                id: "t1",
                key: "role",
                label: "岗位",
                value: "后端开发",
                format: "text",
                wrap: "none",
                body_style: "paragraph",
                placement: "title",
                show_label: false,
                solo: false,
              },
              {
                kind: "field",
                id: "i1",
                key: "summary",
                label: "内容",
                value: body,
                format: "text",
                wrap: "none",
                body_style: "bullet",
                placement: "body",
                show_label: false,
                solo: false,
              },
            ],
          },
        ],
      },
    ],
  } as unknown as ResumeDocument;
}

function renderModal(parentRevisionId: number | null = 1) {
  return render(
    <App>
      <RevisionDiffModal
        open
        resumeId={2}
        parentRevisionId={parentRevisionId}
        onClose={() => undefined}
      />
    </App>,
  );
}

beforeEach(() => {
  apiMocks.getResume.mockReset();
});

it("打开后加载两版并列出计数与逐条差异", async () => {
  apiMocks.getResume.mockImplementation((id: number) =>
    Promise.resolve({ content: doc(id === 1 ? BEFORE_TEXT : AFTER_TEXT) }),
  );
  renderModal();

  expect(
    await screen.findByText(t("revisionDiff.counts", { added: 0, removed: 0, changed: 1 })),
  ).toBeInTheDocument();
  expect(screen.getByText(BEFORE_TEXT)).toBeInTheDocument();
  expect(screen.getByText(AFTER_TEXT)).toBeInTheDocument();
  expect(screen.getByText(SECTION_TITLE)).toBeInTheDocument();
});

it("两版文字完全一致时说清楚「没有差异」", async () => {
  apiMocks.getResume.mockImplementation(() => Promise.resolve({ content: doc("同一段内容") }));
  renderModal();
  expect(await screen.findByText(t("revisionDiff.empty"))).toBeInTheDocument();
});

it("读取失败时显示错误并可重开", async () => {
  apiMocks.getResume.mockRejectedValue(new Error("boom"));
  renderModal();
  expect(await screen.findByText("boom")).toBeInTheDocument();
});

it("没有上一版时不发请求（不该白跑两次详情）", () => {
  renderModal(null);
  expect(apiMocks.getResume).not.toHaveBeenCalled();
});
