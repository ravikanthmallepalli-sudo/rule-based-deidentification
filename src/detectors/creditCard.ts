// CREDIT_CARD detector: 12-19 digits, bare or grouped by single spaces or hyphens, passing the Luhn check.
// Spec: docs/CREDIT_CARD_detection_rules.md (§ = section, L = row in the Limitations table, §8).
// Top limitations:
//   a card number with a typo fails Luhn and leaks (L1);
//   any Luhn-valid 12-19 digit number (timestamp, ISBN, ID) is redacted, about 1 in 10 (L5);
//   dots, double spaces and newlines are not separators, so `4111.1111.1111.1111` leaks (L3).

import {
  CARD_INNER_GROUP_MAX,
  CARD_INNER_GROUP_MIN,
  CARD_LAST_GROUP_MAX,
  CARD_LAST_GROUP_MIN,
  CARD_MAX_DIGITS,
  CARD_MIN_DIGITS,
  CARD_SEPARATORS,
} from "../data/creditCardData";
import { luhn } from "../luhn";
import type { Detector, Span } from "../types";
import { codePointAfter, codePointBefore, isAsciiDigit, isLetterLike } from "../unicode";

// A maximal run of ASCII digits: text.slice(start, end).
// An `interface` describes the shape of an object: here two numbers.
interface DigitRun {
  start: number;
  end: number;
}

// A chain: digit runs joined by exactly one separator character between neighbours.
type Chain = DigitRun[]; // `type` gives an existing type a new, more readable name

// All maximal runs of ASCII digits, left to right.
// `text: string` is a parameter type; `: DigitRun[]` (an array of DigitRun) is the return type.
function findDigitRuns(text: string): DigitRun[] {
  const runs: DigitRun[] = [];
  for (const match of text.matchAll(/[0-9]+/g)) {
    runs.push({ start: match.index, end: match.index + match[0].length });
  }
  return runs;
}

// Group the runs into chains: neighbouring runs separated by exactly one space or hyphen (§5.1).
function findChains(text: string, runs: DigitRun[]): Chain[] {
  const chains: Chain[] = [];
  let current: Chain = [];
  for (const run of runs) {
    const previous = current[current.length - 1];
    const joined =
      previous !== undefined &&
      run.start - previous.end === 1 &&
      CARD_SEPARATORS.includes(text[previous.end]);
    if (!joined && current.length > 0) {
      chains.push(current);
      current = [];
    }
    current.push(run);
  }
  if (current.length > 0) chains.push(current);
  return chains;
}

// Left guard: no letter, number, mark, `_` or `+` before the card, and no `.` after a digit (§5.3).
function leftGuard(text: string, start: number): boolean {
  const before = codePointBefore(text, start);
  if (isLetterLike(before) || before === 0x2b /* + */) return false;
  if (before === 0x2e /* . */ && isAsciiDigit(codePointBefore(text, start - 1))) return false;
  return true;
}

// Right guard: no letter, number, mark or `_` after the card, and no `.` followed by a digit (§5.3).
function rightGuard(text: string, end: number): boolean {
  const after = codePointAfter(text, end);
  if (isLetterLike(after)) return false;
  if (after === 0x2e /* . */ && isAsciiDigit(codePointAfter(text, end + 1))) return false;
  return true;
}

// Card-like layout: one group, or groups of 4-8 digits with a last group of 1-8 (§5.2).
function hasCardLayout(groupLengths: number[]): boolean {
  if (groupLengths.length === 1) return true; // the 12-19 total is checked separately
  const last = groupLengths[groupLengths.length - 1];
  const inner = groupLengths.slice(0, -1);
  return (
    inner.every((n) => n >= CARD_INNER_GROUP_MIN && n <= CARD_INNER_GROUP_MAX) &&
    last >= CARD_LAST_GROUP_MIN &&
    last <= CARD_LAST_GROUP_MAX
  );
}

// Sanity rules: the first digit is not 0, and not all digits are the same (§5.5).
function passesSanityRules(digits: string): boolean {
  return digits[0] !== "0" && !/^(\d)\1*$/.test(digits);
}

// Accept the window of groups first..last: digit count, layout, guards, sanity rules, Luhn (§4 step 6).
function acceptWindow(text: string, chain: Chain, first: number, last: number): boolean {
  const groups = chain.slice(first, last + 1);
  const groupLengths = groups.map((g) => g.end - g.start);
  const total = groupLengths.reduce((sum, n) => sum + n, 0);
  if (total < CARD_MIN_DIGITS || total > CARD_MAX_DIGITS) return false;
  if (!hasCardLayout(groupLengths)) return false;
  // Guards apply only to an edge that touches the end of the chain.
  if (first === 0 && !leftGuard(text, groups[0].start)) return false;
  if (last === chain.length - 1 && !rightGuard(text, groups[groups.length - 1].end)) return false;
  const digits = groups.map((g) => text.slice(g.start, g.end)).join("");
  return passesSanityRules(digits) && luhn(digits);
}

// The windows to try, as [first, last] group indices: start- and end-anchored, and bare runs (§4 step 5).
// `[number, number][]` is an array of pairs.
function candidateWindows(chain: Chain): [number, number][] {
  const windows: [number, number][] = [];
  const length = (i: number) => chain[i].end - chain[i].start;

  let digits = 0;
  for (let last = 0; last < chain.length; last++) {
    digits += length(last);
    if (digits > CARD_MAX_DIGITS) break;
    windows.push([0, last]);
  }
  digits = 0;
  for (let first = chain.length - 1; first >= 0; first--) {
    digits += length(first);
    if (digits > CARD_MAX_DIGITS) break;
    windows.push([first, chain.length - 1]);
  }
  for (let i = 0; i < chain.length; i++) {
    if (length(i) >= CARD_MIN_DIGITS && length(i) <= CARD_MAX_DIGITS) windows.push([i, i]);
  }
  return windows;
}

// Merge overlapping accepted windows, so no digit of a real card is left behind (§4 step 7, D5).
function mergeOverlapping(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

// Find every card: digit runs -> chains -> candidate windows -> accept -> merge (§4).
function findCreditCards(text: string): Span[] {
  const accepted: Span[] = [];
  for (const chain of findChains(text, findDigitRuns(text))) {
    for (const [first, last] of candidateWindows(chain)) {
      if (acceptWindow(text, chain, first, last)) {
        accepted.push({ type: "CREDIT_CARD", start: chain[first].start, end: chain[last].end });
      }
    }
  }
  return mergeOverlapping(accepted);
}

export const creditCardDetector: Detector = { type: "CREDIT_CARD", find: findCreditCards };
