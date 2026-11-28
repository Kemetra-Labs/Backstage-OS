import { HttpException } from "@nestjs/common";

/** 422: an Idempotency-Key was reused for a different request (BACK-172 G3). SafeErrorFilter maps it to code idempotency_conflict. */
export class IdempotencyConflictException extends HttpException {
  constructor() {
    super("", 422);
  }
}
