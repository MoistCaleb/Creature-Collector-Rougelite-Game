import { ELEMENT_COLORS, type Element } from './types';
import { hashString, Rng } from '../logic/rng';

/**
 * How a trainer looks: every part is a small index into the lists below, so a look is tiny to save
 * and to send online, and any number received from a peer can be cleaned with `cleanLook`.
 * Your own trainer, every NPC trainer and every guardian are built from the same parts.
 */
export interface TrainerLook {
  skin: number;
  hair: number;
  hairColor: number;
  eyes: number;
  hat: number;
  hatColor: number;
  top: number;
  topColor: number;
  accent: number;
  bottom: number;
  bottomColor: number;
  face: number;
  shoes: number;
  shoeColor: number;
  /** 1: the Golden glow (a Gilded milestone). Missing on older looks: none. */
  aura: number;
}

export const SKIN_TONES = [0xffe0c4, 0xf2c39b, 0xd9a273, 0xb57a4e, 0x8a5a36, 0x5e3b22];
export const HAIR_STYLES = ['Short', 'Spiky', 'Long', 'Ponytail', 'Buns', 'Mohawk', 'Bob', 'Bald', 'Afro', 'Twintails', 'Curly', 'Braid'] as const;
export const HAIR_COLORS = [0x2a2230, 0x5a3a24, 0x8a3a20, 0xe8c25a, 0xeeeeee, 0xd8443a, 0x3a6ad8, 0x3aa85a, 0x8a4ad0, 0xf08ac0];
export const EYE_COLORS = [0x2a2230, 0x4a7ad8, 0x3a9a5a, 0x8a5a2a, 0xa84ad0, 0xd8443a];
export const HATS = [
  'None', 'Cap', 'Beanie', 'Wide hat', 'Headband', 'Crown', 'Goggles', 'Top hat', 'Witch hat', 'Cat ears',
  'Bunny ears', 'Flower', 'Bow', 'Bandana', 'Helmet', 'Halo', 'Horns', 'Propeller cap',
  // Gilded milestone rewards (see logic/gilded.ts).
  'Gilded laurel', 'Gilded crown',
] as const;
export const TOPS = ['Tee', 'Jacket', 'Hoodie', 'Long coat', 'Armor', 'Tank top', 'Sweater', 'Overalls', 'Robe', 'Vest', 'Scarf', 'Cape', 'Sailor', 'Gilded coat'] as const;
export const BOTTOMS = ['Pants', 'Shorts', 'Skirt', 'Long skirt', 'Cargo pants', 'Puffy pants'] as const;
export const FACES = ['None', 'Glasses', 'Shades', 'Eyepatch', 'Freckles', 'Bandage'] as const;
export const SHOES = ['Sneakers', 'Boots', 'Sandals', 'Gilded boots'] as const;
export const AURAS = ['None', 'Golden glow'] as const;
/** Clothing colors (hat, top, accent, bottoms). */
export const CLOTH_COLORS = [
  0xd8443a, 0xf08a2a, 0xf0c838, 0x5ab84a, 0x2aa8a0, 0x6ac8f0, 0x3a6ad8, 0x2a3458,
  0x8a4ad0, 0xf08ac0, 0x8a5a36, 0xeeeeee, 0x8a8a9a, 0x2a2230, 0x8a2a3a, 0xa8e05a, 0xc8a8f0, 0xf0e2c0,
  0xe0a820, // Gilded (a milestone reward)
];
/** Clothing colors everyone has (the last one, Gilded, is a milestone reward). */
export const FREE_COLORS = 18;
export const COLOR_NAMES = [
  'Red', 'Orange', 'Gold', 'Green', 'Teal', 'Sky', 'Blue', 'Navy', 'Purple', 'Pink', 'Brown', 'White', 'Gray', 'Black',
  'Maroon', 'Lime', 'Lavender', 'Cream', 'Gilded',
];
export const HAIR_COLOR_NAMES = ['Black', 'Brown', 'Auburn', 'Blonde', 'White', 'Red', 'Blue', 'Green', 'Purple', 'Pink'];
export const EYE_COLOR_NAMES = ['Dark', 'Blue', 'Green', 'Amber', 'Violet', 'Red'];

/**
 * Each part: its options (used by the editor and to clean looks from peers). `free` is how many
 * of them everyone has (the rest are Gilded milestone rewards, never given to NPC trainers).
 */
export const LOOK_PARTS: { key: keyof TrainerLook; label: string; names: readonly string[]; free?: number }[] = [
  { key: 'skin', label: 'Skin', names: SKIN_TONES.map((_, i) => `Tone ${i + 1}`) },
  { key: 'hair', label: 'Hair', names: HAIR_STYLES },
  { key: 'hairColor', label: 'Hair color', names: HAIR_COLOR_NAMES },
  { key: 'eyes', label: 'Eyes', names: EYE_COLOR_NAMES },
  { key: 'face', label: 'Face', names: FACES },
  { key: 'hat', label: 'Hat', names: HATS, free: 18 },
  { key: 'hatColor', label: 'Hat color', names: COLOR_NAMES, free: 18 },
  { key: 'top', label: 'Top', names: TOPS, free: 13 },
  { key: 'topColor', label: 'Top color', names: COLOR_NAMES, free: 18 },
  { key: 'accent', label: 'Accent', names: COLOR_NAMES, free: 18 },
  { key: 'bottom', label: 'Bottoms', names: BOTTOMS },
  { key: 'bottomColor', label: 'Bottoms color', names: COLOR_NAMES, free: 18 },
  { key: 'shoes', label: 'Shoes', names: SHOES, free: 3 },
  { key: 'shoeColor', label: 'Shoe color', names: COLOR_NAMES, free: 18 },
  { key: 'aura', label: 'Aura', names: AURAS, free: 1 },
];

export const DEFAULT_LOOK: TrainerLook = {
  skin: 1, hair: 0, hairColor: 1, eyes: 0, hat: 1, hatColor: 0, top: 1, topColor: 6, accent: 11, bottom: 0, bottomColor: 7,
  face: 0, shoes: 0, shoeColor: 13, aura: 0,
};

/** Make any value safe to draw: every part a whole number in range (bad or missing parts use the default). */
export function cleanLook(x: unknown): TrainerLook {
  const src = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_LOOK };
  for (const p of LOOK_PARTS) {
    const v = Number(src[p.key]);
    if (Number.isInteger(v) && v >= 0 && v < p.names.length) out[p.key] = v;
  }
  return out;
}

/** Your own trainer's look and name (saved in meta). */
export const myLook = (meta: { trainerLook?: unknown }): TrainerLook => cleanLook(meta.trainerLook);
export const myName = (meta: { duelName?: string }): string => meta.duelName || 'Trainer';

/** A random look (the editor's Shuffle, and NPC trainers). */
export function randomLook(rng: Rng): TrainerLook {
  const look = { ...DEFAULT_LOOK };
  // Only the options everyone has (and the same rolls as before milestone rewards existed).
  for (const p of LOOK_PARTS) if (p.key !== 'aura') look[p.key] = rng.int(0, (p.free ?? p.names.length) - 1);
  // Hats are less common than bare heads, and bald is rare.
  if (rng.next() < 0.35) look.hat = 0;
  if (rng.next() < 0.6) look.face = 0;
  if (look.hair === HAIR_STYLES.indexOf('Bald') && rng.next() < 0.6) look.hair = 0;
  if (look.accent === look.topColor) look.accent = (look.accent + 5) % FREE_COLORS;
  return look;
}

/** The same trainer name always gets the same look. */
export function lookForName(name: string): TrainerLook {
  return randomLook(new Rng(hashString(`trainer:${name}`)));
}

/** Clothing color closest to a given color (guardians dress in their element). */
function nearestCloth(color: number): number {
  const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const [r, g, b] = rgb(color);
  let best = 0;
  let bestD = Infinity;
  CLOTH_COLORS.slice(0, FREE_COLORS).forEach((c, i) => {
    const [r2, g2, b2] = rgb(c);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Hand-picked parts for each element's guardian: a long coat (or armor) in their colors. */
const BOSS_PARTS: Record<Element, Partial<TrainerLook>> = {
  Fire: { hair: 1, hairColor: 5, hat: 4, top: 4 },
  Frost: { hair: 2, hairColor: 4, hat: 5, top: 3 },
  Nature: { hair: 2, hairColor: 7, hat: 3, top: 3 },
  Earth: { hair: 7, hat: 4, top: 4, skin: 4 },
  Storm: { hair: 5, hairColor: 3, hat: 6, top: 1 },
  Water: { hair: 3, hairColor: 6, hat: 0, top: 3 },
  Metal: { hair: 0, hairColor: 4, hat: 6, top: 4 },
  Toxic: { hair: 6, hairColor: 8, hat: 3, top: 2 },
  Shadow: { hair: 2, hairColor: 0, hat: 0, top: 2 },
  Light: { hair: 4, hairColor: 3, hat: 5, top: 3 },
  Spirit: { hair: 2, hairColor: 4, hat: 5, top: 3 },
  Dragon: { hair: 1, hairColor: 5, hat: 5, top: 4 },
};

/** A guardian's look: their own parts, in their element's colors. */
export function bossLook(element: Element): TrainerLook {
  const base = randomLook(new Rng(hashString(`boss:${element}`)));
  const color = nearestCloth(ELEMENT_COLORS[element]);
  const look = cleanLook({ ...base, ...BOSS_PARTS[element], topColor: color, hatColor: color, accent: 2, bottomColor: 13 });
  if (look.topColor === look.accent) look.accent = 11;
  return look;
}
