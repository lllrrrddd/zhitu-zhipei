// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import { propertyName } from "./productCopyReferences";

/** These are UI contracts, not a language or spelling heuristic. */
export const COPY_PROPERTIES: ReadonlySet<string> = new Set([
  "label",
  "title",
  "subtitle",
  "heading",
  "description",
  "placeholder",
  "tooltip",
  "help",
  "extra",
  "content",
  "children",
  "message",
  "reason",
  "action",
  "body",
  "summary",
  "emptyText",
  "loadingText",
  "okText",
  "cancelText",
  "confirmText",
  "retryLabel",
  "ariaLabel",
  "aria-label",
  "aria-description",
  "alt",
  "__html",
]);

const TECHNICAL_PROPERTIES = new Set(["style", "styles", "className", "classNames", "css"]);
const NOTIFICATION_METHODS = new Set([
  "success",
  "error",
  "warning",
  "warn",
  "info",
  "loading",
  "open",
  "confirm",
]);
const NAMESPACE_TRANSLATION_HELPERS = new Set(["at", "bt", "ot", "pt", "rt"]);

function accessParts(expression: ts.Expression): string[] {
  if (ts.isIdentifier(expression)) return [expression.text];
  if (ts.isPropertyAccessExpression(expression)) {
    return [...accessParts(expression.expression), expression.name.text];
  }
  if (ts.isElementAccessExpression(expression)) {
    const argument = expression.argumentExpression;
    return [
      ...accessParts(expression.expression),
      argument && ts.isStringLiteralLike(argument) ? argument.text : "*",
    ];
  }
  return [];
}

/** Message APIs, user-facing errors and browser dialogs consume their first argument. */
export function isCopyCall(expression: ts.Expression, construct = false): boolean {
  const parts = accessParts(expression);
  const last = parts[parts.length - 1] ?? "";
  if (construct) return /^(?:Error|TypeError|RangeError|ApiError|Notification)$/.test(last);
  if (parts.length === 1) {
    return /^(?:alert|confirm|prompt|setError|setErrorMessage|setSuccessMessage)$/.test(last);
  }
  const receiver = parts[parts.length - 2] ?? "";
  return (
    /^(?:message|notification|modal|toast)(?:Api)?$/i.test(receiver) &&
    (last === "*" || NOTIFICATION_METHODS.has(last))
  );
}

export function isTranslationCall(expression: ts.Expression): boolean {
  const parts = accessParts(expression);
  const name = parts[parts.length - 1];
  if (name === "t" || name === "translate") return true;
  // Namespace helpers are thin wrappers around module-level t(). Their first
  // argument is a compile-time message key, never product copy.
  return parts.length === 1 && NAMESPACE_TRANSLATION_HELPERS.has(name ?? "");
}

/**
 * 后端排版角色的**枚举值**（与 `backend/app/services/resume/resume_style_schema.ROLES`
 * 及前端 `features/resume-layout/styleCatalog.ts` 的 `RESUME_ROLES` 逐字相等的五值全集）。
 *
 * 为什么排除它们：`textLevels.ts` 的 `FIELD_PATH_SCOPE`（`data-resume-path` 叶子 →
 * 作用范围角色）这类映射表里，`description: "body"` / `summary: "body"` 的右侧值是
 * **发给后端 schema 的技术标识**（该纸面字段属于哪个段落角色），不是界面文案。
 * 但 `description` / `summary` 恰好都在 COPY_PROPERTIES 清单里，扫描器按属性名判
 * copy 语境就会把这两行误报成"新增界面文案"；而同表的 `achievements: "body"` 等
 * 行又因属性名不在清单而不被判——只有个别行触发棘轮的不对称正源于此。
 *
 * 豁免用**值的全等集合匹配**（右侧字符串字面量精确等于五个角色之一，且它必须是
 * COPY_PROPERTIES 属性的赋值），不放宽成"短 ASCII 字符串"之类模糊规则：真正的
 * 产品文案几乎不可能是这几个词本身，而 JSX 属性（`title="body"`）与其它语境不受影响。
 */
const RESUME_ROLE_VALUES: ReadonlySet<string> = new Set([
  "name",
  "section_title",
  "entry_title",
  "body",
  "meta",
]);

/** CSS/script bodies and console payloads are technical even if a field is named title. */
export function isTechnicalContext(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isStringLiteralLike(current) &&
      RESUME_ROLE_VALUES.has(current.text) &&
      ts.isPropertyAssignment(current.parent) &&
      COPY_PROPERTIES.has(propertyName(current.parent.name) ?? "")
    ) {
      return true;
    }
    if (ts.isJsxAttribute(current) && TECHNICAL_PROPERTIES.has(current.name.getText())) return true;
    if (
      ts.isVariableDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      current.initializer &&
      ts.isObjectLiteralExpression(current.initializer) &&
      /^(?:styles?|css)$|(?:Styles?|CSS)$/.test(current.name.text)
    ) {
      return true;
    }
    if (ts.isPropertyAssignment(current)) {
      const name = propertyName(current.name);
      if (name && TECHNICAL_PROPERTIES.has(name)) return true;
    }
    if (ts.isJsxElement(current)) {
      const tag = current.openingElement.tagName.getText();
      if (tag === "style" || tag === "script") return true;
    }
    if (ts.isCallExpression(current)) {
      if (accessParts(current.expression)[0] === "console") return true;
      if (isTranslationCall(current.expression)) return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * 形如 `editor.field.school` 的 locale key：全小写开头、点分或连字符分段、无空格。
 *
 * 这类字符串是**指向语言包的引用**，本身不是要显示给用户的文案。不排除它们，
 * 从字面量改写成 key 的迁移会被判成"新增产品文案"——2026-10-27 迁 `profileText`
 * 的三张字段表时就是这样撞上的：值换成了 `editor.field.xxx`，指纹反而多出两条。
 */
const LOCALE_KEY = /^[a-z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)+$/;

export function hasCopyText(value: string): boolean {
  if (LOCALE_KEY.test(value.trim())) return false;
  return /[\p{L}\p{N}]/u.test(value);
}

/** 汉字（含扩展 A）：用来把"像数据值的中文键"与 `label: "name"` 这类 ASCII 键分开。 */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;

/**
 * 同一文件里被当作**对象键**的中文串 = 落库的数据值（协议值）。
 *
 * 为什么需要这条：`types/job.ts` 的 `JOB_STATUS_META` 是「数据值 → 展示名 + 颜色」表，
 * 形如 `待核实: { label: "待核实", color: "gold" }`。`label` 在 COPY_PROPERTIES 里，
 * 于是右侧那个 **回显数据值** 的字面量被判成"新增界面文案"；可它一个字都不能翻——
 * 它就是后端 `JOB_STATUS_UNVERIFIED` 的中文值，翻了界面就和数据对不上。
 *
 * 判据是**值的全等集合匹配 + 该串在本文件里确实是对象键**，不是"看着像中文就放过"：
 * - 真正的新文案不会碰巧和一个对象键逐字相同（真相同反而是同一份数据复用了同一串，
 *   依然不是"新文案"）；
 * - 只认含汉字的键。`label: "name"` 这种 ASCII 值仍走原有逻辑（`RESUME_ROLE_VALUES`
 *   已经覆盖排版角色枚举），不放宽成"任何键都能豁免"。
 */
export function collectDataValueKeys(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const keys = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name && CJK.test(name)) keys.add(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return keys;
}
