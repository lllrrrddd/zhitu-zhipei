// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  CAREER_PROFILES_KEY,
  loadRecords,
  newRecordId,
  removeRecord,
  saveRecords,
  suggestedLabel,
  upsertRecord,
  type CareerProfileRecord,
} from "./careerProfiles";
import type { CareerProfile } from "./types";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
  } as Storage;
}

const profile: CareerProfile = {
  degree: "master",
  graduation_year: 2027,
  major: "计算机技术",
  direction: "运维开发",
  cities: ["深圳"],
  skills: ["Linux"],
  experience: ["做过监控"],
};

function record(overrides: Partial<CareerProfileRecord> = {}): CareerProfileRecord {
  return {
    id: "a",
    label: "运维开发",
    profile,
    updatedAt: "2026-11-08T00:00:00Z",
    ...overrides,
  };
}

describe("careerProfiles", () => {
  it("读不到或坏数据时返回空列表，不抛错", () => {
    expect(loadRecords(null)).toEqual([]);
    expect(loadRecords(memoryStorage())).toEqual([]);
    expect(loadRecords(memoryStorage({ [CAREER_PROFILES_KEY]: "{不是 JSON" }))).toEqual([]);
    expect(loadRecords(memoryStorage({ [CAREER_PROFILES_KEY]: '{"a":1}' }))).toEqual([]);
    // 缺字段的记录直接丢弃
    expect(
      loadRecords(memoryStorage({ [CAREER_PROFILES_KEY]: '[{"id":"x","label":"y"}]' })),
    ).toEqual([]);
  });

  it("保存后能原样读回（多份档案互不干扰）", () => {
    const storage = memoryStorage();
    const two = [record(), record({ id: "b", label: "数据分析" })];
    saveRecords(storage, two);
    expect(loadRecords(storage).map((item) => item.label)).toEqual(["运维开发", "数据分析"]);
  });

  it("upsert 覆盖同 id、追加新 id", () => {
    const base = [record()];
    const updated = upsertRecord(base, record({ label: "运维开发（上海）" }));
    expect(updated).toHaveLength(1);
    expect(updated[0].label).toBe("运维开发（上海）");

    const appended = upsertRecord(base, record({ id: "b", label: "第二个" }));
    expect(appended.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("删除只移除指定档案", () => {
    const list = [record(), record({ id: "b" })];
    expect(removeRecord(list, "a").map((item) => item.id)).toEqual(["b"]);
    expect(removeRecord(list, "不存在")).toHaveLength(2);
  });

  it("默认名字优先用目标岗位，其次城市，最后用调用方给的兜底文案", () => {
    expect(suggestedLabel(profile, 1, "简历")).toBe("运维开发");
    expect(suggestedLabel({ ...profile, direction: "  " }, 2, "简历")).toBe("深圳 · 2");
    // 兜底文案来自 i18n（纯模块不写死中文）
    expect(suggestedLabel({ ...profile, direction: "", cities: [] }, 3, "简历")).toBe("简历 3");
    expect(suggestedLabel({ ...profile, direction: "", cities: [] }, 3, "Resume")).toBe("Resume 3");
  });

  it("每次新建的 id 都不同", () => {
    expect(newRecordId()).not.toBe(newRecordId());
  });
});
