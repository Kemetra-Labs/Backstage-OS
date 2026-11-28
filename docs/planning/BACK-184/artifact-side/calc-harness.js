// BACK-184 benchmark: runs the dash.calc functions of dashboard-page.html against the pinned fixture.
// No dynamic code execution: the page script is required as a committed module (dashboard-calcs.js),
// after a plain text check that it is still identical to the script inside dashboard-page.html.
// Inputs are fixed committed files next to this script (no CLI arguments).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const load = require('./dashboard-calcs.js');

const START = '// --- page script start ---';
const END = '// --- page script end ---';

const html = fs.readFileSync(path.join(__dirname, 'dashboard-page.html'), 'utf8').replace(/\r\n/g, '\n');
const pageScript = html.split('<script>')[1].split('</script>')[0];
const moduleText = fs.readFileSync(path.join(__dirname, 'dashboard-calcs.js'), 'utf8').replace(/\r\n/g, '\n');
const moduleScript = moduleText.slice(moduleText.indexOf(START) + START.length, moduleText.indexOf(END));
if (moduleScript !== pageScript) {
  throw new Error('dashboard-calcs.js no longer matches the script in dashboard-page.html');
}

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'bench-fixture.v1.json'), 'utf8'));
const calcs = {};
let params = { persona: 'owner' };
const dash = {
  calc: (id, o) => { calcs[id] = o; },
  draw: () => {},
  data: () => ({ status: 'loading' }),
  params: () => params,
  setParams: (p) => { params = { ...params, ...p }; },
};
load(dash, { querySelectorAll: () => [] }, {});

const out = {};
for (const persona of ['owner', 'viewer']) {
  params = { persona };
  out[persona] = {};
  for (const [id, c] of Object.entries(calcs)) out[persona][id] = c.fn(fixture);
}
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
