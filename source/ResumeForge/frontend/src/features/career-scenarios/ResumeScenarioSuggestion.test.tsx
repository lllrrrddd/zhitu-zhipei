// SPDX-License-Identifier: Apache-2.0
/**
 * 简历中心的「AI 生成」入口（A2）。
 *
 * 这里守的是一个真实踩过的坑：筛选栏的按钮**只发信号**，真正持有弹窗的是这个组件；
 * 页面在"列表为空"时曾经把它换成了空态 Alert，于是新账号点「AI 生成」毫无反应
 * （信号没有接收者，且按设计不会报错）。所以 hideCard 模式下必须仍然挂载弹窗宿主。
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ResumeScenarioSuggestion from "./ResumeScenarioSuggestion";
import { triggerResumeCenterAiGenerate } from "./resumeCenterAiBus";

// 弹窗本体依赖接口与场景上下文，这里只关心"它有没有被打开"。
vi.mock("../../components/GenerateResumeModal", () => ({
  default: ({ open }: { open: boolean }) => (
    <div data-testid="generate-modal">{open ? "open" : "closed"}</div>
  ),
}));

const renderHost = (hideCard: boolean) =>
  render(
    <MemoryRouter>
      <ResumeScenarioSuggestion hideCard={hideCard} />
    </MemoryRouter>,
  );

afterEach(() => cleanup());

describe("简历中心 AI 生成入口", () => {
  it("hideCard 时不渲染建议卡，但按钮信号仍能打开弹窗", () => {
    renderHost(true);
    expect(screen.getByTestId("generate-modal")).toHaveTextContent("closed");

    // 信号 → setState 是异步的，必须包在 act 里才会刷新断言。
    act(() => triggerResumeCenterAiGenerate());

    expect(screen.getByTestId("generate-modal")).toHaveTextContent("open");
  });

  it("默认渲染建议卡", () => {
    renderHost(false);
    // 卡片里的按钮是"AI 生成通用简历"；文案由 i18n 提供，这里按角色找按钮即可。
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    const text = document.body.textContent ?? "";
    expect(text).not.toBe("");
  });
});
