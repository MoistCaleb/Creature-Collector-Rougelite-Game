import { ELEMENTS, type Element } from './types';

export type MoveKind = 'attack' | 'buff' | 'debuff';
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
  rank: number; // attacks: 0..3 (status moves: -1)
  power: number; // 0 for status moves
  accuracy: number; // 0..100
  /** Status moves: stat stage changes (buff → user, debuff → target). */
  effects: StatEffect[];
}

const POWER = [40, 55, 70, 90];
const ACCURACY = [100, 95, 90, 85];

const ATTACK_NAMES: Record<Element, [string, string, string, string]> = {
  Fire: ['Ember', 'Flame Lash', 'Scorch', 'Inferno'],
  Frost: ['Chill', 'Ice Shard', 'Frostbite', 'Blizzard'],
  Nature: ['Vine Snap', 'Leaf Blade', 'Thorn Volley', 'Overgrowth'],
  Earth: ['Pebble Toss', 'Rock Slam', 'Quake', 'Landslide'],
  Storm: ['Spark', 'Gust', 'Thunderclap', 'Tempest'],
  Water: ['Splash Jet', 'Tide Strike', 'Riptide', 'Tsunami'],
};

const STATUS: Record<Element, { buff: [string, StatEffect[]]; debuff: [string, StatEffect[]] }> = {
  Fire: {
    buff: ['Kindle', [{ stat: 'atk', stages: 2 }]],
    debuff: ['Searing Glare', [{ stat: 'def', stages: -2 }]],
  },
  Frost: {
    buff: ['Frost Armor', [{ stat: 'def', stages: 2 }]],
    debuff: ['Numbing Chill', [{ stat: 'spd', stages: -2 }]],
  },
  Nature: {
    buff: ['Bloom', [{ stat: 'atk', stages: 1 }, { stat: 'def', stages: 1 }]],
    debuff: ['Spore Cloud', [{ stat: 'atk', stages: -2 }]],
  },
  Earth: {
    buff: ['Stone Skin', [{ stat: 'def', stages: 3 }, { stat: 'spd', stages: -1 }]],
    debuff: ['Mud Slap', [{ stat: 'spd', stages: -1 }, { stat: 'atk', stages: -1 }]],
  },
  Storm: {
    buff: ['Tailwind', [{ stat: 'spd', stages: 2 }]],
    debuff: ['Static Shock', [{ stat: 'def', stages: -1 }, { stat: 'spd', stages: -1 }]],
  },
  Water: {
    buff: ['Focus Tide', [{ stat: 'atk', stages: 1 }, { stat: 'spd', stages: 1 }]],
    debuff: ['Soak', [{ stat: 'atk', stages: -1 }, { stat: 'def', stages: -1 }]],
  },
};

export const attackId = (el: Element, rank: number) => `${el}:${rank}`;
export const buffId = (el: Element) => `${el}:buff`;
export const debuffId = (el: Element) => `${el}:debuff`;

export const MOVES: Record<string, MoveDef> = {};
for (const el of ELEMENTS) {
  for (let r = 0; r < 4; r++) {
    const id = attackId(el, r);
    MOVES[id] = { id, name: ATTACK_NAMES[el][r], element: el, kind: 'attack', rank: r, power: POWER[r], accuracy: ACCURACY[r], effects: [] };
  }
  const [bn, be] = STATUS[el].buff;
  const [dn, de] = STATUS[el].debuff;
  MOVES[buffId(el)] = { id: buffId(el), name: bn, element: el, kind: 'buff', rank: -1, power: 0, accuracy: 100, effects: be };
  MOVES[debuffId(el)] = { id: debuffId(el), name: dn, element: el, kind: 'debuff', rank: -1, power: 0, accuracy: 90, effects: de };
}
export const ALL_MOVE_IDS = Object.keys(MOVES);

/** Effect an attack gains at skill tier 3. */
export const TIER3_EFFECT: Record<Element, string> = {
  Fire: 'Burns the target',
  Frost: "Lowers target's Speed",
  Nature: 'Drains 40% of damage',
  Earth: "Raises user's Defense",
  Storm: '35% chance to strike twice',
  Water: 'Heals user 15% max HP',
};

export const TIER_POWER = [1, 1, 1.25, 1.5]; // index by tier (1..3)
export const MAX_TIER = 3;
export const MAX_STAGE = 4;

const STAT_NAME: Record<StatKey, string> = { atk: 'ATK', def: 'DEF', spd: 'SPD' };

/** Stat effects at a given tier: each tier above 1 adds one stage to the first effect. */
export function effectsAtTier(m: MoveDef, tier: number): StatEffect[] {
  return m.effects.map((e, i) => (i === 0 ? { ...e, stages: e.stages + Math.sign(e.stages) * (tier - 1) } : e));
}

export function describeEffects(m: MoveDef, tier: number): string {
  const who = m.kind === 'buff' ? 'Self' : 'Foe';
  return (
    who +
    ' ' +
    effectsAtTier(m, tier)
      .map((e) => `${e.stages > 0 ? '+' : ''}${e.stages} ${STAT_NAME[e.stat]}`)
      .join(', ')
  );
}

/** Short summary for UI: power for attacks, effects for status moves. */
export function moveSummary(m: MoveDef, tier: number): string {
  if (m.kind === 'attack') return `Pow ${Math.round(m.power * TIER_POWER[tier])}`;
  return describeEffects(m, tier);
}

/** What a skill-tier upgrade does to this move. */
export function tierUpgradeText(m: MoveDef, toTier: number): string {
  if (m.kind === 'attack') return toTier === 3 ? `+50% power total, ${TIER3_EFFECT[m.element]}` : '+25% power';
  return `Stronger: ${describeEffects(m, toTier)}`;
}

export const STAT_LABEL = STAT_NAME;
