// BACK-172 G5: an unlisted Host gets the uniform 404 before anything else runs; production will not boot without
// KAWALYS_ALLOWED_HOSTS.
import request from 'supertest';
import { ConfigError } from '../../src/config/database-config';
import { createApp } from '../../src/create-app';
import { hostCheck } from '../../src/http/host-check';

const shape = (res: request.Response) => {
  const headers: Record<string, unknown> = { ...res.headers };
  delete headers['date'];
  delete headers['x-request-id'];
  delete headers['etag']; // a hash of the body, which carries the server request id
  const body = JSON.parse(res.text);
  delete body.error.request_id;
  return { status: res.status, headers, body };
};

describe('hostCheck middleware', () => {
  const run = (host: string | string[] | undefined, allowed: readonly string[]) => {
    let passed = false;
    const res = { setHeader: () => undefined, status: () => ({ json: () => undefined }) };
    hostCheck(allowed)({ headers: host === undefined ? {} : { host } }, res, () => void (passed = true));
    return passed;
  };
  it('matches the host name case-insensitively; an entry without a port allows any port, one with a port needs it', () => {
    expect(run('Kawalys.Example.com', ['kawalys.example.com'])).toBe(true);
    expect(run('kawalys.example.com:8443', ['kawalys.example.com'])).toBe(true);
    expect(run('kawalys.example.com:8443', ['kawalys.example.com:8443'])).toBe(true);
    expect(run('kawalys.example.com:9', ['kawalys.example.com:8443'])).toBe(false);
    expect(run('kawalys.example.com', ['kawalys.example.com:8443'])).toBe(false);
  });
  it('refuses a missing, repeated, lookalike or empty Host', () => {
    expect(run(undefined, ['a.example.com'])).toBe(false);
    expect(run(['a.example.com', 'a.example.com'], ['a.example.com'])).toBe(false);
    expect(run('a.example.com.evil.com', ['a.example.com'])).toBe(false);
    expect(run('evil.com#a.example.com', ['a.example.com'])).toBe(false);
    expect(run('', ['a.example.com'])).toBe(false);
  });
  it('a part after the last colon that is not a port (1-65535 digits) never matches, even for a port-less entry', () => {
    for (const bad of ['a.example.com:evil', 'a.example.com:', 'a.example.com:0', 'a.example.com:65536', 'a.example.com:80x', 'a.example.com:-1', 'a.example.com::80']) {
      expect(run(bad, ['a.example.com'])).toBe(false);
    }
    expect(run('a.example.com:1', ['a.example.com'])).toBe(true);
    expect(run('a.example.com:65535', ['a.example.com'])).toBe(true);
  });
});

describe('createApp with KAWALYS_ALLOWED_HOSTS', () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });

  it('answers an unlisted Host with the same 404 envelope and headers as an unknown route, and passes a listed one', async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['KAWALYS_ALLOWED_HOSTS'] = 'kawalys.example.com';
    const app = await createApp();
    try {
      const server = app.getHttpServer();
      const refused = await request(server).get('/process').set('Host', 'evil.example.com');
      const unknown = await request(server).get('/no-such-route').set('Host', 'kawalys.example.com');
      expect(refused.status).toBe(404);
      expect(refused.headers['cache-control']).toBe('no-store');
      expect(shape(refused)).toEqual(shape(unknown));
      expect(refused.body.error.request_id).toBe(refused.headers['x-request-id']);
      // Also for a state-changing request, before the Origin check or any body parsing.
      const post = await request(server).post('/auth/session').set('Host', 'evil.example.com').set('Sec-Fetch-Site', 'same-origin').set('Content-Type', 'application/json').send('{bad');
      expect(shape(post)).toEqual(shape(unknown));
      expect((await request(server).get('/process').set('Host', 'kawalys.example.com')).status).toBe(200);
      expect((await request(server).get('/process').set('Host', 'KAWALYS.example.com:8787')).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('is off when the variable is unset outside production (loopback test runs unchanged)', async () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['KAWALYS_ALLOWED_HOSTS'];
    const app = await createApp();
    try {
      expect((await request(app.getHttpServer()).get('/process').set('Host', 'anything.example')).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('refuses to boot in production without it, and on a malformed value without echoing it', async () => {
    Object.assign(process.env, { NODE_ENV: 'production', KAWALYS_DESCOPE_PROJECT_ID: 'PkawalysTest0001', KAWALYS_OWNER_SUBJECT: 'UkawalysOwner0001' });
    delete process.env['KAWALYS_ALLOWED_HOSTS'];
    await expect(createApp()).rejects.toBeInstanceOf(ConfigError);
    process.env['KAWALYS_ALLOWED_HOSTS'] = 'https://secret-value.example.com';
    const failure = await createApp().then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(failure).toBeInstanceOf(ConfigError);
    expect(failure!.message).toContain('KAWALYS_ALLOWED_HOSTS');
    expect(failure!.message).not.toContain('secret-value');
  });
});
