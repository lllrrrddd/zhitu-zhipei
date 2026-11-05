// SPDX-License-Identifier: Apache-2.0
import { Card, Space, Typography } from "antd";
import { useMemo } from "react";
import { t } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import GraduateAdviceFeedback from "./GraduateAdviceFeedback";
import type { GraduateDecision, GraduateJob, GraduateProfile } from "./types";

const { Paragraph, Text } = Typography;
const degreeLevel = { bachelor: 1, master: 2, doctor: 3 } as const;

function nextQuestion(
  decision: GraduateDecision,
  job: GraduateJob | undefined,
  profile: GraduateProfile,
): string | null {
  if (decision.status !== "review" || !job) return null;
  if (job.degree_floor === "unknown") return t("graduate.questionDegree");
  if (degreeLevel[profile.degree] < degreeLevel[job.degree_floor] && job.degree_exception) {
    return t("graduate.questionException");
  }
  if (job.graduation_year && job.graduation_year !== profile.graduation_year) {
    return t("graduate.questionYear");
  }
  if (!decision.major_fit) return t("graduate.questionMajor");
  const missing = job.core_skills.filter((skill) => !decision.matched_core.includes(skill));
  return missing.length ? t("graduate.questionSkill", { skills: missing.join("\u3001") }) : null;
}

export default function GraduateDecisionGroup({
  titleKey,
  items,
  jobs,
  profile,
}: {
  titleKey: MessageKey;
  items: GraduateDecision[];
  jobs: GraduateJob[];
  profile: GraduateProfile;
}) {
  useLocale();
  const byId = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  if (!items.length) return null;
  return (
    <Card title={`${t(titleKey)} · ${t("graduate.count", { count: items.length })}`} size="small">
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        {items.map((item) => {
          const job = byId.get(item.job_id);
          const question = nextQuestion(item, job, profile);
          const evidenceRows = [
            ...new Map(
              Object.values(item.matched_evidence)
                .flat()
                .map((source) => [`${source.skill}\u0000${source.excerpt}`, source]),
            ).values(),
          ];
          const supportedCore = item.matched_core.find(
            (skill) => item.matched_evidence[skill]?.length,
          );
          const adviceEvidence = supportedCore ? item.matched_evidence[supportedCore][0] : null;
          return (
            <div key={item.job_id}>
              <Text strong>
                {job ? `${job.company} · ${job.title} · ${job.city}` : item.job_id}
              </Text>
              <Paragraph style={{ marginBottom: 4 }}>{item.reason}</Paragraph>
              {question && (
                <Paragraph type="warning" style={{ marginBottom: 4 }}>
                  {question}
                </Paragraph>
              )}
              {item.matched_core.length > 0 && (
                <Paragraph style={{ marginBottom: 4 }}>
                  {t("graduate.matched", { skills: item.matched_core.join("\u3001") })}
                </Paragraph>
              )}
              {evidenceRows.map((source) => (
                <Paragraph
                  key={`${source.skill}\u0000${source.excerpt}`}
                  type="secondary"
                  style={{ marginBottom: 4 }}
                >
                  {t("graduate.aliasEvidence", {
                    skill: source.skill,
                    excerpt: source.excerpt,
                  })}
                </Paragraph>
              ))}
              {supportedCore && adviceEvidence && (
                <details>
                  <summary>{t("graduate.resumeAdviceTitle")}</summary>
                  <Paragraph style={{ marginBottom: 4 }}>
                    {t("graduate.resumeAdvice", {
                      skill: supportedCore,
                      excerpt: adviceEvidence.excerpt,
                    })}
                  </Paragraph>
                  <GraduateAdviceFeedback
                    profileId={profile.id}
                    jobId={item.job_id}
                    sourceUrl={item.source_url}
                    skill={supportedCore}
                    excerpt={adviceEvidence.excerpt}
                  />
                </details>
              )}
              <Typography.Link href={item.source_url} target="_blank" rel="noopener noreferrer">
                {t("graduate.source")}
              </Typography.Link>
              {job?.source_checked_at && (
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  {t("graduate.sourceCheckedAt", { date: job.source_checked_at })}
                </Text>
              )}
            </div>
          );
        })}
      </Space>
    </Card>
  );
}
