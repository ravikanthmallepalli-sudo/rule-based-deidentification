// Shared contracts used by every stage of the pipeline
// (validate -> detect -> resolve -> replace -> report).

// A union of string literals: a value of this type can only be one of these six strings.
export type EntityType =
  | "EMAIL"
  | "PHONE"
  | "SSN"
  | "DATE_OF_BIRTH"
  | "CREDIT_CARD"
  | "IP_ADDRESS";

// `as const` keeps the exact strings (not just `string`), and readonly stops accidental edits.
// This order is also the key order of `entitiesDetected` (SERVICE_AND_RESOLVER S9).
export const ALL_ENTITY_TYPES = [
  "EMAIL",
  "PHONE",
  "SSN",
  "DATE_OF_BIRTH",
  "CREDIT_CARD",
  "IP_ADDRESS",
] as const;

// start/end are UTF-16 code-unit offsets into the ORIGINAL text; end is exclusive (like slice).
// `interface` describes the shape of an object: these three fields, with these types.
export interface Span {
  type: EntityType;
  start: number;
  end: number;
}

// Every detector has the same shape: a type and a pure function text -> spans.
// `Span[]` means "an array of Span objects".
export interface Detector {
  type: EntityType;
  find(text: string): Span[];
}

// `Partial<Record<K, V>>` = an object whose keys are some of K, each with a V value.
export interface DeidentifyResult {
  deidentifiedText: string;
  entitiesDetected: Partial<Record<EntityType, number>>;
}
