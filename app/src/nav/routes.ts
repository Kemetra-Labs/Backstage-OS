// Hash routes. No router library: nine screens, static build, and ?persona=&lang= stays in the search part untouched.
export type Route =
  | { readonly name: 'home' }
  | { readonly name: 'portfolio' }
  | { readonly name: 'project'; readonly projectId: string; readonly componentId?: string }
  | { readonly name: 'investigation'; readonly id: string }
  | { readonly name: 'evidence'; readonly id: string; readonly from?: string }
  | { readonly name: 'decisions' }
  | { readonly name: 'decision'; readonly id: string }
  | { readonly name: 'agents' }
  | { readonly name: 'sources' }
  | { readonly name: 'notFound'; readonly path: string };

export type RouteName = Route['name'];

const ID = /^[A-Za-z0-9._-]{1,64}$/;

function decode(part: string): string | null {
  try {
    const v = decodeURIComponent(part);
    return ID.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Parses "#/project/RT/stock-sync" or "#/evidence/E-1?from=INV-DEMO-7". Anything unknown is notFound, never a guess. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const q = raw.indexOf('?');
  const path = q === -1 ? raw : raw.slice(0, q);
  const query = new URLSearchParams(q === -1 ? '' : raw.slice(q + 1));
  const rawParts = path.split('/').filter(Boolean);
  const parts = rawParts.map(decode);
  const notFound: Route = { name: 'notFound', path: `/${rawParts.join('/')}` };
  if (parts.some((p) => p === null)) return notFound;
  const [a, b, c] = parts as string[];
  const n = parts.length;

  switch (a) {
    case undefined:
    case 'home':
      return n <= 1 ? { name: 'home' } : notFound;
    case 'portfolio':
      return n === 1 ? { name: 'portfolio' } : notFound;
    case 'project':
      if (n === 2 && b) return { name: 'project', projectId: b };
      if (n === 3 && b && c) return { name: 'project', projectId: b, componentId: c };
      return notFound;
    case 'investigation':
      return n === 2 && b ? { name: 'investigation', id: b } : notFound;
    case 'evidence': {
      if (n !== 2 || !b) return notFound;
      const from = decode(query.get('from') ?? '');
      return from ? { name: 'evidence', id: b, from } : { name: 'evidence', id: b };
    }
    case 'decisions':
      if (n === 1) return { name: 'decisions' };
      return n === 2 && b ? { name: 'decision', id: b } : notFound;
    case 'agents':
      return n === 1 ? { name: 'agents' } : notFound;
    case 'sources':
      return n === 1 ? { name: 'sources' } : notFound;
    default:
      return notFound;
  }
}

const enc = encodeURIComponent;

/** The href for a route. Always a hash, so links keep ?persona=&lang= and never leave the page. */
export function hrefFor(r: Route): string {
  switch (r.name) {
    case 'home': return '#/';
    case 'portfolio': return '#/portfolio';
    case 'project': return r.componentId ? `#/project/${enc(r.projectId)}/${enc(r.componentId)}` : `#/project/${enc(r.projectId)}`;
    case 'investigation': return `#/investigation/${enc(r.id)}`;
    case 'evidence': return r.from ? `#/evidence/${enc(r.id)}?from=${enc(r.from)}` : `#/evidence/${enc(r.id)}`;
    case 'decisions': return '#/decisions';
    case 'decision': return `#/decisions/${enc(r.id)}`;
    case 'agents': return '#/agents';
    case 'sources': return '#/sources';
    case 'notFound': return '#/';
  }
}

/** Which sidebar entry a route belongs to. */
export function sectionOf(r: Route): 'home' | 'portfolio' | 'project' | 'investigation' | 'decisions' | 'agents' | 'sources' | null {
  switch (r.name) {
    case 'home': case 'portfolio': case 'project': case 'investigation': case 'agents': case 'sources': return r.name;
    case 'evidence': return 'investigation';
    case 'decisions': case 'decision': return 'decisions';
    case 'notFound': return null;
  }
}
