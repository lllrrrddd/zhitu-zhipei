// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  analyzeContent,
  collectBullets,
  QUANTIFIED_RATIO_FLOOR,
  WEAK_VERB_FLOOR,
} from "./qualityMetrics";
import type { ResumeDocument } from "../../types/resumeDocument";

function doc(texts: string[]): ResumeDocument {
  return {
    version: 2,
    language: "zh-CN",
    header: { name: { value: "某人" } } as never,
    sections: [
      {
        key: "experience",
        title: "实习经历",
        kind: "entries",
        layout: {
          columns: 1,
          align: "equal",
          gap: null,
          hide_title: false,
          keep_together: true,
          start_on_new_page: false,
          title_override: "",
        },
        entries: texts.map((text, index) => ({
          id: `e${index}`,
          hidden: false,
          lock_content: false,
          lock_layout: false,
          layout: { head: "stacked" },
          items: [
            {
              kind: "field",
              id: `i${index}`,
              key: "summary",
              label: "",
              value: text,
              format: "text",
              wrap: "none",
              body_style: "bullet",
              placement: "body",
              show_label: false,
              solo: false,
            },
          ],
        })),
      },
    ],
  };
}

describe("正文条目收集", () => {
  it("只收 body 位上的正文，跳过标题位与隐藏条目", () => {
    const document = doc(["带 3 个模块的接口开发"]);
    document.sections[0].entries[0].items.push({
      kind: "field",
      id: "title",
      key: "role",
      label: "",
      value: "后端开发",
      format: "text",
      wrap: "none",
      body_style: "paragraph",
      placement: "title",
      show_label: false,
      solo: false,
    });
    const bullets = collectBullets(document);
    expect(bullets.map((bullet) => bullet.text)).toEqual(["带 3 个模块的接口开发"]);
    expect(bullets[0].section).toBe("实习经历");
  });

  it("隐藏条目不计入", () => {
    const document = doc(["a", "b"]);
    document.sections[0].entries[1].hidden = true;
    expect(collectBullets(document)).toHaveLength(1);
  });

  it("空文档返回空数组，不抛异常", () => {
    expect(collectBullets(null)).toEqual([]);
    expect(collectBullets(undefined)).toEqual([]);
  });
});

describe("量化比例", () => {
  it("数字、百分比、中文数量都算量化", () => {
    const report = analyzeContent(
      doc(["把接口耗时从 800ms 降到 300ms", "覆盖 30% 的存量用户", "服务三个团队"]),
    );
    expect(report.bullets).toBe(3);
    expect(report.quantified).toBe(3);
    expect(report.ratio).toBe(1);
    expect(report.lowQuantified).toBe(false);
  });

  it("低于比例下限时判定为缺量化", () => {
    const report = analyzeContent(doc(["负责订单接口开发", "参与需求评审", "完成一次重构"]));
    expect(report.quantified).toBe(0);
    expect(report.ratio).toBe(0);
    expect(report.lowQuantified).toBe(true);
  });

  it("刚好等于下限不算缺", () => {
    const report = analyzeContent(doc(["上线 3 个接口", "负责订单模块", "参与需求评审"]));
    expect(report.ratio).toBeCloseTo(1 / 3, 5);
    expect(report.lowQuantified).toBe(1 / 3 < QUANTIFIED_RATIO_FLOOR);
  });

  it("没有正文条目时不算缺（没有可量化的东西）", () => {
    const report = analyzeContent(doc([]));
    expect(report.bullets).toBe(0);
    expect(report.lowQuantified).toBe(false);
  });
});

describe("弱动词", () => {
  it("统计弱动词开头的条目并给出例子", () => {
    const report = analyzeContent(
      doc(["负责订单接口开发", "参与需求评审", "协助排查线上问题", "上线 3 个接口"]),
    );
    expect(report.weakCount).toBe(3);
    expect(report.weakExamples).toEqual(["负责订单接口开发", "参与需求评审", "协助排查线上问题"]);
    expect(report.weakSections[0]).toBe("实习经历");
    expect(report.manyWeakVerbs).toBe(true);
  });

  it("低于下限不提示", () => {
    const report = analyzeContent(doc(["负责订单接口开发", "上线 3 个接口"]));
    expect(report.weakCount).toBe(1);
    expect(report.manyWeakVerbs).toBe(1 >= WEAK_VERB_FLOOR);
  });

  it("例子过长会截断，避免一条问题占满清单", () => {
    const long = `负责${"很长的描述".repeat(20)}`;
    const report = analyzeContent(doc([long, "参与评审", "协助排查"]));
    expect(report.weakExamples[0].endsWith("…")).toBe(true);
    expect(report.weakExamples[0].length).toBeLessThanOrEqual(41);
  });
});
