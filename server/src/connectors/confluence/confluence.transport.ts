// Read-only Confluence transport PORT (BACK-53 mock slice). Nothing in src/ implements it: no fetch,
// no client library, no token. The port has a single `get`, so a write call cannot be expressed.
//
// Reuse: ADAPT of server/src/connectors/github/github.transport.ts (76a9a13).
import type { AtlassianReadTransport } from '../atlassian/atlassian.transport';

export {
  AtlassianTransportFailure as ConfluenceTransportFailure,
  type AtlassianResponse as ConfluenceResponse,
} from '../atlassian/atlassian.transport';

export type ConfluenceReadTransport = AtlassianReadTransport;
