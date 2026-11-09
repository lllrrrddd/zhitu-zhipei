// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  backupFileName,
  type CareerBackupFile,
  buildBackup,
  CAREER_BACKUP_KIND,
  CAREER_BACKUP_VERSION,
  importBackup,
  mergeBackup,
  parseBackup,
  serializeBackup,
} from "./careerBackup";
import { CAREER_PROFILES_KEY, loadRecords, type CareerProfileRecord } from "./careerProfiles";
import {
  loadSavedMatches,
  loadSnapshots,
  MATCH_HISTORY_KEY,
  SAVED_PROFILE_KEY,
  type MatchSnapshot,
} from "./matchHistory";

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

const record = (id: string, label: string): CareerProfileRecord => ({
  id,
  label,
  updatedAt: "2026-11-09T00:00:00Z",
  profile: {
    degree: "master",
    graduation_year: 2027,
    major: "计算机技术",
    direction: "运维开发",
    cities: ["深圳"],
    skills: ["Linux"],
    experience: [],
  },
});

const snapshot = (id: string, profileId: string, score: number): MatchSnapshot => ({
  id,
  jobKey: "https://example.com/job/1",
  jobTitle: "平台运维工程师",
  company: "测试公司",
  score,
  profileId,
  profileLabel: profileId,
  createdAt: "2026-11-09T01:00:00Z",
  matchedSkills: 2,
});

function storageWith(profiles: CareerProfileRecord[], snapshots: MatchSnapshot[] = []) {
  return fakeStorage({
    [CAREER_PROFILES_KEY]: JSON.stringify(profiles),
    [MATCH_HISTORY_KEY]: JSON.stringify(snapshots),
    [SAVED_PROFILE_KEY]: JSON.stringify({
      "1": {
        jobId: 1,
        profileId: "p1",
        profileLabel: "运维方向",
        score: 87,
        at: "2026-11-09T01:00:00Z",
      },
    }),
  });
}

describe("导出", () => {
  it("把三份本机数据打成一个带版本号的文件", () => {
    const backup = buildBackup(storageWith([record("p1", "运维方向")], [snapshot("s1", "p1", 80)]));
    expect(backup.kind).toBe(CAREER_BACKUP_KIND);
    expect(backup.version).toBe(CAREER_BACKUP_VERSION);
    expect(backup.profiles.map((item) => item.id)).toEqual(["p1"]);
    expect(backup.snapshots).toHaveLength(1);
    expect(Object.keys(backup.savedMatches)).toEqual(["1"]);
    expect(backup.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("文件名带日期，下几个版本不用自己改名", () => {
    expect(backupFileName(new Date("2026-11-09T10:00:00Z"))).toBe(
      "zhitu-career-backup-20261109.json",
    );
  });

  it("序列化出来的 JSON 能原样解析回去（round-trip）", () => {
    const original = buildBackup(
      storageWith([record("p1", "运维方向")], [snapshot("s1", "p1", 80)]),
    );
    const parsed = parseBackup(serializeBackup(original));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.profiles).toEqual(original.profiles);
    expect(parsed.backup.snapshots).toEqual(original.snapshots);
    expect(parsed.backup.savedMatches).toEqual(original.savedMatches);
  });
});

describe("导入的拒绝条件", () => {
  it("空文件、坏 JSON、别的应用的 JSON 都不认", () => {
    expect(parseBackup("   ")).toEqual({ ok: false, code: "empty" });
    expect(parseBackup("{oops")).toEqual({ ok: false, code: "invalid" });
    expect(parseBackup(JSON.stringify({ hello: "world" }))).toEqual({
      ok: false,
      code: "invalid",
    });
  });

  it("版本不认识时单独报错，而不是当成坏文件", () => {
    const text = JSON.stringify({
      kind: CAREER_BACKUP_KIND,
      version: 99,
      profiles: [],
    });
    expect(parseBackup(text)).toEqual({ ok: false, code: "version" });
  });

  it("合法文件里夹着坏档案时，只丢那一条", () => {
    const text = JSON.stringify({
      kind: CAREER_BACKUP_KIND,
      version: CAREER_BACKUP_VERSION,
      exportedAt: "2026-11-09T00:00:00Z",
      profiles: [record("p1", "运维方向"), { id: "p2" }, null],
      snapshots: [snapshot("s1", "p1", 80), { id: "bad" }],
      savedMatches: { "1": { jobId: 1, profileId: "p1" }, "2": 3 },
    });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.profiles.map((item) => item.id)).toEqual(["p1"]);
    expect(parsed.backup.snapshots.map((item) => item.id)).toEqual(["s1"]);
    expect(Object.keys(parsed.backup.savedMatches)).toEqual([]);
  });
});

describe("合并：只补不覆盖", () => {
  const local = {
    profiles: [record("p1", "运维方向")],
    snapshots: [snapshot("s1", "p1", 80)],
    savedMatches: {
      "1": {
        jobId: 1,
        profileId: "p1",
        profileLabel: "运维方向",
        score: 80,
        at: "2026-11-09T01:00:00Z",
      },
    },
  };

  it("同 id 的档案与快照保留本地版本，只新增缺的", () => {
    const incoming: CareerBackupFile = {
      kind: CAREER_BACKUP_KIND,
      version: CAREER_BACKUP_VERSION,
      exportedAt: "",
      profiles: [record("p1", "旧名字"), record("p2", "测试方向")],
      snapshots: [snapshot("s1", "p1", 60), snapshot("s2", "p2", 90)],
      savedMatches: {
        "1": {
          jobId: 1,
          profileId: "p2",
          profileLabel: "测试方向",
          score: 90,
          at: "2026-11-08T00:00:00Z",
        },
        "2": {
          jobId: 2,
          profileId: "p2",
          profileLabel: "测试方向",
          score: 70,
          at: "2026-11-08T00:00:00Z",
        },
      },
    };
    const result = mergeBackup(local, incoming);
    expect(result.profiles.map((item) => [item.id, item.label])).toEqual([
      ["p1", "运维方向"],
      ["p2", "测试方向"],
    ]);
    expect(result.snapshots.map((item) => [item.id, item.score])).toEqual([
      ["s1", 80],
      ["s2", 90],
    ]);
    // 键已存在就保留本地的（哪怕备份里是更早的那次）
    expect(result.savedMatches["1"].profileId).toBe("p1");
    expect(result.savedMatches["2"].profileId).toBe("p2");
    expect(result.added).toEqual({ profiles: 1, snapshots: 1, savedMatches: 1 });
  });

  it("导入后写回存储，读出来就是合并结果", () => {
    const storage = storageWith([record("p1", "运维方向")], [snapshot("s1", "p1", 80)]);
    const result = importBackup(storage, {
      kind: CAREER_BACKUP_KIND,
      version: CAREER_BACKUP_VERSION,
      exportedAt: "",
      profiles: [record("p2", "测试方向")],
      snapshots: [snapshot("s2", "p2", 90)],
      savedMatches: {},
    });
    expect(result.added.profiles).toBe(1);
    expect(
      loadRecords(storage)
        .map((item) => item.id)
        .sort(),
    ).toEqual(["p1", "p2"]);
    expect(
      loadSnapshots(storage)
        .map((item) => item.id)
        .sort(),
    ).toEqual(["s1", "s2"]);
    // 已有的收藏上下文没被空备份冲掉
    expect(Object.keys(loadSavedMatches(storage))).toEqual(["1"]);
  });

  it("同一份备份导入两次不会翻倍", () => {
    const storage = storageWith([record("p1", "运维方向")], [snapshot("s1", "p1", 80)]);
    const backup = buildBackup(storage);
    const first = importBackup(storage, backup);
    expect(first.added).toEqual({ profiles: 0, snapshots: 0, savedMatches: 0 });
    expect(loadSnapshots(storage)).toHaveLength(1);
  });
});
