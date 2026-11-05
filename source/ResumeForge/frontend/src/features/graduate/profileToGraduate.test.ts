// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import type { Profile } from "../../types";
import { profileToGraduate } from "./profileToGraduate";

describe("profileToGraduate", () => {
  it("uses the highest education and project evidence without inventing a graduation year", () => {
    const profile = {
      name: "Sample",
      target_city: "Shanghai, Nanjing",
      educations: [
        { degree: "Bachelor", major: "Physics", end_date: "2024-06" },
        { degree: "Master", major: "Computer Science", end_date: "" },
      ],
      projects: [
        {
          name: "Retrieval",
          tech_stack: "Python, RAG",
          description: "Built a document search demo",
        },
      ],
      skills: [{ name: "SQL", level: "" }],
    } as Profile;
    const result = profileToGraduate(profile);
    expect(result).toMatchObject({
      degree: "master",
      major: "Computer Science",
      graduation_year: 0,
      target_cities: ["Shanghai", "Nanjing"],
      evidence: {
        Python: "Retrieval: Python, RAG: Built a document search demo",
        RAG: "Retrieval: Python, RAG: Built a document search demo",
      },
    });
    expect(result?.evidence).not.toHaveProperty("SQL");
  });

  it("requires a recognizable degree and major", () => {
    expect(
      profileToGraduate({ educations: [{ degree: "", major: "Chemistry" }] } as Profile),
    ).toBeNull();
  });
});
