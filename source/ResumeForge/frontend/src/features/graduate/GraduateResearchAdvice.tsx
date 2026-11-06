// SPDX-License-Identifier: Apache-2.0
import { Button, Checkbox, Input, Space, Typography } from "antd";
import { useState } from "react";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";

export default function GraduateResearchAdvice({
  skill,
  excerpt,
}: {
  skill: string;
  excerpt: string;
}) {
  useLocale();
  const [contribution, setContribution] = useState("");
  const [method, setMethod] = useState("");
  const [outcome, setOutcome] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [draft, setDraft] = useState("");

  const change = (setter: (value: string) => void, value: string) => {
    setter(value);
    setConfirmed(false);
    setDraft("");
  };
  const createDraft = () => {
    if (!confirmed || !contribution.trim() || !method.trim()) return;
    setDraft(
      t("graduate.researchDraft", {
        skill,
        contribution: contribution.trim(),
        method: method.trim(),
        outcome: outcome.trim() ? t("graduate.researchOutcome", { outcome: outcome.trim() }) : "",
      }),
    );
  };

  return (
    <Space orientation="vertical" size="small" style={{ width: "100%", marginTop: 8 }}>
      <Typography.Text strong>{t("graduate.researchTitle")}</Typography.Text>
      <Typography.Text type="secondary">{t("graduate.researchHint", { excerpt })}</Typography.Text>
      <Input
        aria-label={t("graduate.researchContribution")}
        placeholder={t("graduate.researchContribution")}
        value={contribution}
        maxLength={200}
        onChange={(event) => change(setContribution, event.target.value)}
      />
      <Input
        aria-label={t("graduate.researchMethod")}
        placeholder={t("graduate.researchMethod")}
        value={method}
        maxLength={200}
        onChange={(event) => change(setMethod, event.target.value)}
      />
      <Input
        aria-label={t("graduate.researchOutcomeField")}
        placeholder={t("graduate.researchOutcomeField")}
        value={outcome}
        maxLength={200}
        onChange={(event) => change(setOutcome, event.target.value)}
      />
      <Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}>
        {t("graduate.researchConfirm")}
      </Checkbox>
      <Button disabled={!confirmed || !contribution.trim() || !method.trim()} onClick={createDraft}>
        {t("graduate.researchCreate")}
      </Button>
      {draft && (
        <Typography.Paragraph copyable style={{ marginBottom: 0 }}>
          {draft}
        </Typography.Paragraph>
      )}
    </Space>
  );
}
