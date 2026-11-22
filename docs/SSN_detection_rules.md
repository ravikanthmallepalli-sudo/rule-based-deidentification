# SSN detection rules

**Entity:** `SSN` | **Placeholder:** `[SSN]` | **Spec version:** 1.0
**Status:** rules complete and **verified** (see §10). Every example in this document was executed, not just written.
**Basis:** the brief says "US Social Security numbers in the format XXX-XX-XXXX". The task giver gave no extra clarification for SSN, so the format is taken literally (3-2-4 digits joined by dashes) and everything beyond it is an explicit decision (§3) or an open question (O1-O3).

---

## 0. Summary (read this first)

- The detector looks for **exactly three digits, a dash, two digits, a dash, four digits** (`123-45-6789`). Nothing else is an SSN: bare nine-digit numbers, space-separated and dot-separated forms are **out of scope** (L1, open decision O2).
- It accepts the **Unicode dash look-alikes** that Word and PDF text often contains (en dash, minus sign and so on), and mixed dashes in one number (D2).
- It applies **light value rules**: area `000` and `666`, group `00` and serial `0000` can never be assigned, so they are left alone. Area `900-999` is **accepted** because those numbers are taxpayer IDs (ITIN) that are just as sensitive (D3, open decision O1).
- **No context words are needed and none are used.** `Order 123-45-6789 shipped` is redacted, and so is a number with no label at all. The shape is distinctive enough, and the safe error for a privacy tool is to redact too much (D4, L5).
- **Guards** keep the rule out of longer numbers and identifiers: no digit, letter, mark or underscore glued to the number, no hyphen-and-digit or decimal point continuing it (`12-123-45-6789`, `123-45-6789-12`, `123-45-6789.5`).
- It protects the surrounding text: punctuation, brackets, quotes, labels (`SSN:`), line breaks, emoji and a sentence-final period stay exactly as written (`My SSN is 123-45-6789.` → `My SSN is [SSN].`).
- **Three open decisions** (O1, O2, O3) are in §3. O1 and O2 use the recommended option. O3 was a **gap found while writing this document**; it is **resolved** in the shared resolver (`SERVICE_AND_RESOLVER_rules.md` §4: overlapping spans are merged).
- Everything the detector deliberately does **not** do is listed in §8 with an example and a reason.

> **Honest scope statement.** "Nothing missed" is achievable for the *declared scope* (§1) and the *documented limitations* (§8): every gap is named. No rule-based detector can catch every way a person writes an SSN; this one catches the hyphenated format and is explicit about the rest. The most important gaps: an SSN written **without dashes leaks** (L1), and any valid-looking `ddd-dd-dddd` number is **redacted whatever it really is** (L5).

---

## 1. Scope

### 1.1 In scope

| Kind of number | Handled? | Example |
|---|---|---|
| Three digits, dash, two digits, dash, four digits | Yes | `123-45-6789` |
| Any dash look-alike: hyphen-minus, U+2010 to U+2015, minus sign U+2212 | Yes | `123–45–6789` (en dashes) |
| Mixed dashes in one number | Yes | `123-45–6789` |
| Any area 001-899 except 666, and area 900-999 | Yes | `078-05-1120`, `900-70-1234` |
| Well-known fake or advertising numbers | Yes | `123-45-6789`, `219-09-9999`, `987-65-4321` |
| Repeated digits | Yes | `111-11-1111` |
| Inside punctuation, markup, JSON, URLs, query strings | Yes | `{"ssn":"123-45-6789"}`, `ssn=123-45-6789&x=1` |
| Several numbers in a list or a line | Yes, each replaced | `123-45-6789, 987-65-4321`, `123-45-6789/987-65-4321` |
| Next to a label | Yes, the label stays | `SSN: 123-45-6789` → `SSN: [SSN]` |

### 1.2 Out of scope (see §8 for reasons)

Bare nine-digit numbers, space- or dot-separated groups, numbers with spaces around the dashes, non-ASCII digits, masked numbers (`***-**-6789`), the last four digits on their own, other tax IDs (EIN `12-3456789`), non-US national IDs, and every other entity type.

---

## 2. Terminology

| Term | Meaning |
|---|---|
| **Area / group / serial** | The three parts of an SSN: the first three digits, the middle two, the last four. |
| **Dash** | Exactly one of: hyphen-minus `-`, U+2010 hyphen, U+2011 non-breaking hyphen, U+2012 figure dash, U+2013 en dash, U+2014 em dash, U+2015 horizontal bar, U+2212 minus sign. |
| **Candidate** | Eleven characters: 3 ASCII digits, dash, 2 ASCII digits, dash, 4 ASCII digits. |
| **Letter-like** | A Unicode letter (`\p{L}`), any other Unicode number (`\p{N}`, ASCII digits aside), a combining mark (`\p{M}`) or `_`. |
| **Span** | `{ type: "SSN", start, end }`, offsets (UTF-16 code units) into the original string. A span is always 11 code units long. |
| **Left / right guard** | A check on the character just before / just after the candidate (§5.3). |

---

## 3. Design decisions and why

| # | Decision | Reason |
|---|---|---|
| D1 | **Strict hyphenated shape only**: 3-2-4 ASCII digits joined by dashes. | The brief names the format `XXX-XX-XXXX`. Bare nine-digit numbers are order IDs, account numbers and phone digits far more often than SSNs. Cost: an SSN written another way **leaks** (L1). See O2. |
| D2 | **Dash look-alikes are accepted, and the two dashes may differ.** | Text copied from Word, PDF or a web page often turns hyphens into en dashes or minus signs. Same set the PHONE and CREDIT_CARD detectors use, without their space types. The shape is strict, so this adds almost no false positives. |
| D3 | **Value rules: reject only what can never be assigned.** Area `000` and `666`, group `00`, serial `0000` are rejected. Everything else is accepted, **including area 900-999**. | 000, 666, 00 and 0000 are not assigned under any scheme, so rejecting them costs no leak. 900-999 are not SSNs but **ITIN** taxpayer numbers, which are as sensitive; redacting them is the safe error. No table of issued areas or groups is used (stale-table risk, L14). See O1. |
| D4 | **No context is required and none is used.** | The 3-2-4 hyphenated shape plus value rules is strong evidence on its own. A label next to it (`SSN:`) is not needed and a different word (`Order`, `Part`) does not stop the match (L5). |
| D5 | **No repeated-digit rule and no list of known fake numbers.** | `123-45-6789`, `111-11-1111`, `078-05-1120` are what people paste as test data, and test data in a real dataset still has to be cleaned. Redacting them is the safe error (L15). |
| D6 | **Guards** (§5.3): the candidate may not touch a digit, letter, other Unicode number, combining mark or `_`; may not be continued by a dash and a digit; may not be joined to more digits by a decimal point. **Other characters do not block**: `# $ : / = @ + * % ! ?`, brackets, quotes, whitespace, emoji. | Keeps `ID123-45-6789`, hex-like tokens, `12-123-45-6789`, `123-45-6789-12` and `123-45-6789.5` out, while `Card #123-45-6789`, `x/123-45-6789/y` and `123-45-6789/987-65-4321` still match. Unlike PHONE, a slash does not block: a list of two numbers separated by `/` must not leak. |
| D7 | **ASCII digits only; no Unicode normalisation.** | Normalising (e.g. NFKC) can change string length and shift offsets, which would risk corrupting unrelated text. Cost: L7. |
| D8 | **Guards read neighbouring code points**, not code units. | An emoji or an astral letter next to the number must not be misread as two separate characters (SF61, SF62, SC18). |
| D9 | **The span is fixed-width (11 code units) and spans of this detector can never overlap each other.** | A second candidate would have to start inside the first, and its left guard always fails there (the character before it is a digit, or a dash after a digit). Fuzzing confirmed it (§10). No internal overlap resolution is needed; the shared resolver still sorts. |
| D10 | **Priority: rank 2.** `CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE`. | Agreed global order (§7). Value rules and strict shape make SSN the second most reliable detector. |
| D11 | **The whole number is replaced; the last four digits are not kept.** | The brief asks for entity-specific placeholders, not partial masks. |
| D12 | Single pass. | Simple and predictable. Re-running on the output changed nothing in 80,000 random inputs (§10). |

### Open decisions for you

| # | Question | My recommendation |
|---|---|---|
| O1 | **Which values count as "not an SSN"?** (a) *default*: reject area 000 and 666, group 00, serial 0000, accept 900-999; (b) *shape only*: redact every `ddd-dd-dddd`, including `000-00-0000`; (c) *strict SSA*: also reject 900-999, which leaves ITINs and the `987-65-432x` advertising numbers unredacted. All three run (SC01-SC03). | Keep (a). It never leaks a real number (the rejected values cannot be assigned) and it stays safe for ITINs. The rejected values are one constant, so switching is a one-line change. |
| O2 | **Should spaced (`123 45 6789`) and bare (`123456789`) forms be added?** If yes, they would need a context gate like PHONE Tier B: a bare nine-digit run without a nearby `SSN` / `Social Security` word would redact every order and account number (SC04 shows it). | Not now. The brief says the format is `XXX-XX-XXXX`. Mention it in the README as a future improvement. If you want it, I would add a context-gated tier and a second test table. |
| O3 | **Partial overlap with a lower-priority span.** When another detector's span partly overlaps an SSN span, the agreed rule keeps the SSN span and **drops the other span completely**, so its remaining characters stay in the output. Example: `john.123-45-6789@example.com` becomes `john.[SSN]@example.com` (SC14): `john.` and `@example.com` identify a person and are left behind. The same mechanism applies to a phone number with an SSN-shaped tail (§7) and to CREDIT_CARD O1. | Settle this in the **resolver document**, not per detector. Proposal: when spans of different types overlap, replace the **union** with the placeholder of the higher-priority type. Nothing of any detected value is left behind (the same principle as CREDIT_CARD D5). **Resolved (22 Nov 2026): adopted, see `SERVICE_AND_RESOLVER_rules.md` §4.** |

---

## 4. Algorithm

1. **Input:** a string (type/emptiness checks are the service layer's job; an empty string yields no spans).
2. For every index `i` where the text matches `ddd D dd D dddd` (ASCII digits, `D` a dash from §2):
   1. **Value rules** (§5.2): reject area `000` / `666`, group `00`, serial `0000`.
   2. **Left guard** (§5.3).
   3. **Right guard** (§5.3).
   4. Emit `{ type: "SSN", start: i, end: i + 11 }`.
3. Detection never edits text. The replacer (separate module) copies untouched text between spans and inserts `[SSN]`.

### Constants

| Constant | Value |
|---|---|
| Shape | 3 digits, dash, 2 digits, dash, 4 digits (ASCII `0-9`) |
| Dash set | `-` U+2010 U+2011 U+2012 U+2013 U+2014 U+2015 U+2212 |
| Rejected values | area `000`, `666`; group `00`; serial `0000` |
| Guard character classes | `\p{L}`, `\p{N}`, `\p{M}`, `_` |
| Span length | 11 UTF-16 code units |

---

## 5. Rule specifications

### 5.1 Shape

Exactly three ASCII digits, one dash, exactly two ASCII digits, one dash, exactly four ASCII digits. The two dashes may be different characters. No space, dot, slash, comma, colon, underscore, tab or newline may appear inside the number, and the dashes must not be doubled (`123--45-6789`).

### 5.2 Value rules (D3)

| Part | Rejected value | Why |
|---|---|---|
| Area (first 3) | `000`, `666` | Never assigned. |
| Group (middle 2) | `00` | Never assigned. |
| Serial (last 4) | `0000` | Never assigned. |

Everything else passes, including `900-999` (ITIN and similar), the advertising range `987-65-4320` to `4329`, and all-same-digit numbers (D5). Only these four values are checked, not the SSA's lists of issued areas and groups (L14).

### 5.3 Guards (D6)

**Left guard.** The code point right before the first digit must **not** be:
- an ASCII digit;
- a letter, any other Unicode number, a combining mark or `_`;
- a dash when the code point before that dash is an ASCII digit (`12-123-45-6789`: the number is the tail of a longer one);
- a `.` when the code point before it is an ASCII digit (`1.123-45-6789`: a decimal).

**Right guard.** The code point right after the last digit must **not** be:
- an ASCII digit;
- a letter, any other Unicode number, a combining mark or `_`;
- a dash followed by an ASCII digit (`123-45-6789-12`);
- a `.` followed by an ASCII digit (`123-45-6789.5`).

**Does not block:** whitespace (all kinds), `# $ % : ; , / = @ + * ! ? ~ & ' "`, brackets, dashes that do not form a digit-dash continuation (`—123-45-6789`, `123-45-6789-X`), emoji, zero-width characters, symbols such as `№` and `…`. A sentence-final period is fine (`123-45-6789.` → `[SSN].`).

### 5.4 What stays outside the span

Everything that is not the eleven characters: the label (`SSN:`), the name, punctuation, a trailing dash (`123-45-6789-` → `[SSN]-`), a dash followed by a letter (`123-45-6789-X` → `[SSN]-X`), and all whitespace.

---

## 6. Punctuation and layout behaviour

| Situation | Result |
|---|---|
| Sentence end: `My SSN is 123-45-6789.` | `My SSN is [SSN].` |
| Brackets, quotes, JSON, markup | delimiters stay |
| Lists separated by `,` `;` `/` `\|` or a newline or a space | each number replaced separately |
| Label before the number (`SSN: `, `SSN#`, `SSN=`) | label stays |
| Line breaks (`\n`, `\r\n`), tabs, NBSP, emoji, accents, CJK, zero-width characters | preserved byte for byte |
| Same number repeated | every occurrence replaced; count = number of occurrences |
| Two numbers glued together or joined by a single hyphen or dot | **not** replaced (L2, L3) |

---

## 7. Interaction with other entities

Agreed priority: **CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE**. Only CREDIT_CARD outranks SSN.

| Situation | Result | Note |
|---|---|---|
| `Phone: 123-45-6789` | `Phone: [SSN]` | PHONE leaves this unchanged (PHONE F46: SSN-shaped chains are excluded); SSN has no context requirement and redacts it (SL11). |
| `SSN 123-45-6789` | `SSN [SSN]` | PHONE F04 leaves it unchanged. |
| `123-45-6789@example.com` | SSN only: `[SSN]@example.com`; all enabled: `[SSN]` | SSN-only run executed (SL10). With EMAIL enabled the EMAIL span contains the SSN span and the resolver's union rule replaces the whole address with `[SSN]` (O3, `SERVICE_AND_RESOLVER_rules.md` SI06; derived, not executed). |
| `john.123-45-6789@example.com` | SSN only: `john.[SSN]@example.com`; all enabled: `[SSN]` | SSN-only run executed (SC14). With EMAIL enabled the union rule leaves nothing of the address behind (O3 resolved, `SERVICE_AND_RESOLVER_rules.md` SI07; derived, not executed). |
| `+62 812 123-45-6789` | PHONE span `+62 812 123-45-6789`, SSN span `123-45-6789` | **Derived from the PHONE rules, not executed** (Indonesia: 12 national digits, inside the 7-12 range). Under the union rule the whole region becomes `[SSN]` (`SERVICE_AND_RESOLVER_rules.md` SI16; derived, not executed). |
| `4111 1111 1111 1111 123-45-6789` | not executed | A card chain running directly into an SSN can make a card window overlap the SSN's first group. CREDIT_CARD wins and the rest of the SSN stays. Needs an **integration test** once both detectors exist. |
| Dates (`2024-05-12`, `DOB: 12-05-1990`), IPv4, phone numbers (`415-555-0134`), ZIP+4 | unchanged by SSN | Different digit groupings (SF27-SF30, SF33, SF34). |

**Cross-check (§10):** the SSN detector was run over **1,080 strings** (every backtick-quoted cell of the PHONE, EMAIL and CREDIT_CARD test tables, de-duplicated per document). It matched exactly three: PHONE F04 (`SSN 123-45-6789`), PHONE F46 (`Phone: 123-45-6789`) and CREDIT_CARD CF26 (`123-45-6789`). All three contain a real SSN-shaped number. No phone number, email address, card, date, IP, UUID, ISBN or timestamp row is touched.

---

## 8. Known limitations (explicit, with reasons)

| # | Limitation | Example | Why accepted / mitigation |
|---|---|---|---|
| L1 | **Only the hyphenated shape is detected.** An SSN written with spaces, dots or no separators **leaks**, even with a label. | `SSN: 123456789`, `SSN 123 45 6789`, `123.45.6789` stay (SL01, SL02, SF01-SF03) | D1. Bare nine-digit runs are too common (SC04). Mitigation: O2. |
| L2 | A number inside a **longer hyphen- or dot-joined digit string** is not detected, and **two numbers joined by one hyphen or dot are both missed**. | `12-123-45-6789`, `123-45-6789-12`, `123-45-6789-987-65-4321`, `123-45-6789.987-65-4321`, `Call 415-123-45-6789` stay (SF22-SF24, SL04, SC08, SC12) | D6. Without the guard, parts of longer identifiers would be redacted. Numbers separated by comma, semicolon, slash, space or newline work. |
| L3 | A number **glued to letters, digits, underscore or a combining mark** is not detected. | `SSN123-45-6789`, `ID123-45-6789`, `123-45-6789abc`, `123-45-6789123-45-6789` stay (SF17-SF21, SL05, SM07) | D6: keeps hex tokens and identifiers out. Cost: a number glued to its label leaks. |
| L4 | **No script awareness**: a number glued to CJK or other letters without a space is missed. | `社会保障番号123-45-6789です` stays (SL06) | Same guard as L3; the guard cannot tell a space-less script from a glued identifier. Future: allow a number next to Han / Kana / Thai letters. |
| L5 | **Over-redaction.** Any valid-looking `ddd-dd-dddd` is redacted whatever it really is: part numbers, order numbers, URL path segments, ITINs, fake and advertising numbers. | `Part 123-45-6789`, `Order 123-45-6789 shipped`, `ABC-123-45-6789-DEF`, `/users/123-45-6789/profile` (SL07-SL09, SL11, SL13) | D4, D5: the safe error for a privacy tool. |
| L6 | **Never-assigned values are not redacted.** A real SSN with a typo that lands on `000`, `666`, `00` or `0000` leaks. | `SSN: 123-45-0000` stays (SL12) | D3: those values are not real numbers. Option O1(b) redacts them too. |
| L7 | **Non-ASCII digits and the fullwidth hyphen-minus** are not detected. | `٣٢١-٤٥-٦٧٨٩`, `１２３-４５-６７８９`, `123－45－6789` stay (SF42, SF43, SC16) | D7: normalising shifts offsets. |
| L8 | Spaces around the dashes, doubled dashes, and newlines or tabs inside the number are not joined. | `123 - 45 - 6789`, `123--45-6789`, `123⏎45⏎6789` stay (SF38, SF39, SF48-SF51, SL03) | D1: joining would merge unrelated cells and lines. |
| L9 | **Masked or partial numbers** are not detected, so the last four digits of a masked number stay. | `***-**-6789`, `XXX-XX-6789` stay (SF56) | Not an SSN; the other digits are already gone. |
| L10 | **Other tax and national IDs** are out of scope. | EIN `12-3456789` stays (SF55) | The brief asks for US SSNs only. |
| L11 | **Only the digits are replaced.** Labels, names and any other personal details around the number stay. | `Name: John Doe, SSN: [SSN]` (SS50) | By design (D11). Names are out of core scope. |
| L12 | **SSN-only runs leave the rest of a containing value.** With only SSN enabled, the rest of an address or phone number around the SSN stays; with the other detector enabled, the resolver's union rule removes it but the placeholder is `[SSN]`, not `[EMAIL]` / `[PHONE]`. | SSN only: `john.123-45-6789@example.com` → `john.[SSN]@example.com` (SC14); all enabled: `[SSN]` | O3 resolved in `SERVICE_AND_RESOLVER_rules.md` §4: nothing is left behind; the label names the most sensitive type. |
| L13 | The dash-continuation and decimal guards look at **ASCII digits only**. | `٣-123-45-6789` → `٣-[SSN]` (SC07) | D7. Harmless over-redaction. |
| L14 | Value rules are **structural only**; SSA's issued area and group lists are not used. | Every area 001-899 except 666 is accepted | D3: such lists change and a stale list would cause leaks. |
| L15 | **No known-fake list.** Published and advertising numbers are redacted. | `078-05-1120`, `219-09-9999`, `987-65-4321` → `[SSN]` (SS04, SS05, SS11) | D5. |

---

## 9. Test matrix (every row was executed)

Legend: `⏎` = newline, `⇥` = tab, `\r⏎` = CRLF, `<NBSP>` `<HY>` `<NBH>` `<FIG>` `<EN>` `<EM>` `<BAR>` `<MINUS>` `<ZWSP>` `<RLM>` `<COMB>` `<IDSP>` = the corresponding Unicode characters (no-break space, U+2010 hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar, minus sign, zero-width space, right-to-left mark, combining acute accent, ideographic space). In every row only `SSN` is enabled. The **Output** column was produced by the run, not typed by hand.

### SS-series: numbers that must be redacted (62 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| SS01 | `123-45-6789` | `[SSN]` | Canonical format |
| SS02 | `SSN: 123-45-6789` | `SSN: [SSN]` | The label stays; only the number is replaced |
| SS03 | `My SSN is 123-45-6789.` | `My SSN is [SSN].` | Sentence-final period stays |
| SS04 | `078-05-1120` | `[SSN]` | Historic published number: valid structure |
| SS05 | `219-09-9999` | `[SSN]` | SSA advertising number: valid structure |
| SS06 | `001-01-0001` | `[SSN]` | Lowest valid area, group and serial |
| SS07 | `899-99-9999` | `[SSN]` | Highest area below 900 |
| SS08 | `665-12-3456` | `[SSN]` | Area just below 666 |
| SS09 | `667-12-3456` | `[SSN]` | Area just above 666 |
| SS10 | `900-70-1234` | `[SSN]` | Area 9xx accepted (ITIN-style, D3 / O1) |
| SS11 | `987-65-4321` | `[SSN]` | Reserved advertising range: accepted (D3) |
| SS12 | `999-99-9999` | `[SSN]` | Highest 9xx number: accepted (D3 / O1) |
| SS13 | `111-11-1111` | `[SSN]` | Repeated digits are accepted (D5) |
| SS14 | `123<HY>45<HY>6789` | `[SSN]` | U+2010 hyphen |
| SS15 | `123<NBH>45<NBH>6789` | `[SSN]` | U+2011 non-breaking hyphen |
| SS16 | `123<FIG>45<FIG>6789` | `[SSN]` | U+2012 figure dash |
| SS17 | `123<EN>45<EN>6789` | `[SSN]` | U+2013 en dash |
| SS18 | `123<EM>45<EM>6789` | `[SSN]` | U+2014 em dash |
| SS19 | `123<BAR>45<BAR>6789` | `[SSN]` | U+2015 horizontal bar |
| SS20 | `123<MINUS>45<MINUS>6789` | `[SSN]` | U+2212 minus sign |
| SS21 | `123-45<EN>6789` | `[SSN]` | Mixed separators |
| SS22 | `(123-45-6789)` | `([SSN])` | Brackets stay |
| SS23 | `"123-45-6789"` | `"[SSN]"` | Quotes stay |
| SS24 | `[123-45-6789]` | `[[SSN]]` | Square brackets stay |
| SS25 | `<123-45-6789>` | `<[SSN]>` | Angle brackets stay |
| SS26 | `{"ssn":"123-45-6789"}` | `{"ssn":"[SSN]"}` | JSON |
| SS27 | `ssn=123-45-6789&x=1` | `ssn=[SSN]&x=1` | Query string |
| SS28 | `SSN:123-45-6789` | `SSN:[SSN]` | No space after the colon |
| SS29 | `SSN#123-45-6789` | `SSN#[SSN]` | `#` does not block (D6) |
| SS30 | `SSN-123-45-6789` | `SSN-[SSN]` | A hyphen after a word is not part of the number |
| SS31 | `Social Security Number: 123-45-6789` | `Social Security Number: [SSN]` | Long label stays |
| SS32 | `😀123-45-6789😀` | `😀[SSN]😀` | Emoji directly adjacent |
| SS33 | `Line1⏎123-45-6789⏎Line3` | `Line1⏎[SSN]⏎Line3` | Line breaks preserved |
| SS34 | `Call\r⏎123-45-6789\r⏎next` | `Call\r⏎[SSN]\r⏎next` | CRLF preserved |
| SS35 | `Tab⇥123-45-6789⇥end` | `Tab⇥[SSN]⇥end` | Tabs preserved |
| SS36 | `123-45-6789, 987-65-4321` | `[SSN], [SSN]` | Comma-separated list |
| SS37 | `123-45-6789;987-65-4321` | `[SSN];[SSN]` | Semicolon-separated list |
| SS38 | `123-45-6789/987-65-4321` | `[SSN]/[SSN]` | Slash-separated list (differs from PHONE, D6) |
| SS39 | `123-45-6789 987-65-4321` | `[SSN] [SSN]` | Space-separated list |
| SS40 | `123-45-6789⏎987-65-4321` | `[SSN]⏎[SSN]` | Newline-separated list |
| SS41 | `123-45-6789 123-45-6789 123-45-6789` | `[SSN] [SSN] [SSN]` | Every occurrence replaced |
| SS42 | `$123-45-6789` | `$[SSN]` | `$` does not block (D6) |
| SS43 | `#123-45-6789` | `#[SSN]` | `#` before the number does not block (D6) |
| SS44 | `ID:123-45-6789` | `ID:[SSN]` | Colon before the number |
| SS45 | `123-45-6789,` | `[SSN],` | Trailing comma stays |
| SS46 | `123-45-6789's` | `[SSN]'s` | Possessive stays |
| SS47 | `<ZWSP>123-45-6789<ZWSP>` | `<ZWSP>[SSN]<ZWSP>` | Zero-width spaces preserved |
| SS48 | `123-45-6789<RLM>` | `[SSN]<RLM>` | Right-to-left mark preserved |
| SS49 | `123-45-6789<NBSP>ok` | `[SSN]<NBSP>ok` | NBSP preserved |
| SS50 | `Name: John Doe, SSN: 123-45-6789, DOB: 1990-05-12` | `Name: John Doe, SSN: [SSN], DOB: 1990-05-12` | Name and DOB belong to other detectors |
| SS51 | `a.123-45-6789` | `a.[SSN]` | A period after a letter is not a decimal point |
| SS52 | `x/123-45-6789/y` | `x/[SSN]/y` | Slashes do not block (L5) |
| SS53 | `123-45-6789-` | `[SSN]-` | Trailing dash without a digit after it |
| SS54 | `-123-45-6789` | `-[SSN]` | Leading dash not preceded by a digit |
| SS55 | `123-45-6789-X` | `[SSN]-X` | Dash followed by a non-digit |
| SS56 | `Résumé <EM> SSN: 123<EN>45<EN>6789 <EM> café ☕` | `Résumé <EM> SSN: [SSN] <EM> café ☕` | En dashes inside; accents and symbols untouched |
| SS57 | `123-45-6789 - 987-65-4321` | `[SSN] - [SSN]` | Spaced dash between two numbers |
| SS58 | `+123-45-6789` | `+[SSN]` | A `+` before the number does not block (D6) |
| SS59 | `123-45-6789:` | `[SSN]:` | Colon after |
| SS60 | `Total<EM>123-45-6789<EM>paid` | `Total<EM>[SSN]<EM>paid` | Em dashes around the number |
| SS61 | `123-45-6789%` | `[SSN]%` | Percent sign after |
| SS62 | `x 123-45-6789<IDSP>y` | `x [SSN]<IDSP>y` | Ideographic space preserved |

### SF-series: strings that must stay unchanged (63 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| SF01 | `123456789` | `123456789` | Bare 9 digits: out of scope (L1) |
| SF02 | `123 45 6789` | `123 45 6789` | Spaces: out of scope (L1) |
| SF03 | `123.45.6789` | `123.45.6789` | Dots: out of scope (L1) |
| SF04 | `123-456-789` | `123-456-789` | Grouping 3-3-3 |
| SF05 | `12-345-6789` | `12-345-6789` | Grouping 2-3-4 |
| SF06 | `123-4-56789` | `123-4-56789` | Grouping 3-1-5 |
| SF07 | `1234-56-7890` | `1234-56-7890` | First group has 4 digits (digit guard) |
| SF08 | `123-45-67890` | `123-45-67890` | Serial has 5 digits (digit guard) |
| SF09 | `123-45-678` | `123-45-678` | Serial has 3 digits |
| SF10 | `123-45-` | `123-45-` | Truncated |
| SF11 | `23-45-6789` | `23-45-6789` | Area has 2 digits |
| SF12 | `000-12-3456` | `000-12-3456` | Area 000 is never assigned (D3) |
| SF13 | `666-12-3456` | `666-12-3456` | Area 666 is never assigned (D3) |
| SF14 | `123-00-4567` | `123-00-4567` | Group 00 is never assigned (D3) |
| SF15 | `123-45-0000` | `123-45-0000` | Serial 0000 is never assigned (D3) |
| SF16 | `000-00-0000` | `000-00-0000` | All zeros |
| SF17 | `ID123-45-6789` | `ID123-45-6789` | Letters glued before the number (L3) |
| SF18 | `123-45-6789abc` | `123-45-6789abc` | Letters glued after the number (L3) |
| SF19 | `_123-45-6789` | `_123-45-6789` | Underscore before |
| SF20 | `123-45-6789_` | `123-45-6789_` | Underscore after |
| SF21 | `a123-45-6789b` | `a123-45-6789b` | Letters on both sides |
| SF22 | `12-123-45-6789` | `12-123-45-6789` | Preceded by a digit and a dash: part of a longer number (L2) |
| SF23 | `123-45-6789-12` | `123-45-6789-12` | Followed by a dash and a digit: part of a longer number (L2) |
| SF24 | `123-45-6789-0000` | `123-45-6789-0000` | Followed by a dash and digits (L2) |
| SF25 | `1.123-45-6789` | `1.123-45-6789` | Digits after a decimal point |
| SF26 | `123-45-6789.5` | `123-45-6789.5` | Decimal point followed by a digit |
| SF27 | `415-555-0134` | `415-555-0134` | Phone shape 3-3-4 (belongs to PHONE) |
| SF28 | `94105-1234` | `94105-1234` | ZIP+4 |
| SF29 | `2024-05-12` | `2024-05-12` | ISO date |
| SF30 | `12-05-1990` | `12-05-1990` | Day-first date |
| SF31 | `978-3-16-148410-0` | `978-3-16-148410-0` | ISBN-13 with hyphens |
| SF32 | `123e4567-e89b-12d3-a456-426614174000` | `123e4567-e89b-12d3-a456-426614174000` | UUID |
| SF33 | `192.168.1.1` | `192.168.1.1` | IPv4 |
| SF34 | `+1 415 555 0134` | `+1 415 555 0134` | Phone with country code |
| SF35 | `4111 1111 1111 1111` | `4111 1111 1111 1111` | Card number |
| SF36 | `123,45,6789` | `123,45,6789` | Comma is not a separator |
| SF37 | `123/45/6789` | `123/45/6789` | Slash is not a separator |
| SF38 | `123⏎45⏎6789` | `123⏎45⏎6789` | Newline is never a separator |
| SF39 | `123⇥45⇥6789` | `123⇥45⇥6789` | Tab is never a separator |
| SF40 | `123_45_6789` | `123_45_6789` | Underscore is not a separator |
| SF41 | `123:45:6789` | `123:45:6789` | Colon is not a separator |
| SF42 | `٣٢١-٤٥-٦٧٨٩` | `٣٢١-٤٥-٦٧٨٩` | Arabic-Indic digits: ASCII only (L7) |
| SF43 | `１２３-４５-６７８９` | `１２３-４５-６７８９` | Fullwidth digits: ASCII only (L7) |
| SF44 | `123-45-6789<COMB>` | `123-45-6789<COMB>` | Combining mark glued after the number |
| SF45 | `123-45-6789²` | `123-45-6789²` | Superscript digit glued after (a Unicode number) |
| SF46 | *(empty)* | *(empty)* | Empty input |
| SF47 | `no digits here` | `no digits here` | No digits |
| SF48 | `123 - 45 - 6789` | `123 - 45 - 6789` | Spaces around the dashes (L8) |
| SF49 | `123-45- 6789` | `123-45- 6789` | Space after a dash (L8) |
| SF50 | `123--45-6789` | `123--45-6789` | Double dash (L8) |
| SF51 | `123-45--6789` | `123-45--6789` | Double dash (L8) |
| SF52 | `1234567890` | `1234567890` | 10 digits, no separators |
| SF53 | `Phone: 123-456-7890` | `Phone: 123-456-7890` | Phone shape with a phone word |
| SF54 | `0.123-45-6789` | `0.123-45-6789` | Digits after a decimal point |
| SF55 | `12-3456789` | `12-3456789` | EIN shape 2-7: out of scope (L10) |
| SF56 | `***-**-6789` | `***-**-6789` | Masked number (L9) |
| SF57 | `XXX-XX-XXXX` | `XXX-XX-XXXX` | Format placeholder text |
| SF58 | `é123-45-6789` | `é123-45-6789` | Accented letter glued before |
| SF59 | `Ⅻ123-45-6789` | `Ⅻ123-45-6789` | Roman-numeral character (a Unicode number) glued before |
| SF60 | `123-45-6789٣` | `123-45-6789٣` | Arabic-Indic digit glued after |
| SF61 | `𝐀123-45-6789` | `𝐀123-45-6789` | Astral letter (surrogate pair) glued before: guards read code points |
| SF62 | `123-45-6789𝐀` | `123-45-6789𝐀` | Astral letter (surrogate pair) glued after |
| SF63 | `<COMB>123-45-6789` | `<COMB>123-45-6789` | Combining mark glued before the number |

### SM-series: structure, repetition, layout (12 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| SM01 | `a 123-45-6789 b 123-45-6789 c 123-45-6789` | `a [SSN] b [SSN] c [SSN]` | Three occurrences |
| SM02 | `Contact:⏎  - 123-45-6789⏎  - 987-65-4321` | `Contact:⏎  - [SSN]⏎  - [SSN]` | List with line breaks |
| SM03 | `  123-45-6789  ` | `  [SSN]  ` | Surrounding spaces kept |
| SM04 | `⏎⏎123-45-6789⏎⏎` | `⏎⏎[SSN]⏎⏎` | Blank lines kept |
| SM05 | `Résumé <EM> SSN: 123-45-6789 <EM> café ☕` | `Résumé <EM> SSN: [SSN] <EM> café ☕` | Accents, dashes and symbols untouched |
| SM06 | `日本語 123-45-6789 日本語` | `日本語 [SSN] 日本語` | CJK text with spaces around the number |
| SM07 | `123-45-6789123-45-6789` | `123-45-6789123-45-6789` | Two numbers glued together: neither found (L3) |
| SM08 | `x 123-45-6789 y 000-12-3456 z 987-65-4321` | `x [SSN] y 000-12-3456 z [SSN]` | Valid, invalid and valid in one line |
| SM09 | `SSN: 123-45-6789 and 123-45-6789` | `SSN: [SSN] and [SSN]` | Same number twice |
| SM10 | `{"a":"123-45-6789","b":"987-65-4321"}` | `{"a":"[SSN]","b":"[SSN]"}` | JSON with two numbers |
| SM11 | `<td>123-45-6789</td><td>987-65-4321</td>` | `<td>[SSN]</td><td>[SSN]</td>` | HTML cells |
| SM12 | `123-45-6789⏎123-45-6789⏎` | `[SSN]⏎[SSN]⏎` | Trailing newline kept |

### SL-series: documented limitations (expected = current behaviour) (13 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| SL01 | `SSN: 123456789` | `SSN: 123456789` | L1: bare 9 digits, even with the label |
| SL02 | `SSN 123 45 6789` | `SSN 123 45 6789` | L1: space-separated, even with the label |
| SL03 | `SSN: 123 - 45 - 6789` | `SSN: 123 - 45 - 6789` | L8: spaces around the dashes |
| SL04 | `123-45-6789-987-65-4321` | `123-45-6789-987-65-4321` | L2: two numbers joined by one hyphen: both missed |
| SL05 | `SSN123-45-6789` | `SSN123-45-6789` | L3: label glued to the number |
| SL06 | `社会保障番号123-45-6789です` | `社会保障番号123-45-6789です` | L4: CJK letters glued to the number |
| SL07 | `Part 123-45-6789` | `Part [SSN]` | L5: part-number-like string redacted |
| SL08 | `ABC-123-45-6789-DEF` | `ABC-[SSN]-DEF` | L5: hyphenated product code redacted |
| SL09 | `/users/123-45-6789/profile` | `/users/[SSN]/profile` | L5: URL path segment redacted |
| SL10 | `123-45-6789@example.com` | `[SSN]@example.com` | L12: SSN-shaped email local part (SSN outranks EMAIL) |
| SL11 | `Phone: 123-45-6789` | `Phone: [SSN]` | L5 / §7: a phone word does not stop the SSN rule |
| SL12 | `SSN: 123-45-0000` | `SSN: 123-45-0000` | L6: a mistyped or never-assigned value is not redacted |
| SL13 | `Order 123-45-6789 shipped` | `Order [SSN] shipped` | L5: order-number-like string redacted |

### SA-series: fresh adversarial set, positives (written after the main matrix) (25 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| SA01 | `Patient SSN:123-45-6789;DOB:1990-05-12` | `Patient SSN:[SSN];DOB:1990-05-12` | Colon and semicolon around the number |
| SA02 | `(SSN 123-45-6789)` | `(SSN [SSN])` | Redacted |
| SA03 | `ss# 123-45-6789!` | `ss# [SSN]!` | Exclamation mark stays |
| SA04 | `**123-45-6789**` | `**[SSN]**` | Markdown emphasis |
| SA05 | `123-45-6789?` | `[SSN]?` | Question mark stays |
| SA06 | `A:123-45-6789\|B:987-65-4321` | `A:[SSN]\|B:[SSN]` | Pipe-separated |
| SA07 | `ssn:[123-45-6789]` | `ssn:[[SSN]]` | Square brackets |
| SA08 | `<td>123-45-6789</td>` | `<td>[SSN]</td>` | HTML |
| SA09 | `…123-45-6789…` | `…[SSN]…` | Ellipsis characters |
| SA10 | `№123-45-6789` | `№[SSN]` | Numero sign is a symbol, not a letter |
| SA11 | `ＳＳＮ：123-45-6789` | `ＳＳＮ：[SSN]` | Fullwidth label and colon |
| SA12 | `<NBSP>123-45-6789` | `<NBSP>[SSN]` | Leading NBSP |
| SA13 | `100-10-1000` | `[SSN]` | Valid area 100 |
| SA14 | `SSN is 123-45-6789 (see above).` | `SSN is [SSN] (see above).` | Redacted |
| SA15 | `1: 123-45-6789` | `1: [SSN]` | A digit then a colon and a space |
| SA16 | `Hi,123-45-6789` | `Hi,[SSN]` | Comma directly before |
| SA17 | `see/123-45-6789` | `see/[SSN]` | Slash directly before |
| SA18 | `*123-45-6789` | `*[SSN]` | Asterisk directly before |
| SA19 | `~123-45-6789~` | `~[SSN]~` | Tildes |
| SA20 | `'123-45-6789'` | `'[SSN]'` | Single quotes |
| SA21 | `SSN=123-45-6789;` | `SSN=[SSN];` | Equals sign and semicolon |
| SA22 | `Ref 7 123-45-6789` | `Ref 7 [SSN]` | A short number before, separated by a space |
| SA23 | `2024 123-45-6789 2025` | `2024 [SSN] 2025` | Numbers around, separated by spaces |
| SA24 | `a-123-45-6789-b` | `a-[SSN]-b` | Dashes after letters |
| SA25 | `\r⏎123-45-6789` | `\r⏎[SSN]` | CRLF directly before |

### SG-series: fresh adversarial set, negatives (written after the main matrix) (25 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| SG01 | `ref 123-45-67891` | `ref 123-45-67891` | Serial has 5 digits |
| SG02 | `1123-45-6789` | `1123-45-6789` | Digit glued before |
| SG03 | `123-451-6789` | `123-451-6789` | Group has 3 digits |
| SG04 | `123-45-6789012` | `123-45-6789012` | Serial has 7 digits |
| SG05 | `x123-45-6789` | `x123-45-6789` | Letter before |
| SG06 | `123-45-6789x` | `123-45-6789x` | Letter after |
| SG07 | `1-123-45-6789` | `1-123-45-6789` | Digit and dash before |
| SG08 | `123-45-6789-1` | `123-45-6789-1` | Dash and digit after |
| SG09 | `v123-45-6789` | `v123-45-6789` | Version-like prefix |
| SG10 | `123-45-6789é` | `123-45-6789é` | Accented letter after |
| SG11 | `123-45-6789.0` | `123-45-6789.0` | Decimal tail |
| SG12 | `3.123-45-6789` | `3.123-45-6789` | Decimal head |
| SG13 | `666-45-6789` | `666-45-6789` | Area 666 |
| SG14 | `123-45-0000` | `123-45-0000` | Serial 0000 |
| SG15 | `000-45-6789` | `000-45-6789` | Area 000 |
| SG16 | `123-00-6789` | `123-00-6789` | Group 00 |
| SG17 | `3-45-6789` | `3-45-6789` | Area has 1 digit |
| SG18 | `123<EN>4<EN>56789` | `123<EN>4<EN>56789` | Grouping 3-1-5 with en dashes |
| SG19 | `123-45<EN>67<EN>89` | `123-45<EN>67<EN>89` | Grouping 3-2-2-2 |
| SG20 | `(123) 45-6789` | `(123) 45-6789` | Parenthesis and space: not the SSN shape |
| SG21 | `99-99-9999` | `99-99-9999` | Grouping 2-2-4 |
| SG22 | `12345-6789-12` | `12345-6789-12` | Grouping 5-4-2 |
| SG23 | `0123-45-6789` | `0123-45-6789` | Digit glued before |
| SG24 | `x_123-45-6789` | `x_123-45-6789` | Underscore directly before |
| SG25 | `123-45-6789٣` | `123-45-6789٣` | Arabic-Indic digit directly after |


### SC-series: claim checks (behaviours stated in this document, 19 cases)

| ID | Claim | Input | Output |
|---|---|---|---|
| SC01 | Option O1(c), strict SSA mode: area 9xx is rejected | `900-70-1234 and 899-99-9999` | `900-70-1234 and [SSN]` |
| SC02 | Option O1(b), shape only: never-assigned values are redacted too | `000-12-3456 666-12-3456 123-00-4567 123-45-0000` | `[SSN] [SSN] [SSN] [SSN]` |
| SC03 | Default mode leaves the same four never-assigned values alone | `000-12-3456 666-12-3456 123-00-4567 123-45-0000` | `000-12-3456 666-12-3456 123-00-4567 123-45-0000` |
| SC04 | Option O2: if bare 9-digit runs were accepted, order and account numbers would be redacted (why they need context) | `Account 123456789 and order 987654321 shipped` | `Account [SSN] and order [SSN] shipped` |
| SC05 | Default mode leaves bare 9-digit runs alone | `Account 123456789 and order 987654321 shipped` | `Account 123456789 and order 987654321 shipped` |
| SC06 | A dash character at the very start of the text is not a continuation | `<EM>123-45-6789` | `<EM>[SSN]` |
| SC07 | The dash-continuation guard looks at ASCII digits only: a non-ASCII digit before the dash does not block | `٣-123-45-6789` | `٣-[SSN]` |
| SC08 | Two numbers joined by a dot are both missed (digit-dot-digit guards) | `123-45-6789.987-65-4321` | `123-45-6789.987-65-4321` |
| SC09 | Two numbers separated by a comma are both found | `123-45-6789,987-65-4321` | `[SSN],[SSN]` |
| SC10 | A sentence-final period before a line break is not a decimal point | `Done 123-45-6789.⏎Next` | `Done [SSN].⏎Next` |
| SC11 | A period followed by a space and a number is not a decimal point | `Sent 123-45-6789. 2024 follows` | `Sent [SSN]. 2024 follows` |
| SC12 | An SSN-shaped tail of a longer hyphenated number is left alone | `Call 415-123-45-6789` | `Call 415-123-45-6789` |
| SC13 | A closing bracket is not a guard character: a number directly after `]` is redacted | `[SSN]123-45-6789` | `[SSN][SSN]` |
| SC14 | SSN-shaped part of an email local part is redacted when only SSN is enabled | `john.123-45-6789@example.com` | `john.[SSN]@example.com` |
| SC15 | Five repeated occurrences give five replacements | `123-45-6789 123-45-6789 123-45-6789 123-45-6789 123-45-6789` | `[SSN] [SSN] [SSN] [SSN] [SSN]` |
| SC16 | Unicode normalisation is not applied: a fullwidth hyphen-minus is not a separator | `123－45－6789` | `123－45－6789` |
| SC17 | Surrounding text is returned byte for byte (accents, emoji, CJK, zero-width) | `Zoë 😀 日本語<ZWSP> 123-45-6789 ☕` | `Zoë 😀 日本語<ZWSP> [SSN] ☕` |
| SC18 | Span offsets are UTF-16 code-unit indices; an emoji before the number counts as 2 units | `😀 123-45-6789` | `[[3,14]] (start 3, end 14, length 11)` |
| SC19 | Every span is exactly 11 UTF-16 units long | `x 123-45-6789 y 123<EN>45<EM>6789` | `[[2,13],[16,27]]` |

---

## 10. Verification log

The rules were verified with a throwaway JavaScript reference sketch written from this specification (it is **not** the deliverable implementation). The final TypeScript implementation must pass the same tables in §9 as its unit tests.

### How the checks went (honest history)

1. **Matrix, first run.** The first complete run passed **197 of 197** cases. A clean first run can also mean weak tests, because the expected outputs and the sketch were written from the same specification. The mutation check below is the real test of the tests.
2. **Mutation check found one gap.** Of 28 mutants, **one survived at first**: M14 (drop the left combining-mark guard). No test had a combining mark glued *before* a number. Test SF63 was added; the mutant is now detected. Two further cases (SF61, SF62: astral letters next to a number) were added earlier, when the guards were split per side, to give the code-point mutant M28 something to fail on.
3. **Fuzzing found nothing.** 80,000 random inputs produced 0 exceptions, 0 invariant failures, 0 mismatches with the independent re-implementation and 0 non-idempotent outputs. This does not prove there are no bugs: the re-implementation uses a different technique (one regular expression with look-around) but follows the **same specification**, so a misreading of the specification would affect both.
4. **Recall test passed on its first run.** 30,000 generated texts with 75,077 valid numbers: every number replaced, every other character byte-identical.
5. **Interaction review found a design gap that no test could find.** While writing §7 I checked what happens when another detector's span partly overlaps an SSN span. Under the agreed priority rule the lower-priority span is dropped whole, and its remainder stays in the output (`john.123-45-6789@example.com` → `john.[SSN]@example.com`, SC14). This is recorded as **open decision O3** and limitation L12; it belongs in the resolver.
6. **Cross-check.** The detector was run over every backtick-quoted cell of the PHONE, EMAIL and CREDIT_CARD test tables (1,080 strings, placeholders expanded). It matched exactly three, all real SSN-shaped numbers (§7).

### Checks

1. **Review checklist** against the brief:

| Requirement | Covered by |
|---|---|
| SSN in the format XXX-XX-XXXX | §5.1; series SS (62), SA (25) |
| Different formats of the same entity | Dash look-alikes and mixed dashes (SS14-SS21), labels, brackets, JSON, query strings, lists (SS22-SS41) |
| False positives (ordinary numbers that resemble an SSN) | SF-series (63), SG-series (25), §5.2, §5.3 |
| Multiple occurrences | SS36-SS41, SM01, SM02, SM09, SC15 |
| Overlaps and duplicate replacement | D9; fuzz invariant: spans sorted, non-overlapping, always 11 units; §7 for other entities |
| Punctuation, line breaks, Unicode | SS26-SS35, SS47-SS49, SM05, SM06, SF42-SF45, SF61-SF63, §6 |
| Missing / empty input | detector-level: empty string yields no spans (SF46); `null` / non-string belong to the service layer |
| "Must not silently corrupt unrelated text" | fuzz invariant: rebuilding from untouched slices equals the output; recall test checks surroundings exactly (SC17) |
| Document limitations | §8 (15 entries) |

2. **Fuzzing with an independent re-implementation:** 80,000 random strings built from digits, all eight dashes, dots, commas, slashes, spaces, newlines, tabs, letters in several scripts (Latin, accented, CJK, Cyrillic, Greek), `_ + : # $ @`, quotes, brackets, emoji, NBSP, zero-width and right-to-left marks, combining marks, Arabic-Indic and fullwidth digits, superscripts, Roman numerals, an astral letter, and SSN-shaped fragments with random flaws (wrong group sizes, rejected values). 11,643 inputs contained a match. **0 exceptions; 0 invariant failures** (every span in range, sorted, non-overlapping, exactly 11 units long, strictly of the shape `ddd-dd-dddd`, and rebuilding the output from untouched slices equals the real output). **Differential check:** every input was also run through a separately written finder (one regular expression with look-around guards, plus the value rules): **0 differences**. The same regular expression also passes all 200 matrix rows. **Idempotence probe:** 0 of 80,000 outputs changed when processed again.
3. **Recall test:** 30,000 generated texts with 1-4 valid numbers each (**75,077 numbers**: random areas 001-899 except 666 and some 900-999, random groups and serials, random dashes from all eight), embedded between words (Latin, accented, Cyrillic, CJK, symbols) and gaps (space, comma, semicolon, newline, CRLF, tab, brackets, quotes, pipe, slash, colon, em dash, emoji, NBSP, zero-width space, `=`, `&`, `?`, `!`). **0 failures.**
4. **Mutation check:** twenty-eight deliberate weakenings of the rules; **every one made tests fail**, so the tests really exercise the rules:

| Mutation | Tests that fail |
|---|---|
| M1: accept area 000 | 3 (SF12, SM08, SG15) |
| M2: accept area 666 | 2 (SF13, SG13) |
| M3: accept group 00 | 2 (SF14, SG16) |
| M4: accept serial 0000 | 3 (SF15, SL12, SG14) |
| M5: also reject area 9xx (strict SSA) | 14 (SS10, SS11, SS12, SS36, SS37, SS38, …) |
| M6: drop left digit guard | 4 (SF07, SM07, SG02, SG23) |
| M7: drop right digit guard | 4 (SF08, SM07, SG01, SG04) |
| M8: drop left letter guard | 6 (SF17, SF58, SF61, SL05, SG05, SG09) |
| M9: drop right letter guard | 4 (SF18, SF62, SG06, SG10) |
| M10: drop left non-ASCII-number guard | 1 (SF59) |
| M11: drop right non-ASCII-number guard | 3 (SF45, SF60, SG25) |
| M12: drop left underscore guard | 2 (SF19, SG24) |
| M13: drop right underscore guard | 1 (SF20) |
| M14: drop left combining-mark guard | 1 (SF63) |
| M15: drop right combining-mark guard | 1 (SF44) |
| M16: drop left dash-continuation guard | 3 (SF22, SL04, SG07) |
| M17: drop right dash-continuation guard | 4 (SF23, SF24, SL04, SG08) |
| M18: drop left decimal guard | 3 (SF25, SF54, SG12) |
| M19: drop right decimal guard | 2 (SF26, SG11) |
| M20: hyphen-minus is the only separator | 9 (SS14, SS15, SS16, SS17, SS18, SS19, …) |
| M21: space is a separator | 2 (SF02, SL02) |
| M22: dot is a separator | 1 (SF03) |
| M23: slash is a separator | 1 (SF37) |
| M24: comma is a separator | 1 (SF36) |
| M25: newline and tab are separators | 2 (SF38, SF39) |
| M26: both separators must be the same character | 1 (SS21) |
| M27: accept 9 bare digits | 2 (SF01, SL01) |
| M28: guards read UTF-16 units, not code points | 2 (SF61, SF62) |

5. **Performance / pathological input** (275-325 KB each): worst case **≈40 ms**; no catastrophic backtracking. The scan checks eleven characters per position and a bounded neighbourhood, so it is linear.

| Input (≈ size) | Time | Spans |
|---|---|---|
| 300000 digits in one run (300 KB) | 18 ms | 0 |
| 1-1-1-... (150000) (300 KB) | 6 ms | 0 |
| valid numbers separated by a space (25000) (300 KB) | 23 ms | 25000 |
| valid numbers on separate lines (25000) (300 KB) | 30 ms | 25000 |
| rejected: number + dash + digit chain (25000) (300 KB) | 24 ms | 0 |
| near-misses 123-45-678 (25000) (275 KB) | 11 ms | 0 |
| letters glued before (25000) (325 KB) | 20 ms | 0 |
| decimal glued: 0.123-45-6789.5 (20000) (320 KB) | 17 ms | 0 |
| dashes only (300000) (300 KB) | 3 ms | 0 |
| mixed unicode dashes and digits (300 KB) | 36 ms | 25000 |
| astral letters glued (20000) (320 KB) | 25 ms | 0 |
| digits and dashes alternating 3-2-4-3-2-4... (20000) (276 KB) | 19 ms | 0 |

6. **Claim check (series SC):** every concrete behaviour claimed in this document that was not already a matrix row was executed (19 cases above).
7. **Cross-check against the other detectors' tables:** 1,080 strings, 3 matched (§7).

### Final numbers

| Check | Result |
|---|---|
| Matrix | 200 / 200 (SS 62, SF 63, SM 12, SL 13, SA 25, SG 25) |
| Claim checks | 19 executed, behaviour as documented |
| Mutation check | 28 / 28 mutants detected (1 survived at first, test SF63 added) |
| Fuzz with independent re-implementation | 80,000 inputs: 0 exceptions, 0 invariant failures, 0 differences, 0 non-idempotent |
| Recall test | 30,000 generated texts (75,077 numbers): 0 failures |
| Cross-check with PHONE, EMAIL and CREDIT_CARD tables | 1,080 strings, 3 matched, all real SSN-shaped numbers |
| Worst-case time | ≈40 ms on 275-325 KB pathological input |

### Not verified

- The behaviour against the SSA's real issuing rules: only the four structural values are checked (D3, L14).
- **Integration with the other five detectors.** Only the cross-check above was possible, because their implementations do not exist yet. The integration tests must cover §7, in particular: `123-45-6789@example.com` and `john.123-45-6789@example.com` with EMAIL enabled, a card chain running into an SSN, and a phone number with an SSN-shaped tail (`+62 812 123-45-6789`, derived from the PHONE rules, not executed).

---

## 11. Notes for the TypeScript implementation

- One detector object: `{ type: "SSN", find(text): Span[] }`.
- Keep the **dash set**, the **rejected values** (`000`, `666`, `00`, `0000`) and the **guard character classes** as **data constants**, so option O1 (and a stricter or looser value policy) is a one-line change.
- The look-around regular expression used as the verification oracle is short and passed the whole matrix and the fuzz run, so it can serve as the implementation (Node 10+ supports look-behind). Apply the value rules to the captured groups afterwards:

```ts
const DASH = "\\-\\u2010-\\u2015\\u2212"; // hyphen-minus, U+2010..U+2015, minus sign
const SSN_RE = new RegExp(
  `(?<![\\p{L}\\p{N}\\p{M}_])(?<![0-9][${DASH}])(?<![0-9]\\.)` +
  `([0-9]{3})[${DASH}]([0-9]{2})[${DASH}]([0-9]{4})` +
  `(?![\\p{L}\\p{N}\\p{M}_])(?![${DASH}][0-9])(?!\\.[0-9])`,
  "gu"
);
// for each match m: skip if m[1] is "000" or "666", m[2] is "00", or m[3] is "0000";
// span = { type: "SSN", start: m.index, end: m.index + m[0].length }
```

- Offsets are UTF-16 code-unit indices into the original string, the same indices the replacer uses. The `u` flag makes the look-behind read whole code points, so emoji and astral letters next to a number are handled (SF61, SF62, SS32).
- Spans are always 11 code units long and cannot overlap each other (D9); the shared resolver still sorts and resolves overlaps with other entity types (§7, O3).
- Unit tests: build them directly from the §9 tables (every row has an input and an exact expected output).
