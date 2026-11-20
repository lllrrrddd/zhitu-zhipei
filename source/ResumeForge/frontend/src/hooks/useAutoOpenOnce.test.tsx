// SPDX-License-Identifier: Apache-2.0
/**
 * `useAutoOpenOnce` 的行为契约：跨重渲染只执行一次。
 *
 * 这条测试守的是一个真实事故：/profile?import=1 自动打开识别弹窗，effect 依赖里带了
 * 每渲染新建的对象 → 关闭后立刻被重开 → 用户报"点关闭没反应"。
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAutoOpenOnce } from "./useAutoOpenOnce";

function Host({
  trigger,
  ready,
  action,
  tick,
}: {
  trigger: boolean;
  ready: boolean;
  action: () => void;
  tick: number;
}) {
  // tick 只是为了让组件强制重渲染（模拟父级每次渲染传入新对象/新闭包）。
  useAutoOpenOnce(trigger, ready, () => action());
  return <div data-tick={tick} />;
}

describe("useAutoOpenOnce", () => {
  it("只执行一次，后续重渲染不再触发", () => {
    const action = vi.fn();
    const { rerender } = render(<Host trigger ready action={action} tick={0} />);
    expect(action).toHaveBeenCalledTimes(1);

    // 用全新的闭包重复渲染十次：模拟"依赖里放了个每渲染都新建的对象"那种写法。
    for (let i = 1; i <= 10; i += 1) {
      rerender(<Host trigger ready action={() => action()} tick={i} />);
    }
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("未就绪时不执行，就绪后才执行一次", () => {
    const action = vi.fn();
    const { rerender } = render(<Host trigger ready={false} action={action} tick={0} />);
    expect(action).not.toHaveBeenCalled();

    rerender(<Host trigger ready action={() => action()} tick={1} />);
    expect(action).toHaveBeenCalledTimes(1);

    rerender(<Host trigger ready action={() => action()} tick={2} />);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("没有 trigger 时完全不执行", () => {
    const action = vi.fn();
    render(<Host trigger={false} ready action={action} tick={0} />);
    expect(action).not.toHaveBeenCalled();
  });
});
