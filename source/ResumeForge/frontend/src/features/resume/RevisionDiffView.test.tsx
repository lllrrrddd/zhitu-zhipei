// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { App } from "antd";
import { expect, it } from "vitest";
import { t } from "../../i18n";
import RevisionDiffView from "./RevisionDiffView";
import type { RevisionDiff } from "./revisionDiff";

/** 分区名与正文都是文档内容（用户原文），断言与 fixture 同源。 */
const SECTION = "实习经历";
const ENTRY_TITLE = "后端开发";
const OLD_TEXT = "负责订单接口开发";
const NEW_TEXT = "主导订单接口重构";

const DIFF: RevisionDiff = {
  counts: { added: 0, removed: 0, changed: 1 },
  identical: false,
  lines: [
    {
      kind: "changed",
      scope: "field",
      section: SECTION,
      entry: ENTRY_TITLE,
      entryOrdinal: 1,
      field: "内容",
      fieldOrdinal: 2,
      fieldIsText: false,
      before: OLD_TEXT,
      after: NEW_TEXT,
    },
  ],
};

function renderView(diff: RevisionDiff) {
  return render(
    <App>
      <RevisionDiffView diff={diff} />
    </App>,
  );
}

it("按分区/条目分组展示改前改后", () => {
  renderView(DIFF);
  expect(
    screen.getByText(t("revisionDiff.counts", { added: 0, removed: 0, changed: 1 })),
  ).toBeInTheDocument();
  expect(screen.getByText(SECTION)).toBeInTheDocument();
  expect(screen.getByText(ENTRY_TITLE)).toBeInTheDocument();
  expect(screen.getByText(OLD_TEXT)).toBeInTheDocument();
  expect(screen.getByText(NEW_TEXT)).toBeInTheDocument();
});

it("没有差异时给空状态，而不是一张空表", () => {
  renderView({ counts: { added: 0, removed: 0, changed: 0 }, identical: true, lines: [] });
  expect(screen.getByText(t("revisionDiff.empty"))).toBeInTheDocument();
});

it("条目与字段没有标题时用序号兜底（文案来自语言包）", () => {
  renderView({
    counts: { added: 0, removed: 0, changed: 1 },
    identical: false,
    lines: [
      {
        kind: "changed",
        scope: "field",
        section: SECTION,
        entry: "",
        entryOrdinal: 2,
        field: "",
        fieldOrdinal: 3,
        fieldIsText: true,
        before: OLD_TEXT,
        after: NEW_TEXT,
      },
    ],
  });
  expect(screen.getByText(t("revisionDiff.entryN", { index: 2 }))).toBeInTheDocument();
  expect(screen.getByText(t("revisionDiff.textN", { index: 3 }))).toBeInTheDocument();
});

it("整段分区被删除时只显示一条分区级差异", () => {
  renderView({
    counts: { added: 0, removed: 1, changed: 0 },
    identical: false,
    lines: [
      {
        kind: "removed",
        scope: "section",
        section: SECTION,
        entry: "",
        entryOrdinal: 0,
        field: "",
        fieldOrdinal: 0,
        fieldIsText: false,
        before: "3",
        after: "",
      },
    ],
  });
  expect(screen.getAllByText(SECTION)).toHaveLength(2); // 标题 + 那条差异
  expect(screen.getByText(t("revisionDiff.kind.removed"))).toBeInTheDocument();
});
