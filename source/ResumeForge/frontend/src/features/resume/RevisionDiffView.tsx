// SPDX-License-Identifier: Apache-2.0
/**
 * 差异视图（纯展示，不含取数与弹窗外壳）。
 *
 * 拆出来的理由：**渲染逻辑只该有一份**。现在由「修改记录」弹窗使用；将来若要在制作台的
 * 版本面板里并排展示"与上次保存的差异"，直接把这份数据喂进来即可，不必复制一遍分组、
 * 兜底文案与样式（那才是真正的耦合）。
 *
 * 本组件不做任何请求、不改数据，只吃一个 `RevisionDiff`。
 */

import { Empty, Tag } from "antd";
import { t, type MessageKey } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import type { DiffKind, DiffLine, RevisionDiff } from "./revisionDiff";
// 视图自己带样式：面板与宿主只负责排版位置，不再各自记得引一次（删掉旧弹窗时就漏过一回）。
import "../../styles/revision-diff.css";

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

/** 单值展示上限：真正的长文本差异交给用户去编辑器看，这里只回答"哪句变了"。 */
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

export default function RevisionDiffView({ diff }: { diff: RevisionDiff }) {
  useLocale();
  if (diff.identical) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("revisionDiff.empty")} />;
  }
  return (
    <>
      <p className="revision-diff-summary">
        {t("revisionDiff.counts", {
          added: diff.counts.added,
          removed: diff.counts.removed,
          changed: diff.counts.changed,
        })}
      </p>
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
    </>
  );
}
