// SPDX-License-Identifier: Apache-2.0
/**
 * 匹配历史快照：**每次匹配成功都用一条记录留住「当时用的是哪份档案、打了几分」**。
 *
 * 为什么值得存：找岗位的价值不在"算出一个分"，而在"改完简历再算一次，分数有没有涨"。
 * 没有历史，用户只能记住上次的 68 分；有了历史，卡片的分数旁边就能直接写「较上次 +7」，
 * 材料核对、补技能这些动作才有反馈闭环。
 *
 * 与档案一样只存 localStorage：这份记录同样含**别人**的画像摘要信息（帮同学匹配时的
 * 方向、城市、技能），不该进本机数据库、也不进备份。
 *
 * 三条设计约束：
 * 1. **按 (岗位, 档案) 成组**：同一个岗位换一份档案匹配，分数不可比，不能混成一条曲线。
 * 2. **有上限**：`MATCH_HISTORY_LIMIT` 条，超出丢最旧的——localStorage 写满会让整个
 *    页面在别的模块报错，代价比丢历史大。
 * 3. **坏数据一律丢**：单条脏记录只丢那一条，不让整页崩（与 `careerProfiles` 同一策略）。
 */

import type { MatchedJob } from "./types";

export interface MatchSnapshot {
  id: string;
  /** 岗位的稳定标识：优先 URL（跨来源、跨刷新唯一），没有就用 来源+id。 */
  jobKey: string;
  jobTitle: string;
  company: string;
  /** 当次规则分。 */
  score: number;
  /** 匹配时所用档案的 id 与当时名字（名字可能被改过，快照留当时的）。 */
  profileId: string;
  profileLabel: string;
  /** ISO 时间。 */
  createdAt: string;
  /** 命中技能数：分数相同时，用户也能看出"是命中变多了还是权重变了"。 */
  matchedSkills: number;
}

export const MATCH_HISTORY_KEY = "rf.career.matchHistory.v1";
export const MATCH_HISTORY_LIMIT = 200;

/** 岗位标识：URL 优先，退化成来源+id。 */
export function jobKeyOf(match: MatchedJob): string {
  const { job } = match;
  const url = job.url?.trim();
  if (url) return url;
  return `${job.source_id ?? ""}:${job.id}`;
}

function isSnapshot(value: unknown): value is MatchSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MatchSnapshot>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.jobKey === "string" &&
    candidate.jobKey.length > 0 &&
    typeof candidate.score === "number" &&
    Number.isFinite(candidate.score) &&
    typeof candidate.profileId === "string" &&
    typeof candidate.createdAt === "string"
  );
}

/** 把任意数组归一成合法快照（坏数据丢掉）——备份导入与读存储共用同一条口径。 */
export function normalizeSnapshots(items: unknown): MatchSnapshot[] {
  if (!Array.isArray(items)) return [];
  return items.filter(isSnapshot).slice(-MATCH_HISTORY_LIMIT);
}

/** 读快照；坏数据丢掉，不抛。 */
export function loadSnapshots(storage: Storage | null): MatchSnapshot[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(MATCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeSnapshots(parsed);
  } catch {
    return [];
  }
}

export function saveSnapshots(storage: Storage | null, snapshots: MatchSnapshot[]): void {
  if (!storage) return;
  try {
    storage.setItem(MATCH_HISTORY_KEY, JSON.stringify(snapshots.slice(-MATCH_HISTORY_LIMIT)));
  } catch {
    // 配额满/隐私模式：悄悄放弃，不能让"记历史"打断匹配本身。
  }
}

export function newSnapshotId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  return `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/** 由一次匹配结果生成快照。`score` 缺失（后端未升级）时按 0 记，用户仍能看到时间点。 */
export function snapshotOf(
  match: MatchedJob,
  profile: { id: string; label: string },
  createdAt = new Date().toISOString(),
): MatchSnapshot {
  return {
    id: newSnapshotId(),
    jobKey: jobKeyOf(match),
    jobTitle: match.job.title,
    company: match.job.company,
    score: Math.round(match.score ?? 0),
    profileId: profile.id,
    profileLabel: profile.label,
    createdAt,
    matchedSkills: match.matched_skills.length,
  };
}

/**
 * 把一次匹配的全部结果追加进历史，返回新数组。
 *
 * 只保留靠前的若干条（`result.matches` 已排序），避免把整个岗位池都写进本地存储；
 * 同一批里同一个 jobKey 只会出现一次（后端不会重复返回，这里再兜一层）。
 */
export function recordMatches(
  snapshots: MatchSnapshot[],
  matches: MatchedJob[],
  profile: { id: string; label: string },
  createdAt = new Date().toISOString(),
): MatchSnapshot[] {
  const seen = new Set<string>();
  const additions: MatchSnapshot[] = [];
  for (const match of matches) {
    const key = jobKeyOf(match);
    if (seen.has(key)) continue;
    seen.add(key);
    additions.push(snapshotOf(match, profile, createdAt));
  }
  return [...snapshots, ...additions].slice(-MATCH_HISTORY_LIMIT);
}

/** 同一 (岗位, 档案) 的历史，按时间升序（最后一条是最近一次）。 */
export function historyFor(
  snapshots: MatchSnapshot[],
  jobKey: string,
  profileId: string,
): MatchSnapshot[] {
  return snapshots
    .filter((item) => item.jobKey === jobKey && item.profileId === profileId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/**
 * 「较上次」：拿同一 (岗位, 档案) 最近两条比，返回上次分数与差值。
 *
 * 不足两条时返回 null——第一次匹配没有可比对象，界面不该凭空出现「+0」。
 */
export function latestDelta(
  snapshots: MatchSnapshot[],
  jobKey: string,
  profileId: string,
): { previous: number; delta: number } | null {
  const series = historyFor(snapshots, jobKey, profileId);
  if (series.length < 2) return null;
  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  return { previous: previous.score, delta: latest.score - previous.score };
}

export function clearSnapshots(storage: Storage | null): MatchSnapshot[] {
  if (storage) {
    try {
      storage.removeItem(MATCH_HISTORY_KEY);
    } catch {
      // 同 saveSnapshots：清不掉也不影响使用。
    }
  }
  return [];
}

/** 收藏岗位时"用的是哪份档案匹配的"：按**岗位数据库 id** 记，手工录入的岗位也能对上。 */
export interface SavedProfileMatch {
  jobId: number;
  profileId: string;
  profileLabel: string;
  score: number;
  at: string;
}

export const SAVED_PROFILE_KEY = "rf.career.favoriteProfiles.v1";
/** 只记最近 200 个岗位的收藏上下文；再老的记录对"这个岗位当时怎么来的"没有价值。 */
const SAVED_PROFILE_LIMIT = 200;

function isSavedMatch(value: unknown): value is SavedProfileMatch {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedProfileMatch>;
  return (
    typeof candidate.jobId === "number" &&
    typeof candidate.profileId === "string" &&
    typeof candidate.profileLabel === "string" &&
    typeof candidate.score === "number" &&
    Number.isFinite(candidate.score) &&
    typeof candidate.at === "string"
  );
}

/** 读出"收藏时的匹配上下文"：键是岗位 id 的字符串形式。坏数据整条丢。 */
export function loadSavedMatches(storage: Storage | null): Record<string, SavedProfileMatch> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(SAVED_PROFILE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, SavedProfileMatch] => isSavedMatch(entry[1]))
      .sort((left, right) => left[1].at.localeCompare(right[1].at))
      .slice(-SAVED_PROFILE_LIMIT);
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function saveSavedMatches(
  storage: Storage | null,
  matches: Record<string, SavedProfileMatch>,
): void {
  if (!storage) return;
  try {
    storage.setItem(SAVED_PROFILE_KEY, JSON.stringify(matches));
  } catch {
    // 配额满：丢的是"这条收藏是用哪份档案匹配的"这种便利信息，不该打断收藏本身。
  }
}

/** 记一条收藏上下文（同一个岗位再次收藏时覆盖成最新那次）。 */
export function withSavedMatch(
  matches: Record<string, SavedProfileMatch>,
  entry: SavedProfileMatch,
): Record<string, SavedProfileMatch> {
  const next = { ...matches, [String(entry.jobId)]: entry };
  const entries = Object.entries(next)
    .sort((left, right) => left[1].at.localeCompare(right[1].at))
    .slice(-SAVED_PROFILE_LIMIT);
  return Object.fromEntries(entries);
}

/** 一步记下"这条收藏是用哪份档案匹配的"（读-合并-写，调用处不用关心存储细节）。 */
export function rememberSavedMatch(storage: Storage | null, entry: SavedProfileMatch): void {
  saveSavedMatches(storage, withSavedMatch(loadSavedMatches(storage), entry));
}

/** 某个岗位在**各份档案**下最近一次的成绩（按分数从高到低）。 */
export function latestPerProfile(
  snapshots: MatchSnapshot[],
  jobKey: string,
): { profileId: string; profileLabel: string; score: number; at: string }[] {
  const latest = new Map<string, MatchSnapshot>();
  for (const item of snapshots) {
    if (item.jobKey !== jobKey) continue;
    const current = latest.get(item.profileId);
    if (!current || current.createdAt.localeCompare(item.createdAt) < 0) {
      latest.set(item.profileId, item);
    }
  }
  return [...latest.values()]
    .map((item) => ({
      profileId: item.profileId,
      profileLabel: item.profileLabel,
      score: item.score,
      at: item.createdAt,
    }))
    .sort((left, right) => right.score - left.score);
}
