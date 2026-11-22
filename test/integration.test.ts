// SERVICE_AND_RESOLVER §8.5, SI-series: cross-entity integration with all six detectors
// enabled. These expected values were derived from the detector documents (not executed
// before this implementation existed); see the verification note in the README.
import { describe, expect, test } from "vitest";
import { deidentify } from "../src/deidentify";

// [id, text, expected deidentifiedText, derived from]
const rows: [string, string, string, string][] = [
  ["SI01", "Phone: 378282246310005", "Phone: [CREDIT_CARD]", "PHONE C14, CREDIT_CARD §7"],
  ["SI02", "Phone: 4111111111111111", "Phone: [CREDIT_CARD]", "PHONE C15, CREDIT_CARD §7"],
  ["SI03", "+919876543210", "[PHONE]", "CREDIT_CARD CF09 (+ guard)"],
  ["SI04", "415-555-0134@example.com", "[EMAIL]", "EMAIL §7, PHONE §10.2"],
  ["SI05", "Phone: 123-45-6789", "Phone: [SSN]", "PHONE F46, SSN SL11"],
  ["SI06", "123-45-6789@example.com", "[SSN]", "SSN SL10, EMAIL local part rules, §4 union"],
  ["SI07", "john.123-45-6789@example.com", "[SSN]", "SSN SC14, §4 union"],
  ["SI08", "4111111111111111@example.com", "[CREDIT_CARD]", "CREDIT_CARD §7 and O1, §4 union"],
  ["SI09", "john@[192.168.1.1]", "[EMAIL]", "EMAIL EM19, IP_ADDRESS IC14"],
  ["SI10", "192.168.1.1@example.com", "[EMAIL]", "IP_ADDRESS IC15, EMAIL §5.1"],
  ["SI11", "email@123.123.123.123", "email@[IP_ADDRESS]", "EMAIL EG01, IP_ADDRESS IC16"],
  ["SI12", "Version 1.2.3.4", "Version 1.2.3.4", "IP_ADDRESS IN01, PHONE F06, CREDIT_CARD CF28"],
  ["SI13", "Phone: 192.168.1.100", "Phone: [IP_ADDRESS]", "PHONE F47"],
  ["SI14", "DOB: 1990-05-12, Phone: 415-555-0134", "DOB: [DATE_OF_BIRTH], Phone: [PHONE]", "PHONE C08, DATE_OF_BIRTH DP"],
  ["SI15", "4111 1111 1111 1111 123-45-6789", "[CREDIT_CARD] [SSN]", "CREDIT_CARD §4 windows, SSN §5.3"],
  ["SI16", "+62 812 123-45-6789", "[SSN]", "PHONE R1 (+62, 12 national digits), SSN, §4 union"],
  ["SI17", "Tel +44 20 192.168.1.1", "Tel [IP_ADDRESS]", "PHONE R1 (+44, 10 national digits), IP_ADDRESS IC17, §4 union"],
  ["SI18", "dob-05/12/1990@example.com", "dob-[EMAIL]", "EMAIL C12, DATE_OF_BIRTH label dob-, §4 union"],
];

describe("all six detectors together (SI-series)", () => {
  test.each(rows)("%s %s", (_id, text, expected) => {
    expect(deidentify(text).deidentifiedText).toBe(expected);
  });
});
