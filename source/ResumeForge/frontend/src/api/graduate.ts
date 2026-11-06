// SPDX-License-Identifier: Apache-2.0
import { request } from "./client";
import type {
  GraduateDemo,
  GraduateJob,
  GraduateJobDraft,
  GraduateProfile,
  GraduateRecommendation,
} from "../features/graduate/types";

export function getGraduateDemo(): Promise<GraduateDemo> {
  return request("/graduate/official");
}

export function parseGraduateJobText(text: string): Promise<GraduateJobDraft> {
  return request("/graduate/parse-draft", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function rankGraduateJobs(
  profile: GraduateProfile,
  jobs: GraduateJob[],
): Promise<GraduateRecommendation> {
  return request("/graduate/recommend", {
    method: "POST",
    body: JSON.stringify({
      profile,
      jobs: jobs.map((job) => ({
        id: job.id,
        company: job.company,
        title: job.title,
        city: job.city,
        degree_floor: job.degree_floor,
        degree_exception: job.degree_exception,
        graduation_year: job.graduation_year,
        preferred_majors: job.preferred_majors,
        core_skills: job.core_skills,
        preferred_skills: job.preferred_skills ?? [],
        source_url: job.source_url,
        source_checked_at: job.source_checked_at ?? null,
        detail_source_url: job.detail_source_url ?? null,
        posted_date: job.posted_date ?? null,
        application_status: job.application_status,
      })),
    }),
  });
}
