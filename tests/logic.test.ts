import { makeArenaCreature as mkArena, ownsShiny, validArenaTeam as validTeam } from '../src/logic/arena';
import { beforeEach, describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { emptyStats } from '../src/logic/achievements';
import { ELEMENTS, typeMultiplier, stabMultiplier, STRONG_AGAINST } from '../src/data/types';
import { branchiness, generateFloor, MIN_BRANCHINESS, reachable, ROUTE_LENGTHS, stepsToBoss } from '../src/logic/map';
import { Battle } from '../src/logic/battle';
import { fallbackMove, hasUses, outOfMoves, restoreUses, usesLeft, readyToEvolve, setFloorCeiling, stageCap, learnset, addLevels, addXp, bankLimit, BANK_LEVELS, gainXp, xpToNext, catchUpMultiplier, createCreature, evolve, levelCap, moveDef, prestige, recommendForget, recommendReason, resolvePending, stats } from '../src/logic/creature';
import { WARP_ID as WARP_ID_, BULWARK_ID as BULWARK_ID_, teamMoveId } from '../src/data/moves';
import { learnMoves, creatureTypes, type Creature, type MoveContext } from '../src/logic/creature';
import { BOSSES, RULES, extraRuleCount, guardianRules } from '../src/data/trainers';
import { moveStyle } from '../src/data/moveStyle';
import type { Element } from '../src/data/types';
import { attackId, elementPool, maxUses, MOVES } from '../src/data/moves';
import { DEFAULT_STARTERS } from '../src/data/species';
import { EVENTS, rollEvent } from '../src/logic/events';
import { allCreatures, bagHasNew, rollStarterChoices, toggleFavorite, dailySeed, dailyStarters, recordDaily, buryFallen, equipHeld, stash, battleCoins, battleXp, clearFloor, grantXp, catchCreature, clearSavedRun, hasSavedRun, loadRun, saveRun, unlockedMaps, claimGuardian, makeEncounter, moveTo, neutralMatchup, noAdvantageOver, startRun, starterShiny, toggleStarterShiny, startHunt, HUNT_MAX_STARS, dailyPassives, ELEMENT_PASSIVES, recordRun, HISTORY_MAX, mostUsed, type Meta } from '../src/logic/run';
import { SPECIES_BY_ID } from '../src/data/species';
import { applyItem, pay, priceFor, rollShop, unusableReason } from '../src/logic/shop';
import { emptyDex, formName, seeCreature } from '../src/logic/dex';
import { Rng } from '../src/logic/rng';
import { SPECIES } from '../src/data/species';

// The floor level ceiling is module state set by runs; start every test without one.
beforeEach(() => setFloorCeiling(Infinity));

describe('types', () => {
  it('each element is strong vs 3 and weak to 3', () => {
    for (const e of ELEMENTS) {
      expect(STRONG_AGAINST[e]).toHaveLength(3);
      expect(STRONG_AGAINST[e]).not.toContain(e);
      const weakTo = ELEMENTS.filter((a) => STRONG_AGAINST[a].includes(e));
      expect(weakTo).toHaveLength(3);
    }
  });
  it('every element has at least 4 creature families', () => {
    for (const e of ELEMENTS) expect(SPECIES.filter((s) => s.types.includes(e)).length).toBeGreaterThanOrEqual(4);
  });
  it('stacks dual types and counts pure types once', () => {
    expect(typeMultiplier('Water', ['Fire', 'Earth'])).toBeCloseTo(2.25);
    expect(typeMultiplier('Water', ['Fire', 'Fire'])).toBeCloseTo(1.5);
    expect(typeMultiplier('Nature', ['Water', 'Fire'])).toBeCloseTo(1.005, 2);
  });
  it('gives pure types a bigger same-type bonus', () => {
    expect(stabMultiplier('Fire', ['Fire', 'Fire'])).toBe(1.5);
    expect(stabMultiplier('Fire', ['Fire', 'Water'])).toBe(1.25);
    expect(stabMultiplier('Storm', ['Fire', 'Water'])).toBe(1);
  });
});

describe('map', () => {
  it('generates connected floors where every node reaches the boss', () => {
    for (let seed = 1; seed < 200; seed++) {
      for (let f = 0; f < 3; f++) {
        const m = generateFloor(f, 'Fire', seed);
        const r = reachable(m);
        expect(r.has(m.bossId)).toBe(true);
        expect(m.nodes[m.startId].next.length).toBeGreaterThanOrEqual(2);
        for (const n of Object.values(m.nodes)) {
          if (n.kind !== 'boss') expect(n.next.length).toBeGreaterThan(0);
          for (const nx of n.next) expect(m.nodes[nx].y).toBeLessThan(n.y); // always forward
        }
        expect(branchiness(m)).toBeGreaterThanOrEqual(MIN_BRANCHINESS);
        // Every route into the boss passes the pre-boss row: shops on floor 1, rests later.
        const preBoss = Object.values(m.nodes).filter((n) => n.next.includes(m.bossId));
        for (const n of preBoss) expect(n.kind).toBe(f === 0 ? 'shop' : 'heal');
      }
    }
  });

  it('every route to the boss has the same length', () => {
    for (let seed = 1; seed < 100; seed++) {
      for (let f = 0; f < 3; f++) {
        const m = generateFloor(f, 'Fire', seed);
        // Every move climbs exactly one row, so every route is as long as the start's distance.
        for (const n of Object.values(m.nodes))
          for (const nx of n.next) expect(stepsToBoss(m, nx)).toBe(stepsToBoss(m, n.id) - 1);
        expect(stepsToBoss(m, m.startId)).toBe(ROUTE_LENGTHS[f]);
      }
    }
  });
});

describe('creature growth', () => {
  it('respects level cap, and prestige/evolve raise it', () => {
    const c = createCreature('emberkit', 1);
    addXp(c, 1e6);
    expect(c.level).toBe(levelCap(c));
    const cap0 = levelCap(c);
    prestige(c);
    expect(levelCap(c)).toBeGreaterThan(cap0);
    const before = stats(c).atk;
    evolve(c);
    expect(stats(c).atk).toBeGreaterThan(before);
    expect(c.stage).toBe(1);
  });
  it('stores XP earned at the cap, up to a limit, and pours it in when the cap rises', () => {
    const c = createCreature('emberkit', 1);
    const first = gainXp(c, 1e6);
    expect(c.level).toBe(levelCap(c));
    expect(c.banked).toBe(bankLimit(c));
    expect(first.overflow).toBeGreaterThan(0);
    // A full store takes no more.
    const again = gainXp(c, 500);
    expect(again).toEqual({ levels: 0, banked: 0, overflow: 500 });
    const cap = levelCap(c);
    evolve(c);
    expect(c.level).toBe(cap + BANK_LEVELS);
    expect(c.banked).toBe(0);
  });
  it('evolving needs Lv 30 / 65 even when a lower floor ceiling caps the creature', () => {
    setFloorCeiling(45);
    const c = createCreature('emberkit', 30, 1);
    addXp(c, 1e7);
    expect(c.level).toBe(45);
    expect(readyToEvolve(c)).toBe(false);
    setFloorCeiling(Infinity);
    c.level = 65;
    expect(readyToEvolve(c)).toBe(true);
    const base = createCreature('emberkit', 29);
    expect(readyToEvolve(base)).toBe(false);
    base.level = 30;
    expect(readyToEvolve(base)).toBe(true);
  });
  it('partial stores release partial levels', () => {
    const c = createCreature('emberkit', 1);
    addXp(c, 1e6);
    c.banked = xpToNext(levelCap(c)) + 3;
    const cap = levelCap(c);
    prestige(c);
    expect(c.level).toBe(cap + 1);
    expect(c.xp).toBe(3);
  });
  it('learns moves as it levels, queueing extras when full', () => {
    const c = createCreature('steamle', 1);
    expect(c.moves).toHaveLength(2);
    addXp(c, 1e6);
    expect(c.moves).toHaveLength(4);
    expect(c.pendingMoves.length).toBeGreaterThan(0);
  });
  it('never has duplicate moves through leveling, learning and evolving', () => {
    const rng = new Rng(7);
    for (const sp of SPECIES) {
      for (let trial = 0; trial < 20; trial++) {
        const c = createCreature(sp.id, rng.int(1, 30), rng.int(0, 2));
        for (let step = 0; step < 12; step++) {
          if (rng.chance(0.3)) evolve(c);
          else if (rng.chance(0.3)) prestige(c);
          else addLevels(c, rng.int(1, 6));
          while (c.pendingMoves.length) {
            resolvePending(c, c.pendingMoves[0], rng.chance(0.7) ? rng.int(0, c.moves.length - 1) : null);
          }
          const ids = c.moves.map((m) => m.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids.length).toBeLessThanOrEqual(4);
        }
      }
    }
  });
  it('catch-up XP tapers as the gap closes and is capped at x2', () => {
    expect(catchUpMultiplier(1, 11)).toBeCloseTo(1.8);
    expect(catchUpMultiplier(10, 11)).toBeCloseTo(1.08);
    expect(catchUpMultiplier(11, 11)).toBe(1);
    expect(catchUpMultiplier(1, 80)).toBe(2);
  });
  it('a creature that sat out never earns more XP than the one that fought', () => {
    const run = startRun(
      { unlockedStarters: ['emberkit'], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] },
      'emberkit',
      1,
    );
    run.team[0].level = 40;
    const sitter = createCreature('mossling', 1);
    run.team.push(sitter);
    const res = grantXp(run, 500, [run.team[0].uid]);
    expect(res[1].xp).toBeLessThanOrEqual(res[0].xp);
  });
  it('levels reach 100 only at the final evolution stage', () => {
    expect(levelCap({ stage: 0, stars: 0 })).toBe(30);
    expect(levelCap({ stage: 1, stars: 0 })).toBe(65);
    expect(levelCap({ stage: 2, stars: 0 })).toBe(100);
  });
});

describe('dex', () => {
  it('hides evolutions until seen', () => {
    const d = emptyDex();
    expect(formName(d, 'emberkit', 1)).toBe('???');
    seeCreature(d, createCreature('emberkit', 20, 1), true);
    expect(formName(d, 'emberkit', 1)).toBe('Blazefang');
    expect(d.elements).toContain('Fire');
    expect(d.moves.length).toBeGreaterThan(0);
  });
});

describe('battle', () => {
  it('status moves change stat stages', () => {
    const p = createCreature('emberkit', 10);
    p.moves = [{ id: 'Fire:buff', tier: 1 }, { id: 'Fire:debuff', tier: 3 }];
    const e = createCreature('pebblin', 1);
    e.moves = [{ id: 'Earth:0', tier: 1 }];
    const b = new Battle([p], [e], new Rng(3));
    b.takeTurn({ kind: 'move', index: 0 });
    expect(b.p.atkStage).toBe(2);
    for (let i = 0; i < 5 && b.outcome() === 'ongoing'; i++) b.takeTurn({ kind: 'move', index: 1 });
    expect(b.e.defStage).toBeLessThan(0);
    expect(b.e.defStage).toBeGreaterThanOrEqual(-4);
    expect(MOVES['Fire:debuff'].kind).toBe('debuff');
  });
  it('always terminates with a winner', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 100; i++) {
      const p = [createCreature(rng.pick(SPECIES).id, 8), createCreature(rng.pick(SPECIES).id, 8)];
      const e = [createCreature(rng.pick(SPECIES).id, 8)];
      const b = new Battle(p, e, rng);
      let turns = 0;
      while (b.outcome() !== 'win' && b.outcome() !== 'lose' && turns < 200) {
        if (b.outcome() === 'needSwitch') {
          b.forcedSwitch(b.player.findIndex((x) => x.c.hp > 0));
          continue;
        }
        b.takeTurn({ kind: 'move', index: rng.int(0, b.p.c.moves.length - 1) });
        turns++;
      }
      expect(['win', 'lose']).toContain(b.outcome());
    }
  });
});

describe('shop', () => {
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
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('every floor has exactly one Revival hex, and it brings a fallen Hexling back at 60% of its level', async () => {
    const { reviveFallen } = await import('../src/logic/run');
    for (let seed = 1; seed < 40; seed++)
      for (let f = 0; f < 3; f++) {
        const m = generateFloor(f, 'Fire', seed * 7919);
        expect(Object.values(m.nodes).filter((n) => n.kind === 'revive').length).toBe(1);
      }
    const run = startRun(mkMeta(), 'emberkit', 21);
    const c = run.team[0];
    c.level = 40;
    c.stars = 2;
    c.shiny = true;
    const uid = c.uid;
    c.hp = 0;
    buryFallen(run);
    expect(run.team.length).toBe(0);
    expect(run.log.fallen!.length).toBe(1);
    const back = reviveFallen(run, uid)!;
    expect(back.level).toBe(24);
    expect([back.stars, back.shiny, back.uid]).toEqual([2, true, uid]);
    expect(back.hp).toBe(stats(back).hp);
    expect(run.team).toContain(back);
    expect(run.log.fallen!.length).toBe(0);
    expect(run.log.graveyard!.length).toBe(0);
    expect(reviveFallen(run, uid)).toBeNull();
  });
  it('Revival hex with a full party: the one released leaves and the revived Hexling takes its spot', async () => {
    const { reviveFallen } = await import('../src/logic/run');
    const run = startRun(mkMeta(), 'emberkit', 21);
    const fallen = run.team[0];
    const uid = fallen.uid;
    fallen.hp = 0;
    buryFallen(run);
    while (run.team.length < 4) run.team.push(createCreature('emberkit', 5));
    while (run.bench.length < 3) run.bench.push(createCreature('emberkit', 5));
    // Full: no revive without someone to swap out.
    expect(reviveFallen(run, uid)).toBeNull();
    const out = run.team[2];
    out.held = 'band';
    const bag = (run.bag ?? []).length;
    const back = reviveFallen(run, uid, out)!;
    expect(back.uid).toBe(uid);
    expect(run.team[2]).toBe(back);
    expect(run.team).not.toContain(out);
    expect(run.team.length + run.bench.length).toBe(7);
    expect((run.bag ?? []).length).toBe(bag + 1);
  });
  it('stage battles: a fallen team with Hexlings on the bench is never handed in as wiped out', async () => {
    const { raceTeam } = await import('../src/logic/run');
    const run = startRun(mkMeta(), 'emberkit', 21);
    run.bench.push(createCreature('emberkit', 5), createCreature('emberkit', 6));
    for (const c of run.team) c.hp = 0;
    const team = raceTeam(run);
    expect(team.length).toBe(2);
    expect(team.every((c) => c.hp > 0)).toBe(true);
    run.bench = [];
    expect(raceTeam(run)).toEqual([]);
  });
  it('run W/L: seeded once from recent runs, then every finished or abandoned run', async () => {
    const { seedRunRecord, abandonSavedRun, saveRun, recordRun } = await import('../src/logic/run');
    const m = mkMeta();
    const rec = (won: boolean) => ({ at: 0, won, floor: 3, mapId: 'wildlands', heat: 0, battlesWon: 0, caught: 0, team: [] });
    // Newest first: three wins after a loss.
    m.history = [rec(true), rec(true), rec(true), rec(false)] as typeof m.history;
    m.runs = 40;
    seedRunRecord(m);
    expect(m.runRecord).toEqual({ wins: 3, losses: 1 });
    expect(m.streak).toBe(3);
    const run = startRun(m, 'emberkit', 7);
    recordRun(run, true);
    expect([m.runRecord!.wins, m.streak]).toEqual([4, 4]);
    const run2 = startRun(m, 'emberkit', 8);
    saveRun(run2);
    abandonSavedRun(m);
    expect(m.runRecord).toEqual({ wins: 4, losses: 1 + 1 });
    expect(m.streak).toBe(0);
    abandonSavedRun(m); // nothing saved any more
    expect(m.runRecord!.losses).toBe(2);
  });
  it('online races don\'t count as runs; online W/L and streaks are their own', async () => {
    const { addOnlineWin, addOnlineLoss } = await import('../src/logic/titles');
    const m = mkMeta();
    startRun(m, 'emberkit', 5);
    expect(m.runs).toBe(1);
    startRun(m, 'emberkit', 5, 'wildlands', undefined, true, undefined, null);
    expect(m.runs).toBe(1);
    addOnlineWin(m);
    addOnlineWin(m);
    expect([m.onlineWins, m.onlineStreak, m.bestOnlineStreak]).toEqual([2, 2, 2]);
    addOnlineLoss(m);
    addOnlineWin(m);
    expect([m.onlineWins, m.onlineLosses, m.onlineStreak, m.bestOnlineStreak]).toEqual([3, 1, 1, 2]);
  });
  it('Gilded Hunt: better gilded odds with Heat, and Heat breaks a tie in depth', async () => {
    const { huntShinyIn, noteHunt } = await import('../src/logic/run');
    const { showHunt, myScores } = await import('../src/logic/leaderboard');
    expect(huntShinyIn(0)).toEqual({ wild: 12, trainer: 20 });
    expect(huntShinyIn(4).wild).toBeCloseTo(12 / 5);
    expect(huntShinyIn(8).wild).toBeCloseTo(12 / 9);
    expect(huntShinyIn(8).trainer).toBeCloseTo(20 / 9);
    const m = mkMeta();
    noteHunt(m, 9, 2);
    noteHunt(m, 9, 6);
    noteHunt(m, 9, 3);
    expect([m.bestHunt, m.bestHuntHeat]).toEqual([9, 6]);
    noteHunt(m, 10, 0);
    expect([m.bestHunt, m.bestHuntHeat]).toEqual([10, 0]);
    noteHunt(m, 9, 8);
    expect([m.bestHunt, m.bestHuntHeat]).toEqual([10, 0]);
    m.bestHuntHeat = 6;
    expect(myScores(m).hunt).toBe(1006);
    expect(showHunt(1006)).toBe('Floor 10 · Heat 6');
    expect(showHunt(900)).toBe('Floor 9');
    expect(showHunt(9)).toBe('Floor 9');
  });
  it('stocks a Limit Breaker in every shop from Gilded Hunt floor 6, and nowhere else', () => {
    const run = startRun(mkMeta(), 'emberkit', 11);
    for (let r = 0; r < 30; r++) expect(rollShop(run, r).slots.some((s) => s.item === 'limit')).toBe(false);
    run.hunt = { depth: 5, shinies: 0 };
    for (let r = 0; r < 30; r++) expect(rollShop(run, r).slots.some((s) => s.item === 'limit')).toBe(false);
    run.hunt.depth = 6;
    for (let r = 0; r < 30; r++) {
      const shop = rollShop(run, r);
      expect(shop.slots.filter((s) => s.item === 'limit').length).toBe(1);
      expect(shop.slots.length).toBe(5);
    }
    // +5 cap each time (stacking), and stored XP pours in.
    const c = run.team[0];
    setFloorCeiling(Infinity);
    c.stage = 2;
    c.stars = 5;
    c.level = levelCap(c);
    expect(c.level).toBe(125);
    c.banked = 10 ** 9;
    const slot = rollShop(run).slots.find((s) => s.item === 'limit')!;
    applyItem(run, slot, c);
    expect(levelCap(c)).toBe(130);
    expect(c.level).toBe(130);
    applyItem(run, slot, c);
    expect(levelCap(c)).toBe(135);
  });
  it('stocks 5 distinct items with floor-scaled, haggler-discounted prices', () => {
    const run = startRun(mkMeta(), 'emberkit', 11);
    const shop = rollShop(run);
    expect(new Set(shop.slots.map((s) => s.item)).size).toBe(5);
    const f1 = priceFor(run, 100);
    run.floor = 2;
    expect(priceFor(run, 100)).toBeGreaterThan(f1);
    run.passive = 'haggler';
    expect(priceFor(run, 100)).toBeLessThan(priceFor({ ...run, passive: null }, 100));
  });
  it('charges coins, unlocks Haggler, and applies items', () => {
    const run = startRun(mkMeta(), 'emberkit', 12);
    run.coins = 1000;
    pay(run, 600);
    expect(run.coins).toBe(400);
    expect(run.meta.unlockedPassives).toContain('haggler'); // Big Spender achievement
    const lvl = run.team[0].level;
    applyItem(run, { item: 'manual', price: 0, sold: false }, run.team[0]);
    expect(run.team[0].level).toBe(lvl + 2);
    applyItem(run, { item: 'stone', price: 0, sold: false });
    expect(run.evoStones).toBe(1);
  });
});

describe('acquiring creatures', () => {
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
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('capped creatures turn XP into coins: a little while storing, more once the store is full', () => {
    const run = startRun(mkMeta(), 'emberkit', 5);
    const c = run.team[0];
    addXp(c, 1e6);
    c.banked = 0;
    const coins0 = run.coins;
    const [r1] = grantXp(run, 250, [c.uid]);
    expect(r1.banked).toBe(250);
    expect(r1.coins).toBe(Math.round((250 * BALANCE.capCoinsPerLevel) / xpToNext(c.level)));
    c.banked = bankLimit(c);
    const [r2] = grantXp(run, 250, [c.uid]);
    expect(r2.full).toBe(true);
    expect(r2.coins).toBe(Math.round((250 * BALANCE.fullBankCoinsPerLevel) / xpToNext(c.level)));
    expect(run.coins).toBe(coins0 + r1.coins + r2.coins);
  });
  it('after a battle, bench creatures fill the slots of the fallen', async () => {
    const { fillTeamFromBench } = await import('../src/logic/run');
    const run = startRun(mkMeta(), 'emberkit', 5);
    run.team.push(createCreature('mossling', 5), createCreature('mossling', 5));
    const b1 = createCreature('puddlet', 5);
    const b2 = createCreature('puddlet', 5);
    run.bench.push(b1, b2);
    run.team[1].hp = 0;
    run.team[2].hp = 0;
    expect(buryFallen(run)).toHaveLength(2);
    expect(fillTeamFromBench(run)).toEqual([b1, b2]);
    expect(run.team).toHaveLength(3);
    expect(run.bench).toHaveLength(0);
  });
  it('each floor has a level ceiling; XP past it is stored and released on the next floor', () => {
    const run = startRun(mkMeta(), 'emberkit', 5);
    const c = run.team[0];
    evolve(c);
    addXp(c, 1e7);
    expect(stageCap(c)).toBe(65);
    expect(c.level).toBe(BALANCE.floorLevelCap[0]);
    expect(c.banked).toBeGreaterThan(0);
    clearFloor(run);
    expect(c.level).toBe(Math.min(stageCap(c), BALANCE.floorLevelCap[0] + BANK_LEVELS));
  });
  it('enemy stars follow your team on later floors, up to the floor maximum', async () => {
    const { enemyStars } = await import('../src/logic/run');
    const run = startRun(mkMeta(), 'emberkit', 5);
    run.team.push(createCreature('mossling', 5), createCreature('mossling', 5));
    run.team.forEach((c) => (c.stars = 2));
    const rng = new Rng(1);
    expect(enemyStars(run, 'boss', rng)).toBe(0); // floor 1: never starred
    run.floor = 1;
    expect(enemyStars(run, 'elite', rng)).toBe(2);
    expect(enemyStars(run, 'boss', rng)).toBe(2 + BALANCE.bossStarBonus);
    for (let i = 0; i < 20; i++) expect([1, 2]).toContain(enemyStars(run, 'battle', rng));
    run.team.forEach((c) => (c.stars = 5));
    expect(enemyStars(run, 'boss', rng)).toBe(BALANCE.enemyStarMax[1]);
    run.floor = 2;
    expect(enemyStars(run, 'boss', rng)).toBe(5);
  });
  it('winning a run at a Heat lights that Heat token on the map', () => {
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', 5, 'wildlands');
    run.heat = 3;
    run.floor = 2;
    expect(clearFloor(run)).toBe(true);
    expect(meta.mapHeats?.wildlands).toEqual([3]);
    const again = startRun(meta, 'emberkit', 6, 'wildlands');
    again.heat = 1;
    again.floor = 2;
    clearFloor(again);
    expect(meta.mapHeats?.wildlands).toEqual([1, 3]);
  });
  it('with a full party, catching releases the chosen creature and takes its spot', () => {
    const run = startRun(mkMeta(), 'emberkit', 5);
    while (run.team.length < 4) run.team.push(createCreature('mossling', 5));
    while (run.bench.length < 3) run.bench.push(createCreature('mossling', 5));
    const out = run.team[2];
    out.held = 'band';
    expect(catchCreature(run, createCreature('puddlet', 4))).toBe(null);
    const got = catchCreature(run, createCreature('puddlet', 4), out)!;
    expect(run.team[2]).toBe(got.c);
    expect(allCreatures(run)).not.toContain(out);
    expect(run.team).toHaveLength(4);
    expect(run.bench).toHaveLength(3);
    expect(run.bag).toContain('band');
  });
  it('first catch of a species arrives prestiged; repeats do not', () => {
    const run = startRun(mkMeta(), 'emberkit', 5);
    const wild = createCreature('mossling', 4);
    const a = catchCreature(run, wild)!;
    expect(a.bonus).toBe('species');
    expect(a.c.stars).toBe(1);
    expect(a.c.level).toBe(4); // joins at the level it was in battle
    const b = catchCreature(run, wild)!;
    expect(b.bonus).toBe(null);
    expect(b.c.stars).toBe(0);
  });
  it('after the Dex is complete, the bonus goes per element, once per run', () => {
    const meta = mkMeta();
    meta.dex.caught = SPECIES.map((s) => s.id);
    const run = startRun(meta, 'emberkit', 8);
    const fw = catchCreature(run, createCreature('steamle', 3))!; // Fire/Water
    expect(fw.bonus).toBe('type');
    expect(fw.c.stars).toBe(1);
    const we = catchCreature(run, createCreature('coralite', 3))!; // Water/Earth: Earth is still fresh
    expect(we.bonus).toBe('type');
    expect(we.newlyClaimed).toEqual(['Earth']);
    expect(catchCreature(run, createCreature('emberkit', 3))!.bonus).toBe(null); // Fire/Fire: fire used
    expect(catchCreature(run, createCreature('magmole', 3))!.bonus).toBe(null); // Fire/Earth: both used
    expect(catchCreature(run, createCreature('rimehawk', 3))!.bonus).toBe('type'); // Frost/Storm: fresh
    const next = startRun(meta, 'emberkit', 9);
    expect(next.claimedTypes).toEqual([]); // resets each run
  });
  it('claimed guardians join at their level +5 in their evolved form, keeping their stars', () => {
    const run = startRun(mkMeta(), 'emberkit', 6);
    const boss = createCreature('cragice', 27, 1);
    boss.stars = 2;
    const c = claimGuardian(run, boss)!;
    expect(c.level).toBe(32);
    expect(c.stage).toBe(1);
    expect(c.stars).toBe(2);
    expect(c.hp).toBe(stats(c).hp);
    // Never past its stage cap or the next floor's ceiling.
    const big = createCreature('cragice', 98, 2);
    expect(claimGuardian(run, big)!.level).toBe(Math.min(100, BALANCE.floorLevelCap[1]));
  });
  it('pre-boss shops always stock healing, even after rerolls', () => {
    const run = startRun(mkMeta(), 'emberkit', 7);
    let shop = rollShop(run, 0, ['potion', 'restore']);
    for (let i = 0; i < 5; i++) {
      const items = shop.slots.map((s) => s.item);
      expect(items).toContain('potion');
      expect(items).toContain('restore');
      shop = rollShop(run, shop.rerolls + 1, shop.guaranteed);
    }
  });
});

describe('early fairness', () => {
  const mkMeta = (): Meta => ({
    unlockedStarters: [...SPECIES.map((s) => s.id)],
    unlockedPassives: [],
    equippedPassive: null,
    runs: 0,
    wins: 0,
    dex: emptyDex(),
    coinsSpent: 0,
    bossesDefeated: 0,
    clearedMaps: [],
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('first battle is neutral both ways', () => {
    for (const starter of SPECIES) {
      for (let seed = 1; seed <= 25; seed++) {
        const run = startRun(mkMeta(), starter.id, seed * 31 + starter.id.length);
        const lead = SPECIES_BY_ID[starter.id].types;
        const first = run.map.nodes[run.map.nodes[run.currentId].next[0]];
        moveTo(run, first.id);
        const neutralExists = SPECIES.some((o) => neutralMatchup(o, lead));
        for (const e of makeEncounter(run, first)) {
          const sp = SPECIES_BY_ID[e.speciesId];
          expect(noAdvantageOver(sp, lead)).toBe(true); // never super effective on you
          if (neutralExists) expect(neutralMatchup(sp, lead)).toBe(true);
        }
      }
    }
  }, 30000); // Builds every starter's first battle: about 4 s alone, so the 5 s default flakes under load.
});

describe('roster and move variety', () => {
  it('has ~120 families: 4 pure per element and every name unique', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(115);
    for (const e of ELEMENTS) expect(SPECIES.filter((s) => s.types[0] === e && s.types[1] === e).length).toBeGreaterThanOrEqual(4);
    const names = SPECIES.flatMap((s) => s.names);
    expect(new Set(names).size).toBe(names.length);
    const ids = SPECIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every element has an 11-move pool and every family a signature it learns', () => {
    for (const e of ELEMENTS) expect(elementPool(e)).toHaveLength(11);
    for (const s of SPECIES) {
      expect(MOVES[s.signature].signature).toBe(s.id);
      expect(learnset(s).map((l) => l.id)).toContain(s.signature);
    }
  });
  it('families of the same element learn different mixes', () => {
    for (const e of ELEMENTS) {
      const pures = SPECIES.filter((s) => s.types[0] === e && s.types[1] === e);
      const sets = new Set(pures.map((s) => learnset(s).map((l) => l.id).filter((id) => !id.startsWith('sig:')).join(',')));
      expect(sets.size).toBeGreaterThan(1);
    }
  });
});

describe('move mechanics', () => {
  const duel = (pMove: string, eMove = 'Earth:0', pLvl = 20, eLvl = 20) => {
    const p = createCreature('emberkit', pLvl);
    p.moves = [{ id: pMove, tier: 1 }];
    const e = createCreature('pebblin', eLvl);
    e.moves = [{ id: eMove, tier: 1 }];
    return new Battle([p], [e], new Rng(5));
  };
  it('priority moves go first even when slower', () => {
    const b = duel('Fire:sp0', 'Earth:0');
    b.e.c.level = 60; // much faster
    const ev = b.takeTurn({ kind: 'move', index: 0 });
    const firstAttack = ev.find((x) => x.kind === 'attack') as { side: string };
    expect(firstAttack.side).toBe('player');
  });
  it('multi-hit, drain, recoil and heal all apply', () => {
    const multi = duel('Frost:sp2').takeTurn({ kind: 'move', index: 0 });
    expect(multi.filter((x) => x.kind === 'damage' && x.side === 'enemy').length).toBeGreaterThanOrEqual(2);
    const b = duel('Fire:sp1');
    const hp0 = b.p.c.hp;
    b.takeTurn({ kind: 'move', index: 0 });
    expect(b.p.c.hp).toBeLessThan(hp0); // recoil (and enemy hit)
    const h = duel('Nature:extra', 'Earth:0', 20, 1);
    h.p.c.hp = 10;
    h.takeTurn({ kind: 'move', index: 0 });
    expect(h.p.c.hp).toBeGreaterThan(10);
  });
});

describe('double knockout', () => {
  it('counts as a loss when your last creature falls to recoil on the final blow', () => {
    const p = createCreature('emberkit', 30);
    p.moves = [{ id: 'Fire:sp1', tier: 1 }]; // heavy recoil move
    p.hp = 1;
    const e = createCreature('pebblin', 1);
    e.moves = [{ id: 'Earth:0', tier: 1 }];
    e.hp = 1;
    const b = new Battle([p], [e], new Rng(1));
    for (let i = 0; i < 10 && b.outcome() === 'ongoing'; i++) b.takeTurn({ kind: 'move', index: 0 });
    if (p.hp === 0) expect(b.outcome()).toBe('lose');
  });
});

describe('saving runs, maps and events', () => {
  const store: Record<string, string> = {};
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => void (store[k] = v),
    removeItem: (k: string) => void delete store[k],
  } as Storage;
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
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('a saved run reloads identically, including the RNG', () => {
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', 99, 'volcanic');
    run.coins = 77;
    run.team[0].hp = 5;
    saveRun(run);
    const back = loadRun(meta)!;
    expect(back.coins).toBe(77);
    expect(back.team[0].hp).toBe(5);
    expect(back.biomes).toEqual(['Fire', 'Earth', 'Dragon']);
    expect(back.rng.next()).toBe(run.rng.next());
    clearSavedRun();
    expect(hasSavedRun()).toBe(false);
  });
  it('maps unlock with boss kills', () => {
    const meta = mkMeta();
    expect(unlockedMaps(meta).map((m) => m.id)).toEqual(['wildlands', 'verdant']);
    meta.bossesDefeated = 20; // bosses alone don't unlock maps
    expect(unlockedMaps(meta).map((m) => m.id)).toEqual(['wildlands', 'verdant']);
    meta.wins = 2;
    expect(unlockedMaps(meta).map((m) => m.id)).toContain('volcanic');
  });
  it('every event option runs without errors and does what it says', () => {
    for (const ev of EVENTS) {
      for (const o of ev.options) {
        const run = startRun(mkMeta(), 'emberkit', 3);
        run.coins = 500;
        run.evoStones = 1;
        addLevels(run.team[0], 20);
        run.team[0].hp = Math.round(run.team[0].hp * 0.8);
        run.bench.push(createCreature('mossling', 3));
        if (o.blocked?.(run)) throw new Error(`${ev.id}: ${o.label} blocked`);
        const target = o.target ? allCreatures(run).find((c) => o.eligible?.(run, c) ?? true) : undefined;
        if (o.target && !target) throw new Error(`${ev.id}: ${o.label} has no eligible creature`);
        const res = o.run(run, target);
        expect(res.text.length).toBeGreaterThan(0);
        for (const c of allCreatures(run)) expect(c.hp).toBeGreaterThan(0);
      }
    }
    const run = startRun(mkMeta(), 'emberkit', 4);
    run.coins = 100;
    const egg = EVENTS.find((e) => e.id === 'egg')!;
    egg.options[0].run(run);
    expect(run.team.length).toBe(2);
  });
  it('events do not repeat until every one has been seen', () => {
    const run = startRun(mkMeta(), 'emberkit', 5);
    const ids = EVENTS.map(() => rollEvent(run).id);
    expect(new Set(ids).size).toBe(EVENTS.length);
  });
  it('the stone circle trades a bench creature for a star', () => {
    const run = startRun(mkMeta(), 'emberkit', 6);
    const benched = createCreature('mossling', 3);
    run.bench.push(benched);
    EVENTS.find((e) => e.id === 'circle')!.options[0].run(run, benched);
    expect(run.bench).not.toContain(benched);
    expect(run.team[0].stars).toBe(1);
  });
});

describe('starting moves', () => {
  it('no creature starts with a heavy or multi-hit special', () => {
    for (const sp of SPECIES) {
      const c = createCreature(sp.id, 1);
      for (const m of c.moves) {
        expect(MOVES[m.id].recoil ?? 0).toBe(0);
        expect(MOVES[m.id].hits ?? 1).toBe(1);
      }
    }
  });
});

describe('passive unlocks', () => {
  const fresh = (): Meta => ({ unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: ['mentor'], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] });
  it('come from achievements, earnable without winning', () => {
    const meta = fresh();
    const run = startRun(meta, 'emberkit', 2);
    clearFloor(run);
    clearFloor(run);
    expect(meta.unlockedPassives).toEqual(['mentor']); // bosses alone unlock nothing
    for (let i = 0; i < 10; i++) catchCreature(run, createCreature('mossling', 2)) && run.bench.splice(0) && run.team.splice(1);
    expect(meta.unlockedPassives).toContain('scout'); // Collector: 10 catches, no win needed
    expect(meta.newAchievements).toContain('collector');
    expect(clearFloor(run)).toBe(true);
    expect(meta.unlockedPassives).toContain('champion');
  });
  it('new passives take effect at run start', () => {
    const meta = fresh();
    meta.unlockedPassives.push('champion', 'evolutionist');
    meta.equippedPassive = 'champion';
    expect(startRun(meta, 'emberkit', 1).team[0].level).toBe(10);
    meta.equippedPassive = 'evolutionist';
    expect(startRun(meta, 'emberkit', 1).evoStones).toBe(1);
  });
});

describe('starter unlocks', () => {
  it('catching a species unlocks it as a starter immediately; bosses do not', () => {
    const meta: Meta = { unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: ['mentor'], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] };
    const run = startRun(meta, 'emberkit', 8);
    clearFloor(run);
    expect(meta.unlockedStarters).toEqual(DEFAULT_STARTERS);
    catchCreature(run, createCreature('gloomkit', 3));
    expect(meta.unlockedStarters).toContain('gloomkit');
  });
});

describe('more passives', () => {
  const fresh = (): Meta => ({ unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: ['mentor'], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] });
  it('every passive except Mentor has exactly one achievement', async () => {
    const { ACHIEVEMENTS } = await import('../src/logic/achievements');
    const { PASSIVES } = await import('../src/logic/run');
    for (const id of Object.keys(PASSIVES)) {
      const n = ACHIEVEMENTS.filter((a) => a.passive === id).length;
      expect(n).toBe(id === 'mentor' ? 0 : 1);
    }
  });
  it('coin purse, bodyguard and lucky odds work', async () => {
    const { promoteBench, luckyOdds } = await import('../src/logic/run');
    const meta = fresh();
    meta.equippedPassive = 'coinpurse';
    expect(startRun(meta, 'emberkit', 1).coins).toBe(50);
    meta.equippedPassive = 'bodyguard';
    const run = startRun(meta, 'emberkit', 1);
    const b = createCreature('mossling', 5);
    b.hp = 1;
    run.bench.push(b);
    run.team[0].hp = 0;
    expect(promoteBench(run)).toBe(true);
    expect(run.team[0].hp).toBe(stats(run.team[0]).hp);
    expect(meta.stats.wipes).toBe(1);
    run.passive = 'lucky';
    expect(luckyOdds(run)).toBe(0.75);
  });
});

describe('bosses and trainers', () => {
  const mk = (id: string, level = 30) => {
    const c = createCreature(id, level);
    c.hp = stats(c).hp;
    return c;
  };
  const anyOf = (el: Element) => SPECIES.find((s) => s.types[0] === el && s.types[1] === el)!.id;

  it('guardians bring 1 rule, 2 from Heat 4 and 3 at Heat 8, distinct and the same on reload, a little lower level', () => {
    for (const el of ELEMENTS) {
      const boss = BOSSES[el];
      expect(guardianRules(boss, 0, 7, 0).map((r) => r.rule)).toEqual([boss.rule]);
      for (const heat of [4, 5, 6, 7, 8]) {
        const rs = guardianRules(boss, heat, 99, 1);
        expect(rs).toHaveLength(heat >= 8 ? 3 : 2);
        expect(rs[0].rule).toBe(boss.rule);
        expect(new Set(rs.map((r) => r.rule)).size).toBe(rs.length);
        expect(guardianRules(boss, heat, 99, 1)).toEqual(rs);
        for (const r of rs) expect(RULES[r.rule]).toBeTruthy();
      }
    }
    expect(extraRuleCount(3)).toBe(0);
    expect(extraRuleCount(4)).toBe(1);
    expect(extraRuleCount(8)).toBe(2);
  });

  it('extra rules: several at once, brittle and dread on entry, keen eye never misses, leech drains', () => {
    const b = new Battle([mk(anyOf('Water'))], [mk(anyOf('Toxic'))], new Rng(1), {
      rules: [
        { rule: 'brittle', name: 'Brittle Air' },
        { rule: 'dread', name: 'Dread' },
      ],
    });
    b.start();
    expect(b.p.defStage).toBe(-1);
    expect(b.p.atkStage).toBe(-1);
    // Leech: at the end of a turn your Hexling loses HP (both sides just use a status move).
    const me = mk(anyOf('Water'), 40);
    const foe = mk(anyOf('Toxic'), 40);
    const l = new Battle([me], [foe], new Rng(2), { rules: [{ rule: 'leech', name: 'Leech Field' }], enemyRandomness: 0 });
    l.start();
    const ev = l.takeTurn({ kind: 'move', index: me.moves.findIndex((m) => moveDef(m).kind !== 'attack') });
    expect(ev.some((e) => e.kind === 'text' && e.text.startsWith('Leech Field'))).toBe(true);
  });

  it('has a boss for every element', () => {
    for (const el of ELEMENTS) expect(BOSSES[el].element).toBe(el);
  });

  it('miasma poisons and whiteout slows creatures as they enter', () => {
    const b = new Battle([mk(anyOf('Water'))], [mk(anyOf('Toxic'))], new Rng(1), { rule: 'miasma' });
    b.start();
    expect(b.p.status).toBe('poison');
    const w = new Battle([mk(anyOf('Water'))], [mk(anyOf('Frost'))], new Rng(1), { rule: 'whiteout' });
    w.start();
    expect(w.p.spdStage).toBe(-1);
  });

  it('pride buffs only the ace, bulwark buffs every boss creature', () => {
    const team = () => [mk(anyOf('Dragon')), mk(anyOf('Dragon'))];
    const p = new Battle([mk(anyOf('Water'))], team(), new Rng(1), { rule: 'pride' });
    p.start();
    expect(p.e.atkStage).toBe(0);
    const bw = new Battle([mk(anyOf('Water'))], team(), new Rng(1), { rule: 'bulwark' });
    bw.start();
    expect(bw.e.defStage).toBe(1);
  });

  it('thorns hurt the attacker and scorch spares Fire types', () => {
    const me = mk(anyOf('Water'), 40);
    const t = new Battle([me], [mk(anyOf('Nature'), 40)], new Rng(3), { rule: 'thorns', enemyRandomness: 0 });
    const atk = me.moves.findIndex((m) => moveDef(m).kind === 'attack');
    const before = me.hp;
    t.takeTurn({ kind: 'move', index: atk });
    expect(me.hp).toBeLessThan(before);
    const scorched = (lead: string) => {
      const c = mk(lead, 40);
      const sc = new Battle([c], [mk(anyOf('Earth'), 40)], new Rng(3), { rule: 'scorch', ruleName: 'Scorched Ground' });
      const ev = sc.takeTurn({ kind: 'move', index: c.moves.findIndex((m) => moveDef(m).kind === 'attack') });
      return ev.some((e) => e.kind === 'text' && e.text.includes('is scorched'));
    };
    expect(scorched(anyOf('Water'))).toBe(true);
    expect(scorched(anyOf('Fire'))).toBe(false);
  });

  it('trainer battles pay far more than wild ones and boss teams match their element', () => {
    const foes = [mk(anyOf('Fire'), 20)];
    expect(Math.abs(battleXp(foes, 'elite', 0) - battleXp(foes, 'battle', 0) * 3)).toBeLessThanOrEqual(2);
    expect(battleCoins(foes, 'elite')).toBe(battleCoins(foes, 'battle') * BALANCE.trainerCoinMult);
    const run = startRun(mkMetaBoss(), SPECIES[0].id, 9);
    const boss = run.map.nodes[run.map.bossId];
    for (const e of makeEncounter(run, boss)) expect(SPECIES_BY_ID[e.speciesId].types).toContain(run.biomes[0]);
  });
});

function mkMetaBoss(): Meta {
  return {
    unlockedStarters: [], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0,
    dex: { forms: [], moves: [], elements: [], caught: [] }, coinsSpent: 0, bossesDefeated: 0, clearedMaps: [],
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  };
}

describe('move animations match their names', () => {
  const styleOf = (name: string) => moveStyle(Object.values(MOVES).find((m) => m.name === name)!);
  it('picks the animation from the move name', () => {
    expect(styleOf('Venom Fang')).toBe('bite');
    expect(styleOf('Tsunami')).toBe('wave');
    expect(styleOf('Thunder Crash')).toBe('bolt');
    expect(styleOf('Wave Crash')).toBe('wave');
    expect(styleOf('Tusk Lance')).toBe('dash');
    expect(styleOf('Quake')).toBe('quake');
    expect(styleOf('Ember Pounce')).toBe('leap');
    expect(styleOf('Stone Skin')).toBe('shield');
    expect(styleOf('Photosynthesis')).toBe('mend');
  });
  it('gives nearly every move a named animation', () => {
    const generic = Object.values(MOVES).filter((m) => moveStyle(m) === 'element').map((m) => m.name);
    expect(generic.length).toBeLessThanOrEqual(3);
  });
  it('signature moves named like attacks are attacks', () => {
    for (const m of Object.values(MOVES)) {
      if (!m.signature) continue;
      if (/Cannon|Crush|Strike|Ray|Breath|Blast|Surge|Tunnel|Arc/.test(m.name)) expect(m.kind).toBe('attack');
    }
  });
});

describe('wild creatures are left at 1 HP to catch', () => {
  const mk = (id: string, level: number) => {
    const c = createCreature(id, level);
    c.hp = stats(c).hp;
    return c;
  };
  const atk = (c: ReturnType<typeof mk>) => c.moves.findIndex((m) => moveDef(m).kind === 'attack');

  it('stops the last wild creature at 1 HP and ends the battle', () => {
    const me = mk(SPECIES[0].id, 60);
    const wild = mk(SPECIES[5].id, 2);
    const b = new Battle([me], [wild], new Rng(4), { spareLast: true });
    for (let t = 0; t < 10 && b.outcome() === 'ongoing'; t++) b.takeTurn({ kind: 'move', index: atk(me) });
    expect(b.outcome()).toBe('win');
    expect(b.spared).toBe(true);
    expect(wild.hp).toBe(1);
  });

  it('only spares the last one: earlier wild creatures faint normally', () => {
    const me = mk(SPECIES[0].id, 60);
    const first = mk(SPECIES[5].id, 2);
    const second = mk(SPECIES[9].id, 2);
    const b = new Battle([me], [first, second], new Rng(4), { spareLast: true });
    for (let t = 0; t < 20 && b.outcome() === 'ongoing'; t++) b.takeTurn({ kind: 'move', index: atk(me) });
    expect(first.hp).toBe(0);
    expect(second.hp).toBe(1);
    expect(b.outcome()).toBe('win');
  });

  it('trainer and boss creatures still faint', () => {
    const me = mk(SPECIES[0].id, 60);
    const foe = mk(SPECIES[5].id, 2);
    const b = new Battle([me], [foe], new Rng(4));
    for (let t = 0; t < 10 && b.outcome() === 'ongoing'; t++) b.takeTurn({ kind: 'move', index: atk(me) });
    expect(foe.hp).toBe(0);
    expect(b.spared).toBe(false);
  });
});

describe('save versions', () => {
  it('saves record their version; newer saves are recognised and save codes from them refused', async () => {
    const { versionCode, fromNewerVersion, savedBy } = await import('../src/logic/saveVersion');
    const { APP_VERSION } = await import('../src/data/changelog');
    const { saveMeta } = await import('../src/logic/run');
    const { encodeSave, decodeSave } = await import('../src/logic/saveCode');
    expect(versionCode('1.9')).toBeLessThan(versionCode('1.10'));
    expect(versionCode('1.52')).toBeLessThan(versionCode('2.0'));
    const m = (await import('../src/logic/run')).loadMeta();
    saveMeta(m);
    expect(m.savedBy).toBe(APP_VERSION);
    const json = JSON.stringify(m);
    expect(savedBy(json)).toBe(APP_VERSION);
    expect(fromNewerVersion(json)).toBe(false);
    expect(fromNewerVersion(JSON.stringify({ ...m, savedBy: '99.0' }))).toBe(true);
    expect(fromNewerVersion(JSON.stringify({ ...m, savedBy: undefined }))).toBe(false);
    const code = await encodeSave({ at: 1, meta: JSON.stringify({ ...m, savedBy: '99.0' }), run: null });
    await expect(decodeSave(code)).rejects.toThrow(/newer version/);
    const ok = await encodeSave({ at: 1, meta: json, run: null });
    await expect(decodeSave(ok)).resolves.toBeTruthy();
  });
});

describe('caught creatures keep their level and evolution', () => {
  const meta = (): Meta => ({
    unlockedStarters: [], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0,
    dex: { forms: [], moves: [], elements: [], caught: [] }, coinsSpent: 0, bossesDefeated: 0, clearedMaps: [],
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('joins at the same level, stage and moves, at partial HP', () => {
    const run = startRun(meta(), 'emberkit', 11);
    const wild = createCreature('frostling', 40, 1);
    wild.hp = 1;
    const { c } = catchCreature(run, wild)!;
    expect(c.level).toBe(40);
    expect(c.stage).toBe(1);
    expect(c.moves.map((m) => m.id)).toEqual(wild.moves.map((m) => m.id));
    expect(c.uid).not.toBe(wild.uid);
    // Still recovering from the fight (±1: a wild one with no nature gets one on joining, which rescales its HP).
    expect(Math.abs(c.hp - Math.round(stats(c).hp * BALANCE.catchHp))).toBeLessThanOrEqual(1);
  });
  it('Scout adds 3 levels, never past the level cap', () => {
    const run = startRun({ ...meta(), equippedPassive: 'scout', unlockedPassives: ['scout'] }, 'emberkit', 12);
    run.passive = 'scout';
    expect(catchCreature(run, createCreature('frostling', 10))!.c.level).toBe(13);
    const capped = catchCreature(run, createCreature('frostling', 30))!.c; // stage 1 cap is 30
    expect(capped.level).toBe(levelCap(capped));
  });
});

describe('learn-move recommendation', () => {
  const buff = Object.values(MOVES).find((m) => m.kind === 'buff')!.id;
  it('suggests forgetting the weakest same-element attack for a stronger one', () => {
    const c = createCreature('emberkit', 30);
    c.moves = [{ id: attackId('Fire', 0), tier: 1 }, { id: attackId('Fire', 1), tier: 1 }, { id: attackId('Fire', 2), tier: 1 }, { id: buff, tier: 1 }];
    expect(recommendForget(c, attackId('Fire', 3))).toBe(0);
  });
  it('suggests not learning a move that is worse than everything', () => {
    const c = createCreature('emberkit', 30);
    c.moves = [{ id: attackId('Fire', 3), tier: 3 }, { id: attackId('Fire', 2), tier: 3 }, { id: attackId('Water', 3), tier: 3 }, { id: buff, tier: 3 }];
    expect(recommendForget(c, attackId('Fire', 0))).toBeNull();
  });
  it('never suggests dropping the only attack for a status move', () => {
    const c = createCreature('emberkit', 30);
    const buffs = Object.values(MOVES).filter((m) => m.kind === 'buff').map((m) => m.id);
    c.moves = [{ id: attackId('Fire', 0), tier: 1 }, { id: buffs[0], tier: 1 }, { id: buffs[1], tier: 1 }, { id: buffs[2], tier: 1 }];
    expect(recommendForget(c, buffs[3])).not.toBe(0);
  });
  const rec = (sp: string, moves: string[], learn: string) => {
    const c = createCreature(sp, 34);
    c.moves = moves.map((id) => ({ id, tier: 1 }));
    const r = recommendForget(c, learn);
    return r === null ? null : moves[r];
  };
  it('weighs utility by fit: a slow line drops a spare attack for Time Warp, a fast one keeps its moves', () => {
    expect(rec('cogling', ['Metal:0', 'Metal:1', 'Metal:2', 'Metal:buff'], WARP_ID_)).toBe('Metal:0');
    expect(rec('zapling', ['Storm:0', 'Storm:1', 'Storm:2', 'Storm:buff'], WARP_ID_)).toBeNull();
  });
  it('values coverage: a new element replaces a redundant attack, not the boost', () => {
    expect(rec('emberkit', ['Fire:0', 'Fire:1', 'Fire:2', 'Fire:buff'], attackId('Water', 1))).toBe('Fire:0');
  });
  it('gives a reason', () => {
    const c = createCreature('cogling', 34);
    c.moves = ['Metal:0', 'Metal:1', 'Metal:2', 'Metal:buff'].map((id) => ({ id, tier: 1 }));
    expect(recommendReason(c, WARP_ID_, recommendForget(c, WARP_ID_))).toMatch(/covers/);
  });
  // Every line levelled to 60 following the suggestion, start to finish.
  const grown = (sp: string) => {
    const c = createCreature(sp, 5, 0);
    for (let lv = 6; lv <= 60; lv++) {
      c.level = lv;
      c.stage = lv >= 36 ? 2 : lv >= 16 ? 1 : 0;
      learnMoves(c);
      while (c.pendingMoves.length) {
        const id = c.pendingMoves.shift()!;
        const i = recommendForget(c, id);
        if (i !== null) c.moves[i] = { id, tier: 1 };
      }
    }
    return c.moves.filter((m) => MOVES[m.id].kind !== 'attack').length;
  };
  it('balances attacks and utility, by build: hitters keep more attacks, sturdy lines more utility', () => {
    const rows = SPECIES.map((sp) => ({ role: (sp.base.hp + sp.base.def) / (sp.base.atk + sp.base.spd), u: grown(sp.id) })).sort((x, y) => x.role - y.role);
    const avg = (xs: { u: number }[]) => xs.reduce((t, r) => t + r.u, 0) / xs.length;
    const third = Math.floor(rows.length / 3);
    // Not every line ends on the same split, and utility never crowds out attacks.
    expect(new Set(rows.map((r) => r.u)).size).toBeGreaterThan(1);
    expect(avg(rows)).toBeGreaterThan(1);
    expect(avg(rows)).toBeLessThan(1.8);
    expect(Math.max(...rows.map((r) => r.u))).toBeLessThanOrEqual(2);
    expect(avg(rows.slice(0, third))).toBeLessThan(avg(rows.slice(-third)));
  });
  /** A Lv 40 one of each line with these moves, and the slot suggested for `learn` with and without the context. */
  const differs = (moves: (x: Element) => string[], learn: (x: Element) => string, a: (c: Creature) => MoveContext, b: (c: Creature) => MoveContext, want: (ra: number | null, rb: number | null) => boolean) =>
    SPECIES.some((sp) => {
      const [x] = sp.types;
      const c = createCreature(sp.id, 40);
      c.moves = moves(x).map((id) => ({ id, tier: 1 }));
      return want(recommendForget(c, learn(x), a(c)), recommendForget(c, learn(x), b(c)));
    });
  it('fits your current build: held items, element boons and the team change the suggestion', () => {
    // A sturdy item makes a guard worth more than a hitting one does.
    expect(
      SPECIES.some((sp) => {
        const [x] = sp.types;
        const mk = (held: 'band' | 'shell') => {
          const c = createCreature(sp.id, 40);
          c.held = held;
          c.moves = [attackId(x, 2), attackId(x, 1), attackId(x, 0), `${x}:buff`].map((id) => ({ id, tier: 1 }));
          return recommendForget(c, BULWARK_ID_);
        };
        return mk('band') !== mk('shell');
      }),
    ).toBe(true);
    // An element boon makes that element's attacks count for more.
    const other = (x: Element): Element => (x === 'Fire' ? 'Water' : 'Fire');
    const boonOf: Partial<Record<Element, string>> = { Fire: 'kindling', Water: 'riptide', Frost: 'brittle', Earth: 'quake', Storm: 'chainlightning' };
    expect(
      differs(
        (x) => [attackId(x, 2), attackId(x, 1), attackId(other(x), 1), `${x}:buff`],
        (x) => attackId(x, 3),
        () => ({}),
        (c) => ({ boons: [boonOf[creatureTypes(c)[0]] ?? 'none'] }),
        (ra, rb) => ra !== rb,
      ),
    ).toBe(true);
    // A team move a teammate already brings is worth less.
    expect(
      SPECIES.some((sp) => {
        const c = createCreature(sp.id, 40);
        const [x] = sp.types;
        const tm = teamMoveId(x);
        c.moves = [attackId(x, 2), attackId(x, 1), attackId(x, 0), `${x}:buff`].map((id) => ({ id, tier: 1 }));
        const mate = createCreature(sp.id, 40);
        mate.moves = [{ id: tm, tier: 1 }];
        return recommendForget(c, tm, { team: [c] }) !== null && recommendForget(c, tm, { team: [c, mate] }) === null;
      }),
    ).toBe(true);
  });
});

describe('held items', () => {
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
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  const fighter = (held?: import('../src/data/held').HeldId) => {
    const c = createCreature('emberkit', 30);
    c.held = held;
    return c;
  };
  const avgDamage = (atk?: import('../src/data/held').HeldId, def?: import('../src/data/held').HeldId) => {
    let total = 0;
    for (let s = 0; s < 40; s++) {
      const a = fighter(atk);
      const d = createCreature('mossling', 30);
      d.held = def;
      d.hp = 100000;
      const b = new Battle([a], [d], new Rng(s));
      const ev = b.takeTurn({ kind: 'move', index: 0 });
      total += ev.filter((e) => e.kind === 'damage' && e.side === 'enemy').reduce((n, e) => n + (e.kind === 'damage' ? e.amount : 0), 0);
    }
    return total;
  };
  it('Power Band hits harder and Hard Shell takes less', () => {
    const base = avgDamage();
    expect(avgDamage('band')).toBeGreaterThan(base * 1.08);
    expect(avgDamage(undefined, 'shell')).toBeLessThan(base * 0.92);
  });
  it('Last Stand Sash survives one knockout blow from full HP', () => {
    const p = createCreature('emberkit', 60);
    const e = createCreature('mossling', 2);
    e.held = 'sash';
    e.hp = stats(e).hp;
    const b = new Battle([p], [e], new Rng(2));
    const ev = b.takeTurn({ kind: 'move', index: 0 });
    expect(ev.some((x) => x.kind === 'text' && x.text.includes('Last Stand Sash'))).toBe(true);
    expect(e.hp).toBeGreaterThanOrEqual(0);
  });
  it('items move between the bag and creatures, and come back when a creature falls', () => {
    const run = startRun(mkMeta(), 'emberkit', 9);
    const c = run.team[0];
    stash(run, 'band');
    stash(run, 'egg');
    equipHeld(run, c, 'band');
    expect(c.held).toBe('band');
    equipHeld(run, c, 'egg');
    expect(c.held).toBe('egg');
    expect(run.bag).toEqual(['band']);
    c.hp = 0;
    buryFallen(run);
    expect(run.bag!.sort()).toEqual(['band', 'egg']);
  });
  it("the Bag's dot shows new items until the Bag is opened, not items handed back", () => {
    const run = startRun(mkMeta(), 'emberkit', 9);
    expect(bagHasNew(run)).toBe(false);
    stash(run, 'band');
    expect(bagHasNew(run)).toBe(true);
    run.bagUnseen = 0; // opened the Bag
    expect(bagHasNew(run)).toBe(false);
    stash(run, 'egg', false); // returned, not earned
    expect(bagHasNew(run)).toBe(false);
    stash(run, 'egg');
    expect(bagHasNew(run)).toBe(true);
  });
  it('Lucky Egg earns more XP', () => {
    const run = startRun(mkMeta(), 'emberkit', 10);
    const a = run.team[0];
    const b = createCreature('emberkit', a.level);
    run.team.push(b);
    b.held = 'egg';
    const res = grantXp(run, 100);
    expect(res[1].xp).toBeGreaterThan(res[0].xp);
  });
});

describe('heat', () => {
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
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('a run never starts above the unlocked heat', () => {
    const meta = mkMeta();
    meta.heat = 5;
    expect(startRun(meta, 'emberkit', 1).heat).toBe(0);
    meta.heatUnlocked = 3;
    expect(startRun(meta, 'emberkit', 1).heat).toBe(3);
  });
  it('winning at your top heat unlocks the next one', () => {
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', 2);
    run.floor = 2;
    expect(clearFloor(run)).toBe(true);
    expect(meta.heatUnlocked).toBe(1);
    const run2 = startRun(meta, 'emberkit', 3);
    run2.floor = 2;
    clearFloor(run2); // played at heat 0 again: no new unlock
    expect(meta.heatUnlocked).toBe(1);
  });
  it('heat raises enemy levels and prices', () => {
    const meta = mkMeta();
    meta.heatUnlocked = 8;
    const lv = (heat: number) => {
      meta.heat = heat;
      const run = startRun(meta, 'emberkit', 4);
      const node = Object.values(run.map.nodes).find((n) => n.kind === 'battle')!;
      return { level: makeEncounter(run, node)[0].level, price: rollShop(run).slots[0].price };
    };
    const cold = lv(0);
    const hot = lv(8);
    expect(hot.level).toBe(cold.level + 2);
    expect(hot.price).toBeGreaterThan(cold.price);
  });
});

describe('daily run', () => {
  const mkMeta = (): Meta => ({
    unlockedStarters: [...DEFAULT_STARTERS],
    unlockedPassives: [],
    equippedPassive: 'champion',
    runs: 0,
    wins: 0,
    dex: emptyDex(),
    coinsSpent: 0,
    bossesDefeated: 0,
    clearedMaps: [],
    lastMap: 'tidal', stats: emptyStats(), achievements: [], newAchievements: [],
    heatUnlocked: 4, heat: 4,
  });
  it('is the same for everyone on a given day, and differs between days', () => {
    expect(dailyStarters('2026-11-16')).toEqual(dailyStarters('2026-11-16'));
    expect(dailyStarters('2026-11-16')).not.toEqual(dailyStarters('2026-11-17'));
    const a = startRun(mkMeta(), dailyStarters('2026-11-16')[0], dailySeed('2026-11-16'), 'wildlands', '2026-11-16');
    const b = startRun(mkMeta(), dailyStarters('2026-11-16')[0], dailySeed('2026-11-16'), 'wildlands', '2026-11-16');
    expect(a.biomes).toEqual(b.biomes);
    expect(JSON.stringify(a.map)).toBe(JSON.stringify(b.map));
  });
  it('ignores passives, heat and the last map', () => {
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', dailySeed('2026-11-16'), 'wildlands', '2026-11-16');
    expect(run.passive).toBeNull();
    expect(run.heat).toBe(0);
    expect(run.team[0].level).toBe(BALANCE.starterLevel);
    expect(meta.lastMap).toBe('tidal');
  });
  it('keeps the best result of the day', () => {
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', dailySeed('2026-11-16'), 'wildlands', '2026-11-16');
    run.floor = 1;
    run.log.battlesWon = 9;
    expect(recordDaily(run, false)).toBe(true);
    const worse = startRun(meta, 'emberkit', dailySeed('2026-11-16'), 'wildlands', '2026-11-16');
    worse.log.battlesWon = 30;
    expect(recordDaily(worse, false)).toBe(false);
    expect(meta.daily!.best!.floor).toBe(1);
    expect(meta.daily!.attempts).toBe(2);
  });
  it('keeps a separate record for every day, so past dailies can be played', async () => {
    const { dailyPlayed } = await import('../src/logic/run');
    const meta = mkMeta();
    const old = startRun(meta, 'emberkit', dailySeed('2026-10-02'), 'wildlands', '2026-10-02');
    old.floor = 2;
    recordDaily(old, false);
    const now = startRun(meta, 'emberkit', dailySeed('2026-11-16'), 'wildlands', '2026-11-16');
    recordDaily(now, true);
    expect(dailyPlayed(meta, '2026-10-02')!.best!.floor).toBe(2);
    expect(dailyPlayed(meta, '2026-11-16')!.best!.won).toBe(true);
    expect(dailyPlayed(meta, '2026-10-03')).toBeNull();
    expect(dailyStarters('2026-10-02')).not.toEqual(dailyStarters('2026-11-16'));
  });
});

describe('potions', () => {
  it('a potion in battle heals the chosen creature and the enemy still acts', () => {
    const p = createCreature('emberkit', 20);
    p.hp = 10;
    const e = createCreature('mossling', 20);
    const b = new Battle([p], [e], new Rng(4));
    const ev = b.takeTurn({ kind: 'potion', index: 0, heal: 0.5 });
    expect(ev.some((x) => x.kind === 'heal' && x.side === 'player')).toBe(true);
    expect(ev.some((x) => x.kind === 'attack' && x.side === 'enemy')).toBe(true);
  });
  it('shop potions go into the pouch, which holds five', () => {
    const run = startRun(
      { unlockedStarters: ['emberkit'], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] },
      'emberkit',
      1,
    );
    const slot = { item: 'potion' as const, price: 0, sold: false };
    for (let i = 0; i < 5; i++) applyItem(run, slot);
    expect(run.potions).toBe(5);
    expect(unusableReason(run, slot)).toMatch(/full/);
  });
});

describe('pixel icons', () => {
  it('every icon grid fits its canvas and uses palette colors', async () => {
    const { iconProblems } = await import('../src/ui/icons');
    expect(iconProblems()).toEqual([]);
  });
});

describe('team synergy', () => {
  it('two or more creatures sharing an element boost that stat for the team', async () => {
    const { teamSynergy, synergyMults } = await import('../src/logic/synergy');
    const fire = SPECIES.filter((s) => s.types[0] === 'Fire' && s.types[1] === 'Fire');
    const team = [createCreature(fire[0].id, 5), createCreature(fire[1].id, 5)];
    expect(teamSynergy(team)).toEqual([{ element: 'Fire', count: 2, stat: 'atk', bonus: 0.06 }]);
    team.push(createCreature(fire[2].id, 5));
    expect(synergyMults(team).atk).toBeCloseTo(1.12);
    expect(synergyMults(team, 2).atk).toBeCloseTo(1.24);
    expect(teamSynergy([createCreature(fire[0].id, 5)])).toEqual([]);
  });
  it('synergy makes your attacks hit harder', () => {
    let plain = 0;
    let boosted = 0;
    for (let s = 0; s < 30; s++) {
      for (const syn of [undefined, { atk: 1.2, def: 1, spd: 1 }]) {
        const d = createCreature('mossling', 30);
        d.hp = 100000;
        const b = new Battle([createCreature('emberkit', 30)], [d], new Rng(s), { synergy: syn });
        const dmg = b.takeTurn({ kind: 'move', index: 0 }).reduce((n, e) => n + (e.kind === 'damage' && e.side === 'enemy' ? e.amount : 0), 0);
        if (syn) boosted += dmg;
        else plain += dmg;
      }
    }
    expect(boosted).toBeGreaterThan(plain * 1.1);
  });
  it('Tempered creatures shrug off burn and poison', () => {
    const p = createCreature('mossling', 20);
    const e = createCreature('emberkit', 20);
    const b = new Battle([p], [e], new Rng(1), { rule: 'miasma', ruleName: 'Miasma', playerStatusImmune: ['burn', 'poison'] });
    b.start();
    expect(b.p.status).toBeNull();
  });
});

describe('boss synergy and status length', () => {
  it('enemy synergy toughens the enemy side', () => {
    let plain = 0;
    let tough = 0;
    for (let s = 0; s < 30; s++) {
      for (const syn of [undefined, { atk: 1, def: 1.2, spd: 1 }]) {
        const d = createCreature('mossling', 30);
        d.hp = 100000;
        const b = new Battle([createCreature('emberkit', 30)], [d], new Rng(s), { enemySynergy: syn });
        const dmg = b.takeTurn({ kind: 'move', index: 0 }).reduce((n, e) => n + (e.kind === 'damage' && e.side === 'enemy' ? e.amount : 0), 0);
        if (syn) tough += dmg;
        else plain += dmg;
      }
    }
    expect(tough).toBeLessThan(plain * 0.92);
  });
  it('statuses last 3 to 5 turns', async () => {
    const { STATUS } = await import('../src/data/status');
    for (const def of Object.values(STATUS)) expect(def.turns).toEqual([3, 5]);
  });
});

describe('lasting statuses', () => {
  it('a status carries into the next battle and its timer keeps counting', () => {
    const p = createCreature('mossling', 20);
    p.status = { id: 'poison', turns: 3 };
    const e = createCreature('emberkit', 5);
    e.hp = 100000;
    const b = new Battle([p], [e], new Rng(3));
    expect(b.p.status).toBe('poison');
    b.takeTurn({ kind: 'move', index: 0 });
    expect(p.status?.turns).toBe(2);
    b.takeTurn({ kind: 'move', index: 0 });
    b.takeTurn({ kind: 'move', index: 0 });
    expect(p.status).toBeUndefined();
  });
  it('switching out no longer cures; a potion does', () => {
    const a = createCreature('mossling', 20);
    const c2 = createCreature('mossling', 20);
    a.status = { id: 'burn', turns: 5 };
    const e = createCreature('emberkit', 5);
    const b = new Battle([a, c2], [e], new Rng(3));
    b.takeTurn({ kind: 'swap', index: 1 });
    expect(a.status?.id).toBe('burn');
    b.takeTurn({ kind: 'potion', index: 0, heal: 0.5 });
    expect(a.status).toBeUndefined();
  });
});

describe('statuses off the field', () => {
  it('benched and waiting creatures keep taking status damage and their timers run, but never faint from it', () => {
    const active = createCreature('mossling', 20);
    const waiting = createCreature('mossling', 20);
    const benched = createCreature('mossling', 20);
    waiting.status = { id: 'poison', turns: 2 };
    benched.status = { id: 'burn', turns: 9 };
    benched.hp = 2;
    const e = createCreature('emberkit', 5);
    e.hp = 100000;
    const b = new Battle([active, waiting], [e], new Rng(3), { reserve: [benched] });
    const before = waiting.hp;
    b.takeTurn({ kind: 'move', index: 0 });
    expect(waiting.hp).toBeLessThan(before);
    expect(waiting.status?.turns).toBe(1);
    b.takeTurn({ kind: 'move', index: 0 });
    expect(waiting.status).toBeUndefined();
    expect(benched.hp).toBe(1);
    expect(benched.status?.turns).toBe(7);
  });
});

describe('creature cries', () => {
  it('every form has its own deterministic cry, and evolutions are deeper and longer', async () => {
    const { voiceFor, voiceLength, faintVoice } = await import('../src/data/cries');
    const sigs = new Set<string>();
    for (const sp of SPECIES) {
      const v0 = voiceFor(sp.id, sp.types, 0);
      expect(voiceFor(sp.id, sp.types, 0)).toEqual(v0);
      const v2 = voiceFor(sp.id, sp.types, 2);
      expect(v2.syllables[0].f[0]).toBeLessThan(v0.syllables[0].f[0]);
      expect(voiceLength(v2)).toBeGreaterThan(voiceLength(v0));
      expect(voiceLength(faintVoice(v0))).toBeGreaterThan(voiceLength(v0));
      sigs.add(JSON.stringify(v0.syllables));
    }
    expect(sigs.size).toBe(SPECIES.length);
  });
});

describe('favorite line', () => {
  const meta = (): Meta => ({
    unlockedStarters: ['emberkit', 'frostling', 'sproutle', 'pebblin', 'zapling', 'puddlet'],
    unlockedPassives: [],
    equippedPassive: null,
    runs: 0,
    wins: 0,
    dex: emptyDex(),
    coinsSpent: 0,
    bossesDefeated: 0,
    clearedMaps: [],
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('the favorite is always one of three different starter choices', () => {
    const m = meta();
    expect(toggleFavorite(m, 'puddlet')).toBe(true);
    for (let s = 1; s <= 40; s++) {
      const picks = rollStarterChoices(m, new Rng(s));
      expect(picks).toHaveLength(3);
      expect(picks).toContain('puddlet');
      expect(new Set(picks).size).toBe(3);
    }
  });
  it('only unlocked lines can be favorites, and tapping again clears it', () => {
    const m = meta();
    expect(toggleFavorite(m, 'drakelet')).toBe(false);
    expect(m.favorite).toBeUndefined();
    toggleFavorite(m, 'emberkit');
    toggleFavorite(m, 'emberkit');
    expect(m.favorite).toBeUndefined();
  });
});

describe('limited move uses', () => {
  it('basic attacks are unlimited; strong attacks, heals and status moves are limited', () => {
    expect(maxUses(MOVES[attackId('Fire', 0)])).toBe(null);
    expect(maxUses(MOVES[attackId('Fire', 1)])).toBe(null);
    expect(maxUses(MOVES[attackId('Fire', 2)])).toBe(15);
    expect(maxUses(MOVES[attackId('Fire', 3)])).toBe(10);
    expect(maxUses(MOVES['Nature:extra'])).toBe(10); // Photosynthesis heal
    expect(maxUses(MOVES['Fire:buff'])).toBe(20);
  });
  it('battles spend uses, empty moves fall back to a basic attack, and uses can be restored', () => {
    const c = createCreature('emberkit', 40, 2);
    c.moves = [{ id: attackId('Fire', 3), tier: 1, used: 9 }];
    const foe = createCreature('mossling', 40, 2);
    foe.hp = 1e6;
    const b = new Battle([c], [foe], new Rng(3), { enemyRandomness: 0 });
    b.start();
    b.takeTurn({ kind: 'move', index: 0 });
    expect(usesLeft(c.moves[0])).toBe(0);
    expect(outOfMoves(c)).toBe(true);
    // Still able to fight with the basic attack.
    const evs = b.takeTurn({ kind: 'move', index: 0 });
    expect(evs.some((e) => e.kind === 'attack' && e.side === 'player' && e.moveId === fallbackMove(c).id)).toBe(true);
    expect(b.bestMove('player')).toBe(-1);
    restoreUses(c, 0.25);
    expect(usesLeft(c.moves[0])).toBe(3);
    restoreUses(c);
    expect(hasUses(c.moves[0])).toBe(true);
    expect(usesLeft(c.moves[0])).toBe(10);
  });
});

describe('battle arena', () => {
  const meta = (): Meta => ({
    unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0,
    dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands',
    stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('lets you bring caught species in forms you have seen, at Lv 50 with legal moves only', async () => {
    const { arenaRoster, arenaForms, arenaMovePool, makeArenaCreature, validArenaTeam, ARENA_LEVEL } = await import('../src/logic/arena');
    const m = meta();
    m.dex.caught.push('mossling');
    expect(arenaRoster(m)).toContain('mossling');
    expect(arenaRoster(m)).toContain(DEFAULT_STARTERS[0]);
    expect(arenaForms(m, 'mossling')).toEqual([0]);
    m.dex.forms.push('mossling:1');
    expect(arenaForms(m, 'mossling')).toEqual([0, 1]);
    const pool = arenaMovePool('mossling', 1);
    const c = makeArenaCreature({ speciesId: 'mossling', stage: 1, moves: [pool[0], 'not-a-move', pool[1]] });
    expect(c.level).toBe(ARENA_LEVEL);
    // Mapping picks straight through (index as 2nd argument) must still give Lv 50.
    expect([{ speciesId: 'mossling', stage: 1, moves: [] }, { speciesId: 'mossling', stage: 1, moves: [] }].map(makeArenaCreature as never).map((x: any) => x.level)).toEqual([ARENA_LEVEL, ARENA_LEVEL]);
    expect(c.stage).toBe(1);
    expect(c.stars).toBe(0);
    expect(c.moves.map((x) => x.id)).toEqual([pool[0], pool[1]]);
    // Unseen forms and uncaught species are dropped from a saved team.
    expect(validArenaTeam(m, [{ speciesId: 'mossling', stage: 2, moves: [] }, { speciesId: 'emberkit', stage: 0, moves: [] }]).map((p) => p.speciesId)).toEqual(['emberkit']);
  });
  it('ladder opponents get tougher and are fixed by the seed', async () => {
    const { arenaOpponent, ARENA_ROUNDS } = await import('../src/logic/arena');
    const first = arenaOpponent(0, 42);
    const last = arenaOpponent(ARENA_ROUNDS - 1, 42);
    expect(first.team.length).toBeLessThanOrEqual(last.team.length);
    expect(last.team.every((c) => c.stage === 2)).toBe(true);
    expect(last.randomness).toBeLessThan(first.randomness);
    expect(arenaOpponent(2, 42).team.map((c) => c.speciesId)).toEqual(arenaOpponent(2, 42).team.map((c) => c.speciesId));
  });
});

describe('duels', () => {
  it('host and guest stay in sync through a full random duel', async () => {
    const { DuelController, snapshot, flipSnap } = await import('../src/net/duel');
    const { defaultArenaMoves } = await import('../src/logic/arena');
    const pick = (id: string, st: number) => ({ speciesId: id, stage: st, moves: defaultArenaMoves(id, st) });
    const info = {
      seed: 99,
      hostName: 'Ann',
      guestName: 'Bo',
      hostTeam: [pick('emberkit', 2), pick('mossling', 1), pick('golemite', 2)],
      guestTeam: [pick('cragice', 2), pick('emberkit', 1)],
    };
    const queue: { to: 'host' | 'guest'; msg: any }[] = [];
    const host = new DuelController('host', info, { send: (m) => queue.push({ to: 'guest', msg: JSON.parse(JSON.stringify(m)) }) });
    const guest = new DuelController('guest', info, { send: (m) => queue.push({ to: 'host', msg: JSON.parse(JSON.stringify(m)) }) });
    const rng = new Rng(5);
    let hostNext: any = { phase: 'choose' };
    let guestNext: any = { phase: 'choose' };
    host.attach({ step: (_e, n) => (hostNext = n) });
    guest.attach({ step: (_e, n) => (guestNext = n) });
    const choose = (c: InstanceType<typeof DuelController>, next: any) => {
      const b = c.battle;
      if (next.phase === 'switch') {
        const opts = b.player.map((_x, i) => i).filter((i) => b.canSwapTo(i));
        return c.submitSwitch(rng.pick(opts));
      }
      if (next.phase !== 'choose') return;
      const swaps = b.player.map((_x, i) => i).filter((i) => b.canSwapTo(i));
      if (swaps.length && rng.chance(0.15)) return c.submitAction({ kind: 'swap', index: rng.pick(swaps) });
      c.submitAction({ kind: 'move', index: rng.int(0, b.p.c.moves.length - 1) });
    };
    for (let turn = 0; turn < 300 && hostNext.phase !== 'end'; turn++) {
      choose(host, hostNext);
      choose(guest, guestNext);
      while (queue.length) {
        const { to, msg } = queue.shift()!;
        (to === 'host' ? host : guest).receive(msg);
      }
      expect(snapshot(guest.battle)).toEqual(flipSnap(snapshot(host.battle)));
    }
    expect(hostNext.phase).toBe('end');
    expect(guestNext.phase).toBe('end');
    expect(hostNext.won || guestNext.won).toBe(true);
    expect(hostNext.won && guestNext.won).toBe(false);
  });
});

describe('stage races', () => {
  it('race runs start even (no passive, Heat 0) without touching the saved passive, and finale teams are healed copies', async () => {
    const { readyForDuel } = await import('../src/net/duel');
    const m: Meta = {
      unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: ['mentor'], equippedPassive: 'mentor', runs: 0, wins: 0,
      dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands',
      stats: emptyStats(), achievements: [], newAchievements: [], heat: 3, heatUnlocked: 3,
    };
    const a = startRun(m, 'emberkit', 77, 'wildlands', undefined, true);
    const b = startRun(m, 'emberkit', 77, 'wildlands', undefined, true);
    expect(a.passive).toBe(null);
    expect(a.heat).toBe(0);
    expect(m.equippedPassive).toBe('mentor');
    expect(Object.keys(a.map.nodes)).toEqual(Object.keys(b.map.nodes));
    const c = a.team[0];
    c.hp = 1;
    c.status = { id: 'burn', turns: 3 };
    c.moves[0].used = 2;
    const d = readyForDuel(c);
    expect(d.hp).toBe(stats(d).hp);
    expect(d.status).toBeUndefined();
    expect(d.moves[0].used).toBe(0);
    expect(c.hp).toBe(1);
  });
});

describe('saved teams and duel settings', () => {
  it('moves an old single Arena team into the saved list and names new teams', async () => {
    const { savedTeams, activeTeam, nextTeamName } = await import('../src/logic/arena');
    const m: Meta = {
      unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0,
      dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands',
      stats: emptyStats(), achievements: [], newAchievements: [],
      arenaTeam: [{ speciesId: DEFAULT_STARTERS[0], stage: 0, moves: [] }],
    };
    expect(savedTeams(m)).toHaveLength(1);
    expect(savedTeams(m)[0].name).toBe('Team 1');
    expect(activeTeam(m).map((p) => p.speciesId)).toEqual([DEFAULT_STARTERS[0]]);
    expect(nextTeamName(m)).toBe('Team 2');
  });
  it('keeps settings from the other phone within the allowed choices', async () => {
    const { cleanSettings, DEFAULT_SETTINGS } = await import('../src/net/duel');
    expect(cleanSettings({ bestOf: 3, teamsPerPlayer: 2, teamSize: 3, level: 75 })).toEqual({ bestOf: 3, teamsPerPlayer: 2, teamSize: 3, level: 75 });
    expect(cleanSettings({ bestOf: 99, level: 1 } as never)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('team moves', () => {
  const withMoves = (id: string, lv: number, moves: string[]) => {
    const c = createCreature(id, lv);
    c.moves = moves.map((m) => ({ id: m, tier: 1 }));
    return c;
  };
  it('team effects cover whoever is out, count down and wear off', async () => {
    const { teamMoveId, teamFxTurns } = await import('../src/data/moves');
    const a = withMoves('emberkit', 40, [teamMoveId('Fire'), attackId('Fire', 1)]);
    const a2 = withMoves('emberkit', 40, [attackId('Fire', 1)]);
    const foe = withMoves('golemite', 40, [MOVES['Earth:buff'] ? 'Earth:buff' : attackId('Earth', 0)]);
    foe.hp = 1e6;
    const b = new Battle([a, a2], [foe], new Rng(4), { enemyRandomness: 0 });
    b.takeTurn({ kind: 'move', index: 0 });
    expect(b.hasFx('player', 'rally')).toBe(true);
    b.takeTurn({ kind: 'swap', index: 1 });
    expect(b.hasFx('player', 'rally')).toBe(true); // still up after switching
    for (let i = 0; i < teamFxTurns(1); i++) b.takeTurn({ kind: 'move', index: 0 });
    expect(b.hasFx('player', 'rally')).toBe(false);
  });
  it('rally hits harder, guard takes less, ward blocks status, mend heals the whole team', async () => {
    const { teamMoveId } = await import('../src/data/moves');
    const dmg = (fxSide: 'player' | 'enemy' | null, fx: 'rally' | 'guard') => {
      let total = 0;
      for (let s = 0; s < 30; s++) {
        const a = withMoves('emberkit', 40, [attackId('Fire', 1)]);
        const d = withMoves('golemite', 40, ['Earth:buff']);
        d.hp = 1e6;
        const b = new Battle([a], [d], new Rng(s), { enemyRandomness: 0 });
        if (fxSide) b.teamFx[fxSide][fx] = 3;
        total += b.takeTurn({ kind: 'move', index: 0 }).filter((e) => e.kind === 'damage' && e.side === 'enemy').reduce((n, e) => n + (e.kind === 'damage' ? e.amount : 0), 0);
      }
      return total;
    };
    const base = dmg(null, 'rally');
    expect(dmg('player', 'rally')).toBeGreaterThan(base * 1.15);
    expect(dmg('enemy', 'guard')).toBeLessThan(base * 0.85);
    // Ward: no status gets through.
    const w = withMoves('emberkit', 40, [attackId('Fire', 0)]);
    const t = withMoves('golemite', 40, ['Earth:buff']);
    const bw = new Battle([w], [t], new Rng(1));
    bw.teamFx.enemy.ward = 5;
    expect((bw as any).inflict(bw.e, 'enemy', 'burn', [])).toBe(false);
    // Mend heals the bench-side teammates too.
    const m1 = withMoves('mossling', 40, [teamMoveId('Nature')]);
    const m2 = withMoves('mossling', 40, [attackId('Nature', 0)]);
    m1.hp = 10;
    m2.hp = 10;
    m2.status = { id: 'poison', turns: 3 };
    const foe = withMoves('golemite', 40, ['Earth:buff']);
    new Battle([m1, m2], [foe], new Rng(3), { enemyRandomness: 0 }).takeTurn({ kind: 'move', index: 0 });
    expect(m1.hp).toBeGreaterThan(10);
    expect(m2.hp).toBeGreaterThan(10);
    expect(m2.status).toBeUndefined();
  });
  it('creatures get their team move at Lv 26, in level order', async () => {
    const { teamMoveId } = await import('../src/data/moves');
    const { teamElement, TEAM_MOVE_LEVEL } = await import('../src/logic/creature');
    const c = createCreature('steamle', 1);
    addLevels(c, TEAM_MOVE_LEVEL);
    const id = teamMoveId(teamElement(SPECIES_BY_ID['steamle']));
    expect([...c.moves.map((m) => m.id), ...c.pendingMoves]).toContain(id);
    expect(c.moves[0].id).not.toBe(id);
  });
});

describe('trainer tactics', () => {
  const mk = (id: string, lv: number, moves: string[]) => {
    const c = createCreature(id, lv);
    c.moves = moves.map((m) => ({ id: m, tier: 1 }));
    return c;
  };
  it('trainers drink a potion when their creature is in trouble', () => {
    let used = 0;
    for (let s = 0; s < 20; s++) {
      const p = mk('emberkit', 40, ['Fire:buff']);
      const e = mk('golemite', 40, [attackId('Earth', 0)]);
      e.hp = Math.ceil(stats(e).hp * 0.2);
      const b = new Battle([p], [e], new Rng(s), { enemyTactics: { potions: 1, name: 'Ace Kim' } });
      const ev = b.takeTurn({ kind: 'move', index: 0 });
      if (ev.some((x) => x.kind === 'text' && x.text.includes('uses a Potion'))) used++;
      expect(b.tactics!.potions).toBeGreaterThanOrEqual(0);
    }
    expect(used).toBeGreaterThan(8);
  });
  it('trainers switch out of a bad matchup and send in the best answer after a faint', () => {
    // Player: Water attacker. Enemy lead: Fire (weak to Water); bench: Nature (resists Water).
    let switched = 0;
    for (let s = 0; s < 20; s++) {
      const p = mk('puddlet', 40, [attackId('Water', 1)]);
      const fire = mk('emberkit', 40, [attackId('Fire', 0)]);
      const grass = mk('mossling', 40, [attackId('Nature', 0)]);
      const b = new Battle([p], [fire, grass], new Rng(s), { enemyTactics: { potions: 0 } });
      b.takeTurn({ kind: 'move', index: 0 });
      if (b.eActive === 1) switched++;
    }
    expect(switched).toBeGreaterThan(8);
    // After a faint the best matchup comes in, not just the next in line.
    const p = mk('puddlet', 60, [attackId('Water', 1)]);
    const lead = mk('golemite', 5, [attackId('Earth', 0)]);
    const fire = mk('emberkit', 40, [attackId('Fire', 0)]);
    const grass = mk('mossling', 40, [attackId('Nature', 0)]);
    const b = new Battle([p], [lead, fire, grass], new Rng(1), { enemyTactics: { potions: 0 } });
    lead.hp = 1;
    b.takeTurn({ kind: 'move', index: 0 });
    expect(b.eActive).toBe(2);
  });
});

describe('duel forfeits', () => {
  it('a forfeit ends the battle for both: the forfeiter loses, the other wins', async () => {
    const { DuelController } = await import('../src/net/duel');
    const { defaultArenaMoves } = await import('../src/logic/arena');
    const pick = (id: string) => ({ speciesId: id, stage: 1, moves: defaultArenaMoves(id, 1) });
    const info = { seed: 1, hostName: 'Ann', guestName: 'Bo', hostTeam: [pick('emberkit')], guestTeam: [pick('mossling')] };
    const queue: { to: 'host' | 'guest'; msg: any }[] = [];
    const host = new DuelController('host', info, { send: (m) => queue.push({ to: 'guest', msg: m }) });
    const guest = new DuelController('guest', info, { send: (m) => queue.push({ to: 'host', msg: m }) });
    let hostEnd: any = null;
    let guestEnd: any = null;
    host.attach({ step: (_e, n) => (hostEnd = n) });
    guest.attach({ step: (_e, n) => (guestEnd = n) });
    guest.forfeit();
    while (queue.length) {
      const { to, msg } = queue.shift()!;
      (to === 'host' ? host : guest).receive(msg);
    }
    expect(guestEnd).toEqual({ phase: 'end', won: false });
    expect(hostEnd).toEqual({ phase: 'end', won: true });
  });
});

describe('catch stars and loadouts', () => {
  const mkMeta2 = (): Meta => ({
    unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0,
    dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands',
    stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('catches keep their prestige stars, and a first catch adds one more (max 5)', () => {
    const run = startRun(mkMeta2(), 'emberkit', 5);
    const wild = createCreature('mossling', 30);
    wild.stars = 2;
    expect(catchCreature(run, wild)!.c.stars).toBe(3); // first catch: +1
    expect(catchCreature(run, wild)!.c.stars).toBe(2); // repeat: keeps its own
    const big = createCreature('golemite', 30);
    big.stars = 5;
    expect(catchCreature(run, big)!.c.stars).toBe(5);
  });
  it('saves a run creature as a loadout and applies it in the team builder', async () => {
    const { saveLoadout, hasLoadout, loadoutsFor, applyLoadout, arenaMovePool } = await import('../src/logic/arena');
    const m = mkMeta2();
    m.dex.caught.push('golemite');
    m.dex.forms.push('golemite:1');
    const c = createCreature('golemite', 40, 1);
    saveLoadout(m, c, 'Win · Wildlands');
    expect(hasLoadout(m, c)).toBe(true);
    expect(loadoutsFor(m, 'golemite')).toHaveLength(1);
    const pick = applyLoadout(m, loadoutsFor(m, 'golemite')[0]);
    expect(pick.stage).toBe(1);
    expect(pick.moves.every((id) => arenaMovePool('golemite', 1).includes(id))).toBe(true);
    // An unseen form falls back to one you've seen.
    const final = createCreature('golemite', 70, 2);
    expect(applyLoadout(m, saveLoadout(m, final, 'x')).stage).toBe(1);
  });
});

describe('trainer looks', () => {
  it('cleans looks from peers, and names/elements always give the same look', async () => {
    const { cleanLook, DEFAULT_LOOK, lookForName, bossLook, LOOK_PARTS } = await import('../src/data/trainerLook');
    expect(cleanLook(null)).toEqual(DEFAULT_LOOK);
    const bad = cleanLook({ skin: 99, hair: -1, hat: 2.5, top: '3', accent: 4 });
    expect(bad.skin).toBe(DEFAULT_LOOK.skin);
    expect(bad.hair).toBe(DEFAULT_LOOK.hair);
    expect(bad.hat).toBe(DEFAULT_LOOK.hat);
    expect(bad.top).toBe(3);
    expect(bad.accent).toBe(4);
    expect(lookForName('Ace Trainer Rhea')).toEqual(lookForName('Ace Trainer Rhea'));
    for (const l of [lookForName('x'), bossLook('Fire'), bossLook('Shadow')]) {
      for (const p of LOOK_PARTS) expect(l[p.key]).toBeLessThan(p.names.length);
    }
    expect(bossLook('Fire')).not.toEqual(bossLook('Water'));
  });
});

describe('shiny Hexlings and run history', () => {
  const meta = (): Meta => ({
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

  it('about 1 wild Hexling in 200 is shiny, only in wild battles, and a catch keeps it', () => {
    let wild = 0;
    let shiny = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const run = startRun(meta(), DEFAULT_STARTERS[0], seed);
      const node = run.map.nodes[run.map.nodes[run.currentId].next[0]];
      for (let k = 0; k < 10; k++) {
        for (const e of makeEncounter(run, { ...node, kind: 'battle' })) {
          wild++;
          if (e.shiny) shiny++;
        }
        for (const e of makeEncounter(run, { ...node, kind: 'elite' })) expect(e.shiny).toBeFalsy();
      }
    }
    expect(shiny / wild).toBeGreaterThan(1 / 400);
    expect(shiny / wild).toBeLessThan(1 / 100);
    const run = startRun(meta(), DEFAULT_STARTERS[0], 5);
    const e = makeEncounter(run, run.map.nodes[run.map.nodes[run.currentId].next[0]])[0];
    e.shiny = true;
    const got = catchCreature(run, e);
    expect(got?.c.shiny).toBe(true);
    expect(run.meta.shinyCaught).toBe(1);
  });

  it('keeps the last 20 runs, newest first, with win streaks and most-used Hexlings', () => {
    const m = meta();
    for (let i = 0; i < 25; i++) {
      const run = startRun(m, DEFAULT_STARTERS[0], i + 1);
      recordRun(run, i % 5 !== 0);
    }
    expect(m.history).toHaveLength(HISTORY_MAX);
    expect(m.history![0].at).toBeGreaterThanOrEqual(m.history![19].at);
    // Runs 21-24 won after run 20 lost: a streak of 4; the best was also 4.
    expect(m.streak).toBe(4);
    expect(m.bestStreak).toBe(4);
    expect(mostUsed(m)).toEqual({ speciesId: DEFAULT_STARTERS[0], runs: 25 });
  });
});

describe('daily passives', () => {
  it('each daily starter brings a passive that suits its elements, distinct across the three', () => {
    for (let d = 1; d <= 28; d++) {
      const date = `2026-02-${String(d).padStart(2, '0')}`;
      const pv = dailyPassives(date);
      const ids = dailyStarters(date);
      for (const id of ids) {
        const [t1, t2] = SPECIES_BY_ID[id].types;
        expect([...ELEMENT_PASSIVES[t1], ...ELEMENT_PASSIVES[t2]]).toContain(pv[id]);
      }
      expect(new Set(ids.map((id) => pv[id])).size).toBe(3);
      expect(dailyPassives(date)).toEqual(pv);
      const m = { unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: [], equippedPassive: 'drill', runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] } as Meta;
      expect(startRun(m, ids[0], dailySeed(date), 'wildlands', date).passive).toBe(pv[ids[0]]);
    }
  });
});

describe('shiny hunting', () => {
  const meta = (): Meta => ({
    unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(),
    coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });

  it('goes on forever: clearing a hunt floor never wins, final forms out-level and out-star you, shinies are common', () => {
    const run = startRun(meta(), DEFAULT_STARTERS[0], 11);
    run.floor = 2;
    startHunt(run);
    expect(run.hunt).toEqual({ depth: 1, shinies: 0 });
    const node = (kind: string, id?: string) => ({ ...run.map.nodes[run.map.nodes[run.currentId].next[0]], kind, progress: 0.5, ...(id ? { id } : {}) }) as never;
    const first = makeEncounter(run, node('battle'));
    expect(first.every((e) => e.stage === 2)).toBe(true);
    expect(first[0].level).toBeGreaterThan(90);
    const wins = run.meta.wins;
    for (let d = 0; d < 8; d++) expect(clearFloor(run)).toBe(false);
    expect(run.meta.wins).toBe(wins);
    expect(run.hunt!.depth).toBe(9);
    let shiny = 0;
    let total = 0;
    let trainerShiny = 0;
    let maxLevel = 0;
    let maxStars = 0;
    for (let k = 0; k < 300; k++) {
      for (const e of makeEncounter(run, node('battle', `hex${k}`))) {
        total++;
        if (e.shiny) shiny++;
        maxLevel = Math.max(maxLevel, e.level);
        maxStars = Math.max(maxStars, e.stars);
      }
      for (const e of makeEncounter(run, node('elite', `hex${k}`))) if (e.shiny) trainerShiny++;
    }
    expect(maxLevel).toBeGreaterThan(125);
    expect(maxStars).toBe(HUNT_MAX_STARS);
    expect(shiny / total).toBeGreaterThan(1 / 25);
    expect(trainerShiny).toBeGreaterThan(0);
  });
});

describe('shinies in the Arena and online duels', () => {
  it('a species caught shiny can be brought shiny; others cannot', () => {
    const meta = {
      unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(),
      coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
    } as Meta;
    const id = DEFAULT_STARTERS[0];
    const pick = { speciesId: id, stage: 0, moves: [], shiny: true };
    expect(validTeam(meta, [pick])[0].shiny).toBeUndefined();
    const run = startRun(meta, id, 3);
    const e = makeEncounter(run, run.map.nodes[run.map.nodes[run.currentId].next[0]])[0];
    e.shiny = true;
    catchCreature(run, e);
    expect(ownsShiny(meta, e.speciesId)).toBe(true);
    meta.dex.caught.push(e.speciesId);
    const team = validTeam(meta, [{ speciesId: e.speciesId, stage: 0, moves: [], shiny: true }]);
    expect(team[0].shiny).toBe(true);
    expect(mkArena(team[0]).shiny).toBe(true);
  });

  it('a shiny caught in any form unlocks the whole line: it starts runs shiny (unless switched off)', () => {
    const meta = {
      unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(),
      coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
    } as Meta;
    const id = DEFAULT_STARTERS[1];
    expect(startRun(meta, id, 1).team[0].shiny).toBeFalsy();
    // Caught as a final form: the base form (the starter) is shiny too.
    const run = startRun(meta, DEFAULT_STARTERS[0], 2);
    const e = createCreature(id, 70, 2);
    e.shiny = true;
    catchCreature(run, e);
    expect(starterShiny(meta, id)).toBe(true);
    expect(startRun(meta, id, 3).team[0].shiny).toBe(true);
    toggleStarterShiny(meta, id);
    expect(startRun(meta, id, 4).team[0].shiny).toBeFalsy();
    toggleStarterShiny(meta, id);
    expect(startRun(meta, id, 5).team[0].shiny).toBe(true);
  });
});

// ---------------------------------------------------------------- 1.0: weekly, gilded, save codes
import { stormFrontWeather } from '../src/logic/surprises';
import { postBattleRecover, startWeekly, TWIST_ORDER, TWISTS_V2_FROM, weekId, weeklyInfo, weeklyPlayed, recordWeekly } from '../src/logic/run';
import { GILDED_MILESTONES, gildedCount, lockedBy, takeNewMilestones } from '../src/logic/gilded';
import { cleanTitle, earnedTitles, myTitle, takeNewTitles, TIERS, TITLES, TITLE_BY_NAME } from '../src/logic/titles';
import { LOOK_PARTS, randomLook, lookForName, bossLook, FREE_COLORS } from '../src/data/trainerLook';
import { decodeSave, encodeSave, summarize } from '../src/logic/saveCode';
import { changesSince, CHANGELOG, APP_VERSION, versionNewer } from '../src/data/changelog';

const blankMeta = (): Meta => ({
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

describe('weekly challenge', () => {
  it('names each week by its Monday', () => {
    expect(weekId(new Date('2026-11-17T12:00:00Z'))).toBe('2026-11-16'); // a Tuesday
    expect(weekId(new Date('2026-11-16T00:00:00Z'))).toBe('2026-11-16');
    expect(weekId(new Date('2026-11-22T23:59:00Z'))).toBe('2026-11-16'); // Sunday
    expect(weekId(new Date('2026-11-23T00:00:00Z'))).toBe('2026-11-23');
  });
  it('is the same for everyone and rotates through every twist', () => {
    expect(weeklyInfo('2026-11-16')).toEqual(weeklyInfo('2026-11-16'));
    const twists = new Set<string>();
    let d = Date.parse(`${TWISTS_V2_FROM}T00:00:00Z`);
    for (let i = 0; i < TWIST_ORDER.length; i++, d += 7 * 86400000) twists.add(weeklyInfo(new Date(d).toISOString().slice(0, 10)).twist);
    expect(twists.size).toBe(TWIST_ORDER.length);
    const w = weeklyInfo('2026-11-16');
    expect(new Set(w.starters).size).toBe(3);
    for (const id of w.starters) expect(w.passives[id]).toBeTruthy();
  });
  const weekWith = (twist: string) => {
    let d = Date.parse('2026-11-16T00:00:00Z');
    for (;;) {
      const id = new Date(d).toISOString().slice(0, 10);
      if (weeklyInfo(id).twist === twist) return id;
      d += 7 * 86400000;
    }
  };
  it('Element Duo keeps every floor, starter and wild Hexling to two elements', () => {
    const week = weekWith('duo');
    const info = weeklyInfo(week);
    expect(info.duo).toHaveLength(2);
    for (const id of info.starters) expect(SPECIES_BY_ID[id].types.some((t) => info.duo!.includes(t))).toBe(true);
    const run = startWeekly(blankMeta(), week, info.starters[0]);
    expect(run.twist).toBe('duo');
    for (const b of run.biomes) expect(info.duo).toContain(b);
    for (let i = 0; i < 40; i++) {
      const node = Object.values(run.map.nodes).find((n) => n.kind === 'battle')!;
      for (const c of makeEncounter(run, node)) expect(SPECIES_BY_ID[c.speciesId].types.some((t) => info.duo!.includes(t))).toBe(true);
    }
  });
  it('past weeks keep the twist they had before the longer rotation', () => {
    // 2026-11-16 to 2026-11-23 were Gilded Week and Element Duo under the five-twist rotation.
    const v1 = ['duo', 'swarm', 'glass', 'lean', 'gilded'];
    const idx = (w: string) => Math.floor(Date.parse(`${w}T00:00:00Z`) / (7 * 86400000)) % 5;
    for (const w of ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']) expect(weeklyInfo(w).twist).toBe(v1[idx(w)]);
    expect(weeklyInfo(TWISTS_V2_FROM).twist).toBe(TWIST_ORDER[0]);
  });
  it('Omen Week puts the whole run under the week\'s omen, and the omens take turns', () => {
    const omens = new Set<string>();
    let d = Date.parse(`${TWISTS_V2_FROM}T00:00:00Z`);
    for (let n = 0; n < 4 * TWIST_ORDER.length; n++, d += 7 * 86400000) {
      const w = new Date(d).toISOString().slice(0, 10);
      const info = weeklyInfo(w);
      if (info.twist !== 'omen') continue;
      omens.add(info.omen!);
      const run = startWeekly(blankMeta(), w, info.starters[0]);
      expect(run.surprises?.omen).toBe(info.omen);
    }
    expect(omens.size).toBe(4);
  });
  it('Elder Week makes every guardian an Elder; Boon Rush starts with a rare offer and a Boon hex', () => {
    const e = weekWith('elders');
    const er = startWeekly(blankMeta(), e, weeklyInfo(e).starters[0]);
    expect(er.surprises?.floors['0']?.elder).toBe(true);
    const b = weekWith('boonrush');
    const br = startWeekly(blankMeta(), b, weeklyInfo(b).starters[0]);
    expect(br.boons?.offer?.mode).toBe('rare');
    expect(Object.values(br.map.nodes).some((n) => n.kind === 'boon')).toBe(true);
  });
  it('Wild Skies opens every battle in weather', () => {
    const w = weekWith('skies');
    const run = startWeekly(blankMeta(), w, weeklyInfo(w).starters[0]);
    expect(stormFrontWeather(run)).toBeTruthy();
    expect(stormFrontWeather(startRun(blankMeta(), 'emberkit', 5))).toBeNull();
  });
  it('a daily run starts with the same boon offer for everyone', () => {
    const a = startRun(blankMeta(), 'emberkit', 42, 'wildlands', '2026-11-25');
    const b = startRun(blankMeta(), 'emberkit', 42, 'wildlands', '2026-11-25');
    expect(a.boons?.offer?.ids.length).toBeGreaterThan(0);
    expect(a.boons?.offer?.ids).toEqual(b.boons?.offer?.ids);
    expect(startRun(blankMeta(), 'emberkit', 42).boons?.offer ?? null).toBeNull();
  });
  it('Swarm sends two wild Hexlings from the first battle', () => {
    const week = weekWith('swarm');
    const run = startWeekly(blankMeta(), week, weeklyInfo(week).starters[0]);
    const node = Object.values(run.map.nodes).find((n) => n.kind === 'battle')!;
    for (let i = 0; i < 10; i++) expect(makeEncounter(run, node)).toHaveLength(2);
  });
  it('Lean Times halves healing and pays more coins', () => {
    const week = weekWith('lean');
    const meta = blankMeta();
    const lean = startWeekly(meta, week, weeklyInfo(week).starters[0]);
    const normal = startRun(blankMeta(), weeklyInfo(week).starters[0], 1, 'wildlands', undefined, true);
    for (const r of [lean, normal]) r.team[0].hp = 1;
    postBattleRecover(lean);
    postBattleRecover(normal);
    expect(lean.team[0].hp - 1).toBeLessThan(normal.team[0].hp - 1);
    const foes = [createCreature('emberkit', 10)];
    expect(battleCoins(foes, 'battle', 0, 'lean')).toBeGreaterThan(battleCoins(foes, 'battle', 0));
  });
  it('Glass Cannon makes the enemy side hit harder too', () => {
    const dmg = (mult: number) => {
      const me = createCreature('pebblin', 20);
      const foe = createCreature('emberkit', 20);
      const b = new Battle([me], [foe], new Rng(7), { enemyRandomness: 0, enemyDamageMult: mult });
      b.start();
      const hp = me.hp;
      b.takeTurn({ kind: 'move', index: 0 });
      return hp - me.hp;
    };
    expect(dmg(1.5)).toBeGreaterThan(dmg(1));
  });
  it('counts attempts and keeps the best result', () => {
    const week = weekWith('glass');
    const meta = blankMeta();
    const run = startWeekly(meta, week, weeklyInfo(week).starters[0]);
    expect(weeklyPlayed(meta, week)?.attempts).toBe(1);
    run.floor = 1;
    expect(recordWeekly(run, false)).toBe(true);
    expect(recordWeekly(run, false)).toBe(false);
    expect(meta.lastMap).toBe('wildlands'); // a weekly doesn't change your chosen map
  });
});

describe('gilded milestones', () => {
  it('locks gilded outfit pieces until enough Gilded species are owned', () => {
    const meta = blankMeta();
    const laurel = GILDED_MILESTONES[0].unlocks[0];
    expect(lockedBy(meta, 'hat', laurel.value)?.count).toBe(5);
    expect(lockedBy(meta, 'hat', 1)).toBeNull();
    meta.shinyOwned = SPECIES.slice(0, 5).map((s) => s.id);
    expect(lockedBy(meta, 'hat', laurel.value)).toBeNull();
    expect(lockedBy(meta, 'aura', 1)?.count).toBe(120);
    expect(lockedBy(meta, 'topColor', FREE_COLORS)?.count).toBe(60);
  });
  it('announces each milestone once and wears the first title', () => {
    const meta = blankMeta();
    meta.shinyOwned = SPECIES.slice(0, 16).map((s) => s.id);
    expect(gildedCount(meta)).toBe(16);
    expect(takeNewMilestones(meta).map((m) => m.count)).toEqual([5, 15]);
    expect(takeNewMilestones(meta)).toEqual([]);
    expect(takeNewTitles(meta)).toEqual([]); // the milestone announces its title
    expect(myTitle(meta)).toBe('Gilded Seeker');
    expect(earnedTitles(meta)).toEqual(['Gilded Seeker']);
    meta.trainerTitle = 'Gilded Master'; // not earned: not shown
    expect(myTitle(meta)).toBeNull();
  });
  it('never dresses NPC trainers or guardians in gilded gear', () => {
    for (let i = 0; i < 400; i++) {
      const looks = [randomLook(new Rng(i)), lookForName(`npc${i}`)];
      for (const look of looks)
        for (const p of LOOK_PARTS) expect(look[p.key]).toBeLessThan(p.free ?? p.names.length);
    }
    for (const el of ELEMENTS) for (const p of LOOK_PARTS) expect(bossLook(el)[p.key]).toBeLessThan(p.free ?? p.names.length);
  });
});

describe('save codes', () => {
  const bundle = { at: 1763380000000, meta: JSON.stringify({ ...blankMeta(), runs: 12, wins: 3, shinyOwned: ['emberkit'] }), run: JSON.stringify({ floor: 1 }) };
  it('round-trips a save', async () => {
    const code = await encodeSave(bundle);
    expect(code.startsWith('HEXB')).toBe(true);
    // Line breaks and spaces picked up while pasting don't matter.
    const back = await decodeSave(`  ${code.slice(0, 20)}\n${code.slice(20)} `);
    expect(back).toEqual(bundle);
    expect(summarize(back)).toMatchObject({ runs: 12, wins: 3, gilded: 1, runInProgress: true });
  });
  it('rejects cut-off, edited and foreign codes', async () => {
    const code = await encodeSave(bundle);
    await expect(decodeSave(code.slice(0, -10))).rejects.toThrow();
    const i = 12;
    const edited = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
    await expect(decodeSave(edited)).rejects.toThrow();
    await expect(decodeSave('hello there')).rejects.toThrow(/HEXB/);
    await expect(decodeSave('')).rejects.toThrow();
  });
});

describe('changelog', () => {
  it('lists the current version first and compares versions', () => {
    expect(CHANGELOG[0].version).toBe(APP_VERSION);
    expect(versionNewer('1.0', '0.9')).toBe(true);
    expect(versionNewer('0.9', '1.0')).toBe(false);
    expect(versionNewer('1.0', '1.0')).toBe(false);
    expect(changesSince('0.9').map((e) => e.version)).toEqual(['2.07', '2.06', '2.05', '2.04', '2.03', '2.02', '2.01', '2.0', '1.52', '1.51', '1.50', '1.49', '1.48', '1.47', '1.46', '1.45', '1.44', '1.43', '1.42', '1.41', '1.40', '1.39', '1.38', '1.37', '1.36', '1.35', '1.34', '1.33', '1.32', '1.31', '1.30', '1.29', '1.28', '1.27', '1.26', '1.25', '1.24', '1.23', '1.22', '1.21', '1.20', '1.19', '1.18', '1.17', '1.16', '1.15', '1.14', '1.13', '1.12', '1.11', '1.10', '1.9', '1.8', '1.7', '1.6', '1.5', '1.4', '1.3', '1.2', '1.1', '1.0']);
    expect(changesSince(APP_VERSION)).toEqual([]);
  });
});

describe('resuming a battle after a reload', () => {
  it('keeps stat stages, who is out, the foe’s potions and used-up Second Wind', () => {
    const mk = () => [createCreature('emberkit', 30), createCreature('pebblin', 30)];
    const me = mk();
    const foes = [createCreature('sproutle', 30), createCreature('zapling', 30)];
    const b = new Battle(me, foes, new Rng(3), { enemyTactics: { potions: 2 }, rules: [{ rule: 'overclock', name: 'Overclock' }] });
    b.start();
    b.takeTurn({ kind: 'swap', index: 1 });
    b.p.atkStage = 2;
    b.e.defStage = -1;
    b.tactics!.potions = 1;
    const saved = JSON.parse(JSON.stringify(b.saveState()));
    // A reload builds a fresh battle from the same creatures.
    const b2 = new Battle(me, foes, new Rng(3), { enemyTactics: { potions: 2 }, rules: [{ rule: 'overclock', name: 'Overclock' }] });
    b2.start(true);
    b2.restoreState(saved);
    expect(b2.pActive).toBe(1);
    expect(b2.p.atkStage).toBe(2);
    expect(b2.e.defStage).toBe(-1);
    expect(b2.e.atkStage).toBe(b.e.atkStage);
    expect(b2.tactics!.potions).toBe(1);
  });
  it('Overclock stops at +3 Attack', () => {
    const b = new Battle([createCreature('golemite', 60)], [createCreature('golemite', 60)], new Rng(1), { enemyRandomness: 0, rules: [{ rule: 'overclock', name: 'Overclock' }] });
    b.start();
    for (let i = 0; i < 8 && b.outcome() !== 'win' && b.outcome() !== 'lose'; i++) b.takeTurn({ kind: 'move', index: 0 });
    expect(b.e.atkStage).toBeLessThanOrEqual(3);
  });
});

describe('trainer titles', () => {
  it('has every Gilded milestone title, at that count', () => {
    for (const m of GILDED_MILESTONES.filter((x) => x.title)) {
      const t = TITLE_BY_NAME[m.title!];
      expect(t?.gilded).toBe(true);
      expect(t.progress(blankMeta())[1]).toBe(m.count);
    }
    expect(new Set(TITLES.map((t) => t.name)).size).toBe(TITLES.length);
    for (const tier of TIERS) expect(TITLES.some((t) => t.tier === tier)).toBe(true);
  });
  it('earns titles from records, rarest first, and announces each once', () => {
    const meta = blankMeta();
    expect(earnedTitles(meta)).toEqual([]);
    meta.runs = 1;
    meta.wins = 1;
    meta.onlineWins = 1;
    meta.mapHeats = { wildlands: [1, 4] };
    expect(earnedTitles(meta)).toEqual(['Heatseeker', 'Champion', 'Duelist', 'Rookie']);
    expect(takeNewTitles(meta).map((t) => t.name)).toEqual(['Rookie', 'Champion', 'Duelist', 'Heatseeker']);
    expect(myTitle(meta)).toBe('Heatseeker'); // the rarest new one is worn
    expect(takeNewTitles(meta)).toEqual([]);
    meta.trainerTitle = 'Rookie';
    meta.runs = 10;
    expect(takeNewTitles(meta).map((t) => t.name)).toEqual(['Pathfinder']);
    expect(myTitle(meta)).toBe('Rookie'); // a chosen title stays
  });
  it('only shows real titles from the other player', () => {
    expect(cleanTitle('Hexbound')).toBe('Hexbound');
    expect(cleanTitle('Supreme Hacker')).toBeUndefined();
    expect(cleanTitle(42)).toBeUndefined();
  });
});

import { lockOf, rewardText, TITLE_REWARDS, titleNews } from '../src/logic/cosmetics';
import { cleanLook } from '../src/data/trainerLook';

describe('title cosmetics', () => {
  it('every reward belongs to a real title and is a locked option', () => {
    const meta = blankMeta();
    for (const [name, items] of Object.entries(TITLE_REWARDS)) {
      expect(TITLE_BY_NAME[name]).toBeTruthy();
      for (const c of items) {
        const part = LOOK_PARTS.find((p) => p.key === c.key)!;
        expect(c.value).toBeGreaterThanOrEqual(part.free ?? part.names.length);
        expect(lockOf(meta, c.key, c.value)?.title?.name).toBe(name);
      }
    }
    // Every option past the free ones unlocks somehow.
    for (const p of LOOK_PARTS) for (let v = p.free ?? p.names.length; v < p.names.length; v++) expect(lockOf(meta, p.key, v)).not.toBeNull();
  });
  it('unlocks with its title, and says so', () => {
    const meta = blankMeta();
    meta.mapHeats = { wildlands: [4] };
    const crown = TITLE_REWARDS.Heatseeker[0];
    expect(lockOf(meta, crown.key, crown.value)).toBeNull();
    expect(rewardText('Heatseeker')).toBe('Unlocks Flame crown, Inferno aura');
    expect(titleNews(takeNewTitles(meta))).toContain('Unlocked: Flame crown, Inferno aura');
  });
  it('keeps a back item from a peer, and drops bad ones', () => {
    expect(cleanLook({ back: 3 }).back).toBe(3);
    expect(cleanLook({ back: 99 }).back).toBe(0);
    expect(cleanLook({}).back).toBe(0);
  });
});

import { itemId, markSeen, newItems, newTitles, unlockedExtras } from '../src/logic/cosmetics';

describe('NEW tags', () => {
  it('flags unlocked gear and titles until seen', () => {
    const meta = blankMeta();
    meta.mapHeats = { wildlands: [4] }; // Heatseeker: Flame crown + Inferno aura
    expect(newTitles(meta)).toEqual(['Heatseeker']);
    expect(newItems(meta).map((i) => itemId(i.key, i.value)).sort()).toEqual(unlockedExtras(meta).map((i) => itemId(i.key, i.value)).sort());
    expect(newItems(meta)).toHaveLength(2);
    const hat = newItems(meta).find((i) => i.key === 'hat')!;
    expect(markSeen(meta, 'seenItems', [itemId('hat', hat.value)])).toBe(true);
    expect(markSeen(meta, 'seenItems', [itemId('hat', hat.value)])).toBe(false);
    expect(newItems(meta).map((i) => i.key)).toEqual(['aura']);
    markSeen(meta, 'seenTitles', ['Heatseeker']);
    expect(newTitles(meta)).toEqual([]);
  });
});

describe('auto-battle', () => {
  const mono = (el: string) => SPECIES.find((s) => s.types[0] === el && (s.types[1] === el || !s.types[1]))!.id;
  it('switches out of a bad matchup to a teammate that does far better', () => {
    const fire = createCreature(mono('Fire'), 20);
    const grass = createCreature(mono('Nature'), 20);
    const water = createCreature(mono('Water'), 20);
    const b = new Battle([fire, grass], [water], new Rng(1));
    expect(b.autoPlan(0)).toEqual({ kind: 'swap', index: 1 });
    // Not straight back again.
    expect(b.autoPlan(0)).toBeNull();
  });
  it('drinks a potion when low, but not when the foe is nearly down or there are none', () => {
    const a = createCreature(mono('Fire'), 20);
    const e = createCreature(mono('Fire'), 20);
    const b = new Battle([a], [e], new Rng(1));
    a.hp = Math.floor(stats(a).hp * 0.2);
    expect(b.autoPlan(2)).toEqual({ kind: 'potion' });
    expect(b.autoPlan(0)).toBeNull();
    e.hp = Math.floor(stats(e).hp * 0.2);
    expect(b.autoPlan(2)).toBeNull();
  });
  it('sends in the best answer after a faint', () => {
    const fire = createCreature(mono('Fire'), 20);
    const grass = createCreature(mono('Nature'), 20);
    const storm = createCreature(mono('Storm'), 20);
    const water = createCreature(mono('Water'), 20);
    const b = new Battle([fire, grass, storm], [water], new Rng(1));
    fire.hp = 0;
    expect([1, 2]).toContain(b.bestPlayerAnswer());
    expect(b.bestPlayerAnswer()).not.toBe(0);
  });
});

import { altarOptions, altarUsable } from '../src/logic/run';

describe('Prestige Altar options', () => {
  const mono = (el: string) => SPECIES.find((s) => s.types[0] === el && (s.types[1] === el || !s.types[1]))!.id;
  it('pairs each Hexling with bench Hexlings that share an element', () => {
    const run = startRun(blankMeta(), mono('Fire'), 1);
    run.team = [createCreature(mono('Fire'), 10)];
    run.bench = [];
    expect(altarUsable(run)).toBe(false);
    run.bench = [createCreature(mono('Water'), 5)];
    expect(altarUsable(run)).toBe(false); // nothing shares an element
    const spare = createCreature(mono('Fire'), 5);
    run.bench.push(spare);
    const o = altarOptions(run);
    expect(o.pairs.map((p) => p.target)).toContain(run.team[0]);
    expect(o.pairs.find((p) => p.target === run.team[0])!.fodder).toEqual([spare]);
    expect(altarUsable(run)).toBe(true);
  });
  it('Ascendant’s free prestige counts once per floor', () => {
    const run = startRun(blankMeta(), mono('Fire'), 1);
    run.bench = [];
    run.passive = 'ascendant';
    expect(altarUsable(run)).toBe(true);
    run.ascendFloor = run.floor;
    expect(altarUsable(run)).toBe(false);
  });
});

describe('multi-hit moves and conditions', () => {
  it('roll their condition on every hit', () => {
    const id = Object.keys(MOVES).find((k) => MOVES[k].name === 'Static Burst')!;
    expect(MOVES[id].hits).toBe(3);
    const bulky = SPECIES.find((s) => !s.types.includes('Storm'))!.id;
    let para = 0;
    let n = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const user = createCreature(SPECIES[0].id, 5);
      user.moves = [{ id, tier: 1 }];
      const target = createCreature(bulky, 60);
      target.moves = target.moves.filter((m) => MOVES[m.id].kind !== 'attack').slice(0, 1);
      if (!target.moves.length) target.moves = [{ id, tier: 1 }];
      const b = new Battle([user], [target], new Rng(seed));
      b.takeTurn({ kind: 'move', index: 0 });
      if (target.hp <= 0) continue;
      n++;
      if (b.e.status === 'para') para++;
    }
    // One 15% roll would land ~15%; three rolls land 1 - 0.85^3 ≈ 39% (less a few misses).
    expect(para / n).toBeGreaterThan(0.35);
    expect(para / n).toBeLessThan(0.6);
  });
});

import { stageMult } from '../src/logic/battle';
import { MAX_STAGE as STAT_STAGE_CAP } from '../src/data/moves';

describe('stat stages', () => {
  it('cap at ±4 steps: ×2 at most, ×0.5 at least', () => {
    expect(STAT_STAGE_CAP).toBe(4);
    expect(stageMult(STAT_STAGE_CAP)).toBe(2);
    expect(stageMult(-STAT_STAGE_CAP)).toBe(0.5);
  });
});

import { landMoveFor, LAND_MOVE_CHANCE, setLand } from '../src/logic/creature';
import { legalArenaMoves, loadoutOnlyMoves, saveLoadout, applyLoadout, arenaMovePool } from '../src/logic/arena';

describe('land moves', () => {
  it('your Hexlings now and then learn a land move in place of their usual one', () => {
    setLand('Water', 123);
    let landed = 0;
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      const c = createCreature('emberkit', 1); // Fire: Water is a foreign land
      const set = learnset(SPECIES_BY_ID['emberkit']);
      for (let k = 0; k < set.length; k++) {
        const id = landMoveFor(c, set[k], k);
        if (k < 2 || MOVES[set[k].id].signature) expect(id).toBe(null);
        else {
          checked++;
          if (id) {
            landed++;
            expect(MOVES[id].element).toBe('Water');
          }
        }
      }
    }
    const rate = landed / checked;
    expect(rate).toBeGreaterThan(LAND_MOVE_CHANCE * 0.6);
    expect(rate).toBeLessThan(LAND_MOVE_CHANCE * 1.5);
    // Never on a land of its own element, and never for enemies (auto learning).
    setLand('Fire', 123);
    const c = createCreature('emberkit', 1);
    learnset(SPECIES_BY_ID['emberkit']).forEach((e, k) => expect(landMoveFor(c, e, k)).toBe(null));
    setLand(null);
  });
  it('a land move takes the standard move’s place, and the standard one is never offered', () => {
    setLand('Water', 7);
    setFloorCeiling(Infinity);
    // Find a creature whose Lv 6 move comes from the land.
    let c = createCreature('emberkit', 1);
    for (let i = 0; i < 300 && !landMoveFor(c, learnset(SPECIES_BY_ID['emberkit'])[2], 2); i++) c = createCreature('emberkit', 1);
    const entry = learnset(SPECIES_BY_ID['emberkit'])[2];
    const land = landMoveFor(c, entry, 2)!;
    expect(land).toBeTruthy();
    addLevels(c, 10);
    const ids = c.moves.map((m) => m.id).concat(c.pendingMoves);
    expect(ids).toContain(land);
    expect(ids).not.toContain(entry.id);
    expect(c.landMoves).toContain(land);
    setLand(null);
  });
  it('the team builder allows land moves only through saved loadouts', () => {
    const meta: Meta = { unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: ['mentor'], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] };
    meta.dex.caught.push('emberkit');
    const land = 'Water:buff';
    expect(arenaMovePool('emberkit', 0)).not.toContain(land);
    expect(legalArenaMoves(meta, 'emberkit', 0)).not.toContain(land);
    const pick = { speciesId: 'emberkit', stage: 0, moves: [land, attackId('Fire', 0)] };
    expect(validTeam(meta, [pick])[0].moves).toEqual([attackId('Fire', 0)]);
    // Saved from a run where it picked up the move:
    const c = createCreature('emberkit', 20);
    c.moves[0] = { id: land, tier: 1 };
    const l = saveLoadout(meta, c, 'Win');
    expect(loadoutOnlyMoves(meta, 'emberkit', 0)).toEqual([land]);
    expect(applyLoadout(meta, l).moves).toContain(land);
    expect(validTeam(meta, [pick])[0].moves).toEqual([land, attackId('Fire', 0)]);
    expect(mkArena(validTeam(meta, [pick])[0]).moves.map((m) => m.id)).toContain(land);
    // Delete the loadout and the move goes with it.
    meta.loadouts = [];
    expect(validTeam(meta, [pick])[0].moves).toEqual([attackId('Fire', 0)]);
  });
});

import { effectsAtTier, describeEffects } from '../src/data/moves';
describe('stat moves never promise past the cap', () => {
  it('a tier past +4 drops the drawback instead', () => {
    const skin = Object.values(MOVES).find((m) => m.name === 'Stone Skin')!;
    expect(describeEffects(skin, 1)).toBe('Self +3 DEF, -1 SPD');
    expect(describeEffects(skin, 2)).toBe('Self +4 DEF, -1 SPD');
    expect(describeEffects(skin, 3)).toBe('Self +4 DEF');
    const roar = Object.values(MOVES).find((m) => m.name === 'Roar of Kings')!;
    expect(describeEffects(roar, 3)).toBe('Self +4 ATK');
    for (const m of Object.values(MOVES)) for (const t of [1, 2, 3]) for (const e of effectsAtTier(m, t)) expect(Math.abs(e.stages)).toBeLessThanOrEqual(4);
  });
});

describe('heal moves with a boost', () => {
  it('Fortress-style signatures raise the user’s DEF, not the foe’s', () => {
    const fort = Object.values(MOVES).find((m) => m.kind === 'heal' && m.effects.length)!;
    const p = createCreature('emberkit', 20);
    p.moves = [{ id: fort.id, tier: 1 }];
    p.hp = 10;
    const e = createCreature('pebblin', 1);
    e.moves = [{ id: 'Earth:buff', tier: 1 }];
    const b = new Battle([p], [e], new Rng(5));
    b.takeTurn({ kind: 'move', index: 0 });
    expect(b.p.defStage).toBe(2);
    expect(b.e.defStage).toBeLessThanOrEqual(0 + (MOVES['Earth:buff'].effects.find((x) => x.stat === 'def')?.stages ?? 0));
    expect(b.p.c.hp).toBeGreaterThan(10);
  });
});

describe('foe moves on the stats panel', () => {
  it('attack events say which team slot used the move', () => {
    const p = createCreature('emberkit', 20);
    const e1 = createCreature('pebblin', 20);
    const e2 = createCreature('pebblin', 20);
    const b = new Battle([p], [e1, e2], new Rng(4));
    const ev = b.takeTurn({ kind: 'move', index: 0 });
    const foe = ev.find((x) => x.kind === 'attack' && x.side === 'enemy') as { slot?: number } | undefined;
    if (foe) expect(foe.slot).toBe(0);
    const mine = ev.find((x) => x.kind === 'attack' && x.side === 'player') as { slot?: number };
    expect(mine.slot).toBe(0);
  });
});

import { champion, knockedOut, makeBracket, readyMatches, roundName, setWinner } from '../src/logic/bracket';
describe('battle royale bracket', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
  it('fits 2 to 8 players, with byes only in round 1 and never two byes in a match', () => {
    for (let n = 2; n <= 8; n++) {
      const b = makeBracket(ids(n), new Rng(n));
      const size = b.rounds[0].length * 2;
      expect(size).toBeGreaterThanOrEqual(n);
      expect(size / 2).toBeLessThan(n);
      const placed = b.rounds[0].flatMap((m) => [m.a, m.b]).filter(Boolean);
      expect(new Set(placed).size).toBe(n);
      expect(b.rounds[0].filter((m) => m.bye).length).toBe(size - n);
      expect(b.rounds[0].every((m) => m.a || m.b)).toBe(true);
      expect(b.rounds[b.rounds.length - 1].length).toBe(1);
    }
  });
  it('plays through to one champion', () => {
    for (let n = 2; n <= 8; n++) {
      const b = makeBracket(ids(n), new Rng(40 + n));
      let games = 0;
      for (let guard = 0; guard < 20 && !champion(b); guard++) {
        for (const r of readyMatches(b)) {
          setWinner(b, r.round, r.index, r.m.a!);
          games++;
        }
      }
      const c = champion(b)!;
      expect(c).toBeTruthy();
      expect(games).toBe(n - 1);
      expect(knockedOut(b, c)).toBe(false);
      expect(ids(n).filter((p) => p !== c).every((p) => knockedOut(b, p))).toBe(true);
    }
  });
  it('names the rounds', () => {
    const b = makeBracket(ids(8), new Rng(1));
    expect([0, 1, 2].map((r) => roundName(b, r))).toEqual(['Quarterfinal', 'Semifinal', 'Final']);
  });
});

describe('online runs never touch your saved run', () => {
  it('a stage battle run is not saved, and ending it keeps your own run', () => {
    const meta: Meta = { unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: ['mentor'], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] };
    const mine = startRun(meta, 'emberkit', 11);
    mine.floor = 2;
    saveRun(mine);
    const online = startRun(meta, 'emberkit', 12, 'wildlands', undefined, true);
    online.race = { opponent: 'Tyler', role: 'guest' };
    saveRun(online);
    clearSavedRun(online);
    expect(hasSavedRun()).toBe(true);
    expect(loadRun(meta)!.floor).toBe(2);
    clearSavedRun(mine);
    expect(hasSavedRun()).toBe(false);
  });
});

import { naturalMoves, relearnMove } from '../src/logic/creature';
describe('Move Relearn', () => {
  it('offers only moves it would naturally know by its level, and swaps one in at tier 1', () => {
    const c = createCreature('emberkit', 20);
    const pool = naturalMoves(c);
    const set = learnset(SPECIES_BY_ID['emberkit']);
    // Nothing it already knows, nothing above its level.
    for (const id of pool) expect(c.moves.some((m) => m.id === id)).toBe(false);
    // Its Lv 32+ moves aren't offered yet (line attacks aside, which it may reach by rank).
    for (const e of set.filter((x) => x.level > 20 && MOVES[x.id].rank < 0)) expect(pool).not.toContain(e.id);
    expect(pool.length).toBeGreaterThan(0);
    // Forget move 0 for a natural move, then it can relearn the old one.
    const old = c.moves[0].id;
    c.moves[0].tier = 3;
    expect(relearnMove(c, 0, pool[0])).toBe(true);
    expect(c.moves[0]).toEqual({ id: pool[0], tier: 1 });
    expect(naturalMoves(c)).toContain(old);
    expect(relearnMove(c, 1, c.moves[0].id)).toBe(false); // already known
  });
  it('is sold in shops', () => {
    expect(ITEMS_SHOP.relearn.name).toBe('Move Relearn');
  });
});
import { ITEMS as ITEMS_SHOP } from '../src/logic/shop';

import { BULWARK_ID, WARP_ID, fastId, slowId, speedPower } from '../src/data/moves';
import { extraMoves } from '../src/logic/creature';
describe('Bulwark, Time Warp and speed attacks', () => {
  const pair = (pMoves: string[], eMoves: string[], seed = 3, pId = 'pebblin', eId = 'emberkit') => {
    const p = createCreature(pId, 30);
    p.moves = pMoves.map((id) => ({ id, tier: 1 }));
    const e = createCreature(eId, 30);
    e.moves = eMoves.map((id) => ({ id, tier: 1 }));
    return new Battle([p], [e], new Rng(seed));
  };
  it('Bulwark goes first and blocks the attack, but rarely holds twice in a row', () => {
    const b = pair([BULWARK_ID], ['Fire:2']);
    const hp = b.p.c.hp;
    const ev = b.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
    expect(b.p.c.hp).toBe(hp);
    expect((ev.find((x) => x.kind === 'attack') as { side: string }).side).toBe('player');
    expect(ev.some((x) => x.kind === 'text' && /blocked/.test(x.text))).toBe(true);
    // Used again and again: it holds about a quarter of the time after a success.
    let held = 0;
    let tries = 0;
    for (let seed = 1; seed < 400; seed++) {
      const b2 = pair([BULWARK_ID], ['Fire:0'], seed);
      b2.p.c.moves[0].used = -10;
      b2.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
      const before = b2.p.c.hp;
      b2.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
      tries++;
      if (b2.p.c.hp === before) held++;
    }
    expect(held / tries).toBeGreaterThan(0.15);
    expect(held / tries).toBeLessThan(0.35);
    expect(maxUses(MOVES[BULWARK_ID])).toBe(4);
  });
  it('Time Warp lets the slower Hexling move first for a few turns, and using it again ends it', () => {
    const b = pair([WARP_ID, 'Earth:0'], ['Fire:0'], 5, 'pebblin', 'zapkit' in SPECIES_BY_ID ? 'zapkit' : 'emberkit');
    b.p.c.level = 30;
    const slower = b.speedOf(b.p) < b.speedOf(b.e);
    b.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
    expect(b.warp).toBeGreaterThan(0);
    const ev = b.takeDuelTurn({ kind: 'move', index: 1 }, { kind: 'move', index: 0 });
    const first = (ev.find((x) => x.kind === 'attack') as { side: string }).side;
    expect(first).toBe(slower ? 'player' : 'enemy');
    b.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
    expect(b.warp).toBe(0);
  });
  it('speed attacks hit harder the bigger the speed gap their way', () => {
    expect(speedPower(2)).toBeGreaterThan(speedPower(1.2));
    expect(speedPower(0.5)).toBe(40);
    // 2.0: a gentler curve, never above 90 however big the gap.
    expect(speedPower(1)).toBe(60);
    expect(speedPower(1.5)).toBeLessThanOrEqual(80);
    expect(speedPower(10)).toBe(90);
    const b = pair([fastId('Earth'), slowId('Earth')], ['Fire:0']);
    const fast = b.speedFactor(MOVES[fastId('Earth')], b.p, b.e);
    const slow = b.speedFactor(MOVES[slowId('Earth')], b.p, b.e);
    if (b.speedOf(b.p) < b.speedOf(b.e)) expect(slow).toBeGreaterThan(fast);
    else expect(fast).toBeGreaterThanOrEqual(slow);
  });
  it('only fitting lines learn them, and existing Hexlings pick them up on their next level', () => {
    const all = SPECIES.map((s) => ({ s, x: extraMoves(s).map((e) => e.id) }));
    const warp = all.filter((a) => a.x.includes(WARP_ID));
    const bulwark = all.filter((a) => a.x.includes(BULWARK_ID));
    expect(warp.length).toBeGreaterThan(4);
    // A small share of lines (the count grows with the roster).
    expect(warp.length).toBeLessThan(SPECIES.length * 0.16);
    expect(bulwark.length).toBeGreaterThan(10);
    expect(bulwark.length).toBeLessThan(SPECIES.length / 3);
    for (const a of warp) expect(a.s.types.some((t) => ['Spirit', 'Shadow', 'Light', 'Metal'].includes(t))).toBe(true);
    // Names are unique.
    const names = Object.values(MOVES).map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    // A saved Lv 40 Hexling from before: offered on its next level-up.
    const sp = warp[0].s;
    setFloorCeiling(Infinity);
    const c = createCreature(sp.id, 40, 1); // evolved, so Lv 40 is within its cap
    c.extraOffered = undefined;
    c.moves = c.moves.filter((m) => m.id !== WARP_ID);
    c.pendingMoves = [];
    addLevels(c, 1);
    expect([...c.moves.map((m) => m.id), ...c.pendingMoves]).toContain(WARP_ID);
  });
});

import { addRoyaleWin } from '../src/logic/titles';
describe('battle royale titles', () => {
  it('4, 6 and 8-player wins earn their titles and gear', () => {
    const meta: Meta = { unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: ['mentor'], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] };
    expect(addRoyaleWin(meta, 3).map((t) => t.name)).not.toContain('Royale Victor');
    expect(addRoyaleWin(meta, 5).map((t) => t.name)).toContain('Royale Victor');
    expect(addRoyaleWin(meta, 6).map((t) => t.name)).toContain('Royale Champion');
    expect(earnedTitles(meta)).not.toContain('Battle Monarch');
    expect(addRoyaleWin(meta, 8).map((t) => t.name)).toContain('Battle Monarch');
    // A smaller win later doesn't take anything away.
    addRoyaleWin(meta, 3);
    expect(meta.royaleBest).toBe(8);
    for (const [name, gear] of [['Royale Victor', 'Back: Victory banner'], ['Royale Champion', 'Aura: Regal'], ['Battle Monarch', 'Hat: Monarch crown']]) {
      expect(TITLE_REWARDS[name].map((c) => c.name)).toContain(gear);
    }
    expect(meta.onlineWins).toBe(5);
  });
});

import { myMatch, newTournament, nextCpuMatch, playCpuMatch, recordMine, teamFor, YOU } from '../src/logic/tournament';
import { champion as champ2, knockedOut as ko2 } from '../src/logic/bracket';

describe('Arena tournament', () => {
  const picks = [{ speciesId: SPECIES[0].id, stage: 0, moves: [] as string[] }];
  it('seeds you and 7 named computer trainers into an 8-player bracket', () => {
    const t = newTournament(picks, 42);
    expect(t.trainers).toHaveLength(8);
    expect(new Set(t.trainers.map((x) => x.name.split(' ').pop())).size).toBe(8);
    expect(t.bracket.rounds.map((r) => r.length)).toEqual([4, 2, 1]);
    expect(myMatch(t)?.round).toBe(0);
    // The rest of your round waits for you.
    expect(nextCpuMatch(t)).toBeNull();
  });
  it('plays out to a champion whether you win or lose', () => {
    for (const won of [true, false]) {
      const t = newTournament(picks, 7);
      for (let guard = 0; guard < 20 && !champ2(t.bracket); guard++) {
        const cpu = nextCpuMatch(t);
        if (cpu) playCpuMatch(t, cpu.round, cpu.index);
        else recordMine(t, won);
      }
      expect(champ2(t.bracket)).toEqual(won ? YOU : expect.any(String));
      if (!won) expect(ko2(t.bracket, YOU)).toBe(true);
    }
  });
  it('gives every match full-health copies of the teams', () => {
    const t = newTournament(picks, 3);
    const a = teamFor(t, 'cpu1');
    a[0].hp = 0;
    expect(teamFor(t, 'cpu1')[0].hp).toBeGreaterThan(0);
    expect(teamFor(t, YOU)).toHaveLength(1);
  });
});

import { WEATHER, weatherId, WEATHER_UP, WEATHER_DOWN } from '../src/data/moves';
import { WEATHER_LINES } from '../src/logic/creature';
import { applySnap, flipSnap, snapshot } from '../src/net/duel';
describe('Battle weather', () => {
  const duo = (pId: string, pMoves: string[], eId: string, eMoves: string[], seed = 5) => {
    const p = createCreature(pId, 30);
    p.moves = pMoves.map((id) => ({ id, tier: 1 }));
    const e = createCreature(eId, 30);
    e.moves = eMoves.map((id) => ({ id, tier: 1 }));
    return new Battle([p], [e], new Rng(seed));
  };
  it('only eight lines learn a weather move, two for each kind', () => {
    const learners = SPECIES.filter((sp) => extraMoves(sp).some((m) => MOVES[m.id].weather));
    expect(learners.map((s) => s.id).sort()).toEqual(Object.keys(WEATHER_LINES).sort());
    for (const w of Object.keys(WEATHER) as (keyof typeof WEATHER)[]) expect(Object.values(WEATHER_LINES).filter((x) => x === w)).toHaveLength(2);
  });
  it('sun powers up Fire, weakens Water, and wears off after its turns', () => {
    const b = duo('flicklet', [weatherId('sun'), 'Fire:0'], 'pebblin', ['Earth:0']);
    b.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
    expect(b.weather).toBe('sun');
    expect(b.weatherLeft).toBe(4);
    // Fire hits harder in the sun than without it (same seed, same roll).
    const hit = (sun: boolean) => {
      const x = duo('flicklet', ['Fire:0'], 'golemite', ['Earth:0'], 9);
      x.e.c.level = 70;
      x.e.c.hp = stats(x.e.c).hp;
      if (sun) x.setWeather('sun', 3);
      const before = x.e.c.hp;
      x.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
      return before - x.e.c.hp;
    };
    expect(hit(true) / hit(false)).toBeGreaterThan(WEATHER_UP - 0.1);
    for (let i = 0; i < 4; i++) b.takeDuelTurn({ kind: 'move', index: 1 }, { kind: 'move', index: 0 });
    expect(b.weather).toBeNull();
    expect(WEATHER_DOWN).toBeLessThan(1);
  });
  it('hail chips Hexlings that are not Frost, survives a save and a duel snapshot', () => {
    const b = duo('snowmote', [weatherId('hail')], 'pebblin', ['Earth:buff' in MOVES ? 'Earth:buff' : 'Earth:0']);
    const p0 = b.p.c.hp;
    const e0 = b.e.c.hp;
    b.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
    expect(b.weather).toBe('hail');
    expect(b.e.c.hp).toBeLessThan(e0);
    // The snow Hexling is sheltered (and the foe's buff did no damage).
    expect(b.p.c.hp).toBe(p0);
    const saved = b.saveState();
    const c = duo('snowmote', [weatherId('hail')], 'pebblin', ['Earth:0']);
    c.restoreState(saved);
    expect([c.weather, c.weatherLeft]).toEqual(['hail', b.weatherLeft]);
    const d = duo('snowmote', [weatherId('hail')], 'pebblin', ['Earth:0']);
    applySnap(d, flipSnap(flipSnap(snapshot(b))));
    expect([d.weather, d.weatherLeft]).toEqual(['hail', b.weatherLeft]);
  });
});

import { bondHearts, natureFor, natureMult, NATURES } from '../src/data/natures';
import { growBond } from '../src/logic/run';
describe('Natures and bond', () => {
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
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('a nature leans one stat up 10% and another down 10%', () => {
    const c = createCreature('emberkit', 30);
    const plain = stats(c);
    c.nature = 'brave';
    const s = stats(c);
    expect(s.atk / plain.atk).toBeCloseTo(1.1, 1);
    expect(s.spd / plain.spd).toBeCloseTo(0.9, 1);
    expect(s.def).toBe(plain.def);
    expect(natureMult('steady', 'atk')).toBe(1);
    expect(Object.keys(NATURES)).toContain(natureFor('x'));
  });
  it('run Hexlings get natures from the seed; Arena ones have none', () => {
    const meta = mkMeta();
    const a = startRun(meta, 'emberkit', 77);
    const b = startRun(mkMeta(), 'emberkit', 77);
    expect(a.team[0].nature).toBeDefined();
    expect(a.team[0].nature).toBe(b.team[0].nature);
    const node = Object.values(a.map.nodes).find((n) => n.kind === 'battle')!;
    const e = makeEncounter(a, node);
    expect(e.every((c) => !!c.nature)).toBe(true);
    expect(mkArena({ speciesId: 'emberkit', stage: 0, moves: [] }).nature).toBeUndefined();
  });
  it('bond grows with wins and can let a Hexling hang on at 1 HP', () => {
    const run = startRun(mkMeta(), 'emberkit', 5);
    const c = run.team[0];
    const lines: string[] = [];
    for (let i = 0; i < 8; i++) lines.push(...growBond(run, [c.uid]));
    expect(bondHearts(c.bond)).toBe(2);
    expect(lines).toHaveLength(2);
    // Not fighting: no bond.
    growBond(run, []);
    expect(c.bond).toBe(8);
    let held = 0;
    for (let seed = 1; seed < 300; seed++) {
      const p = createCreature('emberkit', 10);
      p.bond = 15;
      p.moves = [{ id: 'Fire:0', tier: 1 }];
      const e = createCreature('golemite', 60);
      e.moves = [{ id: 'Earth:2', tier: 3 }];
      const b = new Battle([p], [e], new Rng(seed), { bond: true });
      const ev = b.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
      if (p.hp === 1 && ev.some((x) => x.kind === 'text' && /hung on for you/.test(x.text))) held++;
    }
    expect(held).toBeGreaterThan(30);
    expect(held).toBeLessThan(120);
  });
});

import { clockSky, dayPhase, holidayOn, setWorldClock as setClock } from '../src/logic/ambience';
describe('Time of day and holidays', () => {
  it('reads the phase of the day and only short holiday windows', () => {
    expect(dayPhase(new Date(2026, 10, 20, 13))).toBe('day');
    expect(dayPhase(new Date(2026, 10, 20, 23))).toBe('night');
    expect(dayPhase(new Date(2026, 10, 20, 6))).toBe('dawn');
    expect(dayPhase(new Date(2026, 10, 20, 19))).toBe('dusk');
    expect(holidayOn(new Date(2026, 9, 31))?.id).toBe('halloween');
    expect(holidayOn(new Date(2026, 11, 25))?.id).toBe('winter');
    expect(holidayOn(new Date(2026, 11, 10))).toBeNull();
    expect(holidayOn(new Date(2026, 11, 31))?.id).toBe('newyear');
    expect(holidayOn(new Date(2026, 1, 14))?.id).toBe('valentine');
  });

  it('battle skies follow the clock, and keep their own time with the clock off', () => {
    setClock(true);
    const at = (h: number) => new Date(2026, 10, 20, h);
    expect(clockSky('night', at(13))).toBe('day');
    expect(clockSky('fog', at(13))).toBe('fog');
    expect(clockSky('day', at(23))).toBe('night');
    expect(clockSky('fog', at(2))).toBe('night');
    expect(clockSky('day', at(6))).toBe('dusk');
    expect(clockSky('day', at(19))).toBe('dusk');
    setClock(false);
    expect(clockSky('night', at(13))).toBe('night');
    setClock(true);
  });
});

import { setWorldClock } from '../src/logic/ambience';
import { DEX_FORMS, DEX_SPECIES, LEGENDS, isLegend } from '../src/data/legends';
import { arenaForms, arenaRoster, validArenaTeam } from '../src/logic/arena';
import { legendBeaten, legendFled, legendsCaught, placeRoamer, moveRoamer, hexDistance } from '../src/logic/run';
import { vi } from 'vitest';
// Tests shouldn't depend on the time of day they run at.
setWorldClock(false);
describe('Roaming legendaries and night Hexlings', () => {
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
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  const floor2 = (seed = 21) => {
    const run = startRun(mkMeta(), 'emberkit', seed);
    run.floor = 1;
    run.map = generateFloor(1, run.biomes[1], seed);
    run.currentId = run.map.startId;
    run.visited = [run.map.startId];
    return run;
  };
  it('stay out of every spawn pool and the extra-move thresholds, but have Hexlidex entries', () => {
    for (const l of LEGENDS) {
      expect(SPECIES.some((s) => s.id === l.id)).toBe(false);
      expect(SPECIES_BY_ID[l.id]).toBe(l);
      expect(isLegend(l.id)).toBe(true);
      expect(DEX_SPECIES).toContain(l);
    }
    expect(DEX_FORMS).toBe(SPECIES.length * 3 + LEGENDS.length);
  });
  it('roam battle hexes ahead, move as you do, and only in unseeded runs after floor 1', () => {
    let moved = false;
    // (Some hexes have no battle hex next to them: a legendary placed there stays put, cornered.)
    for (let seed = 21; seed < 31 && !moved; seed++) {
      const run = floor2(seed);
      placeRoamer(run, true);
      expect(run.roamer).toBeTruthy();
      expect(run.map.nodes[run.roamer!.node].kind).toBe('battle');
      const first = run.roamer!.node;
      for (let i = 0; i < 6 && run.roamer && !moved; i++) {
        const next = run.map.nodes[run.currentId].next.find((id) => id !== run.roamer!.node && run.map.nodes[id].kind !== 'boss');
        if (!next) break;
        moveTo(run, next);
        if (run.roamer && run.roamer.node !== first) moved = true;
      }
    }
    expect(moved).toBe(true);
    const daily = floor2();
    daily.daily = '2026-11-20';
    placeRoamer(daily, true);
    expect(daily.roamer).toBeNull();
    const f1 = startRun(mkMeta(), 'emberkit', 3);
    placeRoamer(f1, true);
    expect(f1.roamer).toBeNull();
  });
  it('moves at most 1 hex at a time, sometimes toward you, and never leaves the floor', () => {
    let toward = 0;
    for (let s = 0; s < 30; s++) {
      const run = floor2();
      run.seed = 1000 + s;
      placeRoamer(run, true);
      if (!run.roamer) continue;
      for (;;) {
        const next = run.map.nodes[run.currentId].next.find((id) => run.map.nodes[id].kind !== 'boss');
        if (!next) break;
        const before = run.map.nodes[run.roamer!.node];
        const gapBefore = hexDistance(run.map.nodes[next], before);
        moveTo(run, next);
        if (next === before.id) break; // stepped onto it: a meeting
        expect(run.roamer).toBeTruthy();
        const after = run.map.nodes[run.roamer!.node];
        const here = run.map.nodes[run.currentId];
        if (before.y < here.y) expect(hexDistance(before, after)).toBeLessThanOrEqual(1);
        if (run.roamer!.cornered) expect(after.id).toBe(before.id);
        if (hexDistance(here, after) < gapBefore) toward++;
      }
    }
    expect(toward).toBeGreaterThan(0);
  });
  it('cornered with nowhere to step, it stays put instead of vanishing', () => {
    const run = floor2();
    placeRoamer(run, true);
    const r = run.roamer!;
    const here = run.map.nodes[run.currentId];
    // Every other battle hex is already visited: it has nowhere to go.
    for (const n of Object.values(run.map.nodes)) if (n.kind === 'battle' && n.id !== r.node) run.visited.push(n.id);
    expect(run.map.nodes[r.node].y).toBeLessThan(here.y);
    moveRoamer(run);
    expect(run.roamer).toBeTruthy();
    expect(run.roamer!.node).toBe(r.node);
    expect(run.roamer!.cornered).toBe(true);
  });
  it('a meeting is the legendary alone; it keeps its damage, and once caught it roams no more', () => {
    const run = floor2();
    placeRoamer(run, true);
    const id = run.roamer!.id;
    const foe = makeEncounter(run, run.map.nodes[run.roamer!.node]);
    expect(foe).toHaveLength(1);
    expect(foe[0].speciesId).toBe(id);
    foe[0].hp = Math.round(stats(foe[0]).hp * 0.5);
    legendFled(run, foe[0]);
    expect(run.meta.legends![id].hp).toBeCloseTo(0.5, 1);
    // Gone for the rest of this run: it doesn't move on, and no later floor brings it back.
    expect(run.roamer).toBeNull();
    for (let s = 0; s < 10; s++) {
      placeRoamer(run, true);
      expect(run.roamer?.id).not.toBe(id);
    }
    // Another run: it can turn up again, still worn down.
    run.legendsGone = [];
    placeRoamer(run, true);
    const again = makeEncounter(run, run.map.nodes[run.roamer!.node]);
    if (again[0].speciesId === id) expect(again[0].hp / stats(again[0]).hp).toBeCloseTo(0.5, 1);
    legendBeaten(run, id);
    const caught = catchCreature(run, again[0]);
    expect(caught).toBeTruthy();
    // In the Hexlidex and the Arena, never a starter.
    expect(run.meta.dex.caught).toContain(again[0].speciesId);
    expect(run.meta.unlockedStarters).not.toContain(again[0].speciesId);
    expect(arenaRoster(run.meta)).toContain(again[0].speciesId);
    expect(arenaForms(run.meta, again[0].speciesId)).toEqual([2]);
    const team = validArenaTeam(run.meta, [{ speciesId: again[0].speciesId, stage: 2, moves: [] }]);
    expect(team).toHaveLength(1);
    expect(mkArena(team[0]).speciesId).toBe(again[0].speciesId);
    expect(legendsCaught(run.meta)).toBe(1);
    for (let s = 0; s < 20; s++) {
      placeRoamer(run, true);
      expect(run.roamer?.id).not.toBe(again[0].speciesId);
    }
  });
  it('at night, Shadow and Spirit Hexlings show up in any land', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const count = (hour: number) => {
      vi.setSystemTime(new Date(2026, 10, 20, hour));
      let n = 0;
      for (let seed = 1; seed < 60; seed++) {
        const run = startRun(mkMeta(), 'emberkit', seed);
        run.log.fights = 1;
        const node = Object.values(run.map.nodes).find((x) => x.kind === 'battle')!;
        for (const c of makeEncounter(run, node)) if (SPECIES_BY_ID[c.speciesId].types.some((t) => t === 'Shadow' || t === 'Spirit')) n++;
      }
      return n;
    };
    setWorldClock(true);
    const night = count(23);
    const day = count(13);
    setWorldClock(false);
    vi.useRealTimers();
    expect(night).toBeGreaterThan(day);
  });
});

import { rivalBeaten, rivalHello, rivalHere, placeRival } from '../src/logic/run';
import { researcherHint, shopTalk } from '../src/logic/talk';
describe('Your rival, the shopkeeper and the researcher', () => {
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
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('a rival waits on a trainer hex mid-floor, with an ace that has the edge on your starter', () => {
    const run = startRun(mkMeta(), 'emberkit', 31);
    const r = run.rival!;
    expect(r).toBeTruthy();
    const node = run.map.nodes[r.node!];
    expect(node.kind).toBe('elite');
    expect(node.progress).toBeGreaterThanOrEqual(0.3);
    expect(typeMultiplier(SPECIES_BY_ID[r.ace].types[0], ['Fire', 'Fire'])).toBeGreaterThan(1);
    // Same seed, same rival (daily runs too).
    expect(startRun(mkMeta(), 'emberkit', 31).rival).toEqual(r);
  });
  it('the rival team grows each floor and is led by their ace; beating them clears the hex', () => {
    const run = startRun(mkMeta(), 'emberkit', 32);
    const sizes: number[] = [];
    for (let f = 0; f < 3; f++) {
      run.floor = f;
      run.map = generateFloor(f, run.biomes[f], 100 + f);
      placeRival(run);
      const team = makeEncounter(run, run.map.nodes[run.rival!.node!]);
      sizes.push(team.length);
      expect(team[team.length - 1].speciesId).toBe(run.rival!.ace);
      expect(team[team.length - 1].stage).toBe(f);
      expect(rivalHello(run).length).toBeGreaterThan(5);
      expect(rivalBeaten(run).length).toBeGreaterThan(5);
      expect(rivalHere(run, run.rival!.node!)).toBe(false);
    }
    expect(sizes).toEqual([2, 3, 4]);
  });
  it('no rival in online or Gilded Hunt runs', () => {
    const run = startRun(mkMeta(), 'emberkit', 33);
    run.race = { opponent: 'A', role: 'host' };
    makeRivalFor(run);
    expect(run.rival).toBeNull();
  });
  it('the shopkeeper and researcher say something that fits', () => {
    const run = startRun(mkMeta(), 'emberkit', 34);
    run.shopVisits = 1;
    expect(shopTalk(run)).toMatch(/^Mori: “.+”$/);
    run.shopVisits = 3;
    run.team[0].hp = 1;
    expect(shopTalk(run)).toMatch(/rough|seen better/);
    expect(researcherHint(run)).toMatch(/^Professor Alder: “.+”$/);
  });
});
import { makeRival as makeRivalFor } from '../src/logic/run';

describe('Leaderboards', async () => {
  const { BOARDS, myScores, showScore } = await import('../src/logic/leaderboard');
  it('has a number for every board, whole and never negative', () => {
    const m = blankMeta();
    m.wins = 4;
    m.bestStreak = 3;
    m.mapHeats = { a: [1, 5], b: [2] };
    m.stats.coinsEarned = 1234.7;
    const s = myScores(m);
    expect(Object.keys(s)).toEqual(BOARDS.map((b) => b.id));
    expect(s.wins).toBe(4);
    expect(s.streak).toBe(3);
    expect(s.heat).toBe(5);
    expect(s.coins).toBe(1234);
    expect(Object.values(s).every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    expect(showScore(BOARDS.find((b) => b.id === 'heat')!, 5)).toBe('Heat 5');
  });
  it('every board is one the server knows', async () => {
    const sql = (await import('../supabase/leaderboard.sql?raw')).default;
    for (const b of BOARDS) expect(sql).toContain(`"${b.id}":`);
  });
});

describe('Camp', async () => {
  const campMod = await import('../src/logic/camp');
  const { startRun, applyPrep } = await import('../src/logic/run');
  const { priceFor } = await import('../src/logic/shop');
  const day = (d: number) => new Date(2026, 10, d, 12);

  it('three challenges a day, measured from the start of the day, claimed once for embers', () => {
    const m = blankMeta();
    m.stats.battlesWon = 100;
    const list = campMod.challenges(m, day(20));
    expect(list.map((c) => c.tier)).toEqual([0, 1, 2]);
    expect(list.every((c) => c.progress === 0)).toBe(true);
    // Do everything today asks for.
    for (const c of list) {
      const key = { battles: 'battlesWon', caught: 'caught', evolutions: 'evolutions', elites: 'elites', treasures: 'treasures', statuses: 'statusInflicted', events: 'events', coins: 'coinsEarned', levelups: 'levelups' }[c.stat];
      if (key) (m.stats as unknown as Record<string, number>)[key] += c.goal;
      else if (c.stat === 'guardians') m.bossesDefeated += c.goal;
      else if (c.stat === 'wins') m.wins += c.goal;
    }
    const after = campMod.challenges(m, day(20));
    expect(after.every((c) => c.complete)).toBe(true);
    expect(campMod.challengesFor(m.camp!.day)).toEqual(campMod.challengesFor(m.camp!.day));
  });

  it('claims pay out once, and a new day brings fresh challenges and care', () => {
    const m = blankMeta();
    campMod.camp(m, day(1));
    m.camp!.day = campMod.localDay();
    m.camp!.base = campMod.counters(m);
    m.wins = 5;
    m.stats.battlesWon = 50;
    m.stats.caught = 30;
    m.stats.coinsEarned = 1000;
    m.stats.levelups = 50;
    m.stats.events = 10;
    m.stats.treasures = 10;
    m.stats.elites = 10;
    m.stats.evolutions = 10;
    m.stats.statusInflicted = 10;
    m.bossesDefeated = 10;
    expect(campMod.claimChallenge(m, 0)).toBe(campMod.TIER_EMBERS[0]);
    expect(campMod.claimChallenge(m, 0)).toBe(0);
    expect(m.camp!.embers).toBe(campMod.TIER_EMBERS[0]);
    expect(campMod.care(m, 'emberkit', 'pet')).toBe(0);
    expect(campMod.care(m, 'emberkit', 'pet')).toBeNull();
    campMod.camp(m, new Date(Date.now() + 86_400_000 * 2));
    expect(m.camp!.claimed).toEqual([false, false, false]);
    expect(m.camp!.cared).toEqual({});
    expect(m.camp!.embers).toBe(campMod.TIER_EMBERS[0]);
  });

  it('embers buy decorations and fire colours', () => {
    const m = blankMeta();
    campMod.camp(m).embers = 25;
    expect(campMod.buyCampItem(m, 'fire-blue')).toBeNull();
    expect(campMod.fireColors(m)).toEqual(campMod.CAMP_ITEM['fire-blue'].flame);
    expect(campMod.buyCampItem(m, 'fire-blue')).toBeTruthy();
    expect(campMod.buyCampItem(m, 'crystal')).toMatch(/more embers/);
  });

  it('a full camp bond means that Hexling starts runs with a bond heart (not on dailies)', () => {
    const m = blankMeta();
    campMod.camp(m).bond.emberkit = campMod.CAMP_HEARTS[2];
    expect(campMod.campHearts(m, 'emberkit')).toBe(3);
    expect(startRun(m, 'emberkit', 7).team[0].bond).toBe(campMod.CAMP_START_BOND);
    expect(startRun(m, 'emberkit', 7, 'wildlands', '2026-11-20').team[0].bond ?? 0).toBe(0);
    expect(startRun(m, 'frostling', 7).team[0].bond ?? 0).toBe(0);
  });

  it('the choice at the fire: three offers from the seed, each doing what it says', () => {
    expect(campMod.prepOffers(42)).toEqual(campMod.prepOffers(42));
    expect(new Set(campMod.prepOffers(42)).size).toBe(3);
    const m = blankMeta();
    const purse = startRun(m, 'emberkit', 9);
    applyPrep(purse, 'purse');
    expect(purse.coins).toBe(60);
    const pots = startRun(m, 'emberkit', 9);
    applyPrep(pots, 'potions');
    expect(pots.potions).toBe(2);
    const held = startRun(m, 'emberkit', 9);
    applyPrep(held, 'held');
    expect(held.bag?.length).toBe(1);
    const sale = startRun(m, 'emberkit', 9);
    const full = priceFor(sale, 100);
    applyPrep(sale, 'haggle');
    expect(priceFor(sale, 100)).toBeLessThan(full);
    sale.floor = 1;
    expect(priceFor(sale, 100)).toBeGreaterThan(priceFor({ ...sale, floor: 0 }, 100));
    expect(campMod.prepsAvailable(sale)).toBe(false);
    expect(campMod.prepsAvailable(startRun(m, 'emberkit', 9))).toBe(true);
    expect(campMod.prepsAvailable(startRun(m, 'emberkit', 9, 'wildlands', '2026-11-20'))).toBe(false);
  });

  it('at camp, each heart evolves a Hexling: first form, middle, final (the third heart keeps it final)', () => {
    const m = blankMeta();
    const c = campMod.camp(m);
    c.crew = ['emberkit'];
    const stageAt = (pts: number) => ((c.bond.emberkit = pts), campMod.campCrew(m)[0].stage);
    expect(stageAt(0)).toBe(0);
    expect(stageAt(campMod.CAMP_HEARTS[0])).toBe(1);
    expect(stageAt(campMod.CAMP_HEARTS[1])).toBe(2);
    expect(stageAt(campMod.CAMP_HEARTS[2])).toBe(2);
  });

  it('camp grows with what you have done', () => {
    const m = blankMeta();
    expect(campMod.growth(m, 100)).toMatchObject({ tents: 0, shrine: false, fire: 0 });
    m.runs = 30;
    m.wins = 12;
    m.shinyCaught = 1;
    m.clearedMaps = ['wildlands'];
    expect(campMod.growth(m, 100)).toMatchObject({ tents: 2, shrine: true, fire: 2, banners: ['wildlands'] });
  });
});

describe('Hexlidex extras', async () => {
  const info = await import('../src/logic/dexInfo');
  const { SPECIES } = await import('../src/data/species');
  const { typeMultiplier } = await import('../src/data/types');
  it('says where a line lives: its lands, and the maps that have them', () => {
    const sp = SPECIES.find((s) => s.types.includes('Fire'))!;
    const h = info.habitat(sp.id);
    expect(h.lands).toContain('Fire');
    expect(h.maps).toContain('Wildlands');
    expect(h.maps).toContain('Volcanic Rift');
  });
  it('matchups agree with the type chart', () => {
    for (const sp of SPECIES.slice(0, 40)) {
      const m = info.matchups(sp.types);
      for (const w of m.weak) expect(typeMultiplier(w.el, sp.types)).toBeGreaterThan(1);
      for (const r of m.resist) expect(typeMultiplier(r.el, sp.types)).toBeLessThan(1);
      for (const el of m.immune) expect(typeMultiplier(el, sp.types)).toBe(0);
    }
  });
  it('keeps your record with each line, starting from your run history', () => {
    const m = blankMeta();
    m.dex.caught = ['emberkit'];
    m.history = [{ at: 1, won: true, floor: 3, mapId: 'wildlands', heat: 0, battlesWon: 9, caught: 2, team: [{ speciesId: 'emberkit', stage: 2, level: 31 }], mvp: { speciesId: 'emberkit', stage: 2, name: 'x', dealt: 9 } }];
    expect(info.lineRecord(m, 'emberkit')).toMatchObject({ caught: 1, wins: 1, mvp: 1, best: 31 });
    info.noteCatch(m, 'emberkit');
    expect(info.lineRecord(m, 'emberkit').caught).toBe(2);
  });
  it('completion rewards pay embers once each', () => {
    const m = blankMeta();
    const fire = SPECIES.filter((s) => s.types.includes('Fire')).map((s) => s.id);
    expect(info.claimDexReward(m, 'el-Fire')).toBe(0);
    m.dex.caught = fire;
    expect(info.dexRewardsReady(m)).toBeGreaterThan(0);
    expect(info.claimDexReward(m, 'el-Fire')).toBe(15);
    expect(info.claimDexReward(m, 'el-Fire')).toBe(0);
    expect(m.camp!.embers).toBe(15);
  });
});

describe('Shared seeds (online races)', async () => {
  const run = await import('../src/logic/run');
  const { rollShop } = await import('../src/logic/shop');
  const { DEFAULT_STARTERS } = await import('../src/data/species');
  it('the same seed gives the same Hexlings, shops and floors, however differently players play', () => {
    const a = run.startRun(blankMeta(), DEFAULT_STARTERS[0], 4242, 'wildlands', undefined, true);
    const b = run.startRun(blankMeta(), DEFAULT_STARTERS[0], 4242, 'wildlands', undefined, true);
    // Player B burns through lots of randomness first (battles, crits, misses...).
    for (let i = 0; i < 500; i++) b.rng.next();
    const hex = Object.values(a.map.nodes).find((n) => n.kind === 'battle')!;
    const sig = (cs: { speciesId: string; level: number }[]) => cs.map((c) => `${c.speciesId}@${c.level}`).join(',');
    expect(sig(run.makeEncounter(a, hex))).toBe(sig(run.makeEncounter(b, b.map.nodes[hex.id])));
    a.currentId = b.currentId = hex.id;
    expect(rollShop(a).slots.map((s) => s.item)).toEqual(rollShop(b).slots.map((s) => s.item));
    expect(rollShop(a, 1).slots.map((s) => s.item)).toEqual(rollShop(b, 1).slots.map((s) => s.item));
  });
  it('each starter gets a passive from the race seed: the same for everyone, new each race', () => {
    const starters = DEFAULT_STARTERS.slice(0, 3);
    expect(run.racePassives(7, starters)).toEqual(run.racePassives(7, starters));
    const r = run.startRun(blankMeta(), starters[0], 7, 'wildlands', undefined, true, undefined, run.racePassives(7, starters)[starters[0]]);
    expect(r.passive).toBe(run.racePassives(7, starters)[starters[0]]);
    const differs = [8, 9, 10, 11, 12].some((s) => JSON.stringify(run.racePassives(s, starters)) !== JSON.stringify(run.racePassives(7, starters)));
    expect(differs).toBe(true);
  });
});

describe('Run time', async () => {
  const clock = await import('../src/logic/runClock');
  const run = await import('../src/logic/run');
  it('reads like a clock', () => {
    expect(clock.formatDuration(42_000)).toBe('0:42');
    expect(clock.formatDuration(23 * 60_000 + 41_000)).toBe('23:41');
    expect(clock.formatDuration(3_909_000)).toBe('1:05:09');
  });
  it('a win sets your fastest only if it beats it; losses and online races never do', () => {
    const m = blankMeta();
    const r = run.startRun(m, 'emberkit', 1);
    r.playMs = 20 * 60_000;
    expect(clock.finishRunClock(m, r, true)).toBe(true);
    expect(m.fastestWin).toBe(20 * 60_000);
    expect(clock.finishRunClock(m, r, true)).toBe(false); // already stopped
    const slow = run.startRun(m, 'emberkit', 2);
    slow.playMs = 30 * 60_000;
    expect(clock.finishRunClock(m, slow, true)).toBe(false);
    const lost = run.startRun(m, 'emberkit', 3);
    lost.playMs = 5 * 60_000;
    expect(clock.finishRunClock(m, lost, false)).toBe(false);
    expect(m.fastestWin).toBe(20 * 60_000);
  });
});
