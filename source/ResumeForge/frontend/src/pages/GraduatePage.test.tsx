// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n";
import GraduatePage from "./GraduatePage";

const mocks = vi.hoisted(() => ({
  getGraduateDemo: vi.fn(),
  rankGraduateJobs: vi.fn(),
  parseGraduateJobText: vi.fn(),
  getProfile: vi.fn(),
  listJobs: vi.fn(),
  createJob: vi.fn(),
}));

vi.mock("../api/graduate", () => ({
  getGraduateDemo: mocks.getGraduateDemo,
  rankGraduateJobs: mocks.rankGraduateJobs,
  parseGraduateJobText: mocks.parseGraduateJobText,
}));
vi.mock("../api/profile", () => ({ getProfile: mocks.getProfile }));
vi.mock("../api/jobs", () => ({ listJobs: mocks.listJobs, createJob: mocks.createJob }));

const profile = {
  id: "P-TEST",
  name: "Test profile",
  degree: "master",
  graduation_year: 2027,
  major: "Computer Science",
  target_cities: ["Shanghai"],
  evidence: { Python: "Built a Python service" },
};
const job = {
  id: "J-TEST",
  company: "Example Co",
  title: "Developer",
  city: "Shanghai",
  degree_floor: "master",
  degree_exception: false,
  graduation_year: 2027,
  preferred_majors: ["Computer Science"],
  core_skills: ["Python"],
  source_url: "https://example.org/jobs/1",
  application_status: "unknown",
};

beforeEach(() => {
  mocks.getGraduateDemo.mockReset().mockResolvedValue({
    profiles: [profile],
    jobs: [job],
    checked_date: "2026-11-04",
    notice: "Demo",
  });
  mocks.getProfile.mockReset().mockResolvedValue({ educations: [] });
  mocks.listJobs.mockReset().mockResolvedValue({ items: [], total: 0 });
  mocks.createJob.mockReset().mockResolvedValue({ id: 42 });
  mocks.parseGraduateJobText.mockReset().mockResolvedValue({
    company: "Draft Employer",
    title: "Draft Engineer",
    city: "Shanghai",
    degree_floor: "unknown",
    graduation_year: null,
    preferred_majors: [],
    core_skills: [],
    source_url: "https://example.org/jobs/draft",
    application_status: "unknown",
    source_fragments: {},
    warnings: ["Check the source"],
  });
  mocks.rankGraduateJobs.mockReset().mockResolvedValue({
    profile_id: profile.id,
    directional_fits: [
      {
        job_id: job.id,
        source_url: job.source_url,
        application_status: "unknown",
        status: "directional_fit",
        reason: "Evidence found",
        major_fit: true,
        matched_core: ["Python"],
        matched_preferred: [],
        matched_evidence: {
          Python: [{ skill: "Python", excerpt: "Built a Python service" }],
          Other: [{ skill: "Python", excerpt: "Built a Python service" }],
        },
        rank_score: 1,
      },
    ],
    needs_review: [],
    blocked: [],
    expired: [],
    message: "Opening unverified",
  });
});

describe("GraduatePage", () => {
  it("requires confirmation and displays the source plus exact evidence", async () => {
    render(
      <MemoryRouter>
        <GraduatePage />
      </MemoryRouter>,
    );
    await screen.findAllByText(profile.name);
    fireEvent.click(screen.getByRole("button", { name: t("graduate.rank") }));
    expect(mocks.rankGraduateJobs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: t("graduate.confirm") }));
    fireEvent.click(screen.getByRole("button", { name: t("graduate.rank") }));
    await waitFor(() => expect(mocks.rankGraduateJobs).toHaveBeenCalledOnce());
    expect(screen.getByRole("link", { name: t("graduate.source") })).toHaveAttribute(
      "href",
      job.source_url,
    );
    expect(screen.getAllByText("Built a Python service").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        t("graduate.aliasEvidence", { skill: "Python", excerpt: "Built a Python service" }),
      ),
    ).toHaveLength(1);
    fireEvent.click(screen.getByText(t("graduate.resumeAdviceTitle")));
    expect(
      screen.getByText(
        t("graduate.resumeAdvice", { skill: "Python", excerpt: "Built a Python service" }),
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByText(t("graduate.checkRequirements")));
    expect(screen.getByText(t("graduate.checkHint"))).toBeVisible();
    expect(screen.getByText(t("graduate.summaryOnly"))).toBeVisible();
    expect(screen.queryByRole("button", { name: t("graduate.saveJob") })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.researchContribution") }), {
      target: { value: "implemented the data pipeline" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.researchMethod") }), {
      target: { value: "Python" },
    });
    const createDraft = screen.getByRole("button", { name: t("graduate.researchCreate") });
    expect(createDraft).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: t("graduate.researchConfirm") }));
    fireEvent.click(createDraft);
    expect(
      screen.getByText(
        t("graduate.researchDraft", {
          skill: "Python",
          contribution: "implemented the data pipeline",
          method: "Python",
          outcome: "",
        }),
      ),
    ).toBeVisible();
  });

  it("saves a checked custom job as unverified and links to existing job and resume flows", async () => {
    mocks.rankGraduateJobs.mockImplementation(
      (_profile: unknown, jobs: Array<{ id: string; source_url: string }>) => {
        const custom = jobs.find((item) => item.id.startsWith("CUSTOM-"));
        return Promise.resolve({
          profile_id: profile.id,
          directional_fits: [],
          needs_review: custom
            ? [
                {
                  job_id: custom.id,
                  source_url: custom.source_url,
                  application_status: "unknown",
                  status: "review",
                  reason: "Check requirements",
                  major_fit: false,
                  matched_core: [],
                  matched_preferred: [],
                  matched_evidence: {},
                  rank_score: 0,
                },
              ]
            : [],
          blocked: [],
          expired: [],
          message: "Opening unverified",
        });
      },
    );
    render(
      <MemoryRouter>
        <GraduatePage />
      </MemoryRouter>,
    );
    await screen.findAllByText(profile.name);
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.jobCompany") }), {
      target: { value: "New Employer" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.jobTitle") }), {
      target: { value: "AI Engineer" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.jobCity") }), {
      target: { value: "Shanghai" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.jobSource") }), {
      target: { value: "https://example.org/jobs/2" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: t("graduate.jobConfirm") }));
    fireEvent.click(screen.getByRole("button", { name: t("graduate.jobAdd") }));
    fireEvent.click(screen.getByRole("checkbox", { name: t("graduate.confirm") }));
    fireEvent.click(screen.getByRole("button", { name: t("graduate.rank") }));
    const save = await screen.findByRole("button", { name: t("graduate.saveJob") });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.createJob).toHaveBeenCalledOnce());
    expect(mocks.createJob.mock.calls[0][0]).toMatchObject({
      title: "AI Engineer",
      company: "New Employer",
      status: "待核实",
      source_url: "https://example.org/jobs/2",
    });
    expect(await screen.findByRole("link", { name: t("graduate.openSavedJob") })).toHaveAttribute(
      "href",
      "/jobs?job_id=42",
    );
    expect(screen.getByRole("link", { name: t("graduate.viewJobResumes") })).toHaveAttribute(
      "href",
      "/resumes?job_id=42",
    );
  });

  it("shows which job changed after the user confirms new evidence", async () => {
    const decision = {
      job_id: job.id,
      source_url: job.source_url,
      application_status: "unknown",
      reason: "Needs evidence",
      major_fit: true,
      matched_core: [],
      matched_preferred: [],
      matched_evidence: {},
      rank_score: 0,
    };
    mocks.rankGraduateJobs.mockImplementation((submitted: { evidence: Record<string, string> }) => {
      const confirmedSkill = Boolean(submitted.evidence.ADS);
      return Promise.resolve({
        profile_id: profile.id,
        directional_fits: confirmedSkill
          ? [{ ...decision, status: "directional_fit", matched_core: ["ADS"] }]
          : [],
        needs_review: confirmedSkill ? [] : [{ ...decision, status: "review" }],
        blocked: [],
        expired: [],
        message: "Opening unverified",
      });
    });
    render(
      <MemoryRouter>
        <GraduatePage />
      </MemoryRouter>,
    );
    await screen.findAllByText(profile.name);
    fireEvent.click(screen.getByRole("checkbox", { name: t("graduate.confirm") }));
    fireEvent.click(screen.getByRole("button", { name: t("graduate.rank") }));
    await waitFor(() => expect(mocks.rankGraduateJobs).toHaveBeenCalledTimes(1));
    await screen.findByText("Opening unverified");
    expect(screen.getByText(t("graduate.questionSkill", { skills: "Python" }))).toBeInTheDocument();
    await screen.findByRole("button", { name: new RegExp(t("graduate.rank")) });

    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.skill") }), {
      target: { value: "ADS" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.excerpt") }), {
      target: { value: "Project used ADS" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("graduate.addEvidence") }));
    expect(screen.getByRole("checkbox", { name: t("graduate.confirm") })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: t("graduate.confirm") }));
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(t("graduate.rank")) }));
    await waitFor(() => expect(mocks.rankGraduateJobs).toHaveBeenCalledTimes(2));
    expect(screen.getByText(t("graduate.changedTitle", { count: 1 }))).toBeInTheDocument();
  });

  it("requires a verified https source before ranking a manually added job", async () => {
    render(
      <MemoryRouter>
        <GraduatePage />
      </MemoryRouter>,
    );
    await screen.findAllByText(profile.name);
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.jobCompany") }), {
      target: { value: "New Employer" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.jobTitle") }), {
      target: { value: "AI Engineer" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.jobCity") }), {
      target: { value: "Shanghai" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.jobMajors") }), {
      target: { value: "Computer Science" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.jobSkills") }), {
      target: { value: "Python" },
    });
    const source = screen.getByRole("textbox", { name: t("graduate.jobSource") });
    fireEvent.change(source, { target: { value: "http://example.org/jobs/2" } });
    fireEvent.click(screen.getByRole("checkbox", { name: t("graduate.jobConfirm") }));
    fireEvent.click(screen.getByRole("button", { name: t("graduate.jobAdd") }));
    expect(screen.getByText(t("graduate.jobRequired"))).toBeInTheDocument();
    expect(screen.queryByText("New Employer · AI Engineer · Shanghai")).not.toBeInTheDocument();

    fireEvent.change(source, { target: { value: "https://example.org/jobs/2" } });
    fireEvent.click(screen.getByRole("checkbox", { name: t("graduate.jobConfirm") }));
    fireEvent.click(screen.getByRole("button", { name: t("graduate.jobAdd") }));
    expect(screen.getByText("New Employer · AI Engineer · Shanghai")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: t("graduate.confirm") }));
    fireEvent.click(screen.getByRole("button", { name: t("graduate.rank") }));
    await waitFor(() => expect(mocks.rankGraduateJobs).toHaveBeenCalledOnce());
    const submittedJobs = mocks.rankGraduateJobs.mock.calls[0][1] as Array<{
      source_url: string;
      source_checked_at?: string;
    }>;
    expect(submittedJobs).toHaveLength(2);
    expect(submittedJobs[1].source_url).toBe("https://example.org/jobs/2");
    expect(submittedJobs[1].source_checked_at).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
    expect(
      screen.getByText(
        t("graduate.sourceCheckedAt", { date: submittedJobs[1].source_checked_at ?? "" }),
      ),
    ).toBeInTheDocument();
  });

  it("discards an in-flight ranking if the confirmed profile changes", async () => {
    let resolveRank: (result: unknown) => void = () => undefined;
    mocks.rankGraduateJobs.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRank = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <GraduatePage />
      </MemoryRouter>,
    );
    await screen.findAllByText(profile.name);
    fireEvent.click(screen.getByRole("checkbox", { name: t("graduate.confirm") }));
    fireEvent.click(screen.getByRole("button", { name: t("graduate.rank") }));
    await waitFor(() => expect(mocks.rankGraduateJobs).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.major") }), {
      target: { value: "New major" },
    });
    await act(async () => {
      resolveRank({
        profile_id: profile.id,
        directional_fits: [],
        needs_review: [],
        blocked: [],
        expired: [],
        message: "Stale result",
      });
    });
    expect(screen.queryByText("Stale result")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: t("graduate.confirm") })).not.toBeChecked();
  });

  it("fills a local posting draft but still requires human confirmation", async () => {
    render(
      <MemoryRouter>
        <GraduatePage />
      </MemoryRouter>,
    );
    await screen.findAllByText(profile.name);
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.draftText") }), {
      target: { value: "Company and job requirements pasted from a posting" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("graduate.draftParse") }));
    await waitFor(() => expect(mocks.parseGraduateJobText).toHaveBeenCalledOnce());
    expect(await screen.findByRole("textbox", { name: t("graduate.jobTitle") })).toHaveValue(
      "Draft Engineer",
    );
    expect(screen.getByText("Check the source")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: t("graduate.jobConfirm") })).not.toBeChecked();
    expect(
      screen.queryByText("Draft Employer · Draft Engineer · Shanghai"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: t("graduate.jobConfirm") }));
    fireEvent.click(screen.getByRole("button", { name: t("graduate.jobAdd") }));
    expect(screen.getByText("Draft Employer · Draft Engineer · Shanghai")).toBeInTheDocument();
  });

  it("does not overwrite manual corrections with a late posting draft", async () => {
    let resolveDraft: (value: unknown) => void = () => undefined;
    mocks.parseGraduateJobText.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDraft = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <GraduatePage />
      </MemoryRouter>,
    );
    await screen.findAllByText(profile.name);
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.draftText") }), {
      target: { value: "Company and job requirements pasted from a posting" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("graduate.draftParse") }));
    await waitFor(() => expect(mocks.parseGraduateJobText).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByRole("textbox", { name: t("graduate.jobTitle") }), {
      target: { value: "Manual correction" },
    });
    await act(async () => {
      resolveDraft({ title: "Late draft" });
    });
    expect(screen.getByRole("textbox", { name: t("graduate.jobTitle") })).toHaveValue(
      "Manual correction",
    );
  });
});
