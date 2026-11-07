// SPDX-License-Identifier: Apache-2.0
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { t } from "../i18n";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const MAX_CAREER_PDF_BYTES = 15 * 1024 * 1024;
const MAX_CAREER_PDF_PAGES = 40;
const MAX_CAREER_PDF_TEXT = 100_000;

export interface PdfResumeText {
  text: string;
  pages: number;
  blankPages: number;
  truncated: boolean;
}

/** Extract a large resume's text locally; the PDF bytes never enter the API request. */
export async function readPdfResumeText(file: File): Promise<PdfResumeText> {
  if (file.size > MAX_CAREER_PDF_BYTES) {
    throw new Error(t("career.resume.pdfTooLarge"));
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await task.promise;
    if (document.numPages > MAX_CAREER_PDF_PAGES) {
      throw new Error(t("career.resume.pdfTooManyPages"));
    }
    const parts: string[] = [];
    let blankPages = 0;
    let chars = 0;
    let truncated = false;
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      try {
        const content = await page.getTextContent();
        const lines: string[] = [];
        let line = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          line += `${item.str} `;
          if (item.hasEOL) {
            lines.push(line.trim());
            line = "";
          }
        }
        if (line.trim()) lines.push(line.trim());
        const pageText = lines.filter(Boolean).join("\n");
        if (!pageText) blankPages += 1;
        if (!pageText) continue;
        const separator = parts.length ? 2 : 0;
        if (chars + separator + pageText.length > MAX_CAREER_PDF_TEXT) {
          const remaining = MAX_CAREER_PDF_TEXT - chars - separator;
          if (remaining > 0) parts.push(pageText.slice(0, remaining));
          truncated = true;
          break;
        }
        parts.push(pageText);
        chars += separator + pageText.length;
      } finally {
        page.cleanup();
      }
    }
    const text = parts.join("\n\n");
    if (!text.trim()) {
      throw new Error(t("career.resume.pdfNoText"));
    }
    return { text, pages: document.numPages, blankPages, truncated };
  } finally {
    await task.destroy();
  }
}
