// PHONE detector: validated `+`/`00`, NANP and `(0xx)` numbers (Tier A); bare digits near a phone word (Tier B).
// This file: the detector and the resolution inside PHONE; finders.ts, validateNumber.ts, context.ts: the rest.
// Spec: docs/PHONE_detection_rules.md (§ = section, L = row in the Limitations table, §11).
// Top limitations: bare digits with no phone word nearby are not redacted (L1);
//   two numbers joined only by spaces or hyphens are not separated (L4);
//   the country codes date from 2016 and the length ranges are not verified (L17).

import type { Detector, Span } from "../../types";
import {
  findContextChains,
  findDoubleZeroNumbers,
  findParenNanp,
  findPlusNumbers,
  findSeparatedNanp,
  findTrunkPrefixed,
  type PhoneSpan,
  type Scan,
} from "./finders";

// Tests read the tier and rule of each span, so the type is re-exported from here.
export type { PhoneSpan } from "./finders";

// ---- Resolution inside PHONE (§5 step 5, §10.1) ----

function overlapsMask(mask: Uint8Array, span: Span): boolean {
  for (let i = span.start; i < span.end; i++) if (mask[i] === 1) return true;
  return false;
}

// Drop R3-R6 candidates touching a rejected `+`/`00` chain (D16) and Tier B overlapping Tier A; then keep
// non-overlapping candidates, earliest and longest first (§10.1).
function resolvePhoneCandidates(scan: Scan): PhoneSpan[] {
  const notBlocked = scan.candidates.filter(
    (c) => c.rule === "R1" || c.rule === "R2" || !overlapsMask(scan.rejected, c),
  );
  const tierA = new Uint8Array(scan.text.length);
  for (const c of notBlocked) if (c.tier === "A") tierA.fill(1, c.start, c.end);
  const survivors = notBlocked.filter((c) => c.tier === "A" || !overlapsMask(tierA, c));

  survivors.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept: PhoneSpan[] = [];
  for (const candidate of survivors) {
    const last = kept[kept.length - 1];
    if (last === undefined || candidate.start >= last.end) kept.push(candidate);
  }
  return kept;
}

// Find every phone number: run R1-R6 on the original text, then resolve inside PHONE (§5).
function findPhones(text: string): PhoneSpan[] {
  const scan: Scan = { text, candidates: [], rejected: new Uint8Array(text.length) };
  findPlusNumbers(scan);
  findDoubleZeroNumbers(scan);
  findParenNanp(scan);
  findSeparatedNanp(scan);
  findTrunkPrefixed(scan);
  findContextChains(scan);
  return resolvePhoneCandidates(scan);
}

export const phoneDetector: Detector = { type: "PHONE", find: findPhones };
