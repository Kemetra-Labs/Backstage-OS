// Node handler for GET /healthz. Called over HTTP by ingest/probe.py; it has no static caller.
export interface HealthReply {
  ok: boolean;
  checkedAt: string;
}

export function healthHandler(now: () => Date): HealthReply {
  return { ok: true, checkedAt: now().toISOString() };
}
