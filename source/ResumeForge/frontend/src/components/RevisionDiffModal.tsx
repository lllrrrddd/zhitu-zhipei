// SPDX-License-Identifier: Apache-2.0
/**
 * 版本对比弹窗：把「这一版」和它的上一版按字段列出来。
 *
 * 只读：不改任何数据，也不允许从这里回滚（回滚要重新走修订流程，避免"看着像撤销"变成
 * 悄悄改内容）。数据来源就是现有两个详情接口——本版 `resumeId` 与 `parentRevisionId`。
 */

import { Alert, Empty, Modal, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { getResume } from "../api/resumes";
import { t, type MessageKey } from "../i18n";
import { useLocale } from "../i18n/i18nContext";
import { diffDocuments, type DiffKind, type DiffLine } from "../features/resume/revisionDiff";
import type { ResumeDocument } from "../types/resumeDocument";
import "../styles/revision-diff.css";

const KIND_COLOR: Record<DiffKind, string> = {
  added: "green",
  removed: "red",
  changed: "gold",
};

const KIND_LABEL: Record<DiffKind, MessageKey> = {
  added: "revisionDiff.kind.added",
  removed: "revisionDiff.kind.removed",
  changed: "revisionDiff.kind.changed",
};

/** 单值展示上限：真正的长文本差异交给用户去编辑器里看，这里只给"哪句变了"。 */
const VALUE_CHARS = 80;

function shorten(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > VALUE_CHARS ? `${text.slice(0, VALUE_CHARS)}…` : text;
}

/** 条目显示名：有标题用标题，没有就用「第 n 条」（文案在语言包）。 */
function entryLabel(line: DiffLine): string {
  return line.entry || t("revisionDiff.entryN", { index: line.entryOrdinal });
}

/** 字段显示名：有名字用名字，没有就按段落/字段序号兜底。 */
function fieldLabel(line: DiffLine): string {
  if (line.field) return line.field;
  return line.fieldIsText
    ? t("revisionDiff.textN", { index: line.fieldOrdinal })
    : t("revisionDiff.fieldN", { index: line.fieldOrdinal });
}

interface DiffGroup {
  key: string;
  label: string;
  lines: DiffLine[];
}

/** 按「分区 → 条目」分组，读起来像简历目录，而不是一长串 diff。 */
function group(lines: DiffLine[]): { section: string; entries: DiffGroup[] }[] {
  const sections: { section: string; entries: DiffGroup[] }[] = [];
  for (const line of lines) {
    let section = sections.find((item) => item.section === line.section);
    if (!section) {
      section = { section: line.section, entries: [] };
      sections.push(section);
    }
    const key = line.entry || `#${line.entryOrdinal}`;
    let entry = section.entries.find((item) => item.key === key);
    if (!entry) {
      entry = { key, label: entryLabel(line), lines: [] };
      section.entries.push(entry);
    }
    entry.lines.push(line);
  }
  return sections;
}

export default function RevisionDiffModal({
  open,
  resumeId,
  parentRevisionId,
  onClose,
}: {
  open: boolean;
  resumeId: number;
  parentRevisionId: number | null;
  onClose: () => void;
}) {
  useLocale();
  const [before, setBefore] = useState<ResumeDocument | null>(null);
  const [after, setAfter] = useState<ResumeDocument | null>(null);
  const [error, setError] = useState("");
  // 加载态由数据推导（组件每次打开都重新挂载，见父组件的 key）：effect 里只写 promise
  // 回调中的 setState，避免"在 effect 里同步 setState"引发的额外渲染与 lint 警告。
  const loading = open && parentRevisionId !== null && !error && !before;

  useEffect(() => {
    if (!open || parentRevisionId === null) return;
    let cancelled = false;
    void Promise.all([getResume(parentRevisionId), getResume(resumeId)])
      .then(([parentDetail, currentDetail]) => {
        if (cancelled) return;
        setBefore(parentDetail.content);
        setAfter(currentDetail.content);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : t("revisionDiff.error"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, resumeId, parentRevisionId]);

  const diff = useMemo(
    () => (before && after ? diffDocuments(before, after) : null),
    [before, after],
  );

  return (
    <Modal
      open={open}
      title={t("revisionDiff.title")}
      onCancel={onClose}
      footer={null}
      width="min(820px, calc(100vw - 24px))"
      destroyOnHidden
      styles={{ body: { maxHeight: "var(--rf-modal-body-max-h)", overflowY: "auto" } }}
    >
      {loading && <Typography.Text type="secondary">{t("revisionDiff.loading")}</Typography.Text>}
      {error && <Alert type="error" showIcon title={error} />}
      {!loading && !error && diff && (
        <>
          <p className="revision-diff-summary">
            {t("revisionDiff.counts", {
              added: diff.counts.added,
              removed: diff.counts.removed,
              changed: diff.counts.changed,
            })}
          </p>
          {diff.identical ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("revisionDiff.empty")} />
          ) : (
            <div className="revision-diff">
              {group(diff.lines).map((section) => (
                <section key={section.section || "header"} className="revision-diff-section">
                  <h4>{section.section || t("revisionDiff.header")}</h4>
                  {section.entries.map((entry) => (
                    <div key={entry.key} className="revision-diff-entry">
                      {entry.lines[0]?.scope === "field" && <h5>{entry.label}</h5>}
                      <ul>
                        {entry.lines.map((line, index) => (
                          <li key={`${line.field}-${line.fieldOrdinal}-${index}`}>
                            <Tag color={KIND_COLOR[line.kind]}>{t(KIND_LABEL[line.kind])}</Tag>
                            {line.scope === "section" ? (
                              <strong>{section.section}</strong>
                            ) : (
                              <strong>{fieldLabel(line)}</strong>
                            )}
                            {line.kind === "changed" ? (
                              <span className="revision-diff-pair">
                                <del>{shorten(line.before)}</del>
                                <ins>{shorten(line.after)}</ins>
                              </span>
                            ) : (
                              <span className="revision-diff-single">
                                {shorten(line.kind === "added" ? line.after : line.before)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
          <p className="career-help">{t("revisionDiff.hint")}</p>
        </>
      )}
    </Modal>
  );
}
