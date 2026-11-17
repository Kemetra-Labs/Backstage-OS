// V2 visual lab build. Separate from vite.config.ts on purpose: V1's build, port and output stay untouched.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PORT = 4279;

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist-v2', emptyOutDir: true, rollupOptions: { input: 'v2.html' } },
  server: { host: '127.0.0.1', port: PORT, strictPort: true },
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
});
