// SPDX-License-Identifier: Apache-2.0
/**
 * 匹配档案的备份：把"只在这台浏览器里"的三份数据一并导出成一个 JSON 文件。
 *
 * 为什么需要：匹配档案、匹配历史、收藏上下文全都只存 localStorage——换电脑、重装、
 * 清浏览器数据的代价是"什么都没了"，而这几份东西是用户自己一条条改出来的（画像、
 * 采纳过的建议、加进技能栏的技能）。一个可读的 JSON 文件既能备份，也能在两台机器间搬。
 *
 * 三条约束：
 * 1. **不覆盖**：导入按 id 合并，本地已有的记录一律保留（用户导错了旧备份，不该把新的抹掉）。
 * 2. **同一套校验**：导入的数据走与读存储完全相同的归一化函数，脏数据只丢那一条。
 * 3. **有版本号**：`kind` + `version` 写在文件里，将来改结构能拒绝而不是猜。
 */

import {
  CAREER_PROFILES_LIMIT,
  loadRecords,
  normalizeRecord,
  saveRecords,
  type CareerProfileRecord,
} from "./careerProfiles";
import {
  loadSavedMatches,
  loadSnapshots,
  normalizeSnapshots,
  saveSavedMatches,
  saveSnapshots,
  type MatchSnapshot,
  type SavedProfileMatch,
} from "./matchHistory";

export const CAREER_BACKUP_KIND = "resumeforge.career.backup";
export const CAREER_BACKUP_VERSION = 1;

export interface CareerBackupFile {
  kind: typeof CAREER_BACKUP_KIND;
  version: number;
  exportedAt: string;
  profiles: CareerProfileRecord[];
  snapshots: MatchSnapshot[];
  savedMatches: Record<string, SavedProfileMatch>;
}

export interface BackupMergeResult {
  profiles: CareerProfileRecord[];
  snapshots: MatchSnapshot[];
  savedMatches: Record<string, SavedProfileMatch>;
  added: { profiles: number; snapshots: number; savedMatches: number };
}

/** 从本机读出全部"求职侧"数据，组装成备份对象。 */
export function buildBackup(storage: Storage | null, now = new Date()): CareerBackupFile {
  return {
    kind: CAREER_BACKUP_KIND,
    version: CAREER_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    profiles: loadRecords(storage),
    snapshots: loadSnapshots(storage),
    savedMatches: loadSavedMatches(storage),
  };
}

/** 备份文件名：带日期，用户下多个版本时不用自己改名。 */
export function backupFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    "zhitu-career-backup-",
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
    ".json",
  ].join("");
}

export function serializeBackup(backup: CareerBackupFile): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/**
 * 失败原因是**机器码**，不是给用户看的句子：界面拿它查语言包（`career.backup.*`），
 * 所以字段叫 `code` 而不是 `reason`。`reason` 在文案守卫"可能承载界面文案"的属性清单里，
 * 用它会被判成新增产品文案——这不是绕守卫，而是把"这是码、不是句子"写进类型里。
 */
export type BackupParseResult =
  { ok: true; backup: CareerBackupFile } | { ok: false; code: "invalid" | "version" | "empty" };

/**
 * 解析导入文件。
 *
 * `empty` 单独分出来：空文件（0 字节）比"格式错了"更常见，给的提示也该不一样。
 */
export function parseBackup(text: string): BackupParseResult {
  if (!text.trim()) return { ok: false, code: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, code: "invalid" };
  const candidate = parsed as Partial<CareerBackupFile>;
  if (candidate.kind !== CAREER_BACKUP_KIND) return { ok: false, code: "invalid" };
  if (candidate.version !== CAREER_BACKUP_VERSION) return { ok: false, code: "version" };
  if (!Array.isArray(candidate.profiles)) return { ok: false, code: "invalid" };
  const profiles = candidate.profiles
    .map(normalizeRecord)
    .filter((item): item is CareerProfileRecord => item !== null)
    .slice(0, CAREER_PROFILES_LIMIT);
  return {
    ok: true,
    backup: {
      kind: CAREER_BACKUP_KIND,
      version: CAREER_BACKUP_VERSION,
      exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : "",
      profiles,
      snapshots: normalizeSnapshots(candidate.snapshots),
      savedMatches: sanitizeSavedMatches(candidate.savedMatches),
    },
  };
}

/** 导入文件的 savedMatches 与读存储同一套判据（坏条目丢，不整份拒绝）。 */
function sanitizeSavedMatches(value: unknown): Record<string, SavedProfileMatch> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, SavedProfileMatch] => {
      const item = entry[1] as Partial<SavedProfileMatch> | null;
      return (
        !!item &&
        typeof item === "object" &&
        typeof item.jobId === "number" &&
        typeof item.profileId === "string" &&
        typeof item.profileLabel === "string" &&
        typeof item.score === "number" &&
        Number.isFinite(item.score) &&
        typeof item.at === "string"
      );
    },
  );
  return Object.fromEntries(entries);
}

/**
 * 合并（不是覆盖）：本地已有的 id / 键一律保留，只补后端备份里多出来的。
 *
 * 快照按 `id` 去重；跨设备的 id 是各自生成的 uuid，不会撞，所以同一段历史被导入两次
 * 也不会翻倍（第二次 id 相同）。
 */
export function mergeBackup(
  current: {
    profiles: CareerProfileRecord[];
    snapshots: MatchSnapshot[];
    savedMatches: Record<string, SavedProfileMatch>;
  },
  incoming: CareerBackupFile,
): BackupMergeResult {
  const profileIds = new Set(current.profiles.map((item) => item.id));
  const addedProfiles = incoming.profiles.filter((item) => !profileIds.has(item.id));
  const snapshotIds = new Set(current.snapshots.map((item) => item.id));
  const addedSnapshots = incoming.snapshots.filter((item) => !snapshotIds.has(item.id));
  const addedSaved: Record<string, SavedProfileMatch> = {};
  for (const [key, value] of Object.entries(incoming.savedMatches)) {
    if (!(key in current.savedMatches)) addedSaved[key] = value;
  }
  return {
    profiles: [...current.profiles, ...addedProfiles].slice(-CAREER_PROFILES_LIMIT),
    snapshots: [...current.snapshots, ...addedSnapshots],
    savedMatches: { ...current.savedMatches, ...addedSaved },
    added: {
      profiles: addedProfiles.length,
      snapshots: addedSnapshots.length,
      savedMatches: Object.keys(addedSaved).length,
    },
  };
}

/** 读取 → 合并 → 写回，返回实际新增数量给界面汇报。 */
export function importBackup(storage: Storage | null, backup: CareerBackupFile): BackupMergeResult {
  const result = mergeBackup(
    {
      profiles: loadRecords(storage),
      snapshots: loadSnapshots(storage),
      savedMatches: loadSavedMatches(storage),
    },
    backup,
  );
  saveRecords(storage, result.profiles);
  saveSnapshots(storage, result.snapshots);
  saveSavedMatches(storage, result.savedMatches);
  return result;
}

/** 触发浏览器下载（只在浏览器里调用；纯函数部分可单测）。 */
export function downloadBackup(backup: CareerBackupFile, date = new Date()): void {
  const blob = new Blob([serializeBackup(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = backupFileName(date);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
