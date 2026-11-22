// PHONE context, docs/PHONE_detection_rules.md §8: a phone word before the number (§8.1), a bracketed
// label after it (§8.2), or a URL / scheme right before it (§8.3, used by finder R6).

import { createKeywordCheck, wordAlternation } from "../../context";
import { PHONE_CONTEXT_AFTER, PHONE_CONTEXT_BEFORE } from "../../data/phoneData";
import {
  PHONE_AFTER_LABELS,
  PHONE_CONTEXT_PUNCTUATION,
  PHONE_FILLER_WORDS,
  PHONE_KEYWORDS_ENGLISH,
  PHONE_KEYWORDS_OTHER,
  PHONE_URL_CONTEXTS,
} from "../../data/phoneKeywords";

// Is a phone word right before the number (same line, 60 characters)? (§8.1)
const hasPhoneWordBefore = createKeywordCheck({
  keywords: [...PHONE_KEYWORDS_ENGLISH, ...PHONE_KEYWORDS_OTHER],
  fillers: PHONE_FILLER_WORDS,
  separators: PHONE_CONTEXT_PUNCTUATION,
  window: PHONE_CONTEXT_BEFORE,
});
// §8.2: optional spaces, ( or [, a label word, ) or ] right after the number.
const LABEL_AFTER = new RegExp(`^[^\\S\\r\\n]*[(\\[](?:${wordAlternation(PHONE_AFTER_LABELS)})[)\\]]`, "iu");

// Is a bracketed label right after the number (`4155550134 (mobile)`), within 24 characters? (§8.2)
function hasLabelAfter(text: string, end: number): boolean {
  return LABEL_AFTER.test(text.slice(end, end + PHONE_CONTEXT_AFTER));
}

// The context a Tier B number needs: §8.1 or §8.2.
export function hasContext(text: string, start: number, end: number): boolean {
  return hasPhoneWordBefore(text, start) || hasLabelAfter(text, end);
}

// Is a URL or scheme (`tel:`, `wa.me/`) right before the number, optionally with a `+`? (§8.3)
export function hasUrlContext(text: string, start: number): boolean {
  const end = text[start - 1] === "+" ? start - 1 : start;
  return PHONE_URL_CONTEXTS.some(
    (prefix) => end >= prefix.length && text.slice(end - prefix.length, end).toLowerCase() === prefix,
  );
}
