// Overlap priority and placeholder text (SERVICE_AND_RESOLVER §4 and §5).
// Data, not code: changing the order or a placeholder never touches the resolver.

import type { EntityType } from "../types";

// Lower number = higher priority: the more strictly validated rule wins. `Record<EntityType, number>` =
// exactly one number for each of the six types, so the compiler reports a missing or misspelled type.
export const PRIORITY: Record<EntityType, number> = {
  CREDIT_CARD: 1,
  SSN: 2,
  EMAIL: 3,
  IP_ADDRESS: 4,
  DATE_OF_BIRTH: 5,
  PHONE: 6,
};

// The text that replaces a detected value.
export const PLACEHOLDER: Record<EntityType, string> = {
  EMAIL: "[EMAIL]",
  PHONE: "[PHONE]",
  SSN: "[SSN]",
  DATE_OF_BIRTH: "[DATE_OF_BIRTH]",
  CREDIT_CARD: "[CREDIT_CARD]",
  IP_ADDRESS: "[IP_ADDRESS]",
};
