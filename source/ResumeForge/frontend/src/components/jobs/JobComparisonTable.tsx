// SPDX-License-Identifier: Apache-2.0
/**
 * 横向对比表：把一批岗位摆成一张可扫读的表（名次、参考分、三类条件命中数）。
 *
 * 与相邻两块的分工：
 * - 上面是「为什么排这儿」的排名说明（相对判断，不给百分比）；
 * - 这里是**一张表**，用来横向比；下面仍是每个岗位的五类结论卡片（细节）。
 *
 * 表格只消费后端已有字段，不自己算名次、不自己造分。
 */

import { App, Button, Space, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useMemo } from "react";
import { t, type MessageKey } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import {
  buildComparisonRows,
  comparisonRowsToMarkdown,
  type ComparisonRow,
} from "../../features/jobs/comparisonRows";
import type { JobMatchBatchItem } from "../../types";

const HEADER_KEYS: MessageKey[] = [
  "jobMatchBatchResult.table.column.job",
  "jobMatchBatchResult.table.column.rank",
  "jobMatchBatchResult.table.column.score",
  "jobMatchBatchResult.table.column.hard",
  "jobMatchBatchResult.table.column.core",
  "jobMatchBatchResult.table.column.bonus",
];

function tallyText(tally: ComparisonRow["hard"]): string {
  if (tally.total === 0) return "-";
  const base = t("jobMatchBatchResult.table.tally", {
    matched: tally.matched,
    total: tally.total,
  });
  return tally.blocked > 0
    ? `${base} · ${t("jobMatchBatchResult.table.blocked", { count: tally.blocked })}`
    : base;
}

export default function JobComparisonTable({ items }: { items: JobMatchBatchItem[] }) {
  useLocale();
  const { message } = App.useApp();
  const rows = useMemo(() => buildComparisonRows(items), [items]);

  const columns: TableColumnsType<ComparisonRow> = [
    {
      title: t("jobMatchBatchResult.table.column.job"),
      dataIndex: "title",
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{row.title}</Typography.Text>
          <Typography.Text type="secondary">{row.company}</Typography.Text>
        </Space>
      ),
    },
    {
      title: t("jobMatchBatchResult.table.column.rank"),
      dataIndex: "rank",
      width: 72,
      align: "center",
      render: (_, row) => row.rank ?? "-",
    },
    {
      title: t("jobMatchBatchResult.table.column.score"),
      dataIndex: "score",
      width: 96,
      align: "center",
      sorter: (left, right) => (left.score ?? -1) - (right.score ?? -1),
      defaultSortOrder: "descend",
      render: (_, row) => row.score ?? "-",
    },
    {
      title: t("jobMatchBatchResult.table.column.hard"),
      width: 150,
      render: (_, row) => tallyText(row.hard),
    },
    {
      title: t("jobMatchBatchResult.table.column.core"),
      width: 120,
      render: (_, row) => tallyText(row.core),
    },
    {
      title: t("jobMatchBatchResult.table.column.bonus"),
      width: 120,
      render: (_, row) => tallyText(row.bonus),
    },
  ];

  async function copy() {
    const headers = HEADER_KEYS.map((key) => t(key));
    try {
      await navigator.clipboard.writeText(comparisonRowsToMarkdown(rows, headers));
      message.success(t("jobMatchBatchResult.table.copied"));
    } catch {
      message.error(t("jobMatchBatchResult.table.copyFailed"));
    }
  }

  if (rows.length === 0) {
    return (
      <Typography.Text type="secondary">{t("jobMatchBatchResult.table.empty")}</Typography.Text>
    );
  }

  return (
    <div className="job-comparison-table">
      <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
        <Typography.Text strong>{t("jobMatchBatchResult.table.title")}</Typography.Text>
        <Button size="small" onClick={() => void copy()}>
          {t("jobMatchBatchResult.table.copy")}
        </Button>
      </Space>
      <Table
        size="small"
        rowKey="jobId"
        pagination={false}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 640 }}
      />
      <Typography.Text type="secondary" className="career-help">
        {t("jobMatchBatchResult.table.hint")}
      </Typography.Text>
    </div>
  );
}
