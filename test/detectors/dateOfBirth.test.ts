// Tests for the DATE_OF_BIRTH detector, built from the tables in docs/DATE_OF_BIRTH_detection_rules.md.
import { describe, expect, test } from "vitest";
import { countRows, loadCases } from "../helpers/loadCases";
import { defineTableTests } from "../helpers/tableTests";
import { deidentify } from "../../src/deidentify";
import { dateOfBirthDetector } from "../../src/detectors/dateOfBirth";

const cases = loadCases("DATE_OF_BIRTH_detection_rules.md");

// Assert the row count of every series, so a parsing bug cannot silently drop rows.
describe("DATE_OF_BIRTH_detection_rules.md tables", () => {
  test("row counts per series", () => {
    expect(countRows(cases)).toEqual({
      matrix: { DP: 93, DK: 81, DM: 28, DF: 57, DS: 19, DL: 29, DA: 32, DG: 22 },
      claims: 18,
    });
    expect(cases).toHaveLength(379);
  });

  // The table shortens the inputs of DC01 and DC02; the exact inputs are rebuilt here.
  defineTableTests(cases, "DATE_OF_BIRTH", dateOfBirthDetector, {
    customRows: {
      DC01: () => {
        const input = "DOB:" + " ".repeat(70) + "05/12/1990"; // label 74 characters before the date
        expect(deidentify(input, ["DATE_OF_BIRTH"]).deidentifiedText).toBe(
          "DOB:" + " ".repeat(70) + "[DATE_OF_BIRTH]",
        );
      },
      DC02: () => {
        const input = "DOB:" + " ".repeat(90) + "05/12/1990"; // label outside the 80-character window
        expect(deidentify(input, ["DATE_OF_BIRTH"]).deidentifiedText).toBe(input);
      },
    },
  });
});
