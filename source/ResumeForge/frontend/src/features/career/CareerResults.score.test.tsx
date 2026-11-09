// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { App } from "antd";
import { expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { t } from "../../i18n";
import CareerResults from "./CareerResults";
import type { CareerMatches, CareerProfile, MatchedJob } from "./types";

const profile: CareerProfile = {
  degree: "master",
  graduation_year: 2027,
  major: "计算机技术",
  direction: "运维开发",
  cities: ["深圳"],
  skills: ["Linux", "Kubernetes", "Python"],
  experience: ["负责校内系统容器化改造并接入监控"],
};

function match(overrides: Partial<MatchedJob> = {}): MatchedJob {
  return {
    job: {
      id: "tencent-1",
      source_id: "tencent",
      company: "测试公司",
      title: "平台运维工程师",
      family: "平台运维工程师",
      cities: ["深圳"],
      kind: "campus",
      url: "https://careers.tencent.com/jobdesc.html?postId=1",
      listed_date: "2026-11-06",
      requirements: "熟悉 Linux、Docker、Kubernetes。",
      responsibilities: "负责平台稳定性建设。",
      experience_requirement: "",
    },
    checked_at: "2026-11-07T00:00:00Z",
    current: true,
    fit: "strong",
    matched_skills: ["Kubernetes", "Linux"],
    evidence: "负责校内系统容器化改造并接入监控",
    direction_match: true,
    city_match: true,
    degree_floor: "master",
    eligibility_notes: [],
    check_skills: [],
    score: 87,
    score_parts: [
      { key: "direction", value: 100, weight: 40 },
      { key: "skills", value: 67, weight: 30 },
      { key: "city", value: 100, weight: 10 },
      { key: "entry", value: 100, weight: 20 },
    ],
    gaps: [],
    relatedness: 64,
    ...overrides,
  };
}

function renderResults(items: MatchedJob[]) {
  const data: CareerMatches = {
    market: { count: 1, current_count: 1, sources: [] },
    matches: items,
    relevant_count: items.length,
    method: "semantic",
  };
  return render(
    <MemoryRouter>
      <App>
        <CareerResults
          result={data}
          profile={profile}
          profileId="profile-1"
          history={[]}
          onAcceptAdvice={() => undefined}
        />
      </App>
    </MemoryRouter>,
  );
}

it("shows the rule score together with its four parts", () => {
  renderResults([match()]);

  expect(screen.getByText("87")).toBeInTheDocument();
  expect(screen.getByText(t("career.score.direction"))).toBeInTheDocument();
  expect(screen.getByText(t("career.score.skills"))).toBeInTheDocument();
  expect(screen.getByText(t("career.score.city"))).toBeInTheDocument();
  expect(screen.getByText(t("career.score.entry"))).toBeInTheDocument();
  // 语义相近度只做排序参考，必须与分数分开显示，避免被读成同一个指标。
  expect(
    screen.getByText(t("career.score.relatedness", { value: 64 })),
  ).toBeInTheDocument();
  expect(screen.getByText(t("career.score.note"))).toBeInTheDocument();
});

it("lists gaps so a possible match never stays unexplained", () => {
  renderResults([
    match({
      fit: "possible",
      evidence: "",
      gaps: [
        { key: "no_evidence", values: [] },
        { key: "missing_skills", values: ["Ansible", "Prometheus"] },
      ],
    }),
  ]);

  expect(screen.getByText(t("career.gap.title"))).toBeInTheDocument();
  expect(screen.getByText(t("career.gap.no_evidence"))).toBeInTheDocument();
  expect(
    screen.getByText(t("career.gap.missing_skills", { values: "Ansible、Prometheus" })),
  ).toBeInTheDocument();
});
