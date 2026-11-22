# Design note

A short explanation of the design decisions, their trade-offs, the main limitations and possible improvements. The detailed rules live in the rule documents next to this file.

## Pipeline

```text
text + entity types
  1. VALIDATE   reject bad text or unknown entity names            src/validate.ts
  2. DETECT     each enabled detector scans the ORIGINAL text      src/detectors/*.ts
  3. RESOLVE    merge overlapping spans (union rule)               src/resolve.ts
  4. REPLACE    copy untouched text, insert [TYPE], one pass       src/replace.ts
  5. REPORT     deidentifiedText + counts per type                 src/deidentify.ts
```

**Why detection is separate from replacement.** A detector only returns spans `{ type, start, end }` (UTF-16 offsets into the original string); it never edits text and never sees another detector's output. That gives three properties: detectors can be tested in isolation against their own tables; the replacer is a few lines that can be shown to copy everything outside the spans unchanged (the brief's "must not silently corrupt unrelated text"); and a new entity is a new detector plus one line in `src/detectors/index.ts`, with no change to the resolver or replacer (the brief's extensibility stretch goal).

## Why rule-based

The brief forbids PII libraries, models and external services, and asks for correctness, maintainability and clear reasoning. Regular expressions plus explicit validation are deterministic, explainable row by row, fast (every scan is linear and bounded), and keep the text inside the process. The cost is recall: anything outside the documented formats is missed, which is why every rule document lists its limitations.

## Key decisions and their trade-offs

| Decision | Why | Trade-off |
|---|---|---|
| **PHONE has two tiers and a context gate.** Shapes that are convincing alone (validated `+`/`00` numbers, NANP, `(0xx)`) are always redacted; bare digit chains only next to a phone word. | The task giver: order and transaction IDs must stay; `Call 4155550134` must not. | A bare number without a phone word leaks (`4155550134`); a CSV phone column leaks because its header is on another line. |
| **PHONE validates country codes and lengths** against a 206-row table. | `+1500000` (an amount) and `+89 …` (unassigned) must stay. | The table is dated 2016 and the length ranges are not verified; wrong-length numbers are left alone. |
| **CREDIT_CARD: Luhn, no issuer table.** | The task giver defined cards by 12-19 digits and Luhn; issuer ranges go stale and a stale table leaks. | A mistyped card fails Luhn and leaks; about 1 in 10 random 12-19 digit IDs passes Luhn and is redacted. |
| **SSN: strict `ddd-dd-dddd` shape, no context.** | The brief names that format; the shape plus value rules is strong evidence. | SSNs without dashes leak; part numbers in the same shape are redacted. |
| **IP_ADDRESS: one negative context.** A dotted quad right after `version`, `section`, `table`, … is not an address, if every octet is below 100. | `Version 1.2.3.4` must not be corrupted. | A real address with every octet below 100 right after such a word is not redacted. |
| **DATE_OF_BIRTH requires a label** (`DOB:`, `born on`, 32 labels) directly before the date, or `(DOB)` after it; only the date is replaced. | The brief: "dates in explicitly recognizable date-of-birth contexts". A bare date is not a date of birth. | Other words between label and date leak (`born in Chicago on …`); English month names only. |
| **Union overlap rule.** Overlapping spans are merged; the region takes the highest-priority type (`CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE`). | Dropping the lower-priority span left identifying fragments (`john.[SSN]@example.com`). | The placeholder names only the most sensitive type (`[SSN]`, not `[EMAIL]`), and counts record one region. |
| **No Unicode normalisation; offsets are UTF-16 code units; guards read code points.** | Normalising (NFKC) or lower-casing can change string length and shift every later offset. | Fullwidth digits, Arabic-Indic digits and look-alike `＠` are not detected. |
| **Data in `src/data`.** Keywords, labels, month names, separators, limits, the deny list and the country table are named constants. | They can be corrected or extended without touching any rule; the country table is checked against its document by a test. | None worth noting; the rules read slightly less like one regex. |
| **Safe errors for strong evidence, precision for weak evidence.** Validated shapes are redacted even when they might be test data; bare digits need context. | For a privacy tool, over-redaction is the safer error, but redacting every number would destroy the dataset. | Documented over-redactions (L-rows in each rule document). |

## Changes after implementation

Three rules were tightened after the first implementation, each with its own rows in the rule document. **IP_ADDRESS:** a version word protects a dotted quad only when every octet is below 100, so `Version 192.168.1.1` is now redacted; version strings with a part of 100 or more are redacted too (the safe error), and real addresses with every octet below 100 directly after a version word still leak. **DATE_OF_BIRTH:** a date at the start of the line after a `Label:` line is redacted (`DOB:⏎05/12/1990`); tables without a colon, and CSV columns, still leak. **PHONE:** possessive phrases (`my number`, `your number`, …) count as a phone word, so `My number 4155550134` is redacted; "your number 4155550134" in a non-phone sense would be redacted too (the safe error).

**PHONE, later fix:** a CJK keyword needs no word boundary (like the DATE_OF_BIRTH CJK labels), so `患者电话：13800138000` is redacted; a longer CJK word that merely ends in `电话` or `手机` would count as a phone word too (the safe error).

## Main limitations

Across all six rules (each document lists every limitation with an example):

- **Formats outside the documented ones leak**: SSNs without dashes, defanged IPs, obfuscated emails, non-English month names, non-ASCII digits.
- **Context-gated rules need the context on the same line** (except a date of birth on the line after `Label:`): bare phone numbers and dates of birth in tables or CSV columns leak.
- **Validated shapes are redacted whatever they really are**: Luhn-valid IDs, SSN-shaped part numbers, version-like dotted quads without a keyword.
- **Names, addresses and free-text identifiers are not detected**: the output is de-identified for the six types only.
- **Reference data ages**: the phone country table (2016) and the email file-extension deny list (checked against a January 2025 IANA copy).

## Potential improvements

- **Strict card mode** with issuer (IIN) ranges, to cut Luhn false positives on IDs and timestamps.
- **Live IANA TLD list** as an optional switch for the email TLD check and the deny list.
- **More month-name languages** for dates of birth (German, French, Spanish, …), as a data table.
- **Configurable rules**: load keyword lists, labels and limits from a configuration file per dataset.
- **Name detection** after explicit labels (`Patient Name:`), as an opt-in entity.
- **Batch processing** exists as a first step (`POST /deidentify/batch`, stretch goal); a streaming or CSV-aware version would scale it to whole files.
- **Caller-supplied column hints for CSV data** ("column 3 is a phone number"), so bare values in labelled columns can be redacted without a context word on the same line.
- **Context-gated SSN forms** (`SSN: 123 45 6789`, `SSN: 123456789`), like the PHONE Tier B gate.
