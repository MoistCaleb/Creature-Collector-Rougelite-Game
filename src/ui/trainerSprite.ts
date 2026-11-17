import type Phaser from 'phaser';
import {
  CLOTH_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
  type TrainerLook,
} from '../data/trainerLook';

export const TRAINER_W = 32;
export const TRAINER_H = 42;

/** 'stand' faces you; 'command' points one arm forward (into battle). */
export type TrainerPose = 'stand' | 'command';

const OUTLINE = 0x16101e;
const SHOE = 0x2a2230;
const GOLD = 0xf0c838;
const LENS = 0x9adcf0;

const shade = (c: number, k: number) => {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** Paint a trainer into a 32x42 grid of colors (null = empty), then outline and shade it. */
export function paintTrainer(ctx: CanvasRenderingContext2D, look: TrainerLook, pose: TrainerPose) {
  const g: (number | null)[][] = Array.from({ length: TRAINER_H }, () => Array<number | null>(TRAINER_W).fill(null));
  const put = (x: number, y: number, c: number | null) => {
    if (x >= 0 && x < TRAINER_W && y >= 0 && y < TRAINER_H) g[y][x] = c;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: number | null) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c);
  };
  const skin = SKIN_TONES[look.skin];
  const hairC = HAIR_COLORS[look.hairColor];
  const hatC = CLOTH_COLORS[look.hatColor];
  const topC = CLOTH_COLORS[look.topColor];
  const acc = CLOTH_COLORS[look.accent];
  const botC = CLOTH_COLORS[look.bottomColor];

  // Hood and long hair hang behind the body, so they go first.
  if (look.top === 2) rect(7, 7, 18, 16, shade(topC, 0.8));
  if (look.hair === 2) {
    rect(7, 6, 8, 20, hairC);
    rect(17, 6, 18, 20, hairC);
  }
  if (look.hair === 3) {
    rect(18, 7, 19, 16, hairC);
    put(18, 7, acc);
  }

  // Legs and shoes.
  const legs = look.bottom === 0 ? botC : skin;
  rect(9, 27, 16, 29, botC);
  rect(9, 30, 11, 37, legs);
  rect(14, 30, 16, 37, legs);
  if (look.bottom === 1) rect(9, 30, 16, 31, botC);
  if (look.bottom === 1) rect(12, 31, 13, 31, null);
  if (look.bottom === 2) {
    rect(8, 27, 17, 29, botC);
    rect(7, 30, 18, 32, botC);
  }
  rect(8, 38, 11, 40, SHOE);
  rect(14, 38, 17, 40, SHOE);

  // Torso.
  rect(8, 16, 17, 26, topC);
  if (look.top === 0) rect(8, 19, 17, 19, acc); // tee stripe
  if (look.top === 1) rect(12, 16, 13, 26, acc); // open jacket, shirt underneath
  if (look.top === 2) {
    rect(10, 22, 15, 24, shade(topC, 0.82)); // pouch
    put(11, 17, acc);
    put(11, 18, acc);
    put(14, 17, acc);
    put(14, 18, acc);
  }
  if (look.top === 3) {
    // Long coat: down past the knees, open at the front.
    rect(7, 16, 18, 34, topC);
    rect(12, 27, 13, 34, legs);
    rect(12, 16, 13, 26, acc);
  }
  if (look.top === 4) {
    rect(10, 18, 15, 22, acc); // chest plate
    rect(5, 15, 9, 17, acc); // shoulder pads
    rect(16, 15, 20, 17, acc);
  }
  if (look.top !== 3) rect(8, 26, 17, 26, look.top === 1 ? shade(botC, 0.7) : acc); // belt

  // Arms: sleeves in the top color, hands in skin.
  const sleeve = look.top === 0 ? 18 : 21;
  rect(6, 16, 7, sleeve, topC);
  rect(6, sleeve + 1, 7, 24, skin);
  if (pose === 'command') {
    rect(18, 17, 26, 18, topC);
    rect(27, 16, 28, 19, skin);
  } else {
    rect(18, 16, 19, sleeve, topC);
    rect(18, sleeve + 1, 19, 24, skin);
  }
  if (look.top === 4) {
    rect(5, 15, 9, 17, acc);
    rect(16, 15, 20, 17, acc);
  }

  // Neck and head (rounded corners).
  rect(12, 15, 13, 15, shade(skin, 0.85));
  rect(8, 5, 17, 14, skin);
  for (const [x, y] of [[8, 5], [17, 5], [8, 14], [17, 14]]) put(x, y, null);
  // Eyes and mouth.
  rect(10, 10, 10, 11, EYE_COLORS[look.eyes]);
  rect(15, 10, 15, 11, EYE_COLORS[look.eyes]);
  put(10, 10, 0xffffff);
  put(15, 10, 0xffffff);
  rect(12, 13, 13, 13, shade(skin, 0.7));

  // Hair.
  const cap = () => {
    rect(8, 4, 17, 7, hairC);
    put(8, 4, null);
    put(17, 4, null);
    rect(8, 8, 8, 9, hairC);
    rect(17, 8, 17, 9, hairC);
    rect(9, 8, 11, 8, hairC);
  };
  switch (look.hair) {
    case 0:
    case 2:
    case 3:
      cap();
      break;
    case 1:
      cap();
      for (const [x, y] of [[9, 3], [10, 2], [10, 3], [12, 3], [13, 2], [13, 3], [15, 3], [16, 2], [16, 3]]) put(x, y, hairC);
      break;
    case 4:
      cap();
      rect(6, 3, 8, 5, hairC);
      rect(17, 3, 19, 5, hairC);
      break;
    case 5:
      rect(12, 1, 13, 6, hairC);
      break;
    case 6:
      cap();
      rect(7, 6, 8, 13, hairC);
      rect(17, 6, 18, 13, hairC);
      break;
    default:
      break; // bald
  }

  // Hat.
  switch (look.hat) {
    case 1: // cap with a brim
      rect(8, 3, 17, 6, hatC);
      put(8, 3, null);
      put(17, 3, null);
      rect(7, 7, 20, 7, shade(hatC, 0.75));
      put(12, 4, acc);
      put(13, 4, acc);
      break;
    case 2: // beanie with a pom
      rect(8, 2, 17, 7, hatC);
      put(8, 2, null);
      put(17, 2, null);
      rect(8, 7, 17, 7, shade(hatC, 0.75));
      rect(12, 0, 13, 1, acc);
      break;
    case 3: // wide hat
      rect(9, 1, 16, 5, hatC);
      rect(9, 5, 16, 5, acc);
      rect(4, 6, 21, 6, shade(hatC, 0.8));
      break;
    case 4: // headband
      rect(8, 7, 17, 7, hatC);
      rect(18, 8, 19, 9, hatC);
      break;
    case 5: // crown
      rect(9, 2, 16, 5, GOLD);
      for (const x of [9, 12, 13, 16]) put(x, 1, GOLD);
      put(12, 3, hatC);
      put(13, 3, hatC);
      break;
    case 6: // goggles
      rect(8, 7, 17, 7, hatC);
      rect(9, 6, 10, 7, LENS);
      rect(15, 6, 16, 7, LENS);
      break;
    default:
      break;
  }

  // Shade: darker on the right edge of each shape, a touch lighter on the left.
  const filled = (x: number, y: number) => x >= 0 && x < TRAINER_W && y >= 0 && y < TRAINER_H && g[y][x] !== null;
  const out: (number | null)[][] = g.map((row) => row.slice());
  for (let y = 0; y < TRAINER_H; y++) {
    for (let x = 0; x < TRAINER_W; x++) {
      const c = g[y][x];
      if (c === null) {
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) out[y][x] = OUTLINE;
        continue;
      }
      if (!filled(x + 1, y)) out[y][x] = shade(c, 0.78);
      else if (!filled(x - 1, y)) out[y][x] = shade(c, 1.1);
      else if (!filled(x, y + 1)) out[y][x] = shade(c, 0.88);
    }
  }
  for (let y = 0; y < TRAINER_H; y++) {
    for (let x = 0; x < TRAINER_W; x++) {
      const c = out[y][x];
      if (c === null) continue;
      ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

export function trainerTextureKey(look: TrainerLook, pose: TrainerPose): string {
  return `trainer:${pose}:${Object.values(look).join('.')}`;
}

/** Make (once) and return the texture for this look and pose. */
export function ensureTrainerTexture(scene: Phaser.Scene, look: TrainerLook, pose: TrainerPose = 'stand'): string {
  const key = trainerTextureKey(look, pose);
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = TRAINER_W;
  canvas.height = TRAINER_H;
  paintTrainer(canvas.getContext('2d')!, look, pose);
  scene.textures.addCanvas(key, canvas);
  return key;
}
