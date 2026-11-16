import type { Element } from './types';

export interface MapDef {
  id: string;
  name: string;
  desc: string;
  /** Element of floors 1-3, or null for random. */
  biomes: [Element, Element, Element] | null;
  /** Runs won (across all runs) needed to unlock. */
  winsToUnlock: number;
}

export const MAPS: MapDef[] = [
  { id: 'wildlands', name: 'Wildlands', desc: 'Every floor is a random element.', biomes: null, winsToUnlock: 0 },
  { id: 'verdant', name: 'Verdant Hollow', desc: 'Overgrown caves full of rot and roots.', biomes: ['Nature', 'Toxic', 'Earth'], winsToUnlock: 0 },
  { id: 'tidal', name: 'Tidal Depths', desc: 'Sunken halls where storms meet the ice.', biomes: ['Water', 'Frost', 'Storm'], winsToUnlock: 1 },
  { id: 'volcanic', name: 'Volcanic Rift', desc: 'Molten tunnels guarded by drakes.', biomes: ['Fire', 'Earth', 'Dragon'], winsToUnlock: 2 },
  { id: 'ironworks', name: 'Ironworks', desc: 'Abandoned forges, sparking and burning.', biomes: ['Metal', 'Storm', 'Fire'], winsToUnlock: 3 },
  { id: 'haunted', name: 'Haunted Spires', desc: 'Towers of shadow, spirits and plague.', biomes: ['Shadow', 'Spirit', 'Toxic'], winsToUnlock: 4 },
  { id: 'frozen', name: 'Frozen Wastes', desc: 'Whiteout plains where the dead linger.', biomes: ['Frost', 'Spirit', 'Water'], winsToUnlock: 5 },
  { id: 'celestial', name: 'Celestial Peaks', desc: 'Sunlit summits ruled by dragons.', biomes: ['Light', 'Storm', 'Dragon'], winsToUnlock: 6 },
];

export const MAP_BY_ID: Record<string, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]));

export function mapUnlocked(m: MapDef, wins: number): boolean {
  return wins >= m.winsToUnlock;
}
