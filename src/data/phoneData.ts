// Shapes and limits of the PHONE detector (PHONE_detection_rules.md §2, §5 constants, §6, §6A, §7).

// §2 Separator: exactly one of these may join two digit groups. Never a separator:
// comma, slash, colon, semicolon, underscore, tab, newline, carriage return.
export const PHONE_SEPARATORS: readonly string[] = [
  " ", "\u00A0", "\u2009", "\u202F", // space, no-break space, thin space, narrow no-break space
  "-", "\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2015", "\u2212", // hyphen-minus ... minus sign
  ".", // dot
];

// The space-type separators (R4's space-only exception, §6).
export const PHONE_SPACE_SEPARATORS: readonly string[] = [" ", "\u00A0", "\u2009", "\u202F"];

// The dash-type separators (guards: "a dash followed by a digit", §7).
export const PHONE_DASHES: readonly string[] = [
  "-", "\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2015", "\u2212",
];

// §7.1 Characters that the "paren" and "digit" left guards reject right before a number
// (an order id `#415...`, money `$415...`, a path, an email, the tail of a `+` number).
export const PHONE_LEFT_GUARD_SYMBOLS: readonly string[] = ["#", "$", "€", "£", "¥", "₹", "@", "/", "\\", "+"];

// §5 Chain scanning caps. R6 rejects a chain that hits either cap.
export const PHONE_MAX_GROUPS = 10;
export const PHONE_MAX_CHAIN_CHARS = 48;
// A parenthesised group holds 1-5 digits (`(415)`, `(0)`).
export const PHONE_PAREN_GROUP_MAX_DIGITS = 5;

// §6A E.164: a full international number has at most 15 digits.
export const PHONE_MAX_INTERNATIONAL_DIGITS = 15;
// §6A.2 Italy keeps its leading zero after the code; every other country (except +1 and
// +7, which never accept it) tolerates one typed trunk zero (`+44 020 7946 0958`).
export const PHONE_KEEPS_LEADING_ZERO: readonly string[] = ["39"];

// §6 R6: a context-gated generic chain has 7-15 digits.
export const PHONE_R6_MIN_DIGITS = 7;
export const PHONE_R6_MAX_DIGITS = 15;

// §6 R5: `(0xx)` + 6-9 digits after the parentheses.
export const PHONE_R5_MIN_DIGITS = 6;
export const PHONE_R5_MAX_DIGITS = 9;

// §5 Context windows: the phone word may start up to 60 characters before the number
// (same line); a bracketed label may end up to 24 characters after it.
export const PHONE_CONTEXT_BEFORE = 60;
export const PHONE_CONTEXT_AFTER = 24;

// §9 An extension has 1-6 digits.
export const PHONE_EXTENSION_MAX_DIGITS = 6;
