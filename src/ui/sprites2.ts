import { SPECIES_BY_ID } from '../data/species';
import type { Element } from '../data/types';
import { hashString, Rng } from '../logic/rng';
import { buildGrid, paletteFor, type FaceInfo } from './sprites';

/**
 * Hexbound 2.0 art (style test): the same part plans as today, drawn on a finer grid (56 px) and
 * painted with light and shadow, detailed eyes and mouths, element textures and a signature part
 * per line. Not used by the game yet.
 */

export const SPRITE2_K = 1.4;
export const SPRITE2_SIZE = Math.round(40 * SPRITE2_K);

type Rgb = [number, number, number];
const rgb = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const pack = ([r, g, b]: Rgb) => (Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b)));
const mix = (a: number, b: number, t: number) => {
  const A = rgb(a);
  const B = rgb(b);
  return pack([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
};
/** Shadows lean cool (toward deep violet), lights lean warm (toward pale gold): reads richer than plain darker/lighter. */
const SHADOW_TINT = 0x2a1850;
const LIGHT_TINT = 0xfff4d0;
const dark = (c: number, t: number) => mix(c, SHADOW_TINT, t);
const light = (c: number, t: number) => mix(c, LIGHT_TINT, t);
const css = (c: number, a = 1) => (a >= 1 ? '#' + c.toString(16).padStart(6, '0') : `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`);

/** Each line's own extra feature (the 2.0 plan's "signature part"). */
const SIG_PARTS = ['gem', 'emblem', 'cheeks', 'scarf', 'tufts', 'collar', 'bracers', 'facemark'] as const;
type SigPart = (typeof SIG_PARTS)[number];
export const signaturePart = (speciesId: string): SigPart => SIG_PARTS[hashString(speciesId + ':part') % SIG_PARTS.length];

export function paintCreature2(ctx: CanvasRenderingContext2D, speciesId: string, stage: number, ox = 0, oy = 0, shiny = false) {
  const k = SPRITE2_K;
  const face: Partial<FaceInfo> = {};
  const g = buildGrid(speciesId, stage, k, face) as number[][];
  const f = face as FaceInfo;
  const N = g.length;
  const { pal } = paletteFor(speciesId, stage, shiny);
  const types = SPECIES_BY_ID[speciesId].types;
  const el = types[0] as Element;
  const rnd = new Rng(hashString(`${speciesId}:paint${stage}`));
  const O = (d: number) => (d + 0.5) * k - 0.5; // design → output coordinate
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && g[y][x] !== 0;

  // ---- signature part (drawn into the grid, so it gets shaded and outlined like the rest)
  const part = signaturePart(speciesId);
  const set = (x: number, y: number, v: number, mirror = true) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    g[y][x] = v;
    if (mirror) g[y][N - 1 - x] = v;
  };
  const cxo = O(f.cx);
  const bodyMid = O(f.by);
  const neckY = O(f.headTop) + (O(f.hy) - O(f.headTop)) * 2 + 1;
  switch (part) {
    case 'gem': {
      const gy = O(f.headTop) + 2;
      for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx <= 2 - Math.abs(dy - 2); dx++) set(cxo - dx, gy + dy, dy < 2 && dx === 0 ? 11 : 10);
      break;
    }
    case 'emblem':
      for (let dy = -3; dy <= 3; dy++) for (let dx = 0; dx <= 3 - Math.abs(dy); dx++) if (g[Math.round(bodyMid + dy)]?.[Math.round(cxo - dx)]) set(cxo - dx, bodyMid + dy, Math.abs(dy) + dx >= 3 ? 10 : 11);
      break;
    case 'cheeks':
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) set(O(f.cx - f.spread - 1.5) - dx, O(f.eyeY) + 3 + dy, 2);
      break;
    case 'scarf': {
      const y0 = Math.round(Math.min(neckY, bodyMid - 4));
      for (let x = 0; x < N / 2; x++) for (let dy = 0; dy < 2 + (stage > 0 ? 1 : 0); dy++) if (g[y0 + dy]?.[x] === 1) set(x, y0 + dy, 2);
      const tailX = Math.round(cxo + O(f.rx) * 0.4);
      for (let dy = 0; dy < 4 + stage * 2; dy++) set(tailX + Math.round(dy * 0.3), y0 + 2 + dy, 2, false);
      break;
    }
    case 'tufts':
      for (let i = 0; i < 4 + stage; i++) for (let h = 0; h <= 1 + (i % 2) + stage; h++) set(cxo - 1 - i, O(f.headTop) - h + (i === 0 ? 1 : 0), 2);
      break;
    case 'collar': {
      const y0 = Math.round(Math.min(neckY, bodyMid - 3));
      for (let x = 0; x < N / 2; x++) if (g[y0]?.[x] === 1 || g[y0 + 1]?.[x] === 1) {
        set(x, y0, 3);
        if (x % 2 === 0) set(x, y0 + 1, 3);
      }
      break;
    }
    case 'bracers':
      for (let y = 0; y < N; y++) for (let x = 0; x < N / 2 - O(f.rx) * 0.6; x++) if (g[y][x] === 1 && Math.abs(y - O(f.shoulderY) - 4) <= 1) set(x, y, 6);
      break;
    case 'facemark':
      for (let i = 0; i < 3; i++) set(O(f.cx - f.spread - 1) + 1 - i * 0.5, O(f.eyeY) + 2 + i, 2);
      break;
  }

  // ---- fur: furry lines (mammal-like body plans, by line) get tufts along their upper edges
  const furry = (f.loco === 'biped' || f.loco === 'quad') && ['Fire', 'Frost', 'Nature', 'Earth', 'Storm', 'Light', 'Shadow'].includes(el) && hashString(speciesId + ':fur') % 3 !== 0;
  if (furry) {
    const tuft: [number, number][] = [];
    for (let x = 0; x < N / 2; x++)
      for (let y = 1; y < N - 1; y++)
        if (g[y][x] === 1 && !g[y - 1][x]) {
          if (y < O(f.by) + O(f.ry) * 0.6 && (x + y) % 3 === 0) tuft.push([x, y - 1]);
          break;
        }
    for (const [x, y] of tuft) set(x, y, 1);
    // and along the outer sides
    for (let y = 2; y < N - 2; y += 3)
      for (let x = 1; x < N / 2; x++)
        if (g[y][x] === 1) {
          if (!g[y][x - 1] && y > O(f.headTop) + 4) set(x - 1, y, 1);
          break;
        }
  }

  // ---- distance from the edge (for light and shadow)
  const INF = 99;
  const dist: number[][] = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (g[y][x] ? INF : 0)));
  for (let pass = 0; pass < 2; pass++)
    for (let yy = 0; yy < N; yy++)
      for (let xx = 0; xx < N; xx++) {
        const y = pass ? N - 1 - yy : yy;
        const x = pass ? N - 1 - xx : xx;
        if (!dist[y][x]) continue;
        const nb = pass ? [[x + 1, y], [x, y + 1], [x + 1, y + 1], [x - 1, y + 1]] : [[x - 1, y], [x, y - 1], [x - 1, y - 1], [x + 1, y - 1]];
        for (const [nx, ny] of nb) {
          const d = nx < 0 || ny < 0 || nx >= N || ny >= N ? 0 : dist[ny][nx];
          dist[y][x] = Math.min(dist[y][x], d + (nx !== x && ny !== y ? 1.4 : 1));
        }
      }
  const D = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : dist[y][x]);

  // ---- base colours per region (shiny palettes already applied)
  const colorOf = (v: number) => pal[v] ?? pal[1];
  const LX = -0.62;
  const LY = -0.78;
  const px = (x: number, y: number, c: number, a = 1) => {
    ctx.fillStyle = css(c, a);
    ctx.fillRect(ox + x, oy + y, 1, 1);
  };

  // Spirit wisps and Light sparkles float behind/around (drawn first, faint).
  if (el === 'Spirit' || el === 'Light') {
    for (let i = 0; i < 4 + stage * 2; i++) {
      const wx = Math.round(rnd.next() * N);
      const wy = Math.round(rnd.next() * N * 0.8);
      if (filled(wx, wy)) continue;
      px(wx, wy, pal[11], 0.55);
      if (el === 'Light') {
        px(wx - 1, wy, pal[11], 0.25);
        px(wx + 1, wy, pal[11], 0.25);
        px(wx, wy - 1, pal[11], 0.25);
        px(wx, wy + 1, pal[11], 0.25);
      }
    }
  }

  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const v = g[y][x];
      if (!v) {
        // Outline: the darkest tone of whatever it borders, darker underneath.
        const nb = [g[y]?.[x - 1], g[y]?.[x + 1], g[y - 1]?.[x], g[y + 1]?.[x]].find((n) => n);
        if (nb) px(x, y, dark(colorOf(nb), filled(x, y - 1) ? 0.82 : 0.7));
        continue;
      }
      let c = colorOf(v);
      if (v === 4 || v === 5 || v === 7 || v === 8) {
        px(x, y, c);
        continue;
      }
      // Surface normal from the distance field; light from the top-left.
      const gx = D(x + 1, y) - D(x - 1, y);
      const gy = D(x, y + 1) - D(x, y - 1);
      const len = Math.hypot(gx, gy) || 1;
      const ndl = (-gx / len) * LX + (-gy / len) * LY; // outward normal · light
      const d = dist[y][x];
      const edge = Math.max(0, 1 - (d - 1) / 3.2); // 1 at the edge, fading inward
      const lit = ndl * edge;
      if (lit > 0.55) c = light(c, d <= 1.5 ? 0.42 : 0.28);
      else if (lit > 0.2) c = light(c, 0.14);
      else if (lit < -0.6) c = dark(c, d <= 1.5 ? 0.55 : 0.4);
      else if (lit < -0.2) c = dark(c, 0.24);
      // Rim light along the lower-right edge (from the sky behind), so silhouettes pop.
      if (d <= 1.2 && ndl < -0.55 && v === 1) c = mix(c, pal[11], 0.25);
      // Wings and fins are layered: a darker line every few pixels.
      if (v === 2 && (f.back === 'featherwings' || f.back === 'batwings' || f.back === 'fins') && x % 3 === 0 && d > 1) c = dark(c, 0.2);
      // Belly and shell are plated.
      if (v === 3 && y % 3 === 0 && d > 1) c = dark(c, 0.16);
      // Where one part meets another below it, a thin crease.
      const below = g[y + 1]?.[x];
      if (below && below !== v && below !== 4 && below !== 5) c = dark(c, 0.3);
      // Element textures, on the body only.
      if (v === 1) c = texture(el, c, x, y, d, pal, N);
      px(x, y, c);
      // Specular glint high on the body and head.
      if (v === 1 && d >= 2 && d < 3 && ndl > 0.92 && (x + y) % 3 === 0) px(x, y, light(colorOf(1), 0.62));
    }

  // Toxic drips and Shadow smoke under the body.
  if (el === 'Toxic' || el === 'Shadow') {
    for (let x = 0; x < N; x++)
      for (let y = N - 2; y > 0; y--)
        if (g[y][x] && !g[y + 1][x]) {
          if (el === 'Toxic' && hashString(`${speciesId}${stage}${x}`) % 7 === 0) for (let i = 1; i < 2 + (x % 3); i++) px(x, y + i, i === 1 ? pal[10] : pal[11], 1 - i * 0.2);
          if (el === 'Shadow' && hashString(`${speciesId}${stage}${x}s`) % 4 === 0) px(x, y + 2, pal[9], 0.35);
          break;
        }
  }

  drawFace(ctx, f, pal, ox, oy, O, el);
}

/** A subtle surface texture for each element (scales, cracks, rivets, circuits, …). */
function texture(el: Element, c: number, x: number, y: number, d: number, pal: Record<number, number>, N: number): number {
  if (d < 1.5) return c;
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  switch (el) {
    case 'Dragon':
      return (x + (Math.floor(y / 3) % 2) * 2) % 4 === 0 && y % 3 === 0 ? dark(c, 0.14) : c;
    case 'Water':
      return (y + Math.round(Math.sin(x * 0.7) * 1.2)) % 6 === 0 && d > 2 ? light(c, 0.22) : c;
    case 'Earth':
      return h % 47 === 0 ? dark(c, 0.3) : c;
    case 'Metal':
      if (y % 9 === 0) return dark(c, 0.22);
      return y % 9 === 2 && x % 6 === 0 ? light(c, 0.5) : c;
    case 'Storm':
      return h % 41 === 0 ? pal[10] : c;
    case 'Frost':
      return h % 37 === 0 ? light(c, 0.7) : c;
    case 'Fire':
      return h % 31 === 0 && y < N * 0.6 ? mix(c, pal[10], 0.6) : c;
    case 'Nature':
      return h % 29 === 0 ? mix(c, pal[10], 0.5) : c;
    default:
      return c;
  }
}

/** Eyes and mouth, drawn at full resolution. */
function drawFace(ctx: CanvasRenderingContext2D, f: FaceInfo, pal: Record<number, number>, ox: number, oy: number, O: (d: number) => number, el: Element) {
  const N = Math.round(40 * SPRITE2_K);
  const p = (x: number, y: number, c: number, mirror = true) => {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = css(c);
    ctx.fillRect(ox + x, oy + y, 1, 1);
    if (mirror) ctx.fillRect(ox + N - 1 - x, oy + y, 1, 1);
  };
  const white = 0xffffff;
  const pupil = 0x1a1428;
  const glow = pal[7];
  const brow = pal[9];
  const ey = O(f.eyeY);
  const eye = (ex: number, eyY: number, small = false) => {
    if (f.hollow) {
      for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) if (Math.abs(dx - 0.5) + Math.abs(dy - 0.5) < 2.6) p(ex + dx, eyY + dy, brow);
      p(ex + 1, eyY, glow);
      p(ex, eyY + 1, glow);
      p(ex + 1, eyY + 1, 0xffffff);
      return;
    }
    if (f.stage === 0 && !small) {
      // Big round baby eye: white, a large pupil looking inward, a bright glint.
      for (let dy = -2; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) if (!((dy === -2 || dy === 2) && (dx === -1 || dx === 2))) p(ex + dx, eyY + dy, white);
      for (let dy = -1; dy <= 2; dy++) for (let dx = 1; dx <= 2; dx++) if (!(dy === 2 && dx === 2)) p(ex + dx, eyY + dy, pupil);
      p(ex + 1, eyY - 1, white);
      p(ex, eyY - 2, 0xdfe8ff);
    } else if (f.stage === 1 || small) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 2; dx++) if (!(dy === 1 && dx === -1)) p(ex + dx, eyY + dy, white);
      for (let dy = -1; dy <= 1; dy++) p(ex + 2, eyY + dy, pupil);
      p(ex + 1, eyY, pupil);
      p(ex + 1, eyY + 1, pupil);
      p(ex + 2, eyY - 1, white);
      if (!small) for (let dx = -2; dx <= 2; dx++) p(ex + dx, eyY - 2 - (dx < 0 ? 1 : 0), brow);
    } else {
      // Fierce final-form eye: a glowing slit under a heavy, angled brow.
      for (let dx = -2; dx <= 2; dx++) p(ex + dx, eyY, glow);
      for (let dx = -1; dx <= 2; dx++) p(ex + dx, eyY + 1, glow);
      p(ex + 1, eyY, pupil);
      p(ex + 1, eyY + 1, pupil);
      p(ex - 1, eyY, 0xffffff);
      for (let dx = -3; dx <= 3; dx++) p(ex + dx, eyY - 1 - Math.max(0, -dx) * 0.5, brow);
    }
  };
  const left = O(f.cx - f.spread - 1);
  if (f.visor) {
    for (let x = O(f.cx - f.faceR * 0.85); x <= O(f.cx); x++) {
      p(x, ey, glow);
      p(x, ey + 1, glow);
      p(x, ey - 1, brow);
    }
    p(O(f.cx - f.faceR * 0.5), ey, 0xffffff);
  } else if (f.eyes === 1) {
    const ex = O(f.cx) - 2;
    for (let dy = -2; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) p(ex + dx, ey + dy, f.stage === 2 ? glow : white);
    for (let dy = -1; dy <= 1; dy++) p(ex + 2, ey + dy, pupil);
    p(ex + 1, ey - 1, 0xffffff);
  } else {
    eye(left, ey);
    if (f.eyes === 3) {
      const tx = O(f.cx) - 0.5;
      p(tx, ey - 4, f.stage === 2 ? glow : white);
      p(tx, ey - 3, pupil);
    }
    if (f.eyes === 4) eye(O(f.cx - f.spread * 0.6), ey + 4, true);
  }

  const my = O(f.my);
  const mx = O(f.cx);
  const ink = brow;
  const fang = 0xffffff;
  switch (f.mouth) {
    case 'smile':
      p(mx - 3, my - 1, ink);
      p(mx - 2, my, ink);
      p(mx - 1, my, ink);
      p(mx, my, ink);
      break;
    case 'fangs':
      for (let dx = -3; dx <= 0; dx++) p(mx + dx, my, ink);
      p(mx - 2, my + 1, fang);
      p(mx - 2, my + 2, fang);
      break;
    case 'tusks':
      for (let dx = -3; dx <= 0; dx++) p(mx + dx, my, ink);
      for (let i = 0; i < 3 + f.stage; i++) p(mx - 4 - i * 0.4, my - i, pal[6]);
      break;
    case 'mandibles':
      for (let i = 0; i < 3 + f.stage; i++) p(mx - 2 - i * 0.6, my + i * 0.8, pal[6]);
      p(mx - 1, my, ink);
      break;
    case 'jaw':
      for (let dx = -5; dx <= 0; dx++) p(mx + dx, my, ink);
      for (const dx of [-5, -3, -1]) p(mx + dx, my - 1, fang);
      for (const dx of [-4, -2, 0]) p(mx + dx, my + 1, fang);
      break;
    case 'beak':
      for (let dy = -2; dy <= 1 + f.stage; dy++) for (let dx = -2 + Math.max(0, dy); dx <= 0; dx++) p(mx + dx, my + dy, dy > 0 ? pal[6] : mix(pal[6], 0xffffff, 0.3));
      p(mx - 2, my, ink);
      break;
    case 'none':
      break;
  }
  void el;
}
