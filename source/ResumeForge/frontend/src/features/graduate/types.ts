// SPDX-License-Identifier: Apache-2.0
export type GraduateDegree = "bachelor" | "master" | "doctor";

export interface GraduateProfile {
  id: string;
  name: string;
  degree: GraduateDegree;
  graduation_year: number;
  major: string;
  target_cities: string[];
  evidence: Record<string, string>;
}

export interface GraduateJob {
  id: string;
  company: string;
  title: string;
  city: string;
  degree_floor: GraduateDegree | "unknown";
  degree_exception: boolean;
  graduation_year: number | null;
  preferred_majors: string[];
  core_skills: string[];
  preferred_skills?: string[];
  source_url: string;
  source_checked_at?: string | null;
  detail_source_url?: string;
  posted_date?: string | null;
  application_status: "unknown" | "past_reported_deadline" | "verified_closed";
  /** Only kept in this page for a user-pasted posting; never sent to /graduate/recommend. */
  raw_text?: string;
  source_fragments?: Record<string, string>;
}

export interface GraduateJobDraft {
  company: string;
  title: string;
  city: string;
  degree_floor: GraduateJob["degree_floor"];
  graduation_year: number | null;
  preferred_majors: string[];
  core_skills: string[];
  source_url: string;
  application_status: GraduateJob["application_status"];
  source_fragments: Record<string, string>;
  warnings: string[];
}

export interface GraduateDemo {
  profiles: GraduateProfile[];
  jobs: GraduateJob[];
  checked_date: string;
  notice: string;
}

export interface GraduateDecision {
  job_id: string;
  source_url: string;
  application_status: GraduateJob["application_status"];
  status: "directional_fit" | "review" | "blocked" | "expired";
  reason: string;
  major_fit: boolean;
  matched_core: string[];
  matched_preferred: string[];
  matched_evidence: Record<string, { skill: string; excerpt: string }[]>;
  rank_score: number;
}

export interface GraduateRecommendation {
  profile_id: string;
  directional_fits: GraduateDecision[];
  needs_review: GraduateDecision[];
  blocked: GraduateDecision[];
  expired: GraduateDecision[];
  message: string;
}
