// PHONE country codes and national numbering rules (docs/PHONE_detection_rules.md §6A): is the digit
// string of a `+` / `00` number a believable international number? Used by the finders R1-R4.

// `type CountryCode` inside the import list imports a type only (no JavaScript is generated).
import { COUNTRY_CODES, type CountryCode } from "../../data/countryCodes";
import { PHONE_KEEPS_LEADING_ZERO, PHONE_MAX_INTERNATIONAL_DIGITS } from "../../data/phoneData";

// `Map<string, CountryCode>`: look up a table row by its code, e.g. "44" -> United Kingdom.
const COUNTRY_BY_CODE = new Map(COUNTRY_CODES.map((row) => [row.code, row]));

// The country code at the start of `digits`: 1 or 7, else an assigned 2-digit, else 3-digit code (§6A.1).
function findCountryCode(digits: string): CountryCode | undefined {
  if (digits[0] === "1" || digits[0] === "7") return COUNTRY_BY_CODE.get(digits[0]);
  return COUNTRY_BY_CODE.get(digits.slice(0, 2)) ?? COUNTRY_BY_CODE.get(digits.slice(0, 3));
}

// A NANP (+1) area code or exchange: starts with 2-9 and is not an N11 code (211 ... 911) (§6A.2).
export function isNanpPart(part: string): boolean {
  return /^[2-9][0-9]{2}$/.test(part) && !/^[2-9]11$/.test(part);
}

// The national number rules for one country (§6A.2).
function isValidNationalNumber(country: CountryCode, national: string): boolean {
  if (country.code === "1") {
    return national.length === 10 && isNanpPart(national.slice(0, 3)) && isNanpPart(national.slice(3, 6));
  }
  if (country.code === "7") return national.length === 10 && /^[3-9]/.test(national);
  let number = national;
  // D14: one typed trunk zero is tolerated (Italy keeps its zero); `00` is never tolerated.
  if (number.startsWith("0") && !PHONE_KEEPS_LEADING_ZERO.includes(country.code)) {
    if (number[1] === "0") return false;
    number = number.slice(1);
  }
  return number.length >= country.minLength && number.length <= country.maxLength;
}

// Assigned code wholly inside the first group, valid national number, at most 15 digits (§6A).
export function isValidInternationalNumber(digits: string, firstGroupLength: number): boolean {
  const country = findCountryCode(digits);
  if (country === undefined || country.code.length > firstGroupLength) return false;
  if (digits.length > PHONE_MAX_INTERNATIONAL_DIGITS) return false;
  return isValidNationalNumber(country, digits.slice(country.code.length));
}

