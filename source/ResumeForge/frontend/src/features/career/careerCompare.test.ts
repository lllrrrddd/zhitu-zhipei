// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { buildCompareReport } from "./careerCompare";
import type { MatchSnapshot } from "./matchHistory";

function snap(
  jobKey: string,
  profileId: string,
  score: number,
  createdAt = "2026-11-09T01:00:00Z",
  title = "平台运维工程师",
): MatchSnapshot {
  return {
    id: `${jobKey}-${profileId}-${createdAt}`,
    jobKey,
    jobTitle: title,
    company: "测试公司",
    score,
    profileId,
    profileLabel: profileId === "p1" ? "运维方向" : "测试方向",
    createdAt,
    matchedSkills: 2,
  };
}

describe("对比报告", () => {
  it("只有被两份以上档案匹配过的岗位才进入对比", () => {
    const report = buildCompareReport([
      snap("job-a", "p1", 80),
      snap("job-a", "p2", 70),
      snap("job-b", "p1", 90),
    ]);
    expect(report.jobs.map((job) => job.jobKey)).toEqual(["job-a"]);
    expect(report.comparedJobs).toBe(1);
    // 只被一份档案匹配过的岗位仍计入"历史里共几个"
    expect(report.totalJobs).toBe(2);
  });

  it("每份档案取最近一次分数，旧分不参与比较", () => {
    const report = buildCompareReport([
      snap("job-a", "p1", 60, "2026-11-01T00:00:00Z"),
      snap("job-a", "p1", 78, "2026-11-05T00:00:00Z"),
      snap("job-a", "p2", 72, "2026-11-03T00:00:00Z"),
    ]);
    const job = report.jobs[0];
    expect(job.scores.map((score) => [score.profileId, score.score])).toEqual([
      ["p1", 78],
      ["p2", 72],
    ]);
    expect(job.bestProfileId).toBe("p1");
    expect(job.spread).toBe(6);
  });

  it("平分不算胜出：两份档案都不会被记成赢", () => {
    const report = buildCompareReport([snap("job-a", "p1", 75), snap("job-a", "p2", 75)]);
    expect(report.jobs[0].bestProfileId).toBeNull();
    expect(report.jobs[0].spread).toBe(0);
    expect(report.profiles.every((profile) => profile.wins === 0)).toBe(true);
  });

  it("汇总每份档案的覆盖数、平均分与胜出次数", () => {
    const report = buildCompareReport([
      snap("job-a", "p1", 80),
      snap("job-a", "p2", 70),
      snap("job-b", "p1", 60),
      snap("job-b", "p2", 90),
      snap("job-c", "p1", 88),
      snap("job-c", "p2", 70),
    ]);
    expect(
      report.profiles.map((profile) => [profile.profileId, profile.jobs, profile.wins]),
    ).toEqual([
      ["p1", 3, 2],
      ["p2", 3, 1],
    ]);
    expect(report.profiles[0].average).toBe(76);
    expect(report.profiles[1].average).toBe(77);
  });

  it("差距大的岗位排在前面（先看换方向真的有用的那几行）", () => {
    const report = buildCompareReport([
      snap("job-small", "p1", 80),
      snap("job-small", "p2", 78),
      snap("job-big", "p1", 90, "2026-11-09T01:00:00Z", "数据分析师"),
      snap("job-big", "p2", 55, "2026-11-09T01:00:00Z", "数据分析师"),
    ]);
    expect(report.jobs.map((job) => [job.jobKey, job.spread])).toEqual([
      ["job-big", 35],
      ["job-small", 2],
    ]);
  });

  it("空历史返回空报告，界面据此整块不渲染", () => {
    const report = buildCompareReport([]);
    expect(report).toEqual({ jobs: [], profiles: [], comparedJobs: 0, totalJobs: 0 });
  });
});
