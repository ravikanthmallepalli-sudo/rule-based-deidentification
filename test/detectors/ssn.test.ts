// Tests for the SSN detector, built from the tables in docs/SSN_detection_rules.md.
import { describe, expect, test } from "vitest";
import { countRows, loadCases } from "../helpers/loadCases";
import { defineTableTests } from "../helpers/tableTests";
import { ssnDetector } from "../../src/detectors/ssn";

const cases = loadCases("SSN_detection_rules.md");

// Assert the row count of every series, so a parsing bug cannot silently drop rows.
describe("SSN_detection_rules.md tables", () => {
  test("row counts per series", () => {
    expect(countRows(cases)).toEqual({
      matrix: { SS: 62, SF: 63, SM: 12, SL: 13, SA: 25, SG: 25 },
      claims: 19,
    });
    expect(cases).toHaveLength(219);
  });

  // SC18 and SC19 compare span offsets; SC01, SC02, SC04 document non-default options.
  defineTableTests(cases, "SSN", ssnDetector, {
    spanRows: ["SC18", "SC19"],
    skipRows: ["SC01", "SC02", "SC04"],
  });
});
