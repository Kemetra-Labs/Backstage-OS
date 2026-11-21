// Envelope -> Archify architecture JSON-IR, using the SAME normalize()/layout as the other renderers.
// Usage: node to-archify.mjs <envelope.json> <out.json> <output-html-name>
import fs from 'node:fs';
import { normalize } from '../src/shared/layout.mjs';
const [inp, outp, htmlName, mode = 'shared'] = process.argv.slice(2); // mode: shared (same row/col as other renderers) | auto (Archify native placement)
const env = JSON.parse(fs.readFileSync(inp, 'utf8'));
let g = normalize(env);
if (mode === 'modules') {
  // reduced scope (NOT the full graph): module nodes + unresolved stubs of module-origin edges, no contains edges
  const edges = g.edges.filter((e) => e.type !== 'contains' && g.nodes.find((n) => n.key === e.from).kind === 'module');
  const keep = new Set(edges.flatMap((e) => [e.from, e.to]));
  const nodes = g.nodes.filter((n) => keep.has(n.key));
  const rowsPer = Math.max(4, Math.ceil(nodes.length / 12)); // keep grid cols <= 12 (Archify schema cap)
  nodes.forEach((n, i) => { n.col = Math.floor(i / rowsPer); n.row = i % rowsPer; });
  g = { nodes, edges };
}
const cols = Math.max(...g.nodes.map((n) => n.col)) + 1;
const typeOf = (n) => (n.unresolved ? 'external' : n.language === 'python' ? 'backend' : 'frontend');
const out = {
  schema_version: 1,
  diagram_type: 'architecture',
  meta: { title: 'Hybrid Mission Map renderer test: ' + env.source.fixture_version, output: htmlName, quality_profile: 'standard' },
  layout: { mode: 'grid', cols, cellW: 150, cellH: 54, gapX: +(process.env.AR_GX||90), gapY: +(process.env.AR_GY||30) },
  components: g.nodes.map((n) => ({
    id: n.key, type: typeOf(n), label: n.unresolved ? 'unresolved' : n.label,
    sublabel: n.unresolved ? n.hint.slice(0, 24) : `${n.kind} | ${n.file.split('/').pop()}`.slice(0, 28), ...(mode !== 'auto' ? { row: n.row, col: n.col } : {}),
  })),
  connections: g.edges.map((e) => ({
    id: e.key, from: e.from, to: e.to,
    ...(e.truth === 'unknown' ? { variant: 'dashed' } : {}),
  })),
};
fs.writeFileSync(outp, JSON.stringify(out, null, 1));
console.log('nodes', out.components.length, 'connections', out.connections.length, 'cols', cols);
