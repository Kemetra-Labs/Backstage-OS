// Placement constants for the B+C pilot, kept beside the fixture and outside World semantics (SPEC section 2).
// An angle only says where on its kind's orbit a node sits. It carries no meaning and is never derived from data.
import type { World, GraphNode } from '../../contract/world';
import { BC_CANVAS, orbitOf, orbitPosition, type Point } from './orbit';

/** The node drawn at the centre of every orbit. It is the same node the lens map treats as the hub. */
export const HUB_ID = 'retail-tower';

export const ORBIT_ANGLE: Readonly<Record<string, number>> = {
  khepri: 160, pos: 146, 'stock-sync': 95, inventory: 38,
  port: 172, 'seshat-bi': 198, github: 60, sentry: 22, jira: 350,
};

/** Curve bend per link id (presentational): keeps neighbouring links from overlapping. */
export const LINK_BEND: Readonly<Record<string, number>> = { d1: 0.08, d2: -0.1, d3: 0.1, d4: -0.12, d5: 0.12, d6: -0.12, d7: 0.1, d8: 0.1 };
export const DEFAULT_BEND = 0.1;

export function nodePoint(n: GraphNode): Point {
  if (n.id === HUB_ID) return { x: BC_CANVAS.cx, y: BC_CANVAS.cy };
  return orbitPosition(orbitOf(n), ORBIT_ANGLE[n.id] ?? 0);
}

export function nodePoints(w: World): Readonly<Record<string, Point>> {
  return Object.fromEntries(w.graph.nodes.map((n) => [n.id, nodePoint(n)]));
}
