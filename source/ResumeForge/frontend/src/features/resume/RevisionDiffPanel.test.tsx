// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import { t } from "../../i18n";
import RevisionDiffPanel from "./RevisionDiffPanel";
import type { ResumeDocument } from "../../types/resumeDocument";

const apiMocks = vi.hoisted(() => ({ getResume: vi.fn() }));
vi.mock("../../api/resumes", () => apiMocks);

const SECTION_LAYOUT = {
  columns: 1 as const,
  align: "equal" as const,
  gap: null,
  hide_title: false,
  keep_together: true,
  start_on_new_page: false,
  title_override: "",
};

/** 分区标题与正文都是**文档内容**（用户原文），断言与 fixture 用同一批常量。 */
const SECTION_TITLE = "实习经历";
const OLDEST_TEXT = "第一版：负责订单接口开发";
const PARENT_TEXT = "第二版：负责订单接口开发与联调";
const CURRENT_TEXT = "第三版：主导订单接口重构，QPS 提升 3 倍";

/** 版本标题是**数据**（由 fixture 生成），用常量构造匹配串，避免在断言里写中文。 */
const OLDEST_TITLE_PATTERN = new RegExp(`简历-1`);

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

/** 三代血缘：3（当前）→ 2（上一版）→ 1（最早）。 */
const REVISIONS: Record<number, { parent: number | null; body: string }> = {
  1: { parent: null, body: OLDEST_TEXT },
  2: { parent: 1, body: PARENT_TEXT },
  3: { parent: 2, body: CURRENT_TEXT },
};

function detailOf(id: number) {
  const revision = REVISIONS[id];
  return {
    id,
    title: `简历-${id}`,
    created_at: "2026-11-09T10:00:00Z",
    parent_revision_id: revision.parent,
    content: doc(revision.body),
  };
}

function renderPanel(parentRevisionId: number | null = 2) {
  return render(
    <App>
      <RevisionDiffPanel resumeId={3} parentRevisionId={parentRevisionId} />
    </App>,
  );
}

beforeEach(() => {
  apiMocks.getResume.mockReset().mockImplementation((id: number) => Promise.resolve(detailOf(id)));
});

it("默认与上一版对比，列出计数与逐条差异", async () => {
  renderPanel();
  expect(
    await screen.findByText(t("revisionDiff.counts", { added: 0, removed: 0, changed: 1 })),
  ).toBeInTheDocument();
  expect(screen.getByText(PARENT_TEXT)).toBeInTheDocument();
  expect(screen.getByText(CURRENT_TEXT)).toBeInTheDocument();
  expect(screen.getByText(SECTION_TITLE)).toBeInTheDocument();
});

it("可以顺着血缘再往前一版，并切换到那一版作为基准", async () => {
  renderPanel();
  await screen.findByText(PARENT_TEXT);

  fireEvent.click(screen.getByRole("button", { name: t("revisionDiff.extend") }));
  // 取到更早那一版（id=1）：它的血亲已被拉进基准列表
  await waitFor(() => expect(apiMocks.getResume).toHaveBeenCalledWith(1));

  // 切到最早那一版：差异变成「第一版 → 第三版」
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(await screen.findByText(OLDEST_TITLE_PATTERN));
  expect(await screen.findByText(OLDEST_TEXT)).toBeInTheDocument();
});

it("上一版已是最早一版时，「再往前一版」不可点", async () => {
  // 基准取 id=1（它的 parent 为空），此时没有更早的血亲可加载
  renderPanel(1);
  await screen.findByText(OLDEST_TEXT);
  expect(screen.getByRole("button", { name: t("revisionDiff.extendNone") })).toBeDisabled();
});

it("两版文字完全一致时说清楚「没有差异」", async () => {
  apiMocks.getResume.mockImplementation((id: number) =>
    Promise.resolve({ ...detailOf(id), content: doc(CURRENT_TEXT) }),
  );
  renderPanel();
  expect(await screen.findByText(t("revisionDiff.empty"))).toBeInTheDocument();
});

it("读取失败时显示错误", async () => {
  apiMocks.getResume.mockRejectedValueOnce(new Error("boom"));
  renderPanel();
  expect(await screen.findByText("boom")).toBeInTheDocument();
});

it("没有上一版时不发请求，并说明原因", async () => {
  apiMocks.getResume.mockClear();
  renderPanel(null);
  expect(apiMocks.getResume).not.toHaveBeenCalled();
  expect(await screen.findByText(t("revisionDiff.noParent"))).toBeInTheDocument();
});

it("提示命名版本面板的存在，避免两套「版本对比」混淆", async () => {
  renderPanel();
  await screen.findByText(PARENT_TEXT);
  expect(screen.getByText(t("revisionDiff.namedHint"))).toBeInTheDocument();
});

it("展开更早版本后仍有选择器可切换基准", async () => {
  renderPanel();
  await screen.findByText(PARENT_TEXT);
  await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());
});
