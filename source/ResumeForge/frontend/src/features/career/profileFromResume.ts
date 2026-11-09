// SPDX-License-Identifier: Apache-2.0
import type { Profile } from "../../types";
import { degreeOf } from "../graduate/profileToGraduate";
import type { GraduateProfile } from "../graduate/types";
import type { CareerDegree, CareerProfile } from "./types";

export const EMPTY_CAREER_PROFILE: CareerProfile = {
  degree: "unknown",
  graduation_year: null,
  major: "",
  direction: "",
  cities: [],
  skills: [],
  experience: [],
};

const degreeRank = { unknown: 0, bachelor: 1, master: 2, doctor: 3 };
const ROLE_HINTS =
  // i18n-ok: 匹配简历原文（中文）里的岗位方向词，是识别用的词表，不是界面文案
  /运维|后端|前端|算法|测试工程|数据分析|软件开发|网络安全|嵌入式|财务|供应链|设计师/;

function directionFromExperience(resume: Pick<Profile, "experiences">): string {
  return (
    resume.experiences
      .map((item) => item.role?.trim() || "")
      .find((role) => role.length > 1 && role.length <= 30 && ROLE_HINTS.test(role)) || ""
  );
}

export function hasSearchDetails(profile: CareerProfile): boolean {
  return Boolean(
    profile.direction.trim() ||
    profile.major.trim() ||
    profile.skills.length ||
    profile.experience.length,
  );
}

function uniqueParts(values: string[], limit: number, maxLength: number): string[] {
  return [
    ...new Set(values.map((value) => value.trim().slice(0, maxLength)).filter(Boolean)),
  ].slice(0, limit);
}

export function splitCities(raw: string): string[] {
  return uniqueParts(raw.split(/[,，、;；/]/), 10, 40);
}

export function resumeToCareerProfile(
  resume: Pick<
    Profile,
    "educations" | "projects" | "experiences" | "skills" | "job_intent" | "target_city"
  >,
): CareerProfile {
  const schools = resume.educations.map((education) => {
    const degree: CareerDegree =
      degreeOf(education.degree) ?? degreeOf(education.degree_type) ?? "unknown";
    return { education, degree };
  });
  schools.sort((a, b) => degreeRank[b.degree] - degreeRank[a.degree]);
  const major = schools.find(({ education }) => education.major?.trim())?.education.major ?? "";
  const year = schools
    .map(({ education }) => education.end_date?.match(/\b(?:19|20)\d{2}\b/)?.[0])
    .find(Boolean);
  const skills = [
    ...resume.skills.map((item) => item.name),
    ...resume.projects.flatMap((item) => (item.tech_stack || "").split(/[,，、;；\n]/)),
  ];
  const experience = [
    ...resume.projects.map((item) =>
      [item.name, item.tech_stack, item.description || item.highlights].filter(Boolean).join(" · "),
    ),
    ...resume.experiences.map((item) => [item.role, item.description].filter(Boolean).join(" · ")),
  ];
  return {
    degree: schools[0]?.degree ?? "unknown",
    graduation_year: year ? Number(year) : null,
    major: major.slice(0, 120),
    direction: resume.job_intent?.slice(0, 160) || directionFromExperience(resume),
    cities: splitCities(resume.target_city || ""),
    skills: uniqueParts(skills, 40, 80),
    experience: uniqueParts(experience, 12, 600),
  };
}

export function exampleToCareerProfile(profile: GraduateProfile, direction: string): CareerProfile {
  return {
    degree: profile.degree,
    graduation_year: profile.graduation_year,
    major: profile.major,
    direction,
    cities: profile.target_cities,
    skills: Object.keys(profile.evidence),
    experience: uniqueParts(Object.values(profile.evidence), 12, 600),
  };
}
