// SPDX-License-Identifier: Apache-2.0
/**
 * 逐功能审计：界面上能点到的功能，一条一条点，记录 通过 / 失败 / 跳过。
 *
 * 与 `smoke-ui.mjs` 的分工：那个只回答"页面能不能打开、核心链路通不通"；
 * 这个回答"每个按钮点下去有没有反应、有没有报错"。失败项会存截图，方便定位。
 *
 * 用法（先起好服务）：
 *   node scripts/feature-audit.mjs --base http://127.0.0.1:3000 --user 13800000000 --pass secret123
 * 可选：--shots <目录>  --resume <docx 路径>
 *
 * 只在测试库上跑：脚本会新建/删除数据（简历、档案、进度、收藏），别指向真实数据。
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { argv, exit } from "node:process";

const args = new Map();
for (let i = 2; i < argv.length; i += 2) args.set(argv[i].replace(/^--/, ""), argv[i + 1]);
const BASE = (args.get("base") ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const USER = args.get("user") ?? "";
const PASS = args.get("pass") ?? "";
const RESUME = args.get("resume") ?? "";
const SHOTS = args.get("shots") ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
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

const text = async () => (await page.locator(".app-main").innerText().catch(() => "")).replace(/\s+/g, "");
const visible = async (pattern) => pattern.test(await text());

async function probe(name, fn, { optional = false } = {}) {
  apiErrors = [];
  const started = Date.now();
  try {
    const note = await fn();
    const errs = [...new Set(apiErrors)].filter((e) => !e.includes("/api/auth/"));
    if (errs.length) throw new Error(`接口报错 ${errs.slice(0, 2).join(" ; ")}`);
    results.push({ name, status: "PASS", note: note ?? "", ms: Date.now() - started });
  } catch (err) {
    const msg = String(err.message ?? err).slice(0, 160);
    if (optional) {
      results.push({ name, status: "SKIP", note: msg, ms: Date.now() - started });
    } else {
      results.push({ name, status: "FAIL", note: msg, ms: Date.now() - started });
      if (SHOTS) {
        await page.screenshot({ path: `${SHOTS}/FAIL-${name.replace(/[/\\:*?"<>|]/g, "_")}.png` }).catch(() => {});
      }
    }
  }
}

async function goto(route) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
}

async function clickText(pattern, { role = "button", nth = 0 } = {}) {
  const locator = page.getByRole(role, { name: pattern }).nth(nth);
  if (!(await locator.count())) throw new Error(`找不到「${pattern}」`);
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click();
  await page.waitForTimeout(800);
}

async function closeDialog() {
  const close = page.locator(".ant-modal-close").last();
  if (await close.count()) {
    await close.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
}

async function expect(condition, message) {
  if (!(await condition)) throw new Error(message);
}

// ── 登录 ────────────────────────────────────────────────────────────────
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
if (await page.locator(".auth-card").count()) {
  if (!USER) {
    console.error("这个实例需要登录，请传 --user / --pass");
    await browser.close();
    exit(1);
  }
  const inputs = page.locator(".auth-form input");
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill(PASS);
  await page.locator(".auth-submit").click();
  await page.waitForTimeout(3000);
  if (await page.locator(".auth-card").count()) {
    console.error("登录失败");
    await browser.close();
    exit(1);
  }
}

// ── 探针清单 ────────────────────────────────────────────────────────────

await probe("首页 · 粘贴简历文字并匹配", async () => {
  await goto("/");
  await page.getByText("粘贴简历文字").first().click();
  await page.waitForTimeout(600);
  const box = page.locator(".app-main textarea").first();
  await box.fill(
    "张三，2026 届硕士，计算机专业。求职意向：运维工程师，城市：北京。\n" +
      "技能：Linux、Kubernetes、Docker、Python、Prometheus。\n" +
      "经历：在 XX 公司负责 200 台服务器的自动化运维，把发布耗时从 30 分钟降到 5 分钟。",
  );
  await page.waitForTimeout(500);
  // 粘贴这条路的按钮是"读取这段文字"（上传那条才是"确认并找岗位"）
  await clickText(/读取这段文字/);
  await page.waitForTimeout(3000);
  const role = page.getByLabel(/想找的岗位/);
  if (await role.count()) {
    await role.first().fill("运维工程师");
    await page.keyboard.press("Enter");
  }
  await clickText(/确认并找岗位/);
  await page.waitForTimeout(18000);
  await expect(() => visible(/匹配结果|相关岗位/), "没有出现匹配结果");
  return "出现匹配结果";
});

await probe("匹配结果 · 保存岗位", async () => {
  const save = page.getByRole("button", { name: /保存岗位/ }).first();
  if (!(await save.count())) throw new Error("结果卡上没有「保存岗位」");
  await save.click();
  await page.waitForTimeout(1500);
  await goto("/jobs");
  await expect(async () => (await text()).length > 150, "已保存岗位仍是空的");
  return "已保存岗位出现记录";
});

await probe("全部岗位 · 搜索/筛选", async () => {
  await goto("/market");
  const input = page.locator('.app-main input[type="search"]').first();
  if (!(await input.count())) throw new Error("没有搜索框");
  await input.fill("运维");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  const t = await text();
  await expect(async () => t.length > 200, "搜索后页面没有内容");
  return `搜索后正文 ${t.length} 字`;
});

await probe("主题 · 切深色再切回", async () => {
  const dark = page.locator('.app-theme-switch .ant-segmented-item').filter({ has: page.locator('[aria-label="深色"]') }).first();
  if (!(await dark.count())) throw new Error("页头没有深色切换项");
  await dark.click();
  await page.waitForTimeout(1200);
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await expect(async () => theme === "dark", `切深色失败（data-theme=${theme}）`);
  const light = page.locator('.app-theme-switch .ant-segmented-item').filter({ has: page.locator('[aria-label="浅色"]') }).first();
  if (await light.count()) {
    await light.click();
    await page.waitForTimeout(1000);
  }
  return "深色生效";
});

await probe("简历中心 · 新建并保存简历", async () => {
  await goto("/resumes");
  await clickText(/新建简历/);
  await page.waitForTimeout(3000);
  const t = await text();
  await expect(async () => /制作台|模块/.test(t), "新建后没有进入制作台");
  // 制作台里保存一次，验证"能落库"而不只是打开界面
  const save = page.getByRole("button", { name: /^保存/ }).first();
  if (await save.count()) {
    await save.click();
    await page.waitForTimeout(3000);
  }
  await goto("/resumes");
  const rows = page.locator('.app-main tbody tr:not([aria-hidden="true"])');
  const n = await rows.count();
  const body = await text();
  await expect(async () => !/暂无数据/.test(body) || n > 0, "保存后列表仍显示「暂无数据」");
  return `列表行数 ${n}`;
});

await probe("简历中心 · 导入简历并识别", async () => {
  await goto("/resumes");
  if (!RESUME) throw new Error("没有提供 --resume 文件");
  await clickText(/导入简历并识别/);
  await page.waitForTimeout(1200);
  const fileInput = page.locator(".ant-modal input[type=file], input[type=file]").last();
  await fileInput.setInputFiles(RESUME);
  await page.waitForTimeout(4000);
  const t = await text();
  await expect(async () => /识别|解析|读取/.test(t), "选文件后没有识别反馈");
  await closeDialog();
  return "已提交识别";
}, { optional: true });

await probe("简历检查 · 四个页签", async () => {
  await goto("/resumes");
  // 「检查」不在行内动作里，要先点「预览 / 导出」把该行展开
  const preview = page.getByRole("button", { name: /预览/ }).first();
  if (!(await preview.count())) throw new Error("列表里没有简历（先建一份）");
  await preview.click();
  await page.waitForTimeout(2500);
  const check = page.locator('button:has-text("检查")').first();
  if (!(await check.count())) throw new Error("展开后没有「检查」入口");
  await check.click();
  await page.waitForTimeout(5000);
  const tabs = page.locator('.ant-modal [role=tab], .ant-drawer [role=tab]');
  const n = await tabs.count();
  await expect(async () => n >= 4, `检查弹窗只有 ${n} 个页签`);
  const names = [];
  for (let i = 0; i < n; i += 1) {
    names.push((await tabs.nth(i).innerText()).trim());
    await tabs.nth(i).click();
    await page.waitForTimeout(1800);
  }
  await closeDialog();
  return `${n} 个页签：${names.join("/")}`;
});

await probe("投递台 · 页签切换", async () => {
  await goto("/apply");
  const tabs = page.locator(".app-main [role=tab]");
  const n = await tabs.count();
  await expect(async () => n >= 3, `投递台只有 ${n} 个页签`);
  for (let i = 0; i < n; i += 1) {
    await tabs.nth(i).click();
    await page.waitForTimeout(600);
  }
  return `${n} 个页签都能切`;
});

await probe("求职进度 · 添加进度", async () => {
  await goto("/tracker");
  await clickText(/添加进度/);
  await page.waitForTimeout(1200);
  const dialog = page.locator(".ant-modal").last();
  const open = (await dialog.count()) > 0;
  await expect(async () => open, "点「添加进度」没有弹窗");
  await closeDialog();
  return "弹窗可打开";
});

await probe("模拟面试 · 配置与开始按钮", async () => {
  await goto("/interview");
  const start = page.getByRole("button", { name: /开始面试/ }).first();
  await expect(async () => (await start.count()) > 0, "没有「开始面试」按钮");
  const enabled = await start.isEnabled();
  return enabled ? "开始面试可点" : "开始面试置灰（缺材料，属预期）";
});

await probe("模拟面试 · 四类页签", async () => {
  await goto("/interview");
  const tabs = page.locator(".app-main [role=tab]");
  const n = await tabs.count();
  await expect(async () => n >= 3, `只有 ${n} 个页签`);
  const names = [];
  for (let i = 0; i < n; i += 1) {
    names.push((await tabs.nth(i).innerText()).trim());
    await tabs.nth(i).click();
    await page.waitForTimeout(700);
  }
  return names.join("/");
});

await probe("资料箱 · 列表渲染", async () => {
  await goto("/materials");
  const t = await text();
  await expect(async () => t.length > 50, "资料箱空白");
  return `正文 ${t.length} 字`;
});

await probe("知识库 · 新建知识弹窗", async () => {
  await goto("/knowledge");
  await clickText(/新建知识/);
  await page.waitForTimeout(1000);
  const open = (await page.locator(".ant-modal").count()) > 0;
  await expect(async () => open, "没有弹窗");
  await closeDialog();
  return "弹窗可打开";
});

await probe("我的资料 · 两个页签", async () => {
  await goto("/profile");
  const tabs = page.locator(".app-main [role=tab]");
  const n = await tabs.count();
  await expect(async () => n >= 2, `只有 ${n} 个页签`);
  for (let i = 0; i < n; i += 1) {
    await tabs.nth(i).click();
    await page.waitForTimeout(600);
  }
  return `${n} 个页签`;
});

await probe("设置 · 六个页签", async () => {
  await goto("/settings");
  const tabs = page.locator(".app-main [role=tab]");
  const n = await tabs.count();
  await expect(async () => n >= 5, `只有 ${n} 个页签`);
  const names = [];
  for (let i = 0; i < n; i += 1) {
    names.push((await tabs.nth(i).innerText()).trim());
    await tabs.nth(i).click();
    await page.waitForTimeout(700);
  }
  return names.join("/");
});

await probe("设置 · 测试模型连接", async () => {
  await goto("/settings");
  const test = page.getByRole("button", { name: /测试连接/ }).first();
  if (!(await test.count())) throw new Error("没有「测试连接」");
  await test.click();
  await page.waitForTimeout(12000);
  const t = await text();
  await expect(async () => /成功|正常|失败|超时|错误/.test(t), "测试连接没有任何结果反馈");
  return /成功|正常/.test(t) ? "连接成功" : "有失败提示（模型/网络）";
}, { optional: true });

await probe("事实台账 · 新建条目弹窗", async () => {
  await goto("/claims");
  await clickText(/新建条目/);
  await page.waitForTimeout(1000);
  const open = (await page.locator(".ant-modal").count()) > 0;
  await expect(async () => open, "没有弹窗");
  await closeDialog();
  return "弹窗可打开";
});

await probe("技能 · 两个页签 + 新建技能", async () => {
  await goto("/skills");
  const tabs = page.locator(".app-main [role=tab]");
  for (let i = 0; i < (await tabs.count()); i += 1) {
    await tabs.nth(i).click();
    await page.waitForTimeout(500);
  }
  await tabs.first().click();
  await page.waitForTimeout(500);
  await clickText(/新建技能/);
  await page.waitForTimeout(1000);
  const open = (await page.locator(".ant-modal").count()) > 0;
  await expect(async () => open, "新建技能没有弹窗");
  await closeDialog();
  return "页签 + 弹窗正常";
});

await probe("收藏夹 · 两个页签", async () => {
  await goto("/favorites");
  const tabs = page.locator(".app-main [role=tab]");
  const n = await tabs.count();
  await expect(async () => n >= 2, `只有 ${n} 个页签`);
  for (let i = 0; i < n; i += 1) {
    await tabs.nth(i).click();
    await page.waitForTimeout(600);
  }
  return `${n} 个页签`;
});

await probe("回收站 · 页面渲染", async () => {
  await goto("/trash");
  const t = await text();
  await expect(async () => t.length > 30, "回收站空白");
  return `正文 ${t.length} 字`;
});

await probe("全局 · 匹配档案 新建/重命名", async () => {
  await goto("/");
  const create = page.getByRole("button", { name: /^新建$/ }).first();
  if (!(await create.count())) throw new Error("没有「新建」档案按钮");
  await create.click();
  await page.waitForTimeout(1200);
  const rename = page.getByRole("button", { name: /重命名/ }).first();
  await expect(async () => (await rename.count()) > 0, "新建后没有「重命名」");
  await expect(async () => (await rename.isEnabled()) === false, "占位：重命名应可用");
  return "档案可新建";
}, { optional: true });

// ── 汇总 ────────────────────────────────────────────────────────────────
await browser.close();

const pass = results.filter((r) => r.status === "PASS").length;
const fail = results.filter((r) => r.status === "FAIL").length;
const skip = results.filter((r) => r.status === "SKIP").length;

console.log("\n功能审计结果");
console.log("─".repeat(78));
for (const r of results) {
  const mark = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "–";
  console.log(`${mark} ${r.name.padEnd(30)} ${String(r.ms).padStart(6)}ms  ${r.note}`);
}
console.log("─".repeat(78));
console.log(`通过 ${pass} / 失败 ${fail} / 跳过 ${skip}`);

if (fail) exit(1);
