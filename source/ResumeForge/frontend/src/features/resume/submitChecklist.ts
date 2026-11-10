// SPDX-License-Identifier: Apache-2.0
/**
 * 投递前自检：把"这份简历投这个岗位之前该确认的事"列成一张勾选清单。
 *
 * 分两类，来源不同：
 * - **可自动判断的**：关键词覆盖（JD 目标词命中多少）、高危问题（ATS 里 high 级别的条目）。
 *   数据来自已有的 ATS 本地检测（带 JD 跑一次），不新增后端接口；
 * - **只能人来确认的**：联系方式能不能打通、岗位名与公司名对不对得上、附件命名、页数、
 *   到岗时间、以及"每个数字都经得起追问"。这些机器判断不了，硬判只会给出假结论。
 *
 * 勾选状态只存本机（按 简历 × 岗位 分开），不写后端：这是一次投递的动作记忆，
 * 不是简历内容，也不该跟着简历同步到别的设备。
 */

import { loadHistory } from "./healthCheck";

export type AutoItemKey = "coverage" | "issues";
export type ManualItemKey = "contact" | "names" | "file" | "pages" | "location" | "truth";

/** 人工确认项：顺序即界面顺序（从"最容易被忽略"到"最容易被追问"）。 */
export const MANUAL_ITEMS: readonly ManualItemKey[] = [
  "contact",
  "names",
  "file",
  "pages",
  "location",
  "truth",
];

export const SUBMIT_CHECK_KEY = "rf.resume.submitChecklist.v1";

export interface CoverageSummary {
  matched: number;
  total: number;
  missing: string[];
}

export interface AutoItem {
  key: AutoItemKey;
  state: "ok" | "warn";
}

export interface SubmitChecklist {
  coverage: CoverageSummary | null;
  highIssues: number;
  auto: AutoItem[];
}

/** 从 ATS 结果里提炼清单需要的那几项（其余交给两个既有面板看细节）。 */
export function buildChecklist(input: {
  matchedKeywords: string[];
  missingKeywords: string[];
  highIssues: number;
}): SubmitChecklist {
  const matched = input.matchedKeywords.length;
  const total = matched + input.missingKeywords.length;
  const coverage: CoverageSummary | null =
    total === 0 ? null : { matched, total, missing: input.missingKeywords.slice(0, 12) };
  return {
    coverage,
    highIssues: input.highIssues,
    auto: [
      {
        key: "coverage",
        // 没有目标词（JD 里抽不出词库词）时不判"通过"，标成 warn 让人自己看一眼更诚实。
        state: coverage === null ? "warn" : coverage.missing.length === 0 ? "ok" : "warn",
      },
      { key: "issues", state: input.highIssues === 0 ? "ok" : "warn" },
    ],
  };
}

type CheckStates = Record<string, Record<string, boolean>>;

function readJson(storage: Storage | null, key: string): CheckStates {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: CheckStates = {};
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const clean: Record<string, boolean> = {};
      for (const [item, checked] of Object.entries(value as Record<string, unknown>)) {
        if (checked === true) clean[item] = true;
      }
      result[scope] = clean;
    }
    return result;
  } catch {
    return {};
  }
}

function writeJson(storage: Storage | null, key: string, value: CheckStates): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // 配额满/隐私模式：丢的是勾选记忆，不该打断投递。
  }
}

/** 作用域键：同一份简历投不同岗位，勾选互不干扰。 */
export function scopeKey(resumeId: number, jobId: number): string {
  return `${resumeId}:${jobId}`;
}

export function loadChecks(storage: Storage | null, scope: string): Record<string, boolean> {
  return readJson(storage, SUBMIT_CHECK_KEY)[scope] ?? {};
}

export function saveChecks(
  storage: Storage | null,
  scope: string,
  checks: Record<string, boolean>,
): void {
  writeJson(storage, SUBMIT_CHECK_KEY, { ...readJson(storage, SUBMIT_CHECK_KEY), [scope]: checks });
}

/** 勾选/取消一样东西；true 才落库（未勾选不占空间）。 */
export function toggleCheck(
  checks: Record<string, boolean>,
  key: string,
  checked: boolean,
): Record<string, boolean> {
  const next = { ...checks };
  if (checked) next[key] = true;
  else delete next[key];
  return next;
}

/** 清单完成度：自动项 + 人工项一起算，只看"用户能勾的"那些。 */
export function progressOf(
  checks: Record<string, boolean>,
  manual: readonly ManualItemKey[],
): { done: number; total: number } {
  const done = manual.filter((key) => checks[key] === true).length;
  return { done, total: manual.length };
}

/**
 * 清单纯文本（复制用）：自动项在前，人工项带勾选标记。
 *
 * 文案由调用方传入（语言包），这里只负责排版——模块不出现界面句子。
 */
export function checklistToText(options: {
  title: string;
  autoLines: string[];
  manualLines: { label: string; checked: boolean }[];
  footer: string;
}): string {
  const lines = [options.title, ""];
  if (options.autoLines.length > 0) {
    lines.push(...options.autoLines.map((line) => `· ${line}`), "");
  }
  lines.push(...options.manualLines.map((item) => `- [${item.checked ? "x" : " "}] ${item.label}`));
  // 尾注为空时不补空行：复制出来的文本末尾多一行空白，粘进文档还得手动删。
  if (options.footer) lines.push("", options.footer);
  return lines.join("\n");
}

/** 最近一次体检分：清单底部顺带提一句，避免"自检过了但体检 40 分"这种自相矛盾。 */
export function lastHealthScore(storage: Storage | null, resumeId: number): number | null {
  const entries = loadHistory(storage)[String(resumeId)];
  const latest = entries?.[entries.length - 1];
  return latest ? latest.score : null;
}
