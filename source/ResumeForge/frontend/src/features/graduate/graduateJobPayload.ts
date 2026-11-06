// SPDX-License-Identifier: Apache-2.0
import type { JobPayload } from "../../types";
import type { GraduateJob } from "./types";

/** Preserve the checked summary and the pasted JD while keeping opening status honest. */
export function graduateJobPayload(job: GraduateJob): JobPayload {
  const requirements = [
    `最低学历：${job.degree_floor === "unknown" ? "未明确" : job.degree_floor}`,
    job.graduation_year ? `毕业年份：${job.graduation_year}` : "毕业年份：未明确",
    job.preferred_majors.length ? `专业：${job.preferred_majors.join("、")}` : "专业：未明确",
    job.core_skills.length ? `核心能力：${job.core_skills.join("、")}` : "核心能力：未明确",
    job.preferred_skills?.length ? `加分能力：${job.preferred_skills.join("、")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const closed = job.application_status !== "unknown";
  return {
    title: job.title,
    company: job.company,
    location: job.city,
    job_type: "校招",
    description: job.raw_text ?? "",
    requirements,
    source_url: job.detail_source_url ?? job.source_url,
    posted_at: job.posted_date ?? "",
    status: closed ? "已截止" : "待核实",
    note: [
      "由智能选岗保存；条件为用户核对的摘要，投递前请重查招聘原文。",
      `来源：${job.source_url}`,
      job.source_checked_at ? `条件核查日期：${job.source_checked_at}` : "",
      job.application_status === "verified_closed" ? "用户记录：已核实关闭" : "",
      job.application_status === "past_reported_deadline" ? "来源记载：截止日期已过" : "",
    ]
      .filter(Boolean)
      .join("\n"),
    recognition_source: job.raw_text ? "粘贴文本识别" : "手动填写",
    origin_source: "智能选岗",
  };
}
