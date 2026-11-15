import type { Element } from '../data/types';
import { Rng } from './rng';

export type NodeKind = 'start' | 'battle' | 'elite' | 'levelup' | 'prestige' | 'skill' | 'heal' | 'boss';

export interface MapNode {
  id: string;
  col: number;
  /** Doubled-coordinate row: higher = further down. Flat-top hexes, col + y is even. */
  y: number;
  kind: NodeKind;
  /** ids of nodes reachable from this one (always further up). */
  next: string[];
  /** 0 at start, 1 at boss. */
  progress: number;
}

export interface FloorMap {
  floor: number; // 0..2
  biome: Element;
  cols: number;
  maxY: number;
  nodes: Record<string, MapNode>;
  startId: string;
  bossId: string;
}

const FLOOR_SHAPES = [
  { cols: 5, steps: 9, density: 0.65 },
  { cols: 6, steps: 10, density: 0.65 },
  { cols: 7, steps: 11, density: 0.65 },
];

const nid = (col: number, y: number) => `${col},${y}`;

/** Forward (upward) neighbours in doubled coordinates for flat-top hexes. */
function forward(col: number, y: number): [number, number][] {
  return [
    [col, y - 2],
    [col - 1, y - 1],
    [col + 1, y - 1],
  ];
}

/**
 * Builds a honeycomb: fill most of the hex grid at random, then keep only cells that are
 * reachable from the start AND can reach the top. Every kept neighbour above you is a valid move,
 * so most nodes branch two or three ways. Retries until the floor has enough choice.
 */
export function generateFloor(floor: number, biome: Element, seed: number): FloorMap {
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 50; attempt++) {
    const m = tryFloor(floor, biome, rng);
    if (m && branchiness(m) >= 1.7) return m;
  }
  return tryFloor(floor, biome, rng, 1)!;
}

/** Average number of forward choices per non-boss node. */
export function branchiness(m: FloorMap): number {
  const ns = Object.values(m.nodes).filter((n) => n.kind !== 'boss');
  return ns.reduce((s, n) => s + n.next.length, 0) / ns.length;
}

function tryFloor(floor: number, biome: Element, rng: Rng, forceDensity?: number): FloorMap | null {
  const shape = FLOOR_SHAPES[floor];
  const { cols } = shape;
  const density = forceDensity ?? shape.density;
  const startCol = Math.floor((cols - 1) / 2) + (cols % 2 === 0 ? rng.int(0, 1) : 0);
  let maxY = shape.steps * 2;
  if ((startCol + maxY) % 2 !== 0) maxY += 1;
  const topY = 2; // cells with y <= topY+1 connect to the boss
  const inGrid = (c: number, y: number) => c >= 0 && c < cols && y >= topY && y <= maxY && (c + y) % 2 === 0;

  // Random fill. Rows near the start are narrower so the floor fans out like a tree.
  const cells = new Set<string>();
  for (let y = topY; y < maxY; y++)
    for (let c = 0; c < cols; c++) {
      if (!inGrid(c, y)) continue;
      const fromStart = maxY - y;
      if (Math.abs(c - startCol) > fromStart) continue; // can't be reached anyway
      if (rng.chance(density)) cells.add(nid(c, y));
    }
  const startKey = nid(startCol, maxY);
  cells.add(startKey);

  const fwd = (key: string) => {
    const [c, y] = key.split(',').map(Number);
    return forward(c, y)
      .map(([a, b]) => nid(a, b))
      .filter((k) => cells.has(k));
  };

  // Keep cells reachable from start...
  const reach = new Set<string>([startKey]);
  const order = [...cells].sort((a, b) => Number(b.split(',')[1]) - Number(a.split(',')[1]));
  for (const k of order) if (reach.has(k)) for (const n of fwd(k)) reach.add(n);
  // ...that can also reach the top row.
  const alive = new Set<string>();
  for (const k of [...order].reverse()) {
    const y = Number(k.split(',')[1]);
    if (!reach.has(k)) continue;
    if (y <= topY + 1 || fwd(k).some((n) => alive.has(n))) alive.add(k);
  }
  if (!alive.has(startKey)) return null;

  const bossCol = Math.floor((cols - 1) / 2);
  const bossY = topY - 2 - ((bossCol + topY) % 2 === 0 ? 0 : 1);
  const bossKey = nid(bossCol, bossY);

  const nodes: Record<string, MapNode> = {};
  const span = maxY - topY;
  for (const key of alive) {
    const [c, y] = key.split(',').map(Number);
    const next = fwd(key).filter((n) => alive.has(n));
    if (y <= topY + 1) next.push(bossKey);
    nodes[key] = { id: key, col: c, y, kind: 'battle', next, progress: (maxY - y) / (span + 2) };
  }
  nodes[bossKey] = { id: bossKey, col: bossCol, y: bossY, kind: 'boss', next: [], progress: 1 };
  if (nodes[startKey].next.length < 2) return null;

  assignKinds(nodes, startKey, topY, rng);
  return { floor, biome, cols, maxY, nodes, startId: startKey, bossId: bossKey };
}

function assignKinds(nodes: Record<string, MapNode>, startKey: string, topY: number, rng: Rng) {
  for (const n of Object.values(nodes)) {
    if (n.kind === 'boss') continue;
    if (n.id === startKey) {
      n.kind = 'start';
      continue;
    }
    if (n.y <= topY + 1) {
      n.kind = 'heal'; // always a rest before the boss
      continue;
    }
    if (n.progress < 0.2) {
      n.kind = 'battle';
      continue;
    }
    n.kind = rng.weighted<NodeKind>({
      battle: 44,
      elite: n.progress > 0.35 ? 12 : 0,
      levelup: 12,
      skill: 11,
      prestige: 9,
      heal: 10,
    });
  }
}

/** All node ids reachable from start (used for validation). */
export function reachable(map: FloorMap): Set<string> {
  const seen = new Set<string>([map.startId]);
  const stack = [map.startId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const n of map.nodes[id].next) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}

export const NODE_INFO: Record<NodeKind, { label: string; icon: string; color: number; desc: string }> = {
  start: { label: 'Start', icon: '◆', color: 0x8a8aa8, desc: 'Your entry point' },
  battle: { label: 'Battle', icon: '⚔', color: 0x6a6f8a, desc: 'Fight a wild creature. Win to earn XP or catch it.' },
  elite: { label: 'Elite', icon: '♛', color: 0xc0392b, desc: 'A tough trainer. Drops an Evolution Stone.' },
  levelup: { label: 'Level Up', icon: '▲', color: 0x27ae60, desc: 'Train your creatures.' },
  prestige: { label: 'Prestige', icon: '★', color: 0xe84393, desc: 'Sacrifice a bench creature to prestige another.' },
  skill: { label: 'Skill', icon: '✦', color: 0x8e6bff, desc: 'Buff one of your moves.' },
  heal: { label: 'Rest', icon: '✚', color: 0x16a085, desc: 'Heal your team 50%.' },
  boss: { label: 'Boss', icon: '☠', color: 0x5b2c6f, desc: 'Defeat it to clear the floor.' },
};
