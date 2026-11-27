import { safeErrorEnvelope, requestIdFrom } from '../errors/safe-error';
import type { RequestWithId, ResponseLike } from './request-id';

// CSRF guard for state-changing routes (audit M1). Reads are never checked. For other methods a request is
// allowed when the browser says it is same-origin (or user-initiated), or when its Origin is allowlisted.
// With neither header (curl, supertest, server-to-server) it is allowed outside production only.
// A refusal is the standard 404 not_found envelope: the same body as any other refused request. Nothing runs.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OriginCheckOptions {
  readonly allowed: readonly string[];
  readonly production: boolean;
}

interface CheckedRequest extends RequestWithId {
  method?: string;
}

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function originCheck(options: OriginCheckOptions) {
  const allowed = new Set(options.allowed);
  return function originCheckMiddleware(req: CheckedRequest, res: ResponseLike, next: () => void): void {
    if (SAFE_METHODS.has((req.method ?? '').toUpperCase())) return next();
    const site = first(req.headers['sec-fetch-site']);
    const origin = first(req.headers['origin']);
    if (site === 'same-origin' || site === 'none') return next();
    const trusted = origin !== undefined ? allowed.has(origin) : site === undefined && !options.production;
    if (trusted) return next();
    const requestId = req.requestId ?? requestIdFrom(undefined);
    res.setHeader('x-request-id', requestId);
    res.setHeader('cache-control', 'no-store'); // same as a guard denial
    res.status(404).json(safeErrorEnvelope('not_found', requestId));
  };
}
