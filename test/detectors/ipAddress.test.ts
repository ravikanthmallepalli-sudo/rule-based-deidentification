// Tests for the IP_ADDRESS detector, built from the tables in docs/IP_ADDRESS_detection_rules.md.
import { describe, expect, test } from "vitest";
import { countRows, loadCases } from "../helpers/loadCases";
import { defineTableTests } from "../helpers/tableTests";
import { ipAddressDetector } from "../../src/detectors/ipAddress";

const cases = loadCases("IP_ADDRESS_detection_rules.md");

// Assert the row count of every series, so a parsing bug cannot silently drop rows.
describe("IP_ADDRESS_detection_rules.md tables", () => {
  test("row counts per series", () => {
    expect(countRows(cases)).toEqual({
      matrix: { IP: 50, IF: 62, IN: 43, IS: 11, IL: 15, IA: 25, IG: 24 },
      claims: 23,
    });
    expect(cases).toHaveLength(253);
  });

  // IC20-IC22 compare span offsets; IC01 and IC03 document non-default options.
  defineTableTests(cases, "IP_ADDRESS", ipAddressDetector, {
    spanRows: ["IC20", "IC21", "IC22"],
    skipRows: ["IC01", "IC03"],
  });
});
