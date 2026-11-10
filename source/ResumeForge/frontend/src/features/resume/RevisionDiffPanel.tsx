// SPDX-License-Identifier: Apache-2.0
/**
 * 「修改记录」面板：当前版本 vs 某一代保存（默认上一版）。
 *
 * 为什么是面板不是弹窗：它现在作为「检查」弹窗的一个 Tab 使用（和体检单、风险扫描、ATS
 * 并列），外壳由宿主提供。拆成面板后，取数逻辑只有这一份，弹窗/页面想嵌到哪都行。
 *
 * 与制作台「版本」面板的分工（两件事，别混淆）：
 * - **命名版本**是用户主动拍的快照，可任意两版互比、可恢复；
 * - 这里走**保存血缘**（`parent_revision_id`）：即使从没拍过快照，每次修订都留下上一代。
 *
 * 只读：不改数据、不能回滚（回滚走命名版本的恢复，或 AI 修改 / 重新生成）。
 */

import { Alert, Button, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { getResume } from "../../api/resumes";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import { formatDateTime } from "../../utils/format";
import type { ResumeDocument } from "../../types/resumeDocument";
import RevisionDiffView from "./RevisionDiffView";
import { diffDocuments } from "./revisionDiff";

/** 顺着血缘最多再往前取几代：再多就不是"看改动"，是"翻族谱"。 */
const MAX_ANCESTORS = 3;

interface LoadedRevision {
  id: number;
  title: string;
  at: string;
  parentId: number | null;
  content: ResumeDocument;
}

export default function RevisionDiffPanel({
  resumeId,
  parentRevisionId,
}: {
  resumeId: number;
  parentRevisionId: number | null;
}) {
  useLocale();
  const [current, setCurrent] = useState<ResumeDocument | null>(null);
  const [ancestors, setAncestors] = useState<LoadedRevision[]>([]);
  const [baseId, setBaseId] = useState<number | null>(parentRevisionId);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  // 加载态由数据推导，effect 里只写 promise 回调（挂载即取数，本面板只在"检查"弹窗里出现）。
  const loading = parentRevisionId !== null && !error && !current;

  useEffect(() => {
    if (parentRevisionId === null) return;
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
  }, [resumeId, parentRevisionId]);

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

  if (parentRevisionId === null) {
    return <Typography.Text type="secondary">{t("revisionDiff.noParent")}</Typography.Text>;
  }

  return (
    <div className="revision-diff-panel">
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

          <RevisionDiffView diff={diff} />

          <p className="career-help">{t("revisionDiff.hint")}</p>
          <p className="career-help">{t("revisionDiff.namedHint")}</p>
        </>
      )}
    </div>
  );
}
