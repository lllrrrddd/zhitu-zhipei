// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { App } from "antd";
import { expect, it } from "vitest";
import { t } from "../../i18n";
import CareerMatchHistory from "./CareerMatchHistory";
import type { MatchSnapshot } from "./matchHistory";

function snapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    id: "s1",
    jobKey: "https://example.com/job/1",
    jobTitle: "平台运维工程师",
    company: "测试公司",
    score: 60,
    profileId: "p1",
    profileLabel: "运维方向",
    createdAt: "2026-11-01T00:00:00Z",
    matchedSkills: 1,
    ...overrides,
  };
}

function renderHistory(snapshots: MatchSnapshot[]) {
  return render(
    <App>
      <CareerMatchHistory snapshots={snapshots} jobKey="https://example.com/job/1" profileId="p1" />
    </App>,
  );
}

it("只有一次记录时不显示「较上次」", () => {
  const { container } = renderHistory([snapshot()]);
  expect(container.querySelector(".career-history")).toBeNull();
});

it("有两次记录时给出差值，并写清上次分数", () => {
  renderHistory([
    snapshot({ id: "s1", score: 60, createdAt: "2026-11-01T00:00:00Z" }),
    snapshot({ id: "s2", score: 75, createdAt: "2026-11-02T00:00:00Z" }),
  ]);
  expect(screen.getByText(t("career.history.delta", { delta: "+15" }))).toBeInTheDocument();
  expect(screen.getByText(t("career.history.previous", { score: 60 }))).toBeInTheDocument();
});

it("降分也一样给出负号，不说成「提升」", () => {
  renderHistory([
    snapshot({ id: "s1", score: 80, createdAt: "2026-11-01T00:00:00Z" }),
    snapshot({ id: "s2", score: 72, createdAt: "2026-11-02T00:00:00Z" }),
  ]);
  expect(screen.getByText(t("career.history.delta", { delta: "-8" }))).toBeInTheDocument();
});

it("分数没变时明确说同分，而不是显示 +0", () => {
  renderHistory([
    snapshot({ id: "s1", score: 70, createdAt: "2026-11-01T00:00:00Z" }),
    snapshot({ id: "s2", score: 70, createdAt: "2026-11-02T00:00:00Z" }),
  ]);
  expect(screen.getByText(t("career.history.same"))).toBeInTheDocument();
});

it("展开后能看到最近几次的时间与分数（最新的在最前）", () => {
  renderHistory([
    snapshot({ id: "s1", score: 60, createdAt: "2026-11-01T00:00:00Z", matchedSkills: 1 }),
    snapshot({ id: "s2", score: 75, createdAt: "2026-11-02T00:00:00Z", matchedSkills: 3 }),
  ]);
  expect(screen.getByText(t("career.history.title"))).toBeInTheDocument();
  const items = screen.getAllByRole("listitem").map((node) => node.textContent ?? "");
  expect(items).toHaveLength(2);
  // 最新的一条排在最前：75 分、命中 3 项。
  expect(items[0]).toContain("75");
  expect(items[0]).toContain("3");
  expect(items[1]).toContain("60");
});

it("别的档案的历史不会串进来", () => {
  const { container } = renderHistory([
    snapshot({ id: "s1", profileId: "p2", score: 90 }),
    snapshot({ id: "s2", profileId: "p2", score: 95 }),
  ]);
  expect(container.querySelector(".career-history")).toBeNull();
});
