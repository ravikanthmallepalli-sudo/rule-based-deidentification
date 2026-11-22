// EMAIL detector: addresses such as `john.doe+tag@sub.example.co.uk`, Unicode, quoted and IPv4-literal forms.
// Spec: docs/EMAIL_detection_rules.md (§ = section, L = row in the Limitations table, §8).
// Top limitations:
//   obfuscated addresses (`john (at) example (dot) com`) are not detected (L1);
//   single-label domains (`user@localhost`) are not detected (L4);
//   the TLD is checked by syntax only, so `john@example.abc` is redacted (L8).

import {
  DOMAIN_MAX_LENGTH,
  FILE_EXTENSION_DENY_LIST,
  LABEL_MAX_LENGTH,
  LOCAL_PART_MAX_LENGTH,
  LOCAL_PART_SCAN_LIMIT,
  LOCAL_PART_SYMBOLS,
  QUOTED_SEARCH_LIMIT,
  TLD_MIN_LENGTH,
} from "../data/emailData";
import type { Detector, Span } from "../types";
import { charOf, codePointAfter, codePointBefore, codeUnitLength, escapeForCharClass, isLineBreak } from "../unicode";

// A character of an unquoted local part: letter, mark, digit or one of _ . % + ' - (D4).
const LOCAL_PART_CHAR = new RegExp(`^[\\p{L}\\p{M}\\p{N}${escapeForCharClass(LOCAL_PART_SYMBOLS)}]$`, "u");
// The first character of a local part must be a letter, digit or `_` (§5.1 step 2).
const LOCAL_PART_FIRST_CHAR = /^[\p{L}\p{N}_]/u;
// A character of a domain label: letter, mark, digit or `-` (§5.3). No `_`.
const LABEL_CHAR = /^[\p{L}\p{M}\p{N}-]$/u;
// A top-level domain: letters only, any script (§5.3) ...
const TLD_LETTERS = /^\p{L}[\p{L}\p{M}]*$/u;
// ... or a punycode label: `xn--` followed by 2-59 of a-z, 0-9, `-`.
const TLD_PUNYCODE = /^xn--[a-z0-9-]{2,59}$/i;
// An IPv4 literal domain `[d.d.d.d]` (§5.3, D6), matched at one position (`y` = sticky).
const IPV4_LITERAL = /\[([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\]/y;

function isLocalPartChar(codePoint: number | undefined): boolean {
  return LOCAL_PART_CHAR.test(charOf(codePoint));
}

function isLabelChar(codePoint: number | undefined): boolean {
  return LABEL_CHAR.test(charOf(codePoint));
}

// Length in code points (an emoji or astral letter counts once).
function codePointLength(value: string): number {
  return Array.from(value).length;
}

// The opening quote of a quoted local part `"..."@` (one line, 1-64 characters), or null (§5.2).
// `number | null` is the return type: a number, or null.
function findQuotedLocalPartStart(text: string, at: number): number | null {
  const closingQuote = at - 1;
  const searchFrom = Math.max(0, at - QUOTED_SEARCH_LIMIT);
  for (let i = closingQuote - 1; i >= searchFrom; i--) {
    const char = text.charCodeAt(i);
    if (isLineBreak(char)) return null;
    if (text[i] === '"') {
      const contentLength = closingQuote - i - 1;
      return contentLength >= 1 && contentLength <= LOCAL_PART_MAX_LENGTH ? i : null;
    }
  }
  return null;
}

// The start of an unquoted local part, scanning back from `@` but never before `previousEnd`, or null
// (§5.1, D10).
function findUnquotedLocalPartStart(text: string, at: number, previousEnd: number): number | null {
  // Step 1: backward scan over local-part characters.
  let start = at;
  let scanned = 0;
  while (scanned < LOCAL_PART_SCAN_LIMIT && start > previousEnd) {
    const codePoint = codePointBefore(text, start);
    if (!isLocalPartChar(codePoint)) break;
    start -= codeUnitLength(codePoint as number); // `as number`: isLocalPartChar proved it is defined
    scanned += 1;
  }
  if (start < previousEnd) return null; // a surrogate pair straddling the previous match

  // Step 2: trim leading characters until the first is a letter, digit or `_`.
  // Step 3: keep only the part after the last `..` (and trim again).
  let local = trimLeadingJunk(text.slice(start, at));
  const lastDoubleDot = local.lastIndexOf("..");
  if (lastDoubleDot !== -1) local = trimLeadingJunk(local.slice(lastDoubleDot + 2));

  // Step 4: reject empty, ending with `.` or `'`, or longer than 64 characters.
  if (local === "" || local.endsWith(".") || local.endsWith("'")) return null;
  if (codePointLength(local) > LOCAL_PART_MAX_LENGTH) return null;
  return at - local.length;
}

// Drop leading `. % + ' -` so they stay outside the span (§5.1 step 2).
function trimLeadingJunk(local: string): string {
  let result = local;
  while (result !== "" && !LOCAL_PART_FIRST_CHAR.test(result)) {
    result = result.slice(codeUnitLength(result.codePointAt(0) as number));
  }
  return result;
}

// The start of the address for the `@` at index `at`, or null (§4 step 2.1).
function findLocalPartStart(text: string, at: number, previousEnd: number): number | null {
  if (text[at - 1] === '"') {
    // A quoted local part may enclose an earlier address (`"a@b.com"@example.com`).
    const quoteStart = findQuotedLocalPartStart(text, at);
    if (quoteStart !== null) return quoteStart;
  }
  return findUnquotedLocalPartStart(text, at, previousEnd);
}

// The end of an IPv4 literal `[192.168.1.1]` (octets 0-255), or null (§5.3).
function findIpv4LiteralEnd(text: string, from: number): number | null {
  IPV4_LITERAL.lastIndex = from; // sticky regexes keep state: always set lastIndex first
  const match = IPV4_LITERAL.exec(text);
  if (match === null) return null;
  const octets = match.slice(1, 5);
  return octets.every((octet) => Number(octet) <= 255) ? from + match[0].length : null;
}

// Read the dot-joined domain labels from `from` (a final period stays outside); null if too long (§5.3).
// The return type `{ labels: string[]; end: number } | null` is an object with two fields, or null.
function readLabels(text: string, from: number): { labels: string[]; end: number } | null {
  const labels: string[] = [];
  let labelStart = from;
  let i = from;
  while (true) {
    if (i - from > DOMAIN_MAX_LENGTH) return null; // bounded forward scan (253)
    const codePoint = codePointAfter(text, i);
    if (isLabelChar(codePoint)) {
      i += codeUnitLength(codePoint as number);
    } else if (codePoint === 0x2e && i > labelStart && isLabelChar(codePointAfter(text, i + 1))) {
      labels.push(text.slice(labelStart, i)); // a dot followed by a label character
      i += 1;
      labelStart = i;
    } else {
      break;
    }
  }
  labels.push(text.slice(labelStart, i));
  return { labels, end: i };
}

// Domain rules: two or more labels, label length and hyphens, TLD by syntax, not a file extension (§5.3, §5.4).
function isValidDomain(labels: string[]): boolean {
  if (labels.length < 2) return false; // D7: `user@localhost` is not an address
  for (const label of labels) {
    const length = codePointLength(label);
    if (length < 1 || length > LABEL_MAX_LENGTH) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
  }
  const tld = labels[labels.length - 1];
  const tldBySyntax =
    (TLD_LETTERS.test(tld) && codePointLength(tld) >= TLD_MIN_LENGTH) || TLD_PUNYCODE.test(tld);
  return tldBySyntax && !FILE_EXTENSION_DENY_LIST.includes(tld.toLowerCase());
}

// The end of the domain after the `@` at index `at`, or null (§4 step 2.2).
function findDomainEnd(text: string, at: number): number | null {
  const from = at + 1;
  if (text[from] === "[") return findIpv4LiteralEnd(text, from);
  const domain = readLabels(text, from);
  if (domain === null || !isValidDomain(domain.labels)) return null;
  return domain.end;
}

// Right guard: an underscore right after the domain rejects the candidate (§5.5).
function failsRightGuard(text: string, end: number): boolean {
  return text[end] === "_";
}

// Keep non-overlapping spans: sort by start, longest first; keep those after the last kept one (§4 step 3).
function keepNonOverlapping(candidates: Span[]): Span[] {
  const sorted = [...candidates].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Span[] = [];
  for (const span of sorted) {
    const last = kept[kept.length - 1];
    if (last === undefined || span.start >= last.end) kept.push(span);
  }
  return kept;
}

// Find every address: for each `@`, left to right: local part, domain, right guard (§4).
function findEmails(text: string): Span[] {
  const candidates: Span[] = [];
  let previousEnd = 0;
  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", at + 1)) {
    const start = findLocalPartStart(text, at, previousEnd);
    if (start === null) continue;
    const end = findDomainEnd(text, at);
    if (end === null || failsRightGuard(text, end)) continue;
    candidates.push({ type: "EMAIL", start, end });
    previousEnd = end;
  }
  return keepNonOverlapping(candidates);
}

export const emailDetector: Detector = { type: "EMAIL", find: findEmails };
