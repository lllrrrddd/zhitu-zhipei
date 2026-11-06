// SPDX-License-Identifier: Apache-2.0
import { Space, Tag, Typography } from "antd";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import type { GraduateDecision, GraduateJob, GraduateProfile } from "./types";

const { Paragraph, Text } = Typography;
const degreeLevel = { bachelor: 1, master: 2, doctor: 3 } as const;

type Check = {
  label: string;
  value: string;
  state: "yes" | "no" | "review";
  evidence?: string;
  source?: string;
};

export default function GraduateRequirementChecklist({
  decision,
  job,
  profile,
}: {
  decision: GraduateDecision;
  job: GraduateJob;
  profile: GraduateProfile;
}) {
  useLocale();
  const skillsNotEvaluated =
    decision.status === "blocked" ||
    decision.status === "expired" ||
    job.degree_floor === "unknown" ||
    (job.degree_exception && degreeLevel[profile.degree] < degreeLevel[job.degree_floor]) ||
    Boolean(job.graduation_year && job.graduation_year !== profile.graduation_year);
  const degreeState =
    job.degree_floor === "unknown"
      ? "review"
      : degreeLevel[profile.degree] >= degreeLevel[job.degree_floor]
        ? "yes"
        : job.degree_exception
          ? "review"
          : "no";
  const checks: Check[] = [
    {
      label: t("graduate.jobDegree"),
      value:
        job.degree_floor === "unknown"
          ? t("graduate.degree.unknown")
          : t(`graduate.degree.${job.degree_floor}`),
      state: degreeState,
      evidence: t(`graduate.degree.${profile.degree}`),
      source: job.source_fragments?.degree_floor,
    },
  ];
  if (job.graduation_year) {
    checks.push({
      label: t("graduate.jobYear"),
      value: String(job.graduation_year),
      state: profile.graduation_year === job.graduation_year ? "yes" : "review",
      evidence: String(profile.graduation_year),
      source: job.source_fragments?.graduation_year,
    });
  }
  if (job.preferred_majors.length) {
    checks.push({
      label: t("graduate.jobMajors"),
      value: job.preferred_majors.join("、"),
      state: skillsNotEvaluated ? "review" : decision.major_fit ? "yes" : "review",
      evidence: profile.major,
      source: job.source_fragments?.preferred_majors,
    });
  }
  for (const skill of job.core_skills) {
    checks.push({
      label: t("graduate.jobSkills"),
      value: skill,
      state: skillsNotEvaluated
        ? "review"
        : decision.matched_core.includes(skill)
          ? "yes"
          : "review",
      evidence: skillsNotEvaluated
        ? t("graduate.checkNotEvaluated")
        : decision.matched_evidence[skill]?.map((item) => item.excerpt).join("；"),
      source: job.source_fragments?.core_skills,
    });
  }
  for (const skill of job.preferred_skills ?? []) {
    checks.push({
      label: t("graduate.preferredSkill"),
      value: skill,
      state: skillsNotEvaluated
        ? "review"
        : decision.matched_preferred.includes(skill)
          ? "yes"
          : "review",
      evidence: skillsNotEvaluated
        ? t("graduate.checkNotEvaluated")
        : decision.matched_evidence[skill]?.map((item) => item.excerpt).join("；"),
    });
  }

  return (
    <details>
      <summary>{t("graduate.checkRequirements")}</summary>
      <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 8 }}>
        {t("graduate.checkHint")}
      </Paragraph>
      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
        {checks.map((check, index) => (
          <div key={`${check.label}-${check.value}-${index}`}>
            <Tag color={check.state === "yes" ? "green" : check.state === "no" ? "red" : "gold"}>
              {t(`graduate.check.${check.state}`)}
            </Tag>
            <Text strong>{check.label}</Text>
            <Text>：{check.value}</Text>
            <div style={{ marginLeft: 8, overflowWrap: "anywhere" }}>
              {check.source && (
                <div>
                  <Text type="secondary">{t("graduate.jdSource", { source: check.source })}</Text>
                </div>
              )}
              <Text type="secondary">
                {t("graduate.checkEvidence", {
                  evidence: check.evidence || t("graduate.checkNoEvidence"),
                })}
              </Text>
            </div>
          </div>
        ))}
      </Space>
      {job.raw_text ? (
        <details style={{ marginTop: 8 }}>
          <summary>{t("graduate.originalPosting")}</summary>
          <Paragraph style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {job.raw_text}
          </Paragraph>
        </details>
      ) : (
        <Paragraph type="secondary" style={{ marginTop: 8 }}>
          {t("graduate.summaryOnly")}
        </Paragraph>
      )}
    </details>
  );
}
