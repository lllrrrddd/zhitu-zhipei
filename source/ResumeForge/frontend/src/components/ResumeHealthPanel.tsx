// SPDX-License-Identifier: Apache-2.0
/**
 * 简历体检面板：一张单子把 ATS 检测与风险扫描合起来，并记住"哪条改过了"。
 *
 * 与两个已有面板的分工：
 * - `AtsCheckPanel` 负责"单项深入"（可载入 JD、看关键词命中次数与分区）；
 * - `ResumeRiskPanel` 负责"跑风险扫描"（可能要调模型，所以由用户点开始）；
 * - 这里负责**汇总与台账**：合并清单、按严重程度排、逐条标记、复检看分数变化。
 *
 * 体检本身只调 ATS（纯本地规则，不烧模型）；风险点是否并进来，取决于用户有没有跑过扫描。
 */

import { Alert, App, Button, Empty, Space, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { runAtsCheck } from "../api/ats";
import { getResume } from "../api/resumes";
import { t, type MessageKey } from "../i18n";
import { useLocale } from "../i18n/i18nContext";
import type { AtsCheckResult } from "../types/ats";
import { formatDateTime } from "../utils/format";
import { useRiskScan } from "../features/resume/riskScanStore";
import { analyzeContent, type QualityFindings } from "../features/resume/qualityMetrics";
import { diffEntries, summarizeIssues } from "../features/resume/healthCheck";
import {
  appendEntry,
  buildIssues,
  countOpen,
  healthDelta,
  loadHistory,
  loadIssueStates,
  saveHistory,
  shortHash,
  sortIssues,
  saveIssueStates,
  setIssueState,
  type HealthIssue,
  type HealthIssueStates,
  type HealthSeverity,
} from "../features/resume/healthCheck";
import "../styles/resume-health.css";

const SEVERITY_COLOR: Record<HealthSeverity, string> = {
  high: "red",
  medium: "gold",
  low: "blue",
};

const SEVERITY_LABEL: Record<HealthSeverity, MessageKey> = {
  high: "atsCheck.severity.high",
  medium: "atsCheck.severity.medium",
  low: "atsCheck.severity.low",
};

const ATS_CATEGORY_LABEL: Record<string, MessageKey> = {
  format: "atsCheck.category.format.label",
  keyword: "atsCheck.category.keyword.label",
  position: "atsCheck.category.position.label",
};

/** 内容质量两类：量化与动词。都归到「内容质量」这一栏显示。 */
const QUALITY_CATEGORY_LABEL: Record<string, MessageKey> = {
  quantified: "resumeHealth.quality.category",
  verb: "resumeHealth.quality.category",
};

const RISK_CATEGORY_LABEL: Record<string, MessageKey> = {
  duplicate: "riskPanel.category.duplicate.label",
  sensitive: "riskPanel.category.sensitive.label",
  exaggeration: "riskPanel.category.exaggeration.label",
  deep_dive: "riskPanel.category.deepDive.label",
  compliance: "riskPanel.category.compliance.label",
};

function readStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function categoryLabel(issue: HealthIssue): string {
  const key =
    issue.source === "ats"
      ? ATS_CATEGORY_LABEL
      : issue.source === "quality"
        ? QUALITY_CATEGORY_LABEL
        : RISK_CATEGORY_LABEL;
  const label = key[issue.category as keyof typeof key];
  return label ? t(label) : issue.category;
}

/** 把「量化不足 / 弱动词」两条判定变成清单条目；文案走语言包。 */
function qualityIssues(finding: QualityFindings): HealthIssue[] {
  const issues: HealthIssue[] = [];
  if (finding.lowQuantified) {
    issues.push({
      fingerprint: shortHash(
        ["quality", "no_numbers", String(finding.quantified), String(finding.bullets)].join("|"),
      ),
      source: "quality",
      severity: "medium",
      category: "quantified",
      title: t("resumeHealth.quality.noNumbers.title", {
        quantified: finding.quantified,
        bullets: finding.bullets,
      }),
      detail: t("resumeHealth.quality.noNumbers.detail"),
      suggestion: t("resumeHealth.quality.noNumbers.suggestion"),
      evidence: [],
      location: "",
    });
  }
  if (finding.manyWeakVerbs) {
    issues.push({
      fingerprint: shortHash(["quality", "weak_verb", String(finding.weakCount)].join("|")),
      source: "quality",
      severity: "low",
      category: "verb",
      title: t("resumeHealth.quality.weak.title", { count: finding.weakCount }),
      detail: t("resumeHealth.quality.weak.detail", {
        examples: finding.weakExamples.join("；"),
      }),
      suggestion: t("resumeHealth.quality.weak.suggestion"),
      evidence: finding.weakExamples,
      location: finding.weakSections[0] ?? "",
    });
  }
  return issues;
}

export default function ResumeHealthPanel({
  resumeId,
  signature,
}: {
  resumeId: number;
  /** 简历内容签名：用来提示"这份体检是改简历之前跑的"。 */
  signature?: string;
}) {
  useLocale();
  const { message } = App.useApp();
  const risk = useRiskScan(resumeId);
  const [ats, setAts] = useState<AtsCheckResult | null>(null);
  const [quality, setQuality] = useState<QualityFindings | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(() => loadHistory(readStorage()));
  const [states, setStates] = useState<HealthIssueStates>(() => loadIssueStates(readStorage()));

  const entries = history[String(resumeId)] ?? [];
  const latest = entries[entries.length - 1];
  const previous = entries[entries.length - 2];
  const delta = healthDelta(entries);
  const diff = diffEntries(previous, latest);
  const issues = useMemo(
    () =>
      sortIssues([...buildIssues(ats, risk.result), ...(quality ? qualityIssues(quality) : [])]),
    [ats, risk.result, quality],
  );
  const counts = countOpen(issues, states[String(resumeId)]);
  const stale = Boolean(latest && signature && latest.signature && latest.signature !== signature);

  async function run() {
    if (running) return;
    setRunning(true);
    setError("");
    try {
      // ATS 是本地规则、简历内容是同一台后端的一次 GET：并行取，不串行等两次往返。
      const [result, detail] = await Promise.all([runAtsCheck(resumeId, ""), getResume(resumeId)]);
      const finding = analyzeContent(detail.content);
      setAts(result);
      setQuality(finding);
      const riskCount = risk.result?.points.length ?? 0;
      const merged = sortIssues([...buildIssues(result, risk.result), ...qualityIssues(finding)]);
      const next = appendEntry(history, resumeId, {
        at: new Date().toISOString(),
        signature: signature ?? "",
        score: result.score,
        subscores: result.subscores ?? {},
        issueCount: merged.length,
        riskCount,
        quality: {
          bullets: finding.bullets,
          quantified: finding.quantified,
          ratio: finding.ratio,
          weakCount: finding.weakCount,
        },
        issues: summarizeIssues(merged),
      });
      setHistory(next);
      saveHistory(readStorage(), next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("resumeHealth.error"));
    } finally {
      setRunning(false);
    }
  }

  function mark(issue: HealthIssue, state: "done" | "ignored" | "todo") {
    const next = setIssueState(states, resumeId, issue.fingerprint, state);
    setStates(next);
    saveIssueStates(readStorage(), next);
  }

  async function copy(issue: HealthIssue) {
    const text = [issue.title, issue.suggestion].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      message.success(t("resumeHealth.action.copied"));
    } catch {
      message.error(t("resumeHealth.action.copyFailed"));
    }
  }

  const score = ats?.score ?? latest?.score;
  if (score === undefined) {
    return (
      <div className="resume-health">
        <Alert
          type="info"
          showIcon
          title={t("resumeHealth.intro.title")}
          description={t("resumeHealth.intro.body")}
        />
        <Space className="resume-health-actions">
          <Button type="primary" loading={running} onClick={() => void run()}>
            {running ? t("resumeHealth.action.running") : t("resumeHealth.action.run")}
          </Button>
        </Space>
        {error && <Alert type="error" showIcon title={error} />}
      </div>
    );
  }

  return (
    <div className="resume-health">
      <div className="resume-health-score">
        <span className="resume-health-total">{score}</span>
        <div className="resume-health-meta">
          <strong>{t("resumeHealth.score.label")}</strong>
          {latest && (
            <span className="career-help">
              {t("resumeHealth.score.lastAt", { time: formatDateTime(latest.at) })}
            </span>
          )}
          {delta && (
            <Tag color={delta.score > 0 ? "green" : delta.score < 0 ? "orange" : "default"}>
              {delta.score === 0
                ? t("resumeHealth.delta.same")
                : t("resumeHealth.delta.change", {
                    delta: delta.score > 0 ? `+${delta.score}` : `${delta.score}`,
                  })}
            </Tag>
          )}
          <Tag>{t("resumeHealth.open", { count: counts.open })}</Tag>
        </div>
      </div>

      {latest?.subscores && (
        <div className="resume-health-subscores">
          {Object.entries(latest.subscores).map(([key, value]) => (
            <span key={key}>
              {ATS_CATEGORY_LABEL[key] ? t(ATS_CATEGORY_LABEL[key]) : key}
              <b>{value}</b>
            </span>
          ))}
        </div>
      )}

      {diff && (
        <details className="resume-health-diff">
          <summary>{t("resumeHealth.diff.title")}</summary>
          <ul>
            <li>
              {t("resumeHealth.diff.resolved", { count: diff.resolved.length })}
              {diff.resolved.length > 0 && (
                <span className="career-help">
                  ：{diff.resolved.map((issue) => issue.title).join("；")}
                </span>
              )}
            </li>
            <li>
              {t("resumeHealth.diff.added", { count: diff.added.length })}
              {diff.added.length > 0 && (
                <span className="career-help">
                  ：{diff.added.map((issue) => issue.title).join("；")}
                </span>
              )}
            </li>
            <li>{t("resumeHealth.diff.remaining", { count: diff.remaining.length })}</li>
          </ul>
        </details>
      )}

      {(quality ?? latest?.quality) && (
        <div className="resume-health-subscores">
          <span>
            {t("resumeHealth.quality.ratio", {
              quantified: (quality ?? latest?.quality)!.quantified,
              bullets: (quality ?? latest?.quality)!.bullets,
            })}
            <b>{Math.round(((quality ?? latest?.quality)!.ratio ?? 0) * 100)}%</b>
          </span>
          <span>
            {t("resumeHealth.quality.weak", {
              count: (quality ?? latest?.quality)!.weakCount,
            })}
          </span>
        </div>
      )}

      {stale && <Alert type="warning" showIcon title={t("resumeHealth.stale")} />}
      {!risk.result && <p className="career-help">{t("resumeHealth.risk.missing")}</p>}
      {previous && (
        <p className="career-help">{t("resumeHealth.delta.previous", { score: previous.score })}</p>
      )}

      {issues.length === 0 ? (
        <Empty description={t("resumeHealth.empty")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <ul className="resume-health-issues">
          {issues.map((issue) => {
            const state = states[String(resumeId)]?.[issue.fingerprint] ?? "todo";
            return (
              <li key={issue.fingerprint} className={`resume-health-issue is-${state}`}>
                <div className="resume-health-issue-head">
                  <Tag color={SEVERITY_COLOR[issue.severity]}>
                    {t(SEVERITY_LABEL[issue.severity])}
                  </Tag>
                  <Tag>{categoryLabel(issue)}</Tag>
                  <strong>{issue.title || t("resumeHealth.issue.untitled")}</strong>
                </div>
                {issue.detail && <Typography.Text type="secondary">{issue.detail}</Typography.Text>}
                {issue.suggestion && <p>{issue.suggestion}</p>}
                <Space size={4} wrap className="resume-health-issue-actions">
                  {state === "todo" ? (
                    <>
                      <Button size="small" type="primary" ghost onClick={() => mark(issue, "done")}>
                        {t("resumeHealth.action.markDone")}
                      </Button>
                      <Button size="small" onClick={() => mark(issue, "ignored")}>
                        {t("resumeHealth.action.ignore")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Tag color={state === "done" ? "green" : "default"}>
                        {state === "done"
                          ? t("resumeHealth.state.done")
                          : t("resumeHealth.state.ignored")}
                      </Tag>
                      <Button size="small" type="link" onClick={() => mark(issue, "todo")}>
                        {t("resumeHealth.action.undo")}
                      </Button>
                    </>
                  )}
                  {issue.suggestion && (
                    <Button size="small" type="link" onClick={() => void copy(issue)}>
                      {t("resumeHealth.action.copy")}
                    </Button>
                  )}
                </Space>
              </li>
            );
          })}
        </ul>
      )}

      <Space className="resume-health-actions">
        <Button loading={running} onClick={() => void run()}>
          {running ? t("resumeHealth.action.running") : t("resumeHealth.action.rerun")}
        </Button>
        <span className="career-help">{t("resumeHealth.hint")}</span>
      </Space>
      {error && <Alert type="error" showIcon title={error} />}
    </div>
  );
}
