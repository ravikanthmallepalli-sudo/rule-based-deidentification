// SERVICE_AND_RESOLVER §8.4, SE-series: the service end to end
// (deidentifiedText AND entitiesDetected are compared).
import { describe, expect, test } from "vitest";
import { deidentify } from "../src/deidentify";
import type { DeidentifyResult, EntityType } from "../src/types";

const SE01_TEXT =
  "Patient John Doe can be contacted at john.doe@example.com or +1-415-555-0134. DOB: 1990-05-12.";

// [id, text, entities (undefined = default), expected result]
// `EntityType[] | undefined`: either a list of entity types or nothing (use the default).
const rows: [string, string, EntityType[] | undefined, DeidentifyResult][] = [
  [
    "SE01 the brief's example",
    SE01_TEXT,
    undefined,
    {
      deidentifiedText: "Patient John Doe can be contacted at [EMAIL] or [PHONE]. DOB: [DATE_OF_BIRTH].",
      entitiesDetected: { EMAIL: 1, PHONE: 1, DATE_OF_BIRTH: 1 },
    },
  ],
  [
    "SE02 the brief's API example",
    "Contact john.doe@example.com at +1-415-555-0134",
    ["EMAIL", "PHONE"],
    { deidentifiedText: "Contact [EMAIL] at [PHONE]", entitiesDetected: { EMAIL: 1, PHONE: 1 } },
  ],
  [
    "SE03 the task giver's example",
    "John Doe paid +1500000 with card 4111 1111 1111 1111 003 and can be contacted at john.doe@example.com or +91-415-555-0134. DOB: 1990-05-12.",
    undefined,
    {
      deidentifiedText:
        "John Doe paid +1500000 with card [CREDIT_CARD] and can be contacted at [EMAIL] or [PHONE]. DOB: [DATE_OF_BIRTH].",
      entitiesDetected: { EMAIL: 1, PHONE: 1, DATE_OF_BIRTH: 1, CREDIT_CARD: 1 },
    },
  ],
  [
    "SE04 only EMAIL enabled",
    SE01_TEXT,
    ["EMAIL"],
    {
      deidentifiedText: "Patient John Doe can be contacted at [EMAIL] or +1-415-555-0134. DOB: 1990-05-12.",
      entitiesDetected: { EMAIL: 1 },
    },
  ],
  [
    "SE05 multiple occurrences",
    "a@b.co, a@b.co and a@b.co",
    undefined,
    { deidentifiedText: "[EMAIL], [EMAIL] and [EMAIL]", entitiesDetected: { EMAIL: 3 } },
  ],
  [
    "SE06 an order number is not a phone number",
    "Order 4155550134 shipped",
    undefined,
    { deidentifiedText: "Order 4155550134 shipped", entitiesDetected: {} },
  ],
  ["SE07 empty text", "", undefined, { deidentifiedText: "", entitiesDetected: {} }],
  [
    "SE08 Unicode, emoji and CRLF",
    "Zoë 😀\nSSN: 123-45-6789\r\nIP 10.0.0.1.",
    undefined,
    { deidentifiedText: "Zoë 😀\nSSN: [SSN]\r\nIP [IP_ADDRESS].", entitiesDetected: { SSN: 1, IP_ADDRESS: 1 } },
  ],
];

describe("deidentify end to end (SE-series)", () => {
  test.each(rows)("%s", (_id, text, entities, expected) => {
    expect(deidentify(text, entities)).toEqual(expected);
  });

  test("entitiesDetected keys follow the fixed order (S9)", () => {
    const result = deidentify(rows[2][1]);
    expect(Object.keys(result.entitiesDetected)).toEqual(["EMAIL", "PHONE", "DATE_OF_BIRTH", "CREDIT_CARD"]);
  });
});
