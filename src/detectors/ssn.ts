// SSN detector: US Social Security numbers `ddd-dd-dddd`, with any of eight dash look-alikes.
// Spec: docs/SSN_detection_rules.md (§ = section, L = row in the Limitations table, §8).
// Top limitations:
//   an SSN without dashes (`123456789`, `123 45 6789`) leaks (L1);
//   any valid-looking `ddd-dd-dddd`, such as a part or order number, is redacted (L5);
//   a number glued to letters, digits or `_` (`SSN123-45-6789`) is missed (L3).

import {
  SSN_DASHES,
  SSN_REJECTED_AREAS,
  SSN_REJECTED_GROUPS,
  SSN_REJECTED_SERIALS,
} from "../data/ssnData";
import type { Detector, Span } from "../types";
import { escapeForCharClass, LETTER_LIKE_CLASS } from "../unicode";
import { findWithRegex } from "./regexDetector";

const DASH = escapeForCharClass(SSN_DASHES);

// §11: (?<!...) = "not preceded by", (?!...) = "not followed by". Guards: no letter, number, mark or _ on
// either side, not part of `12-123-45-6789`, `1.123-45-6789`, `...-12`, `....5`; groups = area, group, serial.
const SSN_RE = new RegExp(
  `(?<![${LETTER_LIKE_CLASS}])(?<![0-9][${DASH}])(?<![0-9]\\.)` +
    `([0-9]{3})[${DASH}]([0-9]{2})[${DASH}]([0-9]{4})` +
    `(?![${LETTER_LIKE_CLASS}])(?![${DASH}][0-9])(?!\\.[0-9])`,
  "gu",
);

// True unless a part is never assigned: area 000 / 666, group 00, serial 0000 (§5.2).
function isAssignable(match: RegExpExecArray): boolean {
  const [, area, group, serial] = match; // skip match[0], the whole match
  return (
    !SSN_REJECTED_AREAS.includes(area) &&
    !SSN_REJECTED_GROUPS.includes(group) &&
    !SSN_REJECTED_SERIALS.includes(serial)
  );
}

// Find every SSN: each guarded match that passes the value rules is one span (§4).
function findSsns(text: string): Span[] {
  return findWithRegex(text, "SSN", SSN_RE, isAssignable);
}

// `: Detector` makes the compiler check that this object has the Detector shape.
export const ssnDetector: Detector = { type: "SSN", find: findSsns };
