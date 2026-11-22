// The detector registry: one detector per entity type.
// Adding a new entity means adding a detector here; the resolver and the replacer
// never change (the brief's "extend without modifying the replacement logic").

import type { Detector, EntityType } from "../types";
import { creditCardDetector } from "./creditCard";
import { dateOfBirthDetector } from "./dateOfBirth";
import { emailDetector } from "./email";
import { ipAddressDetector } from "./ipAddress";
import { phoneDetector } from "./phone";
import { ssnDetector } from "./ssn";

// `Record<EntityType, Detector>`: exactly one detector for each of the six types; the
// compiler reports a missing one.
export const DETECTORS: Record<EntityType, Detector> = {
  EMAIL: emailDetector,
  PHONE: phoneDetector,
  SSN: ssnDetector,
  DATE_OF_BIRTH: dateOfBirthDetector,
  CREDIT_CARD: creditCardDetector,
  IP_ADDRESS: ipAddressDetector,
};
