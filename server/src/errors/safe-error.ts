// Non-disclosing error wrapper (owner-ratified policy M05-D05-B).
// A viewer who is not authorized for a record must not learn that it exists, so a
// denied read is reported as `not_found`. That is why there is no `forbidden` or
// `unauthorized` code here. This is the only place the app builds an error body:
// messages are fixed, `details` is never set, and request ids are sanitized.
// This prototype backend is synthetic. It does not perform real authorization.
import { randomUUID } from "node:crypto";
import { ErrorCodes, errorEnvelope, type ErrorEnvelope } from "./envelope";

export type SafeErrorCode =
  | typeof ErrorCodes.NOT_FOUND
  | typeof ErrorCodes.VALIDATION
  | typeof ErrorCodes.RATE_LIMITED
  | typeof ErrorCodes.INTERNAL;

export const SAFE_MESSAGES: Readonly<Record<SafeErrorCode, string>> = {
  not_found: "Not found.",
  validation_error: "The request is not valid.",
  rate_limited: "Too many requests.",
  internal_error: "Something went wrong.",
};

export const STATUS_FOR: Readonly<Record<SafeErrorCode, number>> = {
  not_found: 404,
  validation_error: 400,
  rate_limited: 429,
  internal_error: 500,
};

export function safeErrorEnvelope(code: SafeErrorCode, requestId: string): ErrorEnvelope {
  return errorEnvelope({ code, message: SAFE_MESSAGES[code], requestId });
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export function requestIdFrom(header: string | string[] | undefined): string {
  if (typeof header === "string" && REQUEST_ID_PATTERN.test(header)) return header;
  return randomUUID();
}
