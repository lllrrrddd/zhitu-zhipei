// SPDX-License-Identifier: Apache-2.0
/**
 * 版本对比弹窗：把「当前版本」和它的**某一代上一版**按字段列出来。
 *
 * 与制作台「版本」面板的分工（两件事，别混淆）：
 * - **命名版本**（`/resumes/{id}/versions`）是用户主动拍的快照，可以任意两版互比、还能恢复；
 * - 这里走的是**保存血缘**（`parent_revision_id`）：即使从没拍过命名版本，每次修订都会留下
 *   上一代，所以"这一版到底改了哪句话"随时能看。默认比上一版，也可以顺着血缘再往前选。
 *
 * 只读：不改数据、不能回滚（回滚走命名版本的恢复，或 AI 修改 / 重新生成）。
 */

import { Alert, Button, Empty, Modal, Select, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { getResume } from "../api/resumes";
import { t, type MessageKey } from "../i18n";
import { useLocale } from "../i18n/i18nContext";
import { diffDocuments, type DiffKind, type DiffLine } from "../features/resume/revisionDiff";
import type { ResumeDocument } from "../types/resumeDocument";
import { formatDateTime } from "../utils/format";
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
/** 顺着血缘最多再往前取几代：再多就不是"看改动"，是"翻族谱"。 */
const MAX_ANCESTORS = 3;

function shorten(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > VALUE_CHARS ? `${text.slice(0, VALUE_CHARS)}…` : text;
}

interface LoadedRevision {
  id: number;
  title: string;
  at: string;
  parentId: number | null;
  content: ResumeDocument;
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
  const [current, setCurrent] = useState<ResumeDocument | null>(null);
  const [ancestors, setAncestors] = useState<LoadedRevision[]>([]);
  const [baseId, setBaseId] = useState<number | null>(parentRevisionId);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  // 加载态由数据推导（组件每次打开都重新挂载，见父组件的 key），effect 里只写 promise 回调。
  const loading = open && parentRevisionId !== null && !error && !current;

  useEffect(() => {
    if (!open || parentRevisionId === null) return;
    let cancelled = false;
    void Promise.all([getResume(parentRevisionId), getResume(resumeId)])
      .then(([parentDetail, currentDetail]) => {
        if (cancelled) return;
        setAncestors([
          {
            id: parentDetail.id,
            title: parentDetail.title,
            at: parentDetail.created_at ?? "",
            parentId: parentDetail.parent_revision_id,
            content: parentDetail.content,
          },
        ]);
        setCurrent(currentDetail.content);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : t("revisionDiff.error"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, resumeId, parentRevisionId]);

  const oldest = ancestors[ancestors.length - 1];
  const canExtend = Boolean(oldest?.parentId) && ancestors.length < MAX_ANCESTORS;

  async function extend() {
    if (!oldest?.parentId || loadingMore) return;
    setLoadingMore(true);
    try {
      const detail = await getResume(oldest.parentId);
      setAncestors((list) => [
        ...list,
        {
          id: detail.id,
          title: detail.title,
          at: detail.created_at ?? "",
          parentId: detail.parent_revision_id,
          content: detail.content,
        },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("revisionDiff.error"));
    } finally {
      setLoadingMore(false);
    }
  }

  const before = ancestors.find((item) => item.id === baseId)?.content ?? null;
  const diff = useMemo(
    () => (before && current ? diffDocuments(before, current) : null),
    [before, current],
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
          <Space className="revision-diff-toolbar" wrap>
            <span className="career-help">{t("revisionDiff.base.label")}</span>
            <Select
              size="small"
              value={baseId ?? undefined}
              onChange={(value) => setBaseId(value)}
              style={{ minWidth: 260 }}
              aria-label={t("revisionDiff.base.label")}
              options={ancestors.map((item, index) => ({
                value: item.id,
                label: t("revisionDiff.base.option", {
                  title: item.title || t("revisionDiff.base.untitled"),
                  time: formatDateTime(item.at),
                  generation: index + 1,
                }),
              }))}
            />
            <Button
              size="small"
              loading={loadingMore}
              disabled={!canExtend}
              onClick={() => void extend()}
            >
              {canExtend ? t("revisionDiff.extend") : t("revisionDiff.extendNone")}
            </Button>
          </Space>

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
          <p className="career-help">{t("revisionDiff.namedHint")}</p>
        </>
      )}
    </Modal>
  );
}
