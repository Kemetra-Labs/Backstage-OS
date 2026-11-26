/// <reference types="vitest" />
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

const PORT = 4178;

/**
 * Live mode (BACK-51 P1, owner decision D2 (a)): the app calls relative /api/... on its own origin, and this proxy forwards to
 * the Kawalys BFF with the prefix stripped. Same origin keeps the BFF's CSRF defence (SameSite=Strict `__Host-` cookie, no
 * CORS) unchanged. The Host header is passed through (changeOrigin false): the cookie is host-only, and the BFF checks no Host.
 * When the BFF cannot be reached, answer 502 (Vite's default is a plain 500) so the app reads it as unavailable, not as an
 * error of the server. Unused in fixture mode: the default build makes no request.
 */
// The key is a regex (Vite treats a leading ^ as one): /api and /api/... only, never /apifoo.
const API_PROXY: Record<string, ProxyOptions> = {
  '^/api(/|$)': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: false,
    rewrite: (path) => path.replace(/^\/api(?=\/|$)/, ''),
    configure: (proxy) => {
      proxy.on('error', (_err, _req, res) => {
        if ('writeHead' in res && !res.headersSent && !res.writableEnded) res.writeHead(502, { 'Content-Type': 'text/plain' }).end();
      });
    },
  },
};

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: PORT, strictPort: true, proxy: API_PROXY },
  preview: { host: '127.0.0.1', port: PORT, strictPort: true, proxy: API_PROXY },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/contract/**/*.ts', 'src/api/**/*.ts', 'src/live/**/*.ts', 'src/view/**/*.ts', 'src/i18n/**/*.ts', 'src/nav/routes.ts', 'src/nav/search.ts', 'src/bridge/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/contract/types.ts', 'src/contract/world.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
