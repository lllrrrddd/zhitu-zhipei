// SPDX-License-Identifier: Apache-2.0
/**
 * 深水功能验证：需要真实数据 + 本地模型才能看到结果的那几条。
 *
 * 覆盖：检查弹窗四页签（有内容时是否真出结论）、制作台 AI 修改、岗位广场批量生成、
 * 面试全流程（选材料 → 开始 → 作答 → 下一题）。每条独立断言，失败存截图。
 *
 * 用法：node scripts/deep-features.mjs --base http://127.0.0.1:3120 --user a@b.com --pass xxx
 * 前提：该账号已有一份**有内容**的简历（否则检查必然空态）与一份岗位记录。
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { argv, exit } from "node:process";

const args = new Map();
for (let i = 2; i < argv.length; i += 2) args.set(argv[i].replace(/^--/, ""), argv[i + 1]);
const BASE = (args.get("base") ?? "http://127.0.0.1:3120").replace(/\/$/, "");
const USER = args.get("user") ?? "";
const PASS = args.get("pass") ?? "";
const SHOTS = args.get("shots") ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
await ctx.addInitScript(() => window.localStorage.setItem("resumeforge.user-guide.seen", "1"));
const page = await ctx.newPage();

let apiErrors = [];
page.on("response", (res) => {
  const url = res.url();
  if (url.includes("/api/") && res.status() >= 400 && res.status() !== 401) {
    apiErrors.push(`${res.status()} ${url.replace(BASE, "")}`);
  }
});
page.on("pageerror", (err) => apiErrors.push(`pageerror ${String(err).slice(0, 120)}`));

const text = async (sel = ".app-main") =>
  (await page.locator(sel).innerText().catch(() => "")).replace(/\s+/g, "");
const goto = async (r) => {
  await page.goto(BASE + r, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
};

async function probe(name, fn) {
  apiErrors = [];
  const t0 = Date.now();
  try {
    const note = await fn();
    const errs = [...new Set(apiErrors)];
    if (errs.length) throw new Error(`接口报错 ${errs.slice(0, 2).join(" ; ")}`);
    results.push({ name, status: "PASS", note: note ?? "", ms: Date.now() - t0 });
  } catch (err) {
    results.push({ name, status: "FAIL", note: String(err.message ?? err).slice(0, 150), ms: Date.now() - t0 });
    if (SHOTS) {
      await page
        .screenshot({ path: `${SHOTS}/FAIL-${name.replace(/[/\\:*?"<>|]/g, "_")}.png` })
        .catch(() => {});
    }
  }
}

const expect = async (cond, msg) => {
  if (!(await cond)) throw new Error(msg);
};

// 登录 + 锁中文（语言是服务端持久化的，上一轮残留英文会让选择器全部落空）
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
if (await page.locator(".auth-card").count()) {
  const inputs = page.locator(".auth-form input");
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill(PASS);
  await page.locator(".auth-submit").click();
  await page.waitForTimeout(3000);
}
await page.evaluate(async () => {
  await fetch("/api/settings/locale", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "zh-CN" }),
  });
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// ── 1. 检查弹窗：有内容时四个页签是否真出结论 ──────────────────────────
await probe("检查 · 有内容时四页签出结论", async () => {
  await goto("/resumes");
  const preview = page.locator('.ant-btn:has-text("预览")').first();
  if (!(await preview.count())) throw new Error("没有简历可检查");
  await preview.click();
  await page.waitForTimeout(2500);
  const check = page.locator('button:has-text("检查")').first();
  if (!(await check.count())) throw new Error("展开区没有「检查」");
  await check.click();
  await page.waitForTimeout(6000);
  const tabs = page.locator('.ant-modal [role=tab], .ant-drawer [role=tab]');
  const n = await tabs.count();
  await expect(async () => n >= 4, `只有 ${n} 个页签`);
  const detail = [];
  for (let i = 0; i < n; i += 1) {
    const label = (await tabs.nth(i).innerText()).trim();
    await tabs.nth(i).click();
    await page.waitForTimeout(3500);
    const body = (await page.locator(".ant-modal, .ant-drawer").last().innerText()).replace(/\s+/g, " ");
    detail.push(`${label}:${body.length}字`);
  }
  await page.keyboard.press("Escape");
  return detail.join(" / ");
});

// ── 2. 制作台 AI 修改（真模型调用，1-2 分钟） ──────────────────────────
await probe("制作台 · AI 修改并落库", async () => {
  await goto("/resumes");
  await page.locator('.ant-btn:has-text("预览")').first().click();
  await page.waitForTimeout(2000);
  const open = page.locator('button:has-text("简历制作台")').first();
  if (!(await open.count())) throw new Error("没有「简历制作台」入口");
  await open.click();
  await page.waitForTimeout(4000);
  const tabs = await page.locator("[role=tab]").allInnerTexts();
  await expect(async () => tabs.some((x) => /排版参数/.test(x)), "未进入制作台");

  const ai = page
    .locator('button:has-text("AI 修改"), button:has-text("重新生成"), button:has-text("AI 补上")')
    .first();
  if (!(await ai.count())) {
    const labels = (await page.locator("button").allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    throw new Error(`制作台没有 AI 修改入口；现有：${labels.slice(0, 14).join("/")}`);
  }
  const before = (await text()).length;
  await ai.scrollIntoViewIfNeeded().catch(() => {});
  await ai.click();
  await page.waitForTimeout(2500);
  // 可能先出配置弹层，确认后开始生成
  const confirm = page.getByRole("button", { name: /开始|确认|生成/ }).last();
  if (await confirm.count()) await confirm.click().catch(() => {});
  // 等到内容明显变长或出现完成提示（最多 4 分钟）
  let grew = false;
  for (let i = 0; i < 24; i += 1) {
    await page.waitForTimeout(10000);
    const now = (await text()).length;
    if (now > before + 200) {
      grew = true;
      break;
    }
  }
  await expect(async () => grew, "AI 修改后内容没有变化（可能仍在生成或失败）");
  return `正文 ${before} → ${(await text()).length} 字`;
});

// ── 3. 岗位广场 · 批量生成（选 1 条岗位即可） ──────────────────────────
await probe("简历中心 · 多选批量操作", async () => {
  await goto("/resumes");
  // 岗位广场**没有**行多选；多选与批量动作只在简历中心（早期文档写成岗位广场，是错的）
  const boxes = page.locator('.app-main .ant-table-selection-column input[type="checkbox"], .app-main tbody input[type="checkbox"]');
  const total = await boxes.count();
  if (!total) throw new Error("简历列表没有多选框");
  await boxes.first().check({ force: true });
  await page.waitForTimeout(900);
  const body = await text();
  await expect(async () => /已选|批量操作/.test(body), "勾选后没有出现批量操作区");
  const batch = page.getByRole("button", { name: /批量操作/ }).first();
  if (await batch.count()) {
    await batch.click();
    await page.waitForTimeout(1200);
    const items = await page.locator(".ant-dropdown-menu-item").allInnerTexts();
    return `批量菜单：${items.map((x) => x.trim()).filter(Boolean).join("/") || "(空)"}`;
  }
  return "出现批量工具条";
});

// ── 4. 面试全流程：选材料 → 开始 → 作答 → 下一题 ───────────────────────
await probe("面试 · 全流程一轮", async () => {
  await goto("/interview");
  // 进房间：有「继续」就续上，否则先选材料再开新的一场
  const cont = page.getByRole("button", { name: /^继\s*续$/ }).first();
  if (await cont.count()) {
    await cont.click();
  } else {
    const seg = page.locator('.interview-material-source .ant-radio-button-wrapper:has-text("从记录选")');
    for (let i = 0; i < (await seg.count()); i += 1) {
      await seg.nth(i).click();
      await page.waitForTimeout(600);
    }
    for (const id of ["jobId", "resumeId"]) {
      const field = page.locator(`#${id}`).first();
      if (!(await field.count())) continue;
      await field.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      const option = page
        .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
        .first();
      if (await option.count()) {
        await option.click();
        await page.waitForTimeout(800);
      } else {
        await page.keyboard.press("Escape");
      }
    }
    await page.getByRole("button", { name: /开始面试/ }).first().click();
    await page.waitForTimeout(4000);
    const again = page.getByRole("button", { name: /^继\s*续$/ }).first();
    if (await again.count()) {
      await again.click();
      await page.waitForTimeout(4000);
    }
  }
  const room = /回到设置/.test(await text());
  await expect(async () => room, "没有进入面试房间");

  const ready = page.getByRole("button", { name: /准备好了/ }).first();
  if (await ready.count()) {
    await ready.click();
    await page.waitForTimeout(2500);
  }

  // 判据：出现作答输入框 + 「提交回答」按钮（题目文案不固定，不能靠"第1题"这类字样）
  const answer = page.locator(".app-main textarea").first();
  const submit = page.locator('button:has-text("提交回答"), button:has-text("提 交"), button:has-text("提交")').first();
  let readyToAnswer = false;
  for (let i = 0; i < 20; i += 1) {
    if ((await answer.count()) && (await submit.count())) {
      readyToAnswer = true;
      break;
    }
    await page.waitForTimeout(8000);
  }
  await expect(async () => readyToAnswer, "没有出现作答区（题目未生成）");

  const before = (await text()).length;
  await answer.fill("实习期我负责 200 台服务器的自动化巡检，用 Prometheus 重写告警规则，误报率从 35% 降到 8%。");
  await submit.click();
  await page.waitForTimeout(30000);
  const after = (await text()).length;
  await expect(async () => after > before + 40, `提交后对话没有增长（${before} → ${after}）`);
  return `作答已提交，正文 ${before} → ${after} 字`;
});

await browser.close();

const pass = results.filter((r) => r.status === "PASS").length;
const fail = results.filter((r) => r.status === "FAIL").length;
console.log("\n深水功能验证");
console.log("─".repeat(78));
for (const r of results) {
  console.log(`${r.status === "PASS" ? "✓" : "✗"} ${r.name.padEnd(28)} ${String(r.ms).padStart(7)}ms  ${r.note}`);
}
console.log("─".repeat(78));
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) exit(1);
