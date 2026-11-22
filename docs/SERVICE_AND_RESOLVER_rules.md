# Resolver and service-layer rules

**Scope:** everything between the six detectors and the caller: input validation, default entities, overlap resolution, replacement, counts, and the REST wrapper. | **Spec version:** 1.0
**Status:** rules complete. The resolver, replacer and validation tables in §8 were **executed** with a throwaway JavaScript sketch (§9). The integration table (§8.5) is **derived from the six detector documents and not executed**, because no detector code exists yet; it becomes an executed test once the TypeScript implementation exists.
**Decisions:** S1-S12 below are settled; each is a single constant or a few lines of code, so it can be changed.

---

## 0. Summary (read this first)

- **One public function:** `deidentify(text, entities?)` returns `{ deidentifiedText, entitiesDetected }`. The REST endpoint `POST /deidentify` is a thin wrapper around it.
- **Pipeline:** validate → detect (every enabled detector scans the **original** text) → resolve overlaps → replace (one pass) → report counts.
- **Default entities:** when `entities` is missing or `null`, **all six** types are used (S1).
- **Overlap rule (union):** when spans of different types overlap, the **union** of the overlapping spans is replaced **once**, with the placeholder of the **highest-priority** type among them. Priority: `CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE`. Nothing of any detected value is left behind, and no character is replaced twice (§4).
- **Counts** are taken **after** resolution: a merged region counts once, for its winning type. Types with zero matches are omitted (S6).
- **Errors** are explicit: bad `text`, bad `entities`, unknown entity names and an empty list are rejected with a clear error code (HTTP 400), never silently ignored (§3).
- **Unrelated text is never touched:** the replacer copies the original text between spans unchanged (§5).

---

## 1. Scope

| In scope | Out of scope |
|---|---|
| Validation of `text` and `entities` | Detection rules (one document per entity) |
| Default entity list | Name detection (stretch goal) |
| Running the enabled detectors | Batch processing, configuration files (stretch goals) |
| Overlap resolution across entity types | Authentication, rate limiting, persistence, deployment |
| Replacement and counts | |
| REST wrapper `POST /deidentify`, `GET /health`, error responses | |

---

## 2. Decisions

| # | Topic | Decision | Reason |
|---|---|---|---|
| S1 | `entities` missing or `null` | Use **all six** types | The safest default for a privacy tool: a caller who forgets the list still gets full redaction |
| S2 | `text` is `""` | Valid: return `""` and `{}` | An empty record is legitimate data in a dataset |
| S3 | Unknown entity name (`"PASSPORT"`) | Error `UNKNOWN_ENTITY` (HTTP 400) | Silently ignoring a typo (`"EMIAL"`) would leak the data the caller meant to remove |
| S4 | `entities` is `[]` | Error `EMPTY_ENTITIES` (HTTP 400) | An empty list would return the text unredacted; that is almost certainly a caller bug |
| S5 | Case of entity names | Case-insensitive (`"email"` = `"EMAIL"`); duplicates are ignored; **no trimming** (`" EMAIL"` is unknown) | Friendly for callers without guessing |
| S6 | Types with zero matches | Omitted from `entitiesDetected` | Matches the brief's example |
| S7 | `text` missing, `null`, or not a string | Error `INVALID_TEXT` (HTTP 400) | Never coerce: `String(42)` or `String(null)` would invent data |
| S8 | Overlaps across types | **Union** of overlapping spans, labelled with the highest-priority type (§4) | Dropping the lower-priority span whole left identifying fragments behind (`john.123-45-6789@example.com` → `john.[SSN]@example.com`). Union leaves nothing behind |
| S9 | Order of keys in `entitiesDetected` | Fixed order `EMAIL, PHONE, SSN, DATE_OF_BIRTH, CREDIT_CARD, IP_ADDRESS` (the brief's order) | Stable, readable output; tests compare objects, so order does not affect them |
| S10 | Extra fields in the request body | Ignored | Forward compatible |
| S11 | Body size limit (REST only) | 1 MB; larger bodies get HTTP 413 | Every detector is linear, but a limit protects the demo server |
| S12 | Detection input | Every detector scans the **original** text, never another detector's output | Detectors stay independent; also avoids the DATE_OF_BIRTH placeholder effect (DATE_OF_BIRTH L15) |

---

## 3. Validation (stage 1)

The function `deidentify(text, entities?)` and the REST handler apply the same rules, in this order. The first failing rule decides the error.

| Rule | Condition | Error code | HTTP |
|---|---|---|---|
| V0 | (REST only) body is not valid JSON | `INVALID_JSON` | 400 |
| V0a | (REST only, `POST /deidentify` and `POST /deidentify/batch`) a `Content-Type` header is present and is not JSON (`application/json`, with or without parameters such as `; charset=utf-8`). Checked before the body is read. A request with **no** `Content-Type` is not refused here; it gets `INVALID_BODY` (V1). Added after implementation. | `UNSUPPORTED_MEDIA_TYPE` (message: `Content-Type must be application/json.`) | 415 |
| V1 | (REST only) body is not a JSON object (an array, string, number, `null`) | `INVALID_BODY` | 400 |
| V2 | `text` is missing, `null` or not a string | `INVALID_TEXT` | 400 |
| V3 | `entities` is present, not `null`, and not an array | `INVALID_ENTITIES` | 400 |
| V4 | `entities` is an empty array | `EMPTY_ENTITIES` | 400 |
| V5 | an element of `entities` is not a string | `INVALID_ENTITIES` | 400 |
| V6 | an element, upper-cased, is not one of the six names | `UNKNOWN_ENTITY` (the message names the value) | 400 |
| V7 | (REST only) body larger than 1 MB | `PAYLOAD_TOO_LARGE` | 413 |

**Error body (REST):** `{ "error": { "code": "UNKNOWN_ENTITY", "message": "Unknown entity type: PASSPORT. Allowed: EMAIL, PHONE, SSN, DATE_OF_BIRTH, CREDIT_CARD, IP_ADDRESS" } }`.
**Function form:** throws a `ValidationError` with the same `code` and `message`.
Unknown routes return HTTP 404 with `{ "error": { "code": "NOT_FOUND", ... } }`. `GET /health` returns `{ "status": "ok", "entities": ["EMAIL", "PHONE", "SSN", "DATE_OF_BIRTH", "CREDIT_CARD", "IP_ADDRESS"] }` (the supported types in `ALL_ENTITY_TYPES` order; the entity list was added after implementation).

---

## 4. Overlap resolution (stage 3)

**Input:** all spans from all enabled detectors, each `{ type, start, end }` (UTF-16 offsets into the original text, `start < end`). Extra fields (PHONE's `tier`, `rule`) are ignored.

**Algorithm:**

1. Copy the list (never mutate the input). Sort by `start` ascending, then `end` descending, then priority (higher first).
2. Walk the sorted list, keeping a list of output regions. For each span:
   - if it **overlaps** the last output region (`span.start < region.end`), extend the region (`region.end = max(region.end, span.end)`) and, if the span's type has higher priority, the region takes the span's type;
   - otherwise start a new region.
3. Return the regions.

**Definitions:** two spans overlap when they share at least one character. Spans that only **touch** (`a.end === b.start`) are **not** merged: each is replaced separately (`[EMAIL][PHONE]`).

**Priority table** (data constant): `CREDIT_CARD` 1, `SSN` 2, `EMAIL` 3, `IP_ADDRESS` 4, `DATE_OF_BIRTH` 5, `PHONE` 6.

**Properties (checked by fuzzing, §9):** the output is sorted and non-overlapping; it covers exactly the characters covered by the input spans; each region carries the highest-priority type among the spans inside it.

**What changes compared with the earlier "drop the lower span" rule** (affects SSN O3 / L12, IP_ADDRESS L9, CREDIT_CARD O1 / L8; those documents now point here):

| Input (all six enabled) | Earlier rule | Union rule |
|---|---|---|
| `john.123-45-6789@example.com` | `john.[SSN]@example.com` | `[SSN]` |
| `123-45-6789@example.com` | `[SSN]@example.com` | `[SSN]` |
| `4111111111111111@example.com` | `[CREDIT_CARD]@example.com` | `[CREDIT_CARD]` |
| `+62 812 123-45-6789` | `+62 812 [SSN]` | `[SSN]` |
| `Tel +44 20 192.168.1.1` | `Tel +44 20 [IP_ADDRESS]` | `Tel [IP_ADDRESS]` |

Accepted cost: the placeholder names only the most sensitive type in a merged region (an email address that contains an SSN becomes `[SSN]`, not `[EMAIL]`), and the count records one `SSN`, not one of each.

---

## 5. Replacement (stage 4)

One pass over the resolved regions, left to right: append the original text from the previous region's end to this region's start, then `[TYPE]`; finally append the rest of the text. Nothing else is changed: no trimming, no normalisation, no case change. Because offsets are UTF-16 code units and JavaScript strings are UTF-16, `text.slice(start, end)` is exact, including emoji and CRLF.

Placeholders are exactly `[EMAIL]`, `[PHONE]`, `[SSN]`, `[DATE_OF_BIRTH]`, `[CREDIT_CARD]`, `[IP_ADDRESS]`.

---

## 6. Report (stage 5)

`entitiesDetected` maps each type to the number of **resolved** regions of that type; zero counts are omitted (S6); keys follow S9. Example: `{ "EMAIL": 1, "PHONE": 1 }`.

---

## 7. REST contract

```
POST /deidentify
Content-Type: application/json

{ "text": "Contact john.doe@example.com at +1-415-555-0134", "entities": ["EMAIL", "PHONE"] }

200 OK
{ "deidentifiedText": "Contact [EMAIL] at [PHONE]", "entitiesDetected": { "EMAIL": 1, "PHONE": 1 } }
```

`entities` is optional (S1). Errors: §3. The server never logs request bodies (the input is sensitive).

---

## 8. Test tables

Legend (same as the detector documents): `⏎` = newline, `\r⏎` = CRLF, `⇥` = tab, *(empty)* = the empty string.

### 8.1 RS-series: resolver (synthetic spans; executed)

`S(type, start, end)` is a span.

| ID | Input spans | Output regions | Why |
|---|---|---|---|
| RS01 | none | none | Empty input |
| RS02 | `S(PHONE,10,20)`, `S(EMAIL,0,5)` | `S(EMAIL,0,5)`, `S(PHONE,10,20)` | Disjoint spans are kept and sorted |
| RS03 | `S(EMAIL,0,5)`, `S(PHONE,5,9)` | `S(EMAIL,0,5)`, `S(PHONE,5,9)` | Touching spans are not merged |
| RS04 | `S(PHONE,7,22)`, `S(CREDIT_CARD,7,22)` | `S(CREDIT_CARD,7,22)` | Identical spans: higher priority wins |
| RS05 | `S(EMAIL,0,23)`, `S(SSN,0,11)` | `S(SSN,0,23)` | Union; the higher-priority inner type labels it |
| RS06 | `S(EMAIL,0,18)`, `S(IP_ADDRESS,6,17)` | `S(EMAIL,0,18)` | Inner lower-priority span disappears into the outer one |
| RS07 | `S(PHONE,4,22)`, `S(IP_ADDRESS,11,22)` | `S(IP_ADDRESS,4,22)` | Partial overlap: union |
| RS08 | `S(PHONE,0,10)`, `S(DATE_OF_BIRTH,8,15)`, `S(EMAIL,14,30)` | `S(EMAIL,0,30)` | A chain of overlaps becomes one region |
| RS09 | `S(SSN,3,14)`, `S(SSN,3,14)` | `S(SSN,3,14)` | Duplicates collapse |
| RS10 | `S(PHONE,0,5)`, `S(SSN,3,8)` | (input array unchanged afterwards) | The resolver does not mutate its input |

### 8.2 RP-series: replacer (executed)

| ID | Text | Regions | Output |
|---|---|---|---|
| RP01 | `Contact a@b.co now` | `S(EMAIL,8,14)` | `Contact [EMAIL] now` |
| RP02 | *(empty)* | none | *(empty)* |
| RP03 | `x 😀 a@b.co ⏎` | `S(EMAIL,5,11)` | `x 😀 [EMAIL] ⏎` (the emoji is 2 code units) |
| RP04 | `a@b.co\r⏎b@c.de` | `S(EMAIL,0,6)`, `S(EMAIL,8,14)` | `[EMAIL]\r⏎[EMAIL]` |
| RP05 | `ab` | `S(SSN,0,1)`, `S(SSN,1,2)` | `[SSN][SSN]` |

Counts check: regions `PHONE, EMAIL, PHONE` → `{ "EMAIL": 1, "PHONE": 2 }`.

### 8.3 SV-series: validation (executed)

| ID | Request body | Result |
|---|---|---|
| SV01 | `{"text":"hi"}` | entities = all six |
| SV02 | `{"text":"","entities":["EMAIL"]}` | valid; output `""`, `{}` |
| SV03 | `{"text":"hi","entities":null}` | entities = all six |
| SV04 | `{"text":"hi","entities":["email","Phone"]}` | entities = `EMAIL, PHONE` |
| SV05 | `{"text":"hi","entities":["EMAIL","email"]}` | entities = `EMAIL` |
| SV06 | `{}` | `INVALID_TEXT` |
| SV07 | `{"text":null}` | `INVALID_TEXT` |
| SV08 | `{"text":42}` | `INVALID_TEXT` |
| SV09 | `{"text":["a"]}` | `INVALID_TEXT` |
| SV10 | `{"text":"hi","entities":[]}` | `EMPTY_ENTITIES` |
| SV11 | `{"text":"hi","entities":"EMAIL"}` | `INVALID_ENTITIES` |
| SV12 | `{"text":"hi","entities":["EMAIL",3]}` | `INVALID_ENTITIES` |
| SV13 | `{"text":"hi","entities":["PASSPORT"]}` | `UNKNOWN_ENTITY` (message names `PASSPORT`) |
| SV14 | `{"text":"hi","entities":[" EMAIL"]}` | `UNKNOWN_ENTITY` (no trimming) |
| SV15 | `[1,2]` | `INVALID_BODY` |
| SV16 | `"just a string"` | `INVALID_BODY` |
| SV17 | `{"text":"hi","entities":["EMAIL"],"extra":true}` | valid; `extra` ignored |

REST-only (to execute against the server): malformed JSON `{"text":` → 400 `INVALID_JSON`; a body over 1 MB → 413 `PAYLOAD_TOO_LARGE`; `GET /nope` → 404 `NOT_FOUND`; `GET /health` → 200 `{"status":"ok","entities":[...the six types...]}`.

### 8.4 SE-series: service end-to-end (to execute once detectors exist)

| ID | Text | Entities | deidentifiedText | entitiesDetected |
|---|---|---|---|---|
| SE01 | `Patient John Doe can be contacted at john.doe@example.com or +1-415-555-0134. DOB: 1990-05-12.` | (default) | `Patient John Doe can be contacted at [EMAIL] or [PHONE]. DOB: [DATE_OF_BIRTH].` | `{EMAIL:1, PHONE:1, DATE_OF_BIRTH:1}` |
| SE02 | `Contact john.doe@example.com at +1-415-555-0134` | `EMAIL, PHONE` | `Contact [EMAIL] at [PHONE]` | `{EMAIL:1, PHONE:1}` |
| SE03 | `John Doe paid +1500000 with card 4111 1111 1111 1111 003 and can be contacted at john.doe@example.com or +91-415-555-0134. DOB: 1990-05-12.` | (default) | `John Doe paid +1500000 with card [CREDIT_CARD] and can be contacted at [EMAIL] or [PHONE]. DOB: [DATE_OF_BIRTH].` | `{EMAIL:1, PHONE:1, DATE_OF_BIRTH:1, CREDIT_CARD:1}` |
| SE04 | same as SE01 | `EMAIL` | `Patient John Doe can be contacted at [EMAIL] or +1-415-555-0134. DOB: 1990-05-12.` | `{EMAIL:1}` |
| SE05 | `a@b.co, a@b.co and a@b.co` | (default) | `[EMAIL], [EMAIL] and [EMAIL]` | `{EMAIL:3}` |
| SE06 | `Order 4155550134 shipped` | (default) | unchanged | `{}` |
| SE07 | *(empty)* | (default) | *(empty)* | `{}` |
| SE08 | `Zoë 😀⏎SSN: 123-45-6789\r⏎IP 10.0.0.1.` | (default) | `Zoë 😀⏎SSN: [SSN]\r⏎IP [IP_ADDRESS].` | `{SSN:1, IP_ADDRESS:1}` |

### 8.5 SI-series: cross-entity integration, all six enabled (derived, not executed)

Each expected value is derived from the detector documents named in the last column plus §4. When the implementation disagrees, **first** check that detector against its own tables; change an expected value here only with a reason written in the test.

| ID | Text | deidentifiedText | Derived from |
|---|---|---|---|
| SI01 | `Phone: 378282246310005` | `Phone: [CREDIT_CARD]` | PHONE C14, CREDIT_CARD §7 |
| SI02 | `Phone: 4111111111111111` | `Phone: [CREDIT_CARD]` | PHONE C15, CREDIT_CARD §7 |
| SI03 | `+919876543210` | `[PHONE]` | CREDIT_CARD CF09 (`+` guard) |
| SI04 | `415-555-0134@example.com` | `[EMAIL]` | EMAIL §7, PHONE §10.2 |
| SI05 | `Phone: 123-45-6789` | `Phone: [SSN]` | PHONE F46, SSN SL11 |
| SI06 | `123-45-6789@example.com` | `[SSN]` | SSN SL10, EMAIL local part rules, §4 union |
| SI07 | `john.123-45-6789@example.com` | `[SSN]` | SSN SC14, §4 union |
| SI08 | `4111111111111111@example.com` | `[CREDIT_CARD]` | CREDIT_CARD §7 and O1, §4 union |
| SI09 | `john@[192.168.1.1]` | `[EMAIL]` | EMAIL EM19, IP_ADDRESS IC14 |
| SI10 | `192.168.1.1@example.com` | `[EMAIL]` | IP_ADDRESS IC15, EMAIL §5.1 |
| SI11 | `email@123.123.123.123` | `email@[IP_ADDRESS]` | EMAIL EG01, IP_ADDRESS IC16 |
| SI12 | `Version 1.2.3.4` | unchanged | IP_ADDRESS IN01, PHONE F06, CREDIT_CARD CF28 |
| SI13 | `Phone: 192.168.1.100` | `Phone: [IP_ADDRESS]` | PHONE F47 |
| SI14 | `DOB: 1990-05-12, Phone: 415-555-0134` | `DOB: [DATE_OF_BIRTH], Phone: [PHONE]` | PHONE C08, DATE_OF_BIRTH DP |
| SI15 | `4111 1111 1111 1111 123-45-6789` | `[CREDIT_CARD] [SSN]` | CREDIT_CARD §4 windows (the 16-digit window passes Luhn; the 19-digit one does not), SSN §5.3 |
| SI16 | `+62 812 123-45-6789` | `[SSN]` | PHONE R1 (+62, 12 national digits), SSN, §4 union |
| SI17 | `Tel +44 20 192.168.1.1` | `Tel [IP_ADDRESS]` | PHONE R1 (+44, 10 national digits, dot separators), IP_ADDRESS IC17, §4 union |
| SI18 | `dob-05/12/1990@example.com` | `dob-[EMAIL]` | `/` is not a local-part character, so the EMAIL span is `1990@example.com` (EMAIL C12); the DOB span `05/12/1990` (label `dob-`) overlaps it; §4 union gives one `[EMAIL]` region and `dob-` stays. Corrects the vaguer "EMAIL wins" in DATE_OF_BIRTH §7 |

---

## 9. Verification log

- **Executed:** RS01-RS10, RP01-RP05, the counts check and SV01-SV17 with a throwaway JavaScript sketch of the resolver, replacer, counter and validator: **33 / 33** pass.
- **Fuzzing of the resolver:** 80,000 random span sets (0-7 spans, random types, overlapping and touching): **0 invariant failures** (output sorted and non-overlapping; covered characters identical to the input's; every region labelled with the highest-priority type among the spans inside it).
- **Not executed:** SE01-SE08 and SI01-SI18 need the six detectors; they become unit tests of the TypeScript implementation. SI15's card windows were checked by computing Luhn for every start-anchored window (only the 16-digit one passes).
- **Not verified:** the REST-only cases (malformed JSON, 1 MB limit, 404, health); they are tests for the Express wrapper.
