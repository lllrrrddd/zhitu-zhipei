// SPDX-License-Identifier: Apache-2.0
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Button, Select, Tooltip } from "antd";
import { useState } from "react";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import type { CareerProfileRecord } from "./careerProfiles";

/**
 * 匹配档案切换条：解决"一个人多个方向"和"一个账号帮别人匹一次"。
 *
 * 档案只存在本机浏览器，不写后端，也不影响"我的资料"里那份用来生成简历的画像——
 * 文案里必须说清楚，否则用户会以为导入别人的简历污染了自己的资料。
 */
export default function CareerProfileSwitcher({
  records,
  currentId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  records: CareerProfileRecord[];
  currentId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  useLocale();
  const { modal } = App.useApp();
  const [renaming, setRenaming] = useState(false);

  const current = records.find((item) => item.id === currentId);
  const canDelete = records.length > 1;

  const rename = () => {
    if (!current) return;
    setRenaming(true);
    let value = current.label;
    modal.confirm({
      title: t("career.profiles.renameTitle"),
      content: (
        <input
          aria-label={t("career.profiles.renameTitle")}
          defaultValue={current.label}
          maxLength={30}
          onChange={(event) => {
            value = event.target.value;
          }}
          style={{ width: "100%", padding: "6px 8px" }}
        />
      ),
      okText: t("career.profiles.renameSave"),
      cancelText: t("common.action.cancel"),
      onOk: () => {
        const label = value.trim();
        if (label) onRename(current.id, label.slice(0, 30));
      },
      afterClose: () => setRenaming(false),
    });
  };

  const remove = () => {
    if (!current || !canDelete) return;
    modal.confirm({
      title: t("career.profiles.deleteTitle", { label: current.label }),
      content: t("career.profiles.deleteHint"),
      okText: t("career.profiles.deleteConfirm"),
      okButtonProps: { danger: true },
      cancelText: t("common.action.cancel"),
      onOk: () => onDelete(current.id),
    });
  };

  return (
    <div className="career-profiles">
      <span className="career-profiles-label">{t("career.profiles.label")}</span>
      <Select
        size="small"
        value={currentId}
        onChange={onSelect}
        style={{ minWidth: 200 }}
        options={records.map((item) => ({ value: item.id, label: item.label }))}
        aria-label={t("career.profiles.label")}
      />
      <Tooltip title={t("career.profiles.createHint")}>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={onCreate}
          aria-label={t("career.profiles.create")}
        >
          {t("career.profiles.create")}
        </Button>
      </Tooltip>
      <Tooltip title={renaming ? t("career.profiles.renaming") : t("career.profiles.renameHint")}>
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={rename}
          disabled={!current}
          aria-label={t("career.profiles.rename")}
        >
          {t("career.profiles.rename")}
        </Button>
      </Tooltip>
      <Tooltip title={canDelete ? t("career.profiles.deleteHint") : t("career.profiles.deleteDisabled")}>
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={remove}
          disabled={!canDelete}
          aria-label={t("career.profiles.delete")}
        >
          {t("career.profiles.delete")}
        </Button>
      </Tooltip>
      <span className="career-help">{t("career.profiles.note")}</span>
    </div>
  );
}
