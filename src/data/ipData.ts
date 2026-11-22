// Data for the IP_ADDRESS detector (IP_ADDRESS_detection_rules.md §4 constants, §5.3).

// Highest value of one octet (D2). Leading zeros are allowed (decision O2 (a)).
export const IP_MAX_OCTET = 255;

// Negative context (D5, decision O1 (a)): a dotted quad DIRECTLY after one of these
// words is a version or section number, not an address (`Version 1.2.3.4`).
export const IP_NEGATIVE_KEYWORDS: readonly string[] = [
  "version", "versions", "ver", "release", "build", "rev", "revision",
  "section", "sec", "clause", "chapter", "figure", "fig", "table",
  "step", "item", "article", "paragraph", "para",
];

// The negative context protects a number only when all four octets are below this limit (D5):
// version and section numbers rarely have a part of 100 or more, real addresses usually do.
export const VERSION_OCTET_LIMIT = 100;

// Words that may sit between the keyword and the number (`Version number is 1.2.3.4`).
export const IP_FILLER_WORDS: readonly string[] = ["number", "no", "num", "nr", "is", "of"];

// Characters that may separate keyword, filler words and the number:
// whitespace (never a line break; the window is cut at the last line break) and : = . # - – ( ).
export const IP_CONTEXT_SEPARATORS: readonly string[] = [":", "=", ".", "#", "-", "\u2013", "(", ")"];

// How far back the negative context may start: 40 characters, same line.
export const IP_CONTEXT_WINDOW = 40;
