import { SPECIES_BY_ID } from '../data/species';
import type { Element } from '../data/types';
import { hashString, Rng } from '../logic/rng';
import { familyPlan, paletteFor, stagePlan, type Family, type StagePlan } from './sprites';

/**
 * Hexbound 2.0 art (style test 2): a new generator on a 64-pixel canvas. Each line keeps its body
 * type, colours and kinds of parts (from the same plans as today), drawn with real anatomy, a
 * three-quarter turn, and a back view for your own Hexling in battle. Not used by the game yet.
 *
 * Shapes are placed in "model space": x is signed (negative = the near side, toward the viewer),
 * y is pixels from the top. The near side is drawn full width and the far side squeezed (FAR),
 * which turns the creature a little. The back view mirrors that and draws the back parts on top.
 */

export const ART_SIZE = 64;
export type View = 'front' | 'back';

// Regions (painted later): 1 body, 2 secondary, 3 belly, 4 eye white, 5 pupil, 6 horn/bone,
// 7 glow, 8 claw/fang, 9 dark, 10 signature, 11 signature light, 12 far body, 13 far secondary,
// 14 mouth inside, 15 glint, 16 wing membrane (see-through).
type Reg = number;

const FAR = 0.74;

class Grid {
  g: Uint8Array;
  constructor(
    public N: number,
    public cx: number,
    public flip: boolean,
  ) {
    this.g = new Uint8Array(N * N);
  }
  get(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.N || y >= this.N ? 0 : this.g[y * this.N + x];
  }
  /** Pixel x → model x (undoing the turn). */
  mx(px: number) {
    let m = px + 0.5 - this.cx;
    if (this.flip) m = -m;
    return m >= 0 ? m / FAR : m;
  }
  /** Model x → pixel x. */
  px(m: number) {
    const s = m >= 0 ? m * FAR : m;
    return this.cx + (this.flip ? -s : s) - 0.5;
  }
  fill(x0: number, x1: number, y0: number, y1: number, test: (mx: number, my: number) => boolean, v: Reg, only?: Reg[]) {
    const a = Math.max(0, Math.floor(Math.min(this.px(x0), this.px(x1))) - 1);
    const b = Math.min(this.N - 1, Math.ceil(Math.max(this.px(x0), this.px(x1))) + 1);
    for (let y = Math.max(0, Math.floor(y0) - 1); y <= Math.min(this.N - 1, Math.ceil(y1) + 1); y++)
      for (let x = a; x <= b; x++) {
        if (only && !only.includes(this.g[y * this.N + x])) continue;
        if (test(this.mx(x), y + 0.5)) this.g[y * this.N + x] = v;
      }
  }
  ellipse(x: number, y: number, rx: number, ry: number, v: Reg, o: { p?: number; taper?: number; only?: Reg[] } = {}) {
    if (rx <= 0 || ry <= 0) return;
    const p = o.p ?? 2;
    const t = o.taper ?? 0;
    this.fill(x - rx * 1.6, x + rx * 1.6, y - ry, y + ry, (X, Y) => {
      const dy = (Y - y) / ry;
      if (Math.abs(dy) > 1) return false;
      const w = rx * (1 - t * dy);
      return Math.pow(Math.abs((X - x) / w), p) + Math.pow(Math.abs(dy), p) <= 1;
    }, v, o.only);
  }
  /** A limb: a line from (x0,y0) to (x1,y1), r0 thick at the start and r1 at the end. */
  capsule(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, v: Reg, only?: Reg[]) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1;
    const r = Math.max(r0, r1);
    this.fill(Math.min(x0, x1) - r, Math.max(x0, x1) + r, Math.min(y0, y1) - r, Math.max(y0, y1) + r, (X, Y) => {
      const t = Math.max(0, Math.min(1, ((X - x0) * dx + (Y - y0) * dy) / L2));
      const qx = x0 + dx * t - X;
      const qy = y0 + dy * t - Y;
      const rr = r0 + (r1 - r0) * t;
      return qx * qx + qy * qy <= rr * rr;
    }, v, only);
  }
  poly(pts: [number, number][], v: Reg, only?: Reg[]) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    this.fill(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), (X, Y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > Y !== yj > Y && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, v, only);
  }
  /** A chain of capsules through points (tails, tentacles, horns). */
  chain(pts: [number, number][], r0: number, r1: number, v: Reg) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = r0 + ((r1 - r0) * i) / (pts.length - 1);
      const b = r0 + ((r1 - r0) * (i + 1)) / (pts.length - 1);
      this.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], a, b, v);
    }
  }
}

/** Fierce lines (by element) get claws, digitigrade feet and heavier brows. */
const FIERCE: Element[] = ['Fire', 'Dragon', 'Shadow', 'Metal', 'Earth'];
const FURRY: Element[] = ['Fire', 'Frost', 'Nature', 'Earth', 'Storm', 'Light', 'Shadow'];

interface Ctx {
  G: Grid;
  P: StagePlan;
  fam: Family;
  types: readonly Element[];
  el: Element;
  stage: number;
  view: View;
  r: Rng;
  sz: number;
  ground: number;
  furry: boolean;
  fierce: boolean;
  /** Filled in as the body is laid out. */
  torso: { x: number; y: number; rx: number; ry: number };
  shoulder: { x: number; y: number };
  hip: { x: number; y: number };
  head: { x: number; y: number; r: number; top: number };
}

const far = (v: Reg) => (v === 1 ? 12 : v === 2 ? 13 : v);
/** Draw something on both sides: the far side first (behind, darker), then the near side. */
function both(_c: Ctx, draw: (side: 1 | -1, v: (r: Reg) => Reg) => void) {
  draw(1, far);
  draw(-1, (r) => r);
}

export function buildArt(speciesId: string, stage: number, view: View = 'front'): Uint8Array {
  const sp = SPECIES_BY_ID[speciesId];
  const types = sp.types;
  const fam = familyPlan(speciesId, types);
  const P = stagePlan(speciesId, stage, fam, types);
  const N = ART_SIZE;
  const G = new Grid(N, N / 2 + (view === 'back' ? -1 : 1), view === 'back');
  const el = types[0];
  const c: Ctx = {
    G, P, fam, types, el, stage, view,
    r: new Rng(hashString(`${speciesId}:art${stage}`)),
    sz: [0.6, 0.8, 1][stage],
    ground: N - 3,
    furry: FURRY.includes(el) && (fam.loco === 'biped' || fam.loco === 'quad') && hashString(speciesId + ':fur') % 3 !== 0,
    fierce: FIERCE.includes(el) || types.includes('Dragon'),
    torso: { x: 0, y: 0, rx: 0, ry: 0 },
    shoulder: { x: 0, y: 0 },
    hip: { x: 0, y: 0 },
    head: { x: 0, y: 0, r: 0, top: 0 },
  };
  layout(c);
  const back = view === 'back';
  // Behind everything: (front view) the wings, shell, mane and tail; (back view) nothing yet.
  if (!back) {
    backParts(c);
    tail(c);
  }
  body(c);
  if (back) {
    headShape(c);
    tops(c);
    elementFeature(c, true);
    backParts(c);
    tail(c);
    nearLimbsOverBack(c);
  } else {
    headShape(c);
    face(c);
    tops(c);
    elementFeature(c, false);
    signaturePart(c, speciesId);
  }
  return G.g;
}

// ---------------------------------------------------------------- proportions

function layout(c: Ctx) {
  const { P, fam, sz, ground, stage } = c;
  const L = fam.loco;
  const shape: Record<string, [number, number, number]> = {
    // [rx, ry, taper] for the torso
    round: [8, 8, 0],
    pear: [8, 8.5, -0.3],
    drop: [7.5, 9, -0.5],
    oval: [7, 9.5, 0.05],
    vtorso: [9, 9.5, 0.4],
    boxy: [9, 8.5, 0.1],
    wide: [11, 7.5, 0.05],
    segmented: [7, 6, 0],
    tall: [6, 11, 0.1],
    hulk: [11.5, 10, 0.45],
  };
  const [rx0, ry0, taper] = shape[P.body] ?? shape.round;
  const rx = rx0 * sz * (L === 'quad' ? 1.1 : 1);
  const ry = ry0 * sz;
  const legLen = L === 'biped' ? [5, 8, 11][stage] : L === 'quad' ? [4, 6, 9][stage] : L === 'insect' ? [4, 6, 8][stage] : L === 'avian' ? [4, 6, 8][stage] : 0;
  const lift = L === 'floater' ? [6, 8, 9][stage] : L === 'serpent' ? [6, 9, 11][stage] : 0;
  const ty = ground - legLen - lift - ry + (L === 'slime' ? 2 : 1);
  c.torso = { x: 0, y: ty, rx, ry };
  (c.torso as unknown as { taper: number }).taper = taper;
  c.shoulder = { x: rx * 0.92, y: ty - ry * 0.45 };
  c.hip = { x: rx * 0.5, y: ty + ry * 0.7 };
  // Babies have big heads; finals have smaller, fiercer ones.
  const hr = (P.head === 'merged' ? 0 : [6.6, 6.2, 6.4][stage]) * (L === 'quad' ? 0.95 : 1);
  const hy = P.head === 'merged' ? ty - ry * 0.25 : ty - ry - hr * (L === 'quad' ? 0.45 : 0.62);
  c.head = { x: L === 'quad' ? -1.5 : 0, y: hy, r: hr || Math.min(rx, ry) * 0.85, top: P.head === 'merged' ? ty - ry : hy - hr };
}

// ---------------------------------------------------------------- body and limbs

function body(c: Ctx) {
  const { G, P, fam, stage, sz, ground, view } = c;
  const L = fam.loco;
  const T = c.torso;
  const taper = (T as unknown as { taper: number }).taper;
  const back = view === 'back';

  // Far limbs (behind the torso).
  limbs(c, 1);

  // Locomotion that sits under the torso.
  if (L === 'serpent') {
    const coils = 2 + (stage > 0 ? 1 : 0);
    for (let i = 0; i < coils; i++) {
      const w = (T.rx + 5 + stage * 1.5) * (1 - i * 0.18);
      const y = ground - 2 - i * 3.2;
      G.ellipse(0, y, w, 3.2, 1);
      if (!back) G.ellipse(0, y + 0.5, w * 0.7, 1.4, 3, { only: [1] });
    }
  }
  if (L === 'floater') {
    // A wispy tail curling under the body.
    const n = 5 + stage * 2;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) pts.push([Math.sin(i * 0.7) * (2 + i * 0.4), T.y + T.ry * 0.6 + (i * (ground - T.y - T.ry * 0.5)) / n]);
    G.chain(pts, T.rx * 0.55, 0.8, 1);
  }
  if (L === 'slime') {
    G.ellipse(0, ground - 2, T.rx + 4 + stage, 3, 1, { p: 2.4 });
    for (let k = 0; k < 2 + stage; k++) {
      const x = -T.rx * (0.3 + 0.25 * k) * (k % 2 ? -1 : 1);
      G.capsule(x, ground - 3, x, ground, 1.1, 0.8, 1);
    }
  }

  // Torso.
  if (P.body === 'segmented') {
    G.ellipse(0, T.y + T.ry * 0.3, T.rx * 1.05, T.ry * 1.15, 1); // abdomen
    G.ellipse(0, T.y - T.ry * 0.95, T.rx * 0.8, T.ry * 0.75, 1); // thorax
    if (!back) for (let k = 0; k < 3; k++) G.ellipse(0, T.y + T.ry * (0.0 + k * 0.45), T.rx * (0.75 - k * 0.12), 0.7, 3, { only: [1] });
  } else if (L === 'quad') {
    // Body seen from the front-quarter: the barrel behind, the chest in front.
    G.ellipse(T.rx * 0.35, T.y - 1, T.rx * 1.15, T.ry * 0.85, 1, { p: 2.2 });
    G.ellipse(-T.rx * 0.15, T.y + 1, T.rx * 0.8, T.ry * 0.9, 1);
  } else {
    G.ellipse(0, T.y, T.rx, T.ry, 1, { taper, p: P.body === 'boxy' ? 3.2 : P.body === 'hulk' ? 2.6 : 2.1 });
  }
  // Belly / chest (front only).
  if (!back && P.body !== 'segmented') {
    const bx = L === 'quad' ? -T.rx * 0.2 : 0;
    G.ellipse(bx, T.y + T.ry * 0.2, T.rx * 0.55, T.ry * 0.62, 3, { only: [1] });
  }
  pattern(c);
  if (c.furry && !back) fur(c);

  // Near limbs in front (in the back view they go over the back parts, see nearLimbsOverBack).
  if (view === 'front') limbs(c, -1);
  void sz;
}

function nearLimbsOverBack(c: Ctx) {
  limbs(c, -1);
}

function limbs(c: Ctx, side: 1 | -1) {
  const { G, P, fam, stage, sz, ground, fierce } = c;
  const L = fam.loco;
  const T = c.torso;
  const v = side === 1 ? far : (r: Reg) => r;
  // Legs.
  if (L === 'biped') {
    const hx = side * T.rx * 0.48;
    const hy = c.hip.y;
    const thigh = 2.2 + sz * 1.6;
    const kx = hx + side * 1.2;
    const ky = hy + (ground - hy) * 0.5;
    G.capsule(hx, hy - 1, kx, ky, thigh, thigh * 0.75, v(1));
    G.capsule(kx, ky, hx + side * 0.3, ground - 1, thigh * 0.72, thigh * 0.6, v(1));
    G.ellipse(hx + side * 0.3 - 0.8, ground - 0.6, thigh * 1.05, 1.5, v(1));
    if (stage > 0 && (fierce || P.arms === 'claws')) for (const dx of [-1.6, 0, 1.6]) G.capsule(hx + dx - 1, ground - 0.5, hx + dx - 1.6, ground + 0.6, 0.6, 0.4, 8);
  } else if (L === 'quad') {
    // Front legs at the chest, hind legs peeking out at the sides.
    const fx = -T.rx * 0.15 + side * T.rx * 0.45;
    const lw = 1.8 + sz * 1.4;
    G.capsule(fx, T.y + T.ry * 0.3, fx, ground - 1, lw, lw * 0.8, v(1));
    G.ellipse(fx - 0.5, ground - 0.5, lw * 1.05, 1.4, v(1));
    const bx = T.rx * 0.35 + side * T.rx * 1.05;
    G.capsule(bx, T.y + T.ry * 0.2, bx - side * 0.5, ground - 1, lw * 1.1, lw * 0.75, side === 1 ? 12 : 1);
    G.ellipse(bx - side * 0.5 - 0.4, ground - 0.5, lw, 1.3, side === 1 ? 12 : 1);
    if (stage > 0) for (const dx of [-1.2, 0.4]) G.capsule(fx + dx - 0.6, ground - 0.4, fx + dx - 1, ground + 0.5, 0.55, 0.4, 8);
  } else if (L === 'insect') {
    for (let k = 0; k < 3; k++) {
      const sy = T.y - T.ry * 0.6 + k * T.ry * 0.55;
      const sx = side * T.rx * 0.8;
      const kx = side * (T.rx + 4 + stage * 1.5);
      const ky = sy - 2 + k;
      G.capsule(sx, sy, kx, ky, 1.1, 0.9, v(1));
      G.capsule(kx, ky, kx - side * (k - 1) * 1.5, ground, 0.9, 0.6, v(1));
    }
  } else if (L === 'avian') {
    const lx = side * T.rx * 0.35;
    G.capsule(lx, T.y + T.ry * 0.8, lx, ground - 1, 0.9 + sz * 0.4, 0.8, 6);
    for (const dx of [-1.8, 0, 1.8]) G.capsule(lx, ground - 1, lx + dx, ground + 0.3, 0.6, 0.45, 6);
  }
  // Arms.
  if (P.arms === 'none' || L === 'avian') return;
  const sx = side * c.shoulder.x;
  const sy = c.shoulder.y;
  const reach = [3, 5, 7][stage];
  const aw = P.arms === 'fists' ? 1.8 + sz * 1.6 : 1.1 + sz * 1.1;
  const ex = sx + side * (reach * 0.5);
  const ey = sy + reach * 0.75;
  switch (P.arms) {
    case 'stub':
      G.capsule(sx, sy, sx + side * 2, sy + 2.5, 1.4, 1.2, v(1));
      break;
    case 'claws':
    case 'long': {
      const hx = ex - side * (P.arms === 'long' ? 0 : 0.5);
      const hy = ey + reach * (P.arms === 'long' ? 1.1 : 0.7);
      G.capsule(sx, sy, ex, ey, aw * 1.1, aw, v(1));
      G.capsule(ex, ey, hx, hy, aw, aw * 0.85, v(1));
      G.ellipse(hx, hy + 0.8, aw * 1.05, aw * 1.05, v(1));
      for (const dx of [-1.3, 0, 1.3]) G.capsule(hx + dx, hy + 1.6, hx + dx * 1.2 - 0.3, hy + 3 + stage * 0.4, 0.55, 0.35, 8);
      break;
    }
    case 'fists': {
      G.capsule(sx, sy, ex, ey, aw, aw * 0.9, v(1));
      G.capsule(ex, ey, ex - side * 0.5, ey + reach * 0.8, aw * 0.9, aw, v(1));
      G.ellipse(ex - side * 0.5, ey + reach * 0.8 + aw * 0.6, aw * 1.35, aw * 1.25, v(1));
      G.capsule(ex - side * 0.5 - aw, ey + reach * 0.8 + aw * 0.4, ex - side * 0.5 + aw, ey + reach * 0.8 + aw * 0.4, 0.35, 0.35, 9);
      break;
    }
    case 'blades': {
      G.capsule(sx, sy, ex, ey, aw, aw * 0.8, v(1));
      const bx = ex + side * 1;
      G.poly(
        [
          [bx - 1, ey],
          [bx + side * 2, ey - 1],
          [bx + side * 1.5, ey + reach * 1.6],
        ],
        8,
      );
      break;
    }
    case 'tentacles':
      for (let k = 0; k < 2; k++) {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 6; i++) pts.push([sx + side * (i * 0.9 + k), sy + k * 2 + i * 1.3 + Math.sin(i * 1.1 + k * 2) * 1.2]);
        G.chain(pts, aw * 1.1, 0.5, v(k ? 2 : 1));
      }
      break;
    case 'pincers': {
      G.capsule(sx, sy, ex, ey, aw, aw, v(1));
      const px = ex + side * 1.5;
      const py = ey + 1;
      G.poly(
        [
          [px, py - 1],
          [px + side * (4 + stage), py - 3 - stage],
          [px + side * 1, py + 0.5],
        ],
        6,
      );
      G.poly(
        [
          [px, py + 0.5],
          [px + side * (3.5 + stage), py + 1.5],
          [px, py + 2],
        ],
        6,
      );
      break;
    }
  }
}

function pattern(c: Ctx) {
  const { G, fam, stage, view } = c;
  const T = c.torso;
  const on = [1];
  const r = new Rng(hashString(fam.pattern + stage));
  switch (fam.pattern) {
    case 'spots':
      for (let i = 0; i < 3 + stage * 2; i++) {
        const x = (r.next() * 2 - 1) * T.rx * 0.7;
        G.ellipse(x, T.y + (r.next() * 2 - 1) * T.ry * 0.6, 1 + r.next(), 0.9 + r.next() * 0.6, 2, { only: on });
      }
      break;
    case 'hstripes':
      for (let k = 0; k < 2 + stage; k++) G.ellipse(-T.rx * 0.75, T.y - T.ry * 0.5 + k * 3.2, T.rx * 0.5, 0.9, 2, { only: on });
      for (let k = 0; k < 2 + stage; k++) G.ellipse(T.rx * 0.75, T.y - T.ry * 0.5 + k * 3.2, T.rx * 0.5, 0.9, 2, { only: on });
      break;
    case 'vstripes':
      for (const sx of [-0.6, 0.6]) G.capsule(sx * T.rx, T.y - T.ry * 0.8, sx * T.rx * 0.8, T.y + T.ry * 0.7, 0.8, 0.5, 2, on);
      break;
    case 'belly':
      if (view === 'front') G.ellipse(0, T.y + T.ry * 0.15, T.rx * 0.7, T.ry * 0.78, 3, { only: [1, 3] });
      break;
    case 'chevrons':
      for (let k = 0; k < 2 + stage; k++) {
        const y = T.y - T.ry * 0.5 + k * 3;
        G.capsule(-T.rx * 0.5, y, 0, y + 1.6, 0.6, 0.6, 2, on);
        G.capsule(T.rx * 0.5, y, 0, y + 1.6, 0.6, 0.6, 2, on);
      }
      break;
    case 'core':
      if (view === 'front') {
        G.ellipse(0, T.y - T.ry * 0.05, 1.8 + stage * 0.7, 1.8 + stage * 0.7, 7, { only: [1, 3] });
        G.ellipse(-0.4, T.y - T.ry * 0.05 - 0.5, 0.8 + stage * 0.3, 0.8 + stage * 0.3, 15, { only: [7] });
      }
      break;
    case 'rings':
      for (let k = 0; k < 3 + stage; k++) G.ellipse(0, T.y - T.ry + 1.5 + k * 3.2, T.rx * 1.1, 0.75, 3, { only: on });
      break;
  }
}

/** Fur: little tufts along the shoulders, sides and cheeks. */
function fur(c: Ctx) {
  const { G, stage } = c;
  const T = c.torso;
  for (const side of [-1, 1] as const) {
    for (let k = 0; k < 3 + stage; k++) {
      const y = T.y - T.ry * 0.6 + k * 2.6;
      const x = side * (T.rx * (1 - k * 0.04) + 0.6);
      G.poly(
        [
          [x - side * 1.6, y - 1.2],
          [x + side * 1.4, y + 0.4],
          [x - side * 1.4, y + 1.3],
        ],
        side === 1 ? 12 : 1,
      );
    }
  }
  // A ruff at the neck.
  if (stage > 0) for (let i = -2; i <= 2; i++) G.poly([[i * 2 - 1.2, T.y - T.ry + 1], [i * 2 + 1.2, T.y - T.ry + 1], [i * 2 + 0.2, T.y - T.ry + 3.5]], 3);
}

// ---------------------------------------------------------------- head, face, tops

function headShape(c: Ctx) {
  const { G, P, stage, view } = c;
  const H = c.head;
  if (P.head === 'merged') return;
  const r = H.r;
  const back = view === 'back';
  // Neck.
  G.capsule(H.x * 0.5, H.y + r * 0.6, 0, c.torso.y - c.torso.ry * 0.7, r * 0.42, r * 0.5, 1);
  switch (P.head) {
    case 'round':
      G.ellipse(H.x, H.y, r * 1.08, r, 1);
      break;
    case 'wide':
      G.ellipse(H.x, H.y, r * 1.38, r * 0.82, 1, { p: 2.3 });
      break;
    case 'long':
      G.ellipse(H.x, H.y - r * 0.15, r * 0.95, r * 0.9, 1);
      if (!back) {
        G.ellipse(H.x - 0.6, H.y + r * 0.5, r * 0.62, r * 0.48, 1);
        G.ellipse(H.x - 0.6, H.y + r * 0.62, r * 0.48, r * 0.32, 3, { only: [1] });
        G.ellipse(H.x - 0.8, H.y + r * 0.3, 1.1, 0.8, 9);
      }
      break;
    case 'skull':
      G.ellipse(H.x, H.y, r * 1.12, r * 1.02, 1, { taper: -0.28, p: 2.5 });
      if (!back) G.capsule(H.x - r * 0.9, H.y - r * 0.35, H.x + r * 0.9, H.y - r * 0.35, 0.9, 0.9, 1);
      break;
    case 'flat':
      G.ellipse(H.x, H.y, r * 1.3, r * 0.72, 1, { p: 3, taper: 0.12 });
      if (!back) G.capsule(H.x - r * 1.1, H.y + r * 0.35, H.x + r * 1.1, H.y + r * 0.35, 0.45, 0.45, 9, [1]);
      break;
    case 'beak':
      G.ellipse(H.x, H.y, r, r * 0.96, 1);
      if (!back)
        G.poly(
          [
            [H.x - r * 0.55, H.y + r * 0.05],
            [H.x + r * 0.35, H.y + r * 0.05],
            [H.x - 0.6, H.y + r * 0.62 + stage * 0.9],
          ],
          6,
        );
      break;
  }
  if (stage === 2 && !back && P.head !== 'beak') G.ellipse(H.x, H.y + r * 0.55, r * 0.7, r * 0.3, 3, { only: [1] });
}

function face(c: Ctx) {
  const { G, P, fam, stage, fierce, el } = c;
  const H = c.head;
  const merged = P.head === 'merged';
  const r = H.r;
  const fy = merged ? c.torso.y - c.torso.ry * 0.3 : H.y - r * (stage === 0 ? 0.05 : 0.15);
  const spread = r * 0.44;
  const es = [1.25, 1.05, 0.95][stage];
  const hollow = (el === 'Spirit' || el === 'Shadow') && stage > 0;
  const visor = el === 'Metal' && stage > 0;
  const eye = (x: number, y: number, small = false) => {
    const k = small ? 0.7 : 1;
    if (hollow) {
      G.ellipse(x, y, 1.9 * es * k, 1.7 * es * k, 9);
      G.ellipse(x - 0.3, y, 0.9 * k, 0.9 * k, 7);
      return;
    }
    if (stage === 2 || (fierce && stage === 1)) {
      G.poly(
        [
          [x - 2.2 * k, y - 0.6],
          [x + 2 * k, y - 1.4],
          [x + 1.7 * k, y + 1],
          [x - 1.8 * k, y + 0.9],
        ],
        7,
      );
      G.capsule(x - 0.2, y - 0.8, x - 0.2, y + 0.6, 0.55, 0.55, 5);
      G.capsule(x - 2.6 * k, y - 1.6, x + 2.3 * k, y - 2.6, 0.75, 0.6, 9);
      return;
    }
    G.ellipse(x, y, 1.6 * es * k, 2.05 * es * k, 4);
    G.ellipse(x + 0.35, y + 0.35, 1.05 * es * k, 1.45 * es * k, 5, { only: [4] });
    G.ellipse(x - 0.25, y - 0.7, 0.55, 0.55, 15, { only: [5, 4] });
    if (stage === 1) G.capsule(x - 2 * k, y - 2.6, x + 2 * k, y - 2.9, 0.5, 0.5, 9);
  };
  if (visor) {
    G.capsule(-r * 0.85, fy, r * 0.85, fy, 1.2, 1.2, 7);
    G.ellipse(-r * 0.4, fy - 0.3, 0.7, 0.5, 15);
  } else if (fam.eyes === 1) {
    eye(0, fy);
  } else {
    eye(-spread, fy);
    eye(spread, fy);
    if (fam.eyes === 3) G.ellipse(0, fy - 3.4, 0.9, 1.2, stage === 2 ? 7 : 4);
    if (fam.eyes === 4) {
      eye(-spread * 0.75, fy + 3.6, true);
      eye(spread * 0.75, fy + 3.6, true);
    }
  }
  // Mouth.
  if (P.head === 'beak' || P.mouth === 'beak') return;
  const my = merged ? fy + 4.5 : H.y + r * (P.head === 'long' ? 0.78 : 0.55);
  const mx = H.x - (P.head === 'long' ? 0.6 : 0);
  switch (P.mouth) {
    case 'smile':
      G.capsule(mx - 1.6, my - 0.6, mx - 0.4, my + 0.3, 0.42, 0.42, 9);
      G.capsule(mx - 0.4, my + 0.3, mx + 1.2, my - 0.4, 0.42, 0.42, 9);
      break;
    case 'fangs':
      G.capsule(mx - 2, my, mx + 1.6, my, 0.45, 0.45, 9);
      for (const dx of [-1.3, 1]) G.poly([[mx + dx - 0.5, my], [mx + dx + 0.5, my], [mx + dx, my + 1.6]], 8);
      break;
    case 'tusks':
      G.capsule(mx - 2, my, mx + 1.6, my, 0.45, 0.45, 9);
      for (const s of [-1, 1]) G.chain([[mx + s * 2.2, my], [mx + s * 3.1, my - 1.5], [mx + s * 3, my - 2.8 - stage]], 0.8, 0.35, 6);
      break;
    case 'jaw':
      G.ellipse(mx, my + 0.4, 2.6, 1.4, 14);
      for (const dx of [-1.8, -0.6, 0.6, 1.8]) G.poly([[mx + dx - 0.45, my - 0.6], [mx + dx + 0.45, my - 0.6], [mx + dx, my + 0.6]], 8);
      break;
    case 'mandibles':
      for (const s of [-1, 1]) G.chain([[mx + s * 1.2, my - 0.5], [mx + s * 2.6, my + 1.2], [mx + s * 1.4, my + 2.6 + stage * 0.5]], 0.7, 0.35, 6);
      break;
  }
  // Cheek blush on babies.
  if (stage === 0 && !hollow) for (const s of [-1, 1]) G.ellipse(s * (spread + 1.6), fy + 2.6, 1.1, 0.6, 2, { only: [1] });
}

function tops(c: Ctx) {
  const { G, P, stage, sz } = c;
  const H = c.head;
  const merged = P.head === 'merged';
  const top = H.top + 1;
  const hw = merged ? c.torso.rx * 0.7 : H.r * 0.75;
  const big = 0.7 + stage * 0.4;
  both(c, (side, v) => {
    const x = H.x + side * hw;
    switch (P.top) {
      case 'ears':
        G.poly([[x - side * 2, top + 1.5], [x + side * 1.6, top + 0.5], [x + side * 1.2, top - 4.5 * big]], v(1));
        G.poly([[x - side * 0.8, top + 0.8], [x + side * 0.9, top + 0.3], [x + side * 0.7, top - 3 * big]], v(2));
        break;
      case 'longears':
        G.ellipse(x + side * 1.2, top - 4 * big, 1.8, 5 * big, v(1));
        G.ellipse(x + side * 1.2, top - 3.6 * big, 0.8, 3.6 * big, v(2), { only: [1, 12] });
        break;
      case 'antennae':
        G.chain([[x - side * 1.5, top + 1], [x, top - 3 * big], [x + side * 2.5, top - 5.5 * big]], 0.55, 0.45, 9);
        G.ellipse(x + side * 2.5, top - 5.8 * big, 1.2, 1.2, 11);
        break;
      case 'horns-swept':
        G.chain([[x - side * 1, top + 1.5], [x + side * 1.5, top - 2 * big], [x + side * 4.5 * big, top - 4 * big], [x + side * 7 * big, top - 4.2 * big]], 1.5 + sz * 0.6, 0.4, 6);
        break;
      case 'horns-ram': {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 8; i++) {
          const a = (i / 8) * Math.PI * 1.6;
          pts.push([x + side * (Math.sin(a) * 3.2 * big + 1), top + 1.5 - Math.cos(a) * 2.8 * big + i * 0.4]);
        }
        G.chain(pts, 1.4 + sz * 0.4, 0.6, 6);
        break;
      }
      case 'antlers': {
        const L = 6 * big;
        G.chain([[x, top + 1], [x + side * L * 0.3, top - L * 0.6], [x + side * L * 0.45, top - L]], 0.85, 0.5, 6);
        G.capsule(x + side * L * 0.2, top - L * 0.4, x + side * L * 0.75, top - L * 0.55, 0.6, 0.4, 6);
        G.capsule(x + side * L * 0.35, top - L * 0.8, x + side * L * 0.05, top - L * 1.15, 0.55, 0.4, 6);
        if (stage === 2) G.capsule(x + side * L * 0.45, top - L, x + side * L * 0.85, top - L * 1.05, 0.5, 0.35, 6);
        break;
      }
      case 'crown':
        G.poly([[x - side * 1.5, top + 1], [x + side * 0.5, top + 1], [x - side * 0.5, top - 3 * big]], 6);
        break;
    }
  });
  if (P.top === 'unihorn') G.poly([[H.x - 1.3, top + 1.5], [H.x + 1.3, top + 1.5], [H.x - 0.4, top - 6 * big - 1]], 6);
  if (P.top === 'crest') {
    G.poly([[H.x - 1.5, top + 1.5], [H.x + 1.5, top + 1.5], [H.x + 3.5 * big, top - 3.5 * big], [H.x - 0.5, top - 5.5 * big]], 2);
    G.capsule(H.x - 0.5, top - 5 * big, H.x + 3 * big, top - 3 * big, 0.4, 0.4, 11, [2]);
  }
  if (P.top === 'crown') G.poly([[H.x - 1, top + 1], [H.x + 1, top + 1], [H.x, top - 4.5 * big]], 6);
}

// ---------------------------------------------------------------- back parts and tail

function backParts(c: Ctx) {
  const { G, P, stage, fam, view } = c;
  const T = c.torso;
  const L = fam.loco;
  const sx = c.shoulder.x - 1.5;
  const sy = c.shoulder.y - 0.5;
  const ws = [6, 10, 14][stage] * (L === 'avian' ? 1.15 : 1);
  const back = view === 'back';
  both(c, (side, v) => {
    switch (P.back) {
      case 'batwings': {
        const tip: [number, number] = [side * (sx + ws), sy - ws * 0.75];
        const fingers: [number, number][] = [
          [side * (sx + ws * 1.05), sy + ws * 0.05],
          [side * (sx + ws * 0.75), sy + ws * 0.45],
          [side * (sx + ws * 0.3), sy + ws * 0.55],
        ];
        G.poly([[side * sx, sy], tip, ...fingers, [side * sx, sy + ws * 0.3]], 16);
        G.capsule(side * sx, sy, tip[0], tip[1], 1.1, 0.6, 6);
        for (const f of fingers) G.capsule(tip[0], tip[1], f[0], f[1], 0.5, 0.35, 6);
        G.capsule(tip[0], tip[1], tip[0] + side * 1, tip[1] - 1.5, 0.5, 0.3, 8);
        break;
      }
      case 'featherwings': {
        const n = 4 + stage * 2;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const ang = -0.9 + t * 1.3;
          const len = ws * (1.05 - t * 0.45);
          const x0 = side * (sx + t * 1.5);
          const y0 = sy + t * 2;
          const x1 = x0 + side * Math.cos(ang) * len;
          const y1 = y0 + Math.sin(ang) * len;
          G.capsule(x0, y0, x1, y1, 1.7 + stage * 0.2, 0.8, v(2));
          G.capsule(x1 - side * Math.cos(ang) * 1.4, y1 - Math.sin(ang) * 1.4, x1, y1, 0.75, 0.6, 11);
        }
        break;
      }
      case 'bugwings':
        G.ellipse(side * (sx + ws * 0.5), sy - ws * 0.3, ws * 0.55, ws * 0.32, 16);
        G.ellipse(side * (sx + ws * 0.4), sy + ws * 0.25, ws * 0.42, ws * 0.24, 16);
        G.capsule(side * sx, sy, side * (sx + ws * 0.95), sy - ws * 0.4, 0.35, 0.3, 9, [16]);
        break;
      case 'spines':
        for (let k = 0; k < 3 + stage; k++) {
          const y = T.y - T.ry * 0.8 + k * 3;
          const x = side * (T.rx * (0.85 - k * 0.05));
          G.poly([[x - side * 1.5, y - 0.5], [x + side * 0.5, y + 2.2], [x + side * (3 + stage), y - 2 - stage * 0.5]], 6);
        }
        break;
      case 'fins':
        G.poly([[side * (sx - 1), sy - 1], [side * (sx + 3 + stage * 2), sy - 4 - stage * 1.5], [side * (sx + 1), sy + 4]], v(2));
        break;
    }
  });
  if (P.back === 'shell') {
    G.ellipse(T.rx * 0.2, T.y - 1, T.rx + 3, T.ry + 2, back ? 3 : 3, { p: 2.4 });
    // Plate seams.
    for (let k = -1; k <= 1; k++) G.capsule(-T.rx - 2, T.y + k * 3.5, T.rx + 4, T.y + k * 3.5, 0.35, 0.35, 9, [3]);
    if (back) for (let k = -1; k <= 1; k++) G.capsule(k * 4, T.y - T.ry - 1, k * 4.5, T.y + T.ry + 1, 0.35, 0.35, 9, [3]);
  }
  if (P.back === 'mane') {
    const H = c.head;
    const n = 9 + stage * 3;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 0.95 + (i / (n - 1)) * Math.PI * 1.9;
      const rr = (P.head === 'merged' ? T.rx : H.r) + 2.5 + stage;
      G.ellipse(H.x + Math.cos(a) * rr, H.y + Math.sin(a) * rr * 0.95, 2 + stage * 0.4, 1.7 + stage * 0.3, 10);
    }
  }
  if (P.back === 'spines' && back) for (let k = 0; k < 3 + stage; k++) G.poly([[-1.2, T.y - T.ry + k * 3.4], [1.2, T.y - T.ry + k * 3.4], [0, T.y - T.ry + k * 3.4 - 3 - stage]], 6);
}

function tail(c: Ctx) {
  const { G, fam, stage, view, furry } = c;
  if (fam.tail === 'none' || fam.loco === 'slime' || fam.loco === 'serpent') return;
  const T = c.torso;
  const side = view === 'back' ? -fam.tailSide : fam.tailSide;
  const len = [6, 9, 12][stage];
  const x0 = side * T.rx * 0.5;
  const y0 = T.y + T.ry * 0.55;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push([x0 + side * len * t, y0 + 2 - Math.sin(t * Math.PI * 0.8) * len * 0.7 - t * len * 0.15]);
  }
  const fluffy = furry && fam.tail === 'thin';
  G.chain(pts, fluffy ? 2.4 + stage * 0.5 : 1.3 + stage * 0.4, fluffy ? 1.4 : 0.6, side === 1 && view === 'front' ? 12 : 1);
  const [tx, ty] = pts[pts.length - 1];
  if (fluffy) G.ellipse(tx, ty, 2 + stage * 0.6, 1.8 + stage * 0.5, 3);
  if (fam.tail === 'spiked') for (let i = 1; i < 5; i++) G.poly([[pts[i][0] - 0.8, pts[i][1] - 0.3], [pts[i][0] + 0.8, pts[i][1] - 0.3], [pts[i][0] + side * 0.6, pts[i][1] - 2.4]], 6);
  if (fam.tail === 'club') G.ellipse(tx, ty, 2.2 + stage * 0.5, 2 + stage * 0.5, 6);
  if (fam.tail === 'flame') {
    G.poly([[tx - 1.8, ty + 0.5], [tx + 1.8, ty + 0.5], [tx + side * 0.8, ty - 4 - stage]], 10);
    G.poly([[tx - 0.8, ty], [tx + 0.8, ty], [tx + side * 0.4, ty - 2.2 - stage * 0.6]], 11);
  }
}

// ---------------------------------------------------------------- element features and signature parts

function elementFeature(c: Ctx, back: boolean) {
  const { G, el, stage } = c;
  const H = c.head;
  const T = c.torso;
  const top = H.top + 1;
  const k = [1, 1.5, 2][stage];
  switch (el) {
    case 'Fire':
      for (let i = -1; i <= 1; i++) {
        const h = (4 - Math.abs(i) * 1.4) * k;
        G.poly([[H.x + i * 2 - 1.4, top + 1.5], [H.x + i * 2 + 1.4, top + 1.5], [H.x + i * 2.4 + 0.4, top - h]], 10);
        G.poly([[H.x + i * 2 - 0.6, top + 1], [H.x + i * 2 + 0.6, top + 1], [H.x + i * 2.2 + 0.2, top - h * 0.5]], 11);
      }
      break;
    case 'Frost':
      both(c, (side) => {
        for (let i = 0; i < 1 + stage; i++) {
          const x = side * (c.shoulder.x - 1 - i * 2);
          G.poly([[x - 1.2, c.shoulder.y + 1], [x + 1.2, c.shoulder.y + 1], [x + side * (0.5 + i), c.shoulder.y - 3.5 * k + i]], 10);
          G.capsule(x, c.shoulder.y, x + side * 0.4, c.shoulder.y - 2 * k, 0.35, 0.3, 11, [10]);
        }
      });
      break;
    case 'Nature':
      G.capsule(H.x - 1, top + 1, H.x - 1.5, top - 2 * k, 0.45, 0.4, 2);
      G.ellipse(H.x - 3.2 * k * 0.6, top - 2.4 * k, 2.2 * k * 0.7, 1.1 * k * 0.7, 10, { taper: 0.3 });
      G.ellipse(H.x + 1.6 * k * 0.6, top - 2 * k, 1.8 * k * 0.6, 0.9 * k * 0.7, 10);
      if (stage > 0) G.ellipse(-c.shoulder.x, c.shoulder.y - 1, 2.2 * k * 0.6, 1.2 * k * 0.6, 10);
      break;
    case 'Earth':
      both(c, (side) => {
        G.ellipse(side * c.shoulder.x, c.shoulder.y - 0.5, 1.8 + stage, 1.4 + stage * 0.7, 10, { p: 2.6, taper: 0.3 });
        if (stage === 2) G.poly([[side * c.shoulder.x - 1.5, c.shoulder.y - 1], [side * c.shoulder.x + 1.5, c.shoulder.y - 1], [side * c.shoulder.x, c.shoulder.y - 5]], 10);
      });
      break;
    case 'Storm': {
      const x = H.x - 1.5;
      const h = 4 * k;
      G.chain([[x, top + 1], [x - 1.6, top - h * 0.45], [x + 0.6, top - h * 0.55], [x - 1, top - h]], 0.7, 0.45, 10);
      G.ellipse(x - 1, top - h - 0.5, 0.8, 0.8, 11);
      break;
    }
    case 'Water':
      both(c, (side) => {
        const x = side * ((P_head_merged(c) ? T.rx : H.r) + 0.5);
        G.poly([[x - side * 1, H.y - 1.5], [x - side * 1, H.y + 2], [x + side * 3 * k, H.y - 2 * k]], 10);
      });
      break;
    case 'Metal':
      G.capsule(H.x + 0.5, top + 1, H.x + 0.5, top - 3 * k, 0.5, 0.45, 6);
      G.ellipse(H.x + 0.5, top - 3 * k - 0.6, 0.9, 0.9, 7);
      if (!back) for (const s of [-1, 1]) G.ellipse(s * c.shoulder.x * 0.7, c.shoulder.y + 1, 0.7, 0.7, 11, { only: [1, 12] });
      break;
    case 'Toxic':
      for (let i = 0; i < 1 + stage * 2; i++) G.ellipse(H.x - 2 + i * 1.9 - stage, top - 1.5 - (i % 2) * 2.2 - i * 0.5, 0.8 + (i % 2) * 0.5, 0.8 + (i % 2) * 0.5, i % 2 ? 11 : 10);
      break;
    case 'Shadow':
      for (let i = 0; i < 1 + stage; i++) {
        const sx = H.x - 1.5 - i * 2.6 + stage;
        const pts: [number, number][] = [];
        for (let y = 0; y < 3 + stage * 1.6; y++) pts.push([sx + Math.sin(y + i) * 0.9, top - y]);
        G.chain(pts, 0.9, 0.4, 10);
      }
      break;
    case 'Light': {
      const hy = top - 3 - stage * 1.2;
      const w = 2.5 + stage * 1.3;
      for (let a = 0; a < Math.PI * 2; a += 0.35) G.ellipse(H.x + Math.cos(a) * w, hy + Math.sin(a) * w * 0.32, 0.5, 0.45, 10);
      break;
    }
    case 'Spirit':
      for (let i = 0; i < 1 + stage; i++) G.ellipse(-(T.rx + 3 + i * 1.6), c.shoulder.y - 2 + i * 3.2, 1, 1, 10);
      break;
    case 'Dragon':
      both(c, (side) => {
        const x = side * ((P_head_merged(c) ? T.rx : H.r) + 0.3);
        for (let i = 0; i < 1 + stage; i++) G.poly([[x - side * 0.8, H.y - 1 + i * 1.6], [x - side * 0.8, H.y + 1 + i * 1.6], [x + side * (2.5 * k - i), H.y - 1.5 * k + i * 2]], 10);
      });
      break;
  }
}
const P_head_merged = (c: Ctx) => c.P.head === 'merged';

const SIG_PARTS = ['gem', 'emblem', 'scarf', 'collar', 'bracers', 'facemark', 'earrings', 'sash'] as const;
export const signaturePartOf = (speciesId: string) => SIG_PARTS[hashString(speciesId + ':part') % SIG_PARTS.length];

function signaturePart(c: Ctx, speciesId: string) {
  const { G, stage } = c;
  const H = c.head;
  const T = c.torso;
  const part = signaturePartOf(speciesId);
  const neckY = T.y - T.ry + 1.2;
  switch (part) {
    case 'gem':
      G.poly([[H.x, H.top + 1.5], [H.x + 1.5, H.top + 3], [H.x, H.top + 5], [H.x - 1.5, H.top + 3]], 10);
      G.ellipse(H.x - 0.4, H.top + 2.7, 0.5, 0.6, 11);
      break;
    case 'emblem':
      G.poly([[0, T.y - 3.5], [2.8, T.y], [0, T.y + 3.5], [-2.8, T.y]], 10, [1, 3, 12]);
      G.poly([[0, T.y - 1.8], [1.4, T.y], [0, T.y + 1.8], [-1.4, T.y]], 11, [10]);
      break;
    case 'scarf':
      G.ellipse(0, neckY, T.rx * 0.8, 1.6 + stage * 0.3, 2, { only: [1, 3, 12] });
      G.chain([[T.rx * 0.4, neckY + 1], [T.rx * 0.6, neckY + 4], [T.rx * 0.45, neckY + 7 + stage * 2]], 1.1, 0.8, 2);
      break;
    case 'collar':
      G.ellipse(0, neckY, T.rx * 0.85, 1.4, 6, { only: [1, 3, 12] });
      for (const s of [-1, 0, 1]) G.ellipse(s * T.rx * 0.45, neckY + 1.2, 0.8, 0.8, 7);
      break;
    case 'bracers':
      both(c, (side) => G.capsule(side * (c.shoulder.x + 1), c.shoulder.y + 3, side * (c.shoulder.x + 2.6), c.shoulder.y + 4.5, 1.6, 1.6, 6, [1, 12]));
      break;
    case 'facemark':
      both(c, (side) => G.capsule(side * H.r * 0.5, H.y + 1.2, side * H.r * 0.85, H.y + 2.6, 0.45, 0.45, 2, [1, 12]));
      break;
    case 'earrings':
      both(c, (side) => G.ellipse(side * (H.r * 1.02), H.y + 1.5, 0.75, 0.9, 10));
      break;
    case 'sash':
      G.capsule(-T.rx * 0.8, T.y - T.ry * 0.6, T.rx * 0.7, T.y + T.ry * 0.5, 1.1, 1.1, 2, [1, 3, 12]);
      break;
  }
}

// ---------------------------------------------------------------- painting

type Rgb = [number, number, number];
const rgb = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const pack = ([r, g, b]: Rgb) => (Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b)));
const mix = (a: number, b: number, t: number) => {
  const A = rgb(a);
  const B = rgb(b);
  return pack([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
};
const SHADOW_TINT = 0x241448;
const LIGHT_TINT = 0xfff2cc;
const dark = (c: number, t: number) => mix(c, SHADOW_TINT, t);
const light = (c: number, t: number) => mix(c, LIGHT_TINT, t);
const css = (c: number, a = 1) => (a >= 1 ? '#' + c.toString(16).padStart(6, '0') : `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`);

/** Paint a creature (64×64) at (ox, oy). */
export function paintArt(ctx: CanvasRenderingContext2D, speciesId: string, stage: number, view: View = 'front', ox = 0, oy = 0, shiny = false) {
  const g = buildArt(speciesId, stage, view);
  const N = ART_SIZE;
  const { pal } = paletteFor(speciesId, stage, shiny);
  const P: Record<number, number> = {
    ...pal,
    12: dark(pal[1], 0.28),
    13: dark(pal[2], 0.28),
    14: 0x5a1a2e,
    15: 0xffffff,
    16: pal[2],
  };
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : g[y * N + x]);
  // Distance to the silhouette edge, for light and shadow.
  const dist = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) dist[i] = g[i] ? 99 : 0;
  for (let pass = 0; pass < 2; pass++)
    for (let yy = 0; yy < N; yy++)
      for (let xx = 0; xx < N; xx++) {
        const y = pass ? N - 1 - yy : yy;
        const x = pass ? N - 1 - xx : xx;
        const i = y * N + x;
        if (!dist[i]) continue;
        const nb = pass ? [[x + 1, y], [x, y + 1], [x + 1, y + 1], [x - 1, y + 1]] : [[x - 1, y], [x, y - 1], [x - 1, y - 1], [x + 1, y - 1]];
        for (const [nx, ny] of nb) {
          const d = nx < 0 || ny < 0 || nx >= N || ny >= N ? 0 : dist[ny * N + nx];
          dist[i] = Math.min(dist[i], d + (nx !== x && ny !== y ? 1.41 : 1));
        }
      }
  const D = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : dist[y * N + x]);
  // Light from the top-left in the front view; in the back view the light is behind-left.
  const LX = view === 'back' ? -0.5 : -0.62;
  const LY = -0.8;
  const px = (x: number, y: number, c: number, a = 1) => {
    ctx.fillStyle = css(c, a);
    ctx.fillRect(ox + x, oy + y, 1, 1);
  };
  // Soft ground shadow.
  for (let x = 0; x < N; x++) for (let y = N - 3; y < N; y++) if (!at(x, y) && at(x, y - 1)) px(x, y, 0x000000, 0.18);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const v = at(x, y);
      if (!v) {
        const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].find((n) => n && n !== 16);
        if (nb) px(x, y, dark(P[nb] ?? P[1], at(x, y - 1) ? 0.84 : 0.72));
        continue;
      }
      let c = P[v] ?? P[1];
      if (v === 16) {
        // See-through wing membrane, with darker veins at its edge.
        const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
        px(x, y, edge ? dark(c, 0.45) : light(c, 0.1), edge ? 0.95 : 0.62);
        continue;
      }
      if (v === 4 || v === 5 || v === 7 || v === 14 || v === 15) {
        px(x, y, c);
        continue;
      }
      const gx = D(x + 1, y) - D(x - 1, y);
      const gy = D(x, y + 1) - D(x, y - 1);
      const len = Math.hypot(gx, gy) || 1;
      const ndl = (-gx / len) * LX + (-gy / len) * LY;
      const d = dist[y * N + x];
      const edge = Math.max(0, 1 - (d - 1) / 3.5);
      const lit = ndl * edge;
      if (lit > 0.55) c = light(c, d <= 1.5 ? 0.4 : 0.26);
      else if (lit > 0.2) c = light(c, 0.13);
      else if (lit < -0.6) c = dark(c, d <= 1.5 ? 0.52 : 0.38);
      else if (lit < -0.2) c = dark(c, 0.22);
      // Where a part overlaps another, a soft contact shadow just below it.
      const above = at(x, y - 1);
      if (above && above !== v && above !== 16 && ![4, 5, 7, 14, 15].includes(above)) c = dark(c, 0.28);
      // Rim light on the far, lower edge.
      if (d <= 1.2 && ndl < -0.6 && (v === 1 || v === 12)) c = mix(c, P[11], 0.22);
      // Horns and bone: ring bands. Shells and bellies: plates.
      if (v === 6 && (x + y * 2) % 4 === 0) c = dark(c, 0.18);
      if (v === 3 && y % 3 === 0 && d > 1) c = dark(c, 0.13);
      px(x, y, c);
      // A glint on big lit surfaces.
      if ((v === 1 || v === 6 || v === 10) && d >= 2 && d < 3 && ndl > 0.9 && (x + y) % 4 === 0) px(x, y, light(P[v], 0.6));
    }
}
