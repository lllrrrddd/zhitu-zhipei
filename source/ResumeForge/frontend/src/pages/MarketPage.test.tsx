// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { browseCareerMarket, refreshCareerMarket } from "../api/career";
import type { MarketBrowse } from "../features/career/types";
import { t } from "../i18n";
import MarketPage from "./MarketPage";

vi.mock("../api/career", () => ({
  browseCareerMarket: vi.fn(),
  refreshCareerMarket: vi.fn(),
}));

const result: MarketBrowse = {
  market: {
    count: 1,
    current_count: 1,
    sources: [
      {
        id: "tencent",
        name: "Tencent",
        url: "https://careers.tencent.com",
        status: "updated",
        checked_at: "2026-11-07T09:00:00Z",
        count: 1,
        current: true,
      },
    ],
  },
  items: [
    {
      source_name: "Tencent",
      checked_at: "2026-11-07T09:00:00Z",
      current: true,
      job: {
        id: "tencent-123",
        source_id: "tencent",
        company: "Tencent",
        title: "Cloud Engineer",
        family: "Operations",
        cities: ["Shenzhen"],
        kind: "campus",
        url: "https://careers.tencent.com/jobdesc.html?postId=123",
        listed_date: null,
        requirements: "Linux and Docker",
        responsibilities: "Maintain cloud systems",
        experience_requirement: "",
      },
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
};

beforeEach(() => {
  vi.mocked(browseCareerMarket).mockReset().mockResolvedValue(result);
  vi.mocked(refreshCareerMarket).mockReset().mockResolvedValue(result.market);
});

it("shows a direct employer link and a requirements preview", async () => {
  render(<MarketPage />);
  const jobLink = await screen.findByRole("link", { name: /Cloud Engineer/ });
  expect(jobLink).toHaveAttribute("href", "https://careers.tencent.com/jobdesc.html?postId=123");
  expect(jobLink).toHaveAttribute("target", "_blank");
  fireEvent.click(screen.getByRole("button", { name: t("career.browse.preview") }));
  expect(screen.getByRole("heading", { name: t("career.browse.requirements") })).toBeVisible();
  expect(screen.getAllByText("Linux and Docker")).toHaveLength(2);
  await waitFor(() => expect(browseCareerMarket).toHaveBeenCalled());
});
