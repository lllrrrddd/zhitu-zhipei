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

/** 读快照；坏数据丢掉，不抛。 */
export function loadSnapshots(storage: Storage | null): MatchSnapshot[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(MATCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSnapshot).slice(-MATCH_HISTORY_LIMIT);
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
