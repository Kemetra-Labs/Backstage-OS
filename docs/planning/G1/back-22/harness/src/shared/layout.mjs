// @ts-check
// Shared, deterministic adapter + layout used by ALL three renderers (and by the Archify converter script).
// No layout library: longest-path layers (cycles broken by DFS order), <= MAX_COLS columns, rows ordered by file/line.
export const MAX_COLS = 12;

/** @typedef {{key:string,id:string,label:string,kind:string,language:string,file:string,line:number,col:number,row:number,unresolved:boolean,hint?:string}} GNode */
/** @typedef {{key:string,idx:number,type:string,from:string,to:string,fromId:string,toId:string|null,hint?:string,file:string,line:number|null,basis:string,truth:'observed'|'unknown'|'inferred',dangling:boolean}} GEdge */

/** @param {any} env */
export function normalize(env) {
  /** @type {GNode[]} */
  const nodes = env.nodes.map((n, i) => ({
    key: 'n' + i, id: n.id, label: n.id.includes('::') ? n.id.split('::')[1] : n.id.split('/').pop(),
    kind: n.kind, language: n.language, file: n.file, line: n.line, col: 0, row: 0, unresolved: false,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  /** @type {GEdge[]} */
  const edges = [];
  let u = 0;
  env.edges.forEach((e, idx) => {
    let to = e.to;
    let dangling = false;
    if (to === null || to === undefined) {
      // one placeholder per to:null edge: an unresolved target, never a resolved link
      const key = 'u' + u++;
      const hint = e.target_hint || 'unresolved';
      nodes.push({ key, id: 'unresolved:' + key, label: 'unresolved', kind: 'unresolved', language: '', file: '', line: 0, col: 0, row: 0, unresolved: true, hint });
      byId.set('unresolved:' + key, nodes[nodes.length - 1]);
      to = 'unresolved:' + key;
      dangling = true;
    }
    const f = byId.get(e.from), t = byId.get(to);
    if (!f || !t) throw new Error('edge endpoint missing: ' + e.from + ' -> ' + to);
    edges.push({ key: 'e' + idx, idx, type: e.type, from: f.key, to: t.key, fromId: e.from, toId: e.to ?? null, hint: e.target_hint, file: e.file, line: e.line, basis: e.basis, truth: e.basis, dangling });
  });
  layout(nodes, edges);
  return { nodes, edges };
}

/** @param {GNode[]} nodes @param {GEdge[]} edges */
function layout(nodes, edges) {
  const idx = new Map(nodes.map((n, i) => [n.key, i]));
  const out = nodes.map(() => /** @type {number[]} */ ([]));
  const indeg = nodes.map(() => 0);
  for (const e of edges) { out[idx.get(e.from)].push(idx.get(e.to)); indeg[idx.get(e.to)]++; }
  const layer = nodes.map(() => 0);
  const state = nodes.map(() => 0); // 0 new, 1 on stack, 2 done
  /** iterative DFS, back edges ignored */
  const order = [];
  for (const start of [...nodes.keys()].sort((a, b) => indeg[a] - indeg[b] || a - b)) {
    if (state[start]) continue;
    const stack = [[start, 0]];
    state[start] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [v, i] = top;
      if (i < out[v].length) {
        top[1]++;
        const w = out[v][i];
        if (state[w] === 0) { state[w] = 1; stack.push([w, 0]); }
      } else { state[v] = 2; order.push(v); stack.pop(); }
    }
  }
  const pos = new Map(order.reverse().map((v, i) => [v, i])); // topological-ish order from DFS finish
  for (const v of order) {
    for (const w of out[v]) if (pos.get(w) > pos.get(v) && w !== v) layer[w] = Math.max(layer[w], layer[v] + 1);
  }
  // Layer-ordered packed grid: sort by (layer, file, line), fill column-major so the grid stays <= MAX_COLS wide and
  // roughly square. Layers therefore read left to right approximately; the same x/y is fed to every renderer.
  const n = nodes.length;
  const rowsPer = Math.max(Math.ceil(Math.sqrt(n * 0.5)), Math.ceil(n / MAX_COLS));
  const sorted = nodes.map((nd, i) => ({ nd, l: layer[i] }))
    .sort((a, b) => a.l - b.l || (a.nd.file || '~').localeCompare(b.nd.file || '~') || a.nd.line - b.nd.line || a.nd.key.localeCompare(b.nd.key));
  sorted.forEach(({ nd }, i) => { nd.col = Math.floor(i / rowsPer); nd.row = i % rowsPer; });
  const cols = Math.floor((n - 1) / rowsPer) + 1;
  return cols;
}

export const KIND_ORDER = ['module', 'class', 'component', 'function', 'method', 'unresolved'];
