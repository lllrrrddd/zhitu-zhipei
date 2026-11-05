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
  return request("/graduate/demo");
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
    body: JSON.stringify({ profile, jobs }),
  });
}
