/**
 * Splits edges into those the map can draw (both endpoints are supplied nodes) and those it cannot (BACK-26).
 * Nothing is dropped: the caller must surface `undrawn` so the map and the accessible table never silently disagree.
 */
export function splitEdges<E extends { from: string; to: string }>(
  edges: readonly E[],
  nodeIds: ReadonlySet<string>,
): { drawn: E[]; undrawn: E[] } {
  const drawn: E[] = [];
  const undrawn: E[] = [];
  for (const e of edges) (nodeIds.has(e.from) && nodeIds.has(e.to) ? drawn : undrawn).push(e);
  return { drawn, undrawn };
}
