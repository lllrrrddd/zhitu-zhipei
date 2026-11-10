// SPDX-License-Identifier: Apache-2.0
/**
 * 导出前的体检闸门：**只提示，不拦人**。
 *
 * 为什么要有：体检单里"待处理 N 条"是改简历的线索，但很多人直接从预览点导出，把没改完的
 * 版本发出去了。这里在点击导出的那一刻把上次体检分摆出来，给一句"要不要先看看"。
 *
 * 三条设计约束（避免变成拦路虎）：
 * 1. **没有体检记录就不打扰**：从没体检过的人不该被弹窗教育；
 * 2. **只提示、不硬拦**：导出是用户的权利，按钮永远给"仍然导出"，不做二次确认；
 * 3. **分数可能过期**：简历在体检之后改过时（内容签名不同）如实说明，不假装分数是当前的。
 */

import type { HealthEntry } from "./healthCheck";

/** 建议线：低于这个分数时提示一次。取 60 是因为 ATS 三项里只要有一项不及格就会掉到这以下。 */
export const EXPORT_HEALTH_GATE_SCORE = 60;

export interface ExportGateDecision {
  /** 是否弹提示。 */
  warn: boolean;
  score: number | null;
  /** 体检之后简历又改过：分数只代表当时那一版。 */
  stale: boolean;
}

/**
 * 判断这次导出要不要提示。
 *
 * `currentSignature` 是当前简历内容的签名（宿主能拿到就传）；体检记录里的签名与它不同，
 * 说明体检后又改过——此时仍然提示（分数仍有参考价值），但同时说明"可能已经变了"。
 */
export function exportGateDecision(
  entry: HealthEntry | undefined,
  currentSignature?: string,
): ExportGateDecision {
  if (!entry) return { warn: false, score: null, stale: false };
  const stale = Boolean(
    currentSignature && entry.signature && entry.signature !== currentSignature,
  );
  return {
    warn: entry.score < EXPORT_HEALTH_GATE_SCORE,
    score: entry.score,
    stale,
  };
}
