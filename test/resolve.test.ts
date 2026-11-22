// SERVICE_AND_RESOLVER §8.1, RS-series: the resolver with synthetic spans.
import { describe, expect, test } from "vitest";
import { resolveOverlaps } from "../src/resolve";
import type { EntityType, Span } from "../src/types";

// S(type, start, end) is a span, as written in the table.
function S(type: EntityType, start: number, end: number): Span {
  return { type, start, end };
}

describe("resolveOverlaps (RS-series)", () => {
  // `[string, Span[], Span[]][]`: an array of [id, input spans, expected regions] rows.
  const rows: [string, Span[], Span[]][] = [
    ["RS01 empty input", [], []],
    ["RS02 disjoint spans are kept and sorted", [S("PHONE", 10, 20), S("EMAIL", 0, 5)], [S("EMAIL", 0, 5), S("PHONE", 10, 20)]],
    ["RS03 touching spans are not merged", [S("EMAIL", 0, 5), S("PHONE", 5, 9)], [S("EMAIL", 0, 5), S("PHONE", 5, 9)]],
    ["RS04 identical spans: higher priority wins", [S("PHONE", 7, 22), S("CREDIT_CARD", 7, 22)], [S("CREDIT_CARD", 7, 22)]],
    ["RS05 union labelled by the higher-priority inner type", [S("EMAIL", 0, 23), S("SSN", 0, 11)], [S("SSN", 0, 23)]],
    ["RS06 inner lower-priority span disappears", [S("EMAIL", 0, 18), S("IP_ADDRESS", 6, 17)], [S("EMAIL", 0, 18)]],
    ["RS07 partial overlap: union", [S("PHONE", 4, 22), S("IP_ADDRESS", 11, 22)], [S("IP_ADDRESS", 4, 22)]],
    [
      "RS08 a chain of overlaps becomes one region",
      [S("PHONE", 0, 10), S("DATE_OF_BIRTH", 8, 15), S("EMAIL", 14, 30)],
      [S("EMAIL", 0, 30)],
    ],
    ["RS09 duplicates collapse", [S("SSN", 3, 14), S("SSN", 3, 14)], [S("SSN", 3, 14)]],
  ];

  test.each(rows)("%s", (_id, input, expected) => {
    expect(resolveOverlaps(input)).toEqual(expected);
  });

  test("RS10 the resolver does not mutate its input", () => {
    const input = [S("PHONE", 0, 5), S("SSN", 3, 8)];
    const copy = structuredClone(input);
    resolveOverlaps(input);
    expect(input).toEqual(copy);
  });

  test("extra fields (PHONE tier/rule) are ignored and not copied", () => {
    const phoneSpan = { type: "PHONE" as const, start: 0, end: 5, tier: "A", rule: "R1" };
    expect(resolveOverlaps([phoneSpan])).toEqual([S("PHONE", 0, 5)]);
  });
});
