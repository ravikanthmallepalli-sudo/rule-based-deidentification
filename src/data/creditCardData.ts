// Data for the CREDIT_CARD detector (CREDIT_CARD_detection_rules.md §2, §4 constants, §5.2).

// One of these characters may join two digit groups (D2); anything else, or two in a row, ends the chain.
export const CARD_SEPARATORS: readonly string[] = [
  " ", // space
  "\u00A0", // no-break space
  "\u2009", // thin space
  "\u202F", // narrow no-break space
  "-", // hyphen-minus
  "\u2010", // hyphen
  "\u2011", // non-breaking hyphen
  "\u2012", // figure dash
  "\u2013", // en dash
  "\u2014", // em dash
  "\u2015", // horizontal bar
  "\u2212", // minus sign
];

// A card number has 12-19 digits (the task giver's rule, D1).
export const CARD_MIN_DIGITS = 12;
export const CARD_MAX_DIGITS = 19;

// Layout of a window made of several groups (D3): every group except the last has 4-8
// digits, the last has 1-8 (`4111 1111 1111 1111`, `3782 822463 10005`, `4222 2222 2222 2`).
export const CARD_INNER_GROUP_MIN = 4;
export const CARD_INNER_GROUP_MAX = 8;
export const CARD_LAST_GROUP_MIN = 1;
export const CARD_LAST_GROUP_MAX = 8;
