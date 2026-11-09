// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  appendEntry,
  buildIssues,
  countOpen,
  healthDelta,
  HEALTH_HISTORY_KEY,
  HEALTH_TODO_KEY,
  loadHistory,
  loadIssueStates,
  saveHistory,
  saveIssueStates,
  setIssueState,
  type HealthEntry,
} from "./healthCheck";
import type { AtsCheckResult } from "../../types/ats";
import type { ResumeRiskScan } from "../../types/resumeRisk";

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

const ATS: AtsCheckResult = {
  resume_id: 1,
  score: 62,
  disclaimer: "本地规则估计，不代表真实 ATS 解析结果",
  summary: {},
  subscores: { format: 70, keyword: 50, position: 100 },
  issues: [
    {
      category: "keyword",
      severity: "high",
      title: "关键词覆盖不足",
      detail: "缺少 3 个目标词",
      evidence: ["Kubernetes", "Ansible"],
      suggestion: "把实际用过的工具补进技能栏。",
    },
    {
      category: "format",
      severity: "low",
      title: "段落偏长",
      detail: "",
      evidence: [],
      suggestion: "每段控制在 4 行内。",
    },
  ],
  matched_keywords: [],
  missing_keywords: ["Kubernetes"],
  coverage_ratio: 0.5,
};

const RISK: ResumeRiskScan = {
  resume_id: 1,
  remote_enhancement_available: false,
  llm_used: false,
  notes: [],
  summary: {},
  points: [
    {
      category: "duplicate",
      severity: "high",
      text: "负责系统稳定性建设",
      location: "项目经历「订单系统」",
      suggestion: "同一要点出现两次，删掉较弱的一处。",
      claim_id: null,
      follow_up: [],
    },
  ],
};

describe("合并清单", () => {
  it("把 ATS 与风险点合成一张表，按严重程度排序", () => {
    const issues = buildIssues(ATS, RISK);
    expect(issues.map((issue) => [issue.source, issue.severity])).toEqual([
      ["ats", "high"],
      ["risk", "high"],
      ["ats", "low"],
    ]);
  });

  it("同一类问题在不同轮次里指纹稳定（标记不会因为重排而丢）", () => {
    const first = buildIssues(ATS, RISK).map((issue) => issue.fingerprint);
    const second = buildIssues({ ...ATS, issues: [...ATS.issues].reverse() }, RISK).map(
      (issue) => issue.fingerprint,
    );
    expect(new Set(first)).toEqual(new Set(second));
    expect(new Set(first).size).toBe(first.length);
  });

  it("没有 ATS 也没有风险时返回空清单", () => {
    expect(buildIssues(null, null)).toEqual([]);
  });
});

describe("处理台账", () => {
  it("按状态统计待处理/已改好/已忽略", () => {
    const issues = buildIssues(ATS, RISK);
    const states = { [issues[0].fingerprint]: "done" as const };
    expect(countOpen(issues, states)).toEqual({ open: 2, done: 1, ignored: 0 });
    expect(countOpen(issues, undefined)).toEqual({ open: 3, done: 0, ignored: 0 });
  });

  it("标记撤销后回到待处理", () => {
    const issues = buildIssues(ATS, RISK);
    let states = setIssueState({}, 1, issues[0].fingerprint, "ignored");
    expect(states["1"][issues[0].fingerprint]).toBe("ignored");
    states = setIssueState(states, 1, issues[0].fingerprint, "todo");
    expect(states["1"]).toEqual({});
  });
});

describe("体检历史", () => {
  const entry = (score: number, issueCount: number, at: string): HealthEntry => ({
    at,
    signature: "sig",
    score,
    subscores: { format: score },
    issueCount,
    riskCount: 0,
  });

  it("同一份简历追加后可读回，并与上一次比较", () => {
    let history = appendEntry({}, 1, entry(60, 5, "2026-11-09T01:00:00Z"));
    history = appendEntry(history, 1, entry(72, 3, "2026-11-09T02:00:00Z"));
    const storage = fakeStorage();
    saveHistory(storage, history);
    const loaded = loadHistory(storage);
    expect(loaded["1"]).toHaveLength(2);
    expect(healthDelta(loaded["1"])).toEqual({ score: 12, issues: -2 });
  });

  it("只有一次体检时没有「较上次」", () => {
    expect(healthDelta([entry(60, 5, "2026-11-09T01:00:00Z")])).toBeNull();
    expect(healthDelta(undefined)).toBeNull();
  });

  it("坏数据整份丢弃，不抛异常", () => {
    const storage = fakeStorage({
      [HEALTH_HISTORY_KEY]: JSON.stringify({ "1": [{ at: "x" }, null], "2": "nope" }),
    });
    expect(loadHistory(storage)).toEqual({});
    expect(loadHistory(fakeStorage({ [HEALTH_HISTORY_KEY]: "{oops" }))).toEqual({});
    expect(loadIssueStates(fakeStorage({ [HEALTH_TODO_KEY]: "null" }))).toEqual({});
  });

  it("未知状态值被过滤（只认 todo/done/ignored）", () => {
    const storage = fakeStorage({
      [HEALTH_TODO_KEY]: JSON.stringify({ "1": { a: "done", b: "weird" } }),
    });
    expect(loadIssueStates(storage)).toEqual({ "1": { a: "done" } });
  });

  it("状态写回后可读回", () => {
    const storage = fakeStorage();
    const states = setIssueState({}, 1, "fp", "done");
    saveIssueStates(storage, states);
    expect(loadIssueStates(storage)).toEqual({ "1": { fp: "done" } });
  });
});
