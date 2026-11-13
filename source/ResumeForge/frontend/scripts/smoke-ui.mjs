// SPDX-License-Identifier: Apache-2.0
/**
 * UI 冒烟巡检：逐页打开 + 抓 API 错误 + 跑一遍核心链路。
 *
 * 为什么要有这个脚本：手工点一遍容易漏页、漏状态，而"改完就发"已经出过两次事故
 * （登录页注册 500、助手回一句空话）。这里把"能打开"和"核心链路能走通"固化成命令，
 * 改完先跑它，再谈交付。
 *
 * 用法（先自己把服务起好，脚本只负责点）：
 *   node scripts/smoke-ui.mjs --base http://127.0.0.1:3000 --user 13800000000 --pass secret123
 * 可选参数：
 *   --resume <docx|pdf 路径>   给了就跑"上传 → 解析 → 核对 → 匹配"这条链路
 *   --shots <目录>             每一页存一张截图（默认不存）
 *   --role 运维工程师          匹配前要填的目标岗位（默认运维工程师）
 *
 * 退出码：有页面报错 / 接口 4xx-5xx / 核心链路失败 → 1，否则 0（可直接进 CI）。
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { argv, exit } from "node:process";

const args = new Map();
for (let i = 2; i < argv.length; i += 2) {
  args.set(argv[i].replace(/^--/, ""), argv[i + 1]);
}

const BASE = (args.get("base") ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const USER = args.get("user") ?? "";
const PASS = args.get("pass") ?? "";
const RESUME = args.get("resume") ?? "";
const SHOTS = args.get("shots") ?? "";
const ROLE = args.get("role") ?? "运维工程师";

const PAGES = [
  ["/", "首页"],
  ["/market", "全部岗位"],
  ["/jobs", "已保存岗位"],
  ["/resumes", "简历中心"],
  ["/apply", "投递台"],
  ["/tracker", "求职进度"],
  ["/interview", "模拟面试"],
  ["/materials", "资料箱"],
  ["/knowledge", "知识库"],
  ["/profile", "我的资料"],
  ["/settings", "设置"],
  ["/claims", "事实台账"],
  ["/skills", "技能"],
  ["/favorites", "收藏夹"],
  ["/trash", "回收站"],
];

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/** 语言是服务端持久化设置：跑测试前钉死中文，避免上一轮的英文残留把选择器全废掉。 */
async function setLocale(target) {
  await page.evaluate(async (locale) => {
    await fetch("/api/settings/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
  }, target);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
}


const failures = [];
const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
// 使用指南弹窗会盖住首屏，测的是页面不是引导，直接标记已看过。
await context.addInitScript(() => {
  window.localStorage.setItem("resumeforge.user-guide.seen", "1");
});
const page = await context.newPage();

page.on("pageerror", (err) => failures.push(`[页面异常] ${String(err).slice(0, 160)}`));

async function trackApi() {
  const bad = [];
  const onResponse = (res) => {
    const url = res.url();
    // 401 是"未登录"的正常语义（登录门自己会处理），不算故障。
    if (url.includes("/api/") && res.status() >= 400 && res.status() !== 401) {
      bad.push(`${res.status()} ${url.replace(BASE, "")}`);
    }
  };
  page.on("response", onResponse);
  return () => {
    page.off("response", onResponse);
    return [...new Set(bad)];
  };
}

// ── 登录 ────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
if (await page.locator(".auth-card").count()) {
  if (!USER) {
    console.error("这个实例需要登录，请用 --user / --pass 传账号");
    await browser.close();
    exit(1);
  }
  const inputs = page.locator(".auth-form input");
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill(PASS);
  await page.locator(".auth-submit").click();
  await page.waitForTimeout(3000);
  if (await page.locator(".auth-card").count()) {
    console.error("登录失败：仍停在登录门");
    await browser.close();
    exit(1);
  }
  console.log("登录: 通过");
}

await setLocale("zh-CN");

// ── 逐页检查 ────────────────────────────────────────────────────────────
for (const [route, name] of PAGES) {
  const stop = await trackApi();
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(1100);
  const text = (await page.locator(".app-main").innerText().catch(() => "")).replace(/\s+/g, "");
  const bad = stop();
  const blank = text.length < 40;
  if (blank) failures.push(`[空白页] ${name} 正文仅 ${text.length} 字`);
  if (bad.length) failures.push(`[接口] ${name}: ${bad.join(" / ")}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log(`${blank ? "✗" : "✓"} ${name.padEnd(6)} 正文 ${String(text.length).padStart(5)} 字 ${bad.length ? "接口错误 " + bad.length : ""}`);
}

// ── 核心链路：上传 → 解析 → 核对 → 匹配 ────────────────────────────────
if (RESUME) {
  console.log("核心链路: 上传简历 → 解析 → 核对 → 匹配");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.locator('input[type="file"]').first().setInputFiles(RESUME);
  await page.waitForTimeout(5000);

  const read = (await page.locator(".app-main").innerText()).replace(/\s+/g, " ");
  if (!/已读取|请检查下方信息/.test(read)) failures.push("[链路] 上传后没有出现“已读取/请检查”提示");

  // 这个输入框的 placeholder 随场景变化（"例如：运维工程师" / "想找的岗位"），
  // 单个选择器很容易落空——按 label 优先、placeholder 兜底依次试。
  const roleCandidates = [
    page.getByLabel(/想找的岗位/),
    page.locator('input[placeholder*="运维"]'),
    page.locator('input[placeholder*="岗位"]'),
  ];
  let roleFilled = false;
  for (const candidate of roleCandidates) {
    if (await candidate.count()) {
      await candidate.first().fill(ROLE);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(600);
      roleFilled = true;
      break;
    }
  }
  if (!roleFilled) failures.push("[链路] 找不到“想找的岗位”输入框");

  const confirm = page.getByRole("button", { name: /确认并找岗位/ }).first();
  if (!(await confirm.count())) {
    failures.push("[链路] 找不到“确认并找岗位”按钮");
  } else {
    await confirm.scrollIntoViewIfNeeded();
    await confirm.click();
    await page.waitForTimeout(20000);
    const after = (await page.locator(".app-main").innerText()).replace(/\s+/g, " ");
    if (!/匹配结果|相关岗位/.test(after)) failures.push("[链路] 点确认后没有出现匹配结果");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/核心链路-匹配结果.png` });
  }
}

await browser.close();

if (failures.length) {
  console.error(`\n发现问题 ${failures.length} 项：`);
  for (const f of failures) console.error(" - " + f);
  exit(1);
}
console.log("\n全部通过");
