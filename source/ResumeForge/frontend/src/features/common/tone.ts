// SPDX-License-Identifier: Apache-2.0
/**
 * 名字 → 三档色调（0/1/2）。
 *
 * 列表里的首字色块需要一个稳定的颜色：同一个公司/来源，每次打开都该是同一个颜色，
 * 否则"靠颜色记位置"这件事就失效了。所以用名字本身累加取模，**不用随机、不用下标**。
 *
 * 只给三档：再多就变成彩虹，反而更难扫。
 */
export function toneOf(name: string): number {
  let sum = 0;
  for (const char of name) sum += char.codePointAt(0) ?? 0;
  return sum % 3;
}
