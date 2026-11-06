// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getGraduateDemo, rankGraduateJobs } from "../api/graduate";
import { createJob, listJobs } from "../api/jobs";
import { getProfile } from "../api/profile";
import type {
  GraduateDecision,
  GraduateJob,
  GraduateProfile,
  GraduateRecommendation,
} from "../features/graduate/types";
import GraduateJobEditor from "../features/graduate/GraduateJobEditor";
import GraduateDecisionGroup from "../features/graduate/GraduateDecisionGroup";
import { graduateJobPayload } from "../features/graduate/graduateJobPayload";
import { profileToGraduate } from "../features/graduate/profileToGraduate";
import { useApi } from "../hooks/useApi";
import { t } from "../i18n";
import { useLocale } from "../i18n/i18nContext";

const { Title, Paragraph, Text } = Typography;
type DecisionStatus = GraduateDecision["status"];
type Movement = { jobId: string; before: DecisionStatus; after: DecisionStatus };

function statusMap(result: GraduateRecommendation): Map<string, DecisionStatus> {
  return new Map(
    [...result.directional_fits, ...result.needs_review, ...result.blocked, ...result.expired].map(
      (item) => [item.job_id, item.status],
    ),
  );
}

export default function GraduatePage() {
  useLocale();
  const {
    data: demo,
    loading: demoLoading,
    error: demoError,
    reload: reloadDemo,
  } = useApi(getGraduateDemo);
  const { data: savedProfile } = useApi(getProfile);
  const [selectedDemoId, setSelectedDemoId] = useState("");
  const [customDraft, setCustomDraft] = useState<GraduateProfile | null>(null);
  const [citiesText, setCitiesText] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [skill, setSkill] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [result, setResult] = useState<GraduateRecommendation | null>(null);
  const [previousResult, setPreviousResult] = useState<GraduateRecommendation | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [ranking, setRanking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [customJobs, setCustomJobs] = useState<GraduateJob[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<Record<string, number>>({});
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const nextJobId = useRef(1);
  const requestVersion = useRef(0);
  const draft = customDraft ?? demo?.profiles[0] ?? null;
  const jobs = [...(demo?.jobs ?? []), ...customJobs];

  const addJob = (job: Omit<GraduateJob, "id">) => {
    if (jobs.length >= 50) {
      setFeedback(t("graduate.jobLimit"));
      return;
    }
    setCustomJobs((previous) => [...previous, { ...job, id: `CUSTOM-${nextJobId.current++}` }]);
    requestVersion.current += 1;
    setResult(null);
    setPreviousResult(null);
    setMovements([]);
    setFeedback("");
  };

  const removeJob = (id: string) => {
    setCustomJobs((previous) => previous.filter((job) => job.id !== id));
    requestVersion.current += 1;
    setResult(null);
    setPreviousResult(null);
    setMovements([]);
  };

  const saveJob = async (job: GraduateJob) => {
    if (!job.id.startsWith("CUSTOM-") || savedJobIds[job.id] || savingJobId) return;
    setSavingJobId(job.id);
    setFeedback("");
    try {
      const existing = await listJobs({ keyword: job.title, page_size: 100 });
      const sourceUrl = job.detail_source_url ?? job.source_url;
      const found = existing.items.find(
        (item) =>
          item.source_url === sourceUrl && item.title === job.title && item.company === job.company,
      );
      const saved = found ?? (await createJob(graduateJobPayload(job)));
      setSavedJobIds((previous) => ({ ...previous, [job.id]: saved.id }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("graduate.saveFailed"));
    } finally {
      setSavingJobId(null);
    }
  };

  const changeDraft = (change: Partial<GraduateProfile>) => {
    requestVersion.current += 1;
    setPreviousResult((previous) => result ?? previous);
    setCustomDraft((previous) => {
      const base = previous ?? demo?.profiles[0];
      return base ? { ...base, ...change } : null;
    });
    setConfirmed(false);
    setResult(null);
    setMovements([]);
    setFeedback("");
  };

  const chooseDemo = (id: string) => {
    const profile = demo?.profiles.find((item) => item.id === id);
    if (!profile) return;
    requestVersion.current += 1;
    setSelectedDemoId(id);
    setCustomDraft(profile);
    setCitiesText(profile.target_cities.join(", "));
    setConfirmed(false);
    setResult(null);
    setPreviousResult(null);
    setMovements([]);
    setFeedback("");
  };

  const loadSaved = () => {
    const converted = savedProfile && profileToGraduate(savedProfile);
    if (!converted) {
      setFeedback(t("graduate.savedMissing"));
      return;
    }
    requestVersion.current += 1;
    setCustomDraft(converted);
    setCitiesText(converted.target_cities.join(", "));
    setSelectedDemoId("");
    setConfirmed(false);
    setResult(null);
    setPreviousResult(null);
    setMovements([]);
    setFeedback("");
  };

  const addEvidence = () => {
    const name = skill.trim();
    const value = excerpt.trim();
    if (!draft || !name || !value || Object.keys(draft.evidence).length >= 50) return;
    changeDraft({ evidence: { ...draft.evidence, [name]: value } });
    setSkill("");
    setExcerpt("");
  };

  const rank = async () => {
    if (!draft?.major.trim() || draft.graduation_year < 2020 || !confirmed) {
      setFeedback(t("graduate.required"));
      return;
    }
    if (!jobs.length) {
      setFeedback(t("graduate.noJobs"));
      return;
    }
    setRanking(true);
    setFeedback("");
    const currentVersion = requestVersion.current;
    try {
      const updated = await rankGraduateJobs(
        {
          ...draft,
          target_cities: (citiesText ?? draft.target_cities.join(", "))
            .split(/[,\uff0c\u3001;\uff1b]/)
            .map((part) => part.trim())
            .filter(Boolean),
        },
        jobs,
      );
      if (currentVersion !== requestVersion.current) return;
      const prior = previousResult ?? result;
      const before = prior ? statusMap(prior) : new Map<string, DecisionStatus>();
      const after = statusMap(updated);
      setMovements(
        [...after].flatMap(([jobId, status]) => {
          const oldStatus = before.get(jobId);
          return oldStatus && oldStatus !== status
            ? [{ jobId, before: oldStatus, after: status }]
            : [];
        }),
      );
      setResult(updated);
      setPreviousResult(null);
    } catch (error) {
      if (currentVersion === requestVersion.current) {
        setFeedback(error instanceof Error ? error.message : t("graduate.rankFailed"));
      }
    } finally {
      setRanking(false);
    }
  };

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <Title level={2}>{t("graduate.title")}</Title>
      <Paragraph>{t("graduate.intro")}</Paragraph>
      {demo?.checked_date && (
        <Paragraph type="secondary">
          {t("graduate.checkedDate", { date: demo.checked_date })}
        </Paragraph>
      )}
      {demoError && (
        <Alert
          type="error"
          showIcon
          title={t("graduate.loadFailed")}
          description={<Button onClick={() => void reloadDemo()}>{t("common.retry")}</Button>}
        />
      )}
      <Card loading={demoLoading} title={t("graduate.profileTitle")}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            aria-label={t("graduate.demoLabel")}
            value={
              draft?.id === "saved-profile" ? undefined : selectedDemoId || demo?.profiles[0]?.id
            }
            placeholder={t("graduate.demoLabel")}
            style={{ minWidth: 220 }}
            options={demo?.profiles.map((item) => ({ label: item.name, value: item.id }))}
            onChange={chooseDemo}
          />
          <Button onClick={loadSaved}>{t("graduate.loadSaved")}</Button>
          <Link to="/profile">{t("graduate.importLink")}</Link>
        </Space>
        {draft && (
          <>
            <Paragraph>
              <Text strong>{draft.name}</Text>
            </Paragraph>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <label>
                <Text>{t("graduate.degree")}</Text>
                <Select
                  aria-label={t("graduate.degree")}
                  value={draft.degree}
                  style={{ display: "block", width: 150 }}
                  options={(["bachelor", "master", "doctor"] as const).map((degree) => ({
                    value: degree,
                    label: t(`graduate.degree.${degree}`),
                  }))}
                  onChange={(degree) => changeDraft({ degree })}
                />
              </label>
              <label>
                <Text>{t("graduate.year")}</Text>
                <InputNumber
                  aria-label={t("graduate.year")}
                  value={draft.graduation_year || null}
                  min={2020}
                  max={2100}
                  style={{ display: "block", width: 150 }}
                  onChange={(year) => changeDraft({ graduation_year: year ?? 0 })}
                />
              </label>
              <label>
                <Text>{t("graduate.major")}</Text>
                <Input
                  aria-label={t("graduate.major")}
                  value={draft.major}
                  style={{ width: 250 }}
                  maxLength={120}
                  onChange={(event) => changeDraft({ major: event.target.value })}
                />
              </label>
              <label>
                <Text>{t("graduate.cities")}</Text>
                <Input
                  aria-label={t("graduate.cities")}
                  value={citiesText ?? draft.target_cities.join(", ")}
                  style={{ width: 260 }}
                  maxLength={320}
                  onChange={(event) => {
                    requestVersion.current += 1;
                    setPreviousResult((previous) => result ?? previous);
                    setCitiesText(event.target.value);
                    setConfirmed(false);
                    setResult(null);
                    setMovements([]);
                  }}
                />
              </label>
            </div>
            <Title level={5}>{t("graduate.evidenceTitle")}</Title>
            <Paragraph type="secondary">{t("graduate.evidenceHint")}</Paragraph>
            <Space orientation="vertical" style={{ width: "100%", marginBottom: 12 }}>
              {Object.entries(draft.evidence).map(([name, source]) => (
                <div key={name} style={{ display: "flex", alignItems: "start", gap: 8 }}>
                  <Tag>{name}</Tag>
                  <Text style={{ flex: 1, overflowWrap: "anywhere" }}>{source}</Text>
                  <Button
                    size="small"
                    aria-label={t("graduate.removeEvidence", { skill: name })}
                    onClick={() => {
                      const next = { ...draft.evidence };
                      delete next[name];
                      changeDraft({ evidence: next });
                    }}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </Space>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              <Input
                value={skill}
                onChange={(event) => setSkill(event.target.value)}
                placeholder={t("graduate.skill")}
                aria-label={t("graduate.skill")}
                style={{ width: 180 }}
                maxLength={80}
              />
              <Input
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                placeholder={t("graduate.excerpt")}
                aria-label={t("graduate.excerpt")}
                style={{ minWidth: 280, flex: 1 }}
                maxLength={1000}
              />
              <Button onClick={addEvidence} disabled={!skill.trim() || !excerpt.trim()}>
                {t("graduate.addEvidence")}
              </Button>
            </div>
            <Checkbox
              checked={confirmed}
              onChange={(event) => {
                setConfirmed(event.target.checked);
                if (!event.target.checked) {
                  requestVersion.current += 1;
                  setResult(null);
                  setPreviousResult(null);
                  setMovements([]);
                }
              }}
            >
              {t("graduate.confirm")}
            </Checkbox>
            <div style={{ marginTop: 16 }}>
              <Button type="primary" loading={ranking} onClick={() => void rank()}>
                {ranking ? t("graduate.ranking") : t("graduate.rank")}
              </Button>
            </div>
          </>
        )}
      </Card>
      <Card title={t("graduate.jobEditorTitle")} style={{ marginTop: 16 }}>
        <Paragraph type="secondary">{t("graduate.jobEditorHint")}</Paragraph>
        {customJobs.map((job) => (
          <Space key={job.id} wrap style={{ display: "flex", marginBottom: 8 }}>
            <Typography.Link
              href={job.detail_source_url ?? job.source_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("graduate.openPosting", {
                job: `${job.company} · ${job.title} · ${job.city}`,
              })}
            >
              {job.company} · {job.title} · {job.city}
            </Typography.Link>
            <Typography.Link href={job.source_url} target="_blank" rel="noopener noreferrer">
              {t("graduate.source")}
            </Typography.Link>
            {job.source_checked_at && (
              <Text type="secondary">
                {t("graduate.sourceCheckedAt", { date: job.source_checked_at })}
              </Text>
            )}
            <Button size="small" onClick={() => removeJob(job.id)}>
              {t("graduate.jobRemove")}
            </Button>
          </Space>
        ))}
        {jobs.length < 50 ? (
          <GraduateJobEditor onAdd={addJob} />
        ) : (
          <Text type="secondary">{t("graduate.jobLimit")}</Text>
        )}
      </Card>
      {feedback && <Alert type="warning" showIcon title={feedback} style={{ marginTop: 16 }} />}
      {result && draft && (
        <Space orientation="vertical" size="middle" style={{ width: "100%", marginTop: 16 }}>
          <Alert
            type="info"
            showIcon
            title={result.message}
            description={t("graduate.unverified")}
          />
          {movements.length > 0 && (
            <Alert
              type="success"
              showIcon
              title={t("graduate.changedTitle", { count: movements.length })}
              description={movements.map((item) => {
                const job = jobs.find((candidate) => candidate.id === item.jobId);
                return (
                  <div key={item.jobId}>
                    {t("graduate.changedItem", {
                      job: job?.title ?? item.jobId,
                      before: t(`graduate.status.${item.before}`),
                      after: t(`graduate.status.${item.after}`),
                    })}
                  </div>
                );
              })}
            />
          )}
          {result.directional_fits.length === 0 && (
            <Alert type="warning" showIcon title={t("graduate.empty")} />
          )}
          <GraduateDecisionGroup
            titleKey="graduate.fitTitle"
            items={result.directional_fits}
            jobs={jobs}
            profile={draft}
            onSaveJob={(job) => void saveJob(job)}
            savedJobIds={savedJobIds}
            savingJobId={savingJobId}
          />
          <GraduateDecisionGroup
            titleKey="graduate.reviewTitle"
            items={result.needs_review}
            jobs={jobs}
            profile={draft}
            onSaveJob={(job) => void saveJob(job)}
            savedJobIds={savedJobIds}
            savingJobId={savingJobId}
          />
          <GraduateDecisionGroup
            titleKey="graduate.blockedTitle"
            items={result.blocked}
            jobs={jobs}
            profile={draft}
            onSaveJob={(job) => void saveJob(job)}
            savedJobIds={savedJobIds}
            savingJobId={savingJobId}
          />
          <GraduateDecisionGroup
            titleKey="graduate.expiredTitle"
            items={result.expired}
            jobs={jobs}
            profile={draft}
            onSaveJob={(job) => void saveJob(job)}
            savedJobIds={savedJobIds}
            savingJobId={savingJobId}
          />
        </Space>
      )}
    </div>
  );
}
