// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Checkbox, Input, InputNumber, Select, Space, Typography } from "antd";
import { useRef, useState } from "react";
import { parseGraduateJobText } from "../../api/graduate";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import type { GraduateDegree, GraduateJob } from "./types";

const { Text } = Typography;
type NewJob = Omit<GraduateJob, "id">;

function localDate(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function splitList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\uFF0C\u3001;\uFF1B]/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

function isValidSource(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return (
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export default function GraduateJobEditor({ onAdd }: { onAdd: (job: NewJob) => void }) {
  useLocale();
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [degreeFloor, setDegreeFloor] = useState<GraduateDegree | "unknown">("unknown");
  const [degreeException, setDegreeException] = useState(false);
  const [graduationYear, setGraduationYear] = useState<number | null>(null);
  const [majors, setMajors] = useState("");
  const [skills, setSkills] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [applicationStatus, setApplicationStatus] =
    useState<GraduateJob["application_status"]>("unknown");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sourceFragments, setSourceFragments] = useState<Record<string, string>>({});
  const textVersion = useRef(0);

  const edit = <T,>(setter: (value: T) => void, value: T, sourceField?: string) => {
    textVersion.current += 1;
    setter(value);
    if (sourceField) {
      setSourceFragments((previous) => {
        const next = { ...previous };
        delete next[sourceField];
        return next;
      });
    }
    setConfirmed(false);
    setError("");
  };
  const parse = async () => {
    if (rawText.trim().length < 20) {
      setError(t("graduate.draftTextRequired"));
      return;
    }
    setParsing(true);
    setError("");
    const currentVersion = textVersion.current;
    try {
      const draft = await parseGraduateJobText(rawText.trim());
      if (currentVersion !== textVersion.current) return;
      setCompany(draft.company);
      setTitle(draft.title);
      setCity(draft.city);
      setDegreeFloor(draft.degree_floor);
      setGraduationYear(draft.graduation_year);
      setMajors(draft.preferred_majors.join("\u3001"));
      setSkills(draft.core_skills.join("\u3001"));
      setSourceUrl(draft.source_url);
      setApplicationStatus(draft.application_status);
      setDegreeException(false);
      setWarnings(draft.warnings);
      setSourceFragments(draft.source_fragments);
      setConfirmed(false);
    } catch (cause) {
      if (currentVersion === textVersion.current) {
        setError(cause instanceof Error ? cause.message : t("graduate.draftFailed"));
      }
    } finally {
      setParsing(false);
    }
  };
  const add = () => {
    const majorList = splitList(majors);
    const skillList = splitList(skills);
    if (
      !confirmed ||
      !company.trim() ||
      !title.trim() ||
      !city.trim() ||
      majorList.length > 30 ||
      skillList.length > 40 ||
      !isValidSource(sourceUrl)
    ) {
      setError(t("graduate.jobRequired"));
      return;
    }
    onAdd({
      company: company.trim(),
      title: title.trim(),
      city: city.trim(),
      degree_floor: degreeFloor,
      degree_exception: degreeException,
      graduation_year: graduationYear,
      preferred_majors: majorList,
      core_skills: skillList,
      source_url: sourceUrl.trim(),
      source_checked_at: localDate(),
      application_status: applicationStatus,
      raw_text: rawText.trim() || undefined,
      source_fragments: Object.keys(sourceFragments).length ? sourceFragments : undefined,
    });
    textVersion.current += 1;
    setTitle("");
    setCompany("");
    setCity("");
    setMajors("");
    setSkills("");
    setSourceUrl("");
    setApplicationStatus("unknown");
    setGraduationYear(null);
    setDegreeException(false);
    setDegreeFloor("unknown");
    setConfirmed(false);
    setError("");
    setRawText("");
    setWarnings([]);
    setSourceFragments({});
  };

  return (
    <Space orientation="vertical" style={{ width: "100%" }}>
      <Input.TextArea
        aria-label={t("graduate.draftText")}
        placeholder={t("graduate.draftText")}
        value={rawText}
        rows={5}
        maxLength={20000}
        onChange={(event) => {
          textVersion.current += 1;
          setRawText(event.target.value);
          setConfirmed(false);
          setWarnings([]);
          setSourceFragments({});
        }}
      />
      <Button onClick={() => void parse()} loading={parsing}>
        {t("graduate.draftParse")}
      </Button>
      {warnings.length > 0 && (
        <Alert
          type="info"
          showIcon
          title={t("graduate.draftResult")}
          description={warnings.join("\uFF1B")}
        />
      )}
      {Object.entries(sourceFragments).map(([field, source]) => {
        const labels: Record<string, string> = {
          degree_floor: t("graduate.jobDegree"),
          graduation_year: t("graduate.jobYear"),
          preferred_majors: t("graduate.jobMajors"),
          core_skills: t("graduate.jobSkills"),
          application_status: t("graduate.jobStatus"),
        };
        return (
          <Text key={field} type="secondary">
            {t("graduate.draftSource", { field: labels[field] ?? field, source })}
          </Text>
        );
      })}
      <Space wrap>
        <Input
          aria-label={t("graduate.jobCompany")}
          placeholder={t("graduate.jobCompany")}
          value={company}
          maxLength={120}
          style={{ width: 180 }}
          onChange={(event) => edit(setCompany, event.target.value)}
        />
        <Input
          aria-label={t("graduate.jobTitle")}
          placeholder={t("graduate.jobTitle")}
          value={title}
          maxLength={120}
          style={{ width: 220 }}
          onChange={(event) => edit(setTitle, event.target.value)}
        />
        <Input
          aria-label={t("graduate.jobCity")}
          placeholder={t("graduate.jobCity")}
          value={city}
          maxLength={80}
          style={{ width: 150 }}
          onChange={(event) => edit(setCity, event.target.value)}
        />
        <Select
          aria-label={t("graduate.jobDegree")}
          value={degreeFloor}
          style={{ width: 150 }}
          options={(["unknown", "bachelor", "master", "doctor"] as const).map((degree) => ({
            value: degree,
            label:
              degree === "unknown" ? t("graduate.degree.unknown") : t(`graduate.degree.${degree}`),
          }))}
          onChange={(value) => edit(setDegreeFloor, value, "degree_floor")}
        />
        <InputNumber
          aria-label={t("graduate.jobYear")}
          placeholder={t("graduate.jobYear")}
          value={graduationYear}
          min={2020}
          max={2100}
          style={{ width: 160 }}
          onChange={(value) => edit(setGraduationYear, value, "graduation_year")}
        />
      </Space>
      <Checkbox
        checked={degreeException}
        onChange={(event) => edit(setDegreeException, event.target.checked)}
      >
        {t("graduate.jobException")}
      </Checkbox>
      <Input
        aria-label={t("graduate.jobMajors")}
        placeholder={t("graduate.jobMajors")}
        value={majors}
        maxLength={500}
        onChange={(event) => edit(setMajors, event.target.value, "preferred_majors")}
      />
      <Input
        aria-label={t("graduate.jobSkills")}
        placeholder={t("graduate.jobSkills")}
        value={skills}
        maxLength={500}
        onChange={(event) => edit(setSkills, event.target.value, "core_skills")}
      />
      <Input
        aria-label={t("graduate.jobSource")}
        placeholder={t("graduate.jobSource")}
        value={sourceUrl}
        maxLength={500}
        onChange={(event) => edit(setSourceUrl, event.target.value)}
      />
      <Select
        aria-label={t("graduate.jobStatus")}
        value={applicationStatus}
        style={{ width: 260 }}
        options={(["unknown", "past_reported_deadline", "verified_closed"] as const).map(
          (status) => ({
            value: status,
            label: t(`graduate.jobStatus.${status}`),
          }),
        )}
        onChange={(value) => edit(setApplicationStatus, value, "application_status")}
      />
      <Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}>
        {t("graduate.jobConfirm")}
      </Checkbox>
      {error && <Text type="danger">{error}</Text>}
      <Button onClick={add}>{t("graduate.jobAdd")}</Button>
    </Space>
  );
}
