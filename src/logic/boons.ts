import { BOON_LIST, BOONS, isBoon, type BoonDef, type BoonId } from '../data/boons';
import type { Element } from '../data/types';
import { canPrestige, creatureTypes, prestige, stats, type Creature } from './creature';
import { allCreatures, floorBoons, placeRng, saveMeta, type Run } from './run';

/**
 * Boons on a run (2.0): what you hold, the offer on screen, and the curse flags. Offers come from
 * the run's seed (placeRng), so everyone on a shared seed is offered the same boons at the same
 * points. Effects are read where they apply (battle.ts, run.ts, the map and shop).
 */

/** An offer waiting on screen: its boons and how many you take from it. */
export interface BoonOffer {
  ids: BoonId[];
  picks: number;
  /** What kind of offer it is (a curse's reward can be rare or mythic only). */
  mode: OfferMode;
  /** Where it came from, for the seed (the same offer after a reload). */
  tag: string;
}

export type OfferMode = 'normal' | 'rare' | 'mythic';

/** Everything a run keeps about its boons. */
export interface RunBoons {
  held: BoonId[];
  offer: BoonOffer | null;
  /** Offers still to come right after this one (a curse's reward). */
  queue: { mode: OfferMode; picks: number }[];
  /** Fragile: the next offer is rare and mythic only. */
  nextRare?: boolean;
  /** Floor-long curses (Haunted Floor, Exiled): the floor they were taken on. */
  floors?: Record<string, number>;
  /** Second Wind: the floor it was last used on. */
  windFloor?: number;
  /** How many offers there have been (each gets its own seed). */
  offers?: number;
  /** The last Boon hex visited (`floor:node`), so it only offers once. */
  hexDone?: string;
}

export const runBoons = (run: Run): RunBoons => (run.boons ??= { held: [], offer: null, queue: [] });

/** Does the run hold this boon (or curse)? */
export const hasBoon = (run: Run | null | undefined, id: BoonId): boolean => !!run?.boons?.held.includes(id);

/** Boons held, curses left out (each adds a level to guardians). */
export const boonCount = (run: Run): number => (run.boons?.held ?? []).filter((id) => BOONS[id]?.rarity !== 'curse').length;

/** A floor-long curse that's in force on the current floor. */
export const floorCurse = (run: Run, id: 'hauntedfloor' | 'exiled'): boolean => hasBoon(run, id) && run.boons?.floors?.[id] === run.floor;

/** How many Hexlings the main team holds (Glass Menagerie: 3). */
export const teamMax = (run: Run): number => (hasBoon(run, 'glassmenagerie') ? 3 : 4);

/** Guardian levels added by boons: +1 per boon held, +5 when Marked. */
export const guardianBoonLevels = (run: Run): number => boonCount(run) + (hasBoon(run, 'marked') ? 5 : 0);

/** How the weaker elements are favoured in the first slot (bot win rates, BALANCE_REPORT). */
const ELEMENT_WEIGHT: Record<Element, number> = {
  Fire: 3, Frost: 3, Toxic: 2.5, Spirit: 2.5, Water: 2, Storm: 2, Nature: 2, Shadow: 2, Metal: 1.5, Earth: 1, Dragon: 1, Light: 1,
};

/** The boons on offer for this tag (seeded), following the slot rules. */
export function rollOffer(run: Run, tag: string, mode: OfferMode = 'normal'): BoonId[] {
  const rb = runBoons(run);
  const rng = placeRng(run, `boon:${tag}`);
  const taken = new Set<BoonId>(rb.held);
  const free = (b: BoonDef) => !taken.has(b.id);
  const els = new Set<Element>(allCreatures(run).flatMap((c) => creatureTypes(c)));
  const pick = (pool: BoonDef[], weight: (b: BoonDef) => number): BoonId | null => {
    const list = pool.filter(free);
    if (!list.length) return null;
    const w: Record<string, number> = {};
    for (const b of list) w[b.id] = weight(b);
    const id = rng.weighted(w);
    taken.add(id);
    return id;
  };
  const elementW = (b: BoonDef) => (b.element ? ELEMENT_WEIGHT[b.element] : 1) * (b.rarity === 'rare' ? 0.35 : 1);
  const general = BOON_LIST.filter((b) => !b.element && b.rarity === 'common');
  const mythics = BOON_LIST.filter((b) => b.rarity === 'mythic');
  const rares = BOON_LIST.filter((b) => b.rarity === 'rare');
  const curses = BOON_LIST.filter((b) => b.rarity === 'curse');
  const ids: (BoonId | null)[] = [];
  if (mode === 'mythic') {
    for (let i = 0; i < 3; i++) ids.push(pick(mythics, () => 1) ?? pick(rares, () => 1));
  } else if (mode === 'rare') {
    // Rare boons of your team's elements first, then any rare or mythic.
    ids.push(pick(rares.filter((b) => b.element && els.has(b.element)), elementW) ?? pick(rares, () => 1));
    ids.push(pick(rares, () => 1) ?? pick(mythics, () => 1));
    ids.push(pick(mythics, () => 1) ?? pick(rares, () => 1));
  } else {
    // 1: an element boon for your team. 2: a general boon (1 in 10 is mythic). 3: a curse 1 in 4, else general.
    const mine = BOON_LIST.filter((b) => b.element && els.has(b.element) && b.rarity !== 'curse');
    ids.push(pick(mine, elementW) ?? pick(general, () => 1));
    ids.push(rng.chance(0.1) ? (pick(mythics, () => 1) ?? pick(general, () => 1)) : pick(general, () => 1));
    ids.push(rng.chance(0.25) ? (pick(curses, () => 1) ?? pick(general, () => 1)) : (pick(general, () => 1) ?? pick(mine, elementW)));
    // Marked: guardians' offers (and every other) have a fourth choice.
    if (hasBoon(run, 'marked') || run.surprises?.omen === 'bloodmoon') ids.push(pick(general, () => 1) ?? pick(mine, elementW));
  }
  return ids.filter((x): x is BoonId => !!x);
}

/** Put an offer on screen (Pact and Fragile turn it rare). Returns it, or null if nothing's left. */
export function openOffer(run: Run, source: string, mode: OfferMode = 'normal', picks = 1): BoonOffer | null {
  const rb = runBoons(run);
  let m = mode;
  if (m === 'normal' && (rb.nextRare || hasBoon(run, 'pact'))) {
    m = 'rare';
    rb.nextRare = false;
  }
  rb.offers = (rb.offers ?? 0) + 1;
  const tag = `${source}:${rb.offers}`;
  const ids = rollOffer(run, tag, m);
  if (!ids.length) return (rb.offer = null);
  rb.offer = { ids, picks: Math.min(picks, ids.length), mode: m, tag };
  // The Hexlidex's Boons tab shows every boon you've been offered.
  const seen = (run.meta.boonsSeen ??= []);
  const fresh = ids.filter((id) => !seen.includes(id));
  if (fresh.length) {
    seen.push(...fresh);
    saveMeta(run.meta);
  }
  return rb.offer;
}

/** What taking a boon did right away (for the message), if anything. */
export interface PickResult {
  note?: string;
}

/** Take a boon from the open offer. Curses apply their drawback and queue their reward. */
export function takeBoon(run: Run, id: BoonId): PickResult {
  const rb = runBoons(run);
  const offer = rb.offer;
  if (!offer || !offer.ids.includes(id) || !isBoon(id)) return {};
  rb.held.push(id);
  const picks = (run.meta.boonPicks ??= {});
  picks[id] = (picks[id] ?? 0) + 1;
  saveMeta(run.meta);
  offer.ids = offer.ids.filter((x) => x !== id);
  offer.picks -= 1;
  const res = applyBoon(run, id);
  if (offer.picks <= 0 || !offer.ids.length) {
    rb.offer = null;
    const next = rb.queue.shift();
    if (next) openOffer(run, 'reward', next.mode, next.picks);
  }
  return res;
}

/** Skip the rest of the open offer (and anything queued after it). */
export function skipOffer(run: Run) {
  const rb = runBoons(run);
  rb.offer = null;
  const next = rb.queue.shift();
  if (next) openOffer(run, 'reward', next.mode, next.picks);
}

function cutHp(run: Run, by: number) {
  for (const c of allCreatures(run)) {
    const frac = c.hp / stats(c).hp;
    c.hpCut = Math.min(0.6, (c.hpCut ?? 0) + by);
    c.hp = Math.max(1, Math.round(stats(c).hp * frac));
  }
}

/** The run's HP cut from boons, for Hexlings joining later. */
export const runHpCut = (run: Run): number => (hasBoon(run, 'pact') ? 0.25 : 0) + (hasBoon(run, 'fragile') ? 0.2 : 0);

/** A boon's effect at the moment it's taken (most boons just apply from now on). */
function applyBoon(run: Run, id: BoonId): PickResult {
  const rb = runBoons(run);
  switch (id) {
    case 'pact':
      cutHp(run, 0.25);
      return { note: 'Everyone loses a quarter of their max HP. Every offer from now on is rare or mythic.' };
    case 'fragile':
      cutHp(run, 0.2);
      rb.nextRare = true;
      return { note: 'Your next offer will be all rare and mythic.' };
    case 'bloodprice':
      rb.queue.push({ mode: 'normal', picks: 2 });
      return { note: 'Pick 2 more boons.' };
    case 'bankrupt':
      run.coins = 0;
      rb.queue.push({ mode: 'mythic', picks: 1 });
      return { note: 'Your coins are gone. Pick a mythic boon.' };
    case 'fogofwar':
      rb.queue.push({ mode: 'rare', picks: 2 });
      return { note: 'Pick 2 rare boons.' };
    case 'hauntedfloor':
    case 'exiled': {
      (rb.floors ??= {})[id] = run.floor;
      if (id === 'exiled') {
        const best = allCreatures(run).filter(canPrestige).sort((a, b) => b.level - a.level);
        const got: Creature[] = [];
        for (let i = 0; i < 2 && best.length; i++) {
          const c = best[Math.min(i, best.length - 1)];
          if (prestige(c)) got.push(c);
        }
        return { note: got.length ? `Prestige stars for ${[...new Set(got.map((c) => c.speciesId))].length > 1 ? 'your two strongest' : 'your strongest'}!` : undefined };
      }
      return {};
    }
    case 'pathfinder':
      floorBoons(run);
      return { note: 'An extra treasure hex appears on this floor (and every floor after).' };
    case 'glassmenagerie':
      // Down to 3 on the team: the rest wait on the bench.
      while (run.team.length > 3) run.bench.unshift(run.team.pop()!);
      return {};
    default:
      return {};
  }
}

/** Old or broken saves: keep only real boons. */
export function cleanBoons(run: Run) {
  if (!run.boons) return;
  run.boons.held = (run.boons.held ?? []).filter(isBoon);
  if (run.boons.offer) {
    run.boons.offer.ids = (run.boons.offer.ids ?? []).filter(isBoon);
    if (!run.boons.offer.ids.length) run.boons.offer = null;
  }
  run.boons.queue ??= [];
}
