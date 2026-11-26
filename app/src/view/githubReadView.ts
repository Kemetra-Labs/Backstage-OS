// GitHub reads on the Portfolio screen (BACK-57, owner decision 2026-11-25, Jira comment 18848): the BACK-57
// adapters (src/api) applied to a SYNTHETIC `GET /portfolio` body. Nothing here, or anywhere in app/, calls
// the server (CLAUDE.md): the body is a committed fixture that server/test/portfolio/portfolio-parity.spec.ts
// keeps equal to what the server's read model produces. The only file outside src/api allowed to import it
// (see src/api/api.guard.test.ts). Pure: the clock is the fixture's, never the system time.
import { parsePortfolio, toPortfolio, GITHUB_TTL_SECONDS } from '../api/portfolio';
import { countDisplay, freshnessOf, type CountView } from '../contract/rules';
import RESPONSE from '../fixture/portfolio-response.json';

/** The fixture's "now": its reads are 5 minutes to 4 hours before this. */
export const FIXTURE_NOW = new Date('2026-11-25T12:00:00.000Z');

/** No transport exists: every body this view reads is synthetic. */
const SYNTHETIC = true;

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

/**
 * What the panel as a whole can say (BACK-62). `unreadable`: the body was not a portfolio, or nothing in it could be read:
 * an error in words, never an empty success. `empty`: a well-formed answer with no project: said in words, never a blank panel.
 */
export type GitHubPanelState = 'ok' | 'empty' | 'unreadable';

export interface GitHubReadView {
  readonly projects: readonly GitHubProjectRow[];
  readonly state: GitHubPanelState;
  /** Always true: the body is synthetic, so the panel says so in every state, failures included. */
  readonly demo: boolean;
  /** The body could not be read, or some of it was left out: say so, never show it as complete. */
  readonly incomplete: boolean;
}

const failureOf = (code: string | null): FailureReason =>
  (FAILURE_REASONS as readonly string[]).includes(code ?? '') ? (code as FailureReason) : 'other';

export function githubReadView(body: unknown = RESPONSE, now: Date = FIXTURE_NOW): GitHubReadView {
  const parse = parsePortfolio(body);
  const api = toPortfolio(parse, { now, ttlSeconds: GITHUB_TTL_SECONDS, synthetic: SYNTHETIC });
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
  const incomplete = api.malformed || api.dropped > 0;
  return {
    projects,
    state: projects.length > 0 ? 'ok' : incomplete ? 'unreadable' : 'empty',
    // The body is always the committed synthetic one (or a forced failure of it): never present any state as live.
    demo: SYNTHETIC,
    incomplete,
  };
}

// ---- Forced connector errors (BACK-62) ---------------------------------------------------------------
// Review seed `?github=<form>`, like `?renderer=flow`: shows the panel for one failure form, so a reviewer (and e2e) can see
// that a forced connector error reads as Unknown/Error in words, never as an empty or green panel. Every form is built
// from the synthetic fixture in memory; nothing is requested.

export const FORCED_FORMS = ['error', 'denied', 'timeout', 'malformed', 'empty'] as const;
export type ForcedForm = (typeof FORCED_FORMS)[number];

type Body = { projects: { sources: { state: string; reason: string | null }[] }[] };

/** Every source of the fixture forced into one server state, lists left as they were (a failed read must hide them). */
function everySource(state: string, reason: string): unknown {
  const body = structuredClone(RESPONSE) as Body;
  for (const p of body.projects) for (const s of p.sources) Object.assign(s, { state, reason });
  return body;
}

/** The synthetic `GET /portfolio` body for one failure form. */
export function forcedBody(form: ForcedForm): unknown {
  switch (form) {
    case 'error': return everySource('error', 'network');
    case 'denied': return everySource('denied', 'denied');
    case 'timeout': return everySource('unknown', 'timeout');
    case 'malformed': return { projects: 'not a list' };
    case 'empty': return { projects: [] };
  }
}

/** The forced form named by a URL search string, or null. Pure: callers pass `window.location.search`. */
export function forcedFormFrom(search: string): ForcedForm | null {
  const v = new URLSearchParams(search).get('github');
  return (FORCED_FORMS as readonly string[]).includes(v ?? '') ? (v as ForcedForm) : null;
}

/** The panel's view for a URL: the fixture, or the forced failure form the seed names. */
export function githubReadViewFor(search: string, now: Date = FIXTURE_NOW): GitHubReadView {
  const form = forcedFormFrom(search);
  return githubReadView(form ? forcedBody(form) : RESPONSE, now);
}
