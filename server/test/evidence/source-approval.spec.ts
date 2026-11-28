// Approved source identity policy and reauthorization (BACK-131). Unit tests, no database.
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { createApp } from '../../src/create-app';
import { ConfigError } from '../../src/config/database-config';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { NotVisibleError } from '../../src/evidence/evidence.types';
import { configuredApprovalPolicy, Reauthorization, REAUTH_MAX_AGE_MS } from '../../src/evidence/source-approval';

const NAME = 'KAWALYS_APPROVED_SOURCES';
const policy = (value: string | undefined) => configuredApprovalPolicy(value === undefined ? {} : { [NAME]: value });

describe('configuredApprovalPolicy', () => {
  it('approves nothing when the variable is unset, empty or blank (fail-closed)', () => {
    for (const v of [undefined, '', '   ']) expect(policy(v).approvedIdentities('retail-tower')).toEqual([]);
  });

  it('parses one entry and lower-cases the reference', () => {
    expect(policy('retail-tower=github:Kemetra-Labs/Backstage-OS').approvedIdentities('retail-tower')).toEqual([
      { provider: 'github', externalRef: 'kemetra-labs/backstage-os' },
    ]);
  });

  it('keeps a set per project key and nothing for another key', () => {
    const p = policy(' retail-tower=github:kemetra-labs/a , retail-tower=github:kemetra-labs/b,retail-tower=jira:BACK,other=github:x/y ');
    expect(p.approvedIdentities('retail-tower')).toEqual([
      { provider: 'github', externalRef: 'kemetra-labs/a' },
      { provider: 'github', externalRef: 'kemetra-labs/b' },
      { provider: 'jira', externalRef: 'back' },
    ]);
    expect(p.approvedIdentities('other')).toEqual([{ provider: 'github', externalRef: 'x/y' }]);
    expect(p.approvedIdentities('unknown')).toEqual([]);
  });

  it('does not duplicate an identity listed twice', () => {
    expect(policy('p=github:a/b,p=github:A/B').approvedIdentities('p')).toHaveLength(1);
  });

  it.each([
    ['missing equals sign', 'retail-tower'],
    ['bad provider', 'retail-tower=gitlab:a/b'],
    ['missing provider separator', 'retail-tower=a/b'],
    ['bad github ref (no slash)', 'retail-tower=github:backstage-os'],
    ['bad github ref (dots only)', 'retail-tower=github:a/..'],
    ['bad github ref (space)', 'retail-tower=github:a/b c'],
    ['empty project key', '=github:a/b'],
    ['invalid project key', 'Retail_Tower=github:a/b'],
    ['empty entry between commas', 'p=github:a/b,,p=github:a/c'],
    ['trailing comma', 'p=github:a/b,'],
    ['empty reference', 'p=jira:'],
    ['one bad entry among good ones', 'p=github:a/b,q=nope'],
  ])('throws at startup for a malformed entry: %s', (_label, value) => {
    expect(() => policy(value)).toThrow(ConfigError);
  });

  it('parses a pinned repository id (github:owner/repo#id) and keeps it on the identity', () => {
    expect(policy('retail-tower=github:Kemetra-Labs/Backstage-OS#1234567').approvedIdentities('retail-tower')).toEqual([
      { provider: 'github', externalRef: 'kemetra-labs/backstage-os', repositoryId: 1234567 },
    ]);
  });

  it('leaves repositoryId absent when no id is given (backwards compatible)', () => {
    const [id] = policy('p=github:a/b').approvedIdentities('p');
    expect(id).toEqual({ provider: 'github', externalRef: 'a/b' });
    expect('repositoryId' in id!).toBe(false);
  });

  it('merges one identity listed with and without an id, and refuses two different ids', () => {
    expect(policy('p=github:a/b,p=github:A/B#9').approvedIdentities('p')).toEqual([{ provider: 'github', externalRef: 'a/b', repositoryId: 9 }]);
    expect(policy('p=github:a/b#9,p=github:a/b').approvedIdentities('p')).toEqual([{ provider: 'github', externalRef: 'a/b', repositoryId: 9 }]);
    expect(() => policy('p=github:a/b#9,p=github:a/b#10')).toThrow(ConfigError);
  });

  it.each([
    ['an empty id', 'p=github:a/b#'],
    ['a zero id', 'p=github:a/b#0'],
    ['a negative id', 'p=github:a/b#-5'],
    ['a decimal id', 'p=github:a/b#1.5'],
    ['a non-numeric id', 'p=github:a/b#abc'],
    ['a leading-zero id', 'p=github:a/b#007'],
    ['an unsafe integer id', 'p=github:a/b#99999999999999999999'],
    ['two ids', 'p=github:a/b#1#2'],
    ['an id on a jira entry', 'p=jira:BACK#5'],
  ])('throws for %s', (_label, value) => {
    expect(() => policy(value)).toThrow(ConfigError);
  });

  it('names the variable in the error and never echoes the value', () => {
    let message = '';
    try {
      policy('secret-looking-value');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(NAME);
    expect(message).not.toContain('secret-looking-value');
  });
});

describe('Reauthorization', () => {
  const now = 1_800_000_000_000;

  it('is fresh at age 0 and at exactly the maximum age', () => {
    expect(Reauthorization.fromSessionIssuedAt(now).isFreshAt(now)).toBe(true);
    expect(Reauthorization.fromSessionIssuedAt(now - REAUTH_MAX_AGE_MS).isFreshAt(now)).toBe(true);
  });

  it('is stale one millisecond past the maximum age', () => {
    expect(Reauthorization.fromSessionIssuedAt(now - REAUTH_MAX_AGE_MS - 1).isFreshAt(now)).toBe(false);
  });

  it('is refused when issued in the future', () => {
    expect(Reauthorization.fromSessionIssuedAt(now + 1).isFreshAt(now)).toBe(false);
  });

  it('allows five minutes and rejects a non-finite timestamp', () => {
    expect(REAUTH_MAX_AGE_MS).toBe(300_000);
    expect(() => Reauthorization.fromSessionIssuedAt(Number.NaN)).toThrow(TypeError);
    expect(() => Reauthorization.fromSessionIssuedAt(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('cannot be built from a boolean (type level) or by new', () => {
    // @ts-expect-error a boolean is not a Reauthorization
    const fake: Reauthorization = true;
    expect(fake).toBe(true);
    // @ts-expect-error the constructor is private: only fromSessionIssuedAt builds one
    expect(() => new Reauthorization(now)).not.toThrow();
  });
});

describe('startup wiring (create-app.ts)', () => {
  const saved = process.env[NAME];
  afterEach(() => {
    if (saved === undefined) delete process.env[NAME];
    else process.env[NAME] = saved;
  });

  it('createApp rejects a malformed value, with no database, naming the variable and not the value', async () => {
    process.env[NAME] = 'not-a-valid-entry';
    const failure = await createApp().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(ConfigError);
    expect((failure as Error).message).toContain(NAME);
    expect((failure as Error).message).not.toContain('not-a-valid-entry');
  });

  it('createApp starts with a valid value', async () => {
    process.env[NAME] = 'retail-tower=github:kemetra-labs/backstage-os';
    const started = createApp();
    await expect(started).resolves.toBeDefined();
    await (await started).close();
  });
});

describe('Reauthorization cannot be forged at runtime', () => {
  const SOURCE = randomUUID();
  // The check runs before any database access, so no pool is needed: a forged proof never reaches the database.
  const repository = new EvidenceRepository(undefined as unknown as pg.Pool, { approvedIdentities: () => [] });
  const attempt = (proof: unknown) => repository.reconnectSource(randomUUID(), randomUUID(), SOURCE, proof as Reauthorization);

  it('an instance is frozen and genuine; lookalikes are not genuine', () => {
    const real = Reauthorization.fromSessionIssuedAt(Date.now());
    expect(Object.isFrozen(real)).toBe(true);
    expect(() => {
      (real as { issuedAtMs: number }).issuedAtMs = 0;
    }).toThrow(TypeError);
    expect(Reauthorization.isGenuine(real)).toBe(true);
    for (const fake of [Object.create(Reauthorization.prototype), { issuedAtMs: Date.now() }, { ...real }, true, null, undefined]) {
      expect(Reauthorization.isGenuine(fake)).toBe(false);
    }
  });

  it('reconnectSource refuses a prototype forgery, a plain object cast, a mutated copy and a boolean', async () => {
    const forged = Object.create(Reauthorization.prototype);
    Object.defineProperty(forged, 'issuedAtMs', { value: Date.now() });
    const real = Reauthorization.fromSessionIssuedAt(Date.now());
    for (const fake of [forged, { issuedAtMs: Date.now() }, { ...real, issuedAtMs: Date.now() }, true]) {
      await expect(attempt(fake)).rejects.toBeInstanceOf(NotVisibleError);
    }
  });

  it('reconnectSource refuses a stale proof and a future proof before touching the database', async () => {
    await expect(attempt(Reauthorization.fromSessionIssuedAt(Date.now() - REAUTH_MAX_AGE_MS - 1))).rejects.toBeInstanceOf(NotVisibleError);
    await expect(attempt(Reauthorization.fromSessionIssuedAt(Date.now() + 60_000))).rejects.toBeInstanceOf(NotVisibleError);
  });
});
