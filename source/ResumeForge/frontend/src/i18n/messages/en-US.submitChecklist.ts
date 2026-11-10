// SPDX-License-Identifier: Apache-2.0
/** Pre-submission checklist: auto checks plus six things only the user can confirm. */

const submitChecklist = {
  "submitChecklist.title": "Pre-submission check",
  "submitChecklist.loading": "Reading the job requirements…",
  "submitChecklist.error": "Could not load the job or run the check. Try again.",
  "submitChecklist.retry": "Retry",
  "submitChecklist.refresh": "Run again",
  "submitChecklist.noJob":
    "This resume is not linked to a job, and the check needs a specific posting.",
  "submitChecklist.progress": "{done}/{total} confirmed",
  "submitChecklist.auto.title": "Checked for you",
  "submitChecklist.auto.coverage.line": "Keyword coverage {matched}/{total}",
  "submitChecklist.auto.coverage.missing": "Not mentioned yet: {values}",
  "submitChecklist.auto.coverage.none":
    "No recognisable keywords in the requirements, so this one needs a human read.",
  "submitChecklist.auto.issues.line": "{count} high-severity issues",
  "submitChecklist.auto.issues.hint":
    "Details and suggestions live in the ATS check and Risk scan tabs.",
  "submitChecklist.manual.title": "Only you can confirm",
  "submitChecklist.manual.contact":
    "Phone and email actually work, and the resume lists the ones you check daily",
  "submitChecklist.manual.names":
    "Right company and right posting (same-name companies have many similar roles)",
  "submitChecklist.manual.file":
    "File name follows convention (name-role-school), not “resume-final-2”",
  "submitChecklist.manual.pages":
    "Two pages at most, and the export does not split an entry across pages",
  "submitChecklist.manual.location": "City, start date and salary range all work for you",
  "submitChecklist.manual.truth":
    "Every number and claim survives a follow-up question (that is where interviews start)",
  "submitChecklist.healthNote":
    "Last health check scored {score}. If it is low, edit before applying — it improves your hit rate.",
  "submitChecklist.copy": "Copy checklist",
  "submitChecklist.copy.title": "Pre-submission check · {job}",
  "submitChecklist.copy.footer": "Last health check: {score}.",
  "submitChecklist.copied": "Copied. Paste it into your notes and tick items off.",
  "submitChecklist.copyFailed": "Copy failed. Select the text manually.",
  "submitChecklist.hint":
    "Ticks stay on this device; the automatic part uses local rules and does not predict any company's ATS outcome.",
} as const;

export default submitChecklist;
