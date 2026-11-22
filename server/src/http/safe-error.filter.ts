import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import { requestIdFrom, safeErrorEnvelope, STATUS_FOR, type SafeErrorCode } from "../errors/safe-error";
import type { RequestWithId, ResponseLike } from "./request-id";

function codeFor(exception: unknown): SafeErrorCode {
  if (!(exception instanceof HttpException)) return "internal_error";
  switch (exception.getStatus()) {
    case 404:
    case 401:
    case 403: // a denied read is reported as not found (policy M05-D05-B)
      return "not_found";
    case 400:
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
    const code = codeFor(exception);
    const requestId = req.requestId ?? requestIdFrom(undefined);
    res.setHeader("x-request-id", requestId);
    res.status(STATUS_FOR[code]).json(safeErrorEnvelope(code, requestId));
  }
}
