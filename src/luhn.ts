// The Luhn checksum used by payment cards (CREDIT_CARD_detection_rules.md §2).
//
// From the right, double every second digit (subtract 9 when the result is above 9),
// add everything up; the number passes when the sum is divisible by 10.
// Example: 4111111111111111 -> true, 4111111111111112 -> false.

// `digits` must contain ASCII digits only (the caller removes separators first).
// `digits: string` annotates the parameter type; `: boolean` is the return type.
export function luhn(digits: string): boolean {
  let sum = 0;
  let double = false; // the rightmost digit is not doubled
  for (let i = digits.length - 1; i >= 0; i--) {
    let value = digits.charCodeAt(i) - 48; // "0" is char code 48
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}
