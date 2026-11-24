import { STATUS, statusFromName, type StatusId } from './status';
import { ELEMENT_COLORS, ELEMENTS, type Element } from './types';

export type MoveKind = 'attack' | 'buff' | 'debuff' | 'heal';
export type StatKey = 'atk' | 'def' | 'spd';

export interface StatEffect {
  stat: StatKey;
  stages: number; // positive = raise, negative = lower
}

/**
 * A move's element: one of the 12, or Neutral (a few utility moves, never attacks, that hit no
 * element's weakness and get no same-type bonus).
 */
export type MoveElement = Element | 'Neutral';

export const NEUTRAL_COLOR = 0xb4b0c8;
/** The color a move shows in (Neutral: soft gray). */
export const moveColor = (el: MoveElement): number => (el === 'Neutral' ? NEUTRAL_COLOR : ELEMENT_COLORS[el]);
/** An attack's element (attacks always have one of the 12). */
export const attackEl = (m: MoveDef): Element => m.element as Element;

export interface MoveDef {
  id: string;
  name: string;
  element: MoveElement;
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
  /** Team move: an effect on the user's whole side (see TEAM_FX). */
  team?: TeamFxId;
  /** Bulwark: goes first and blocks the foe's attacks this turn (unreliable used twice in a row). */
  protect?: boolean;
  /** Time Warp: for a few turns the slower Hexling moves first (using it again ends it). */
  warp?: boolean;
  /** Speed attacks: power grows the faster ('fast') or the slower ('slow') the user is than the foe. */
  speedPower?: 'fast' | 'slow';
  /** Weather moves: change the battle's weather for a few turns (see WEATHER). */
  weather?: WeatherId;
  /** The other Neutral moves that bend the battle for a turn or a few (see NEUTRAL). */
  neutral?: NeutralFx;
}

// ---------------------------------------------------------------- team moves

/**
 * Team effects cover the user's whole side, not just the creature using them: they stay up for a
 * few turns whoever is out, so switching doesn't throw them away. Mend is instant instead.
 */
export type TeamFxId = 'rally' | 'guard' | 'tailwind' | 'ward' | 'venom' | 'shroud' | 'mend';

export const TEAM_FX: Record<TeamFxId, { name: string; tag: string; short: string; color: number; desc: string }> = {
  rally: { name: 'Power Boost', tag: 'DMG +25%', short: '+25% damage', color: 0xff7a3a, desc: 'your team deals 25% more damage' },
  guard: { name: 'Shield Wall', tag: 'SHIELD -25%', short: '-25% dmg taken', color: 0xc9a36a, desc: 'your team takes 25% less damage' },
  tailwind: { name: 'Speed Boost', tag: 'SPEED +50%', short: '+50% speed', color: 0xf0d040, desc: 'your team is 50% faster' },
  ward: { name: 'Status Guard', tag: 'NO STATUS', short: 'status immune', color: 0x8fdcf0, desc: "your team can't get status conditions" },
  venom: { name: 'Poison Coating', tag: 'POISON HITS', short: '30% poison hits', color: 0xb05ae0, desc: "your team's hits may poison (30%)" },
  shroud: { name: 'Dodge Boost', tag: 'DODGE +20%', short: 'foes miss +20%', color: 0x7a6aa0, desc: 'attacks on your team miss 20% more' },
  mend: { name: 'Team Heal', tag: 'HEAL', short: 'heal + cure', color: 0x5ad06a, desc: 'heals your whole team and cures their status' },
};

/** Turns a team effect lasts (counting the turn it's used); skill tiers add one each. */
export const teamFxTurns = (tier: number) => 4 + tier;
/** Mend: share of max HP every teammate gets back. */
export const mendHeal = (tier: number) => 0.15 + 0.05 * (tier - 1);

const TEAM_MOVES: Record<Element, [string, TeamFxId]> = {
  Fire: ['Blaze Power Boost', 'rally'],
  Dragon: ['Dragon Power Boost', 'rally'],
  Earth: ['Stone Shield Wall', 'guard'],
  Metal: ['Iron Shield Wall', 'guard'],
  Storm: ['Storm Speed Boost', 'tailwind'],
  Spirit: ['Spirit Speed Boost', 'tailwind'],
  Light: ['Holy Status Guard', 'ward'],
  Frost: ['Frost Status Guard', 'ward'],
  Toxic: ['Poison Coating', 'venom'],
  Shadow: ['Shadow Dodge Boost', 'shroud'],
  Nature: ['Bloom Team Heal', 'mend'],
  Water: ['Tide Team Heal', 'mend'],
};
export const teamMoveId = (el: Element) => `${el}:team`;

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
      // Fire is fast but frail: a draining hit and a defensive buff give it staying power.
      { t: 'drain', name: 'Cauterize' },
    ],
    extra: { buff: ['Heat Haze', fx(['def', 2])] },
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
  const [teamName, teamFx] = TEAM_MOVES[el];
  MOVES[teamMoveId(el)] = { id: teamMoveId(el), name: teamName, element: el, kind: 'buff', rank: -1, power: 0, accuracy: 100, effects: [], team: teamFx };
  const ex = kit.extra;
  MOVES[extraId(el)] =
    'heal' in ex
      ? { id: extraId(el), name: ex.heal, element: el, kind: 'heal', rank: -1, power: 0, accuracy: 100, effects: [], heal: 0.4 }
      : { id: extraId(el), name: ex.buff[0], element: el, kind: 'buff', rank: -1, power: 0, accuracy: 100, effects: ex.buff[1] };
}

// ---------------------------------------------------------------- neutral and speed moves

export const BULWARK_ID = 'Neutral:bulwark';
export const WARP_ID = 'Neutral:warp';
export const fastId = (el: Element) => `${el}:fast`;
export const slowId = (el: Element) => `${el}:slow`;

MOVES[BULWARK_ID] = { id: BULWARK_ID, name: 'Bulwark', element: 'Neutral', kind: 'buff', rank: -1, power: 0, accuracy: 100, effects: [], priority: true, protect: true };
MOVES[WARP_ID] = { id: WARP_ID, name: 'Time Warp', element: 'Neutral', kind: 'buff', rank: -1, power: 0, accuracy: 100, effects: [], warp: true };

/**
 * More Neutral moves that disrupt the battle for a turn or a few. The ones aimed at the foe are
 * Hinder moves: Bulwark blocks them and Mirror Veil bounces them back.
 */
export type NeutralFx = 'jeer' | 'echo' | 'veil' | 'swap' | 'smoke' | 'toll' | 'snare' | 'hush' | 'daynight';
export const NEUTRAL: Record<NeutralFx, { id: string; name: string; foe: boolean; uses: number }> = {
  jeer: { id: 'Neutral:jeer', name: 'Jeer', foe: true, uses: 6 },
  echo: { id: 'Neutral:echo', name: 'Echo', foe: true, uses: 5 },
  veil: { id: 'Neutral:veil', name: 'Mirror Veil', foe: false, uses: 5 },
  swap: { id: 'Neutral:swap', name: 'Switcheroo', foe: true, uses: 5 },
  smoke: { id: 'Neutral:smoke', name: 'Smokescreen', foe: false, uses: 5 },
  toll: { id: 'Neutral:toll', name: 'Toll', foe: true, uses: 4 },
  snare: { id: 'Neutral:snare', name: 'Snare', foe: true, uses: 5 },
  hush: { id: 'Neutral:hush', name: 'Hush', foe: true, uses: 5 },
  daynight: { id: 'Neutral:daynight', name: 'Turn of Day', foe: false, uses: 4 },
};
export const NEUTRAL_IDS = Object.values(NEUTRAL).map((n) => n.id);
for (const [k, n] of Object.entries(NEUTRAL) as [NeutralFx, (typeof NEUTRAL)[NeutralFx]][])
  MOVES[n.id] = { id: n.id, name: n.name, element: 'Neutral', kind: n.foe ? 'debuff' : 'buff', rank: -1, power: 0, accuracy: 100, effects: [], neutral: k, ...(k === 'veil' ? { priority: true } : {}) };

/** Jeer: turns the foe can only attack. */
export const jeerTurns = (tier: number) => 2 + tier;
/** Echo: turns the foe must repeat its last move. */
export const echoTurns = (tier: number) => 1 + tier;
/** Mirror Veil: damage it also takes off this turn's hits, by tier. */
export const veilCut = (tier: number) => [0, 0, 0.15, 0.3][tier] ?? 0;
/** Toll: turns until it rings, and the share of max HP it takes. */
export const TOLL_TURNS = 3;
export const tollDamage = (tier: number) => 0.3 + 0.05 * tier;
/** Snare: turns the foe can't switch out, and the Speed it loses. */
export const snareTurns = (tier: number) => 2 + tier;
export const snareSpeed = (tier: number) => (tier >= 3 ? 2 : 1);
/** Hush: turns the foe's trait is silenced. */
export const hushTurns = (tier: number) => 2 + tier;
/** Switcheroo, Smokescreen, Turn of Day: Speed the user gains afterward at higher tiers. */
export const neutralHaste = (tier: number) => tier - 1;

/** The short line for a Neutral move. */
function neutralSummary(n: NeutralFx, tier: number): string {
  const haste = neutralHaste(tier) ? `, +${neutralHaste(tier)} Spd` : '';
  switch (n) {
    case 'jeer':
      return `Foe ${jeerTurns(tier)}t: attacks only`;
    case 'echo':
      return `Foe ${echoTurns(tier)}t: repeats its last move`;
    case 'veil':
      return `First · bounces Hinders back${veilCut(tier) ? ` · −${Math.round(veilCut(tier) * 100)}% dmg` : ''}`;
    case 'swap':
      return `Swap stat changes with foe${haste}`;
    case 'smoke':
      return `Clear stats, weather, warp${haste}`;
    case 'toll':
      return `Foe −${Math.round(tollDamage(tier) * 100)}% HP in ${TOLL_TURNS}t if it stays`;
    case 'snare':
      return `Foe ${snareTurns(tier)}t: can't switch · −${snareSpeed(tier)} Spd`;
    case 'hush':
      return `Foe ${hushTurns(tier)}t: trait silenced`;
    case 'daynight':
      return `Day ⇄ night (night ends sun)${haste}`;
  }
}

/** Bulwark used again right after it worked: the chance it holds (better at higher skill tiers). */
export const bulwarkRepeat = (tier: number) => [0, 0.25, 1 / 3, 0.5][tier] ?? 0.25;
/** Turns Time Warp lasts (counting the turn it's used): 5, then +1 per skill tier. */
export const warpTurns = (tier: number) => 5 + (tier - 1);

// ---------------------------------------------------------------- weather

/**
 * Battle weather, only ever set by a move (a handful of lines learn one). It lasts a few turns and
 * powers up one element's attacks; sun and rain also weaken the opposite element, and dust and hail
 * wear down every Hexling not of a sheltered element at the end of each turn.
 */
export type WeatherId = 'sun' | 'rain' | 'dust' | 'hail';

export interface WeatherDef {
  name: string;
  /** The move that calls it. */
  move: string;
  element: Element;
  up: Element;
  down?: Element;
  /** Dust and hail: elements that don't take the end-of-turn chip. */
  shelter?: Element[];
  start: string;
  end: string;
  tag: string;
  color: number;
}

export const WEATHER: Record<WeatherId, WeatherDef> = {
  sun: { name: 'Scorching sun', move: 'Scorching Sky', element: 'Fire', up: 'Fire', down: 'Water', start: 'The sunlight turned scorching!', end: 'The sunlight faded.', tag: 'SUN', color: 0xffa83a },
  rain: { name: 'Downpour', move: 'Downpour', element: 'Water', up: 'Water', down: 'Fire', start: 'Rain began to pour!', end: 'The rain stopped.', tag: 'RAIN', color: 0x5ab8ff },
  dust: { name: 'Dust storm', move: 'Dust Storm', element: 'Earth', up: 'Earth', shelter: ['Earth', 'Metal'], start: 'A dust storm kicked up!', end: 'The dust settled.', tag: 'DUST', color: 0xd8b070 },
  hail: { name: 'Hail', move: 'Hail Front', element: 'Frost', up: 'Frost', shelter: ['Frost'], start: 'It started to hail!', end: 'The hail stopped.', tag: 'HAIL', color: 0xbfe8ff },
};
export const WEATHER_IDS = Object.keys(WEATHER) as WeatherId[];
export const WEATHER_UP = 1.3;
export const WEATHER_DOWN = 0.7;
/** Dust and hail: share of max HP lost at the end of each turn. */
export const WEATHER_CHIP = 1 / 16;
export const weatherId = (w: WeatherId) => `Weather:${w}`;
/** Turns weather lasts: 5, then +1 per skill tier. */
export const weatherTurns = (tier: number) => 5 + (tier - 1);
for (const w of WEATHER_IDS) {
  const d = WEATHER[w];
  MOVES[weatherId(w)] = { id: weatherId(w), name: d.move, element: d.element, kind: 'buff', rank: -1, power: 0, accuracy: 100, effects: [], weather: w };
}

/** Damage multiplier the weather gives an attack of this element. */
export function weatherMult(w: WeatherId | null | undefined, el: Element): number {
  if (!w) return 1;
  const d = WEATHER[w];
  return el === d.up ? WEATHER_UP : el === d.down ? WEATHER_DOWN : 1;
}

/** "Fire +30%, Water −30%" / "Earth +30%, chips non-Earth/Metal". */
export function weatherShort(w: WeatherId): string {
  const d = WEATHER[w];
  const parts = [`${d.up} +30%`];
  if (d.down) parts.push(`${d.down} −30%`);
  if (d.shelter) parts.push(`hurts non-${d.shelter.join('/')}`);
  return parts.join(', ');
}

/** Speed attacks: the most and least power they can have. */
export const SPEED_POWER_MAX = 90;
export const SPEED_POWER_MIN = 40;

/**
 * Speed attacks: power by how much faster (or slower) the user is than its foe. A smooth curve
 * (2.0): 60 when evenly matched, about 67 at 1.2×, 76 at 1.5×, 90 at twice as fast (the most);
 * 40 at half (the least).
 */
export function speedPower(ratio: number): number {
  return Math.round(Math.max(SPEED_POWER_MIN, Math.min(SPEED_POWER_MAX, 60 * Math.pow(Math.max(0.01, ratio), 0.58))));
}

const SPEED_WORD: Record<Element, string> = {
  Fire: 'Blaze', Frost: 'Glacier', Nature: 'Bramble', Earth: 'Boulder', Storm: 'Volt', Water: 'Torrent',
  Metal: 'Iron', Toxic: 'Mire', Shadow: 'Shade', Light: 'Radiant', Spirit: 'Phantom', Dragon: 'Drake',
};
for (const el of ELEMENTS) {
  MOVES[fastId(el)] = { id: fastId(el), name: `${SPEED_WORD[el]} Blitz`, element: el, kind: 'attack', rank: -1, power: 80, accuracy: 100, effects: [], speedPower: 'fast' };
  MOVES[slowId(el)] = { id: slowId(el), name: `${SPEED_WORD[el]} Crush`, element: el, kind: 'attack', rank: -1, power: 80, accuracy: 90, effects: [], speedPower: 'slow' };
}

/**
 * The shared attacks that can inflict a condition: one to three per element, so a condition is part
 * of an element's identity without riding on every hit. (Status-type moves still inflict theirs, and
 * signatures named for a condition keep it.)
 */
export const STATUS_ATTACKS = new Set([
  'Ember', 'Scorch', // Fire: burn
  'Frostbite', 'Hailstones', // Frost: freeze
  'Thunderclap', 'Static Burst', // Storm: paralysis
  'Venom Fang', 'Sludge Bomb', 'Spore Burst', // Toxic: poison
  'Night Slash', 'Fear Claw', // Shadow: confusion
  'Prism Lance', // Light: confusion
  'Wisp Touch', 'Spook', // Spirit: sleep, confusion
]);

// Moves whose names describe a condition can inflict it (Thunderclap paralyzes, Venom Fang
// poisons...): every status-type move, and only the listed shared attacks.
for (const m of Object.values(MOVES)) {
  if (m.kind === 'attack' && !STATUS_ATTACKS.has(m.name)) continue;
  const st = statusFromName(m.name, m.kind);
  // Multi-hit moves roll on every hit, so each roll gets about half the chance.
  if (st && m.hits) st.chance = Math.max(0.05, Math.round((st.chance / 2) * 20) / 20);
  if (st) m.status = st;
}

/** Moves in an element's shared pool (excludes signatures). */
export function elementPool(el: Element): string[] {
  return [0, 1, 2, 3]
    .map((r) => attackId(el, r))
    .concat([buffId(el), debuffId(el), specialId(el, 0), specialId(el, 1), specialId(el, 2), extraId(el), teamMoveId(el)]);
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

/**
 * Stat effects at a given tier: each tier above 1 adds one stage to the first effect, up to the
 * stage cap. A tier that would go past the cap drops the move's drawback (an effect the other way)
 * instead, so every upgrade does something (Stone Skin T3: +4 DEF, no SPD loss).
 */
export function effectsAtTier(m: MoveDef, tier: number): StatEffect[] {
  const [first, ...rest] = m.effects;
  if (!first) return [];
  const raw = first.stages + Math.sign(first.stages) * (tier - 1);
  if (Math.abs(raw) <= MAX_STAGE) return [{ ...first, stages: raw }, ...rest];
  const sign = Math.sign(first.stages);
  return [{ ...first, stages: sign * MAX_STAGE }, ...rest.filter((e) => Math.sign(e.stages) === sign)];
}

export function healAtTier(m: MoveDef, tier: number): number {
  return (m.heal ?? 0) + 0.1 * (tier - 1);
}

const fmtFx = (list: StatEffect[]) => list.map((e) => `${e.stages > 0 ? '+' : ''}${e.stages} ${STAT_NAME[e.stat]}`).join(', ');

export function describeEffects(m: MoveDef, tier: number): string {
  return (m.kind === 'debuff' ? 'Foe ' : 'Self ') + fmtFx(effectsAtTier(m, tier));
}

/** Hit chance, shown next to every move. */
export const accText = (m: MoveDef) => `${m.accuracy}% acc`;

/** Short summary for UI. */
export function moveSummary(m: MoveDef, tier: number): string {
  if (m.protect) return `First · blocks hits · reuse ${Math.round(bulwarkRepeat(tier) * 100)}%`;
  if (m.warp) return `${warpTurns(tier)} turns: slower goes first`;
  if (m.neutral) return neutralSummary(m.neutral, tier);
  if (m.weather) return `${weatherTurns(tier)}t ${WEATHER[m.weather].tag}: ${weatherShort(m.weather)}`;
  if (m.team === 'mend') return `Team: heal ${Math.round(mendHeal(tier) * 100)}% + cure`;
  if (m.team) return `Team ${teamFxTurns(tier)}t: ${TEAM_FX[m.team].short}`;
  if (m.kind === 'heal') {
    const h = `Heal ${Math.round(healAtTier(m, tier) * 100)}%`;
    return m.effects.length ? `${h}, ${fmtFx(effectsAtTier(m, tier))}` : h;
  }
  // Multi-hit moves roll their condition on every hit.
  const st = m.status ? `${Math.round(m.status.chance * 100)}% ${STATUS[m.status.id].tag}${m.hits ? '/hit' : ''}` : '';
  if (m.kind !== 'attack') return describeEffects(m, tier) + (st ? `, ${st}` : '');
  const pow = Math.round(m.power * TIER_POWER[tier]);
  const parts = [
    m.speedPower
      ? `Pow ${Math.round(SPEED_POWER_MIN * TIER_POWER[tier])}–${Math.round(SPEED_POWER_MAX * TIER_POWER[tier])} · best if ${m.speedPower === 'fast' ? 'faster' : 'slower'}`
      : m.hits
        ? `Pow ${pow}×${m.hits}`
        : `Pow ${pow}`,
  ];
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
  if (m.protect || m.warp || m.weather || m.neutral) return `Stronger: ${moveSummary(m, toTier)}`;
  if (m.kind === 'attack') return toTier === 3 ? `+50% power total, ${TIER3_EFFECT[attackEl(m)]}` : '+25% power';
  if (m.kind === 'heal' || m.team) return `Stronger: ${moveSummary(m, toTier)}`;
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
  if (d.protect) return 4;
  if (d.warp || d.weather) return 5;
  if (d.neutral) return NEUTRAL[d.neutral].uses;
  if (d.team) return 8;
  if (d.kind === 'heal') return 10;
  if (d.kind === 'buff' || d.kind === 'debuff') return 20;
  if (d.rank === 0 || d.rank === 1) return null;
  if (d.rank === 3 || d.power >= 100) return 10;
  if (d.rank === 2 || d.signature || d.drain || d.power >= 55) return 15;
  return null;
}

/** "10 uses" or "unlimited uses", for a move at full uses. */
export function maxUsesText(d: MoveDef): string {
  const max = maxUses(d);
  return max === null ? 'unlimited uses' : `${max} uses`;
}
