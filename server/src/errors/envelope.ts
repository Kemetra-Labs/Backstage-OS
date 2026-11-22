// Copied from Kemetra-Labs/Retail-Tower-Erp at dea1adc386ad6e8129e7342c873c74ea6f9e5b0c,
// services/backend-core/packages/shared/src/errors/envelope.ts. Apache-2.0, Copyright 2026 Kemetra-Labs.
// Unmodified below this header. Use safe-error.ts to build envelopes; it adds the non-disclosure rules.
export const ErrorCodes = {
  NOT_FOUND: "not_found",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  VALIDATION: "validation_error",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  INTERNAL: "internal_error",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface ErrorEnvelopeBody {
  code: string;
  message: string;
  request_id: string;
  details?: unknown;
}

export interface ErrorEnvelope {
  error: ErrorEnvelopeBody;
}

export interface ErrorEnvelopeInput {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
}

export function errorEnvelope(input: ErrorEnvelopeInput): ErrorEnvelope {
  const body: ErrorEnvelopeBody = {
    code: input.code,
    message: input.message,
    request_id: input.requestId,
  };
  if (input.details !== undefined) {
    body.details = input.details;
  }
  return { error: body };
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (value === null || typeof value !== "object") return false;
  const outer = value as Record<string, unknown>;
  const inner = outer["error"];
  if (inner === null || typeof inner !== "object") return false;
  const e = inner as Record<string, unknown>;
  return (
    typeof e["code"] === "string" &&
    typeof e["message"] === "string" &&
    typeof e["request_id"] === "string"
  );
}
