// Turns the rows of one rule document into tests.
import { expect, test } from "vitest";
import { deidentify } from "../../src/deidentify";
import type { Detector, EntityType } from "../../src/types";
import type { Case } from "./loadCases";

export const NON_DEFAULT_OPTION = "non-default option (O1/O2), not implemented";

// `?` marks optional fields: a caller passes only the ones it needs.
export interface TableOptions {
  // Rows whose output cell starts with a span list such as `[[3,14]]`.
  spanRows?: string[];
  // Rows that document non-default options (the only allowed skips).
  skipRows?: string[];
  // Rows that need their own assertion; the function receives the row.
  customRows?: Record<string, (row: Case) => void>;
}

// The leading `[[a,b],[c,d]]` of an output cell, as an array of [start, end] pairs.
function leadingSpanList(output: string): number[][] {
  const match = /^\[\[.*?\]\]/.exec(output);
  if (match === null) throw new Error(`No span list in: ${output}`);
  return JSON.parse(match[0]) as number[][];
}

// Default rule: with only `type` enabled, the de-identified text must equal the Output cell.
export function defineTableTests(
  cases: Case[],
  type: EntityType,
  detector: Detector,
  options: TableOptions = {},
): void {
  const spanRows = options.spanRows ?? [];
  const skipRows = options.skipRows ?? [];
  const customRows = options.customRows ?? {};
  const isSpecial = (row: Case) =>
    spanRows.includes(row.id) || skipRows.includes(row.id) || row.id in customRows;

  test.each(cases.filter((row) => !isSpecial(row)))("$id", (row) => {
    expect(deidentify(row.input, [type]).deidentifiedText).toBe(row.output);
  });

  for (const row of cases.filter((r) => spanRows.includes(r.id))) {
    test(`${row.id} (span offsets)`, () => {
      const found = detector.find(row.input).map((span) => [span.start, span.end]);
      expect(found).toEqual(leadingSpanList(row.output));
    });
  }

  for (const row of cases.filter((r) => r.id in customRows)) {
    test(`${row.id} (custom check)`, () => customRows[row.id](row));
  }

  for (const row of cases.filter((r) => skipRows.includes(r.id))) {
    test.skip(`${row.id}: ${NON_DEFAULT_OPTION}`, () => {});
  }
}
