// SPDX-License-Identifier: Apache-2.0
/**
 * 导出入口：全页面只有一个「导出」按钮，点击打开统一面板。
 *
 * 这里只钉"入口形态"与"参数同源"两件事：以前是「下载 PDF」+「更多格式」两个入口、
 * 预览页另有「导出选项」「一键脱敏」，四条路径各自拼参数；漏一条就会出现"预览里调过的
 * 字号没进导出"。面板内部的行为（格式多选、脱敏、409 草稿闸门）在
 * `ExportOptionsModal.test.tsx` 里。
 */
import { App as AntdApp } from "antd";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n";
import type { ResumeLayout } from "../types";
import ExportButtons from "./ExportButtons";

const apiMocks = vi.hoisted(() => ({
  exportResumeWithOptions: vi.fn(),
  redactResume: vi.fn(),
}));

const downloadMocks = vi.hoisted(() => ({
  downloadBlob: vi.fn(),
  printHtml: vi.fn(),
}));

vi.mock("../api/resumes", () => apiMocks);
vi.mock("../utils/download", () => downloadMocks);

const LAYOUT: ResumeLayout = {
  template: "classic",
  format_name: "",
  page_limit: 2,
  font_scale: "small",
  format_config: { font_scale_adjust: 0.636 },
};

function renderButtons(props: Partial<React.ComponentProps<typeof ExportButtons>> = {}) {
  return render(
    <AntdApp>
      <ExportButtons recordId={7} layout={LAYOUT} {...props} />
    </AntdApp>,
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("ExportButtons", () => {
  it("只有一个「导出」入口，旧的「下载 PDF / 更多格式」不再出现", () => {
    renderButtons();

    expect(screen.getByRole("button", { name: /导\s*出/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /下载 PDF/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /更多格式/ })).not.toBeInTheDocument();
  });

  it("点击后打开导出面板（版式与「跟随预览」文案已随 T5 移出面板）", async () => {
    renderButtons({
      layout: { ...LAYOUT, format_config: { font_scale_adjust: 0.636, line_height: 1.55 } },
    });

    fireEvent.click(screen.getByRole("button", { name: /导\s*出/ }));

    // 面板照旧打开（「格式」是它的第一块）。
    expect(await screen.findByText("格式")).toBeInTheDocument();
    // 只读的「跟随预览：行距 / 字号系数」随版式栏一起下线：版式现在只在预览的版式栏里改。
    expect(screen.queryByText(/跟随预览/)).not.toBeInTheDocument();
  });

  it("父组件接管面板时只画按钮，不挂第二份弹窗（两份表单会互相覆盖）", () => {
    const onOpen = vi.fn();
    renderButtons({ onOpen });

    fireEvent.click(screen.getByRole("button", { name: /导\s*出/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    // 自己没有挂第二份面板（否则页面上会出现两个「格式」区块 / 两个「导出」按钮）。
    expect(screen.queryByText("格式")).not.toBeInTheDocument();
  });
});

describe("导出前的体检提示（只提示，不拦人）", () => {
  const HISTORY_KEY = "rf.resume.health.v1";

  function seed(score: number, signature = "sig-now") {
    window.localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({
        "7": [
          {
            at: "2026-11-10T01:00:00Z",
            signature,
            score,
            subscores: { format: score },
            issueCount: 3,
            riskCount: 0,
          },
        ],
      }),
    );
  }

  afterEach(() => {
    window.localStorage.clear();
  });

  // 用 onOpen 代替"面板是否渲染"：这里验的是闸门逻辑，不该把导出面板一起拉进来。
  it("从没体检过就不打扰：直接进入导出", () => {
    window.localStorage.clear();
    const onOpen = vi.fn();
    renderButtons({ onOpen });
    fireEvent.click(screen.getByRole("button", { name: /导\s*出/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(t("componentsMisc.exportButtons.gate.title"))).toBeNull();
  });

  it("分数过线（≥60）也直接进入导出", () => {
    seed(82);
    const onOpen = vi.fn();
    renderButtons({ onOpen });
    fireEvent.click(screen.getByRole("button", { name: /导\s*出/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(t("componentsMisc.exportButtons.gate.title"))).toBeNull();
  });

  it("分数偏低时先提示，选「仍然导出」照常进入导出", async () => {
    seed(52);
    const onOpen = vi.fn();
    renderButtons({ onOpen });
    fireEvent.click(screen.getByRole("button", { name: /导\s*出/ }));

    expect(
      await screen.findByText(t("componentsMisc.exportButtons.gate.title")),
    ).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: t("componentsMisc.exportButtons.gate.continue") }),
    );
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
  });

  it("选「先去检查」走检查入口，不进入导出", async () => {
    seed(52);
    const onOpen = vi.fn();
    const onOpenChecks = vi.fn();
    renderButtons({ onOpen, onOpenChecks });
    fireEvent.click(screen.getByRole("button", { name: /导\s*出/ }));

    fireEvent.click(
      await screen.findByRole("button", { name: t("componentsMisc.exportButtons.gate.check") }),
    );
    expect(onOpenChecks).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("体检之后改过简历时，提示里说明分数可能已过期", async () => {
    seed(52, "sig-old");
    renderButtons({ contentSignature: "sig-now", onOpen: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /导\s*出/ }));
    expect(
      await screen.findByText(t("componentsMisc.exportButtons.gate.stale")),
    ).toBeInTheDocument();
  });
});
