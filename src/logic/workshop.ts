import {
  branchUpgrades,
  LORE_BOONS,
  LORE_SURPRISES,
  WORKSHOP,
  WORKSHOP_BRANCHES,
  WORKSHOP_BY_ID,
  WORKSHOP_TOTAL,
  type WorkshopBranch,
  type WorkshopId,
  type WorkshopUpgrade,
} from '../data/workshop';
import { camp } from './camp';
import type { Meta, Run } from './run';

/**
 * The Workshop (2.0): upgrades bought with embers at camp (data/workshop). What you own lives on
 * the camp save; each run takes a snapshot when it starts (run.workshop), so buying something mid-run
 * changes nothing until the next run, and a saved run keeps the upgrades it started with.
 *
 * Fairness: daily and weekly runs and online races start with no upgrades and the full boon and
 * surprise pool. Runs saved before the Workshop existed have no snapshot and also get the full pool.
 */

/** What a run started with. */
export interface RunWorkshop {
  /** Upgrades owned when the run began (none on seeded runs). */
  up: WorkshopId[];
  /** Seeded runs: the full boon and surprise pool, whatever Lore you own. */
  full?: boolean;
  /** Restocker: the floor its free reroll was last used on. */
  rerollFloor?: number;
}

// ---------------------------------------------------------------- owning upgrades (camp)

/** Upgrades you own. */
export const ownedUpgrades = (m: Meta): WorkshopId[] => (camp(m).workshop ??= []);

export const ownsUpgrade = (m: Meta, id: WorkshopId): boolean => ownedUpgrades(m).includes(id);

/** The next upgrade to buy in a branch (null once its capstone is bought). */
export function nextUpgrade(m: Meta, b: WorkshopBranch): WorkshopUpgrade | null {
  const own = ownedUpgrades(m);
  return branchUpgrades(b).find((u) => !own.includes(u.id)) ?? null;
}

/** Buy an upgrade: it must be the next in its branch. Returns an error message, or null when bought. */
export function buyUpgrade(m: Meta, id: WorkshopId): string | null {
  const u = WORKSHOP_BY_ID[id];
  if (!u) return 'Not in the Workshop.';
  const c = camp(m);
  const own = ownedUpgrades(m);
  if (own.includes(id)) return 'You already have it.';
  if (nextUpgrade(m, u.branch)?.id !== id) return 'Buy the upgrades before it first.';
  if (c.embers < u.cost) return `You need ${u.cost - c.embers} more embers.`;
  c.embers -= u.cost;
  own.push(id);
  return null;
}

/** How far along the Workshop is: embers spent of the total, and the cheapest next upgrade. */
export function workshopProgress(m: Meta): { spent: number; total: number; next: WorkshopUpgrade | null; done: boolean } {
  const own = ownedUpgrades(m);
  const spent = WORKSHOP.filter((u) => own.includes(u.id)).reduce((n, u) => n + u.cost, 0);
  const nexts = WORKSHOP_BRANCHES.map((b) => nextUpgrade(m, b.id)).filter((u): u is WorkshopUpgrade => !!u);
  const next = nexts.sort((a, b) => a.cost - b.cost)[0] ?? null;
  return { spent, total: WORKSHOP_TOTAL, next, done: own.length >= WORKSHOP.length };
}

// ---------------------------------------------------------------- a run's snapshot

/** What a new run takes along from the Workshop (seeded runs: nothing, and the full pool). */
export function workshopSnapshot(m: Meta, seeded: boolean): RunWorkshop {
  return seeded ? { up: [], full: true } : { up: [...ownedUpgrades(m)] };
}

/** Anything that carries a run's Workshop snapshot. */
type HasWorkshop = Pick<Run, 'workshop'>;

/** Did this run start with the upgrade? */
export const wsHas = (run: HasWorkshop | null | undefined, id: WorkshopId): boolean => !!run?.workshop?.up.includes(id);

/** The full pool: seeded runs, and runs saved before the Workshop. */
const fullPool = (run: HasWorkshop | null | undefined): boolean => !run?.workshop || !!run.workshop.full;

/** Can this boon be offered on this run (Lore gating)? */
export function boonInPool(run: HasWorkshop | null | undefined, id: string): boolean {
  const need = LORE_BOONS[id];
  return !need || fullPool(run) || wsHas(run, need);
}

/** Can this surprise turn up on this run (Lore gating)? */
export function surpriseInPool(run: HasWorkshop | null | undefined, id: string): boolean {
  const need = LORE_SURPRISES[id];
  return !need || fullPool(run) || wsHas(run, need);
}

// ---------------------------------------------------------------- effects

/** Training: levels added to the starter (and to a Partner). */
export const starterBonus = (run: HasWorkshop): number => (wsHas(run, 'level3') ? 3 : wsHas(run, 'level2') ? 2 : wsHas(run, 'level1') ? 1 : 0);

/** Supplies: potions and coins a run starts with. */
export const startPotions = (run: Run): number => (wsHas(run, 'potion2') ? 2 : wsHas(run, 'potion1') ? 1 : 0);
export const startCoins = (run: Run): number => (wsHas(run, 'coins3') ? 120 : wsHas(run, 'coins2') ? 80 : wsHas(run, 'coins1') ? 40 : 0);

/** Supplies: extra potions the pouch holds. */
export const extraPouch = (run: Run): number => (wsHas(run, 'pouch') ? 2 : 0);

/** Training: bench slots. */
export const benchMax = (run: HasWorkshop | null | undefined): number => 3 + (wsHas(run, 'benchslot') ? 1 : 0);

/** Training: the share of their level revived Hexlings come back at. */
export const reviveShare = (run: HasWorkshop | null | undefined): number => (wsHas(run, 'revive') ? 0.7 : 0.6);

/** Training: the bench's share of XP (before passives, boons and traits). */
export const benchShareBase = (run: Run, base: number): number => (wsHas(run, 'benchxp') ? Math.max(base, 0.75) : base);

/** Fortune: how much more often Gilded wild Hexlings turn up. */
export const gildedBoost = (run: Run): number => (wsHas(run, 'gilded2') ? 1.5 : wsHas(run, 'gilded1') ? 1.25 : 1);

/** Fortune: how much more often hidden hexes turn up. */
export const hiddenBoost = (run: Run): number => (wsHas(run, 'hidden') ? 1.5 : 1);

/** Fortune: how much better boon rarity is (0, 1 or 2). */
export const rarityTier = (run: Run): number => (wsHas(run, 'rarity2') ? 2 : wsHas(run, 'rarity1') ? 1 : 0);

/** Supplies: Restocker's free reroll is waiting on this floor. */
export const freeRerollReady = (run: Run): boolean => wsHas(run, 'freeroll') && run.workshop?.rerollFloor !== run.floor + (run.hunt?.depth ?? 0) * 100;

/** Supplies: use Restocker's free reroll for this floor. */
export function useFreeReroll(run: Run) {
  if (run.workshop) run.workshop.rerollFloor = run.floor + (run.hunt?.depth ?? 0) * 100;
}
