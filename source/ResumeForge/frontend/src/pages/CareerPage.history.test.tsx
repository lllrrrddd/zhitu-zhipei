// SPDX-License-Identifier: Apache-2.0
/**
 * 页面级接线测试：**匹配成功后历史要真的落进这台设备，并且第二次匹配能看到差值**。
 *
 * 单测已经覆盖了快照的加减，这里补的是"CareerPage 真的在成功后记了一笔、又把历史交给卡片"
 * 这段胶水——它最容易在重构里被漏掉，而且漏了页面上不会有任何报错。
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { t } from "../i18n";
import { CAREER_PROFILES_KEY, type CareerProfileRecord } from "../features/career/careerProfiles";
import type { CareerMatches, MatchedJob } from "../features/career/types";
import { MATCH_HISTORY_KEY, loadSnapshots } from "../features/career/matchHistory";
import CareerPage from "./CareerPage";

const careerApi = vi.hoisted(() => ({
  findCareerMatches: vi.fn(),
  getCareerMarket: vi.fn(),
  refreshCareerMarket: vi.fn(),
}));
vi.mock("../api/career", () => careerApi);

const profile: CareerProfileRecord = {
  id: "p1",
  label: "运维方向",
  updatedAt: "2026-11-07T00:00:00Z",
  profile: {
    degree: "master",
    graduation_year: 2027,
    major: "计算机技术",
    direction: "运维开发",
    cities: ["深圳"],
    skills: ["Linux"],
    experience: [],
  },
};

function match(score: number): MatchedJob {
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
      requirements: "熟悉 Linux。",
      responsibilities: "负责平台稳定性建设。",
      experience_requirement: "",
    },
    checked_at: "2026-11-07T00:00:00Z",
    current: true,
    fit: "strong",
    matched_skills: ["Linux"],
    evidence: "",
    direction_match: true,
    city_match: true,
    degree_floor: "master",
    eligibility_notes: [],
    check_skills: [],
    score,
    score_parts: [],
    gaps: [],
    relatedness: 50,
  };
}

function results(score: number): CareerMatches {
  return {
    market: { count: 1, current_count: 1, sources: [] },
    matches: [match(score)],
    relevant_count: 1,
    method: "semantic",
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <App>
        <CareerPage />
      </App>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // jsdom 没有实现 scrollIntoView：结果区会把视口滚过去，不补桩会让 effect 里抛错。
  Element.prototype.scrollIntoView = vi.fn();
  window.localStorage.clear();
  window.localStorage.setItem(CAREER_PROFILES_KEY, JSON.stringify([profile]));
  careerApi.getCareerMarket.mockResolvedValue({
    count: 1,
    current_count: 1,
    sources: [],
  });
  careerApi.refreshCareerMarket.mockResolvedValue({ count: 1, current_count: 1, sources: [] });
  careerApi.findCareerMatches.mockReset();
});

it("每次匹配成功都记一笔历史，第二次匹配后卡片上出现差值", async () => {
  careerApi.findCareerMatches.mockResolvedValueOnce(results(60));
  renderPage();

  // 按钮里带图标，可访问名由图标+文字拼成；直接取文字所属的按钮更稳。
  const search = (await screen.findByText(t("career.profile.search"))).closest("button")!;
  fireEvent.click(search);
  expect(await screen.findByText("60")).toBeInTheDocument();
  await waitFor(() => expect(loadSnapshots(window.localStorage)).toHaveLength(1));

  careerApi.findCareerMatches.mockResolvedValueOnce(results(75));
  fireEvent.click(search);

  expect(await screen.findByText(t("career.history.delta", { delta: "+15" }))).toBeInTheDocument();
  await waitFor(() => expect(loadSnapshots(window.localStorage)).toHaveLength(2));
  // 快照记的是当时使用的档案，改名后也能说清是哪一次。
  const stored = loadSnapshots(window.localStorage);
  expect(stored.every((item) => item.profileId === "p1")).toBe(true);
  expect(stored.every((item) => item.profileLabel === profile.label)).toBe(true);
  expect(window.localStorage.getItem(MATCH_HISTORY_KEY)).not.toBeNull();
});

it("匹配失败不写历史（不给用户一条没算出来的分数）", async () => {
  careerApi.findCareerMatches.mockRejectedValueOnce(new Error("network down"));
  renderPage();

  fireEvent.click((await screen.findByText(t("career.profile.search"))).closest("button")!);
  expect(await screen.findByText("network down")).toBeInTheDocument();
  expect(loadSnapshots(window.localStorage)).toEqual([]);
});
