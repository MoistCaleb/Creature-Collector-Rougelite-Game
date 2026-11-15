import type { Element } from './types';

export interface MoveDef {
  name: string;
  element: Element;
  rank: number; // 0..3
  power: number;
  accuracy: number; // 0..100
}

const POWER = [40, 55, 70, 90];
const ACCURACY = [100, 95, 90, 85];

const NAMES: Record<Element, [string, string, string, string]> = {
  Fire: ['Ember', 'Flame Lash', 'Scorch', 'Inferno'],
  Frost: ['Chill', 'Ice Shard', 'Frostbite', 'Blizzard'],
  Nature: ['Vine Snap', 'Leaf Blade', 'Thorn Volley', 'Overgrowth'],
  Earth: ['Pebble Toss', 'Rock Slam', 'Quake', 'Landslide'],
  Storm: ['Spark', 'Gust', 'Thunderclap', 'Tempest'],
  Water: ['Splash Jet', 'Tide Strike', 'Riptide', 'Tsunami'],
};

/** Effect a move gains at skill tier 3. */
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

export function getMove(element: Element, rank: number): MoveDef {
  const r = Math.max(0, Math.min(3, rank));
  return { name: NAMES[element][r], element, rank: r, power: POWER[r], accuracy: ACCURACY[r] };
}
