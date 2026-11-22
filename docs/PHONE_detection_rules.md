# PHONE detection rules

**Entity:** `PHONE` | **Placeholder:** `[PHONE]` | **Spec version:** 2.0
**Status:** rules complete and **verified twice** (two independent passes, see §13). Every example in this document was executed, not just written.
**What changed in 2.0:** revised after the task giver's clarifications: country calling codes must be **assigned**, numbers must follow the **country's numbering rules**, and `+1500000` must stay unchanged. The full verification was repeated on the revised rules.

---

## 0. Summary (read this first)

- The detector is **format-based**. It does not care whether a number is mobile, landline, fax, toll-free or VoIP; all of them become `[PHONE]`.
- It uses **two confidence tiers**:
  - **Tier A (self-evident formats):** numbers whose *shape alone* is convincing, e.g. anything starting with `+`, `(415) 555-0134`, `415-555-0134`. Detected everywhere.
  - **Tier B (context-gated):** shapes that are ambiguous on their own, e.g. `4155550134`, `98765 43210`, `020 7946 0958`. Detected **only** when a phone word (`Phone:`, `Call`, `Mobile no.`, `wa.me/` ...) is right next to them.
- **Numbers with a `+` or `00` prefix are validated for real:** the country calling code must be **assigned by the ITU**, the national number must have a **length valid for that country**, and `+1` / `+7` numbers must follow their own structure. So `+91-415-555-0134` is redacted, while `+1500000` (too short for code 1) and `+89 415 555 0134` (`+89` is not assigned) are left alone.
- This is the main false-positive/false-negative lever: **`Order 4155550134 shipped` is left alone, `Call 4155550134` is redacted.**
- Everything the detector deliberately does **not** do is listed in §11 with an example and a reason. Nothing is left implicit.

> **Honest scope statement.** "Nothing missed" is achievable for the *declared scope* (§1) and for the *documented limitations* (§11): every gap is named. No rule-based detector can claim to catch every possible phone-like string; this one claims to catch every format listed here and to be explicit about everything else.

---

## 1. Scope

### 1.1 In scope

Telephone numbers written with ASCII digits `0-9`, in any of these kinds:

| Kind of number | Handled? | Notes |
|---|---|---|
| Mobile / cell | Yes | Same format rules as any other number |
| Landline / geographic | Yes | Same |
| Fax | Yes | A fax number is a telephone number |
| Toll-free / freephone (e.g. `800-555-0199`) | Yes | Over-redaction accepted (D7) |
| Premium / VoIP / virtual | Yes | Indistinguishable by shape |
| With country code (`+CC`, `(+CC)`, `00CC`) | Yes, **if the code is assigned and the national number is valid for that country** (§6A) | Tier A |
| NANP without country code | Yes | Tier A when separators/parentheses present |
| Other national formats without country code | Yes, with context | Tier B (except the `(0xx) xxxx xxxx` shape, which is Tier A) |
| Extensions (`ext. 22`, `x22`, `;ext=22`) | Yes | Absorbed into the same span (§9) |
| `tel:` / `callto:` / `sms:` URIs, `wa.me/`, `?phone=` links | Yes | Context built in (§8.3) |
| Local 7-digit numbers (`555-0134`) | Only with context | Tier B |
| Global-service numbers (`+800`, `+808`, `+870`, `+878`, `+881`-`+883`, `+888`, `+979`) | No | L16 |

### 1.2 Out of scope (see §11 for reasons)

Non-ASCII digits, vanity letters (`1-800-FLOWERS`), numbers written in words, numbers split across lines/tabs/commas, short codes (`911`, `112`, 5-6 digit SMS codes), IPv6/other entities.

### 1.3 Regions with tested example formats

| Region | Formats covered by tests |
|---|---|
| US / Canada / Caribbean (NANP) | `+1 415 555 0134`, `(415) 555-0134`, `415.555.0134`, `1-415-555-0134`, `4155550134` (with context) |
| UK | `+44 20 7946 0958`, `+44 (0)20 7946 0958`, `(020) 7946 0958`, `Tel: 020 7946 0958`, `Cell: 07911 123456` |
| India | `+91 98765 43210`, `+919876543210`, `(011) 2345 6789`, `Ph: 040-23456789`, `Mobile no. 9876543210` |
| Germany | `+49 30 901820`, `+49 30 901820-123` (hyphenated extension) |
| France | `+33 1 23 45 67 89` (incl. narrow no-break spaces), `Tél. 01 23 45 67 89` |
| Spain / Latin America | `Teléfono: 612345678`, `+55 11 91234-5678` |
| Japan / China / Australia | `+81 3-1234-5678`, `+86 138 0013 8000`, `电话：13800138000`, `+61 4 1234 5678` |
| Russia / Kazakhstan | `+7 495 123-45-67` |
| Middle East / Africa / small territories | `+971 50 123 4567`, `+234 802 123 4567`, `+290 1234` (7-digit total) |

---

## 2. Terminology used by the rules

| Term | Meaning |
|---|---|
| **Digit group** | A run of ASCII digits (`415`), or a parenthesised run of 1-5 digits (`(415)`). |
| **Separator** | Exactly one of: space, NBSP `U+00A0`, thin space `U+2009`, narrow NBSP `U+202F`, hyphen-minus `-`, any of `U+2010`-`U+2015` (hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar), minus sign `U+2212`, or a dot `.`. **Never** a separator: comma, slash, colon, semicolon, underscore, **tab, newline, carriage return**. |
| **Chain** | Digit groups joined by **at most one** separator between neighbours. A parenthesised group is allowed only as the 1st or 2nd group. |
| **Span** | `{ type: "PHONE", start, end }`, offsets into the original string. |
| **Tier A / Tier B** | See §0. |
| **Context** | A phone word near the candidate (§8). |
| **Guard** | A check on the characters just outside the candidate (§7). |

---

## 3. Design decisions and why

| # | Decision | Reason |
|---|---|---|
| D1 | No mobile/landline typing. Numbering rules are **per-country length ranges** (plus structure for `+1` and `+7`), not full numbering plans. | The task giver requires numbers to follow the country's rules. Full plans change constantly and a wrong entry leaks numbers, so the ranges are deliberately wide (§6A). |
| D2 | Two tiers (A/B). | Resolves the brief's "ordinary numbers that resemble phone numbers" requirement without losing real bare numbers that sit next to a phone word. |
| D3 | A leading `+` / `00` counts as evidence **only if the number validates**: assigned country code + national number valid for that country. | Required so that `+1500000` (an amount) stays unchanged. E.164 maximum is 15 digits. |
| D4 | The country code **is** validated against the ITU-T E.164 list of assigned codes (position 15 Dec 2016): 206 geographic / regional codes. | Task giver: `+91` is valid, `+89` is not assigned and must not be accepted. |
| D5 | Without `+`, NANP numbers must be structurally valid: area code and exchange start with 2-9, neither is `N11`. | Removes `123-456-7890`-style placeholders and date/ID noise. **The fictional `555-01xx` range is deliberately NOT rejected** because the brief's own example uses `555-0134`. Individual area codes are not checked against the NANPA list (stale-table risk). |
| D6 | Extensions are absorbed into the phone span. | An extension identifies a person inside an organisation; leaving it behind leaks. |
| D7 | Toll-free and business numbers are redacted. | Shape cannot tell them from personal numbers; for a privacy tool over-redaction is the safe error. |
| D8 | Fax numbers are phones. | They are telephone numbers. |
| D9 | 7-digit local numbers need context. | Without an area code the shape is far too common (`555-0134`, `123-4567`). |
| D10 | Newline, tab and comma never join groups. | Prevents merging neighbouring table cells / CSV fields / list items into one fake number. |
| D11 | ASCII digits only; **no Unicode normalisation**. | Normalising (e.g. NFKC) can change string length and shift offsets, which would risk corrupting unrelated text. Non-ASCII digits are a documented gap (L7). |
| D12 | Validated formats are recall-first; bare digits are precision-first. | A validated shape is strong evidence, so redact it even if guards leave a tail (L9). Bare digit runs are weak evidence, so they need context. |
| D13 | Single pass. | Simpler and predictable. Re-running the detector on its own output is *almost* but not strictly idempotent (L12). |
| D14 | A single leading `0` after the country code is tolerated as a trunk-prefix mistake (`+44 020 7946 0958`). Italy keeps its zero. | A very common typing error; leaving such a number unredacted would leak. |
| D15 | Global-service and shared codes (`+800`, `+808`, `+870`, `+878`, `+881`-`+883`, `+888`, `+979`, `+991`, `+388`) and the reserved `+379` are not accepted. | They are not country numbers and need service-specific rules; documented in L16. |
| D16 | If a `+`/`00` chain fails validation, **the whole chain is remembered as rejected** so no other rule redacts its tail. | `+89 (415) 555-0134` must not become `+89 [PHONE]`. Side effect: L20. |
| D17 | Numbers with a valid code but the **wrong length** are left alone. | Task giver: "the complete phone number should follow the country's numbering rules." Side effect: L11. |

---

## 4. Format catalogue (what the detector recognises)

| Rule | Family | Examples | Tier | Needs context? |
|---|---|---|---|---|
| **R1** | `+`-prefixed international (validated, §6A) | `+1-415-555-0134`, `+1 (415) 555-0134`, `+14155550134`, `+91 98765 43210`, `+44 (0)20 7946 0958`, `(+44) 20 7946 0958`, `+33 1 23 45 67 89` | A | No |
| **R2** | `00`-prefixed international (validated, §6A) | `0044 20 7946 0958`, `00 91 98765 43210` | A if any separator is present, else B | Only for bare `00…` digit runs |
| **R3** | NANP with parenthesised area code | `(415) 555-0134`, `(415)555-0134`, `(415)-555-0134`, `1 (415) 555-0134` | A | No |
| **R4** | NANP with separators | `415-555-0134`, `415.555.0134`, `415 555 0134`, `1-415-555-0134`, `1.415.555.0134` | A | Only in the "space-only with adjacent digits" case (§6, R4) |
| **R5** | National, parenthesised trunk-prefixed area code | `(020) 7946 0958`, `(040) 2345 6789`, `(011) 2345 6789`, `(0141) 496 0123` | A | No |
| **R6** | Generic digit chain, 7-15 digits | `4155550134`, `98765 43210`, `020 7946 0958`, `040-23456789`, `07911 123456`, `555-0134`, `wa.me/14155550134` | B | **Yes** |

Separator variants accepted everywhere a separator is allowed: space, NBSP, thin space, narrow NBSP, `-`, en dash, non-breaking hyphen, minus sign, `.` (see §2). Mixed separators inside one number are accepted (`+1 415-555-0134`).

---

## 5. Algorithm

1. **Input:** a string (type/emptiness checks happen in the service layer; an empty string simply yields no spans).
2. **Candidate generation:** each finder R1-R6 scans the text independently. After *every* attempt (accepted or rejected) the scan restarts one character later, so overlapping candidates are all seen.
3. **Per-candidate checks, in order:** left guard, structure, length / numbering validation, extension absorption (§9), right guard, then context (Tier B only).
4. **Emit** `{ type, start, end, tier, rule }`.
5. **Resolve inside PHONE:** (a) drop every Tier B candidate that overlaps any Tier A candidate; (b) sort by `start` ascending, then length descending; (c) walk left to right and keep a candidate only if it starts at or after the end of the last kept one.
6. **Cross-entity resolution** is done by the shared resolver (§10).

Detection never edits text. Replacement (a separate module) only copies the original text between spans and inserts `[PHONE]`.

### Constants

| Constant | Value |
|---|---|
| Digits for `+` / `00` numbers | assigned country code + national number inside that country's range; 15 digits maximum (trunk `(0)` not counted) |
| Digits for R6 chains | 7-15 total |
| Max groups scanned per chain / max characters scanned | 10 groups / 48 characters; R6 rejects chains that hit either cap |
| Context window before the candidate | same line, up to 60 characters |
| Context window after the candidate | up to 24 characters |
| Extension digits | 1-6 |

---

## 6. Rule specifications

### R1: `+`-prefixed (Tier A)

- **Trigger:** `+` or `(+`.
- **Left guard (kind "plus"):** the character before the `+` (or `(`) must not be an ASCII digit and must not be `+`. Letters are allowed, so `Phone+1 415 …` works.
- **Structure:** an optional single space after `+`; then the country-code group (first digit **1-9**); if opened with `(+`, that first run must be closed by `)` immediately; then groups joined by single separators. A parenthesised group (area code) is allowed as the 2nd group. A parenthesised `(0)` as 2nd group is the **trunk zero** and is not counted in the digit total (`+44 (0)20 …`).
- **Validation (§6A):** the chain's digits (trunk `(0)` excluded) are split into country code + national number. The code must be **assigned** and lie **wholly inside the first group**; the national number must satisfy that country's rules. The span is the **longest group-prefix that validates**; groups are never split.
- **If no prefix validates:** nothing is redacted, and the whole `+` chain is marked **rejected** (D16) so no other rule picks up its tail.
- **Then:** extension absorption → right guard.
- **No context needed.**

### R2: `00`-prefixed (Tier A or B)

- **Trigger:** `00` with the "digit" left guard (§7).
- After `00`: optional single separator, then a digit **1-9**, then the same chain, validation and rejected-chain rules as R1.
- **Tier A** if the number contains any non-digit inside (e.g. `0044 20 7946 0958`). A bare run (`00442079460958`) is **Tier B**: it needs context. This keeps IDs like `0012345678901` safe.

### R3: NANP with parenthesised area code (Tier A)

- Shape: optional `1` + optional separator, `(AAA)`, optional separator, `EEE`, optional separator, `LLLL`.
- `AAA` and `EEE` start with 2-9; neither is `N11` (`211`…`911`).
- Left guard: kind "paren" (no `1` prefix) or "digit" (with `1` prefix).

### R4: NANP with separators (Tier A)

- Shape: optional `1` + separator, `AAA` sep `EEE` sep `LLLL`, any single separator from §2 between groups (they may differ).
- Same `AAA`/`EEE` rules as R3. Left guard: "digit".
- **Space-only exception:** if every separator is a space-type character **and** a digit group touches the candidate across a single space on either side (`100 200 300 4000`), the candidate is treated as part of a number list and needs **context**. Dash/dot/paren forms are not affected.

### R5: Parenthesised trunk-prefixed area code (Tier A)

- Shape: `(0` + 1-4 digits `)`, optional separator, 3-4 digits, optionally followed by an optional separator and 3-5 digits; the digits after the parentheses total **6-9**.
- Left guard: kind "paren".

### R6: Context-gated generic chain (Tier B)

- Any chain (§2) with **7-15 digits**, not truncated by the scan caps.
- **Excluded shapes** (they belong to other entities or are clearly not phones): SSN `ddd-dd-dddd`; IPv4 `d{1,3}(.d{1,3}){3}`; ISO date `dddd-d{1,2}-d{1,2}` (also with dots); day-first date `d{1,2}-d{1,2}-d{2,4}` (also with dots).
- **Requires context** (§8) before or after, or a URL context.
- Left guard "digit" (bypassed only under URL context, because there the preceding character is `/` or `=`).

---

## 6A. Country calling codes and numbering rules

### 6A.1 Finding the country code
1. Take the digits of the chain (trunk `(0)` excluded; `+`, `00`, spaces and separators removed).
2. Codes are prefix-free, so the code is found like this: first digit `1` or `7` → one-digit code; otherwise the first two digits if they are an assigned two-digit code (44 of them); otherwise the first three digits if they are an assigned three-digit code (160 of them); otherwise the number is **invalid**.
3. The code must lie **wholly inside the first group**: `+91 98765 43210` is fine, `+9 1 98765 43210` is rejected.

### 6A.2 National number rules
- Length within the country's range (table below). Total digits, code included, never exceed 15.
- **`+1` (NANP):** exactly 10 digits; area code `[2-9]xx` and exchange `[2-9]xx`; neither is an `N11` service code (`211`…`911`). Fictional `555-01xx` exchanges are accepted (D5).
- **`+7` (Russia / Kazakhstan):** exactly 10 digits; first digit 3-9.
- **Leading `0` after the code:** Italy (`+39`) keeps it, so `+39 06 1234 5678` is valid as typed. For every other country one leading `0` is treated as the domestic trunk prefix and **tolerated** (`+44 020 7946 0958`, `+91 0415 555 0134`): the number is validated without that zero, which must not be followed by another `0`. For `+1` / `+7` a leading zero is invalid.
- No other prefix rules (e.g. "UK numbers never start with 4") are applied; see L11.

### 6A.3 Provenance and caveats
- **Code list:** ITU-T E.164 assigned country codes, ITU Operational Bulletin No. 1114 (position **15 December 2016**). The table below was checked against that list by script: no assigned geographic/regional code is missing, no spare / reserved / global-service code is present, and the set is prefix-free (so a number can never match two codes).
- **Not included:** global-service and shared codes (`800`, `808`, `870`, `878`, `881`, `882`, `883`, `888`, `979`, `991`, `388`) and `379` (reserved, unused; the Vatican uses `+39`). `970` **is** included although the ITU lists it as reserved for the Palestinian Authority, because it is in everyday use.
- **Length ranges:** compiled from public national numbering-plan summaries and deliberately **widened where plans vary**. They have **not** been machine-verified against national regulators, and the code list is dated 2016. Both live in one data file so they can be corrected without touching any rule (L17).

### 6A.4 The table

| Code | Country / area | National number length |
|---|---|---|
| +1 | NANP: United States, Canada and 18 Caribbean/Pacific territories | 10 |
| +7 | Russia, Kazakhstan | 10 |
| +20 | Egypt | 8-10 |
| +27 | South Africa | 9 |
| +30 | Greece | 10 |
| +31 | Netherlands | 9 |
| +32 | Belgium | 8-9 |
| +33 | France | 9 |
| +34 | Spain | 9 |
| +36 | Hungary | 8-9 |
| +39 | Italy (incl. Vatican City) | 6-11 |
| +40 | Romania | 9-10 |
| +41 | Switzerland | 9 |
| +43 | Austria | 4-13 |
| +44 | United Kingdom (incl. Crown Dependencies) | 7-10 |
| +45 | Denmark | 8 |
| +46 | Sweden | 7-13 |
| +47 | Norway (incl. Svalbard) | 5-8 |
| +48 | Poland | 9 |
| +49 | Germany | 5-13 |
| +51 | Peru | 8-11 |
| +52 | Mexico | 10-11 |
| +53 | Cuba | 6-8 |
| +54 | Argentina | 10-11 |
| +55 | Brazil | 10-11 |
| +56 | Chile | 8-9 |
| +57 | Colombia | 8-10 |
| +58 | Venezuela | 10 |
| +60 | Malaysia | 7-10 |
| +61 | Australia (incl. Christmas Island, Cocos Islands) | 9-10 |
| +62 | Indonesia | 7-12 |
| +63 | Philippines | 8-10 |
| +64 | New Zealand | 8-10 |
| +65 | Singapore | 8-12 |
| +66 | Thailand | 8-9 |
| +81 | Japan | 9-10 |
| +82 | South Korea | 8-11 |
| +84 | Vietnam | 8-10 |
| +86 | China | 8-12 |
| +90 | Turkey | 10 |
| +91 | India | 10 |
| +92 | Pakistan | 8-10 |
| +93 | Afghanistan | 9 |
| +94 | Sri Lanka | 9 |
| +95 | Myanmar | 7-10 |
| +98 | Iran | 8-10 |
| +211 | South Sudan | 9 |
| +212 | Morocco | 9 |
| +213 | Algeria | 8-9 |
| +216 | Tunisia | 8 |
| +218 | Libya | 8-10 |
| +220 | Gambia | 7 |
| +221 | Senegal | 9 |
| +222 | Mauritania | 8 |
| +223 | Mali | 8 |
| +224 | Guinea | 8-9 |
| +225 | Cote d'Ivoire | 8-10 |
| +226 | Burkina Faso | 8 |
| +227 | Niger | 8 |
| +228 | Togo | 8 |
| +229 | Benin | 8-10 |
| +230 | Mauritius | 7-8 |
| +231 | Liberia | 7-9 |
| +232 | Sierra Leone | 8 |
| +233 | Ghana | 9 |
| +234 | Nigeria | 7-10 |
| +235 | Chad | 8 |
| +236 | Central African Republic | 8 |
| +237 | Cameroon | 8-9 |
| +238 | Cabo Verde | 7 |
| +239 | Sao Tome and Principe | 7 |
| +240 | Equatorial Guinea | 9 |
| +241 | Gabon | 7-9 |
| +242 | Congo (Republic of the) | 9 |
| +243 | DR Congo | 7-9 |
| +244 | Angola | 9 |
| +245 | Guinea-Bissau | 7-9 |
| +246 | Diego Garcia | 7 |
| +247 | Ascension | 4-5 |
| +248 | Seychelles | 7 |
| +249 | Sudan | 9 |
| +250 | Rwanda | 9 |
| +251 | Ethiopia | 9 |
| +252 | Somalia | 5-9 |
| +253 | Djibouti | 8 |
| +254 | Kenya | 9 |
| +255 | Tanzania | 9 |
| +256 | Uganda | 9 |
| +257 | Burundi | 8 |
| +258 | Mozambique | 8-9 |
| +260 | Zambia | 9 |
| +261 | Madagascar | 9 |
| +262 | Reunion, Mayotte (French Indian Ocean) | 9 |
| +263 | Zimbabwe | 5-10 |
| +264 | Namibia | 6-10 |
| +265 | Malawi | 7-9 |
| +266 | Lesotho | 8 |
| +267 | Botswana | 7-8 |
| +268 | Eswatini | 7-8 |
| +269 | Comoros | 7 |
| +290 | Saint Helena, Tristan da Cunha | 4-5 |
| +291 | Eritrea | 7 |
| +297 | Aruba | 7 |
| +298 | Faroe Islands | 6 |
| +299 | Greenland | 6 |
| +350 | Gibraltar | 8 |
| +351 | Portugal | 9 |
| +352 | Luxembourg | 4-11 |
| +353 | Ireland | 7-11 |
| +354 | Iceland | 7-9 |
| +355 | Albania | 7-9 |
| +356 | Malta | 8 |
| +357 | Cyprus | 8 |
| +358 | Finland (incl. Aland) | 5-12 |
| +359 | Bulgaria | 7-9 |
| +370 | Lithuania | 8 |
| +371 | Latvia | 8 |
| +372 | Estonia | 7-10 |
| +373 | Moldova | 8 |
| +374 | Armenia | 8 |
| +375 | Belarus | 9-10 |
| +376 | Andorra | 6-9 |
| +377 | Monaco | 8-9 |
| +378 | San Marino | 6-10 |
| +380 | Ukraine | 9 |
| +381 | Serbia | 8-10 |
| +382 | Montenegro | 8 |
| +383 | Kosovo | 8-9 |
| +385 | Croatia | 8-9 |
| +386 | Slovenia | 8 |
| +387 | Bosnia and Herzegovina | 8 |
| +389 | North Macedonia | 8 |
| +420 | Czechia | 9 |
| +421 | Slovakia | 9 |
| +423 | Liechtenstein | 7-9 |
| +500 | Falkland Islands | 5 |
| +501 | Belize | 7 |
| +502 | Guatemala | 8 |
| +503 | El Salvador | 8 |
| +504 | Honduras | 8 |
| +505 | Nicaragua | 8 |
| +506 | Costa Rica | 8 |
| +507 | Panama | 7-8 |
| +508 | Saint Pierre and Miquelon | 6 |
| +509 | Haiti | 8 |
| +590 | Guadeloupe, Saint Barthelemy, Saint Martin | 9 |
| +591 | Bolivia | 8 |
| +592 | Guyana | 7 |
| +593 | Ecuador | 8-9 |
| +594 | French Guiana | 9 |
| +595 | Paraguay | 8-9 |
| +596 | Martinique | 9 |
| +597 | Suriname | 6-7 |
| +598 | Uruguay | 8-9 |
| +599 | Curacao, Bonaire, Sint Eustatius, Saba | 7-8 |
| +670 | Timor-Leste | 7-8 |
| +672 | Australian External Territories (Norfolk Island, Antarctic Territory) | 6 |
| +673 | Brunei | 7 |
| +674 | Nauru | 7 |
| +675 | Papua New Guinea | 7-8 |
| +676 | Tonga | 5-7 |
| +677 | Solomon Islands | 5-7 |
| +678 | Vanuatu | 5-7 |
| +679 | Fiji | 7 |
| +680 | Palau | 7 |
| +681 | Wallis and Futuna | 6 |
| +682 | Cook Islands | 5 |
| +683 | Niue | 4 |
| +685 | Samoa | 5-7 |
| +686 | Kiribati | 5-8 |
| +687 | New Caledonia | 6 |
| +688 | Tuvalu | 5-7 |
| +689 | French Polynesia | 8 |
| +690 | Tokelau | 4-5 |
| +691 | Micronesia | 7 |
| +692 | Marshall Islands | 7 |
| +850 | North Korea | 6-10 |
| +852 | Hong Kong | 8 |
| +853 | Macao | 7-8 |
| +855 | Cambodia | 8-9 |
| +856 | Laos | 8-10 |
| +880 | Bangladesh | 8-10 |
| +886 | Taiwan | 8-10 |
| +960 | Maldives | 7 |
| +961 | Lebanon | 7-8 |
| +962 | Jordan | 8-9 |
| +963 | Syria | 8-10 |
| +964 | Iraq | 8-10 |
| +965 | Kuwait | 7-8 |
| +966 | Saudi Arabia | 8-9 |
| +967 | Yemen | 6-9 |
| +968 | Oman | 7-8 |
| +970 | Palestine (ITU: reserved for the Palestinian Authority; in everyday use) | 8-9 |
| +971 | United Arab Emirates | 8-9 |
| +972 | Israel | 8-9 |
| +973 | Bahrain | 8 |
| +974 | Qatar | 7-8 |
| +975 | Bhutan | 7-8 |
| +976 | Mongolia | 7-8 |
| +977 | Nepal | 8-10 |
| +992 | Tajikistan | 9 |
| +993 | Turkmenistan | 8 |
| +994 | Azerbaijan | 9 |
| +995 | Georgia | 9 |
| +996 | Kyrgyzstan | 9 |
| +998 | Uzbekistan | 9 |


---

## 7. Guards (boundary checks)

### 7.1 Left guard: looks at the character before the candidate

| Kind | Rejects when the previous character is… |
|---|---|
| **plus** | an ASCII digit, or `+` |
| **paren** | an ASCII digit; one of `# $ € £ ¥ ₹ @ / \ +`; a dash/dot/slash that is itself preceded by a digit |
| **digit** | everything "paren" rejects, **and** any letter, digit-like character or `_` |

Consequences: `+89-415-555-0134` (a `+` right before the digits: the tail of an invalid `+` number), `ID415-555-0134` (letter glued on), `#415-555-0134` (order-id style), `$415.555.0134` (money), `12-415-555-0134` (longer hyphenated number), `path/4155550134` are all rejected.

### 7.2 Right guard: looks at the character after the candidate (after any extension)

Reject when the next character is a letter, digit-like character or `_`, **or** is `.`, `/` or a dash **followed by an ASCII digit** (the number continues, so it is part of something longer).

Consequences: `415-555-01345` (extra digit), `415-555-0134-0000` (hyphen continuation), `415.555.0134.7`, `…0134X` are rejected. A trailing sentence period is fine: `Call 4155550134.` → `Call [PHONE].`

Not rejected on purpose: a dash followed by a **non-digit** (`800-555-0199-X`): the valid phone shape is still redacted (D12, L9).

---

## 8. Context (Tier B gate)

### 8.1 Before the candidate

On the **same line**, the text before the candidate (last 60 characters, case-insensitive) must **end** with:

`KEYWORD` then zero or more (`punctuation/space` + `filler word`), then optional `punctuation/space`.

- **Keyword must start** at the beginning of the window or after a non-letter/non-digit character. CJK keywords (`电话` `手机` `電話` `携帯`) need no word boundary, because CJK text has no spaces (same rule as DATE_OF_BIRTH D2): `患者电话：13800138000` is redacted (K10). Added after implementation.
- **Keywords (English):** `tel`, `telephone`, `phone(s)`, `ph`, `mob`, `mobile(s)`, `cell(s)`, `cellular`, `call(s)`, `whatsapp` / `whats app`, `sms`, `fax`, `dial`, `landline`, `helpline`, `hotline`, `contact(s)`, `reach`.
- **Keyword phrases (possessive):** `my number`, `your number`, `our number`, `his number`, `her number`, `their number` (added after implementation). The words of a multi-word keyword (these and `whats app`) are separated by one or more spaces or tabs, never a line break. `number` on its own stays a filler word, so `Order number 4155550134` is unchanged.
- **Keywords (other languages, sample list):** `téléphone`, `tél`, `portable`, `telefon`, `telefono`, `teléfono`, `telefone`, `tlf`, `handy`, `mobil`, `celular`, `móvil`, `movil`, `फोन`, `मोबाइल`, `电话`, `手机`, `電話`, `携帯`.
- **Filler words allowed between keyword and number:** `number(s)`, `no`, `nos`, `num`, `nr`, `is`, `are`, `at`, `on`, `me`, `us`, `to`, `line`, `detail(s)`, `info`, `via`, `using`, `my`, `our`, `the`, `direct`, `office`, `home`, `work`, `personal`, `primary`, `alternate`, `alt`, `emergency`.
- **Punctuation/space allowed:** whitespace (not newline), `:` `：` `=` `.` `#` `-` `–` `(` `)`.
- Any **other** word, any **digit**, or a **newline** between the keyword and the number breaks the context.

Examples: `Call me on 4155550134` ✔, `Phone number: 9876543210` ✔, `Call for order 4155550134` ✘ ("for"), `Phone 123 order 4155550134` ✘ (digits in between), `Order No. 98765 43210` ✘ ("order" is not a keyword and "No." alone is not one).

### 8.2 After the candidate

Within 24 characters: optional spaces, `(` or `[`, a label word (`mobile`, `cell`, `home`, `work`, `office`, `tel`, `phone`, `fax`, `direct`, `personal`), then `)` or `]`. Example: `4155550134 (mobile)` ✔.

### 8.3 URL / scheme context (immediately before the number, optional `+`)

`wa.me/`, `?phone=` / `&phone=`, `tel:`, `callto:`, `sms:`, `smsto:`, `whatsapp://send?phone=`.

---

## 9. Extensions

After a matched number the detector absorbs an extension and treats the whole thing as one `[PHONE]`:

`;ext=` **or** (optional space, optional comma, optional space) + one of `extension`, `extn`, `ext`, `x` + optional `.` + optional space + optional `:` + optional space, followed by **1-6 digits** not followed by another digit.

Examples: `+1 (415) 555-0134 ext. 22`, `+1 415 555 0134 x22`, `+1-415-555-0134;ext=22`, `415-555-0134 ext 5` → all a single `[PHONE]`.
A 7+ digit "extension" is **not** absorbed (`… ext. 1234567` → number replaced, extension text stays).
A hyphenated extension suffix that stays inside the same chain (≤ 15 digits) is absorbed by the chain itself: `+49 30 901820-123` → `[PHONE]`.

---

## 10. Overlaps

### 10.1 Inside PHONE
Tier A beats Tier B on any overlap; otherwise earliest start, then longest. Result: no character is covered twice, so no `[[PHONE]]`.

### 10.2 Across entities (shared resolver)
Agreed priority: **CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE**. PHONE yields to every other type when both are enabled.

- `4155550134@example.com` / `415-555-0134@example.com`: with EMAIL enabled the whole address becomes `[EMAIL]`. With **only** PHONE enabled the output is `[PHONE]@example.com` (test M10).
- A 13-15 digit card number written next to a phone word (e.g. `Phone: 378282246310005`) can match R6; if CREDIT_CARD is enabled and the number passes Luhn it outranks PHONE.
- SSN `123-45-6789`, IPv4 `192.168.1.1`, dates (`2024-05-12`, `12.05.1990`, `DOB: …`) never match PHONE shapes (tests F04-F06, F22, F45-F47, checks C08-C11).

---

## 11. Known limitations (explicit, with reasons)

| # | Limitation | Example | Why accepted / mitigation |
|---|---|---|---|
| L1 | Bare digit runs with **no phone word nearby** are not redacted. A CSV/table column whose header says "phone" is on a different line, so its cells have no context. Possessive phrases (`My number 4155550134`) now count as a phone word (§8.1, B18-B20). | `4155550134`, `9876543210` | Precision: bare 10-digit numbers are order IDs, timestamps, account numbers. The task giver asked for exactly this (IDs must stay). Mitigation (future): optional "aggressive" mode, or caller-supplied column hints. |
| L2 | National formats without `+`, other than NANP and the `(0xx) …` shape, need context. | `020 7946 0958`, `07911 123456`, `040-23456789` | Same as L1; these shapes are too generic. |
| L3 | 7-digit local numbers need context. | `555-0134` | Too common as a shape. |
| L4 | Two numbers back-to-back with **only hyphens or only spaces** between them are not separated. | `415-555-0134-415-555-0135` (both missed), `415 555 0134 415 555 0135` (both missed), `+1 415 555 0134 415 555 0135` (second missed), `Phone: 98765 43210 98765 43210` (both missed: 20 digits exceed the 15-digit cap) | Ambiguous with long IDs. Numbers separated by comma, semicolon, slash, "and", or newline work (M03-M05, M12, A09). |
| L5 | A context-gated (Tier B) chain absorbs a trailing small digit group. | `Phone: 98765 43210 5 times` → `Phone: [PHONE] times` | A bare digit chain has no marker where one number ends. Validated Tier A numbers are exact (`Call 415-555-0134 5 times` → `Call [PHONE] 5 times`; `+44 20 7946 0958 123 456 7890` → `[PHONE] 123 456 7890`). |
| L6 | Numbers split by newline, tab or comma are not joined. | `415\n555\n0134`, `415,555,0134` | D10: joining would merge unrelated cells/lines. |
| L7 | Non-ASCII digits and the fullwidth plus are not detected. | Arabic-Indic digits, `＋１４１５…` | D11: normalising risks shifting offsets. |
| L8 | Vanity/lettered numbers, numbers in words, and obfuscated forms. | `1-800-FLOWERS`, `four one five…`, `415 dash 555…` | Not regex-detectable without a dictionary; out of scope. |
| L9 | A validated phone shape glued to a trailing `-letters` stays partially replaced. | `Part 800-555-0199-X` → `Part [PHONE]-X` | D12: recall-first. |
| L10 | Over-redaction of business/toll-free numbers and fictional `555-01xx` numbers. | `800-555-0199`, `+1 (800) 555-0199` | D5, D7. |
| L11 | Country rules are **length ranges** (plus `+1` / `+7` structure), not full numbering plans. A number with a valid length but an impossible prefix is still redacted; a number with the **wrong length is not**. | `+91 12345 67890` → redacted (10 digits); `+91 98765 4321` (9 digits) and `+1 415 555 013` stay unchanged | D1, D17. The task giver wants fewer false positives; wrong-length numbers are the price. Ranges are data and can be tightened. |
| L12 | Not strictly idempotent. Re-running on the output can redact a **new** number that previously abutted a replaced one. Observed in 3 of 60,000 random adversarial inputs; in all 3 the new match sat within 3 characters of a replaced number. | `+1 415 555 0134 415 555 0135` → run 1: `[PHONE] 415 555 0135` → run 2: `[PHONE] [PHONE]` | Boundary rules look at neighbouring characters, and replacing a neighbour changes them. Run once. |
| L13 | The context keyword list is a **sample**, not every language. | A number after an unlisted word in another language is only caught if it is Tier A. | The list is data, not code, and can be extended (future: configuration). |
| L14 | Dialling decorations are not interpreted: `*67`, `#`, pauses (`,,`). | `*67-415-555-0134` | Digits still match when the shape is valid; the decoration stays. |
| L15 | Short codes are not matched. | `911`, `112`, 5-6 digit SMS short codes | Under 7 digits; not personal data. |
| L16 | Global-service and shared codes are not accepted. | `+800 1234 5678`, `+883 …` | D15. They are not country numbers; add them with service-specific rules if ever needed. |
| L17 | The code list is dated **15 Dec 2016** and the length ranges are **not verified against national regulators**. | A code assigned after 2016 would be rejected; a range that is too narrow would reject a real number | Single data file (`cc_data`), cross-checked by script against the ITU list. Re-check against the current ITU list and national plans before relying on it. |
| L18 | Two numbers glued together, or a digit glued directly before a `+`, are not recognised. | `+91 98765 43210+91 98765 43211` → second missed; `5+1 415 555 0134` unchanged | Left guard for `+` (§7.1): a digit before `+` means the sign belongs to something else. |
| L19 | A hyphen/dot-joined digit suffix after a valid number leaves the **whole number unchanged** when the country has a fixed length; variable-length countries absorb it. | `+1-415-555-0134-22`, `+91-98765-43210-9` unchanged; `+49 30 901820-123` → `[PHONE]` | Right guard (§7.2) treats `-digits` as a longer number. Use `ext. 22` / `x22` forms, which are handled (§9). |
| L20 | An invalid `+` chain also blocks a valid number written **directly after it** (D16 side effect). | `+1500000 415-555-0134` → unchanged | Needed for `+89 (415) 555-0134`. Rare (two numbers with only a space between). |
| L21 | A plain signed number that happens to have a valid code and valid length is redacted. | `+4412345678` → `[PHONE]` | Indistinguishable from a number; over-redaction is the safe error. |

---

## 12. Test matrix (every row was executed)

Legend: `⏎` = newline, `⇥` = tab, `<NBSP>` `<NNBSP>` `<EN>` `<NBH>` `<MINUS>` = the corresponding Unicode characters. "Rule" is the finder that produced the match (generated from the run). For unchanged rows the reason is stated.

### P-series: R1: `+`-prefixed numbers (Tier A)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| P01 | `Call +1-415-555-0134 now` | `Call [PHONE] now` | R1 (Tier A) |
| P02 | `+1 (415) 555-0134` | `[PHONE]` | R1 (Tier A) |
| P03 | `+1 415 555 0134` | `[PHONE]` | R1 (Tier A) |
| P04 | `+1.415.555.0134` | `[PHONE]` | R1 (Tier A) |
| P05 | `+14155550134` | `[PHONE]` | R1 (Tier A) |
| P06 | `+1(415)555-0134` | `[PHONE]` | R1 (Tier A) |
| P07 | `+91 98765 43210` | `[PHONE]` | R1 (Tier A) |
| P08 | `+91-98765-43210` | `[PHONE]` | R1 (Tier A) |
| P09 | `+919876543210` | `[PHONE]` | R1 (Tier A) |
| P10 | `+44 20 7946 0958` | `[PHONE]` | R1 (Tier A) |
| P11 | `+44 (0)20 7946 0958` | `[PHONE]` | R1 (Tier A): Trunk `(0)` not counted |
| P12 | `+44 (0) 20 7946 0958` | `[PHONE]` | R1 (Tier A): Trunk `(0)` with spaces |
| P13 | `(+44) 20 7946 0958` | `[PHONE]` | R1 (Tier A): `(+CC)` form |
| P14 | `+49 30 901820` | `[PHONE]` | R1 (Tier A) |
| P15 | `+33 1 23 45 67 89` | `[PHONE]` | R1 (Tier A) |
| P16 | `+81 3-1234-5678` | `[PHONE]` | R1 (Tier A) |
| P17 | `+61 4 1234 5678` | `[PHONE]` | R1 (Tier A) |
| P18 | `+86 138 0013 8000` | `[PHONE]` | R1 (Tier A) |
| P19 | `+55 11 91234-5678` | `[PHONE]` | R1 (Tier A) |
| P20 | `+7 495 123-45-67` | `[PHONE]` | R1 (Tier A) |
| P21 | `+971 50 123 4567` | `[PHONE]` | R1 (Tier A) |
| P22 | `+234 802 123 4567` | `[PHONE]` | R1 (Tier A) |
| P23 | `+290 1234` | `[PHONE]` | R1 (Tier A): 7 digits total (shortest allowed) |
| P25 | `+1 (415) 555-0134 ext. 22` | `[PHONE]` | R1 (Tier A): Extension absorbed |
| P26 | `+1 415 555 0134 x22` | `[PHONE]` | R1 (Tier A): Extension absorbed |
| P27 | `+1-415-555-0134;ext=22` | `[PHONE]` | R1 (Tier A): `;ext=` absorbed |
| P28 | `tel:+14155550134` | `tel:[PHONE]` | R1 (Tier A): `tel:` stays, number replaced |
| P29 | `+33<NNBSP>1<NNBSP>23<NNBSP>45<NNBSP>67<NNBSP>89` | `[PHONE]` | R1 (Tier A) |
| P30 | `+1<NBSP>415<NBSP>555<NBSP>0134` | `[PHONE]` | R1 (Tier A) |
| P31 | `+1<EN>415<EN>555<EN>0134` | `[PHONE]` | R1 (Tier A) |
| P32 | `+1<NBH>415<NBH>555<NBH>0134` | `[PHONE]` | R1 (Tier A) |
| P33 | `+1<MINUS>415<MINUS>555<MINUS>0134` | `[PHONE]` | R1 (Tier A) |
| P34 | `+ 91 98765 43210` | `[PHONE]` | R1 (Tier A): Space after `+` allowed |
| P35 | `(+1) 415-555-0134` | `[PHONE]` | R1 (Tier A) |
| P36 | `(+1 415 555 0134)` | `([PHONE])` | R1 (Tier A): Surrounding parentheses stay; only the number is replaced |
| P37 | `Phone+1 415 555 0134` | `Phone[PHONE]` | R1 (Tier A): Letters before `+` are allowed |

### Z-series: R2: `00`-prefixed numbers

| ID | Input | Output | Rule / why |
|---|---|---|---|
| Z01 | `Call 0044 20 7946 0958 today` | `Call [PHONE] today` | R2 (Tier A) |
| Z02 | `00 91 98765 43210` | `[PHONE]` | R2 (Tier A) |
| Z03 | `Phone: 00442079460958` | `Phone: [PHONE]` | R2 (Tier B): Bare `00…` with context (Tier B) |

### N-series: R3 / R4: NANP without `+` (Tier A)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| N01 | `(415) 555-0134` | `[PHONE]` | R3 (Tier A) |
| N02 | `(415)555-0134` | `[PHONE]` | R3 (Tier A) |
| N03 | `415-555-0134` | `[PHONE]` | R4 (Tier A) |
| N04 | `415.555.0134` | `[PHONE]` | R4 (Tier A) |
| N05 | `415 555 0134` | `[PHONE]` | R4 (Tier A) |
| N06 | `1-415-555-0134` | `[PHONE]` | R4 (Tier A) |
| N07 | `1 (415) 555-0134` | `[PHONE]` | R3 (Tier A) |
| N08 | `1.415.555.0134` | `[PHONE]` | R4 (Tier A) |
| N09 | `415-555-0134 ext 5` | `[PHONE]` | R4 (Tier A): Extension absorbed |
| N10 | `415<MINUS>555<MINUS>0134` | `[PHONE]` | R4 (Tier A) |
| N11 | `(415)-555-0134` | `[PHONE]` | R3 (Tier A) |
| N12 | `800-555-0199` | `[PHONE]` | R4 (Tier A): Toll-free redacted (D7) |

### T-series: R5: parenthesised trunk-prefixed area code (Tier A)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| T01 | `(020) 7946 0958` | `[PHONE]` | R5 (Tier A) |
| T02 | `(040) 2345 6789` | `[PHONE]` | R5 (Tier A) |
| T03 | `(011) 2345 6789` | `[PHONE]` | R5 (Tier A) |
| T04 | `(0141) 496 0123` | `[PHONE]` | R5 (Tier A) |

### B-series: R6: context-gated numbers (Tier B)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| B01 | `Call 4155550134 now` | `Call [PHONE] now` | R6 (Tier B) |
| B02 | `Phone: 4155550134` | `Phone: [PHONE]` | R6 (Tier B) |
| B03 | `Mobile no. 9876543210` | `Mobile no. [PHONE]` | R6 (Tier B) |
| B04 | `WhatsApp 98765 43210` | `WhatsApp [PHONE]` | R6 (Tier B) |
| B05 | `Tel: 020 7946 0958` | `Tel: [PHONE]` | R6 (Tier B) |
| B06 | `Ph: 040-23456789` | `Ph: [PHONE]` | R6 (Tier B) |
| B07 | `Cell: 07911 123456` | `Cell: [PHONE]` | R6 (Tier B) |
| B08 | `Tel 030 901820` | `Tel [PHONE]` | R6 (Tier B) |
| B09 | `call me at 14155550134` | `call me at [PHONE]` | R6 (Tier B) |
| B10 | `https://wa.me/14155550134` | `https://wa.me/[PHONE]` | R6 (Tier B): URL context |
| B11 | `https://api.whatsapp.com/send?phone=14155550134&text=hi` | `https://api.whatsapp.com/send?phone=[PHONE]&text=hi` | R6 (Tier B): URL context (`phone=`) |
| B12 | `Phone: 555-0134` | `Phone: [PHONE]` | R6 (Tier B): 7-digit local number with context |
| B13 | `4155550134 (mobile)` | `[PHONE] (mobile)` | R6 (Tier B): Label after the number |
| B14 | `Contact number: 98765 43210` | `Contact number: [PHONE]` | R6 (Tier B) |
| B15 | `Call 123-456-7890` | `Call [PHONE]` | R6 (Tier B): Invalid NANP shape, but context present (Tier B) |
| B16 | `Fax: 415-555-0134` | `Fax: [PHONE]` | R4 (Tier A): Fax is a phone (D8) |
| B17 | `Phone Number : 9876543210.` | `Phone Number : [PHONE].` | R6 (Tier B): Trailing period preserved |
| B18 | `My number 4155550134` | `My number [PHONE]` | Possessive keyword phrase |
| B19 | `Your number: 98765 43210` | `Your number: [PHONE]` | Possessive keyword phrase, colon |
| B20 | `this is my number is 4155550134` | `this is my number is [PHONE]` | Keyword phrase + filler `is` |
| B21 | `Order number 4155550134` | `Order number 4155550134` | `number` alone is a filler, not a keyword |
| B22 | `My order number 4155550134` | `My order number 4155550134` | `order` breaks the phrase |

### K-series: R6 with non-English keywords

| ID | Input | Output | Rule / why |
|---|---|---|---|
| K01 | `Téléphone : 06 12 34 56 78` | `Téléphone : [PHONE]` | R6 (Tier B) |
| K02 | `Teléfono: 612345678` | `Teléfono: [PHONE]` | R6 (Tier B) |
| K03 | `Handy: 01711234567` | `Handy: [PHONE]` | R6 (Tier B) |
| K04 | `电话：13800138000` | `电话：[PHONE]` | R6 (Tier B) |
| K05 | `手机 13800138000` | `手机 [PHONE]` | R6 (Tier B) |
| K06 | `फोन: 9876543210` | `फोन: [PHONE]` | R6 (Tier B) |
| K07 | `Telefon 0301234567` | `Telefon [PHONE]` | R6 (Tier B) |
| K08 | `Telefonverzeichnis 4155550134` | `Telefonverzeichnis 4155550134` | `Telefonverzeichnis` is not the keyword `Telefon` (keyword must be followed by punctuation/filler) |
| K09 | `Tél. 01 23 45 67 89` | `Tél. [PHONE]` | R6 (Tier B) |
| K10 | `患者电话：13800138000` | `患者电话：[PHONE]` | CJK keyword after other CJK text |
| K11 | `联系人手机 13800138000` | `联系人手机 [PHONE]` | CJK keyword after other CJK text |
| K12 | `患者编号 13800138000` | `患者编号 13800138000` | 编号 ("ID") is not a phone word |

### E-series: Task giver's clarification example (PHONE only)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| E01 | `John Doe paid +1500000 with card 4111 1111 1111 1111 003 and can be contacted at john.doe@example.com or +91-415-555-0134. DOB: 1990-05-12.` | `John Doe paid +1500000 with card 4111 1111 1111 1111 003 and can be contacted at john.doe@example.com or [PHONE]. DOB: 1990-05-12.` | Task-giver example, PHONE only (EMAIL / DOB / CREDIT_CARD belong to other detectors). `+1500000` stays; `+91-415-555-0134` is redacted |
| E02 | `Order 4155550134 shipped` | `Order 4155550134 shipped` | Bare digits, no phone word |
| E03 | `Transaction 9876543210 completed` | `Transaction 9876543210 completed` | Bare digits, no phone word |
| E04 | `Call +91-415-555-0134 now` | `Call [PHONE] now` | R1 (Tier A) |
| E05 | `paid +1500000 today` | `paid +1500000 today` | `+1500000`: country code 1 needs 10 national digits, only 6 given |

### V-series: Country-code and numbering-rule validation

| ID | Input | Output | Rule / why |
|---|---|---|---|
| V01 | `+1234567` | `+1234567` | Code 1 needs 10 national digits; only 6 |
| V02 | `+89 415 555 0134` | `+89 415 555 0134` | `+89` is not an assigned country calling code |
| V03 | `+89-415-555-0134` | `+89-415-555-0134` | `+89` is not assigned (dash form) |
| V04 | `+89 (415) 555-0134` | `+89 (415) 555-0134` | Invalid code; its tail `(415) 555-0134` is blocked as well (rejected-chain rule D16) |
| V05 | `Phone: +89 415 555 0134` | `Phone: +89 415 555 0134` | Invalid code, with a phone word; still rejected |
| V06 | `+91 98765 4321` | `+91 98765 4321` | India needs 10 national digits; 9 given |
| V07 | `+91 98765 432101` | `+91 98765 432101` | India needs 10 national digits; 11 given |
| V08 | `+1 155 555 0134` | `+1 155 555 0134` | NANP area code may not start with 0 or 1 |
| V09 | `+1 415 111 0134` | `+1 415 111 0134` | NANP exchange `111` is an N11 code |
| V10 | `+1 415 055 0134` | `+1 415 055 0134` | NANP exchange may not start with 0 or 1 |
| V11 | `+7 295 123 4567` | `+7 295 123 4567` | `+7` national numbers start with 3-9 |
| V12 | `+999 123456789` | `+999 123456789` | `+999` is reserved, not assigned |
| V13 | `+214 1234567` | `+214 1234567` | `+214` is a spare code |
| V14 | `+671 1234567` | `+671 1234567` | `+671` is a spare code (Guam uses +1 671) |
| V15 | `+800 1234 5678` | `+800 1234 5678` | Global-service code `+800` is excluded (L16) |
| V16 | `+0 123 456 7890` | `+0 123 456 7890` | Country codes never start with 0 |
| V17 | `+9 1 98765 43210` | `+9 1 98765 43210` | The code must sit inside the first group: `+9 1 …` is not `+91` |
| V18 | `+379 06 698 12345` | `+379 06 698 12345` | `+379` is reserved and unused (the Vatican uses +39) |
| V19 | `+1 415 555 0134567` | `+1 415 555 0134567` | 13 national digits after code 1 |
| V20 | `+49 1` | `+49 1` | Germany needs at least 5 national digits |
| V21 | `Phone: +89 415 555 0134 or +91 98765 43210` | `Phone: +89 415 555 0134 or [PHONE]` | The invalid-code number is skipped; the valid one is redacted |
| V22 | `+44 020 7946 0958` | `[PHONE]` | Trunk zero typed after `+44`: tolerated (D14) |
| V23 | `+49 030 901820` | `[PHONE]` | Trunk zero typed after `+49`: tolerated (D14) |

### Q-series: One valid example per country / region (R1)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| Q01 | `+212 612345678` | `[PHONE]` | R1 (Tier A) |
| Q02 | `+20 1012345678` | `[PHONE]` | R1 (Tier A) |
| Q03 | `+27 82 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q04 | `+52 1 55 1234 5678` | `[PHONE]` | R1 (Tier A) |
| Q05 | `+54 9 11 1234 5678` | `[PHONE]` | R1 (Tier A) |
| Q06 | `+353 1 234 5678` | `[PHONE]` | R1 (Tier A) |
| Q07 | `+353 87 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q08 | `+39 06 1234 5678` | `[PHONE]` | R1 (Tier A) |
| Q09 | `+39 345 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q10 | `+358 40 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q11 | `+82 10-1234-5678` | `[PHONE]` | R1 (Tier A) |
| Q12 | `+82 2-123-4567` | `[PHONE]` | R1 (Tier A) |
| Q13 | `+66 81 234 5678` | `[PHONE]` | R1 (Tier A) |
| Q14 | `+84 91 234 56 78` | `[PHONE]` | R1 (Tier A) |
| Q15 | `+63 917 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q16 | `+62 812-3456-7890` | `[PHONE]` | R1 (Tier A) |
| Q17 | `+90 532 123 45 67` | `[PHONE]` | R1 (Tier A) |
| Q18 | `+966 50 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q19 | `+92 300 1234567` | `[PHONE]` | R1 (Tier A) |
| Q20 | `+880 1712-345678` | `[PHONE]` | R1 (Tier A) |
| Q21 | `+977 981-234-5678` | `[PHONE]` | R1 (Tier A) |
| Q22 | `+64 21 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q23 | `+65 6123 4567` | `[PHONE]` | R1 (Tier A) |
| Q24 | `+852 9123 4567` | `[PHONE]` | R1 (Tier A) |
| Q25 | `+886 912 345 678` | `[PHONE]` | R1 (Tier A) |
| Q26 | `+36 20 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q27 | `+48 123 456 789` | `[PHONE]` | R1 (Tier A) |
| Q28 | `+46 70 123 45 67` | `[PHONE]` | R1 (Tier A) |
| Q29 | `+47 912 34 567` | `[PHONE]` | R1 (Tier A) |
| Q30 | `+45 12 34 56 78` | `[PHONE]` | R1 (Tier A) |
| Q31 | `+31 6 12345678` | `[PHONE]` | R1 (Tier A) |
| Q32 | `+32 470 12 34 56` | `[PHONE]` | R1 (Tier A) |
| Q33 | `+41 79 123 45 67` | `[PHONE]` | R1 (Tier A) |
| Q34 | `+43 664 1234567` | `[PHONE]` | R1 (Tier A) |
| Q35 | `+420 123 456 789` | `[PHONE]` | R1 (Tier A) |
| Q36 | `+351 912 345 678` | `[PHONE]` | R1 (Tier A) |
| Q37 | `+30 691 234 5678` | `[PHONE]` | R1 (Tier A) |
| Q38 | `+34 612 34 56 78` | `[PHONE]` | R1 (Tier A) |
| Q39 | `+380 50 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q40 | `+998 90 123 45 67` | `[PHONE]` | R1 (Tier A) |
| Q41 | `+971 4 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q42 | `+972 50-123-4567` | `[PHONE]` | R1 (Tier A) |
| Q43 | `+98 912 345 6789` | `[PHONE]` | R1 (Tier A) |
| Q44 | `+234 1 234 5678` | `[PHONE]` | R1 (Tier A) |
| Q45 | `+1 876 555 0123` | `[PHONE]` | R1 (Tier A) |
| Q46 | `+7 701 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q47 | `+44 7911 123456` | `[PHONE]` | R1 (Tier A) |
| Q48 | `+61 2 1234 5678` | `[PHONE]` | R1 (Tier A) |
| Q49 | `+91 40 2345 6789` | `[PHONE]` | R1 (Tier A) |
| Q50 | `+55 21 2345-6789` | `[PHONE]` | R1 (Tier A) |
| Q51 | `+27 11 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q52 | `+254 712 345 678` | `[PHONE]` | R1 (Tier A) |
| Q53 | `+233 24 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q54 | `+256 772 123456` | `[PHONE]` | R1 (Tier A) |
| Q55 | `+255 754 123 456` | `[PHONE]` | R1 (Tier A) |
| Q56 | `+996 555 123 456` | `[PHONE]` | R1 (Tier A) |
| Q57 | `+995 555 12 34 56` | `[PHONE]` | R1 (Tier A) |
| Q58 | `+994 50 123 45 67` | `[PHONE]` | R1 (Tier A) |
| Q59 | `+961 3 123 456` | `[PHONE]` | R1 (Tier A) |
| Q60 | `+962 7 9012 3456` | `[PHONE]` | R1 (Tier A) |
| Q61 | `+974 3312 3456` | `[PHONE]` | R1 (Tier A) |
| Q62 | `+965 5123 4567` | `[PHONE]` | R1 (Tier A) |
| Q63 | `+968 9212 3456` | `[PHONE]` | R1 (Tier A) |
| Q64 | `+973 3612 3456` | `[PHONE]` | R1 (Tier A) |
| Q65 | `+355 69 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q66 | `+372 5123 4567` | `[PHONE]` | R1 (Tier A) |
| Q67 | `+370 612 34567` | `[PHONE]` | R1 (Tier A) |
| Q68 | `+371 2123 4567` | `[PHONE]` | R1 (Tier A) |
| Q69 | `+385 91 234 5678` | `[PHONE]` | R1 (Tier A) |
| Q70 | `+386 31 234 567` | `[PHONE]` | R1 (Tier A) |
| Q71 | `+381 60 1234567` | `[PHONE]` | R1 (Tier A) |
| Q72 | `+359 88 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q73 | `+40 712 345 678` | `[PHONE]` | R1 (Tier A) |
| Q74 | `+60 12-345 6789` | `[PHONE]` | R1 (Tier A) |
| Q75 | `+57 321 1234567` | `[PHONE]` | R1 (Tier A) |
| Q76 | `+56 9 8765 4321` | `[PHONE]` | R1 (Tier A) |
| Q77 | `+51 912 345 678` | `[PHONE]` | R1 (Tier A) |
| Q78 | `+58 412-1234567` | `[PHONE]` | R1 (Tier A) |
| Q79 | `+593 99 123 4567` | `[PHONE]` | R1 (Tier A) |
| Q80 | `+595 981 123456` | `[PHONE]` | R1 (Tier A) |

### F-series: Negatives: text that must stay unchanged

| ID | Input | Output | Rule / why |
|---|---|---|---|
| F01 | `Order 4155550134 shipped` | `Order 4155550134 shipped` | No phone word nearby; bare digits need context (Tier B) |
| F02 | `Order #415-555-0134` | `Order #415-555-0134` | `#` right before the number = identifier (left guard) |
| F03 | `Invoice 2024-05-12` | `Invoice 2024-05-12` | Date shape 4-2-2 is not a phone shape |
| F04 | `SSN 123-45-6789` | `SSN 123-45-6789` | SSN shape 3-2-4 is not 3-3-4 (belongs to SSN) |
| F05 | `IP 192.168.1.1` | `IP 192.168.1.1` | IPv4 shape (belongs to IP_ADDRESS) |
| F06 | `Version 1.2.3.4` | `Version 1.2.3.4` | Groups are 1 digit long; far under 7 digits |
| F07 | `Timestamp 1700000000` | `Timestamp 1700000000` | 10-digit epoch seconds; starts with 1 so it is not valid NANP; no context |
| F08 | `ms 1700000000000` | `ms 1700000000000` | 13-digit epoch milliseconds; no context |
| F09 | `Card 4111 1111 1111 1111` | `Card 4111 1111 1111 1111` | 4-4-4-4 grouping is not a phone shape (belongs to CREDIT_CARD) |
| F10 | `Card 4111-1111-1111-1111` | `Card 4111-1111-1111-1111` | Same, dash-grouped |
| F11 | `ZIP 94105-1234` | `ZIP 94105-1234` | ZIP+4 is 5-4 digits |
| F12 | `Price $1,234,567` | `Price $1,234,567` | Comma is never a separator |
| F13 | `Code 123-456-7890` | `Code 123-456-7890` | Area code `123` starts with 1: invalid NANP; no `+`; no context |
| F14 | `Zeros 000-000-0000` | `Zeros 000-000-0000` | Area code `000` invalid |
| F15 | `Call 911` | `Call 911` | Only 3 digits |
| F16 | `ISBN 978-3-16-148410-0` | `ISBN 978-3-16-148410-0` | ISBN groups do not form a phone shape; no context |
| F17 | `Room 415 floor 5` | `Room 415 floor 5` | No chain of 7+ digits |
| F18 | `415-555-0134-0000` | `415-555-0134-0000` | Right guard: followed by `-0000` (continuation of a longer number) |
| F19 | `12-415-555-0134` | `12-415-555-0134` | Left guard: preceded by `12-` (continuation) |
| F20 | `ID415-555-0134` | `ID415-555-0134` | Left guard: letters glued directly before the digits |
| F21 | `415-555-01345` | `415-555-01345` | Right guard: an extra digit glued on (5-digit last group) |
| F22 | `Date 12.05.1990` | `Date 12.05.1990` | Date shape 2.2.4 |
| F23 | `Coords 37.7749, -122.4194` | `Coords 37.7749, -122.4194` | Decimals: groups too short |
| F24 | `Totals 100 200 300 4000` | `Totals 100 200 300 4000` | Space-only 3-3-4 candidate with a digit group adjacent needs context |
| F25 | `+12 apples` | `+12 apples` | Only 2 digits after `+` (< 7) |
| F26 | `Score +100 200` | `Score +100 200` | Only 6 digits after `+` (< 7) |
| F27 | `Order 0012345678901 shipped` | `Order 0012345678901 shipped` | Bare `00…` run with no separator and no context |
| F28 | `Call for order 4155550134` | `Call for order 4155550134` | `for` is not an allowed filler word: context chain broken |
| F29 | `Contact support. Order 4155550134 shipped` | `Contact support. Order 4155550134 shipped` | Other words between keyword and number break context |
| F30 | `Phone 123 order 4155550134` | `Phone 123 order 4155550134` | Digits between keyword and candidate break context |
| F31 | `115-555-0134` | `115-555-0134` | Area code starts with 1 (invalid NANP); no context |
| F32 | `311-555-0134` | `311-555-0134` | Area code `311` is an N11 service code |
| F33 | `415-311-0134` | `415-311-0134` | Exchange `311` is an N11 code |
| F34 | `Phone: 123456789012345678901234567890` | `Phone: 123456789012345678901234567890` | More than 15 digits cannot be a phone number, even with context |
| F35 | `415⏎555⏎0134` | `415⏎555⏎0134` | Newline is never a separator |
| F36 | `415⇥555⇥0134` | `415⇥555⇥0134` | Tab is never a separator |
| F37 | `Phone⏎4155550134` | `Phone⏎4155550134` | Context cannot span a line break |
| F38 | `+4155550134abc` | `+4155550134abc` | Right guard: letters glued after the digits |
| F39 | `Order No. 98765 43210` | `Order No. 98765 43210` | `Order` is not a keyword and `No.` alone is not one |
| F40 | `٤١٥٥٥٥٠١٣٤` | `٤١٥٥٥٥٠١٣٤` | Arabic-Indic digits are out of scope (ASCII only, L7) |
| F41 | `Call ＋１４１５５５５０１３４` | `Call ＋１４１５５５５０１３４` | Fullwidth digits / plus are out of scope (L7) |
| F43 | `1-800-FLOWERS` | `1-800-FLOWERS` | Vanity letters are out of scope (L8) |
| F44 | `2024-05-12 10:30:00` | `2024-05-12 10:30:00` | Date + time, not a phone shape |
| F45 | `Phone: 2024-05-12` | `Phone: 2024-05-12` | Context present, but the chain has a date shape (excluded) |
| F46 | `Phone: 123-45-6789` | `Phone: 123-45-6789` | Context present, but the chain has an SSN shape (excluded) |
| F47 | `Phone: 192.168.1.100` | `Phone: 192.168.1.100` | Context present, but the chain has an IPv4 shape (excluded) |
| F48 | `Phone: 12345` | `Phone: 12345` | Only 5 digits |

### M-series: Multiple occurrences, punctuation, line breaks, Unicode

| ID | Input | Output | Rule / why |
|---|---|---|---|
| M01 | `Call +1-415-555-0134, then +44 20 7946 0958.` | `Call [PHONE], then [PHONE].` | R1 (Tier A) |
| M02 | `Reach me: 415-555-0134.` | `Reach me: [PHONE].` | R4 (Tier A) |
| M03 | `415-555-0134 / 415-555-0135` | `[PHONE] / [PHONE]` | R4 (Tier A) |
| M04 | `415-555-0134,415-555-0135` | `[PHONE],[PHONE]` | R4 (Tier A) |
| M05 | `415-555-0134;415-555-0135` | `[PHONE];[PHONE]` | R4 (Tier A) |
| M06 | `(415) 555-0134.` | `[PHONE].` | R3 (Tier A) |
| M07 | `[(415) 555-0134]` | `[[PHONE]]` | R3 (Tier A) |
| M08 | `"415-555-0134"` | `"[PHONE]"` | R4 (Tier A) |
| M09 | `tel:415-555-0134` | `tel:[PHONE]` | R4 (Tier A) |
| M10 | `415-555-0134@example.com` | `[PHONE]@example.com` | R4 (Tier A): Only PHONE enabled; with EMAIL enabled the email span wins (§10.2) |
| M11 | `Call 415-555-0134\r⏎Next line` | `Call [PHONE]\r⏎Next line` | R4 (Tier A): CRLF preserved |
| M12 | `a +91 98765 43210 and +91 91234 56789 b` | `a [PHONE] and [PHONE] b` | R1 (Tier A) |
| M13 | `Téléphone : +33 1 23 45 67 89 ☎️` | `Téléphone : [PHONE] ☎️` | R1 (Tier A): Accents, emoji and variation selector preserved |
| M14 | `📞+14155550134📞` | `📞[PHONE]📞` | R1 (Tier A): Emoji (surrogate pairs) directly adjacent |
| M15 | `😀 415-555-0134 😀` | `😀 [PHONE] 😀` | R4 (Tier A): Emoji around the number |
| M16 | `Call 415-555-0134 5 times` | `Call [PHONE] 5 times` | R4 (Tier A): Tier A outranks the Tier B chain, so the `5` stays |
| M17 | `Phones: +1 415 555 0134 and (415) 555-0135` | `Phones: [PHONE] and [PHONE]` | R1 (Tier A), R3 (Tier A) |
| M18 | *(empty)* | *(empty)* | Empty input yields no spans |
| M19 | `no numbers here` | `no numbers here` | Nothing to find |
| M20 | `(415) 555-0134⏎(415) 555-0135⏎` | `[PHONE]⏎[PHONE]⏎` | R3 (Tier A): Both lines; newlines preserved |

### L-series: Documented limitations (expected = current behaviour)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| L09 | `Part 800-555-0199-X` | `Part [PHONE]-X` | R4 (Tier A): L9: valid phone shape redacted; `-X` tail stays |
| L01 | `415-555-0134-415-555-0135` | `415-555-0134-415-555-0135` | L4: hyphen-joined back-to-back numbers are not separated |
| L02 | `415 555 0134 415 555 0135` | `415 555 0134 415 555 0135` | L4: space-joined back-to-back numbers need context |
| L03 | `4155550134` | `4155550134` | L1: bare 10 digits, no context |
| L04 | `9876543210` | `9876543210` | L1: bare Indian mobile, no context |
| L05 | `040-23456789` | `040-23456789` | L2: Hyderabad-style landline, no context |
| L06 | `555-0134` | `555-0134` | L3: 7-digit local number, no context |
| L07 | `07911 123456` | `07911 123456` | L2: UK national mobile, no context |
| L08 | `020 7946 0958` | `020 7946 0958` | L2: UK national landline, no context |

### A-series: Fresh adversarial set: positives (written after Pass 1)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| A01 | `My number is +1 (212) 555-0100, thanks` | `My number is [PHONE], thanks` | R1 (Tier A) |
| A02 | `WhatsApp: +91 98765 43210!` | `WhatsApp: [PHONE]!` | R1 (Tier A) |
| A03 | `Ring (0141) 496 0123 after 5` | `Ring [PHONE] after 5` | R5 (Tier A) |
| A04 | `Fax +49 30 901820-123` | `Fax [PHONE]` | R1 (Tier A): Hyphenated extension is part of the chain (§9) |
| A05 | `cell 415 555 0134` | `cell [PHONE]` | R4 (Tier A) |
| A06 | `Phone (office): 415-555-0134` | `Phone (office): [PHONE]` | R4 (Tier A) |
| A07 | `Tel.: +33 6 12 34 56 78` | `Tel.: [PHONE]` | R1 (Tier A) |
| A08 | `Mobile: 98765-43210` | `Mobile: [PHONE]` | R6 (Tier B) |
| A09 | `+1 415 555 0134 and +1 415 555 0135` | `[PHONE] and [PHONE]` | R1 (Tier A) |
| A10 | `Call<NBSP>+1<NBSP>415<NBSP>555<NBSP>0134` | `Call<NBSP>[PHONE]` | R1 (Tier A): NBSP between words and inside the number |
| A11 | `x⏎+1 415 555 0134⏎y` | `x⏎[PHONE]⏎y` | R1 (Tier A) |
| A12 | `"+14155550134"` | `"[PHONE]"` | R1 (Tier A): Quotes preserved |
| A13 | `<tel>+14155550134</tel>` | `<tel>[PHONE]</tel>` | R1 (Tier A): Markup preserved |
| A14 | `phone=+14155550134` | `phone=[PHONE]` | R1 (Tier A): `phone=` context, plus sign |
| A15 | `+1 415 555 0134.` | `[PHONE].` | R1 (Tier A) |
| A16 | `+1 415 555 0134 ext. 1234567` | `[PHONE] ext. 1234567` | R1 (Tier A): 7-digit extension is not absorbed |

### G-series: Fresh adversarial set: negatives (written after Pass 1)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| G01 | `The year 2024 had 365 days and 8760 hours` | `The year 2024 had 365 days and 8760 hours` | No chain with 7+ digits |
| G02 | `Pi is 3.14159265358979` | `Pi is 3.14159265358979` | Decimal number |
| G03 | `See section 4.5.5.0134` | `See section 4.5.5.0134` | Dotted groups 4.5.5.0134 do not form a phone shape |
| G04 | `Amount 1,415,555,0134` | `Amount 1,415,555,0134` | Comma-grouped number |
| G05 | `UUID 123e4567-e89b-12d3-a456-426614174000` | `UUID 123e4567-e89b-12d3-a456-426614174000` | UUID: letters adjacent to digit runs |
| G06 | `MAC 00:1A:2B:3C:4D:5E` | `MAC 00:1A:2B:3C:4D:5E` | MAC address: colon-separated hex |
| G07 | `Hash 4155550134abcdef` | `Hash 4155550134abcdef` | Right guard: letters glued after the digits |
| G08 | `Path /var/4155550134/x` | `Path /var/4155550134/x` | Left/right guard: `/` adjacent (a path) |
| G09 | `Tracking 1Z999AA10123456784` | `Tracking 1Z999AA10123456784` | Tracking number: letters inside the token |
| G10 | `USPS 9400 1000 0000 0000 0000 00` | `USPS 9400 1000 0000 0000 0000 00` | Digits in groups of 4; no phone shape |
| G11 | `IBAN GB82 WEST 1234 5698 7654 32` | `IBAN GB82 WEST 1234 5698 7654 32` | IBAN: letters, groups of 4 |
| G12 | `Lat 415.555.0134.7` | `Lat 415.555.0134.7` | Right guard: `.7` continues the number |
| G13 | `Order ref 415-555-0134X` | `Order ref 415-555-0134X` | Right guard: letter glued after |
| G14 | `Call 100 200 300 4000` | `Call [PHONE]` | R6 (Tier B): Tier B: context + 13-digit chain; accepted trade-off |
| G15 | `$415.555.0134` | `$415.555.0134` | Left guard: `$` before the number (money) |

### H-series: Fresh adversarial set for version 2.0 (written before running it)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| H01 | `Total: +1500000 USD` | `Total: +1500000 USD` | Code 1 needs 10 national digits |
| H02 | `Balance +2000000 and +3500000` | `Balance +2000000 and +3500000` | Code 20 (Egypt) needs 8-10 digits; 5 given |
| H03 | `Profit +9100000` | `Profit +9100000` | Code 91 needs 10 digits; 5 given |
| H04 | `Delta +4400000000` | `Delta +4400000000` | After the UK code only zeros: fails even with trunk-zero tolerance |
| H05 | `Delta +4412345678` | `Delta [PHONE]` | R1 (Tier A): Valid UK length: redacted; a plain signed number like this is indistinguishable (L21) |
| H06 | `Growth +12 345 678 901` | `Growth [PHONE]` | R1 (Tier A): Regrouped digits that still form a valid `+1` number |
| H07 | `Version +1.2.3` | `Version +1.2.3` | Dotted version string with a plus sign |
| H08 | `x +91 98765 43210 y` | `x [PHONE] y` | R1 (Tier A) |
| H09 | `+91 98765 43210+91 98765 43211` | `[PHONE]+91 98765 43211` | First number found; the second is glued behind a digit, so the `+` guard rejects it (L18) |
| H10 | `(+91) 98765 43210` | `[PHONE]` | R1 (Tier A) |
| H11 | `tel:+91-98765-43210;ext=5` | `tel:[PHONE]` | R1 (Tier A) |
| H12 | `+91 98765 43210 ext 5` | `[PHONE]` | R1 (Tier A) |
| H13 | `Call 0091 98765 43210` | `Call [PHONE]` | R2 (Tier A) |
| H14 | `0089 415 555 0134` | `0089 415 555 0134` | Invalid code after `00` |
| H15 | `Phone: 0089 415 555 0134` | `Phone: 0089 415 555 0134` | Invalid code after `00`, with a phone word |
| H16 | `+44 (0)20 7946 0958` | `[PHONE]` | R1 (Tier A) |
| H17 | `+1 (415) 555-0134 / +44 20 7946 0958` | `[PHONE] / [PHONE]` | R1 (Tier A) |
| H18 | `invoice +91 4155550134` | `invoice [PHONE]` | R1 (Tier A) |
| H19 | `+91 0415 555 0134` | `[PHONE]` | R1 (Tier A): Trunk zero tolerated (D14) |
| H20 | `+39 0612345678` | `[PHONE]` | R1 (Tier A): Italy keeps its leading zero |
| H21 | `+7 (495) 123-45-67` | `[PHONE]` | R1 (Tier A) |
| H22 | `+1 (800) 555-0199` | `[PHONE]` | R1 (Tier A): Toll-free redacted (D7) |
| H23 | `+1 (911) 555-0134` | `+1 (911) 555-0134` | NANP area code `911` is an N11 code |
| H24 | `+44 20 7946 0958.` | `[PHONE].` | R1 (Tier A) |
| H25 | `IDs: +1 111 222 3333` | `IDs: +1 111 222 3333` | NANP area code starts with 1 |
| H26 | `+91-98765-43210-9` | `+91-98765-43210-9` | Valid number followed by `-9`: continuation rule leaves it unchanged (L19) |
| H27 | `Tel +49 (0)30 901820 / Fax +49 (0)30 901821` | `Tel [PHONE] / Fax [PHONE]` | R1 (Tier A) |
| H28 | `+358 (0)40 123 4567` | `[PHONE]` | R1 (Tier A) |
| H29 | `+81 (0)3-1234-5678` | `[PHONE]` | R1 (Tier A) |
| H30 | `+86 10 8888 8888` | `[PHONE]` | R1 (Tier A) |
| H31 | `Revenue grew +20 000 000 in Q3` | `Revenue grew +20 000 000 in Q3` | Code 20 needs 8-10 digits; 6 given |
| H32 | `Temp +30 31 32` | `Temp +30 31 32` | Code 30 needs 10 digits; 4 given |
| H33 | `Range +40 to +60` | `Range +40 to +60` | No digits after the code |
| H34 | `C+1234567890` | `C+1234567890` | Code 1 needs 10 national digits; 9 given |
| H35 | `x+1 415 555 0134` | `x[PHONE]` | R1 (Tier A): Letters before `+` are allowed |
| H36 | `2+1 415 555 0134` | `2+1 415 555 0134` | A digit directly before `+` (left guard, L18) |

### C-series: claim checks (behaviours stated in this document)

| ID | Claim | Input | Output |
|---|---|---|---|
| C01 | A valid country code with the wrong national length is not redacted (D17) | `+1 415 555 013` | `+1 415 555 013` |
| C02 | Back-to-back numbers joined by spaces only: second one is missed (L4) | `+1 415 555 0134 415 555 0135` | `[PHONE] 415 555 0135` |
| C03 | Back-to-back parenthesised numbers are both found | `(415) 555-0134 (415) 555-0135` | `[PHONE] [PHONE]` |
| C04 | Back-to-back dash-separated numbers are both found | `415-555-0134 415-555-0135` | `[PHONE] [PHONE]` |
| C05 | Space-separated NANP with a keyword | `Phone: 415 555 0134` | `Phone: [PHONE]` |
| C06 | 8-digit extension is not absorbed | `+1 415 555 0134 ext 99999999` | `[PHONE] ext 99999999` |
| C07 | Trailing sentence period is preserved | `Call 4155550134.` | `Call [PHONE].` |
| C08 | Date of birth (ISO) is not a phone | `DOB: 1990-05-12` | `DOB: 1990-05-12` |
| C09 | Date of birth (US slash) is not a phone | `DOB: 05/12/1990` | `DOB: 05/12/1990` |
| C10 | Date of birth (day-first dash) is not a phone | `DOB: 12-05-1990` | `DOB: 12-05-1990` |
| C11 | "born on" + dotted date is not a phone | `born on 12.05.1990` | `born on 12.05.1990` |
| C12 | Keywords are case-insensitive | `PHONE: 4155550134` | `PHONE: [PHONE]` |
| C13 | No space needed after the colon | `phone:4155550134` | `phone:[PHONE]` |
| C14 | 15-digit card-like number next to a phone word matches R6 (CREDIT_CARD outranks it when enabled) | `Phone: 378282246310005` | `Phone: [PHONE]` |
| C15 | 16 digits exceed the 15-digit cap: left alone | `Phone: 4111111111111111` | `Phone: 4111111111111111` |
| C16 | `+1` takes exactly 10 national digits; the trailing group stays | `+1 415 555 0134 5678` | `[PHONE] 5678` |
| C17 | Tier B chain absorbs a trailing small group (L5) | `Phone: 98765 43210 5 times` | `Phone: [PHONE] times` |
| C18 | UK numbers take at most 10 national digits; the rest is left alone | `+44 20 7946 0958 123 456 7890` | `[PHONE] 123 456 7890` |
| C19 | Tel and Fax numbers in one sentence | `Tel: +1 415 555 0134 / Fax: +1 415 555 0135` | `Tel: [PHONE] / Fax: [PHONE]` |
| C20 | Not idempotent: run 1 then run 2 (L12) | `+1 415 555 0134 415 555 0135` | run 1: `[PHONE] 415 555 0135` → run 2: `[PHONE] [PHONE]` |
| C21 | An invalid `+` chain also blocks a valid number written directly after it (L20) | `+1500000 415-555-0134` | `+1500000 415-555-0134` |
| C22 | A plain signed number with a valid code and valid length is redacted (L21) | `+4412345678` | `[PHONE]` |
| C23 | Valid length but implausible prefix: redacted (L11) | `+91 12345 67890` | `[PHONE]` |
| C24 | Wrong length for India: not redacted (L11) | `+91 98765 4321` | `+91 98765 4321` |
| C25 | Hyphen-joined suffix after a fixed-length number: left unchanged (L19) | `+1-415-555-0134-22` | `+1-415-555-0134-22` |
| C26 | Hyphenated extension on a variable-length country is absorbed | `+49 30 901820-123` | `[PHONE]` |
| C27 | A digit glued directly before `+` (L18) | `5+1 415 555 0134` | `5+1 415 555 0134` |
| C28 | Global-service code is not accepted (L16) | `+800 1234 5678` | `+800 1234 5678` |



---

## 13. Verification log

Version 1.0 of these rules was verified twice. After the task giver's clarifications the rules were **revised (2.0) and the whole verification was repeated**, with new checks added. Verification used a throwaway JavaScript reference sketch written from this specification (it is **not** the deliverable implementation). The final TypeScript implementation must pass the same tables in §12 as its unit tests.

### Pass 1: specification vs. executable matrix

- **265** cases in §12 (series P, Z, N, T, B, K, E, V, Q, F, M, L).
- **Version 1.0 history:** the first run passed 146 of 149. The 3 mismatches were analysed: (1) `wa.me/14155550134` was blocked by the left guard (rule bug, fixed: URL context bypasses it); (2) `Call 415-555-0134 5 times` lost its `5` because a Tier B chain out-ranked the exact Tier A match (rule bug, fixed: Tier A outranks Tier B); (3) one expectation (`Part 800-555-0199-X`) was a wrong guess and became limitation L9.
- **Version 2.0:** the extended matrix (new series E, V, Q: the task giver's example, 23 validation cases, 80 per-country examples) passed completely on the first run. A clean first run can also mean weak tests, so the new rules were additionally **mutation-checked** (Pass 2, item 4).

### Pass 2: independent checks written after Pass 1

1. **Review checklist** of the brief and the clarifications against this document:

| Requirement | Covered by |
|---|---|
| Phone numbers in common formats, including country codes | §4, R1-R5; series P, Z, N, T, Q |
| Clarification: do not redact every 10-digit number; order/transaction IDs stay unchanged | Tier B context gate; E02, E03, F01, F07, F08 |
| Clarification: `+1500000` stays unchanged | §6A, D3; E05, V01, H01-H03 |
| Clarification: country codes must be valid and assigned (`+91` yes, `+89` no) | §6A.1; V02-V05, V12-V18 |
| Clarification: the number must follow the country's numbering rules | §6A.2; V06-V11, V19-V20, H31-H34 |
| Clarification: the example text gives `[PHONE]` only for `+91-415-555-0134` | E01 |
| Missing / empty / invalid input | PHONE-level: empty string yields no spans (M18). `null`, non-string and unknown-entity handling belongs to the service layer |
| Multiple occurrences of the same entity | M01-M05, M12, M17, M20, A09 |
| Overlapping rules and duplicate replacement | §10; fuzz invariant: spans sorted, non-overlapping, in range |
| Different formats of the same entity | §4 catalogue; over 180 positive rows |
| False positives (ordinary numbers resembling phones) | F-, G-, V- and H-series; §7, §8 |
| Punctuation, line breaks, Unicode | M02, M06-M08, M11, M13-M15, F35-F36, F40-F41, P29-P33, A10 |
| "Must not silently corrupt unrelated text" | fuzz invariant below: text outside spans is byte-identical |
| Document limitations | §11 (21 entries) |

2. **Country-code table check (script):** 206 codes; compared with the ITU list (position 15 Dec 2016): **0 missing, 0 extra**; none of the ITU spare / reserved / global-service codes present; **0 prefix conflicts**; no duplicates; every range valid.
3. **Fuzzing:** 60,000 random strings built from digits, separators, `+ ( ) . x # :`, tabs, newlines, NBSP, en dash, emoji, accented letters and phone-ish words. **0 exceptions; 0 invariant failures** (every span in range, sorted and non-overlapping; rebuilding the output from untouched slices plus `[PHONE]` equals the real output; every matched span has at least 7 digits). 1,603 inputs contained at least one match. **Idempotence probe:** 3 of 60,000 were not idempotent; all 3 classified (new match within 3 characters of a replaced number), documented as L12.
4. **Mutation check:** nine deliberate weakenings of the new rules; **every one made tests fail**, so the tests really exercise the rules:

| Mutation | Tests that fail |
|---|---|
| M1: accept any 2-digit country code (no ITU table) | 12 (V02-V05, V12-V15, …) |
| M2: ignore per-country length ranges | 21 (F26, E01, E05, V01, V06-V09, …) |
| M3: drop rejected-chain tail blocking | 2 (V04, H15) |
| M4: allow the country code to span groups | 1 (V17) |
| M5: drop Tier-A-over-Tier-B precedence | 1 (M16) |
| M6: drop the context requirement for bare chains | 36 (F01, F07-F09, F11, …) |
| M7: ignore NANP structure | 5 (V08-V10, H23, H25) |
| M8: ignore the `+7` first-digit rule | 1 (V11) |
| M9: no trunk-zero tolerance | 3 (V22, V23, H19) |

5. **Performance / pathological input** (200-500 KB each: long digit runs, `1 1 1 …`, `+1 +1 …`, `((((`, repeated numbers, repeated keywords, dashes, `00 00 …`, mixed NBSP/dash, `+91 … ` repeated, `(+1) ` repeated, `+0+0…`, `+99 +99 …`, numbers with context repeated). **Two real defects were found and fixed here:** (a) the rejected-chain lookup was a linear scan, taking **46 s** on 300 KB of `+1 +1 …` (now a position mask); (b) the context look-back searched the whole text for a line break, taking 2-3 s on 300 KB of repeated numbers (now bounded to 60 characters). After the fixes the worst case is **≈130 ms**; no catastrophic backtracking.
6. **Fresh adversarial sets:** series A and G (31 cases, written after Pass 1 of 1.0; one wrong expectation, A04, explained in §9) and series H (36 cases, written for 2.0 *before* running them: money amounts, versions, glued numbers, trunk zeros, invalid codes after `00`, hyphen suffixes, regional formats). All pass.
7. **Claim check (series C):** every concrete behaviour claimed in this document that was not already a matrix row was executed; results are in the C table.
8. **Gap review:** (1.0) context keywords were English-only, so a sample multilingual list was added (§8.1, series K); (2.0) the code table was cross-checked against the ITU list rather than trusted from memory.

### Final numbers

| Check | Result |
|---|---|
| Matrix (Pass 1) | 265 / 265 |
| Fresh adversarial, series A and G | 31 / 31 |
| Fresh adversarial, series H | 36 / 36 |
| Claim checks | 28 executed, behaviour as documented |
| Mutation check | 9 / 9 mutants detected |
| Country-code table vs ITU list | 0 missing, 0 extra, prefix-free |
| Fuzz | 60,000 inputs, 0 exceptions, 0 invariant failures |
| Worst-case time | ≈130 ms on 200-500 KB pathological input |

### Changed after the first implementation

- **§8.1:** the possessive phrases `my number`, `your number`, `our number`, `his number`, `her number`, `their number` were added to the keywords; multi-word keywords accept one or more spaces or tabs between their words. B18-B22 were added; no existing PHONE row changed (A01 still gives `My number is [PHONE], thanks`). Changed after implementation; executed by the TypeScript tests.
- **§8.1:** CJK keywords need no word boundary (a CJK keyword glued to other CJK text, `患者电话：13800138000`, leaked before). K10-K12 were added. Changed after implementation; executed by the TypeScript tests.

---

## 14. Notes for the TypeScript implementation

- One detector object: `{ type: "PHONE", find(text): PhoneCandidate[] }`, where `PhoneCandidate = { type, start, end, tier: "A" | "B", rule: "R1" … "R6" }`. The shared resolver ignores `tier`/`rule`; they exist for tests and debugging.
- Keep the **country-code / length table (`cc_data`)**, the keyword list, the filler list and the separator set as **data** (constants), not inline regex, so they can be corrected without touching the rules or the replacer.
- The same data-not-code rule applies to extending detection without touching replacement logic (stretch goal 4).
- Offsets are UTF-16 code-unit indices into the original string, the same indices the replacer uses. Guards read the neighbouring *code point* (not just the code unit) so emoji next to a number are handled safely (M14, M15).
- All finder regexes are fixed-width or bounded; chain scanning is capped (§5), which is why pathological input stays linear in practice.
