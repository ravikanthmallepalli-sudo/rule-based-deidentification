// The REST wrapper around deidentify() (docs/SERVICE_AND_RESOLVER_rules.md §3 and §7).
//   POST /deidentify   { "text": "...", "entities": ["EMAIL", "PHONE"] }  (entities optional)
//   POST /deidentify/batch  { "texts": ["...", "..."], "entities": [...] }  (stretch goal)
//   GET  /health       { "status": "ok", "entities": ["EMAIL", ...] }  (the six supported types)
// createApp() builds the app without listening, so tests can drive it with supertest. Only status,
// error codes and counts are logged: never the text, the detected values or the URL path.

// `type Request` etc. inside the import list import types only (no JavaScript is generated).
import express, { type NextFunction, type Request, type Response } from "express";
import { deidentify, deidentifyBatch } from "./deidentify";
import { ValidationError } from "./errors";
import { ALL_ENTITY_TYPES } from "./types";
import { validateRequestBody } from "./validate";

// `(line: string) => void` is a function type: takes a string, returns nothing.
export interface AppOptions {
  log?: (line: string) => void; // optional: no logging when omitted (tests)
}

// The JSON error body of every failed request: { error: { code, message } }.
// `res: Response` is a parameter type annotation; `: void` means the function returns nothing.
function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

// `application/json`, in any case, with or without parameters (`application/json; charset=utf-8`).
function isJsonContentType(header: string): boolean {
  return header.split(";")[0].trim().toLowerCase() === "application/json";
}

// Rule V0a (415): a body declared as something other than JSON is refused before it is read.
// A request with no Content-Type at all is let through and gets INVALID_BODY (V1).
function createJsonContentTypeCheck(log: (line: string) => void) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.headers["content-type"];
    if (contentType !== undefined && !isJsonContentType(contentType)) {
      log(`${req.method} 415 UNSUPPORTED_MEDIA_TYPE`);
      sendError(res, 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
      return;
    }
    next();
  };
}

// `: express.Express` is the return type: an Express application.
export function createApp(options: AppOptions = {}): express.Express {
  const log = options.log ?? (() => {});
  const app = express();
  app.disable("x-powered-by");

  // S11: bodies over 1 MB are refused (413). `strict: false` also parses a top-level
  // string, number or null, so rule V1 can answer INVALID_BODY instead of INVALID_JSON.
  app.use(express.json({ limit: "1mb", strict: false }));
  const requireJsonContentType = createJsonContentTypeCheck(log);

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", entities: ALL_ENTITY_TYPES });
  });

  app.post("/deidentify", requireJsonContentType, (req: Request, res: Response) => {
    // No body, or a body sent without a Content-Type: Express leaves it undefined.
    if (req.body === undefined) {
      throw new ValidationError("INVALID_BODY", "The request body must be a JSON object.");
    }
    const input = validateRequestBody(req.body); // V1-V6; throws ValidationError
    const result = deidentify(input.text, input.entities);
    log(`POST 200 ${JSON.stringify(result.entitiesDetected)}`); // counts only
    res.json(result);
  });

  // Stretch goal: batch processing. One result per text, in the same order:
  // { "results": [ { deidentifiedText, entitiesDetected }, ... ] }
  app.post("/deidentify/batch", requireJsonContentType, (req: Request, res: Response) => {
    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      throw new ValidationError("INVALID_BODY", "The request body must be a JSON object.");
    }
    const { texts, entities } = req.body as { texts?: unknown; entities?: unknown };
    const results = deidentifyBatch(texts, entities);
    log(`POST 200 batch of ${results.length}`); // counts only
    res.json({ results });
  });

  // Unknown routes: JSON 404.
  app.use((req: Request, res: Response) => {
    log(`${req.method} 404 NOT_FOUND`);
    sendError(res, 404, "NOT_FOUND", "Route not found. Use POST /deidentify or GET /health.");
  });

  app.use(createErrorHandler(log));
  return app;
}

// Body-parser errors carry a `type` field; this type guard reads it safely.
// `error is { type: string }` tells TypeScript the object has a string `type` when true.
function hasType(error: unknown): error is { type: string } {
  return typeof error === "object" && error !== null && typeof (error as { type?: unknown }).type === "string";
}

// The error middleware: maps every failure to a status and an error code. It never echoes
// the input (body-parser messages can quote the body, so they are not passed on).
export function createErrorHandler(log: (line: string) => void = () => {}) {
  // Express recognises error middleware by its four parameters, so `_next` must stay.
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (hasType(error) && error.type === "entity.parse.failed") {
      log(`${req.method} 400 INVALID_JSON`);
      sendError(res, 400, "INVALID_JSON", "The request body is not valid JSON.");
    } else if (hasType(error) && error.type === "entity.too.large") {
      log(`${req.method} 413 PAYLOAD_TOO_LARGE`);
      sendError(res, 413, "PAYLOAD_TOO_LARGE", "The request body is larger than 1 MB.");
    } else if (error instanceof ValidationError) {
      log(`${req.method} 400 ${error.code}`);
      sendError(res, 400, error.code, error.message);
    } else {
      log(`${req.method} 500 INTERNAL_ERROR`);
      sendError(res, 500, "INTERNAL_ERROR", "Internal error.");
    }
  };
}
