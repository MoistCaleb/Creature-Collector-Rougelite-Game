import type Phaser from 'phaser';
import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES, type TrainerLook } from '../data/trainerLook';

export const TRAINER_W = 32;
export const TRAINER_H = 34;

/**
 * 'stand' faces you, arms down; 'command' faces you pointing one arm forward (opponents giving an
 * order). 'back' is seen from behind, arms down; 'backCommand' raises an arm toward the fight (your
 * own trainer giving an order).
 */
export type TrainerPose = 'stand' | 'command' | 'back' | 'backCommand';

const OUTLINE = 0x16101e;
const GOLD = 0xf0c838;
const LENS = 0x9adcf0;
const GOLD_LIGHT = 0xfff0a0;
const BLUSH = 0xf08a9a;
const INK = 0x2a2230;

const shade = (c: number, k: number) => {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

// Head box (the head is about half the height: chibi proportions).
const X0 = 6;
const X1 = 21;
const Y0 = 5;
const Y1 = 18;

/**
 * Paint a chibi trainer: a big round head with large shiny eyes, a small body and short legs.
 * Built on a grid of colors (null = empty), then shaded and outlined.
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
    for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      put(cx, cy, null);
      if (r > 1) {
        put(cx + dx, cy, null);
        put(cx, cy + dy, null);
      }
    }
  };

  const back = pose === 'back' || pose === 'backCommand';
  const raised = pose === 'command' || pose === 'backCommand';
  const skin = SKIN_TONES[look.skin];
  const hairC = HAIR_COLORS[look.hairColor];
  const hatC = CLOTH_COLORS[look.hatColor];
  const topC = CLOTH_COLORS[look.topColor];
  const acc = CLOTH_COLORS[look.accent];
  const botC = CLOTH_COLORS[look.bottomColor];
  const shoeC = CLOTH_COLORS[look.shoeColor];
  const top = look.top;
  const hair = look.hair;

  // ---- behind the body (from the front): hood, cape, long hair, tails, afro
  if (!back) {
    if (top === 2) round(X0 - 1, Y0 + 5, X1 + 1, Y1 + 2, shade(topC, 0.8));
    if (top === 11) round(7, 19, 20, 30, shade(acc, 0.85), 1);
    if (hair === 2) {
      rect(X0 - 2, Y0 + 2, X0, Y1 + 6, hairC);
      rect(X1, Y0 + 2, X1 + 2, Y1 + 6, hairC);
    }
    if (hair === 3) {
      round(X1, Y0 + 1, X1 + 3, Y0 + 11, hairC, 1);
      rect(X1 + 1, Y0 + 1, X1 + 2, Y0 + 1, acc);
    }
    if (hair === 8) round(X0 - 3, Y0 - 4, X1 + 3, Y0 + 9, hairC, 2);
    if (hair === 9) {
      round(X0 - 4, Y0 + 2, X0 - 1, Y0 + 13, hairC, 1);
      round(X1 + 1, Y0 + 2, X1 + 4, Y0 + 13, hairC, 1);
      put(X0 - 2, Y0 + 2, acc);
      put(X1 + 2, Y0 + 2, acc);
    }
  }

  // ---- legs and bottoms
  const bottom = look.bottom;
  const pants = bottom === 0 || bottom === 4 || bottom === 5;
  const legC = pants ? botC : skin;
  rect(10, 27, 17, 28, botC);
  rect(10, 29, 12, 30, legC);
  rect(15, 29, 17, 30, legC);
  if (bottom === 2) round(8, 27, 19, 29, botC, 1);
  if (bottom === 3) round(8, 27, 19, 30, botC, 1);
  if (bottom === 4 && !back) {
    put(10, 28, shade(botC, 0.75)); // cargo pockets
    put(17, 28, shade(botC, 0.75));
  }
  if (bottom === 5) {
    round(9, 27, 18, 29, botC, 1); // puffy, with cuffs
    rect(10, 30, 12, 30, acc);
    rect(15, 30, 17, 30, acc);
  }

  // ---- shoes
  if (look.shoes === 1) {
    rect(10, 29, 12, 30, shoeC); // boots come up the shins
    rect(15, 29, 17, 30, shoeC);
    round(9, 31, 12, 32, shoeC, 1);
    round(15, 31, 18, 32, shoeC, 1);
  } else if (look.shoes === 3) {
    rect(10, 28, 12, 30, GOLD); // gilded boots: tall gold boots, soles in the shoe color
    rect(15, 28, 17, 30, GOLD);
    round(9, 31, 12, 32, GOLD, 1);
    round(15, 31, 18, 32, GOLD, 1);
    rect(9, 32, 12, 32, shoeC);
    rect(15, 32, 18, 32, shoeC);
    put(11, 28, GOLD_LIGHT);
    put(16, 28, GOLD_LIGHT);
  } else if (look.shoes === 2) {
    rect(9, 31, 12, 32, skin); // sandals: a strap and a sole
    rect(15, 31, 18, 32, skin);
    rect(10, 31, 12, 31, shoeC);
    rect(15, 31, 17, 31, shoeC);
    rect(9, 32, 12, 32, shade(shoeC, 0.7));
    rect(15, 32, 18, 32, shade(shoeC, 0.7));
  } else {
    round(9, 31, 12, 32, shoeC, 1); // sneakers with white soles
    round(15, 31, 18, 32, shoeC, 1);
    rect(9, 32, 12, 32, 0xeeeeee);
    rect(15, 32, 18, 32, 0xeeeeee);
  }

  // ---- body
  round(9, 19, 18, 26, top === 9 ? acc : topC, 1);
  if (top === 0) rect(9, 22, 18, 22, acc); // tee stripe
  if (top === 1 && !back) rect(13, 19, 14, 26, acc); // open jacket
  if (top === 2 && !back) {
    rect(11, 23, 16, 24, shade(topC, 0.82)); // pouch and drawstrings
    rect(12, 19, 12, 21, acc);
    rect(15, 19, 15, 21, acc);
  }
  if (top === 3 || top === 8 || top === 13) round(8, 19, 19, 30, topC, 1); // long coat / robe over the legs
  if (top === 13) {
    // Gilded coat: gold trim down the front and along the hem, gold buttons and shoulders.
    rect(13, 27, 14, 30, legC);
    rect(8, 30, 12, 30, GOLD);
    rect(15, 30, 19, 30, GOLD);
    if (!back) {
      rect(12, 19, 12, 26, GOLD);
      rect(15, 19, 15, 26, GOLD);
      for (const y of [21, 23, 25]) put(13, y, GOLD_LIGHT);
    } else {
      round(11, 21, 16, 24, GOLD, 1); // an emblem on the back
      rect(13, 22, 14, 23, acc);
    }
  }
  if (top === 3) {
    rect(13, 27, 14, 30, legC);
    if (!back) rect(13, 19, 14, 26, acc);
  }
  if (top === 8) rect(8, 24, 19, 25, acc); // robe sash
  if (top === 4) round(11, 20, 16, 24, acc, 1); // chest (back) plate
  if (top === 5) {
    rect(9, 19, 18, 19, skin); // tank top: bare shoulders, two straps
    put(11, 19, topC);
    put(16, 19, topC);
  }
  if (top === 6) {
    rect(11, 19, 16, 19, acc); // sweater: collar and a zigzag
    for (let x = 9; x <= 18; x++) put(x, x % 2 ? 22 : 23, acc);
  }
  if (top === 7) {
    // Overalls: a bib and straps in the bottoms color over the shirt.
    if (!back) round(11, 21, 16, 26, botC, 1);
    rect(11, 19, 11, 21, botC);
    rect(16, 19, 16, 21, botC);
    if (!back) {
      put(11, 21, GOLD);
      put(16, 21, GOLD);
    }
    rect(9, 26, 18, 26, botC);
  }
  if (top === 9) {
    rect(9, 19, 12, 26, topC); // vest open over a shirt
    rect(15, 19, 18, 26, topC);
    if (back) rect(9, 19, 18, 26, topC);
  }
  if (top === 10) {
    rect(9, 19, 18, 20, acc); // scarf
    if (!back) rect(15, 21, 16, 24, acc);
  }
  if (top === 11) {
    if (back) round(8, 19, 19, 30, acc, 1); // cape down the back
    else {
      put(11, 19, GOLD);
      put(16, 19, GOLD);
    }
  }
  if (top === 12) {
    rect(9, 19, 18, 20, acc); // sailor collar and tie
    if (!back) {
      rect(12, 21, 15, 21, acc);
      rect(13, 22, 14, 23, 0xd8443a);
    }
  }
  if (![3, 7, 8, 11, 13].includes(top)) rect(9, 26, 18, 26, top === 1 ? shade(botC, 0.7) : acc); // belt

  // ---- arms
  const bare = top === 5;
  const sleeve = top === 9 ? acc : topC;
  const sleeveEnd = bare ? 18 : top === 0 || top === 12 ? 20 : 22;
  const armDown = (x: number) => {
    rect(x, 19, x + 1, sleeveEnd, sleeve);
    rect(x, sleeveEnd + 1, x + 1, 24, skin);
    if (top === 8) rect(x === 7 ? 6 : 21, 20, x === 7 ? 6 : 21, 22, topC); // robe: wide sleeves
  };
  armDown(7);
  if (raised && back) {
    // Up and out toward the opponent (up-right).
    for (let i = 0; i < 6; i++) rect(19 + i, 19 - i, 20 + i, 20 - i, i > 1 && sleeveEnd < 22 ? skin : sleeve);
    round(24, 11, 27, 14, skin, 1);
  } else if (raised) {
    rect(19, 20, sleeveEnd < 22 ? 21 : 25, 21, sleeve);
    if (sleeveEnd < 22) rect(22, 20, 25, 21, skin);
    round(25, 19, 27, 22, skin, 1);
  } else armDown(19);
  if (top === 13) {
    round(6, 18, 9, 19, GOLD, 1); // gold epaulettes
    round(18, 18, 21, 19, GOLD, 1);
  }
  if (top === 4) {
    round(5, 18, 9, 20, acc, 1); // shoulder pads
    round(18, 18, 22, 20, acc, 1);
  }
  if (back && top === 2) round(9, 17, 18, 22, shade(topC, 0.8), 1); // hood on the back

  // ---- head and face
  round(X0, Y0, X1, Y1, skin, 2);
  if (back) backHair();
  else {
    const eye = EYE_COLORS[look.eyes];
    for (const ex of [9, 17]) {
      rect(ex, 11, ex + 1, 13, eye);
      put(ex, 11, 0xffffff);
      rect(ex, 13, ex + 1, 13, shade(eye, 0.6));
    }
    rect(7, 14, 8, 14, BLUSH);
    rect(19, 14, 20, 14, BLUSH);
    rect(13, 15, 14, 15, shade(skin, 0.6));
    face();
    frontHair();
  }
  hat();

  /** Glasses, shades, an eyepatch, freckles or a plaster. */
  function face() {
    switch (look.face) {
      case 1: // round glasses
        for (const ex of [8, 16]) {
          rect(ex, 10, ex + 3, 10, INK);
          rect(ex, 14, ex + 3, 14, INK);
          rect(ex, 11, ex, 13, INK);
          rect(ex + 3, 11, ex + 3, 13, INK);
        }
        rect(12, 11, 15, 11, INK);
        break;
      case 2: // shades
        rect(8, 11, 19, 12, INK);
        rect(8, 13, 11, 13, INK);
        rect(16, 13, 19, 13, INK);
        put(9, 11, 0x8a8a9a);
        put(17, 11, 0x8a8a9a);
        break;
      case 3: // eyepatch over one eye, strap across
        round(8, 10, 11, 14, INK, 1);
        for (let x = X0; x <= X1; x++) put(x, 9 - Math.floor((x - X0) / 8), INK);
        break;
      case 4: // freckles
        for (const x of [8, 10, 17, 19]) put(x, 15, shade(skin, 0.7));
        break;
      case 5: // a plaster on the cheek
        rect(16, 15, 19, 15, 0xf0e2c0);
        put(17, 15, 0xd8b890);
        break;
      default:
        break;
    }
  }

  /** Hair seen from the front: a cap over the top, sides, and jagged bangs. */
  function frontHair() {
    const cap = () => {
      round(X0, Y0 - 2, X1, Y0 + 3, hairC, 2);
      rect(X0 - 1, Y0 + 1, X0, Y0 + 7, hairC);
      rect(X1, Y0 + 1, X1 + 1, Y0 + 7, hairC);
      for (let x = X0 + 1; x < X1; x++) {
        if (x % 3 !== 0) put(x, Y0 + 4, hairC);
        if (x % 3 === 1) put(x, Y0 + 5, hairC);
      }
    };
    switch (hair) {
      case 1: // spiky
        cap();
        spikes();
        break;
      case 4: // buns
        cap();
        buns();
        break;
      case 5: // mohawk
        round(12, Y0 - 4, 15, Y0 + 2, hairC, 1);
        break;
      case 6: // bob: thick sides down to the chin
        cap();
        rect(X0 - 1, Y0 + 1, X0 + 1, Y0 + 11, hairC);
        rect(X1 - 1, Y0 + 1, X1 + 1, Y0 + 11, hairC);
        break;
      case 7: // bald: a shine
        rect(X0 + 4, Y0 + 1, X0 + 5, Y0 + 1, shade(skin, 1.15));
        break;
      case 10: // curly: bumps all round the edge
        cap();
        curls();
        break;
      case 11: // braid over the shoulder
        cap();
        braid(X1, Y0 + 8);
        break;
      default: // short, long, ponytail, afro, twintails (their extra parts are behind)
        cap();
        break;
    }
  }

  /** The back of the head: hair covers it down to the nape, keeping the style's shape. */
  function backHair() {
    if (hair === 7) return void rect(X0 + 4, Y0 + 2, X0 + 5, Y0 + 2, shade(skin, 1.15));
    if (hair === 5) return void round(12, Y0 - 4, 15, Y1 - 3, hairC, 1);
    if (hair === 8) return void round(X0 - 3, Y0 - 4, X1 + 3, Y1 - 2, hairC, 2);
    const nape = hair === 6 || hair === 2 ? Y1 : Y1 - 3;
    round(X0, Y0 - 2, X1, nape, hairC, 2);
    rect(X0 - 1, Y0 + 1, X0, Y0 + 7, hairC);
    rect(X1, Y0 + 1, X1 + 1, Y0 + 7, hairC);
    rect(X0 + 4, Y0 - 1, X0 + 8, Y0 - 1, shade(hairC, 1.25));
    rect(X0 + 3, Y0, X0 + 4, Y0, shade(hairC, 1.25));
    for (let x = X0 + 2; x < X1 - 1; x++) if (x % 3 === 1) put(x, nape + 1, hairC);
    if (hair === 1) spikes();
    if (hair === 2) round(X0 + 1, Y1 - 4, X1 - 1, Y1 + 4, hairC, 2);
    if (hair === 3) {
      round(12, Y1 - 3, 15, Y1 + 6, hairC, 1);
      rect(12, Y1 - 3, 15, Y1 - 3, acc);
    }
    if (hair === 4) buns();
    if (hair === 9) {
      round(X0 - 4, Y0 + 2, X0 - 1, Y0 + 13, hairC, 1);
      round(X1 + 1, Y0 + 2, X1 + 4, Y0 + 13, hairC, 1);
    }
    if (hair === 10) curls();
    if (hair === 11) braid(12, Y1 - 3);
  }

  function spikes() {
    for (const x of [X0 + 1, X0 + 5, X0 + 9, X0 + 13]) {
      rect(x, Y0 - 3, x + 2, Y0 - 3, hairC);
      put(x + 1, Y0 - 4, hairC);
    }
  }
  function buns() {
    round(X0 - 2, Y0 - 4, X0 + 1, Y0 - 1, hairC, 1);
    round(X1 - 1, Y0 - 4, X1 + 2, Y0 - 1, hairC, 1);
  }
  function curls() {
    // A solid fluffy mass with a scalloped edge (no gaps between curls).
    rect(X0 - 1, Y0 - 3, X1 + 1, Y0 - 1, hairC);
    for (let x = X0; x <= X1; x += 3) rect(x, Y0 - 4, x + 1, Y0 - 4, hairC);
    rect(X0 - 2, Y0, X0, Y0 + 9, hairC);
    rect(X1, Y0, X1 + 2, Y0 + 9, hairC);
    for (let y = Y0 + 1; y <= Y0 + 9; y += 3) {
      put(X0 - 3, y, hairC);
      put(X1 + 3, y, hairC);
    }
  }
  function braid(x: number, y: number) {
    rect(x, y, x + 3, y + 11, hairC);
    for (let k = 0; k < 4; k++) rect(k % 2 ? x + 2 : x, y + k * 3 + 2, k % 2 ? x + 3 : x + 1, y + k * 3 + 2, shade(hairC, 0.8));
    rect(x + 1, y + 12, x + 2, y + 12, acc);
  }

  /** Hats (most look the same from behind; a few lose their front details). */
  function hat() {
    switch (look.hat) {
      case 1: // cap with a side brim (a strap from behind)
        round(X0, Y0 - 3, X1, Y0 + 1, hatC, 2);
        if (back) rect(12, Y0 + 1, 15, Y0 + 1, acc);
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
        if (back) rect(13, Y0 + 3, 14, Y0 + 7, hatC);
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
      case 7: // top hat
        rect(X0 + 3, Y0 - 5, X1 - 3, Y0, hatC);
        rect(X0 + 3, Y0 - 1, X1 - 3, Y0 - 1, acc);
        rect(X0, Y0 + 1, X1, Y0 + 1, shade(hatC, 0.75));
        break;
      case 8: // witch hat, tip bent over
        rect(X0 - 3, Y0 + 1, X1 + 3, Y0 + 1, shade(hatC, 0.8));
        rect(9, Y0, 18, Y0, acc);
        rect(10, Y0 - 1, 17, Y0 - 1, hatC);
        rect(11, Y0 - 2, 16, Y0 - 2, hatC);
        rect(12, Y0 - 3, 15, Y0 - 3, hatC);
        rect(13, Y0 - 4, 16, Y0 - 4, hatC);
        rect(15, Y0 - 5, 17, Y0 - 5, hatC);
        break;
      case 9: // cat ears
        for (const [x, d] of [[X0 + 1, 1], [X1 - 1, -1]] as const) {
          rect(Math.min(x, x + 3 * d), Y0 - 1, Math.max(x, x + 3 * d), Y0 - 1, hatC);
          rect(Math.min(x, x + 2 * d), Y0 - 2, Math.max(x, x + 2 * d), Y0 - 2, hatC);
          rect(Math.min(x, x + d), Y0 - 3, Math.max(x, x + d), Y0 - 3, hatC);
          put(x, Y0 - 4, hatC);
          if (!back) put(x + d, Y0 - 2, BLUSH);
        }
        break;
      case 10: // bunny ears
        round(9, 0, 11, Y0, hatC, 1);
        round(16, 0, 18, Y0, hatC, 1);
        if (!back) {
          rect(10, 1, 10, Y0 - 1, BLUSH);
          rect(17, 1, 17, Y0 - 1, BLUSH);
        }
        break;
      case 11: // flower clip
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) put(X1 - 2 + dx, Y0 + 1 + dy, hatC);
        put(X1 - 2, Y0 + 1, GOLD);
        break;
      case 12: // big bow on top
        round(X0 + 2, Y0 - 4, X0 + 6, Y0, hatC, 1);
        round(X1 - 6, Y0 - 4, X1 - 2, Y0, hatC, 1);
        rect(13, Y0 - 3, 14, Y0 - 1, shade(hatC, 0.75));
        break;
      case 13: // bandana with a knot
        round(X0, Y0 - 2, X1, Y0 + 2, hatC, 2);
        for (const [x, y] of [[9, Y0 - 1], [13, Y0], [17, Y0 - 1], [11, Y0 + 1], [16, Y0 + 1]]) put(x, y, acc);
        if (back) rect(13, Y0 + 3, 14, Y0 + 5, hatC);
        else rect(X1 + 1, Y0 + 2, X1 + 2, Y0 + 4, hatC);
        break;
      case 14: // helmet with a crest
        round(X0 - 1, Y0 - 3, X1 + 1, Y0 + 3, hatC, 2);
        rect(X0 - 1, Y0 + 3, X1 + 1, Y0 + 3, shade(hatC, 0.75));
        rect(13, Y0 - 5, 14, Y0 - 3, acc);
        break;
      case 15: // halo
        rect(X0 + 3, Y0 - 4, X1 - 3, Y0 - 4, GOLD);
        rect(X0 + 3, Y0 - 2, X1 - 3, Y0 - 2, GOLD);
        put(X0 + 2, Y0 - 3, GOLD);
        put(X1 - 2, Y0 - 3, GOLD);
        break;
      case 16: // horns
        for (const [x, d] of [[X0 + 1, -1], [X1 - 1, 1]] as const) {
          put(x, Y0 - 1, hatC);
          put(x, Y0 - 2, hatC);
          put(x + d, Y0 - 2, hatC);
          put(x + d, Y0 - 3, hatC);
          put(x + 2 * d, Y0 - 4, hatC);
        }
        break;
      case 18: // gilded laurel: a gold leaf wreath
        rect(X0, Y0 + 1, X1, Y0 + 1, GOLD);
        for (let x = X0; x <= X1; x += 3) {
          put(x, Y0, GOLD_LIGHT);
          put(x + 1, Y0, GOLD);
        }
        rect(X0 - 1, Y0 + 2, X0 - 1, Y0 + 4, GOLD);
        rect(X1 + 1, Y0 + 2, X1 + 1, Y0 + 4, GOLD);
        put(X0 - 2, Y0 + 3, GOLD_LIGHT);
        put(X1 + 2, Y0 + 3, GOLD_LIGHT);
        break;
      case 19: // gilded crown: tall, with jewels
        rect(X0 + 1, Y0 - 3, X1 - 1, Y0 + 1, GOLD);
        for (const x of [X0 + 1, X0 + 4, 13, 14, X1 - 4, X1 - 1]) rect(x, Y0 - 6, x, Y0 - 4, GOLD);
        for (const x of [X0 + 1, 13, X1 - 1]) put(x, Y0 - 7, GOLD_LIGHT);
        rect(X0 + 1, Y0, X1 - 1, Y0, shade(GOLD, 0.8));
        if (!back) {
          put(X0 + 3, Y0 - 2, acc);
          rect(13, Y0 - 2, 14, Y0 - 1, hatC);
          put(X1 - 3, Y0 - 2, acc);
        }
        break;
      case 17: // propeller cap
        round(X0, Y0 - 3, X1, Y0 + 1, hatC, 2);
        rect(X0 + 1, Y0 - 3, 13, Y0 - 1, acc);
        rect(13, Y0 - 5, 14, Y0 - 4, INK);
        rect(9, Y0 - 5, 18, Y0 - 5, acc);
        break;
      default:
        break;
    }
  }

  // ---- shade (darker right and bottom edges, lighter left and top), then outline
  const filled = (x: number, y: number) => x >= 0 && x < TRAINER_W && y >= 0 && y < TRAINER_H && g[y][x] !== null;
  const out: (number | null)[][] = g.map((row) => row.slice());
  for (let y = 0; y < TRAINER_H; y++) {
    for (let x = 0; x < TRAINER_W; x++) {
      const c = g[y][x];
      if (c === null) {
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) out[y][x] = look.aura ? 0xc08a10 : OUTLINE;
        continue;
      }
      if (c === 0xffffff) continue;
      if (!filled(x + 1, y)) out[y][x] = shade(c, 0.78);
      else if (!filled(x, y + 1)) out[y][x] = shade(c, 0.86);
      else if (!filled(x - 1, y) || !filled(x, y - 1)) out[y][x] = shade(c, 1.08);
    }
  }
  if (look.aura) {
    // Golden glow: a gold outline (above) and a few sparkles around the trainer.
    for (const [sx, sy] of [[2, 6], [28, 3], [29, 20], [1, 24]]) {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = sx + dx;
        const y = sy + dy;
        if (x >= 0 && x < TRAINER_W && y >= 0 && y < TRAINER_H && out[y][x] === null) out[y][x] = dx || dy ? GOLD : 0xffffff;
      }
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
  return `trainer3:${pose}:${Object.values(look).join('.')}`; // (a look's parts, in order)
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
