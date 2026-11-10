// SPDX-License-Identifier: Apache-2.0
/** Resume revision diff (current vs its parent). */

const revisionDiff = {
  "revisionDiff.title": "Edit history",
  "revisionDiff.noParent": "This is the first save, so there is nothing to compare against.",
  "revisionDiff.loading": "Comparing the two versions…",
  "revisionDiff.error": "Could not load the versions. Try again.",
  "revisionDiff.counts": "{added} added · {removed} removed · {changed} changed",
  "revisionDiff.empty": "No text differences (layout only, perhaps).",
  "revisionDiff.header": "Header",
  "revisionDiff.kind.added": "Added",
  "revisionDiff.kind.removed": "Removed",
  "revisionDiff.kind.changed": "Changed",
  "revisionDiff.base.label": "Compare against",
  "revisionDiff.base.option": "Save −{generation} · {title} · {time}",
  "revisionDiff.base.untitled": "Untitled version",
  "revisionDiff.extend": "Go one save further back",
  "revisionDiff.extendNone": "Already the earliest save",
  "revisionDiff.namedHint":
    "To compare any two named snapshots (or restore one), use the Versions panel in the workbench: those snapshots are taken manually and can be compared or restored.",
  "revisionDiff.entryN": "Entry {index}",
  "revisionDiff.fieldN": "Field {index}",
  "revisionDiff.textN": "Paragraph {index}",
  "revisionDiff.hint":
    "Text fields only; layout and font changes are not shown. Rolling back happens through AI revise / regenerate, not here.",
} as const;

export default revisionDiff;
