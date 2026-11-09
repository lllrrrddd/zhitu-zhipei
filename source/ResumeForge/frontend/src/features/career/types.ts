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

export interface MarketBrowseItem {
  job: MarketJob;
  source_name: string;
  checked_at: string | null;
  current: boolean;
}

export interface MarketBrowse {
  market: MarketSummary;
  items: MarketBrowseItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ScorePart {
  key: "direction" | "skills" | "city" | "entry";
  value: number;
  weight: number;
}

export interface MatchGap {
  key:
    | "degree_unspecified"
    | "degree_unconfirmed"
    | "experience_required"
    | "missing_skills"
    | "city_mismatch"
    | "no_evidence"
    | "graduation_check";
  values: string[];
}

/** 岗位要求技能相对"这份画像"的三态（口径见后端 SkillState）。 */
export interface SkillState {
  term: string;
  state: "found" | "mentioned" | "missing";
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
  /** 旧后端没有这个字段：空数组时界面退回只显示 check_skills 那一句。 */
  skill_states?: SkillState[];
  score: number;
  score_parts: ScorePart[];
  gaps: MatchGap[];
  relatedness: number | null;
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

export interface CareerMaterialResult {
  name: string;
  method: "document_text" | "image_ocr" | "mixed";
  text: string;
  warnings: string[];
  findings: {
    label: string;
    value: string;
    status: "text_found" | "needs_review";
    excerpt: string;
  }[];
}

export interface CareerDiagnosisPart {
  key: "keyword" | "quantified" | "action" | "readiness";
  value: number;
  weight: number;
}

export interface CareerDiagnosisTerm {
  term: string;
  state: "found" | "mentioned" | "missing";
}

export interface CareerDiagnosisIssue {
  key:
    | "missing_keyword"
    | "mentioned_only"
    | "no_numbers"
    | "weak_verb"
    | "no_experience"
    | "few_skills";
  values: string[];
  excerpt: string;
}

export interface CareerDiagnosis {
  score: number;
  parts: CareerDiagnosisPart[];
  coverage: number;
  terms: CareerDiagnosisTerm[];
  issues: CareerDiagnosisIssue[];
  job_title: string;
  company: string;
}
