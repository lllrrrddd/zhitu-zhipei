// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { App } from "antd";
import { expect, it } from "vitest";
import { t } from "../../i18n";
import FavoriteMatchTags from "./FavoriteMatchTags";
import type { SavedProfileMatch } from "./matchHistory";

/** 档案名是**用户数据**（用户可改），不是界面文案：断言与 fixture 用同一个常量。 */
const OPS = "运维方向";
const TESTING = "测试方向";

const SAVED: SavedProfileMatch = {
  jobId: 7,
  profileId: "p1",
  profileLabel: OPS,
  score: 68,
  at: "2026-11-09T01:00:00Z",
};

function renderTags(props: Parameters<typeof FavoriteMatchTags>[0]) {
  return render(
    <App>
      <FavoriteMatchTags {...props} />
    </App>,
  );
}

it("没有收藏上下文也没有历史时什么都不渲染", () => {
  const { container } = renderTags({ scores: [] });
  expect(container.querySelector(".career-favorite-match")).toBeNull();
});

it("只有收藏上下文时显示当时的档案与分数", () => {
  renderTags({ saved: SAVED, scores: [] });
  expect(
    screen.getByText(t("career.favorites.saved", { profile: OPS, score: 68 })),
  ).toBeInTheDocument();
  expect(screen.queryByText(/career\.favorites\.better/)).toBeNull();
});

it("另一份档案分数更高时点名「更匹配」", () => {
  renderTags({
    saved: SAVED,
    scores: [
      { profileId: "p2", profileLabel: TESTING, score: 88 },
      { profileId: "p1", profileLabel: OPS, score: 68 },
    ],
  });
  expect(
    screen.getByText(t("career.favorites.better", { profile: TESTING, score: 88 })),
  ).toBeInTheDocument();
});

it("最高分就是收藏时那份时不喊「更匹配」", () => {
  renderTags({
    saved: SAVED,
    scores: [
      { profileId: "p1", profileLabel: OPS, score: 68 },
      { profileId: "p2", profileLabel: TESTING, score: 40 },
    ],
  });
  expect(
    screen.queryByText(t("career.favorites.better", { profile: OPS, score: 68 })),
  ).toBeNull();
});

it("老收藏没有上下文时，用历史里的各份成绩兜底显示", () => {
  renderTags({
    scores: [
      { profileId: "p1", profileLabel: OPS, score: 68 },
      { profileId: "p2", profileLabel: TESTING, score: 61 },
    ],
  });
  expect(
    screen.getByText(t("career.favorites.saved", { profile: OPS, score: 68 })),
  ).toBeInTheDocument();
  expect(
    screen.getByText(t("career.favorites.saved", { profile: TESTING, score: 61 })),
  ).toBeInTheDocument();
});
