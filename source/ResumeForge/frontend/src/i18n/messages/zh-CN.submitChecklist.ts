// SPDX-License-Identifier: Apache-2.0
/** 投递前自检清单：自动判断项 + 只能人确认的六件事。 */

const submitChecklist = {
  "submitChecklist.title": "投递自检",
  "submitChecklist.loading": "正在读岗位要求…",
  "submitChecklist.error": "读取岗位或检测失败，请重试。",
  "submitChecklist.retry": "重试",
  "submitChecklist.refresh": "重新检测",
  "submitChecklist.noJob": "这份简历没有关联岗位，投递自检需要对着具体岗位做。",
  "submitChecklist.progress": "已确认 {done}/{total}",
  "submitChecklist.auto.title": "自动核对",
  "submitChecklist.auto.coverage.line": "关键词覆盖 {matched}/{total}",
  "submitChecklist.auto.coverage.missing": "还没提到：{values}",
  "submitChecklist.auto.coverage.none": "岗位要求里没有可识别的关键词，这一项只能靠人工读 JD。",
  "submitChecklist.auto.issues.line": "高危问题 {count} 条",
  "submitChecklist.auto.issues.hint": "高危项在「ATS 检测」「风险扫描」里有明细与建议。",
  "submitChecklist.manual.title": "只能你确认的",
  "submitChecklist.manual.contact": "电话与邮箱能打通，简历上的联系方式是常用的那个",
  "submitChecklist.manual.names": "岗位名与公司名没投错（尤其是同名公司的不同岗位）",
  "submitChecklist.manual.file": "附件文件名规范（姓名-岗位-学校），不是「简历最终版2」",
  "submitChecklist.manual.pages": "篇幅不超过 2 页，导出后的分页没把一段切成两半",
  "submitChecklist.manual.location": "工作城市、到岗时间、薪资范围都能接受",
  "submitChecklist.manual.truth": "每个数字与经历都经得起追问（面试官会从这里问起）",
  "submitChecklist.healthNote": "上次体检 {score} 分；分数偏低时先改简历再投，命中率会更高。",
  "submitChecklist.copy": "复制清单",
  "submitChecklist.copy.title": "投递自检 · {job}",
  "submitChecklist.copy.footer": "上次体检 {score} 分。",
  "submitChecklist.copied": "清单已复制，可粘到备忘里逐条勾。",
  "submitChecklist.copyFailed": "复制失败，请手动选择。",
  "submitChecklist.hint":
    "勾选只记在这台设备上；自动核对用的是本地规则，不判断能否通过某家公司的 ATS。",
} as const;

export default submitChecklist;
