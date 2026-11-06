// SPDX-License-Identifier: Apache-2.0
import type { GraduateDegree } from "../graduate/types";

export type CareerDegree = GraduateDegree | "unknown";

export interface CareerProfile {
  degree: CareerDegree;
  graduation_year: number | null;
  major: string;
  direction: string;
  cities: string[];
  skills: string[];
  experience: string[];
}

export interface MarketSource {
  id: string;
  name: string;
  url: string;
  status: "idle" | "updated" | "partial" | "failed";
  checked_at: string | null;
  count: number;
  current: boolean;
}

export interface MarketSummary {
  sources: MarketSource[];
  count: number;
  current_count: number;
}

export interface MarketJob {
  id: string;
  source_id: string;
  company: string;
  title: string;
  family: string;
  cities: string[];
  kind: "campus" | "trainee" | "full_time";
  url: string;
  listed_date: string | null;
  requirements: string;
  responsibilities: string;
  experience_requirement: string;
}

export interface MatchedJob {
  job: MarketJob;
  checked_at: string;
  current: boolean;
  fit: "strong" | "possible";
  matched_skills: string[];
  evidence: string;
  direction_match: boolean;
  city_match: boolean;
  degree_floor: CareerDegree;
  eligibility_notes: (
    "degree_unspecified" | "degree_unconfirmed" | "graduation_check" | "experience_check"
  )[];
  check_skills: string[];
}

export interface CareerMatches {
  market: MarketSummary;
  matches: MatchedJob[];
  relevant_count: number;
  method: "semantic" | "rules";
}

export interface PostingCheck {
  status: "found" | "cached" | "not_found" | "unsupported";
  checked_at: string | null;
  jobs: MarketJob[];
}
