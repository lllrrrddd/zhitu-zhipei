// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { App } from "antd";
import { expect, it } from "vitest";
import { t } from "../../i18n";
import CareerComparePanel from "./CareerComparePanel";
import type { MatchSnapshot } from "./matchHistory";

/** 档案名是用户数据（用户可改），断言与 fixture 用同一批常量。 */
const OPS = "运维方向";
const TESTING = "测试方向";

function snap(
  jobKey: string,
  profileId: string,
  score: number,
  title = "平台运维工程师",
): MatchSnapshot {
  return {
    id: `${jobKey}-${profileId}`,
    jobKey,
    jobTitle: title,
    company: "测试公司",
    score,
    profileId,
    profileLabel: profileId === "p1" ? OPS : TESTING,
    createdAt: "2026-11-09T01:00:00Z",
    matchedSkills: 2,
  };
}

function renderPanel(snapshots: MatchSnapshot[]) {
  return render(
    <App>
      <CareerComparePanel snapshots={snapshots} />
    </App>,
  );
}

it("没有可比的岗位时整块不渲染", () => {
  const { container } = renderPanel([snap("job-a", "p1", 80)]);
  expect(container.querySelector(".career-compare")).toBeNull();
});

it("列出每份档案的覆盖岗位数与胜出次数", () => {
  renderPanel([
    snap("job-a", "p1", 88),
    snap("job-a", "p2", 70),
    snap("job-b", "p1", 60),
    snap("job-b", "p2", 90),
  ]);
  expect(screen.getByText(t("career.compare.title"))).toBeInTheDocument();
  expect(
    screen.getByText(t("career.compare.summary", { compared: 2, total: 2 })),
  ).toBeInTheDocument();
  expect(screen.getByText(OPS)).toBeInTheDocument();
  expect(screen.getByText(TESTING)).toBeInTheDocument();
  // 两份档案各胜出一场，胜出列应各有一个数字 1
  expect(screen.getAllByText("1")).toHaveLength(2);
});

it("逐岗位列出各档案分数，并给出最高分方向与分差", () => {
  renderPanel([snap("job-a", "p1", 88), snap("job-a", "p2", 70)]);
  expect(
    screen.getByText(t("career.compare.score", { profile: OPS, score: 88 })),
  ).toBeInTheDocument();
  expect(
    screen.getByText(t("career.compare.score", { profile: TESTING, score: 70 })),
  ).toBeInTheDocument();
  expect(screen.getByText(t("career.compare.spread", { spread: 18 }))).toBeInTheDocument();
});

it("同分时明确说没有更匹配的一方", () => {
  renderPanel([snap("job-a", "p1", 75), snap("job-a", "p2", 75)]);
  expect(screen.getByText(t("career.compare.tie"))).toBeInTheDocument();
  expect(screen.queryByText(t("career.compare.spread", { spread: 0 }))).toBeNull();
});
