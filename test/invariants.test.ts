// A cheap safety net: random inputs and pathological inputs.
//   1. Every detector returns spans that are in range, non-empty, sorted and non-overlapping.
//   2. deidentify with all six types never throws, and every character outside the resolved
//      regions is copied unchanged ("must not silently corrupt unrelated text").
//   3. Each detector handles a 300 KB pathological input in under 2 seconds.
import { describe, expect, test } from "vitest";
import { PLACEHOLDER, PRIORITY } from "../src/data/priority";
import { deidentify, detectAll } from "../src/deidentify";
import { DETECTORS } from "../src/detectors";
import { resolveOverlaps } from "../src/resolve";
import { ALL_ENTITY_TYPES, type Span } from "../src/types";

// A small seeded random generator (mulberry32), so a failure can be reproduced.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Building blocks: digits, separators, punctuation, letters in several scripts, emoji,
// CRLF, NBSP and fragments of valid values taken from the rule documents' tables.
const PIECES = [
  "0", "1", "4", "5", "9", "12", "123", "415", "2024", "1990",
  " ", "  ", "-", ".", "/", ":", "@", "+", "(", ")", ",", ";", "_", "#", "[", "]", '"', "'",
  "\u00A0", "\u2013", "\u2212", "\u200B", "\u0301", "\r\n", "\n", "\t",
  "a", "x", "T", "é", "Zoë", "日本語", "生年月日", "Дата", "αβγ", "😀", "𝐀", "٣", "１",
  "123-45-6789", "+1 415 555 0134", "+91-415-555-0134", "(415) 555-0134", "415-555-0134",
  "0044 20 7946 0958", "john.doe@example.com", "a@b.co", "4111 1111 1111 1111", "4111111111111111",
  "378282246310005", "192.168.1.1", "10.0.0.1:8080", "DOB: ", "05/12/1990", "1990-05-12", "12 May 1990",
  "Call ", "Phone: ", "Version ", "ext. 22", " (DOB)", "(mobile)", "born on ",
];

function randomText(random: () => number): string {
  const count = 1 + Math.floor(random() * 30);
  let text = "";
  for (let i = 0; i < count; i++) text += PIECES[Math.floor(random() * PIECES.length)];
  return text;
}

const INPUTS_PER_DETECTOR = 2000;

// Why a list of spans is not well formed, or null when it is: every span in range,
// non-empty, sorted and non-overlapping.
function wellFormedProblem(spans: Span[], text: string): string | null {
  let previousEnd = 0;
  for (const span of spans) {
    if (span.start < previousEnd) return `unsorted or overlapping at ${span.start}`;
    if (span.start >= span.end) return `empty span at ${span.start}`;
    if (span.end > text.length) return `span ends after the text at ${span.end}`;
    previousEnd = span.end;
  }
  return null;
}

// The output rebuilt by hand from the original slices plus placeholders.
function rebuild(text: string, regions: Span[]): string {
  let output = "";
  let copiedUpTo = 0;
  for (const region of regions) {
    output += text.slice(copiedUpTo, region.start) + PLACEHOLDER[region.type];
    copiedUpTo = region.end;
  }
  return output + text.slice(copiedUpTo);
}

// Problems are collected as text and asserted once per test (one `expect` per input
// would make the test slow); a failure names the input, so it can be reproduced.
describe("detector invariants on random input", () => {
  test.each([...ALL_ENTITY_TYPES])("%s spans are in range, sorted and non-overlapping", (type) => {
    const random = seededRandom(20261122 + type.length);
    const problems: string[] = [];
    for (let i = 0; i < INPUTS_PER_DETECTOR; i++) {
      const text = randomText(random);
      const problem = wellFormedProblem(DETECTORS[type].find(text), text);
      if (problem !== null) problems.push(`${JSON.stringify(text)}: ${problem}`);
    }
    expect(problems).toEqual([]);
  });
});

describe("service invariants on random input", () => {
  test("deidentify never throws and leaves every character outside the regions unchanged", () => {
    const random = seededRandom(7);
    const problems: string[] = [];
    for (let i = 0; i < INPUTS_PER_DETECTOR * ALL_ENTITY_TYPES.length; i++) {
      const text = randomText(random);
      const spans = detectAll(text, ALL_ENTITY_TYPES);
      const regions = resolveOverlaps(spans);
      const result = deidentify(text); // throwing here fails the test
      const where = JSON.stringify(text);

      const problem = wellFormedProblem(regions, text);
      if (problem !== null) problems.push(`${where}: regions ${problem}`);
      if (result.deidentifiedText !== rebuild(text, regions)) problems.push(`${where}: text outside the regions changed`);

      // Union rule: every region contains at least one span and carries the highest-priority
      // type among its spans; the counts add up to the number of regions.
      for (const region of regions) {
        const inside = spans.filter((s) => s.start >= region.start && s.end <= region.end);
        const best = Math.min(...inside.map((s) => PRIORITY[s.type]));
        if (inside.length === 0 || best !== PRIORITY[region.type]) problems.push(`${where}: wrong region label`);
      }
      const total = Object.values(result.entitiesDetected).reduce((sum, n) => sum + n, 0);
      if (total !== regions.length) problems.push(`${where}: counts do not match the regions`);
    }
    expect(problems).toEqual([]);
  }, 30_000); // a generous timeout: 12,000 inputs run through all six detectors
});

// Pathological inputs of about 300 KB, per detector: each must finish in under 2 seconds.
const PATHOLOGICAL: Record<string, string[]> = {
  SSN: ["1-".repeat(150000), "123-45-6789 ".repeat(25000), "0".repeat(300000)],
  IP_ADDRESS: ["1.".repeat(150000), "1.1.1.1 ".repeat(37000), "version no is of ".repeat(15000) + "1.2.3.4"],
  EMAIL: ["a@".repeat(150000), "@".repeat(300000), "a".repeat(300000) + "@example.com", "a.".repeat(150000) + "@b.co"],
  CREDIT_CARD: ["1-".repeat(150000), "4111 ".repeat(60000), "1 ".repeat(150000), "0".repeat(300000)],
  DATE_OF_BIRTH: ["DOB: ".repeat(60000), "1/1/1990/".repeat(33000), "DOB: 05/12/1990 ".repeat(19000), "May ".repeat(75000), "DOB (".repeat(60000) + "05/12/1990"],
  PHONE: ["1-".repeat(150000), "+1 ".repeat(100000), "Call 4155550134 ".repeat(19000), "((((".repeat(75000), "00 ".repeat(100000), "+99 ".repeat(75000)],
};

describe("performance on 300 KB pathological input", () => {
  test.each([...ALL_ENTITY_TYPES])("%s finishes every input in under 2 seconds", (type) => {
    for (const text of PATHOLOGICAL[type]) {
      const started = performance.now();
      DETECTORS[type].find(text);
      expect(performance.now() - started).toBeLessThan(2000);
    }
  });
});
