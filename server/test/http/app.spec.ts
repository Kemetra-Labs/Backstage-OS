import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../../src/create-app';
import { isErrorEnvelope } from '../../src/errors/envelope';

@Controller()
class BoomController {
  @Get('boom')
  boom(): never {
    throw new Error('db password=hunter2');
  }
}

const PERSONA = 'x-kawalys-demo-persona';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Kawalys BFF', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp([BoomController]);
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /process is up and synthetic, never "healthy"', async () => {
    const res = await request(app.getHttpServer()).get('/process');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: 'kawalys-bff', process: 'up', synthetic: true });
    expect(JSON.stringify(res.body)).not.toContain('healthy');
  });

  it('technical reads E-5; E-1 readable by all', async () => {
    const a = await request(app.getHttpServer()).get('/demo/evidence/E-5').set(PERSONA, 'technical');
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ id: 'E-5', title: 'Synthetic error read', synthetic: true });
    const b = await request(app.getHttpServer()).get('/demo/evidence/E-1').set(PERSONA, 'owner');
    expect(b.status).toBe(200);
    expect(b.body.id).toBe('E-1');
    const c = await request(app.getHttpServer()).get('/demo/evidence/E-1');
    expect(c.status).toBe(200);
  });

  it('unknown persona value is treated as nontechnical', async () => {
    const res = await request(app.getHttpServer()).get('/demo/evidence/E-5').set(PERSONA, 'admin');
    expect(res.status).toBe(404);
  });

  it.each(['owner', 'nontechnical'])(
    'restricted E-5 is indistinguishable from absent E-999 for %s',
    async (persona) => {
      const send = (id: string) =>
        request(app.getHttpServer())
          .get(`/demo/evidence/${id}`)
          .set(PERSONA, persona)
          .set('x-request-id', 'req-aaaaaaaa');
      const restricted = await send('E-5');
      const absent = await send('E-999');
      expect(restricted.status).toBe(404);
      expect(absent.status).toBe(404);
      const rb = JSON.parse(restricted.text);
      const ab = JSON.parse(absent.text);
      delete rb.error.request_id;
      delete ab.error.request_id;
      expect(rb).toEqual(ab);
      expect(restricted.headers['content-type']).toBe(absent.headers['content-type']);
      expect(restricted.headers['content-length']).toBe(absent.headers['content-length']);
      expect(restricted.text).not.toContain('E-5');
      expect(restricted.text).not.toContain('technical');
      expect(restricted.text).not.toContain('Synthetic error read');
    },
  );

  it('unknown route returns our envelope', async () => {
    const res = await request(app.getHttpServer()).get('/nope');
    expect(res.status).toBe(404);
    expect(isErrorEnvelope(res.body)).toBe(true);
    expect(res.text).not.toContain('Cannot GET');
  });

  it('thrown Error leaks nothing', async () => {
    const res = await request(app.getHttpServer()).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Something went wrong.');
    expect(res.text).not.toContain('hunter2');
    expect(res.text).not.toContain('password');
    expect(res.text).not.toContain('at ');
  });

  it('malformed JSON on POST /process: parser runs first, fixed 400 with no parser text', async () => {
    const res = await request(app.getHttpServer())
      .post('/process')
      .set('content-type', 'application/json')
      .send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    for (const s of ['Unexpected', 'JSON', 'SyntaxError']) expect(res.text).not.toContain(s);
    expect(res.headers['x-request-id']).toBe(res.body.error.request_id);
  });

  it('x-request-id is echoed only when well-formed', async () => {
    const ok = await request(app.getHttpServer()).get('/nope').set('x-request-id', 'req-1234abcd');
    expect(ok.headers['x-request-id']).toBe('req-1234abcd');
    expect(ok.body.error.request_id).toBe('req-1234abcd');
    const bad = await request(app.getHttpServer()).get('/process').set('x-request-id', 'a'.repeat(100));
    expect(bad.headers['x-request-id']).toMatch(UUID);
    const bad2 = await request(app.getHttpServer()).get('/nope').set('x-request-id', 'a'.repeat(100));
    expect(bad2.headers['x-request-id']).toMatch(UUID);
    expect(bad2.body.error.request_id).toBe(bad2.headers['x-request-id']);
  });

  it('error responses carry matching request id header and body', async () => {
    const res = await request(app.getHttpServer()).get('/boom');
    expect(res.headers['x-request-id']).toBe(res.body.error.request_id);
  });

  it('nest does not advertise itself', async () => {
    const res = await request(app.getHttpServer()).get('/process');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
