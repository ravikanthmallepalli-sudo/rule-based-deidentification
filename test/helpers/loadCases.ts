// Reads the test tables of one rule document (docs/*.md) at test time, so the
// documents stay the single source of truth for the expected behaviour.
// A table runs from its `| ID | Input | Output` (or `| ID | Claim | ...`) header to the first line
// not starting with `|`; cells split on unescaped `|`; `⏎`, `⇥` and `<NAME>` tokens are expanded.

import { readFileSync } from "node:fs";
import { join } from "node:path";

// One table row. `kind` is "matrix" for `| ID | Input | Output | Why |` tables and
// "claim" for `| ID | Claim | Input | Output |` tables.
export interface Case {
  id: string;
  kind: "matrix" | "claim";
  section: string; // the nearest `###` heading above the table
  input: string;
  output: string;
  note: string; // the "Rule / why" cell (matrix) or the "Claim" cell (claim)
}

const DOCS_DIR = join(__dirname, "..", "..", "docs");

// Placeholder tokens used in the tables. `Record<string, string>` = an object
// whose keys and values are all strings.
const TOKENS: Record<string, string> = {
  "<NBSP>": "\u00A0",
  "<NNBSP>": "\u202F",
  "<THIN>": "\u2009",
  "<EN>": "\u2013",
  "<EM>": "\u2014",
  "<NBH>": "\u2011",
  "<HY>": "\u2010",
  "<FIG>": "\u2012",
  "<BAR>": "\u2015",
  "<MINUS>": "\u2212",
  "<ZWSP>": "\u200B",
  "<RLM>": "\u200F",
  "<COMB>": "\u0301",
  "<IDSP>": "\u3000",
};

// Expand the line-break and tab symbols first, then the named tokens.
export function expandPlaceholders(raw: string): string {
  let value = raw.split("\\r⏎").join("\r\n");
  value = value.split("⏎").join("\n");
  value = value.split("⇥").join("\t");
  for (const [token, character] of Object.entries(TOKENS)) {
    value = value.split(token).join(character);
  }
  return value;
}

// Rules 3 and 4: an input/output cell is `...` (one pair of backticks) or *(empty)*.
// The text between the first and last backtick is taken WITHOUT trimming.
function cellValue(cell: string): string {
  if (cell === "*(empty)*") return "";
  const first = cell.indexOf("`");
  const last = cell.lastIndexOf("`");
  const raw = first !== -1 && last > first ? cell.slice(first + 1, last) : cell;
  return expandPlaceholders(raw.split("\\|").join("|"));
}

// Split on `|` not preceded by a backslash; drop the empty first and last parts.
// `(?<!\\)` means "not preceded by a backslash".
function splitRow(line: string): string[] {
  const parts = line.split(/(?<!\\)\|/);
  return parts.slice(1, parts.length - 1).map((part) => part.trim());
}

// Read every test row of `docs/<fileName>`.
export function loadCases(fileName: string): Case[] {
  const lines = readFileSync(join(DOCS_DIR, fileName), "utf8").split(/\r?\n/);
  const cases: Case[] = [];
  let section = "";
  // `"matrix" | "claim" | null`: which kind of table we are inside, or none.
  let tableKind: "matrix" | "claim" | null = null;

  for (const line of lines) {
    if (line.startsWith("### ")) section = line.slice(4).trim();

    // A table starts at its header line ...
    if (line.startsWith("| ID | Input | Output")) {
      tableKind = "matrix";
      continue;
    }
    if (line.startsWith("| ID | Claim | Input | Output |")) {
      tableKind = "claim";
      continue;
    }
    // ... and ends at the first line that does not start with `|`.
    if (!line.startsWith("|")) {
      tableKind = null;
      continue;
    }
    if (tableKind === null || line.startsWith("|---")) continue;

    const cells = splitRow(line);
    if (tableKind === "matrix") {
      const [id, input, output, note] = cells;
      cases.push({ id, kind: "matrix", section, input: cellValue(input), output: cellValue(output), note: note ?? "" });
    } else {
      const [id, claim, input, output] = cells;
      cases.push({ id, kind: "claim", section, input: cellValue(input), output: cellValue(output), note: claim });
    }
  }
  return cases;
}

// The series of a row ID: its letters ("SS01" -> "SS", "L09" -> "L").
export function seriesOf(id: string): string {
  return id.replace(/[0-9]+$/, "");
}

// Count matrix rows per series and claim rows in total, to compare with the expected counts.
export function countRows(cases: Case[]): { matrix: Record<string, number>; claims: number } {
  const matrix: Record<string, number> = {};
  let claims = 0;
  for (const row of cases) {
    if (row.kind === "claim") {
      claims += 1;
    } else {
      const series = seriesOf(row.id);
      matrix[series] = (matrix[series] ?? 0) + 1;
    }
  }
  return { matrix, claims };
}
