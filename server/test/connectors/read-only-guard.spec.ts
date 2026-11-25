// Guard (BACK-53 mock slice): the Jira and Confluence connectors stay read-only and network-free.
// The ports expose reads only, and no module under their source folders (or the shared Atlassian
// folder they import) can import a network library or call fetch.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ScriptedTransport as ConfluenceTransport } from './confluence/confluence.fixture';
import { ScriptedTransport as JiraTransport } from './jira/jira.fixture';

const SRC = resolve(process.cwd(), 'src/connectors');
const FOLDERS = ['jira', 'confluence', 'atlassian'];

const files = FOLDERS.flatMap((f) =>
  readdirSync(join(SRC, f), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(e.parentPath, e.name)),
);

// Module specifiers that can open a connection, plus the global fetch and friends.
const NETWORK = [
  /from\s+['"](?:node:)?(?:http|https|http2|net|tls|dgram|dns|undici|child_process|worker_threads)['"]/,
  /from\s+['"](?:axios|got|node-fetch|cross-fetch|ky|superagent|request|ws|jira\.js|jira-client|confluence\.js|@atlassian[^'"]*|@modelcontextprotocol[^'"]*)['"]/,
  /require\(\s*['"]/,
  /import\(\s*['"]/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bprocess\.env\b/,
];

const MUTATING = /^(post|put|patch|delete|del|remove|create|update|write|set|send|upload|transition|assign|comment|edit|move|archive|publish|request|fetch)/i;

describe('Jira and Confluence connectors are read-only and network-free', () => {
  it('finds the source files it guards', () => {
    expect(files.map((f) => f.slice(SRC.length + 1).replaceAll('\\', '/')).sort()).toEqual([
      'atlassian/atlassian.read.ts',
      'atlassian/atlassian.transport.ts',
      'confluence/confluence.observer.ts',
      'confluence/confluence.transport.ts',
      'jira/jira.observer.ts',
      'jira/jira.transport.ts',
    ]);
  });

  it.each(files.map((f) => [f.slice(SRC.length + 1), f]))('%s imports no network library and reads no environment', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    for (const pattern of NETWORK) expect(text).not.toMatch(pattern);
    // Relative imports only, so nothing outside the repository can be pulled in.
    const specifiers = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    expect(specifiers.every((s) => s.startsWith('./') || s.startsWith('../'))).toBe(true);
  });

  it('declares a port with a single get method and nothing that writes', () => {
    for (const name of ['atlassian/atlassian.transport.ts']) {
      const text = readFileSync(join(SRC, name), 'utf8');
      const port = /export interface AtlassianReadTransport \{([\s\S]*?)\n\}/.exec(text)![1]!;
      const methods = [...port.matchAll(/^\s*(\w+)\s*\(/gm)].map((m) => m[1]!);
      expect(methods).toEqual(['get']);
      expect(methods.some((m) => MUTATING.test(m))).toBe(false);
    }
    for (const name of ['jira/jira.transport.ts', 'confluence/confluence.transport.ts']) {
      expect(readFileSync(join(SRC, name), 'utf8')).toMatch(/export type \w+ReadTransport = AtlassianReadTransport;/);
    }
  });

  it.each([
    ['Jira', new JiraTransport({})],
    ['Confluence', new ConfluenceTransport({})],
  ])('a %s port implementation needs only get, and the test doubles expose no mutating method', (_name, transport) => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(transport)).filter((m) => m !== 'constructor');
    expect(methods).toEqual(['get']);
    expect(methods.some((m) => MUTATING.test(m))).toBe(false);
  });
});
