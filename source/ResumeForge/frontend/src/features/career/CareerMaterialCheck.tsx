// SPDX-License-Identifier: Apache-2.0
import { UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Input, Select, Tag, Upload } from "antd";
import { useState } from "react";
import { checkCareerMaterial } from "../../api/career";
import { t } from "../../i18n";
import { classifyAttachment, MAX_ATTACHMENT_BYTES, readAsDataUrl } from "../../utils/attachments";
import { downloadBlob } from "../../utils/download";
import type { CareerMaterialResult, CareerProfile } from "./types";

const DEGREE_LABELS = {
  unknown: "",
  bachelor: "本科",
  master: "硕士",
  doctor: "博士",
};

export default function CareerMaterialCheck({ profile }: { profile: CareerProfile }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [allowOcr, setAllowOcr] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CareerMaterialResult | null>(null);
  const [review, setReview] = useState<Record<string, "same" | "different">>({});
  const [error, setError] = useState("");

  async function check() {
    if (!file || checking) return;
    const attachment = classifyAttachment(file);
    if (!attachment) return;
    setChecking(true);
    setError("");
    setResult(null);
    setReview({});
    try {
      const expected = [
        { label: t("career.material.name"), value: name.trim() },
        { label: t("career.material.school"), value: school.trim() },
        { label: t("career.material.degree"), value: DEGREE_LABELS[profile.degree] },
        { label: t("career.material.major"), value: profile.major.trim() },
        {
          label: t("career.material.year"),
          value: profile.graduation_year ? String(profile.graduation_year) : "",
        },
      ].filter((item) => item.value);
      setResult(
        await checkCareerMaterial({
          file: {
            name: file.name,
            mime_type: attachment.mimeType,
            data: await readAsDataUrl(file),
          },
          expected,
          allow_ocr: allowOcr,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("career.material.failed"));
    } finally {
      setChecking(false);
    }
  }

  function exportReview() {
    if (!result || !file) return;
    const record = {
      schema_version: 1,
      checked_at: new Date().toISOString(),
      file_name: result.name,
      file_size_bytes: file.size,
      extraction_method: result.method,
      warnings: result.warnings,
      findings: result.findings.map((item) => ({
        ...item,
        human_review: review[item.label] ?? "pending",
      })),
    };
    downloadBlob(
      new Blob([JSON.stringify(record, null, 2)], { type: "application/json;charset=utf-8" }),
      `career-material-review-${Date.now()}.json`,
    );
  }

  return (
    <Card id="career-material-check" className="career-panel" title={t("career.material.title")}>
      <p className="career-help">{t("career.material.intro")}</p>
      <div className="career-material-fields">
        <label>
          <span>{t("career.material.name")}</span>
          <Input
            value={name}
            maxLength={120}
            placeholder={t("career.material.optional")}
            onChange={(event) => {
              setName(event.target.value);
              setResult(null);
            }}
          />
        </label>
        <label>
          <span>{t("career.material.school")}</span>
          <Input
            value={school}
            maxLength={120}
            placeholder={t("career.material.optional")}
            onChange={(event) => {
              setSchool(event.target.value);
              setResult(null);
            }}
          />
        </label>
      </div>
      <p className="career-help">
        {t("career.material.autoFields", {
          degree: DEGREE_LABELS[profile.degree] || t("career.material.unknown"),
          major: profile.major || t("career.material.unknown"),
          year: profile.graduation_year || t("career.material.unknown"),
        })}
      </p>
      <Upload
        accept=".pdf,.docx,.png,.jpg,.jpeg"
        showUploadList={false}
        disabled={checking}
        beforeUpload={(selected) => {
          const attachment = classifyAttachment(selected);
          if (
            !attachment ||
            (attachment.kind !== "document" && attachment.kind !== "image") ||
            !/\.(pdf|docx|png|jpe?g)$/i.test(selected.name) ||
            selected.size > MAX_ATTACHMENT_BYTES
          ) {
            setFile(null);
            setResult(null);
            setReview({});
            setError(t("career.material.invalid"));
          } else {
            setFile(selected);
            setResult(null);
            setReview({});
            setError("");
          }
          return Upload.LIST_IGNORE;
        }}
      >
        <Button icon={<UploadOutlined />} disabled={checking}>
          {t("career.material.choose")}
        </Button>
      </Upload>
      {file && <p className="career-help">{file.name}</p>}
      <Checkbox checked={allowOcr} onChange={(event) => setAllowOcr(event.target.checked)}>
        {t("career.material.ocrConsent")}
      </Checkbox>
      <Button type="primary" disabled={!file} loading={checking} onClick={() => void check()}>
        {t("career.material.check")}
      </Button>
      {error && <Alert type="error" showIcon title={error} />}
      {result && (
        <div className="career-material-result" aria-live="polite">
          <strong>{t("career.material.result", { file: result.name })}</strong>
          <p className="career-help">{t(`career.material.method.${result.method}`)}</p>
          {result.warnings.map((warning, index) => (
            <Alert key={index} type="warning" showIcon title={warning} />
          ))}
          <ul>
            {result.findings.map((item) => (
              <li key={item.label}>
                <Tag color={item.status === "text_found" ? "blue" : "orange"}>
                  {t(
                    item.status === "text_found"
                      ? "career.material.found"
                      : "career.material.notFound",
                  )}
                </Tag>
                <strong>{item.label}</strong>：{item.value}
                {item.excerpt && <blockquote>{item.excerpt}</blockquote>}
                <Select<"same" | "different">
                  size="small"
                  aria-label={t("career.material.reviewField", { field: item.label })}
                  className="career-material-review-select"
                  placeholder={t("career.material.pending")}
                  value={review[item.label]}
                  options={[
                    { value: "same", label: t("career.material.confirmSame") },
                    { value: "different", label: t("career.material.confirmDifferent") },
                  ]}
                  onChange={(value) =>
                    setReview((current) => ({ ...current, [item.label]: value }))
                  }
                />
              </li>
            ))}
          </ul>
          <p className="career-help">{t("career.material.scope")}</p>
          <p className="career-help">
            {t("career.material.reviewed", {
              reviewed: Object.keys(review).length,
              total: result.findings.length,
            })}
          </p>
          <Button onClick={exportReview}>{t("career.material.export")}</Button>
          <details className="career-disclosure">
            <summary>{t("career.material.readText")}</summary>
            <pre>{result.text}</pre>
          </details>
        </div>
      )}
    </Card>
  );
}
