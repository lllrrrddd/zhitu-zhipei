// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { diffDocuments } from "./revisionDiff";
import type { ResumeDocument, ResumeEntry, ResumeItem } from "../../types/resumeDocument";

const SECTION_LAYOUT = {
  columns: 1 as const,
  align: "equal" as const,
  gap: null,
  hide_title: false,
  keep_together: true,
  start_on_new_page: false,
  title_override: "",
};

function field(
  id: string,
  key: string,
  value: string,
  placement: "title" | "body" = "body",
): ResumeItem {
  return {
    kind: "field",
    id,
    key,
    label: key,
    value,
    format: "text",
    wrap: "none",
    body_style: "bullet",
    placement,
    show_label: false,
    solo: false,
  } as ResumeItem;
}

function entry(id: string, items: ResumeItem[]): ResumeEntry {
  return {
    id,
    hidden: false,
    lock_content: false,
    lock_layout: false,
    layout: { head: "stacked" },
    items,
  };
}

function doc(options: {
  name?: string;
  entries?: ResumeEntry[];
  sections?: { key: string; title: string; entries: ResumeEntry[] }[];
}): ResumeDocument {
  return {
    version: 2,
    language: "zh-CN",
    header: {
      items: [
        {
          kind: "field",
          id: "h1",
          key: "name",
          label: "姓名",
          value: options.name ?? "张三",
          placement: "name",
          format: "text",
        },
      ],
      contact_breaks: [],
    } as unknown as ResumeDocument["header"],
    sections: options.sections?.map((section) => ({
      key: section.key,
      title: section.title,
      kind: "entries",
      layout: SECTION_LAYOUT,
      entries: section.entries,
    })) ?? [
      {
        key: "experience",
        title: "实习经历",
        kind: "entries",
        layout: SECTION_LAYOUT,
        entries: options.entries ?? [],
      },
    ],
  } as ResumeDocument;
}

describe("字段级版本对比", () => {
  it("两份一样的文档不出差异", () => {
    const same = doc({ entries: [entry("e1", [field("i1", "summary", "负责订单接口开发")])] });
    const result = diffDocuments(same, same);
    expect(result.identical).toBe(true);
    expect(result.counts).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it("同一条目里改了一句话算「修改」，并给出原值与新值", () => {
    const before = doc({ entries: [entry("e1", [field("i1", "summary", "负责订单接口开发")])] });
    const after = doc({
      entries: [entry("e1", [field("i1", "summary", "主导订单接口重构，QPS 提升 3 倍")])],
    });
    const result = diffDocuments(before, after);
    expect(result.counts).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(result.lines[0]).toMatchObject({
      kind: "changed",
      section: "实习经历",
      before: "负责订单接口开发",
      after: "主导订单接口重构，QPS 提升 3 倍",
    });
  });

  it("抬头字段变化单独归到抬头", () => {
    const result = diffDocuments(doc({ name: "张三" }), doc({ name: "张三丰" }));
    expect(result.lines[0]).toMatchObject({ section: "", field: "name", kind: "changed" });
  });

  it("新增条目 / 删除条目各自算一条", () => {
    const before = doc({
      entries: [
        entry("e1", [field("t1", "role", "后端开发", "title"), field("i1", "summary", "旧内容")]),
      ],
    });
    const after = doc({
      entries: [
        entry("e1", [field("t1", "role", "后端开发", "title"), field("i1", "summary", "旧内容")]),
        entry("e2", [field("t2", "role", "测试开发", "title"), field("i2", "summary", "新内容")]),
      ],
    });
    const result = diffDocuments(before, after);
    expect(result.counts.added).toBe(1);
    expect(result.counts.removed).toBe(0);
    const added = result.lines.find((line) => line.kind === "added");
    expect(added?.entry).toBe("测试开发");
  });

  it("分区整个被删掉时给出分区级差异", () => {
    const before = doc({
      sections: [
        {
          key: "experience",
          title: "实习经历",
          entries: [entry("e1", [field("i1", "summary", "a")])],
        },
        {
          key: "projects",
          title: "项目经历",
          entries: [entry("p1", [field("i2", "summary", "b")])],
        },
      ],
    });
    const after = doc({
      sections: [
        {
          key: "experience",
          title: "实习经历",
          entries: [entry("e1", [field("i1", "summary", "a")])],
        },
      ],
    });
    const result = diffDocuments(before, after);
    // 分区被整段删掉时只报一条分区级差异，不再逐条列它的条目（读起来更清楚）。
    expect(result.counts.removed).toBe(1);
    expect(result.lines[0]).toMatchObject({ kind: "removed", section: "项目经历" });
  });

  it("没有 id 的旧条目按位置比对，不整条删了又加", () => {
    const bare = (value: string): ResumeEntry => ({
      id: null,
      hidden: false,
      lock_content: false,
      lock_layout: false,
      layout: { head: "stacked" },
      items: [field("x", "summary", value)],
    });
    const result = diffDocuments(doc({ entries: [bare("旧")] }), doc({ entries: [bare("新")] }));
    expect(result.counts).toEqual({ added: 0, removed: 0, changed: 1 });
  });

  it("隐藏字段与隐藏段落不参与比较", () => {
    const hiddenField = { ...field("i2", "note", "不该出现"), placement: "hidden" } as ResumeItem;
    const result = diffDocuments(
      doc({ entries: [entry("e1", [field("i1", "summary", "同一句"), hiddenField])] }),
      doc({ entries: [entry("e1", [field("i1", "summary", "同一句")])] }),
    );
    expect(result.identical).toBe(true);
  });
});
