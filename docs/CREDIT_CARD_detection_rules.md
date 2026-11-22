# CREDIT_CARD detection rules

**Entity:** `CREDIT_CARD` | **Placeholder:** `[CREDIT_CARD]` | **Spec version:** 1.0
**Status:** rules complete and **verified** (see §10). Every example in this document was executed, not just written.
**Basis:** the task giver's clarification: a credit card number is **12-19 digits**, written with or without spaces or hyphens, and must **pass the Luhn check**. (The original brief only says "common formats, with appropriate validation"; an earlier planning note said 13-19. The clarification, 12-19, is the one used here.)

---

## 0. Summary (read this first)

- The detector looks for **runs of digits joined by single spaces or hyphens** (a "chain"). Inside a chain it accepts a **window of digit groups** only if all of these hold: 12-19 digits in total, a believable group layout, a first digit other than `0`, not one repeated digit, and **a passing Luhn checksum**.
- It is **format-based, not brand-based**. Visa, Mastercard, Amex, Discover, JCB, Diners, UnionPay, Mir and any other 12-19 digit Luhn-valid number are treated the same. There is no list of issuer prefixes (D6).
- **No context words are needed and none are used.** `Order 4111111111111111` is redacted if the number passes Luhn; a phone word next to it does not stop it (D9). The Luhn check is what keeps ordinary numbers safe: about 9 in 10 random 16-digit numbers fail it.
- It protects the text around the number: punctuation, brackets, quotes, line breaks, emoji and a sentence-final period stay exactly as written (`Card: 4111 1111 1111 1111.` → `Card: [CREDIT_CARD].`).
- It handles the awkward cases that come with real data: a **CVV or expiry** written after the card (`4111 1111 1111 1111 12 25`), **two or three cards in a row** (`A B C` separated by single spaces), and a **stray group in front** of a card. Overlapping candidate windows are **merged**, so no digit of a real card is left behind (D5).
- Things it deliberately does **not** do are in §8 with an example and a reason. The most important: a card number with a **typo fails Luhn and is not redacted** (L1), and any **Luhn-valid 12-19 digit number** (a timestamp, an ISBN, an ID) **is redacted** (L5). About 1 in 10 such numbers passes by chance.
- **Two open decisions** (O1, O2) are listed at the end of §3. Both decisions use the recommended option; with the resolver's union rule (SSN O3), O1's example now becomes `[CREDIT_CARD]` with nothing left behind.

> **Honest scope statement.** "Nothing missed" is achievable for the *declared scope* (§1) and the *documented limitations* (§8): every gap is named. No rule-based detector can claim to catch every number that looks like a card; this one claims to catch every format listed here and is explicit about the rest.

---

## 1. Scope

### 1.1 In scope

| Kind of number | Handled? | Example |
|---|---|---|
| 12 to 19 digits with no separators | Yes | `4111111111111111` |
| Groups joined by single spaces | Yes | `4111 1111 1111 1111` |
| Groups joined by single hyphens | Yes | `4111-1111-1111-1111` |
| Mixed spaces and hyphens | Yes | `4111 1111-1111 1111` |
| Unicode spaces and dashes (NBSP, thin space, narrow NBSP, en dash, non-breaking hyphen, minus sign) | Yes | `4111<NBSP>1111<NBSP>1111<NBSP>1111` |
| American Express layout 4-6-5 | Yes | `3782 822463 10005` |
| Diners layout 4-6-4 | Yes | `3056 930902 5904` |
| Layouts of 13 to 19 digits with a short last group | Yes | `4222 2222 2222 2`, `4111 1111 1111 1111 003` |
| Card followed or preceded by extra groups (CVV, expiry) | Yes, the card is found (§5.4) | `4111 1111 1111 1111 12 25` → `[CREDIT_CARD] 12 25` |
| Several cards in a row separated by single separators | Yes | `4111111111111111 5555555555554444` |
| Official test numbers (`4111 1111 1111 1111`, `3782 822463 10005`) | Yes | There is no allow-list of test numbers (D14) |
| Inside punctuation, markup, JSON, URLs, query strings | Yes | `cc=4111111111111111&x=1` |

### 1.2 Out of scope (see §8 for reasons)

Numbers that fail Luhn (typos, truncated or made-up numbers), card numbers split by dots, double spaces, newlines, tabs, commas or slashes, non-ASCII digits, numbers in words, masked numbers (`4111 **** **** 1111`), CVV / expiry / PIN on their own, issuer detection, and every other entity type.

---

## 2. Terminology used by the rules

| Term | Meaning |
|---|---|
| **Digit run** | A maximal run of ASCII digits `0-9`. |
| **Separator** | Exactly one of: space, NBSP `U+00A0`, thin space `U+2009`, narrow NBSP `U+202F`, hyphen-minus `-`, any of `U+2010`-`U+2015` (hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar), minus sign `U+2212`. **Never** a separator: dot, comma, slash, colon, semicolon, underscore, **tab, newline, carriage return**. |
| **Group** | One digit run inside a chain. |
| **Chain** | Digit runs joined by **exactly one** separator character between neighbours. |
| **Window** | A block of consecutive groups inside one chain: the candidate for one card number. |
| **Luhn check** | The standard card checksum: from the right, double every second digit (subtract 9 if the result is above 9), add everything, and the sum must be divisible by 10. |
| **Span** | `{ type: "CREDIT_CARD", start, end }`, offsets into the original string. |
| **Left / right guard** | A check on the character just before the first digit / just after the last digit of a window that touches the end of its chain (§5.3). |

---

## 3. Design decisions and why

| # | Decision | Reason |
|---|---|---|
| D1 | A number must be **12-19 digits** and **pass Luhn**. | The task giver's rule. Luhn removes about 90% of random digit strings. |
| D2 | **Separators are single spaces or hyphens** (plus their Unicode look-alikes). Newline, tab, comma, dot and slash never join groups. | "With or without spaces or hyphens" is the task giver's wording. Joining across a newline, comma or dot would merge neighbouring list items, table cells, decimals or version numbers into one fake number. |
| D3 | A multi-group window must have a believable **layout**: every group except the last has 4-8 digits, and the last group has 1-8. A window made of one group needs 12-19 digits. | Covers `4-4-4-4`, `4-6-5`, `4-6-4`, `4-4-4-4-3`, `4-4-4-1` and similar. Rejects lists of small numbers (`41 11 11 11 ...`) and date/time chains. |
| D4 | Multi-group windows are tried **only at the start or the end of a chain**. A **single bare run** of 12-19 digits is tried **anywhere** in a chain. | Long numeric identifiers (tracking numbers, IBAN digit tails) contain many Luhn-valid windows by chance. Anchoring to the chain ends keeps the false-positive rate down. Cards are found when they have extras after them (CVV, expiry) or before them. Bare runs have no layout ambiguity, so lists such as `A B C` of bare cards all match (this also made the detector idempotent in testing, §10). Cost: L2. |
| D5 | **Overlapping accepted windows are merged** into one span. | When a stray group in front of a card makes a *different* window pass Luhn by chance (`1000 4111 1111 1111 1111`), keeping only one of them would leave part of the real card in the output. Merging is the safe error. Test CS12, mutant M12. |
| D6 | **No issuer (IIN/brand) check.** Two cheap sanity rules only: the first digit is not `0`, and the number is not one repeated digit. | The task giver defined cards by length and Luhn. Issuer ranges change, private-label and regional cards exist, and a stale table causes **leaks**. Cost: about 1 in 10 random 12-19 digit numbers passes by chance (L5). Optional later: ship issuer ranges as data and add a strict mode. |
| D7 | **Guards** protect the edges of a window: no letter, digit-like character, combining mark or `_` directly next to it, no `+` directly before it (international phone number), no decimal point joining it to more digits. | Keeps `ID4111...`, hex tokens, `+919876543210`, and `4111111111111111.50` out. |
| D8 | `#`, `$`, `:`, `/`, `=`, `@`, `(`, `"` and similar characters next to the digits do **not** block a match. | `Card #4111...` is a real way to write a card. For a privacy tool the safe error is redacting too much. Cost: L6. |
| D9 | **No context is required, and a nearby phone word does not block a match.** | A Luhn-valid 16-digit number is strong evidence by itself. `Phone: 378282246310005` is a card; CREDIT_CARD outranks PHONE (§7). |
| D10 | **ASCII digits only; no Unicode normalisation.** | Normalising (e.g. NFKC) can change string length and shift offsets, which would risk corrupting unrelated text. |
| D11 | Extra digit groups next to a card (CVV, expiry) are **not part of the card** by design. They are absorbed only when the checksum of a larger window happens to pass (L9). | We cannot tell a CVV from the end of a longer number. Leaving a CVV behind is harmless; swallowing one is harmless too. |
| D12 | Single pass. | Simple and predictable. In 80,000 random adversarial inputs, re-running on the output changed nothing (§10). |
| D13 | Priority against other entities: **CREDIT_CARD is rank 1** (it outranks SSN, EMAIL, IP_ADDRESS, DATE_OF_BIRTH and PHONE). | Agreed global order (§7): Luhn-validated, and the most damaging to leak. |
| D14 | Official **test numbers are redacted** like any other card. | They pass Luhn and cannot be told from real cards. |
| D15 | **Dots are not separators.** | Task giver: spaces or hyphens. A dot also joins decimals and versions (`3.14159265358979`). Cost: L3. |

### Open decisions for you

| # | Question | My recommendation |
|---|---|---|
| O1 | A card-shaped email local part (`4111111111111111@example.com`) currently becomes `[CREDIT_CARD]@example.com`, because CREDIT_CARD outranks EMAIL. Alternative: add a guard so a number directly next to `@` is left for the EMAIL detector, giving `[EMAIL]`. | Keep the agreed priority (no extra rule): both outcomes remove the digits, and the priority table stays simple. Tell me if you prefer `[EMAIL]`. **Resolved (22 Nov 2026):** keep the priority; the resolver's union rule (`SERVICE_AND_RESOLVER_rules.md` §4) now replaces the whole address, so the result with both detectors enabled is `[CREDIT_CARD]`. |
| O2 | Add an optional strict mode with issuer ranges (IIN) to cut false positives on timestamps, ISBNs and IDs? | Not now. Mention it in the README as a future improvement; the task giver defined cards by length and Luhn. |

---

## 4. Algorithm

1. **Input:** a string (type/emptiness checks are the service layer's job; an empty string yields no spans).
2. **Find digit runs** (ASCII digits) from left to right.
3. **Build chains:** consecutive runs are in the same chain when exactly one separator character lies between them.
4. For each chain, compute the **left guard** (character before the first digit) and the **right guard** (character after the last digit), §5.3.
5. **Generate windows:**
   1. *Start-anchored:* groups `1..k` for k = 1, 2, … while the total stays at most 19 digits and the groups stay card-like (§5.2).
   2. *End-anchored:* groups `k..n` for k = n, n-1, … with the same limits.
   3. *Bare runs:* every single group of 12-19 digits, wherever it sits in the chain.
6. **Accept a window** only if: the guard of each end that touches the chain end passes; it has 12-19 digits; its layout is valid (§5.2); the first digit is not `0`; the digits are not all identical; the Luhn check passes.
7. **Merge** overlapping accepted windows (D5) and emit `{ type: "CREDIT_CARD", start, end }` for each result.
8. Detection never edits text. The replacer (a separate module) copies untouched text between spans and inserts `[CREDIT_CARD]`.

### Constants

| Constant | Value |
|---|---|
| Digits per number | 12-19 |
| Single-group window | 12-19 digits |
| Groups of a multi-group window | all but the last: 4-8 digits; last: 1-8 digits |
| Separator set | §2 |
| First digit | `1`-`9` (not `0`) |
| Uniform check | reject a number made of one repeated digit |
| Guard characters | letters, numbers, marks (`\p{L}`, `\p{N}`, `\p{M}`), `_`, `+` (left only), `.` next to a digit |

---

## 5. Rule specifications

### 5.1 Chains (D2)

A chain is built from digit runs only. A character that is not a separator, or **two** separator characters in a row (`4111  1111`), ends the chain. Letters, punctuation, newlines and tabs all end it.

### 5.2 Window layout (D3)

- **One group:** 12-19 digits (`4111111111111111`).
- **Several groups:** every group except the last has 4-8 digits; the last has 1-8 digits; the total is 12-19.
- Examples that pass: `4111 1111 1111 1111`, `3782 822463 10005`, `3056 930902 5904`, `4222 2222 2222 2`, `4111 1111 1111 1111 003`.
- Examples that fail: `41 11 11 11 11 11 11 11` (groups of 2), `4111111111 1111111111` (groups of 10), `411111 1111111111` (6 and 10, L4).

### 5.3 Guards (D7, D8)

**Left guard** (applies when the window starts at the beginning of its chain). The character right before the first digit must **not** be:
- a letter, a digit-like character (any Unicode number), a combining mark or `_`;
- `+` (an international phone number such as `+919876543210`);
- `.` when the character before it is an ASCII digit (the digits are the decimal part of a number, `0.4111111111111111`).

**Right guard** (applies when the window ends at the end of its chain). The character right after the last digit must **not** be:
- a letter, a digit-like character, a combining mark or `_` (`4111111111111111abc`, `4111111111111111_`);
- `.` followed by an ASCII digit (`4111111111111111.50`).

A sentence-final period is fine (`4111111111111111.` → `[CREDIT_CARD].`). Guards are **not** applied to the edge of a window that sits inside a chain: there the neighbour is a separator followed by more digits, and the extra groups simply stay outside the window (D11).

### 5.4 Extra groups next to a card (D4, D11)

| Input | Output | Why |
|---|---|---|
| `4111 1111 1111 1111 12 25` | `[CREDIT_CARD] 12 25` | The first four groups form a valid window; the 2-digit groups stay |
| `12 25 4111 1111 1111 1111` | `12 25 [CREDIT_CARD]` | End-anchored window |
| `A12 4111 1111 1111 1111` | `A12 [CREDIT_CARD]` | The letter guard only applies to the **window** start; here the window starts later |
| `4111 1111 1111 1111 003` | `[CREDIT_CARD]` | The whole 19-digit chain passes Luhn |
| `4111 1111 1111 1111 004` | `[CREDIT_CARD] 004` | The whole chain fails; the 16-digit window passes |

Whether a trailing group is absorbed depends on the checksum, not on what the group means (L9).

### 5.5 Sanity rules (D6)

- The first digit is not `0`. Numbers starting with `0` are not payment cards; this also keeps `00`-prefixed phone numbers (`00442079460958`) and zero-padded IDs out.
- The digits are not all the same (`8888888888888888` passes Luhn but is not a card).

---

## 6. Punctuation and layout behaviour

| Situation | Result |
|---|---|
| Sentence end: `Card: 4111 1111 1111 1111.` | `Card: [CREDIT_CARD].` |
| Brackets / quotes / JSON / markup | delimiters stay |
| Lists separated by `,` `;` `/` or newline | each card replaced separately |
| Several cards separated by single spaces or hyphens | each card replaced separately (bare runs, D4) |
| Line breaks (`\n`, `\r\n`), tabs, emoji, accents, zero-width characters | preserved byte-for-byte |
| Same card repeated | every occurrence replaced; count = number of occurrences |
| A word, `#`, `:` or `-` before the digits (`Visa-4111...`, `#4111...`) | the word and the symbol stay; the number is replaced |

---

## 7. Interaction with other entities

Agreed priority: **CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE**. CREDIT_CARD yields to nobody.

| Situation | Result when all detectors are on | Note |
|---|---|---|
| `Phone: 378282246310005` | `Phone: [CREDIT_CARD]` | The PHONE rules would also match this 15-digit number next to a phone word (PHONE C14); the card wins |
| `Phone: 4111111111111111` | `Phone: [CREDIT_CARD]` | PHONE alone leaves it unchanged (16 digits, PHONE C15) |
| `+919876543210` | `[PHONE]` | The `+` guard keeps it out of CREDIT_CARD (CF09), even when the digits pass Luhn |
| `0044 20 7946 0958`, `Phone: 00442079460958` | `[PHONE]` / PHONE rules | Leading `0` and the group layout keep them out of CREDIT_CARD (CF33, CF34) |
| `4111111111111111@example.com` | `[CREDIT_CARD]` | CREDIT_CARD outranks EMAIL; the EMAIL span contains the card span and the union rule replaces the whole address (`SERVICE_AND_RESOLVER_rules.md` SI08; derived, not executed). With only CREDIT_CARD enabled: `[CREDIT_CARD]@example.com`. |
| SSN `123-45-6789`, IPv4 `192.168.100.200`, dates `2024-05-12 10:30:00`, ISO dates | unchanged by CREDIT_CARD | Too few digits and not a card layout (CF24, CF26, CF27) |
| A real Luhn-valid 12-digit number after a phone word (`Call 945695971982`) | `Call [CREDIT_CARD]` | L8: the card rule has no context and outranks PHONE |

The **cross-check** in §10 ran the CREDIT_CARD detector over every string in the PHONE and EMAIL test tables: it matched only the rows that really contain a Luhn-valid card number.

---

## 8. Known limitations (explicit, with reasons)

| # | Limitation | Example | Why accepted / mitigation |
|---|---|---|---|
| L1 | A card number that **fails Luhn is not redacted**: a typo, a truncated number or an invented number. | `4111 1111 1111 1112` stays | The task giver's rule: Luhn is the validation. Cost: a mistyped real card **leaks**. Optional later: a "mistyped card" rule with brand prefixes and a keyword. |
| L2 | A card with extra digit groups on **both sides**, or sitting in the middle of a long chain of **grouped** numbers, is missed. | `1007 4111 1111 1111 1111 1013` stays (CL07) | D4: middle windows are not tried because long numeric identifiers would produce many false matches. Bare cards in the middle **are** found. |
| L3 | Dots, double spaces, newlines, tabs, commas and slashes are not separators. | `4111.1111.1111.1111`, `4111  1111  1111  1111`, `4111⏎1111⏎1111⏎1111` stay | D2, D15: joining across them merges unrelated things. Cost: cards written that way leak. |
| L4 | Layouts outside the group rule are missed. | `411111 1111111111` (6-10) stays (CL06) | D3. Add the layout to the data if it ever appears. |
| L5 | **Any Luhn-valid 12-19 digit number is redacted**, including timestamps, epoch milliseconds, ISBN/EAN barcodes, and IDs. About 1 in 10 such numbers passes by chance. | `ms 1700000000004`, `ts 20240512103001`, `ISBN 9783161484102` (CL01-CL03) | D6: no issuer table. The brief says to reduce, not remove, false positives. Optional strict mode (O2). |
| L6 | A valid number inside a URL path, query value or file name is redacted. | `/pay/4111111111111111/x` → `/pay/[CREDIT_CARD]/x` (CL04) | D8: for a privacy tool the safe error is redacting too much. |
| L7 | Non-ASCII digits (Arabic-Indic, fullwidth) and numbers written in words are not detected. | `٤١١١…`, `４１１１…` | D10: normalising shifts offsets. |
| L8 | A phone-like or email-like string that passes Luhn becomes CREDIT_CARD, not PHONE/EMAIL, because CREDIT_CARD ranks first. | `Call 945695971982`, `4111111111111111@example.com` (CL05, CL09) | Agreed priority (§7). The digits are removed either way. |
| L9 | Extra groups after a card are absorbed only when the checksum of the longer window passes. | `4111 1111 1111 1111 003` → `[CREDIT_CARD]`, but `… 004` → `[CREDIT_CARD] 004` (CL08, C01, C02) | D11: harmless either way; do not rely on it. |
| L10 | A card glued directly to letters or `_` is missed. | `ID4111111111111111`, `4111111111111111abc` stay (CF10-CF14) | D7: needed to keep hex tokens and identifiers out. Cost: such a card leaks. |
| L11 | Other card data is not detected on its own: CVV, expiry date, PIN, cardholder name, masked numbers. | `cvv 123`, `exp 12/25`, `4111 **** **** 1111` | Out of scope. Names are an optional stretch goal. |
| L12 | The whole span is replaced; the last four digits are not kept. | `[CREDIT_CARD]` only | The brief asks for entity-specific placeholders, not partial masks. |

---

## 9. Test matrix (every row was executed)

Legend: `⏎` = newline, `⇥` = tab, `\r⏎` = CRLF, `<NBSP>` `<NNBSP>` `<THIN>` `<EN>` `<NBH>` `<MINUS>` `<ZWSP>` `<RLM>` `<COMB>` = the corresponding Unicode characters (no-break space, narrow no-break space, thin space, en dash, non-breaking hyphen, minus sign, zero-width space, right-to-left mark, combining acute accent). Numbers shown are Luhn-valid test numbers unless a row says otherwise. In every row only `CREDIT_CARD` is enabled.

### CC-series: numbers that must be redacted (53 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| CC01 | `4111111111111111` | `[CREDIT_CARD]` | Visa, 16 digits, no separators |
| CC02 | `4111 1111 1111 1111` | `[CREDIT_CARD]` | Spaces, 4-4-4-4 |
| CC03 | `4111-1111-1111-1111` | `[CREDIT_CARD]` | Hyphens, 4-4-4-4 |
| CC04 | `4111 1111-1111 1111` | `[CREDIT_CARD]` | Mixed space and hyphen |
| CC05 | `4111<NBSP>1111<NBSP>1111<NBSP>1111` | `[CREDIT_CARD]` | No-break spaces |
| CC06 | `4111<EN>1111<EN>1111<EN>1111` | `[CREDIT_CARD]` | En dashes |
| CC07 | `4111<NNBSP>1111<NNBSP>1111<NNBSP>1111` | `[CREDIT_CARD]` | Narrow no-break spaces |
| CC08 | `4111<MINUS>1111<MINUS>1111<MINUS>1111` | `[CREDIT_CARD]` | Minus signs (U+2212) |
| CC09 | `4111<NBH>1111<NBH>1111<NBH>1111` | `[CREDIT_CARD]` | Non-breaking hyphens |
| CC10 | `4012888888881881` | `[CREDIT_CARD]` | Visa, second test number |
| CC11 | `5555 5555 5555 4444` | `[CREDIT_CARD]` | Mastercard 5-series |
| CC12 | `2223 0000 4840 0011` | `[CREDIT_CARD]` | Mastercard 2-series |
| CC13 | `6011 1111 1111 1117` | `[CREDIT_CARD]` | Discover |
| CC14 | `3530 1113 3330 0000` | `[CREDIT_CARD]` | JCB |
| CC15 | `6200 0000 0000 0005` | `[CREDIT_CARD]` | UnionPay |
| CC16 | `2200 4569 5971 9848` | `[CREDIT_CARD]` | Mir (2200 range) |
| CC17 | `378282246310005` | `[CREDIT_CARD]` | Amex, 15 digits, no separators |
| CC18 | `3782 822463 10005` | `[CREDIT_CARD]` | Amex 4-6-5 with spaces |
| CC19 | `3714-496353-98431` | `[CREDIT_CARD]` | Amex 4-6-5 with hyphens |
| CC20 | `30569309025904` | `[CREDIT_CARD]` | Diners, 14 digits |
| CC21 | `3056 930902 5904` | `[CREDIT_CARD]` | Diners 4-6-4 |
| CC22 | `38520000023237` | `[CREDIT_CARD]` | Diners, second number |
| CC23 | `4222222222222` | `[CREDIT_CARD]` | Visa, 13 digits |
| CC24 | `4222 2222 2222 2` | `[CREDIT_CARD]` | Visa 13 digits, grouped 4-4-4-1 |
| CC25 | `675945695970` | `[CREDIT_CARD]` | 12 digits (the shortest length) |
| CC26 | `6759 4569 5970` | `[CREDIT_CARD]` | 12 digits, grouped 4-4-4 |
| CC27 | `44569597198431013` | `[CREDIT_CARD]` | 17 digits |
| CC28 | `4456 9597 1984 3101 19` | `[CREDIT_CARD]` | 18 digits, grouped 4-4-4-4-2 |
| CC29 | `6212456959719843105` | `[CREDIT_CARD]` | 19 digits (the longest length) |
| CC30 | `6212-4569-5971-9843-105` | `[CREDIT_CARD]` | 19 digits, grouped 4-4-4-4-3 |
| CC31 | `Card number: 4111 1111 1111 1111.` | `Card number: [CREDIT_CARD].` | Sentence-final period stays |
| CC32 | `(4111 1111 1111 1111)` | `([CREDIT_CARD])` | Brackets stay |
| CC33 | `"4111111111111111"` | `"[CREDIT_CARD]"` | Quotes stay |
| CC34 | `{"cc":"4111111111111111"}` | `{"cc":"[CREDIT_CARD]"}` | JSON |
| CC35 | `4111111111111111,5555555555554444` | `[CREDIT_CARD],[CREDIT_CARD]` | Comma-separated list |
| CC36 | `4111111111111111;5555555555554444` | `[CREDIT_CARD];[CREDIT_CARD]` | Semicolon-separated list |
| CC37 | `4111111111111111/5555555555554444` | `[CREDIT_CARD]/[CREDIT_CARD]` | Slash-separated list |
| CC38 | `a 4111111111111111 b 4111111111111111 c 4111111111111111` | `a [CREDIT_CARD] b [CREDIT_CARD] c [CREDIT_CARD]` | Every occurrence replaced |
| CC39 | `4111111111111111⏎5555555555554444` | `[CREDIT_CARD]⏎[CREDIT_CARD]` | Two cards on two lines |
| CC40 | `Card 4111111111111111\r⏎Next` | `Card [CREDIT_CARD]\r⏎Next` | CRLF preserved |
| CC41 | `💳4111111111111111💳` | `💳[CREDIT_CARD]💳` | Emoji directly adjacent |
| CC42 | `Número de tarjeta: 4111 1111 1111 1111 ✓` | `Número de tarjeta: [CREDIT_CARD] ✓` | Accents and symbols untouched |
| CC43 | `cc=4111111111111111&x=1` | `cc=[CREDIT_CARD]&x=1` | Query string |
| CC44 | `#4111111111111111` | `#[CREDIT_CARD]` | `#` before a card is not an identifier marker (D8) |
| CC45 | `Visa-4111111111111111` | `Visa-[CREDIT_CARD]` | Hyphen after a word is not part of the card |
| CC46 | `Card⇥4111111111111111⇥end` | `Card⇥[CREDIT_CARD]⇥end` | Tabs around the card |
| CC47 | `Pay 4111 1111 1111 1111 now` | `Pay [CREDIT_CARD] now` | Redacted inside a sentence |
| CC48 | `<b>4111111111111111</b>` | `<b>[CREDIT_CARD]</b>` | Markup preserved |
| CC49 | `ref:4111111111111111` | `ref:[CREDIT_CARD]` | Colon right before the digits |
| CC50 | `4111111111111111.` | `[CREDIT_CARD].` | Sentence-final period right after the digits |
| CC51 | `John Doe paid +1500000 with card 4111 1111 1111 1111 003 and can be contacted at john.doe@example.com or +91-415-555-0134. DOB: 1990-05-12.` | `John Doe paid +1500000 with card [CREDIT_CARD] and can be contacted at john.doe@example.com or +91-415-555-0134. DOB: 1990-05-12.` | Task-giver example, CREDIT_CARD only: the card is a valid 19-digit number |
| CC52 | `4111 1111 1111 1111 003` | `[CREDIT_CARD]` | 19 digits, 4-4-4-4-3, Luhn-valid |
| CC53 | `Ph: 4111111111111111` | `Ph: [CREDIT_CARD]` | A phone word next to a valid card does not stop it (card outranks PHONE) |

### CS-series: extras, adjacency, overlaps (12 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| CS01 | `4111 1111 1111 1111 12 25` | `[CREDIT_CARD] 12 25` | Card followed by expiry groups |
| CS02 | `12 25 4111 1111 1111 1111` | `12 25 [CREDIT_CARD]` | Card preceded by expiry groups |
| CS03 | `4111 1111 1111 1111 5555 5555 5555 4444` | `[CREDIT_CARD] [CREDIT_CARD]` | Two cards back to back: both found |
| CS04 | `4111-1111-1111-1111-5555-5555-5555-4444` | `[CREDIT_CARD]-[CREDIT_CARD]` | Two cards back to back, hyphens |
| CS05 | `A12 4111 1111 1111 1111` | `A12 [CREDIT_CARD]` | Letters glued to an extra group do not block the card |
| CS06 | `4111 1111 1111 1111 abc` | `[CREDIT_CARD] abc` | Word after the card |
| CS07 | `exp 12/25 cvv 123 card 4111 1111 1111 1111` | `exp 12/25 cvv 123 card [CREDIT_CARD]` | Typical form dump |
| CS08 | `Cards: 4111111111111111, 378282246310005 and 5555-5555-5555-4444.` | `Cards: [CREDIT_CARD], [CREDIT_CARD] and [CREDIT_CARD].` | Three formats in one sentence |
| CS09 | `4111111111111111 5555555555554444 378282246310005` | `[CREDIT_CARD] [CREDIT_CARD] [CREDIT_CARD]` | Three bare cards separated by single spaces: all found (a bare run may match anywhere in a chain) |
| CS10 | `4111111111111111-5555555555554444-378282246310005` | `[CREDIT_CARD]-[CREDIT_CARD]-[CREDIT_CARD]` | Three bare cards separated by single hyphens |
| CS11 | `12 4111111111111111 99` | `12 [CREDIT_CARD] 99` | Bare card between two short extra groups |
| CS12 | `1000 4111 1111 1111 1111` | `[CREDIT_CARD]` | Two overlapping windows both pass Luhn: they are merged, so no digit of the real card is left behind |

### CF-series: strings that must stay unchanged (44 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| CF01 | `4111111111111110` | `4111111111111110` | Fails the Luhn check |
| CF02 | `4111 1111 1111 1110` | `4111 1111 1111 1110` | Fails the Luhn check, grouped |
| CF03 | `378282246310000` | `378282246310000` | Amex-shaped but fails Luhn |
| CF04 | `44569597196` | `44569597196` | 11 digits, Luhn-valid: too short |
| CF05 | `44569597198431011942` | `44569597198431011942` | 20 digits, Luhn-valid: too long |
| CF06 | `0123456789012347` | `0123456789012347` | Luhn-valid but starts with 0 (reserved first digit) |
| CF07 | `8888888888888888` | `8888888888888888` | Luhn-valid but one repeated digit |
| CF08 | `0000 0000 0000 0000` | `0000 0000 0000 0000` | All zeros |
| CF09 | `+914569597190` | `+914569597190` | A `+` right before the digits: an international phone number |
| CF10 | `ID4111111111111111` | `ID4111111111111111` | Letters glued before the digits |
| CF11 | `4111111111111111abc` | `4111111111111111abc` | Letters glued after the digits |
| CF12 | `a4111111111111111b` | `a4111111111111111b` | Letters on both sides |
| CF13 | `4111111111111111_` | `4111111111111111_` | Underscore after |
| CF14 | `_4111111111111111` | `_4111111111111111` | Underscore before |
| CF15 | `4111111111111111.50` | `4111111111111111.50` | Decimal point followed by digits: an amount |
| CF16 | `0.4111111111111111` | `0.4111111111111111` | Digits after a decimal point |
| CF17 | `4111.1111.1111.1111` | `4111.1111.1111.1111` | Dots are not separators (L3) |
| CF18 | `4111⏎1111⏎1111⏎1111` | `4111⏎1111⏎1111⏎1111` | Newline is never a separator |
| CF19 | `4111⇥1111⇥1111⇥1111` | `4111⇥1111⇥1111⇥1111` | Tab is never a separator |
| CF20 | `4111,1111,1111,1111` | `4111,1111,1111,1111` | Comma is never a separator |
| CF21 | `4111  1111  1111  1111` | `4111  1111  1111  1111` | Two spaces: not one separator (L3) |
| CF22 | `4111/1111/1111/1111` | `4111/1111/1111/1111` | Slash is not a separator |
| CF23 | `41 11 11 11 11 11 11 11` | `41 11 11 11 11 11 11 11` | Groups of 2 digits: not a card layout |
| CF24 | `2024-05-12 10:30:00` | `2024-05-12 10:30:00` | Date and time |
| CF25 | `123e4567-e89b-12d3-a456-426614174000` | `123e4567-e89b-12d3-a456-426614174000` | UUID |
| CF26 | `123-45-6789` | `123-45-6789` | SSN shape |
| CF27 | `192.168.100.200` | `192.168.100.200` | IPv4 |
| CF28 | `Version 1.2.3.4` | `Version 1.2.3.4` | Version string |
| CF29 | `+1 415 555 0134` | `+1 415 555 0134` | Phone with country code |
| CF30 | `(415) 555-0134` | `(415) 555-0134` | Phone, parentheses |
| CF31 | `Call 4155550134` | `Call 4155550134` | Phone, 10 digits |
| CF32 | `+91 98765 43210` | `+91 98765 43210` | Phone, India |
| CF33 | `0044 20 7946 0958` | `0044 20 7946 0958` | Phone, 00 prefix |
| CF34 | `Phone: 00442079460958` | `Phone: 00442079460958` | Phone, bare 00 prefix (starts with 0) |
| CF35 | `978-3-16-148410-0` | `978-3-16-148410-0` | ISBN-13 with hyphens: groups do not form a card layout |
| CF36 | *(empty)* | *(empty)* | Empty input |
| CF37 | `no digits here` | `no digits here` | No digits |
| CF38 | `٤١١١١١١١١١١١١١١١` | `٤١١١١١١١١١١١١١١١` | Arabic-Indic digits: ASCII only (L7) |
| CF39 | `４１１１１１１１１１１１１１１１` | `４１１１１１１１１１１１１１１１` | Fullwidth digits: ASCII only (L7) |
| CF40 | `4111111111111111abcdef` | `4111111111111111abcdef` | Hex-like token |
| CF41 | `Order 12345678901` | `Order 12345678901` | 11 digits |
| CF42 | `4111111111 1111111111` | `4111111111 1111111111` | 10-digit groups: not a card layout and each is under 12 digits |
| CF43 | `Phone: +914569597190` | `Phone: +914569597190` | Signed international number with a phone word |
| CF44 | `4111 1111 1111 1112 003` | `4111 1111 1111 1112 003` | Luhn-invalid everywhere in the chain |

### CL-series: documented limitations (expected = current behaviour, 10 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| CL01 | `ms 1700000000004` | `ms [CREDIT_CARD]` | L5: a 13-digit epoch-millisecond value that happens to pass Luhn is redacted |
| CL02 | `ts 20240512103001` | `ts [CREDIT_CARD]` | L5: a 14-digit timestamp (YYYYMMDDhhmmss) that happens to pass Luhn is redacted |
| CL03 | `ISBN 9783161484102` | `ISBN [CREDIT_CARD]` | L5: a bare 13-digit ISBN/EAN that happens to pass Luhn is redacted |
| CL04 | `/pay/4111111111111111/x` | `/pay/[CREDIT_CARD]/x` | L6: a valid number inside a URL path is redacted |
| CL05 | `4111111111111111@example.com` | `[CREDIT_CARD]@example.com` | L8: card-shaped email local part: CREDIT_CARD outranks EMAIL, so only the digits go |
| CL06 | `411111 1111111111` | `411111 1111111111` | L4: layouts outside the group rule (6-10) are missed |
| CL07 | `1007 4111 1111 1111 1111 1013` | `1007 4111 1111 1111 1111 1013` | L2: a card with extra digit groups on both sides is missed |
| CL08 | `4111 1111 1111 1111 123` | `[CREDIT_CARD] 123` | L9: extra digit groups after a card are absorbed only when the checksum happens to allow it |
| CL09 | `Call 945695971982` | `Call [CREDIT_CARD]` | L8: a phone-like 12-digit number that passes Luhn becomes CREDIT_CARD (outranks PHONE) |
| CL10 | `4111111111111111 5555555555554444` | `[CREDIT_CARD] [CREDIT_CARD]` | Two bare cards joined by one space: both found |

### C-series: claim checks (behaviours stated in this document)

| ID | Claim | Input | Output |
|---|---|---|---|
| C01 | Whole 19-digit chain wins when it is valid (the CVV is absorbed) | `4111 1111 1111 1111 003` | `[CREDIT_CARD]` |
| C02 | Valid 16-digit card followed by a 3-digit group that breaks the whole chain | `4111 1111 1111 1111 004` | `[CREDIT_CARD] 004` |
| C03 | The same digits as CF09 are detected once the `+` is removed | `914569597190` | `[CREDIT_CARD]` |
| C04 | A sentence-final period right after the digits is not a guard failure | `4111111111111111.` | `[CREDIT_CARD].` |
| C05 | Decimal tail blocks it | `4111111111111111.5` | `4111111111111111.5` |
| C06 | Card then comma then digits is still a card (comma is not special) | `4111111111111111,99` | `[CREDIT_CARD],99` |
| C07 | Space then digits: absorbed or kept depending on checksum | `4111111111111111 99` | `[CREDIT_CARD] 99` |
| C08 | A hyphen in front: not a guard | `-4111111111111111` | `-[CREDIT_CARD]` |
| C09 | Right-to-left mark next to a card | `4111111111111111<RLM>` | `[CREDIT_CARD]<RLM>` |
| C10 | Zero-width space next to a card | `<ZWSP>4111111111111111<ZWSP>` | `<ZWSP>[CREDIT_CARD]<ZWSP>` |
| C11 | Combining mark glued after the digits blocks the match | `4111111111111111<COMB>` | `4111111111111111<COMB>` |

---

## 10. Verification log

The rules were verified with a throwaway JavaScript reference sketch written from this specification (it is **not** the deliverable implementation). The final TypeScript implementation must pass the same tables in §9 as its unit tests.

### How the checks went (honest history)

1. **Matrix, first run.** The first run did not even start: a bug in my *test helper* (the grouping function added a trailing separator) crashed one case. After fixing the helper, the original 115 cases passed on the first complete run. A clean first run can also mean weak tests, so the checks below were added.
2. **Fuzzing found a real gap.** 30 of 80,000 random inputs were **not idempotent**. All 30 had the same cause: a valid card in the **middle** of a chain of bare numbers (`A B C` separated by single spaces) was missed in pass 1 and found in pass 2, after its neighbour had been replaced. Fix: D4, a single bare run of 12-19 digits may match anywhere in a chain (tests CS09-CS11 added). After the fix: 0 of 80,000.
3. **Recall test, generator bug.** The first recall run showed 15 failures; all 15 were my *generator* producing numbers made of one repeated digit (`4444 4444 ...`), which the spec rejects on purpose (D6). After excluding them: 0 failures.
4. **Mutation check found a weak spot.** One of 16 mutants survived (M12: do not merge overlapping windows). No test had a stray group in front of a card that made a different window pass Luhn. Test CS12 was added; the mutant is now detected.

### Checks

1. **Review checklist** against the brief and the task giver's clarification:

| Requirement | Covered by |
|---|---|
| Credit card numbers, common formats | §5; series CC (Visa, Mastercard 5 and 2 series, Amex, Diners, Discover, JCB, UnionPay, Mir; 12-19 digits) |
| Clarification: 12-19 digits | CC25-CC30, CF04, CF05; mutants M2, M3 |
| Clarification: with or without spaces or hyphens | CC01-CC09, CF17-CF22; mutants M13-M16 |
| Clarification: must pass Luhn | CF01-CF03, CF44; mutant M1 |
| Task-giver example text (19-digit card `4111 1111 1111 1111 003`) | CC51, CC52, C01 |
| Different formats of the same entity | CC series (bare, spaces, hyphens, mixed, Unicode separators, 4-6-5, 4-6-4, all lengths) |
| False positives (ordinary numbers resembling cards) | CF series; D3, D6, D7; known residual risk L5 |
| Multiple occurrences | CC35-CC39, CS03, CS04, CS08-CS10 |
| Overlaps and duplicate replacement | D5, §7; CS12; fuzz invariant: spans sorted and non-overlapping |
| Punctuation, line breaks, Unicode | CC31-CC34, CC40-CC50, CF38, CF39, C09-C11, §6 |
| Missing / empty input | detector-level: empty string yields no spans (CF36); `null` / non-string belong to the service layer |
| "Must not silently corrupt unrelated text" | fuzz invariant: rebuilding from untouched slices equals the output; recall test checks surroundings exactly |
| Document limitations | §8 (12 entries) |

2. **Fuzzing with an independent oracle:** 80,000 random strings (digits, separators in several forms, letters in several scripts, `+ . , / @ _ ( ) # $ :`, newlines, tabs, emoji, zero-width characters, combining marks, Arabic-Indic and fullwidth digits, with Luhn-valid numbers mixed in). **0 exceptions; 0 invariant failures** (every span in range, sorted, non-overlapping, made only of digits and separators, starting and ending with a digit, and rebuilding the output from untouched slices equals the real output). **Oracle:** every matched span was also checked by a separately written function that looks for *any* 12-19 digit Luhn-valid substring (not starting with `0`, not one repeated digit) in the span's digits: **0 rejections** (18,674 inputs contained a match). **Idempotence probe:** 0 of 80,000 outputs changed when processed again (after fix, see history).
3. **Recall test:** 30,000 generated texts with 1-4 valid cards each (**75,105 cards**: random prefixes, lengths 12-19, layouts bare / 4-4-4-4 / 4-6-5 / 4-6-4, separators space, hyphen, NBSP, en dash), embedded between words and gaps (`, ` `; ` newline, CRLF, tab, ` <`, `> (`, quotes, `|`, emoji). **0 failures:** every card replaced, every other character byte-identical.
4. **Mutation check:** sixteen deliberate weakenings of the rules; **every one made tests fail**, so the tests really exercise the rules:

| Mutation | Tests that fail |
|---|---|
| M1: no Luhn check | 8 (CS01, CF01, CF02, CF03, CF25, CF44, …) |
| M2: minimum 13 digits instead of 12 | 4 (CC25, CC26, CS12, CL09) |
| M3: maximum 16 digits instead of 19 | 6 (CC27, CC28, CC29, CC30, CC51, CC52) |
| M4: accept a leading 0 | 1 (CF06) |
| M5: accept one repeated digit | 1 (CF07) |
| M6: drop the letter/digit/underscore glue guard | 6 (CF10, CF11, CF12, CF13, CF14, CF40) |
| M7: drop the `+` guard | 2 (CF09, CF43) |
| M8: drop the decimal-point guard | 2 (CF15, CF16) |
| M9: drop the group-size rule | 1 (CL06) |
| M10: consider windows anywhere (not only at the chain ends) | 3 (CS03, CS04, CL07) |
| M11: drop the bare-run-anywhere rule | 3 (CS09, CS10, CS11) |
| M12: do not merge overlapping windows | 1 (CS12) |
| M13: hyphen is not a separator | 6 (CC03, CC04, CC19, CC30, CS04, CS08) |
| M14: only ASCII space and hyphen are separators | 5 (CC05, CC06, CC07, CC08, CC09) |
| M15: dot is a separator | 3 (CF15, CF16, CF17) |
| M16: comma, tab and newline are separators | 3 (CF18, CF19, CF20) |

5. **Performance / pathological input** (200-375 KB each: 300,000 digits in one run, `1 1 1 …`, `4111 4111 …`, `4111-4111-…`, 17,000 cards separated by a space, by a newline, `1-1-1-…` then a card, `+4111…` repeated, dotted groups, letters glued to digits, mixed NBSP/hyphen): worst case **≈123 ms** (17,000 cards on separate lines); every other case under 65 ms; no catastrophic backtracking. Windows are bounded by 19 digits and each chain gets at most two anchored scans plus one pass over its bare runs, so the scan stays linear.
6. **Cross-check against the other detectors' test tables:** the detector was run over **1,089** strings taken from the PHONE and EMAIL test tables (inputs and outputs). It matched **9** strings, which are 5 distinct rows: PHONE E01 (the task giver's example, which contains the 19-digit card), F09 and F10 (`Card 4111 1111 1111 1111` and its hyphen form), C14 (`Phone: 378282246310005`) and C15 (`Phone: 4111111111111111`). All five contain a genuine Luhn-valid card number. **No phone number, email address, date, IP, SSN, UUID, timestamp or ISBN row in those tables is touched.**
7. **Claim check (series C):** every concrete behaviour claimed in this document that was not already a matrix row was executed; results are in the C table.

### Final numbers

| Check | Result |
|---|---|
| Matrix | 119 / 119 |
| Claim checks | 11 executed, behaviour as documented |
| Mutation check | 16 / 16 mutants detected |
| Fuzz with independent oracle | 80,000 inputs: 0 exceptions, 0 invariant failures, 0 oracle rejections, 0 non-idempotent |
| Recall test | 30,000 generated texts (75,105 cards): 0 failures |
| Cross-check with PHONE and EMAIL tables | 1,089 strings, 5 distinct rows matched, all real card numbers |
| Worst-case time | ≈123 ms on 200-375 KB pathological input |

### Not verified

- The behaviour against the *real* card networks' issuing rules: there is no issuer check by design (D6).
- Integration with the other five detectors: only the cross-check above was possible, because their implementations do not exist yet. The integration tests must cover §7.

---

## 11. Notes for the TypeScript implementation

- One detector object: `{ type: "CREDIT_CARD", find(text): Span[] }`.
- Keep the **separator set**, the **group-size limits (4-8, 1-8)**, the **digit-count limits (12-19)** and the **guard character classes** as **data constants** so they can be changed (or an issuer-range table added for a strict mode) without touching the replacer.
- Implement `luhn(digits: string): boolean` as a small, separately tested helper (shared logic that other future rules may reuse).
- Offsets are UTF-16 code-unit indices into the original string, the same indices the replacer uses. Guards read the neighbouring **code point** (not just the code unit), so emoji and other astral characters next to a number are handled safely (CC41).
- Unicode-aware character classes need the regular-expression `u` flag (`\p{L}`, `\p{N}`, `\p{M}`).
- Every scan is bounded (windows stop at 19 digits), which keeps the detector linear on pathological input.
