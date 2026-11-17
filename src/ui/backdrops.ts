import Phaser from 'phaser';
import type { Element } from '../data/types';
import { ELEMENT_COLORS } from '../data/types';
import { hashString, Rng } from '../logic/rng';

/**
 * Painted backgrounds, drawn in code as chunky pixel art (one backdrop pixel = PX board units):
 *  - battle scenes: a small environment for each element (volcano, tundra, forest, ...) with its
 *    own weather (embers, snow, leaves, rain, ...);
 *  - menus: a quiet drifting-hex pattern so big empty areas aren't flat.
 * Every painting is cached as a texture per element and board size, so it is made once.
 */

const PX = 3;

const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

type Ridge = 'peaks' | 'hills' | 'mesas' | 'dunes' | 'volcano' | 'none';
type Prop = 'pine' | 'tree' | 'deadTree' | 'pillar' | 'ruin' | 'crystal' | 'mushroom' | 'grave' | 'stack' | 'rib' | 'rock' | 'spire' | 'arch' | 'cloud';
type Floor = 'grass' | 'lava' | 'snow' | 'sand' | 'mud' | 'plates' | 'tiles' | 'beach' | 'stone' | 'mist';
type Weather = 'embers' | 'snow' | 'leaves' | 'dust' | 'rain' | 'bubbles' | 'sparks' | 'spores' | 'motes' | 'glints' | 'wisps' | 'ash';

interface Theme {
  /** Sky color at the top and at the horizon. */
  sky: [number, number];
  orb?: { kind: 'sun' | 'moon'; color: number; x: number; y: number; r: number };
  stars?: boolean;
  /** Far range on the horizon: shape, color, height (backdrop pixels), snow caps. */
  far: { ridge: Ridge; color: number; h: number; cap?: number };
  /** Props standing on the horizon in front of the range. */
  mid: { prop: Prop; color: number; n: number; size: number };
  /** Ground color at the horizon and at the bottom; detail color. */
  ground: [number, number];
  detail: number;
  floor: Floor;
  /** Pad under each creature: top and rim. */
  pad: [number, number];
  weather: Weather;
  flash?: boolean;
  /** Fog over the horizon (0-1). */
  haze?: number;
  /** Snow-cap color (dimmed at dusk and night). */
  capColor?: number;
}

const THEMES: Record<Element, Theme> = {
  Fire: {
    sky: [0x2a0a12, 0xc8462a],
    orb: { kind: 'sun', color: 0xffb04a, x: 0.78, y: 0.55, r: 9 },
    far: { ridge: 'volcano', color: 0x3a1418, h: 34 },
    mid: { prop: 'spire', color: 0x24101a, n: 6, size: 14 },
    ground: [0x4a1e1e, 0x1e0c10],
    detail: 0xff7a2a,
    floor: 'lava',
    pad: [0x5a2a24, 0x2a1014],
    weather: 'embers',
  },
  Frost: {
    sky: [0x5a8ad0, 0xd8f0ff],
    orb: { kind: 'sun', color: 0xffffff, x: 0.2, y: 0.4, r: 6 },
    far: { ridge: 'peaks', color: 0x7a9ac8, h: 30, cap: 8 },
    mid: { prop: 'pine', color: 0x3a5a7a, n: 7, size: 13 },
    ground: [0xd8ecff, 0x9ab8e0],
    detail: 0xffffff,
    floor: 'snow',
    pad: [0xeef8ff, 0x8aa8d0],
    weather: 'snow',
  },
  Nature: {
    sky: [0x4aa0e8, 0xbfe8d8],
    orb: { kind: 'sun', color: 0xfff2a0, x: 0.82, y: 0.3, r: 8 },
    far: { ridge: 'hills', color: 0x4a9a6a, h: 18 },
    mid: { prop: 'tree', color: 0x2a6a3a, n: 7, size: 14 },
    ground: [0x6ac85a, 0x2e7a34],
    detail: 0x2a6a2a,
    floor: 'grass',
    pad: [0x8ad86a, 0x3a7a34],
    weather: 'leaves',
  },
  Earth: {
    sky: [0xc87a4a, 0xf0c88a],
    orb: { kind: 'sun', color: 0xfff0c0, x: 0.25, y: 0.5, r: 8 },
    far: { ridge: 'mesas', color: 0xa85a3a, h: 26 },
    mid: { prop: 'rock', color: 0x7a4a2e, n: 5, size: 9 },
    ground: [0xd8a46a, 0x9a6a3e],
    detail: 0x7a4a2a,
    floor: 'sand',
    pad: [0xc8935a, 0x7a5232],
    weather: 'dust',
  },
  Storm: {
    sky: [0x1a1e30, 0x5a6278],
    far: { ridge: 'peaks', color: 0x2a3040, h: 24 },
    mid: { prop: 'cloud', color: 0x3a4258, n: 5, size: 12 },
    ground: [0x4a5a4a, 0x22281e],
    detail: 0x7a8a6a,
    floor: 'grass',
    pad: [0x5a6a58, 0x2a3228],
    weather: 'rain',
    flash: true,
  },
  Water: {
    sky: [0x3a8ae0, 0xb8e8ff],
    orb: { kind: 'sun', color: 0xfffae0, x: 0.7, y: 0.35, r: 7 },
    far: { ridge: 'hills', color: 0x5a8ab8, h: 9 },
    mid: { prop: 'cloud', color: 0xffffff, n: 4, size: 12 },
    ground: [0x2a7ad0, 0xe8d49a],
    detail: 0xffffff,
    floor: 'beach',
    pad: [0xf0dca8, 0xa8925a],
    weather: 'bubbles',
  },
  Metal: {
    sky: [0x3a3e4a, 0x9a9aa0],
    far: { ridge: 'none', color: 0x4a4e5a, h: 0 },
    mid: { prop: 'stack', color: 0x2e323c, n: 6, size: 26 },
    ground: [0x7a808c, 0x3a3e48],
    detail: 0x2a2e36,
    floor: 'plates',
    pad: [0xa9b6c6, 0x5a6270],
    weather: 'sparks',
  },
  Toxic: {
    sky: [0x2a1a3a, 0x7a8a4a],
    far: { ridge: 'hills', color: 0x3a2a4a, h: 14 },
    mid: { prop: 'deadTree', color: 0x22182a, n: 6, size: 18 },
    ground: [0x4a5a2a, 0x22281a],
    detail: 0x9ae04a,
    floor: 'mud',
    pad: [0x6a4a8a, 0x3a2650],
    weather: 'spores',
  },
  Shadow: {
    sky: [0x08060e, 0x2a2040],
    orb: { kind: 'moon', color: 0xd8d0f0, x: 0.75, y: 0.3, r: 9 },
    stars: true,
    far: { ridge: 'none', color: 0x1a1428, h: 0 },
    mid: { prop: 'ruin', color: 0x140f20, n: 5, size: 26 },
    ground: [0x2a2238, 0x0e0a16],
    detail: 0x4a3e6a,
    floor: 'stone',
    pad: [0x3a3050, 0x1a1428],
    weather: 'motes',
  },
  Light: {
    sky: [0xffd88a, 0xfff8e8],
    orb: { kind: 'sun', color: 0xffffff, x: 0.5, y: 0.4, r: 12 },
    far: { ridge: 'none', color: 0xffffff, h: 0 },
    mid: { prop: 'pillar', color: 0xd8c08a, n: 6, size: 24 },
    ground: [0xfff4dc, 0xd8c08a],
    detail: 0xc8a860,
    floor: 'tiles',
    pad: [0xfffaf0, 0xc8b07a],
    weather: 'glints',
  },
  Spirit: {
    sky: [0x1a1438, 0x6a4a8a],
    orb: { kind: 'moon', color: 0xfff0ff, x: 0.25, y: 0.35, r: 10 },
    stars: true,
    far: { ridge: 'hills', color: 0x2e2450, h: 16 },
    mid: { prop: 'grave', color: 0x3a3060, n: 7, size: 8 },
    ground: [0x3a3a6a, 0x1a1830],
    detail: 0x8a7ac8,
    floor: 'mist',
    pad: [0x5a4a8a, 0x2a2048],
    weather: 'wisps',
  },
  Dragon: {
    sky: [0x3a0a1a, 0xe0603a],
    orb: { kind: 'sun', color: 0xffd080, x: 0.3, y: 0.7, r: 13 },
    far: { ridge: 'peaks', color: 0x4a1424, h: 38 },
    mid: { prop: 'spire', color: 0x2a0a14, n: 7, size: 18 },
    ground: [0x6a2a24, 0x2a0e12],
    detail: 0xa04a3a,
    floor: 'stone',
    pad: [0x8a3a30, 0x3a1416],
    weather: 'ash',
  },
};

/** One-color pixel used by every backdrop's weather. */
function ensurePixel(scene: Phaser.Scene) {
  if (scene.textures.exists('bd-px')) return 'bd-px';
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff).fillRect(0, 0, PX, PX);
  g.generateTexture('bd-px', PX, PX);
  g.destroy();
  return 'bd-px';
}

/** Heights of a mountain range along the horizon (how far above it each column reaches). */
function ridge(rng: Rng, w: number, kind: Ridge, h: number): number[] {
  const out = new Array<number>(w).fill(0);
  if (kind === 'none') return out;
  if (kind === 'peaks' || kind === 'volcano') {
    const peaks: { x: number; h: number; s: number }[] = [];
    if (kind === 'volcano') peaks.push({ x: w * 0.38, h, s: 1.1 });
    for (let x = -10; x < w + 10; x += rng.int(10, 22)) peaks.push({ x, h: h * (kind === 'volcano' ? 0.35 : 0.45 + rng.next() * 0.55), s: 0.8 + rng.next() * 0.9 });
    for (let x = 0; x < w; x++) {
      let best = 0;
      for (const p of peaks) best = Math.max(best, p.h - Math.abs(x - p.x) * p.s);
      out[x] = best + (rng.next() < 0.3 ? 1 : 0);
    }
    if (kind === 'volcano') {
      // Flatten the big cone's top into a crater.
      const cx = Math.round(w * 0.38);
      for (let x = cx - 5; x <= cx + 5; x++) if (x >= 0 && x < w) out[x] = h - 4;
    }
    return out;
  }
  if (kind === 'hills' || kind === 'dunes') {
    const f1 = 0.03 + rng.next() * 0.02;
    const f2 = 0.08 + rng.next() * 0.04;
    const p1 = rng.next() * 6;
    const p2 = rng.next() * 6;
    for (let x = 0; x < w; x++) {
      const v = 0.5 + 0.35 * Math.sin(x * f1 + p1) + 0.15 * Math.sin(x * f2 + p2);
      out[x] = Math.round(h * (kind === 'dunes' ? Math.abs(v) : v));
    }
    return out;
  }
  // Mesas: flat tops with steep sides.
  let x = 0;
  while (x < w) {
    const len = rng.int(8, 26);
    const top = rng.next() < 0.6 ? Math.round(h * (0.5 + rng.next() * 0.5)) : Math.round(h * rng.next() * 0.3);
    for (let i = 0; i < len && x < w; i++, x++) out[x] = top;
  }
  for (let i = 1; i < w; i++) if (out[i] < out[i - 1] - 2) out[i] = out[i - 1] - 2; // a little slope going down
  return out;
}

/** Draw one prop standing on the ground at (x, base). */
function prop(g: Phaser.GameObjects.Graphics, rng: Rng, kind: Prop, x: number, base: number, s: number, color: number) {
  const dark = mix(color, 0x000000, 0.35);
  const light = mix(color, 0xffffff, 0.25);
  const r = (px: number, py: number, w: number, h: number, c = color) => g.fillStyle(c).fillRect(Math.round(px), Math.round(py), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  switch (kind) {
    case 'pine': {
      r(x - 1, base - 3, 2, 3, dark);
      for (let i = 0; i < s - 3; i++) {
        const w = Math.max(1, Math.round(((i + 2) / (s - 1)) * s * 0.55));
        r(x - w / 2, base - s + i, w, 1, i % 4 === 0 ? 0xffffff : color);
      }
      break;
    }
    case 'tree': {
      r(x - 1, base - s * 0.45, 2, s * 0.45, 0x5a3a24);
      const rad = s * 0.4;
      for (let dy = -rad; dy <= rad; dy++) {
        const w = 2 * Math.sqrt(rad * rad - dy * dy);
        r(x - w / 2, base - s * 0.55 + dy, w, 1, dy < -rad / 3 ? light : color);
      }
      break;
    }
    case 'deadTree': {
      r(x - 1, base - s, 2, s, color);
      for (let i = 0; i < 3; i++) {
        const by = base - s * (0.4 + i * 0.2);
        const dir = i % 2 ? 1 : -1;
        for (let j = 0; j < s * 0.3; j++) r(x + dir * (j + 1), by - j * 0.6, 1, 1, color);
      }
      break;
    }
    case 'pillar': {
      r(x - 3, base - s, 6, s, color);
      r(x - 4, base - s - 1, 8, 2, light);
      r(x - 4, base - 2, 8, 2, light);
      r(x + 1, base - s + 1, 1, s - 3, dark);
      break;
    }
    case 'ruin': {
      // A broken tower with a window.
      const h = s * (0.5 + rng.next() * 0.5);
      const w = 5 + rng.int(0, 4);
      r(x - w / 2, base - h, w, h, color);
      for (let i = 0; i < w; i += 2) r(x - w / 2 + i, base - h - (i % 4 ? 1 : 2), 1, 2, color);
      r(x - 1, base - h * 0.7, 2, 3, 0x4a3a7a);
      break;
    }
    case 'crystal': {
      for (let i = 0; i < s; i++) {
        const w = Math.max(1, Math.round((1 - Math.abs(i - s * 0.25) / s) * 4));
        r(x - w / 2, base - s + i, w, 1, i < s / 3 ? light : color);
      }
      break;
    }
    case 'mushroom': {
      r(x - 1, base - s * 0.6, 2, s * 0.6, 0xe8dcc8);
      r(x - s / 2, base - s * 0.8, s, s * 0.25, color);
      r(x - s / 2 + 1, base - s * 0.9, s - 2, s * 0.15, color);
      r(x - 1, base - s * 0.75, 1, 1, 0xffffff);
      break;
    }
    case 'grave': {
      r(x - 2, base - s, 4, s, color);
      r(x - 3, base - s + 1, 6, s - 1, color);
      r(x - 1, base - s + 2, 2, 1, light);
      r(x - 1, base - s + 1, 1, 3, light);
      break;
    }
    case 'stack': {
      // A factory block with a smokestack.
      const h = s * (0.3 + rng.next() * 0.3);
      const w = 8 + rng.int(0, 6);
      r(x - w / 2, base - h, w, h, color);
      r(x + w / 2 - 4, base - s, 3, s - h + 1, color);
      r(x + w / 2 - 5, base - s, 5, 1, dark);
      for (let i = 2; i < w - 2; i += 3) r(x - w / 2 + i, base - h + 2, 1, 2, 0xffc94d);
      break;
    }
    case 'rib': {
      // A giant bone arching out of the ground.
      for (let i = 0; i <= s; i++) {
        const t = i / s;
        r(x + Math.round(Math.sin(t * Math.PI) * s * 0.4) - i * 0.15, base - i, 2, 1, i % 5 === 0 ? dark : color);
      }
      break;
    }
    case 'rock': {
      for (let dy = 0; dy < s * 0.7; dy++) {
        const w = s * (1 - (dy / (s * 0.7)) ** 2);
        r(x - w / 2, base - dy, w, 1, dy > s * 0.4 ? light : color);
      }
      break;
    }
    case 'spire': {
      const h = s * (0.5 + rng.next() * 0.7);
      for (let i = 0; i < h; i++) r(x - (1 - i / h) * 2.5, base - i, Math.max(1, (1 - i / h) * 5), 1, color);
      break;
    }
    case 'arch': {
      r(x - s / 2, base - s, 2, s, color);
      r(x + s / 2 - 2, base - s, 2, s, color);
      r(x - s / 2 - 1, base - s, s + 2, 2, color);
      break;
    }
    case 'cloud': {
      const y = base - s * 2.6 - rng.int(0, s);
      r(x - s, y, s * 2, 3, color);
      r(x - s * 0.6, y - 2, s * 1.1, 2, color);
      r(x - s * 0.2, y - 4, s * 0.6, 2, color);
      break;
    }
  }
}

// ---------------------------------------------------------------- stage variants

type Mood = 'day' | 'dusk' | 'night' | 'fog';

/** Times of day each element can have ('day' is the theme as drawn above). */
const MOODS: Record<Element, Mood[]> = {
  Fire: ['day', 'dusk', 'night'],
  Frost: ['day', 'dusk', 'night', 'fog'],
  Nature: ['day', 'dusk', 'night', 'fog'],
  Earth: ['day', 'dusk', 'night'],
  Storm: ['day', 'fog', 'night'],
  Water: ['day', 'dusk', 'night', 'fog'],
  Metal: ['day', 'dusk', 'night', 'fog'],
  Toxic: ['day', 'fog', 'night'],
  Shadow: ['day', 'fog', 'dusk'],
  Light: ['day', 'dusk', 'fog'],
  Spirit: ['day', 'fog', 'dusk'],
  Dragon: ['day', 'dusk', 'night'],
};

/** A second set of props and a second range shape for each element. */
const ALT: Record<Element, { mid: Theme['mid']; ridge: Ridge }> = {
  Fire: { mid: { prop: 'rock', color: 0x2a1418, n: 5, size: 10 }, ridge: 'peaks' },
  Frost: { mid: { prop: 'crystal', color: 0x8ac8f0, n: 6, size: 14 }, ridge: 'hills' },
  Nature: { mid: { prop: 'pine', color: 0x2a5a34, n: 8, size: 15 }, ridge: 'peaks' },
  Earth: { mid: { prop: 'arch', color: 0x8a4a2e, n: 3, size: 14 }, ridge: 'dunes' },
  Storm: { mid: { prop: 'deadTree', color: 0x1a1e28, n: 6, size: 16 }, ridge: 'mesas' },
  Water: { mid: { prop: 'rock', color: 0x4a5a6a, n: 4, size: 10 }, ridge: 'none' },
  Metal: { mid: { prop: 'pillar', color: 0x4a4e5a, n: 7, size: 22 }, ridge: 'mesas' },
  Toxic: { mid: { prop: 'mushroom', color: 0x8a3ac8, n: 7, size: 10 }, ridge: 'peaks' },
  Shadow: { mid: { prop: 'grave', color: 0x1a1428, n: 8, size: 9 }, ridge: 'peaks' },
  Light: { mid: { prop: 'arch', color: 0xd8c08a, n: 3, size: 20 }, ridge: 'hills' },
  Spirit: { mid: { prop: 'arch', color: 0xb83a5a, n: 3, size: 16 }, ridge: 'peaks' },
  Dragon: { mid: { prop: 'rock', color: 0x3a1018, n: 5, size: 11 }, ridge: 'volcano' },
};

/** What a stage number means: its time of day, which props and range, and which way it faces. */
function stageParts(el: Element, stage: number) {
  const moods = MOODS[el];
  return { mood: moods[stage % moods.length], alt: ((stage >> 4) & 1) === 1, ridgeAlt: ((stage >> 5) & 1) === 1, flip: ((stage >> 6) & 1) === 1 };
}

const lastStage: { el?: Element; mood?: Mood } = {};

/**
 * Pick a stage for a new battle: a random layout, and never the same time of day as the battle
 * before it in the same element, so back-to-back fights look different.
 */
export function pickStage(el: Element): number {
  let stage = 0;
  for (let i = 0; i < 20; i++) {
    stage = (Math.random() * 2 ** 30) | 0;
    if (lastStage.el !== el || stageParts(el, stage).mood !== lastStage.mood) break;
  }
  lastStage.el = el;
  lastStage.mood = stageParts(el, stage).mood;
  return stage;
}

/** An element's theme as it looks on one stage. */
function themeFor(el: Element, stage: number): Theme {
  const base = THEMES[el];
  const { mood, alt, ridgeAlt, flip } = stageParts(el, stage);
  const t: Theme = { ...base, far: { ...base.far }, mid: alt ? ALT[el].mid : base.mid, orb: base.orb && { ...base.orb } };
  if (ridgeAlt) {
    t.far.ridge = ALT[el].ridge;
    if (t.far.ridge !== 'none' && !t.far.h) t.far.h = 20;
    if (t.far.ridge === 'none' || t.far.ridge === 'hills' || t.far.ridge === 'dunes') t.far.cap = undefined;
    if (t.far.ridge === 'none' && el === 'Water') t.far.h = 0;
  }
  if (t.orb && flip) t.orb.x = 1 - t.orb.x;
  const tint = (c: number, to: number, a: number) => mix(c, to, a);
  if (mood === 'dusk') {
    t.sky = [tint(base.sky[0], 0x2a1840, 0.55), tint(base.sky[1], 0xff8a4a, 0.55)];
    t.orb = { kind: 'sun', color: 0xffa060, x: t.orb?.x ?? 0.7, y: 0.88, r: 11 };
    t.far.color = tint(t.far.color, 0x3a1a2a, 0.4);
    t.capColor = 0xf8c8b0;
    t.mid = { ...t.mid, color: tint(t.mid.color, 0x2a1020, 0.35) };
    t.ground = [tint(base.ground[0], 0x4a2030, 0.3), tint(base.ground[1], 0x2a1020, 0.3)];
  } else if (mood === 'night') {
    t.sky = [tint(base.sky[0], 0x04040c, 0.75), tint(base.sky[1], 0x1a1a40, 0.7)];
    t.stars = true;
    t.orb = { kind: 'moon', color: 0xe8e8ff, x: t.orb?.x ?? 0.75, y: 0.3, r: 8 };
    t.far.color = tint(t.far.color, 0x0a0a1a, 0.55);
    t.capColor = 0x8a94b8;
    t.mid = { ...t.mid, color: tint(t.mid.color, 0x0a0a1a, 0.45) };
    t.ground = [tint(base.ground[0], 0x10102a, 0.55), tint(base.ground[1], 0x08081a, 0.5)];
    t.pad = [tint(base.pad[0], 0x10102a, 0.4), tint(base.pad[1], 0x08081a, 0.4)];
  } else if (mood === 'fog') {
    const fogC = 0xc8c8d4;
    t.sky = [tint(base.sky[0], fogC, 0.45), tint(base.sky[1], fogC, 0.6)];
    if (t.orb) t.orb = { ...t.orb, color: tint(t.orb.color, fogC, 0.5), r: t.orb.r + 2 };
    t.far.color = tint(t.far.color, t.sky[1], 0.6);
    t.mid = { ...t.mid, color: tint(t.mid.color, t.sky[1], 0.35) };
    t.ground = [tint(base.ground[0], fogC, 0.3), base.ground[1]];
    t.haze = 0.5;
  }
  // A sun or moon on the left would hide behind the enemy's panel: keep it lower there.
  if (t.orb && t.orb.x < 0.65) t.orb.y = Math.max(t.orb.y, 0.62);
  return t;
}

/** Paint the still part of a stage (sky, range, props, ground) into a texture. */
function paint(scene: Phaser.Scene, el: Element, stage: number, bw: number, bh: number, horizon: number, fieldH: number): string {
  const key = `bd:${el}:${stage}:${bw}x${bh}:${horizon}:${fieldH}`;
  if (scene.textures.exists(key)) return key;
  // Keep only the newest few stage paintings.
  const old = scene.textures.getTextureKeys().filter((k) => k.startsWith('bd:'));
  for (const k of old.slice(0, Math.max(0, old.length - 3))) scene.textures.remove(k);
  const t = themeFor(el, stage);
  const rng = new Rng(hashString(`backdrop:${el}:${stage}`));
  const w = Math.ceil(bw / PX);
  const h = Math.ceil(bh / PX);
  const hz = Math.round(horizon / PX);
  const g = scene.make.graphics({}, false);

  // Sky in bands (pixel-art gradient).
  const bands = 10;
  for (let i = 0; i < bands; i++) {
    const y0 = Math.floor((hz * i) / bands);
    const y1 = Math.floor((hz * (i + 1)) / bands);
    g.fillStyle(mix(t.sky[0], t.sky[1], i / (bands - 1))).fillRect(0, y0, w, y1 - y0);
  }
  if (t.stars) {
    for (let i = 0; i < w / 3; i++) g.fillStyle(0xffffff, 0.3 + rng.next() * 0.6).fillRect(rng.int(0, w), rng.int(0, Math.round(hz * 0.8)), 1, 1);
  }
  if (t.orb) {
    const { color, r } = t.orb;
    const ox = Math.round(w * t.orb.x);
    const oy = Math.round(hz * t.orb.y);
    // Glow rings, then the disc (the moon gets a bite taken out of it).
    for (const [rr, a] of [[r + 6, 0.12], [r + 3, 0.2]] as const) g.fillStyle(color, a).fillCircle(ox, oy, rr);
    g.fillStyle(color).fillCircle(ox, oy, r);
    if (t.orb.kind === 'moon') g.fillStyle(mix(t.sky[0], t.sky[1], (oy / hz) * 0.9)).fillCircle(ox + r * 0.45, oy - r * 0.3, r * 0.85);
  }

  // Far range (with snow caps or a glowing crater), then a hazier copy of the sky's color on it.
  const far = ridge(rng, w, t.far.ridge, t.far.h);
  for (let x = 0; x < w; x++) {
    const top = hz - far[x];
    if (far[x] <= 0) continue;
    g.fillStyle(t.far.color).fillRect(x, top, 1, far[x]);
    if (t.far.cap && far[x] > t.far.h * 0.55) g.fillStyle(t.capColor ?? 0xf4fbff).fillRect(x, top, 1, Math.min(t.far.cap, far[x] - Math.round(t.far.h * 0.5)));
  }
  if (t.far.ridge === 'volcano') {
    const cx = Math.round(w * 0.38);
    g.fillStyle(0xffb04a).fillRect(cx - 5, hz - t.far.h + 4, 11, 2);
    for (let i = 0; i < 18; i++) {
      // Lava running down the cone.
      const side = i % 2 ? 1 : -1;
      g.fillStyle(i < 9 ? 0xff7a2a : 0xd8442a).fillRect(cx + side * (3 + i * 0.9), hz - t.far.h + 5 + i, 1, 1);
    }
    for (let i = 0; i < 6; i++) g.fillStyle(0x3a2a2a, 0.5).fillCircle(cx + i * 2, hz - t.far.h - 2 - i * 3, 2 + i);
  }

  // Ground: bands from the horizon to the bottom.
  const gb = 12;
  for (let i = 0; i < gb; i++) {
    const y0 = hz + Math.floor(((h - hz) * i) / gb);
    const y1 = hz + Math.floor(((h - hz) * (i + 1)) / gb);
    g.fillStyle(mix(t.ground[0], t.ground[1], i / (gb - 1))).fillRect(0, y0, w, y1 - y0);
  }
  floor(g, rng, t, w, h, hz, Math.round(fieldH / PX));

  // Props along the horizon, back to front.
  const spots = Array.from({ length: t.mid.n }, (_, i) => ((i + 0.3 + rng.next() * 0.4) / t.mid.n) * w);
  for (const x of spots) prop(g, rng, t.mid.prop, x, hz + rng.int(0, 2), t.mid.size * (0.7 + rng.next() * 0.5), t.mid.color);
  if (t.haze) {
    // Fog: thickest on the horizon, thinning toward you.
    for (let i = 0; i < 10; i++) g.fillStyle(0xe8e8f0, t.haze * (1 - i / 10) * 0.45).fillRect(0, hz - 6 + i * 3, w, 3);
  }

  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

/** Ground detail for each kind of floor. */
function floor(g: Phaser.GameObjects.Graphics, rng: Rng, t: Theme, w: number, h: number, hz: number, fh: number) {
  const d = t.detail;
  const n = Math.round((w * (h - hz)) / 40);
  const y = (bias = 1.6) => hz + 1 + Math.floor((h - hz - 1) * rng.next() ** (1 / bias));
  switch (t.floor) {
    case 'grass':
      for (let i = 0; i < n; i++) {
        const yy = y();
        const big = yy > hz + (fh - hz) * 0.4;
        g.fillStyle(d).fillRect(rng.int(0, w), yy, 1, big ? 2 : 1);
      }
      if (t.weather === 'leaves')
        for (let i = 0; i < n / 8; i++) g.fillStyle([0xffffff, 0xffd84a, 0xf08ac0][i % 3]).fillRect(rng.int(0, w), y(), 1, 1);
      break;
    case 'lava':
      for (let i = 0; i < 14; i++) {
        let x = rng.int(0, w);
        let yy = y();
        for (let j = 0; j < 12; j++) {
          g.fillStyle(j < 4 ? 0xffd04a : d).fillRect(x, yy, 2, 1);
          x += rng.int(-1, 2);
          yy += rng.int(0, 1);
        }
      }
      for (let i = 0; i < n / 3; i++) g.fillStyle(0x0e0608).fillRect(rng.int(0, w), y(), 2, 1);
      break;
    case 'snow':
      for (let i = 0; i < n / 2; i++) g.fillStyle(d).fillRect(rng.int(0, w), y(), 1, 1);
      for (let i = 0; i < 10; i++) g.fillStyle(0x9ab8e0, 0.5).fillRect(rng.int(0, w), y(), rng.int(6, 16), 1);
      break;
    case 'sand':
      for (let i = 0; i < n / 2; i++) g.fillStyle(d, 0.6).fillRect(rng.int(0, w), y(), 1, 1);
      for (let i = 0; i < 8; i++) prop(g, rng, 'rock', rng.int(0, w), y(), rng.int(2, 4), 0x9a6a42);
      break;
    case 'mud':
      for (let i = 0; i < 9; i++) {
        const px = rng.int(0, w);
        const py = y();
        const pw = rng.int(6, 16);
        g.fillStyle(0x5a8a2a).fillRect(px, py, pw, 2);
        g.fillStyle(d).fillRect(px + 1, py, pw - 2, 1);
      }
      for (let i = 0; i < 6; i++) prop(g, rng, 'mushroom', rng.int(0, w), y(), rng.int(4, 7), 0xb45cff);
      break;
    case 'plates':
    case 'tiles': {
      // Seams in perspective: rows get farther apart toward you; columns fan out from the middle.
      const vx = w / 2;
      for (let k = 1; hz + k * k * 0.9 < h; k++) g.fillStyle(d, 0.7).fillRect(0, Math.round(hz + k * k * 0.9), w, 1);
      for (let k = -12; k <= 12; k++) {
        const x0 = vx + k * 4;
        for (let yy = hz; yy < h; yy++) {
          const tt = (yy - hz) / (h - hz);
          g.fillStyle(d, 0.6).fillRect(Math.round(x0 + (x0 - vx) * tt * 6), yy, 1, 1);
        }
      }
      if (t.floor === 'plates') for (let i = 0; i < n / 6; i++) g.fillStyle(0xc8ccd8).fillRect(rng.int(0, w), y(), 1, 1);
      break;
    }
    case 'beach': {
      // Sea from the horizon, then foam, wet sand and dry sand.
      const shore = hz + Math.round((fh - hz) * 0.22);
      for (let yy = hz; yy < shore; yy++) g.fillStyle(mix(0x3a8ae0, 0x5ac0e8, (yy - hz) / (shore - hz))).fillRect(0, yy, w, 1);
      for (let i = 0; i < 26; i++) g.fillStyle(0xffffff, 0.7).fillRect(rng.int(0, w), rng.int(hz + 1, shore - 2), rng.int(2, 6), 1);
      for (let x = 0; x < w; x++) {
        const fy = shore + Math.round(Math.sin(x * 0.15) * 1.5);
        g.fillStyle(0xffffff).fillRect(x, fy - 1, 1, 2);
        g.fillStyle(0xc8b07a).fillRect(x, fy + 1, 1, 3);
      }
      for (let i = 0; i < n / 3; i++) g.fillStyle(0xc8b07a).fillRect(rng.int(0, w), rng.int(shore + 5, h), 1, 1);
      for (let i = 0; i < 4; i++) g.fillStyle(0xf08ac0).fillRect(rng.int(0, w), rng.int(shore + 8, h), 2, 1);
      break;
    }
    case 'stone':
      for (let i = 0; i < n / 4; i++) g.fillStyle(d, 0.6).fillRect(rng.int(0, w), y(), rng.int(2, 5), 1);
      for (let i = 0; i < 8; i++) prop(g, rng, 'rock', rng.int(0, w), y(), rng.int(2, 5), mix(t.ground[0], 0xffffff, 0.1));
      break;
    case 'mist':
      for (let i = 0; i < n / 3; i++) g.fillStyle(d, 0.5).fillRect(rng.int(0, w), y(), 1, 1);
      for (let i = 0; i < 7; i++) {
        const yy = hz + Math.round(((h - hz) * (i + 0.5)) / 8);
        g.fillStyle(0xc8b8ff, 0.08).fillRect(0, yy, w, rng.int(2, 4));
      }
      break;
  }
}

/** The moving weather for an element, over the area (x, y, w, h). */
function weather(scene: Phaser.Scene, el: Element, area: Phaser.Geom.Rectangle) {
  const key = ensurePixel(scene);
  const t = THEMES[el];
  const top = new Phaser.Geom.Rectangle(area.x - 40, area.y - 10, area.width + 80, 10);
  const all = area;
  const bottom = new Phaser.Geom.Rectangle(area.x, area.bottom - 20, area.width, 20);
  const zone = (r: Phaser.Geom.Rectangle) => ({ type: 'random' as const, source: r as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource });
  const base = { advance: 6000 };
  const cfg: Record<Weather, Phaser.Types.GameObjects.Particles.ParticleEmitterConfig> = {
    embers: { ...base, emitZone: zone(bottom), speedY: { min: -60, max: -25 }, speedX: { min: -12, max: 12 }, lifespan: 7000, frequency: 120, tint: [0xffb04a, 0xff6b3d, 0xffe14d], alpha: { start: 1, end: 0 }, scale: { min: 0.6, max: 1 } },
    snow: { ...base, emitZone: zone(top), speedY: { min: 20, max: 45 }, speedX: { min: -12, max: 8 }, lifespan: 16000, frequency: 70, tint: 0xffffff, alpha: { min: 0.6, max: 1 }, scale: { min: 0.6, max: 1.2 } },
    leaves: { ...base, emitZone: zone(top), speedY: { min: 18, max: 34 }, speedX: { min: 10, max: 30 }, lifespan: 18000, frequency: 450, tint: [0x8ad86a, 0xe8c25a, 0x5ab84a], rotate: { min: 0, max: 360 }, scale: { min: 1, max: 1.4 } },
    dust: { ...base, emitZone: zone(all), speedX: { min: 20, max: 50 }, speedY: { min: -4, max: 4 }, lifespan: 5000, frequency: 160, tint: 0xf0d8a8, alpha: { start: 0.7, end: 0 }, scale: { min: 0.5, max: 1 } },
    rain: { ...base, emitZone: zone(top), speedY: { min: 320, max: 420 }, speedX: -60, lifespan: 1600, frequency: 18, tint: 0xa8c0e8, alpha: 0.55, scaleX: 0.4, scaleY: 2.2, rotate: -9 },
    bubbles: { ...base, emitZone: zone(bottom), speedY: { min: -40, max: -18 }, speedX: { min: -6, max: 6 }, lifespan: 9000, frequency: 380, tint: 0xe8f8ff, alpha: { start: 0.8, end: 0 }, scale: { min: 0.6, max: 1.2 } },
    sparks: { ...base, emitZone: zone(all), speed: { min: 20, max: 60 }, gravityY: 80, lifespan: 900, frequency: 160, quantity: 2, tint: [0xffe14d, 0xffb04a], alpha: { start: 1, end: 0 }, scale: { min: 0.4, max: 0.8 } },
    spores: { ...base, emitZone: zone(all), speedY: { min: -14, max: -4 }, speedX: { min: -8, max: 8 }, lifespan: 6000, frequency: 200, tint: [0x9ae04a, 0xb45cff], alpha: { start: 0, end: 0.8 }, scale: { min: 0.6, max: 1.2 } },
    motes: { ...base, emitZone: zone(all), speedY: { min: -10, max: 4 }, speedX: { min: -8, max: 8 }, lifespan: 6000, frequency: 220, tint: [0x8a7ac8, 0x4b3f72, 0xd8d0f0], alpha: { start: 0.9, end: 0 }, scale: { min: 0.6, max: 1.2 } },
    glints: { ...base, emitZone: zone(all), lifespan: 1400, frequency: 140, tint: [0xffffff, 0xffe8a0], alpha: { start: 1, end: 0 }, scale: { start: 1.3, end: 0 } },
    wisps: { ...base, emitZone: zone(all), speedY: { min: -18, max: -8 }, speedX: { min: -10, max: 10 }, lifespan: 5000, frequency: 340, tint: [0xa8f0ff, 0xf29ad8], alpha: { start: 0, end: 0.9 }, scale: { start: 1.6, end: 0.4 }, blendMode: 'ADD' },
    ash: { ...base, emitZone: zone(top), speedY: { min: 14, max: 28 }, speedX: { min: -20, max: -6 }, lifespan: 16000, frequency: 160, tint: [0x5a4a4a, 0x8a7a7a, 0xff8a4a], alpha: { min: 0.5, max: 0.9 }, scale: { min: 0.5, max: 1 } },
  };
  const em = scene.add.particles(0, 0, key, cfg[t.weather]);
  // Particles only fall within the field (in landscape the side column covers the rest anyway).
  const mask = scene.make.graphics({}, false).fillRect(area.x, area.y, area.width, area.height);
  em.setMask(mask.createGeometryMask());
  scene.events.once('shutdown', () => mask.destroy());
  return em;
}

/** Where a scene sits on the screen: the layout (w x h) and the margins around it (see widgets). */
export interface Board {
  w: number;
  h: number;
  ox: number;
  oy: number;
  fw: number;
  fh: number;
}

/**
 * A battle's environment for an element, across the whole screen. `field` is the part of the
 * layout where the creatures stand (top-left); it stretches into the margins, and the rest (the
 * controls) is shaded so the buttons read well.
 */
export function battleBackdrop(scene: Phaser.Scene, el: Element, stage: number, b: Board, field: { w: number; h: number }) {
  // Field edges in layout coordinates; a field that reaches the layout's edge runs on to the screen's.
  const left = -b.ox;
  const top = -b.oy;
  const right = field.w >= b.w ? b.fw - b.ox : field.w;
  const bottom = field.h >= b.h ? b.fh - b.oy : field.h;
  const key = paint(scene, el, stage, b.fw, b.fh, b.oy + field.h * 0.4, bottom + b.oy);
  scene.add.image(left, top, key).setOrigin(0).setScale(PX);
  const area = new Phaser.Geom.Rectangle(left, top, right - left, bottom - top);
  weather(scene, el, area);
  const t = themeFor(el, stage);
  if (t.flash) {
    // Lightning now and then: a white flash over the field.
    const flash = scene.add.rectangle(area.x, area.y, area.width, area.height, 0xffffff, 0).setOrigin(0);
    const strike = () => {
      scene.tweens.chain({ targets: flash, tweens: [{ alpha: 0.35, duration: 60 }, { alpha: 0.05, duration: 80 }, { alpha: 0.25, duration: 50 }, { alpha: 0, duration: 400 }] });
      scene.time.delayedCall(4000 + Math.random() * 6000, strike);
    };
    scene.time.delayedCall(2500, strike);
  }
  // Shade under the controls, with a soft top/left edge.
  const shade = mix(t.ground[1], 0x000000, 0.55);
  if (field.h < b.h) {
    for (let i = 0; i < 4; i++) scene.add.rectangle(left, field.h - 12 + i * 3, b.fw, 3, shade, 0.2 + i * 0.15).setOrigin(0);
    scene.add.rectangle(left, field.h, b.fw, b.fh - b.oy - field.h, shade, 0.82).setOrigin(0);
  }
  if (field.w < b.w) {
    for (let i = 0; i < 4; i++) scene.add.rectangle(field.w - 12 + i * 3, top, 3, b.fh, shade, 0.2 + i * 0.15).setOrigin(0);
    scene.add.rectangle(field.w, top, b.fw - b.ox - field.w, b.fh, shade, 0.82).setOrigin(0);
  }
}

/** The ground pad a creature stands on, in the element's colors, with a shadow on it. */
export function battlePad(scene: Phaser.Scene, el: Element, stage: number, x: number, y: number, w = 200) {
  const [top, rim] = themeFor(el, stage).pad;
  scene.add.ellipse(x, y + 6, w + 16, 52, rim);
  scene.add.ellipse(x, y, w + 16, 48, top);
  scene.add.ellipse(x, y + 2, w - 30, 30, mix(top, 0xffffff, 0.12), 0.6);
  scene.add.ellipse(x, y, w - 20, 34, 0x000000, 0.3);
}

/** Text that sits straight on the field gets a dark outline so it reads on bright skies too. */
export const onField = <T extends Phaser.GameObjects.Text>(t: T): T => t.setStroke('#12101c', 4);

// ---------------------------------------------------------------- menus

const MENU_HUES = Object.values(ELEMENT_COLORS);

/** Hexagon outline points, pointy-top, radius r. */
const hexPts = (r: number) => Array.from({ length: 6 }, (_, i) => new Phaser.Math.Vector2(Math.cos(((60 * i - 90) * Math.PI) / 180) * r, Math.sin(((60 * i - 90) * Math.PI) / 180) * r));

function paintMenu(scene: Phaser.Scene, bw: number, bh: number, base: number, title: boolean): string {
  const key = `bd-menu:${bw}x${bh}:${title ? 't' : 'm'}`;
  if (scene.textures.exists(key)) return key;
  const w = Math.ceil(bw / PX);
  const h = Math.ceil(bh / PX);
  const g = scene.make.graphics({}, false);
  // Soft vertical glow: a little lighter in the middle.
  const bands = 14;
  for (let i = 0; i < bands; i++) {
    const t = 1 - Math.abs(i / (bands - 1) - (title ? 0.32 : 0.45)) * 1.8;
    g.fillStyle(mix(base, 0x3a2f62, Math.max(0, t) * (title ? 0.55 : 0.32))).fillRect(0, Math.floor((h * i) / bands), w, Math.ceil(h / bands) + 1);
  }
  // A faint honeycomb across everything.
  const r = 9;
  const dx = Math.sqrt(3) * r;
  for (let row = -1, yy = 0; yy < h + r; row++, yy = row * r * 1.5) {
    for (let x = (row % 2 ? dx / 2 : 0) - dx; x < w + dx; x += dx) {
      g.lineStyle(1, 0x6a5aa0, 0.12);
      g.strokePoints(hexPts(r).map((p) => ({ x: Math.round(x + p.x), y: Math.round(yy + p.y) })), true);
    }
  }
  if (title) {
    // A glowing floor in perspective along the bottom (an arcade horizon).
    const hz = Math.round(h * 0.84);
    for (let yy = hz; yy < h; yy++) g.fillStyle(mix(base, 0x2a1a48, (yy - hz) / (h - hz)), 1).fillRect(0, yy, w, 1);
    for (let i = 1; i <= 4; i++) g.fillStyle(0xffc94d, 0.05 * i).fillRect(0, hz - 5 + i, w, 1);
    for (let k = 1; hz + k * k * 0.5 < h; k++) g.fillStyle(0x8a5ad0, 0.35).fillRect(0, Math.round(hz + k * k * 0.5), w, 1);
    for (let k = -20; k <= 20; k++) {
      for (let yy = hz; yy < h; yy++) {
        const t = (yy - hz) / (h - hz);
        g.fillStyle(0x8a5ad0, 0.3).fillRect(Math.round(w / 2 + k * 5 * (1 + t * 7)), yy, 1, 1);
      }
    }
  }
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

/**
 * Menu background: a soft glow and honeycomb, with a few big hexagons in element colors drifting
 * up and some rising sparks. The title screen also gets a glowing floor.
 */
export function menuBackdrop(scene: Phaser.Scene, ox: number, oy: number, bw: number, bh: number, base: number, title = false) {
  scene.add.image(-ox, -oy, paintMenu(scene, bw, bh, base, title)).setOrigin(0).setScale(PX);
  const rng = new Rng((Math.random() * 2 ** 31) | 0);
  const n = title ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const color = MENU_HUES[rng.int(0, MENU_HUES.length - 1)];
    const r = 24 + rng.next() * 40;
    const hex = scene.add.graphics({ x: rng.next() * bw - ox, y: rng.next() * bh - oy });
    hex.lineStyle(3, color, 0.18).strokePoints(hexPts(r), true);
    hex.fillStyle(color, 0.05).fillPoints(hexPts(r), true);
    const drift = () => {
      const d = 22000 + rng.next() * 18000;
      scene.tweens.add({
        targets: hex,
        y: -oy - r - 10,
        angle: hex.angle + (rng.next() < 0.5 ? -60 : 60),
        duration: d * ((hex.y + oy + r) / (bh + r)),
        onComplete: () => {
          hex.setPosition(rng.next() * bw - ox, bh - oy + r + 10);
          drift();
        },
      });
    };
    drift();
  }
  scene.add.particles(0, 0, ensurePixel(scene), {
    emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-ox, bh * 0.2 - oy, bw, bh * 0.8) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
    speedY: { min: -26, max: -8 },
    speedX: { min: -5, max: 5 },
    lifespan: 5000,
    frequency: title ? 160 : 320,
    tint: [0xffc94d, 0x8a7ac8, 0x6ac8f0, 0xf29ad8],
    alpha: { start: 0, end: 0.7 },
    scale: { min: 0.5, max: 1 },
    advance: 4000,
  });
}

// ---------------------------------------------------------------- map

/** A small pixel emblem for each element (7x7, '#' = filled), scattered over the map background. */
const EMBLEMS: Record<Element, string[]> = {
  Fire: ['...#...', '..##...', '..###..', '.#####.', '.##.##.', '.#...#.', '..###..'],
  Frost: ['...#...', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '...#...'],
  Nature: ['....##.', '...###.', '..####.', '.####..', '.###...', '.#.....', '#......'],
  Earth: ['.......', '...#...', '..###..', '.#####.', '.######', '#######', '.......'],
  Storm: ['...###.', '..###..', '.###...', '.#####.', '...##..', '..##...', '.#.....'],
  Water: ['...#...', '..###..', '.#####.', '.#####.', '#######', '.#####.', '..###..'],
  Metal: ['.#.#.#.', '#######', '.##.##.', '###.###', '.##.##.', '#######', '.#.#.#.'],
  Toxic: ['..##...', '.#..#..', '..##.#.', '....#.#', '.##..#.', '#..#...', '.##....'],
  Shadow: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
  Light: ['...#...', '...#...', '.#####.', '#######', '.#####.', '...#...', '...#...'],
  Spirit: ['..###..', '.#####.', '.#.#.#.', '.#####.', '.#####.', '.#####.', '.#.#.#.'],
  Dragon: ['#.....#', '##...##', '.##.##.', '..###..', '.##.##.', '##...##', '#.....#'],
};

function paintMap(scene: Phaser.Scene, el: Element, bw: number, bh: number, base: number): string {
  const key = `bd-map:${el}:${bw}x${bh}:${base}`;
  if (scene.textures.exists(key)) return key;
  const w = Math.ceil(bw / PX);
  const h = Math.ceil(bh / PX);
  const col = ELEMENT_COLORS[el];
  const g = scene.make.graphics({}, false);
  // The element's color glowing in from the top and bottom, the base color in the middle.
  const bands = 16;
  for (let i = 0; i < bands; i++) {
    const t = Math.abs(i / (bands - 1) - 0.5) * 2;
    g.fillStyle(mix(base, col, 0.06 + t * t * 0.16)).fillRect(0, Math.floor((h * i) / bands), w, Math.ceil(h / bands) + 1);
  }
  // Emblems on a loose, staggered grid, a few of them bigger and brighter.
  const rng = new Rng(hashString(`map:${el}`));
  const rows = EMBLEMS[el];
  const step = 26;
  for (let y = 4, r = 0; y < h; y += step * 0.6, r++) {
    for (let x = (r % 2 ? step / 2 : 0) + 4; x < w; x += step) {
      const big = rng.next() < 0.2;
      const sz = big ? 2 : 1;
      const a = big ? 0.16 : 0.09;
      const ex = Math.round(x + rng.int(-4, 4));
      const ey = Math.round(y + rng.int(-3, 3));
      rows.forEach((line, yy) => [...line].forEach((ch, xx) => ch === '#' && g.fillStyle(col, a).fillRect(ex + xx * sz, ey + yy * sz, sz, sz)));
    }
  }
  // Darker corners so the hexes stand out in the middle.
  for (let i = 1; i <= 6; i++) {
    g.fillStyle(0x000000, 0.06).fillRect(0, 0, i * 2, h);
    g.fillStyle(0x000000, 0.06).fillRect(w - i * 2, 0, i * 2, h);
  }
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

/** The map's background: the land's element as a tinted glow with its emblem, and its weather (faint). */
export function mapBackdrop(scene: Phaser.Scene, el: Element, b: Board, base: number) {
  scene.add.image(-b.ox, -b.oy, paintMap(scene, el, b.fw, b.fh, base)).setOrigin(0).setScale(PX);
  weather(scene, el, new Phaser.Geom.Rectangle(-b.ox, -b.oy, b.fw, b.fh));
  // Soften the weather so the map stays easy to read.
  scene.add.rectangle(-b.ox, -b.oy, b.fw, b.fh, base, 0.45).setOrigin(0);
}
