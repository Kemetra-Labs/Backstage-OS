import { randomUUID } from "node:crypto";
import { sanitizedRequestId } from "../errors/safe-error";

// Minimal structural types: @types/express is not a dependency of this package.
export interface RequestWithId {
  headers: Record<string, string | string[] | undefined>;
  /** Always a fresh server UUID: echoed as x-request-id, used in error envelopes and stored in audit_events.request_id. */
  requestId?: string;
  /** The client's own x-request-id when it passes the format check. Stored only in audit metadata, never echoed. */
  clientRequestId?: string;
}
export interface ResponseLike {
  headersSent?: boolean;
  setHeader(name: string, value: string): unknown;
  status(code: number): { json(body: unknown): unknown };
}

/** Sets req.requestId (always a server UUID, BACK-172 G1), keeps a sanitized client id apart, and echoes the server id. */
export function requestIdMiddleware(req: RequestWithId, res: ResponseLike, next: () => void): void {
  const id = randomUUID();
  req.requestId = id;
  const client = sanitizedRequestId(req.headers["x-request-id"]);
  if (client !== undefined) req.clientRequestId = client;
  res.setHeader("x-request-id", id);
  next();
}
