import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Multi-page build: three entries share one chunk, so per-page gzip sizes are measurable.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    modulePreload: { polyfill: false }, // the polyfill injects inline code that a strict CSP would flag
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        depgraph: resolve(__dirname, 'depgraph.html'),
        reactflow: resolve(__dirname, 'reactflow.html'),
        archify: resolve(__dirname, 'archify.html'),
      },
    },
  },
});
