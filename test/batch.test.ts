// Stretch goal: batch processing.
// POST /deidentify/batch takes { "texts": string[], "entities"?: string[] } and returns
// { "results": [...] }, one result per text in the same order.
import request from "supertest";
import { describe, expect, test } from "vitest";
import { createApp } from "../src/app";
import { deidentify, deidentifyBatch } from "../src/deidentify";
import { ValidationError } from "../src/errors";

const TEXTS = [
  "Contact john.doe@example.com at +1-415-555-0134",
  "Order 4155550134 shipped",
  "",
  "SSN: 123-45-6789, DOB: 1990-05-12",
];

describe("deidentifyBatch (function)", () => {
  test("one result per text, equal to calling deidentify on each", () => {
    expect(deidentifyBatch(TEXTS)).toEqual(TEXTS.map((text) => deidentify(text)));
  });

  test("entities apply to every text", () => {
    expect(deidentifyBatch(TEXTS, ["email"]).map((r) => r.deidentifiedText)).toEqual([
      "Contact [EMAIL] at +1-415-555-0134",
      "Order 4155550134 shipped",
      "",
      "SSN: 123-45-6789, DOB: 1990-05-12",
    ]);
  });

  test("an empty list gives an empty list", () => {
    expect(deidentifyBatch([])).toEqual([]);
  });

  test("bad input uses the same error codes", () => {
    const codeOf = (fn: () => unknown) => {
      try {
        fn();
        return "no error";
      } catch (error) {
        return error instanceof ValidationError ? error.code : "other";
      }
    };
    expect(codeOf(() => deidentifyBatch("one text"))).toBe("INVALID_TEXT");
    expect(codeOf(() => deidentifyBatch(["ok", 42]))).toBe("INVALID_TEXT");
    expect(codeOf(() => deidentifyBatch(["ok"], []))).toBe("EMPTY_ENTITIES");
    expect(codeOf(() => deidentifyBatch(["ok"], ["PASSPORT"]))).toBe("UNKNOWN_ENTITY");
  });
});

describe("POST /deidentify/batch", () => {
  const app = createApp();

  test("returns { results } in the same order", async () => {
    const response = await request(app).post("/deidentify/batch").send({ texts: TEXTS, entities: ["EMAIL", "PHONE"] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ results: TEXTS.map((text) => deidentify(text, ["EMAIL", "PHONE"])) });
  });

  test("errors: not an object, missing texts, a non-string element", async () => {
    const asArray = await request(app).post("/deidentify/batch").send(["a"]);
    expect([asArray.status, asArray.body.error.code]).toEqual([400, "INVALID_BODY"]);
    const missing = await request(app).post("/deidentify/batch").send({ text: "a" });
    expect([missing.status, missing.body.error.code]).toEqual([400, "INVALID_TEXT"]);
    const bad = await request(app).post("/deidentify/batch").send({ texts: ["john.doe@example.com", 1] });
    expect([bad.status, bad.body.error.code]).toEqual([400, "INVALID_TEXT"]);
    expect(bad.text).not.toContain("john.doe@example.com");
  });
});
