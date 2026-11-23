/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PORT = 4178;

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: PORT, strictPort: true },
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/contract/**/*.ts', 'src/view/**/*.ts', 'src/i18n/**/*.ts', 'src/nav/routes.ts', 'src/nav/search.ts', 'src/bridge/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/contract/types.ts', 'src/contract/world.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
