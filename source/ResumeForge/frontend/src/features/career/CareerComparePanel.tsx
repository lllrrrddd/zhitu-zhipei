// SPDX-License-Identifier: Apache-2.0
/**
 * 方向对比：把「同一批岗位在不同匹配档案下的分数」摆成一张表。
 *
 * 只读本机匹配历史（`matchHistory`），不发请求——对比用的是你已经算过的分。
 * 没有可比的岗位时**整块不渲染**：一排空表和一句"暂无数据"只会占地方。
 */

import { Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import { buildCompareReport, type CompareProfileSummary } from "./careerCompare";
import type { MatchSnapshot } from "./matchHistory";

/** 逐岗位对比最多列几行：再多就不是"看方向"，是"翻历史"。 */
const JOB_ROWS = 8;

export default function CareerComparePanel({ snapshots }: { snapshots: MatchSnapshot[] }) {
  useLocale();
  const report = buildCompareReport(snapshots);
  if (report.comparedJobs === 0) return null;

  const profileColumns: TableColumnsType<CompareProfileSummary> = [
    {
      title: t("career.compare.column.profile"),
      dataIndex: "profileLabel",
      render: (_, row) => <strong>{row.profileLabel}</strong>,
    },
    {
      title: t("career.compare.column.jobs"),
      dataIndex: "jobs",
      width: 96,
      align: "center",
    },
    {
      title: t("career.compare.column.average"),
      dataIndex: "average",
      width: 96,
      align: "center",
    },
    {
      title: t("career.compare.column.wins"),
      dataIndex: "wins",
      width: 96,
      align: "center",
      render: (_, row) => (row.wins > 0 ? <Tag color="green">{row.wins}</Tag> : <span>-</span>),
    },
  ];

  return (
    <section className="career-compare">
      <header>
        <h3>{t("career.compare.title")}</h3>
        <p className="career-help">
          {t("career.compare.summary", {
            compared: report.comparedJobs,
            total: report.totalJobs,
          })}
        </p>
      </header>
      <Table
        size="small"
        rowKey="profileId"
        pagination={false}
        columns={profileColumns}
        dataSource={report.profiles}
      />
      <ul className="career-compare-jobs">
        {report.jobs.slice(0, JOB_ROWS).map((job) => (
          <li key={job.jobKey}>
            <span className="career-compare-job">
              {t("career.compare.job", { title: job.jobTitle, company: job.company })}
            </span>
            {job.scores.map((score) => (
              <Tag
                key={score.profileId}
                color={job.bestProfileId === score.profileId ? "green" : undefined}
              >
                {t("career.compare.score", {
                  profile: score.profileLabel,
                  score: score.score,
                })}
              </Tag>
            ))}
            {job.bestProfileId === null ? (
              <span className="career-help">{t("career.compare.tie")}</span>
            ) : (
              <span className="career-help">
                {t("career.compare.spread", { spread: job.spread })}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="career-help">{t("career.compare.hint")}</p>
    </section>
  );
}
