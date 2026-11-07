// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "antd";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { t } from "../../i18n";
import CareerDiagnosisPanel from "./CareerDiagnosisPanel";
import type { CareerProfile, MarketJob } from "./types";

vi.mock("../../api/career", () => ({
  diagnoseCareerResume: vi.fn(async () => ({
    score: 68,
    parts: [
      { key: "keyword", value: 75, weight: 40 },
      { key: "quantified", value: 50, weight: 25 },
      { key: "action", value: 100, weight: 20 },
      { key: "readiness", value: 50, weight: 15 },
    ],
    coverage: 0.75,
    terms: [
      { term: "Ansible", state: "missing" },
      { term: "Kubernetes", state: "mentioned" },
    ],
    issues: [
      { key: "missing_keyword", values: ["Ansible"], excerpt: "熟悉 Linux…" },
      { key: "no_numbers", values: [], excerpt: "负责日常运维工作。" },
    ],
    job_title: "平台运维工程师",
    company: "测试公司",
  })),
}));

const profile: CareerProfile = {
  degree: "master",
  graduation_year: 2027,
  major: "计算机技术",
  direction: "运维开发",
  cities: ["深圳"],
  skills: ["Linux", "Kubernetes"],
  experience: ["负责日常运维工作。"],
};

const job = {
  id: "tencent-1",
  source_id: "tencent",
  company: "测试公司",
  title: "平台运维工程师",
  family: "平台运维工程师",
  cities: ["深圳"],
  kind: "campus",
  url: "https://careers.tencent.com/jobdesc.html?postId=1",
  listed_date: "2026-11-06",
  requirements: "熟悉 Linux、Kubernetes、Ansible。",
  responsibilities: "负责平台稳定性建设。",
  experience_requirement: "",
} as MarketJob;

it("只有在点击后才发请求，并把分数、关键词三态与问题清单渲染出来", async () => {
  const api = await import("../../api/career");
  render(
    <MemoryRouter>
      <App>
        <CareerDiagnosisPanel profile={profile} job={job} />
      </App>
    </MemoryRouter>,
  );

  // 未点击前不打后端：一页八张卡片同时请求会把接口打满
  expect(api.diagnoseCareerResume).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: t("career.check.run") }));

  expect(await screen.findByText("68")).toBeInTheDocument();
  expect(api.diagnoseCareerResume).toHaveBeenCalledTimes(1);
  expect(screen.getByText(t("career.check.coverage", { percent: 75 }))).toBeInTheDocument();
  // 关键词出现在两处：三态标签（「还没提」）与问题清单；分别断言避免歧义
  expect(screen.getByText(new RegExp(t("career.check.state.missing")))).toBeInTheDocument();
  expect(
    screen.getByText(t("career.check.issue.missing_keyword", { values: "Ansible" })),
  ).toBeInTheDocument();
  expect(
    screen.getByText(t("career.check.issue.no_numbers", { values: "", excerpt: "负责日常运维工作。" })),
  ).toBeInTheDocument();
  expect(screen.getByText(t("career.check.scope"))).toBeInTheDocument();
});
