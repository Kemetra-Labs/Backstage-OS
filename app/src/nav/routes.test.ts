import { describe, expect, it } from 'vitest';
import { hrefFor, parseHash, sectionOf, type Route } from './routes';

describe('parseHash', () => {
  it.each<[string, Route]>([
    ['', { name: 'home' }],
    ['#', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/home', { name: 'home' }],
    ['#/portfolio', { name: 'portfolio' }],
    ['#/project/RT', { name: 'project', projectId: 'RT' }],
    ['#/project/RT/stock-sync', { name: 'project', projectId: 'RT', componentId: 'stock-sync' }],
    ['#/investigation/INV-DEMO-7', { name: 'investigation', id: 'INV-DEMO-7' }],
    ['#/evidence/E-1', { name: 'evidence', id: 'E-1' }],
    ['#/evidence/E-1?from=INV-DEMO-7', { name: 'evidence', id: 'E-1', from: 'INV-DEMO-7' }],
    ['#/decisions', { name: 'decisions' }],
    ['#/decisions/DEC-DEMO-3', { name: 'decision', id: 'DEC-DEMO-3' }],
    ['#/agents', { name: 'agents' }],
    ['#/sources', { name: 'sources' }],
    ['#/sources/observatory', { name: 'sources', view: 'observatory' }],
    ['#/sources/observatory/sentry', { name: 'sources', view: 'observatory', src: 'sentry' }],
    ['#/map', { name: 'map' }],
    ['#/map/all', { name: 'map', scope: 'all' }],
    ['#/map/retail-tower', { name: 'map', scope: 'retail-tower' }],
    ['#/map/retail-tower/inventory', { name: 'map', scope: 'retail-tower', node: 'inventory' }],
  ])('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });

  it.each(['#/nope', '#/home/x', '#/portfolio/x', '#/project', '#/project/a/b/c', '#/investigation', '#/evidence',
    '#/decisions/a/b', '#/agents/x', '#/sources/x', '#/map/nope', '#/sources/nope', '#/sources/observatory/nope', '#/sources/observatory/github/x', '#/sources/sentry', '#/sources/observatory/%3Cx%3E', '#/map/all/a/b', '#/map/retail-tower/%3Cx%3E', '#/map/%E0%A4%A', '#/map//x', '#/project/%E0%A4%A', '#/project/<script>'])('%s is notFound', (hash) => {
    expect(parseHash(hash).name).toBe('notFound');
  });

  it('drops an invalid from parameter instead of guessing', () => {
    expect(parseHash('#/evidence/E-1?from=%3Cx%3E')).toEqual({ name: 'evidence', id: 'E-1' });
  });
});

describe('hrefFor', () => {
  const routes: Route[] = [
    { name: 'home' }, { name: 'portfolio' }, { name: 'project', projectId: 'RT' },
    { name: 'project', projectId: 'RT', componentId: 'stock-sync' }, { name: 'investigation', id: 'INV-DEMO-7' },
    { name: 'evidence', id: 'E-1' }, { name: 'evidence', id: 'E-1', from: 'INV-DEMO-7' }, { name: 'decisions' },
    { name: 'decision', id: 'DEC-DEMO-3' }, { name: 'agents' }, { name: 'sources' },
    { name: 'sources', view: 'observatory' }, { name: 'sources', view: 'observatory', src: 'port' },
    { name: 'map' }, { name: 'map', scope: 'all' }, { name: 'map', scope: 'retail-tower', node: 'stock-sync' },
  ];
  it.each(routes)('round-trips %o', (r) => {
    expect(parseHash(hrefFor(r))).toEqual(r);
  });
  it('notFound links home', () => {
    expect(hrefFor({ name: 'notFound', path: '/x' })).toBe('#/');
  });
});

describe('sectionOf', () => {
  it('maps detail routes to their section', () => {
    expect(sectionOf({ name: 'evidence', id: 'E-1' })).toBe('investigation');
    expect(sectionOf({ name: 'decision', id: 'D' })).toBe('decisions');
    expect(sectionOf({ name: 'decisions' })).toBe('decisions');
    expect(sectionOf({ name: 'project', projectId: 'RT' })).toBe('project');
    expect(sectionOf({ name: 'map', scope: 'all' })).toBe('map');
    expect(sectionOf({ name: 'notFound', path: '/' })).toBeNull();
  });
});
