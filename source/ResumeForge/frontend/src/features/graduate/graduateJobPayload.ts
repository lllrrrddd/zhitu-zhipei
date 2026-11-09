// SPDX-License-Identifier: Apache-2.0
import type { JobPayload } from "../../types";
import type { GraduateJob } from "./types";

/** Preserve the checked summary and the pasted JD while keeping opening status honest. */
export function graduateJobPayload(job: GraduateJob): JobPayload {
  const requirements = [
    `最低学历：${job.degree_floor === "unknown" ? "未明确" : job.degree_floor}`, // i18n-ok: 写入岗位 requirements 的摘要（落库值）
    job.graduation_year ? `毕业年份：${job.graduation_year}` : "毕业年份：未明确", // i18n-ok: 同上
    job.preferred_majors.length ? `专业：${job.preferred_majors.join("、")}` : "专业：未明确", // i18n-ok: 同上
    job.core_skills.length ? `核心能力：${job.core_skills.join("、")}` : "核心能力：未明确", // i18n-ok: 同上
    job.preferred_skills?.length ? `加分能力：${job.preferred_skills.join("、")}` : "", // i18n-ok: 同上
  ]
    .filter(Boolean)
    .join("\n");
  const closed = job.application_status !== "unknown";
  return {
    title: job.title,
    company: job.company,
    location: job.city,
    job_type: "校招", // i18n-ok: 岗位类型落库值（后端 job_type 枚举）
    description: job.raw_text ?? "",
    requirements,
    source_url: job.detail_source_url ?? job.source_url,
    posted_at: job.posted_date ?? "",
    status: closed ? "已截止" : "待核实", // i18n-ok: 岗位状态落库值（后端白名单）
    note: [
      "由智能选岗保存；条件为用户核对的摘要，投递前请重查招聘原文。", // i18n-ok: 岗位备注原文（写入 note）
      `来源：${job.source_url}`, // i18n-ok: 岗位备注原文（写入 note）
      job.source_checked_at ? `条件核查日期：${job.source_checked_at}` : "", // i18n-ok: 岗位备注原文（写入 note）
      job.application_status === "verified_closed" ? "用户记录：已核实关闭" : "", // i18n-ok: 岗位备注原文（写入 note）
      job.application_status === "past_reported_deadline" ? "来源记载：截止日期已过" : "", // i18n-ok: 岗位备注原文（写入 note）
    ]
      .filter(Boolean)
      .join("\n"),
    recognition_source: job.raw_text ? "粘贴文本识别" : "手动填写", // i18n-ok: 录入方式落库值（后端 RECOGNITION_SOURCES）
    origin_source: "智能选岗", // i18n-ok: 来源字段落库值
  };
}
