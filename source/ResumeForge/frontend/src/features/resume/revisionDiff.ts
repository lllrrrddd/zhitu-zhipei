// SPDX-License-Identifier: Apache-2.0
/**
 * 简历版本对比：比两份 v2 文档**字段级**的差异（不是比对整段 HTML）。
 *
 * 为什么比字段而不是比文本：用户改简历时改的是"某条经历里的某一句话"。整段 diff 会把
 * 一个词的变化渲染成整段红绿，既看不出改了哪里，也没法判断"这版是不是只调了措辞"。
 *
 * 匹配口径（决定 diff 读起来是否可信）：
 * 1. 分区按 `section.key` 匹配；
 * 2. 条目按 `entry.id` 匹配（同一个 id 就是同一条）；没有 id 的旧数据按"分区内序号"匹配；
 * 3. 字段按 `item.key` 匹配（`text` 段落没有 key，按"同分区内第几个 text"匹配）。
 *
 * 只做展示，不改动任何数据。
 */

import type {
  ResumeDocument,
  ResumeEntry,
  ResumeHeader,
  ResumeItem,
  ResumeSection,
} from "../../types/resumeDocument";

export type DiffKind = "added" | "removed" | "changed";
export type DiffScope = "header" | "section" | "field";

export interface DiffLine {
  kind: DiffKind;
  /** 差异层级：抬头 / 整个分区 / 条目里的字段。 */
  scope: DiffScope;
  /** 所在区域：抬头或某个分区标题。 */
  section: string;
  /** 条目标题（取 title 位字段）；为空时界面用「第 n 条」兜底（文案走语言包）。 */
  entry: string;
  /** 条目在分区内的序号（1 起）。 */
  entryOrdinal: number;
  /** 字段名（label 或 key）；为空时界面用序号兜底。 */
  field: string;
  /** 字段在条目内的序号（1 起），用于兜底显示。 */
  fieldOrdinal: number;
  /** 是否是纯文本段落（兜底文案不同）。 */
  fieldIsText: boolean;
  before: string;
  after: string;
}

export interface RevisionDiff {
  lines: DiffLine[];
  counts: { added: number; removed: number; changed: number };
  /** 两份文档在"可读字段"上完全一致。 */
  identical: boolean;
}

/** 把条目里所有可读字段摊平成 `字段名 → 值`（保持文档顺序）。 */
function entryFields(entry: ResumeEntry): Map<string, string> {
  const fields = new Map<string, string>();
  let textIndex = 0;
  for (const item of entry.items ?? []) {
    // 只有纯文本段落带 hidden；字段/列表的隐藏体现在 placement（隐藏时不在纸上）。
    if (item.kind === "text" && item.hidden) continue;
    if (item.kind !== "text" && item.placement === "hidden") continue;
    const key = itemKey(item, textIndex);
    if (item.kind === "text") textIndex += 1;
    const value = itemValue(item);
    if (!value) continue;
    fields.set(key, value);
  }
  return fields;
}

function itemKey(item: ResumeItem, textIndex: number): string {
  if (item.kind === "text") return `text#${textIndex}`;
  return item.key || `item#${item.id}`;
}

function itemValue(item: ResumeItem): string {
  if (item.kind === "text") return item.text.trim();
  if (item.kind === "field") return item.value.trim();
  if (item.kind === "list")
    return item.values
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" / ");
  // authors 这类数组项：拼成一行，便于比较。
  return Array.isArray((item as { values?: string[] }).values)
    ? ((item as { values?: string[] }).values ?? []).join(", ")
    : "";
}

/** 字段名：label 优先，其次 key；都没有时留空，由界面用序号兜底（文案必须在语言包）。 */
function itemLabel(item: ResumeItem): string {
  if (item.kind === "text") return "";
  return item.label || item.key || "";
}

/** 条目标题：取 title 位字段；没有就留空（界面用「第 n 条」兜底）。 */
function entryTitle(entry: ResumeEntry): string {
  for (const item of entry.items ?? []) {
    if (item.kind === "field" && item.placement === "title" && item.value.trim()) {
      return item.value.trim();
    }
  }
  return "";
}

function headerFields(header: ResumeHeader): Map<string, string> {
  const fields = new Map<string, string>();
  for (const item of header.items ?? []) {
    if (item.placement === "hidden") continue;
    const value = (item.value ?? "").trim();
    if (value) fields.set(item.key || item.id, value);
  }
  return fields;
}

interface FieldMeta {
  label: string;
  ordinal: number;
  isText: boolean;
}

function compareMaps(
  before: Map<string, string>,
  after: Map<string, string>,
  metaOf: (key: string) => FieldMeta,
  make: (kind: DiffKind, meta: FieldMeta, before: string, after: string) => DiffLine,
): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const [key, value] of before) {
    if (!after.has(key)) lines.push(make("removed", metaOf(key), value, ""));
    else if (after.get(key) !== value) {
      lines.push(make("changed", metaOf(key), value, after.get(key) ?? ""));
    }
  }
  for (const [key, value] of after) {
    if (!before.has(key)) lines.push(make("added", metaOf(key), "", value));
  }
  return lines;
}

function sectionMap(sections: ResumeSection[]): Map<string, ResumeSection> {
  return new Map(sections.map((section) => [section.key, section]));
}

function entryMap(section: ResumeSection): Map<string, { entry: ResumeEntry; index: number }> {
  const map = new Map<string, { entry: ResumeEntry; index: number }>();
  section.entries.forEach((entry, index) => {
    // 没有 id 的旧数据用"序号"当键：同一个位置变了就是 changed，而不是一整删一整加。
    const key = entry.id ? `id:${entry.id}` : `idx:${index}`;
    map.set(key, { entry, index });
  });
  return map;
}

/** 字段序号的元信息缓存：同一份条目只算一次。 */
function entryMeta(entry: ResumeEntry): Map<string, FieldMeta> {
  const meta = new Map<string, FieldMeta>();
  let textIndex = 0;
  let ordinal = 0;
  for (const item of entry.items ?? []) {
    if (item.kind === "text" ? item.hidden : item.placement === "hidden") continue;
    const key = itemKey(item, textIndex);
    if (item.kind === "text") textIndex += 1;
    ordinal += 1;
    meta.set(key, { label: itemLabel(item), ordinal, isText: item.kind === "text" });
  }
  return meta;
}

const HEADER_META: FieldMeta = { label: "", ordinal: 0, isText: false };

/** 比较两份文档，返回按「抬头 → 分区顺序」排列的差异行。 */
export function diffDocuments(before: ResumeDocument, after: ResumeDocument): RevisionDiff {
  const lines: DiffLine[] = [];

  // 1) 抬头：字段名就是 key（name/phone/email…），界面按需翻译。
  lines.push(
    ...compareMaps(
      headerFields(before.header),
      headerFields(after.header),
      (key) => ({ ...HEADER_META, label: key }),
      (kind, meta, beforeValue, afterValue) => ({
        kind,
        scope: "header",
        section: "",
        entry: "",
        entryOrdinal: 0,
        field: meta.label,
        fieldOrdinal: 0,
        fieldIsText: false,
        before: beforeValue,
        after: afterValue,
      }),
    ),
  );

  // 2) 分区与条目
  const beforeSections = sectionMap(before.sections ?? []);
  const afterSections = sectionMap(after.sections ?? []);

  for (const [sectionKey, beforeSection] of beforeSections) {
    const afterSection = afterSections.get(sectionKey);
    if (!afterSection) {
      lines.push({
        kind: "removed",
        scope: "section",
        section: beforeSection.title,
        entry: "",
        entryOrdinal: 0,
        field: "",
        fieldOrdinal: 0,
        fieldIsText: false,
        before: String(beforeSection.entries.length),
        after: "",
      });
      continue;
    }
    const beforeEntries = entryMap(beforeSection);
    const afterEntries = entryMap(afterSection);
    for (const [entryKey, beforeItem] of beforeEntries) {
      const afterItem = afterEntries.get(entryKey);
      const title = entryTitle(beforeItem.entry);
      const ordinal = beforeItem.index + 1;
      if (!afterItem) {
        lines.push({
          kind: "removed",
          scope: "field",
          section: beforeSection.title,
          entry: title,
          entryOrdinal: ordinal,
          field: "",
          fieldOrdinal: 0,
          fieldIsText: false,
          before: "",
          after: "",
        });
        continue;
      }
      const meta = entryMeta(beforeItem.entry);
      lines.push(
        ...compareMaps(
          entryFields(beforeItem.entry),
          entryFields(afterItem.entry),
          (key) => meta.get(key) ?? { label: key, ordinal: 0, isText: false },
          (kind, fieldMeta, beforeValue, afterValue) => ({
            kind,
            scope: "field",
            section: beforeSection.title,
            entry: title,
            entryOrdinal: ordinal,
            field: fieldMeta.label,
            fieldOrdinal: fieldMeta.ordinal,
            fieldIsText: fieldMeta.isText,
            before: beforeValue,
            after: afterValue,
          }),
        ),
      );
    }
    for (const [entryKey, afterItem] of afterEntries) {
      if (beforeEntries.has(entryKey)) continue;
      lines.push({
        kind: "added",
        scope: "field",
        section: afterSection.title,
        entry: entryTitle(afterItem.entry),
        entryOrdinal: afterItem.index + 1,
        field: "",
        fieldOrdinal: 0,
        fieldIsText: false,
        before: "",
        after: "",
      });
    }
  }
  for (const [sectionKey, afterSection] of afterSections) {
    if (beforeSections.has(sectionKey)) continue;
    lines.push({
      kind: "added",
      scope: "section",
      section: afterSection.title,
      entry: "",
      entryOrdinal: 0,
      field: "",
      fieldOrdinal: 0,
      fieldIsText: false,
      before: "",
      after: String(afterSection.entries.length),
    });
  }

  const counts = { added: 0, removed: 0, changed: 0 };
  for (const line of lines) counts[line.kind] += 1;
  return { lines, counts, identical: lines.length === 0 };
}
