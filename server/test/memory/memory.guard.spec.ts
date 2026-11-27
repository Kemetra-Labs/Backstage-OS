// Guard (BACK-105 S1): the memory policy tables match what the observers actually emit, and the
// memory module stays pure and unexposed (COG-07 owns any route). If an observer changes its payload
// fields, refs or kinds (BACK-48), this fails instead of memory silently creating conflicts.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ObservationInput } from '../../src/evidence/evidence.repository';
import { observeConfluenceSpaces } from '../../src/connectors/confluence/confluence.observer';
import { observeRepository } from '../../src/connectors/github/github.observer';
import { observeJiraProjects } from '../../src/connectors/jira/jira.observer';
import { CONTENT_FIELDS, coveringFailureRefs, isItemKind, MARKER_KINDS, scopeReadOf, type ItemKind } from '../../src/memory/memory.policy';
import * as confluence from '../connectors/confluence/confluence.fixture';
import * as github from '../connectors/github/github.fixture';
import * as jira from '../connectors/jira/jira.fixture';

const sourceId = randomUUID();
const now = new Date('2026-11-25T12:00:00Z');

async function emitted(): Promise<ObservationInput[]> {
  return [
    ...(await observeRepository(new github.ScriptedTransport(github.happyScript()), { sourceId, externalRef: github.OWNER_REPO }, now)),
    ...(await observeJiraProjects(new jira.ScriptedTransport(jira.happyScript()), { sourceId, site: jira.SITE, projectKeys: ['BACK', 'OPS'] }, jira.NOW)),
    ...(await observeConfluenceSpaces(new confluence.ScriptedTransport(confluence.happyScript()), { sourceId, site: confluence.SITE, spaceKeys: ['ENG', 'OPS'] }, confluence.NOW)),
  ];
}

describe('memory policy matches the observers', () => {
  it('every kind the observers emit is an item kind or a read marker, and every item kind is emitted', async () => {
    const kinds = new Set((await emitted()).map((o) => o.payload['kind']));
    for (const k of kinds) expect([k, isItemKind(k) || MARKER_KINDS.has(k as string)]).toEqual([k, true]);
    for (const k of Object.keys(CONTENT_FIELDS)) expect([k, kinds.has(k)]).toEqual([k, true]);
  });

  it('every content-key field is present in every emitted item of its kind', async () => {
    for (const o of await emitted()) {
      const kind = o.payload['kind'];
      if (!isItemKind(kind)) continue;
      for (const f of CONTENT_FIELDS[kind]) expect([o.sourceRef, f, f in o.payload]).toEqual([o.sourceRef, f, true]);
    }
  });

  it('content keys never include configuration-derived fields', () => {
    for (const fields of Object.values(CONTENT_FIELDS)) expect(fields).not.toContain('url');
  });

  it('every emitted item has a scope rule, and its failure refs and scope refs share its root', async () => {
    for (const o of await emitted()) {
      const kind = o.payload['kind'];
      if (!isItemKind(kind) || kind === 'repository') continue;
      const scope = scopeReadOf(kind as ItemKind, o.sourceRef);
      expect(scope).not.toBeNull();
      const root = o.sourceRef.slice(0, o.sourceRef.indexOf('#'));
      if (scope!.by === 'items') expect(o.sourceRef.startsWith(scope!.prefix)).toBe(true);
      else expect(scope!.ref.startsWith(`${root}#`)).toBe(true);
      expect(coveringFailureRefs('github', kind as ItemKind, o.sourceRef).has(root)).toBe(true);
    }
  });

  it('every failure ref the observers emit is in the coverage table of the items it must cover (D3)', async () => {
    const root = `github:${github.OWNER_REPO}`;
    const failed = async (): Promise<ObservationInput[]> => {
      const noPulls = github.happyScript();
      delete noPulls[`/repos/${github.OWNER_REPO}/pulls`];
      const noIssues = github.happyScript();
      delete noIssues[`/repos/${github.OWNER_REPO}/issues`];
      const spaceOnly = confluence.happyScript();
      for (const path of Object.keys(spaceOnly)) if (path.includes('/pages')) delete spaceOnly[path];
      return [
        ...(await observeRepository(new github.ScriptedTransport({}), { sourceId, externalRef: github.OWNER_REPO }, now)),
        ...(await observeRepository(new github.ScriptedTransport(noPulls), { sourceId, externalRef: github.OWNER_REPO }, now)),
        ...(await observeRepository(new github.ScriptedTransport(noIssues), { sourceId, externalRef: github.OWNER_REPO }, now)),
        ...(await observeRepository(new github.ScriptedTransport({}), { sourceId, externalRef: 'not a repo' }, now)),
        ...(await observeJiraProjects(new jira.ScriptedTransport({}), { sourceId, site: jira.SITE, projectKeys: ['BACK'] }, jira.NOW)),
        ...(await observeJiraProjects(new jira.ScriptedTransport({}), { sourceId, site: jira.SITE, projectKeys: ['bad key'] }, jira.NOW)),
        ...(await observeConfluenceSpaces(new confluence.ScriptedTransport({}), { sourceId, site: confluence.SITE, spaceKeys: ['ENG'] }, confluence.NOW)),
        ...(await observeConfluenceSpaces(new confluence.ScriptedTransport(spaceOnly), { sourceId, site: confluence.SITE, spaceKeys: ['ENG'] }, confluence.NOW)),
        ...(await observeConfluenceSpaces(new confluence.ScriptedTransport({}), { sourceId, site: confluence.SITE, spaceKeys: ['bad key'] }, confluence.NOW)),
      ];
    };
    const refs = new Set((await failed()).filter((o) => o.payload['kind'] === 'source_status').map((o) => o.sourceRef));
    const expected: [string, ReadonlySet<string>][] = [
      [root, coveringFailureRefs('github', 'repository', root)],
      [`${root}#pulls`, coveringFailureRefs('github', 'pull_request', `${root}#pull/1`)],
      [`${root}#issues`, coveringFailureRefs('github', 'issue', `${root}#issue/1`)],
      ['github:invalid-ref', coveringFailureRefs('github', 'pull_request', `${root}#pull/1`)],
      ['jira:BACK', coveringFailureRefs('jira', 'jira_issue', 'jira:BACK#issue/BACK-1')],
      ['jira:invalid-ref', coveringFailureRefs('jira', 'jira_issue', 'jira:BACK#issue/BACK-1')],
      ['confluence:ENG', coveringFailureRefs('confluence', 'confluence_page', 'confluence:ENG#page/1')],
      ['confluence:ENG#pages', coveringFailureRefs('confluence', 'confluence_page', 'confluence:ENG#page/1')],
      ['confluence:invalid-ref', coveringFailureRefs('confluence', 'confluence_page', 'confluence:ENG#page/1')],
    ];
    expect([...refs].sort()).toEqual(expected.map(([ref]) => ref).sort());
    for (const [ref, covering] of expected) expect([ref, covering.has(ref)]).toEqual([ref, true]);
  });

  it('GitHub list markers use the refs the scope rules expect', async () => {
    const pages = (await emitted()).filter((o) => o.payload['kind'] === 'list_page').map((o) => o.sourceRef).sort();
    const root = `github:${github.OWNER_REPO}`;
    expect(pages).toEqual([`${root}#issues`, `${root}#pulls`]);
    expect(scopeReadOf('pull_request', `${root}#pull/1`)).toEqual({ by: 'list_page', ref: `${root}#pulls` });
    expect(scopeReadOf('issue', `${root}#issue/1`)).toEqual({ by: 'list_page', ref: `${root}#issues` });
  });
});

describe('memory module is pure and not exposed', () => {
  const SRC = resolve(process.cwd(), 'src');
  const MEMORY = join(SRC, 'memory');
  const files = (dir: string) =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.ts'))
      .map((e) => join(e.parentPath, e.name));

  it('only the S2 read files may use the database, and the projector core never imports them', () => {
    const core = files(MEMORY).filter((f) => !/memory\.(?:repository|sql)\.ts$/.test(f));
    for (const f of core) expect([f, /from\s*['"]\.\/memory\.(?:repository|sql)['"]/.test(readFileSync(f, 'utf8'))]).toEqual([f, false]);
  });

  it.each(files(MEMORY).map((f) => [f.slice(SRC.length + 1).replaceAll('\\', '/'), f]))('%s imports only memory, evidence types and node:crypto (plus the database for the S2 read)', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    const specifiers = [
      ...text.matchAll(/\bfrom\s*['"`]([^'"`]+)['"`]|^\s*import\s*['"`]([^'"`]+)['"`]|\bimport\s*\(\s*['"`]?([^'"`)]*)|\brequire\s*\(/gm),
    ].map((m) => m[1] ?? m[2] ?? m[3] ?? 'require');
    const pure = /^(?:\.\/memory\.[a-z]+|\.\.\/evidence\/evidence\.types|node:crypto)$/;
    // Only the S2 read may touch the database: the pg types, the workspace context and the visibility rule.
    const db = /^(?:pg|\.\.\/db\/workspace-context|\.\.\/evidence\/visibility)$/;
    const isDbFile = /memory\.(?:repository|sql)\.ts$/.test(file);
    expect(specifiers.filter((s) => !(pure.test(s) || (isDbFile && db.test(s))))).toEqual([]);
    expect(text).not.toMatch(/\bfetch\b|\bprocess\b|\bglobalThis\b|\bMath\.random\b|\bDate\.now\b|\bnew Date\(\s*\)|\bset(?:Timeout|Interval|Immediate)\b/);
  });

  it('nothing else in src imports the memory module (no route, controller or module wiring)', () => {
    // COG-03 retrieval (BACK-106) and COG-04 reasoning (BACK-107) are the pure consumers; their own
    // guards keep them pure and unexposed.
    const consumers = [join(SRC, 'retrieval'), join(SRC, 'reasoning')];
    const outside = files(SRC).filter((f) => !f.startsWith(MEMORY) && !consumers.some((c) => f.startsWith(c)));
    const offenders = outside.filter((f) => /(?:from\s*|import\s*\(\s*|^\s*import\s*)['"`][^'"`]*\/memory\//m.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
