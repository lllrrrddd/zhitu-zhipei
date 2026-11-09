// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "antd";
import { expect, it, vi } from "vitest";
import { t } from "../../i18n";
import CareerProfileSwitcher from "./CareerProfileSwitcher";
import type { CareerProfileRecord } from "./careerProfiles";

const profile = {
  degree: "master" as const,
  graduation_year: 2027,
  major: "计算机技术",
  direction: "运维开发",
  cities: ["深圳"],
  skills: ["Linux"],
  experience: [],
};

function records(count: number): CareerProfileRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `id-${index}`,
    label: `档案 ${index + 1}`,
    profile,
    updatedAt: "2026-11-08T00:00:00Z",
  }));
}

function renderSwitcher(list: CareerProfileRecord[], handlers = {}) {
  const props = {
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...handlers,
  };
  render(
    <App>
      <CareerProfileSwitcher records={list} currentId={list[0].id} {...props} />
    </App>,
  );
  return props;
}

it("显示全部档案名，并说明档案只存在本机", () => {
  const list = records(2);
  renderSwitcher(list);
  // 断言的是**用户数据**（档案名由 records() 生成），不是界面文案：直接引用同一条记录。
  expect(screen.getByText(list[0].label)).toBeInTheDocument();
  expect(screen.getByText(t("career.profiles.note"))).toBeInTheDocument();
});

it("点新建会创建一份新档案", () => {
  const props = renderSwitcher(records(1));
  fireEvent.click(screen.getByRole("button", { name: t("career.profiles.create") }));
  expect(props.onCreate).toHaveBeenCalledTimes(1);
});

it("只有一份档案时删除按钮不可用", () => {
  renderSwitcher(records(1));
  expect(screen.getByRole("button", { name: t("career.profiles.delete") })).toBeDisabled();
});

it("多份档案时点删除先弹确认，不会直接删掉", async () => {
  const props = renderSwitcher(records(2));
  fireEvent.click(screen.getByRole("button", { name: t("career.profiles.delete") }));

  // 确认框出现，标题里带档案名；此时还没有删除任何东西
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("档案 1");
  expect(props.onDelete).not.toHaveBeenCalled();
});
