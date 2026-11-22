# EMAIL detection rules

**Entity:** `EMAIL` | **Placeholder:** `[EMAIL]` | **Spec version:** 1.0
**Status:** rules complete and **verified twice** (two independent passes, see §10). Every example in this document was executed, not just written.

---

## 0. Summary (read this first)

- The detector **anchors on every `@`**, then checks a **local part** to its left and a **domain** to its right. A match must have both, and each must pass the syntax rules in §5.
- It is **pragmatic, not a full RFC 5322 parser**. It accepts the shapes real people write (`john.doe+tag@sub.example.co.uk`, Unicode names, quoted local parts, IPv4 literals) and rejects shapes that only *look* like addresses (`pkg@1.2.3`, `icon@2x.png`, `foo@bar`, `@mention`, `price@5.99`).
- It protects the surrounding text: punctuation, brackets, quotes, `mailto:`, line breaks and a sentence-final period stay exactly as written (`Mail john@example.com.` → `Mail [EMAIL].`).
- **One decision (D2), which uses the recommended option:** the top-level domain is checked by *syntax* (2+ letters or punycode), **not** against the IANA list of real TLDs. Reasons and the alternative are in D2.
- Everything the detector deliberately does **not** do is listed in §8 with an example and a reason.

> **Honest scope statement.** "Nothing missed" is achievable for the *declared scope* (§1) and the *documented limitations* (§8): every gap is named. No rule-based detector can catch every conceivable obfuscation of an address; this one catches every format listed here and is explicit about the rest.

---

## 1. Scope

### 1.1 In scope

| Kind of address | Handled? | Example |
|---|---|---|
| Ordinary `local@domain` | Yes | `john.doe@example.com` |
| Dots, `_`, `-`, `+`, `%`, `'` inside the local part | Yes | `o'brien+news@example.com` |
| Sub-domains, multi-label domains, hyphens inside labels | Yes | `a@mail.corp-x.example.co.uk` |
| Numeric labels | Yes | `john@123.com` |
| Upper / mixed case | Yes | `JOHN@Example.COM` |
| International names (IDN / EAI): accents, CJK, Cyrillic, Greek … | Yes | `Pelé@example.com`, `用户@例子.广告`, `иван@пример.рф` |
| Punycode labels and TLDs | Yes | `john@xn--bcher-kva.example`, `john@example.xn--p1ai` |
| Quoted local part (one line, ≤ 64 characters) | Yes | `"john doe"@example.com` |
| IPv4 literal domain | Yes | `john@[192.168.1.1]` |
| Inside punctuation / markup / URLs | Yes | `<a@b.com>`, `(a@b.com)`, `mailto:a@b.com?subject=Hi`, `{"email":"a@b.com"}` |
| Display-name form | Yes, only the address | `John Doe <john@example.com>` → `John Doe <[EMAIL]>` |

### 1.2 Out of scope (see §8 for reasons)

Obfuscated addresses (`john (at) example (dot) com`), percent-encoded or HTML-entity `@`, fullwidth `＠`, single-label domains (`user@localhost`), IPv6 literals, exotic RFC local-part characters (`! # $ & * / = ? ^ { | } ~`), names in display-name form, and every other entity type.

---

## 2. Terminology

| Term | Meaning |
|---|---|
| **Local part** | Everything before the `@`. |
| **Domain** | Everything after the `@`: labels joined by dots, or an IPv4 literal in brackets. |
| **Label** | One dot-separated part of a domain. |
| **TLD** | The last label of the domain. |
| **Letter** | A Unicode letter or combining mark (`\p{L}`, `\p{M}`). |
| **Span** | `{ type: "EMAIL", start, end }`, offsets into the original string. |
| **Right guard** | A check on the character right after the domain (§5.5). |

---

## 3. Design decisions and why

| # | Decision | Reason |
|---|---|---|
| D1 | Pragmatic syntax, **not** the full RFC 5322 grammar. | The full grammar allows comments, nested quotes and characters (`/`, `=`, `?`, `!`) that, in running text, are mostly **punctuation next to an address** (`email=john@x.com`, `see/john@x.com`). Supporting them would corrupt surrounding text. |
| D2 | **TLD is checked by syntax**: 2+ letters (any script) or a `xn--` punycode label. It is **not** checked against the IANA list. **Please confirm.** | The IANA root zone has roughly 1,400+ entries (the count changes), new ones are added, and private suffixes (`.corp`, `.local`, `.internal`) are real in company mail. A stale list causes **false negatives** (leaks). Cost of the choice: made-up TLDs are accepted (`john@example.abc`, L8). Option: ship the IANA list as data and flip a switch. |
| D3 | International (Unicode) letters, digits and marks are allowed in the local part and in domain labels. | Internationalised addresses (RFC 6531) and IDN domains are real. |
| D4 | Local part characters: letters, digits, marks, and `_ . % + ' -`. First character must be a letter, digit or `_`. | Covers virtually all real addresses; the excluded RFC characters are too risky next to ordinary punctuation (D1). |
| D5 | Quoted local parts are supported: `"..."` on one line, 1-64 characters. | Valid and occasionally seen; cheap to support. |
| D6 | IPv4 literal domains `[d.d.d.d]` (octets 0-255) are supported; IPv6 literals are not. | IPv4 literals are the realistic case; IPv6 literals are vanishingly rare (L5). |
| D7 | The domain needs **at least two labels**. | Rejects `user@localhost`, `foo@bar`, `name@domain`, which are overwhelmingly not personal addresses. Cost: internal single-label hosts are missed (L4). |
| D8 | A domain whose TLD is a **common file extension** is rejected (list in §5.4), e.g. `icon@2x.png`, `report@final.docx`. | Without this, asset names like `icon@2x.png` would be redacted as emails. The list contains only extensions that are not TLDs; real TLDs that look like extensions (`.zip`, `.mov`, `.py`, `.md`, `.sh`) are deliberately **kept valid** (L8). |
| D9 | Over-redaction is accepted where a non-personal string has the exact shape of an address. | For a privacy tool the safe error is redacting too much: `git@github.com:org/repo.git`, URL credentials `user:pass@host.com`, internal `user@intranet.corp` (L7). |
| D10 | Two addresses joined only by a local-part character are split: a new address may **not start inside the previous match**. | Without this, `a@b.com+c@d.org` redacted only the first address and **leaked the second** (found by fuzzing, §10). |
| D11 | Sentence-final period, quotes, brackets, colons, commas etc. are never part of the address. | Required by "must not silently corrupt unrelated text". |
| D12 | Single pass; each address is counted once. Re-running is *almost* but not strictly idempotent (L13). | Simple and predictable. |
| D13 | Overlaps with other entities: EMAIL outranks IP_ADDRESS, DATE_OF_BIRTH and PHONE; only CREDIT_CARD and SSN outrank EMAIL. | Agreed global order (§7). |

---

## 4. Algorithm

1. **Input:** a string (type/emptiness checks are the service layer's job; an empty string yields no spans).
2. For each `@` from left to right:
   1. **Parse the local part** to the left (§5.1 / §5.2). It may not start before the end of the previous match (D10), except that a *quoted* local part may enclose an earlier address.
   2. **Parse the domain** to the right (§5.3). Apply the TLD and file-extension rules.
   3. **Right guard** (§5.5).
   4. Emit `{ type: "EMAIL", start, end }`.
3. **Resolve overlaps:** sort by `start`, then longest first; keep a span only if it starts at or after the end of the last kept span.
4. Detection never edits text. The replacer (separate module) copies untouched text between spans and inserts `[EMAIL]`.

### Constants

| Constant | Value |
|---|---|
| Local part length | 1-64 characters (code points) |
| Backward scan limit | 70 characters |
| Quoted local part | 1-64 characters between quotes, same line |
| Label length | 1-63 characters |
| Domain length | at most 253 characters |
| TLD | at least 2 letters (or `xn--` + 2-59 of `a-z 0-9 -`), at most 63 |

---

## 5. Rule specifications

### 5.1 Local part (unquoted)

1. Scan **backwards** from the `@` over characters in `[letters, digits, marks, _ . % + ' -]` (at most 70), never crossing the end of the previous match.
2. **Trim leading characters** until the first is a letter, digit or `_` (so `.john@…`, `+john@…`, `-john@…` leave the dot/plus/dash outside).
3. If the result contains `..`, keep only the part **after the last `..`** (and trim again).
4. **Reject** if empty, if it ends with `.` or `'`, or if it is longer than 64 characters.

Examples: `john.doe+tag` ✔, `o'brien` ✔, `john.` ✘, `a…(65 chars)` ✘, `john..doe` → local part `doe` (L12).

### 5.2 Local part (quoted)

If the character directly before the `@` is `"`, search back (same line, at most 66 characters) for the opening `"`. The span starts at the opening quote. At least one character must be inside (`""@example.com` is rejected). The content is not otherwise validated: spaces and `@` are fine (`"john doe"@example.com`, `"a@b"@example.com`).

### 5.3 Domain

- **IPv4 literal:** `[` + four decimal numbers 0-255 joined by dots + `]`.
- **Otherwise** labels made of letters, digits, marks and `-`, joined by single dots (a dot belongs to the domain only if a label character follows it, so a sentence-final period is excluded).
  - Each label: 1-63 characters, **not** starting or ending with `-`.
  - **At least two labels** (D7). Total length ≤ 253.
  - **TLD** (last label): 2-63 letters (any script) **or** `xn--` punycode. A TLD containing digits or hyphens (`com123`, `z1`, `3`) is rejected.
  - Underscores are not label characters, so `exam_ple.com` is rejected.

### 5.4 File-extension deny list (D8)

If the TLD (case-insensitive) is one of the following the candidate is **not** an address:

`pdf doc docx xls xlsx ppt pptx txt rtf csv tsv json xml yaml yml html htm css js jsx tsx ini log bak tmp png jpg jpeg gif svg webp bmp heic avif tiff ico exe dll jar class cpp php lock toml`

**Deny-list check:** the list was checked against a copy of the IANA TLD list dated 3 January 2025 (the SpamAssassin `20_aux_tlds.cf` mirror; the IANA file itself could not be fetched). One entry, **`java`, is a delegated TLD** and was **removed** (it was the only one; no test depended on it). None of the remaining entries is a delegated TLD in that copy. Real TLDs that resemble extensions (`zip`, `mov`, `py`, `md`, `sh`, `so`, `app`, `dev`, `java`) are intentionally not in the list. Re-check against the live IANA file before shipping.

### 5.5 Right guard

If the character immediately after the domain is `_`, the candidate is rejected (`john@example.com_backup`). Letters and digits cannot occur there because the domain scan already consumed them (`john@example.com123` fails the TLD rule instead).

### 5.6 What stays outside the span

Everything that is not part of the address: leading `.`/`+`/`-`/`'`/`%` junk (5.1 step 2), quotes, brackets, `<` `>`, commas, semicolons, colons, `/`, `?`, `&`, `=`, a sentence-final period, `'s`, emoji, NBSP and zero-width characters.

---

## 6. Punctuation and layout behaviour

| Situation | Result |
|---|---|
| Sentence end: `Mail a@b.com.` | `Mail [EMAIL].` |
| Brackets / quotes: `(a@b.com)`, `<a@b.com>`, `"a@b.com"`, `'a@b.com'` | delimiters stay |
| `mailto:a@b.com?subject=Hi` | `mailto:[EMAIL]?subject=Hi` |
| Possessive: `a@b.com's` | `[EMAIL]'s` |
| Display name: `John Doe <a@b.com>` | `John Doe <[EMAIL]>` (the name is out of scope) |
| Lists: `a@x.com,b@y.org` / `;` / space / newline | each address replaced separately |
| JSON / HTML / Markdown containing the address | markup stays, address replaced (each occurrence) |
| Line breaks (`\n`, `\r\n`), tabs, NBSP, emoji, zero-width characters | preserved byte-for-byte |
| Same address repeated | every occurrence replaced; count = number of occurrences |

---

## 7. Interaction with other entities

Agreed priority: **CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE**.

- A phone-shaped local part (`415-555-0134@example.com`) is an **EMAIL**; PHONE yields. With only PHONE enabled the output is `[PHONE]@example.com` (see the PHONE rules, M10).
- An IPv4 literal domain (`john@[192.168.1.1]`) is part of the EMAIL span, so IP_ADDRESS cannot replace the bracketed IP separately.
- A date, SSN or card number can never match, because an address needs an `@`.
- The EMAIL span ends at the address; neighbouring text is left for the other detectors.

---

## 8. Known limitations (explicit, with reasons)

| # | Limitation | Example | Why accepted / mitigation |
|---|---|---|---|
| L1 | Obfuscated addresses are not detected. | `john (at) example (dot) com`, `john at example dot com`, `john[at]example.com` | Needs a dictionary of obfuscations; out of scope. Optional future rule. |
| L2 | Percent-encoded or HTML-entity `@` is not detected. | `john%40example.com`, `john&#64;example.com` | Would require decoding, which changes offsets. |
| L3 | Lookalike / fullwidth `＠` is not detected. | `john＠example.com` | Not an `@`; normalising would shift offsets. |
| L4 | Single-label domains are not detected. | `user@localhost`, `name@domain` | D7: far more often not personal than personal. |
| L5 | IPv6 literals are not detected. | `user@[IPv6:2001:db8::1]` | Vanishingly rare. |
| L6 | Exotic RFC local-part characters, comments and multi-line quoted parts are not supported. | `a/b@example.com` → `a/[EMAIL]`, `a=b@example.com` → `a=[EMAIL]`, `a!b@example.com` → `a![EMAIL]` | D1: those characters are normally punctuation next to the address. |
| L7 | Over-redaction of address-shaped non-personal strings. | `git@github.com:org/repo.git` → `[EMAIL]:org/repo.git`; `https://user:pass@example.com/` → `https://user:[EMAIL]/`; `user@intranet.corp` | D9: the safe error for a privacy tool. |
| L8 | The TLD is checked by syntax only, and the file-extension list is a heuristic. | `john@example.abc` accepted; `file@v2.zip` and `main@util.py` redacted because `.zip` and `.py` are real TLDs; a real address ending in a deny-listed extension would be missed | D2, D8. Optional: IANA TLD list as data. |
| L9 | Domains that are too long are not detected: local part > 64, label > 63, domain > 253. | `a…(65)@example.com` | RFC limits; such strings are not valid addresses. |
| L10 | Addresses glued together are only partly recognised when the join is ambiguous. | `a@x.comb@y.org` → `[EMAIL]@y.org`; `a@b.com.c@d.org` → `a@[EMAIL]`; `a@b.com-c@d.org` → `a@[EMAIL]`; `john@example.com@other.org` → `[EMAIL]@other.org` | A `.` or `-` can legally continue a domain, so the split point is ambiguous. Joins by `+`, `%`, `'` are handled (D10). |
| L11 | A typographic apostrophe in the local part is not accepted. | `Zoë.O’Neil@example.org` → `Zoë.O’[EMAIL]` (the part before `’` leaks) | Not valid in ASCII addresses; only the ASCII `'` is supported. |
| L12 | Leading junk and dot errors are trimmed, not redacted. | `.john@example.com` → `.[EMAIL]`; `+john@example.com` → `+[EMAIL]`; `john..doe@example.com` → `john..[EMAIL]`; `Thanks.john@example.com` is taken as one address (a missing space after a period joins the word to the local part) | Required to keep punctuation out of the span (D4, D11). |
| L13 | Not strictly idempotent. Observed once in 80,000 random adversarial inputs, involving a quoted local part that contained many addresses and became short enough to match only after the first replacement. | (see §10) | Run once. |
| L14 | Display names are not redacted. | `John Doe <[EMAIL]>` | Names are out of core scope. |

---

## 9. Test matrix (every row was executed)

Legend: `⏎` = newline, `⇥` = tab, `<NBSP>` = no-break space. For unchanged rows the reason is stated; for redacted rows the note is shown where useful.

### EM-series: Addresses that must be redacted

| ID | Input | Output | Rule / why |
|---|---|---|---|
| EM01 | `john.doe@example.com` | `[EMAIL]` | Redacted |
| EM02 | `Contact john.doe@example.com now` | `Contact [EMAIL] now` | Redacted |
| EM03 | `JOHN.DOE@EXAMPLE.COM` | `[EMAIL]` | Redacted |
| EM04 | `john+tag@example.com` | `[EMAIL]` | Redacted |
| EM05 | `o'brien@example.com` | `[EMAIL]` | Redacted |
| EM06 | `first_last@example.co.uk` | `[EMAIL]` | Redacted |
| EM07 | `user-name@sub.domain.example.org` | `[EMAIL]` | Redacted |
| EM08 | `123456@example.com` | `[EMAIL]` | Redacted |
| EM09 | `a@b.co` | `[EMAIL]` | Redacted |
| EM10 | `x@example.museum` | `[EMAIL]` | Redacted |
| EM11 | `john@example.technology` | `[EMAIL]` | Redacted |
| EM12 | `john@xn--bcher-kva.example` | `[EMAIL]` | Punycode label |
| EM13 | `john@example.xn--p1ai` | `[EMAIL]` | Punycode TLD |
| EM14 | `Pelé@example.com` | `[EMAIL]` | Unicode local part |
| EM15 | `user@münchen.de` | `[EMAIL]` | IDN domain |
| EM16 | `用户@例子.广告` | `[EMAIL]` | CJK |
| EM17 | `иван@пример.рф` | `[EMAIL]` | Cyrillic |
| EM18 | `"john doe"@example.com` | `[EMAIL]` | Quoted local part (D5) |
| EM19 | `john@[192.168.1.1]` | `[EMAIL]` | IPv4 literal (D6) |
| EM20 | `user%tag@example.com` | `[EMAIL]` | `%` allowed in the local part |
| EM21 | `Mail john.doe@example.com.` | `Mail [EMAIL].` | Sentence-final period stays |
| EM22 | `(john@example.com)` | `([EMAIL])` | Redacted |
| EM23 | `<john@example.com>` | `<[EMAIL]>` | Redacted |
| EM24 | `John Doe <john@example.com>` | `John Doe <[EMAIL]>` | Display name is out of scope |
| EM25 | `"john@example.com"` | `"[EMAIL]"` | Redacted |
| EM26 | `'john@example.com'` | `'[EMAIL]'` | Redacted |
| EM27 | `mailto:john@example.com` | `mailto:[EMAIL]` | `mailto:` stays |
| EM28 | `mailto:john@example.com?subject=Hi` | `mailto:[EMAIL]?subject=Hi` | Query string stays |
| EM29 | `a@x.com,b@y.org` | `[EMAIL],[EMAIL]` | Redacted |
| EM30 | `a@x.com;b@y.org` | `[EMAIL];[EMAIL]` | Redacted |
| EM31 | `a@x.com b@y.org` | `[EMAIL] [EMAIL]` | Redacted |
| EM32 | `Email: john@example.com⏎Phone: 1` | `Email: [EMAIL]⏎Phone: 1` | Redacted |
| EM33 | `john@example.com\r⏎next` | `[EMAIL]\r⏎next` | CRLF preserved |
| EM34 | `😀john@example.com😀` | `😀[EMAIL]😀` | Emoji directly adjacent |
| EM35 | `john@example.com's` | `[EMAIL]'s` | Possessive `'s` stays |
| EM36 | `415-555-0134@example.com` | `[EMAIL]` | Phone-shaped local part is an EMAIL (EMAIL outranks PHONE) |
| EM37 | `a.b.c@d.e.f.org` | `[EMAIL]` | Redacted |
| EM38 | `john@exa-mple.com` | `[EMAIL]` | Redacted |
| EM39 | `ab@cd.ef` | `[EMAIL]` | Redacted |
| EM40 | `john_doe@example.com` | `[EMAIL]` | Redacted |
| EM41 | `_john@example.com` | `[EMAIL]` | Redacted |
| EM42 | `john@123.com` | `[EMAIL]` | Numeric label allowed |
| EM43 | `support@example.com:` | `[EMAIL]:` | Colon stays |
| EM44 | `see user@example.com/path` | `see [EMAIL]/path` | Path stays |
| EM45 | `Tab⇥john@example.com⇥end` | `Tab⇥[EMAIL]⇥end` | Redacted |
| EM46 | `Hi,john@example.com` | `Hi,[EMAIL]` | Comma is not a local-part character |
| EM47 | `see/john@example.com` | `see/[EMAIL]` | Slash is not a local-part character |
| EM48 | `!john@example.com!` | `![EMAIL]!` | Exclamation marks stay |
| EM49 | `john@example.com<NBSP>ok` | `[EMAIL]<NBSP>ok` | NBSP preserved |
| EM50 | `x john@sub.example.com y` | `x [EMAIL] y` | Redacted |
| EM51 | `{"email":"a@b.com"}` | `{"email":"[EMAIL]"}` | Redacted |
| EM52 | `<a href="mailto:a@b.com">a@b.com</a>` | `<a href="mailto:[EMAIL]">[EMAIL]</a>` | Redacted |
| EM53 | `[a@b.com](mailto:a@b.com)` | `[[EMAIL]](mailto:[EMAIL])` | Markdown link: both addresses replaced |
| EM54 | `Reply-To:a@b.com` | `Reply-To:[EMAIL]` | Redacted |

### EF-series: Strings that must stay unchanged

| ID | Input | Output | Rule / why |
|---|---|---|---|
| EF01 | `@john` | `@john` | No local part |
| EF02 | `john@` | `john@` | No domain |
| EF03 | `meet @ 5pm` | `meet @ 5pm` | Spaces around `@` |
| EF04 | `foo@bar` | `foo@bar` | Single-label domain (D7) |
| EF05 | `user@localhost` | `user@localhost` | Single-label domain (D7) |
| EF06 | `pkg@1.2.3` | `pkg@1.2.3` | TLD `3` is not letters |
| EF07 | `icon@2x.png` | `icon@2x.png` | File-extension TLD (`@2x.png`, D8) |
| EF08 | `a@b.c` | `a@b.c` | TLD needs 2+ letters |
| EF09 | `x@y.z1` | `x@y.z1` | TLD contains a digit |
| EF10 | `john@-example.com` | `john@-example.com` | Label starts with a hyphen |
| EF11 | `john@example-.com` | `john@example-.com` | Label ends with a hyphen |
| EF12 | `john@example..com` | `john@example..com` | Empty label (`..`) |
| EF13 | `john@.com` | `john@.com` | Empty first label |
| EF14 | `@types/node@18.0.0` | `@types/node@18.0.0` | npm scope / version: TLD `0` is not letters |
| EF15 | `price@5.99` | `price@5.99` | TLD `99` is not letters |
| EF16 | `john @example.com` | `john @example.com` | Space before `@` |
| EF17 | `john@ example.com` | `john@ example.com` | Space after `@` |
| EF18 | `john(at)example.com` | `john(at)example.com` | Obfuscated `(at)` (L1) |
| EF19 | `john [at] example [dot] com` | `john [at] example [dot] com` | Obfuscated `[at] [dot]` (L1) |
| EF20 | `name@domain` | `name@domain` | Single-label domain (D7) |
| EF21 | `.@example.com` | `.@example.com` | Local part is only a dot |
| EF22 | `john.@example.com` | `john.@example.com` | Local part ends with a dot |
| EF23 | `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.com` | `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.com` | Local part is 65 characters (limit 64) |
| EF24 | `john@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com` | `john@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com` | Label is 64 characters (limit 63) |
| EF25 | `report@final.docx` | `report@final.docx` | File-extension TLD (D8) |
| EF26 | `user@host.pdf` | `user@host.pdf` | File-extension TLD (D8) |
| EF27 | `john@example.com_backup` | `john@example.com_backup` | Underscore right after the domain (right guard) |
| EF28 | `john@example.123` | `john@example.123` | TLD `123` is not letters |
| EF29 | `john＠example.com` | `john＠example.com` | Fullwidth `＠` is not `@` (L3) |
| EF30 | `user@[IPv6:2001:db8::1]` | `user@[IPv6:2001:db8::1]` | IPv6 literal not supported (L5) |
| EF31 | `john%40example.com` | `john%40example.com` | Percent-encoded `@` (L2) |
| EF32 | `john@[999.1.1.1]` | `john@[999.1.1.1]` | IPv4 literal octet 999 is above 255 |
| EF33 | *(empty)* | *(empty)* | Empty input |
| EF34 | `no at sign here` | `no at sign here` | No `@` |
| EF35 | `@@@` | `@@@` | No local part or domain |
| EF36 | `john@example.c` | `john@example.c` | TLD is one letter |
| EF37 | `x@@example.com` | `x@@example.com` | Double `@`: neither side forms an address |
| EF38 | `john@example.com-` | `john@example.com-` | Last label ends with a hyphen |
| EF39 | `john@example.com123` | `john@example.com123` | TLD `com123` contains digits |
| EF40 | `a@b.png` | `a@b.png` | File-extension TLD (D8) |
| EF41 | `user@sub.example.png` | `user@sub.example.png` | File-extension TLD (D8) |
| EF42 | `"" @example.com` | `"" @example.com` | Space between the quotes and `@` |
| EF43 | `""@example.com` | `""@example.com` | Empty quoted local part |

### ES-series: Structure, repetition, layout, glued addresses

| ID | Input | Output | Rule / why |
|---|---|---|---|
| ES01 | `a@x.com⏎b@y.org` | `[EMAIL]⏎[EMAIL]` | Redacted |
| ES02 | `no emails here` | `no emails here` |  |
| ES03 | `a@x.com a@x.com a@x.com` | `[EMAIL] [EMAIL] [EMAIL]` | Every occurrence replaced |
| ES04 | `John@Example.Com` | `[EMAIL]` | Case-insensitive |
| ES05 | `a@x.com⏎⏎⏎b@y.org⏎` | `[EMAIL]⏎⏎⏎[EMAIL]⏎` | Redacted |
| ES06 | `  a@x.com  ` | `  [EMAIL]  ` | Redacted |
| ES07 | `a@b.com+c@d.org` | `[EMAIL]+[EMAIL]` | D10: the second address may not start inside the first |
| ES08 | `a@b.com'c@d.org` | `[EMAIL]'[EMAIL]` | D10 |
| ES09 | `a@b.com%c@d.org` | `[EMAIL]%[EMAIL]` | D10 |

### EL-series: Documented limitations (expected = current behaviour)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| EL01 | `git@github.com:org/repo.git` | `[EMAIL]:org/repo.git` | L7: git SSH remote has the shape of an address |
| EL02 | `https://user:pass@example.com/` | `https://user:[EMAIL]/` | L7: URL credentials |
| EL03 | `john..doe@example.com` | `john..[EMAIL]` | L12: only the part after `..` is the local part |
| EL04 | `.john@example.com` | `.[EMAIL]` | L12: leading dot stays outside |
| EL05 | `+john@example.com` | `+[EMAIL]` | L12: leading plus stays outside |
| EL06 | `Thanks.john@example.com` | `[EMAIL]` | L12: a missing space after a period joins word and local part |
| EL07 | `a@x.comb@y.org` | `[EMAIL]@y.org` | L10: glued addresses |
| EL08 | `john at example dot com` | `john at example dot com` | L1: obfuscated |
| EL09 | `user@intranet.corp` | `[EMAIL]` | L7: internal host names with a dot are redacted |
| EL10 | `john@example.com@other.org` | `[EMAIL]@other.org` | L10: second `@` after a complete address |
| EL11 | `file@v2.zip` | `[EMAIL]` | L8: `.zip` is a real TLD |
| EL12 | `main@util.py` | `[EMAIL]` | L8: `.py` is a real TLD (Paraguay) |
| EL13 | `a@b.com.c@d.org` | `a@[EMAIL]` | L10: dot-joined |
| EL15 | `a@b.com-c@d.org` | `a@[EMAIL]` | L10: hyphen-joined |
| EL14 | `Zoë.O’Neil@example.org` | `Zoë.O’[EMAIL]` | L11: typographic apostrophe |

### EA-series: Fresh adversarial set: positives

| ID | Input | Output | Rule / why |
|---|---|---|---|
| EA01 | `Please write to a.b@c.de, thanks` | `Please write to [EMAIL], thanks` | Redacted |
| EA02 | `cc:x@y.org;z@w.net` | `cc:[EMAIL];[EMAIL]` | Redacted |
| EA03 | `FROM:<bob@corp.example.com>` | `FROM:<[EMAIL]>` | Redacted |
| EA04 | `Name: "Alice B." <alice.b@corp.io>` | `Name: "Alice B." <[EMAIL]>` | Redacted |
| EA05 | `a@b.com.au` | `[EMAIL]` | Redacted |
| EA06 | `user.name+filter@gmail.com` | `[EMAIL]` | Redacted |
| EA07 | `x-y@a-b.c-d.org` | `[EMAIL]` | Redacted |
| EA08 | `1@2.co` | `[EMAIL]` | Redacted |
| EA09 | `user@example.com<ZWSP>` | `[EMAIL]<ZWSP>` | Zero-width space preserved |
| EA10 | `a@b.com,` | `[EMAIL],` | Redacted |
| EA11 | `Contact:⏎  - a@b.com⏎  - c@d.org` | `Contact:⏎  - [EMAIL]⏎  - [EMAIL]` | Redacted |
| EA12 | `<<a@b.com>>` | `<<[EMAIL]>>` | Redacted |
| EA13 | `***a@b.com***` | `***[EMAIL]***` | Redacted |
| EA14 | `a@b.com?x=a@b.com` | `[EMAIL]?x=[EMAIL]` | Both occurrences replaced |
| EA15 | `a@b.co.uk.` | `[EMAIL].` | Redacted |
| EA16 | `tel:+1 415 555 0134 or a@b.com` | `tel:+1 415 555 0134 or [EMAIL]` | Only EMAIL is enabled here |
| EA17 | `A@B.CO` | `[EMAIL]` | Redacted |
| EA18 | `a@b.cc!` | `[EMAIL]!` | Redacted |
| EA19 | `a@b.com)` | `[EMAIL])` | Redacted |
| EA20 | `https://x.org/?e=a@b.com&f=1` | `https://x.org/?e=[EMAIL]&f=1` | Redacted |
| EA21 | `"a@b"@example.com` | `[EMAIL]` | Quoted local part containing `@` |
| EA22 | `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.com` | `[EMAIL]` | 64-character local part is allowed |
| EA23 | `john@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com` | `[EMAIL]` | 63-character label is allowed |

### EG-series: Fresh adversarial set: negatives

| ID | Input | Output | Rule / why |
|---|---|---|---|
| EG01 | `email@123.123.123.123` | `email@123.123.123.123` | Numeric labels: TLD `123` is not letters |
| EG02 | `version 1.0@2.0` | `version 1.0@2.0` | TLD `0` |
| EG03 | `a@b.com1` | `a@b.com1` | TLD `com1` contains a digit |
| EG04 | `twitter @handle and @another` | `twitter @handle and @another` | No local part before `@` |
| EG05 | `C:\users\a@b` | `C:\users\a@b` | Single-label domain |
| EG06 | `ratio 3@4.5` | `ratio 3@4.5` | TLD `5` |
| EG07 | `a@b..com` | `a@b..com` | Empty label |
| EG08 | `a@@b.com` | `a@@b.com` | Double `@` |
| EG09 | `user@exam_ple.com` | `user@exam_ple.com` | Underscore is not a label character: single label |
| EG10 | `user@example.com_` | `user@example.com_` | Underscore right after the domain |
| EG11 | `x@y.z` | `x@y.z` | TLD is one letter |
| EG12 | `name @ example.com` | `name @ example.com` | Spaces around `@` |
| EG13 | `Q&A@2024.` | `Q&A@2024.` | Domain `2024` is a single label |
| EG14 | `foo@bar.txt` | `foo@bar.txt` | File-extension TLD |
| EG15 | `a@b.json` | `a@b.json` | File-extension TLD |
| EG16 | `bit.ly/abc@def` | `bit.ly/abc@def` | Single-label domain |
| EG17 | `a@b.PNG` | `a@b.PNG` | File-extension TLD (case-insensitive) |
| EG18 | `"john⏎doe"@example.com` | `"john⏎doe"@example.com` | A quoted local part cannot span lines |
| EG19 | `Zoë.O’Neil@example.org` | `Zoë.O’[EMAIL]` | L11: typographic apostrophe; the part before it leaks |

### C-series: claim checks (behaviours stated in this document)

| ID | Claim | Input | Output |
|---|---|---|---|
| C01 | Quoted local parts with spaces, two in one sentence | `"a b"@x.com and "c d"@y.org` | `[EMAIL] and [EMAIL]` |
| C02 | Two display-name addresses in one line | `User <u@x.com>, Other <o@y.org>` | `User <[EMAIL]>, Other <[EMAIL]>` |
| C03 | Phone-shaped local part is an EMAIL; the bare phone number is untouched by this detector | `Phone: 415-555-0134 or 415-555-0134@example.com` | `Phone: 415-555-0134 or [EMAIL]` |
| C04 | Only one sentence period is excluded; the rest stays | `x@y.com..` | `[EMAIL]..` |
| C05 | Path and query after the address stay | `x@y.co.uk/page?q=1` | `[EMAIL]/page?q=1` |
| C06 | Right-to-left mark after the address is preserved | `john@example.com<RLM>` | `[EMAIL]<RLM>` |
| C07 | `.zip` is a real TLD, so it is accepted (L8) | `a@b.zip` | `[EMAIL]` |
| C08 | `.mov` is a real TLD, so it is accepted (L8) | `a@b.mov` | `[EMAIL]` |
| C09 | Greek letters in both parts | `ΑΒΓ@ΔΕΖ.ΗΘ` | `[EMAIL]` |
| C10 | A space inside the domain breaks it | `user@exa mple.com` | `user@exa mple.com` |
| C11 | A space inside the TLD breaks it | `user@example.c om` | `user@example.c om` |
| C12 | Slash is not a local-part character (L6) | `a/b@example.com` | `a/[EMAIL]` |
| C13 | Equals sign is not a local-part character (L6) | `a=b@example.com` | `a=[EMAIL]` |
| C14 | Exclamation mark is not a local-part character (L6) | `a!b@example.com` | `a![EMAIL]` |
| C15 | HTML-entity `@` is not detected (L2) | `john&#64;example.com` | `john&#64;example.com` |
| C16 | Bracket obfuscation is not detected (L1) | `john[at]example.com` | `john[at]example.com` |
| C17 | Any 2+ letter TLD is accepted (D2, L8) | `john@example.abc` | `[EMAIL]` |
| C18 | Typographic possessive after the address | `john@example.com’s` | `[EMAIL]’s` |
| C19 | A quoted local part may enclose an address | `"a@b.com"@example.com` | `[EMAIL]` |
| C20 | Uppercase file extension is still denied | `a@b.JPG` | `a@b.JPG` |
| C21 | `.java` is a real TLD, so it is accepted (added with the deny-list fix; same rule as C07; **not yet executed**, it becomes a TypeScript test) | `a@b.java` | `[EMAIL]` |



---

## 10. Verification log

The rules were verified **twice**, with a throwaway JavaScript reference sketch written from this specification (it is **not** the deliverable implementation). The final TypeScript implementation must pass the same tables in §9 as its unit tests.

### Pass 1: specification vs. executable matrix

- **121** cases in §9 (series EM, EF, ES, EL).
- The first run of the original 115 cases passed completely. A clean first run can also mean weak tests, so Pass 2 adds an independent oracle, a generator-based recall test and mutation checks.

### Pass 2: independent checks

1. **Review checklist** against the brief:

| Requirement | Covered by |
|---|---|
| Email addresses detected | §5; series EM (54), EA |
| Different formats of the same entity | plain, plus-tag, dots, sub-domains, Unicode, punycode, quoted, IPv4 literal, display-name, `mailto:`, JSON/HTML/Markdown (§1.1) |
| False positives (things that merely resemble addresses) | EF-series (43), EG-series, §5.3-5.4 |
| Multiple occurrences | ES01, ES03, ES05, EM29-EM31, EA02, EA11, EA14 |
| Overlaps and duplicate replacement | §4 step 3, §7; fuzz invariant: spans sorted and non-overlapping |
| Punctuation, line breaks, Unicode | EM21-EM26, EM32-EM34, EM43-EM49, EA09, §6 |
| Missing / empty input | detector-level: empty string yields no spans (EF33); `null` / non-string belong to the service layer |
| "Must not silently corrupt unrelated text" | fuzz invariant: rebuilding from untouched slices equals the output; recall test checks surroundings exactly |
| Document limitations | §8 (14 entries) |

2. **Fuzzing with an independent oracle:** 80,000 random strings (letters in several scripts, digits, `@`, dots, hyphens, quotes, brackets, newlines, tabs, emoji, NBSP, zero-width, fullwidth `＠`, typographic apostrophe, address-like words). **0 exceptions; 0 invariant failures** (every span in range, sorted, non-overlapping, containing `@`, and rebuild equals output). **Oracle:** every match was also checked against a separately written strict regular expression for a syntactically valid address: **0 rejections** (37,067 inputs contained a match).
3. **Recall test:** 30,000 randomly generated texts, each with 1-4 valid addresses (random local parts, 1-3 sub-domains, TLDs from several scripts incl. punycode) embedded between words and separators (space, newline, comma, semicolon, `<>`, `()`, tab, colon). **0 failures:** every address replaced, every other character byte-identical.
4. **Mutation check:** fourteen deliberate weakenings of the rules; **every one made tests fail**, so the tests really exercise the rules:

| Mutation | Tests that fail |
|---|---|
| M1: accept any label as TLD | 15 (EF06, EF08, EF09, EF14, EF15, EF28, …) |
| M2: drop file-extension deny list | 8 (EF07, EF25, EF26, EF40, EF41, EG14, …) |
| M3: drop 64-character local-part limit | 1 (EF23) |
| M4: drop 63-character label limit | 1 (EF24) |
| M5: drop leading-character trim | 6 (EM26, ES07-ES09, EL04, EL05) |
| M6: drop consecutive-dot handling | 1 (EL03) |
| M7: drop quoted local parts | 2 (EM18, EA21) |
| M8: drop IPv4-literal domains | 1 (EM19) |
| M9: drop underscore right guard | 2 (EF27, EG10) |
| M10: allow single-label domains | 5 (EF04, EF05, EF12, EF20, EG16) |
| M11: drop label hyphen rule | 2 (EF10, EF11) |
| M12: drop trailing-dot / apostrophe rejection | 1 (EF22) |
| M13: drop previous-match clip | 3 (ES07-ES09) |
| M14: no apostrophe in local part | 1 (EM05) |

5. **Performance / pathological input** (200-350 KB each: `@@@…`, `a@a@a@…`, 200,000-character local part, repeated addresses, dotted local part, dotted domain, quotes, glued addresses, apostrophes, hyphen domain): worst case **≈30 ms**; no catastrophic backtracking.
6. **Fresh adversarial set (series EA, EG):** 42 cases written after the main matrix (punctuation and markup around addresses, query strings, zero-width characters, quoted local parts, length limits, versions, ratios, file names, handles, underscores, uppercase extensions). All pass.
7. **Claim check (series C):** every concrete behaviour claimed in this document that was not already a matrix row was executed; results are in the C table.
8. **Defects found and fixed during verification:**
   - **A real leak:** two addresses joined by a local-part character (`a@b.com+c@d.org`) redacted only the first. Cause: the second address's backward scan ran into the first and lost the overlap. Fixed by D10 (a new address cannot start inside the previous match). Tests ES07-ES09 added; mutant M13 proves they matter. Non-idempotent cases in the fuzz run dropped from 200 to 26.
   - **A regression caused by that fix:** a quoted local part that encloses an address (`"a@b.com"@example.com`) was now split wrongly. Fixed by letting a quoted local part enclose an earlier address. Non-idempotent cases dropped from 26 to 1 (L13).
   - **One wrong expectation:** I had expected `a@b.com-c@d.org` to split at the hyphen; a hyphen can continue a domain label, so the correct behaviour is limitation L10 (test EL15).

### Final numbers

| Check | Result |
|---|---|
| Matrix (Pass 1) | 121 / 121 |
| Fresh adversarial (EA, EG) | 42 / 42 |
| Claim checks | 20 executed, behaviour as documented |
| Fuzz with independent oracle | 80,000 inputs: 0 exceptions, 0 invariant failures, 0 oracle rejections |
| Recall test | 30,000 generated texts: 0 failures |
| Mutation check | 14 / 14 mutants detected |
| Worst-case time | ≈30 ms on 200-350 KB pathological input |

---

## 11. Notes for the TypeScript implementation

- One detector object: `{ type: "EMAIL", find(text): Span[] }`. Keep the **file-extension deny list**, the character classes and the length limits as **data constants**, so they can be changed (or an IANA TLD list added) without touching the replacer.
- Offsets are UTF-16 code-unit indices into the original string, the same indices the replacer uses. Read neighbouring characters by **code point**, so emoji and other astral characters next to an address are handled safely (EM34).
- All scans are bounded (70 characters backwards, 253 forwards), which keeps the detector linear on pathological input.
- Unicode-aware character classes need the regular-expression `u` flag (`\p{L}`, `\p{N}`, `\p{M}`).
