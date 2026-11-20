// SPDX-License-Identifier: Apache-2.0
/**
 * 路由级错误页（react-router 的 `errorElement`）。
 *
 * 为什么需要它：`AppErrorBoundary` 是包在 `<RouterProvider>` 外面的 React 类组件，
 * 它接不住**路由懒加载**（`import()`）失败——那类错误由 react-router 自己捕获并渲染
 * 默认错误页（生产环境里用户看到的就是英文 "Unexpected Application Error!" 加一串堆栈，
 * 连"刷新"按钮都没有）。
 *
 * 处置分两种，因为原因不同、解法也不同：
 * 1. **模块加载失败**（`Failed to fetch dynamically imported module`）：几乎一定是
 *    前端产物更新后，页面还引用着旧的文件名。刷新一次即可，所以自动重载一次
 *    （10 秒内只做一次，避免文件真缺时无限刷新）。
 * 2. 其它异常：中文说明 + 重试 / 回首页两个出口。
 */
import { Button, Result, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { useRouteError } from "react-router-dom";
import { t } from "../i18n";
import { recordClientDiagnostic } from "../utils/clientDiagnostics";

const MODULE_LOAD_FAILURE_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
];

const RELOAD_KEY = "zhiyin.chunk-reload-at";
/** 10 秒内只自动重载一次：真的缺文件时，无限刷新比报错更糟。 */
const RELOAD_GUARD_MS = 10_000;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

function isModuleLoadFailure(message: string): boolean {
  return MODULE_LOAD_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export default function RouteErrorPage() {
  const error = useRouteError();
  const [reloading, setReloading] = useState(false);
  const message = messageOf(error);
  const stale = isModuleLoadFailure(message);

  useEffect(() => {
    recordClientDiagnostic("ui.route_error", { message: message.slice(0, 200) });
    if (!stale) return;
    let last = 0;
    try {
      last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    } catch {
      last = 0;
    }
    if (Date.now() - last < RELOAD_GUARD_MS) return; // 刚刷过还是失败：不再自动刷
    try {
      window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      /* 隐私模式可能不可用：不影响这次重载 */
    }
    setReloading(true);
    window.location.reload();
  }, [stale, message]);

  if (stale) {
    return (
      <Result
        status="info"
        title={t("common.errorBoundary.updating")}
        subTitle={t("common.errorBoundary.body.moduleLoad")}
        extra={
          <Button type="primary" onClick={() => window.location.reload()} disabled={reloading}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  return (
    <Result
      status="error"
      title={t("common.errorBoundary.title.generic")}
      subTitle={t("common.errorBoundary.body.generic")}
      extra={
        <Space direction="vertical" size={12}>
          <Space>
            <Button type="primary" onClick={() => window.location.reload()}>
              {t("common.retry")}
            </Button>
            <Button onClick={() => window.location.assign("/")}>
              {t("common.errorBoundary.home")}
            </Button>
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {message.slice(0, 300)}
          </Typography.Text>
        </Space>
      }
    />
  );
}
