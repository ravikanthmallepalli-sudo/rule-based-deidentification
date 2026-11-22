// SERVICE_AND_RESOLVER §8.3, SV-series: validation of the request body.
import { describe, expect, test } from "vitest";
import { deidentify } from "../src/deidentify";
import { ValidationError } from "../src/errors";
import { ALL_ENTITY_TYPES } from "../src/types";
import { validateInput, validateRequestBody } from "../src/validate";

// Run the validator on a JSON body exactly as written in the table.
function validateJson(json: string) {
  return validateRequestBody(JSON.parse(json));
}

// The error code thrown for a JSON body, or "no error".
function errorCodeOf(json: string): string {
  try {
    validateJson(json);
    return "no error";
  } catch (error) {
    if (error instanceof ValidationError) return error.code;
    throw error;
  }
}

describe("valid bodies (SV-series)", () => {
  test("SV01 entities omitted = all six", () => {
    expect(validateJson('{"text":"hi"}').entities).toEqual([...ALL_ENTITY_TYPES]);
  });

  test('SV02 "" is valid; output "" and {}', () => {
    expect(validateJson('{"text":"","entities":["EMAIL"]}')).toEqual({ text: "", entities: ["EMAIL"] });
    expect(deidentify("", ["EMAIL"])).toEqual({ deidentifiedText: "", entitiesDetected: {} });
  });

  test("SV03 entities null = all six", () => {
    expect(validateJson('{"text":"hi","entities":null}').entities).toEqual([...ALL_ENTITY_TYPES]);
  });

  test("SV04 names are case-insensitive", () => {
    expect(validateJson('{"text":"hi","entities":["email","Phone"]}').entities).toEqual(["EMAIL", "PHONE"]);
  });

  test("SV05 duplicates are ignored", () => {
    expect(validateJson('{"text":"hi","entities":["EMAIL","email"]}').entities).toEqual(["EMAIL"]);
  });

  test("SV17 extra fields are ignored", () => {
    expect(validateJson('{"text":"hi","entities":["EMAIL"],"extra":true}')).toEqual({
      text: "hi",
      entities: ["EMAIL"],
    });
  });
});

describe("invalid bodies (SV-series)", () => {
  const rows: [string, string, string][] = [
    ["SV06", "{}", "INVALID_TEXT"],
    ["SV07", '{"text":null}', "INVALID_TEXT"],
    ["SV08", '{"text":42}', "INVALID_TEXT"],
    ["SV09", '{"text":["a"]}', "INVALID_TEXT"],
    ["SV10", '{"text":"hi","entities":[]}', "EMPTY_ENTITIES"],
    ["SV11", '{"text":"hi","entities":"EMAIL"}', "INVALID_ENTITIES"],
    ["SV12", '{"text":"hi","entities":["EMAIL",3]}', "INVALID_ENTITIES"],
    ["SV13", '{"text":"hi","entities":["PASSPORT"]}', "UNKNOWN_ENTITY"],
    ["SV14", '{"text":"hi","entities":[" EMAIL"]}', "UNKNOWN_ENTITY"],
    ["SV15", "[1,2]", "INVALID_BODY"],
    ["SV16", '"just a string"', "INVALID_BODY"],
  ];

  test.each(rows)("%s %s -> %s", (_id, json, expectedCode) => {
    expect(errorCodeOf(json)).toBe(expectedCode);
  });

  test("SV13 the message names the unknown value and lists the allowed names", () => {
    expect(() => validateJson('{"text":"hi","entities":["PASSPORT"]}')).toThrow(
      "Unknown entity type: PASSPORT. Allowed: EMAIL, PHONE, SSN, DATE_OF_BIRTH, CREDIT_CARD, IP_ADDRESS",
    );
  });

  test("a null body is not an object (V1)", () => {
    expect(errorCodeOf("null")).toBe("INVALID_BODY");
  });
});

describe("function form (V2-V6)", () => {
  test("deidentify throws ValidationError with the same codes", () => {
    expect(() => deidentify(undefined)).toThrow(ValidationError);
    expect(() => deidentify(42)).toThrow("`text` is required and must be a string.");
    expect(() => deidentify("hi", [])).toThrow(ValidationError);
  });

  test("validateInput keeps the canonical order", () => {
    expect(validateInput("hi", ["ip_address", "EMAIL"]).entities).toEqual(["EMAIL", "IP_ADDRESS"]);
  });
});
