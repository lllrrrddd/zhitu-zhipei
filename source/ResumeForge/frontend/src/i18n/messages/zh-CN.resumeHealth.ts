// SPDX-License-Identifier: Apache-2.0
/** 简历体检：合并 ATS 与风险扫描的清单、处理台账与复检差值。 */

const resumeHealth = {
  "resumeHealth.intro.title": "简历体检",
  "resumeHealth.intro.body":
    "把 ATS 本地检测与风险扫描合成一张单子：按严重程度列问题、逐条标记改没改、复检时显示分数变化。体检只用本地规则，不调用模型。",
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
  "resumeHealth.hint": "改完再体检一次，分数会更新；标记与体检记录只存在这台设备上。",
} as const;

export default resumeHealth;
