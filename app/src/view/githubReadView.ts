// GitHub reads on the Portfolio screen (BACK-57, owner decision 2026-11-25, Jira comment 18848): the BACK-57
// adapters (src/api) applied to a `GET /portfolio` body. By default the body is a committed SYNTHETIC fixture that
// server/test/portfolio/portfolio-parity.spec.ts keeps equal to what the server's read model produces. In live mode
// (BACK-51 P1, VITE_KAWALYS_LIVE=1) the caller passes the body live/reads.ts fetched, with origin 'live' and the real
// clock. This file makes no request (src/live/live.guard.test.ts). Pure: the clock is passed in, never read here.
import { parsePortfolio, toPortfolio, GITHUB_TTL_SECONDS } from '../api/portfolio';
import { countDisplay, freshnessOf, type CountView } from '../contract/rules';
import RESPONSE from '../fixture/portfolio-response.json';

/** The fixture's "now": its reads are 5 minutes to 4 hours before this. */
export const FIXTURE_NOW = new Date('2026-11-25T12:00:00.000Z');

/** Where a body came from: the committed synthetic fixture, or the Kawalys server in live mode (BACK-51 P1). */
export type ReadOrigin = 'fixture' | 'live';

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
  /** True for the synthetic fixture, so the panel says so in every state, failures included; false for a live body. */
  readonly demo: boolean;
  /** The body could not be read, or some of it was left out: say so, never show it as complete. */
  readonly incomplete: boolean;
}

const failureOf = (code: string | null): FailureReason =>
  (FAILURE_REASONS as readonly string[]).includes(code ?? '') ? (code as FailureReason) : 'other';

export function githubReadView(body: unknown = RESPONSE, now: Date = FIXTURE_NOW, origin: ReadOrigin = 'fixture'): GitHubReadView {
  const synthetic = origin === 'fixture';
  const parse = parsePortfolio(body);
  const api = toPortfolio(parse, { now, ttlSeconds: GITHUB_TTL_SECONDS, synthetic });
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
    // A fixture body (or a forced failure of it) is never presented as live, in any state.
    demo: synthetic,
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

/**
 * The panel's view for a URL. Fixture mode: the fixture, or the forced failure form the seed names. Live mode: the fetched body,
 * and the seed is ignored, so a URL can never dress live data up as a forced failure.
 */
export function githubReadViewFor(search: string, now: Date = FIXTURE_NOW, origin: ReadOrigin = 'fixture', body: unknown = RESPONSE): GitHubReadView {
  if (origin === 'live') return githubReadView(body, now, 'live');
  const form = forcedFormFrom(search);
  return githubReadView(form ? forcedBody(form) : body, now);
}
