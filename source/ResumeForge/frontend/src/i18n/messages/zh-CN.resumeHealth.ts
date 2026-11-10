// SPDX-License-Identifier: Apache-2.0
/** 简历体检：合并 ATS 与风险扫描的清单、处理台账与复检差值。 */

const resumeHealth = {
  "resumeHealth.intro.title": "简历体检",
  "resumeHealth.intro.body":
    "ATS 与风险扫描合成一张单子，按严重程度排序；改完复检会显示分数变化。只用本地规则，不调用模型。",
  "resumeHealth.action.run": "开始体检",
  "resumeHealth.action.rerun": "重新体检",
  "resumeHealth.action.running": "体检中…",
  "resumeHealth.action.markDone": "改好了",
  "resumeHealth.action.ignore": "不打算改",
  "resumeHealth.action.undo": "撤销标记",
  "resumeHealth.action.copy": "复制建议",
  "resumeHealth.action.copied": "建议已复制，去编辑器里改。",
  "resumeHealth.action.copyFailed": "复制失败，请手动选中文字复制。",
  "resumeHealth.score.label": "体检分",
  "resumeHealth.score.lastAt": "上次体检：{time}",
  "resumeHealth.open": "待处理 {count} 条",
  "resumeHealth.delta.change": "较上次 {delta} 分",
  "resumeHealth.delta.same": "与上次同分",
  "resumeHealth.delta.previous": "上次 {score} 分",
  "resumeHealth.stale": "简历改过了，建议重新体检一次。",
  "resumeHealth.risk.missing":
    "风险扫描还没跑过：切到「风险扫描」跑一次，这里的清单会把查重、敏感词、夸大等风险点一并算进来并计入分数。",
  "resumeHealth.empty": "这次体检没发现问题。",
  "resumeHealth.error": "体检失败，请稍后重试。",
  "resumeHealth.issue.untitled": "（未命名问题）",
  "resumeHealth.state.done": "已改好",
  "resumeHealth.state.ignored": "已忽略",
  "resumeHealth.quality.category": "内容质量",
  "resumeHealth.quality.ratio": "量化 {quantified}/{bullets} 条",
  "resumeHealth.quality.weak": "弱动词开头 {count} 条",
  "resumeHealth.quality.noNumbers.title": "成果条目缺少量化：{quantified} / {bullets} 条带数字",
  "resumeHealth.quality.noNumbers.detail":
    "招聘方先找结果、再找职责；没有数字的条目很难判断工作量与效果。",
  "resumeHealth.quality.noNumbers.suggestion":
    "给每条成果补一个可证明的数字：数据量、耗时、人数、提升百分比。写不出来说明这条经历还缺证据，不要编。",
  "resumeHealth.quality.weak.title": "{count} 条以弱动词开头",
  "resumeHealth.quality.weak.detail": "例如：{examples}",
  "resumeHealth.quality.weak.suggestion":
    "把「负责 X」改成本人做了什么、产出了什么：「把接口耗时从 800ms 降到 300ms」。",
  "resumeHealth.diff.title": "与上次相比",
  "resumeHealth.diff.resolved": "已解决 {count} 条",
  "resumeHealth.diff.added": "新出现 {count} 条",
  "resumeHealth.diff.remaining": "仍在 {count} 条",
  "resumeHealth.hint": "改完再体检一次，分数会更新；标记与体检记录只存在这台设备上。",
} as const;

export default resumeHealth;
