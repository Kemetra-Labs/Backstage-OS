// Orbit geometry for the Hybrid Mission Map (B+C pilot). Pure functions: the same input always gives the same pixel.
// Orbit = kind of system (structure), never importance or health. Positions are presentational only.
import type { NodeKind, WorldNode } from '../types';

export type Orbit = 'inner' | 'middle' | 'outer';
export const ORBITS: readonly Orbit[] = ['inner', 'middle', 'outer'];

/** Canvas in SVG user units. The centre holds the hub. */
export const BC_CANVAS = { w: 1000, h: 860, cx: 500, cy: 500 } as const;

export const ORBIT_RADII: Readonly<Record<Orbit, { readonly rx: number; readonly ry: number }>> = {
  inner: { rx: 200, ry: 95 },
  middle: { rx: 300, ry: 285 },
  outer: { rx: 420, ry: 400 },
};

const KIND_ORBIT: Readonly<Record<NodeKind, Orbit>> = { product: 'inner', project: 'middle', service: 'outer' };

export const orbitOf = (n: Pick<WorldNode, 'kind'>): Orbit => KIND_ORBIT[n.kind];

export interface Point {
  readonly x: number;
  readonly y: number;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** A point on an orbit ellipse. Angle in degrees, counter-clockwise from the +x axis (screen y grows downward). */
export function orbitPosition(orbit: Orbit, angleDeg: number): Point {
  const { rx, ry } = ORBIT_RADII[orbit];
  const a = (angleDeg * Math.PI) / 180;
  return { x: round1(BC_CANVAS.cx + rx * Math.cos(a)), y: round1(BC_CANVAS.cy - ry * Math.sin(a)) };
}
