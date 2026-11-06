// SPDX-License-Identifier: Apache-2.0
import { ExportOutlined, StarOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Empty, Space, Tag } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";
import { createJob, listJobs } from "../../api/jobs";
import { t } from "../../i18n";
import { formatDateTime } from "../../utils/format";
import type { CareerMatches, MatchedJob } from "./types";

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

function ResultCard({ match }: { match: MatchedJob }) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
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
          job_type: job.kind === "full_time" ? "社招" : "校招",
          description: job.responsibilities,
          requirements: job.requirements,
          source_url: job.url,
          posted_at: job.listed_date ?? "",
          status: "待核实",
          note: formatDateTime(match.checked_at),
          origin_source: "企业官网",
          favorite: true,
        }));
      setSavedId(saved.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t("career.result.saveFailed"));
    } finally {
      setSaving(false);
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
        <h3>{job.title}</h3>
        <p className="career-help">
          {job.company} · {t(KIND_LABELS[job.kind])} · {visibleCities}
          {job.cities.length > 3 &&
            " " + t("career.result.moreCities", { count: job.cities.length })}
        </p>
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
        <details className="career-disclosure">
          <summary>{t("career.result.requirements")}</summary>
          <p className="career-jd-excerpt">{job.requirements}</p>
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
          </Space>
          <small className="career-help">{formatDateTime(match.checked_at)}</small>
        </div>
      </article>
    </Card>
  );
}

export default function CareerResults({ result }: { result: CareerMatches }) {
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
            <ResultCard key={match.job.id} match={match} />
          ))}
        </div>
      )}
    </>
  );
}
