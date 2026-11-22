// The country table in src/data/countryCodes.ts must equal PHONE_detection_rules.md §6A.4.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { COUNTRY_CODES, type CountryCode } from "../../src/data/countryCodes";

// Parse the rows `| +44 | United Kingdom (...) | 7-10 |` that follow the §6A.4 heading.
function tableFromDocument(): CountryCode[] {
  const lines = readFileSync(join(__dirname, "..", "..", "docs", "PHONE_detection_rules.md"), "utf8").split(/\r?\n/);
  const rows: CountryCode[] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith("### 6A.4")) inTable = true;
    else if (inTable && line.startsWith("| +")) {
      const [code, country, lengths] = line.split("|").slice(1, 4).map((cell) => cell.trim());
      const [min, max] = lengths.split("-").map(Number);
      rows.push({ code: code.slice(1), country, minLength: min, maxLength: max ?? min });
    } else if (inTable && rows.length > 0 && !line.startsWith("|")) break;
  }
  return rows;
}

describe("country calling codes (PHONE §6A.4)", () => {
  test("the data file equals the table in the document", () => {
    expect(COUNTRY_CODES).toEqual(tableFromDocument());
  });

  test("206 entries, no duplicates", () => {
    expect(COUNTRY_CODES).toHaveLength(206);
    expect(new Set(COUNTRY_CODES.map((row) => row.code)).size).toBe(206);
  });

  test("no code is a prefix of another (codes are prefix-free)", () => {
    const codes = COUNTRY_CODES.map((row) => row.code);
    const clashes = codes.filter((a) => codes.some((b) => a !== b && b.startsWith(a)));
    expect(clashes).toEqual([]);
  });

  test("global-service, spare and reserved codes are absent; Kosovo, South Sudan, Palestine present", () => {
    const codes = new Set(COUNTRY_CODES.map((row) => row.code));
    for (const excluded of ["800", "808", "870", "878", "881", "882", "883", "888", "979", "991", "388", "379", "89", "214", "671", "999"]) {
      expect(codes.has(excluded)).toBe(false);
    }
    for (const present of ["383", "211", "970"]) expect(codes.has(present)).toBe(true);
  });
});
