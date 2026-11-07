// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";

const officialUrl = "https://careers.tencent.com/jobdesc.html?postId=12345";
const market = {
  count: 1,
  current_count: 1,
  sources: [
    {
      id: "tencent",
      name: "腾讯招聘",
      url: "https://careers.tencent.com/search.html",
      status: "updated",
      checked_at: "2026-11-07T02:00:00Z",
      count: 1,
      current: true,
    },
    {
      id: "huawei",
      name: "华为校招",
      url: "https://career.huawei.com/reccampportal/portal5/campus-recruitment.html",
      status: "idle",
      checked_at: null,
      count: 0,
      current: false,
    },
  ],
};
const match = {
  market,
  relevant_count: 1,
  method: "rules",
  matches: [
    {
      job: {
        id: "tencent-12345",
        source_id: "tencent",
        company: "腾讯",
        title: "算法工程师",
        family: "算法",
        cities: ["深圳"],
        kind: "campus",
        url: officialUrl,
        listed_date: null,
        requirements: "硕士及以上，熟悉 Python",
        responsibilities: "开发算法服务",
        experience_requirement: "",
      },
      checked_at: "2026-11-07T02:00:00Z",
      current: true,
      fit: "strong",
      matched_skills: ["Python"],
      evidence: "",
      direction_match: true,
      city_match: false,
      degree_floor: "master",
      eligibility_notes: [],
      check_skills: [],
    },
  ],
};

for (const width of [320, 390, 1440]) {
  test(`${width}px career cards align and job title opens employer page`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("resumeforge.user-guide.seen", "1"));
    await page.route("**/api/career/market**", (route) => route.fulfill({ json: market }));
    await page.route("**/api/career/match", (route) => route.fulfill({ json: match }));
    await page.goto("/career");
    await expect(page.getByText("近期读取 1 条岗位")).toBeVisible();

    const actions = page.locator(".career-upload-actions .ant-btn");
    await expect(actions).toHaveCount(3);
    const first = await actions.nth(0).boundingBox();
    const second = await actions.nth(1).boundingBox();
    const third = await actions.nth(2).boundingBox();
    expect(first && second && third).toBeTruthy();
    expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
    const clippedAction = await actions.evaluateAll((buttons) =>
      buttons.some((button) => button.scrollWidth > button.clientWidth + 1),
    );
    expect(clippedAction).toBe(false);
    if (width < 560) {
      expect(third!.y).toBeGreaterThan(first!.y);
      expect(third!.width).toBeGreaterThan(first!.width);
    } else {
      expect(Math.abs(third!.y - first!.y)).toBeLessThan(2);
    }
    const tiles = page.locator(".career-source-list li");
    await expect(tiles).toHaveCount(2);
    const tile1 = await tiles.nth(0).boundingBox();
    const tile2 = await tiles.nth(1).boundingBox();
    expect(tile1 && tile2).toBeTruthy();
    if (width < 560) expect(tile2!.y).toBeGreaterThan(tile1!.y);
    else expect(Math.abs(tile2!.y - tile1!.y)).toBeLessThan(2);

    await page.getByRole("button", { name: "手动填写" }).click();
    await page.getByRole("textbox", { name: "想找的岗位" }).fill("算法工程师");
    await page.getByRole("button", { name: "确认并找岗位" }).click();
    const titleLink = page.locator(".career-result-card h3 a");
    await expect(titleLink).toHaveAttribute("href", officialUrl);
    await page
      .context()
      .route("https://careers.tencent.com/**", (route) =>
        route.fulfill({ contentType: "text/html", body: "employer posting test fixture" }),
      );
    const popupReady = page.waitForEvent("popup");
    await titleLink.click();
    const popup = await popupReady;
    await expect(popup).toHaveURL(officialUrl);
    await popup.close();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("an empty match list explains the limits of connected sources", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("resumeforge.user-guide.seen", "1"));
  await page.route("**/api/career/market**", (route) => route.fulfill({ json: market }));
  await page.route("**/api/career/match", (route) =>
    route.fulfill({ json: { ...match, matches: [], relevant_count: 0 } }),
  );
  await page.goto("/career");
  await page.getByRole("button", { name: "手动填写" }).click();
  await page.getByRole("textbox", { name: "想找的岗位" }).fill("食品研发");
  await page.getByRole("button", { name: "确认并找岗位" }).click();
  await expect(page.getByText(/当前接入来源没有找到这个方向的岗位/)).toBeVisible();
});

test("shows checking instead of zero while refreshing earlier records", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("resumeforge.user-guide.seen", "1"));
  const earlier = { ...market, current_count: 0 };
  let releaseRefresh = () => {};
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route("**/api/career/market", (route) => route.fulfill({ json: earlier }));
  await page.route("**/api/career/market/refresh**", async (route) => {
    await refreshGate;
    await route.fulfill({ json: market });
  });
  try {
    await page.goto("/career");
    await expect(page.locator(".career-market-heading strong")).toHaveText("正在核对招聘来源…");
  } finally {
    releaseRefresh();
  }
  await expect(page.locator(".career-market-heading strong")).toHaveText("近期读取 1 条岗位");
});
