// SPDX-License-Identifier: Apache-2.0
/** Resume health check: one merged list, per-issue state, and a re-check delta. */

const resumeHealth = {
  "resumeHealth.intro.title": "Resume health check",
  "resumeHealth.intro.body":
    "Merges the local ATS check and the risk scan into one list: issues sorted by severity, each marked as handled, and a score change on re-check. Local rules only, no model calls.",
  "resumeHealth.action.run": "Run health check",
  "resumeHealth.action.rerun": "Run again",
  "resumeHealth.action.running": "Checking…",
  "resumeHealth.action.markDone": "Mark fixed",
  "resumeHealth.action.ignore": "Won't fix",
  "resumeHealth.action.undo": "Undo",
  "resumeHealth.action.copy": "Copy tip",
  "resumeHealth.action.copied": "Copied. Apply it in the editor.",
  "resumeHealth.action.copyFailed": "Copy failed. Select the text and copy manually.",
  "resumeHealth.score.label": "Health score",
  "resumeHealth.score.lastAt": "Checked {time}",
  "resumeHealth.open": "{count} open",
  "resumeHealth.delta.change": "{delta} vs last time",
  "resumeHealth.delta.same": "Same score as last time",
  "resumeHealth.delta.previous": "Previous score: {score}",
  "resumeHealth.stale": "The resume changed. Run the check again.",
  "resumeHealth.risk.missing":
    "The risk scan has not run yet. Start it under “Risk scan” and its findings (duplicates, sensitive words, exaggeration) will join this list and the score.",
  "resumeHealth.empty": "No issues found this time.",
  "resumeHealth.error": "Health check failed. Try again later.",
  "resumeHealth.issue.untitled": "(untitled issue)",
  "resumeHealth.state.done": "Fixed",
  "resumeHealth.state.ignored": "Ignored",
  "resumeHealth.quality.category": "Content quality",
  "resumeHealth.quality.ratio": "Quantified {quantified}/{bullets}",
  "resumeHealth.quality.weak": "{count} weak opening verbs",
  "resumeHealth.quality.noNumbers.title": "Few results are quantified: {quantified} of {bullets}",
  "resumeHealth.quality.noNumbers.detail":
    "Recruiters look for results first and duties second. Bullets without numbers are hard to size up.",
  "resumeHealth.quality.noNumbers.suggestion":
    "Add a provable number to each result: data volume, time saved, headcount, percentage gain. If you cannot, the experience lacks evidence — do not invent one.",
  "resumeHealth.quality.weak.title": "{count} bullets open with a weak verb",
  "resumeHealth.quality.weak.detail": "For example: {examples}",
  "resumeHealth.quality.weak.suggestion":
    "Rewrite “responsible for X” as what you did and produced: “cut API latency from 800ms to 300ms”.",
  "resumeHealth.hint":
    "Re-check after editing to refresh the score. Marks and history stay on this device.",
} as const;

export default resumeHealth;
