export const ELEMENTS = ['Fire', 'Frost', 'Nature', 'Earth', 'Storm', 'Water'] as const;
export type Element = (typeof ELEMENTS)[number];

/** Each element is strong against the two listed. Defenders of the attacker's
 *  "strong against" type take x1.5; defenders that are strong against the
 *  attacker resist it (x0.67). */
export const STRONG_AGAINST: Record<Element, readonly Element[]> = {
  Fire: ['Frost', 'Nature'],
  Frost: ['Nature', 'Earth'],
  Nature: ['Earth', 'Storm'],
  Earth: ['Storm', 'Water'],
  Storm: ['Water', 'Fire'],
  Water: ['Fire', 'Frost'],
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
};

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

export function typeMultiplier(attack: Element, defender: TypePair): number {
  return uniqueTypes(defender).reduce((m, t) => m * singleMultiplier(attack, t), 1);
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
