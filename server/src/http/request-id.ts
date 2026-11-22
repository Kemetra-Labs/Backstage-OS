import { requestIdFrom } from "../errors/safe-error";

// Minimal structural types: @types/express is not a dependency of this package.
export interface RequestWithId {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
}
export interface ResponseLike {
  headersSent?: boolean;
  setHeader(name: string, value: string): unknown;
  status(code: number): { json(body: unknown): unknown };
}

/** Sets req.requestId (sanitized or a fresh UUID) and echoes it as x-request-id. */
export function requestIdMiddleware(req: RequestWithId, res: ResponseLike, next: () => void): void {
  const id = requestIdFrom(req.headers["x-request-id"]);
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
