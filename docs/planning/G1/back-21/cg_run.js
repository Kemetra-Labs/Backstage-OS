// Index a project with CodeGraph via its public library API (no CLI init/install, no agent config).
// Equivalent of what `codegraph init` does internally: CodeGraph.init(root,{index:false}) then indexAll().
const path = require('path');
const LIB = path.join(__dirname, 'cg-install', 'node_modules', '@colbymchenry', 'codegraph-win32-x64', 'lib', 'dist', 'index.js');
const mod = require(LIB);
const CodeGraph = mod.default || mod.CodeGraph || mod;
(async () => {
  const root = path.resolve(process.argv[2]);
  const cg = await CodeGraph.init(root, { index: false });
  const result = await cg.indexAll({});
  console.log(JSON.stringify(result, null, 1));
  cg.destroy();
  process.exit(result && result.success === false ? 1 : 0);
})().catch((e) => { console.error('cg_run error:', e && e.stack || e); process.exit(2); });
