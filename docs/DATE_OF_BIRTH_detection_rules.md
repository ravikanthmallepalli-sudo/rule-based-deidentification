# DATE_OF_BIRTH detection rules

**Entity:** `DATE_OF_BIRTH` | **Placeholder:** `[DATE_OF_BIRTH]` | **Spec version:** 1.0
**Status:** rules complete and **verified** (see §10). Every example in this document was executed, not just written.
**Basis:** the brief says "dates in explicitly recognizable date-of-birth contexts, such as `DOB: 1990-05-12`", and its example keeps the label and replaces only the date (`DOB: [DATE_OF_BIRTH]`). The task giver gave no extra clarification for this entity, so everything beyond that wording is an explicit decision (§3) or an open question (O1-O3).

---

## 0. Summary (read this first)

- A date becomes `[DATE_OF_BIRTH]` only when **two things are true**: it is written in a **recognised date format**, **and** a **date-of-birth label** (`DOB`, `Date of Birth`, `born on` and similar) sits **directly before it** (or directly after it in brackets, `05/12/1990 (DOB)`). **A bare date is never a date of birth** (`Invoice 2024-05-12` stays).
- **Only the date is replaced; the label stays**: `DOB: 1990-05-12` → `DOB: [DATE_OF_BIRTH]`.
- A **full date is required**: day, month and year. A year alone (`born in 1990`), a month and year, or a day and month are **not** replaced (L2).
- Formats covered: ISO (`1990-05-12`), numeric with a 4-digit or 2-digit year (`05/12/1990`, `12.05.90`), compact `19900512`, **written English months** (`May 12, 1990`, `12th of May, 1990`, `12-MAY-90`), Chinese/Japanese `1990年5月12日` and Korean `1990년 5월 12일`, with an optional **time suffix** that is absorbed (`1990-05-12T00:00:00Z`).
- **Day-first and month-first are both accepted** for an ambiguous numeric date: the detector needs a plausible date, not to know which part is the month (D7).
- **Calendar checks are lenient on purpose:** month 1-12, day 1-31, year 1800-2199. `DOB: 31/04/1990` is still redacted, because a typo in a labelled date must not leak (D8, open decision O2).
- Labels are **data**: 32 entries in English, German, Spanish, French, Portuguese, Italian, Dutch, Russian, Hindi, Chinese, Japanese, Korean and Arabic, written with flexible separators so `date_of_birth`, `dateOfBirth` and `D.O.B.` all match (D2).
- It protects the text around the date: punctuation, brackets, quotes, labels, line breaks, emoji and a sentence-final period stay exactly as written.
- Everything the detector deliberately does **not** do is listed in §8 with an example and a reason. The most important gaps: **other words between the label and the date** leak (`born in Chicago on 12 May 1990`, L1), **non-English month names** leak (L3), and **`birthday` can label a party date** (L8).
- **Three open decisions for you** (O1, O2, O3) are at the end of §3.

> **Honest scope statement.** "Nothing missed" is achievable for the *declared scope* (§1) and the *documented limitations* (§8): every gap is named. No rule-based detector can recognise every way a person writes a birth date; this one recognises the labelled formats listed here and is explicit about the rest.

---

## 1. Scope

### 1.1 In scope

| Kind of date | Handled? | Example |
|---|---|---|
| ISO order `YYYY-MM-DD`, separators `-` `/` `.` and Unicode dashes, 1- or 2-digit month and day | Yes | `1990-05-12`, `1990/5/2` |
| Numeric, 4-digit year last, day-first or month-first | Yes | `05/12/1990`, `31/12/1990`, `12.05.1990` |
| Numeric, 2-digit year last | Yes | `05/12/90`, `12-05-90` |
| Compact 8 digits | Yes | `19900512`, `31121990`, `12311990` |
| Written English month, day-first or month-first, ordinals, `of`, 4- or 2-digit year | Yes | `May 12, 1990`, `12th of May, 1990`, `12-MAY-90`, `Sept. 12, 1990` |
| Chinese / Japanese and Korean dates | Yes | `1990年5月12日`, `1990년 5월 12일` |
| A time after a numeric date | Yes, absorbed (D9) | `1990-05-12T00:00:00Z`, `5/12/1990 12:00:00 AM` |
| Label before the date | Yes | `DOB: 1990-05-12`, `born on 12 May 1990` |
| Label after the date, in brackets | Yes | `05/12/1990 (DOB)`, `1990-05-12 [Date of Birth]` |
| Key names in JSON, CSV-style pairs, tables | Yes | `"dateOfBirth":"1990-05-12"`, `dob=1990-05-12`, `\| DOB \| 05/12/1990 \|` |
| A format hint after the label | Yes | `Date of Birth (MM/DD/YYYY): 05/12/1990` |

### 1.2 Out of scope (see §8 for reasons)

Bare dates with no label, partial dates (year only, month and year, day and month), non-English month names, space-separated numeric dates, era years (`平成2年`), other calendars, weekday names, a label on another line, non-ASCII digits, age in years, and every other entity type.

---

## 2. Terminology used by the rules

| Term | Meaning |
|---|---|
| **Label** | A word or phrase that says "date of birth": `DOB`, `Date of Birth`, `born`, … (§5.5). |
| **Date** | A string in one of the formats of §5.1 that passes the checks of §5.2. |
| **Allowed characters** | The small set of characters that may sit between a label and the date (§5.5). Letters, digits and line breaks are not in it. |
| **Filler word** | One of `is`, `was`, `on`, `the`: may sit between the label and the date (`born on the 12th …`). |
| **Format hint** | A parenthesised hint such as `(MM/DD/YYYY)` or `(dd-mm-yy)` after the label. |
| **Before-context** | A label directly before the date (§5.4). |
| **After-context** | A label in brackets directly after the date (§5.4). |
| **Glue** | A letter, number, combining mark or `_` touching the date. CJK letters are **not** glue (D10). |
| **Span** | `{ type: "DATE_OF_BIRTH", start, end }`, offsets (UTF-16 code units) into the original string. A span covers the date (and an absorbed time) only. |

---

## 3. Design decisions and why

| # | Decision | Reason |
|---|---|---|
| D1 | **Date format and label are both required**, for every format. | The brief: "dates in explicitly recognizable date-of-birth contexts"; a bare date is not a date of birth. |
| D2 | **Labels are data.** Each entry is a list of words joined by 0-2 of these characters: space, tab, NBSP, `_`, `.`, `-`, `/`. Matching is case-insensitive. A label must not start inside a longer word (letters, digits, marks before it); CJK labels are matched without word boundaries. | One entry covers `date of birth`, `Date_Of_Birth`, `dateOfBirth`, `date-of-birth`, `DATEOFBIRTH`. JSON and database field names are the most common place for a date of birth. |
| D3 | **The label must be directly before the date**: label, then only allowed characters, filler words and format hints (§5.4); **or** directly after it as `(label)` / `[label]`, within 40 characters. Same line only, with **one exception**: a label line that ends with a colon may be followed by the date at the start of the next line (`DOB:⏎05/12/1990`, §5.4). | Keeps `Admission date: 05/12/2024, DOB: 01/02/1980` correct: only the second date follows a label. The exception exists because forms print the label and the value on separate lines; the colon is the evidence that a value follows (changed after implementation: before, `DOB:⏎05/12/1990` leaked). Cost: L1, L6, L7. |
| D4 | **Only the date is replaced.** The label stays. | The brief's example output. |
| D5 | **A full date is required** (day, month and year). | "Dates" in the brief; partial dates are weak evidence and the formats are endless. Cost: L2. |
| D6 | Formats: ISO-like, numeric with 4- or 2-digit year, compact 8 digits, written English months, CJK and Korean (§5.1). | The common ways dates are written in forms, records and exports. |
| D7 | **An ambiguous numeric order is accepted in either order.** `05/12/1990` is valid as May 12 and as December 5. | The goal is to hide the date, not to interpret it. |
| D8 | **Lenient calendar:** month 1-12, day 1-31, year 1800-2199 for 4-digit years; no check of month length or leap years; no clock, so results never depend on today's date. | With a label right before it, a date that is slightly wrong (`31/04/1990`) is almost certainly a mistyped date of birth. A leak is worse than an over-redaction. See O2. |
| D9 | **A time after a numeric date is absorbed**: `T` + `hh:mm[:ss[.fraction]]` + optional zone, or a space + time that has seconds or AM/PM. An invalid time is not absorbed. | An exported timestamp is one value; `[DATE_OF_BIRTH]T00:00:00Z` would look broken. `DOB: 1990-05-12 10:30 visit` keeps `10:30` (no seconds, no AM/PM). |
| D10 | **Date guards:** no glue directly before or after the date, and the date may not be the head or tail of a longer number (a separator and a digit next to it). A `T` followed by a digit is allowed after the date (time marker). **CJK letters (Han, Kana, Hangul) are not glue.** | Keeps `x05/12/1990`, `05/12/19900`, `05/12/1990-1991` out. CJK text has no spaces, so `DOB: 05/12/1990です` and `生年月日05/12/1990` must work. |
| D11 | **Month names are English only** (full names and standard abbreviations, with an optional period on abbreviations). Data table. | Keeps the first version small and fully tested. Cost: L3. See O3. |
| D12 | **Labels in other languages are a sample list**, kept as data. | Same approach as the PHONE keywords. |
| D13 | **Filler words** are `is`, `was`, `on`, `the`. Nothing else may sit between the label and the date. | `DOB certificate issued 05/12/1990` must not match. |
| D14 | `birthday`, `bday` and `b-day` are labels (and their German and CJK counterparts). | A full date with a year right after "birthday" is far more often a date of birth than a party date. Cost: L8. See O1. |
| D15 | **ASCII digits only; no Unicode normalisation.** | Normalising shifts offsets. Cost: L12, L13. |
| D16 | **Rank 5** in the priority table: `CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE`. | Agreed global order (§7). |
| D17 | Single pass, left to right; after an accepted date the scan continues after it, so **spans of this detector never overlap**. | Simple and predictable. Re-running is *almost* but not strictly idempotent (L15). |

### Open decisions for you

| # | Question | My recommendation |
|---|---|---|
| O1 | Keep `birthday`, `bday`, `b-day` (and `Geburtstag`, `生日`) as labels? Without them `Birthday: 05/12/1990` leaks; with them `Happy birthday 12 May 2024!` becomes `Happy birthday [DATE_OF_BIRTH]!` (DL test). | Keep them: the safe error for a privacy tool. They are one data entry each, so removing them is trivial. |
| O2 | Strict calendar (reject `31/04/1990`, `29/02/1999`) or lenient (redact them)? Both run the same way; only two checks change. | Lenient (as built). |
| O3 | Add month names in other languages (German, French, Spanish, Portuguese, Italian, …)? | Not now. It is a data table; add it when a real dataset needs it. |

---

## 4. Algorithm

1. **Input:** a string (type/emptiness checks are the service layer's job; an empty string yields no spans).
2. Scan the text from left to right. At every position that can start a date (a digit that does not follow a digit, or an ASCII letter that does not follow a letter), try the date formats in this order and take the **first one that is valid and passes the guards** (§5.1-§5.3): CJK, Korean, ISO-like, numeric with 4-digit year, numeric with 2-digit year, compact, day-first written, month-first written.
3. For numeric formats, **absorb a time suffix** (D9) when one follows; if the guards fail with the time, try again without it.
4. **Context check** (§5.4): accept the date only if a label stands directly before it or, in brackets, directly after it.
5. Emit `{ type: "DATE_OF_BIRTH", start, end }` for the date (and absorbed time) and **continue after it**.
6. Detection never edits text. The replacer (a separate module) copies untouched text between spans and inserts `[DATE_OF_BIRTH]`.

### Constants

| Constant | Value |
|---|---|
| Year range (4-digit years) | 1800-2199 |
| Month / day | 1-12 / 1-31 |
| Look-back window for the before-context | 80 characters |
| Look-ahead window for the after-context | 40 characters |
| Filler words | `is` `was` `on` `the` |
| Separators inside a numeric date | `-` `/` `.` and U+2010-U+2015, U+2212 (each separator chosen independently) |
| Separators between label words | 0-2 of: space, tab, NBSP, `_`, `.`, `-`, `/` |
| Allowed characters between label and date | 28 characters, listed in §5.5 |

---

## 5. Rule specifications

### 5.1 Date formats (D5-D7, D11)

| Format | Shape | Example |
|---|---|---|
| ISO-like | `YYYY S M S D`: 4-digit year, then month and day of 1-2 digits | `1990-05-12`, `1990/5/2`, `1990.05.12` |
| Numeric, 4-digit year | `A S B S YYYY`: `A` and `B` have 1-2 digits and are a month and a day in **either** order | `05/12/1990`, `31/12/1990`, `12.05.1990` |
| Numeric, 2-digit year | `A S B S YY`: exactly two year digits; `A` and `B` as above | `05/12/90`, `12-05-90` |
| Compact | exactly 8 digits, valid as `YYYYMMDD`, `DDMMYYYY` or `MMDDYYYY` | `19900512`, `31121990` |
| Written, day first | `D[st\|nd\|rd\|th]` + separator + optional `of ` + month name + separator + year (4 or 2 digits) | `12 May 1990`, `12th of May, 1990`, `12-MAY-90` |
| Written, month first | month name + separator + `D[st\|nd\|rd\|th]` + separator + year | `May 12, 1990`, `May 12th, 1990`, `Sept. 12, 1990` |
| CJK | `YYYY年M月D日` (optional single spaces) | `1990年5月12日` |
| Korean | `YYYY년 M월 D일` (optional single spaces) | `1990년 5월 12일` |

`S` is one of `- / .` or a Unicode dash (U+2010-U+2015, U+2212). Written-date separators are one or two spaces or NBSP, a hyphen, slash or dot (with an optional space on each side), or a comma (months and years may be separated by `, `). A month name is followed by an optional period only when it is an abbreviation.

The **month names** are the entries of this table (full names and abbreviations):

| Month | Names accepted (case-insensitive) |
|---|---|
| 1. January | `january`, `jan` (also with a period) |
| 2. February | `february`, `feb` (also with a period) |
| 3. March | `march`, `mar` (also with a period) |
| 4. April | `april`, `apr` (also with a period) |
| 5. May | `may` |
| 6. June | `june` (also with a period), `jun` (also with a period) |
| 7. July | `july` (also with a period), `jul` (also with a period) |
| 8. August | `august`, `aug` (also with a period) |
| 9. September | `september`, `sept` (also with a period), `sep` (also with a period) |
| 10. October | `october`, `oct` (also with a period) |
| 11. November | `november`, `nov` (also with a period) |
| 12. December | `december`, `dec` (also with a period) |

### 5.2 Validity (D7, D8)

- **Month** 1-12, **day** 1-31. Month length and leap years are **not** checked.
- **Year** 1800-2199 when written with four digits; a two-digit year is not checked.
- For `A S B S YYYY` and `A S B S YY`: valid if `A` is a month and `B` a day, **or** `B` is a month and `A` a day.
- For compact dates: valid if **any** of the three readings is valid.
- Examples that fail: `13/13/1990`, `00/05/1990`, `32/05/1990`, `1990-13-01`, `1990-05-32`, `1790-05-12`, `2200-05-12`, `12345678`.

### 5.3 Guards (D10)

**Left guard.** The character right before the date must **not** be glue (a letter, number, combining mark or `_`; CJK letters excepted), and must **not** be a date separator (`-` `/` `.` or a Unicode dash) that itself follows a digit (the date would be the tail of a longer number, `1.12/05/1990`).

**Right guard.** The character right after the date (and absorbed time) must **not** be glue (CJK letters excepted), and must **not** be a date separator followed by a digit (`05/12/1990-1991`, `05/12/1990.5`). Exception: a `T` directly followed by a digit is allowed (the start of a time).

A sentence-final period, a comma, a closing bracket or a quote after the date is fine.

### 5.4 Context (D2, D3, D13)

**Before-context.** On the same line, within the 80 characters before the date, the text must **end** with

`LABEL` then zero or more (`allowed characters` + (`filler word` or `format hint`)), then optional `allowed characters`,

and the date starts right after. Any other word, any digit or a line break between the label and the date breaks the context, except in the next-line case below.

**Next-line case (D3 exception).** The look-back may cross **exactly one** line break (`\n` or `\r\n`) when all of these hold:

- the text between the label and the line break consists only of allowed characters **and includes a colon** (`:` or the fullwidth `：`);
- after the line break, only spaces or tabs come before the date (no other characters, no second line break);
- the whole label-to-date stretch fits in the 80-character look-back window.

So `DOB:⏎05/12/1990` and `Date of Birth:\r⏎  1990-05-12` are replaced, but `DOB⏎05/12/1990` (no colon), `name,dob⏎Ann,05/12/1990` (CSV), `DOB:⏎⏎05/12/1990` (two line breaks), `DOB:⏎Ann 05/12/1990` and `DOB: see below⏎05/12/1990` (other words) are not.

- The label must not start inside a longer word (no letter, digit or mark directly before it); this does not apply to CJK labels.
- A **format hint** is `(` + two or three groups of 1-4 letters from `d m y` (any case) separated by space, `/`, `.` or `-` + `)`: `(MM/DD/YYYY)`, `(dd-mm-yy)`, `(yyyy-mm-dd)`.

**After-context.** Within 40 characters after the date: optional spaces, `(` or `[`, optional spaces, a **label**, optional spaces, `)` or `]`. Example: `05/12/1990 (DOB)`.

Examples accepted: `DOB: 1990-05-12`, `born on the 12th of May, 1990`, `"dob": "1990-05-12"`, `Date of Birth (MM/DD/YYYY): 05/12/1990`, `[DOB] 1990-05-12`, `| DOB | 05/12/1990 |`.
Examples rejected: `DOB certificate issued 05/12/1990` (other words), `born in Chicago on 12 May 1990` (other words, L1), `DOB⏎05/12/1990` (line break without a colon), `05/12/1990 (DOB: unknown)` (the after-label must be exactly the label in brackets), `Dobson 05/12/1990` (label inside a word).

### 5.5 Labels, filler words and allowed characters (data)

**Labels** (words are joined by 0-2 separator characters; case-insensitive):

| Language | Labels |
|---|---|
| English | `d o b`, `date of birth`, `birth date`, `born`, `birthday`, `bday`, `b-day` |
| German | `geburtsdatum`, `geboren am`, `geburtstag` |
| Spanish | `fecha de nacimiento`, `nacido el`, `nacida el` |
| French | `date de naissance`, `né le`, `née le` |
| Portuguese | `data de nascimento`, `nascido em`, `nascida em` |
| Italian | `data di nascita`, `nato il`, `nata il` |
| Dutch | `geboortedatum` |
| Russian | `дата рождения`, `родился`, `родилась` |
| Hindi | `जन्म तिथि` |
| Chinese / Japanese | `生年月日`, `出生日期`, `生日` |
| Korean | `생년월일` |
| Arabic | `تاريخ الميلاد` |

Chinese and Japanese labels are matched without word boundaries, so `生年月日` also matches inside `出生年月日`, and `生日` inside `誕生日`; those two longer forms are not separate entries.

**Filler words:** `is`, `was`, `on`, `the`.

**Allowed characters between a label and the date:** space, tab, NBSP, thin space, narrow NBSP, `:`, fullwidth colon, `=`, `.`, `#`, `-`, en dash, em dash, `(`, `)`, `[`, `]`, `"`, `'`, `“`, `”`, `‘`, `’`, `,`, `;`, `/`, `|`, `*`.

---

## 6. Punctuation and layout behaviour

| Situation | Result |
|---|---|
| Sentence end: `Her DOB was 05/12/1990.` | `Her DOB was [DATE_OF_BIRTH].` |
| Brackets, quotes, JSON, markup, Markdown table cells | delimiters stay |
| Label and date on separate lines | replaced only when the label line ends with a colon and the date starts the next line (`DOB:⏎05/12/1990`, §5.4); otherwise **not** replaced (L7) |
| Two labelled dates in one line or on two lines | each replaced separately |
| Another date in the same line, not right after a label | stays (`Admission date: 05/12/2024, DOB: …`) |
| Text glued after a CJK or numeric date (`05/12/1990です`) | stays |
| A time after the date (`1990-05-12T00:00:00Z`, `05/12/1990 12:00:00 AM`) | replaced together with the date |
| Line breaks (`\n`, `\r\n`), tabs, NBSP, emoji, accents, CJK text, zero-width characters | preserved byte for byte |
| Same date repeated | every labelled occurrence replaced; count = number of occurrences |

---

## 7. Interaction with other entities

Agreed priority: **CREDIT_CARD > SSN > EMAIL > IP_ADDRESS > DATE_OF_BIRTH > PHONE**. DATE_OF_BIRTH yields to the first four and outranks PHONE.

| Situation | Result | Note |
|---|---|---|
| `DOB: 1990-05-12`, `DOB: 05/12/1990`, `DOB: 12-05-1990`, `born on 12.05.1990` | date replaced | The PHONE tests already assert that these are not phone numbers (PHONE C08-C11) |
| The brief's example and the task giver's example text | `… or [PHONE]. DOB: [DATE_OF_BIRTH].` | Executed with DATE_OF_BIRTH only (DP09, DP10; §10 cross-check) |
| `DOB: 19900512` | `DOB: [DATE_OF_BIRTH]` | 8 digits with a DOB label; PHONE needs a phone word, so there is no overlap |
| A date inside an email address (`dob-05/12/1990@example.com`) | `dob-[EMAIL]` when both are enabled | `/` is not an email local-part character, so the EMAIL span is `1990@example.com`; it overlaps the date and the union rule gives one `[EMAIL]`; the label `dob-` stays (`SERVICE_AND_RESOLVER_rules.md` SI18; derived, not executed) |
| `DOB: 123-45-6789`, `DOB: 415-555-0134`, `DOB: 192.168.1.1`, `DOB: 4111 1111 1111 1111` | unchanged by DATE_OF_BIRTH | None of these has a date shape (DF) |

The **cross-check** in §10 ran the detector over every string in the PHONE, EMAIL, IP_ADDRESS and CREDIT_CARD test tables: it matched only the rows that really contain a `DOB:` or `born on` label.

---

## 8. Known limitations (explicit, with reasons)

| # | Limitation | Example | Why accepted / mitigation |
|---|---|---|---|
| L1 | **Other words between the label and the date** leak. | `born in Chicago on 12 May 1990`, `Date and place of birth: Chicago, 05/12/1990`, `DOB/Age: 05/12/1990`, `Patient DOB (see chart) 05/12/1990` stay | D3, D13: allowing words would redact unrelated dates (`born in 1985, married on 12 May 2010`). |
| L2 | **Partial dates are not detected**: a year alone, month and year, day and month. | `DOB: 1990`, `DOB: May 1990`, `DOB: 12 May`, `born in 1990` stay | D5: weak evidence; endless variants. |
| L3 | **Month names are English only.** Numeric dates in other languages work. | `geboren am 12. Mai 1990`, `nacido el 12 de mayo de 1990`, `12 mai 1990` stay | D11. Data table; open decision O3. |
| L4 | **Spaces are not date separators**, and no spaces around separators. | `DOB: 12 05 1990`, `DOB: 05 / 12 / 1990` stay | A space-separated number chain is too ambiguous. |
| L5 | **Era years and other calendars** are not supported. | `生年月日：平成2年5月12日` stays | Out of scope. |
| L6 | **Only the date right after a label** is replaced. | `DOB: 05/12/1990 and 06/07/1992` → `DOB: [DATE_OF_BIRTH] and 06/07/1992` | D3. |
| L7 | **The label must be on the same line**, except a label line ending with a colon followed by the date on the next line (§5.4). Labels without a colon, two or more line breaks, and column headers (CSV, table layouts) leak. | `name,dob⏎Ann,05/12/1990`, `DOB⏎05/12/1990`, `DOB:⏎⏎05/12/1990` stay | Joining lines without the colon as evidence would link unrelated text. Optional later: caller-supplied column hints. |
| L8 | **`birthday` and `bday` can label a celebration date.** | `Happy birthday 12 May 2024!` → `Happy birthday [DATE_OF_BIRTH]!` | D14, O1: over-redaction is the safe error. |
| L9 | **A weekday between label and date** is not skipped. | `born Sunday, 12 May 1990` stays | Not worth the extra data. |
| L10 | **A time after a numeric date is absorbed** even when it is not part of the value; an invalid time is not absorbed. | `DOB: 05/12/1990 10:30:00` → `DOB: [DATE_OF_BIRTH]`; `DOB: 2024-05-12T25:00:00` → `DOB: [DATE_OF_BIRTH]T25:00:00` | D9. |
| L11 | **Calendar checks are lenient**: impossible days in a month are redacted; implausible years (before 1800, after 2199) are not. | `DOB: 1990-02-30`, `DOB: 31/04/1990` redacted; `DOB: 1790-05-12` stays | D8, O2. |
| L12 | **ASCII digits only.** | `DOB: １９９０-０５-１２`, Arabic-Indic digits stay | D15. |
| L13 | **Labels are matched letter for letter** (case-insensitive only): a missing or decomposed accent does not match. | `ne le 12/05/1990`, `ne\u0301 le …` stay | D15: no normalisation. |
| L14 | **Label forms outside the list**: plurals, other abbreviations. | `DOBs: 05/12/1990`, `(b. 1990-05-12)` stay | The list is data and can be extended. |
| L15 | **Not strictly idempotent.** The replacement text `[DATE_OF_BIRTH]` contains the label "date of birth", so on a second run a date directly after a placeholder looks labelled. Observed in 77 of 80,000 random inputs; with the placeholder swapped for neutral text there were 0. | `DOB: 05/12/1990, 06/07/1992` → run 1: `DOB: [DATE_OF_BIRTH], 06/07/1992`, run 2: `DOB: [DATE_OF_BIRTH], [DATE_OF_BIRTH]` | The service runs the detectors once on the original text, so it is not affected. Re-running on already de-identified text may redact one more date. |
| L16 | **Any date right after `born` (or another label) is redacted, whatever the subject.** | `The brand was born 12 May 2010` → `The brand was born [DATE_OF_BIRTH]` | A rule-based detector cannot tell people from things. |
| L17 | **The label lists are a sample**, written without review by native speakers, and are not machine-checked against real-world usage. | Any label outside the list | Data, not code (D12). |

---

## 9. Test matrix (every row was executed)

Legend: `⏎` = newline, `⇥` = tab, `\r⏎` = CRLF, `<NBSP>` `<NNBSP>` `<THIN>` `<EN>` `<NBH>` `<MINUS>` `<ZWSP>` `<RLM>` `<COMB>` = the corresponding Unicode characters (no-break space, narrow no-break space, thin space, en dash, non-breaking hyphen, minus sign, zero-width space, right-to-left mark, combining acute accent). In every row only `DATE_OF_BIRTH` is enabled. The **Output** column was produced by the run, not typed by hand.

### DP-series: dates that must be redacted (93 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| DP01 | `DOB: 1990-05-12` | `DOB: [DATE_OF_BIRTH]` | ISO date |
| DP02 | `DOB: 1990/05/12` | `DOB: [DATE_OF_BIRTH]` | ISO with slashes |
| DP03 | `DOB: 1990.05.12` | `DOB: [DATE_OF_BIRTH]` | ISO with dots |
| DP04 | `DOB: 1990-5-2` | `DOB: [DATE_OF_BIRTH]` | Single-digit month and day |
| DP05 | `DOB: 1990<EN>05<EN>12` | `DOB: [DATE_OF_BIRTH]` | En dashes |
| DP06 | `DOB: 1990<MINUS>05<MINUS>12` | `DOB: [DATE_OF_BIRTH]` | Minus signs |
| DP07 | `DOB: 1990<NBH>05<NBH>12` | `DOB: [DATE_OF_BIRTH]` | Non-breaking hyphens |
| DP08 | `DOB: 1990-05-12.` | `DOB: [DATE_OF_BIRTH].` | Sentence-final period stays |
| DP09 | `Patient John Doe can be contacted at john.doe@example.com or +1-415-555-0134. DOB: 1990-05-12.` | `Patient John Doe can be contacted at john.doe@example.com or +1-415-555-0134. DOB: [DATE_OF_BIRTH].` | The brief's example, DATE_OF_BIRTH only (name, email and phone belong to other detectors) |
| DP10 | `John Doe paid +1500000 with card 4111 1111 1111 1111 003 and can be contacted at john.doe@example.com or +91-415-555-0134. DOB: 1990-05-12.` | `John Doe paid +1500000 with card 4111 1111 1111 1111 003 and can be contacted at john.doe@example.com or +91-415-555-0134. DOB: [DATE_OF_BIRTH].` | Task-giver example text, DATE_OF_BIRTH only |
| DP11 | `DOB: 05/12/1990` | `DOB: [DATE_OF_BIRTH]` | Numeric, month first or day first (either is accepted) |
| DP12 | `DOB: 31/12/1990` | `DOB: [DATE_OF_BIRTH]` | Valid only as day/month |
| DP13 | `DOB: 12/31/1990` | `DOB: [DATE_OF_BIRTH]` | Valid only as month/day |
| DP14 | `DOB: 12-05-1990` | `DOB: [DATE_OF_BIRTH]` | Hyphens |
| DP15 | `DOB: 12.05.1990` | `DOB: [DATE_OF_BIRTH]` | Dots |
| DP16 | `DOB: 5/2/1990` | `DOB: [DATE_OF_BIRTH]` | Single digits |
| DP17 | `DOB: 05/12/90` | `DOB: [DATE_OF_BIRTH]` | Two-digit year, slashes |
| DP18 | `DOB: 12-05-90` | `DOB: [DATE_OF_BIRTH]` | Two-digit year, hyphens |
| DP19 | `DOB: 12.05.90` | `DOB: [DATE_OF_BIRTH]` | Two-digit year, dots |
| DP20 | `DOB: 19900512` | `DOB: [DATE_OF_BIRTH]` | Compact YYYYMMDD |
| DP21 | `DOB: 31121990` | `DOB: [DATE_OF_BIRTH]` | Compact, valid only as DDMMYYYY |
| DP22 | `DOB: 12311990` | `DOB: [DATE_OF_BIRTH]` | Compact, valid only as MMDDYYYY |
| DP23 | `DOB: May 12, 1990` | `DOB: [DATE_OF_BIRTH]` | Month name first |
| DP24 | `DOB: May 12 1990` | `DOB: [DATE_OF_BIRTH]` | No comma |
| DP25 | `DOB: 12 May 1990` | `DOB: [DATE_OF_BIRTH]` | Day first |
| DP26 | `DOB: 12th May 1990` | `DOB: [DATE_OF_BIRTH]` | Ordinal day |
| DP27 | `DOB: May 12th, 1990` | `DOB: [DATE_OF_BIRTH]` | Ordinal day, month first |
| DP28 | `DOB: 12-May-1990` | `DOB: [DATE_OF_BIRTH]` | Hyphens around the month name |
| DP29 | `DOB: 12/May/1990` | `DOB: [DATE_OF_BIRTH]` | Slashes around the month name |
| DP30 | `DOB: 12-MAY-90` | `DOB: [DATE_OF_BIRTH]` | Upper case, two-digit year |
| DP31 | `DOB: 12 May, 1990` | `DOB: [DATE_OF_BIRTH]` | Comma before the year |
| DP32 | `DOB: 12th of May, 1990` | `DOB: [DATE_OF_BIRTH]` | "of" between day and month |
| DP33 | `DOB: Sept. 12, 1990` | `DOB: [DATE_OF_BIRTH]` | Abbreviation with a period |
| DP34 | `DOB: May 12, 90` | `DOB: [DATE_OF_BIRTH]` | Month first, two-digit year |
| DP35 | `DOB: 12.May.1990` | `DOB: [DATE_OF_BIRTH]` | Dots around the month name |
| DP36 | `DOB: 12<NBSP>May<NBSP>1990` | `DOB: [DATE_OF_BIRTH]` | No-break spaces |
| DP37 | `DOB: 31st Dec 1999` | `DOB: [DATE_OF_BIRTH]` | 31st |
| DP38 | `DOB: 2nd March 1985` | `DOB: [DATE_OF_BIRTH]` | 2nd |
| DP39 | `DOB: 3rd Jan 2001` | `DOB: [DATE_OF_BIRTH]` | 3rd |
| DP40 | `生年月日：1990年5月12日` | `生年月日：[DATE_OF_BIRTH]` | Chinese/Japanese date |
| DP41 | `생년월일: 1990년 5월 12일` | `생년월일: [DATE_OF_BIRTH]` | Korean date |
| DP42 | `生年月日：1990年5月12日生まれ` | `生年月日：[DATE_OF_BIRTH]生まれ` | Text glued after a CJK date stays |
| DP43 | `患者生年月日：1990年05月12日` | `患者生年月日：[DATE_OF_BIRTH]` | Keyword glued to other CJK text, zero-padded |
| DP44 | `生年月日1990年5月12日` | `生年月日[DATE_OF_BIRTH]` | No separator between a CJK keyword and the date |
| DP45 | `生年月日05/12/1990` | `生年月日[DATE_OF_BIRTH]` | A CJK label glued to a numeric date (CJK letters are not glue) |
| DP46 | `DOB: 05/12/1990です` | `DOB: [DATE_OF_BIRTH]です` | Japanese text glued after a numeric date |
| DP47 | `DOB: 1990-05-12生まれ` | `DOB: [DATE_OF_BIRTH]生まれ` | Chinese/Japanese text glued after an ISO date |
| DP48 | `"dob": "1990-05-12T00:00:00Z"` | `"dob": "[DATE_OF_BIRTH]"` | ISO timestamp is one value (time absorbed) |
| DP49 | `DOB: 1990-05-12T00:00:00.000+05:30` | `DOB: [DATE_OF_BIRTH]` | Fraction and offset absorbed |
| DP50 | `DOB: 1990-05-12T10:30` | `DOB: [DATE_OF_BIRTH]` | T form without seconds |
| DP51 | `DOB: 05/12/1990 00:00:00` | `DOB: [DATE_OF_BIRTH]` | Space form with seconds |
| DP52 | `DOB: 5/12/1990 12:00:00 AM` | `DOB: [DATE_OF_BIRTH]` | Spreadsheet style with AM |
| DP53 | `DOB: 05/12/1990 12:00 PM` | `DOB: [DATE_OF_BIRTH]` | Space form, minutes and PM |
| DP54 | `DOB: 1990-05-12 00:00:00` | `DOB: [DATE_OF_BIRTH]` | ISO date, space, time with seconds |
| DP55 | `DOB: 1990-05-12T00:00:00-0500` | `DOB: [DATE_OF_BIRTH]` | Offset without a colon |
| DP56 | `DOB: 1990-05-12 10:30 visit` | `DOB: [DATE_OF_BIRTH] 10:30 visit` | Space form needs seconds or AM/PM: here the time stays |
| DP57 | `"dob": "1990-05-12"` | `"dob": "[DATE_OF_BIRTH]"` | JSON |
| DP58 | `"dateOfBirth":"1990-05-12"` | `"dateOfBirth":"[DATE_OF_BIRTH]"` | JSON, camel case key |
| DP59 | `{"name":"A","dob":"1990-05-12","age":36}` | `{"name":"A","dob":"[DATE_OF_BIRTH]","age":36}` | JSON object |
| DP60 | `dob=1990-05-12` | `dob=[DATE_OF_BIRTH]` | Equals sign |
| DP61 | `[DOB] 1990-05-12` | `[DOB] [DATE_OF_BIRTH]` | Brackets around the label |
| DP62 | `DOB - 05/12/1990` | `DOB - [DATE_OF_BIRTH]` | Dash after the label |
| DP63 | `Date of Birth (MM/DD/YYYY): 05/12/1990` | `Date of Birth (MM/DD/YYYY): [DATE_OF_BIRTH]` | Format hint in parentheses |
| DP64 | `DOB (dd-mm-yy): 12-05-90` | `DOB (dd-mm-yy): [DATE_OF_BIRTH]` | Format hint, lower case |
| DP65 | `DOB (yyyy-mm-dd) 1990-05-12` | `DOB (yyyy-mm-dd) [DATE_OF_BIRTH]` | Format hint without a colon |
| DP66 | `Date of Birth (DOB): 1990-05-12` | `Date of Birth (DOB): [DATE_OF_BIRTH]` | Label repeated in parentheses |
| DP67 | `05/12/1990 (DOB)` | `[DATE_OF_BIRTH] (DOB)` | Label after the date, in parentheses |
| DP68 | `1990-05-12 [Date of Birth]` | `[DATE_OF_BIRTH] [Date of Birth]` | Label after the date, in brackets |
| DP69 | `(DOB 05/12/1990)` | `(DOB [DATE_OF_BIRTH])` | Date and label inside parentheses |
| DP70 | `DOB:05/12/1990` | `DOB:[DATE_OF_BIRTH]` | No space after the colon |
| DP71 | `born on 12 May 1990` | `born on [DATE_OF_BIRTH]` | "born on" |
| DP72 | `born 12/05/1990` | `born [DATE_OF_BIRTH]` | "born" alone |
| DP73 | `born on the 12th of May, 1990` | `born on the [DATE_OF_BIRTH]` | "on the" before a written date |
| DP74 | `DOB is 05/12/1990` | `DOB is [DATE_OF_BIRTH]` | Filler "is" |
| DP75 | `Her DOB was 05/12/1990.` | `Her DOB was [DATE_OF_BIRTH].` | Filler "was" |
| DP76 | `Born: 05/12/1990` | `Born: [DATE_OF_BIRTH]` | Capitalised keyword |
| DP77 | `Visit 05/12/2024 (DOB: 01/02/1980)` | `Visit 05/12/2024 (DOB: [DATE_OF_BIRTH])` | Only the date that follows the label is replaced |
| DP78 | `Admission date: 05/12/2024, DOB: 01/02/1980` | `Admission date: 05/12/2024, DOB: [DATE_OF_BIRTH]` | Another date in the same line stays |
| DP79 | `Born: May 12, 1990 in Chicago` | `Born: [DATE_OF_BIRTH] in Chicago` | Text after the date stays |
| DP80 | `D.O.B. 05/12/1990` | `D.O.B. [DATE_OF_BIRTH]` | Dotted abbreviation |
| DP81 | `\| DOB \| 05/12/1990 \|` | `\| DOB \| [DATE_OF_BIRTH] \|` | Markdown table cell |
| DP82 | `**DOB:** 05/12/1990` | `**DOB:** [DATE_OF_BIRTH]` | Markdown bold label |
| DP83 | `Date of Birth     05/12/1990` | `Date of Birth     [DATE_OF_BIRTH]` | Several spaces |
| DP84 | `DOB:⇥05/12/1990` | `DOB:⇥[DATE_OF_BIRTH]` | Tab after the label |
| DP85 | `DOB ( 05/12/1990 )` | `DOB ( [DATE_OF_BIRTH] )` | Spaces inside the brackets |
| DP86 | `dob: "05/12/1990"` | `dob: "[DATE_OF_BIRTH]"` | Quoted value |
| DP87 | `Name: Ann, DOB: 05/12/1990, Sex: F` | `Name: Ann, DOB: [DATE_OF_BIRTH], Sex: F` | Form line |
| DP88 | `Date of Birth:\r⏎  1990-05-12` | `Date of Birth:\r⏎  [DATE_OF_BIRTH]` | CRLF and indentation before the date |
| DP89 | `DOB :⇥⏎05/12/1990` | `DOB :⇥⏎[DATE_OF_BIRTH]` | Allowed characters around the colon |
| DP90 | `DOB:⏎⏎05/12/1990` | `DOB:⏎⏎05/12/1990` | Two line breaks: not joined |
| DP91 | `DOB:⏎Ann 05/12/1990` | `DOB:⏎Ann 05/12/1990` | Another word before the date on the next line |
| DP92 | `DOB: see below⏎05/12/1990` | `DOB: see below⏎05/12/1990` | Other words after the label |
| DP93 | `DOB⏎05/12/1990` | `DOB⏎05/12/1990` | No colon: unchanged (same as DL16) |

### DK-series: one row per label entry, filler word and allowed character (81 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| DK01 | `DOB: 1990-05-12` | `DOB: [DATE_OF_BIRTH]` | Keyword spelling |
| DK02 | `dob: 1990-05-12` | `dob: [DATE_OF_BIRTH]` | Keyword spelling |
| DK03 | `D.O.B. 1990-05-12` | `D.O.B. [DATE_OF_BIRTH]` | Keyword spelling |
| DK04 | `d/o/b: 1990-05-12` | `d/o/b: [DATE_OF_BIRTH]` | Keyword spelling |
| DK05 | `D O B: 1990-05-12` | `D O B: [DATE_OF_BIRTH]` | Keyword spelling |
| DK06 | `Date of Birth: 1990-05-12` | `Date of Birth: [DATE_OF_BIRTH]` | Keyword spelling |
| DK07 | `DATE OF BIRTH: 1990-05-12` | `DATE OF BIRTH: [DATE_OF_BIRTH]` | Keyword spelling |
| DK08 | `date_of_birth: 1990-05-12` | `date_of_birth: [DATE_OF_BIRTH]` | Keyword spelling |
| DK09 | `date-of-birth=1990-05-12` | `date-of-birth=[DATE_OF_BIRTH]` | Keyword spelling |
| DK10 | `dateOfBirth: 1990-05-12` | `dateOfBirth: [DATE_OF_BIRTH]` | Keyword spelling |
| DK11 | `dateofbirth: 1990-05-12` | `dateofbirth: [DATE_OF_BIRTH]` | Keyword spelling |
| DK12 | `date  of  birth: 1990-05-12` | `date  of  birth: [DATE_OF_BIRTH]` | Keyword spelling |
| DK13 | `Birth date: 1990-05-12` | `Birth date: [DATE_OF_BIRTH]` | Keyword spelling |
| DK14 | `Birthdate: 1990-05-12` | `Birthdate: [DATE_OF_BIRTH]` | Keyword spelling |
| DK15 | `birth_date: 1990-05-12` | `birth_date: [DATE_OF_BIRTH]` | Keyword spelling |
| DK16 | `birthDate: 1990-05-12` | `birthDate: [DATE_OF_BIRTH]` | Keyword spelling |
| DK17 | `Born: 1990-05-12` | `Born: [DATE_OF_BIRTH]` | Keyword spelling |
| DK18 | `Birthday: 05/12/1990` | `Birthday: [DATE_OF_BIRTH]` | Keyword spelling |
| DK19 | `bday: 05/12/1990` | `bday: [DATE_OF_BIRTH]` | Keyword spelling |
| DK20 | `B-day: 05/12/1990` | `B-day: [DATE_OF_BIRTH]` | Keyword spelling |
| DK21 | `Geburtsdatum: 12.05.1990` | `Geburtsdatum: [DATE_OF_BIRTH]` | Keyword spelling |
| DK22 | `geboren am 12.05.1990` | `geboren am [DATE_OF_BIRTH]` | Keyword spelling |
| DK23 | `Geburtstag: 12.05.1990` | `Geburtstag: [DATE_OF_BIRTH]` | Keyword spelling |
| DK24 | `Fecha de nacimiento: 12/05/1990` | `Fecha de nacimiento: [DATE_OF_BIRTH]` | Keyword spelling |
| DK25 | `nacido el 12/05/1990` | `nacido el [DATE_OF_BIRTH]` | Keyword spelling |
| DK26 | `nacida el 12/05/1990` | `nacida el [DATE_OF_BIRTH]` | Keyword spelling |
| DK27 | `Date de naissance : 12/05/1990` | `Date de naissance : [DATE_OF_BIRTH]` | Keyword spelling |
| DK28 | `né le 12/05/1990` | `né le [DATE_OF_BIRTH]` | Keyword spelling |
| DK29 | `Née le 12/05/1990` | `Née le [DATE_OF_BIRTH]` | Keyword spelling |
| DK30 | `Data de nascimento: 12/05/1990` | `Data de nascimento: [DATE_OF_BIRTH]` | Keyword spelling |
| DK31 | `nascido em 12/05/1990` | `nascido em [DATE_OF_BIRTH]` | Keyword spelling |
| DK32 | `nascida em 12/05/1990` | `nascida em [DATE_OF_BIRTH]` | Keyword spelling |
| DK33 | `Data di nascita: 12/05/1990` | `Data di nascita: [DATE_OF_BIRTH]` | Keyword spelling |
| DK34 | `nato il 12/05/1990` | `nato il [DATE_OF_BIRTH]` | Keyword spelling |
| DK35 | `nata il 12/05/1990` | `nata il [DATE_OF_BIRTH]` | Keyword spelling |
| DK36 | `Geboortedatum: 12-05-1990` | `Geboortedatum: [DATE_OF_BIRTH]` | Keyword spelling |
| DK37 | `Дата рождения: 12.05.1990` | `Дата рождения: [DATE_OF_BIRTH]` | Keyword spelling |
| DK38 | `ДАТА РОЖДЕНИЯ: 12.05.1990` | `ДАТА РОЖДЕНИЯ: [DATE_OF_BIRTH]` | Keyword spelling |
| DK39 | `родился 12.05.1990` | `родился [DATE_OF_BIRTH]` | Keyword spelling |
| DK40 | `родилась 12.05.1990` | `родилась [DATE_OF_BIRTH]` | Keyword spelling |
| DK41 | `जन्म तिथि: 12/05/1990` | `जन्म तिथि: [DATE_OF_BIRTH]` | Keyword spelling |
| DK42 | `生年月日：1990年5月12日` | `生年月日：[DATE_OF_BIRTH]` | Keyword spelling |
| DK43 | `出生日期：1990年5月12日` | `出生日期：[DATE_OF_BIRTH]` | Keyword spelling |
| DK44 | `出生年月日：1990年5月12日` | `出生年月日：[DATE_OF_BIRTH]` | Keyword spelling |
| DK45 | `生日：1990年5月12日` | `生日：[DATE_OF_BIRTH]` | Keyword spelling |
| DK46 | `誕生日：1990年5月12日` | `誕生日：[DATE_OF_BIRTH]` | Keyword spelling |
| DK47 | `생년월일: 1990년 5월 12일` | `생년월일: [DATE_OF_BIRTH]` | Keyword spelling |
| DK48 | `تاريخ الميلاد: 12/05/1990` | `تاريخ الميلاد: [DATE_OF_BIRTH]` | Keyword spelling |
| DK49 | `born on 12 May 1990` | `born on [DATE_OF_BIRTH]` | Filler "on" |
| DK50 | `DOB is 05/12/1990` | `DOB is [DATE_OF_BIRTH]` | Filler "is" |
| DK51 | `DOB was 05/12/1990` | `DOB was [DATE_OF_BIRTH]` | Filler "was" |
| DK52 | `born the 12 May 1990` | `born the [DATE_OF_BIRTH]` | Filler "the" |
| DK53 | `born on the 12 May 1990` | `born on the [DATE_OF_BIRTH]` | Fillers "on" and "the" together |
| DK54 | `DOB 1990-05-12` | `DOB [DATE_OF_BIRTH]` | Allowed character U+0020 between label and date |
| DK55 | `DOB⇥1990-05-12` | `DOB⇥[DATE_OF_BIRTH]` | Allowed character U+0009 between label and date |
| DK56 | `DOB<NBSP>1990-05-12` | `DOB<NBSP>[DATE_OF_BIRTH]` | Allowed character U+00A0 between label and date |
| DK57 | `DOB<THIN>1990-05-12` | `DOB<THIN>[DATE_OF_BIRTH]` | Allowed character U+2009 between label and date |
| DK58 | `DOB<NNBSP>1990-05-12` | `DOB<NNBSP>[DATE_OF_BIRTH]` | Allowed character U+202F between label and date |
| DK59 | `DOB:1990-05-12` | `DOB:[DATE_OF_BIRTH]` | Allowed character U+003A between label and date |
| DK60 | `DOB：1990-05-12` | `DOB：[DATE_OF_BIRTH]` | Allowed character U+FF1A between label and date |
| DK61 | `DOB=1990-05-12` | `DOB=[DATE_OF_BIRTH]` | Allowed character U+003D between label and date |
| DK62 | `DOB.1990-05-12` | `DOB.[DATE_OF_BIRTH]` | Allowed character U+002E between label and date |
| DK63 | `DOB#1990-05-12` | `DOB#[DATE_OF_BIRTH]` | Allowed character U+0023 between label and date |
| DK64 | `DOB-1990-05-12` | `DOB-[DATE_OF_BIRTH]` | Allowed character U+002D between label and date |
| DK65 | `DOB<EN>1990-05-12` | `DOB<EN>[DATE_OF_BIRTH]` | Allowed character U+2013 between label and date |
| DK66 | `DOB—1990-05-12` | `DOB—[DATE_OF_BIRTH]` | Allowed character U+2014 between label and date |
| DK67 | `DOB(1990-05-12` | `DOB([DATE_OF_BIRTH]` | Allowed character U+0028 between label and date |
| DK68 | `DOB)1990-05-12` | `DOB)[DATE_OF_BIRTH]` | Allowed character U+0029 between label and date |
| DK69 | `DOB[1990-05-12` | `DOB[[DATE_OF_BIRTH]` | Allowed character U+005B between label and date |
| DK70 | `DOB]1990-05-12` | `DOB][DATE_OF_BIRTH]` | Allowed character U+005D between label and date |
| DK71 | `DOB"1990-05-12` | `DOB"[DATE_OF_BIRTH]` | Allowed character U+0022 between label and date |
| DK72 | `DOB'1990-05-12` | `DOB'[DATE_OF_BIRTH]` | Allowed character U+0027 between label and date |
| DK73 | `DOB“1990-05-12` | `DOB“[DATE_OF_BIRTH]` | Allowed character U+201C between label and date |
| DK74 | `DOB”1990-05-12` | `DOB”[DATE_OF_BIRTH]` | Allowed character U+201D between label and date |
| DK75 | `DOB‘1990-05-12` | `DOB‘[DATE_OF_BIRTH]` | Allowed character U+2018 between label and date |
| DK76 | `DOB’1990-05-12` | `DOB’[DATE_OF_BIRTH]` | Allowed character U+2019 between label and date |
| DK77 | `DOB,1990-05-12` | `DOB,[DATE_OF_BIRTH]` | Allowed character U+002C between label and date |
| DK78 | `DOB;1990-05-12` | `DOB;[DATE_OF_BIRTH]` | Allowed character U+003B between label and date |
| DK79 | `DOB/1990-05-12` | `DOB/[DATE_OF_BIRTH]` | Allowed character U+002F between label and date |
| DK80 | `DOB\|1990-05-12` | `DOB\|[DATE_OF_BIRTH]` | Allowed character U+007C between label and date |
| DK81 | `DOB*1990-05-12` | `DOB*[DATE_OF_BIRTH]` | Allowed character U+002A between label and date |

### DM-series: one row per month name (28 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| DM01 | `DOB: 12 January 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "january" |
| DM02 | `DOB: 12 February 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "february" |
| DM03 | `DOB: 12 March 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "march" |
| DM04 | `DOB: 12 April 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "april" |
| DM05 | `DOB: 12 May 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "may" |
| DM06 | `DOB: 12 June 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "june" |
| DM07 | `DOB: 12 July 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "july" |
| DM08 | `DOB: 12 August 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "august" |
| DM09 | `DOB: 12 September 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "september" |
| DM10 | `DOB: 12 October 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "october" |
| DM11 | `DOB: 12 November 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "november" |
| DM12 | `DOB: 12 December 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "december" |
| DM13 | `DOB: 12 Jan 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "jan" |
| DM14 | `DOB: 12 Feb 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "feb" |
| DM15 | `DOB: 12 Mar 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "mar" |
| DM16 | `DOB: 12 Apr 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "apr" |
| DM17 | `DOB: 12 Jun 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "jun" |
| DM18 | `DOB: 12 Jul 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "jul" |
| DM19 | `DOB: 12 Aug 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "aug" |
| DM20 | `DOB: 12 Sept 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "sept" |
| DM21 | `DOB: 12 Sep 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "sep" |
| DM22 | `DOB: 12 Oct 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "oct" |
| DM23 | `DOB: 12 Nov 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "nov" |
| DM24 | `DOB: 12 Dec 1990` | `DOB: [DATE_OF_BIRTH]` | Month name "dec" |
| DM25 | `DOB: Jan. 12, 1990` | `DOB: [DATE_OF_BIRTH]` | Abbreviation with a period |
| DM26 | `DOB: Dec. 12 1990` | `DOB: [DATE_OF_BIRTH]` | Abbreviation with a period |
| DM27 | `DOB: 12 SEPTEMBER 1990` | `DOB: [DATE_OF_BIRTH]` | Upper case |
| DM28 | `DOB: 12 february 1990` | `DOB: [DATE_OF_BIRTH]` | Lower case |

### DF-series: strings that must stay unchanged (57 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| DF01 | `1990-05-12` | `1990-05-12` | A bare date is not a date of birth |
| DF02 | `05/12/1990` | `05/12/1990` | A bare numeric date |
| DF03 | `Invoice 2024-05-12` | `Invoice 2024-05-12` | A date in a different context |
| DF04 | `Admission date: 05/12/2024` | `Admission date: 05/12/2024` | Another label |
| DF05 | `Follow-up on 12 May 2025` | `Follow-up on 12 May 2025` | A written date with no DOB word |
| DF06 | `DOB` | `DOB` | Label without a date |
| DF07 | `DOB: unknown` | `DOB: unknown` | Label with no date |
| DF08 | `DOB: 13/13/1990` | `DOB: 13/13/1990` | Month 13 in both orders |
| DF09 | `DOB: 00/05/1990` | `DOB: 00/05/1990` | Day or month 0 |
| DF10 | `DOB: 05/00/1990` | `DOB: 05/00/1990` | Day or month 0 |
| DF11 | `DOB: 32/05/1990` | `DOB: 32/05/1990` | No order makes it a month and a day |
| DF12 | `DOB: 1990-13-01` | `DOB: 1990-13-01` | ISO month 13 |
| DF13 | `DOB: 1990-00-10` | `DOB: 1990-00-10` | ISO month 0 |
| DF14 | `DOB: 1990-05-32` | `DOB: 1990-05-32` | ISO day 32 |
| DF15 | `DOB: 1990-05-00` | `DOB: 1990-05-00` | ISO day 0 |
| DF16 | `DOB: 1790-05-12` | `DOB: 1790-05-12` | Year below the range (1800-2199) |
| DF17 | `DOB: 2200-05-12` | `DOB: 2200-05-12` | Year above the range |
| DF18 | `DOB: 12/05/0990` | `DOB: 12/05/0990` | Year below the range, numeric |
| DF19 | `DOB: 32 May 1990` | `DOB: 32 May 1990` | Day 32 in a written date |
| DF20 | `DOB: 12345678` | `DOB: 12345678` | Eight digits that are no date in any order |
| DF21 | `DOB: 00000000` | `DOB: 00000000` | Eight zeros |
| DF22 | `Dobson 05/12/1990` | `Dobson 05/12/1990` | Label inside another word |
| DF23 | `adobe: 05/12/1990` | `adobe: 05/12/1990` | Label inside another word |
| DF24 | `unborn 05/12/1990` | `unborn 05/12/1990` | "born" inside another word |
| DF25 | `Bornholm 05/12/1990` | `Bornholm 05/12/1990` | "born" at the start of another word |
| DF26 | `xDOB: 05/12/1990` | `xDOB: 05/12/1990` | Letter glued before the label |
| DF27 | `DOBx: 05/12/1990` | `DOBx: 05/12/1990` | Letter glued after the label |
| DF28 | `DOB certificate issued 05/12/1990` | `DOB certificate issued 05/12/1990` | Other words between label and date |
| DF29 | `Date of birth certificate 05/12/2024` | `Date of birth certificate 05/12/2024` | Other words between label and date |
| DF30 | `Happy birthday party on 05/12/2025` | `Happy birthday party on 05/12/2025` | Other words between label and date |
| DF31 | `DOB:⏎05/12/1990` | `DOB:⏎[DATE_OF_BIRTH]` | Label line ends with a colon; the date starts the next line (D3 exception); changed after implementation |
| DF32 | `DOB: 105/12/1990` | `DOB: 105/12/1990` | A three-digit first group |
| DF33 | `DOB: 05/12/19900` | `DOB: 05/12/19900` | Extra digit after the year |
| DF34 | `DOB: 05/12/1990/07` | `DOB: 05/12/1990/07` | A further group joined by a slash |
| DF35 | `DOB: 05/12/1990-1991` | `DOB: 05/12/1990-1991` | A hyphen and a digit continue the number |
| DF36 | `DOB: 05/12/1990.5` | `DOB: 05/12/1990.5` | A decimal point and a digit continue the number |
| DF37 | `DOB: 05/12/1990abc` | `DOB: 05/12/1990abc` | Letters glued after the date |
| DF38 | `DOB: x05/12/1990` | `DOB: x05/12/1990` | Letter glued before the date |
| DF39 | `DOB: _05/12/1990` | `DOB: _05/12/1990` | Underscore glued before the date |
| DF40 | `DOB: 1990-05-123` | `DOB: 1990-05-123` | Three-digit day |
| DF41 | `DOB: 1990-05-12T` | `DOB: 1990-05-12T` | A "T" that is not followed by a time |
| DF42 | `DOB: 1990-05-12abc` | `DOB: 1990-05-12abc` | Letters glued after an ISO date |
| DF43 | `x05/12/1990 (DOB)` | `x05/12/1990 (DOB)` | A letter glued before the date, even with an after-label |
| DF44 | `_05/12/1990 (DOB)` | `_05/12/1990 (DOB)` | An underscore glued before the date, even with an after-label |
| DF45 | `1.12/05/1990 (DOB)` | `1.12/05/1990 (DOB)` | A date that is the tail of a longer dotted/slashed number, even with an after-label |
| DF46 | `5-12/05/1990 (DOB)` | `5-12/05/1990 (DOB)` | A date that is the tail of a longer number, even with an after-label |
| DF47 | `DOB: 1.2.3.4` | `DOB: 1.2.3.4` | Dotted quad |
| DF48 | `DOB: 123-45-6789` | `DOB: 123-45-6789` | SSN shape |
| DF49 | `DOB: 415-555-0134` | `DOB: 415-555-0134` | Phone shape |
| DF50 | `DOB: 192.168.1.1` | `DOB: 192.168.1.1` | IPv4 shape |
| DF51 | `DOB: 10:30` | `DOB: 10:30` | A time |
| DF52 | `05/12/1990 (DOB: unknown)` | `05/12/1990 (DOB: unknown)` | After-label must be exactly (label) |
| DF53 | `05/12/1990 (born in Paris)` | `05/12/1990 (born in Paris)` | After-label must be exactly (label) |
| DF54 | `Admitted 05/12/2024 DOB unknown` | `Admitted 05/12/2024 DOB unknown` | Date before a label with no brackets |
| DF55 | *(empty)* | *(empty)* | Empty input |
| DF56 | `no dates here` | `no dates here` | No dates |
| DF57 | `+1 415 555 0134 and john@example.com` | `+1 415 555 0134 and john@example.com` | Other entities only |

### DS-series: structure, repetition, layout (19 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| DS01 | `DOB: 05/12/1990 DOB: 06/13/1992` | `DOB: [DATE_OF_BIRTH] DOB: [DATE_OF_BIRTH]` | Two labelled dates on one line |
| DS02 | `DOB: 05/12/1990, spouse DOB: 06/13/1992` | `DOB: [DATE_OF_BIRTH], spouse DOB: [DATE_OF_BIRTH]` | Two labelled dates with words between |
| DS03 | `DOB: 05/12/1990⏎DOB: 06/13/1992` | `DOB: [DATE_OF_BIRTH]⏎DOB: [DATE_OF_BIRTH]` | Two lines |
| DS04 | `DOB: 05/12/1990\r⏎DOB: 06/13/1992\r⏎` | `DOB: [DATE_OF_BIRTH]\r⏎DOB: [DATE_OF_BIRTH]\r⏎` | CRLF preserved |
| DS05 | `DOB: 05/12/1990; DOB: 05/12/1990; DOB: 05/12/1990` | `DOB: [DATE_OF_BIRTH]; DOB: [DATE_OF_BIRTH]; DOB: [DATE_OF_BIRTH]` | Same date three times |
| DS06 | `  DOB: 05/12/1990  ` | `  DOB: [DATE_OF_BIRTH]  ` | Surrounding spaces kept |
| DS07 | `⏎⏎DOB: 05/12/1990⏎⏎` | `⏎⏎DOB: [DATE_OF_BIRTH]⏎⏎` | Blank lines kept |
| DS08 | `🎂DOB: 05/12/1990🎂` | `🎂DOB: [DATE_OF_BIRTH]🎂` | Emoji directly adjacent |
| DS09 | `Résumé — DOB: 05/12/1990 — café ☕` | `Résumé — DOB: [DATE_OF_BIRTH] — café ☕` | Accents and symbols untouched |
| DS10 | `DOB: 05/12/1990<RLM>` | `DOB: [DATE_OF_BIRTH]<RLM>` | Right-to-left mark preserved |
| DS11 | `<ZWSP>DOB: 05/12/1990<ZWSP>` | `<ZWSP>DOB: [DATE_OF_BIRTH]<ZWSP>` | Zero-width spaces preserved |
| DS12 | `DOB: 05/12/1990<NBSP>ok` | `DOB: [DATE_OF_BIRTH]<NBSP>ok` | NBSP preserved |
| DS13 | `(DOB:05/12/1990)` | `(DOB:[DATE_OF_BIRTH])` | Brackets right next to label and date |
| DS14 | `DOB: 05/12/1990;` | `DOB: [DATE_OF_BIRTH];` | Semicolon after |
| DS15 | `日本語 DOB: 05/12/1990 日本語` | `日本語 DOB: [DATE_OF_BIRTH] 日本語` | CJK text around |
| DS16 | `Born 05/12/1990, died 01/02/2020` | `Born [DATE_OF_BIRTH], died 01/02/2020` | Only the date right after the label |
| DS17 | `DOB 12/05/1990 DOB 12/05/1990` | `DOB [DATE_OF_BIRTH] DOB [DATE_OF_BIRTH]` | Repeated |
| DS18 | `x-DOB: 05/12/1990` | `x-DOB: [DATE_OF_BIRTH]` | A hyphen before the label is not a letter |
| DS19 | `patient_dob: 05/12/1990` | `patient_dob: [DATE_OF_BIRTH]` | An underscore before the label is not a letter |

### DL-series: documented limitations (expected = current behaviour, 29 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| DL01 | `born in Chicago on 12 May 1990` | `born in Chicago on 12 May 1990` | L1: other words between label and date |
| DL02 | `Date and place of birth: Chicago, 05/12/1990` | `Date and place of birth: Chicago, 05/12/1990` | L1: other words between label and date |
| DL03 | `Patient DOB (see chart) 05/12/1990` | `Patient DOB (see chart) 05/12/1990` | L1: other words between label and date |
| DL04 | `DOB: 1990` | `DOB: 1990` | L2: a year alone is not a date |
| DL05 | `DOB: May 1990` | `DOB: May 1990` | L2: month and year without a day |
| DL06 | `DOB: 12 May` | `DOB: 12 May` | L2: day and month without a year |
| DL07 | `age 34 (born 1990)` | `age 34 (born 1990)` | L2: a year alone is not a date |
| DL08 | `geboren am 12. Mai 1990` | `geboren am 12. Mai 1990` | L3: month names are English only |
| DL09 | `nacido el 12 de mayo de 1990` | `nacido el 12 de mayo de 1990` | L3: month names are English only |
| DL10 | `DOB: 12 mai 1990` | `DOB: 12 mai 1990` | L3: month names are English only |
| DL11 | `DOB: 12 05 1990` | `DOB: 12 05 1990` | L4: spaces are not date separators |
| DL12 | `DOB: 05 / 12 / 1990` | `DOB: 05 / 12 / 1990` | L4: no spaces around date separators |
| DL13 | `生年月日：平成2年5月12日` | `生年月日：平成2年5月12日` | L5: Japanese era years |
| DL14 | `DOB: 05/12/1990 and 06/07/1992` | `DOB: [DATE_OF_BIRTH] and 06/07/1992` | L6: only the date right after the label |
| DL15 | `name,dob⏎Ann,05/12/1990` | `name,dob⏎Ann,05/12/1990` | L7: a column header on another line does not label the cell |
| DL16 | `DOB⏎05/12/1990` | `DOB⏎05/12/1990` | L7: context never crosses a line break |
| DL17 | `Happy birthday 12 May 2024!` | `Happy birthday [DATE_OF_BIRTH]!` | L8: "birthday" can also label a celebration date (over-redaction) |
| DL18 | `born Sunday, 12 May 1990` | `born Sunday, 12 May 1990` | L9: a weekday between label and date |
| DL19 | `DOB: 05/12/1990 10:30:00` | `DOB: [DATE_OF_BIRTH]` | L10: a time after the date is absorbed, even if it is not part of the value |
| DL20 | `DOB: 1990-02-30` | `DOB: [DATE_OF_BIRTH]` | L11: only month 1-12 and day 1-31 are checked, not the length of the month |
| DL21 | `DOB: 31/04/1990` | `DOB: [DATE_OF_BIRTH]` | L11: only month 1-12 and day 1-31 are checked, not the length of the month |
| DL22 | `DOB: 2024-05-12T25:00:00` | `DOB: [DATE_OF_BIRTH]T25:00:00` | L10: an invalid time is not absorbed; the date still is |
| DL23 | `DOB: １９９０-０５-１２` | `DOB: １９９０-０５-１２` | L12: ASCII digits only |
| DL24 | `ne le 12/05/1990` | `ne le 12/05/1990` | L13: the accent is part of the keyword "né le" |
| DL25 | `ne<COMB> le 12/05/1990` | `ne<COMB> le 12/05/1990` | L13: no Unicode normalisation (decomposed accent) |
| DL26 | `DOBs: 05/12/1990` | `DOBs: 05/12/1990` | L14: plural form of the label |
| DL27 | `DOB/Age: 05/12/1990` | `DOB/Age: 05/12/1990` | L1: other words between label and date |
| DL28 | `The brand was born 12 May 2010` | `The brand was born [DATE_OF_BIRTH]` | L16: any date right after "born" is redacted, whatever the subject |
| DL29 | `(b. 1990-05-12)` | `(b. 1990-05-12)` | L14: "b." is not a label |

### DA-series: fresh adversarial set, positives (written after the main matrix, 32 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| DA01 | `DOB:12.05.1990;` | `DOB:[DATE_OF_BIRTH];` | Colon, dots, semicolon |
| DA02 | `<DOB: 05/12/1990>` | `<DOB: [DATE_OF_BIRTH]>` | Angle brackets |
| DA03 | `DOB — 12 May 1990` | `DOB — [DATE_OF_BIRTH]` | Em dash |
| DA04 | `Date of Birth: 1990-05-12 .` | `Date of Birth: [DATE_OF_BIRTH] .` | Space then period after |
| DA05 | `**Born** 12/05/1990` | `**Born** [DATE_OF_BIRTH]` | Markdown bold around the label |
| DA06 | `DOB (dd/mm/yyyy) 12/05/1990` | `DOB (dd/mm/yyyy) [DATE_OF_BIRTH]` | Hint with slashes |
| DA07 | `DOB (dd mm yyyy): 12/05/1990` | `DOB (dd mm yyyy): [DATE_OF_BIRTH]` | Hint with spaces |
| DA08 | `DOB (MM-DD-YY): 05-12-90` | `DOB (MM-DD-YY): [DATE_OF_BIRTH]` | Hint with hyphens |
| DA09 | `date_of_birth: 1990-05-12T00:00:00.000Z` | `date_of_birth: [DATE_OF_BIRTH]` | Database export |
| DA10 | `DOB 05/12/1990 [verified]` | `DOB [DATE_OF_BIRTH] [verified]` | Text after the date |
| DA11 | `"birth_date":"1990-05-12"` | `"birth_date":"[DATE_OF_BIRTH]"` | JSON snake case |
| DA12 | `DOB: 1/1/2000` | `DOB: [DATE_OF_BIRTH]` | Single digits |
| DA13 | `DOB: 31/12/1999` | `DOB: [DATE_OF_BIRTH]` | Day first |
| DA14 | `DOB: 29/02/2000` | `DOB: [DATE_OF_BIRTH]` | Leap day |
| DA15 | `DOB: 29/02/1999` | `DOB: [DATE_OF_BIRTH]` | Not a leap year: still redacted (L11) |
| DA16 | `DOB=12-31-1990` | `DOB=[DATE_OF_BIRTH]` | Equals sign, month first |
| DA17 | `DOB: 1800-01-01` | `DOB: [DATE_OF_BIRTH]` | Lowest year |
| DA18 | `DOB: 2199-12-31` | `DOB: [DATE_OF_BIRTH]` | Highest year |
| DA19 | `DOB: 12/05/00` | `DOB: [DATE_OF_BIRTH]` | Two-digit year 00 |
| DA20 | `born on 1st January 1990` | `born on [DATE_OF_BIRTH]` | "1st" |
| DA21 | `Born (12 May 1990)` | `Born ([DATE_OF_BIRTH])` | Date in parentheses |
| DA22 | `DOB: 12 May 1990 (age 36)` | `DOB: [DATE_OF_BIRTH] (age 36)` | Age after the date stays |
| DA23 | `DOB; 05/12/1990` | `DOB; [DATE_OF_BIRTH]` | Semicolon |
| DA24 | `DOB, 05/12/1990` | `DOB, [DATE_OF_BIRTH]` | Comma |
| DA25 | `DOB: 05/12/1990⏎Phone: 415-555-0134` | `DOB: [DATE_OF_BIRTH]⏎Phone: 415-555-0134` | Next line untouched |
| DA26 | `Geburtsdatum:12.05.1990` | `Geburtsdatum:[DATE_OF_BIRTH]` | German label, no space |
| DA27 | `05/12/1990 [born]` | `[DATE_OF_BIRTH] [born]` | Label "born" after the date |
| DA28 | `12/05/1990 (date of birth)` | `[DATE_OF_BIRTH] (date of birth)` | Long label after the date |
| DA29 | `05/12/1990   (DOB)` | `[DATE_OF_BIRTH]   (DOB)` | Spaces before the after-label |
| DA30 | `dob<NBSP>:<NBSP>05/12/1990` | `dob<NBSP>:<NBSP>[DATE_OF_BIRTH]` | NBSP around the colon |
| DA31 | `D.O.B: 12.05.1990` | `D.O.B: [DATE_OF_BIRTH]` | Dotted label without the last dot |
| DA32 | `DOB: 05/12/1990 00:00:00 (DOB)` | `DOB: [DATE_OF_BIRTH] (DOB)` | Time absorbed, then label |

### DG-series: fresh adversarial set, negatives (written after the main matrix, 22 cases)

| ID | Input | Output | Rule / why |
|---|---|---|---|
| DG01 | `DOB: 05/12/1990x` | `DOB: 05/12/1990x` | Letter glued after |
| DG02 | `DOB:05/12/1990Sex:M` | `DOB:05/12/1990Sex:M` | Next field glued to the date |
| DG03 | `DOB: 5/12/90/12` | `DOB: 5/12/90/12` | A fourth group |
| DG04 | `DOB: 99/99/99` | `DOB: 99/99/99` | No valid month or day |
| DG05 | `DOB: 0/0/0000` | `DOB: 0/0/0000` | Zeros |
| DG06 | `DOB: 1799-12-31` | `DOB: 1799-12-31` | Year just below the range |
| DG07 | `DOB: 2200-01-01` | `DOB: 2200-01-01` | Year just above the range |
| DG08 | `DOB: 12/5/90abc` | `DOB: 12/5/90abc` | Letters glued after a two-digit year |
| DG09 | `05/12/1990 and more text (DOB)` | `05/12/1990 and more text (DOB)` | After-label must come right after the date |
| DG10 | `05/12/1990 (DOB` | `05/12/1990 (DOB` | After-label needs its closing bracket |
| DG11 | `05/12/1990 DOB)` | `05/12/1990 DOB)` | After-label needs its opening bracket |
| DG12 | `DOB 12 Mayday 1990` | `DOB 12 Mayday 1990` | Month name glued to more letters |
| DG13 | `DOB: 12 Marching 1990` | `DOB: 12 Marching 1990` | Month name glued to more letters |
| DG14 | `DOB: 12 Maybe 1990` | `DOB: 12 Maybe 1990` | Month name glued to more letters |
| DG15 | `Visit 12/05/2024. DOB unknown.` | `Visit 12/05/2024. DOB unknown.` | Date before a label that has no date |
| DG16 | `born in 1990, married 05/12/2015` | `born in 1990, married 05/12/2015` | Another event after "born" |
| DG17 | `DOB: ٠٥/١٢/١٩٩٠` | `DOB: ٠٥/١٢/١٩٩٠` | Arabic-Indic digits: ASCII only |
| DG18 | `Date of birth: 3 children` | `Date of birth: 3 children` | Not a date |
| DG19 | `DOB: 05/12/1990-` | `DOB: [DATE_OF_BIRTH]-` | A trailing hyphen that is not followed by a digit does not block |
| DG20 | `DOB: 12 Dec` | `DOB: 12 Dec` | Day and month only |
| DG21 | `DOB: 1990-05` | `DOB: 1990-05` | Year and month only |
| DG22 | `DOB: 20240` | `DOB: 20240` | Five digits |

### DC-series: claim checks (behaviours stated in this document)

| ID | Claim | Input | Output |
|---|---|---|---|
| DC01 | The label may be up to 80 characters before the date (spaces only in between). *The table shortens the input; reconstructed in review from the stated length: `"DOB:" + 70 spaces + "05/12/1990"` (84 characters)* | `DOB:             …(84 characters)…   05/12/1990` | `…(long output)…          [DATE_OF_BIRTH]` |
| DC02 | A label further than the 80-character window has no effect. *The table shortens the input; reconstructed in review from the stated length: `"DOB:" + 90 spaces + "05/12/1990"` (104 characters)* | `DOB:             …(104 characters)…   05/12/1990` | `…(long output)…               05/12/1990` |
| DC03 | A valid time after an ISO date is absorbed | `DOB: 1990-05-12T10:30:00Z` | `DOB: [DATE_OF_BIRTH]` |
| DC04 | An invalid time is not absorbed; the date still is | `DOB: 1990-05-12T10:99:00Z` | `DOB: [DATE_OF_BIRTH]T10:99:00Z` |
| DC05 | The label after the date may be up to 40 characters away | `05/12/1990                              (DOB)` | `[DATE_OF_BIRTH]                              (DOB)` |
| DC06 | A label further than 40 characters after the date has no effect | `05/12/1990                                                  (DOB)` | `05/12/1990                                                  (DOB)` |
| DC07 | A CJK date after an English label | `DOB: 1990年5月12日` | `DOB: [DATE_OF_BIRTH]` |
| DC08 | Both day-first and month-first readings are accepted for an ambiguous date | `DOB: 12/12/1990` | `DOB: [DATE_OF_BIRTH]` |
| DC09 | A parenthesis that is not a format hint breaks the context | `DOB (mm/dd/yyyy/zz): 05/12/1990` | `DOB (mm/dd/yyyy/zz): 05/12/1990` |
| DC10 | The plural "DOBs" is not a label (L14) | `DOBs: 05/12/1990` | `DOBs: 05/12/1990` |
| DC11 | A time absorbed into the date, then the after-label | `05/12/1990 00:00:00 (DOB)` | `[DATE_OF_BIRTH] (DOB)` |
| DC12 | The same date is redacted in every occurrence and the label stays | `DOB: 05/12/1990 \| DOB: 05/12/1990` | `DOB: [DATE_OF_BIRTH] \| DOB: [DATE_OF_BIRTH]` |
| DC13 | Running the detector on its own output changes nothing for this sample (L15 shows when it does not) | `DOB: [DATE_OF_BIRTH], born on [DATE_OF_BIRTH] (DOB)` | `DOB: [DATE_OF_BIRTH], born on [DATE_OF_BIRTH] (DOB)` |
| DC14 | Month name followed by a day and a two-digit year (D/M/Y order check is not applied to names) | `DOB: Dec 31 99` | `DOB: [DATE_OF_BIRTH]` |
| DC15 | A keyword glued to a date with no separator is not accepted (the date left guard) | `DOB05/12/1990` | `DOB05/12/1990` |
| DC16 | An underscore after the label cannot be skipped | `DOB_05/12/1990` | `DOB_05/12/1990` |
| DC17 | Label and date inside one CJK sentence | `患者生年月日：1990年5月12日。` | `患者生年月日：[DATE_OF_BIRTH]。` |
| DC18 | Not idempotent (L15): a second run on the output of `DOB: 05/12/1990, 06/07/1992` redacts the date that follows the placeholder | `DOB: [DATE_OF_BIRTH], 06/07/1992` | `DOB: [DATE_OF_BIRTH], [DATE_OF_BIRTH]` |

---

## 10. Verification log

The rules were verified with a throwaway JavaScript reference sketch written from this specification (it is **not** the deliverable implementation). The final TypeScript implementation must pass the same tables in §9 as its unit tests.

### How the checks went (honest history)

1. **Matrix, first run.** The first 265 cases (series DP, DK, DM, DF, DS) passed 239 and failed 26. All 26 were **my wrong expectations** in the month-name rows (I had put the day into the prefix instead of the date). The detector was right; the rows were fixed. The limitation, adversarial and claim series added afterwards passed on their first run.
2. **Mutation check, first run: 6 survivors out of 125 mutants.** Each was analysed instead of just patched:
   - **Two label entries were redundant** (`出生年月日` is covered by `生年月日`, `誕生日` by `生日`, because CJK labels have no word boundaries). Removed.
   - **Two rules were redundant** (a line-break cut of the look-back window, and a right word boundary on labels): line breaks are not allowed characters anyway, and the date's own left guard rejects the same strings. Removed as dead rules.
   - **Two guards had no test** (a letter or underscore directly before a date that has an after-label, and a date that is the tail of a longer number with an after-label). Tests added (`x05/12/1990 (DOB)`, `1.12/05/1990 (DOB)`).
   - **A real inconsistency was exposed:** a CJK label glued to a numeric date (`生年月日05/12/1990`) and Japanese text glued after one (`05/12/1990です`) were rejected by the glue guard, which would leak real dates because CJK text has no spaces. Fixed: CJK letters are no longer glue (D10). After the fixes: 121 mutants, **0 survivors**.
3. **Fuzzing found two things.** (a) 83 oracle rejections, all `12th of May, 1990`: a bug in **my oracle** (it did not understand ordinals), fixed. (b) The detector was **not idempotent** in about 1 of 1,000 random inputs: the placeholder `[DATE_OF_BIRTH]` itself contains the label "date of birth". Confirmed by swapping the placeholder for neutral text (0 failures) and recorded as L15.

### Checks

1. **Review checklist** against the brief:

| Requirement | Covered by |
|---|---|
| Dates in explicit date-of-birth contexts | D1, §5.4; series DP, DK |
| The brief's example (`DOB: 1990-05-12`) | DP09 and the first rows of DP |
| A bare date is not a date of birth | DF01-DF05 |
| Different formats of the same entity | DP (ISO, numeric, 2-digit year, compact, written months, CJK, Korean, timestamps), DM |
| False positives (ordinary dates, other labels, numbers) | DF, DG, §5.2-§5.4 |
| Multiple occurrences | DS01-DS05, DS17, DP (several labelled dates) |
| Overlaps and duplicate replacement | D17; fuzz invariant: spans sorted and non-overlapping; §7 for other entities |
| Punctuation, line breaks, Unicode | DS series, DP (JSON, Markdown, CJK), DF (line break), §6 |
| Missing / empty input | detector-level: empty string yields no spans (DF); `null` / non-string belong to the service layer |
| "Must not silently corrupt unrelated text" | fuzz invariant: rebuilding from untouched slices equals the output; recall test checks surroundings exactly |
| Document limitations | §8 (17 entries) |

2. **Fuzzing with an independent oracle (two batches).** Batch 1: 80,000 random strings built from labels (in every language and spelling), date fragments (valid and invalid), allowed characters, filler words, month names and junk (letters, digits, emoji, combining marks, Arabic-Indic and fullwidth digits, CJK, zero-width characters). Batch 2: 80,000 **valid generated entries with 1-3 random character edits** (insert, delete, replace), so that most inputs sit next to a match (62,213 contained a match). **0 exceptions; 0 invariant failures** in both (every span in range, sorted, non-overlapping, rebuilding from untouched slices equals the output). **Oracle:** every match was re-checked by a separately written checker that uses a different technique (manual label matching, a forward search over the allowed characters, fillers and hints, and hand-written date parsers instead of regular expressions): **0 rejections** in both batches.
3. **Recall test:** 30,000 generated texts with 1-4 labelled dates each (**74,597 entries**: random labels in every language, random spelling, case and separators, random connectors, every date format with random valid values, time suffixes, and gaps of words, punctuation, line breaks and emoji). **0 failures:** every date replaced, every other character byte-identical.
4. **Mutation check:** **121 deliberate weakenings** of the rules, **every one made tests fail**, including **one mutant per entry** of each data list (labels, filler words, month names and allowed characters):

| Group of mutations | Mutants | Detected | Example failing tests |
|---|---|---|---|
| Formats | 8 | 8 | DP01(77), DP11(101), DP17(6) |
| Date validation | 7 | 7 | DP13(6), DP12(5), DF08(6) |
| Date guards | 6 | 6 | DF43(2), DF45(2), DF18(12) |
| Time suffix | 5 | 5 | DP48(5), DP51(4), DP52(2) |
| Context rules | 7 | 7 | DP67(5), DP63(6), DP58(39) |
| Label entries | 32 | 32 | DP01(182), DP58(14), DK13(5) |
| Filler words | 4 | 4 | DP74(2), DP75(2), DP71(5) |
| Month names | 24 | 24 | DM01(2), DM02(2), DP38(2) |
| Allowed characters between label and date | 28 | 28 | DP01(200), DP84(2), DK56(2) |
| **Total** | **121** | **121** | |

5. **Performance / pathological input** (220-305 KB each): worst case **≈80 ms**; no catastrophic backtracking. The context check only looks at a fixed window (80 characters before, 40 after) and only runs for dates that passed validation.

| Input (≈ size) | Time | Spans |
|---|---|---|
| DOB: 05/12/1990 repeated (304 KB) | 80 ms | 19000 |
| dates with no label repeated (297 KB) | 54 ms | 0 |
| written dates, no label (300 KB) | 48 ms | 0 |
| "DOB: " repeated, no date (300 KB) | 12 ms | 0 |
| digits only (300 KB) | 3 ms | 0 |
| "1-1-1-" chains (300 KB) | 40 ms | 0 |
| "1/1/1990/" chains (297 KB) | 56 ms | 0 |
| letters only (300 KB) | 11 ms | 0 |
| "May " repeated (300 KB) | 19 ms | 0 |
| label + 70 punctuation + date, repeated (298 KB) | 10 ms | 3500 |
| label + fillers + date, repeated (281 KB) | 28 ms | 5500 |
| spaces after a label (300 KB) | 1 ms | 0 |
| nested hint parentheses (280 KB) | 12 ms | 5000 |
| time suffixes (287 KB) | 20 ms | 7000 |
| CJK dates (224 KB) | 29 ms | 14000 |
| after-labels (289 KB) | 28 ms | 17000 |
| T and digits (297 KB) | 53 ms | 0 |

6. **Cross-check against the other detectors' test tables:** the detector was run over **1,223** distinct strings taken from the PHONE, EMAIL, IP_ADDRESS and CREDIT_CARD test tables (inputs and outputs). It matched **8** strings, which are 6 distinct rows: PHONE E01 (the task giver's example, in its original and PHONE-only forms), PHONE C08-C11 (`DOB: 1990-05-12`, `DOB: 05/12/1990`, `DOB: 12-05-1990`, `born on 12.05.1990`), and CREDIT_CARD CC51 (the same example). **Every one has an explicit label; no phone number, email address, IP address, card, ISBN, UUID or timestamp row is touched.** The SSN test table was not available in this session, so it was not part of the cross-check.
7. **Claim check (series DC):** every concrete behaviour claimed in this document that was not already a matrix row was executed; results are in the DC table.

### Final numbers

| Check | Result |
|---|---|
| Matrix | 355 / 355 (DP 87, DK 81, DM 28, DF 57, DS 19, DL 29, DA 32, DG 22); 6 rows added later (DP88-DP93, see below) |
| Claim checks | 18 executed, behaviour as documented |
| Mutation check | 121 / 121 mutants detected |
| Fuzz with independent oracle | 2 × 80,000 inputs: 0 exceptions, 0 invariant failures, 0 oracle rejections |
| Idempotence probe | 77 of 80,000 not idempotent, all caused by the placeholder text (L15); 0 with neutral placeholder |
| Recall test | 30,000 generated texts (74,597 entries): 0 failures |
| Cross-check with PHONE, EMAIL, IP_ADDRESS, CREDIT_CARD tables | 1,223 strings, 6 distinct rows matched, all with an explicit label |
| Worst-case time | ≈80 ms on 220-305 KB pathological input |

### Changed after the first implementation

- **D3 / §5.4:** a label line ending with a colon may be followed by the date at the start of the next line. DF31 changed (`DOB:⏎05/12/1990` is now redacted) and DP88-DP93 were added. DL15, DL16, DS03, DS04, DS07 and DA25 (rows with line breaks) were checked and are unchanged. Changed after implementation; executed by the TypeScript tests.

### Not verified

- **How often real text uses a label that is not in the list, or writes other words between label and date.** The lists and the "directly before" rule are judgements, not derived from a corpus (L1, L17).
- **The non-English label lists** were written without review by native speakers.
- **Integration with the other detectors**: only the cross-check above was possible, and the SSN table was not available. The integration tests must cover §7.

---

## 11. Notes for the TypeScript implementation

- One detector object: `{ type: "DATE_OF_BIRTH", find(text): Span[] }`.
- Keep the **label list** (`string[][]`), the **filler words**, the **month-name table**, the **allowed characters**, the **year range**, the **look-back and look-ahead windows** and the **separator sets** as **data constants**. Extending to other languages (O3) or removing `birthday` (O1) is then a data change.
- The reference sketch built one case-insensitive Unicode regular expression for the before-context from the label list (`LABEL` followed by `(allowed+ (filler|hint))* allowed*` anchored at the end of the look-back window) and one for the after-context, and one sticky regular expression per date format. Build them **once** when the detector is created, not on every call.
- Offsets are UTF-16 code-unit indices into the original string, the same indices the replacer uses. Guards read the neighbouring **code point**, so emoji and astral letters next to a date are handled safely.
- Unicode-aware classes need the regular-expression `u` flag (`\p{L}`, `\p{N}`, `\p{M}`, `\p{Script=Han}` and so on); label matching needs the `i` flag.
- A year range with fixed numbers (1800-2199) keeps the detector independent of the system clock.
- Spans of this detector cannot overlap each other (D17); the shared resolver still resolves overlaps with other entity types (§7).
- Unit tests: build them directly from the §9 tables (every row has an input and an exact expected output).
