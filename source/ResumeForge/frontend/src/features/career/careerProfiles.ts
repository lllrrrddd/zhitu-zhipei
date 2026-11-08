// SPDX-License-Identifier: Apache-2.0
/**
 * 找岗位用的"匹配档案"：一个人可以有多个方向，也可以临时帮别人匹一次。
 *
 * 为什么不落到后端：`我的资料`是**账号本人**的一份画像，用来生成简历；帮同学/朋友
 * 匹配时把别人的姓名、电话、经历写进本机数据库没有必要，也不好解释。
 * 这里的档案只存在浏览器 localStorage，只服务"找岗位"这一步——关掉浏览器就只剩
 * 这份设备上的数据，不参与简历生成，也不进备份。
 *
 * 与后端"资料方案（组）"的区别：组只是同一份资料的视图分组（组不拥有数据），
 * 而这里每个档案是**完整独立**的一份画像。
 */

import type { CareerProfile } from "./types";

export interface CareerProfileRecord {
  id: string;
  /** 用户可改的名字，默认取岗位方向。 */
  label: string;
  profile: CareerProfile;
  updatedAt: string;
}

export const CAREER_PROFILES_KEY = "rf.career.profiles.v1";
/** 坏数据兜底名。产品文案在 i18n 里，这里只留一个不可翻译的占位。 */
const FALLBACK_LABEL = "-";
export const CAREER_PROFILES_LIMIT = 20;

function isProfile(value: unknown): value is CareerProfile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CareerProfile>;
  return (
    typeof candidate.direction === "string" &&
    Array.isArray(candidate.cities) &&
    Array.isArray(candidate.skills) &&
    Array.isArray(candidate.experience)
  );
}

function normalize(item: unknown): CareerProfileRecord | null {
  if (!item || typeof item !== "object") return null;
  const candidate = item as Partial<CareerProfileRecord>;
  if (typeof candidate.id !== "string" || !candidate.id) return null;
  if (!isProfile(candidate.profile)) return null;
  return {
    id: candidate.id,
    label:
      typeof candidate.label === "string" && candidate.label.trim()
        ? candidate.label
        : FALLBACK_LABEL,
    profile: candidate.profile,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString(),
  };
}

/** 读取档案；坏数据直接丢弃，不让一条脏记录把整页打崩。 */
export function loadRecords(storage: Storage | null): CareerProfileRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(CAREER_PROFILES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalize)
      .filter((item): item is CareerProfileRecord => item !== null)
      .slice(0, CAREER_PROFILES_LIMIT);
  } catch {
    return [];
  }
}

export function saveRecords(storage: Storage | null, records: CareerProfileRecord[]): void {
  if (!storage) return;
  try {
    storage.setItem(CAREER_PROFILES_KEY, JSON.stringify(records.slice(0, CAREER_PROFILES_LIMIT)));
  } catch {
    // 隐私模式/配额满：写不进去也不该打断找岗位，档案只是这台设备上的便利。
  }
}

export function newRecordId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  return `p-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function upsertRecord(
  records: CareerProfileRecord[],
  record: CareerProfileRecord,
): CareerProfileRecord[] {
  const index = records.findIndex((item) => item.id === record.id);
  if (index < 0) return [...records, record].slice(-CAREER_PROFILES_LIMIT);
  const next = [...records];
  next[index] = record;
  return next;
}

export function removeRecord(
  records: CareerProfileRecord[],
  id: string,
): CareerProfileRecord[] {
  return records.filter((item) => item.id !== id);
}

/**
 * 默认名字：有目标岗位就用它，否则用城市，都没有就用调用方给的兜底文案。
 *
 * 兜底文案由组件传进来（`t("career.profiles.untitled")`）——这个模块是纯函数，
 * 不直接引用 i18n，否则语言切换时已存的名字不会跟着变。
 */
export function suggestedLabel(
  profile: CareerProfile,
  index: number,
  untitled: string,
): string {
  const direction = profile.direction.trim();
  if (direction) return direction.slice(0, 24);
  const city = profile.cities.find((item) => item.trim());
  if (city) return `${city.trim()} · ${index}`;
  return `${untitled} ${index}`;
}
