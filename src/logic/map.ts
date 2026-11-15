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
  { cols: 3, steps: 9, paths: 3 },
  { cols: 4, steps: 10, paths: 4 },
  { cols: 5, steps: 11, paths: 5 },
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

export function generateFloor(floor: number, biome: Element, seed: number): FloorMap {
  const rng = new Rng(seed);
  const shape = FLOOR_SHAPES[floor];
  const { cols } = shape;
  const midCol = Math.floor(cols / 2);
  // Rows measured in "y" units; a straight-up step is 2 units.
  let maxY = shape.steps * 2;
  if ((midCol + maxY) % 2 !== 0) maxY += 1;
  const topY = 2; // cells with y <= topY+1 connect to the boss

  const cells = new Set<string>();
  const edges = new Map<string, Set<string>>();
  const startKey = nid(midCol, maxY);
  cells.add(startKey);

  const addEdge = (a: string, b: string) => {
    if (!edges.has(a)) edges.set(a, new Set());
    edges.get(a)!.add(b);
  };

  for (let p = 0; p < shape.paths; p++) {
    let col = midCol;
    let y = maxY;
    // Force the first step of the first paths to diverge so there's a choice immediately.
    let first = true;
    while (y > topY + 1) {
      let opts = forward(col, y).filter(([c, yy]) => c >= 0 && c < cols && yy >= topY);
      if (first) {
        const forced = opts[p % opts.length];
        opts = [forced];
        first = false;
      }
      // Bias toward existing cells a little so paths merge and split naturally.
      const [nc, ny] = rng.chance(0.25)
        ? (opts.find(([c, yy]) => cells.has(nid(c, yy))) ?? rng.pick(opts))
        : rng.pick(opts);
      const from = nid(col, y);
      const to = nid(nc, ny);
      cells.add(to);
      addEdge(from, to);
      col = nc;
      y = ny;
    }
  }

  // Connect every adjacent pair of kept cells (forward only), so any touching hex is reachable.
  for (const key of cells) {
    const [c, y] = key.split(',').map(Number);
    for (const [fc, fy] of forward(c, y)) {
      const k = nid(fc, fy);
      if (cells.has(k)) addEdge(key, k);
    }
  }

  const bossCol = midCol;
  const bossY = topY - 2 - ((bossCol + topY) % 2 === 0 ? 0 : 1);
  const bossKey = nid(bossCol, bossY);

  const nodes: Record<string, MapNode> = {};
  const span = maxY - topY;
  for (const key of cells) {
    const [c, y] = key.split(',').map(Number);
    const isTop = y <= topY + 1;
    const next = [...(edges.get(key) ?? [])];
    if (isTop) next.push(bossKey);
    nodes[key] = {
      id: key,
      col: c,
      y,
      kind: 'battle',
      next,
      progress: (maxY - y) / (span + 2),
    };
  }
  nodes[bossKey] = { id: bossKey, col: bossCol, y: bossY, kind: 'boss', next: [], progress: 1 };

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
