// SPDX-License-Identifier: Apache-2.0
/**
 * 简历内容质量指标：**量化比例**与**弱动词开头**。
 *
 * 为什么在体检单里补这两项：ATS 的格式风险只看"有没有、长不长"，看不出"这条成果有没有
 * 数字支撑、开头是不是在描述职责而不是结果"。而岗位定向诊断里的这两项要绑定一个岗位和
 * 一份画像——体检单在简历详情页只有内容本身，所以这里改成**直接读简历正文**算：
 *
 * - 量化比例 = 正文条目里含数字（或百分号/倍数）的条数 ÷ 正文条目总数；
 * - 弱动词 = 以"负责/参与/协助/配合…"开头的条目数（这类开头通常只说明"干了什么"，
 *   不说明"干成什么"）。
 *
 * 只统计**正文条目**（`placement === "body"` 的字段与列表值），不统计标题、日期、
 * 技能清单：技能名里带数字（`Vue3`）不代表成果被量化。
 *
 * 本模块只出**数据与判定**，不拼句子：文案由面板用语言包渲染（守卫不允许 src 里硬编码中文）。
 */

import type { ResumeDocument } from "../../types/resumeDocument";

/**
 * 弱动词：以这些词开头通常是在写职责，而不是写结果。
 *
 * 这是**匹配中文简历原文的词表**，不是界面文案（同 `profileFromResume` 的方向词正则）。
 */
// prettier-ignore
// i18n-ok: 匹配简历正文的中文词表，不是界面文案
export const WEAK_VERBS = ["负责", "参与", "协助", "配合", "支持", "帮助", "跟进", "从事", "担任", "按时完成"];

/**
 * 量化判据：阿拉伯数字、中文数字后接**结果型单位**，或百分号/倍数。
 *
 * 单位里刻意不含「次」：``完成一次重构`` 这种"次数"不说明规模或效果，把它算成量化会让
 * 弱简历也过线。带数字的次数（``迭代 20 次``）仍会被前一个分支命中。
 */
// prettier-ignore
// i18n-ok: 匹配简历正文的中文数量词，不是界面文案
const QUANTIFIED_RE = /[\d０-９]|[一二三四五六七八九十百千万]+\s*(?:个|条|项|人|天|周|月|年|倍|%)|[%％]/;

/** 少于这个比例就提示"成果缺量化"（8 条里 3 条有数字 ≈ 37%）。 */
export const QUANTIFIED_RATIO_FLOOR = 0.4;
/** 弱动词条目多到值得单独提示。 */
export const WEAK_VERB_FLOOR = 2;
/** 清单里最多举几个例子，避免一条问题占满整屏。 */
const MAX_EXAMPLES = 3;
/** 例子截断长度：整条正文塞进清单会让人没法扫读。 */
const EXAMPLE_CHARS = 40;

export interface ContentBullet {
  /** 所在分区的标题（如「实习经历」），用于把问题说清在哪一块。 */
  section: string;
  text: string;
}

export interface QualityFindings {
  bullets: number;
  quantified: number;
  /** 0~1；没有正文条目时为 0（界面据此显示「-」而不是 0%）。 */
  ratio: number;
  weakCount: number;
  /** 弱动词开头的例子（已截断），供清单里点名。 */
  weakExamples: string[];
  /** 哪些例子来自哪个分区（与 `weakExamples` 同序）。 */
  weakSections: string[];
  /** 量化比例低于下限。 */
  lowQuantified: boolean;
  /** 弱动词条目数达到下限。 */
  manyWeakVerbs: boolean;
}

/** 取正文条目：只要 body 位上的字段值与列表值，保持文档顺序。 */
export function collectBullets(document: ResumeDocument | null | undefined): ContentBullet[] {
  const bullets: ContentBullet[] = [];
  for (const section of document?.sections ?? []) {
    for (const entry of section.entries ?? []) {
      if (entry.hidden) continue;
      for (const item of entry.items ?? []) {
        // 纯文本段落（kind=text）没有 placement：它本身就是正文，直接算一条。
        if (item.kind === "text") {
          const text = item.text.trim();
          if (text && !item.hidden) bullets.push({ section: section.title, text });
          continue;
        }
        if (item.placement !== "body") continue;
        if (item.kind === "field") {
          const text = item.value.trim();
          if (text) bullets.push({ section: section.title, text });
        } else if (item.kind === "list") {
          for (const value of item.values) {
            const text = String(value ?? "").trim();
            if (text) bullets.push({ section: section.title, text });
          }
        }
      }
    }
  }
  return bullets;
}

function trimExample(text: string): string {
  return text.length > EXAMPLE_CHARS ? `${text.slice(0, EXAMPLE_CHARS)}…` : text;
}

/** 统计两份指标与两个判定（不出文案）。 */
export function analyzeContent(document: ResumeDocument | null | undefined): QualityFindings {
  const bullets = collectBullets(document);
  const quantified = bullets.filter((bullet) => QUANTIFIED_RE.test(bullet.text)).length;
  const ratio = bullets.length === 0 ? 0 : quantified / bullets.length;
  const weak = bullets.filter((bullet) => WEAK_VERBS.some((verb) => bullet.text.startsWith(verb)));
  return {
    bullets: bullets.length,
    quantified,
    ratio,
    weakCount: weak.length,
    weakExamples: weak.slice(0, MAX_EXAMPLES).map((bullet) => trimExample(bullet.text)),
    weakSections: weak.slice(0, MAX_EXAMPLES).map((bullet) => bullet.section),
    lowQuantified: bullets.length > 0 && ratio < QUANTIFIED_RATIO_FLOOR,
    manyWeakVerbs: weak.length >= WEAK_VERB_FLOOR,
  };
}
