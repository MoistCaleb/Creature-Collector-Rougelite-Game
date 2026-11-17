import type { Element } from '../data/types';
import { Rng } from './rng';

export type NodeKind = 'start' | 'battle' | 'elite' | 'levelup' | 'prestige' | 'skill' | 'heal' | 'shop' | 'treasure' | 'event' | 'boss';

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
  /** Grid width in half-hex columns. */
  cols: number;
  maxY: number;
  nodes: Record<string, MapNode>;
  startId: string;
  bossId: string;
  /**
   * 'rows': pointy-top hexes in horizontal rows; every move climbs exactly one row, so every
   * route to the boss is the same length. Missing on maps saved before this layout existed.
   */
  layout?: 'rows';
}

/** `routeLength`: nodes on every route from the start to the boss (boss included). */
const FLOOR_SHAPES = [
  { cols: 10, routeLength: 25, density: 0.88 },
  { cols: 12, routeLength: 29, density: 0.88 },
  { cols: 14, routeLength: 32, density: 0.88 },
];

export const ROUTE_LENGTHS = FLOOR_SHAPES.map((s) => s.routeLength);

const nid = (col: number, y: number) => `${col},${y}`;

/** Forward moves: the two hexes touching this one from the row above. */
function forward(col: number, y: number): [number, number][] {
  return [
    [col - 1, y - 1],
    [col + 1, y - 1],
  ];
}

/**
 * Builds a honeycomb of rows: fill most of the grid at random, then keep only cells that are
 * reachable from the start AND can reach the top. Every route climbs one row per move.
 * Retries until the floor has enough choice.
 */
export function generateFloor(floor: number, biome: Element, seed: number): FloorMap {
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 80; attempt++) {
    const m = tryFloor(floor, biome, rng);
    if (m && branchiness(m) >= MIN_BRANCHINESS) return m;
  }
  return tryFloor(floor, biome, rng, 1)!;
}

/** Each node has at most two moves; this keeps most of them at two. */
export const MIN_BRANCHINESS = 1.55;

/** Average number of forward choices per non-boss node. */
export function branchiness(m: FloorMap): number {
  const ns = Object.values(m.nodes).filter((n) => n.kind !== 'boss');
  return ns.reduce((s, n) => s + n.next.length, 0) / ns.length;
}

/** Moves left to reach the boss from a node (same on every route). */
export function stepsToBoss(m: FloorMap, id: string): number {
  return m.nodes[id].y - m.nodes[m.bossId].y;
}

function tryFloor(floor: number, biome: Element, rng: Rng, forceDensity?: number): FloorMap | null {
  const shape = FLOOR_SHAPES[floor];
  const { cols } = shape;
  const density = forceDensity ?? shape.density;
  const topY = 2; // the row right below the boss
  const maxY = topY + shape.routeLength - 1; // the start row
  let startCol = Math.floor((cols - 1) / 2);
  if ((startCol + maxY) % 2 !== 0) startCol += rng.int(0, 1) ? 1 : -1;
  const inGrid = (c: number, y: number) => c >= 0 && c < cols && y >= topY && y <= maxY && (c + y) % 2 === 0;

  // Random fill. Rows near the start are narrower so the floor fans out like a tree.
  const cells = new Set<string>();
  for (let y = topY; y < maxY; y++)
    for (let c = 0; c < cols; c++) {
      if (!inGrid(c, y)) continue;
      if (Math.abs(c - startCol) > maxY - y) continue; // can't be reached anyway
      if (rng.chance(density)) cells.add(nid(c, y));
    }
  const startKey = nid(startCol, maxY);
  cells.add(startKey);
  // The start always offers both moves.
  for (const [c, y] of forward(startCol, maxY)) if (inGrid(c, y)) cells.add(nid(c, y));

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
    if (y === topY || fwd(k).some((n) => alive.has(n))) alive.add(k);
  }
  if (!alive.has(startKey)) return null;

  const bossY = topY - 1;
  let bossCol = Math.floor((cols - 1) / 2);
  if ((bossCol + bossY) % 2 !== 0) bossCol += 1;
  const bossKey = nid(bossCol, bossY);

  const nodes: Record<string, MapNode> = {};
  const span = maxY - bossY;
  for (const key of alive) {
    const [c, y] = key.split(',').map(Number);
    const next = fwd(key).filter((n) => alive.has(n));
    if (y === topY) next.push(bossKey);
    nodes[key] = { id: key, col: c, y, kind: 'battle', next, progress: (maxY - y) / span };
  }
  nodes[bossKey] = { id: bossKey, col: bossCol, y: bossY, kind: 'boss', next: [], progress: 1 };
  if (nodes[startKey].next.length < 2) return null;

  assignKinds(nodes, startKey, topY, rng, floor);
  return { floor, biome, cols, maxY, nodes, startId: startKey, bossId: bossKey, layout: 'rows' };
}

function assignKinds(nodes: Record<string, MapNode>, startKey: string, topY: number, rng: Rng, floor: number) {
  for (const n of Object.values(nodes)) {
    if (n.kind === 'boss') continue;
    if (n.id === startKey) {
      n.kind = 'start';
      continue;
    }
    if (n.y === topY) {
      // Every route passes this row. Floor 1: a guaranteed shop; later floors: a rest.
      n.kind = floor === 0 ? 'shop' : 'heal';
      continue;
    }
    if (floor === 0 && n.y === topY + 1) {
      n.kind = 'heal'; // floor 1's rest moves down a row to make room for the shop
      continue;
    }
    if (n.progress < 0.2) {
      n.kind = 'battle';
      continue;
    }
    n.kind = rng.weighted<NodeKind>({
      battle: 40,
      elite: n.progress > 0.35 ? 12 : 0,
      levelup: 12,
      skill: 11,
      prestige: 9,
      heal: 10,
      shop: n.progress > 0.3 ? 8 : 0,
      treasure: 5,
      event: 10,
    });
  }
  // Guarantee at least one shop per floor, somewhere in the middle.
  if (!Object.values(nodes).some((n) => n.kind === 'shop')) {
    const mid = Object.values(nodes).filter((n) => n.kind !== 'boss' && n.kind !== 'start' && n.progress > 0.35 && n.progress < 0.75);
    if (mid.length) rng.pick(mid).kind = 'shop';
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

export const NODE_INFO: Record<NodeKind, { label: string; color: number; desc: string }> = {
  start: { label: 'Start', color: 0x8a8aa8, desc: 'Your entry point' },
  battle: { label: 'Battle', color: 0x6a6f8a, desc: 'Fight a wild Hexling. Win to earn XP or catch it.' },
  elite: { label: 'Trainer', color: 0xc0392b, desc: 'A trainer battle. No catching, but big XP, coins and an Evolution Stone.' },
  levelup: { label: 'Level Up', color: 0x27ae60, desc: 'Train your Hexlings.' },
  prestige: { label: 'Prestige', color: 0xe84393, desc: 'Sacrifice a bench Hexling to prestige another.' },
  skill: { label: 'Skill', color: 0x8e6bff, desc: 'Buff one of your moves.' },
  heal: { label: 'Rest', color: 0x16a085, desc: 'Heal your team 50% and cure status conditions.' },
  shop: { label: 'Shop', color: 0xb8862b, desc: 'Spend coins on items and recruits.' },
  treasure: { label: 'Treasure', color: 0x9c6b2f, desc: 'A chest: coins or an item.' },
  event: { label: 'Event', color: 0x2f6b9c, desc: 'Something unexpected.' },
  boss: { label: 'Boss', color: 0x5b2c6f, desc: 'Defeat it to clear the floor.' },
};
