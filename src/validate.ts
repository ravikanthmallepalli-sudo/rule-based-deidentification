// Stage 1: input validation (SERVICE_AND_RESOLVER §2 and §3).
// The first failing rule decides the error. Nothing is ever coerced or silently ignored.

import { ValidationError } from "./errors";
// `type EntityType` inside the import list imports a type only (no JavaScript is generated).
import { ALL_ENTITY_TYPES, type EntityType } from "./types";

// The validated input: the text and the list of entity types to run.
export interface ValidatedInput {
  text: string;
  entities: EntityType[];
}

// A type guard: when it returns true, TypeScript knows `value` is an EntityType.
function isEntityType(value: string): value is EntityType {
  // `readonly string[]` widens the `as const` tuple so `includes` accepts any string.
  return (ALL_ENTITY_TYPES as readonly string[]).includes(value);
}

// Rules V2-V6 for `deidentify(text, entities?)`. The parameters are `unknown` on purpose: callers may
// pass anything, and this function proves what they are before the pipeline uses them.
export function validateInput(text: unknown, entities?: unknown): ValidatedInput {
  // V2: text must be a string ("" is valid, S2). Never coerce (S7).
  if (typeof text !== "string") {
    throw new ValidationError("INVALID_TEXT", "`text` is required and must be a string.");
  }

  // S1: missing or null entities = all six types (the safest default for a privacy tool).
  if (entities === undefined || entities === null) {
    return { text, entities: [...ALL_ENTITY_TYPES] };
  }

  // V3: present but not an array.
  if (!Array.isArray(entities)) {
    throw new ValidationError("INVALID_ENTITIES", "`entities` must be an array of entity type names.");
  }
  // V4: an empty list would return the text unredacted; almost certainly a caller bug (S4).
  if (entities.length === 0) {
    throw new ValidationError("EMPTY_ENTITIES", "`entities` must not be empty. Omit it to use all six types.");
  }

  const chosen = new Set<EntityType>(); // `Set<EntityType>`: a set that only holds entity types
  for (const element of entities) {
    // V5: every element must be a string.
    if (typeof element !== "string") {
      throw new ValidationError("INVALID_ENTITIES", "Every element of `entities` must be a string.");
    }
    // V6: case-insensitive (S5), duplicates ignored, no trimming (" EMAIL" is unknown).
    const name = element.toUpperCase();
    if (!isEntityType(name)) {
      throw new ValidationError(
        "UNKNOWN_ENTITY",
        `Unknown entity type: ${element}. Allowed: ${ALL_ENTITY_TYPES.join(", ")}`,
      );
    }
    chosen.add(name);
  }

  // Keep the canonical order (S9) so results do not depend on the caller's order.
  return { text, entities: ALL_ENTITY_TYPES.filter((type) => chosen.has(type)) };
}

// The validated input of a batch request: several texts, one list of entity types.
export interface ValidatedBatchInput {
  texts: string[];
  entities: EntityType[];
}

// Stretch goal (batch processing): `texts` must be an array of strings (it may be empty);
// `entities` follows rules V3-V6 and applies to every text. Uses the same error codes.
export function validateBatchInput(texts: unknown, entities?: unknown): ValidatedBatchInput {
  if (!Array.isArray(texts)) {
    throw new ValidationError("INVALID_TEXT", "`texts` is required and must be an array of strings.");
  }
  texts.forEach((text, index) => {
    if (typeof text !== "string") {
      throw new ValidationError("INVALID_TEXT", `\`texts[${index}]\` must be a string.`);
    }
  });
  // Reuse V3-V6 for `entities` by validating it together with an empty text.
  // `as string[]`: the loop above proved that every element is a string.
  return { texts: texts as string[], entities: validateInput("", entities).entities };
}

// Rule V1 (REST only) followed by V2-V6: the parsed JSON body must be an object.
export function validateRequestBody(body: unknown): ValidatedInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("INVALID_BODY", "The request body must be a JSON object.");
  }
  // `as { text?: unknown; entities?: unknown }` tells TypeScript which fields we read;
  // both stay `unknown` until validateInput has checked them. Extra fields are ignored (S10).
  const { text, entities } = body as { text?: unknown; entities?: unknown };
  return validateInput(text, entities);
}
