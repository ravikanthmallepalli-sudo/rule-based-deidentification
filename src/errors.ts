// The one error type of the service (SERVICE_AND_RESOLVER §3).
// The REST layer turns it into HTTP 400 with `{ error: { code, message } }`.

// A union of the error codes the validation stage can produce.
export type ValidationErrorCode =
  | "INVALID_BODY"
  | "INVALID_TEXT"
  | "INVALID_ENTITIES"
  | "EMPTY_ENTITIES"
  | "UNKNOWN_ENTITY";

export class ValidationError extends Error {
  // `readonly` = can be set once (in the constructor) and never changed afterwards.
  readonly code: ValidationErrorCode;

  // `code: ValidationErrorCode` is a type annotation: the argument must be one of the codes above.
  constructor(code: ValidationErrorCode, message: string) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}
