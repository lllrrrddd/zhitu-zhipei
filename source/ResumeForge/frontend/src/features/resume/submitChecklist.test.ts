// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  buildChecklist,
  checklistToText,
  loadChecks,
  MANUAL_ITEMS,
  progressOf,
  saveChecks,
  scopeKey,
  toggleCheck,
  SUBMIT_CHECK_KEY,
} from "./submitChecklist";

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

describe("自动核对", () => {
  it("关键词全部命中时判为通过", () => {
    const checklist = buildChecklist({
      matchedKeywords: ["Linux", "Docker"],
      missingKeywords: [],
      highIssues: 0,
    });
    expect(checklist.coverage).toEqual({ matched: 2, total: 2, missing: [] });
    expect(checklist.auto).toEqual([
      { key: "coverage", state: "ok" },
      { key: "issues", state: "ok" },
    ]);
  });

  it("有缺失关键词与高危问题时都判为需要看一眼", () => {
    const checklist = buildChecklist({
      matchedKeywords: ["Linux"],
      missingKeywords: ["Kubernetes", "Ansible"],
      highIssues: 2,
    });
    expect(checklist.coverage?.missing).toEqual(["Kubernetes", "Ansible"]);
    expect(checklist.auto).toEqual([
      { key: "coverage", state: "warn" },
      { key: "issues", state: "warn" },
    ]);
  });

  it("抽不出目标词时不假装通过：标 warn 且 coverage 为空", () => {
    const checklist = buildChecklist({ matchedKeywords: [], missingKeywords: [], highIssues: 0 });
    expect(checklist.coverage).toBeNull();
    expect(checklist.auto[0]).toEqual({ key: "coverage", state: "warn" });
  });

  it("缺失词最多列 12 个，避免刷屏", () => {
    const missing = Array.from({ length: 20 }, (_, index) => `词${index}`);
    const checklist = buildChecklist({
      matchedKeywords: [],
      missingKeywords: missing,
      highIssues: 0,
    });
    expect(checklist.coverage?.total).toBe(20);
    expect(checklist.coverage?.missing).toHaveLength(12);
  });
});

describe("勾选记忆", () => {
  it("按 简历×岗位 分开存：换岗位不串", () => {
    const storage = fakeStorage();
    const scopeA = scopeKey(7, 1);
    const scopeB = scopeKey(7, 2);
    saveChecks(storage, scopeA, toggleCheck({}, "contact", true));
    expect(loadChecks(storage, scopeA)).toEqual({ contact: true });
    expect(loadChecks(storage, scopeB)).toEqual({});
  });

  it("取消勾选会删掉条目（不占存储）", () => {
    const checks = toggleCheck(toggleCheck({}, "pages", true), "pages", false);
    expect(checks).toEqual({});
  });

  it("完成度只数人工项", () => {
    expect(progressOf({}, MANUAL_ITEMS)).toEqual({ done: 0, total: MANUAL_ITEMS.length });
    expect(progressOf({ contact: true, truth: true }, MANUAL_ITEMS)).toEqual({
      done: 2,
      total: MANUAL_ITEMS.length,
    });
  });

  it("坏数据整份丢弃", () => {
    expect(loadChecks(fakeStorage({ [SUBMIT_CHECK_KEY]: "{oops" }), "7:1")).toEqual({});
    expect(
      loadChecks(fakeStorage({ [SUBMIT_CHECK_KEY]: JSON.stringify({ "7:1": [] }) }), "7:1"),
    ).toEqual({});
    expect(loadChecks(null, "7:1")).toEqual({});
  });
});

describe("复制文本", () => {
  it("自动项在前、人工项带勾选标记，末尾附体检分", () => {
    const text = checklistToText({
      title: "投递自检 · 运维工程师",
      autoLines: ["关键词覆盖 1/2", "高危问题 0 条"],
      manualLines: [
        { label: "联系方式可用", checked: true },
        { label: "页数不超过 2 页", checked: false },
      ],
      footer: "上次体检 66 分。",
    });
    expect(text).toContain("投递自检 · 运维工程师");
    expect(text).toContain("· 关键词覆盖 1/2");
    expect(text).toContain("- [x] 联系方式可用");
    expect(text).toContain("- [ ] 页数不超过 2 页");
    expect(text.trimEnd().endsWith("上次体检 66 分。")).toBe(true);
  });

  it("没有自动项时不留空段", () => {
    const text = checklistToText({
      title: "T",
      autoLines: [],
      manualLines: [{ label: "A", checked: false }],
      footer: "",
    });
    expect(text).toBe("T\n\n- [ ] A");
  });
});
