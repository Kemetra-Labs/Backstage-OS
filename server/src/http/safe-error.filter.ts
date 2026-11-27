import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { requestIdFrom, safeErrorEnvelope, STATUS_FOR, type SafeErrorCode } from "../errors/safe-error";
import type { RequestWithId, ResponseLike } from "./request-id";

// Express body-parser (http-errors) rejects oversized or wrongly typed bodies with a plain
// Error carrying `status` and `expose: true`; Nest passes it through unwrapped. Only the
// numeric status is read, never the message.
function bodyParserClientError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const { status, expose } = e as { status?: unknown; expose?: unknown };
  return expose === true && (status === 400 || status === 413 || status === 415);
}

function codeFor(exception: unknown): SafeErrorCode {
  if (!(exception instanceof HttpException)) return bodyParserClientError(exception) ? "validation_error" : "internal_error";
  switch (exception.getStatus()) {
    case 404:
    case 401:
    case 403: // a denied read is reported as not found (policy M05-D05-B)
      return "not_found";
    case 400:
    case 413: // payload too large: client error
    case 415: // unsupported media type: client error
    case 422:
      return "validation_error";
    case 429:
      return "rate_limited";
    default:
      return "internal_error";
  }
}

// Constructor name only, never the message or stack. A thrown non-object (string, number) is reported by its typeof.
function typeNameOf(exception: unknown): string {
  if (typeof exception === "object" && exception !== null) {
    try {
      const name = (exception as { constructor?: { name?: unknown } }).constructor?.name;
      return typeof name === "string" && /^[A-Za-z0-9_$]{1,64}$/.test(name) ? name : "object";
    } catch {
      return "object"; // a hostile getter or proxy must not turn the error handler into a second error
    }
  }
  return typeof exception;
}

/**
 * Catches everything. Never logs or returns exception.message or stack: the body
 * is built only from fixed messages. Every error response is `cache-control: no-store`, so a guard denial,
 * an unknown route and an Origin refusal have identical headers (audit L2). A 5xx logs one fixed line
 * (audit L6): request id and exception class name, nothing else.
 */
@Catch()
export class SafeErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("SafeErrorFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<RequestWithId>();
    const res = http.getResponse<ResponseLike>();
    // Headers already sent (e.g. error mid-stream): writing again would throw and
    // could leak or crash, so leave the response as is.
    if (res.headersSent) return;
    const code = codeFor(exception);
    const requestId = req.requestId ?? requestIdFrom(undefined);
    res.setHeader("x-request-id", requestId);
    res.setHeader("cache-control", "no-store");
    if (code === "internal_error") this.logger.error(`kawalys-bff 5xx request_id=${requestId} type=${typeNameOf(exception)}`);
    res.status(STATUS_FOR[code]).json(safeErrorEnvelope(code, requestId));
  }
}
