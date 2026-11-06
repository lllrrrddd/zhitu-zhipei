// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rankGraduateJobs } from "./graduate";
import type { GraduateJob, GraduateProfile } from "../features/graduate/types";

const request = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ request }));

const profile: GraduateProfile = {
  id: "P-1",
  name: "Demo",
  degree: "master",
  graduation_year: 2027,
  major: "Materials",
  target_cities: [],
  evidence: {},
};
const job: GraduateJob = {
  id: "CUSTOM-1",
  company: "Lab",
  title: "Engineer",
  city: "Shanghai",
  degree_floor: "unknown",
  degree_exception: false,
  graduation_year: null,
  preferred_majors: [],
  core_skills: [],
  source_url: "https://example.org/jobs/1",
  application_status: "unknown",
  raw_text: "Full pasted posting kept only in the browser until saving",
  source_fragments: { degree_floor: "Master's degree" },
};

beforeEach(() => request.mockReset().mockResolvedValue({}));

describe("rankGraduateJobs", () => {
  it("sends only schema fields and does not leak local posting text into the ranking request", async () => {
    await rankGraduateJobs(profile, [job]);
    const [path, init] = request.mock.calls[0];
    expect(path).toBe("/graduate/recommend");
    const sent = JSON.parse(init.body);
    expect(sent.jobs[0].source_url).toBe(job.source_url);
    expect(sent.jobs[0]).not.toHaveProperty("raw_text");
    expect(sent.jobs[0]).not.toHaveProperty("source_fragments");
  });
});
