// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  historyFor,
  latestPerProfile,
  loadSavedMatches,
  rememberSavedMatch,
  SAVED_PROFILE_KEY,
  withSavedMatch,
  type SavedProfileMatch,
  jobKeyOf,
  latestDelta,
  loadSnapshots,
  MATCH_HISTORY_KEY,
  MATCH_HISTORY_LIMIT,
  recordMatches,
  saveSnapshots,
  snapshotOf,
  type MatchSnapshot,
} from "./matchHistory";
import type { MatchedJob } from "./types";

function match(overrides: Partial<MatchedJob> = {}): MatchedJob {
  return {
    job: {
      id: "job-1",
      source_id: "tencent",
      company: "测试公司",
      title: "平台运维工程师",
      family: "平台运维工程师",
      cities: ["深圳"],
      kind: "campus",
      url: "https://example.com/job/1",
      listed_date: "2026-11-06",
      requirements: "",
      responsibilities: "",
      experience_requirement: "",
    },
    checked_at: "2026-11-07T00:00:00Z",
    current: true,
    fit: "strong",
    matched_skills: ["Linux", "Docker"],
    evidence: "",
    direction_match: true,
    city_match: true,
    degree_floor: "master",
    eligibility_notes: [],
    check_skills: [],
    score: 70,
    score_parts: [],
    gaps: [],
    relatedness: 50,
    ...overrides,
  };
}

/** 只实现读取接口的最小存储替身：Node 环境没有 localStorage。 */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  } as Storage;
}

describe("岗位标识", () => {
  it("优先用 URL，没有 URL 时退化成 来源+id", () => {
    expect(jobKeyOf(match())).toBe("https://example.com/job/1");
    const withoutUrl = match();
    withoutUrl.job = { ...withoutUrl.job, url: "  " };
    expect(jobKeyOf(withoutUrl)).toBe("tencent:job-1");
  });
});

describe("快照生成与记录", () => {
  it("记录一次匹配时带上档案名与该次的命中数", () => {
    const [snapshot] = recordMatches([], [match({ score: 87 })], { id: "p1", label: "运维" });
    expect(snapshot.score).toBe(87);
    expect(snapshot.profileId).toBe("p1");
    expect(snapshot.profileLabel).toBe("运维");
    expect(snapshot.matchedSkills).toBe(2);
    expect(snapshot.jobKey).toBe("https://example.com/job/1");
  });

  it("分数缺失时记 0，而不是 NaN（后端未升级时页面仍要有时间点）", () => {
    const [snapshot] = recordMatches([], [match({ score: undefined })], { id: "p1", label: "a" });
    expect(snapshot.score).toBe(0);
    expect(Number.isFinite(snapshot.score)).toBe(true);
  });

  it("同一批结果里重复的岗位只留一条", () => {
    const list = recordMatches([], [match(), match()], { id: "p1", label: "a" });
    expect(list).toHaveLength(1);
  });

  it("超过上限时丢最旧的，只保留最近 MATCH_HISTORY_LIMIT 条", () => {
    const many = Array.from({ length: MATCH_HISTORY_LIMIT + 5 }, (_, index) =>
      snapshotOf(
        match({ score: index }),
        { id: "p1", label: "a" },
        `2026-11-0${(index % 9) + 1}T00:00:00Z`,
      ),
    );
    const trimmed = recordMatches(many, [match({ score: 999 })], { id: "p1", label: "a" });
    expect(trimmed).toHaveLength(MATCH_HISTORY_LIMIT);
    expect(trimmed[trimmed.length - 1].score).toBe(999);
    expect(trimmed[0].score).toBeGreaterThan(0);
  });
});

describe("读取与容错", () => {
  it("坏数据整条丢弃，不抛异常", () => {
    const storage = fakeStorage({
      [MATCH_HISTORY_KEY]: JSON.stringify([
        { id: "x" },
        null,
        "nope",
        { id: "y", jobKey: "", score: 1 },
      ]),
    });
    expect(loadSnapshots(storage)).toEqual([]);
  });

  it("JSON 坏了、或存储不可用时返回空数组", () => {
    expect(loadSnapshots(fakeStorage({ [MATCH_HISTORY_KEY]: "{oops" }))).toEqual([]);
    expect(loadSnapshots(null)).toEqual([]);
  });

  it("写入后能原样读回", () => {
    const storage = fakeStorage();
    const list = recordMatches([], [match()], { id: "p1", label: "a" });
    saveSnapshots(storage, list);
    expect(loadSnapshots(storage)).toEqual(list);
  });
});

describe("按 (岗位, 档案) 比较", () => {
  const older: MatchSnapshot = {
    id: "s1",
    jobKey: "k",
    jobTitle: "岗位",
    company: "公司",
    score: 60,
    profileId: "p1",
    profileLabel: "运维",
    createdAt: "2026-11-01T00:00:00Z",
    matchedSkills: 1,
  };
  const newer: MatchSnapshot = { ...older, id: "s2", score: 75, createdAt: "2026-11-02T00:00:00Z" };

  it("只比同一岗位、同一档案", () => {
    const otherProfile = { ...newer, id: "s3", profileId: "p2", score: 95 };
    expect(historyFor([older, newer, otherProfile], "k", "p1")).toEqual([older, newer]);
    expect(latestDelta([older, newer, otherProfile], "k", "p1")).toEqual({
      previous: 60,
      delta: 15,
    });
    // 换一份档案匹配同一岗位时不该拿别人的分数当"上次"。
    expect(latestDelta([older, otherProfile], "k", "p2")).toBeNull();
  });

  it("只有一次记录时没有「较上次」", () => {
    expect(latestDelta([older], "k", "p1")).toBeNull();
    expect(latestDelta([], "k", "p1")).toBeNull();
  });

  it("顺序按时间而不是插入顺序（乱序写入也要算对）", () => {
    expect(latestDelta([newer, older], "k", "p1")).toEqual({ previous: 60, delta: 15 });
  });
});

describe("收藏上下文（用哪份档案收藏的）", () => {
  const entry = (jobId: number, profileId: string, at: string): SavedProfileMatch => ({
    jobId,
    profileId,
    profileLabel: profileId === "p1" ? "运维方向" : "测试方向",
    score: 70,
    at,
  });

  it("同一个岗位再次收藏时覆盖成最新那次", () => {
    const first = withSavedMatch({}, entry(1, "p1", "2026-11-09T01:00:00Z"));
    const second = withSavedMatch(first, entry(1, "p2", "2026-11-09T02:00:00Z"));
    expect(Object.keys(second)).toEqual(["1"]);
    expect(second["1"].profileId).toBe("p2");
  });

  it("坏数据整条丢弃，不让一条脏记录打崩收藏夹", () => {
    const storage = fakeStorage({
      [SAVED_PROFILE_KEY]: JSON.stringify({
        "1": { jobId: 1, profileId: "p1", profileLabel: "运维方向", score: 70, at: "x" },
        "2": { jobId: "2", profileId: "p1" },
        "3": "nope",
      }),
    });
    expect(Object.keys(loadSavedMatches(storage))).toEqual(["1"]);
    expect(loadSavedMatches(fakeStorage({ [SAVED_PROFILE_KEY]: "{oops" }))).toEqual({});
    expect(loadSavedMatches(null)).toEqual({});
  });

  it("一步记住（读-合并-写）后能读回来", () => {
    const storage = fakeStorage();
    rememberSavedMatch(storage, entry(5, "p1", "2026-11-09T01:00:00Z"));
    rememberSavedMatch(storage, entry(6, "p2", "2026-11-09T02:00:00Z"));
    expect(Object.keys(loadSavedMatches(storage)).sort()).toEqual(["5", "6"]);
  });
});

describe("同一岗位的各档案成绩", () => {
  const snap = (
    id: string,
    profileId: string,
    score: number,
    createdAt: string,
    jobKey = "k",
  ): MatchSnapshot => ({
    id,
    jobKey,
    jobTitle: "岗位",
    company: "公司",
    score,
    profileId,
    profileLabel: profileId === "p1" ? "运维方向" : "测试方向",
    createdAt,
    matchedSkills: 1,
  });

  it("每份档案只取最近一次，并按分数从高到低", () => {
    const rows = latestPerProfile(
      [
        snap("a", "p1", 60, "2026-11-01T00:00:00Z"),
        snap("b", "p1", 72, "2026-11-03T00:00:00Z"),
        snap("c", "p2", 88, "2026-11-02T00:00:00Z"),
        snap("d", "p3", 50, "2026-11-04T00:00:00Z", "别的岗位"),
      ],
      "k",
    );
    expect(rows.map((row) => [row.profileId, row.score])).toEqual([
      ["p2", 88],
      ["p1", 72],
    ]);
  });

  it("没有记录时返回空数组（界面据此留空）", () => {
    expect(latestPerProfile([], "k")).toEqual([]);
  });
});
