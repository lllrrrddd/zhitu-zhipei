// SPDX-License-Identifier: Apache-2.0
/**
 * 匹配历史：卡片分数旁边的一行「较上次 +7 分」，展开是这台设备上的历史曲线。
 *
 * 只依赖传入的快照数组（不自己读 localStorage）：数据由 `CareerPage` 统一持有，
 * 组件只负责"怎么显示"，测试也就不用去 stub 存储。
 */

import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import { formatDateTime } from "../../utils/format";
import { historyFor, latestDelta, type MatchSnapshot } from "./matchHistory";

/** 最近展示几条：再多也不是"看趋势"，是"翻日志"。 */
const SHOWN = 5;

export default function CareerMatchHistory({
  snapshots,
  jobKey,
  profileId,
}: {
  snapshots: MatchSnapshot[];
  jobKey: string;
  profileId: string;
}) {
  useLocale();
  const series = historyFor(snapshots, jobKey, profileId);
  const delta = latestDelta(snapshots, jobKey, profileId);
  if (!delta) return null;
  const signed = delta.delta > 0 ? `+${delta.delta}` : `${delta.delta}`;
  return (
    <div className="career-history">
      <span
        className={`career-history-delta ${delta.delta > 0 ? "is-up" : delta.delta < 0 ? "is-down" : ""}`}
      >
        {delta.delta === 0
          ? t("career.history.same")
          : t("career.history.delta", { delta: signed })}
      </span>
      <span className="career-help">{t("career.history.previous", { score: delta.previous })}</span>
      <details className="career-disclosure">
        <summary>{t("career.history.title")}</summary>
        <p className="career-help">{t("career.history.hint")}</p>
        <ul className="career-history-list">
          {series
            .slice(-SHOWN)
            .reverse()
            .map((item) => (
              <li key={item.id}>
                {t("career.history.item", {
                  time: formatDateTime(item.createdAt),
                  score: item.score,
                  skills: item.matchedSkills,
                })}
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}
