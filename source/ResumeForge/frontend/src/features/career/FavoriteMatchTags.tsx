// SPDX-License-Identifier: Apache-2.0
/**
 * 收藏夹里的「匹配」一栏：这条收藏当初是用哪份档案匹配的、打了几分；
 * 如果同一岗位被多份档案匹配过，再点出**哪份方向更匹配**。
 *
 * 为什么值得单列：收藏本身只说明"我想去"，不说明"我够不够"。把匹配档案与分数挂在旁边，
 * 一条收藏就能回答两个问题——当时是按哪个方向看到的、换个方向是不是更有胜算。
 *
 * 数据都在本机（`matchHistory` 的两个 localStorage 键），组件只做展示与比较。
 */

import { Tag, Tooltip } from "antd";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import type { SavedProfileMatch } from "./matchHistory";

export interface ProfileScore {
  profileId: string;
  profileLabel: string;
  score: number;
}

export default function FavoriteMatchTags({
  saved,
  scores,
}: {
  /** 收藏时的匹配上下文；老收藏（记这份功能之前）没有。 */
  saved?: SavedProfileMatch;
  /** 同一岗位在各份档案下最近一次的成绩，按分数从高到低。 */
  scores: ProfileScore[];
}) {
  useLocale();
  if (!saved && scores.length === 0) return null;
  const best = scores[0];
  // 只在"另一份档案明显更高"时提醒，平分不算胜出（否则每个岗位都在喊更匹配）。
  const better =
    best && (!saved || best.profileId !== saved.profileId) && (!saved || best.score > saved.score);
  return (
    <Tooltip title={t("career.favorites.hint")}>
      <span className="career-favorite-match">
        {saved ? (
          <Tag color="blue">
            {t("career.favorites.saved", { profile: saved.profileLabel, score: saved.score })}
          </Tag>
        ) : (
          scores.map((item) => (
            <Tag key={item.profileId}>
              {t("career.favorites.saved", { profile: item.profileLabel, score: item.score })}
            </Tag>
          ))
        )}
        {better && (
          <Tag color="green">
            {t("career.favorites.better", { profile: best.profileLabel, score: best.score })}
          </Tag>
        )}
      </span>
    </Tooltip>
  );
}
