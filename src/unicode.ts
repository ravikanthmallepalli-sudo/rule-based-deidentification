// Small character helpers shared by the detectors.
// JavaScript strings are UTF-16: an emoji such as 😀 takes TWO code units, so `text[i - 1]` would see
// only half of it. These helpers read the whole neighbouring CODE POINT; offsets stay code-unit indices.

// The code point that ENDS at `index` (the character just before it), or `undefined` at the start.
// `number | undefined` is a union type: the result is a number or undefined.
export function codePointBefore(text: string, index: number): number | undefined {
  if (index <= 0) return undefined;
  const last = text.charCodeAt(index - 1);
  // A low surrogate (DC00-DFFF) preceded by a high surrogate (D800-DBFF) is one code point.
  if (last >= 0xdc00 && last <= 0xdfff && index >= 2) {
    const first = text.charCodeAt(index - 2);
    if (first >= 0xd800 && first <= 0xdbff) {
      return text.codePointAt(index - 2);
    }
  }
  return last;
}

// The code point that STARTS at `index` (the character just after a match that
// ends at `index`), or `undefined` at the end of the text.
export function codePointAfter(text: string, index: number): number | undefined {
  if (index >= text.length) return undefined;
  return text.codePointAt(index);
}

// How many code units a code point occupies (1, or 2 for a surrogate pair).
export function codeUnitLength(codePoint: number): number {
  return codePoint > 0xffff ? 2 : 1;
}

// Unicode property classes, built once. The `u` flag is required for \p{...}.
const LETTER = /^\p{L}$/u; // any letter, any script
const MARK = /^\p{M}$/u; // combining marks (e.g. U+0301 combining acute accent)
const NUMBER = /^\p{N}$/u; // any number: ASCII digits, Arabic-Indic digits, ², Ⅻ ...
// Han (Chinese characters), Hiragana, Katakana and Hangul: scripts written without spaces.
export const CJK_LETTER_CLASS = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}";
const CJK_LETTER = new RegExp(`^[${CJK_LETTER_CLASS}]$`, "u");

// Turn a code point into a one-character string ("" at the edge of the text), so it can be
// tested with a regex or looked up in a list of characters.
export function charOf(codePoint: number | undefined): string {
  return codePoint === undefined ? "" : String.fromCodePoint(codePoint);
}

// ASCII digit 0-9 only (the specs never accept other digits as part of a value).
export function isAsciiDigit(codePoint: number | undefined): boolean {
  return codePoint !== undefined && codePoint >= 0x30 && codePoint <= 0x39;
}

// ASCII letter a-z or A-Z.
export function isAsciiLetter(codePoint: number | undefined): boolean {
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x41 && codePoint <= 0x5a) || (codePoint >= 0x61 && codePoint <= 0x7a))
  );
}

export function isLetter(codePoint: number | undefined): boolean {
  return LETTER.test(charOf(codePoint));
}

function isMark(codePoint: number | undefined): boolean {
  return MARK.test(charOf(codePoint));
}

export function isUnicodeNumber(codePoint: number | undefined): boolean {
  return NUMBER.test(charOf(codePoint));
}

export function isCjkLetter(codePoint: number | undefined): boolean {
  return CJK_LETTER.test(charOf(codePoint));
}

// "Letter-like" in the specs: a letter, any number, a combining mark or `_`.
// A value glued to one of these is part of a longer token (an identifier, a word).
export function isLetterLike(codePoint: number | undefined): boolean {
  return isLetter(codePoint) || isUnicodeNumber(codePoint) || isMark(codePoint) || codePoint === 0x5f;
}

// Line breaks end every context window (\n and \r).
export function isLineBreak(codePoint: number | undefined): boolean {
  return codePoint === 0x0a || codePoint === 0x0d;
}

// "Not preceded by a letter, mark or digit", as a regex fragment (with the `u` flag):
// a keyword or label that follows it starts a word, not the middle of one.
export const WORD_START = "(?<![\\p{L}\\p{M}\\p{N}])";

// The "letter-like" guard class as a regex fragment, for use inside [...] with the `u` flag.
export const LETTER_LIKE_CLASS = "\\p{L}\\p{N}\\p{M}_";

// Escape characters so they can be listed inside a regex character class [...].
// `readonly string[]`: an array of strings that this function does not change.
export function escapeForCharClass(characters: readonly string[]): string {
  return characters.map((c) => c.replace(/[\\\]\[^-]/g, "\\$&")).join("");
}

// Escape a word so it matches literally inside a regex ("d.o.b" -> "d\.o\.b"). Only syntax characters:
// with the `u` flag, escaping anything else (such as `-` outside [...]) is a syntax error.
export function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
