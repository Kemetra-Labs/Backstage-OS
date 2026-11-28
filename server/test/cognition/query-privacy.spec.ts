import { jest } from '@jest/globals';
// BACK-154 query privacy: the live search carries its text in the URL (?q=). Pins what keeps that text out of
// logs and Referer headers today: the edge sends no Referer and keeps no access log, and the one server log
// line (a 5xx) names a request id and an exception class, never the URL. Residuals (the browser address bar
// and history; edge logs once the site is proxied; Caddy's default error log on an upstream failure, not yet
// verified) are owner and operator decisions, recorded in the matrix (section 23).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger, type ArgumentsHost } from '@nestjs/common';
import { MemoryReadBudgetExceeded } from '../../src/memory/memory.repository';
import { SafeErrorFilter } from '../../src/http/safe-error.filter';

const SECRET = 'payroll-merger-codename';
const CADDYFILE = resolve(process.cwd(), '..', 'deploy', 'pilot', 'Caddyfile');

describe('the live search text stays out of logs and Referer headers', () => {
  it('the edge sends no Referer and keeps no access log', () => {
    const caddy = readFileSync(CADDYFILE, 'utf8');
    expect(caddy).toMatch(/^\s*Referrer-Policy no-referrer\s*$/m);
    // Caddy writes access logs only when a `log` directive is present.
    expect(caddy).not.toMatch(/^\s*log\b/m);
  });

  it('a failed search logs no URL and no query text', () => {
    const logged: unknown[] = [];
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation((...a: unknown[]) => {
      logged.push(...a);
    });
    const consoleSpies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      logged.push(...a);
    }));
    try {
      const res = { headersSent: false, setHeader: () => undefined, status: () => ({ json: () => undefined }) };
      const req = { url: `/cognition/projects/00000000-0000-4000-8000-000000000001/search?q=${SECRET}`, originalUrl: `/api/cognition/search?q=${SECRET}`, query: { q: SECRET }, requestId: 'req-00000001' };
      const host = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as unknown as ArgumentsHost;
      new SafeErrorFilter().catch(new MemoryReadBudgetExceeded(), host);
      expect(error).toHaveBeenCalledTimes(1);
      const text = JSON.stringify(logged);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('?q=');
      expect(text).not.toContain('/search');
    } finally {
      error.mockRestore();
      for (const s of consoleSpies) s.mockRestore();
    }
  });
});
