// SPDX-License-Identifier: Apache-2.0
/** The module-level API stays usable in React components and ordinary helpers. */
import { brandName, BRAND } from "../brand";
import { getSnapshot } from "./localeStore";
import { translate } from "./messageRegistry";
import type { MessageKey, MessageParams } from "./localeTypes";

export { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./localeTypes";
export type { Locale, MessageKey, MessageParams } from "./localeTypes";
export { translate, registerLanguagePack } from "./messageRegistry";

export function t(key: MessageKey, params?: MessageParams): string {
  return withBrand(translate(getSnapshot().locale, key, params));
}

/**
 * 把文案里的**旧产品名**换成当前品牌名。
 *
 * 历史文案里有十几处直接写了"职途智配"/"ZhiTuZhiPei"，改名时一条条改既漏又啰嗦；
 * 在输出这一层统一替换，改名就只动 `brand.ts` 一个文件。
 * 替换只发生在产品名这一种词上，且要求整词匹配（`ResumeForge` 后面紧跟字母时不换，
 * 避免把代码里的标识符或链接一起改掉）。
 */
function withBrand(text: string): string {
  const target = brandName(getSnapshot().locale);
  let next = text;
  for (const legacy of BRAND.legacyNames) {
    if (legacy === target) continue;
    next = next.split(legacy).join(target);
  }
  return next;
}
