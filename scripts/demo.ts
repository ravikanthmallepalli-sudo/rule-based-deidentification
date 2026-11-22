// Prints before/after for the demo examples: `npm run demo`.
// Strings are printed with JSON.stringify so line breaks (\n, \r\n) stay visible.

import { deidentify } from "../src/deidentify";
import type { EntityType } from "../src/types";

// One demo example. `entities?` is optional: when omitted, all six types run.
interface Example {
  title: string;
  text: string;
  entities?: EntityType[];
}

// Pairs of examples show one rule from both sides.
const sections: { heading: string; examples: Example[] }[] = [
  {
    heading: "The brief and the task giver",
    examples: [
      {
        title: "The brief's example (SE01)",
        text: "Patient John Doe can be contacted at john.doe@example.com or +1-415-555-0134. DOB: 1990-05-12.",
      },
      {
        title: "The brief's API example (SE02)",
        text: "Contact john.doe@example.com at +1-415-555-0134",
        entities: ["EMAIL", "PHONE"],
      },
      {
        title: "The task giver's example (SE03)",
        text: "John Doe paid +1500000 with card 4111 1111 1111 1111 003 and can be contacted at john.doe@example.com or +91-415-555-0134. DOB: 1990-05-12.",
      },
    ],
  },
  {
    heading: "Precision vs context (PHONE): bare digits need a phone word",
    examples: [
      { title: "No phone word", text: "Order 4155550134 shipped" },
      { title: "Phone word", text: "Call 4155550134" },
    ],
  },
  {
    heading: "Luhn (CREDIT_CARD): a typo fails the checksum",
    examples: [
      { title: "Passes Luhn", text: "4111 1111 1111 1111" },
      { title: "Fails Luhn", text: "4111 1111 1111 1112" },
    ],
  },
  {
    heading: "Negative context (IP_ADDRESS): version numbers are not addresses",
    examples: [
      { title: "Version word before it", text: "Version 1.2.3.4" },
      { title: "Address with a port (the port stays)", text: "Server 10.0.0.1:8080" },
    ],
  },
  {
    heading: "Label required (DATE_OF_BIRTH): a bare date is not a date of birth",
    examples: [
      { title: "No label", text: "Invoice 2024-05-12" },
      { title: "DOB label (the label stays)", text: "DOB: 05/12/1990" },
    ],
  },
  {
    heading: "Union rule: overlapping detections are merged, the most sensitive type wins",
    examples: [{ title: "SSN inside an email address", text: "john.123-45-6789@example.com" }],
  },
  {
    heading: "Unicode and line breaks are copied unchanged",
    examples: [{ title: "CRLF and emoji", text: "Zoë 😀 wrote:\r\nSSN: 123-45-6789\r\nIP 10.0.0.1 ☕" }],
  },
];

let number = 0;
for (const section of sections) {
  console.log(`\n=== ${section.heading} ===`);
  for (const example of section.examples) {
    number += 1;
    const result = deidentify(example.text, example.entities);
    console.log(`\n${number}. ${example.title}`);
    console.log(`   entities: ${example.entities ? example.entities.join(", ") : "(default: all six)"}`);
    console.log(`   input   : ${JSON.stringify(example.text)}`);
    console.log(`   output  : ${JSON.stringify(result.deidentifiedText)}`);
    console.log(`   counts  : ${JSON.stringify(result.entitiesDetected)}`);
  }
}
console.log();
