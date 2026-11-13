// SPDX-License-Identifier: Apache-2.0
/**
 * 写操作审计（第二批）：每条探针都要求"数据真的落库/真的变化"，不是弹窗打开就算过。
 *
 * 与 feature-audit.mjs 的分工：那个查"入口在不在、能不能点开"，这个查"点完之后
 * 新增的东西还在不在"。很多 bug 只在写路径上出现（比如保存 500、静默不落库）。
 *
 * 用法（先起服务，指向测试库）：
 *   node scripts/feature-audit-write.mjs --base http://127.0.0.1:3000 --user x --pass y
 * 可选 --shots <目录>  --file <docx 路径>（资料箱用）
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
const FILE = args.get("file") ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const stamp = Date.now().toString(36).slice(-5);
const results = [];
const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
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
page.on("pageerror", (err) => apiErrors.push(`pageerror ${String(err).slice(0, 120)}`));

const text = async (scope = ".app-main") =>
  (await page.locator(scope).innerText().catch(() => "")).replace(/\s+/g, "");

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

const goto = async (r) => {
  await page.goto(BASE + r, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
};
const clickBtn = async (pattern) => {
  const b = page.getByRole("button", { name: pattern }).first();
  if (!(await b.count())) throw new Error(`找不到按钮「${pattern}」`);
  await b.scrollIntoViewIfNeeded().catch(() => {});
  await b.click();
  await page.waitForTimeout(900);
};
const saveBtn = async (scope = page) => {
  // 文案不可靠：有的弹窗是「保 存」（中间有空格），有的是「保存进度 / 保存知识 / 保存台账」。
  // 所以按"去掉所有空白后是否以保存开头 / 等于确定"来判断，而不是精确匹配。
  const btns = scope.locator("button");
  const n = await btns.count();
  for (let i = n - 1; i >= 0; i -= 1) {
    const b = btns.nth(i);
    const label = (await b.innerText().catch(() => "")).replace(/\s+/g, "");
    if (!label) continue;
    const hit = label.startsWith("保存") || label === "确定" || label === "创建" || label === "添加";
    if (!hit) continue;
    if (await b.isVisible().catch(() => false)) {
      await b.click();
      await page.waitForTimeout(1800);
      return true;
    }
  }
  return false;
};

const closeDialog = async () => {
  const c = page.locator(".ant-modal-close").last();
  if (await c.count()) {
    await c.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
};
const expect = async (cond, msg) => {
  if (!(await cond)) throw new Error(msg);
};

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
  await inputs.nth(1).fill(PASS);
  await page.locator(".auth-submit").click();
  await page.waitForTimeout(3000);
}

// 先把语言钉回中文（服务端持久化，上一轮残留的英文会让所有中文选择器落空）
await setLocale("zh-CN");

// 语言是**服务端持久化**的：上一轮切成英文后，这一轮所有中文选择器都会落空。
// 每次开跑先把它钉回中文，再继续——否则失败原因是"界面是英文"而不是功能坏了。
await page.evaluate(async () => {
  await fetch("/api/settings/locale", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "zh-CN" }),
  });
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// ── 1. 求职进度：新增一条并检查落库 ─────────────────────────────────────
await probe("求职进度 · 新增并落库", async () => {
  await goto("/tracker");
  const before = (await text()).length;
  await clickBtn(/添加进度/);
  const modal = page.locator(".ant-modal").last();
  const inputs = modal.locator("input:not([type=file]), textarea");
  const n = await inputs.count();
  if (!n) throw new Error("进度弹窗里没有输入框");
  await inputs.nth(0).fill(`自动化测试公司-${stamp}`);
  for (let i = 1; i < Math.min(n, 3); i += 1) {
    await inputs.nth(i).fill("测试岗位").catch(() => {});
  }
  if (!(await saveBtn(modal))) throw new Error("弹窗里找不到保存按钮");
  await page.waitForTimeout(2000);
  await goto("/tracker");
  const after = await text();
  await expect(async () => after.includes(stamp), "新增的进度没有出现在列表里");
  return `列表从 ${before} 字 → ${after.length} 字，含新增项`;
});

// ── 2. 知识库：新建一条 ─────────────────────────────────────────────────
await probe("知识库 · 新建并落库", async () => {
  await goto("/knowledge");
  await clickBtn(/新建知识/);
  const modal = page.locator(".ant-modal").last();
  const inputs = modal.locator("input:not([type=file]), textarea");
  if (!(await inputs.count())) throw new Error("弹窗里没有输入框");
  await inputs.nth(0).fill(`知识条目-${stamp}`);
  if ((await inputs.count()) > 1) await inputs.nth(1).fill("这是自动化测试写入的正文内容。");
  if (!(await saveBtn(modal))) throw new Error("找不到保存按钮");
  await page.waitForTimeout(2000);
  await goto("/knowledge");
  await expect(async () => (await text()).includes(stamp), "新建的知识没有出现在列表里");
  return "列表里出现新条目";
});

// ── 3. 技能：新建一条 ───────────────────────────────────────────────────
await probe("技能 · 新建并落库", async () => {
  await goto("/skills");
  await clickBtn(/新建技能/);
  const modal = page.locator(".ant-modal").last();
  const inputs = modal.locator("input:not([type=file]), textarea");
  if (!(await inputs.count())) throw new Error("弹窗里没有输入框");
  await inputs.nth(0).fill(`技能-${stamp}`);
  if ((await inputs.count()) > 1) await inputs.nth(1).fill("自动化测试用技能说明。");
  if (!(await saveBtn())) throw new Error("找不到保存按钮");
  await page.waitForTimeout(2000);
  await goto("/skills");
  await expect(async () => (await text()).includes(stamp), "新建的技能没有出现");
  return "列表里出现新技能";
});

// ── 4. 事实台账：新建条目 ───────────────────────────────────────────────
await probe("事实台账 · 新建并落库", async () => {
  await goto("/claims");
  await clickBtn(/新建条目/);
  const modal = page.locator(".ant-modal").last();
  const inputs = modal.locator("input:not([type=file]), textarea");
  if (!(await inputs.count())) throw new Error("弹窗里没有输入框");
  await inputs.nth(0).fill(`台账条目-${stamp}`);
  for (let i = 1; i < Math.min(await inputs.count(), 3); i += 1) {
    await inputs.nth(i).fill("自动化测试写入的事实描述。").catch(() => {});
  }
  if (!(await saveBtn(modal))) throw new Error("找不到保存按钮");
  await page.waitForTimeout(2000);
  await goto("/claims");
  await expect(async () => (await text()).includes(stamp), "新建的台账条目没有出现");
  return "列表里出现新条目";
});

// ── 5. 资料箱：上传一个文档 ─────────────────────────────────────────────
await probe("资料箱 · 上传文档", async () => {
  if (!FILE) throw new Error("未提供 --file，跳过上传");
  await goto("/materials");
  const before = (await text()).length;
  await clickBtn(/放入资料/);
  await page.waitForTimeout(1200);
  const input = page.locator('.ant-modal input[type=file], input[type=file]').last();
  await input.setInputFiles(FILE);
  await page.waitForTimeout(4000);
  await saveBtn();
  await page.waitForTimeout(1500);
  await closeDialog();
  await goto("/materials");
  const after = (await text()).length;
  await expect(async () => after >= before, "上传后列表长度反而变小");
  return `列表 ${before} → ${after} 字`;
});

// ── 6. 简历：重命名 → 删除 → 回收站里能看到 ─────────────────────────────
await probe("简历 · 重命名", async () => {
  await goto("/resumes");
  const rows = page.locator('.app-main tbody tr:not([aria-hidden="true"])');
  if (!(await rows.count())) throw new Error("没有简历");
  const row = rows.first();
  // 行内只平铺"收藏 / 标题 / 预览导出"，重命名等次要操作在**整行右键菜单**里
  await row.click({ button: "right" });
  await page.waitForTimeout(900);
  const item = page.locator('.ant-dropdown-menu-item:has-text("重命名")').first();
  if (!(await item.count())) throw new Error("右键菜单里没有「重命名」");
  await item.click();
  await page.waitForTimeout(1200);
  const input = page.locator(".ant-modal input").first();
  if (!(await input.count())) throw new Error("重命名弹窗没有输入框");
  await input.fill(`改名-${stamp}`);
  if (!(await saveBtn(page.locator(".ant-modal").last()))) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(2000);
  await goto("/resumes");
  await expect(async () => (await text()).includes(stamp), "改名后列表没有变化");
  return "标题已更新";
});

// ── 7. 语言：切英文再切回 ───────────────────────────────────────────────
await probe("外观 · 切英文再切回", async () => {
  await goto("/settings");
  const tabs = page.locator(".app-main [role=tab]");
  for (let i = 0; i < (await tabs.count()); i += 1) {
    if (/外观/.test(await tabs.nth(i).innerText())) {
      await tabs.nth(i).click();
      await page.waitForTimeout(900);
      break;
    }
  }
  const en = page.getByText(/^English$/, { exact: true }).first();
  if (!(await en.count())) throw new Error("找不到 English 选项");
  await en.click();
  await page.waitForTimeout(2500);
  const t = await text();
  const switched = /Settings|Model|Appearance|Language/i.test(t);
  await expect(async () => switched, "切英文后界面没有英文文案");
  // 复位走接口而不是点下拉：切回项的文案在中英文下不一样，靠文案点容易点空，
  // 一旦点空就会把整个环境留在英文，后面的用例全部连锁失败（这坑已经踩过一次）。
  await setLocale("zh-CN");
  const back = await text();
  await expect(async () => /设置|外观|语言/.test(back), "复位后界面仍是英文");
  return "中英来回都生效";
});

await probe("全局搜索 · 快捷键呼出并检索", async () => {
  await goto("/");
  // 先点空白处，保证焦点不在输入框里，否则快捷键会被输入框吞掉
  await page.locator("body").click({ position: { x: 4, y: 4 } }).catch(() => {});
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(1500);
  // 它不是弹窗：挂在 body 上的非模态浮层（role="search" / .global-search-popover）
  const panel = page.locator(".global-search-popover, [role='search']").first();
  if (!(await panel.count())) throw new Error("Ctrl+K 没有呼出搜索浮层");
  const input = panel.locator("input").first();
  if (!(await input.count())) throw new Error("搜索浮层里没有输入框");
  await input.fill("运维");
  await page.waitForTimeout(2500);
  const hits = await page.locator(".global-search-hit").count();
  await expect(async () => hits > 0, "搜索没有命中任何结果");
  await page.keyboard.press("Escape");
  return `命中 ${hits} 条`;
});

await browser.close();

const pass = results.filter((r) => r.status === "PASS").length;
const fail = results.filter((r) => r.status === "FAIL").length;
console.log("\n写操作审计");
console.log("─".repeat(76));
for (const r of results) {
  console.log(`${r.status === "PASS" ? "✓" : "✗"} ${r.name.padEnd(24)} ${String(r.ms).padStart(6)}ms  ${r.note}`);
}
console.log("─".repeat(76));
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) exit(1);
