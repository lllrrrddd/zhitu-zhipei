// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { graduateJobPayload } from "./graduateJobPayload";
import type { GraduateJob } from "./types";

const job: GraduateJob = {
  id: "CUSTOM-1",
  company: "Example Lab",
  title: "Research Engineer",
  city: "Shanghai",
  degree_floor: "master",
  degree_exception: false,
  graduation_year: 2027,
  preferred_majors: ["Materials"],
  core_skills: ["XRD"],
  source_url: "https://example.org/job/1",
  source_checked_at: "2026-11-06",
  application_status: "unknown",
  raw_text: "Original job posting with the degree and skills.",
};

describe("graduateJobPayload", () => {
  it("keeps the posting and marks unknown opening status as unverified", () => {
    const payload = graduateJobPayload(job);
    expect(payload.status).toBe("待核实");
    expect(payload.description).toBe(job.raw_text);
    expect(payload.requirements).toContain("XRD");
    expect(payload.note).toContain("2026-11-06");
    expect(payload.status).not.toBe("已投递");
  });

  it("keeps a reported closed job closed", () => {
    expect(graduateJobPayload({ ...job, application_status: "verified_closed" }).status).toBe(
      "已截止",
    );
  });
});
