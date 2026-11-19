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
const STEEL = 0x9aa4b8;
const STEEL_DARK = 0x5a6274;
const GLOW_CYAN = 0x5af0ff;
const VOID = 0x1c1030;
/** Royal mantle and Monarch crown: crimson velvet with ermine trim. */
const ROYAL = 0x8a1a2a;
const ERMINE = 0xf4f0e8;
const FLAME = [0xffe060, 0xff9a2a, 0xff5a1a];

/** The outline color for each aura (0: the usual ink). */
export const AURA_OUTLINE = [OUTLINE, 0xc08a10, 0xc8401a, 0x4ab0d8, 0xc8b020, 0x4a1a7a, 0x3a9a2a, 0x8a9ae8, 0xd84ab8, 0x6a2ab8, 0xd8a820];

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

  if (!back) backItem();

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
  } else if (look.shoes === 4) {
    // Rocket boots: chunky steel boots with a colored band and glowing thrusters under the heels.
    round(8, 29, 12, 32, STEEL, 1);
    round(15, 29, 19, 32, STEEL, 1);
    rect(8, 30, 12, 30, shoeC);
    rect(15, 30, 19, 30, shoeC);
    rect(9, 33, 11, 33, 0xff9a2a);
    rect(16, 33, 18, 33, 0xff9a2a);
  } else if (look.shoes === 5) {
    // Cloud steps: puffy clouds instead of shoes.
    round(7, 30, 13, 33, 0xf4f8ff, 2);
    round(14, 30, 20, 33, 0xf4f8ff, 2);
    for (const x of [8, 11, 15, 18]) put(x, 29, 0xf4f8ff);
    rect(8, 33, 12, 33, 0xc8d8ec);
    rect(15, 33, 19, 33, 0xc8d8ec);
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
  round(9, 19, 18, 26, top === 9 ? acc : top === 15 ? VOID : top === 16 ? STEEL : top === 17 ? ROYAL : topC, 1);
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
  if (top === 14) {
    // Dragon armor: scales, a chest plate and spiked shoulders (below, after the arms).
    for (let y = 19; y <= 26; y++) for (let x = 9; x <= 18; x++) if ((x + y) % 3 === 0) put(x, y, shade(topC, 0.7));
    if (!back) {
      // A V-shaped gorget with a gem.
      rect(10, 19, 17, 19, acc);
      rect(11, 20, 16, 20, acc);
      rect(12, 21, 15, 21, acc);
      rect(13, 22, 14, 23, GOLD);
    } else for (let y = 19; y <= 25; y += 2) rect(13, y, 14, y, acc); // spine ridge
  }
  if (top === 17) {
    // Royal mantle: a crimson robe to the ankles. From the front it hangs open over a gold-trimmed
    // tunic, held by a gold chain; the hem is gold.
    round(8, 19, 19, 31, ROYAL, 1);
    if (!back) {
      rect(12, 20, 15, 30, shade(ROYAL, 0.7)); // the tunic underneath
      rect(11, 20, 11, 31, GOLD); // gold edges where the robe opens
      rect(16, 20, 16, 31, GOLD);
      rect(12, 21, 15, 21, GOLD_LIGHT); // the chain across the chest
      rect(13, 24, 14, 25, GOLD); // a medallion
    }
    rect(8, 31, 19, 31, GOLD);
  }
  if (top === 15) {
    // Void cloak: a starry robe down to the ankles with a glowing collar.
    round(8, 19, 19, 31, VOID, 1);
    rect(11, 19, 16, 19, 0x8a3ad8);
    for (const [x, y] of [[10, 21], [16, 23], [12, 27], [17, 29], [9, 25], [14, 30], [15, 20]]) put(x, y, (x + y) % 2 ? 0xffffff : 0xc8a8f0);
  }
  if (top === 16) {
    // Mech suit: steel plates, a glowing core and vents.
    round(8, 19, 19, 27, STEEL, 1);
    rect(8, 23, 19, 23, STEEL_DARK);
    if (!back) {
      round(12, 20, 15, 22, GLOW_CYAN, 1);
      put(13, 21, 0xffffff);
    } else for (const y of [20, 22, 25]) rect(11, y, 16, y, STEEL_DARK);
  }
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
  if (![3, 7, 8, 11, 13, 15, 16, 17].includes(top)) rect(9, 26, 18, 26, top === 1 ? shade(botC, 0.7) : acc); // belt

  // ---- arms
  const bare = top === 5;
  const sleeve = top === 9 ? acc : top === 15 ? VOID : top === 16 ? 0x8a94a8 : top === 17 ? ROYAL : topC;
  const sleeveEnd = bare ? 18 : top === 0 || top === 12 ? 20 : 22;
  const armDown = (x: number) => {
    rect(x, 19, x + 1, sleeveEnd, sleeve);
    rect(x, sleeveEnd + 1, x + 1, 24, skin);
    if (top === 8) rect(x === 7 ? 6 : 21, 20, x === 7 ? 6 : 21, 22, topC); // robe: wide sleeves
  };
  /** The arm giving an order: up and out toward the opponent from behind, straight out from the front. */
  const raisedArm = () => {
    if (back) {
      for (let i = 0; i < 6; i++) rect(19 + i, 19 - i, 20 + i, 20 - i, i > 1 && sleeveEnd < 22 ? skin : sleeve);
      round(24, 11, 27, 14, skin, 1);
    } else {
      rect(19, 20, sleeveEnd < 22 ? 21 : 25, 21, sleeve);
      if (sleeveEnd < 22) rect(22, 20, 25, 21, skin);
      round(25, 19, 27, 22, skin, 1);
    }
  };
  armDown(7);
  if (raised) raisedArm();
  else armDown(19);
  if (top === 15) {
    // Void cloak: drapes over the shoulders and both arms to the ankles; the hands peek out.
    for (const [x0, x1] of [[6, 8], [19, 21]] as const) {
      if (raised && x0 === 19) continue;
      round(x0, 18, x1, 30, VOID, 1);
      put(x0 === 6 ? 7 : 20, 23, 0xc8a8f0);
      put(x0 === 6 ? 6 : 21, 27, 0xffffff);
      if (!back) rect(x0 === 6 ? 7 : 19, 24, x0 === 6 ? 8 : 20, 24, skin);
    }
    rect(6, 18, raised ? 18 : 21, 18, 0x8a3ad8); // glowing mantle edge
    if (back) {
      // One sweep down the back, flaring at the hem, with folds and stars.
      round(6, 18, 21, 29, VOID, 1);
      round(4, 28, 23, 32, VOID, 1);
      for (const x of [9, 13, 18]) rect(x, 23, x, 31, 0x2a1a48);
      for (const [x, y] of [[10, 20], [16, 22], [12, 26], [19, 28], [7, 30], [15, 31], [11, 19]]) put(x, y, (x + y) % 2 ? 0xffffff : 0xc8a8f0);
      rect(6, 18, 21, 18, 0x8a3ad8);
      rect(5, 32, 22, 32, 0x8a3ad8);
    }
    if (raised) raisedArm();
  }
  if (top === 17) {
    // Royal mantle: an ermine collar over the shoulders; from behind, a long train to the ground.
    if (back) {
      round(7, 18, 20, 30, ROYAL, 1);
      round(5, 28, 22, 32, ROYAL, 1);
      for (const x of [10, 14, 17]) rect(x, 22, x, 31, shade(ROYAL, 0.75));
      rect(5, 32, 22, 32, GOLD);
      round(11, 21, 16, 24, GOLD, 1); // a crest
      rect(13, 22, 14, 23, ROYAL);
    }
    // A white fur collar over the shoulders, with a few dark flecks.
    rect(6, 18, raised ? 18 : 21, 19, ERMINE);
    for (const x of [8, 18]) if (!raised || x < 18) put(x, 19, INK);
    if (raised) raisedArm();
  }
  if (top === 14) {
    // Dragon armor: scaled sleeves, bracers at the wrists, greaves on the shins.
    const arms = raised ? [7] : [7, 19];
    for (const x of arms) {
      for (let y = 19; y <= 22; y++) if ((x + y) % 2 === 0) put(x, y, shade(topC, 0.7));
      rect(x, 22, x + 1, 23, acc);
      put(x, 22, GOLD);
    }
    for (const x of [10, 15]) {
      rect(x, 29, x + 2, 30, acc);
      rect(x, 30, x + 2, 30, shade(acc, 0.75));
      put(x + 1, 28, GOLD); // knee
    }
  }
  if (top === 16) {
    // Mech suit: armored hips and legs, plated forearm cuffs.
    rect(9, 27, 18, 28, STEEL_DARK);
    for (const x of [10, 15]) {
      rect(x, 29, x + 2, 30, STEEL);
      put(x + 1, 29, STEEL_DARK);
    }
    for (const x of raised ? [7] : [7, 19]) {
      rect(x, 21, x + 1, 22, STEEL_DARK);
      put(x, 21, GLOW_CYAN);
    }
  }
  if (top === 13) {
    round(6, 18, 9, 19, GOLD, 1); // gold epaulettes
    round(18, 18, 21, 19, GOLD, 1);
  }
  if (top === 14) {
    for (const [x, d] of [[7, -1], [20, 1]] as const) {
      round(Math.min(x, x + 2 * d), 18, Math.max(x, x + 2 * d), 20, acc, 1); // spiked pauldrons
      put(x + 2 * d, 17, acc);
      put(x + 3 * d, 16, GOLD_LIGHT);
    }
  }
  if (top === 16) {
    round(4, 17, 9, 21, STEEL_DARK, 1); // big shoulder plates
    round(18, 17, 23, 21, STEEL_DARK, 1);
    put(6, 19, GLOW_CYAN);
    put(21, 19, GLOW_CYAN);
  }
  if (top === 4) {
    round(5, 18, 9, 20, acc, 1); // shoulder pads
    round(18, 18, 22, 20, acc, 1);
  }
  if (back && top === 2) round(9, 17, 18, 22, shade(topC, 0.8), 1); // hood on the back
  if (!back && look.back === 3) {
    // Jetpack straps over the shoulders and a buckle across the chest.
    rect(10, 19, 10, 25, STEEL_DARK);
    rect(17, 19, 17, 25, STEEL_DARK);
    rect(11, 22, 16, 22, STEEL_DARK);
    rect(13, 22, 14, 22, GOLD);
  }
  if (!back && look.back === 4) {
    // The greatsword's strap across the chest, from the hilt's shoulder down to the other hip.
    line(9, 19, 18, 26, 0x6a4a2a);
    rect(13, 22, 14, 23, GOLD); // buckle
  }

  // ---- head and face
  round(X0, Y0, X1, Y1, skin, 2);
  if (back) {
    backHair();
    // From behind, the back item is nearest you: it covers the back, both arms, the neck and the
    // back of the head wherever its shape reaches (the hat still sits on top).
    backItem();
  } else {
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
  /** A line of pixels, `t` thick. */
  function line(x0: number, y0: number, x1: number, y1: number, c: number, t = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / (n || 1));
      const y = Math.round(y0 + ((y1 - y0) * i) / (n || 1));
      rect(x, y, x + t - 1, y + t - 1, c);
    }
  }

  /**
   * A pair of wings, colored per pixel: i counts out from the body (0) to the tip (w - 1). The tip
   * sweeps up and out above the shoulders; below it the wing tapers in feathered steps.
   */
  function wings(color: (i: number, w: number, y: number) => number | null, y0 = 6, y1 = 27, max = 8) {
    const peak = y0 + 4;
    const ROOT = 18;
    for (let y = y0; y <= y1; y++) {
      // Top: only the outer part (the tip leaning out); then full width; then tapering, notched.
      const from = y < peak ? Math.max(0, max - 2 - (y - y0) * 2) : 0;
      let w = y < peak ? max : max - Math.floor(((y - peak) * max) / (y1 - peak + 2));
      if (y > peak && y % 2 === 1) w -= 1;
      // From behind, the wings grow out of your spine at the shoulder blades and their inner edge
      // sweeps up and out to the tips, over your neck and the back of your head.
      const start = back && w > 0 ? Math.min(from, y >= ROOT ? -5 : Math.round(-5 + ((ROOT - y) * (max + 3)) / (ROOT - y0))) : from;
      for (let i = start; i < w; i++) {
        let c = color(Math.max(0, i), w, y);
        if (c === null) continue;
        // On the back: a seam down the spine where the wings meet, and feathers sweeping out to the sides.
        if (i < 0) c = i === -5 ? shade(c, 0.62) : (y - i) % 3 === 0 ? shade(c, 0.8) : c;
        put(8 - i, y, c);
        put(19 + i, y, c);
      }
    }
  }

  /** Wings, a jetpack, a greatsword, a tail or mech arms: behind you from the front, on top from behind. */
  function backItem() {
    switch (look.back) {
      case 1: // angel wings
        wings((i, w, y) => (i === w - 1 ? 0xdde8f6 : y % 3 === 0 && i > 1 ? 0xc8d8ec : 0xf8fbff));
        break;
      case 2: // demon wings: dark ribs, a scalloped edge
        wings((i, w, y) => (i % 3 === 0 ? 0x2a0a1a : i === w - 1 ? 0x3a0a22 : y % 4 === 0 ? 0x5a1430 : 0x7a1a3a), 5, 27, 9);
        break;
      case 3: // jetpack
        if (back) {
          round(9, 18, 12, 27, STEEL, 1);
          round(15, 18, 18, 27, STEEL, 1);
          rect(13, 20, 14, 26, STEEL_DARK);
          rect(9, 21, 18, 21, 0xd8443a);
          rect(10, 28, 11, 28, STEEL_DARK);
          rect(16, 28, 17, 28, STEEL_DARK);
        } else {
          // From the front: the tanks rise above your shoulders, with red caps.
          round(4, 12, 7, 26, STEEL, 1);
          round(20, 12, 23, 26, STEEL, 1);
          rect(4, 12, 7, 13, 0xd8443a);
          rect(20, 12, 23, 13, 0xd8443a);
          rect(5, 27, 6, 27, STEEL_DARK);
          rect(21, 27, 22, 27, STEEL_DARK);
        }
        break;
      case 4: // greatsword: a huge blade over the shoulder
        if (back) {
          // Strapped across the back: the hilt over your right shoulder, the blade down to your left hip.
          line(20, 13, 6, 29, 0xe8eef6, 2);
          line(21, 15, 7, 31, 0x9aa4b8);
          line(9, 18, 18, 20, 0x6a4a2a); // strap
          line(19, 10, 24, 15, GOLD); // crossguard
          line(20, 10, 25, 15, GOLD);
          line(23, 11, 26, 8, 0x6a4a2a, 2); // grip
          rect(27, 6, 28, 7, GOLD);
        } else {
          // The same sword seen from the front (the back view mirrored): the hilt over your right
          // shoulder, the blade behind you, its tip showing past your left hip.
          line(7, 13, 21, 29, 0xe8eef6, 2);
          line(6, 15, 20, 31, 0x9aa4b8);
          line(8, 10, 3, 15, GOLD); // crossguard
          line(7, 10, 2, 15, GOLD);
          line(4, 11, 1, 8, 0x6a4a2a, 2); // grip
          rect(0, 6, 1, 7, GOLD);
        }
        break;
      case 9: { // victory banner: a gold swallowtail flag on a pole strapped to the back
        const POLE = 0x6a4a2a;
        const RED = 0xd8443a;
        if (back) {
          rect(6, 0, 6, 27, POLE);
          line(7, 19, 19, 25, POLE); // strap
          rect(0, 1, 5, 5, GOLD);
          rect(0, 3, 5, 3, RED);
          put(0, 3, null);
          put(6, 0, GOLD_LIGHT);
        } else {
          rect(21, 0, 21, 22, POLE);
          rect(22, 1, 27, 5, GOLD);
          rect(22, 3, 27, 3, RED);
          put(27, 3, null);
          put(21, 0, GOLD_LIGHT);
        }
        break;
      }
      case 5: { // dragon tail, curling up with a spade tip
        const path = back
          ? [[14, 27], [15, 28], [17, 28], [19, 28], [21, 27], [23, 26], [24, 25], [25, 24], [26, 22], [26, 21], [27, 20]]
          : [[19, 28], [21, 28], [22, 27], [24, 26], [25, 25], [26, 24], [26, 23], [27, 22], [27, 21], [28, 20]];
        for (const [x, y] of path) rect(x, y, x + 1, y + 1, 0xc0303a);
        for (const [x, y] of path.filter((_, i) => i % 3 === 1)) put(x, y - 1, GOLD);
        const [tx, ty] = path[path.length - 1];
        round(tx - 1, ty - 3, tx + 2, ty - 1, 0xc0303a, 1);
        put(tx, ty - 4, 0xc0303a);
        break;
      }
      case 6: // fairy wings: two shimmering lobes a side
        for (let y = 10; y <= 26; y++) {
          const upper = y <= 19;
          const w = upper ? 7 - Math.floor(Math.abs(y - 14.5)) : 5 - Math.abs(y - 23);
          // From behind: rooted at the spine, the inner edge rising toward the upper tips.
          const inner = back && w > 0 ? Math.max(0, 5 - Math.max(0, 18 - y)) : 0;
          for (let i = -inner; i < w; i++) {
            if (i < 0) {
              // Their roots on your back: a seam down the spine, shimmering scales either side.
              const c = i === -5 ? 0x7ac8e0 : (y - i) % 3 === 0 ? 0xe8fcff : upper ? 0xa8f0ff : 0xf8b8e8;
              put(8 - i, y, c);
              put(19 + i, y, c);
              continue;
            }
            const c = i === w - 1 ? 0xffffff : upper ? ((i + y) % 4 === 0 ? 0xe8fcff : 0xa8f0ff) : (i + y) % 4 === 0 ? 0xffe0f8 : 0xf8b8e8;
            put(8 - i, y, c);
            put(19 + i, y, c);
          }
        }
        break;
      case 7: // mech arms: two extra robot arms with glowing joints and claws
        for (const d of [-1, 1] as const) {
          const sx = d < 0 ? 7 : 20;
          const ex = sx + 3 * d;
          const hx = sx + 4 * d;
          line(sx, 19, ex, 15, 0x8a94a8, 2);
          line(ex, 15, hx, 9, 0x8a94a8, 2);
          put(ex, 15, GLOW_CYAN);
          put(hx, 9, GLOW_CYAN);
          put(hx - d, 7, STEEL_DARK);
          put(hx + d, 7, STEEL_DARK);
          put(hx - d, 8, STEEL_DARK);
          put(hx + d + d, 8, STEEL_DARK);
        }
        break;
      case 8: // phoenix wings: fire from gold to red, with flaming tips
        wings((i, w, y) => {
          if (i === w - 1 && y % 2 === 0) return GOLD_LIGHT;
          const f = (y - 4) / 22 + (i / w) * 0.3;
          return f < 0.33 ? FLAME[0] : f < 0.7 ? FLAME[1] : FLAME[2];
        }, 4, 26, 9);
        break;
      default:
        break;
    }
  }

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
      case 20: // flame crown: a gold band crowned with fire
        rect(X0 + 2, Y0 - 1, X1 - 2, Y0 + 1, GOLD);
        for (let x = X0 + 2; x <= X1 - 2; x++) {
          const h = 2 + ((x * 7) % 4);
          for (let k = 0; k < h; k++) put(x, Y0 - 2 - k, FLAME[Math.min(2, h - 1 - k)]);
        }
        if (!back) rect(13, Y0, 14, Y0, hatC);
        break;
      case 21: // storm cloud: a dark, puffy cloud over your head, crackling
        round(4, 1, 23, 4, 0x8a90a4, 2);
        round(6, 0, 11, 3, 0xb8bed0, 1);
        round(11, 0, 17, 2, 0xc8cee0, 1);
        round(16, 1, 21, 3, 0xb8bed0, 1);
        rect(5, 4, 22, 4, 0x5a6074);
        put(21, 5, 0xfff27a); // a bolt off the edge
        put(22, 6, 0xfff27a);
        put(21, 7, 0xfff27a);
        put(22, 8, 0xfff27a);
        break;
      case 22: { // dragon helm: horns sweeping out, a spiked crest, cheek guards and a snout
        const dark = shade(hatC, 0.7);
        round(X0 - 1, Y0 - 3, X1 + 1, Y0 + 2, hatC, 2);
        rect(X0 - 1, Y0 + 2, X0, Y0 + 7, dark); // cheek guards
        rect(X1, Y0 + 2, X1 + 1, Y0 + 7, dark);
        for (const d of [-1, 1] as const) {
          const x = d < 0 ? X0 + 1 : X1 - 1;
          for (let k = 0; k < 5; k++) rect(x + d * (k + 1), Y0 - 2 - k, x + d * (k + 1), Y0 - 1 - k, k < 3 ? 0xf0e2c0 : 0xfff8e0);
        }
        for (const x of [10, 12, 15, 17]) put(x, Y0 - 4, acc); // crest
        rect(13, Y0 - 5, 14, Y0 - 4, acc);
        if (!back) {
          rect(X0 + 1, Y0 + 1, X1 - 1, Y0 + 1, GOLD); // brow
          rect(13, Y0 + 2, 14, Y0 + 3, dark); // snout
        } else {
          // From behind it covers the back of the head down to the neck, the crest running down it.
          round(X0 - 1, Y0 - 3, X1 + 1, Y1 - 4, hatC, 2);
          round(X0 + 1, Y1 - 5, X1 - 1, Y1, hatC, 1); // a narrower neck guard
          for (let y = Y0 - 2; y <= Y1; y++) for (let x = X0; x <= X1; x++) if ((x + 2 * y) % 5 === 0 && g[y]?.[x] === hatC) put(x, y, dark);
          rect(X0 + 1, Y1, X1 - 1, Y1, dark);
          for (let y = Y0 - 4; y <= Y1 - 1; y += 2) rect(13, y, 14, y, acc); // the crest down the back
          put(13, Y0 - 5, acc);
        }
        break;
      }
      case 23: // wizard hat: a tall cone leaning out to the side, with stars
        rect(X0 - 2, Y0 + 1, X1 + 2, Y0 + 1, shade(hatC, 0.75));
        rect(9, Y0, 18, Y0, acc);
        rect(10, Y0 - 1, 17, Y0 - 1, hatC);
        rect(11, Y0 - 2, 17, Y0 - 2, hatC);
        rect(13, Y0 - 3, 18, Y0 - 3, hatC);
        rect(15, Y0 - 4, 20, Y0 - 4, hatC);
        rect(18, Y0 - 5, 22, Y0 - 5, hatC);
        put(23, Y0 - 4, GOLD_LIGHT); // a star on the tip
        put(23, Y0 - 5, GOLD);
        put(24, Y0 - 4, GOLD);
        put(12, Y0 - 1, GOLD);
        put(16, Y0 - 3, GOLD);
        break;
      case 24: // viking helm
        round(X0, Y0 - 3, X1, Y0 + 2, STEEL, 2);
        rect(X0, Y0 + 2, X1, Y0 + 2, STEEL_DARK);
        rect(13, Y0 - 3, 14, Y0 + 1, STEEL_DARK);
        for (const [x, d] of [[X0 - 1, -1], [X1 + 1, 1]] as const) {
          put(x, Y0, 0xf0e2c0);
          put(x, Y0 - 1, 0xf0e2c0);
          put(x + d, Y0 - 2, 0xf0e2c0);
          put(x + d, Y0 - 3, 0xf0e2c0);
          put(x + d, Y0 - 4, 0xfff8e0);
        }
        if (!back) rect(13, Y0 + 3, 14, Y0 + 5, STEEL_DARK);
        break;
      case 25: // third eye, open on the forehead
        if (!back) {
          round(12, 7, 15, 9, 0xffffff, 1);
          rect(13, 7, 14, 9, 0xd040e0);
          put(13, 8, 0x3a0a4a);
          put(13, 6, 0xf080ff);
          put(14, 6, 0xf080ff);
        }
        break;
      case 26: // astral halo: a big spiked ring of light, floating
        rect(X0 + 1, 1, X1 - 1, 1, 0x9af0ff);
        rect(X0 + 1, 3, X1 - 1, 3, 0x9af0ff);
        put(X0, 2, 0x9af0ff);
        put(X1, 2, 0x9af0ff);
        for (const x of [X0 + 2, 11, 16, X1 - 2]) put(x, 0, 0xffffff);
        rect(13, 0, 14, 0, 0xffffff);
        break;
      case 27: // monarch crown: gold band and arches over crimson velvet, a cross on top, jewels
        round(X0 + 2, 2, X1 - 2, Y0, ROYAL, 1);
        rect(X0 + 1, Y0, X1 - 1, Y0 + 1, GOLD);
        rect(X0 + 1, Y0 + 1, X1 - 1, Y0 + 1, shade(GOLD, 0.8));
        for (const x of [X0 + 1, X1 - 1]) {
          rect(x, 2, x, Y0, GOLD);
          put(x, 1, GOLD_LIGHT);
        }
        rect(X0 + 3, 1, X1 - 3, 1, GOLD); // the arch
        rect(13, 1, 14, 3, GOLD);
        rect(12, 0, 15, 0, GOLD_LIGHT); // the cross
        if (!back) {
          put(X0 + 3, Y0, 0xd8443a);
          rect(13, Y0, 14, Y0, 0x3a6ad8);
          put(X1 - 3, Y0, 0x5ab84a);
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
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) out[y][x] = AURA_OUTLINE[look.aura] ?? OUTLINE;
        continue;
      }
      if (c === 0xffffff) continue;
      if (!filled(x + 1, y)) out[y][x] = shade(c, 0.78);
      else if (!filled(x, y + 1)) out[y][x] = shade(c, 0.86);
      else if (!filled(x - 1, y) || !filled(x, y - 1)) out[y][x] = shade(c, 1.08);
    }
  }
  if (look.aura === 1) {
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

/** A grayed-out copy of a trainer (the other player's token on a stage-race map). */
export function ensureGrayTrainerTexture(scene: Phaser.Scene, look: TrainerLook, pose: TrainerPose = 'stand'): string {
  const key = `${trainerTextureKey(look, pose)}-gray`;
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = TRAINER_W;
  canvas.height = TRAINER_H;
  const ctx = canvas.getContext('2d')!;
  paintTrainer(ctx, look, pose);
  const img = ctx.getImageData(0, 0, TRAINER_W, TRAINER_H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(30 + (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) * 0.8);
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** The first and last columns a trainer texture has any pixels in (wide gear reaches the edges). */
export function trainerSpan(scene: Phaser.Scene, key: string): [number, number] {
  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  const d = src.getContext?.('2d')?.getImageData(0, 0, TRAINER_W, TRAINER_H).data;
  if (!d) return [0, TRAINER_W - 1];
  let lo = TRAINER_W;
  let hi = -1;
  for (let y = 0; y < TRAINER_H; y++)
    for (let x = 0; x < TRAINER_W; x++)
      if (d[(y * TRAINER_W + x) * 4 + 3]) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
  return hi < 0 ? [0, TRAINER_W - 1] : [lo, hi];
}
