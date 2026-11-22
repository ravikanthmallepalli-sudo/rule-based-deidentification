// The loop shared by the "run a regex, check the captured values, emit spans" detectors (SSN, IP_ADDRESS).

import type { EntityType, Span } from "../types";

// Every match of `regex` (needs the `g` flag) that `accept` approves becomes one span.
// match[0] is the whole match; match[1], match[2], ... are the captured groups.
export function findWithRegex(
  text: string,
  type: EntityType,
  regex: RegExp,
  accept: (match: RegExpExecArray) => boolean,
): Span[] {
  const spans: Span[] = []; // `Span[]`: an array of Span objects
  // matchAll works on a copy of the regex, so the shared `lastIndex` state is never an issue.
  for (const match of text.matchAll(regex)) {
    if (accept(match)) spans.push({ type, start: match.index, end: match.index + match[0].length });
  }
  return spans;
}
