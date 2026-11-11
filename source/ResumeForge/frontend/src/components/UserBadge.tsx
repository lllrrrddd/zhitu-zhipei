// SPDX-License-Identifier: Apache-2.0
// Header account badge: shows the signed-in user and offers sign-out. Hidden in local mode.

// SPDX-License-Identifier: Apache-2.0
/**
 * 页头的账号徽标：显示当前登录人，点开可退出。
 *
 * 单机模式（`requireLogin=false`）下不渲染任何东西——本地用户不需要看到"退出登录"，
 * 那会让人误以为这是个需要登录的在线产品。
 */

import { LogoutOutlined } from "@ant-design/icons";
import { Button, Dropdown, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { fetchAuthConfig, fetchMe, logout, type AuthUser } from "../features/auth/api";
import { t } from "../i18n";
import { useLocale } from "../i18n/i18nContext";

export default function UserBadge() {
  useLocale();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hosted, setHosted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await fetchAuthConfig();
        if (cancelled || !config.requireLogin) return;
        setHosted(true);
        const me = await fetchMe();
        if (!cancelled) setUser(me.user);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hosted || !user) return null;

  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: [
          { key: "account", label: user.account, disabled: true },
          { type: "divider" },
          { key: "logout", icon: <LogoutOutlined />, label: t("auth.logout") },
        ],
        onClick: ({ key }) => {
          if (key === "logout") {
            void logout().then(() => window.location.reload());
          }
        },
      }}
    >
      <Tooltip title={user.account}>
        <Button type="text" className="app-user-badge">
          {user.displayName || user.account}
        </Button>
      </Tooltip>
    </Dropdown>
  );
}
