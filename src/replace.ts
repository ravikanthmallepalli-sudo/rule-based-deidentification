// Stage 4: replacement (SERVICE_AND_RESOLVER §5).
//
// One pass, left to right: copy the original text up to the next region, append the
// placeholder, continue after the region. The text between regions is copied
// unchanged (no trimming, no normalisation, no case change). Offsets are UTF-16
// code units, the same units `slice` uses, so emoji and CRLF are copied exactly.

import { PLACEHOLDER } from "./data/priority";
import type { Span } from "./types";

// Replace each region with its placeholder; `regions` must be sorted and non-overlapping (§5).
// `regions: readonly Span[]` is a parameter type (the array is not changed); `: string` is the return type.
export function replaceSpans(text: string, regions: readonly Span[]): string {
  const parts: string[] = []; // an array of strings, joined at the end
  let copiedUpTo = 0;
  for (const region of regions) {
    parts.push(text.slice(copiedUpTo, region.start), PLACEHOLDER[region.type]);
    copiedUpTo = region.end;
  }
  parts.push(text.slice(copiedUpTo));
  return parts.join("");
}
