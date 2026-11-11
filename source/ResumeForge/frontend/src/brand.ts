// SPDX-License-Identifier: Apache-2.0
/**
 * 品牌信息的**唯一出口**。改名只改语言包里的三行：
 *
 *   zh-CN.appConfig.ts → appConfig.brand.name        （中文名）
 *   en-US.appConfig.ts → appConfig.brand.name        （英文名）
 *   任一语言包         → appConfig.brand.legacyNames （旧名，用来兜底历史文案）
 *
 * 为什么名字放语言包而不是这里：产品名是**文案**，中文棘轮守卫（`cjkRatchet`）
 * 不允许在 `src/` 的代码里新写中文。放在 `i18n/messages/` 既符合规则，也让
 * "改个名"变成改两行字符串，而不是改代码。
 */

import zhAppConfig from "./i18n/messages/zh-CN.appConfig";
import enAppConfig from "./i18n/messages/en-US.appConfig";

type Pack = Record<string, string>;

const zh = zhAppConfig as Pack;
const en = enAppConfig as Pack;

/** 旧名（历史的、开源的、拼音的）：i18n 输出时统一替换成当前品牌名。 */
function readLegacy(pack: Pack): string[] {
  const raw = pack["appConfig.brand.legacyNames"] ?? "";
  return raw
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const BRAND = {
  /** 产品名（中文界面）。 */
  name: zh["appConfig.brand.name"] ?? "",
  /** 产品名（英文界面）。 */
  nameEn: en["appConfig.brand.name"] ?? "",
  /** 旧名集合：改名后仍能识别历史文案里的旧称呼。 */
  legacyNames: Array.from(new Set([...readLegacy(zh), ...readLegacy(en)])),
} as const;

/** 按当前界面语言取产品名。 */
export function brandName(locale: string): string {
  return locale === "en-US" ? BRAND.nameEn : BRAND.name;
}
