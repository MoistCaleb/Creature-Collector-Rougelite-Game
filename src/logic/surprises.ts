import { SURPRISE_LIST, SURPRISES } from '../data/surprises';
import { ELEMENTS, type Element } from '../data/types';
import type { WeatherId } from '../data/moves';
import { hashString, Rng } from './rng';
import { placeRoamer, saveMeta, type Meta, type Run } from './run';
import { hiddenBoost, surpriseInPool } from './workshop';

/**
 * Rare surprises (2.0): an omen for the whole run, and per floor a rare floor, an Elder guardian, a
 * hidden hex and a rare encounter, each rolled from the run's seed (so seeded runs and online races
 * match). A drought counter on the profile makes sure no player goes more than 3 runs without one.
 */

export interface FloorSurprise {
  /** A rare floor (Gilded Grove, Eclipse, …). */
  floor?: string;
  /** Shattered Floor: the second land. */
  second?: Element;
  /** The guardian here is an Elder. */
  elder?: boolean;
  /** A hidden hex and where it is. */
  hex?: string;
  hexNode?: string;
  /** A rare encounter on a battle hex. */
  enc?: string;
  encNode?: string;
  /** Shown its banner already. */
  announced?: boolean;
}

export interface RunSurprises {
  omen?: string;
  omenAnnounced?: boolean;
  floors: Record<string, FloorSurprise>;
  /** A surprise is guaranteed on the first floor (drought protection; unseeded runs only). */
  forced?: boolean;
}

/** Odds per floor (and per run for omens), tuned so about 1 run in 2 has at least one. */
const ODDS = { omen: 1 / 15, floor: 1 / 30, elder: 1 / 20, hex: 1 / 12, enc: 1 / 20 };
/** Runs in a row without a surprise before one is guaranteed. */
export const DROUGHT_MAX = 3;

/** The surprises of a kind this run can meet (Lore gates some; seeded runs have them all). */
const of = (kind: string, run?: Run) => SURPRISE_LIST.filter((s) => s.kind === kind && (!run || surpriseInPool(run, s.id))).map((s) => s.id);

/** This floor's key (the Gilded Hunt's floors each get their own). */
const floorKey = (run: Run) => (run.hunt ? `h${run.hunt.depth}` : String(run.floor));

export const runSurprises = (run: Run): RunSurprises => (run.surprises ??= { floors: {} });

/** The surprises on the floor you're on. */
export const floorSurprise = (run: Run | null | undefined): FloorSurprise => (run?.surprises?.floors[floorKey(run)] ?? {});

export const omenOf = (run: Run | null | undefined): string | undefined => run?.surprises?.omen;

/** A new run: its omen, and (if it's been a while) a promise of a surprise on the first floor. */
export function startSurprises(run: Run, seeded: boolean) {
  const rs = runSurprises(run);
  const h = hashString(`${run.seed}:omen`);
  const omens = of('omen', run);
  if ((h % 10000) / 10000 < ODDS.omen && omens.length) rs.omen = omens[(h >>> 8) % omens.length];
  if (!seeded && (run.meta.surpriseDrought ?? 0) >= DROUGHT_MAX) rs.forced = true;
  rollFloorSurprises(run);
}

/** Roll this floor's surprises (once), placing hidden hexes and encounters by the seed. */
export function rollFloorSurprises(run: Run) {
  const rs = runSurprises(run);
  const key = floorKey(run);
  if (rs.floors[key]) return;
  const rng = new Rng(hashString(`${run.seed}:surprise:${key}`));
  const fs: FloorSurprise = {};
  if (rng.chance(ODDS.floor)) fs.floor = rng.pick(of('floor', run));
  if (rng.chance(ODDS.elder)) fs.elder = true;
  // Keen eye (Workshop): hidden hexes half again as often.
  let hex = rng.chance(ODDS.hex * hiddenBoost(run)) ? rng.pick(of('hex', run)) : undefined;
  let enc = rng.chance(ODDS.enc) ? rng.pick(of('encounter', run)) : undefined;
  // Echo of yourself can't be the same for everyone, and needs a winning team to copy: seeded runs
  // (and players without a win yet) meet a Gilded trainer instead.
  if (enc === 'echo' && (run.workshop?.full || run.daily || run.weekly || !lastWinTeam(run.meta))) enc = surpriseInPool(run, 'gildedtrainer') ? 'gildedtrainer' : undefined;
  // Drought protection: the first floor gets a hidden hex if nothing else turned up.
  if (rs.forced && !rs.omen && !fs.floor && !fs.elder && !hex && !enc) hex = rng.pick(of('hex', run));
  rs.forced = false;
  const battles = () =>
    Object.values(run.map.nodes)
      .filter((n) => n.kind === 'battle' && n.progress > 0.15 && n.progress < 0.9 && !run.visited.includes(n.id) && n.id !== fs.hexNode)
      .map((n) => n.id)
      .sort();
  if (hex) {
    const spots = battles();
    if (spots.length) {
      fs.hex = hex;
      fs.hexNode = spots[rng.int(0, spots.length - 1)];
      run.map.nodes[fs.hexNode].kind = 'hidden';
    }
  }
  if (enc) {
    const spots = battles();
    if (spots.length) {
      fs.enc = enc;
      fs.encNode = spots[rng.int(0, spots.length - 1)];
    }
  }
  if (fs.floor === 'shattered') {
    const others = ELEMENTS.filter((e) => e !== run.map.biome);
    fs.second = others[rng.int(0, others.length - 1)];
  }
  // Ancient Ruins: relic chests (two treasure hexes), a stone titan (an Elder), a legendary roams.
  if (fs.floor === 'ruins') {
    fs.elder = true;
    for (let i = 0; i < 2; i++) {
      const spots = battles().filter((id) => id !== fs.encNode);
      if (spots.length) run.map.nodes[spots[rng.int(0, spots.length - 1)]].kind = 'treasure';
    }
    placeRoamer(run, true);
  }
  // Starfall (an omen): every floor has a Boon hex.
  if (rs.omen === 'starfall' && !Object.values(run.map.nodes).some((n) => n.kind === 'boon')) {
    const spots = battles().filter((id) => id !== fs.encNode);
    if (spots.length) run.map.nodes[spots[rng.int(0, spots.length - 1)]].kind = 'boon';
  }
  rs.floors[key] = fs;
}

/** Your last winning team (from your run history), for Echo of yourself. */
export function lastWinTeam(meta: Meta): { speciesId: string; stage: number; level: number }[] | null {
  const rec = (meta.history ?? []).find((r) => r.won && r.team.length && !r.daily && !r.weekly);
  return rec ? rec.team.slice(0, 4) : null;
}

/** Did this run meet any surprise? */
export const hadSurprise = (run: Run): boolean => !!run.surprises && (!!run.surprises.omen || Object.values(run.surprises.floors).some((f) => f.floor || f.elder || f.hex || f.enc));

/** A run ended: the drought counter goes back to 0, or up by one. */
export function noteRunSurprises(meta: Meta, run: Run) {
  meta.surpriseDrought = hadSurprise(run) ? 0 : (meta.surpriseDrought ?? 0) + 1;
}

/** Mark a surprise found (for the Hexlidex). True if it's new. */
export function findSurprise(meta: Meta, id: string): boolean {
  if (!SURPRISES[id]) return false;
  const list = (meta.surprisesFound ??= []);
  if (list.includes(id)) return false;
  list.push(id);
  saveMeta(meta);
  return true;
}

/** Storm Front: each battle on the floor opens in a different weather. */
export function stormFrontWeather(run: Run): WeatherId | null {
  if (floorSurprise(run).floor !== 'stormfront') return null;
  return (['rain', 'sun', 'hail', 'dust'] as WeatherId[])[run.log.fights % 4];
}

/** Elder guardian: the boss on this floor is the rare, older version. */
export const elderHere = (run: Run): boolean => !!floorSurprise(run).elder;

/** Golden Age: coins and prices. */
export const omenCoinMult = (run: Run): number => (omenOf(run) === 'goldenage' ? 2 : 1);
export const omenPriceMult = (run: Run): number => (omenOf(run) === 'goldenage' ? 1.5 : 1);
