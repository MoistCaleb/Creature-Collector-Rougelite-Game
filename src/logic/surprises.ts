import { SURPRISE_LIST, SURPRISES } from '../data/surprises';
import { ELEMENTS, type Element } from '../data/types';
import type { WeatherId } from '../data/moves';
import { hashString, Rng } from './rng';
import { highestLevel, placeRng, placeRoamer, saveMeta, type Meta, type Run } from './run';
import { SPECIES } from '../data/species';
import { rollTrait, traitsOf } from '../data/traits';
import { createCreature, stats, type Creature } from './creature';
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
  /** Hatchery: an egg you carry, and the battles it has seen. */
  egg?: Egg;
  /** Dojo: three trainers in a row, under way. */
  dojo?: { wins: number; lost?: boolean };
}

export interface Egg {
  speciesId: string;
  wins: number;
}

/** Hatchery: battles won before the egg hatches. */
export const EGG_WINS = 5;
/** Dojo: trainers in a row. */
export const DOJO_ROUNDS = 3;

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

/** The omen a seed brings (from these omens; seeded runs have them all), if any. Shown at the starter pick. */
export function omenFor(seed: number, omens: string[] = of('omen')): string | undefined {
  const h = hashString(`${seed}:omen`);
  return (h % 10000) / 10000 < ODDS.omen && omens.length ? omens[(h >>> 8) % omens.length] : undefined;
}

/** A new run: its omen, and (if it's been a while) a promise of a surprise on the first floor. */
export function startSurprises(run: Run, seeded: boolean) {
  const rs = runSurprises(run);
  rs.omen = omenFor(run.seed, of('omen', run));
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

// ---------------------------------------------------------------- Hatchery

/** Take the Hatchery's egg: a line you haven't caught yet (any line once you've caught them all). */
export function layEgg(run: Run): Egg {
  const rs = runSurprises(run);
  if (rs.egg) return rs.egg;
  const caught = run.meta.dex.caught;
  const fresh = SPECIES.filter((sp) => !caught.includes(sp.id));
  const pool = (fresh.length ? fresh : SPECIES).map((sp) => sp.id).sort();
  return (rs.egg = { speciesId: placeRng(run, 'hatchery').pick(pool), wins: 0 });
}

/** The egg is ready to hatch. */
export const eggReady = (run: Run | null | undefined): boolean => !!run?.surprises?.egg && run.surprises.egg.wins >= EGG_WINS;

/** A battle won: the egg gets closer to hatching. */
export function tickEgg(run: Run) {
  const egg = run.surprises?.egg;
  if (egg && egg.wins < EGG_WINS) egg.wins += 1;
}

/** Hatch the egg: its line at a level near your best, always with its rare ◆ trait. Null if no egg is ready. */
export function hatchEgg(run: Run): Creature | null {
  if (!eggReady(run)) return null;
  const egg = run.surprises!.egg!;
  // An egg from an old save whose line is gone: it never hatches.
  if (!SPECIES.some((sp) => sp.id === egg.speciesId)) {
    delete run.surprises!.egg;
    return null;
  }
  const c = createCreature(egg.speciesId, Math.max(1, Math.round(highestLevel(run) * 0.85)), Math.min(2, run.floor));
  c.trait = traitsOf(c.speciesId)[2] ?? c.trait;
  c.hp = stats(c).hp;
  delete run.surprises!.egg;
  return c;
}

// ---------------------------------------------------------------- Fossil Site

/** The three fossils at this Fossil Site (seeded), as the ancient forms they'd become. */
export function fossilChoices(run: Run): Creature[] {
  const rng = placeRng(run, 'fossil');
  const ids = rng.shuffle(SPECIES.map((sp) => sp.id).sort()).slice(0, 3);
  const level = Math.max(1, Math.round(highestLevel(run) * 0.8));
  return ids.map((id) => {
    const c = createCreature(id, level, Math.min(2, run.floor));
    c.ancient = true;
    c.trait = rollTrait(id, `${run.seed}:fossil:${run.floor}:${id}`);
    c.hp = stats(c).hp;
    return c;
  });
}

/** An ancient form joined you: it goes in the Hexlidex. True if it's a new line. */
export function noteAncient(meta: Meta, speciesId: string): boolean {
  const list = (meta.ancientFound ??= []);
  if (list.includes(speciesId)) return false;
  list.push(speciesId);
  saveMeta(meta);
  return true;
}

// ---------------------------------------------------------------- Dojo

/** The Dojo's three battles are under way. */
export const dojoOn = (run: Run | null | undefined): boolean => !!run?.surprises?.dojo && !run.surprises.dojo.lost;

/** Step into the Dojo. */
export function enterDojo(run: Run) {
  runSurprises(run).dojo = { wins: 0 };
}

/** A battle in the Dojo ended. */
export function dojoResult(run: Run, won: boolean) {
  const d = run.surprises?.dojo;
  if (!d || d.lost) return;
  if (won) d.wins += 1;
  else d.lost = true;
}

/** Leave the Dojo (finished, lost or reloaded past it). */
export function leaveDojo(run: Run) {
  if (run.surprises) delete run.surprises.dojo;
}
