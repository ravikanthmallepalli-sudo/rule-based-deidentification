// Data for the DATE_OF_BIRTH detector (DATE_OF_BIRTH_detection_rules.md §4 constants,
// §5.1 month names, §5.5 labels, filler words and allowed characters).

// Lenient calendar (D8, decision O2): fixed numbers, no clock, no month-length check.
export const DOB_YEAR_MIN = 1800; // for 4-digit years only; 2-digit years are not checked
export const DOB_YEAR_MAX = 2199;
export const DOB_MONTH_MAX = 12;
export const DOB_DAY_MAX = 31;

// Context windows (§5.4): a label up to 80 characters before the date (same line),
// or `(label)` / `[label]` up to 40 characters after it.
export const DOB_LOOK_BACK = 80;
export const DOB_LOOK_AHEAD = 40;

// Separators inside a numeric date (`1990-05-12`, `05/12/1990`, `12.05.1990`); each
// separator of one date is chosen independently.
export const DOB_DATE_SEPARATORS: readonly string[] = [
  "-", "/", ".",
  "\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2015", // hyphen ... horizontal bar
  "\u2212", // minus sign
];

// Labels (§5.5, D2): word lists joined by 0-2 separators, so ["date", "of", "birth"] matches `dateOfBirth`.
// `readonly (readonly string[])[]`: a list of word lists that must not be changed.
export const DOB_LABELS: readonly (readonly string[])[] = [
  // English
  ["d", "o", "b"], ["date", "of", "birth"], ["birth", "date"], ["born"],
  ["birthday"], ["bday"], ["b-day"],
  // German
  ["geburtsdatum"], ["geboren", "am"], ["geburtstag"],
  // Spanish
  ["fecha", "de", "nacimiento"], ["nacido", "el"], ["nacida", "el"],
  // French
  ["date", "de", "naissance"], ["né", "le"], ["née", "le"],
  // Portuguese
  ["data", "de", "nascimento"], ["nascido", "em"], ["nascida", "em"],
  // Italian
  ["data", "di", "nascita"], ["nato", "il"], ["nata", "il"],
  // Dutch
  ["geboortedatum"],
  // Russian
  ["дата", "рождения"], ["родился"], ["родилась"],
  // Hindi
  ["जन्म", "तिथि"],
  // Chinese / Japanese (matched without word boundaries, so 生年月日 also matches inside
  // 出生年月日 and 生日 inside 誕生日)
  ["生年月日"], ["出生日期"], ["生日"],
  // Korean
  ["생년월일"],
  // Arabic
  ["تاريخ", "الميلاد"],
];

// 0-2 of these join the words of one label: space, tab, NBSP, `_`, `.`, `-`, `/`.
export const DOB_LABEL_WORD_SEPARATORS: readonly string[] = [" ", "\t", "\u00A0", "_", ".", "-", "/"];

// Filler words that may sit between the label and the date (D13): `born on the 12th ...`.
export const DOB_FILLER_WORDS: readonly string[] = ["is", "was", "on", "the"];

// The 28 characters that may sit between a label and the date (§5.5).
// Letters, digits and line breaks are not in the list, so other words break the context.
export const DOB_ALLOWED_BETWEEN: readonly string[] = [
  " ", "\t", "\u00A0", "\u2009", "\u202F", // space, tab, NBSP, thin space, narrow NBSP
  ":", "\uFF1A", "=", ".", "#", // colon, fullwidth colon, equals, dot, hash
  "-", "\u2013", "\u2014", // hyphen, en dash, em dash
  "(", ")", "[", "]", // brackets
  '"', "'", "\u201C", "\u201D", "\u2018", "\u2019", // straight and curly quotes
  ",", ";", "/", "|", "*",
];

// Next-line case (D3 exception, §5.4): a label line ending with one of these colons may be followed by
// the date on the next line, with only these spaces before it.
export const DOB_LABEL_LINE_COLONS: readonly string[] = [":", "\uFF1A"]; // colon, fullwidth colon
export const DOB_NEXT_LINE_SPACES: readonly string[] = [" ", "\t"];

// Spaces allowed around the bracketed label after the date (`05/12/1990 (DOB)`):
// the whitespace members of DOB_ALLOWED_BETWEEN.
export const DOB_AFTER_LABEL_SPACES: readonly string[] = [" ", "\t", "\u00A0", "\u2009", "\u202F"];

// Format hint after a label (§5.4): `(` + 2-3 groups of 1-4 of these letters, joined by
// one of the hint separators, + `)`, e.g. `(MM/DD/YYYY)`, `(dd-mm-yy)`.
export const DOB_HINT_LETTERS: readonly string[] = ["d", "m", "y"];
export const DOB_HINT_SEPARATORS: readonly string[] = [" ", "/", ".", "-"];

// English month names (§5.1, D11). `abbreviation: true` = may be followed by a period
// (`Sept. 12, 1990`).
export const DOB_MONTH_NAMES: readonly { name: string; month: number; abbreviation: boolean }[] = [
  { name: "january", month: 1, abbreviation: false }, { name: "jan", month: 1, abbreviation: true },
  { name: "february", month: 2, abbreviation: false }, { name: "feb", month: 2, abbreviation: true },
  { name: "march", month: 3, abbreviation: false }, { name: "mar", month: 3, abbreviation: true },
  { name: "april", month: 4, abbreviation: false }, { name: "apr", month: 4, abbreviation: true },
  { name: "may", month: 5, abbreviation: false },
  { name: "june", month: 6, abbreviation: true }, { name: "jun", month: 6, abbreviation: true },
  { name: "july", month: 7, abbreviation: true }, { name: "jul", month: 7, abbreviation: true },
  { name: "august", month: 8, abbreviation: false }, { name: "aug", month: 8, abbreviation: true },
  { name: "september", month: 9, abbreviation: false }, { name: "sept", month: 9, abbreviation: true },
  { name: "sep", month: 9, abbreviation: true },
  { name: "october", month: 10, abbreviation: false }, { name: "oct", month: 10, abbreviation: true },
  { name: "november", month: 11, abbreviation: false }, { name: "nov", month: 11, abbreviation: true },
  { name: "december", month: 12, abbreviation: false }, { name: "dec", month: 12, abbreviation: true },
];

// Ordinal suffixes after a written day (`12th`, `1st`, `2nd`, `3rd`).
export const DOB_ORDINAL_SUFFIXES: readonly string[] = ["st", "nd", "rd", "th"];

// Separators of a written date (§5.1): one or two spaces / NBSP; or a hyphen, slash or dot
// with an optional space on each side; or a comma with an optional space (`May 12, 1990`).
export const DOB_WRITTEN_SPACES: readonly string[] = [" ", "\u00A0"];
export const DOB_WRITTEN_PUNCTUATION: readonly string[] = ["-", "/", "."];

// Year / month / day markers of Chinese-Japanese (`1990年5月12日`) and Korean
// (`1990년 5월 12일`) dates.
export const DOB_CJK_MARKERS = { year: "年", month: "月", day: "日" };
export const DOB_KOREAN_MARKERS = { year: "년", month: "월", day: "일" };

// A time after a numeric date is absorbed only when it is valid (D9).
export const DOB_MAX_HOUR = 23;
export const DOB_MAX_MINUTE = 59;
export const DOB_MAX_SECOND = 59;
