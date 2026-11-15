import Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { ELEMENT_COLORS, type Element } from '../data/types';
import { hashString, Rng } from '../logic/rng';

export const SPRITE_SIZE = 32;

type Px = 0 | 1 | 2 | 3 | 4 | 5 | 6; // empty, body, secondary, belly, eyeWhite, eyePupil, horn

function shade(color: number, f: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

interface Plan {
  bodyRx: number;
  bodyRy: number;
  headR: number;
  headMerged: boolean;
  earKind: number; // 0 none, 1 pointy, 2 round, 3 antenna
  legs: number; // 0, 2, 4
  wings: boolean;
  spots: number;
  eyeSpread: number;
  hornKind: number;
}

function makePlan(rng: Rng, el: Element[]): Plan {
  return {
    bodyRx: 5 + rng.int(0, 3),
    bodyRy: 4 + rng.int(0, 3),
    headR: 3 + rng.int(0, 2),
    headMerged: rng.chance(0.3),
    earKind: rng.int(0, 3),
    legs: rng.pick([0, 2, 2, 4]),
    wings: el.includes('Storm') ? rng.chance(0.75) : rng.chance(0.15),
    spots: rng.int(2, 6),
    eyeSpread: 1 + rng.int(0, 1),
    hornKind: rng.int(0, 2),
  };
}

/** Builds a symmetric pixel grid for a species at a given evolution stage. */
export function buildGrid(speciesId: string, stage: number): Px[][] {
  const sp = SPECIES_BY_ID[speciesId];
  const rng = new Rng(hashString(speciesId));
  const plan = makePlan(rng, [...sp.types]);
  const S = SPRITE_SIZE;
  const g: Px[][] = Array.from({ length: S }, () => Array<Px>(S).fill(0));
  const cx = S / 2 - 0.5;
  const grow = 1 + stage * 0.22;
  const rx = plan.bodyRx * grow;
  const ry = plan.bodyRy * grow;
  const by = S - 7 - ry; // body center y (leaves room for legs)
  const hr = plan.headR * grow;
  const hy = plan.headMerged ? by - ry + 1 : by - ry - hr + 2;

  const set = (x: number, y: number, v: Px, onlyEmpty = false) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= S || yi >= S) return;
    if (onlyEmpty && g[yi][xi] !== 0) return;
    g[yi][xi] = v;
    const mx = S - 1 - xi;
    if (!onlyEmpty || g[yi][mx] === 0) g[yi][mx] = v;
  };
  const ellipse = (ex: number, ey: number, erx: number, ery: number, v: Px) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S / 2; x++) {
        const dx = (x - ex) / erx;
        const dy = (y - ey) / ery;
        if (dx * dx + dy * dy <= 1) set(x, y, v);
      }
  };

  // Wings behind body
  if (plan.wings) {
    const wy = by - ry * 0.4;
    const span = 4 + stage * 2;
    for (let i = 0; i < span; i++)
      for (let j = 0; j <= i * 0.8 + 1; j++) set(cx - rx - i + 1, wy - j + i * 0.3, 2);
  }
  // Legs
  if (plan.legs > 0) {
    const legXs = plan.legs === 4 ? [cx - rx * 0.75, cx - rx * 0.3] : [cx - rx * 0.5];
    for (const lx of legXs) for (let y = 0; y < 3 + stage; y++) for (let w = 0; w < 2; w++) set(lx + w, by + ry - 1 + y, 1);
  }
  // Body + head
  ellipse(cx, by, rx, ry, 1);
  ellipse(cx, hy, hr + (plan.headMerged ? 1 : 0), hr, 1);
  // Belly
  ellipse(cx, by + ry * 0.25, rx * 0.5, ry * 0.55, 3);
  // Spots in secondary color (seeded, per stage more)
  const spotRng = new Rng(hashString(speciesId + ':spots'));
  for (let i = 0; i < plan.spots + stage * 2; i++) {
    const sx = cx - rx * (0.3 + spotRng.next() * 0.6);
    const sy = by - ry * 0.6 + spotRng.next() * ry * 1.1;
    if (g[Math.round(sy)]?.[Math.round(sx)] === 1) set(sx, sy, 2);
  }
  // Ears
  const earY = hy - hr * 0.6;
  const earX = cx - hr * 0.7;
  if (plan.earKind === 1) for (let i = 0; i < 3 + stage; i++) set(earX - i * 0.4, earY - i, 1);
  if (plan.earKind === 2) ellipse(earX - 0.5, earY - 1, 1.6, 1.6, 2);
  if (plan.earKind === 3) {
    for (let i = 0; i < 3 + stage; i++) set(earX + 1 - i * 0.5, earY - i, 2);
    set(earX + 1 - (3 + stage) * 0.5, earY - (3 + stage), 6);
  }
  // Horns / crest grow with evolution
  if (stage >= 1) {
    const hornLen = 2 + stage * 2;
    for (let i = 0; i < hornLen; i++) {
      if (plan.hornKind === 0) set(cx - 1 - i * 0.6, hy - hr - i + 1, 6);
      else if (plan.hornKind === 1) set(cx, hy - hr - i + 1, 6);
      else set(cx - hr * 0.4 - i * 0.2, hy - hr - i + 1, 6);
    }
  }
  if (stage >= 2) {
    // back spikes along the body sides
    for (let i = 0; i < 4; i++) set(cx - rx - 1, by - ry * 0.5 + i * 2, 6, true);
  }
  // Eyes
  const ey = Math.round(hy);
  const ex = Math.round(cx - plan.eyeSpread - 1 - stage * 0.5);
  set(ex, ey, 4);
  set(ex, ey - 1, 4);
  set(ex + 1, ey, 5);
  set(ex + 1, ey - 1, stage >= 2 ? 5 : 4);
  return g;
}

function paletteFor(speciesId: string, stage: number) {
  const [t1, t2] = SPECIES_BY_ID[speciesId].types;
  const base = shade(ELEMENT_COLORS[t1], 0.85 + stage * 0.05);
  let sec = ELEMENT_COLORS[t2];
  if (t1 === t2) sec = shade(ELEMENT_COLORS[t1], 0.6);
  return {
    1: base,
    2: sec,
    3: shade(base, 1.45),
    4: 0xffffff,
    5: 0x1a1428,
    6: stage >= 2 ? 0xfff2a8 : 0xe8e0d0,
    outline: shade(base, 0.3),
    shadow: shade(base, 0.7),
    light: shade(base, 1.25),
  };
}

export function creatureTextureKey(speciesId: string, stage: number): string {
  return `cr-${speciesId}-${stage}`;
}

/** Draws (once) and returns the texture key for a creature sprite. */
export function ensureCreatureTexture(scene: Phaser.Scene, speciesId: string, stage: number): string {
  const key = creatureTextureKey(speciesId, stage);
  if (scene.textures.exists(key)) return key;
  const grid = buildGrid(speciesId, stage);
  const pal = paletteFor(speciesId, stage);
  const S = SPRITE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && grid[y][x] !== 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = grid[y][x];
      if (v === 0) {
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
          ctx.fillStyle = hex(pal.outline);
          ctx.fillRect(x, y, 1, 1);
        }
        continue;
      }
      let col = pal[v as 1 | 2 | 3 | 4 | 5 | 6];
      if (v === 1) {
        // simple top-left light / bottom-right shadow
        if (!filled(x, y + 1) || !filled(x + 1, y + 1)) col = pal.shadow;
        else if (!filled(x, y - 1) || !filled(x - 1, y - 1)) col = pal.light;
      }
      ctx.fillStyle = hex(col);
      ctx.fillRect(x, y, 1, 1);
    }
  scene.textures.addCanvas(key, canvas);
  return key;
}
