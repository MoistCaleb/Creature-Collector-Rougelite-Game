export const ELEMENTS = [
  'Fire',
  'Frost',
  'Nature',
  'Earth',
  'Storm',
  'Water',
  'Metal',
  'Toxic',
  'Shadow',
  'Light',
  'Spirit',
  'Dragon',
] as const;
export type Element = (typeof ELEMENTS)[number];

/** Each element is strong against three others. Defenders of the attacker's
 *  "strong against" type take x1.5; defenders that are strong against the
 *  attacker resist it (x0.67), unless the rivalry is mutual (both hit x1.5). */
export const STRONG_AGAINST: Record<Element, readonly Element[]> = {
  Fire: ['Frost', 'Nature', 'Metal'],
  Frost: ['Nature', 'Earth', 'Dragon'],
  Nature: ['Water', 'Earth', 'Storm'],
  Earth: ['Fire', 'Storm', 'Toxic'],
  Storm: ['Water', 'Metal', 'Spirit'],
  Water: ['Fire', 'Earth', 'Toxic'],
  Metal: ['Frost', 'Light', 'Toxic'],
  Toxic: ['Nature', 'Spirit', 'Dragon'],
  Shadow: ['Spirit', 'Light', 'Water'],
  Light: ['Shadow', 'Frost', 'Dragon'],
  Spirit: ['Shadow', 'Metal', 'Light'],
  Dragon: ['Fire', 'Storm', 'Shadow'],
};

export const SUPER = 1.5;
export const RESIST = 0.67;
export const STAB_DUAL = 1.25;
export const STAB_PURE = 1.5;

export const ELEMENT_COLORS: Record<Element, number> = {
  Fire: 0xff6b3d,
  Frost: 0x9fe8ff,
  Nature: 0x6fd36a,
  Earth: 0xc8935a,
  Storm: 0xffe14d,
  Water: 0x3d8bff,
  Metal: 0xa9b6c6,
  Toxic: 0xb45cff,
  Shadow: 0x4b3f72,
  Light: 0xfff2c4,
  Spirit: 0xf29ad8,
  Dragon: 0xd33a4a,
};

/** Readable text color on top of an element's color. */
export function elementTextColor(el: Element): string {
  const c = ELEMENT_COLORS[el];
  const lum = 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);
  return lum > 140 ? '#1a1428' : '#f6f2ff';
}

export type TypePair = readonly [Element, Element];

export function isPure(types: TypePair): boolean {
  return types[0] === types[1];
}

/** Unique defending types: a pure type (Fire/Fire) counts once. */
export function uniqueTypes(types: TypePair): Element[] {
  return isPure(types) ? [types[0]] : [types[0], types[1]];
}

export function singleMultiplier(attack: Element, defend: Element): number {
  if (STRONG_AGAINST[attack].includes(defend)) return SUPER;
  if (STRONG_AGAINST[defend].includes(attack)) return RESIST;
  return 1;
}

export function typeMultiplier(attack: Element, defender: TypePair | readonly Element[]): number {
  const defs = defender.length === 2 && defender[0] === defender[1] ? [defender[0]] : [...new Set(defender)];
  return defs.reduce((m, t) => m * singleMultiplier(attack, t), 1);
}

export function stabMultiplier(attack: Element, user: TypePair): number {
  if (!user.includes(attack)) return 1;
  return isPure(user) ? STAB_PURE : STAB_DUAL;
}

export function effectivenessLabel(mult: number): string | null {
  if (mult >= 2) return 'Devastating!';
  if (mult > 1.01) return "It's super effective!";
  if (mult < 0.5) return 'Barely a scratch...';
  if (mult < 0.99) return "It's not very effective...";
  return null;
}
