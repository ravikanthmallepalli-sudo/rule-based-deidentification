// The "keyword right before the value" check shared by PHONE §8.1 and IP_ADDRESS §5.3: on the same line,
// the text must end with KEYWORD, then zero or more (separators + filler word), then optional separators.

import { CJK_LETTER_CLASS, escapeForCharClass, escapeRegExp, WORD_START } from "./unicode";

// The lists and the window of one detector's context rule.
export interface KeywordContextRules {
  keywords: readonly string[];
  fillers: readonly string[];
  separators: readonly string[]; // allowed besides whitespace (never a line break)
  window: number; // how many code units before the value are read
}

// Words as a regex alternation (`a|b|c`), longest first, matched literally; the words of a multi-word
// entry (`my number`) may be separated by one or more spaces or tabs.
export function wordAlternation(words: readonly string[]): string {
  return [...words]
    .sort((a, b) => b.length - a.length)
    .map((entry) => entry.split(/\s+/).map(escapeRegExp).join("[ \\t]+"))
    .join("|");
}

const STARTS_WITH_CJK = new RegExp(`^[${CJK_LETTER_CLASS}]`, "u");

// The keyword alternation, anchored at the end of the window. CJK text has no spaces, so a CJK
// keyword needs no word boundary (`患者电话`); every other keyword must start a word (WORD_START).
function keywordsAtEnd(keywords: readonly string[]): RegExp {
  const cjk = keywords.filter((word) => STARTS_WITH_CJK.test(word));
  const other = keywords.filter((word) => !STARTS_WITH_CJK.test(word));
  const alternatives: string[] = []; // an empty list must add no alternative: `(?:)` matches anything
  if (other.length > 0) alternatives.push(`${WORD_START}(?:${wordAlternation(other)})`);
  if (cjk.length > 0) alternatives.push(`(?:${wordAlternation(cjk)})`);
  return new RegExp(`(?:${alternatives.join("|")})$`, "iu");
}

// Build the check once and return it as a function: does the text before `index` end with a keyword?
// Right to left: strip separators; a keyword -> true; a filler word -> drop it and repeat.
export function createKeywordCheck(rules: KeywordContextRules): (text: string, index: number) => boolean {
  const keywordAtEnd = keywordsAtEnd(rules.keywords);
  const fillerAtEnd = new RegExp(`${WORD_START}(?:${wordAlternation(rules.fillers)})$`, "iu");
  const trailingSeparators = new RegExp(`[\\s${escapeForCharClass(rules.separators)}]+$`, "u");

  return (text, index) => {
    let window = text.slice(Math.max(0, index - rules.window), index);
    window = window.slice(Math.max(window.lastIndexOf("\n"), window.lastIndexOf("\r")) + 1); // same line
    while (true) {
      window = window.replace(trailingSeparators, "");
      if (keywordAtEnd.test(window)) return true;
      const filler = fillerAtEnd.exec(window);
      if (filler === null) return false;
      window = window.slice(0, filler.index);
    }
  };
}
