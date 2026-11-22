import { SPECIES_BY_ID } from '../data/species';
import type { Element } from '../data/types';
import { hashString, Rng } from '../logic/rng';
import { buildGrid, paletteFor, type FaceInfo } from './sprites';

/**
 * Hexbound 2.0 art (style test): the same part plans as today, drawn on a finer grid (56 px) and
 * painted with light and shadow, detailed eyes and mouths, element textures and a signature part
 * per line. Not used by the game yet.
 */

export const SPRITE2_K = 1.6;
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
const SIG_PARTS = ['gem', 'emblem', 'cheeks', 'scarf', 'collar', 'bracers', 'facemark'] as const;
type SigPart = (typeof SIG_PARTS)[number];
export const signaturePart = (speciesId: string): SigPart => SIG_PARTS[hashString(speciesId + ':part') % SIG_PARTS.length];

/** How tall each stage stands in the 64-pixel frame (so every line fills it the same way). */
const STAGE_H = [40, 51, 60];

const bbox = (g: number[][]) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  g.forEach((row, y) => row.forEach((v, x) => {
    if (!v) return;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }));
  return { x0, y0, x1, y1 };
};

/** Scale for this sprite: its stage's height, but never wider than the frame. */
function fitScale(speciesId: string, stage: number): number {
  const b = bbox(buildGrid(speciesId, stage, 1, {}, true) as number[][]);
  const h = b.y1 - b.y0 + 1;
  const w = b.x1 - b.x0 + 1;
  return Math.max(1.2, Math.min(2.8, STAGE_H[stage] / h, (SPRITE2_SIZE - 4) / w));
}

export function paintCreature2(ctx: CanvasRenderingContext2D, speciesId: string, stage: number, ox0 = 0, oy0 = 0, shiny = false) {
  const k = fitScale(speciesId, stage);
  const face: Partial<FaceInfo> = {};
  const g = buildGrid(speciesId, stage, k, face, true) as number[][];
  const f = face as FaceInfo;
  const N = g.length;
  // Centre the creature and stand it on the bottom of the frame.
  const bb = bbox(g);
  const ox = ox0 + Math.round(SPRITE2_SIZE / 2 - (bb.x0 + bb.x1 + 1) / 2);
  const oy = oy0 + (SPRITE2_SIZE - 2 - bb.y1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox0, oy0, SPRITE2_SIZE, SPRITE2_SIZE);
  ctx.clip();
  const { pal } = paletteFor(speciesId, stage, shiny);
  // A near-black belly (from a dark accent) swallows the shading: lift it toward the body colour.
  const lum = (c: number) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);
  if (lum(pal[3]) < 70) pal[3] = light(pal[1], 0.35);
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
    // A few chunky tufts (3 pixels, pointing out) on the shoulders and sides: reads as fur, keeps edges clean.
    let placed = 0;
    for (let y = Math.round(O(f.shoulderY)); y < N - 6 && placed < 3; y += 6)
      for (let x = 1; x < N / 2; x++)
        if (g[y][x] === 1) {
          if (!g[y][x - 1] && !g[y][x - 2]) {
            set(x - 1, y, 1);
            set(x - 2, y - 1, 1);
            set(x - 1, y - 1, 1);
            placed++;
          }
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

  drawFace(ctx, f, pal, ox, oy, O, el, N);
  ctx.restore();
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
function drawFace(ctx: CanvasRenderingContext2D, f: FaceInfo, pal: Record<number, number>, ox: number, oy: number, O: (d: number) => number, el: Element, N: number) {
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
  const iris = pal[10];
  const irisD = dark(iris, 0.45);
  const lineC = dark(pal[1], 0.75);
  const C: Record<string, number> = { o: lineC, l: brow, w: white, i: iris, I: irisD, p: pupil, g: white, s: 0xdfe8ff, G: glow, h: light(glow, 0.5), t: pal[6], f: 0xffffff, m: 0x5a1a2e, n: 0xe0708a, k: brow };
  /** Draw a pixel pattern centred on (cx, cy); mirrored for the other eye. */
  const pat = (rows: string[], cx: number, cy: number, mirror = true) => {
    const x0 = Math.round(cx - rows[0].length / 2);
    const y0 = Math.round(cy - rows.length / 2);
    rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && p(x0 + x, y0 + y, C[ch], mirror)));
  };
  // Eyes, left eye as drawn (the right eye is its mirror, so pupils look inward).
  const BABY = ['.lll...', '.ooooo.', 'owgwiio', 'owwiIpo', 'owiIppo', 'owiIIgo', '.owiio.', '..ooo..'];
  const MID = ['llll...', '..llll.', '.ooooo.', 'owgwiIo', 'owwiIpo', '.owiIo.', '..ooo..'];
  const FIERCE = ['ll.....', '.lll...', '..lllll', 'oGhGGpo', '.oGGGpo', '..oooo.'];
  const SMALL = ['.ooo.', 'owiIo', '.ooo.'];
  const HOLLOW = ['.lll..', 'lllll.', 'llGhl.', 'llhGl.', '.lll..'];
  const ey = O(f.eyeY);
  const eye = (ex: number, eyY: number, small = false) => {
    if (f.hollow) return pat(HOLLOW, ex, eyY);
    if (small) return pat(SMALL, ex, eyY);
    pat(f.stage === 0 ? BABY : f.stage === 1 ? MID : FIERCE, ex, eyY);
  };
  const left = O(f.cx - f.spread - 1) - 0.5;
  if (f.visor) {
    pat(['ooooooooo', 'oGGhGGGGG', 'oGhGGGGGG', 'ooooooooo'], O(f.cx - f.faceR * 0.45), ey);
  } else if (f.eyes === 1) {
    pat(f.stage === 2 ? ['..ooooo..', '.oGGGGGo.', 'oGGhpGGGo', 'oGGppGGGo', '.oGGGGGo.', '..ooooo..'] : ['..ooooo..', '.owwiiio.', 'owgiIIpio', 'owwiIppio', '.owwiiio.', '..ooooo..'], O(f.cx) - 0.5, ey, false);
  } else {
    eye(left, ey);
    if (f.eyes === 3) pat(f.stage === 2 ? ['.o.', 'oGo', 'oho', '.o.'] : ['.o.', 'owo', 'opo', '.o.'], O(f.cx) - 0.5, ey - 6, false);
    if (f.eyes === 4) eye(O(f.cx - f.spread * 0.6) - 0.5, ey + 6, true);
  }

  const my = O(f.my) + 1;
  const mx = O(f.cx) - 0.5;
  switch (f.mouth) {
    case 'smile':
      pat(['k.....k', '.kk.kk.', '...k...'], mx, my, false);
      break;
    case 'fangs':
      pat(['kkkkkkk', '.f...f.', '.f...f.'], mx, my, false);
      break;
    case 'tusks':
      pat(['t.......t', 't.......t', '.t.....t.', '.tkkkkkt.'], mx, my - 1, false);
      break;
    case 'mandibles':
      pat(['t.....t', '.t...t.', '.tt.tt.', '..t.t..'], mx, my, false);
      break;
    case 'jaw':
      pat(['kkkkkkkkk', 'kfmfmfmfk', 'kmmnnnmmk', 'kfmfmfmfk', '.kkkkkkk.'], mx, my, false);
      break;
    case 'beak':
      pat(['.ttttt.', 'tttttkk', '.ttttt.', '..ttt..', '...t...'], mx, my - 1, false);
      break;
    case 'none':
      break;
  }
  void el;
}
