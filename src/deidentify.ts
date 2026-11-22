// The public function of the service:
//   validate -> detect -> resolve -> replace -> report
// (SERVICE_AND_RESOLVER §0). The REST endpoint in app.ts is a thin wrapper around it.

import { DETECTORS } from "./detectors";
import { resolveOverlaps } from "./resolve";
import { replaceSpans } from "./replace";
// `type X` inside an import list imports X as a type only (it vanishes from the JavaScript output).
import { ALL_ENTITY_TYPES, type DeidentifyResult, type EntityType, type Span } from "./types";
import { validateBatchInput, validateInput } from "./validate";

// Stage 2: every enabled detector scans the ORIGINAL text and only returns spans (S12).
// `entities: readonly EntityType[]` = a list of entity types this function will not change.
export function detectAll(text: string, entities: readonly EntityType[]): Span[] {
  let spans: Span[] = [];
  for (const type of entities) {
    // concat, not push(...): spreading a very long list as arguments can overflow the stack
    spans = spans.concat(DETECTORS[type].find(text));
  }
  return spans;
}

// Stage 5: count the resolved regions per type, in ALL_ENTITY_TYPES order, omitting zeros (S6, S9).
// `Partial<Record<EntityType, number>>` = an object with a number for SOME of the six types.
export function countEntities(regions: readonly Span[]): Partial<Record<EntityType, number>> {
  const counts: Partial<Record<EntityType, number>> = {};
  for (const type of ALL_ENTITY_TYPES) {
    const count = regions.filter((region) => region.type === type).length;
    if (count > 0) counts[type] = count;
  }
  return counts;
}

// De-identify `text`. `entities` is optional (`?`): when omitted or null, all six types run.
// Throws a ValidationError for bad input (SERVICE_AND_RESOLVER §3).
export function deidentify(text: unknown, entities?: unknown): DeidentifyResult {
  const input = validateInput(text, entities);
  const spans = detectAll(input.text, input.entities);
  const regions = resolveOverlaps(spans);
  return {
    deidentifiedText: replaceSpans(input.text, regions),
    entitiesDetected: countEntities(regions),
  };
}

// Stretch goal: batch processing. De-identify several texts with the same entity types;
// returns one result per text, in the same order. Throws a ValidationError for bad input.
export function deidentifyBatch(texts: unknown, entities?: unknown): DeidentifyResult[] {
  const input = validateBatchInput(texts, entities);
  return input.texts.map((text) => deidentify(text, input.entities));
}
