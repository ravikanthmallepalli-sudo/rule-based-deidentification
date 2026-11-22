// The six PHONE finders R1-R6 and their building blocks: guards (§7), extensions (§9), chains (§2, §5).
// Spec: docs/PHONE_detection_rules.md. Each finder adds candidates to the shared Scan; index.ts resolves them.

import {
  PHONE_DASHES,
  PHONE_EXTENSION_MAX_DIGITS,
  PHONE_LEFT_GUARD_SYMBOLS,
  PHONE_MAX_CHAIN_CHARS,
  PHONE_MAX_GROUPS,
  PHONE_PAREN_GROUP_MAX_DIGITS,
  PHONE_R5_MAX_DIGITS,
  PHONE_R5_MIN_DIGITS,
  PHONE_R6_MAX_DIGITS,
  PHONE_R6_MIN_DIGITS,
  PHONE_SEPARATORS,
  PHONE_SPACE_SEPARATORS,
} from "../../data/phoneData";
import { PHONE_EXTENSION_WORDS } from "../../data/phoneKeywords";
import type { Span } from "../../types";
import {
  charOf,
  codePointAfter,
  codePointBefore,
  escapeForCharClass,
  isAsciiDigit,
  isLetter,
  isUnicodeNumber,
} from "../../unicode";
import { hasContext, hasUrlContext } from "./context";
import { isNanpPart, isValidInternationalNumber } from "./validateNumber";

// A PHONE span also says which tier and finder produced it (§14); `extends Span` = a Span plus these fields.
// `"A" | "B"` is a union of string literals: the tier can only be one of these two strings.
export interface PhoneSpan extends Span {
  tier: "A" | "B";
  rule: "R1" | "R2" | "R3" | "R4" | "R5" | "R6";
}

// Shared state of one `find` call: every finder adds its candidates here.
export interface Scan {
  text: string;
  candidates: PhoneSpan[];
  // Positions of `+` / `00` chains that failed validation (1 = rejected); no other rule may redact their
  // tail (D16). A Uint8Array is a compact array of small numbers.
  rejected: Uint8Array;
}

// ---- Character helpers and guards (§2, §7) ----

const SEP = `[${escapeForCharClass(PHONE_SEPARATORS)}]`; // one separator, as a regex fragment

function isSeparatorAt(text: string, i: number): boolean {
  return i < text.length && PHONE_SEPARATORS.includes(text[i]);
}

function isDigitAt(text: string, i: number): boolean {
  return isAsciiDigit(text.charCodeAt(i));
}

// Letters, digit-like characters (any Unicode number) and `_` glue a number to a word.
function isWordChar(codePoint: number | undefined): boolean {
  return isLetter(codePoint) || isUnicodeNumber(codePoint) || codePoint === 0x5f;
}

// A dash, dot or slash: continues a number when a digit stands on its other side.
function isNumberJoiner(char: string): boolean {
  return PHONE_DASHES.includes(char) || char === "." || char === "/";
}

// The three kinds of left guard (§7.1).
type LeftGuardKind = "plus" | "paren" | "digit";

// Left guard on the character before the candidate (§7.1): "plus" rejects a digit or `+`; "paren" also a symbol
// (# $ € £ ¥ ₹ @ / \) or a dash/dot/slash after a digit; "digit" also a letter, digit-like character or `_`.
function leftGuard(text: string, start: number, kind: LeftGuardKind): boolean {
  const before = codePointBefore(text, start);
  if (isAsciiDigit(before)) return false;
  if (kind === "plus") return before !== 0x2b; // +
  const char = charOf(before);
  if (PHONE_LEFT_GUARD_SYMBOLS.includes(char)) return false;
  if (isNumberJoiner(char) && isAsciiDigit(codePointBefore(text, start - 1))) return false;
  return !(kind === "digit" && isWordChar(before));
}

// Right guard: no letter, digit-like character or `_` after the candidate, and no `.`, `/` or dash
// followed by a digit (§7.2).
function rightGuard(text: string, end: number): boolean {
  const after = codePointAfter(text, end);
  if (isWordChar(after)) return false;
  return !(isNumberJoiner(charOf(after)) && isAsciiDigit(codePointAfter(text, end + 1)));
}

// ---- Extensions (§9) ----

// `;ext=`, or ` , ` (each optional) + extension|extn|ext|x + optional `.`, `:` and spaces; then 1-6 digits.
// `(?![0-9])` = "not followed by a digit".
const EXTENSION = new RegExp(
  `(?:;ext=| ?,? ?(?:${PHONE_EXTENSION_WORDS.join("|")})\\.? ?:? ?)[0-9]{1,${PHONE_EXTENSION_MAX_DIGITS}}(?![0-9])`,
  "yi", // y = sticky (match exactly at lastIndex), i = ignore case
);

// The end of the number after absorbing an extension, unchanged if there is none (§9).
function absorbExtension(text: string, end: number): number {
  EXTENSION.lastIndex = end; // sticky regexes keep state: always set lastIndex first
  const match = EXTENSION.exec(text);
  return match === null ? end : end + match[0].length;
}

// ---- Chains (§2, §5) ----

// A digit group: a run of ASCII digits (`415`) or a parenthesised run of 1-5 digits (`(415)`).
interface Group {
  start: number;
  end: number;
  digits: string;
  isParen: boolean;
}

// A chain: groups joined by at most one separator. `truncated` = it hit a scan cap.
interface Chain {
  groups: Group[];
  end: number;
  truncated: boolean;
}

// Read one group at `pos`, or null (`Group | null` is the return type).
function readGroup(text: string, pos: number, parenAllowed: boolean): Group | null {
  if (isDigitAt(text, pos)) {
    let end = pos;
    while (isDigitAt(text, end)) end += 1;
    return { start: pos, end, digits: text.slice(pos, end), isParen: false };
  }
  if (parenAllowed && text[pos] === "(") {
    let end = pos + 1;
    while (isDigitAt(text, end) && end - pos <= PHONE_PAREN_GROUP_MAX_DIGITS) end += 1;
    const digitCount = end - pos - 1;
    if (digitCount >= 1 && digitCount <= PHONE_PAREN_GROUP_MAX_DIGITS && text[end] === ")") {
      return { start: pos, end: end + 1, digits: text.slice(pos + 1, end), isParen: true };
    }
  }
  return null;
}

// The chain from `first`: groups joined by one separator (none around a parenthesised group, which may only be
// the 1st or 2nd); stops at 10 groups / 48 characters (§2, §5).
function scanChain(text: string, chainStart: number, first: Group): Chain {
  const groups = [first];
  let truncated = false;
  while (true) {
    const last = groups[groups.length - 1];
    const parenAllowed = groups.length < 2;
    let next: Group | null = null; // a group, or null when none follows
    if (isSeparatorAt(text, last.end)) next = readGroup(text, last.end + 1, parenAllowed);
    if (next === null) next = readGroup(text, last.end, parenAllowed);
    if (next === null) break;
    if (groups.length >= PHONE_MAX_GROUPS || next.end - chainStart > PHONE_MAX_CHAIN_CHARS) {
      truncated = true;
      break;
    }
    groups.push(next);
  }
  return { groups, end: groups[groups.length - 1].end, truncated };
}

function digitCount(groups: Group[]): number {
  return groups.reduce((sum, group) => sum + group.digits.length, 0);
}

// A parenthesised `(0)` as 2nd group is the trunk zero: not counted (`+44 (0)20 ...`).
function isTrunkZero(group: Group, index: number): boolean {
  return index === 1 && group.isParen && group.digits === "0";
}

// The index of the last group of the longest group-prefix that validates, or null; groups are never split
// (§6 R1).
function longestValidPrefix(groups: Group[]): number | null {
  for (let last = groups.length - 1; last >= 0; last--) {
    const prefix = groups.slice(0, last + 1);
    const digits = prefix.filter((g, i) => !isTrunkZero(g, i)).map((g) => g.digits).join("");
    if (isValidInternationalNumber(digits, groups[0].digits.length)) return last;
  }
  return null;
}

// ---- The six finders: each scans the whole text and restarts one character after every attempt (§5 step 2) ----

function markRejected(scan: Scan, start: number, end: number): void {
  scan.rejected.fill(1, start, end);
}

// R1 / R2 common part: validate, absorb an extension, check the right guard; returns the end without and with
// the extension, or null (a failed chain is marked rejected, D16).
function validateInternationalChain(
  scan: Scan,
  start: number,
  chain: Chain,
): { numberEnd: number; end: number } | null {
  const last = longestValidPrefix(chain.groups);
  if (last !== null) {
    const numberEnd = chain.groups[last].end;
    const end = absorbExtension(scan.text, numberEnd);
    if (rightGuard(scan.text, end)) return { numberEnd, end };
  }
  markRejected(scan, start, chain.end);
  return null;
}

// R1: `+`-prefixed numbers (Tier A), also `(+44)`; the country code starts with 1-9 (§6 R1).
export function findPlusNumbers(scan: Scan): void {
  const { text } = scan; // destructuring: `text` is scan.text
  for (let i = 0; i < text.length; i++) {
    const parenForm = text[i] === "(" && text[i + 1] === "+";
    if (text[i] !== "+" && !parenForm) continue;
    if (!leftGuard(text, i, "plus")) continue;
    let pos = i + (parenForm ? 2 : 1);
    if (text[pos] === " ") pos += 1;
    const codeGroup = readGroup(text, pos, false);
    if (codeGroup === null || codeGroup.digits[0] === "0") continue;
    let first = codeGroup;
    if (parenForm) {
      if (text[codeGroup.end] !== ")") continue;
      first = { ...codeGroup, end: codeGroup.end + 1, isParen: true }; // `(+44)` acts as one group
    }
    const number = validateInternationalChain(scan, i, scanChain(text, i, first));
    if (number !== null) scan.candidates.push({ type: "PHONE", start: i, end: number.end, tier: "A", rule: "R1" });
  }
}

// R2: `00`-prefixed numbers; Tier A if they contain a non-digit, else Tier B (context needed) (§6 R2).
export function findDoubleZeroNumbers(scan: Scan): void {
  const { text } = scan;
  for (let i = 0; i + 1 < text.length; i++) {
    if (text[i] !== "0" || text[i + 1] !== "0" || !leftGuard(text, i, "digit")) continue;
    let pos = i + 2;
    if (isSeparatorAt(text, pos)) pos += 1;
    const codeGroup = readGroup(text, pos, false);
    if (codeGroup === null || codeGroup.digits[0] === "0") continue;
    const number = validateInternationalChain(scan, i, scanChain(text, i, codeGroup));
    if (number === null) continue;
    const tier = /^[0-9]+$/.test(text.slice(i, number.numberEnd)) ? "B" : "A"; // a bare `00...` run is Tier B
    if (tier === "B" && !hasContext(text, i, number.end)) continue;
    scan.candidates.push({ type: "PHONE", start: i, end: number.end, tier, rule: "R2" });
  }
}

// R3: NANP with a parenthesised area code: [1 [sep]] (AAA) [sep] EEE [sep] LLLL.
const R3_SHAPE = new RegExp(`(1${SEP}?)?\\(([0-9]{3})\\)${SEP}?([0-9]{3})${SEP}?[0-9]{4}`, "y");

export function findParenNanp(scan: Scan): void {
  const { text } = scan;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "(" && text[i] !== "1") continue;
    R3_SHAPE.lastIndex = i;
    const match = R3_SHAPE.exec(text);
    if (match === null) continue;
    const [whole, prefix, area, exchange] = match;
    if (!leftGuard(text, i, prefix === undefined ? "paren" : "digit")) continue;
    if (!isNanpPart(area) || !isNanpPart(exchange)) continue;
    const end = absorbExtension(text, i + whole.length);
    if (rightGuard(text, end)) scan.candidates.push({ type: "PHONE", start: i, end, tier: "A", rule: "R3" });
  }
}

// R4: NANP with separators: [1 sep] AAA sep EEE sep LLLL (separators may differ).
const R4_SHAPE = new RegExp(`(?:1(${SEP}))?([0-9]{3})(${SEP})([0-9]{3})(${SEP})[0-9]{4}`, "y");

function isSpaceSeparator(char: string | undefined): boolean {
  return char !== undefined && PHONE_SPACE_SEPARATORS.includes(char);
}

// R4 space-only exception: a digit group touches the candidate across one space (`100 200 300 4000`).
function touchesDigitGroupAcrossSpace(text: string, start: number, end: number): boolean {
  const before = isSpaceSeparator(text[start - 1]) && isDigitAt(text, start - 2);
  const after = isSpaceSeparator(text[end]) && isDigitAt(text, end + 1);
  return before || after;
}

export function findSeparatedNanp(scan: Scan): void {
  const { text } = scan;
  for (let i = 0; i < text.length; i++) {
    if (!isDigitAt(text, i)) continue;
    R4_SHAPE.lastIndex = i;
    const match = R4_SHAPE.exec(text);
    if (match === null || !leftGuard(text, i, "digit")) continue;
    const [whole, prefixSep, area, sep1, exchange, sep2] = match;
    if (!isNanpPart(area) || !isNanpPart(exchange)) continue;
    const end = absorbExtension(text, i + whole.length);
    if (!rightGuard(text, end)) continue;
    const separators = [prefixSep, sep1, sep2].filter((s) => s !== undefined);
    const spaceOnly = separators.every(isSpaceSeparator);
    if (spaceOnly && touchesDigitGroupAcrossSpace(text, i, end) && !hasContext(text, i, end)) continue;
    scan.candidates.push({ type: "PHONE", start: i, end, tier: "A", rule: "R4" });
  }
}

// R5: (0 + 1-4 digits) [sep] 3-4 digits [[sep] 3-5 digits], 6-9 digits after the parentheses
// (`(020) 7946 0958`).
const R5_SHAPE = new RegExp(`\\(0[0-9]{1,4}\\)${SEP}?([0-9]{3,4})(?:${SEP}?([0-9]{3,5}))?`, "y");

export function findTrunkPrefixed(scan: Scan): void {
  const { text } = scan;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "(") continue;
    R5_SHAPE.lastIndex = i;
    const match = R5_SHAPE.exec(text);
    if (match === null || !leftGuard(text, i, "paren")) continue;
    const [whole, firstPart, secondPart] = match;
    const digits = firstPart.length + (secondPart ?? "").length; // `??` = use "" when undefined
    if (digits < PHONE_R5_MIN_DIGITS || digits > PHONE_R5_MAX_DIGITS) continue;
    const end = absorbExtension(text, i + whole.length);
    if (rightGuard(text, end)) scan.candidates.push({ type: "PHONE", start: i, end, tier: "A", rule: "R5" });
  }
}

// R6 excluded shapes: they belong to other entities (SSN, IPv4, ISO and day-first dates).
const DASH = `[${escapeForCharClass(PHONE_DASHES)}]`;
const R6_EXCLUDED_SHAPES: RegExp[] = [
  new RegExp(`^[0-9]{3}${DASH}[0-9]{2}${DASH}[0-9]{4}$`, "u"), // SSN ddd-dd-dddd
  /^[0-9]{1,3}(?:\.[0-9]{1,3}){3}$/, // IPv4
  new RegExp(`^[0-9]{4}(?:${DASH}|\\.)[0-9]{1,2}(?:${DASH}|\\.)[0-9]{1,2}$`, "u"), // ISO date
  new RegExp(`^[0-9]{1,2}(?:${DASH}|\\.)[0-9]{1,2}(?:${DASH}|\\.)[0-9]{2,4}$`, "u"), // day-first date
];

// R6: any chain of 7-15 digits (Tier B), not truncated and not an excluded shape, with a phone word
// before or after it or a URL context (§6 R6).
export function findContextChains(scan: Scan): void {
  const { text } = scan;
  for (let i = 0; i < text.length; i++) {
    if (!isDigitAt(text, i) && text[i] !== "(") continue;
    const urlContext = hasUrlContext(text, i);
    if (!urlContext && !leftGuard(text, i, "digit")) continue; // URL context bypasses the guard
    const first = readGroup(text, i, true);
    if (first === null) continue;
    const chain = scanChain(text, i, first);
    const digits = digitCount(chain.groups);
    if (chain.truncated || digits < PHONE_R6_MIN_DIGITS || digits > PHONE_R6_MAX_DIGITS) continue;
    const chainText = text.slice(i, chain.end);
    if (R6_EXCLUDED_SHAPES.some((shape) => shape.test(chainText))) continue;
    const end = absorbExtension(text, chain.end);
    if (!rightGuard(text, end)) continue;
    if (!urlContext && !hasContext(text, i, end)) continue;
    scan.candidates.push({ type: "PHONE", start: i, end, tier: "B", rule: "R6" });
  }
}
