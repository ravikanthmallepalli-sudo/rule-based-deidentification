// Tests for the PHONE detector, built from the tables in docs/PHONE_detection_rules.md.
import { describe, expect, test } from "vitest";
import { countRows, loadCases } from "../helpers/loadCases";
import { defineTableTests } from "../helpers/tableTests";
import { deidentify } from "../../src/deidentify";
import { phoneDetector, type PhoneSpan } from "../../src/detectors/phone";

const cases = loadCases("PHONE_detection_rules.md");

// Assert the row count of every series, so a parsing bug cannot silently drop rows.
describe("PHONE_detection_rules.md tables", () => {
  test("row counts per series", () => {
    expect(countRows(cases)).toEqual({
      matrix: { P: 36, Z: 3, N: 12, T: 4, B: 22, K: 12, E: 5, V: 23, Q: 80, F: 47, M: 20, L: 9, A: 16, G: 15, H: 36 },
      claims: 28,
    });
    expect(cases).toHaveLength(368);
  });

  // C20 documents two runs: ``run 1: `A` → run 2: `B` ``. The loader keeps the text
  // between the first and last backtick, so the cell reads  A` → run 2: `B
  defineTableTests(cases, "PHONE", phoneDetector, {
    customRows: {
      C20: (row) => {
        const [run1, run2] = row.output.split("` → run 2: `");
        expect(deidentify(row.input, ["PHONE"]).deidentifiedText).toBe(run1);
        expect(deidentify(run1, ["PHONE"]).deidentifiedText).toBe(run2);
      },
    },
  });

  // Optional check: rows whose "Rule / why" names finders, e.g. "R1 (Tier A)" or
  // "R1 (Tier A), R3 (Tier A)", must be produced by exactly those finders and tiers.
  const rowsNamingAFinder = cases.filter((row) => /R[1-6] \(Tier [AB]\)/.test(row.note));
  test.each(rowsNamingAFinder)("$id produced by the finder named in the table", (row) => {
    const expected = [...row.note.matchAll(/(R[1-6]) \(Tier ([AB])\)/g)].map((m) => `${m[1]} (Tier ${m[2]})`);
    // `as PhoneSpan[]`: phoneDetector.find returns PHONE spans, which carry tier and rule.
    const found = (phoneDetector.find(row.input) as PhoneSpan[]).map((s) => `${s.rule} (Tier ${s.tier})`);
    expect([...new Set(found)].sort()).toEqual([...new Set(expected)].sort());
  });
});
