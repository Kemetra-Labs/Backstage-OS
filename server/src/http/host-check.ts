import { requestIdFrom, safeErrorEnvelope } from '../errors/safe-error';
import type { RequestWithId, ResponseLike } from './request-id';

// Rejects a request whose Host header is not on the KAWALYS_ALLOWED_HOSTS list (BACK-172 G5). Registered right after
// the request id and before the Origin check. A refusal is the uniform 404 not_found with no-store, the same
// as an Origin refusal; nothing else runs. A missing or repeated Host never matches.
function hostParts(value: string | string[] | undefined): { name: string; hostPort: string } | null {
  if (typeof value !== 'string' || value === '') return null;
  const hostPort = value.toLowerCase();
  const colon = hostPort.lastIndexOf(':');
  if (colon === -1) return { name: hostPort, hostPort };
  // Whatever follows the last colon must be a real port (1-65535), so `a.example.com:evil` never matches a port-less entry.
  const port = hostPort.slice(colon + 1);
  if (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) return null;
  return { name: hostPort.slice(0, colon), hostPort };
}

export function hostCheck(allowed: readonly string[]) {
  const set = new Set(allowed);
  return function hostCheckMiddleware(req: RequestWithId, res: ResponseLike, next: () => void): void {
    const parts = hostParts(req.headers['host']);
    if (parts !== null && (set.has(parts.hostPort) || set.has(parts.name))) return next();
    const requestId = req.requestId ?? requestIdFrom(undefined);
    res.setHeader('x-request-id', requestId);
    res.setHeader('cache-control', 'no-store');
    res.status(404).json(safeErrorEnvelope('not_found', requestId));
  };
}
