// SPDX-License-Identifier: Apache-2.0
import { Button, Input, Space, Typography } from "antd";
import { useState } from "react";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import { downloadBlob } from "../../utils/download";

export default function GraduateAdviceFeedback({
  profileId,
  jobId,
  sourceUrl,
  skill,
  excerpt,
}: {
  profileId: string;
  jobId: string;
  sourceUrl: string;
  skill: string;
  excerpt: string;
}) {
  useLocale();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const download = (verdict: "accepted" | "rejected") => {
    const explanation = reason.trim();
    if (!explanation) {
      setError(t("graduate.feedbackReasonRequired"));
      return;
    }
    const record = {
      schema_version: 1,
      profile_id: profileId,
      job_id: jobId,
      source_url: sourceUrl,
      skill,
      evidence_excerpt: excerpt,
      verdict,
      reason: explanation,
      recorded_at: new Date().toISOString(),
    };
    const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadBlob(
      new Blob([JSON.stringify(record, null, 2)], { type: "application/json;charset=utf-8" }),
      `graduate-feedback-${safeJobId}-${Date.now()}.json`,
    );
    setSaved(true);
    setError("");
  };

  return (
    <Space orientation="vertical" size="small" style={{ width: "100%", marginTop: 8 }}>
      <Typography.Text type="secondary">{t("graduate.feedbackHint")}</Typography.Text>
      <Input.TextArea
        aria-label={t("graduate.feedbackReason")}
        placeholder={t("graduate.feedbackReason")}
        value={reason}
        maxLength={500}
        rows={2}
        onChange={(event) => {
          setReason(event.target.value);
          setSaved(false);
          setError("");
        }}
      />
      <Space wrap>
        <Button onClick={() => download("accepted")}>{t("graduate.feedbackAccept")}</Button>
        <Button onClick={() => download("rejected")}>{t("graduate.feedbackReject")}</Button>
      </Space>
      {error && <Typography.Text type="danger">{error}</Typography.Text>}
      {saved && <Typography.Text type="success">{t("graduate.feedbackSaved")}</Typography.Text>}
    </Space>
  );
}
