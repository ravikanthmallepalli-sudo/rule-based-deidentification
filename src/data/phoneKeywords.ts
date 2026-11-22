// Context words for the PHONE detector (PHONE_detection_rules.md §8 and §9).
// Data, not code: the lists can be extended without touching any rule (L13).

// §8.1 Keywords. A context-gated (Tier B) number needs one of these right before it.
// The list is case-insensitive; a keyword must be a whole word.
export const PHONE_KEYWORDS_ENGLISH: readonly string[] = [
  "tel", "telephone", "phone", "phones", "ph", "mob", "mobile", "mobiles",
  "cell", "cells", "cellular", "call", "calls", "whatsapp", "whats app", "sms",
  "fax", "dial", "landline", "helpline", "hotline", "contact", "contacts", "reach",
  // Possessive phrases (`My number 4155550134`); `number` alone is only a filler word.
  "my number", "your number", "our number", "his number", "her number", "their number",
];

// §8.1 Keywords in other languages (a sample list, L13).
export const PHONE_KEYWORDS_OTHER: readonly string[] = [
  "téléphone", "tél", "portable", "telefon", "telefono", "teléfono", "telefone",
  "tlf", "handy", "mobil", "celular", "móvil", "movil",
  "फोन", "मोबाइल", "电话", "手机", "電話", "携帯",
];

// §8.1 Filler words that may sit between the keyword and the number
// (`Call me on 4155550134`, `Phone number: 9876543210`).
export const PHONE_FILLER_WORDS: readonly string[] = [
  "number", "numbers", "no", "nos", "num", "nr", "is", "are", "at", "on", "me", "us",
  "to", "line", "detail", "details", "info", "via", "using", "my", "our", "the",
  "direct", "office", "home", "work", "personal", "primary", "alternate", "alt", "emergency",
];

// §8.1 Punctuation allowed between keyword, filler words and the number, besides
// whitespace (never a line break): : ： = . # - – ( )
export const PHONE_CONTEXT_PUNCTUATION: readonly string[] = [":", "\uFF1A", "=", ".", "#", "-", "\u2013", "(", ")"];

// §8.2 Label words after the number, in brackets: `4155550134 (mobile)`.
export const PHONE_AFTER_LABELS: readonly string[] = [
  "mobile", "cell", "home", "work", "office", "tel", "phone", "fax", "direct", "personal",
];

// §8.3 URL / scheme context immediately before the number (an optional `+` may follow).
export const PHONE_URL_CONTEXTS: readonly string[] = [
  "wa.me/", "?phone=", "&phone=", "tel:", "callto:", "sms:", "smsto:", "whatsapp://send?phone=",
];

// §9 Extension words: `ext. 22`, `x22`, `extension: 22` (and the fixed form `;ext=22`).
export const PHONE_EXTENSION_WORDS: readonly string[] = ["extension", "extn", "ext", "x"];
