import { STATUS, statusFromName, type StatusId } from './status';
import { ELEMENTS, type Element } from './types';

export type MoveKind = 'attack' | 'buff' | 'debuff' | 'heal';
export type StatKey = 'atk' | 'def' | 'spd';

export interface StatEffect {
  stat: StatKey;
  stages: number; // positive = raise, negative = lower
}

export interface MoveDef {
  id: string;
  name: string;
  element: Element;
  kind: MoveKind;
  /** Rank in the element's main attack line (0..3), upgraded on evolution; -1 for everything else. */
  rank: number;
  power: number;
  accuracy: number;
  /** Status moves: stat stage changes (buff/heal → user, debuff → target). */
  effects: StatEffect[];
  /** Attack extras. */
  hits?: number;
  priority?: boolean;
  drain?: number; // fraction of damage healed
  recoil?: number; // fraction of damage taken back
  selfAfter?: StatEffect[]; // user stat change after hitting
  targetAfter?: StatEffect[]; // target stat change after hitting
  bestType?: boolean; // hits with whichever of the user's types is most effective
  execute?: boolean; // double power against targets under half HP
  /** Heal moves: fraction of max HP restored. */
  heal?: number;
  /** Signature move of this species. */
  signature?: string;
  /** Status this move can inflict on the target, and the chance. */
  status?: { id: StatusId; chance: number };
}

const LINE_POWER = [40, 55, 70, 90];
const LINE_ACC = [100, 95, 90, 85];

const LINE_NAMES: Record<Element, [string, string, string, string]> = {
  Fire: ['Ember', 'Flame Lash', 'Scorch', 'Inferno'],
  Frost: ['Chill', 'Ice Shard', 'Frostbite', 'Blizzard'],
  Nature: ['Vine Snap', 'Leaf Blade', 'Thorn Volley', 'Overgrowth'],
  Earth: ['Pebble Toss', 'Rock Slam', 'Quake', 'Landslide'],
  Storm: ['Spark', 'Gust', 'Thunderclap', 'Tempest'],
  Water: ['Splash Jet', 'Tide Strike', 'Riptide', 'Tsunami'],
  Metal: ['Rivet Shot', 'Steel Claw', 'Gear Grind', 'Meteor Hammer'],
  Toxic: ['Acid Spit', 'Venom Fang', 'Sludge Bomb', 'Plague Wave'],
  Shadow: ['Shade Claw', 'Night Slash', 'Umbral Burst', 'Eclipse'],
  Light: ['Glint', 'Radiant Beam', 'Prism Lance', 'Solar Flare'],
  Spirit: ['Wisp Touch', 'Soul Lash', 'Phantom Rend', 'Spirit Storm'],
  Dragon: ['Drake Bite', 'Scale Slash', 'Wyrm Breath', 'Cataclysm'],
};

type Fx = StatEffect[];
const fx = (...pairs: [StatKey, number][]): Fx => pairs.map(([stat, stages]) => ({ stat, stages }));

/** Special attack templates every element draws from. */
type Special =
  | { t: 'quick'; name: string }
  | { t: 'heavy'; name: string }
  | { t: 'multi'; name: string }
  | { t: 'drain'; name: string }
  | { t: 'sap'; name: string; fx: Fx }
  | { t: 'boost'; name: string; fx: Fx };

interface ElementKit {
  buff: [string, Fx];
  debuff: [string, Fx];
  specials: [Special, Special, Special];
  /** Fourth status move: a heal, or a second buff. */
  extra: { heal: string } | { buff: [string, Fx] };
}

const KITS: Record<Element, ElementKit> = {
  Fire: {
    buff: ['Kindle', fx(['atk', 2])],
    debuff: ['Searing Glare', fx(['def', -2])],
    specials: [
      { t: 'quick', name: 'Flare Dash' },
      { t: 'heavy', name: 'Blaze Rush' },
      { t: 'boost', name: 'Stoking Claw', fx: fx(['atk', 1]) },
    ],
    extra: { buff: ['Fire Dance', fx(['spd', 2])] },
  },
  Frost: {
    buff: ['Frost Armor', fx(['def', 2])],
    debuff: ['Numbing Chill', fx(['spd', -2])],
    specials: [
      { t: 'quick', name: 'Ice Needle' },
      { t: 'sap', name: 'Frost Shackle', fx: fx(['spd', -1]) },
      { t: 'multi', name: 'Hailstones' },
    ],
    extra: { buff: ['Snow Veil', fx(['def', 1], ['spd', 1])] },
  },
  Nature: {
    buff: ['Bloom', fx(['atk', 1], ['def', 1])],
    debuff: ['Spore Cloud', fx(['atk', -2])],
    specials: [
      { t: 'drain', name: 'Life Siphon' },
      { t: 'multi', name: 'Seed Barrage' },
      { t: 'sap', name: 'Tangle Vine', fx: fx(['spd', -1]) },
    ],
    extra: { heal: 'Photosynthesis' },
  },
  Earth: {
    buff: ['Stone Skin', fx(['def', 3], ['spd', -1])],
    debuff: ['Mud Slap', fx(['spd', -1], ['atk', -1])],
    specials: [
      { t: 'heavy', name: 'Seismic Slam' },
      { t: 'sap', name: 'Sand Blast', fx: fx(['atk', -1]) },
      { t: 'boost', name: 'Bedrock Bash', fx: fx(['def', 1]) },
    ],
    extra: { buff: ['Rumble', fx(['atk', 2])] },
  },
  Storm: {
    buff: ['Tailwind', fx(['spd', 2])],
    debuff: ['Static Shock', fx(['def', -1], ['spd', -1])],
    specials: [
      { t: 'quick', name: 'Zap' },
      { t: 'multi', name: 'Static Burst' },
      { t: 'heavy', name: 'Thunder Crash' },
    ],
    extra: { buff: ['Charge Up', fx(['atk', 1], ['spd', 1])] },
  },
  Water: {
    buff: ['Focus Tide', fx(['atk', 1], ['spd', 1])],
    debuff: ['Soak', fx(['atk', -1], ['def', -1])],
    specials: [
      { t: 'drain', name: 'Undertow' },
      { t: 'quick', name: 'Water Dart' },
      { t: 'sap', name: 'Brine Spray', fx: fx(['def', -1]) },
    ],
    extra: { heal: 'Tidal Mend' },
  },
  Metal: {
    buff: ['Reinforce', fx(['def', 2], ['atk', 1])],
    debuff: ['Magnetize', fx(['spd', -2], ['def', -1])],
    specials: [
      { t: 'heavy', name: 'Wrecking Ball' },
      { t: 'boost', name: 'Forge Strike', fx: fx(['atk', 1]) },
      { t: 'multi', name: 'Bullet Spray' },
    ],
    extra: { buff: ['Overclock', fx(['spd', 2])] },
  },
  Toxic: {
    buff: ['Toxic Coat', fx(['def', 1], ['spd', 1])],
    debuff: ['Noxious Fumes', fx(['def', -1], ['atk', -1], ['spd', -1])],
    specials: [
      { t: 'drain', name: 'Leech Venom' },
      { t: 'sap', name: 'Caustic Spray', fx: fx(['def', -1]) },
      { t: 'multi', name: 'Spore Burst' },
    ],
    extra: { heal: 'Regenerate' },
  },
  Shadow: {
    buff: ['Lurk', fx(['spd', 2], ['atk', 1])],
    debuff: ['Dread Gaze', fx(['atk', -2], ['spd', -1])],
    specials: [
      { t: 'quick', name: 'Shadow Step' },
      { t: 'sap', name: 'Fear Claw', fx: fx(['atk', -1]) },
      { t: 'heavy', name: 'Abyss Crash' },
    ],
    extra: { buff: ['Vanish', fx(['spd', 1], ['def', 1])] },
  },
  Light: {
    buff: ['Halo', fx(['def', 1], ['spd', 1], ['atk', 1])],
    debuff: ['Blinding Flash', fx(['spd', -1], ['atk', -1])],
    specials: [
      { t: 'quick', name: 'Flash Step' },
      { t: 'drain', name: 'Sunsoak' },
      { t: 'boost', name: 'Dawn Strike', fx: fx(['spd', 1]) },
    ],
    extra: { heal: 'Bless' },
  },
  Spirit: {
    buff: ['Commune', fx(['atk', 1], ['def', 1])],
    debuff: ['Haunt', fx(['def', -2], ['spd', -1])],
    specials: [
      { t: 'drain', name: 'Soul Sip' },
      { t: 'sap', name: 'Spook', fx: fx(['spd', -1]) },
      { t: 'quick', name: 'Phase Strike' },
    ],
    extra: { heal: 'Soul Mend' },
  },
  Dragon: {
    buff: ['Roar of Kings', fx(['atk', 3], ['def', -1])],
    debuff: ['Terrify', fx(['atk', -1], ['spd', -2])],
    specials: [
      { t: 'heavy', name: 'Dragon Crash' },
      { t: 'boost', name: 'Scale Rush', fx: fx(['spd', 1]) },
      { t: 'multi', name: 'Fang Flurry' },
    ],
    extra: { buff: ['Hoard', fx(['def', 1], ['atk', 1])] },
  },
};

export const attackId = (el: Element, rank: number) => `${el}:${rank}`;
export const buffId = (el: Element) => `${el}:buff`;
export const debuffId = (el: Element) => `${el}:debuff`;
export const specialId = (el: Element, i: number) => `${el}:sp${i}`;
export const extraId = (el: Element) => `${el}:extra`;
export const signatureId = (speciesId: string) => `sig:${speciesId}`;

export const MOVES: Record<string, MoveDef> = {};

function special(el: Element, i: number, s: Special): MoveDef {
  const base = { id: specialId(el, i), name: s.name, element: el, kind: 'attack' as const, rank: -1, effects: [] };
  switch (s.t) {
    case 'quick':
      return { ...base, power: 35, accuracy: 100, priority: true };
    case 'heavy':
      return { ...base, power: 110, accuracy: 85, recoil: 0.25 };
    case 'multi':
      return { ...base, power: 22, accuracy: 95, hits: 3 };
    case 'drain':
      return { ...base, power: 55, accuracy: 100, drain: 0.2 };
    case 'sap':
      return { ...base, power: 50, accuracy: 100, targetAfter: s.fx };
    case 'boost':
      return { ...base, power: 45, accuracy: 100, selfAfter: s.fx };
  }
}

for (const el of ELEMENTS) {
  const kit = KITS[el];
  for (let r = 0; r < 4; r++) {
    const id = attackId(el, r);
    MOVES[id] = { id, name: LINE_NAMES[el][r], element: el, kind: 'attack', rank: r, power: LINE_POWER[r], accuracy: LINE_ACC[r], effects: [] };
  }
  MOVES[buffId(el)] = { id: buffId(el), name: kit.buff[0], element: el, kind: 'buff', rank: -1, power: 0, accuracy: 100, effects: kit.buff[1] };
  MOVES[debuffId(el)] = { id: debuffId(el), name: kit.debuff[0], element: el, kind: 'debuff', rank: -1, power: 0, accuracy: 90, effects: kit.debuff[1] };
  kit.specials.forEach((s, i) => (MOVES[specialId(el, i)] = special(el, i, s)));
  const ex = kit.extra;
  MOVES[extraId(el)] =
    'heal' in ex
      ? { id: extraId(el), name: ex.heal, element: el, kind: 'heal', rank: -1, power: 0, accuracy: 100, effects: [], heal: 0.4 }
      : { id: extraId(el), name: ex.buff[0], element: el, kind: 'buff', rank: -1, power: 0, accuracy: 100, effects: ex.buff[1] };
}

// Moves whose names describe a condition can inflict it (Spark paralyzes, Acid Spit poisons...).
for (const m of Object.values(MOVES)) {
  const st = statusFromName(m.name, m.kind);
  if (st) m.status = st;
}

/** Moves in an element's shared pool (excludes signatures). */
export function elementPool(el: Element): string[] {
  return [0, 1, 2, 3]
    .map((r) => attackId(el, r))
    .concat([buffId(el), debuffId(el), specialId(el, 0), specialId(el, 1), specialId(el, 2), extraId(el)]);
}

// ---------------------------------------------------------------- signatures

export type SignatureKind = 'dualstrike' | 'finisher' | 'frenzy' | 'sap' | 'ambush' | 'overdrive' | 'fortress' | 'curse';
export const SIGNATURE_KINDS: SignatureKind[] = ['dualstrike', 'finisher', 'frenzy', 'sap', 'ambush', 'overdrive', 'fortress', 'curse'];

/** Builds and registers a species' signature move. */
export function registerSignature(speciesId: string, name: string, el: Element, kind: SignatureKind): MoveDef {
  const base = { id: signatureId(speciesId), name, element: el, rank: -1, effects: [] as Fx, signature: speciesId };
  let m: MoveDef;
  switch (kind) {
    case 'dualstrike':
      m = { ...base, kind: 'attack', power: 80, accuracy: 95, bestType: true };
      break;
    case 'finisher':
      m = { ...base, kind: 'attack', power: 65, accuracy: 100, execute: true };
      break;
    case 'frenzy':
      m = { ...base, kind: 'attack', power: 30, accuracy: 95, hits: 3 };
      break;
    case 'sap':
      m = { ...base, kind: 'attack', power: 70, accuracy: 100, drain: 0.2 };
      break;
    case 'ambush':
      m = { ...base, kind: 'attack', power: 60, accuracy: 100, priority: true };
      break;
    case 'overdrive':
      m = { ...base, kind: 'attack', power: 125, accuracy: 95, selfAfter: fx(['def', -1], ['spd', -1]) };
      break;
    case 'fortress':
      m = { ...base, kind: 'heal', power: 0, accuracy: 100, heal: 0.3, effects: fx(['def', 2]) };
      break;
    case 'curse':
      m = { ...base, kind: 'debuff', power: 0, accuracy: 95, effects: fx(['atk', -2], ['def', -2]) };
      break;
  }
  const st = statusFromName(m.name, m.kind);
  if (st) m.status = st;
  MOVES[m.id] = m;
  return m;
}

export const allMoveIds = () => Object.keys(MOVES);

/** Effect an attack gains at skill tier 3. */
export const TIER3_EFFECT: Record<Element, string> = {
  Fire: 'Burns the target',
  Frost: "Lowers target's Speed",
  Nature: 'Drains 15% of damage',
  Earth: "Raises user's Defense",
  Storm: '35% chance to strike again',
  Water: 'Heals 15% of damage',
  Metal: "Raises user's Attack",
  Toxic: 'Poisons the target',
  Shadow: "Lowers target's Attack",
  Light: "Raises user's Speed",
  Spirit: "Lowers target's Defense",
  Dragon: 'Deals 20% bonus damage',
};

export const TIER_POWER = [1, 1, 1.25, 1.5]; // index by tier (1..3)
export const MAX_TIER = 3;
export const MAX_STAGE = 4;

const STAT_NAME: Record<StatKey, string> = { atk: 'ATK', def: 'DEF', spd: 'SPD' };
export const STAT_LABEL = STAT_NAME;

/** Stat effects at a given tier: each tier above 1 adds one stage to the first effect. */
export function effectsAtTier(m: MoveDef, tier: number): StatEffect[] {
  return m.effects.map((e, i) => (i === 0 ? { ...e, stages: e.stages + Math.sign(e.stages) * (tier - 1) } : e));
}

export function healAtTier(m: MoveDef, tier: number): number {
  return (m.heal ?? 0) + 0.1 * (tier - 1);
}

const fmtFx = (list: StatEffect[]) => list.map((e) => `${e.stages > 0 ? '+' : ''}${e.stages} ${STAT_NAME[e.stat]}`).join(', ');

export function describeEffects(m: MoveDef, tier: number): string {
  return (m.kind === 'debuff' ? 'Foe ' : 'Self ') + fmtFx(effectsAtTier(m, tier));
}

/** Short summary for UI. */
export function moveSummary(m: MoveDef, tier: number): string {
  if (m.kind === 'heal') {
    const h = `Heal ${Math.round(healAtTier(m, tier) * 100)}%`;
    return m.effects.length ? `${h}, ${fmtFx(effectsAtTier(m, tier))}` : h;
  }
  const st = m.status ? `${Math.round(m.status.chance * 100)}% ${STATUS[m.status.id].tag}` : '';
  if (m.kind !== 'attack') return describeEffects(m, tier) + (st ? `, ${st}` : '');
  const pow = Math.round(m.power * TIER_POWER[tier]);
  const parts = [m.hits ? `Pow ${pow}×${m.hits}` : `Pow ${pow}`];
  if (m.priority) parts.push('first');
  if (m.drain) parts.push(`drain ${Math.round(m.drain * 100)}%`);
  if (m.recoil) parts.push('recoil');
  if (m.execute) parts.push('x2 vs hurt');
  if (m.bestType) parts.push('best type');
  if (m.targetAfter) parts.push(`foe ${fmtFx(m.targetAfter)}`);
  if (m.selfAfter) parts.push(`self ${fmtFx(m.selfAfter)}`);
  if (st) parts.push(st);
  return parts.join(' · ');
}

/** What a skill-tier upgrade does to this move. */
export function tierUpgradeText(m: MoveDef, toTier: number): string {
  if (m.kind === 'attack') return toTier === 3 ? `+50% power total, ${TIER3_EFFECT[m.element]}` : '+25% power';
  if (m.kind === 'heal') return `Stronger: ${moveSummary(m, toTier)}`;
  return `Stronger: ${describeEffects(m, toTier)}`;
}

/** Expected raw strength of an attack (for AI / auto-learning). */
export function attackValue(m: MoveDef, tier = 1): number {
  if (m.kind !== 'attack') return 0;
  return m.power * TIER_POWER[tier] * (m.hits ?? 1) * (m.accuracy / 100) * (m.recoil ? 0.9 : 1);
}

// ---------------------------------------------------------------- limited uses

/**
 * How many times a move can be used before it needs restoring (rest nodes, the bench, beating a
 * floor boss, Full Restore), or null for unlimited. Basic attacks are always unlimited, so a
 * creature never runs dry; strong attacks, signatures and heals are limited.
 */
export function maxUses(d: MoveDef): number | null {
  if (d.kind === 'heal') return 10;
  if (d.kind === 'buff' || d.kind === 'debuff') return 20;
  if (d.rank === 0 || d.rank === 1) return null;
  if (d.rank === 3 || d.power >= 100) return 10;
  if (d.rank === 2 || d.signature || d.drain || d.power >= 55) return 15;
  return null;
}
