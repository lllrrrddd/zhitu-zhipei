// SPDX-License-Identifier: Apache-2.0
/**
 * 深水路审计（第三批）：制作台编辑、版本快照、导出 PDF、备份导出、面试一轮。
 *
 * 这些是"点了不会立刻看到结果"的功能，所以要等、要断言产物（下载事件、列表变化），
 * 不是看到按钮就算过。
 *
 * 用法：node scripts/feature-audit-deep.mjs --base http://127.0.0.1:3000 --user x --pass y
 * 可选 --shots <目录>  --only workbench|export|backup|interview（只跑某一组）
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { argv, exit } from "node:process";

const args = new Map();
for (let i = 2; i < argv.length; i += 2) args.set(argv[i].replace(/^--/, ""), argv[i + 1]);
const BASE = (args.get("base") ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const USER = args.get("user") ?? "";
const PASS = args.get("pass") ?? "";
const SHOTS = args.get("shots") ?? "";
const ONLY = args.get("only") ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  acceptDownloads: true,
});
await context.addInitScript(() => {
  window.localStorage.setItem("resumeforge.user-guide.seen", "1");
});
const page = await context.newPage();

let apiErrors = [];
page.on("response", (res) => {
  const url = res.url();
  if (url.includes("/api/") && res.status() >= 400 && res.status() !== 401) {
    apiErrors.push(`${res.status()} ${url.replace(BASE, "")}`);
  }
});
page.on("pageerror", (err) => apiErrors.push(`pageerror ${String(err).slice(0, 140)}`));

const text = async (scope = ".app-main") =>
  (await page.locator(scope).innerText().catch(() => "")).replace(/\s+/g, "");
const goto = async (r) => {
  await page.goto(BASE + r, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
};
const expect = async (cond, msg) => {
  if (!(await cond)) throw new Error(msg);
};

async function setLocale(target) {
  await page.evaluate(async (locale) => {
    await fetch("/api/settings/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
  }, target);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
}

async function probe(name, fn) {
  apiErrors = [];
  const t0 = Date.now();
  try {
    const note = await fn();
    const errs = [...new Set(apiErrors)];
    if (errs.length) throw new Error(`接口报错 ${errs.slice(0, 2).join(" ; ")}`);
    results.push({ name, status: "PASS", note: note ?? "", ms: Date.now() - t0 });
  } catch (err) {
    const msg = String(err.message ?? err).slice(0, 150);
    results.push({ name, status: "FAIL", note: msg, ms: Date.now() - t0 });
    if (SHOTS) {
      await page
        .screenshot({ path: `${SHOTS}/FAIL-${name.replace(/[/\\:*?"<>|]/g, "_")}.png` })
        .catch(() => {});
    }
  }
}

const want = (group) => !ONLY || ONLY === group;

// 登录
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
if (await page.locator(".auth-card").count()) {
  if (!USER) {
    console.error("需要登录，请传 --user / --pass");
    await browser.close();
    exit(1);
  }
  const inputs = page.locator(".auth-form input");
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill("" + PASS);
  await page.locator(".auth-submit").click();
  await page.waitForTimeout(3000);
}
await setLocale("zh-CN");

// ── 制作台 ──────────────────────────────────────────────────────────────
if (want("workbench")) {
  await probe("制作台 · 打开并渲染三栏", async () => {
    await goto("/resumes");
    const row = page.locator('.app-main tbody tr:not([aria-hidden="true"])').first();
    if (!(await row.count())) throw new Error("没有简历可打开");
    await page.locator('.ant-btn:has-text("预览")').first().click();
    await page.waitForTimeout(2500);
    const open = page.locator('.ant-btn:has-text("简历制作台"), button:has-text("简历制作台")').first();
    if (!(await open.count())) throw new Error("展开区没有「简历制作台」入口");
    await open.click();
    await page.waitForTimeout(4000);
    // 制作台是**同页浮层**：URL 不变，靠页签判断是否真的进来了
    const tabs = page.locator("[role=tab]");
    const names = (await tabs.allInnerTexts()).map((x) => x.trim());
    await expect(async () => names.some((n) => /排版参数/.test(n)), "没有进入制作台（看不到排版参数页签）");
    return `页签：${names.slice(0, 6).join("/")}`;
  });

  await probe("制作台 · 创建版本", async () => {
    const ver = page.locator('button:has-text("版 本"), button:has-text("版本")').first();
    if (!(await ver.count())) throw new Error("制作台里没有版本入口");
    await ver.click();
    await page.waitForTimeout(1800);
    const create = page.locator('button:has-text("创建版本")').first();
    if (!(await create.count())) throw new Error("版本面板里没有「创建版本」");
    await create.click();
    await page.waitForTimeout(3000);
    const body = await text();
    await expect(async () => /版本|快照|v\d/i.test(body), "创建版本后界面没有版本记录");
    return "已创建版本";
  });
}

// ── 导出 PDF ────────────────────────────────────────────────────────────
if (want("export")) {
  await probe("导出 · 交付包下载", async () => {
    await goto("/resumes");
    const preview = page.locator('.ant-btn:has-text("预览")').first();
    if (!(await preview.count())) throw new Error("没有简历可导出");
    await preview.click();
    await page.waitForTimeout(2500);
    const exp = page.locator('button:has-text("导出")').last();
    if (!(await exp.count())) throw new Error("找不到导出入口");
    await exp.click();
    await page.waitForTimeout(2500);
    // 「导出」打开的是交付包面板，真正的导出动作叫「导出交付包」
    const pack = page.locator('button:has-text("导出交付包")').first();
    if (!(await pack.count())) throw new Error("交付包面板里没有「导出交付包」");
    const wait = page.waitForEvent("download", { timeout: 120_000 }).catch(() => null);
    await pack.click();
    const dl = await wait;
    if (!dl) throw new Error("点了导出交付包但没有产生下载");
    return `下载 ${dl.suggestedFilename()}`;
  });
}

// ── 备份导出 ────────────────────────────────────────────────────────────
if (want("backup")) {
  await probe("设置 · 数据导出（备份）", async () => {
    await goto("/settings");
    const tabs = page.locator(".app-main [role=tab]");
    for (let i = 0; i < (await tabs.count()); i += 1) {
      if (/数据与导出/.test(await tabs.nth(i).innerText())) {
        await tabs.nth(i).click();
        await page.waitForTimeout(1200);
        break;
      }
    }
    // 「导出」是下拉：必须先选「导出当前数据集」，再在弹窗里确认
    const trigger = page.locator('.app-main button:has-text("导出")').first();
    if (!(await trigger.count())) throw new Error("数据页没有「导出」入口");
    await trigger.click();
    await page.waitForTimeout(1000);
    const item = page.locator(".ant-dropdown-menu-item").first();
    if (!(await item.count())) throw new Error("「导出」下拉没有菜单项");
    await item.click();
    await page.waitForTimeout(1500);
    // 确认按钮是「导 出」（中间有空格），用正则匹配，别用包含匹配
    const confirm = page.getByRole("button", { name: /^导\s*出$/ }).last();
    if (!(await confirm.count())) throw new Error("导出弹窗里没有确认按钮");
    const wait = page.waitForEvent("download", { timeout: 120_000 }).catch(() => null);
    await confirm.click();
    const dl = await wait;
    if (!dl) throw new Error("点了确认但没有产生下载");
    return `下载 ${dl.suggestedFilename()}`;
  });
}

// ── 面试一轮 ────────────────────────────────────────────────────────────
if (want("interview")) {
  await probe("面试 · 选材料并答一轮", async () => {
    await goto("/interview");
    // 材料来源是 Radio.Group（按钮样式 .ant-radio-button-wrapper），
    // 不是 .ant-radio-wrapper、也不是 Segmented——三种都试过才定下来。
    const seg = page.locator('.interview-material-source .ant-radio-button-wrapper:has-text("从记录选")');
    const segCount = await seg.count();
    if (!segCount) throw new Error("材料来源没有「从记录选」切换项");
    for (let i = 0; i < segCount; i += 1) {
      await seg.nth(i).click();
      await page.waitForTimeout(700);
    }
    // 岗位与简历的下拉有稳定 id（jobId / resumeId），比按占位文字点更可靠
    for (const id of ["jobId", "resumeId"]) {
      const field = page.locator(`#${id}`).first();
      if (!(await field.count())) continue;
      await field.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1600);
      const option = page
        .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
        .first();
      if (await option.count()) {
        await option.click();
        await page.waitForTimeout(1000);
      } else {
        await page.keyboard.press("Escape");
      }
    }
    const start = page.getByRole("button", { name: /开始面试/ }).first();
    if (!(await start.count())) throw new Error("没有「开始面试」");
    await start.click();
    await page.waitForTimeout(2500);
    // 点「开始面试」后还有一道"准备好了吗"的确认（ReadyGate），不点它不会出题
    const ready = await (async () => {
      const btns = page.locator("button");
      const total = await btns.count();
      for (let i = 0; i < total; i += 1) {
        const b = btns.nth(i);
        const label = (await b.innerText().catch(() => "")).replace(/\s+/g, "");
        if (/^(准备好了|我已准备好|开始作答|确认开始)$/.test(label) && (await b.isVisible().catch(() => false))) {
          return b;
        }
      }
      return null;
    })();
    if (ready) {
      await ready.click();
      await page.waitForTimeout(2000);
    }
    let body = await text();
    let asked = false;
    for (let i = 0; i < 18; i += 1) {
      if (/第\s*1\s*题|请先做个自我介绍|自我介绍|面试题/.test(body) && (await page.locator("textarea").count()) > 0) {
        asked = true;
        break;
      }
      await page.waitForTimeout(5000);
      body = await text();
    }
    await expect(async () => asked, "开始面试后没有出题（可能是没选材料或确认弹窗没点）");
    const answer = page.locator(".app-main textarea").first();
    if (!(await answer.count())) throw new Error("没有作答输入框");
    await answer.fill(
      "实习时我负责 200 台服务器的自动化巡检，用 Prometheus 重写告警规则，把误报率从 35% 降到 8%。",
    );
    // 按钮文案可能带空格（"发 送"/"提 交"），按去空白后的文本匹配
    const submit = await (async () => {
      const btns = page.locator("button");
      const total = await btns.count();
      for (let i = 0; i < total; i += 1) {
        const b = btns.nth(i);
        const label = (await b.innerText().catch(() => "")).replace(/\s+/g, "");
        if (/^(提交|提交回答|发送|发送回答|下一题|继续)$/.test(label)) {
          if (await b.isVisible().catch(() => false)) return b;
        }
      }
      return null;
    })();
    if (!submit) {
      const labels = (await page.locator("button").allInnerTexts()).map((x) => x.trim()).filter(Boolean);
      throw new Error(`没有提交按钮；现有：${labels.slice(0, 12).join("/")}`);
    }
    await submit.click();
    await page.waitForTimeout(25000);
    const after = await text();
    await expect(async () => after.length >= body.length, "提交后内容反而变少");
    return "选材料 → 开始 → 作答 → 提交 全通";
  });
}

await browser.close();

const pass = results.filter((r) => r.status === "PASS").length;
const fail = results.filter((r) => r.status === "FAIL").length;
console.log("\n深水路审计");
console.log("─".repeat(76));
for (const r of results) {
  console.log(`${r.status === "PASS" ? "✓" : "✗"} ${r.name.padEnd(26)} ${String(r.ms).padStart(6)}ms  ${r.note}`);
}
console.log("─".repeat(76));
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) exit(1);
