// D3(a): the default (fixture) build ships no Descope code. The import of @descope/web-component is dynamic and lives in SignInPage, which
// App.tsx mounts only behind `LIVE && isSignInRoute(...)`; the `LIVE &&` is what lets the build drop SignInPage and its import (without it
// the fixture build emitted Descope code in 4 files, measured on 27 Nov 2026). Nothing else checks that, so this builds the app in the
// default mode, in-process, in memory (write: false: no temp files to clean up) with VITE_KAWALYS_LIVE unset, and fails when any emitted
// file (chunk code, asset text, file names) mentions "descope".
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import type { RollupOutput } from 'rollup';
import { afterAll, describe, expect, it } from 'vitest';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));

type Emitted = { readonly fileName: string; readonly type: 'chunk' | 'asset'; readonly code?: string; readonly source?: string | Uint8Array };

/** The emitted files that mention "descope" (case-insensitive) in their name or, for chunks and text assets, their content. */
export function descopeFiles(files: readonly Emitted[]): string[] {
  const re = /descope/i;
  return files
    .filter((f) => re.test(f.fileName) || (f.type === 'chunk' ? re.test(f.code ?? '') : typeof f.source === 'string' && re.test(f.source)))
    .map((f) => f.fileName);
}

describe('descopeFiles (the rule bites)', () => {
  it('names a chunk, a text asset or a file name that mentions Descope, in any case, and only those', () => {
    expect(descopeFiles([
      { fileName: 'assets/a.js', type: 'chunk', code: 'const x = import("@descope/web-component")' },
      { fileName: 'assets/b.js', type: 'chunk', code: 'customElements.define("DeScoPe-wc")' },
      { fileName: 'index.html', type: 'asset', source: '<script src="descope.js">' },
      { fileName: 'assets/descope-wc-1.js', type: 'chunk', code: '' },
      { fileName: 'assets/ok.js', type: 'chunk', code: 'const x = 1' },
      { fileName: 'assets/f.woff2', type: 'asset', source: new Uint8Array([1, 2, 3]) },
    ])).toEqual(['assets/a.js', 'assets/b.js', 'index.html', 'assets/descope-wc-1.js']);
  });
});

describe('fixture bundle guard (D3(a))', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'kawalys-fixture-build-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it('the default build emits no file that mentions Descope', async () => {
    const saved = process.env.VITE_KAWALYS_LIVE;
    delete process.env.VITE_KAWALYS_LIVE;
    try {
      const result = await build({
        root: APP_ROOT,
        configFile: join(APP_ROOT, 'vite.config.ts'),
        mode: 'production',
        logLevel: 'silent',
        envDir: scratch, // an empty directory: no .env file can switch live mode on
        build: { write: false, outDir: join(scratch, 'out'), emptyOutDir: false, reportCompressedSize: false },
      });
      const outputs = (Array.isArray(result) ? result : [result]) as RollupOutput[];
      const files = outputs.flatMap((o) => o.output) as unknown as Emitted[];
      // The build really ran: the app's own code is there.
      expect(files.some((f) => f.type === 'chunk' && /Kawalys/.test(f.code ?? ''))).toBe(true);
      expect(descopeFiles(files)).toEqual([]);
    } finally {
      if (saved === undefined) delete process.env.VITE_KAWALYS_LIVE;
      else process.env.VITE_KAWALYS_LIVE = saved;
    }
  }, 120_000);
});
