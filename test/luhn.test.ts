// The Luhn checksum helper (CREDIT_CARD §2), tested on its own.
import { describe, expect, test } from "vitest";
import { luhn } from "../src/luhn";

describe("luhn", () => {
  test.each([
    ["4111111111111111"], // Visa test number, 16 digits
    ["378282246310005"], // Amex test number, 15 digits
    ["4111111111111111003"], // the task giver's 19-digit card
  ])("%s passes", (digits) => {
    expect(luhn(digits)).toBe(true);
  });

  test.each([
    ["4111111111111112"], // last digit changed
    ["4111111111111111123"], // 19 digits, wrong checksum
  ])("%s fails", (digits) => {
    expect(luhn(digits)).toBe(false);
  });

  test("an empty string is not a valid number", () => {
    expect(luhn("")).toBe(false);
  });
});
