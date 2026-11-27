import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';
import { TOKENS, startApp, type TestApp } from './_helpers';

// The test client connects from loopback. Default sign-in limit is 10 per minute per key.
describe('sign-in limiter key behind a proxy (KAWALYS_TRUST_PROXY)', () => {
  let t: TestApp;
  let errorLog: ReturnType<typeof jest.spyOn>;
  const saved = process.env['KAWALYS_TRUST_PROXY'];

  async function start(value: string | undefined): Promise<void> {
    if (value === undefined) delete process.env['KAWALYS_TRUST_PROXY'];
    else process.env['KAWALYS_TRUST_PROXY'] = value;
    t = await startApp();
  }
  const attempt = (client: string) =>
    request(t.app.getHttpServer()).post('/auth/session').set('X-Forwarded-For', client).set('Authorization', `Bearer ${TOKENS.refused}`);
  async function burn(client: string): Promise<void> {
    for (let i = 0; i < 10; i++) expect((await attempt(client)).status).not.toBe(429);
  }

  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    errorLog.mockRestore();
    await t.app.close();
    if (saved === undefined) delete process.env['KAWALYS_TRUST_PROXY'];
    else process.env['KAWALYS_TRUST_PROXY'] = saved;
  });

  it('unset: X-Forwarded-For is ignored, so a spoofed address does not get a fresh bucket', async () => {
    await start(undefined);
    await burn('203.0.113.1');
    expect((await attempt('203.0.113.2')).status).toBe(429);
  });

  it('set and the peer is trusted: different forwarded clients get separate buckets', async () => {
    await start('127.0.0.1/32,::1/128');
    await burn('203.0.113.1');
    expect((await attempt('203.0.113.1')).status).toBe(429);
    expect((await attempt('203.0.113.2')).status).not.toBe(429);
  });

  it('set but the peer is not in the list: X-Forwarded-For is still ignored', async () => {
    await start('10.9.8.0/24');
    await burn('203.0.113.1');
    expect((await attempt('203.0.113.2')).status).toBe(429);
  });

  it('a malformed value refuses to boot', async () => {
    process.env['KAWALYS_TRUST_PROXY'] = '*';
    await expect(startApp()).rejects.toThrow('KAWALYS_TRUST_PROXY');
  });
});
