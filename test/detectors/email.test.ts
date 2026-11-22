// Tests for the EMAIL detector, built from the tables in docs/EMAIL_detection_rules.md.
import { describe, expect, test } from "vitest";
import { countRows, loadCases } from "../helpers/loadCases";
import { defineTableTests } from "../helpers/tableTests";
import { emailDetector } from "../../src/detectors/email";

const cases = loadCases("EMAIL_detection_rules.md");

// Assert the row count of every series, so a parsing bug cannot silently drop rows.
describe("EMAIL_detection_rules.md tables", () => {
  test("row counts per series", () => {
    expect(countRows(cases)).toEqual({
      matrix: { EM: 54, EF: 43, ES: 9, EL: 15, EA: 23, EG: 19 },
      claims: 21,
    });
    expect(cases).toHaveLength(184);
  });

  // Every EMAIL row uses the default rule (C21 included: `.java` is a real TLD).
  defineTableTests(cases, "EMAIL", emailDetector);
});
