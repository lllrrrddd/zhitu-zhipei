// SPDX-License-Identifier: Apache-2.0
// Full-screen gate: in hosted mode a signed-out visitor sees this instead of the shell.
// In local single-user mode (/api/auth/config -> requireLogin=false) it renders children.

// SPDX-License-Identifier: Apache-2.0
/**
 * 登录门：托管模式下，未登录时用它替代整个界面渲染。
 *
 * 为什么做成"整屏门"而不是新加一条 /login 路由：这个应用有 20 多条路由、侧栏与页头
 * 都在 AppShell 里，加独立路由要同步改路由表、菜单高亮、移动端抽屉三处；而"没登录就
 * 进不去"这个语义本来就不该让用户先看到侧栏再被踢走。
 *
 * 本地单机用法不受影响：后端 `/api/auth/config` 返回 requireLogin=false 时，这里直接
 * 渲染 children，等于不存在。
 */

import { Button, Form, Input, Segmented, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import { fetchAuthConfig, fetchMe, login, register, type AuthUser } from "./api";

type Mode = "login" | "register";

export default function LoginGate({ children }: { children: React.ReactNode }) {
  useLocale();
  const [requireLogin, setRequireLogin] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [config, me] = await Promise.all([fetchAuthConfig(), fetchMe()]);
      setRequireLogin(config.requireLogin);
      setUser(me.user);
    } catch {
      setRequireLogin(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (values: Record<string, string>) => {
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "login"
          ? await login(values.email ?? "", values.password ?? "")
          : await register({
              email: values.email ?? "",
              password: values.password ?? "",
              displayName: values.displayName ?? "",
              invite: values.invite ?? "",
            });
      setUser(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.login.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return <div className="auth-gate auth-gate-loading">{t("auth.login.checking")}</div>;
  }

  if (!requireLogin || user) {
    return <>{children}</>;
  }

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/zhiyin-mark.svg" alt="" width={36} height={36} />
          <div>
            <strong>{t("appConfig.brand.name")}</strong>
            <span>{t("auth.login.brandTag")}</span>
          </div>
        </div>

        <Segmented
          block
          value={mode}
          onChange={(value) => {
            setMode(value as Mode);
            setError("");
          }}
          options={[
            { label: t("auth.login.tabLogin"), value: "login" },
            { label: t("auth.login.tabRegister"), value: "register" },
          ]}
        />

        <Form layout="vertical" onFinish={submit} requiredMark={false} className="auth-form">
          {mode === "register" && (
            <>
              <Form.Item name="displayName" label={t("auth.login.name")}>
                <Input placeholder={t("auth.login.namePlaceholder")} autoComplete="nickname" />
              </Form.Item>
              <Form.Item
                name="invite"
                label={t("auth.login.invite")}
                rules={[{ required: true, message: t("auth.login.requiredInvite") }]}
              >
                <Input placeholder={t("auth.login.invitePlaceholder")} autoComplete="off" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="email"
            label={t("auth.login.email")}
            rules={[{ required: true, message: t("auth.login.requiredEmail") }]}
          >
            <Input placeholder="you@example.com" autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("auth.login.password")}
            rules={[{ required: true, message: t("auth.login.requiredPassword") }]}
          >
            <Input.Password
              placeholder={
                mode === "register" ? t("auth.login.passwordHint") : t("auth.login.password")
              }
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </Form.Item>

          {error && <Typography.Text type="danger">{error}</Typography.Text>}

          <Button type="primary" htmlType="submit" block loading={busy} className="auth-submit">
            {mode === "login" ? t("auth.login.submitLogin") : t("auth.login.submitRegister")}
          </Button>
        </Form>

        <p className="auth-hint">{t("auth.login.hint")}</p>
      </div>
    </div>
  );
}
