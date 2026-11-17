import { FREE_COLORS, HATS, LOOK_PARTS, SHOES, TOPS, type TrainerLook } from '../data/trainerLook';
import type { Meta } from './run';

/**
 * Gilded milestones: collect Gilded species (catch a Gilded Hexling in any form to own its line)
 * and earn trainer titles and gilded outfit pieces. Gilded gear is never worn by NPC trainers,
 * so online it shows you've been hunting.
 */
export interface GildedMilestone {
  /** Gilded species needed. */
  count: number;
  /** A title you can show under your name. */
  title?: string;
  /** Outfit pieces it unlocks, as look parts and option indexes. */
  unlocks: { keys: (keyof TrainerLook)[]; value: number; name: string }[];
}

const COLOR_KEYS: (keyof TrainerLook)[] = ['hatColor', 'topColor', 'accent', 'bottomColor', 'shoeColor'];

export const GILDED_MILESTONES: GildedMilestone[] = [
  { count: 5, title: 'Gilded Seeker', unlocks: [{ keys: ['hat'], value: HATS.indexOf('Gilded laurel'), name: 'Hat: Gilded laurel' }] },
  {
    count: 15,
    unlocks: [
      { keys: ['top'], value: TOPS.indexOf('Gilded coat'), name: 'Top: Gilded coat' },
      { keys: ['shoes'], value: SHOES.indexOf('Gilded boots'), name: 'Shoes: Gilded boots' },
    ],
  },
  { count: 30, title: 'Gilded Collector', unlocks: [{ keys: ['hat'], value: HATS.indexOf('Gilded crown'), name: 'Hat: Gilded crown' }] },
  { count: 60, title: 'Gilded Legend', unlocks: [{ keys: COLOR_KEYS, value: FREE_COLORS, name: 'Color: Gilded (any clothing)' }] },
  { count: 120, title: 'Gilded Master', unlocks: [{ keys: ['aura'], value: 1, name: 'Aura: Golden glow' }] },
];

/** How many species you own Gilded. */
export const gildedCount = (meta: Meta): number => (meta.shinyOwned ?? []).length;

/** The milestone that unlocks this look option, if it's locked for you (null: you can wear it). */
export function lockedBy(meta: Meta, key: keyof TrainerLook, value: number): GildedMilestone | null {
  const part = LOOK_PARTS.find((p) => p.key === key);
  if (!part || value < (part.free ?? part.names.length)) return null;
  const m = GILDED_MILESTONES.find((x) => x.unlocks.some((u) => u.keys.includes(key) && u.value === value));
  if (!m) return null;
  return gildedCount(meta) >= m.count ? null : m;
}

/** The next milestone to reach, if any. */
export function nextMilestone(meta: Meta): GildedMilestone | null {
  const n = gildedCount(meta);
  return GILDED_MILESTONES.find((m) => m.count > n) ?? null;
}

/**
 * Milestones reached since they were last announced (and marks them announced). Their titles are
 * worn and announced through takeNewTitles (logic/titles). Caller saves meta.
 */
export function takeNewMilestones(meta: Meta): GildedMilestone[] {
  const n = gildedCount(meta);
  const seen = meta.gildedAnnounced ?? 0;
  const fresh = GILDED_MILESTONES.filter((m) => m.count > seen && m.count <= n);
  if (fresh.length) meta.gildedAnnounced = Math.max(...fresh.map((m) => m.count));
  return fresh;
}

/** The announcement text for reached milestones. */
export function milestoneText(ms: GildedMilestone[]): string {
  return ms
    .map((m) => [`${m.count} Gilded species!`, ...(m.title ? [`Title: ${m.title}`] : []), ...m.unlocks.map((u) => u.name)].join('\n'))
    .join('\n\n');
}
