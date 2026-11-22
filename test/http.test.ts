// The REST wrapper (SERVICE_AND_RESOLVER §3, §7 and the REST-only rows of §8.3),
// driven with supertest; no port is opened.
import express from "express";
import request from "supertest";
import { describe, expect, test } from "vitest";
import { createApp, createErrorHandler } from "../src/app";

const app = createApp();

// A value that must never appear in an error response or a log line.
const SECRET = "john.doe@example.com";

describe("POST /deidentify", () => {
  test("the brief's request and response example", async () => {
    const response = await request(app)
      .post("/deidentify")
      .send({ text: "Contact john.doe@example.com at +1-415-555-0134", entities: ["EMAIL", "PHONE"] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      deidentifiedText: "Contact [EMAIL] at [PHONE]",
      entitiesDetected: { EMAIL: 1, PHONE: 1 },
    });
  });

  test("entities omitted: all six types are used (S1)", async () => {
    const response = await request(app)
      .post("/deidentify")
      .send({ text: "SSN 123-45-6789, DOB: 1990-05-12, card 4111 1111 1111 1111, IP 10.0.0.1" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      deidentifiedText: "SSN [SSN], DOB: [DATE_OF_BIRTH], card [CREDIT_CARD], IP [IP_ADDRESS]",
      entitiesDetected: { SSN: 1, DATE_OF_BIRTH: 1, CREDIT_CARD: 1, IP_ADDRESS: 1 },
    });
  });

  test('"" is valid: returned unchanged with {} (S2)', async () => {
    const response = await request(app).post("/deidentify").send({ text: "" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deidentifiedText: "", entitiesDetected: {} });
  });
});

describe("errors (SERVICE_AND_RESOLVER §3)", () => {
  // [description, raw JSON body, expected status, expected code]
  const rows: [string, string, number, string][] = [
    ["V0 malformed JSON", '{"text":', 400, "INVALID_JSON"],
    ["V1 body is an array", "[1,2]", 400, "INVALID_BODY"],
    ["V1 body is a string", '"just a string"', 400, "INVALID_BODY"],
    ["V1 body is a number", "42", 400, "INVALID_BODY"],
    ["V1 body is null", "null", 400, "INVALID_BODY"],
    ["V2 text missing", "{}", 400, "INVALID_TEXT"],
    ["V2 text is not a string", '{"text":42}', 400, "INVALID_TEXT"],
    ["V3 entities is not an array", '{"text":"hi","entities":"EMAIL"}', 400, "INVALID_ENTITIES"],
    ["V4 entities is empty", '{"text":"hi","entities":[]}', 400, "EMPTY_ENTITIES"],
    ["V5 an element is not a string", '{"text":"hi","entities":["EMAIL",3]}', 400, "INVALID_ENTITIES"],
    ["V6 unknown entity", '{"text":"hi","entities":["PASSPORT"]}', 400, "UNKNOWN_ENTITY"],
  ];

  test.each(rows)("%s -> %i %s", async (_name, body, status, code) => {
    const response = await request(app).post("/deidentify").set("Content-Type", "application/json").send(body);
    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(typeof response.body.error.message).toBe("string");
  });

  test("missing body (no JSON sent) -> 400 INVALID_BODY", async () => {
    const response = await request(app).post("/deidentify");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_BODY");
  });

  test("V0a body sent as text/plain -> 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    const response = await request(app).post("/deidentify").set("Content-Type", "text/plain").send("hello");
    expect(response.status).toBe(415);
    expect(response.body).toEqual({
      error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json." },
    });
  });

  test("V0a batch body sent as text/plain -> 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    const response = await request(app).post("/deidentify/batch").set("Content-Type", "text/plain").send("hello");
    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  test("V0a application/json with a charset parameter is JSON -> 200", async () => {
    const response = await request(app)
      .post("/deidentify")
      .set("Content-Type", "application/json; charset=utf-8")
      .send('{"text":"Mail a@b.co"}');
    expect(response.status).toBe(200);
    expect(response.body.deidentifiedText).toBe("Mail [EMAIL]");
  });

  test("V7 body over 1 MB -> 413 PAYLOAD_TOO_LARGE", async () => {
    const response = await request(app)
      .post("/deidentify")
      .send({ text: "a".repeat(1024 * 1024 + 10) });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  test("UNKNOWN_ENTITY names the value", async () => {
    const response = await request(app).post("/deidentify").send({ text: "hi", entities: ["PASSPORT"] });
    expect(response.body.error.message).toContain("PASSPORT");
  });
});

describe("error bodies never contain the request text", () => {
  test("malformed JSON (the parser's own message would quote the body)", async () => {
    const response = await request(app)
      .post("/deidentify")
      .set("Content-Type", "application/json")
      .send(`{"text": "${SECRET}" oops}`);
    expect(response.status).toBe(400);
    expect(response.text).not.toContain(SECRET);
  });

  test("validation errors", async () => {
    const response = await request(app).post("/deidentify").send({ text: SECRET, entities: "EMAIL" });
    expect(response.status).toBe(400);
    expect(response.text).not.toContain(SECRET);
  });

  test("an unexpected error -> 500 INTERNAL_ERROR without echoing anything", async () => {
    const lines: string[] = [];
    const failing = express();
    failing.get("/boom", () => {
      throw new Error(`something broke while reading ${SECRET}`);
    });
    failing.use(createErrorHandler((line) => lines.push(line)));
    const response = await request(failing).get("/boom");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Internal error." } });
    expect(lines.join("\n")).not.toContain(SECRET);
  });

  test("log lines hold only status, codes and counts", async () => {
    const lines: string[] = [];
    const logged = createApp({ log: (line) => lines.push(line) });
    await request(logged).post("/deidentify").send({ text: `Mail ${SECRET}` });
    await request(logged).post("/deidentify").send({ text: SECRET, entities: ["NOPE"] });
    expect(lines).toEqual(['POST 200 {"EMAIL":1}', "POST 400 UNKNOWN_ENTITY"]);
  });
});

describe("other routes", () => {
  test("GET /health -> 200 { status: ok, entities }", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      entities: ["EMAIL", "PHONE", "SSN", "DATE_OF_BIRTH", "CREDIT_CARD", "IP_ADDRESS"],
    });
  });

  test("unknown route -> 404 NOT_FOUND (JSON)", async () => {
    const response = await request(app).get("/nope");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  test("GET /deidentify is not a route -> 404", async () => {
    const response = await request(app).get("/deidentify");
    expect(response.status).toBe(404);
  });
});
