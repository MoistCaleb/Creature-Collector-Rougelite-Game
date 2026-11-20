import { DEX_SPECIES, isLegend } from '../data/legends';
import { MAPS } from '../data/maps';
import { SPECIES, SPECIES_BY_ID } from '../data/species';
import { ELEMENTS, typeMultiplier, type Element } from '../data/types';
import { camp } from './camp';
import type { Meta, RunRecord } from './run';

/**
 * Hexlidex extras: where a line lives, what hits it hard, your history with it, and rewards for
 * filling the Hexlidex in.
 */

// ---------------------------------------------------------------- where to find it

export interface Habitat {
  lands: Element[];
  /** Maps with one of those lands (Wildlands has every land at random). */
  maps: string[];
  legend: boolean;
}

export function habitat(speciesId: string): Habitat {
  const sp = SPECIES_BY_ID[speciesId];
  if (!sp || isLegend(speciesId)) return { lands: [], maps: [], legend: true };
  const lands = [...new Set(sp.types)];
  const maps = MAPS.filter((m) => !m.biomes || m.biomes.some((b) => lands.includes(b))).map((m) => m.name);
  return { lands, maps, legend: false };
}

// ---------------------------------------------------------------- matchups

export interface Matchups {
  weak: { el: Element; x: number }[];
  resist: { el: Element; x: number }[];
  immune: Element[];
}

/** How much each element's attacks hurt this line (by its types). */
export function matchups(types: readonly Element[]): Matchups {
  const out: Matchups = { weak: [], resist: [], immune: [] };
  for (const el of ELEMENTS) {
    const x = typeMultiplier(el, types);
    if (x === 0) out.immune.push(el);
    else if (x > 1) out.weak.push({ el, x });
    else if (x < 1) out.resist.push({ el, x });
  }
  out.weak.sort((a, b) => b.x - a.x);
  out.resist.sort((a, b) => a.x - b.x);
  return out;
}

// ---------------------------------------------------------------- your history with a line

export interface LineRecord {
  caught: number;
  wins: number;
  mvp: number;
  best: number;
}

/** Your record with every line (built from your run history the first time). */
export function lines(m: Meta): Record<string, LineRecord> {
  if (m.lines) return m.lines;
  const out: Record<string, LineRecord> = {};
  const get = (id: string) => (out[id] ??= { caught: 0, wins: 0, mvp: 0, best: 0 });
  for (const id of m.dex.caught) get(id).caught = 1;
  for (const r of m.history ?? []) noteRun(out, r);
  return (m.lines = out);
}

function noteRun(out: Record<string, LineRecord>, r: RunRecord) {
  const get = (id: string) => (out[id] ??= { caught: 0, wins: 0, mvp: 0, best: 0 });
  const seen = new Set<string>();
  for (const c of r.team) {
    const l = get(c.speciesId);
    l.best = Math.max(l.best, c.level);
    if (r.won && !seen.has(c.speciesId)) l.wins += 1;
    seen.add(c.speciesId);
  }
  if (r.mvp) get(r.mvp.speciesId).mvp += 1;
}

export function noteCatch(m: Meta, speciesId: string) {
  const l = (lines(m)[speciesId] ??= { caught: 0, wins: 0, mvp: 0, best: 0 });
  l.caught += 1;
}

export function noteRunRecord(m: Meta, r: RunRecord) {
  noteRun(lines(m), r);
}

export function lineRecord(m: Meta, speciesId: string): LineRecord & { runs: number } {
  const l = lines(m)[speciesId] ?? { caught: 0, wins: 0, mvp: 0, best: 0 };
  return { ...l, runs: m.usage?.[speciesId] ?? 0 };
}

// ---------------------------------------------------------------- completion rewards

export interface DexReward {
  id: string;
  name: string;
  desc: string;
  embers: number;
  progress: (m: Meta) => [number, number];
}

const caughtOf = (m: Meta, ids: string[]) => ids.filter((id) => m.dex.caught.includes(id)).length;
const ALL = DEX_SPECIES.map((s) => s.id);
const MILESTONES: [number, number][] = [
  [10, 10],
  [25, 20],
  [50, 40],
  [75, 60],
  [100, 120],
];

export const DEX_REWARDS: DexReward[] = [
  ...MILESTONES.map(([pct, embers]) => {
    const goal = Math.ceil((ALL.length * pct) / 100);
    return {
      id: `pct-${pct}`,
      name: pct === 100 ? 'Complete Hexlidex' : `${pct}% of the Hexlidex`,
      desc: `Catch ${goal} of the ${ALL.length} lines${pct === 100 ? ', legendaries included' : ''}.`,
      embers,
      progress: (m: Meta): [number, number] => [Math.min(goal, caughtOf(m, ALL)), goal],
    };
  }),
  ...ELEMENTS.map((el) => {
    const ids = SPECIES.filter((s) => s.types.includes(el)).map((s) => s.id);
    return {
      id: `el-${el}`,
      name: `Every ${el} line`,
      desc: `Catch all ${ids.length} lines with ${el} in their types.`,
      embers: 15,
      progress: (m: Meta): [number, number] => [caughtOf(m, ids), ids.length],
    };
  }),
];

export interface DexRewardState extends DexReward {
  have: number;
  goal: number;
  done: boolean;
  claimed: boolean;
}

export function dexRewards(m: Meta): DexRewardState[] {
  const claimed = m.dexClaimed ?? [];
  return DEX_REWARDS.map((r) => {
    const [have, goal] = r.progress(m);
    return { ...r, have, goal, done: have >= goal, claimed: claimed.includes(r.id) };
  });
}

export const dexRewardsReady = (m: Meta) => dexRewards(m).filter((r) => r.done && !r.claimed).length;

/** Claim a finished reward: its embers (spent at camp). Returns the embers gained. */
export function claimDexReward(m: Meta, id: string): number {
  const r = dexRewards(m).find((x) => x.id === id);
  if (!r || !r.done || r.claimed) return 0;
  (m.dexClaimed ??= []).push(id);
  camp(m).embers += r.embers;
  return r.embers;
}
