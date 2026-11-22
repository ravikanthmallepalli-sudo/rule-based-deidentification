// IP_ADDRESS detector: dotted IPv4 addresses (four numbers 0-255); a port or CIDR prefix stays outside.
// Spec: docs/IP_ADDRESS_detection_rules.md (§ = section, L = row in the Limitations table, §8).
// Top limitations:
//   an address with one invalid octet (`192.168.1.256`) leaks entirely (L2);
//   other notations leak: defanged `192[.]168[.]1[.]1`, decimal, hex, IPv6 (L5);
//   an address with every octet below 100 right after a version word (`Version 10.0.0.1`) leaks (L7).

import {
  IP_CONTEXT_SEPARATORS,
  IP_CONTEXT_WINDOW,
  IP_FILLER_WORDS,
  IP_MAX_OCTET,
  IP_NEGATIVE_KEYWORDS,
  VERSION_OCTET_LIMIT,
} from "../data/ipData";
import { createKeywordCheck } from "../context";
import type { Detector, Span } from "../types";
import { LETTER_LIKE_CLASS } from "../unicode";
import { findWithRegex } from "./regexDetector";

// §11: four octets of 1-3 digits joined by dots. (?<!...) = "not preceded by", (?!...) = "not followed by":
// no letter, number, mark or _ on either side, no dotted group in front (`1.192.168.1.1`) or behind.
const IPV4_RE = new RegExp(
  `(?<![${LETTER_LIKE_CLASS}])(?<![0-9]\\.)` +
    "([0-9]{1,3})\\.([0-9]{1,3})\\.([0-9]{1,3})\\.([0-9]{1,3})" +
    `(?![${LETTER_LIKE_CLASS}])(?!\\.[0-9])`,
  "gu",
);

// Is a version or section word right before the number (same line, 40 characters)? (§5.3)
const hasVersionWordBefore = createKeywordCheck({
  keywords: IP_NEGATIVE_KEYWORDS,
  fillers: IP_FILLER_WORDS,
  separators: IP_CONTEXT_SEPARATORS,
  window: IP_CONTEXT_WINDOW,
});

// True if an octet is above 255 (§5.2).
function hasOctetAbove255(octets: string[]): boolean {
  return octets.some((octet) => Number(octet) > IP_MAX_OCTET);
}

// True if every octet is below 100: only such a number can be protected by a version word (§5.3).
function isVersionLike(octets: string[]): boolean {
  return octets.every((octet) => Number(octet) < VERSION_OCTET_LIMIT);
}

// Find every address: guarded match -> value rule -> negative context -> span of the four octets (§4).
function findIpAddresses(text: string): Span[] {
  return findWithRegex(text, "IP_ADDRESS", IPV4_RE, (match) => {
    const octets = match.slice(1, 5); // the four captured groups
    if (hasOctetAbove255(octets)) return false;
    return !(isVersionLike(octets) && hasVersionWordBefore(text, match.index));
  });
}

export const ipAddressDetector: Detector = { type: "IP_ADDRESS", find: findIpAddresses };
