// Typed relationships and bounded traversal (BACK-106 R6), derived on every call from visible items.
// No edge is stored. A mention of an identifier with no visible target is `unresolved`, identical
// whether the target is hidden, revoked or nonexistent: the text comes from a visible title only.
// A mention carries the status of the title it comes from (`basis`), and a title with no established
// revision (conflict, or no current run) yields nothing. Work is budgeted while it is done, not after:
// at most MAX_EDGES edges and MAX_UNRESOLVED unresolved mentions, with `truncated` (COG-08 reviews).
import type { MemoryProjection } from '../memory/memory.types';
import { cmp, docsOf, identityKey, repoScope, sortedUnique, type Doc } from './retrieval.documents';
import { DEFAULT_DEPTH, DEFAULT_MAX_NODES, GITHUB_NUMBER_IN_TEXT, JIRA_KEY_IN_TEXT, MAX_DEPTH, MAX_EDGES, MAX_NODES, MAX_UNRESOLVED } from './retrieval.policy';
import type { Edge, ItemIdentity, Relationships, Traversal, TraversalNode, TraversalOptions, UnresolvedMention } from './retrieval.types';

const isGithubItem = (d: Doc): boolean => d.identity.kind === 'pull_request' || d.identity.kind === 'issue';
const edgeOrder = (e: Edge): string => JSON.stringify([identityKey(e.from), identityKey(e.to), e.type, e.text ?? '']);

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Collects edges under one graph budget, and unresolved mentions under an allowance per mentioning title,
 * so one noisy title can never use up another item's allowance (COG-08 review 3). Records where it cut.
 */
class Budget {
  readonly edges: Edge[] = [];
  readonly unresolved = new Map<string, UnresolvedMention[]>();
  /** Titles whose own unresolved mentions were cut. */
  readonly cutTitles = new Set<string>();
  edgesTruncated = false;

  edge(e: Edge): boolean {
    if (this.edges.length >= MAX_EDGES) {
      this.edgesTruncated = true;
      return false;
    }
    this.edges.push(e);
    return true;
  }

  miss(u: UnresolvedMention): void {
    const key = identityKey(u.from);
    const list = this.unresolved.get(key) ?? [];
    if (list.length >= MAX_UNRESOLVED) {
      this.cutTitles.add(key);
      return;
    }
    list.push(u);
    this.unresolved.set(key, list);
  }
}

const byFromThenText = (a: UnresolvedMention, b: UnresolvedMention): number => cmp(identityKey(a.from), identityKey(b.from)) || cmp(a.text, b.text);

/** The first MAX_UNRESOLVED in canonical order, and whether anything was left out. */
function capUnresolved(lists: readonly UnresolvedMention[][], cut: boolean): { unresolved: UnresolvedMention[]; truncated: boolean } {
  const all = lists.flat().sort(byFromThenText);
  return { unresolved: all.slice(0, MAX_UNRESOLVED), truncated: cut || all.length > MAX_UNRESOLVED };
}

function containsEdges(docs: readonly Doc[], budget: Budget): void {
  // Indexed by (source, repository): each repository finds its items by lookup, not by a scan.
  const items = new Map<string, Doc[]>();
  for (const d of docs) if (isGithubItem(d)) push(items, JSON.stringify([d.identity.sourceId, repoScope(d)]), d);
  for (const r of docs) {
    if (r.identity.kind !== 'repository') continue;
    for (const d of items.get(JSON.stringify([r.identity.sourceId, r.identity.sourceRef])) ?? []) {
      if (!budget.edge({ type: 'contains', from: r.identity, to: d.identity, evidence: sortedUnique([...r.evidence, ...d.evidence]) })) return;
    }
  }
}

/** Distinct matches of a global pattern in first-seen order (group 0, or group 1 when present). */
function matchesOf(text: string, pattern: RegExp, prefix = ''): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(pattern)) seen.add(prefix + (m[1] ?? m[0]));
  return [...seen];
}

function mentionsOf(docs: readonly Doc[], budget: Budget): void {
  const jiraByKey = new Map<string, Doc[]>();
  const githubByNumber = new Map<string, Doc[]>();
  const githubKey = (sourceId: string, scope: string, n: unknown) => JSON.stringify([sourceId, scope, n]);
  for (const d of docs) {
    const key = d.identity.kind === 'jira_issue' ? d.payload['key'] : undefined;
    if (typeof key === 'string') push(jiraByKey, key, d);
    if (isGithubItem(d)) push(githubByNumber, githubKey(d.identity.sourceId, repoScope(d), d.payload['number']), d);
  }
  const record = (from: Doc, text: string, targets: readonly Doc[]): boolean => {
    const others = targets.filter((t) => t.key !== from.key);
    if (targets.length && !others.length) return true; // self-mention only: dropped
    if (!others.length) {
      budget.miss({ type: 'mentions', from: from.identity, text, target: null, status: 'unresolved', basis: from.item.status, evidence: from.evidence });
      return true;
    }
    for (const t of others) {
      const e: Edge = { type: 'mentions', from: from.identity, to: t.identity, text, basis: from.item.status, evidence: sortedUnique([...from.evidence, ...t.evidence]) };
      if (!budget.edge(e)) return false;
    }
    return true;
  };
  for (const d of docs) {
    // No established revision (conflict, or no current run): its title is no basis for any link.
    if (!d.title || d.revision === null) continue;
    for (const key of matchesOf(d.title, JIRA_KEY_IN_TEXT)) if (!record(d, key, jiraByKey.get(key) ?? [])) return;
    if (!isGithubItem(d)) continue;
    for (const ref of matchesOf(d.title, GITHUB_NUMBER_IN_TEXT, '#')) {
      const n = Number(ref.slice(1));
      // The observer only stores positive safe integers: anything else is no GitHub reference at all.
      if (!Number.isSafeInteger(n) || n < 1) continue;
      if (!record(d, ref, githubByNumber.get(githubKey(d.identity.sourceId, repoScope(d), n)) ?? [])) return;
    }
  }
}

function build(docs: readonly Doc[]): Budget {
  const budget = new Budget();
  containsEdges(docs, budget);
  if (!budget.edgesTruncated) mentionsOf(docs, budget);
  budget.edges.sort((a, b) => cmp(edgeOrder(a), edgeOrder(b)));
  return budget;
}

export function relationships(projection: MemoryProjection): Relationships {
  const b = build(docsOf(projection));
  const capped = capUnresolved([...b.unresolved.values()], b.cutTitles.size > 0);
  return { edges: b.edges, unresolved: capped.unresolved, truncated: b.edgesTruncated || capped.truncated };
}

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

  const rel = build(docs);
  const adjacent = new Map<string, { key: string; edge: Edge }[]>();
  for (const e of rel.edges) {
    push(adjacent, identityKey(e.from), { key: identityKey(e.to), edge: e });
    push(adjacent, identityKey(e.to), { key: identityKey(e.from), edge: e });
  }
  for (const list of adjacent.values()) list.sort((x, y) => cmp(x.key, y.key) || cmp(edgeOrder(x.edge), edgeOrder(y.edge)));

  const nodes: TraversalNode[] = [{ identity: byKey.get(startKey)!.identity, depth: 0, via: null }];
  const visited = new Set([startKey]);
  // A budget-cut graph may lack edges this walk would have followed: say so.
  let truncated = rel.edgesTruncated;
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
  // Only the visited titles' own mentions count against this traversal's allowance.
  const visitedLists = [...visited].map((k) => rel.unresolved.get(k) ?? []);
  const capped = capUnresolved(visitedLists, [...visited].some((k) => rel.cutTitles.has(k)));
  return { outcome: 'found', nodes, unresolved: capped.unresolved, truncated: truncated || capped.truncated };
}
