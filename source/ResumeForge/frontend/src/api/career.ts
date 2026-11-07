// SPDX-License-Identifier: Apache-2.0
import type {
  CareerDiagnosis,
  CareerMatches,
  CareerMaterialResult,
  CareerProfile,
  MarketBrowse,
  MarketJob,
  MarketSummary,
  PostingCheck,
} from "../features/career/types";
import { request } from "./client";

export function getCareerMarket(): Promise<MarketSummary> {
  return request("/career/market");
}

export function browseCareerMarket(params: {
  page: number;
  q: string;
  sourceId: string;
  currentOnly: boolean;
}): Promise<MarketBrowse> {
  const query = new URLSearchParams({ page: String(params.page), page_size: "20" });
  if (params.q) query.set("q", params.q);
  if (params.sourceId) query.set("source_id", params.sourceId);
  if (params.currentOnly) query.set("current_only", "true");
  return request(`/career/market/jobs?${query}`);
}

export function refreshCareerMarket(force: boolean): Promise<MarketSummary> {
  return request(force ? "/career/market/refresh?force=true" : "/career/market/refresh", {
    method: "POST",
    budget: "analysis",
  });
}

export function findCareerMatches(profile: CareerProfile): Promise<CareerMatches> {
  return request("/career/match", {
    method: "POST",
    body: JSON.stringify(profile),
    budget: "analysis",
  });
}

export function checkCareerPosting(url: string): Promise<PostingCheck> {
  return request("/career/check", {
    method: "POST",
    body: JSON.stringify({ url }),
    budget: "analysis",
  });
}

export function checkCareerMaterial(payload: {
  file: { name: string; mime_type: string; data: string };
  expected: { label: string; value: string }[];
  allow_ocr: boolean;
}): Promise<CareerMaterialResult> {
  return request("/career/material/check", {
    method: "POST",
    body: JSON.stringify(payload),
    budget: "analysis",
  });
}

export function diagnoseCareerResume(
  profile: CareerProfile,
  // 必须传完整岗位对象：后端按 MarketJob 校验（source_id 枚举、url https 约束）
  job: MarketJob,
): Promise<CareerDiagnosis> {
  return request("/career/diagnose", {
    method: "POST",
    body: JSON.stringify({ profile, job }),
    budget: "analysis",
  });
}
