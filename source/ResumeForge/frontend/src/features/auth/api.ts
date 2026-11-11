// SPDX-License-Identifier: Apache-2.0
// Auth API: same-origin cookie session; the client never handles tokens.

// SPDX-License-Identifier: Apache-2.0
/** 账号接口：同源 cookie 会话，前端不需要处理 token。 */

export interface AuthUser {
  id: number;
  /** 登录名：邮箱或手机号（后端二选一存）。 */
  account: string;
  displayName: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`/api/auth${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await resp.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!resp.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : `HTTP ${resp.status}`;
    throw new Error(detail);
  }
  return data as T;
}

export function fetchAuthConfig(): Promise<{ requireLogin: boolean }> {
  return call("/config");
}

export function fetchMe(): Promise<{ user: AuthUser | null }> {
  return call("/me");
}

export function login(account: string, password: string): Promise<{ user: AuthUser }> {
  return call("/login", { method: "POST", body: JSON.stringify({ account, password }) });
}

export function register(input: {
  account: string;
  password: string;
  displayName: string;
  /** 可选：留空即开放注册，填了必须有效。 */
  invite?: string;
}): Promise<{ user: AuthUser }> {
  return call("/register", {
    method: "POST",
    body: JSON.stringify({
      account: input.account,
      password: input.password,
      display_name: input.displayName,
      invite: input.invite ?? "",
    }),
  });
}

export function resetPassword(input: {
  account: string;
  code: string;
  newPassword: string;
}): Promise<{ ok: boolean }> {
  return call("/reset-password", {
    method: "POST",
    body: JSON.stringify({
      account: input.account,
      code: input.code,
      new_password: input.newPassword,
    }),
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return call("/logout", { method: "POST" });
}
