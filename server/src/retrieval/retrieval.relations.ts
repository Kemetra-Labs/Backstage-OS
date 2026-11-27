// Typed relationships and bounded traversal (BACK-106 R6), derived on every call from visible items.
// No edge is stored. A mention of an identifier with no visible target is `unresolved`, identical
// whether the target is hidden, revoked or nonexistent: the text comes from a visible title only.
import type { MemoryProjection } from '../memory/memory.types';
import { cmp, docsOf, repoScope, sortedUnique, type Doc } from './retrieval.documents';
import { DEFAULT_DEPTH, DEFAULT_MAX_NODES, GITHUB_NUMBER_IN_TEXT, JIRA_KEY_IN_TEXT, MAX_DEPTH, MAX_NODES, MAX_UNRESOLVED } from './retrieval.policy';
import type { Edge, ItemIdentity, Relationships, Traversal, TraversalNode, TraversalOptions, UnresolvedMention } from './retrieval.types';
import { identityKey } from './retrieval.documents';

const isGithubItem = (d: Doc): boolean => d.identity.kind === 'pull_request' || d.identity.kind === 'issue';
const edgeOrder = (e: Edge): string => JSON.stringify([identityKey(e.from), identityKey(e.to), e.type, e.text ?? '']);

function containsEdges(docs: readonly Doc[]): Edge[] {
  const out: Edge[] = [];
  for (const r of docs.filter((d) => d.identity.kind === 'repository')) {
    for (const d of docs) {
      if (!isGithubItem(d) || d.identity.sourceId !== r.identity.sourceId || repoScope(d) !== r.identity.sourceRef) continue;
      out.push({ type: 'contains', from: r.identity, to: d.identity, evidence: sortedUnique([...r.evidence, ...d.evidence]) });
    }
  }
  return out;
}

/** Distinct matches of a global pattern in first-seen order (group 0, or group 1 when present). */
function matchesOf(text: string, pattern: RegExp, prefix = ''): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(pattern)) seen.add(prefix + (m[1] ?? m[0]));
  return [...seen];
}

function mentionsOf(docs: readonly Doc[]): { edges: Edge[]; unresolved: UnresolvedMention[] } {
  const edges: Edge[] = [];
  const unresolved: UnresolvedMention[] = [];
  const jiraByKey = new Map<string, Doc[]>();
  for (const d of docs) {
    const key = d.identity.kind === 'jira_issue' ? d.payload['key'] : undefined;
    if (typeof key !== 'string') continue;
    const list = jiraByKey.get(key);
    if (list) list.push(d);
    else jiraByKey.set(key, [d]);
  }
  // Indexed once: each `#n` mention is a map lookup, not a scan of every document (COG-08 review).
  const githubKey = (sourceId: string, scope: string, n: unknown) => JSON.stringify([sourceId, scope, n]);
  const githubByNumber = new Map<string, Doc[]>();
  for (const d of docs) {
    if (!isGithubItem(d)) continue;
    const k = githubKey(d.identity.sourceId, repoScope(d), d.payload['number']);
    const list = githubByNumber.get(k);
    if (list) list.push(d);
    else githubByNumber.set(k, [d]);
  }
  const record = (from: Doc, text: string, targets: readonly Doc[]) => {
    const others = targets.filter((t) => t.key !== from.key);
    if (targets.length && !others.length) return; // self-mention only: dropped
    if (!others.length) {
      unresolved.push({ type: 'mentions', from: from.identity, text, target: null, status: 'unresolved', evidence: from.evidence });
      return;
    }
    for (const t of others) edges.push({ type: 'mentions', from: from.identity, to: t.identity, text, evidence: sortedUnique([...from.evidence, ...t.evidence]) });
  };
  for (const d of docs) {
    if (!d.title) continue;
    for (const key of matchesOf(d.title, JIRA_KEY_IN_TEXT)) record(d, key, jiraByKey.get(key) ?? []);
    if (!isGithubItem(d)) continue;
    for (const ref of matchesOf(d.title, GITHUB_NUMBER_IN_TEXT, '#')) {
      const n = Number(ref.slice(1));
      const targets = githubByNumber.get(githubKey(d.identity.sourceId, repoScope(d), n)) ?? [];
      record(d, ref, targets);
    }
  }
  return { edges, unresolved };
}

function relationshipsOf(docs: readonly Doc[]): Relationships {
  const mentions = mentionsOf(docs);
  const edges = [...containsEdges(docs), ...mentions.edges].sort((a, b) => cmp(edgeOrder(a), edgeOrder(b)));
  const unresolved = [...mentions.unresolved].sort((a, b) => cmp(identityKey(a.from), identityKey(b.from)) || cmp(a.text, b.text));
  return { edges, unresolved };
}

export const relationships = (projection: MemoryProjection): Relationships => relationshipsOf(docsOf(projection));

const validBound = (v: number, max: number): boolean => Number.isInteger(v) && v >= 1 && v <= max;

export function related(projection: MemoryProjection, start: ItemIdentity, options: TraversalOptions = {}): Traversal {
  const depth = options.depth ?? DEFAULT_DEPTH;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const none = (outcome: Traversal['outcome']): Traversal => ({ outcome, nodes: [], unresolved: [], truncated: false });
  if (!validBound(depth, MAX_DEPTH) || !validBound(maxNodes, MAX_NODES)) return none('invalid-request');

  const docs = docsOf(projection);
  const startKey = identityKey(start);
  const byKey = new Map(docs.map((d) => [d.key, d]));
  if (!byKey.has(startKey)) return none('not-found');

  const rel = relationshipsOf(docs);
  const adjacent = new Map<string, { key: string; edge: Edge }[]>();
  const link = (a: string, b: string, edge: Edge) => {
    const list = adjacent.get(a);
    if (list) list.push({ key: b, edge });
    else adjacent.set(a, [{ key: b, edge }]);
  };
  for (const e of rel.edges) {
    link(identityKey(e.from), identityKey(e.to), e);
    link(identityKey(e.to), identityKey(e.from), e);
  }
  for (const list of adjacent.values()) list.sort((x, y) => cmp(x.key, y.key) || cmp(edgeOrder(x.edge), edgeOrder(y.edge)));

  const nodes: TraversalNode[] = [{ identity: byKey.get(startKey)!.identity, depth: 0, via: null }];
  const visited = new Set([startKey]);
  let truncated = false;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.depth >= depth) continue;
    for (const next of adjacent.get(identityKey(node.identity)) ?? []) {
      if (visited.has(next.key)) continue;
      if (nodes.length >= maxNodes) {
        truncated = true;
        break;
      }
      visited.add(next.key);
      nodes.push({ identity: byKey.get(next.key)!.identity, depth: node.depth + 1, via: next.edge });
    }
  }
  const unresolved = rel.unresolved.filter((u) => visited.has(identityKey(u.from)));
  if (unresolved.length > MAX_UNRESOLVED) truncated = true;
  return { outcome: 'found', nodes, unresolved: unresolved.slice(0, MAX_UNRESOLVED), truncated };
}
