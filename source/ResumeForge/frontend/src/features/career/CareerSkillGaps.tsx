// SPDX-License-Identifier: Apache-2.0
/**
 * 技能差距：按**岗位要求里写到的技能**逐项对比这份画像，分三档展示。
 *
 * 为什么不是再给一个分数：分数只说明"整体差多少"，改简历的人需要的是"下一行改哪里"。
 * 三档正好对应三种动作——
 * - 已具备：不用动；
 * - 只在经历里提到：**加一行技能名就能涨分**，一键加入；
 * - 完全没提：要么补一段真实经历，要么承认这份岗位不需要它。
 *
 * 这一档判断由后端按 `SKILL_TERMS` 词表算（与简历解析、`check_skills` 同一份口径），
 * 组件只负责分组与"加入技能栏"这一个动作，不在前端另写一套匹配规则。
 */

import { Button, Tag } from "antd";
import { t, type MessageKey } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import type { SkillState } from "./types";

const GROUPS = ["found", "mentioned", "missing"] as const;
type Group = (typeof GROUPS)[number];

const GROUP_LABELS: Record<Group, MessageKey> = {
  found: "career.skills.group.found",
  mentioned: "career.skills.group.mentioned",
  missing: "career.skills.group.missing",
};

const GROUP_COLORS: Record<Group, string> = {
  found: "green",
  mentioned: "gold",
  missing: "default",
};

export default function CareerSkillGaps({
  states,
  onAddSkill,
  adding,
  canAdd = true,
}: {
  states: SkillState[];
  onAddSkill: (term: string) => void;
  /** 正在把某个技能写进技能栏（按钮转圈，避免连点）。 */
  adding?: string | null;
  /** 没有可写回的档案时只读展示。 */
  canAdd?: boolean;
}) {
  useLocale();
  if (states.length === 0) return null;
  const grouped: Record<Group, string[]> = { found: [], mentioned: [], missing: [] };
  for (const item of states) grouped[item.state].push(item.term);
  return (
    <div className="career-skills">
      <strong>{t("career.skills.title")}</strong>
      {GROUPS.map((group) => {
        const terms = grouped[group];
        if (terms.length === 0) return null;
        return (
          <div className={`career-skills-group is-${group}`} key={group}>
            <span className="career-skills-label">
              {t(GROUP_LABELS[group], { count: terms.length })}
            </span>
            <ul className="career-skills-terms">
              {terms.map((term) => (
                <li key={term}>
                  <Tag color={GROUP_COLORS[group]}>{term}</Tag>
                  {group === "mentioned" && canAdd && (
                    <Button
                      type="link"
                      size="small"
                      loading={adding === term}
                      onClick={() => onAddSkill(term)}
                    >
                      {t("career.skills.add")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {group === "mentioned" && (
              <p className="career-help">{t("career.skills.mentionedHint")}</p>
            )}
            {group === "missing" && <p className="career-help">{t("career.skills.missingHint")}</p>}
          </div>
        );
      })}
      <p className="career-help">{t("career.skills.hint")}</p>
    </div>
  );
}
