// Canonical JSON and its SHA-256 (BACK-105 S1). Adapted from the COG-P0 research port's strict JSON
// comparison (server/test/research/cognitive-core/contract.ts, sameJSON). Retail Tower
// services/backend-core/apps/api/src/idempotency/canonical-json.ts (BACK-14 S4) was the reference only;
// nothing is copied from it. Object keys are sorted by code unit; values JSON would erase or coerce
// (undefined, NaN, Infinity, functions, sparse arrays, class instances, cycles) are refused.
import { createHash } from 'node:crypto';

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function canonical(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || ancestors.has(value)) throw new TypeError('canonical JSON: value is not plain JSON');
  ancestors.add(value);
  let out: unknown;
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new TypeError('canonical JSON: sparse array');
    out = value.map((v) => canonical(v, ancestors));
  } else {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError('canonical JSON: not a plain object');
    const entries = Object.entries(value).sort(([a], [b]) => byCodeUnit(a, b));
    out = Object.fromEntries(entries.map(([k, v]) => [k, canonical(v, ancestors)]));
  }
  ancestors.delete(value);
  return out;
}

export const canonicalJson = (value: unknown): string => JSON.stringify(canonical(value, new Set()));

export const sha256 = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
