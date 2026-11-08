// SPDX-License-Identifier: Apache-2.0
import { SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Input, InputNumber, Select } from "antd";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import { splitCities } from "./profileFromResume";
import type { CareerDegree, CareerProfile } from "./types";

const DEGREES = [
  { value: "unknown", key: "graduate.degree.unknown" },
  { value: "bachelor", key: "graduate.degree.bachelor" },
  { value: "master", key: "graduate.degree.master" },
  { value: "doctor", key: "graduate.degree.doctor" },
] as const;

export default function CareerProfileForm({
  profile,
  searching,
  onChange,
  onSearch,
}: {
  profile: CareerProfile;
  searching: boolean;
  onChange: (change: Partial<CareerProfile>) => void;
  onSearch: () => void;
}) {
  useLocale();
  const disabled = searching || undefined;
  return (
    <Card className="career-panel" title={t("career.profile.title")}>
      <p className="career-help">{t("career.profile.intro")}</p>
      {!profile.direction.trim() && (
        <Alert type="warning" showIcon title={t("career.profile.required")} />
      )}
      {(!profile.major.trim() || profile.degree === "unknown") && (
        <Alert type="info" showIcon title={t("career.profile.educationReview")} />
      )}
      <div className="career-profile-grid">
        <label>
          <span>{t("career.profile.direction")}</span>
          <Input
            value={profile.direction}
            placeholder={t("career.profile.directionHint")}
            maxLength={160}
            disabled={disabled}
            onChange={(event) => onChange({ direction: event.target.value })}
          />
        </label>
        <label>
          <span>{t("career.profile.cities")}</span>
          <Input
            defaultValue={profile.cities.join("，")}
            placeholder={t("career.profile.citiesHint")}
            maxLength={220}
            disabled={disabled}
            onChange={(event) => onChange({ cities: splitCities(event.target.value) })}
          />
        </label>
        <label>
          <span>{t("career.profile.major")}</span>
          <Input
            value={profile.major}
            maxLength={120}
            disabled={disabled}
            onChange={(event) => onChange({ major: event.target.value })}
          />
        </label>
        <label>
          <span>{t("career.profile.degree")}</span>
          <Select<CareerDegree>
            aria-label={t("career.profile.degree")}
            value={profile.degree}
            options={DEGREES.map(({ value, key }) => ({ value, label: t(key) }))}
            disabled={disabled}
            onChange={(degree) => onChange({ degree })}
          />
        </label>
        <label>
          <span>{t("career.profile.year")}</span>
          <InputNumber
            aria-label={t("career.profile.year")}
            value={profile.graduation_year}
            min={1980}
            max={2100}
            precision={0}
            disabled={disabled}
            onChange={(graduation_year) => onChange({ graduation_year })}
          />
        </label>
        <label>
          <span>{t("career.profile.skills")}</span>
          <Select
            aria-label={t("career.profile.skills")}
            mode="tags"
            value={profile.skills}
            maxCount={40}
            tokenSeparators={[",", "，", "、"]}
            placeholder={t("career.profile.skillsHint")}
            disabled={disabled}
            onChange={(values: string[]) =>
              onChange({
                skills: [
                  ...new Set(values.map((skill) => skill.trim().slice(0, 80)).filter(Boolean)),
                ],
              })
            }
          />
        </label>
      </div>
      <details className="career-disclosure">
        <summary>{t("career.profile.experience")}</summary>
        <Input.TextArea
          aria-label={t("career.profile.experience")}
          defaultValue={profile.experience.join("\n")}
          placeholder={t("career.profile.experienceHint")}
          autoSize={{ minRows: 3, maxRows: 8 }}
          maxLength={7300}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              experience: event.target.value
                .split("\n")
                .map((line) => line.trim().slice(0, 600))
                .filter(Boolean)
                .slice(0, 12),
            })
          }
        />
      </details>
      <Button
        type="primary"
        icon={<SearchOutlined />}
        loading={searching}
        onClick={onSearch}
        className="career-action-row"
      >
        {t("career.profile.search")}
      </Button>
      {searching && (
        <p className="career-help" role="status">
          {t("career.profile.searching")}
        </p>
      )}
    </Card>
  );
}
