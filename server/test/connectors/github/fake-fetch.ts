// Test-only fake of the global fetch (BACK-52 slice A). Nothing here, or in any test that uses it, reaches a network.
import type { FetchFn } from '../../../src/connectors/github/github.fetch-transport';

export interface RecordedCall {
  readonly url: string;
  readonly init: Parameters<FetchFn>[1];
}

export type Handler = (call: RecordedCall) => Response | Promise<Response>;

export interface FakeFetch {
  readonly fetch: FetchFn;
  readonly calls: RecordedCall[];
}

export function fakeFetch(handler: Handler): FakeFetch {
  const calls: RecordedCall[] = [];
  const fetch: FetchFn = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    return handler(call);
  };
  return { fetch, calls };
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
