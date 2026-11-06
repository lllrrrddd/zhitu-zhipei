import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("graduate demo confirms facts and shows a source-backed ranking", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("resumeforge.user-guide.seen", "1");
  });
  await page.goto("/graduate");
  await expect(page.getByRole("heading", { name: "研究生选岗实验台" })).toBeVisible();
  await expect(page.getByText("计算机硕士样本").first()).toBeVisible();
  await expect(page.getByText(/岗位摘要最近整理于/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("graduate-profile.png") });

  await page.getByRole("checkbox", { name: /我已核对以上画像/ }).check();
  await page.getByRole("button", { name: "根据确认的信息排序" }).click();

  await expect(page.getByText("岗位开放状态尚未核实")).toBeVisible();
  await expect(page.getByText(/中国科学院东莞材料所 · AI应用研发工程师/)).toBeVisible();
  const detailLink = page.getByRole("link", {
    name: /打开招聘页面：中国科学院东莞材料所 · AI应用研发工程师/,
  });
  await expect(detailLink).toHaveAttribute(
    "href",
    "https://campus.51job.com/dimst2027/m/jobs.html",
  );
  await page
    .context()
    .route("https://campus.51job.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "招聘页面测试替身" }),
    );
  const popupReady = page.waitForEvent("popup");
  await detailLink.click();
  const postingPage = await popupReady;
  await expect(postingPage).toHaveURL("https://campus.51job.com/dimst2027/m/jobs.html");
  await postingPage.close();
  await expect(page.getByRole("link", { name: "核对岗位来源" }).first()).toHaveAttribute(
    "href",
    /^https:\/\//,
  );
  await page.getByText("查看针对本岗位的简历表达建议").first().click();
  await expect(page.getByText(/定向简历可优先呈现这段经历/).first()).toBeVisible();
  await page
    .getByRole("textbox", { name: "本人具体负责什么（必填）" })
    .first()
    .fill("实现数据处理流程");
  await page.getByRole("textbox", { name: "使用的方法或工具（必填）" }).first().fill("Python");
  await page.getByRole("checkbox", { name: "我确认以上内容是本人真实经历" }).first().check();
  await page.getByRole("button", { name: "生成可复制的表达草稿" }).first().click();
  await expect(page.getByText(/我负责实现数据处理流程，使用Python/).first()).toBeVisible();
  await page.getByRole("button", { name: "采纳建议并下载记录" }).first().click();
  await expect(page.getByText("请先填写理由。")).toBeVisible();
  await page.getByRole("textbox", { name: "采纳或拒绝的理由" }).first().fill("依据与项目经历一致");
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "采纳建议并下载记录" }).first().click();
  const feedbackFile = await downloadReady;
  const feedback = JSON.parse(await readFile((await feedbackFile.path())!, "utf8"));
  expect(feedback.verdict).toBe("accepted");
  expect(feedback.reason).toBe("依据与项目经历一致");
  expect(feedback.source_url).toMatch(/^https:\/\//);
  expect(feedback.evidence_excerpt).toBeTruthy();
  await page.getByText(/中国科学院东莞材料所 · AI应用研发工程师/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("graduate-ranking.png") });
});

test("newly confirmed project evidence explains a changed job decision", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("resumeforge.user-guide.seen", "1");
  });
  await page.goto("/graduate");
  await expect(page.getByText("计算机硕士样本").first()).toBeVisible();
  await page.getByRole("combobox", { name: "虚构演示画像" }).click();
  await page.getByText("集成电路硕士样本", { exact: true }).last().click();
  await page.getByRole("checkbox", { name: /我已核对以上画像/ }).check();
  await page.getByRole("button", { name: "根据确认的信息排序" }).click();
  await expect(page.getByText("岗位开放状态尚未核实")).toBeVisible();

  await page.getByRole("textbox", { name: "能力或工具" }).fill("ADS");
  await page
    .getByRole("textbox", { name: "简历或项目中的依据" })
    .fill("射频项目中使用 ADS 仿真电路");
  await page.getByRole("button", { name: "添加能力证据" }).click();
  await page.getByRole("checkbox", { name: /我已核对以上画像/ }).check();
  await page.getByRole("button", { name: "根据确认的信息排序" }).click();

  const change = page.getByText("射频研发工程师：需核对 → 方向匹配");
  await expect(change).toBeVisible();
  await change.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("graduate-rerank.png") });
});

test("a manually verified posting joins the live ranking", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("resumeforge.user-guide.seen", "1");
  });
  await page.goto("/graduate");
  await expect(page.getByText("计算机硕士样本").first()).toBeVisible();
  await page.getByRole("textbox", { name: "招聘单位" }).fill("测试单位");
  await page.getByRole("textbox", { name: "岗位名称" }).fill("算法工程师测试岗");
  await page.getByRole("textbox", { name: "工作城市" }).fill("上海");
  await page.getByRole("textbox", { name: "原文列出的专业（逗号分隔）" }).fill("计算机科学与技术");
  await page.getByRole("textbox", { name: "原文列出的核心能力（逗号分隔）" }).fill("PyTorch");
  await page
    .getByRole("textbox", { name: "招聘原文的 https 链接" })
    .fill("https://example.org/jobs/test");
  await page.getByRole("checkbox", { name: "我已核对这些岗位条件来自所填来源页面" }).check();
  await page.getByRole("button", { name: "加入待比较岗位" }).click();
  await expect(page.getByText("测试单位 · 算法工程师测试岗 · 上海").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "打开招聘页面：测试单位 · 算法工程师测试岗 · 上海" }),
  ).toHaveAttribute("href", "https://example.org/jobs/test");
  await page.getByRole("checkbox", { name: /我已核对以上画像/ }).check();
  await page.getByRole("button", { name: "根据确认的信息排序" }).click();
  await expect(page.getByText("测试单位 · 算法工程师测试岗 · 上海")).toHaveCount(2);
  await page.getByText("逐项核对岗位条件与简历证据").last().click();
  await expect(page.getByText(/画像依据：/).last()).toBeVisible();
  await expect(page.getByText(/条件核查记录：20\d{2}-\d{2}-\d{2}/)).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "打开招聘页面：测试单位 · 算法工程师测试岗 · 上海" }),
  ).toHaveCount(2);
  await expect(page.locator('a[href="https://example.org/jobs/test"]')).toHaveCount(4);
  await page
    .locator('a[href="https://example.org/jobs/test"]')
    .last()
    .locator("..")
    .screenshot({
      path: test.info().outputPath("graduate-custom-job.png"),
    });
  await page.getByRole("button", { name: "保存到岗位库" }).click();
  const savedLink = page.getByRole("link", { name: "打开已保存岗位，继续分析或制作简历" });
  await expect(savedLink).toHaveAttribute("href", /\/jobs\?job_id=\d+/);
  await savedLink.click();
  await expect(page.getByText("待核实").first()).toBeVisible();
});

test("pasted posting becomes a confirmed review draft before ranking", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("resumeforge.user-guide.seen", "1");
  });
  await page.goto("/graduate");
  await expect(page.getByText("计算机硕士样本").first()).toBeVisible();
  await page
    .getByRole("textbox", { name: "粘贴招聘原文，先提取候选岗位字段" })
    .fill(
      "公司名称：测试单位\n岗位名称：算法工程师测试岗\n工作地点：上海\n学历要求：硕士及以上\n专业要求：计算机科学与技术\n岗位要求：熟悉 PyTorch，2027届毕业生。\n来源：https://example.org/jobs/pasted",
    );
  await page.getByRole("button", { name: "本地识别为待核对草稿" }).click();
  await expect(page.getByRole("textbox", { name: "岗位名称" })).toHaveValue("算法工程师测试岗");
  await expect(page.getByText(/学历要求：硕士及以上/).last()).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "我已核对这些岗位条件来自所填来源页面" }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: "我已核对这些岗位条件来自所填来源页面" }).check();
  await page.getByRole("button", { name: "加入待比较岗位" }).click();
  await page.getByRole("checkbox", { name: /我已核对以上画像/ }).check();
  await page.getByRole("button", { name: "根据确认的信息排序" }).click();
  await expect(page.getByText("测试单位 · 算法工程师测试岗 · 上海")).toHaveCount(2);
  const customResult = page
    .getByRole("link", { name: "打开招聘页面：测试单位 · 算法工程师测试岗 · 上海" })
    .last()
    .locator("..");
  await customResult.getByText("逐项核对岗位条件与简历证据").click();
  await customResult.getByText("查看本次粘贴的招聘原文").click();
  await expect(customResult.getByText(/公司名称：测试单位[\s\S]*熟悉 PyTorch，2027届毕业生/)).toBeVisible();
});
