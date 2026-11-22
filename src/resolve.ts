// Stage 3: overlap resolution with the UNION rule (docs/SERVICE_AND_RESOLVER_rules.md §4).
// Overlapping spans of any types merge into one region labelled with the highest-priority type:
//   EMAIL [0,28) + SSN [5,16)  ->  SSN [0,28)      ("john.123-45-6789@example.com" -> "[SSN]")
// Spans that only touch (a.end === b.start) are NOT merged.

import { PRIORITY } from "./data/priority";
// `import type` brings in types only: they are used by the compiler and vanish from the JavaScript output.
import type { Span } from "./types";

// `readonly Span[]`: the function promises not to change the caller's array.
// `: Span[]` after the parameters is the return type: a new array of regions.
export function resolveOverlaps(spans: readonly Span[]): Span[] {
  // 1. Copy and sort: start ascending, then end descending, then higher priority first.
  //    (Copying keeps the input array unchanged, test RS10.)
  const sorted = [...spans].sort(
    (a, b) => a.start - b.start || b.end - a.end || PRIORITY[a.type] - PRIORITY[b.type],
  );

  // 2. Walk left to right, growing the last region while spans overlap it.
  const regions: Span[] = [];
  for (const span of sorted) {
    const last = regions[regions.length - 1];
    if (last !== undefined && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
      if (PRIORITY[span.type] < PRIORITY[last.type]) last.type = span.type;
    } else {
      // A fresh object with only the three shared fields (PHONE's extra fields are dropped).
      regions.push({ type: span.type, start: span.start, end: span.end });
    }
  }
  return regions;
}
