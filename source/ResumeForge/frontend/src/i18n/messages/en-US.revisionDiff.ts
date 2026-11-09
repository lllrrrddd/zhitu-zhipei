// SPDX-License-Identifier: Apache-2.0
/** Resume revision diff (current vs its parent). */

const revisionDiff = {
  "revisionDiff.title": "Changes vs previous version",
  "revisionDiff.loading": "Comparing the two versions…",
  "revisionDiff.error": "Could not load the versions. Try again.",
  "revisionDiff.counts": "{added} added · {removed} removed · {changed} changed",
  "revisionDiff.empty": "No text differences (layout only, perhaps).",
  "revisionDiff.header": "Header",
  "revisionDiff.kind.added": "Added",
  "revisionDiff.kind.removed": "Removed",
  "revisionDiff.kind.changed": "Changed",
  "revisionDiff.entryN": "Entry {index}",
  "revisionDiff.fieldN": "Field {index}",
  "revisionDiff.textN": "Paragraph {index}",
  "revisionDiff.hint":
    "Text fields only; layout and font changes are not shown. Rolling back happens through AI revise / regenerate, not here.",
} as const;

export default revisionDiff;
