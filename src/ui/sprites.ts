import Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { ELEMENT_COLORS, type Element } from '../data/types';
import { hashString, Rng } from '../logic/rng';

export const SPRITE_SIZE = 32;

/**
 * Pixel roles. Body shading/outline are computed at paint time.
 * 0 empty, 1 body, 2 secondary (markings/wings), 3 belly/plates, 4 eye white, 5 pupil,
 * 6 horn/spike, 7 glow (fierce eyes), 8 claw/fang, 9 dark (brow/mouth)
 */
type Px = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

type Archetype = 'biped' | 'brute' | 'floater' | 'slime' | 'serpent' | 'avian';

interface Plan {
  arch: Archetype;
  bodyW: number;
  bodyH: number;
  headR: number;
  earKind: number; // 0 none, 1 pointy, 2 round, 3 antenna
  legs: 2 | 4;
  wings: boolean;
  pattern: 'spots' | 'stripes' | 'patch';
  hornKind: number; // 0 swept, 1 straight, 2 curling, 3 none (crest instead)
  eyeSpread: number;
}

/** Body archetype odds, biased by the species' primary element. */
const ARCH_BIAS: Partial<Record<Element, Partial<Record<Archetype, number>>>> = {
  Toxic: { slime: 6, biped: 2, brute: 1 },
  Spirit: { floater: 7, avian: 1, biped: 1 },
  Water: { serpent: 4, biped: 3, slime: 1 },
  Dragon: { biped: 4, serpent: 3, brute: 2 },
  Metal: { brute: 6, biped: 2 },
  Earth: { brute: 5, biped: 3 },
  Storm: { avian: 5, biped: 3 },
  Light: { avian: 4, floater: 2, biped: 2 },
  Shadow: { biped: 4, floater: 2, avian: 1 },
  Frost: { biped: 3, brute: 2, avian: 1, serpent: 1 },
  Nature: { biped: 4, brute: 2, slime: 1 },
  Fire: { biped: 5, brute: 2, avian: 1 },
};

function makePlan(rng: Rng, types: readonly Element[]): Plan {
  const arch = rng.weighted<Archetype>(ARCH_BIAS[types[0]] ?? { biped: 1 });
  const wingy = types.some((t) => t === 'Dragon' || t === 'Storm' || t === 'Light');
  return {
    arch,
    bodyW: 5 + rng.int(0, 2) + (arch === 'brute' ? 2 : arch === 'slime' ? 1 : arch === 'serpent' ? -1 : 0),
    bodyH: 4 + rng.int(0, 2) + (arch === 'serpent' ? 2 : arch === 'brute' ? -1 : 0),
    headR: 3 + rng.int(0, 1),
    earKind: rng.int(0, 3),
    legs: rng.chance(0.3) ? 4 : 2,
    wings: arch === 'avian' || (arch !== 'slime' && (wingy ? rng.chance(0.45) : rng.chance(0.06))),
    pattern: rng.pick(['spots', 'stripes', 'patch'] as const),
    hornKind: rng.int(0, 3),
    eyeSpread: 1 + rng.int(0, 1),
  };
}

/** Per-stage body plan: base forms are round and big-eyed, finals are broad, armored and armed. */
const STAGE = [
  { scale: 0.8, head: 1.22, taper: 0.0, leg: 2, arm: 0 },
  { scale: 0.94, head: 1.0, taper: 0.28, leg: 3, arm: 3 },
  { scale: 1.1, head: 0.86, taper: 0.5, leg: 4, arm: 5 },
];

export function archetypeOf(speciesId: string): Archetype {
  return makePlan(new Rng(hashString(speciesId)), SPECIES_BY_ID[speciesId].types).arch;
}

export function buildGrid(speciesId: string, stage: number): Px[][] {
  const sp = SPECIES_BY_ID[speciesId];
  const plan = makePlan(new Rng(hashString(speciesId)), sp.types);
  const A = plan.arch;
  const st = STAGE[stage];
  const S = SPRITE_SIZE;
  const g: Px[][] = Array.from({ length: S }, () => Array<Px>(S).fill(0));
  const cx = S / 2 - 0.5;

  const set = (x: number, y: number, v: Px, onlyOver?: Px[]) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= S || yi >= S) return;
    if (onlyOver && !onlyOver.includes(g[yi][xi])) return;
    g[yi][xi] = v;
    g[yi][S - 1 - xi] = v;
  };
  /** Filled (optionally tapered) ellipse; taper > 0 makes the top wider than the bottom. */
  const blob = (ex: number, ey: number, rx: number, ry: number, v: Px, taper = 0, onlyOver?: Px[]) => {
    for (let y = Math.floor(ey - ry); y <= Math.ceil(ey + ry); y++) {
      const dy = (y - ey) / ry;
      if (Math.abs(dy) > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy) * (1 - taper * dy);
      for (let x = Math.floor(ex - hw); x <= cx; x++) if (x >= ex - hw - 0.01) set(x, y, v, onlyOver);
    }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, v: Px, thick = 1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      for (let t = 0; t < thick; t++) set(x - t, y, v);
    }
  };

  // ---- layout per archetype
  const scale = st.scale;
  let rx = plan.bodyW * scale;
  let ry = plan.bodyH * scale;
  let hr = plan.headR * scale * st.head;
  let taper = st.taper;
  let legLen = st.leg;
  let headMerged = false;
  let arm = st.arm;
  let armThick = stage === 2 ? 2 : 1;
  switch (A) {
    case 'brute':
      taper = st.taper + 0.15;
      legLen = Math.max(1, st.leg - 1);
      hr *= 0.85;
      arm = st.arm + (stage > 0 ? 2 : 0);
      armThick = stage === 0 ? 1 : stage + 1;
      break;
    case 'slime':
      taper = -0.35 - stage * 0.1; // wide, sagging base
      legLen = 0;
      headMerged = true;
      ry += stage;
      arm = stage === 2 ? 3 : 0;
      break;
    case 'floater':
      taper = 0.35 + stage * 0.15;
      legLen = 0;
      arm = Math.max(0, st.arm - 1);
      break;
    case 'serpent':
      legLen = 0;
      rx = Math.max(3, rx * 0.8);
      ry += stage;
      arm = stage === 2 ? 2 : 0;
      break;
    case 'avian':
      hr *= 0.95;
      arm = 0; // wings are the arms
      break;
  }
  const bottomPad = A === 'floater' ? 5 + stage : A === 'serpent' ? 3 + stage : 1;
  const by = S - 1 - bottomPad - legLen - ry;
  const hy = headMerged ? by - ry * 0.55 : by - ry * 0.75 - hr * 0.55;
  const shoulderY = by - ry * 0.45;
  const shoulderX = cx - rx * (1 + Math.max(0, taper) * 0.45);

  // ---- wings (behind everything)
  if (plan.wings) {
    const span = (A === 'avian' ? 4 : 3) + stage * 3;
    const lift = 2 + stage * 2;
    const wy = A === 'avian' ? shoulderY + 1 : shoulderY;
    for (let i = 0; i <= span; i++) {
      const x = shoulderX - i;
      const top = wy - lift * (i / span) - 1;
      const bottom = wy + (span - i) * (A === 'avian' ? 0.7 : 0.5) + 1;
      for (let y = top; y <= bottom; y++) set(x, y, 2);
    }
    if (stage >= 1) {
      // feather/membrane notches
      for (let i = 1; i <= span; i += 2) set(shoulderX - i, wy + (span - i) * 0.5 + 1, 0);
    }
    if (stage === 2) {
      line(shoulderX, wy, shoulderX - span, wy - lift - 1, 6);
      set(shoulderX - span - 1, wy - lift - 2, 6);
    }
  }

  // ---- lower body: legs / coil / wisps
  if (legLen > 0) {
    const legW = A === 'brute' || stage === 2 ? 3 : 2;
    const legXs = plan.legs === 4 && A !== 'avian' ? [cx - rx * 0.85, cx - rx * 0.35] : [cx - rx * 0.55];
    for (const lx of legXs) {
      const w = A === 'avian' ? 1 : legW;
      for (let y = 0; y < legLen + 1; y++) for (let k = 0; k < w; k++) set(lx + k, by + ry - 1 + y, A === 'avian' ? 6 : 1);
      if (stage >= 1) {
        set(lx - 1, S - 2, 8);
        if (stage === 2 || A === 'avian') set(lx + w, S - 2, 8);
      }
    }
  }
  if (A === 'serpent') {
    // coiled tail as a wide ring under the body
    blob(cx, S - 2 - bottomPad / 2, rx + 2 + stage, bottomPad / 2 + 1, 1);
    blob(cx, S - 2 - bottomPad / 2, rx * 0.5, bottomPad / 4 + 0.5, 3, 0, [1]);
  }
  if (A === 'floater') {
    // ragged wisps trailing below
    const n = 2 + stage;
    for (let k = 0; k < n; k++) {
      const wx = cx - rx * 0.9 + (k * rx * 0.9) / n;
      for (let y = 0; y < bottomPad - (k % 2); y++) set(wx + y * 0.25, by + ry - 1 + y, 1);
    }
  }

  // ---- body
  blob(cx, by, rx, ry, 1, taper);
  if (A === 'slime') {
    // drips
    for (let k = 0; k < 2 + stage; k++) {
      const dx = cx - rx * (0.3 + 0.25 * k);
      for (let y = 0; y < 2 + (k % 2); y++) set(dx, by + ry + y, 1);
    }
  }
  // belly / armour plates
  if (stage === 2 && A !== 'slime') {
    for (let k = 0; k < 4; k++) {
      const py = by - ry * 0.35 + k * 2;
      const pw = rx * (0.62 - k * 0.08);
      for (let x = cx - pw; x <= cx; x++) set(x, py, 3, [1]);
    }
  } else if (A !== 'slime') {
    blob(cx, by + ry * 0.25, rx * 0.5, ry * 0.55, 3, 0, [1]);
  }

  // ---- arms
  if (arm > 0) {
    const ax = shoulderX + 1;
    const ex = ax - arm;
    const ey = shoulderY + (A === 'brute' ? arm + 1 : arm);
    line(ax, shoulderY, ex, ey, 1, armThick);
    set(ex - 1, ey + 1, 8);
    set(ex, ey + 1, 8);
    if (stage === 2) set(ex - 2, ey, 8);
  }

  // ---- shoulder spikes (final form)
  if (stage === 2 && A !== 'slime') {
    for (let i = 0; i < 3; i++) set(shoulderX + 1 - i, shoulderY - ry * 0.35 - i - 1, 6);
    set(shoulderX + 2, shoulderY - ry * 0.35 - 1, 6);
  }
  if (stage >= 1 && A === 'slime') {
    // crystalline toxic spines on top
    for (let k = 0; k < stage + 1; k++) {
      const sx = cx - 1 - k * 2;
      for (let i = 0; i < 2 + stage - (k % 2); i++) set(sx - i * 0.3, by - ry - i, 6);
    }
  }

  // ---- head
  if (!headMerged) blob(cx, hy, hr * (A === 'serpent' ? 1.0 : 1.1), hr, 1, stage === 2 ? -0.25 : 0);

  // ---- markings
  const mr = new Rng(hashString(speciesId + ':mark'));
  if (plan.pattern === 'spots' || stage === 0) {
    for (let i = 0; i < 3 + stage * 2; i++) {
      const sx = cx - rx * (0.3 + mr.next() * 0.6);
      const sy = by - ry * 0.6 + mr.next() * ry * 1.1;
      set(sx, sy, 2, [1]);
    }
  } else if (plan.pattern === 'stripes') {
    for (let k = 0; k < 2 + stage; k++) {
      const sy = by - ry * 0.7 + k * 2.2;
      for (let i = 0; i <= 4; i++) set(cx - rx * 1.2 + i, sy + i * 0.4, 2, [1]);
    }
  } else {
    blob(cx - rx * 0.55, by - ry * 0.3, rx * 0.35, ry * 0.35, 2, 0, [1]);
  }
  if (stage >= 1 && !headMerged) for (let y = hy - hr; y < hy - hr * 0.3; y++) set(cx - 0.5, y, 2, [1]);

  // ---- ears (base & middle), horns (middle & final)
  const topY = headMerged ? by - ry : hy - hr;
  const earX = cx - (headMerged ? rx * 0.6 : hr * 0.75);
  const earY = topY + (headMerged ? 1 : hr * 0.3);
  if (stage < 2 && A !== 'slime') {
    if (plan.earKind === 1) for (let i = 0; i < 3 + stage; i++) set(earX - i * 0.45, earY - i, 1);
    if (plan.earKind === 2) blob(earX - 0.5, earY - 1, 1.4, 1.4, 2);
    if (plan.earKind === 3) {
      for (let i = 0; i < 3 + stage; i++) set(earX + 1 - i * 0.5, earY - i, 2);
      set(earX + 1 - (3 + stage) * 0.5, earY - (3 + stage), 6);
    }
  }
  if (stage >= 1 && A !== 'slime') {
    const len = stage === 1 ? 3 : 6;
    const hx = cx - (headMerged ? rx * 0.4 : hr * 0.55);
    const hTop = topY + 0.5;
    if (plan.hornKind === 3) {
      // fin/crest down the middle instead of horns
      for (let i = 0; i < len; i++) set(cx - 0.5 - (i % 2), hTop - i * 0.8, i < 2 ? 2 : 6);
    } else
      for (let i = 0; i < len; i++) {
        const t = i / len;
        let x = hx;
        let y = hTop - i;
        if (plan.hornKind === 0) x = hx - i * 0.75;
        else if (plan.hornKind === 1) x = hx - i * 0.25;
        else {
          x = hx - Math.sin(t * Math.PI) * 2.5 - i * 0.2;
          y = hTop - i * 0.9;
        }
        set(x, y, 6);
        if (stage === 2 && i < len / 2) set(x + 1, y, 6);
      }
    if (stage === 2 && plan.hornKind !== 3) for (let k = 0; k < 2; k++) set(cx - 1.5 - k * 1.5, topY - 0.5 - (1 - k), 6);
  }

  // ---- face
  const faceY = headMerged ? by - ry * 0.45 : hy;
  const faceR = headMerged ? ry * 0.5 : hr;
  const eyeY = Math.round(faceY - (stage === 0 ? 0 : faceR * 0.15));
  const ex = Math.round(cx - plan.eyeSpread - 1 - (stage === 0 ? 0.5 : 0));
  if (stage === 0) {
    for (let dx = 0; dx < 2; dx++) for (let dy = -1; dy < 2; dy++) set(ex + dx, eyeY + dy, 4);
    set(ex + 1, eyeY, 5);
    set(ex + 1, eyeY + 1, 5);
    set(ex, eyeY + 1, 5);
  } else if (stage === 1) {
    set(ex, eyeY, 4);
    set(ex + 1, eyeY, 5);
    set(ex, eyeY + 1, 4);
    set(ex + 1, eyeY + 1, 5);
    set(ex - 1, eyeY - 2, 9);
    set(ex, eyeY - 1, 9);
    set(ex + 1, eyeY - 1, 9);
    set(ex + 2, eyeY, 9);
  } else {
    set(ex - 1, eyeY, 7);
    set(ex, eyeY, 7);
    set(ex + 1, eyeY + 1, 7);
    for (let k = -2; k <= 2; k++) set(ex + k, eyeY - 1 - (k < 0 ? 1 : 0) + (k > 1 ? 1 : 0), 9);
    if (A === 'slime' || A === 'floater') {
      // extra eyes
      set(ex - 2, eyeY + 2, 7);
    }
  }
  // mouth: beak for birds, fangs for others
  const mouthY = Math.round(faceY + faceR * (stage === 2 ? 0.55 : 0.5));
  if (A === 'avian') {
    set(cx - 0.5, mouthY - 1, 6);
    set(cx - 1.5, mouthY - 1, 6);
    set(cx - 0.5, mouthY, 6);
    if (stage === 2) set(cx - 0.5, mouthY + 1, 6);
  } else if (stage === 1) {
    set(cx - 1.5, mouthY, 9);
    set(cx - 0.5, mouthY, 9);
    set(cx - 1.5, mouthY + 1, 8);
  } else if (stage === 2) {
    for (let x = cx - 3; x <= cx; x++) set(x, mouthY, 9);
    set(cx - 3, mouthY - 1, 8);
    set(cx - 1, mouthY + 1, 8);
    set(cx - 2.5, mouthY + 1, 8);
  }
  return g;
}

function shade(color: number, f: number): number {
  const r = (color >> 16) & 255;
  const gg = (color >> 8) & 255;
  const b = color & 255;
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return (m(r) << 16) | (m(gg) << 8) | m(b);
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

function paletteFor(speciesId: string, stage: number) {
  const [t1, t2] = SPECIES_BY_ID[speciesId].types;
  // Evolutions get deeper, more saturated bodies with brighter markings.
  const dark = t1 === 'Shadow';
  const base = shade(ELEMENT_COLORS[t1], dark ? [1.25, 1.15, 1.05][stage] : [0.95, 0.85, 0.72][stage]);
  let sec = ELEMENT_COLORS[t2];
  if (t1 === t2) sec = stage === 2 ? shade(ELEMENT_COLORS[t1], 1.35) : shade(ELEMENT_COLORS[t1], 0.6);
  else if (stage === 2) sec = shade(sec, 1.1);
  const glow = t1 === 'Light' || t2 === 'Light' ? 0xff4d6d : stage === 2 ? 0xfff07a : 0xffffff;
  return {
    1: base,
    2: sec,
    3: stage === 2 ? shade(sec, 0.75) : shade(base, 1.45),
    4: 0xffffff,
    5: 0x1a1428,
    6: stage === 2 ? 0xf3ead2 : 0xd8d0c0,
    7: glow,
    8: 0xffffff,
    9: shade(base, 0.25),
    outline: shade(base, stage === 2 ? 0.18 : 0.3),
    shadow: shade(base, 0.72),
    light: shade(base, 1.25),
  };
}

/** Paints a creature onto any 2D canvas context at (ox, oy), one canvas pixel per sprite pixel. */
export function paintCreature(ctx: CanvasRenderingContext2D, speciesId: string, stage: number, ox = 0, oy = 0) {
  const grid = buildGrid(speciesId, stage);
  const pal = paletteFor(speciesId, stage);
  const S = SPRITE_SIZE;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && grid[y][x] !== 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = grid[y][x];
      if (v === 0) {
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
          ctx.fillStyle = hex(pal.outline);
          ctx.fillRect(ox + x, oy + y, 1, 1);
        }
        continue;
      }
      let col = pal[v];
      if (v === 1) {
        if (!filled(x, y + 1) || !filled(x + 1, y + 1)) col = pal.shadow;
        else if (!filled(x, y - 1) || !filled(x - 1, y - 1)) col = pal.light;
      }
      ctx.fillStyle = hex(col);
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
}

export function creatureTextureKey(speciesId: string, stage: number): string {
  return `cr-${speciesId}-${stage}`;
}

/** Draws (once) and returns the texture key for a creature sprite. */
export function ensureCreatureTexture(scene: Phaser.Scene, speciesId: string, stage: number): string {
  const key = creatureTextureKey(speciesId, stage);
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  paintCreature(canvas.getContext('2d')!, speciesId, stage);
  scene.textures.addCanvas(key, canvas);
  return key;
}
