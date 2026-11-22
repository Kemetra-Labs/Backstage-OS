import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
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

/**
 * Catches everything. Never logs or returns exception.message or stack: the body
 * is built only from fixed messages.
 */
@Catch()
export class SafeErrorFilter implements ExceptionFilter {
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
    res.status(STATUS_FOR[code]).json(safeErrorEnvelope(code, requestId));
  }
}
