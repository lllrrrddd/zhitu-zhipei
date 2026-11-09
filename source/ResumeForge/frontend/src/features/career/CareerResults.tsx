// SPDX-License-Identifier: Apache-2.0
import { ExportOutlined, MessageOutlined, StarOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Empty, Space, Tag } from "antd";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createInterview } from "../../api/interview";
import { createJob, listJobs } from "../../api/jobs";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import { formatDateTime } from "../../utils/format";
import GraduateResearchAdvice from "../graduate/GraduateResearchAdvice";
import CareerDiagnosisPanel from "./CareerDiagnosisPanel";
import CareerMatchHistory from "./CareerMatchHistory";
import CareerSkillGaps from "./CareerSkillGaps";
import { jobKeyOf, rememberSavedMatch, type MatchSnapshot } from "./matchHistory";
import type { CareerMatches, CareerProfile, MatchedJob } from "./types";
import "../../styles/career-score.css";

/** 隐私模式下访问 localStorage 会抛错：读不到就当没有记录，不影响收藏。 */
function storageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const KIND_LABELS = {
  campus: "career.result.campus",
  trainee: "career.result.trainee",
  full_time: "career.result.full_time",
} as const;

const NOTE_LABELS = {
  degree_unspecified: "career.result.degree_unspecified",
  degree_unconfirmed: "career.result.degree_unconfirmed",
  graduation_check: "career.result.graduation_check",
  experience_check: "career.result.experience_check",
} as const;

const PART_LABELS = {
  direction: "career.score.direction",
  skills: "career.score.skills",
  city: "career.score.city",
  entry: "career.score.entry",
} as const;

const GAP_LABELS = {
  degree_unspecified: "career.gap.degree_unspecified",
  degree_unconfirmed: "career.gap.degree_unconfirmed",
  experience_required: "career.gap.experience_required",
  missing_skills: "career.gap.missing_skills",
  city_mismatch: "career.gap.city_mismatch",
  no_evidence: "career.gap.no_evidence",
  graduation_check: "career.gap.graduation_check",
} as const;

function ResultCard({
  match,
  profile,
  profileId,
  profileLabel,
  history,
  addingSkill,
  onAddSkill,
  onAcceptAdvice,
}: {
  match: MatchedJob;
  profile: CareerProfile;
  profileId: string;
  profileLabel: string;
  history: MatchSnapshot[];
  addingSkill: string | null;
  onAddSkill: (term: string) => void;
  onAcceptAdvice: (draft: string) => void;
}) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [startingInterview, setStartingInterview] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const { job } = match;
  const visibleCities = job.cities.slice(0, 3).join("、") || t("career.result.cityUnknown");

  async function save() {
    if (saving || savedId !== null) return;
    setSaving(true);
    try {
      const title = job.title.slice(0, 128);
      const existing = (await listJobs({ keyword: title, page_size: 100 })).items.find(
        (item) => item.source_url === job.url && item.company === job.company,
      );
      const saved =
        existing ??
        (await createJob({
          title,
          company: job.company,
          location: job.cities.join(" / ").slice(0, 64),
          job_type: job.kind === "full_time" ? "社招" : "校招", // i18n-ok: 落库值：岗位类型，与后端 job_type 同值
          description: job.responsibilities,
          requirements: job.requirements,
          source_url: job.url,
          posted_at: job.listed_date ?? "",
          status: "待核实", // i18n-ok: 落库值：岗位状态，与后端白名单同值
          note: formatDateTime(match.checked_at),
          origin_source: "企业官网", // i18n-ok: 落库值：来源字段
          favorite: true,
        }));
      setSavedId(saved.id);
      // 收藏这一下有上下文：用哪份档案看的、几分。收藏夹据此显示「运维方向 · 87 分」。
      rememberSavedMatch(storageOrNull(), {
        jobId: saved.id,
        profileId,
        profileLabel,
        score: Math.round(match.score ?? 0),
        at: new Date().toISOString(),
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : t("career.result.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function startInterview() {
    if (startingInterview) return;
    setStartingInterview(true);
    try {
      const resumeText = [
        `学历：${profile.degree}；毕业年份：${profile.graduation_year ?? "待确认"}`, // i18n-ok: 面试训练请求体：画像摘要原文，随会话持久化
        `专业：${profile.major}；目标岗位：${profile.direction}`, // i18n-ok: 面试训练请求体：同上
        `意向城市：${profile.cities.join("、")}`, // i18n-ok: 面试训练请求体：同上
        `已确认技能：${profile.skills.join("、")}`, // i18n-ok: 面试训练请求体：同上
        ...profile.experience.map((line) => `经历：${line}`), // i18n-ok: 面试训练请求体：同上
      ].join("\n");
      const session = await createInterview({
        title: `${job.company} · ${job.title} · 五轮求职训练`.slice(0, 128), // i18n-ok: 面试训练请求体：会话标题
        job_material: {
          name: `${job.company} · ${job.title}`.slice(0, 256),
          text: `招聘原文：${job.url}\n岗位职责：${job.responsibilities}\n任职要求：${job.requirements}`, // i18n-ok: 面试训练请求体：岗位原文
        },
        resume_material: { name: "本人确认的求职画像", text: resumeText }, // i18n-ok: 面试训练请求体：简历材料名
        interview_type: "综合面", // i18n-ok: 面试类型是后端枚举值（综合面/专业面…）
        difficulty: "中级", // i18n-ok: 难度是后端枚举值
        interviewer_style: "温和引导", // i18n-ok: 面试官风格是后端枚举值
        rounds: 5,
        rounds_min: null,
        focus: `围绕${job.title}的岗位要求和候选人实际经历提问，不编造经历。`.slice(0, 255), // i18n-ok: 面试训练请求体：聚焦提示词
      });
      navigate(`/interview?session_id=${session.id}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t("career.interview.failed"));
    } finally {
      setStartingInterview(false);
    }
  }

  return (
    <Card className="career-result-card">
      <article>
        <div className="career-result-badges">
          <Tag color={match.fit === "strong" ? "blue" : "default"}>
            {t(match.fit === "strong" ? "career.result.strong" : "career.result.possible")}
          </Tag>
          <Tag color={match.current ? "green" : "orange"}>
            {t(match.current ? "career.result.live" : "career.result.cached")}
          </Tag>
        </div>
        <h3>
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            {job.title} <ExportOutlined aria-hidden />
          </a>
        </h3>
        <p className="career-help">
          {job.company} · {t(KIND_LABELS[job.kind])} · {visibleCities}
          {job.cities.length > 3 &&
            " " + t("career.result.moreCities", { count: job.cities.length })}
        </p>
        <div className="career-score" aria-label={t("career.score.note")}>
          <div className="career-score-head">
            <span className="career-score-value">{match.score ?? 0}</span>
            <span className="career-score-unit">{t("career.score.unit")}</span>
            {match.relatedness !== null && match.relatedness !== undefined && (
              <span className="career-score-relatedness">
                {t("career.score.relatedness", { value: match.relatedness })}
              </span>
            )}
          </div>
          {/* score_parts 缺失时按空数组处理：前端可能连到还没升级的后端，
              此时宁可不显示横条，也不能整页崩掉。 */}
          <ul className="career-score-parts">
            {(match.score_parts ?? []).map((part) => (
              <li key={part.key}>
                <span className="career-score-part-label">{t(PART_LABELS[part.key])}</span>
                <span className="career-score-bar">
                  <i style={{ width: `${part.value}%` }} />
                </span>
                <em>{part.value}</em>
              </li>
            ))}
          </ul>
          <p className="career-help">{t("career.score.note")}</p>
        </div>
        <CareerMatchHistory snapshots={history} jobKey={jobKeyOf(match)} profileId={profileId} />
        <CareerSkillGaps
          states={match.skill_states ?? []}
          adding={addingSkill}
          onAddSkill={onAddSkill}
        />
        <div className="career-reasons">
          <strong>{t("career.result.why")}</strong>
          {match.matched_skills.length > 0 && (
            <p>{t("career.result.skills", { skills: match.matched_skills.join("、") })}</p>
          )}
          {match.direction_match && <p>{t("career.result.direction")}</p>}
          {match.city_match && <p>{t("career.result.city")}</p>}
          {match.evidence && <blockquote>{match.evidence}</blockquote>}
        </div>
        {(match.eligibility_notes.length > 0 || match.check_skills.length > 0) && (
          <div className="career-verify">
            <strong>{t("career.result.verify")}</strong>
            {match.eligibility_notes.map((note) => (
              <p key={note}>{t(NOTE_LABELS[note])}</p>
            ))}
            {job.experience_requirement && (
              <p>
                {t("career.result.experienceRequirement", { value: job.experience_requirement })}
              </p>
            )}
            {match.check_skills.length > 0 && (
              <p>{t("career.result.checkSkills", { skills: match.check_skills.join("、") })}</p>
            )}
          </div>
        )}
        {(match.gaps ?? []).length > 0 && (
          <div className="career-gaps">
            <strong>{t("career.gap.title")}</strong>
            <ul>
              {(match.gaps ?? [])
                // 有全量三态面板时，"缺技能"这一行是它的子集，重复显示只会让两条说法打架。
                .filter(
                  (gap) => !(gap.key === "missing_skills" && (match.skill_states ?? []).length),
                )
                .map((gap) => (
                  <li key={gap.key}>{t(GAP_LABELS[gap.key], { values: gap.values.join("、") })}</li>
                ))}
            </ul>
          </div>
        )}
        <details className="career-disclosure">
          <summary>{t("career.result.requirements")}</summary>
          <p className="career-jd-excerpt">{job.requirements}</p>
        </details>
        <details className="career-disclosure">
          <summary>{t("career.diagnosis.title")}</summary>
          <CareerDiagnosisPanel profile={profile} job={job} />
          {match.matched_skills.length > 0 && match.evidence ? (
            <>
              <p className="career-help">
                {t("career.diagnosis.advice", { skill: match.matched_skills[0] })}
              </p>
              <GraduateResearchAdvice
                skill={match.matched_skills[0]}
                excerpt={match.evidence}
                onAccept={onAcceptAdvice}
              />
              <p className="career-help">{t("career.diagnosis.scope")}</p>
            </>
          ) : (
            <p className="career-help">{t("career.diagnosis.noEvidence")}</p>
          )}
        </details>
        <div className="career-result-footer">
          <Space wrap>
            <Button
              type="primary"
              icon={<ExportOutlined />}
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("career.result.open")}
            </Button>
            {savedId === null ? (
              <Button icon={<StarOutlined />} loading={saving} onClick={() => void save()}>
                {t("career.result.save")}
              </Button>
            ) : (
              <Link to={"/jobs?job_id=" + savedId}>{t("career.result.saved")}</Link>
            )}
            <Button
              icon={<MessageOutlined />}
              loading={startingInterview}
              onClick={() => void startInterview()}
            >
              {t("career.interview.start")}
            </Button>
          </Space>
          <small className="career-help">{formatDateTime(match.checked_at)}</small>
        </div>
      </article>
    </Card>
  );
}

export default function CareerResults({
  result,
  profile,
  profileId,
  profileLabel,
  history,
  addingSkill,
  onAddSkill,
  onAcceptAdvice,
}: {
  result: CareerMatches;
  profile: CareerProfile;
  profileId: string;
  profileLabel: string;
  history: MatchSnapshot[];
  addingSkill: string | null;
  onAddSkill: (term: string) => void;
  onAcceptAdvice: (draft: string) => void;
}) {
  useLocale();
  return (
    <>
      <header className="career-results-header">
        <h2>{t("career.result.title")}</h2>
        <p>
          {t("career.result.summary", {
            total: result.market.count,
            relevant: result.relevant_count,
            shown: result.matches.length,
          })}
        </p>
        {result.matches.length > 0 && (
          <span className="career-help">
            {t(
              result.method === "semantic"
                ? "career.result.method.semantic"
                : "career.result.method.rules",
            )}
          </span>
        )}
        {result.matches.length > 0 && (
          <p className="career-help">{t("career.interview.modelNotice")}</p>
        )}
        <a href="#career-material-check">{t("career.material.jump")}</a>
      </header>
      {result.market.count === 0 ? (
        <Alert type="warning" title={t("career.result.noSources")} showIcon />
      ) : result.matches.length === 0 ? (
        <Card>
          <Empty description={t("career.result.empty")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        <div className="career-results-grid">
          {result.matches.map((match) => (
            <ResultCard
              key={match.job.id}
              match={match}
              profile={profile}
              profileId={profileId}
              profileLabel={profileLabel}
              history={history}
              addingSkill={addingSkill}
              onAddSkill={onAddSkill}
              onAcceptAdvice={onAcceptAdvice}
            />
          ))}
        </div>
      )}
    </>
  );
}
