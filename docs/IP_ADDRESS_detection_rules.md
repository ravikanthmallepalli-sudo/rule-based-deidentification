# IP_ADDRESS detection rules

**Entity:** `IP_ADDRESS` | **Placeholder:** `[IP_ADDRESS]` | **Spec version:** 1.0
**Status:** rules complete and **verified** (see §10). Every example in this document was executed, not just written.
**Basis:** the brief says "IPv4 addresses" and does not require IPv6. The task giver gave no extra clarification for this entity, so the format is taken literally (four decimal numbers 0-255 joined by dots) and everything beyond it is an explicit decision (§3) or an open question (O1-O3).

---

## 0. Summary (read this first)

- The detector looks for **four decimal numbers, each 0-255, joined by ASCII dots** (`192.168.1.1`). Each number has 1-3 digits; leading zeros are allowed (`192.168.001.001`, D2, open decision O2).
- It is **format-based and range-blind**: private, public, loopback, broadcast, documentation addresses and netmasks are all redacted (D6, open decision O3).
- **Guards** keep it out of longer dotted numbers and identifiers: no digit, letter, mark or underscore glued to the address, and no extra dotted group (`1.2.3.4.5`, `192.168.1.1.5`, `1.192.168.1.1`).
- **Ranges, lists, URLs, ports and CIDR all work.** A hyphen, slash or colon next to the address never blocks it, so `10.0.0.1-10.0.0.9` and `192.168.1.1/10.0.0.1` redact both addresses. The **port and the CIDR prefix stay outside the span** (`192.168.1.1:8080` → `[IP_ADDRESS]:8080`, `192.168.0.0/24` → `[IP_ADDRESS]/24`, D4).
- **One context rule, and it is negative:** a dotted quad that **directly follows a version or section word** (`Version 1.2.3.4`, `See section 1.2.3.4`, `Table 2.1.3.4`) is left alone, because such strings are overwhelmingly not addresses, **but only when all four octets are below 100** (version and section numbers rarely have a part of 100 or more; real addresses usually do). Everywhere else no context is needed (D5, open decision O1). This is the price of that rule: a real address with every octet below 100 written directly after one of those words (`Version 10.0.0.1`) is **not** redacted (L7).
- It protects the text around the address: punctuation, brackets, quotes, labels (`IP:`), line breaks, emoji and a sentence-final period stay exactly as written (`Connect to 10.0.0.1.` → `Connect to [IP_ADDRESS].`).
- **Three open decisions for you** (O1, O2, O3) are in §3.
- Everything the detector deliberately does **not** do is listed in §8 with an example and a reason.

> **Honest scope statement.** "Nothing missed" is achievable for the *declared scope* (§1) and the *documented limitations* (§8): every gap is named. No rule-based detector can catch every way an address is written; this one catches the dotted-decimal form and is explicit about the rest. The most important gaps: **other notations leak** (defanged `192[.]168[.]1[.]1`, decimal, hexadecimal, IPv6; L1, L5), an address with **one invalid octet leaks** (`192.168.1.256`, L2), and **version-like strings are redacted** unless a version or section word comes right before them (L6, L7).

---

## 1. Scope

### 1.1 In scope

| Kind of address | Handled? | Example |
|---|---|---|
| Four octets 0-255 joined by dots | Yes | `192.168.1.1` |
| Single-digit octets, `0.0.0.0`, `255.255.255.255` | Yes | `1.1.1.1`, `0.0.0.0` |
| Zero-padded octets | Yes | `192.168.001.001`, `010.000.000.001` |
| Private, loopback, link-local, broadcast, documentation addresses, netmasks | Yes, redacted (D6) | `127.0.0.1`, `203.0.113.45`, `255.255.255.0` |
| With a port | Yes, the port stays | `192.168.1.1:8080` → `[IP_ADDRESS]:8080` |
| With a CIDR prefix | Yes, the prefix stays | `10.0.0.0/8` → `[IP_ADDRESS]/8` |
| Inside URLs, query strings, JSON, markup, log lines | Yes | `http://10.0.0.5:8443/a?q=1`, `src=10.0.0.1 dst=10.0.0.2` |
| Ranges and lists (hyphen, slash, comma, semicolon, space, newline) | Yes, each address replaced | `10.0.0.1-10.0.0.9` |
| Brackets, quotes, `@`, `%` zone suffix | Yes | `ssh user@10.0.0.5`, `[10.0.0.1]` |
| IPv4 tail of an IPv4-mapped IPv6 address | Yes, only the tail | `::ffff:192.168.1.1` → `::ffff:[IP_ADDRESS]` |
| Address inside a host name | Yes, the four numbers | `192.168.1.1.nip.io` → `[IP_ADDRESS].nip.io` |
| Next to a label | Yes, the label stays | `IP: 192.168.1.1` → `IP: [IP_ADDRESS]` |

### 1.2 Out of scope (see §8 for reasons)

IPv6, defanged or written-out addresses (`192[.]168[.]1[.]1`, `192 dot 168 dot 1 dot 1`), decimal / hexadecimal / octal / short forms (`3232235777`, `0xC0A80101`, `127.1`), non-ASCII digits and dot look-alikes, spaces around dots, addresses with an invalid octet, and every other entity type.

---

## 2. Terminology

| Term | Meaning |
|---|---|
| **Octet** | One of the four numbers: a run of 1-3 ASCII digits with a value of 0-255. Leading zeros are allowed. |
| **Candidate** | Four octets joined by three ASCII dots. |
| **Letter-like** | A Unicode letter (`\p{L}`), any other Unicode number (`\p{N}`, ASCII digits aside), a combining mark (`\p{M}`) or `_`. |
| **Span** | `{ type: "IP_ADDRESS", start, end }`, offsets (UTF-16 code units) into the original string. A span covers the four octets only (7-15 code units). |
| **Left / right guard** | A check on the character just before / just after the candidate (§5.2). |
| **Negative context** | A version or section word directly before the candidate (§5.3). |
| **Keyword / filler word** | The words that make up a negative context (§5.3). |

---

## 3. Design decisions and why

| # | Decision | Reason |
|---|---|---|
| D1 | **Dotted-decimal IPv4 only**: exactly four octets and ASCII dots. | The brief says IPv4. Other notations (decimal, hex, short forms) are indistinguishable from ordinary numbers. Cost: L1, L5. |
| D2 | **An octet is 1-3 ASCII digits with a value 0-255; leading zeros are allowed.** A group of four or more digits, or a value above 255, makes the whole string not an address. | Zero-padded addresses appear in network-device output and logs. A value above 255 cannot be an address; matching a "valid part" of such a string would corrupt text. Cost: a typo such as `192.168.1.256` **leaks** (L2). See O2. |
| D3 | **Guards** (§5.2): the candidate may not touch a digit, letter, other Unicode number, combining mark or `_`, and may not be extended by another dotted group. **Other characters never block**: `- / : @ % # = ? &`, brackets, quotes, whitespace, emoji. | Keeps `v1.2.3.4`, `ip192.168.1.1`, `1.2.3.4.5`, OIDs and build numbers out, while `10.0.0.1-10.0.0.9`, `192.168.1.1:8080`, `10.0.0.0/8` and `http://10.0.0.1/a` still match. A range or a CIDR list must not leak. |
| D4 | **The span covers the four octets only.** The port, the CIDR prefix, brackets, user names and URL parts stay. | A port or a prefix length is not identifying, and replacing the whole `host:port` would hide useful structure. |
| D5 | **Negative context**: a version or section word (`version`, `release`, `build`, `section`, `table`, ...) directly before the candidate makes it **not** an address, **but only when all four octets are below 100**. No positive context is ever required. | A valid dotted quad is also a valid version number or section number (`1.2.3.4`). The brief names false positives that corrupt valid text as the thing to avoid. Version and section numbers rarely have a part of 100 or more, while real addresses usually do (`192.168.1.1`), so an octet of 100-255 overrides the version word (changed after implementation: before, `Version 192.168.1.1` leaked). Cost: L7. See O1. |
| D6 | **No range classification.** Private, loopback, link-local, broadcast, documentation and netmask-shaped values are all redacted. | Telling them apart needs tables that change, and a wrongly skipped real address is a leak. For a privacy tool the safe error is to redact too much (L6). See O3. |
| D7 | **ASCII digits and ASCII dots only; no Unicode normalisation.** | Normalising (e.g. NFKC) can change string length and shift offsets, which would risk corrupting unrelated text. Cost: L5. |
| D8 | **Guards read neighbouring code points**, not code units. | An emoji or an astral letter next to the address must not be misread (IF21, IF22, IC21). |
| D9 | **Spans of this detector can never overlap each other.** | A second candidate would have to start inside the first, at a digit that follows a digit or a dot after a digit, and the left guard rejects both. Fuzzing confirmed it (§10). |
| D10 | **Priority: rank 4.** `CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE`. | Agreed global order (§7). |
| D11 | **The whole four-octet string is replaced**; no partial mask (such as keeping the first three octets). | The brief asks for entity-specific placeholders, not partial masks. |
| D12 | Single pass. | Simple and predictable. Re-running on the output changed nothing in 80,000 random inputs (§10). |

### Open decisions for you

| # | Question | My recommendation |
|---|---|---|
| O1 | **Negative context for version and section numbers.** (a) *default*: skip a dotted quad that directly follows a version or section word; (b) *none*: redact every valid dotted quad, so `Version 1.2.3.4` becomes `Version [IP_ADDRESS]`. Both run (IC01, IC02). | Keep (a). The brief asks us not to corrupt unrelated text, and `1.2.3.4` is the classic version string. The price is L7: a real address right after those words is not redacted. The keyword list is one data constant, so it can be shortened or emptied. |
| O2 | **Leading zeros.** (a) *default*: accept (`192.168.001.001` is redacted); (b) *strict* (the `inet_pton` rule): reject octets with a leading zero, so such strings stay. Both run (IC03, IC04). | Keep (a). Zero-padded addresses are real, and rejecting them leaks. Cost: zero-padded look-alikes (`01.02.03.04`) are redacted (IL10). |
| O3 | **Special addresses.** (a) *default*: redact all (`0.0.0.0`, `127.0.0.1`, `255.255.255.255`, netmasks such as `255.255.255.0`); (b) skip a list of them. | Keep (a). A skip list is a table that goes stale, and none of these is likely to matter either way. Mention the skip list as a possible improvement in the README. |

O1-O3 use the recommended option. The partial-overlap policy (SSN O3) is **resolved** in `SERVICE_AND_RESOLVER_rules.md` §4 (overlapping spans are merged); see §7 and L9.

---

## 4. Algorithm

1. **Input:** a string (type/emptiness checks are the service layer's job; an empty string yields no spans).
2. For every index `i` where the text has an ASCII digit:
   1. **Left guard** (§5.2).
   2. **Read four octets**: each is a maximal run of 1-3 ASCII digits; the first three are followed by one ASCII dot. A run of four or more digits, a missing dot or a missing digit rejects the candidate.
   3. **Value rule:** every octet is at most 255 (leading zeros allowed, O2).
   4. **Right guard** (§5.2).
   5. **Negative context** (§5.3).
   6. Emit `{ type: "IP_ADDRESS", start: i, end: <end of the fourth octet> }`.
3. Detection never edits text. The replacer (separate module) copies untouched text between spans and inserts `[IP_ADDRESS]`.

### Constants

| Constant | Value |
|---|---|
| Octets | 4, joined by ASCII `.` |
| Digits per octet | 1-3 (ASCII `0-9`) |
| Octet value | 0-255 |
| Guard character classes | `\p{L}`, `\p{N}`, `\p{M}`, `_` |
| Negative-context window | 40 characters before the candidate, same line |
| Negative keywords | `version` `versions` `ver` `release` `build` `rev` `revision` `section` `sec` `clause` `chapter` `figure` `fig` `table` `step` `item` `article` `paragraph` `para` |
| Filler words | `number` `no` `num` `nr` `is` `of` |
| Separator characters (between keyword, filler words and the number) | whitespace (not a line break), `:` `=` `.` `#` `-` `–` `(` `)` |

---

## 5. Rule specifications

### 5.1 Shape

Four octets and three ASCII dots, nothing else inside: no space, comma, hyphen, underscore, tab or newline, and no doubled dot (`192.168.1..1`). Each octet is read as a **whole run of digits**, so `1.1.1.1234` is a four-digit last octet, not the address `1.1.1.123` followed by a `4`.

### 5.2 Guards (D3)

**Left guard.** The code point right before the first digit must **not** be:
- an ASCII digit (the first octet would start inside a longer number);
- a letter, any other Unicode number, a combining mark or `_`;
- a `.` when the code point before it is an ASCII digit (`1.192.168.1.1`: a fifth group in front).

**Right guard.** The code point right after the last digit must **not** be:
- a letter, any other Unicode number, a combining mark or `_`;
- a `.` followed by an ASCII digit (`192.168.1.1.5`: a fifth group behind).

(A digit directly after the last octet cannot occur: the octet is read as a whole run of digits, §5.1.)

**Does not block:** whitespace, `- / : ; , @ % # = ? & ' "`, brackets, `+`, `*`, `~`, emoji, zero-width characters, symbols such as `№` and `…`. A **dot followed by a letter** does not block either (`192.168.1.1.nip.io`), and a sentence-final period is fine (`10.0.0.1.` → `[IP_ADDRESS].`).

### 5.3 Negative context (D5)

Applies only when all four octets are below 100. A dotted quad with any octet from 100 to 255 is redacted even after a version or section word.

On the **same line**, in the 40 characters before the first digit, the text (case-insensitive) must **end** with:

`KEYWORD` then zero or more (`separators` + `filler word`), then optional `separators`.

- The keyword must start at the beginning of the window or after a character that is not a letter or digit, and it must be a whole word.
- Separators: whitespace (never a line break), `: = . # - – ( )`.
- Any **other** word, any **digit**, or a **line break** between the keyword and the number breaks the context.

Skipped: `Version 1.2.3.4`, `version: 1.2.3.4`, `Version number is 1.2.3.4`, `rev. 1.2.3.4`, `See section 1.2.3.4`, `Item no. 1.2.3.4`.
Not skipped (redacted): `Version 192.168.1.1` and `Release 172.16.0.5` (an octet of 100 or more), `Release candidate 1.2.3.4` (`candidate` is not a filler word), `Subversion 1.2.3.4`, `The IP version 4 address 192.168.1.1` (a digit and other words in between), `Version⏎1.2.3.4`, `Versions 1.2.3.4, 1.2.3.5` (the second number).

### 5.4 What stays outside the span

Everything that is not the four octets: the label (`IP:`), the port (`:8080`), the CIDR prefix (`/24`), brackets and quotes, a trailing hyphen or period, user names and URL parts, and all whitespace.

---

## 6. Punctuation and layout behaviour

| Situation | Result |
|---|---|
| Sentence end: `Connect to 10.0.0.1.` | `Connect to [IP_ADDRESS].` |
| Brackets, quotes, JSON, markup | delimiters stay |
| Port, CIDR prefix, URL path | stay outside the span |
| Lists and ranges (`,` `;` `/` `-` space or newline) | each address replaced separately |
| Label before the address (`IP: `, `ip=`, `src=`) | label stays |
| Line breaks (`\n`, `\r\n`), tabs, NBSP, emoji, accents, CJK, zero-width characters | preserved byte for byte |
| Same address repeated | every occurrence replaced; count = number of occurrences |
| Two addresses joined by a single dot, or an address with a fifth group | **not** replaced (L3) |

---

## 7. Interaction with other entities

Agreed priority: **CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE**. CREDIT_CARD, SSN and EMAIL outrank IP_ADDRESS; DATE_OF_BIRTH and PHONE yield to it.

| Situation | Result | Note |
|---|---|---|
| `john@[192.168.1.1]` | IP-only run: `john@[[IP_ADDRESS]]` (IC14) | With EMAIL enabled the EMAIL span covers the whole address, the IP span lies inside it and is dropped: `[EMAIL]`. **Not executed**, because the EMAIL implementation does not exist yet. Nothing is left behind. |
| `192.168.1.1@example.com` | IP-only run: `[IP_ADDRESS]@example.com` (IC15) | With EMAIL enabled: `[EMAIL]` (not executed). |
| `email@123.123.123.123` | `email@[IP_ADDRESS]` (IC16) | EMAIL rejects this (EMAIL EG01: numeric TLD), so the IP rule redacts the numbers. |
| `Phone: 192.168.1.100`, `IP 192.168.1.1` | `Phone: [IP_ADDRESS]`, `IP [IP_ADDRESS]` | PHONE leaves IPv4 shapes alone (PHONE F05, F47); IP needs no context. |
| `Version 1.2.3.4` | unchanged | PHONE F06 and CREDIT_CARD CF28 also leave it alone (IN01). |
| `Tel +44 20 192.168.1.1` | IP-only run: `Tel +44 20 [IP_ADDRESS]` (IC17) | **Derived from the PHONE rules, not executed:** PHONE would match `+44 20 192.168.1.1` (10 national digits, inside the UK range). The IP span partly overlaps it. Under the resolver's union rule the whole region becomes `[IP_ADDRESS]`, so `Tel [IP_ADDRESS]` with all detectors enabled (`SERVICE_AND_RESOLVER_rules.md` SI17; derived, not executed). |
| SSN `123-45-6789`, cards, dotted dates (`12.05.1990`) | unchanged by IP_ADDRESS | Different groupings: SSN uses dashes, cards use 12-19 digits, dotted dates have three groups (IF40, IF41, IF46, IF47). |

**Cross-check (§10):** the IP detector was run over **1,437 strings** (every backtick-quoted cell of the PHONE, EMAIL, CREDIT_CARD and SSN test tables, de-duplicated per document). It matched exactly six: PHONE F05 (`IP 192.168.1.1`), PHONE F47 (`Phone: 192.168.1.100`), EMAIL EM19 (`john@[192.168.1.1]`), EMAIL EG01 (`email@123.123.123.123`), CREDIT_CARD CF27 (`192.168.100.200`) and SSN SF33 (`192.168.1.1`). All six contain a real IPv4 address or an address-shaped numeric domain. The `Version 1.2.3.4` rows (PHONE F06, CREDIT_CARD CF28) are correctly left alone. No phone number, email address, card, SSN, date, UUID, ISBN or timestamp row is touched.

---

## 8. Known limitations (explicit, with reasons)

| # | Limitation | Example | Why accepted / mitigation |
|---|---|---|---|
| L1 | **Only the dotted-decimal notation is detected.** Decimal, hexadecimal, octal and short forms **leak**. | `3232235777`, `0xC0A80101`, `127.1` stay (IF37-IF39) | D1: indistinguishable from ordinary numbers. |
| L2 | **An invalid octet makes the whole string a non-address**, so an address with a typo **leaks**. No part of it is matched. | `192.168.1.256`, `999.999.999.999` stay (IF01-IF05, IF62) | D2: a value above 255 is not an address; matching a part would corrupt text. |
| L3 | **Longer dotted chains are not detected**, including **two addresses joined by one dot**. | `1.2.3.4.5`, `192.168.1.1.5`, `1.192.168.1.1`, `192.168.1.1.192.168.1.1` stay (IF08-IF11, IL04) | D3: the guard keeps OIDs, outline numbers and build numbers out. A dot followed by a *letter* is fine. |
| L4 | An address **glued to letters, digits, underscore or a combining mark** is not detected. | `ip192.168.1.1`, `192.168.1.1abc`, `192.168.1.1日本語` stay (IL05, IL06, IF14-IF25) | D3: keeps version-like and hex-like tokens out. A label glued to the address leaks. |
| L5 | **Obfuscated and non-ASCII forms** are not detected: defanged addresses, written-out dots, fullwidth or ideographic dots, fullwidth digits, spaces around dots, and **IPv6** (out of scope; only an IPv4-mapped tail is replaced). | `192[.]168[.]1[.]1`, `192 dot 168 dot 1 dot 1`, `192．168．1．1`, `2001:db8::1` stay (IL01-IL03, IL13, IF32-IF36) | D7: normalising shifts offsets. Defanged addresses are common in security reports; a future rule could add `[.]` and `(.)`. |
| L6 | **Over-redaction.** Any valid dotted quad is redacted whatever it really is: loopback, netmasks, documentation and example addresses, zero-padded numbers, and decimals that look like an address, unless a negative-context word comes right before. | `127.0.0.1`, `255.255.255.0`, `3.14.15.92`, `01.02.03.04`, `1.2.3.4 is an example` (IL07-IL10, IL12, IL14) | D5, D6: the safe error for a privacy tool. |
| L7 | **The negative context is a heuristic in both directions.** A real address directly after a version or section word is **not** redacted when all its octets are below 100; a version or section number with a part of 100 or more, or one that is **not** directly after a keyword, is redacted. The look-back window is 40 characters. | `Version 10.0.0.1` stays (IN40); `Version 192.168.1.1` is now redacted (IN28); `Version 1.0.0.100` is redacted (IN39, accepted over-redaction); `Versions 1.2.3.4, 1.2.3.5` → second number redacted (IN27); `Section 5 covers 1.2.3.4` redacted (IL11); a keyword 45 spaces away has no effect (IC11) | D5. The keyword list is data (O1). |
| L8 | **Only the four octets are replaced.** Port, CIDR prefix, host-name parts and user names stay. | `root@[IP_ADDRESS]:22`, `[IP_ADDRESS].nip.io`, `[IP_ADDRESS]/24` (IP25, IP38, IP22) | D4, D11. By design. |
| L9 | **IP-only runs leave the rest of a containing phone number.** With PHONE also enabled the union rule removes it, but the placeholder is `[IP_ADDRESS]`. | IP only: `Tel +44 20 [IP_ADDRESS]` (IC17); all enabled: `Tel [IP_ADDRESS]` (derived) | Resolved in `SERVICE_AND_RESOLVER_rules.md` §4. |
| L10 | **The negative keyword list is English only.** | `Versión 1.2.3.4` is redacted (IC23) | The list is data and can be extended (future: configuration). |

---

## 9. Test matrix (every row was executed)

Legend: `⏎` = newline, `⇥` = tab, `\r⏎` = CRLF, `<NBSP>` `<ZWSP>` `<RLM>` `<COMB>` `<IDSP>` = the corresponding Unicode characters (no-break space, zero-width space, right-to-left mark, combining acute accent, ideographic space). In every row only `IP_ADDRESS` is enabled. The **Output** column was produced by the run, not typed by hand.


### IP-series: addresses that must be redacted (50 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| IP01 | `192.168.1.1` | `[IP_ADDRESS]` | Private address, canonical form |
| IP02 | `IP: 192.168.1.1` | `IP: [IP_ADDRESS]` | The label stays |
| IP03 | `Connect to 10.0.0.1.` | `Connect to [IP_ADDRESS].` | Sentence-final period stays |
| IP04 | `8.8.8.8` | `[IP_ADDRESS]` | Public DNS address |
| IP05 | `0.0.0.0` | `[IP_ADDRESS]` | Unspecified address is redacted (D6, O3) |
| IP06 | `127.0.0.1` | `[IP_ADDRESS]` | Loopback is redacted (D6, O3) |
| IP07 | `255.255.255.255` | `[IP_ADDRESS]` | Broadcast is redacted (D6, O3) |
| IP08 | `255.255.255.0` | `[IP_ADDRESS]` | A netmask has the shape of an address (D6, L6) |
| IP09 | `1.1.1.1` | `[IP_ADDRESS]` | Single-digit octets |
| IP10 | `172.16.254.1` | `[IP_ADDRESS]` | Private range |
| IP11 | `203.0.113.45` | `[IP_ADDRESS]` | Documentation range is redacted (D6) |
| IP12 | `192.168.001.001` | `[IP_ADDRESS]` | Zero-padded octets (D2, O2) |
| IP13 | `010.000.000.001` | `[IP_ADDRESS]` | Leading zeros everywhere (D2, O2) |
| IP14 | `1.2.3.4` | `[IP_ADDRESS]` | Bare address, no context needed (D4) |
| IP15 | `(192.168.1.1)` | `([IP_ADDRESS])` | Brackets stay |
| IP16 | `[192.168.1.1]` | `[[IP_ADDRESS]]` | Square brackets stay |
| IP17 | `<192.168.1.1>` | `<[IP_ADDRESS]>` | Angle brackets stay |
| IP18 | `"192.168.1.1"` | `"[IP_ADDRESS]"` | Quotes stay |
| IP19 | `{"ip":"192.168.1.1"}` | `{"ip":"[IP_ADDRESS]"}` | JSON |
| IP20 | `ip=192.168.1.1&x=1` | `ip=[IP_ADDRESS]&x=1` | Query string |
| IP21 | `192.168.1.1:8080` | `[IP_ADDRESS]:8080` | The port stays outside the span (D4) |
| IP22 | `192.168.0.0/24` | `[IP_ADDRESS]/24` | The CIDR prefix stays outside the span (D4) |
| IP23 | `http://192.168.1.1/admin` | `http://[IP_ADDRESS]/admin` | URL path stays |
| IP24 | `https://10.0.0.5:8443/path?q=1` | `https://[IP_ADDRESS]:8443/path?q=1` | Port and path stay |
| IP25 | `ssh user@10.0.0.5` | `ssh user@[IP_ADDRESS]` | After `@` |
| IP26 | `192.168.1.1-192.168.1.20` | `[IP_ADDRESS]-[IP_ADDRESS]` | A range joined by a hyphen: both found (D3) |
| IP27 | `192.168.1.1 - 192.168.1.20` | `[IP_ADDRESS] - [IP_ADDRESS]` | Spaced range |
| IP28 | `192.168.1.1, 10.0.0.1; 172.16.0.1` | `[IP_ADDRESS], [IP_ADDRESS]; [IP_ADDRESS]` | Comma and semicolon list |
| IP29 | `192.168.1.1/10.0.0.1` | `[IP_ADDRESS]/[IP_ADDRESS]` | Slash-separated pair |
| IP30 | `192.168.1.1⏎10.0.0.1` | `[IP_ADDRESS]⏎[IP_ADDRESS]` | Newline-separated |
| IP31 | `a 1.1.1.1 b 1.1.1.1 c 1.1.1.1` | `a [IP_ADDRESS] b [IP_ADDRESS] c [IP_ADDRESS]` | Every occurrence replaced |
| IP32 | `😀192.168.1.1😀` | `😀[IP_ADDRESS]😀` | Emoji directly adjacent |
| IP33 | `Call\r⏎192.168.1.1\r⏎next` | `Call\r⏎[IP_ADDRESS]\r⏎next` | CRLF preserved |
| IP34 | `Tab⇥192.168.1.1⇥end` | `Tab⇥[IP_ADDRESS]⇥end` | Tabs preserved |
| IP35 | `<ZWSP>192.168.1.1<ZWSP>` | `<ZWSP>[IP_ADDRESS]<ZWSP>` | Zero-width spaces preserved |
| IP36 | `192.168.1.1<NBSP>ok` | `[IP_ADDRESS]<NBSP>ok` | NBSP preserved |
| IP37 | `::ffff:192.168.1.1` | `::ffff:[IP_ADDRESS]` | IPv4-mapped IPv6: only the IPv4 tail is replaced |
| IP38 | `192.168.1.1.nip.io` | `[IP_ADDRESS].nip.io` | A dot followed by a letter is not a continuation |
| IP39 | `4.3.2.1.in-addr.arpa` | `[IP_ADDRESS].in-addr.arpa` | Reverse-DNS name: the four numbers are replaced |
| IP40 | `192.168.1.1's` | `[IP_ADDRESS]'s` | Possessive stays |
| IP41 | `from=192.168.1.1;to=10.0.0.1` | `from=[IP_ADDRESS];to=[IP_ADDRESS]` | Key=value pairs |
| IP42 | `-192.168.1.1` | `-[IP_ADDRESS]` | A leading hyphen does not block |
| IP43 | `192.168.1.1-` | `[IP_ADDRESS]-` | A trailing hyphen does not block |
| IP44 | `Résumé — IP 192.168.1.1 — café ☕` | `Résumé — IP [IP_ADDRESS] — café ☕` | Accents, dashes and symbols untouched |
| IP45 | `日本語 192.168.1.1 日本語` | `日本語 [IP_ADDRESS] 日本語` | CJK text with spaces around the address |
| IP46 | `10.0.0.1:22->192.168.1.5:443` | `[IP_ADDRESS]:22->[IP_ADDRESS]:443` | Connection log line |
| IP47 | `10.0.0.1<RLM>` | `[IP_ADDRESS]<RLM>` | Right-to-left mark preserved |
| IP48 | `ssh://root@10.0.0.1:22/` | `ssh://root@[IP_ADDRESS]:22/` | URL with user and port |
| IP49 | `0.0.0.0/0` | `[IP_ADDRESS]/0` | Default route: only the address is replaced |
| IP50 | `10.0.0.1%eth0` | `[IP_ADDRESS]%eth0` | Zone-style suffix stays |

### IF-series: strings that must stay unchanged (62 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| IF01 | `256.1.1.1` | `256.1.1.1` | First octet above 255 |
| IF02 | `1.256.1.1` | `1.256.1.1` | Second octet above 255 |
| IF03 | `1.1.256.1` | `1.1.256.1` | Third octet above 255 |
| IF04 | `1.1.1.256` | `1.1.1.256` | Fourth octet above 255 (L2) |
| IF05 | `999.999.999.999` | `999.999.999.999` | All octets above 255 |
| IF06 | `1.2.3` | `1.2.3` | Three groups |
| IF07 | `192.168.1` | `192.168.1` | Three groups |
| IF08 | `1.2.3.4.5` | `1.2.3.4.5` | Five groups (L3) |
| IF09 | `1.2.3.4.5.6` | `1.2.3.4.5.6` | Six groups |
| IF10 | `192.168.1.1.5` | `192.168.1.1.5` | A fifth group continues the number |
| IF11 | `1.192.168.1.1` | `1.192.168.1.1` | A group in front continues the number |
| IF12 | `1234.1.1.1` | `1234.1.1.1` | First octet has 4 digits |
| IF13 | `1.1.1.1234` | `1.1.1.1234` | Last octet has 4 digits |
| IF14 | `192.168.1.1a` | `192.168.1.1a` | Letter glued after (L4) |
| IF15 | `a192.168.1.1` | `a192.168.1.1` | Letter glued before (L4) |
| IF16 | `v1.2.3.4` | `v1.2.3.4` | Version prefix glued before |
| IF17 | `192.168.1.1_` | `192.168.1.1_` | Underscore after |
| IF18 | `_192.168.1.1` | `_192.168.1.1` | Underscore before |
| IF19 | `192.168.1.1<COMB>` | `192.168.1.1<COMB>` | Combining mark glued after |
| IF20 | `<COMB>192.168.1.1` | `<COMB>192.168.1.1` | Combining mark glued before |
| IF21 | `𝐀192.168.1.1` | `𝐀192.168.1.1` | Astral letter (surrogate pair) glued before: guards read code points |
| IF22 | `192.168.1.1𝐀` | `192.168.1.1𝐀` | Astral letter glued after |
| IF23 | `192.168.1.1٣` | `192.168.1.1٣` | Arabic-Indic digit glued after |
| IF24 | `٣192.168.1.1` | `٣192.168.1.1` | Arabic-Indic digit glued before |
| IF25 | `192.168.1.1²` | `192.168.1.1²` | Superscript digit glued after |
| IF26 | `192,168,1,1` | `192,168,1,1` | Commas are not separators |
| IF27 | `192 168 1 1` | `192 168 1 1` | Spaces are not separators |
| IF28 | `192-168-1-1` | `192-168-1-1` | Hyphens are not separators |
| IF29 | `192.168.1..1` | `192.168.1..1` | Empty group |
| IF30 | `192..168.1.1` | `192..168.1.1` | Empty group |
| IF31 | `192.168.1.` | `192.168.1.` | Truncated |
| IF32 | `192. 168.1.1` | `192. 168.1.1` | Space after a dot (L5) |
| IF33 | `192.168.1 .1` | `192.168.1 .1` | Space before a dot (L5) |
| IF34 | `192．168．1．1` | `192．168．1．1` | Fullwidth full stops: ASCII dots only (L5) |
| IF35 | `192。168。1。1` | `192。168。1。1` | Ideographic full stops (L5) |
| IF36 | `１９２.１６８.１.１` | `１９２.１６８.１.１` | Fullwidth digits: ASCII only (L5) |
| IF37 | `3232235777` | `3232235777` | Decimal form of an address (L5) |
| IF38 | `0xC0A80101` | `0xC0A80101` | Hexadecimal form (L5) |
| IF39 | `127.1` | `127.1` | Short form (L5) |
| IF40 | `2024-05-12` | `2024-05-12` | ISO date |
| IF41 | `12.05.1990` | `12.05.1990` | Dotted date: three groups |
| IF42 | `3.14159` | `3.14159` | Decimal number |
| IF43 | `Coords 37.7749, -122.4194` | `Coords 37.7749, -122.4194` | Coordinates |
| IF44 | `1,234.56` | `1,234.56` | Comma-grouped decimal |
| IF45 | `415-555-0134` | `415-555-0134` | Phone number |
| IF46 | `123-45-6789` | `123-45-6789` | SSN shape |
| IF47 | `4111 1111 1111 1111` | `4111 1111 1111 1111` | Card number |
| IF48 | `v1.2.3` | `v1.2.3` | Version string with three groups |
| IF49 | `1.2.3-beta.4` | `1.2.3-beta.4` | Pre-release version |
| IF50 | `Chrome 120.0.6099.109` | `Chrome 120.0.6099.109` | Browser version: a 4-digit group |
| IF51 | `10.0.19045.1` | `10.0.19045.1` | Windows build number: a 5-digit group |
| IF52 | `1.3.6.1.4.1.311` | `1.3.6.1.4.1.311` | Object identifier: seven groups |
| IF53 | *(empty)* | *(empty)* | Empty input |
| IF54 | `no digits here` | `no digits here` | No digits |
| IF55 | `10.0.0.1.1` | `10.0.0.1.1` | Fifth group |
| IF56 | `10.0.0.1.2` | `10.0.0.1.2` | Fifth group |
| IF57 | `10.0.0.-1` | `10.0.0.-1` | Negative last group |
| IF58 | `00000.0.0.0` | `00000.0.0.0` | Five-digit group |
| IF59 | `0.0.0.0000` | `0.0.0.0000` | Four-digit last group |
| IF60 | `5.4.3.2.1` | `5.4.3.2.1` | Countdown: five groups |
| IF61 | `300.300.300.300` | `300.300.300.300` | All octets above 255 |
| IF62 | `192.168.1.256` | `192.168.1.256` | A typo in the last octet is not redacted (L2) |

### IN-series: version and section words (negative context) (43 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| IN01 | `Version 1.2.3.4` | `Version 1.2.3.4` | `Version` right before the number |
| IN02 | `version: 1.2.3.4` | `version: 1.2.3.4` | Colon between |
| IN03 | `Version number is 1.2.3.4` | `Version number is 1.2.3.4` | Filler words `number`, `is` |
| IN04 | `ver 1.2.3.4` | `ver 1.2.3.4` | `ver` |
| IN05 | `Release 10.0.0.1` | `Release 10.0.0.1` | `Release` |
| IN06 | `build 1.2.3.4` | `build 1.2.3.4` | `build` |
| IN07 | `rev. 1.2.3.4` | `rev. 1.2.3.4` | `rev.` with a dot |
| IN08 | `Revision 1.2.3.4` | `Revision 1.2.3.4` | `Revision` |
| IN09 | `See section 1.2.3.4` | `See section 1.2.3.4` | Section number |
| IN10 | `Chapter 1.2.3.4` | `Chapter 1.2.3.4` | Chapter number |
| IN11 | `Figure 1.2.3.4` | `Figure 1.2.3.4` | Figure number |
| IN12 | `Table 2.1.3.4` | `Table 2.1.3.4` | Table number |
| IN13 | `step 1.2.3.4` | `step 1.2.3.4` | Step number |
| IN14 | `VERSION 1.2.3.4` | `VERSION 1.2.3.4` | Case-insensitive |
| IN15 | `Version 1.2.3.4 and 192.168.1.1` | `Version 1.2.3.4 and [IP_ADDRESS]` | Only an address directly after the word is skipped |
| IN16 | `Version⏎1.2.3.4` | `Version⏎[IP_ADDRESS]` | Context cannot span a line break |
| IN17 | `Version<NBSP>1.2.3.4` | `Version<NBSP>1.2.3.4` | NBSP counts as a space |
| IN18 | `Server version 10.0.0.1` | `Server version 10.0.0.1` | `version` is the last keyword before the number |
| IN19 | `Subversion 1.2.3.4` | `Subversion [IP_ADDRESS]` | `version` inside another word is not a keyword |
| IN20 | `The IP version 4 address 192.168.1.1` | `The IP version 4 address [IP_ADDRESS]` | A digit and other words between: no context |
| IN21 | `Version (1.2.3.4)` | `Version (1.2.3.4)` | Parenthesis between |
| IN22 | `Version-1.2.3.4` | `Version-1.2.3.4` | Hyphen between |
| IN23 | `Version #1.2.3.4` | `Version #1.2.3.4` | `#` between |
| IN24 | `Item no. 1.2.3.4` | `Item no. 1.2.3.4` | `no.` filler |
| IN25 | `Version of 1.2.3.4` | `Version of 1.2.3.4` | Filler `of` |
| IN26 | `Release candidate 1.2.3.4` | `Release candidate [IP_ADDRESS]` | `candidate` is not a filler word |
| IN27 | `Versions 1.2.3.4, 1.2.3.5` | `Versions 1.2.3.4, [IP_ADDRESS]` | Second item of a list has no keyword directly before it (L7) |
| IN29 | `Versions 1.2.3.4` | `Versions 1.2.3.4` | `Versions` |
| IN30 | `Sec. 1.2.3.4` | `Sec. 1.2.3.4` | `Sec.` |
| IN31 | `Clause 1.2.3.4` | `Clause 1.2.3.4` | `Clause` |
| IN32 | `Fig. 1.2.3.4` | `Fig. 1.2.3.4` | `Fig.` |
| IN33 | `Article 1.2.3.4` | `Article 1.2.3.4` | `Article` |
| IN34 | `Paragraph 1.2.3.4` | `Paragraph 1.2.3.4` | `Paragraph` |
| IN35 | `Para 1.2.3.4` | `Para 1.2.3.4` | `Para` |
| IN36 | `Version num 1.2.3.4` | `Version num 1.2.3.4` | Filler `num` |
| IN37 | `Version nr. 1.2.3.4` | `Version nr. 1.2.3.4` | Filler `nr` |
| IN38 | `Version no 1.2.3.4` | `Version no 1.2.3.4` | Filler `no` |
| IN28 | `Version 192.168.1.1` | `Version [IP_ADDRESS]` | A version word protects only numbers whose octets are all below 100 (D5); changed after implementation |
| IN39 | `Version 1.0.0.100` | `Version [IP_ADDRESS]` | An octet of 100 or more: not protected (accepted over-redaction) |
| IN40 | `Version 10.0.0.1` | `Version 10.0.0.1` | All octets below 100: still protected (remaining leak, L7) |
| IN41 | `See section 2.4.18.1` | `See section 2.4.18.1` | Section number, all parts below 100 |
| IN42 | `Release 172.16.0.5` | `Release [IP_ADDRESS]` | Octet 172: not protected |
| IN43 | `Build 255.255.255.0` | `Build [IP_ADDRESS]` | Netmask after a version word: redacted |

### IS-series: structure, repetition, layout (11 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| IS01 | `Contact:⏎  - 192.168.1.1⏎  - 10.0.0.1` | `Contact:⏎  - [IP_ADDRESS]⏎  - [IP_ADDRESS]` | List with line breaks |
| IS02 | `  192.168.1.1  ` | `  [IP_ADDRESS]  ` | Surrounding spaces kept |
| IS03 | `⏎⏎192.168.1.1⏎⏎` | `⏎⏎[IP_ADDRESS]⏎⏎` | Blank lines kept |
| IS04 | `from 192.168.1.1 to 10.0.0.1 via 172.16.0.1` | `from [IP_ADDRESS] to [IP_ADDRESS] via [IP_ADDRESS]` | Three addresses |
| IS05 | `192.168.1.1,192.168.1.1` | `[IP_ADDRESS],[IP_ADDRESS]` | Same address twice |
| IS06 | `{"a":"192.168.1.1","b":"10.0.0.1"}` | `{"a":"[IP_ADDRESS]","b":"[IP_ADDRESS]"}` | JSON |
| IS07 | `<td>192.168.1.1</td><td>10.0.0.1</td>` | `<td>[IP_ADDRESS]</td><td>[IP_ADDRESS]</td>` | HTML cells |
| IS08 | `192.168.1.1⏎` | `[IP_ADDRESS]⏎` | Trailing newline kept |
| IS09 | `Zoë 😀 日本語<ZWSP> 192.168.1.1 ☕` | `Zoë 😀 日本語<ZWSP> [IP_ADDRESS] ☕` | Surrounding text byte for byte |
| IS10 | `Date 12.05.1990 from 10.0.0.1` | `Date 12.05.1990 from [IP_ADDRESS]` | A date next to an address |
| IS11 | `x 10.0.0.1 y 10.0.0.256 z 8.8.8.8` | `x [IP_ADDRESS] y 10.0.0.256 z [IP_ADDRESS]` | Valid, invalid and valid in one line |

### IL-series: documented limitations (expected = current behaviour) (15 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| IL01 | `192[.]168[.]1[.]1` | `192[.]168[.]1[.]1` | L5: defanged address |
| IL02 | `192(.)168(.)1(.)1` | `192(.)168(.)1(.)1` | L5: defanged address |
| IL03 | `192 dot 168 dot 1 dot 1` | `192 dot 168 dot 1 dot 1` | L5: written out |
| IL04 | `192.168.1.1.192.168.1.1` | `192.168.1.1.192.168.1.1` | L3: two addresses joined by a dot: both missed |
| IL05 | `ip192.168.1.1` | `ip192.168.1.1` | L4: label glued to the address |
| IL06 | `192.168.1.1日本語` | `192.168.1.1日本語` | L4: CJK letters glued to the address |
| IL07 | `Netmask 255.255.255.0` | `Netmask [IP_ADDRESS]` | L6: netmask redacted |
| IL08 | `localhost is 127.0.0.1` | `localhost is [IP_ADDRESS]` | L6: loopback redacted |
| IL09 | `3.14.15.92` | `[IP_ADDRESS]` | L6: a number that looks like an address |
| IL10 | `01.02.03.04` | `[IP_ADDRESS]` | L6: zero-padded numbers (dates, versions) look like an address |
| IL11 | `Section 5 covers 1.2.3.4` | `Section 5 covers [IP_ADDRESS]` | L7: section number not directly after the keyword |
| IL12 | `host.10.0.0.1` | `host.[IP_ADDRESS]` | L6: hostname-like prefix |
| IL13 | `2001:db8::1` | `2001:db8::1` | L5: IPv6 is out of scope |
| IL14 | `1.2.3.4 is an example` | `[IP_ADDRESS] is an example` | L6: example address redacted |
| IL15 | `See Table 1.2.3.4 and Table 1.2.3.5` | `See Table 1.2.3.4 and Table 1.2.3.5` | Each number has its own keyword |

### IA-series: fresh adversarial set, positives (written after the main matrix) (25 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| IA01 | `IP:192.168.1.1;PORT:80` | `IP:[IP_ADDRESS];PORT:80` | Colon and semicolon around the address |
| IA02 | `(from 10.0.0.1)` | `(from [IP_ADDRESS])` | Redacted |
| IA03 | `src=10.0.0.1 dst=10.0.0.2` | `src=[IP_ADDRESS] dst=[IP_ADDRESS]` | Log fields |
| IA04 | `**10.0.0.1**` | `**[IP_ADDRESS]**` | Markdown emphasis |
| IA05 | `10.0.0.1?` | `[IP_ADDRESS]?` | Question mark stays |
| IA06 | `ip:[10.0.0.1]:8080` | `ip:[[IP_ADDRESS]]:8080` | Bracketed address with a port |
| IA07 | `<td>10.0.0.1</td>` | `<td>[IP_ADDRESS]</td>` | HTML |
| IA08 | `…10.0.0.1…` | `…[IP_ADDRESS]…` | Ellipsis characters |
| IA09 | `№10.0.0.1` | `№[IP_ADDRESS]` | Numero sign is a symbol |
| IA10 | `ＩＰ：10.0.0.1` | `ＩＰ：[IP_ADDRESS]` | Fullwidth label and colon |
| IA11 | `<NBSP>10.0.0.1` | `<NBSP>[IP_ADDRESS]` | Leading NBSP |
| IA12 | `Hi,10.0.0.1` | `Hi,[IP_ADDRESS]` | Comma directly before |
| IA13 | `see/10.0.0.1` | `see/[IP_ADDRESS]` | Slash directly before |
| IA14 | `~10.0.0.1~` | `~[IP_ADDRESS]~` | Tildes |
| IA15 | `'10.0.0.1'` | `'[IP_ADDRESS]'` | Single quotes |
| IA16 | `Ref 7 10.0.0.1` | `Ref 7 [IP_ADDRESS]` | A short number before, separated by a space |
| IA17 | `2024 10.0.0.1 2025` | `2024 [IP_ADDRESS] 2025` | Numbers around, separated by spaces |
| IA18 | `a-10.0.0.1-b` | `a-[IP_ADDRESS]-b` | Hyphens after letters |
| IA19 | `\r⏎10.0.0.1` | `\r⏎[IP_ADDRESS]` | CRLF directly before |
| IA20 | `1.1.1.1/32` | `[IP_ADDRESS]/32` | Host route |
| IA21 | `10.0.0.1/8` | `[IP_ADDRESS]/8` | Network with a short prefix |
| IA22 | `ftp://10.0.0.1.` | `ftp://[IP_ADDRESS].` | Sentence period after a URL |
| IA23 | `Done.10.0.0.1` | `Done.[IP_ADDRESS]` | A period after a letter is not a continuation |
| IA24 | `IP 10.0.0.1 (version 4)` | `IP [IP_ADDRESS] (version 4)` | `version` after the address does not matter |
| IA25 | `Gateway: 192.168.0.254, DNS: 8.8.4.4` | `Gateway: [IP_ADDRESS], DNS: [IP_ADDRESS]` | Typical settings block |

### IG-series: fresh adversarial set, negatives (written after the main matrix) (24 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| IG01 | `10.0.0.1.1` | `10.0.0.1.1` | Fifth group |
| IG02 | `1.10.0.0.1` | `1.10.0.0.1` | Group in front |
| IG03 | `10.0.0.1234` | `10.0.0.1234` | Four-digit last group |
| IG04 | `x10.0.0.1` | `x10.0.0.1` | Letter before |
| IG05 | `10.0.0.1x` | `10.0.0.1x` | Letter after |
| IG06 | `v10.0.0.1` | `v10.0.0.1` | Version-like prefix |
| IG07 | `10.0.0.256` | `10.0.0.256` | Octet above 255 |
| IG08 | `10.0.256.0` | `10.0.256.0` | Octet above 255 |
| IG09 | `10.0.0` | `10.0.0` | Three groups |
| IG10 | `10.0.0.` | `10.0.0.` | Truncated |
| IG11 | `10.0.0.1٣` | `10.0.0.1٣` | Arabic-Indic digit after |
| IG12 | `10.0.0..1` | `10.0.0..1` | Empty group |
| IG13 | `10..0.0.1` | `10..0.0.1` | Empty group |
| IG14 | `1.0.0.0.1` | `1.0.0.0.1` | Five groups |
| IG15 | `Version 5.4.3.2` | `Version 5.4.3.2` | Version word directly before |
| IG16 | `10 .0.0.1` | `10 .0.0.1` | Space before a dot |
| IG17 | `x_10.0.0.1` | `x_10.0.0.1` | Underscore directly before |
| IG18 | `10.0.0.1_x` | `10.0.0.1_x` | Underscore directly after |
| IG19 | `a.b.c.d` | `a.b.c.d` | Letters |
| IG20 | `1.2.3.x` | `1.2.3.x` | Letter in the last group |
| IG21 | `10.0.0.1é` | `10.0.0.1é` | Accented letter after |
| IG22 | `é10.0.0.1` | `é10.0.0.1` | Accented letter before |
| IG23 | `Ⅻ10.0.0.1` | `Ⅻ10.0.0.1` | Roman-numeral character before |
| IG24 | `1.2.3.4.5.` | `1.2.3.4.5.` | Five groups then a period |


### IC-series: claim checks (behaviours stated in this document, 23 cases)

| ID | Claim | Input | Output |
|---|---|---|---|
| IC01 | Option O1(b), no negative context: version and section numbers are redacted | `Version 1.2.3.4 and See section 1.2.3.4` | `Version [IP_ADDRESS] and See section [IP_ADDRESS]` |
| IC02 | Default (O1(a)): the same two strings are left alone | `Version 1.2.3.4 and See section 1.2.3.4` | `Version 1.2.3.4 and See section 1.2.3.4` |
| IC03 | Option O2(b), strict: zero-padded octets are not redacted | `192.168.001.001 and 192.168.1.1` | `192.168.001.001 and [IP_ADDRESS]` |
| IC04 | Default (O2(a)): both are redacted | `192.168.001.001 and 192.168.1.1` | `[IP_ADDRESS] and [IP_ADDRESS]` |
| IC05 | A short range after a hyphen: only the address is replaced | `192.168.1.1-20` | `[IP_ADDRESS]-20` |
| IC06 | A hostname that embeds an address: the four numbers are replaced, the rest stays | `server-10.0.0.1.example.com` | `server-[IP_ADDRESS].example.com` |
| IC07 | A version word that is not directly before the address does not protect it | `Version 2 of the doc, host 10.0.0.1` | `Version 2 of the doc, host [IP_ADDRESS]` |
| IC08 | A keyword on the previous line does not protect the address | `Version⏎1.2.3.4 and Version 1.2.3.5` | `Version⏎[IP_ADDRESS] and Version 1.2.3.5` |
| IC09 | Several spaces between the keyword and the number are fine | `Version     1.2.3.4` | `Version     1.2.3.4` |
| IC10 | Several filler words between the keyword and the number are fine | `Version no. is 1.2.3.4` | `Version no. is 1.2.3.4` |
| IC11 | The look-back window is 40 characters: a keyword more than 40 characters away has no effect (L7) | `Version                                             1.2.3.4` | `Version                                             [IP_ADDRESS]` |
| IC12 | Mixed case keyword | `vErSiOn 1.2.3.4` | `vErSiOn 1.2.3.4` |
| IC13 | Five-digit port stays outside the span | `10.0.0.1:65535` | `[IP_ADDRESS]:65535` |
| IC14 | Email-literal domain, IP-only run: the bracketed address is replaced on its own (EMAIL would own the whole address) | `john@[192.168.1.1]` | `john@[[IP_ADDRESS]]` |
| IC15 | Address-shaped email local part, IP-only run | `192.168.1.1@example.com` | `[IP_ADDRESS]@example.com` |
| IC16 | Numeric domain rejected by EMAIL (EMAIL EG01): the IP detector replaces it | `email@123.123.123.123` | `email@[IP_ADDRESS]` |
| IC17 | Phone-like prefix next to an address, IP-only run (the PHONE span would partly overlap; derived, not executed) | `Tel +44 20 192.168.1.1` | `Tel +44 20 [IP_ADDRESS]` |
| IC18 | Surrounding text is returned byte for byte (accents, emoji, CJK, zero-width) | `Zoë 😀 日本語<ZWSP> 192.168.1.1 ☕` | `Zoë 😀 日本語<ZWSP> [IP_ADDRESS] ☕` |
| IC19 | Octet 256 anywhere makes the whole string a non-address, even with a valid-looking tail | `Server 10.0.0.256 and 0.10.0.256` | `Server 10.0.0.256 and 0.10.0.256` |
| IC23 | The negative keyword list is English only: a Spanish version word does not protect the number (L10) | `Versión 1.2.3.4` | `Versión [IP_ADDRESS]` |
| IC20 | Span offsets are UTF-16 code-unit indices; the port is not in the span | `x 192.168.1.1:8080 y` | `[[2,13]] (length 11)` |
| IC21 | An emoji before the address counts as 2 units | `😀 10.0.0.1` | `[[3,11]]` |
| IC22 | Longest possible span is 15 units | `255.255.255.255` | `[[0,15]]` |

---

## 10. Verification log

The rules were verified with a throwaway JavaScript reference sketch written from this specification (it is **not** the deliverable implementation). The final TypeScript implementation must pass the same tables in §9 as its unit tests.

### How the checks went (honest history)

1. **Matrix, first run.** The first complete run passed **216 of 216** cases. A clean first run can also mean weak tests, because the expected outputs and the sketch were written from the same specification. Two rows of my first draft were awkward (a positive hidden in the negative series, a needless string operation in a row); both were tidied before the checks below.
2. **Mutation check: no survivor, and why.** The SSN check had one survivor (a missing test for one side of a guard), so this time every guard has a **left and a right switch**, and **every negative keyword (19) and every filler word (6) has its own mutant**. Ten extra context rows (IN29-IN38) were added *before* the mutation run because the first matrix had no row for `versions`, `sec`, `clause`, `fig`, `article`, `paragraph`, `para`, `num`, `nr`, `no`. With that done, **all 55 mutants were detected**. This is not proof that the tests are complete. One switch was deliberately **not** mutated: the *right digit guard*, which cannot be observed because octets are read as whole digit runs (an equivalent mutant).
3. **Fuzzing found nothing.** 80,000 random inputs produced 0 exceptions, 0 invariant failures, 0 differences against the independent re-implementation and 0 non-idempotent outputs. The re-implementation uses a different technique (one look-around regular expression, and a token-based check for the negative context) but follows the **same specification**, so a misreading of the specification would affect both.
4. **Recall test passed on its first run.** 30,000 generated texts with 74,741 valid addresses (some zero-padded, some with a port or a CIDR prefix): every address replaced, every other character byte-identical.
5. **Interaction review found no new gap, and confirmed an old one.** The IP rule never leaves a remainder of an EMAIL address (the EMAIL span contains it and wins). The one real problem is the **partial overlap with a PHONE span** (`Tel +44 20 192.168.1.1`, derived from the PHONE rules), which is the already recorded SSN O3 and is now also L9 here.
6. **Cross-check.** The detector was run over every backtick-quoted cell of the PHONE, EMAIL, CREDIT_CARD and SSN test tables (1,437 strings). It matched exactly six, all real IPv4 addresses or address-shaped numeric domains (§7).

### Checks

1. **Review checklist** against the brief:

| Requirement | Covered by |
|---|---|
| IPv4 addresses detected | §5.1; series IP (50), IA (25) |
| IPv6 not required | §1.2, L5, IL13 |
| Different formats of the same entity | Zero-padded, port, CIDR, URL, brackets, ranges, lists, JSON, log lines, hostnames (IP12-IP50) |
| False positives (ordinary numbers that resemble addresses) | IF-series (62), IG-series (24), IN-series (43), §5.2, §5.3 |
| Version strings (`Version 1.2.3.4`) | IN01-IN43, IC01, IC02, O1 |
| Port, CIDR, `1.2.3.4.5` guards | IP21, IP22, IF08-IF11, §5.2 |
| EMAIL owns the bracketed literal `john@[192.168.1.1]` | §7, IC14 |
| Multiple occurrences | IP26-IP31, IS01-IS05, IS11 |
| Overlaps and duplicate replacement | D9; fuzz invariant: spans sorted and non-overlapping; §7 for other entities |
| Punctuation, line breaks, Unicode | IP32-IP36, IP44, IP45, IS09, IF19-IF25, §6 |
| Missing / empty input | detector-level: empty string yields no spans (IF53); `null` / non-string belong to the service layer |
| "Must not silently corrupt unrelated text" | fuzz invariant: rebuilding from untouched slices equals the output; recall test checks surroundings exactly (IC18) |
| Document limitations | §8 (10 entries) |

2. **Fuzzing with an independent re-implementation:** 80,000 random strings built from digits, dots, commas, slashes, colons, spaces, newlines, tabs, hyphens and en dashes, letters in several scripts, `_ + # $ @`, quotes, brackets, emoji, NBSP, zero-width and right-to-left marks, combining marks, Arabic-Indic and fullwidth digits, fullwidth and ideographic dots, superscripts, Roman numerals, an astral letter, version / section / filler words, and address-shaped fragments with random flaws (octets above 255, zero-padded octets, four- and five-digit groups, three to six groups, odd separators, ports and prefixes). 10,042 inputs contained a match. **0 exceptions; 0 invariant failures** (every span in range, sorted, non-overlapping, strictly of the shape `d{1,3}.d{1,3}.d{1,3}.d{1,3}` with every octet at most 255, and rebuilding the output from untouched slices equals the real output). **Differential check:** every input was also run through a separately written finder (one regular expression with look-around guards, the value rule, and a token-based negative-context check): **0 differences**. The same finder also passes all 225 matrix rows. **Idempotence probe:** 0 of 80,000 outputs changed when processed again.
3. **Recall test:** 30,000 generated texts with 1-4 valid addresses each (**74,741 addresses**: random octets, 15% zero-padded, 20% with a port, 15% with a CIDR prefix), embedded between words (Latin, accented, Cyrillic, CJK, symbols) and gaps (space, comma, semicolon, newline, CRLF, tab, brackets, quotes, pipe, slash, colon, hyphen, dot, em dash, emoji, NBSP, zero-width space, `=`, `&`, `?`, `!`). **0 failures.**
4. **Mutation check:** fifty-five deliberate weakenings of the rules; **every one made tests fail**:

| Mutation | Tests that fail |
|---|---|
| M1: drop left digit guard (start inside a longer number) | 105 (IP01, IP02, IP03, IP06, IP07, IP08, …) |
| M2: drop left letter guard | 7 (IF15, IF16, IF21, IL05, IG04, IG06, …) |
| M3: drop right letter guard | 5 (IF14, IF22, IL06, IG05, IG21) |
| M4: drop left non-ASCII-number guard | 2 (IF24, IG23) |
| M5: drop right non-ASCII-number guard | 3 (IF23, IF25, IG11) |
| M6: drop left underscore guard | 2 (IF18, IG17) |
| M7: drop right underscore guard | 2 (IF17, IG18) |
| M8: drop left combining-mark guard | 1 (IF20) |
| M9: drop right combining-mark guard | 1 (IF19) |
| M10: drop left dot-continuation guard | 12 (IF08, IF09, IF10, IF11, IF55, IF56, …) |
| M11: drop right dot-continuation guard | 13 (IF08, IF09, IF10, IF11, IF52, IF55, …) |
| M12: allow octets longer than 3 digits | 2 (IF58, IF59) |
| M13: no 0-255 range check | 10 (IF01, IF02, IF03, IF04, IF05, IF61, …) |
| M14: reject leading zeros (strict inet_pton) | 3 (IP12, IP13, IL10) |
| M15: accept three groups | 15 (IF06, IF07, IF29, IF30, IF31, IF32, …) |
| M16: accept fullwidth and ideographic full stops | 2 (IF34, IF35) |
| M17: a hyphen next to a digit blocks the match | 1 (IP26) |
| M18: a slash next to a digit blocks the match | 5 (IP22, IP29, IP49, IA20, IA21) |
| M19: a colon next to a digit blocks the match | 4 (IP21, IP24, IP46, IP48) |
| M20: span includes the port | 4 (IP21, IP24, IP46, IP48) |
| M21: span includes the CIDR prefix | 5 (IP22, IP29, IP49, IA20, IA21) |
| M22: guards read UTF-16 units, not code points | 2 (IF21, IF22) |
| M23: no negative context at all | 36 (IN01, IN02, IN03, IN04, IN05, IN06, …) |
| M24: context may cross a line break | 1 (IN16) |
| M25: keyword may sit inside another word | 1 (IN19) |
| M26: no filler words | 6 (IN03, IN24, IN25, IN36, IN37, IN38) |
| M27: keywords are case-sensitive | 29 (IN01, IN03, IN05, IN08, IN10, IN11, …) |
| M28: only a plain space between keyword and number | 10 (IN02, IN07, IN17, IN21, IN22, IN23, …) |
| M29: keyword anywhere in the look-back window, not directly before | 5 (IN15, IN20, IN26, IN27, IL11) |
| M30: look-back window of 10 characters | 5 (IN03, IN25, IN36, IN37, IN38) |
| M31: drop keyword `version` | 16 (IN01, IN02, IN03, IN14, IN15, IN17, …) |
| M32: drop keyword `versions` | 2 (IN27, IN29) |
| M33: drop keyword `ver` | 1 (IN04) |
| M34: drop keyword `release` | 1 (IN05) |
| M35: drop keyword `build` | 1 (IN06) |
| M36: drop keyword `rev` | 1 (IN07) |
| M37: drop keyword `revision` | 1 (IN08) |
| M38: drop keyword `section` | 1 (IN09) |
| M39: drop keyword `sec` | 1 (IN30) |
| M40: drop keyword `clause` | 1 (IN31) |
| M41: drop keyword `chapter` | 1 (IN10) |
| M42: drop keyword `figure` | 1 (IN11) |
| M43: drop keyword `fig` | 1 (IN32) |
| M44: drop keyword `table` | 2 (IN12, IL15) |
| M45: drop keyword `step` | 1 (IN13) |
| M46: drop keyword `item` | 1 (IN24) |
| M47: drop keyword `article` | 1 (IN33) |
| M48: drop keyword `paragraph` | 1 (IN34) |
| M49: drop keyword `para` | 1 (IN35) |
| M50: drop filler `number` | 1 (IN03) |
| M51: drop filler `no` | 2 (IN24, IN38) |
| M52: drop filler `num` | 1 (IN36) |
| M53: drop filler `nr` | 1 (IN37) |
| M54: drop filler `is` | 1 (IN03) |
| M55: drop filler `of` | 1 (IN25) |

5. **Performance / pathological input** (200-400 KB each): worst case **≈78 ms**; no catastrophic backtracking. The scan reads at most about 15 characters per start position, and the negative-context check looks at a 40-character window, so it is linear.

| Input (≈ size) | Time | Spans |
|---|---|---|
| 300000 digits in one run (300 KB) | 11 ms | 0 |
| 1.1.1.1 repeated (35000) (280 KB) | 40 ms | 35000 |
| valid addresses on separate lines (25000) (300 KB) | 37 ms | 25000 |
| 1.1.1.1.1.1... (100000 groups) (200 KB) | 44 ms | 0 |
| five-group chains (40000) (400 KB) | 78 ms | 0 |
| octet 999 (30000) (320 KB) | 24 ms | 0 |
| version + address on one line (20000) (320 KB) | 28 ms | 0 |
| keyword and filler loops: "version no is of " x 15000 then address (255 KB) | 6 ms | 0 |
| many spaces then address (300 KB) | 5 ms | 1 |
| dots only (300000) (300 KB) | 5 ms | 0 |
| letters glued (25000) (325 KB) | 18 ms | 0 |
| astral letters glued (20000) (320 KB) | 21 ms | 0 |
| addresses with ports and CIDR (20000) (300 KB) | 41 ms | 24000 |
| digit-dot alternating without a valid address (325 KB) | 34 ms | 0 |

6. **Claim check (series IC):** every concrete behaviour claimed in this document that was not already a matrix row was executed (23 cases above).
7. **Cross-check against the other detectors' tables:** 1,437 strings, 6 matched (§7).

### Final numbers

| Check | Result |
|---|---|
| Matrix | 225 / 225 (IP 50, IF 62, IN 38, IS 11, IL 15, IA 25, IG 24); 5 rows added later (IN39-IN43, see the end of §10) |
| Claim checks | 23 executed, behaviour as documented |
| Mutation check | 55 / 55 mutants detected |
| Fuzz with independent re-implementation | 80,000 inputs: 0 exceptions, 0 invariant failures, 0 differences, 0 non-idempotent |
| Recall test | 30,000 generated texts (74,741 addresses): 0 failures |
| Cross-check with PHONE, EMAIL, CREDIT_CARD and SSN tables | 1,437 strings, 6 matched, all real IPv4 addresses |
| Worst-case time | ≈78 ms on 200-400 KB pathological input |

### Changed after the first implementation

- **D5 / §5.3:** the negative context applies only when all four octets are below 100. IN28 changed (`Version 192.168.1.1` is now redacted) and IN39-IN43 were added. A reference implementation of the new rule confirmed that IN28 is the only existing IP row whose result changes. Changed after implementation; executed by the TypeScript tests.

### Not verified

- **How often real text has an address right after a version or section word, or a version number elsewhere.** The negative keyword list is a judgement, not derived from a corpus (L7, L10).
- **Integration with the other five detectors.** Only the cross-check above was possible, because their implementations do not exist yet. The integration tests must cover §7, in particular: `john@[192.168.1.1]` and `192.168.1.1@example.com` with EMAIL enabled, and a phone number with an address-shaped tail (`Tel +44 20 192.168.1.1`, derived from the PHONE rules, not executed).

---

## 11. Notes for the TypeScript implementation

- One detector object: `{ type: "IP_ADDRESS", find(text): Span[] }`.
- Keep the **negative keywords**, the **filler words**, the **separator characters**, the **look-back window (40)** and the **guard character classes** as **data constants**. O1 (shorten or empty the keyword list), O2 (reject leading zeros) and O3 (add a skip list) are then small changes.
- The look-around regular expression used as the verification oracle is short and passed the whole matrix and the fuzz run, so it can serve as the implementation (Node 10+ supports look-behind). Apply the value rule and the negative context to each match afterwards:

```ts
const IPV4_RE =
  /(?<![\p{L}\p{N}\p{M}_])(?<![0-9]\.)([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})(?![\p{L}\p{N}\p{M}_])(?!\.[0-9])/gu;
// for each match m:
//   skip if any of m[1]..m[4] is above 255                      (value rule)
//   skip if every octet is below 100 and hasVersionWordBefore(text, m.index)   (negative context, below)
//   span = { type: "IP_ADDRESS", start: m.index, end: m.index + m[0].length }

// hasVersionWordBefore: take the (up to) 40 characters before the match, cut at the last line break;
// then repeat: strip trailing separators ( whitespace : = . # - – ( ) ), read the last word
// ([\p{L}\p{N}]+, lower-cased); if it is a keyword -> true; if it is a filler word -> remove it and
// repeat; otherwise -> false.
```

- *As implemented:* `hasVersionWordBefore` is built with the check shared with PHONE §8.1 (`src/context.ts`): the same loop, but a keyword or filler word is matched case-insensitively by a regular expression and must not be preceded by a letter, mark or digit. It differs from the token-based sketch above only on contrived Unicode input (a combining mark directly before the keyword; the long s `ſ` case-folding to `s`); every §9 row gives the same result.

- Offsets are UTF-16 code-unit indices into the original string, the same indices the replacer uses. The `u` flag makes the look-behind read whole code points, so emoji and astral letters next to an address are handled (IF21, IF22, IP32).
- Spans cannot overlap each other (D9); the shared resolver still sorts and resolves overlaps with other entity types (§7, SSN O3).
- Unit tests: build them directly from the §9 tables (every row has an input and an exact expected output).
