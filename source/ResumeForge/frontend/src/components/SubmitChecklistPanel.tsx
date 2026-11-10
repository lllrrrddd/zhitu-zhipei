// SPDX-License-Identifier: Apache-2.0
/**
 * 「投递自检」面板：投这份简历给这个岗位之前，走一遍能自动判断的 + 只能人确认的。
 *
 * 与相邻 Tab 的分工：
 * - 体检单 / ATS / 风险：**改简历**时看的诊断；
 * - 这里是**投递前**的核对单：关键词覆盖够不够、有没有高危问题、以及六件只有你能确认的事。
 *
 * 数据：JD 取关联岗位、覆盖与高危问题复用 ATS 本地检测（带 JD 跑一次）。勾选状态只存本机。
 */

import { Alert, App, Button, Checkbox, Empty, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runAtsCheck } from "../api/ats";
import { getJob } from "../api/jobs";
import { t } from "../i18n";
import { useLocale } from "../i18n/i18nContext";
import {
  buildChecklist,
  checklistToText,
  lastHealthScore,
  loadChecks,
  MANUAL_ITEMS,
  progressOf,
  saveChecks,
  scopeKey,
  toggleCheck,
  type SubmitChecklist,
} from "../features/resume/submitChecklist";
import { MAX_JOB_TEXT_CHARS } from "../config";
// 面板自己带样式（同 RevisionDiffView 的教训：别指望宿主记得引）。
import "../styles/resume-health.css";

/** 取一次自检数据：读岗位 → 拼 JD → 跑 ATS。纯取数，不碰组件状态。 */
async function fetchChecklist(
  resumeId: number,
  jobId: number,
): Promise<{ jobLabel: string; checklist: SubmitChecklist }> {
  const job = await getJob(jobId);
  // 与 ATS 面板同口径：JD 只取描述与要求，超长先裁掉（后端 422 在这里避免）。
  const jdText = [job.description, job.requirements]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_JOB_TEXT_CHARS);
  const result = await runAtsCheck(resumeId, jdText);
  return {
    jobLabel: `${job.title}${job.company ? ` · ${job.company}` : ""}`,
    checklist: buildChecklist({
      matchedKeywords: result.matched_keywords,
      missingKeywords: result.missing_keywords,
      highIssues: result.issues.filter((issue) => issue.severity === "high").length,
    }),
  };
}

function readStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function SubmitChecklistPanel({
  resumeId,
  jobId,
}: {
  resumeId: number;
  jobId: number | null;
}) {
  useLocale();
  const { message } = App.useApp();
  const [checklist, setChecklist] = useState<SubmitChecklist | null>(null);
  const [jobLabel, setJobLabel] = useState("");
  // 勾选状态直接从本机读初值（effect 里同步 setState 会触发级联渲染，也没必要）。
  const [checks, setChecks] = useState<Record<string, boolean>>(() =>
    jobId === null ? {} : loadChecks(readStorage(), scopeKey(resumeId, jobId)),
  );
  const [error, setError] = useState("");
  // 加载态由数据推导：effect 里只调取数、不写 setState（避免级联渲染与 lint 警告）。
  const loading = jobId !== null && !error && !checklist;
  const alive = useRef(true);

  const scope = jobId === null ? "" : scopeKey(resumeId, jobId);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const applyResult = useCallback((data: { jobLabel: string; checklist: SubmitChecklist }) => {
    setJobLabel(data.jobLabel);
    setChecklist(data.checklist);
  }, []);
  const applyError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : t("submitChecklist.error"));
  }, []);

  /** 重试用：清掉错误态再取一次（都在事件回调里，不进 effect）。 */
  const retry = useCallback(() => {
    if (jobId === null) return;
    setError("");
    void fetchChecklist(resumeId, jobId).then(applyResult).catch(applyError);
  }, [applyError, applyResult, jobId, resumeId]);

  useEffect(() => {
    if (jobId === null) return;
    let cancelled = false;
    void fetchChecklist(resumeId, jobId)
      .then((data) => {
        if (!cancelled) applyResult(data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) applyError(cause);
      });
    return () => {
      cancelled = true;
    };
  }, [applyError, applyResult, jobId, resumeId]);

  const progress = useMemo(() => progressOf(checks, MANUAL_ITEMS), [checks]);
  const score = useMemo(() => lastHealthScore(readStorage(), resumeId), [resumeId]);

  function toggle(key: string, checked: boolean) {
    const next = toggleCheck(checks, key, checked);
    setChecks(next);
    saveChecks(readStorage(), scope, next);
  }

  async function copy() {
    const autoLines: string[] = [];
    if (checklist?.coverage) {
      autoLines.push(
        t("submitChecklist.auto.coverage.line", {
          matched: checklist.coverage.matched,
          total: checklist.coverage.total,
        }),
      );
      if (checklist.coverage.missing.length > 0) {
        autoLines.push(
          t("submitChecklist.auto.coverage.missing", {
            values: checklist.coverage.missing.join("、"),
          }),
        );
      }
    }
    if (checklist) {
      autoLines.push(t("submitChecklist.auto.issues.line", { count: checklist.highIssues }));
    }
    const text = checklistToText({
      title: t("submitChecklist.copy.title", { job: jobLabel || t("submitChecklist.noJob") }),
      autoLines,
      manualLines: MANUAL_ITEMS.map((key) => ({
        label: t(`submitChecklist.manual.${key}`),
        checked: checks[key] === true,
      })),
      footer: score === null ? "" : t("submitChecklist.copy.footer", { score }),
    });
    try {
      await navigator.clipboard.writeText(text);
      message.success(t("submitChecklist.copied"));
    } catch {
      message.error(t("submitChecklist.copyFailed"));
    }
  }

  if (jobId === null) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("submitChecklist.noJob")} />;
  }

  return (
    <div className="submit-checklist">
      {loading && (
        <Typography.Text type="secondary">{t("submitChecklist.loading")}</Typography.Text>
      )}
      {error && (
        <>
          <Alert type="error" showIcon title={error} />
          {/* 重试按钮放正文里而不是 Alert 的 action 槽：这一层 antd 版本不渲染 action。 */}
          <Space>
            <Button size="small" onClick={retry}>
              {t("submitChecklist.retry")}
            </Button>
          </Space>
        </>
      )}
      {!loading && !error && checklist && (
        <>
          <div className="submit-checklist-head">
            <Typography.Text strong>{jobLabel}</Typography.Text>
            <Tag color={progress.done === progress.total ? "green" : "gold"}>
              {t("submitChecklist.progress", { done: progress.done, total: progress.total })}
            </Tag>
          </div>

          <section className="submit-checklist-auto">
            <strong>{t("submitChecklist.auto.title")}</strong>
            {checklist.coverage ? (
              <p>
                <Tag color={checklist.coverage.missing.length === 0 ? "green" : "gold"}>
                  {t("submitChecklist.auto.coverage.line", {
                    matched: checklist.coverage.matched,
                    total: checklist.coverage.total,
                  })}
                </Tag>
                {checklist.coverage.missing.length > 0 && (
                  <span className="career-help">
                    {t("submitChecklist.auto.coverage.missing", {
                      values: checklist.coverage.missing.join("、"),
                    })}
                  </span>
                )}
              </p>
            ) : (
              <p className="career-help">{t("submitChecklist.auto.coverage.none")}</p>
            )}
            <p>
              <Tag color={checklist.highIssues === 0 ? "green" : "red"}>
                {t("submitChecklist.auto.issues.line", { count: checklist.highIssues })}
              </Tag>
              <span className="career-help">{t("submitChecklist.auto.issues.hint")}</span>
            </p>
          </section>

          <section className="submit-checklist-manual">
            <strong>{t("submitChecklist.manual.title")}</strong>
            <ul>
              {MANUAL_ITEMS.map((key) => (
                <li key={key}>
                  <Checkbox
                    checked={checks[key] === true}
                    onChange={(event) => toggle(key, event.target.checked)}
                  >
                    {t(`submitChecklist.manual.${key}`)}
                  </Checkbox>
                </li>
              ))}
            </ul>
          </section>

          {score !== null && (
            <p className="career-help">{t("submitChecklist.healthNote", { score })}</p>
          )}
          <Space>
            <Button onClick={() => void copy()}>{t("submitChecklist.copy")}</Button>
            <Button onClick={retry} loading={loading}>
              {t("submitChecklist.refresh")}
            </Button>
          </Space>
          <p className="career-help">{t("submitChecklist.hint")}</p>
        </>
      )}
    </div>
  );
}
