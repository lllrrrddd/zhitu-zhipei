// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import type { Education, Profile } from "../../types";
import { resumeToCareerProfile } from "./profileFromResume";

it("uses the highest known degree while recovering a major from another education row", () => {
  const emptyEducation: Education = {
    school: "甲大学",
    department: "",
    major: "",
    degree: "",
    study_mode: "",
    degree_type: "",
    start_date: "",
    end_date: "",
    gpa: "",
    cet4_score: "",
    cet6_score: "",
    courses: "",
    achievements: "",
  };
  const resume = {
    educations: [
      { ...emptyEducation, degree: "硕士", end_date: "2027-06" },
      { ...emptyEducation, degree: "本科", major: "数据科学", end_date: "2025-06" },
    ],
    projects: [],
    experiences: [],
    skills: [],
    job_intent: "",
    target_city: "",
  } satisfies Pick<
    Profile,
    "educations" | "projects" | "experiences" | "skills" | "job_intent" | "target_city"
  >;

  expect(resumeToCareerProfile(resume)).toMatchObject({
    degree: "master",
    graduation_year: 2027,
    major: "数据科学",
    direction: "",
  });
});
