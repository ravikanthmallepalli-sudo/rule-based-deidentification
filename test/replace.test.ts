// SERVICE_AND_RESOLVER §8.2, RP-series: the replacer, plus the counts check (§6).
import { describe, expect, test } from "vitest";
import { countEntities } from "../src/deidentify";
import { replaceSpans } from "../src/replace";
import type { EntityType, Span } from "../src/types";

function S(type: EntityType, start: number, end: number): Span {
  return { type, start, end };
}

describe("replaceSpans (RP-series)", () => {
  const rows: [string, string, Span[], string][] = [
    ["RP01", "Contact a@b.co now", [S("EMAIL", 8, 14)], "Contact [EMAIL] now"],
    ["RP02", "", [], ""],
    // The emoji is 2 UTF-16 code units, so the address starts at 5.
    ["RP03", "x 😀 a@b.co \n", [S("EMAIL", 5, 11)], "x 😀 [EMAIL] \n"],
    ["RP04", "a@b.co\r\nb@c.de", [S("EMAIL", 0, 6), S("EMAIL", 8, 14)], "[EMAIL]\r\n[EMAIL]"],
    ["RP05", "ab", [S("SSN", 0, 1), S("SSN", 1, 2)], "[SSN][SSN]"],
  ];

  test.each(rows)("%s", (_id, text, regions, expected) => {
    expect(replaceSpans(text, regions)).toBe(expected);
  });
});

describe("countEntities (§6)", () => {
  test("regions PHONE, EMAIL, PHONE -> { EMAIL: 1, PHONE: 2 }", () => {
    const counts = countEntities([S("PHONE", 0, 1), S("EMAIL", 2, 3), S("PHONE", 4, 5)]);
    expect(counts).toEqual({ EMAIL: 1, PHONE: 2 });
    // S9: keys follow the fixed order EMAIL, PHONE, SSN, DATE_OF_BIRTH, CREDIT_CARD, IP_ADDRESS.
    expect(Object.keys(counts)).toEqual(["EMAIL", "PHONE"]);
  });

  test("no regions -> {} (zero counts are omitted, S6)", () => {
    expect(countEntities([])).toEqual({});
  });
});
