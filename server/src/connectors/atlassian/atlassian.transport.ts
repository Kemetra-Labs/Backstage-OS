// Shared answer and failure types for the read-only Jira and Confluence ports (BACK-53 mock slice).
// There is deliberately no implementation in src/: no fetch, no client library, no token, no MCP
// connection. A real transport needs the BACK-53 gates (owner authorization of exact projects and
// spaces, and their scopes).
//
// Reuse: ADAPT of the Kawalys GitHub port, server/src/connectors/github/github.transport.ts (76a9a13).

/** One HTTP answer. `body` is the parsed JSON, or undefined when it was not JSON. */
export interface AtlassianResponse {
  readonly status: number;
  readonly body: unknown;
  /** Lower-case header names. `date` (RFC 9110) dates the answer for the staleness check. */
  readonly headers: Readonly<Record<string, string>>;
}

/** Thrown by a transport when no HTTP answer arrived. Any other thrown error is a transport bug. */
export class AtlassianTransportFailure extends Error {
  constructor(readonly kind: 'network' | 'timeout') {
    super(`atlassian transport ${kind}`);
    this.name = 'AtlassianTransportFailure';
  }
}

/** A read-only port: a single `get`, so a write call cannot be expressed through it. */
export interface AtlassianReadTransport {
  /** GET a path relative to the configured Atlassian site, e.g. `/rest/api/3/search/jql?...`. */
  get(path: string): Promise<AtlassianResponse>;
}
