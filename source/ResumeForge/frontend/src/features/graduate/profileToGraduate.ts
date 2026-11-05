// SPDX-License-Identifier: Apache-2.0
import type { Profile } from "../../types";
import type { GraduateDegree, GraduateProfile } from "./types";

function degreeOf(raw: string): GraduateDegree | null {
  const value = (raw || "").toLowerCase();
  if (/\u535a\u58eb|phd|doctor/.test(value)) return "doctor";
  if (/\u7855\u58eb|\u7814\u7a76\u751f|master/.test(value)) return "master";
  if (/\u672c\u79d1|\u5b66\u58eb|bachelor/.test(value)) return "bachelor";
  return null;
}

function yearOf(raw: string): number | null {
  const match = raw.match(/20\d{2}/);
  return match ? Number(match[0]) : null;
}

export function profileToGraduate(profile: Profile): GraduateProfile | null {
  const studies = profile.educations
    .map((education) => ({
      education,
      degree: degreeOf(education.degree) ?? degreeOf(education.degree_type),
    }))
    .filter(
      (item): item is { education: Profile["educations"][number]; degree: GraduateDegree } =>
        item.degree !== null,
    )
    .sort((left, right) => {
      const order = { bachelor: 1, master: 2, doctor: 3 };
      return order[right.degree] - order[left.degree];
    });
  const study = studies[0];
  if (!study?.education.major) return null;

  const evidence: Record<string, string> = {};
  for (const project of profile.projects) {
    const excerpt = [project.name, project.tech_stack, project.description || project.highlights]
      .filter(Boolean)
      .join(": ")
      .slice(0, 500);
    for (const skill of project.tech_stack
      .split(/[,\uff0c\u3001;\uff1b]/)
      .map((item) => item.trim())) {
      if (skill && excerpt && !evidence[skill]) evidence[skill] = excerpt;
    }
  }
  return {
    id: "saved-profile",
    name: profile.name || "Saved profile",
    degree: study.degree,
    // Zero is intentionally invalid for the API: the page requires user correction.
    graduation_year: yearOf(study.education.end_date) ?? 0,
    major: study.education.major,
    target_cities: profile.target_city
      .split(/[,\uff0c\u3001;\uff1b]/)
      .map((city) => city.trim())
      .filter(Boolean),
    evidence: Object.fromEntries(Object.entries(evidence).slice(0, 50)),
  };
}
