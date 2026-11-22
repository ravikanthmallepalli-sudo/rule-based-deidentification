// Data for the SSN detector (SSN_detection_rules.md §4 constants, §5.2, D2, D3).

// The eight dash characters accepted between the groups; the two dashes may differ (D2).
// `readonly string[]` = an array of strings that the code cannot change by accident.
export const SSN_DASHES: readonly string[] = [
  "-", // hyphen-minus
  "\u2010", // hyphen
  "\u2011", // non-breaking hyphen
  "\u2012", // figure dash
  "\u2013", // en dash
  "\u2014", // em dash
  "\u2015", // horizontal bar
  "\u2212", // minus sign
];

// Values that are never assigned (§5.2, decision O1 option (a)). Area 900-999 is accepted
// on purpose: those are ITIN numbers, just as sensitive.
export const SSN_REJECTED_AREAS: readonly string[] = ["000", "666"];
export const SSN_REJECTED_GROUPS: readonly string[] = ["00"];
export const SSN_REJECTED_SERIALS: readonly string[] = ["0000"];
