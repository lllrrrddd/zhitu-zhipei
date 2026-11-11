// SPDX-License-Identifier: Apache-2.0
// Full-screen gate. In hosted mode a signed-out visitor sees this instead of the shell;
// in local single-user mode (/api/auth/config -> requireLogin=false) it renders children.
// Three modes: sign in, register with an invite code, reset a forgotten password.
// All copy lives in the i18n packs (the CJK ratchet forbids new hardcoded UI text).

import { Button, Form, Input, Segmented, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import {
  fetchAuthConfig,
  fetchMe,
  login,
  register,
  resetPassword,
  type AuthUser,
} from "./api";

type Mode = "login" | "register" | "reset";

export default function LoginGate({ children }: { children: React.ReactNode }) {
  useLocale();
  const [requireLogin, setRequireLogin] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    setNotice("");
    try {
      if (mode === "reset") {
        await resetPassword({
          account: values.account ?? "",
          code: values.code ?? "",
          newPassword: values.newPassword ?? "",
        });
        setMode("login");
        setNotice(t("auth.login.resetDone"));
        return;
      }
      const result =
        mode === "login"
          ? await login(values.account ?? "", values.password ?? "")
          : await register({
              account: values.account ?? "",
              password: values.password ?? "",
              displayName: values.displayName ?? "",
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
      {/* 背景的三团缓慢漂移光斑：纯装饰，读屏与键盘都跳过。 */}
      <div className="auth-aurora" aria-hidden="true">
        <span className="auth-blob auth-blob-a" />
        <span className="auth-blob auth-blob-b" />
        <span className="auth-blob auth-blob-c" />
      </div>

      <aside className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-panel-brand">
            <img src="/zhiyin-mark.svg" alt="" width={40} height={40} />
            <strong>{t("appConfig.brand.name")}</strong>
          </div>
          <h1>{t("auth.brand.title")}</h1>
          <ul>
            <li>{t("auth.brand.point1")}</li>
            <li>{t("auth.brand.point2")}</li>
            <li>{t("auth.brand.point3")}</li>
          </ul>
        </div>
      </aside>

      <div className="auth-card">
        <Segmented
          block
          value={mode}
          onChange={(value) => {
            setMode(value as Mode);
            setError("");
            setNotice("");
          }}
          options={[
            { label: t("auth.login.tabLogin"), value: "login" },
            { label: t("auth.login.tabRegister"), value: "register" },
            { label: t("auth.login.tabReset"), value: "reset" },
          ]}
        />

        <Form layout="vertical" onFinish={submit} requiredMark={false} className="auth-form">
          {mode === "register" && (
            <>
              <Form.Item name="displayName" label={t("auth.login.name")}>
                <Input
                  placeholder={t("auth.login.namePlaceholder")}
                  autoComplete="nickname"
                />
              </Form.Item>
            </>
          )}

          {mode === "reset" && (
            <Form.Item
              name="code"
              label={t("auth.login.resetCode")}
              rules={[{ required: true, message: t("auth.login.requiredCode") }]}
            >
              <Input
                placeholder={t("auth.login.resetCodePlaceholder")}
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            </Form.Item>
          )}

          <Form.Item
            name="account"
            label={t("auth.login.email")}
            rules={[{ required: true, message: t("auth.login.requiredEmail") }]}
          >
            <Input autoComplete="username" />
          </Form.Item>

          {mode === "reset" ? (
            <Form.Item
              name="newPassword"
              label={t("auth.login.newPassword")}
              rules={[{ required: true, message: t("auth.login.requiredPassword") }]}
            >
              <Input.Password
                placeholder={t("auth.login.passwordHint")}
                autoComplete="new-password"
              />
            </Form.Item>
          ) : (
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
          )}

          {error && <Typography.Text type="danger">{error}</Typography.Text>}
          {notice && <Typography.Text type="success">{notice}</Typography.Text>}

          <Button type="primary" htmlType="submit" block loading={busy} className="auth-submit">
            {mode === "login"
              ? t("auth.login.submitLogin")
              : mode === "register"
                ? t("auth.login.submitRegister")
                : t("auth.login.submitReset")}
          </Button>
        </Form>

        <p className="auth-hint">{t("auth.login.hint")}</p>
      </div>
    </div>
  );
}
