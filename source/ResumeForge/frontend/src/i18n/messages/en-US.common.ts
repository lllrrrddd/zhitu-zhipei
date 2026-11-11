// SPDX-License-Identifier: Apache-2.0
const common = {
  "common.action.cancel": "Cancel",
  "common.action.save": "Save",
  "common.action.confirm": "Confirm",
  "common.action.delete": "Delete",
  "common.action.close": "Close",
  "common.action.back": "Back",
  "common.action.refresh": "Reload",
  "common.action.discard": "Discard changes",
  "common.action.keep-editing": "Keep editing",
  "common.action.batchSelect": "Select multiple",
  /** Abort button of every "click once, wait for the result" panel (`AbortButton`). */
  "common.action.stop": "Stop",
  "common.retry": "Retry",
  "common.errorBoundary.title.moduleLoad": "Part of the page code could not be loaded",
  "common.errorBoundary.title.generic": "This page is temporarily unavailable",
  "common.errorBoundary.body.moduleLoad":
    "This usually means the page code could not be fetched: a network blip, the frontend dev server just restarted, or it cached a renamed or moved file. Click Retry first - it fetches the code again. If it still fails, reload the page or restart the frontend dev server (close the window and run start.cmd again).",
  "common.errorBoundary.body.generic":
    "Something went wrong while rendering the interface. Reload the page and try again.",
  "common.errorBoundary.reason": "Reason: {message}",
  "common.required": "Required",
  "common.placeholder.select": "Select",

  // ── Shared interaction components (batch bar / quit app / file drop / loading / detail / row actions / collapsed list) ──
  /** Confirmation action of the quit button and its confirm dialog (`ExitAppButton`). */
  "common.action.more": "More actions",
  "common.action.exit": "Quit",
  /** Accessible name of the batch action bar (`BatchActionBar`). */
  "common.batchBar.aria": "Batch actions",
  /** Selected-item count in the batch action bar. */
  "common.batchBar.selected": "{count} selected",
  /** "Select this page" in card grids: checkbox label, title and accessible name share one key. */
  "common.batchBar.selectPage": "Select this page",
  /** Leave multi-select mode. */
  "common.batchBar.exit": "Exit selection mode",
  /** Batch delete button (`BatchDeleteButton`). */
  "common.batchBar.deleteSelected": "Delete selected",
  /** Title of the quit confirmation. */
  "common.exitApp.title": "Close ZhiTuZhiPei?",
  /** Desktop shell: the only way back is the desktop shortcut. */
  "common.exitApp.confirm.desktop": [
    "This app runs on your own machine: closing it stops the background services, and this window exits.",
    "Your profile, resumes and saved jobs are kept — start it again from the desktop shortcut.",
  ].join("\n"),
  /** Browser: says what stops working right away, and how to get back. */
  "common.exitApp.confirm.browser": [
    "ZhiTuZhiPei runs on your own machine: closing it stops the background services and this page stops working (a refresh will not help).",
    "Your profile, resumes and saved jobs are kept — run start.cmd again to restart.",
    "Only want to close the web page? Just close this tab and the services keep running.",
  ].join("\n"),
  /** Result page title after quitting. */
  "common.exitApp.exited.title": "ZhiTuZhiPei is closed",
  /** Result page body in the desktop shell. */
  "common.exitApp.exited.desktop":
    "The frontend, backend and desktop shell processes have all stopped. To use the app again, start ZhiTuZhiPei from the desktop shortcut.",
  /** Result page body in the browser. */
  "common.exitApp.exited.browser":
    "The frontend and backend processes have stopped, so you can close this tab now. To use the app again, run start.cmd in the project directory.",
  /** Tooltip of the quit button: says what it stops. */
  "common.exitApp.tooltip": "Close the app (stops the local frontend and backend)",
  /** Accessible name of the quit button. */
  "common.exitApp.aria": "Close the app",
  /** Shown when the backend returns no message of its own. */
  "common.exitApp.exiting": "The app is quitting",
  /** Quit failed without a more specific cause. */
  "common.exitApp.failed": "Quit failed. You can also close the backend window directly.",
  /** Quit failed with the API error message. */
  "common.exitApp.failedWithReason": "{message} (you can also close the backend window directly)",
  /** Default hint of the drag overlay (`FileDropZone`). */
  "common.fileDropZone.hint": "Release to import",
  /** Accessible name of a loading state (shared by `LoadingBlock` and `PageSkeleton`). */
  "common.loading.content": "Loading content",
  /** One-line hint when the input reaches its length limit (`MaxLengthHint`). */
  "common.maxLength.reached": "{count}-character limit reached",
  /** Placeholder when a detail drawer has nothing to show (`RecordDetail`). */
  "common.recordDetail.empty": "This record has no further details",
  /** Accessible name of the row "more" button (`RowActions`). */
  "common.rowActions.more": "More actions",
  /** Expand a collapsed list (`useCollapsedList`). */
  "common.collapsedList.expand": "Show all {count}",
  /** Collapse the list again. */
  "common.collapsedList.collapse": "Collapse list",
  /** Consequence sentence of a soft-delete confirmation (row actions and batch delete share it). */
  "common.note.trashRecovery": "It will move to Trash, where you can restore it later.",
  /** Consequence sentence of a hard-delete confirmation (paired with the key above). */
  "common.note.hardDelete": "It will be deleted permanently and cannot be recovered.",
  "auth.logout": "Sign out",
  "auth.login.tabLogin": "Sign in",
  "auth.login.tabRegister": "Register with invite",
  "auth.login.name": "Name",
  "auth.login.namePlaceholder": "What should we call you",
  "auth.login.invite": "Invite code",
  "auth.login.invitePlaceholder": "8-character code",
  "auth.login.email": "Email or phone",
  "auth.login.password": "Password",
  "auth.login.passwordHint": "At least 8 characters",
  "auth.login.submitLogin": "Sign in",
  "auth.login.submitRegister": "Register and continue",
  "auth.login.checking": "Checking your session…",
  "auth.login.brandTag": "Resume to offer",
  "auth.login.hint": "Invite-only build. Each account has its own resumes and jobs; nobody sees anyone else's.",
  "auth.login.requiredInvite": "Invite code is required",
  "auth.login.requiredEmail": "Enter your email or phone",
  "auth.login.requiredPassword": "Password is required",
  "auth.login.failed": "Something went wrong",
  "auth.login.tabReset": "Forgot password",
  "auth.login.resetCode": "Reset code",
  "auth.login.resetCodePlaceholder": "8-digit reset code",
  "auth.login.newPassword": "New password",
  "auth.login.submitReset": "Reset password",
  "auth.login.resetDone": "Password updated. Sign in with the new one.",
  "auth.login.accountPlaceholder": "you@example.com or 13800000000",
  "auth.brand.title": "Turn a resume into interviews",
  "auth.brand.point1": "Resume review: structure, wording, numbers that survive follow-ups",
  "auth.brand.point2": "Job matching: roles that fit your experience, not spray-and-pray",
  "auth.brand.point3": "Application tracking: one record per application",
  "auth.brand.footnote": "Every account keeps its own data; nobody sees anyone else's",
} as const;

export default common;
