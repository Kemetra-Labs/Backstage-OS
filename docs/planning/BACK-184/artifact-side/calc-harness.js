// BACK-184 benchmark: runs the dash.calc functions of dashboard-page.html against the pinned fixture.
// Inputs are fixed committed files next to this script (no CLI arguments). The page script runs in an
// isolated vm context with stub globals only (no require, process or fs).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HERE = __dirname;
const PAGE = path.join(HERE, 'dashboard-page.html');
const FIXTURE = path.join(HERE, '..', 'fixtures', 'bench-fixture.v1.json');

const html = fs.readFileSync(PAGE, 'utf8');
const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const script = html.split('<script>')[1].split('</script>')[0];

const calcs = {};
let params = { persona: 'owner' };
const dash = {
  calc: (id, o) => { calcs[id] = o; },
  draw: () => {},
  data: () => ({ status: 'loading' }),
  params: () => params,
  setParams: (p) => { params = { ...params, ...p }; },
};
const sandbox = { dash, document: { querySelectorAll: () => [] }, claude: {}, Date, Math, JSON, Object, String, Array };
vm.runInNewContext(script, sandbox, { filename: 'dashboard-page.html#script', timeout: 2000 });

const out = {};
for (const persona of ['owner', 'viewer']) {
  params = { persona };
  out[persona] = {};
  for (const [id, c] of Object.entries(calcs)) out[persona][id] = c.fn(fixture);
}
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
