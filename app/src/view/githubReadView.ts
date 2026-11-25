// GitHub reads on the Portfolio screen (BACK-57, owner decision 2026-11-25, Jira comment 18848): the BACK-57
// adapters (src/api) applied to a SYNTHETIC `GET /portfolio` body. Nothing here, or anywhere in app/, calls
// the server (CLAUDE.md): the body is a committed fixture that server/test/portfolio/portfolio-parity.spec.ts
// keeps equal to what the server's read model produces. The only file outside src/api allowed to import it
// (see src/api/api.guard.test.ts). Pure: the clock is the fixture's, never the system time.
import { parsePortfolio, toPortfolio, GITHUB_TTL_SECONDS } from '../api/portfolio';
import { countDisplay, freshnessOf, needsDemoMarker, type CountView } from '../contract/rules';
import RESPONSE from '../fixture/portfolio-response.json';

/** The fixture's "now": its reads are 5 minutes to 4 hours before this. */
export const FIXTURE_NOW = new Date('2026-11-25T12:00:00.000Z');

/**
 * What one source shows. Never "healthy": these are read states only.
 * notReadYet: connected but never read (unknown, owner decision). unknown: read, but with no usable time.
 */
export type ReadStatus = 'current' | 'stale' | 'notReadYet' | 'unknown' | 'unavailable';

/** Server reason codes the copy has words for; anything else shows the generic failure words. */
export const FAILURE_REASONS = ['timeout', 'network', 'denied', 'not_visible', 'rate_limited', 'unavailable', 'malformed'] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number] | 'other';

export interface GitHubSourceRow {
  readonly id: string;
  readonly externalRef: string;
  readonly status: ReadStatus;
  /** Set only when the source is unavailable. */
  readonly failure: FailureReason | null;
  readonly ageMinutes: number | null;
  readonly pullRequests: CountView;
  readonly issues: CountView;
}

export interface GitHubProjectRow {
  readonly id: string;
  readonly name: string;
  readonly sources: readonly GitHubSourceRow[];
}

export interface GitHubReadView {
  readonly projects: readonly GitHubProjectRow[];
  readonly demo: boolean;
  /** The body could not be read, or some of it was left out: say so, never show it as complete. */
  readonly incomplete: boolean;
}

const failureOf = (code: string | null): FailureReason =>
  (FAILURE_REASONS as readonly string[]).includes(code ?? '') ? (code as FailureReason) : 'other';

export function githubReadView(body: unknown = RESPONSE, now: Date = FIXTURE_NOW): GitHubReadView {
  const parse = parsePortfolio(body);
  const api = toPortfolio(parse, { now, ttlSeconds: GITHUB_TTL_SECONDS, synthetic: true });
  const projects = api.projects.map((p) => ({
    id: p.id,
    name: p.name,
    sources: p.sources.map((s): GitHubSourceRow => {
      const a = s.authority;
      const freshness = freshnessOf(a);
      const status: ReadStatus =
        a.connectivity === 'unavailable'
          ? 'unavailable'
          : freshness === 'unknown'
            ? s.failure === 'never_read' ? 'notReadYet' : 'unknown'
            : freshness;
      return {
        id: s.id,
        externalRef: s.externalRef,
        status,
        failure: status === 'unavailable' ? failureOf(s.failure) : null,
        ageMinutes: a.ageMinutes,
        pullRequests: countDisplay(s.pullRequests),
        issues: countDisplay(s.issues),
      };
    }),
  }));
  return {
    projects,
    demo: needsDemoMarker(api.projects.flatMap((p) => p.sources.map((s) => s.authority))),
    incomplete: api.malformed || api.dropped > 0,
  };
}
