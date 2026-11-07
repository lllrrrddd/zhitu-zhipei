// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Space, Tag } from "antd";
import { useState } from "react";
import { diagnoseCareerResume } from "../../api/career";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import type { CareerDiagnosis, CareerProfile, MarketJob } from "./types";

const PART_LABELS = {
  keyword: "career.check.part.keyword",
  quantified: "career.check.part.quantified",
  action: "career.check.part.action",
  readiness: "career.check.part.readiness",
} as const;

const STATE_LABELS = {
  found: "career.check.state.found",
  mentioned: "career.check.state.mentioned",
  missing: "career.check.state.missing",
} as const;

const ISSUE_LABELS = {
  missing_keyword: "career.check.issue.missing_keyword",
  mentioned_only: "career.check.issue.mentioned_only",
  no_numbers: "career.check.issue.no_numbers",
  weak_verb: "career.check.issue.weak_verb",
  no_experience: "career.check.issue.no_experience",
  few_skills: "career.check.issue.few_skills",
} as const;

/** 岗位定向诊断：用户点一次才发请求，避免一页八张卡片同时打后端。 */
export default function CareerDiagnosisPanel({
  profile,
  job,
}: {
  profile: CareerProfile;
  job: MarketJob;
}) {
  useLocale();
  const [result, setResult] = useState<CareerDiagnosis | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run() {
    if (running) return;
    setRunning(true);
    setFailed(false);
    try {
      setResult(await diagnoseCareerResume(profile, job));
    } catch {
      setFailed(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Space orientation="vertical" size="small" style={{ width: "100%", marginBottom: 8 }}>
      <Space size="small" wrap>
        <strong>{t("career.check.title")}</strong>
        <Button size="small" onClick={run} loading={running} disabled={running}>
          {t(running ? "career.check.running" : "career.check.run")}
        </Button>
      </Space>
      {failed && <Alert type="warning" showIcon title={t("career.check.failed")} />}
      {result && (
        <div className="career-score">
          <div className="career-score-head">
            <span className="career-score-value">{result.score}</span>
            <span className="career-score-unit">{t("career.score.unit")}</span>
            <span className="career-score-relatedness">
              {t("career.check.coverage", { percent: Math.round(result.coverage * 100) })}
            </span>
          </div>
          <ul className="career-score-parts">
            {result.parts.map((part) => (
              <li key={part.key}>
                <span className="career-score-part-label">{t(PART_LABELS[part.key])}</span>
                <span className="career-score-bar">
                  <i style={{ width: `${part.value}%` }} />
                </span>
                <em>{part.value}</em>
              </li>
            ))}
          </ul>
          {result.terms.length > 0 ? (
            <p className="career-check-terms">
              {result.terms.map((term) => (
                <Tag key={term.term} color={term.state === "missing" ? "red" : "gold"}>
                  {term.term} · {t(STATE_LABELS[term.state])}
                </Tag>
              ))}
            </p>
          ) : (
            <p className="career-help">{t("career.check.noTerms")}</p>
          )}
          {result.issues.length > 0 && (
            <ul className="career-check-issues">
              {result.issues.map((issue, index) => (
                <li key={`${issue.key}-${index}`}>
                  {t(ISSUE_LABELS[issue.key], {
                    values: issue.values.join("、"),
                    excerpt: issue.excerpt,
                  })}
                </li>
              ))}
            </ul>
          )}
          <p className="career-help">{t("career.check.scope")}</p>
        </div>
      )}
    </Space>
  );
}
