// Read-only GitHub transport PORT (BACK-52 mock slice). There is deliberately no implementation in
// src/: no fetch, no client library, no token. A real transport needs the BACK-52 gates (X02/X04 and
// owner authorization of one exact repository and its scopes). The port has a single `get`, so a
// write call cannot be expressed through it.
//
// Reuse: ADAPT (pattern only, no code copied) of Retail-Tower-Erp be0c518, Apache-2.0:
// apps/pos/src/main/http/transport.ts (injectable transport, network/timeout kept apart from HTTP
// status) and integrations/erpnext-connector/.../provisioner/feed_client.py `_failure` (401/403 vs 5xx
// vs network). Retail Tower has no GitHub client, so the GitHub mapping itself is a BUILD.

/** One HTTP answer. `body` is the parsed JSON, or undefined when it was not JSON. */
export interface GitHubResponse {
  readonly status: number;
  readonly body: unknown;
  /** Lower-case header names. */
  readonly headers: Readonly<Record<string, string>>;
}

/** Thrown by a transport when no HTTP answer arrived. Any other thrown error is a transport bug. */
export class GitHubTransportFailure extends Error {
  constructor(readonly kind: 'network' | 'timeout') {
    super(`github transport ${kind}`);
    this.name = 'GitHubTransportFailure';
  }
}

export interface GitHubReadTransport {
  /** GET a path relative to the GitHub REST API root, e.g. `/repos/owner/repo`. */
  get(path: string): Promise<GitHubResponse>;
}
