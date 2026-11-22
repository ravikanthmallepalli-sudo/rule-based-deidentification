# Rule-Based Text De-identification Service

![CI](https://github.com/ravikanthmallepalli-sudo/rule-based-deidentification/actions/workflows/ci.yml/badge.svg)

A small Node.js + TypeScript service that finds emails, phone numbers, SSNs, dates of birth, credit card numbers and IPv4 addresses in free-form text, using **regular expressions and hand-written validation only**, and replaces each one with a placeholder such as `[EMAIL]`.

```text
Input:  Patient John Doe can be contacted at john.doe@example.com or +1-415-555-0134. DOB: 1990-05-12.
Output: Patient John Doe can be contacted at [EMAIL] or [PHONE]. DOB: [DATE_OF_BIRTH].
```

## What it does and why

Teams that want to share a dataset with a downstream AI system first need to remove sensitive values from free-form text. This service is that cleaning step:

- **Six entity types**, each with its own documented rule set (see [Supported entities](#supported-entities)).
- **No external services, no PII libraries, no models, no network calls.** Input text never leaves the process. The only runtime dependency is `express`.
- **Unrelated text is never changed.** Only the detected values are replaced; every other character (punctuation, line breaks, emoji, accents) is copied exactly.
- **Counts per type** are returned with the text.

> **Scope statement.** The output is **de-identified for the six supported types only**. Names, addresses and other personal details stay in the text (in the example above, `John Doe` is left alone on purpose, as in the brief). Do not describe the output as anonymized.

## Prerequisites

- Node.js **20 or later** (CI uses the version in [`.nvmrc`](.nvmrc), currently 22).
- npm (comes with Node.js).

## Quick start

```bash
git clone https://github.com/ravikanthmallepalli-sudo/rule-based-deidentification.git
cd rule-based-deidentification
npm ci            # install the exact dependency versions from package-lock.json
npm test          # run all tests (about 1,880, built from the rule documents)
npm run dev       # start the service on http://localhost:3000 (restarts on changes)
npm run demo      # print before/after for the demo examples
```

Other scripts: `npm run typecheck` (TypeScript check, no output files), `npm run build` (compile to `dist/`), `npm start` (run the compiled server). The port can be changed with `PORT=8080 npm run dev`.

## Project structure

```text
src/
  types.ts          shared contracts: EntityType, Span, Detector, DeidentifyResult
  validate.ts       stage 1: input validation
  detectors/        stage 2: one file per entity type (email, ssn, ...; phone/ is a folder) + index.ts registry
  resolve.ts        stage 3: overlap resolution (union rule)
  replace.ts        stage 4: replacement
  deidentify.ts     the public function: validate -> detect -> resolve -> replace -> report
  data/             every keyword list, limit and table used by the rules (data, not code)
  app.ts, server.ts the REST wrapper (Express)
  context.ts        the "keyword before the value" check shared by PHONE and IP_ADDRESS
  luhn.ts, unicode.ts, errors.ts   small helpers
scripts/demo.ts     the demo
test/               tests; the detector tests read their rows from docs/*.md
docs/               the rule documents (the specification) and DESIGN.md
```

## Usage

### As a function

```ts
import { deidentify } from "./src/deidentify";

deidentify("Contact john.doe@example.com at +1-415-555-0134", ["EMAIL", "PHONE"]);
// { deidentifiedText: "Contact [EMAIL] at [PHONE]", entitiesDetected: { EMAIL: 1, PHONE: 1 } }
```

Invalid input throws a `ValidationError` with a `code` (the same codes as the REST API below).

### REST API

`POST /deidentify` with a JSON body: `text` (required, a string) and `entities` (optional, a list of entity type names, case-insensitive).

```bash
curl -s -X POST http://localhost:3000/deidentify \
  -H 'Content-Type: application/json' \
  -d '{"text":"Contact john.doe@example.com at +1-415-555-0134","entities":["EMAIL","PHONE"]}'
```

```json
{ "deidentifiedText": "Contact [EMAIL] at [PHONE]", "entitiesDetected": { "EMAIL": 1, "PHONE": 1 } }
```

Errors return a JSON body `{ "error": { "code": "...", "message": "..." } }`:

```bash
curl -s -X POST http://localhost:3000/deidentify \
  -H 'Content-Type: application/json' -d '{"text":"hi","entities":["PASSPORT"]}'
# 400 {"error":{"code":"UNKNOWN_ENTITY","message":"Unknown entity type: PASSPORT. Allowed: EMAIL, PHONE, SSN, DATE_OF_BIRTH, CREDIT_CARD, IP_ADDRESS"}}

curl -s -X POST http://localhost:3000/deidentify \
  -H 'Content-Type: application/json' -d '{"entities":["EMAIL"]}'
# 400 {"error":{"code":"INVALID_TEXT","message":"`text` is required and must be a string."}}
```

| Code | HTTP | When |
|---|---|---|
| `INVALID_JSON` | 400 | the body is not valid JSON |
| `INVALID_BODY` | 400 | the body is missing or is not a JSON object |
| `INVALID_TEXT` | 400 | `text` is missing, `null` or not a string (`""` is valid) |
| `INVALID_ENTITIES` | 400 | `entities` is not a list, or holds a non-string |
| `EMPTY_ENTITIES` | 400 | `entities` is `[]` |
| `UNKNOWN_ENTITY` | 400 | a name is not one of the six (no trimming: `" EMAIL"` is unknown) |
| `PAYLOAD_TOO_LARGE` | 413 | the body is larger than 1 MB |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | a `Content-Type` other than `application/json` was sent (no `Content-Type` at all gives `INVALID_BODY`) |
| `NOT_FOUND` | 404 | any other route |
| `INTERNAL_ERROR` | 500 | an unexpected error (the input is never echoed) |

**Batch (stretch goal).** `POST /deidentify/batch` takes `{ "texts": ["...", "..."], "entities": [...] }` (`entities` optional, applied to every text) and returns `{ "results": [ { "deidentifiedText": ..., "entitiesDetected": ... }, ... ] }`, one result per text in the same order. `texts` must be an array of strings (an empty array gives `[]`); otherwise the error code is `INVALID_TEXT`. The 1 MB limit applies to the whole body. The function form is `deidentifyBatch(texts, entities?)`.

```bash
curl -s -X POST http://localhost:3000/deidentify/batch \
  -H 'Content-Type: application/json' \
  -d '{"texts":["Mail a@b.co","Call 4155550134"]}'
# {"results":[{"deidentifiedText":"Mail [EMAIL]","entitiesDetected":{"EMAIL":1}},{"deidentifiedText":"Call [PHONE]","entitiesDetected":{"PHONE":1}}]}
```

`GET /health` returns `{ "status": "ok", "entities": ["EMAIL", "PHONE", "SSN", "DATE_OF_BIRTH", "CREDIT_CARD", "IP_ADDRESS"] }`. The server never logs request text or detected values, only status codes, error codes and counts. Full contract: [`docs/SERVICE_AND_RESOLVER_rules.md`](docs/SERVICE_AND_RESOLVER_rules.md).

### Default entities

When `entities` is omitted (or `null`), **all six types** are used: `EMAIL, PHONE, SSN, DATE_OF_BIRTH, CREDIT_CARD, IP_ADDRESS`. For a privacy tool this is the safest default: a caller who forgets the list still gets full redaction. An unknown name or an empty list is an error rather than being ignored, because silently skipping a typo (`"EMIAL"`) would leak exactly the data the caller meant to remove.

## Supported entities

Each entity has a rule document with the full rules, every limitation (with an example and a reason) and the test tables.

| Entity | Formats covered | Top limitations | Rules |
|---|---|---|---|
| `EMAIL` | `john.doe+tag@sub.example.co.uk`, Unicode names and domains (`用户@例子.广告`), punycode, quoted local parts (`"john doe"@example.com`), IPv4 literals (`john@[192.168.1.1]`); `mailto:`, brackets and a final period stay outside | obfuscated forms (`john (at) example (dot) com`) leak; single-label domains (`user@localhost`) are skipped; the TLD is checked by syntax only, so `john@example.abc` is redacted | [EMAIL](docs/EMAIL_detection_rules.md) |
| `PHONE` | `+` / `00` numbers validated against 206 ITU country codes and per-country lengths (`+91 98765 43210`, `+44 (0)20 7946 0958`, `0044 20 7946 0958`), NANP (`(415) 555-0134`, `415-555-0134`), `(020) 7946 0958`, bare digits **only next to a phone word** (`Call 4155550134`, `My number 4155550134`), extensions (`ext. 22`) | bare numbers without a phone word are not redacted (`Order 4155550134` stays, by design); two numbers joined only by spaces or hyphens are not separated; wrong-length numbers (`+91 98765 4321`) stay | [PHONE](docs/PHONE_detection_rules.md) |
| `SSN` | `123-45-6789` with any of eight dash look-alikes (en dash, minus sign, ...); never-assigned values (area 000/666, group 00, serial 0000) are left alone | an SSN without dashes (`123456789`, `123 45 6789`) leaks; any valid-looking `ddd-dd-dddd` (part or order numbers) is redacted; a number glued to letters (`SSN123-45-6789`) is missed | [SSN](docs/SSN_detection_rules.md) |
| `DATE_OF_BIRTH` | a full date (`1990-05-12`, `05/12/1990`, `12.05.90`, `19900512`, `May 12, 1990`, `12th of May, 1990`, `1990年5月12日`, with an optional time) **with a label** right before it (`DOB:`, `Date of Birth`, `born on`, 32 labels in 13 languages) or in brackets after it (`05/12/1990 (DOB)`), or on the line above when that line ends with a colon (`DOB:⏎05/12/1990`); only the date is replaced | other words between label and date leak (`born in Chicago on 12 May 1990`); month names are English only; a label on another line without a colon leaks (`DOB⏎05/12/1990`, CSV headers) | [DATE_OF_BIRTH](docs/DATE_OF_BIRTH_detection_rules.md) |
| `CREDIT_CARD` | 12-19 digits, bare or grouped by single spaces or hyphens (`4111 1111 1111 1111`, `3782 822463 10005`), believable layout, first digit not 0, not one repeated digit, **Luhn checksum** | a card with a typo fails Luhn and leaks; any Luhn-valid 12-19 digit number (timestamps, ISBNs, IDs: about 1 in 10) is redacted; dots, double spaces and newlines are not separators | [CREDIT_CARD](docs/CREDIT_CARD_detection_rules.md) |
| `IP_ADDRESS` | dotted IPv4, octets 0-255, leading zeros allowed (`192.168.001.001`); ports and CIDR prefixes stay outside (`[IP_ADDRESS]:8080`, `[IP_ADDRESS]/24`); ranges and lists | an address with one invalid octet (`192.168.1.256`) leaks; other notations (defanged `192[.]168[.]1[.]1`, decimal, hex, IPv6) leak; a real address with every octet below 100 right after a version word (`Version 10.0.0.1`) is not redacted (`Version 192.168.1.1` is) | [IP_ADDRESS](docs/IP_ADDRESS_detection_rules.md) |

### Overlapping detections

When detections of different types overlap, the **union** of the overlapping spans is replaced once, with the placeholder of the highest-priority type (`CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE`). Nothing of a detected value is left behind and no character is replaced twice: `john.123-45-6789@example.com` becomes `[SSN]`.

## Design decisions and trade-offs

**Guiding principle.** A missed value leaks personal data; an over-redaction damages the dataset the customer wants to share. So **strong evidence is redacted even when it might be test data** (a validated shape such as a Luhn-valid card or a `ddd-dd-dddd` SSN), and **weak evidence needs context** (a bare 10-digit number is only a phone next to a phone word; a bare date is only a date of birth after a DOB label).

| Decision | Why | Trade-off |
|---|---|---|
| Detection is separate from replacement: detectors only return spans on the original text; one pass replaces them | No index shifts, no detector sees another's placeholders, unrelated text is copied unchanged | Spans are held in memory before replacing (negligible) |
| PHONE: validated `+`/`00` numbers and NANP shapes always; bare digits only next to a phone word | Order and transaction IDs must stay (`Order 4155550134`), real numbers must not (`Call 4155550134`) | A bare number with no phone word leaks |
| CREDIT_CARD: 12-19 digits + Luhn, no card-brand table | Brand ranges change; a stale table leaks real cards | About 1 in 10 Luhn-valid IDs or timestamps is redacted |
| SSN: strict `ddd-dd-dddd`, no context needed | The brief names that format; the shape plus value rules is strong evidence | SSNs without dashes leak; part numbers in that shape are redacted |
| DATE_OF_BIRTH: a full date plus a label (`DOB:`, `born on`, 32 labels in 13 languages); only the date is replaced | A bare date is not a date of birth (`Invoice 2024-05-12` stays) | Other words between label and date leak |
| IP_ADDRESS: a version or section word protects a dotted quad whose octets are all below 100 | `Version 1.2.3.4` must not be corrupted; `Version 192.168.1.1` must be redacted | `Version 10.0.0.1` is not redacted |
| Overlaps: the union of overlapping spans is replaced once, with the highest-priority type | Nothing of a detected value is left behind (`john.123-45-6789@example.com` → `[SSN]`) | The placeholder names only the most sensitive type |
| No Unicode normalisation; offsets are UTF-16, guards read code points | Normalising changes string length and would shift offsets, corrupting unrelated text | Fullwidth and Arabic-Indic digits are not detected |

The full reasoning is in [`docs/DESIGN.md`](docs/DESIGN.md).

## False positives (over-redaction)

These are deliberate: the evidence looks strong, so the safe error is to redact.

| Input | Output | Why |
|---|---|---|
| `ms 1700000000004` | `ms [CREDIT_CARD]` | A timestamp that happens to pass Luhn |
| `Order 123-45-6789 shipped` | `Order [SSN] shipped` | Any valid-looking `ddd-dd-dddd` is treated as an SSN |
| `Mask 255.255.255.0` | `Mask [IP_ADDRESS]` | Netmasks and loopback addresses are not told apart from real addresses |
| `git@github.com:org/repo.git` | `[EMAIL]:org/repo.git` | It has the exact shape of an email address |
| `Happy birthday 12 May 2024!` | `Happy birthday [DATE_OF_BIRTH]!` | `birthday` is a date-of-birth label |
| `+4412345678` | `[PHONE]` | A valid UK country code and length |

## False negatives (what can leak)

Each one is documented, with a reason, in the entity's rule document.

| Input | Why it is not redacted |
|---|---|
| `4155550134` (no phone word nearby) | Bare digit runs need context, or every order ID would be redacted |
| `SSN 123 45 6789`, `SSN 123456789` | Only the hyphenated format is detected |
| `4111 1111 1111 1112` | A mistyped card fails the Luhn check |
| `192.168.1.256` | One invalid octet makes the whole string a non-address |
| `john (at) example (dot) com` | Obfuscated addresses are not decoded |
| `born in Chicago on 12 May 1990` | Other words sit between the label and the date |
| `geboren am 12. Mai 1990` | Month names are English only (numeric dates work in any language) |
| `John Doe`, street addresses | Names and addresses are out of scope: the output is de-identified for the six types only |

## Performance and safety

- Every scan is linear and bounded. The tests feed 300 KB pathological inputs to each detector, and each finishes in under 2 seconds.
- Request bodies are limited to 1 MB (HTTP 413 above that).
- No network calls, no external PII services or libraries; the only runtime dependency is `express`.
- The server never logs request text or detected values, only status codes, error codes and counts. Error messages never echo the text (an unknown entity name is named, so the caller can fix it).

## Possible improvements

- **Strict card mode** with issuer (IIN) ranges, to cut Luhn false positives on IDs and timestamps.
- **Context-gated SSN forms** (`SSN: 123 45 6789`, `SSN: 123456789`), like the phone context gate.
- **CSV column hints** ("column 3 is a phone number"), so labelled columns can be redacted without a context word on the same line.
- **Name detection** after explicit labels (`Patient Name:`), as an opt-in entity.
- **Configurable rules**: keyword lists, labels and limits loaded per dataset.
- **More month-name languages** and a **live IANA TLD list**, both as data.

## How the tests are built

The rule documents in [`docs/`](docs) are the specification, and their test tables **are** the unit tests:

- [`test/helpers/loadCases.ts`](test/helpers/loadCases.ts) reads every table row of a rule document at test time (input, expected output, ID), expanding placeholders such as `⏎` (newline) and `<NBSP>`.
- Each detector test file first asserts the **number of rows per series**, so a parsing bug cannot silently drop rows, then runs one test per row: with only that entity enabled, the output must equal the table's Output cell exactly.
- Five rows document non-default options that are not implemented (SSN SC01, SC02, SC04; IP_ADDRESS IC01, IC03); they are the only skipped tests.
- Hand-written tests cover the resolver, replacer, validation, service examples, cross-entity integration, the REST API, Luhn and the country-code table. [`test/invariants.test.ts`](test/invariants.test.ts) runs seeded random inputs (spans well formed, text outside the replaced regions unchanged) and 300 KB pathological inputs per detector (each under 2 seconds).

## Known data caveats

- **PHONE country codes** come from the ITU list dated **15 December 2016**, and the per-country **length ranges have not been verified** against national regulators ([PHONE L17](docs/PHONE_detection_rules.md)). A code assigned later would be rejected; a range that is too narrow would leave a real number unredacted. Both live in one data file, [`src/data/countryCodes.ts`](src/data/countryCodes.ts).
- **EMAIL file-extension deny list** (`icon@2x.png` is not an address) was checked against a **January 2025 copy** of the IANA top-level-domain list; re-check it against the live list before relying on it ([EMAIL §5.4](docs/EMAIL_detection_rules.md)).
- **DATE_OF_BIRTH labels** in languages other than English were not reviewed by native speakers.

## Further reading

- [`docs/DESIGN.md`](docs/DESIGN.md): design decisions, trade-offs, limitations and possible improvements.
