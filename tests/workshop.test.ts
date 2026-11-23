import { beforeEach, describe, expect, it } from 'vitest';
import { BOONS } from '../src/data/boons';
import { BALANCE } from '../src/data/balance';
import { DEFAULT_STARTERS } from '../src/data/species';
import { SURPRISES } from '../src/data/surprises';
import { LORE_BOON_HINTS, LORE_BOONS, LORE_SURPRISES, WORKSHOP, WORKSHOP_BRANCHES, WORKSHOP_TOTAL, branchUpgrades, type WorkshopId } from '../src/data/workshop';
import { emptyStats } from '../src/logic/achievements';
import { rollOffer } from '../src/logic/boons';
import { camp } from '../src/logic/camp';
import { setFloorCeiling } from '../src/logic/creature';
import { emptyDex } from '../src/logic/dex';
import { addPartner, maxPotions, reviveLevel, rosterFull, startRun, startWeekly, type Meta } from '../src/logic/run';
import { rollFloorSurprises, runSurprises } from '../src/logic/surprises';
import {
  benchMax,
  boonInPool,
  buyUpgrade,
  freeRerollReady,
  loreLock,
  nextUpgrade,
  ownedUpgrades,
  surpriseInPool,
  useFreeReroll,
  workshopProgress,
  wsHas,
} from '../src/logic/workshop';

beforeEach(() => setFloorCeiling(Infinity));

const mkMeta = (): Meta => ({
  unlockedStarters: [...DEFAULT_STARTERS],
  unlockedPassives: [],
  equippedPassive: null,
  runs: 0,
  wins: 0,
  dex: emptyDex(),
  coinsSpent: 0,
  bossesDefeated: 0,
  clearedMaps: [],
  lastMap: 'wildlands',
  stats: emptyStats(),
  achievements: [],
  newAchievements: [],
});

/** A save that owns every upgrade up to and including these (in branch order). */
function owning(...ids: WorkshopId[]): Meta {
  const meta = mkMeta();
  camp(meta).embers = WORKSHOP_TOTAL;
  for (const id of ids) {
    const u = WORKSHOP.find((x) => x.id === id)!;
    for (const step of branchUpgrades(u.branch)) {
      if (ownedUpgrades(meta).includes(step.id)) continue;
      expect(buyUpgrade(meta, step.id)).toBeNull();
      if (step.id === id) break;
    }
  }
  return meta;
}

const everything = () => owning(...WORKSHOP_BRANCHES.map((b) => branchUpgrades(b.id).at(-1)!.id));

describe('the Workshop (2.0)', () => {
  it('has four branches of about 1,250 embers, each ending in one capstone, about 5,000 in all', () => {
    expect(WORKSHOP_TOTAL).toBe(5000);
    for (const b of WORKSHOP_BRANCHES) {
      const ups = branchUpgrades(b.id);
      expect(ups.reduce((n, u) => n + u.cost, 0)).toBe(1250);
      expect(ups.filter((u) => u.capstone).map((u) => u.id)).toEqual([ups.at(-1)!.id]);
      // Cheap early, pricier later.
      for (let i = 1; i < ups.length; i++) expect(ups[i].cost).toBeGreaterThan(ups[i - 1].cost);
    }
    expect(new Set(WORKSHOP.map((u) => u.id)).size).toBe(WORKSHOP.length);
  });

  it('Lore gates real boons and surprises, and leaves about 35 boons and the common surprises open', () => {
    for (const id of Object.keys(LORE_BOONS)) expect(BOONS[id as keyof typeof BOONS], id).toBeTruthy();
    for (const id of Object.keys(LORE_SURPRISES)) expect(SURPRISES[id], id).toBeTruthy();
    const open = Object.values(BOONS).filter((b) => b.rarity !== 'curse' && !LORE_BOONS[b.id]);
    expect(open.length).toBe(35);
    // Every kind of surprise keeps at least one open from the start.
    for (const kind of ['omen', 'floor', 'hex', 'encounter']) {
      expect(Object.values(SURPRISES).some((s) => s.kind === kind && !LORE_SURPRISES[s.id])).toBe(true);
    }
  });

  it('upgrades are bought in order, with embers, once', () => {
    const meta = mkMeta();
    expect(buyUpgrade(meta, 'potion1')).toMatch(/more embers/);
    camp(meta).embers = 100;
    expect(buyUpgrade(meta, 'coins1')).toMatch(/before it/);
    expect(buyUpgrade(meta, 'potion1')).toBeNull();
    expect(camp(meta).embers).toBe(70);
    expect(buyUpgrade(meta, 'potion1')).toMatch(/already/);
    expect(nextUpgrade(meta, 'supplies')?.id).toBe('coins1');
    const p = workshopProgress(meta);
    expect(p.spent).toBe(30);
    expect(p.next?.id).toBe('level1'); // the cheapest next step across branches
    expect(p.done).toBe(false);
    expect(workshopProgress(everything()).done).toBe(true);
  });

  it('a new player starts runs just as before', () => {
    const run = startRun(mkMeta(), 'emberkit', 7);
    expect(run.team[0].level).toBe(BALANCE.starterLevel);
    expect(run.coins).toBe(0);
    expect(run.potions).toBe(0);
    expect(maxPotions(run)).toBe(5);
    expect(benchMax(run)).toBe(3);
    expect(run.boons?.offer ?? null).toBeNull();
  });

  it('Supplies and Training apply when a run starts', () => {
    const meta = owning('coins3', 'level3');
    const run = startRun(meta, 'emberkit', 7);
    expect(run.coins).toBe(120);
    expect(run.potions).toBe(2);
    expect(run.team[0].level).toBe(BALANCE.starterLevel + 3);
    const max = everything();
    const full = startRun(max, 'emberkit', 7);
    expect(maxPotions(full)).toBe(7);
    expect(full.potions).toBe(7);
    expect(full.team[0].capBonus).toBe(5);
    expect(benchMax(full)).toBe(4);
    expect(reviveLevel({ level: 20 }, full)).toBe(14);
    expect(reviveLevel({ level: 20 }, startRun(mkMeta(), 'emberkit', 7))).toBe(12);
  });

  it('daily and weekly runs ignore the Workshop and use the full pool', () => {
    const meta = everything();
    const pairs = [
      [startRun(meta, 'emberkit', 7, 'wildlands', '2026-11-22'), startRun(mkMeta(), 'emberkit', 7, 'wildlands', '2026-11-22')],
      [startWeekly(meta, '2026-11-16', 'emberkit'), startWeekly(mkMeta(), '2026-11-16', 'emberkit')],
    ];
    for (const [run, plain] of pairs) {
      expect(run.workshop?.up).toEqual([]);
      expect(run.workshop?.full).toBe(true);
      expect(run.coins).toBe(plain.coins);
      expect(run.potions).toBe(plain.potions);
      expect(run.team.map((c) => c.level)).toEqual(plain.team.map((c) => c.level));
      expect(boonInPool(run, 'pact')).toBe(true);
      expect(surpriseInPool(run, 'bloodmoon')).toBe(true);
      expect(run.boons?.offer ?? null).toBeNull();
    }
    // A daily rolls the same boon offers with or without upgrades.
    const a = startRun(mkMeta(), 'emberkit', 9, 'wildlands', '2026-11-22');
    const b = startRun(everything(), 'emberkit', 9, 'wildlands', '2026-11-22');
    expect(rollOffer(a, 'x')).toEqual(rollOffer(b, 'x'));
  });

  it('Lore keeps locked boons and surprises out until bought', () => {
    const fresh = startRun(mkMeta(), 'emberkit', 7);
    expect(boonInPool(fresh, 'pact')).toBe(false);
    expect(boonInPool(fresh, 'kindling')).toBe(true);
    expect(surpriseInPool(fresh, 'mirror')).toBe(false);
    for (let i = 0; i < 300; i++) for (const id of rollOffer(fresh, `t${i}`)) expect(LORE_BOONS[id], id).toBeUndefined();
    for (let seed = 1; seed < 400; seed++) {
      const run = startRun(mkMeta(), 'emberkit', seed);
      const rs = runSurprises(run);
      if (rs.omen) expect(LORE_SURPRISES[rs.omen]).toBeUndefined();
      for (const f of Object.values(rs.floors)) for (const id of [f.floor, f.hex, f.enc]) if (id) expect(LORE_SURPRISES[id], id).toBeUndefined();
    }
    const lore = startRun(owning('lore2'), 'emberkit', 7);
    expect(boonInPool(lore, 'dread')).toBe(true);
    expect(boonInPool(lore, 'rampage')).toBe(true);
    expect(boonInPool(lore, 'halo')).toBe(false);
    expect(surpriseInPool(lore, 'shattered')).toBe(true);
    // A run saved before the Workshop existed keeps the full pool.
    delete fresh.workshop;
    expect(boonInPool(fresh, 'pact')).toBe(true);
  });

  it("Fortune: the first offer gets a 4th choice, and the Blessing opens one at the start", () => {
    const run = startRun(owning('firstfour'), 'emberkit', 7);
    expect(wsHas(run, 'firstfour')).toBe(true);
    run.boons = { held: [], offer: null, queue: [], offers: 1 };
    expect(rollOffer(run, 'first').length).toBe(4);
    run.boons.offers = 2;
    expect(rollOffer(run, 'second').length).toBe(3);
    const blessed = startRun(owning('blessing'), 'emberkit', 7);
    expect(blessed.boons?.offer?.ids.length).toBe(4);
  });

  it('Fortune: Keen eye makes hidden hexes more common', () => {
    const count = (meta: () => Meta) => {
      let n = 0;
      for (let seed = 1; seed < 1500; seed++) {
        const run = startRun(meta(), 'emberkit', seed);
        if (Object.values(runSurprises(run).floors).some((f) => f.hex)) n++;
      }
      return n;
    };
    expect(count(() => owning('hidden'))).toBeGreaterThan(count(mkMeta) * 1.2);
  }, 30_000); // 3,000 simulated runs: slow on CI runners

  it('Restocker: one free reroll a floor', () => {
    const run = startRun(owning('freeroll'), 'emberkit', 7);
    expect(freeRerollReady(run)).toBe(true);
    useFreeReroll(run);
    expect(freeRerollReady(run)).toBe(false);
    run.floor = 1;
    rollFloorSurprises(run);
    expect(freeRerollReady(run)).toBe(true);
  });

  it('Partner: a second starter joins at the same level, once', () => {
    const meta = owning('partner');
    const run = startRun(meta, 'emberkit', 7);
    expect(addPartner(run, 'emberkit')).toBeNull();
    const other = DEFAULT_STARTERS.find((id) => id !== 'emberkit')!;
    const c = addPartner(run, other);
    expect(c?.level).toBe(run.team[0].level);
    expect(run.team.length).toBe(2);
    expect(addPartner(run, DEFAULT_STARTERS[2])).toBeNull();
    expect(rosterFull(run)).toBe(false);
    expect(addPartner(startRun(mkMeta(), 'emberkit', 7), other)).toBeNull();
  });
});

describe('Lore hints in the Hexlidex', () => {
  it('names the Lore upgrade a locked boon or surprise needs, until it is owned', () => {
    const m = mkMeta();
    expect(loreLock(m, 'boon', 'opportunist')?.id).toBe('lore2');
    expect(loreLock(m, 'surprise', 'hiddenshop')?.id).toBe('lore3');
    expect(loreLock(m, 'boon', 'prospector')?.name).toBe('Lore III');
    const open = Object.keys(BOONS).find((id) => !LORE_BOONS[id])!;
    expect(loreLock(m, 'boon', open)).toBeNull();
    ownedUpgrades(m).push('lore1', 'lore2');
    expect(loreLock(m, 'boon', 'opportunist')).toBeNull();
    expect(loreLock(m, 'surprise', 'mirror')).toBeNull();
    expect(loreLock(m, 'boon', 'firststrike')?.id).toBe('lore3');
  });

  it('has a hint for every Lore-locked boon, and only for those', () => {
    expect(Object.keys(LORE_BOON_HINTS).sort()).toEqual(Object.keys(LORE_BOONS).sort());
    for (const h of Object.values(LORE_BOON_HINTS)) expect(h.length).toBeGreaterThan(5);
  });
});
