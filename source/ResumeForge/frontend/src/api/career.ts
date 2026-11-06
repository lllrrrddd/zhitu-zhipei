// SPDX-License-Identifier: Apache-2.0
import type {
  CareerMatches,
  CareerMaterialResult,
  CareerProfile,
  MarketSummary,
  PostingCheck,
} from "../features/career/types";
import { request } from "./client";

export function getCareerMarket(): Promise<MarketSummary> {
  return request("/career/market");
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
