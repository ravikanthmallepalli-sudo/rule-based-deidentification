// DATE_OF_BIRTH detector: a full date with a date-of-birth label right before it (`DOB: 1990-05-12`) or after it.
// Spec: docs/DATE_OF_BIRTH_detection_rules.md (§ = section, L = row in the Limitations table, §8).
// Top limitations:
//   other words between label and date leak (`born in Chicago on 12 May 1990`) (L1);
//   month names are English only (`geboren am 12. Mai 1990` leaks) (L3);
//   a label on another line without a colon leaks, e.g. CSV headers and table layouts (L7).

import {
  DOB_AFTER_LABEL_SPACES,
  DOB_ALLOWED_BETWEEN,
  DOB_CJK_MARKERS,
  DOB_DATE_SEPARATORS,
  DOB_DAY_MAX,
  DOB_FILLER_WORDS,
  DOB_HINT_LETTERS,
  DOB_HINT_SEPARATORS,
  DOB_KOREAN_MARKERS,
  DOB_LABEL_LINE_COLONS,
  DOB_LABEL_WORD_SEPARATORS,
  DOB_LABELS,
  DOB_LOOK_AHEAD,
  DOB_LOOK_BACK,
  DOB_MAX_HOUR,
  DOB_MAX_MINUTE,
  DOB_MAX_SECOND,
  DOB_MONTH_MAX,
  DOB_MONTH_NAMES,
  DOB_NEXT_LINE_SPACES,
  DOB_ORDINAL_SUFFIXES,
  DOB_WRITTEN_PUNCTUATION,
  DOB_WRITTEN_SPACES,
  DOB_YEAR_MAX,
  DOB_YEAR_MIN,
} from "../data/dobData";
import type { Detector, Span } from "../types";
import {
  charOf,
  codePointAfter,
  codePointBefore,
  escapeForCharClass,
  escapeRegExp,
  isAsciiDigit,
  isAsciiLetter,
  isCjkLetter,
  isLetter,
  isLetterLike,
  WORD_START,
} from "../unicode";

// ---- Regex building blocks, built once from the data ----

const DATE_SEP = `[${escapeForCharClass(DOB_DATE_SEPARATORS)}]`; // - / . and Unicode dashes
const SPACE = `[${escapeForCharClass(DOB_WRITTEN_SPACES)}]`;
// Written-date separator: 1-2 spaces | optional space, - / . , optional space | comma, optional space.
const WRITTEN_SEP = `(?:${SPACE}{1,2}|${SPACE}?[${escapeForCharClass(DOB_WRITTEN_PUNCTUATION)}]${SPACE}?|,${SPACE}?)`;
// Month names, longest first so `september` is tried before `sep`; abbreviations may take a period.
const MONTH = `(?:${[...DOB_MONTH_NAMES]
  .sort((a, b) => b.name.length - a.name.length)
  .map((m) => (m.abbreviation ? `${m.name}\\.?` : m.name))
  .join("|")})`;
// A written day: 1-2 digits with an optional ordinal suffix (`12th`).
const DAY = `([0-9]{1,2})(?:${DOB_ORDINAL_SUFFIXES.join("|")})?`;

// `y` (sticky) makes a regex match exactly at `lastIndex`; `i` ignores case; `u` = Unicode.
// `source: string` is a parameter type; `: RegExp` is the return type.
function sticky(source: string): RegExp {
  return new RegExp(source, "yiu");
}

// One date format: its regex and its validity check (§5.1, §5.2).
// `(match: RegExpExecArray) => boolean` is a function type: it takes a match, returns a boolean.
interface DateFormat {
  name: string;
  regex: RegExp;
  isValid: (match: RegExpExecArray) => boolean;
  numeric: boolean; // a time suffix may be absorbed after numeric dates (D9)
}

// Validity: month 1-12, day 1-31, 4-digit year 1800-2199; no clock, no month lengths (§5.2).
function isMonth(value: string): boolean {
  const n = Number(value);
  return n >= 1 && n <= DOB_MONTH_MAX;
}
function isDay(value: string): boolean {
  const n = Number(value);
  return n >= 1 && n <= DOB_DAY_MAX;
}
function isYear(value: string): boolean {
  if (value.length === 2) return true; // a two-digit year is not checked
  const n = Number(value);
  return n >= DOB_YEAR_MIN && n <= DOB_YEAR_MAX;
}
// An ambiguous numeric date is valid as month/day OR as day/month (D7).
function isMonthAndDayInEitherOrder(a: string, b: string): boolean {
  return (isMonth(a) && isDay(b)) || (isMonth(b) && isDay(a));
}
function isYearMonthDay(year: string, month: string, day: string): boolean {
  return isYear(year) && isMonth(month) && isDay(day);
}
// Compact 8 digits: valid as YYYYMMDD, DDMMYYYY or MMDDYYYY (§5.1).
function isCompactDate(d: string): boolean {
  return (
    isYearMonthDay(d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)) ||
    isYearMonthDay(d.slice(4, 8), d.slice(2, 4), d.slice(0, 2)) ||
    isYearMonthDay(d.slice(4, 8), d.slice(0, 2), d.slice(2, 4))
  );
}

// `markers: { year: string; month: string; day: string }` describes an object parameter inline.
function cjkFormat(name: string, markers: { year: string; month: string; day: string }): DateFormat {
  // YYYY年M月D日, optional single spaces around the markers.
  const regex = sticky(`([0-9]{4}) ?${markers.year} ?([0-9]{1,2}) ?${markers.month} ?([0-9]{1,2}) ?${markers.day}`);
  return { name, regex, isValid: (m) => isYearMonthDay(m[1], m[2], m[3]), numeric: false };
}

// The formats in the order they are tried (§4 step 2).
const DATE_FORMATS: DateFormat[] = [
  cjkFormat("CJK", DOB_CJK_MARKERS),
  cjkFormat("Korean", DOB_KOREAN_MARKERS),
  {
    name: "ISO-like", // 1990-05-12, 1990/5/2
    regex: sticky(`([0-9]{4})${DATE_SEP}([0-9]{1,2})${DATE_SEP}([0-9]{1,2})`),
    isValid: (m) => isYearMonthDay(m[1], m[2], m[3]),
    numeric: true,
  },
  {
    name: "numeric, 4-digit year", // 05/12/1990, 31/12/1990
    regex: sticky(`([0-9]{1,2})${DATE_SEP}([0-9]{1,2})${DATE_SEP}([0-9]{4})`),
    isValid: (m) => isMonthAndDayInEitherOrder(m[1], m[2]) && isYear(m[3]),
    numeric: true,
  },
  {
    name: "numeric, 2-digit year", // 05/12/90
    regex: sticky(`([0-9]{1,2})${DATE_SEP}([0-9]{1,2})${DATE_SEP}([0-9]{2})`),
    isValid: (m) => isMonthAndDayInEitherOrder(m[1], m[2]),
    numeric: true,
  },
  {
    name: "compact", // 19900512, 31121990, 12311990
    regex: sticky("([0-9]{8})"),
    isValid: (m) => isCompactDate(m[1]),
    numeric: true,
  },
  {
    name: "written, day first", // 12 May 1990, 12th of May, 1990, 12-MAY-90
    regex: sticky(`${DAY}${WRITTEN_SEP}(?:of )?${MONTH}${WRITTEN_SEP}([0-9]{4}|[0-9]{2})`),
    isValid: (m) => isDay(m[1]) && isYear(m[2]),
    numeric: false,
  },
  {
    name: "written, month first", // May 12, 1990, Sept. 12, 1990
    regex: sticky(`${MONTH}${WRITTEN_SEP}${DAY}${WRITTEN_SEP}([0-9]{4}|[0-9]{2})`),
    isValid: (m) => isDay(m[1]) && isYear(m[2]),
    numeric: false,
  },
];

// Time suffix (D9): `T` + hh:mm[:ss[.fraction]] + optional zone (Z, +05:30, -0500) ...
const T_TIME = sticky("T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\\.[0-9]+)?)?(?:Z|[+-][0-9]{2}:?[0-9]{2})?");
// ... or a space + a time that has seconds or AM/PM (`12:00:00 AM`, `12:00 PM`; not `10:30`).
const SPACE_TIME = sticky(" ([0-9]{1,2}):([0-9]{2})(?::([0-9]{2})(?:\\.[0-9]+)?)?(?: ?([ap]m))?");

// ---- Context regexes (§5.4), built once from the label list ----

const LABEL_WORD_SEP = `[${escapeForCharClass(DOB_LABEL_WORD_SEPARATORS)}]{0,2}`;
// A label's words joined by 0-2 separators: ["date","of","birth"] -> date[sep]{0,2}of[sep]{0,2}birth
function labelPattern(words: readonly string[]): string {
  return words.map(escapeRegExp).join(LABEL_WORD_SEP);
}
const isCjkLabel = (words: readonly string[]) => isCjkLetter(words[0].codePointAt(0));
const WORD_LABELS = DOB_LABELS.filter((w) => !isCjkLabel(w)).map(labelPattern).join("|");
const CJK_LABELS = DOB_LABELS.filter(isCjkLabel).map(labelPattern).join("|");
// A label: a word label that does not start inside a longer word, or a CJK label (no boundary).
const LABEL = `(?:${WORD_START}(?:${WORD_LABELS})|(?:${CJK_LABELS}))`;

const ALLOWED = `[${escapeForCharClass(DOB_ALLOWED_BETWEEN)}]`;
const FILLER = `(?:${DOB_FILLER_WORDS.join("|")})`;
// Format hint: ( + 2-3 groups of 1-4 letters d/m/y joined by space / . - + ), e.g. (MM/DD/YYYY).
const HINT_GROUP = `[${DOB_HINT_LETTERS.join("")}]{1,4}`;
const HINT = `\\(${HINT_GROUP}(?:[${escapeForCharClass(DOB_HINT_SEPARATORS)}]${HINT_GROUP}){1,2}\\)`;

// Before-context: the window must END with LABEL, then zero or more (allowed characters + (filler | hint)),
// then allowed characters. Linear in practice: fillers are letters and a hint must match exactly.
const BEFORE_CONTEXT = new RegExp(`${LABEL}(?:${ALLOWED}+(?:${FILLER}|${HINT}))*${ALLOWED}*$`, "iu");

// Next-line case (D3 exception): LABEL, allowed characters that include a colon, exactly one
// line break (\n or \r\n), then only spaces or tabs before the date (`DOB:⏎05/12/1990`).
const COLON = `[${escapeForCharClass(DOB_LABEL_LINE_COLONS)}]`;
const NEXT_LINE_SPACE = `[${escapeForCharClass(DOB_NEXT_LINE_SPACES)}]`;
const LABEL_LINE_ABOVE = new RegExp(`${LABEL}${ALLOWED}*${COLON}${ALLOWED}*\\r?\\n${NEXT_LINE_SPACE}*$`, "iu");

// After-context: right after the date, optional spaces, ( or [, a label, ) or ], spaces allowed inside
// (`05/12/1990 (DOB)`). `^` anchors it at the end of the date.
const AFTER_SPACE = `[${escapeForCharClass(DOB_AFTER_LABEL_SPACES)}]*`;
const AFTER_CONTEXT = new RegExp(
  `^${AFTER_SPACE}[(\\[]${AFTER_SPACE}(?:${WORD_LABELS}|${CJK_LABELS})${AFTER_SPACE}[)\\]]`,
  "iu",
);

// ---- Guards, time suffix and context ----

// "Glue" (§2): a letter, number, mark or `_` touching the date. CJK letters are not glue (D10),
// because CJK text has no spaces (`生年月日05/12/1990`, `05/12/1990です`).
function isGlue(codePoint: number | undefined): boolean {
  return isLetterLike(codePoint) && !isCjkLetter(codePoint);
}

function isDateSeparator(codePoint: number | undefined): boolean {
  return DOB_DATE_SEPARATORS.includes(charOf(codePoint));
}

// Left guard: no glue before the date, and not the tail of a longer number (`1.12/05/1990`) (§5.3).
function leftGuard(text: string, start: number): boolean {
  const before = codePointBefore(text, start);
  if (isGlue(before)) return false;
  return !(isDateSeparator(before) && isAsciiDigit(codePointBefore(text, start - 1)));
}

// Right guard: no glue after the date (a `T` + digit starts a time), and no separator + digit
// (`05/12/1990-1991`) (§5.3).
function rightGuard(text: string, end: number): boolean {
  const after = codePointAfter(text, end);
  if (after === 0x54 /* T */ && isAsciiDigit(codePointAfter(text, end + 1))) return true;
  if (isGlue(after)) return false;
  return !(isDateSeparator(after) && isAsciiDigit(codePointAfter(text, end + 1)));
}

// The end of a valid time suffix starting at `end`, or null (D9).
function absorbTime(text: string, end: number): number | null {
  for (const regex of [T_TIME, SPACE_TIME]) {
    regex.lastIndex = end; // sticky regexes keep state: always set lastIndex first
    const m = regex.exec(text);
    if (m === null) continue;
    const [whole, hours, minutes, seconds, amPm] = m;
    const isSpaceForm = regex === SPACE_TIME;
    if (isSpaceForm && seconds === undefined && amPm === undefined) continue; // `10:30` stays
    const valid =
      Number(hours) <= DOB_MAX_HOUR &&
      Number(minutes) <= DOB_MAX_MINUTE &&
      (seconds === undefined || Number(seconds) <= DOB_MAX_SECOND);
    if (valid) return end + whole.length;
  }
  return null;
}

// Is a label directly before the date, on the same line or on a line above ending with a colon? (§5.4)
function hasLabelBefore(text: string, start: number): boolean {
  const window = text.slice(Math.max(0, start - DOB_LOOK_BACK), start);
  return BEFORE_CONTEXT.test(window) || LABEL_LINE_ABOVE.test(window);
}

// Is `(label)` or `[label]` right after the date, within 40 characters? (§5.4)
function hasLabelAfter(text: string, end: number): boolean {
  return AFTER_CONTEXT.test(text.slice(end, end + DOB_LOOK_AHEAD));
}

// ---- The scan ----

// Can a date start here: a digit not after a digit, or an ASCII letter not after a letter (§4 step 2).
function canStartDate(text: string, i: number): boolean {
  const here = text.charCodeAt(i);
  const before = codePointBefore(text, i);
  if (isAsciiDigit(here)) return !isAsciiDigit(before);
  return isAsciiLetter(here) && !isLetter(before);
}

// The end of the first valid, guarded date at `start` (with its time suffix if allowed), or null
// (§4 steps 2-3).
function findDateAt(text: string, start: number): number | null {
  if (!leftGuard(text, start)) return null;
  for (const format of DATE_FORMATS) {
    format.regex.lastIndex = start;
    const match = format.regex.exec(text);
    if (match === null || !format.isValid(match)) continue;
    const end = start + match[0].length;
    if (format.numeric) {
      const withTime = absorbTime(text, end);
      if (withTime !== null && rightGuard(text, withTime)) return withTime;
    }
    if (rightGuard(text, end)) return end;
  }
  return null;
}

// Find every date of birth: scan left to right, accept a labelled date, continue after it (§4, D17).
function findDatesOfBirth(text: string): Span[] {
  const spans: Span[] = [];
  let i = 0;
  while (i < text.length) {
    if (canStartDate(text, i)) {
      const end = findDateAt(text, i);
      if (end !== null && (hasLabelBefore(text, i) || hasLabelAfter(text, end))) {
        spans.push({ type: "DATE_OF_BIRTH", start: i, end });
        i = end;
        continue;
      }
    }
    i += 1;
  }
  return spans;
}

export const dateOfBirthDetector: Detector = { type: "DATE_OF_BIRTH", find: findDatesOfBirth };
