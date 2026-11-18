import type { Element } from './types';

/** Major status conditions. A creature has at most one; it clears when it switches out or the battle ends. */
export type StatusId = 'burn' | 'poison' | 'para' | 'freeze' | 'sleep' | 'confuse';

export interface StatusDef {
  name: string;
  /** Three-letter tag shown on the battle panel. */
  tag: string;
  color: number;
  /** "was burned", "fell asleep"... */
  verb: string;
  /** Message when it wears off. */
  ends: string;
  /** Turns it lasts: [min, max]. */
  turns: [number, number];
  desc: string;
  /** Elements that can't get it. */
  immune: Element[];
}

export const STATUS: Record<StatusId, StatusDef> = {
  burn: { name: 'Burn', tag: 'BRN', color: 0xff7a3a, verb: 'was burned', ends: 'is no longer burning', turns: [3, 5], desc: 'Loses 1/12 HP each turn and deals 20% less damage', immune: ['Fire'] },
  poison: { name: 'Poison', tag: 'PSN', color: 0xb05ae0, verb: 'was poisoned', ends: 'shook off the poison', turns: [3, 5], desc: 'Loses 1/8 HP each turn', immune: ['Toxic', 'Metal'] },
  para: { name: 'Paralysis', tag: 'PAR', color: 0xf0d040, verb: 'is paralyzed', ends: 'can move freely again', turns: [3, 5], desc: 'Half speed; 25% chance each turn it can’t move', immune: ['Storm'] },
  freeze: { name: 'Freeze', tag: 'FRZ', color: 0x8fdcf0, verb: 'was frozen solid', ends: 'thawed out', turns: [3, 5], desc: 'Can’t move until it thaws (a Fire hit thaws it)', immune: ['Frost', 'Fire'] },
  sleep: { name: 'Sleep', tag: 'SLP', color: 0x9aa0c0, verb: 'fell asleep', ends: 'woke up', turns: [3, 5], desc: 'Can’t move until it wakes', immune: [] },
  confuse: { name: 'Confusion', tag: 'CNF', color: 0xe070b0, verb: 'became confused', ends: 'snapped out of its confusion', turns: [3, 5], desc: '33% chance to hurt itself instead of acting', immune: [] },
};

/** Which status a move inflicts, judged from its name, and how often. */
// Attack chances: only a few attacks per element carry a condition (see STATUS_ATTACKS in moves),
// so the ones that do land it fairly often.
const NAME_STATUS: [RegExp, StatusId, number][] = [
  [/Ember|Scorch|Inferno|Flame|Blaze|Sear|Flare|Kindle|Fire/, 'burn', 0.25],
  [/Acid|Venom|Sludge|Plague|Noxious|Caustic|Toxic|Spore Burst/, 'poison', 0.3],
  [/Spark|Thunder|Static|Zap|Numbing|Shock/, 'para', 0.25],
  [/Ice|Frost|Blizzard|Hail|Chill/, 'freeze', 0.15],
  [/Spore Cloud|Wisp|Haunt|Phantom|Lull|Dream/, 'sleep', 0.2],
  [/Dread|Night|Umbral|Eclipse|Fear|Terrify|Blinding|Prism|Spook|Shade/, 'confuse', 0.25],
];

/** Status-type moves (buffs, debuffs, heals) inflict their status more reliably than attacks do. */
export function statusFromName(name: string, kind: 'attack' | 'buff' | 'debuff' | 'heal'): { id: StatusId; chance: number } | undefined {
  if (kind === 'buff' || kind === 'heal') return undefined;
  for (const [re, id, chance] of NAME_STATUS) if (re.test(name)) return { id, chance: kind === 'debuff' ? 0.4 : chance };
  return undefined;
}
