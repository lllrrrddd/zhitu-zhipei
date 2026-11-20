// SPDX-License-Identifier: Apache-2.0
/**
 * 「URL 参数触发的一次性自动动作」。
 *
 * 为什么单独抽出来：直接写在页面里时，依赖数组很容易带上一个**每渲染都新建的对象**
 * （例如某个 hook 返回的 api 对象）。那样 effect 每次渲染都会重跑，用户关掉弹窗后
 * 立刻又被打开，看起来就是"点关闭没反应"。这个坑真的发生过（/profile?import=1）。
 *
 * 语义：
 * - `trigger` 为真、`ready` 为真、且**本次挂载还没执行过**时，执行一次 `action`；
 * - 之后无论重渲染多少次都不再执行；
 * - `action` 走 ref，调用方不必把它放进依赖（也就不必 memo）。
 */
import { useEffect, useRef } from "react";

export function useAutoOpenOnce(trigger: boolean, ready: boolean, action: () => void): void {
  const done = useRef(false);
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    if (done.current || !ready || !trigger) return;
    done.current = true;
    actionRef.current();
  }, [trigger, ready]);
}
