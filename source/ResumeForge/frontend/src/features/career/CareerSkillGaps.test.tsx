// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "antd";
import { expect, it, vi } from "vitest";
import { t } from "../../i18n";
import CareerSkillGaps from "./CareerSkillGaps";
import type { SkillState } from "./types";

const STATES: SkillState[] = [
  { term: "Linux", state: "found" },
  { term: "Kubernetes", state: "found" },
  { term: "Docker", state: "mentioned" },
  { term: "Ansible", state: "missing" },
  { term: "Prometheus", state: "missing" },
];

function renderGaps(overrides: Partial<Parameters<typeof CareerSkillGaps>[0]> = {}) {
  const onAddSkill = vi.fn();
  const result = render(
    <App>
      <CareerSkillGaps states={STATES} onAddSkill={onAddSkill} {...overrides} />
    </App>,
  );
  return { ...result, onAddSkill };
}

it("没有可对比的技能时不渲染整块", () => {
  const { container } = render(
    <App>
      <CareerSkillGaps states={[]} onAddSkill={vi.fn()} />
    </App>,
  );
  expect(container.querySelector(".career-skills")).toBeNull();
});

it("三档各自计数，明细里能看到具体技能名", () => {
  renderGaps();
  expect(screen.getByText(t("career.skills.title"))).toBeInTheDocument();
  expect(screen.getByText(t("career.skills.group.found", { count: 2 }))).toBeInTheDocument();
  expect(screen.getByText(t("career.skills.group.mentioned", { count: 1 }))).toBeInTheDocument();
  expect(screen.getByText(t("career.skills.group.missing", { count: 2 }))).toBeInTheDocument();
  for (const term of ["Linux", "Kubernetes", "Docker", "Ansible", "Prometheus"]) {
    expect(screen.getByText(term)).toBeInTheDocument();
  }
});

it("只有「只在经历里提到」那一档给一键加入，其余两档没有按钮", () => {
  const { onAddSkill } = renderGaps();
  const buttons = screen.getAllByRole("button", { name: t("career.skills.add") });
  expect(buttons).toHaveLength(1);
  fireEvent.click(buttons[0]);
  expect(onAddSkill).toHaveBeenCalledWith("Docker");
});

it("只读场景（没有可写回的档案）不显示加入按钮，但仍展示三档", () => {
  renderGaps({ canAdd: false });
  expect(screen.queryByRole("button", { name: t("career.skills.add") })).toBeNull();
  expect(screen.getByText(t("career.skills.group.mentioned", { count: 1 }))).toBeInTheDocument();
});

it("正在加入某一项时只让那一颗按钮转圈", () => {
  // 转圈时 antd 会塞进 loading 图标，可访问名被改掉，所以按类名找按钮。
  const { container } = renderGaps({ adding: "Docker" });
  const loading = container.querySelectorAll(".career-skills .ant-btn-loading");
  expect(loading).toHaveLength(1);
});
