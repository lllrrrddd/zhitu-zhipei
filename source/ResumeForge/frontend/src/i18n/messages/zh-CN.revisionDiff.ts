// SPDX-License-Identifier: Apache-2.0
/** 简历版本对比（与上一版比）。 */

const revisionDiff = {
  "revisionDiff.title": "与上一版的差异",
  "revisionDiff.loading": "正在对比两个版本…",
  "revisionDiff.error": "读取版本失败，请重试。",
  "revisionDiff.counts": "新增 {added} 处 · 删除 {removed} 处 · 修改 {changed} 处",
  "revisionDiff.empty": "两个版本在文字上没有差异（可能只调了排版）。",
  "revisionDiff.header": "抬头信息",
  "revisionDiff.kind.added": "新增",
  "revisionDiff.kind.removed": "删除",
  "revisionDiff.kind.changed": "修改",
  "revisionDiff.entryN": "第 {index} 条",
  "revisionDiff.fieldN": "字段 {index}",
  "revisionDiff.textN": "段落 {index}",
  "revisionDiff.hint":
    "只对比文字字段，不显示排版与字号变化；这里也不能回滚——要恢复旧内容请走「AI 修改 / 重新生成」。",
} as const;

export default revisionDiff;
