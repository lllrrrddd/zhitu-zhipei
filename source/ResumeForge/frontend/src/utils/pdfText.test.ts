// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pages: [] as string[][],
  cleanup: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: state.pages.length,
      getPage: async (index: number) => ({
        getTextContent: async () => ({
          items: state.pages[index - 1].map((str) => ({ str, hasEOL: true })),
        }),
        cleanup: state.cleanup,
      }),
    }),
    destroy: state.destroy,
  }),
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker" }));

import { readPdfResumeText } from "./pdfText";

beforeEach(() => {
  state.pages = [];
  state.cleanup.mockReset();
  state.destroy.mockReset();
});

it("reads text pages and reports scan-like pages without sending bytes", async () => {
  state.pages = [["教育背景", "甲大学 数据科学 本科"], [], ["项目经历", "数据平台"]];
  const result = await readPdfResumeText(new File(["%PDF"], "resume.pdf"));
  expect(result).toEqual({
    text: "教育背景\n甲大学 数据科学 本科\n\n项目经历\n数据平台",
    pages: 3,
    blankPages: 1,
    truncated: false,
  });
  expect(state.cleanup).toHaveBeenCalledTimes(3);
  expect(state.destroy).toHaveBeenCalledTimes(1);
});

it("rejects image-only PDFs and still closes the worker", async () => {
  state.pages = [[], []];
  await expect(readPdfResumeText(new File(["%PDF"], "scan.pdf"))).rejects.toThrow();
  expect(state.destroy).toHaveBeenCalledTimes(1);
});

it("keeps page separators within the API text limit", async () => {
  state.pages = [["甲".repeat(99_999)], ["乙".repeat(20)]];
  const result = await readPdfResumeText(new File(["%PDF"], "long.pdf"));
  expect(result.text.length).toBeLessThanOrEqual(100_000);
  expect(result.truncated).toBe(true);
});
