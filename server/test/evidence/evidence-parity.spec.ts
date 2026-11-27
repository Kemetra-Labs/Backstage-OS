// Response-shape parity with the app for the evidence, investigation and decision routes (BACK-98), the same
// contract as portfolio-parity.spec.ts: the shapes stay duplicated in server/ and app/ and this test keeps them
// in step. It seeds a disposable Postgres with the BACK-61 synthetic seed on a fixed clock, builds each body
// exactly as its controller does, through the real repositories (RLS, grants and the visibility rule apply),
// and requires it to equal the committed app fixture:
//   GET /evidence                  -> app/src/fixture/evidence-response.json
//   GET /investigations/:id        -> app/src/fixture/investigation-response.json
//   GET /decisions                 -> app/src/fixture/decisions-response.json
// The app half (app/src/api/parity.test.ts) requires every record of those files to parse with nothing
// dropped. Ids and database-set times are normalised (see normalise()). Regenerate the files after an
// intended shape change with KAWALYS_WRITE_PARITY_FIXTURES=1.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { InvestigationRepository } from '../../src/investigations/investigation.repository';
import { generateLocalCredentials } from '../../src/ops/local-credentials';
import { localRuntimeUrls, prepareLocalDatabase, seedLocal, type SeedSummary } from '../../src/ops/local-stack';
import { MIGRATIONS_DIR } from '../db/kawalys-db';
import { startPgContainer, stopPgContainer, type PgContainer } from '../db/pg-container';
import { approveAll } from './approve-all-policy';

const ROOT = existsSync(join(process.cwd(), '..', 'app')) ? join(process.cwd(), '..') : process.cwd();
const fixture = (name: string) => join(ROOT, 'app', 'src', 'fixture', name);

/** The app's fixture clock (app/src/view/githubReadView.ts FIXTURE_NOW). */
const NOW = Date.parse('2026-11-25T12:00:00.000Z');
/** Fields the database sets itself (`now()`); everything else in a body is deterministic on a fixed seed clock. */
const DB_TIME_KEYS = new Set(['receivedAt', 'createdAt']);
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

let base: PgContainer | undefined;
let app: pg.Pool;
let auth: pg.Pool;
let seed: SeedSummary;

beforeAll(async () => {
  base = await startPgContainer();
  const adminUrl = base.container.getConnectionUri();
  const creds = generateLocalCredentials();
  await prepareLocalDatabase(adminUrl, creds, {}, MIGRATIONS_DIR);
  const urls = localRuntimeUrls(adminUrl, creds);
  app = new pg.Pool({ connectionString: urls.app, max: 2 });
  auth = new pg.Pool({ connectionString: urls.auth, max: 2 });
  seed = await seedLocal({ app, auth }, undefined, NOW);
}, 180_000);

afterAll(async () => {
  await app?.end();
  await auth?.end();
  await stopPgContainer(base);
}, 60_000);

/** Rows written in one transaction share `received_at`, so "newest first" ties; order them stably for the file. */
const byRef = <T extends { type?: string; sourceRef?: string; id: string }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => `${a.type ?? ''}|${a.sourceRef ?? ''}`.localeCompare(`${b.type ?? ''}|${b.sourceRef ?? ''}`));

/**
 * Generated ids become stable placeholders in order of first appearance (a reference keeps pointing at the same
 * record), and database-set times become the fixture clock. Shapes, types, states and payloads are untouched.
 */
function normalise(body: unknown): unknown {
  const ids = new Map<string, string>();
  const id = (u: string) => {
    const k = u.toLowerCase();
    if (!ids.has(k)) ids.set(k, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`);
    return ids.get(k)!;
  };
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === 'string') return key && DB_TIME_KEYS.has(key) ? new Date(NOW).toISOString() : v.replace(UUID_RE, id);
    // `citations` come back ORDER BY evidence_id, a random UUID: sort the placeholders so the file is stable.
    if (Array.isArray(v)) return key === 'citations' ? v.map((x) => walk(x)).sort() : v.map((x) => walk(x));
    if (v && typeof v === 'object') {
      // A HumanDecision has no source reading: its observedAt is also the database's insert time.
      const dbTime = (k: string) => DB_TIME_KEYS.has(k) || ((v as { type?: unknown }).type === 'HumanDecision' && k === 'observedAt');
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' && dbTime(k) ? new Date(NOW).toISOString() : walk(x, k)]));
    }
    return v;
  };
  const plain = JSON.parse(JSON.stringify(body)) as unknown;
  // Pass 1 numbers every id outside `citations` (records and their own fields, in body order), so a citation's
  // random database order can never decide a number. Pass 2 builds the result with those numbers.
  const number = (v: unknown, key?: string): void => {
    if (key === 'citations') return;
    if (typeof v === 'string') v.replace(UUID_RE, id);
    else if (Array.isArray(v)) v.forEach((x) => number(x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => number(x, k));
  };
  number(plain);
  return walk(plain);
}

function matchesFixture(name: string, body: unknown): void {
  const path = fixture(name);
  if (process.env['KAWALYS_WRITE_PARITY_FIXTURES'] === '1') writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(body);
}

/** The three bodies, built exactly as their controllers build them, then normalised with ONE id map. */
async function bodies() {
  const evidence = new EvidenceRepository(app, approveAll());
  const items = await evidence.list(seed.workspaceId, seed.userId, {}); // EvidenceController.list
  const investigation = await new InvestigationRepository(app).get(seed.workspaceId, seed.userId, seed.investigationId);
  const invEvidence = await evidence.list(seed.workspaceId, seed.userId, { investigationId: seed.investigationId });
  const decisions = await evidence.recentDecisions(seed.workspaceId, seed.userId, { limit: 20 }); // EvidenceController.decisions, default limit
  return normalise({
    evidence: { items: byRef(items) },
    investigation: { ...investigation, evidence: byRef(invEvidence) }, // InvestigationController.get
    decisions,
  }) as { evidence: { items: { id: string; type: string; state: string }[] }; investigation: { status: string; evidence: unknown[] }; decisions: { items: { createdBy: string | null; citations: string[] }[]; nextCursor: string | null } };
}

describe('evidence, investigation and decision response parity with the app fixtures (BACK-98)', () => {
  it('GET /evidence: the app reads exactly what the repository returns', async () => {
    const { evidence } = await bodies();
    expect(evidence.items.map((r) => `${r.type}/${r.state}`).sort()).toEqual(
      ['Correlation/ok', 'HumanDecision/ok', 'Observation/error', 'Observation/ok', 'Observation/stale', 'Observation/unknown'],
    );
    matchesFixture('evidence-response.json', evidence);
  });

  it('GET /investigations/:id: the investigation and its evidence', async () => {
    const { investigation } = await bodies();
    expect(investigation.status).toBe('open');
    expect(investigation.evidence.length).toBeGreaterThan(0);
    matchesFixture('investigation-response.json', investigation);
  });

  it('GET /decisions: creator and time on every decision', async () => {
    const { decisions } = await bodies();
    expect(decisions.items).toHaveLength(1);
    expect(decisions.nextCursor).toBeNull();
    expect(decisions.items[0]!.createdBy).not.toBeNull();
    expect(decisions.items[0]!.citations).toHaveLength(2);
    matchesFixture('decisions-response.json', decisions);
  });

  it('ids are consistent across the three files: a decision cites records of the evidence body', async () => {
    const { evidence, decisions } = await bodies();
    const ids = new Set(evidence.items.map((r) => r.id));
    expect(decisions.items[0]!.citations.every((c) => ids.has(c))).toBe(true);
  });
});
