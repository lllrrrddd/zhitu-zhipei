// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { t } from "../../i18n";
import CareerSourcePanel from "./CareerSourcePanel";

it("shows the first four sources and lets users expand the rest", () => {
  render(
    <CareerSourcePanel
      market={{
        count: 5,
        current_count: 5,
        sources: Array.from({ length: 5 }, (_, index) => ({
          id: `source-${index}`,
          name: `Employer ${index + 1}`,
          url: `https://example.com/${index}`,
          status: "updated" as const,
          checked_at: "2026-11-07T00:00:00Z",
          count: 1,
          current: true,
        })),
      }}
      refreshing={false}
      error={false}
      onRefresh={() => undefined}
    />,
  );

  expect(screen.getByText("Employer 1 ↗")).toBeVisible();
  const extra = screen.getByText("Employer 5 ↗");
  expect(extra.closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText(`${t("career.market.title")} (1)`)).toBeVisible();
});
