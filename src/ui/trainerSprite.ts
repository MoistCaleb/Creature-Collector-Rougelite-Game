import type Phaser from 'phaser';
import {
  CLOTH_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
  type TrainerLook,
} from '../data/trainerLook';

export const TRAINER_W = 32;
export const TRAINER_H = 34;

/**
 * 'stand' faces you; 'command' faces you pointing one arm forward (opponents); 'back' is seen from
 * behind with an arm raised toward the fight (your own trainer in battle).
 */
export type TrainerPose = 'stand' | 'command' | 'back';

const OUTLINE = 0x16101e;
const SHOE = 0x2a2230;
const GOLD = 0xf0c838;
const LENS = 0x9adcf0;

const shade = (c: number, k: number) => {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * Paint a chibi trainer: a big round head (half the height) with large shiny eyes, a small body
 * and short legs. Built on a grid of colors (null = empty), then outlined and shaded.
 */
export function paintTrainer(ctx: CanvasRenderingContext2D, look: TrainerLook, pose: TrainerPose) {
  const g: (number | null)[][] = Array.from({ length: TRAINER_H }, () => Array<number | null>(TRAINER_W).fill(null));
  const put = (x: number, y: number, c: number | null) => {
    if (x >= 0 && x < TRAINER_W && y >= 0 && y < TRAINER_H) g[y][x] = c;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: number | null) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c);
  };
  /** A rectangle with its corners rounded off (r = 1 or 2 pixels). */
  const round = (x0: number, y0: number, x1: number, y1: number, c: number, r = 2) => {
    rect(x0, y0, x1, y1, c);
    const cut = (x: number, y: number) => put(x, y, null);
    for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      cut(cx, cy);
      if (r > 1) {
        cut(cx + dx, cy);
        cut(cx, cy + dy);
      }
    }
  };
  const skin = SKIN_TONES[look.skin];
  const hairC = HAIR_COLORS[look.hairColor];
  const hatC = CLOTH_COLORS[look.hatColor];
  const topC = CLOTH_COLORS[look.topColor];
  const acc = CLOTH_COLORS[look.accent];
  const botC = CLOTH_COLORS[look.bottomColor];

  // Head box.
  const X0 = 6;
  const X1 = 21;
  const Y0 = 5;
  const Y1 = 18;

  const back = pose === 'back';

  // Behind everything (seen from the front): hood, long hair, ponytail.
  if (!back && look.top === 2) round(X0 - 1, Y0 + 5, X1 + 1, Y1 + 2, shade(topC, 0.8));
  if (!back && look.hair === 2) {
    rect(X0 - 2, Y0 + 2, X0, Y1 + 6, hairC);
    rect(X1, Y0 + 2, X1 + 2, Y1 + 6, hairC);
  }
  if (!back && look.hair === 3) {
    round(X1, Y0 + 1, X1 + 3, Y0 + 11, hairC, 1);
    put(X1 + 1, Y0 + 1, acc);
    put(X1 + 2, Y0 + 1, acc);
  }

  // Legs and shoes (short and stubby).
  const legC = look.bottom === 0 ? botC : skin;
  rect(10, 27, 17, 28, botC);
  rect(10, 29, 12, 30, legC);
  rect(15, 29, 17, 30, legC);
  if (look.bottom === 2) round(8, 27, 19, 29, botC, 1);
  round(9, 31, 12, 32, SHOE, 1);
  round(15, 31, 18, 32, SHOE, 1);

  // Body.
  round(9, 19, 18, 26, topC, 1);
  if (look.top === 0) rect(9, 22, 18, 22, acc); // tee stripe
  if (!back && look.top === 1) rect(13, 19, 14, 26, acc); // open jacket
  if (!back && look.top === 2) {
    rect(11, 23, 16, 24, shade(topC, 0.82)); // pouch
    rect(12, 19, 12, 21, acc); // drawstrings
    rect(15, 19, 15, 21, acc);
  }
  if (look.top === 3) {
    round(8, 19, 19, 30, topC, 1); // long coat over the legs
    rect(13, 27, 14, 30, legC);
    if (!back) rect(13, 19, 14, 26, acc);
  }
  if (look.top === 4) round(11, 20, 16, 24, acc, 1); // chest plate (back plate from behind)
  if (look.top !== 3) rect(9, 26, 18, 26, look.top === 1 ? shade(botC, 0.7) : acc); // belt

  // Arms: little sleeves, round hands.
  const sleeveEnd = look.top === 0 ? 20 : 22;
  rect(7, 19, 8, sleeveEnd, topC);
  rect(7, sleeveEnd + 1, 8, 24, skin);
  if (back) {
    // Arm raised up and out toward the opponent (up-right).
    for (let i = 0; i < 6; i++) rect(19 + i, 19 - i, 20 + i, 20 - i, look.top === 0 && i > 1 ? skin : topC);
    round(24, 11, 27, 14, skin, 1);
  } else if (pose === 'command') {
    rect(19, 20, look.top === 0 ? 21 : 25, 21, topC);
    if (look.top === 0) rect(22, 20, 25, 21, skin);
    round(25, 19, 27, 22, skin, 1);
  } else {
    rect(19, 19, 20, sleeveEnd, topC);
    rect(19, sleeveEnd + 1, 20, 24, skin);
  }
  if (look.top === 4) {
    round(5, 18, 9, 20, acc, 1); // shoulder pads
    round(18, 18, 22, 20, acc, 1);
  }

  // From behind: the hood lies on the back, long hair and a ponytail hang down over it.
  if (back && look.top === 2) round(9, 17, 18, 22, shade(topC, 0.8), 1);

  // Head.
  round(X0, Y0, X1, Y1, skin, 2);
  if (back) {
    paintBackHair();
  } else {
  // Big eyes: a white shine top-left, a darker bottom row.
  const eye = EYE_COLORS[look.eyes];
  for (const ex of [9, 17]) {
    rect(ex, 11, ex + 1, 13, eye);
    put(ex, 11, 0xffffff);
    rect(ex, 13, ex + 1, 13, shade(eye, 0.6));
  }
  // Blush and a small mouth.
  const blush = 0xf08a9a;
  rect(7, 14, 8, 14, blush);
  rect(19, 14, 20, 14, blush);
  rect(13, 15, 14, 15, shade(skin, 0.6));

  }

  /** The back of the head: hair covers it down to the nape (styles keep their shape). */
  function paintBackHair() {
    const h = look.hair;
    if (h === 7) {
      put(X0 + 4, Y0 + 2, shade(skin, 1.15));
      put(X0 + 5, Y0 + 2, shade(skin, 1.15));
      return;
    }
    if (h === 5) return void round(12, Y0 - 4, 15, Y1 - 3, hairC, 1); // mohawk stripe
    round(X0, Y0 - 2, X1, h === 6 || h === 2 ? Y1 : Y1 - 3, hairC, 2);
    rect(X0 - 1, Y0 + 1, X0, Y0 + 7, hairC);
    rect(X1, Y0 + 1, X1 + 1, Y0 + 7, hairC);
    // A soft shine across the crown and a ragged hairline at the nape.
    rect(X0 + 4, Y0 - 1, X0 + 8, Y0 - 1, shade(hairC, 1.25));
    rect(X0 + 3, Y0, X0 + 4, Y0, shade(hairC, 1.25));
    const nape = h === 6 || h === 2 ? Y1 : Y1 - 3;
    for (let x = X0 + 2; x < X1 - 1; x++) if (x % 3 === 1) put(x, nape + 1, hairC);
    if (h === 1) {
      for (const x of [X0 + 1, X0 + 5, X0 + 9, X0 + 13]) {
        rect(x, Y0 - 3, x + 2, Y0 - 3, hairC);
        put(x + 1, Y0 - 4, hairC);
      }
    }
    if (h === 2) round(X0 + 1, Y1 - 4, X1 - 1, Y1 + 4, hairC, 2); // long: down the back
    if (h === 3) {
      round(12, Y1 - 3, 15, Y1 + 6, hairC, 1); // ponytail
      rect(12, Y1 - 3, 15, Y1 - 3, acc);
    }
    if (h === 4) {
      round(X0 - 2, Y0 - 4, X0 + 1, Y0 - 1, hairC, 1);
      round(X1 - 1, Y0 - 4, X1 + 2, Y0 - 1, hairC, 1);
    }
  }

  // Hair: a cap over the top of the head, sides, and jagged bangs.
  const cap = () => {
    round(X0, Y0 - 2, X1, Y0 + 3, hairC, 2);
    rect(X0 - 1, Y0 + 1, X0, Y0 + 7, hairC);
    rect(X1, Y0 + 1, X1 + 1, Y0 + 7, hairC);
    for (let x = X0 + 1; x < X1; x++) {
      if (x % 3 !== 0) put(x, Y0 + 4, hairC);
      if (x % 3 === 1) put(x, Y0 + 5, hairC);
    }
  };
  if (!back) switch (look.hair) {
    case 0: // short
    case 2: // long (the long part is drawn behind)
    case 3: // ponytail
      cap();
      break;
    case 1: // spiky
      cap();
      for (const x of [X0 + 1, X0 + 5, X0 + 9, X0 + 13]) {
        rect(x, Y0 - 3, x + 2, Y0 - 3, hairC);
        put(x + 1, Y0 - 4, hairC);
      }
      break;
    case 4: // buns
      cap();
      round(X0 - 2, Y0 - 4, X0 + 1, Y0 - 1, hairC, 1);
      round(X1 - 1, Y0 - 4, X1 + 2, Y0 - 1, hairC, 1);
      break;
    case 5: // mohawk
      round(12, Y0 - 4, 15, Y0 + 2, hairC, 1);
      break;
    case 6: // bob: thick sides down to the chin
      cap();
      rect(X0 - 1, Y0 + 1, X0 + 1, Y0 + 11, hairC);
      rect(X1 - 1, Y0 + 1, X1 + 1, Y0 + 11, hairC);
      break;
    default: // bald: a shine
      put(X0 + 4, Y0 + 1, shade(skin, 1.15));
      put(X0 + 5, Y0 + 1, shade(skin, 1.15));
      break;
  }

  // Hats.
  switch (look.hat) {
    case 1: // cap with a side brim
      round(X0, Y0 - 3, X1, Y0 + 1, hatC, 2);
      if (back) rect(12, Y0 + 1, 15, Y0 + 1, acc); // strap
      else {
        rect(X0 - 1, Y0 + 2, X1 + 4, Y0 + 2, shade(hatC, 0.75));
        rect(13, Y0 - 1, 14, Y0, acc);
      }
      break;
    case 2: // beanie with a pom
      round(X0, Y0 - 3, X1, Y0 + 2, hatC, 2);
      rect(X0, Y0 + 1, X1, Y0 + 2, shade(hatC, 0.78));
      round(12, Y0 - 5, 15, Y0 - 3, acc, 1);
      break;
    case 3: // wide hat
      round(X0 + 3, Y0 - 5, X1 - 3, Y0, hatC, 1);
      rect(X0 + 3, Y0, X1 - 3, Y0, acc);
      rect(X0 - 4, Y0 + 1, X1 + 4, Y0 + 1, shade(hatC, 0.8));
      break;
    case 4: // headband with tails
      rect(X0, Y0 + 2, X1, Y0 + 2, hatC);
      if (back) rect(13, Y0 + 3, 14, Y0 + 7, hatC); // knot tails down the back
      else rect(X1 + 1, Y0 + 3, X1 + 2, Y0 + 5, hatC);
      break;
    case 5: // crown
      rect(X0 + 3, Y0 - 3, X1 - 3, Y0, GOLD);
      for (const x of [X0 + 3, 13, 14, X1 - 3]) put(x, Y0 - 4, GOLD);
      if (!back) rect(13, Y0 - 2, 14, Y0 - 1, hatC);
      break;
    case 6: // goggles on the forehead
      rect(X0, Y0 + 2, X1, Y0 + 2, hatC);
      if (!back) {
        round(X0 + 2, Y0 + 1, X0 + 5, Y0 + 3, LENS, 1);
        round(X1 - 5, Y0 + 1, X1 - 2, Y0 + 3, LENS, 1);
      }
      break;
    default:
      break;
  }

  // Shade: darker on the right and bottom edges, a touch lighter on the left; then outline.
  const filled = (x: number, y: number) => x >= 0 && x < TRAINER_W && y >= 0 && y < TRAINER_H && g[y][x] !== null;
  const out: (number | null)[][] = g.map((row) => row.slice());
  for (let y = 0; y < TRAINER_H; y++) {
    for (let x = 0; x < TRAINER_W; x++) {
      const c = g[y][x];
      if (c === null) {
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) out[y][x] = OUTLINE;
        continue;
      }
      if (c === 0xffffff) continue;
      if (!filled(x + 1, y)) out[y][x] = shade(c, 0.78);
      else if (!filled(x, y + 1)) out[y][x] = shade(c, 0.86);
      else if (!filled(x - 1, y) || !filled(x, y - 1)) out[y][x] = shade(c, 1.08);
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
  return `trainer2:${pose}:${Object.values(look).join('.')}`;
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
