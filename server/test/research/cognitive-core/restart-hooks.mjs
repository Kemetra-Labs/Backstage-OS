// Loaded with `node --import` by the F12b restart test only. Node strips TypeScript types natively, but
// its ESM resolver needs file extensions; the research modules use extensionless relative imports (the
// server's Jest/ts-jest convention), so a relative specifier without one is retried with `.ts`.
// No network, no package, nothing outside the process.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(specifier + '.ts', context);
      throw error;
    }
  },
});
