// SPDX-License-Identifier: Apache-2.0
/**
 * 匹配档案 A/B 对比：把**同一批岗位**在不同方向下的分数摆在一起。
 *
 * 为什么需要：一张卡片只回答"这份岗位我够不够"，回答不了"我该按哪个方向投"。
 * 一个人常常有两份档案（运维 / 测试、算法 / 开发），各自匹配一遍后，历史里已经有
 * 足够的数据回答这个问题——不需要再发一次请求，也不需要调模型。
 *
 * 三条口径（决定了这张表能不能服人）：
 * 1. **只比同一岗位**：不同岗位的分数没有可比性，所以按 jobKey 对齐，逐岗位比较。
 * 2. **取每份档案的最近一次**：改完简历又匹配一次时，用最新分数，不把旧分当结论。
 * 3. **胜出按分数严格更高**：平分不算任何一方赢（否则两份档案会把同一个岗位都记成胜利，
 *    平均数看起来虚高）。
 */

import type { MatchSnapshot } from "./matchHistory";

export interface CompareScore {
  profileId: string;
  profileLabel: string;
  score: number;
  at: string;
}

/** 一份岗位在各档案下的分数（按分数从高到低）。 */
export interface CompareJob {
  jobKey: string;
  jobTitle: string;
  company: string;
  scores: CompareScore[];
  /** 最高分的档案；平分时为空——没有"更匹配"这一说。 */
  bestProfileId: string | null;
  /** 最高分与最低分之差，用来说明"这个岗位值不值得换方向"。 */
  spread: number;
}

export interface CompareProfileSummary {
  profileId: string;
  profileLabel: string;
  /** 这份档案匹配过的岗位数。 */
  jobs: number;
  /** 这些岗位上的平均分（四舍五入）。 */
  average: number;
  /** 严格高于其他档案的次数。 */
  wins: number;
}

export interface CompareReport {
  /** 至少被两份档案匹配过的岗位（只有它们能比）。 */
  jobs: CompareJob[];
  /** 参与对比的档案汇总，按胜出次数、平均分排序。 */
  profiles: CompareProfileSummary[];
  /** 被两份以上档案匹配过的岗位数。 */
  comparedJobs: number;
  /** 历史上出现过的岗位总数（含只被一份档案匹配过的）。 */
  totalJobs: number;
}

function latestByProfile(snapshots: MatchSnapshot[], jobKey: string): CompareScore[] {
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

/**
 * 汇总对比报告。
 *
 * 只有**被两份及以上档案匹配过**的岗位进入 `jobs`；其余岗位仍然计入 `totalJobs`，
 * 让界面能说清"我匹配了 N 个岗位，其中 M 个可以横向比"。
 */
export function buildCompareReport(snapshots: MatchSnapshot[]): CompareReport {
  const byJob = new Map<string, MatchSnapshot[]>();
  for (const item of snapshots) {
    const list = byJob.get(item.jobKey);
    if (list) list.push(item);
    else byJob.set(item.jobKey, [item]);
  }

  const jobs: CompareJob[] = [];
  for (const [jobKey, items] of byJob) {
    const scores = latestByProfile(items, jobKey);
    if (scores.length < 2) continue;
    const best = scores[0];
    // 平分不算胜出：最高分只有严格大于第二名时才算。
    const bestProfileId = best.score > scores[1].score ? best.profileId : null;
    jobs.push({
      jobKey,
      jobTitle: items[0].jobTitle,
      company: items[0].company,
      scores,
      bestProfileId,
      spread: best.score - scores[scores.length - 1].score,
    });
  }
  // 差距大的排前面：先看"换方向真的有用"的那几行。
  jobs.sort(
    (left, right) => right.spread - left.spread || left.jobTitle.localeCompare(right.jobTitle),
  );

  const stats = new Map<
    string,
    { profileId: string; profileLabel: string; jobs: number; total: number; wins: number }
  >();
  for (const job of jobs) {
    for (const score of job.scores) {
      const entry = stats.get(score.profileId) ?? {
        profileId: score.profileId,
        profileLabel: score.profileLabel,
        jobs: 0,
        total: 0,
        wins: 0,
      };
      entry.jobs += 1;
      entry.total += score.score;
      if (job.bestProfileId === score.profileId) entry.wins += 1;
      stats.set(score.profileId, entry);
    }
  }
  const profiles = [...stats.values()]
    .map((entry) => ({
      profileId: entry.profileId,
      profileLabel: entry.profileLabel,
      jobs: entry.jobs,
      average: Math.round(entry.total / entry.jobs),
      wins: entry.wins,
    }))
    .sort((left, right) => right.wins - left.wins || right.average - left.average);

  return {
    jobs,
    profiles,
    comparedJobs: jobs.length,
    totalJobs: byJob.size,
  };
}
