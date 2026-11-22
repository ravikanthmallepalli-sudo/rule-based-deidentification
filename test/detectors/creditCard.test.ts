// Tests for the CREDIT_CARD detector, built from the tables in docs/CREDIT_CARD_detection_rules.md.
import { describe, expect, test } from "vitest";
import { countRows, loadCases } from "../helpers/loadCases";
import { defineTableTests } from "../helpers/tableTests";
import { creditCardDetector } from "../../src/detectors/creditCard";

const cases = loadCases("CREDIT_CARD_detection_rules.md");

// Assert the row count of every series, so a parsing bug cannot silently drop rows.
describe("CREDIT_CARD_detection_rules.md tables", () => {
  test("row counts per series", () => {
    expect(countRows(cases)).toEqual({
      matrix: { CC: 53, CS: 12, CF: 44, CL: 10 },
      claims: 11,
    });
    expect(cases).toHaveLength(130);
  });

  // Every CREDIT_CARD row uses the default rule.
  defineTableTests(cases, "CREDIT_CARD", creditCardDetector);
});
