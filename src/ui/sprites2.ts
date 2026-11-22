import { SPECIES_BY_ID } from '../data/species';
import type { Element } from '../data/types';
import { hashString, Rng } from '../logic/rng';
import { DEX_SPECIES } from '../data/legends';
import { LINE_PLANS } from './linePlans';
import { buildGrid, hueShift, paletteFor, shinyHue, type FaceInfo } from './sprites';

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
/** The legendaries fill the whole frame and shimmer. */
const LEGEND_IDS = ['solmane', 'tidecrown', 'umbrawyrm', 'ironvault', 'thornmaw', 'rimeveil'];

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
  const target = LEGEND_IDS.includes(speciesId) ? 62 : STAGE_H[stage];
  return Math.max(1.2, Math.min(2.8, target / h, (SPRITE2_SIZE - 2) / w));
}

/** `back`: the view from behind (the player's side in battle). */
export function paintCreature2(ctx: CanvasRenderingContext2D, speciesId: string, stage: number, ox0 = 0, oy0 = 0, shiny = false, back = false) {
  const k = fitScale(speciesId, stage);
  const face: Partial<FaceInfo> = {};
  const g = buildGrid(speciesId, stage, k, face, true, back) as number[][];
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
  recolour(pal, speciesId, stage, shiny);
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
  switch (back && ['gem', 'emblem', 'cheeks', 'facemark'].includes(part) ? 'none' : part) {
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
  if (el === 'Spirit' || el === 'Light' || LEGEND_IDS.includes(speciesId)) {
    for (let i = 0; i < 4 + stage * 2 + (LEGEND_IDS.includes(speciesId) ? 8 : 0); i++) {
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

  if (!back) drawFace(ctx, f, pal, ox, oy, O, el, N, hashString(speciesId + ':mouth') % 4);
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
function drawFace(ctx: CanvasRenderingContext2D, f: FaceInfo, pal: Record<number, number>, ox: number, oy: number, O: (d: number) => number, el: Element, N: number, mouthVariant = 0) {
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
      // Four kinds of big mouth, so finals don't all share the same toothy box.
      pat(
        [
          ['kkkkkkkkk', 'kfmfmfmfk', 'kmmnnnmmk', 'kfmfmfmfk', '.kkkkkkk.'],
          ['k.......k', '.kkkkkkk.', '.kfmmmfk.', '..f...f..'],
          ['.t.....t.', '.tkkkkkt.', '..kmnmk..', '...kkk...'],
          ['kkkkkkkkk', 'kfkfkfkfk', '.kmmnmmk.', '..kkkkk..'],
        ][mouthVariant],
        mx,
        my,
        false,
      );
      break;
    case 'beak':
      pat(['.ttttt.', 'tttttkk', '.ttttt.', '..ttt..', '...t...'], mx, my - 1, false);
      break;
    case 'none':
      break;
  }
  void el;
}

/**
 * Body colours: each element has a range of tones and its lines are dealt them in turn, so lines of
 * one element look related but distinct (ember red, amber, crimson, gold, … for Fire).
 */
const TONES: Record<Element, number[]> = {
  Fire: [0xe8553a, 0xf08a3c, 0xc93a52, 0xf2b441, 0xb8452d, 0xff7a5c, 0xd9602a, 0xa83248],
  Water: [0x3f7fe0, 0x2fb3d6, 0x4a5fd1, 0x2a9d9f, 0x6aa8ff, 0x3550a8, 0x45c4c0, 0x5a7ac8],
  Nature: [0x58b84a, 0x8cc63f, 0x2f9e6a, 0x6e9b3a, 0xa7c957, 0x3c8f4e, 0x7fb86a, 0x4aa38a],
  Earth: [0xb08850, 0x9c6b3f, 0xc9a66b, 0x8a7a55, 0xb5653a, 0x7d6a4f, 0xa89060, 0x8e5a40],
  Storm: [0xe8c83a, 0xf2e05a, 0xd4a72c, 0xb7d24a, 0x8aa0c8, 0xf0b030, 0x9ab8e0, 0xd8d070],
  Frost: [0x8fd3e8, 0x6fb8d9, 0xb4c8f0, 0x7fd6c8, 0xa8a8e8, 0xc8e4f0, 0x5aa8c8, 0x9ad0b8],
  Metal: [0x9aa4b0, 0x7e8a9c, 0xb08a5a, 0xc07a50, 0x6c7a8a, 0xc8b46a, 0x8a9aa0, 0xa0a8c0],
  Toxic: [0x9a4fd0, 0x7bc043, 0xc04fb0, 0x6a3fb0, 0xa8d040, 0x5fb090, 0xb070e0, 0x8a3a90],
  Shadow: [0x5a4a8a, 0x3e3a5c, 0x6a3a6e, 0x34506e, 0x4a4458, 0x7a4a9a, 0x5a3048, 0x2e3e58],
  Light: [0xf0c050, 0xf8e8a8, 0xf8d880, 0xffc0c8, 0xe8dcb8, 0xffd27a, 0xf0a868, 0xfff0d0],
  Spirit: [0xd07ac8, 0xa88ae0, 0x7ac8d0, 0xe8a0c8, 0x8a7ad0, 0xc0a0f0, 0x9ad8c0, 0xb06aa0],
  Dragon: [0xc0384a, 0x2f8a6a, 0x6a4ac0, 0xd06a2a, 0x3a6ab0, 0x8a2a3a, 0x4a9a50, 0xb0485a],
};
/** The legendaries' colours are chosen to match their designs. */
const LEGEND_TONES: Record<string, [number, number]> = {
  solmane: [0xf2b441, 0xe8553a],
  tidecrown: [0x2a5fb8, 0xf2d04a],
  umbrawyrm: [0x2e2a48, 0xc0384a],
  ironvault: [0x6c7a8a, 0xc8b46a],
  thornmaw: [0x3c8f4e, 0xc04fb0],
  rimeveil: [0xb4d8f0, 0xa88ae0],
};

const toneIndex = new Map<string, number>();
function toneOf(speciesId: string): number {
  if (!toneIndex.size) {
    const seen: Record<string, number> = {};
    for (const s of DEX_SPECIES) {
      const e = s.types[0];
      seen[e] = (seen[e] ?? 0) + 1;
      toneIndex.set(s.id, seen[e] - 1);
    }
  }
  return toneIndex.get(speciesId) ?? hashString(speciesId) % 8;
}

function recolour(pal: Record<number, number>, speciesId: string, stage: number, shiny: boolean) {
  const [t1, t2] = SPECIES_BY_ID[speciesId].types;
  const i = toneOf(speciesId);
  const legend = LEGEND_TONES[speciesId];
  let base = legend ? legend[0] : (LINE_PLANS[speciesId]?.color ?? TONES[t1][i % 8]);
  let sec = legend ? legend[1] : t1 === t2 ? dark(TONES[t1][(i + 4) % 8], 0.28) : TONES[t2][(i * 3 + 1) % 8];
  // Babies a touch lighter, finals a touch deeper.
  base = stage === 0 ? light(base, 0.1) : stage === 2 ? dark(base, 0.14) : base;
  if (stage === 2) sec = dark(sec, 0.06);
  const deg = shiny ? shinyHue(speciesId) : 0;
  const sh = (c: number) => (shiny ? hueShift(c, deg) : c);
  pal[1] = sh(base);
  pal[2] = sh(sec);
  pal[3] = sh(stage === 2 ? light(mix(base, sec, 0.35), 0.22) : light(base, 0.4));
  pal[9] = sh(dark(base, 0.78));
}
