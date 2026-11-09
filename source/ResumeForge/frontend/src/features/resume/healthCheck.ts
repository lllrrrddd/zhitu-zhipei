// SPDX-License-Identifier: Apache-2.0
/**
 * 简历体检：把两份已有结论（ATS 本地检测 + 风险扫描）合成**一张可勾选的单子**。
 *
 * 为什么要有这一层：ATS 面板和风险面板各自能出问题清单，但它们是两块互不相干的面板——
 * 用户看完得自己记住"还有几条没改"，改完也不知道好了多少。这里补的是**闭环**：
 *
 * 1. 合并清单：两类问题统一成 `HealthIssue`，按严重程度排序，不再分成"两个 Tab 各看一半"；
 * 2. 处理台账：每条可标记「已改好 / 不打算改」，存在本机（按 resumeId），下次打开还在；
 * 3. 体检历史：每次跑完记一条（总分、三项分、问题数），复检时直接显示「较上次 +6 分」。
 *
 * 明确不做：**自动改写正文**。ATS 的问题只带关键词、不带字段路径；风险点虽然带原文片段，
 * 但改写需要事实依据，自动套模板等于替用户编经历。所以采纳动作只到"复制这条建议"，
 * 由用户在编辑器里改——改完回来复检，分数自然会动。
 */

import type { AtsCheckResult, AtsIssue, AtsSeverity } from "../../types/ats";
import type { ResumeRiskScan } from "../../types/resumeRisk";

export type HealthSource = "ats" | "risk" | "quality";
export type HealthSeverity = AtsSeverity;
export type HealthIssueState = "todo" | "done" | "ignored";

export interface HealthIssue {
  /** 稳定指纹：同一份简历改了几轮后，仍然能认出"还是这一条"。 */
  fingerprint: string;
  source: HealthSource;
  severity: HealthSeverity;
  /** 条目所属子类（ATS 的 format/keyword/position，风险的 duplicate/sensitive/…）。 */
  category: string;
  title: string;
  detail: string;
  suggestion: string;
  /** ATS 的关键词 / 风险的原文片段，用来在编辑器里找位置。 */
  evidence: string[];
  /** 风险点自带的位置说明（如「项目经历「xx」」）；ATS 没有。 */
  location: string;
}

export interface HealthEntry {
  at: string;
  /** 简历内容签名：判断"这份体检结果是不是改简历之前的"。 */
  signature: string;
  score: number;
  subscores: Record<string, number>;
  issueCount: number;
  /** 参与体检的风险点数量（风险扫描没跑过时为 0）。 */
  riskCount: number;
  /** 内容质量指标快照（正文条目数、量化数、弱动词数）：老记录没有这一项。 */
  quality?: { bullets: number; quantified: number; ratio: number; weakCount: number };
}

export type HealthHistory = Record<string, HealthEntry[]>;
export type HealthIssueStates = Record<string, Record<string, HealthIssueState>>;

export const HEALTH_HISTORY_KEY = "rf.resume.health.v1";
export const HEALTH_TODO_KEY = "rf.resume.health.todos.v1";
/** 每份简历只留最近 30 次体检：再多也翻不动，还占配额。 */
export const HEALTH_HISTORY_LIMIT = 30;

const SEVERITY_ORDER: Record<HealthSeverity, number> = { high: 0, medium: 1, low: 2 };

/** 短指纹（FNV-1a 32 位）：只要稳定，不需要密码学强度。 */
export function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function atsFingerprint(issue: AtsIssue): string {
  return shortHash([issue.category, issue.title, issue.evidence.join(",")].join("|"));
}

function riskFingerprint(category: string, text: string, location: string): string {
  return shortHash([category, text.slice(0, 40), location].join("|"));
}

/** 统一排序：严重程度优先，同级 ATS 在前（本地规则更确定），最后按标题。 */
export function sortIssues(issues: HealthIssue[]): HealthIssue[] {
  return [...issues].sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      (left.source === right.source ? 0 : left.source === "ats" ? -1 : 1) ||
      left.title.localeCompare(right.title),
  );
}

/** 把 ATS 问题与风险点合并成一张清单：严重程度优先，同级别 ATS 在前（本地规则更确定）。 */
export function buildIssues(
  ats: AtsCheckResult | null | undefined,
  risk: ResumeRiskScan | null | undefined,
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  for (const issue of ats?.issues ?? []) {
    issues.push({
      fingerprint: atsFingerprint(issue),
      source: "ats",
      severity: issue.severity,
      category: issue.category,
      title: issue.title,
      detail: issue.detail,
      suggestion: issue.suggestion ?? "",
      evidence: issue.evidence,
      location: "",
    });
  }
  for (const point of risk?.points ?? []) {
    issues.push({
      fingerprint: riskFingerprint(point.category, point.text, point.location),
      source: "risk",
      severity: point.severity,
      category: point.category,
      title: point.text,
      detail: point.location,
      suggestion: point.suggestion,
      evidence: point.text ? [point.text] : [],
      location: point.location,
    });
  }
  return sortIssues(issues);
}

/** 合并后的清单里还有多少条待处理（未标记、未忽略）。 */
export function countOpen(
  issues: HealthIssue[],
  states: Record<string, HealthIssueState> | undefined,
): { open: number; done: number; ignored: number } {
  let open = 0;
  let done = 0;
  let ignored = 0;
  for (const issue of issues) {
    const state = states?.[issue.fingerprint] ?? "todo";
    if (state === "done") done += 1;
    else if (state === "ignored") ignored += 1;
    else open += 1;
  }
  return { open, done, ignored };
}

function readJson<T>(storage: Storage | null, key: string): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // 配额满/隐私模式：丢的是体检台账，不该打断用户看结果。
  }
}

function isEntry(value: unknown): value is HealthEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HealthEntry>;
  return (
    typeof entry.at === "string" && typeof entry.score === "number" && Number.isFinite(entry.score)
  );
}

export function loadHistory(storage: Storage | null): HealthHistory {
  const parsed = readJson<Record<string, unknown>>(storage, HEALTH_HISTORY_KEY);
  if (!parsed || typeof parsed !== "object") return {};
  const history: HealthHistory = {};
  for (const [resumeId, entries] of Object.entries(parsed)) {
    if (!Array.isArray(entries)) continue;
    const valid = entries.filter(isEntry).slice(-HEALTH_HISTORY_LIMIT);
    if (valid.length > 0) history[resumeId] = valid;
  }
  return history;
}

export function saveHistory(storage: Storage | null, history: HealthHistory): void {
  writeJson(storage, HEALTH_HISTORY_KEY, history);
}

/** 追加一条体检记录（同一份简历保留最近 N 条）。 */
export function appendEntry(
  history: HealthHistory,
  resumeId: number,
  entry: HealthEntry,
): HealthHistory {
  const key = String(resumeId);
  const entries = [...(history[key] ?? []), entry].slice(-HEALTH_HISTORY_LIMIT);
  return { ...history, [key]: entries };
}

/** 与上一次体检比：分数差与待处理问题数差；没有上次结果时返回 null。 */
export function healthDelta(
  entries: HealthEntry[] | undefined,
): { score: number; issues: number } | null {
  if (!entries || entries.length < 2) return null;
  const latest = entries[entries.length - 1];
  const previous = entries[entries.length - 2];
  return { score: latest.score - previous.score, issues: latest.issueCount - previous.issueCount };
}

export function loadIssueStates(storage: Storage | null): HealthIssueStates {
  const parsed = readJson<HealthIssueStates>(storage, HEALTH_TODO_KEY);
  if (!parsed || typeof parsed !== "object") return {};
  const states: HealthIssueStates = {};
  for (const [resumeId, value] of Object.entries(parsed)) {
    if (!value || typeof value !== "object") continue;
    const clean: Record<string, HealthIssueState> = {};
    for (const [fingerprint, state] of Object.entries(value)) {
      if (state === "done" || state === "ignored" || state === "todo") clean[fingerprint] = state;
    }
    states[resumeId] = clean;
  }
  return states;
}

export function saveIssueStates(storage: Storage | null, states: HealthIssueStates): void {
  writeJson(storage, HEALTH_TODO_KEY, states);
}

/** 给某条问题打状态；`todo` 表示撤销（回到待处理）。 */
export function setIssueState(
  states: HealthIssueStates,
  resumeId: number,
  fingerprint: string,
  state: HealthIssueState,
): HealthIssueStates {
  const key = String(resumeId);
  const current = states[key] ?? {};
  const next = { ...current };
  if (state === "todo") delete next[fingerprint];
  else next[fingerprint] = state;
  return { ...states, [key]: next };
}
