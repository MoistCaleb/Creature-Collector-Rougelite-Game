import { BOON_LIST, BOONS, type BoonDef } from '../data/boons';
import { SURPRISE_LIST } from '../data/surprises';
import { TRAITS, type TraitDef } from '../data/traitTable';
import { ELEMENTS } from '../data/types';
import { WORKSHOP } from '../data/workshop';
import { CAMP_HEARTS } from './camp';
import type { Meta } from './run';

/**
 * 2.0's long-term feats, counted once for the titles, the leaderboards and the Records page:
 * the Workshop, max-bond lines, rare surprises, Elders and mythic boons, plus favourite boons
 * and trait.
 */

/** A friend's ghost needs friends, so it isn't needed for the collection titles. */
export const COLLECTABLE = SURPRISE_LIST.filter((s) => s.id !== 'ghost');
export const MYTHICS = BOON_LIST.filter((b) => b.rarity === 'mythic');

/** Workshop upgrades you own. */
export const workshopOwned = (m: Meta): number => WORKSHOP.filter((u) => (m.camp?.workshop ?? []).includes(u.id)).length;

/** Lines with all five bond hearts. */
export const maxBondLines = (m: Meta): number => {
  const max = CAMP_HEARTS[CAMP_HEARTS.length - 1];
  return Object.values(m.camp?.bond ?? {}).filter((p) => p >= max).length;
};

/** Rare surprises found (the friend's ghost not counted). */
export const surprisesFound = (m: Meta): number => COLLECTABLE.filter((s) => (m.surprisesFound ?? []).includes(s.id)).length;

/** Lands whose Elder guardian you've beaten. */
export const eldersBeaten = (m: Meta): number => ELEMENTS.filter((e) => (m.eldersBeaten ?? []).includes(e)).length;

/** Different mythic boons you've taken. */
export const mythicsFound = (m: Meta): number => MYTHICS.filter((b) => (m.boonPicks?.[b.id] ?? 0) > 0).length;

/** Boons taken in all (curses included). */
export const boonsTaken = (m: Meta): number => Object.entries(m.boonPicks ?? {}).reduce((n, [id, k]) => n + (BOONS[id] ? k : 0), 0);

/** The boons you take most, most first (ties: the rarer one first). */
export function topBoons(m: Meta, n: number): { boon: BoonDef; picks: number }[] {
  const order = ['mythic', 'rare', 'common', 'curse'];
  return Object.entries(m.boonPicks ?? {})
    .filter(([id, k]) => BOONS[id] && k > 0)
    .map(([id, picks]) => ({ boon: BOONS[id], picks }))
    .sort((a, b) => b.picks - a.picks || order.indexOf(a.boon.rarity) - order.indexOf(b.boon.rarity))
    .slice(0, n);
}

/** The trait that's finished the most runs on your team (counted from 2.0's runs). */
export function favouriteTrait(m: Meta): { trait: TraitDef; runs: number } | null {
  const best = Object.entries(m.traitUsage ?? {})
    .filter(([id, k]) => TRAITS[id as keyof typeof TRAITS] && k > 0)
    .sort((a, b) => b[1] - a[1])[0];
  return best ? { trait: TRAITS[best[0] as keyof typeof TRAITS], runs: best[1] } : null;
}
