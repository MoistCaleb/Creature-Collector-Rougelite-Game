import { beforeEach, describe, expect, it } from 'vitest';
import { SURPRISE_LIST } from '../src/data/surprises';
import { DEFAULT_STARTERS } from '../src/data/species';
import { traitsOf } from '../src/data/traits';
import { emptyStats } from '../src/logic/achievements';
import { setFloorCeiling } from '../src/logic/creature';
import { emptyDex } from '../src/logic/dex';
import { allCreatures, caravanAt, encounterKind, joinParty, makeEncounter, peekEncounter, postBattleRecover, startRun, type Meta } from '../src/logic/run';
import {
  DOJO_ROUNDS,
  dojoOn,
  dojoResult,
  DROUGHT_MAX,
  EGG_WINS,
  eggReady,
  enterDojo,
  floorSurprise,
  fossilChoices,
  hadSurprise,
  noteAncient,
  hatchEgg,
  layEgg,
  noteRunSurprises,
  runSurprises,
  setGhostPool,
} from '../src/logic/surprises';
import { stats } from '../src/logic/creature';

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

describe('rare surprises', () => {
  it('are seeded: the same seed rolls the same omen and floor surprises', () => {
    for (let seed = 1; seed < 60; seed++) {
      const a = startRun(mkMeta(), 'emberkit', seed, 'wildlands', 'd1');
      const b = startRun(mkMeta(), 'emberkit', seed, 'wildlands', 'd1');
      expect(a.surprises).toEqual(b.surprises);
    }
    expect(new Set(SURPRISE_LIST.map((s) => s.id)).size).toBe(SURPRISE_LIST.length);
  });

  it('about half of runs meet one, and never more than 3 runs in a row go without', () => {
    const meta = mkMeta();
    let had = 0;
    let streak = 0;
    let worst = 0;
    const runs = 400;
    for (let seed = 1; seed <= runs; seed++) {
      const run = startRun(meta, 'emberkit', seed * 7919);
      // The bot-free estimate: the omen and the first floor only (the rest come as you climb).
      if (hadSurprise(run)) had++;
      streak = hadSurprise(run) ? 0 : streak + 1;
      worst = Math.max(worst, streak);
      noteRunSurprises(meta, run);
    }
    expect(worst).toBeLessThanOrEqual(DROUGHT_MAX);
    // First floor and omen alone: a fair share (all three floors push it toward 1 in 2).
    expect(had / runs).toBeGreaterThan(0.2);
  });

  it('a hidden hex replaces one battle hex and leaves the rest of the map alone', () => {
    for (let seed = 1; seed < 300; seed++) {
      const run = startRun(mkMeta(), 'emberkit', seed);
      const fs = floorSurprise(run);
      if (!fs.hex) continue;
      expect(run.map.nodes[fs.hexNode!].kind).toBe('hidden');
      expect(Object.values(run.map.nodes).filter((n) => n.kind === 'hidden').length).toBe(1);
    }
  });

  it('twin wilds are two of a line with its rare trait; a Gilded trainer is a trainer, all Gilded; Scout still sees them', () => {
    const run = startRun(mkMeta(), 'emberkit', 11);
    run.log.fights = 2;
    const node = Object.values(run.map.nodes).find((n) => n.kind === 'battle')!;
    const fs = runSurprises(run).floors['0'];
    fs.enc = 'twinwilds';
    fs.encNode = node.id;
    const twins = makeEncounter(run, node);
    expect(twins.length).toBe(2);
    expect(twins[0].speciesId).toBe(twins[1].speciesId);
    expect(twins[0].trait).toBe(traitsOf(twins[0].speciesId)[2]);
    fs.enc = 'gildedtrainer';
    expect(encounterKind(run, node)).toBe('elite');
    const peek = peekEncounter(run, node)!;
    const team = makeEncounter(run, node);
    expect(team.every((c) => c.shiny)).toBe(true);
    expect(peek.speciesId).toBe(team[0].speciesId);
  });

  it('Blood Moon gives every foe its rare trait; Golden Age doubles coins and raises prices', async () => {
    const { priceFor } = await import('../src/logic/shop');
    const run = startRun(mkMeta(), 'emberkit', 5);
    const before = priceFor(run, 100);
    runSurprises(run).omen = 'bloodmoon';
    run.log.fights = 1;
    const node = Object.values(run.map.nodes).find((n) => n.kind === 'battle')!;
    for (const c of makeEncounter(run, node)) expect(c.trait).toBe(traitsOf(c.speciesId)[2]);
    runSurprises(run).omen = 'goldenage';
    expect(priceFor(run, 100)).toBeGreaterThan(before);
  });
});

describe('hatchery, dojo and caravan (2.0)', () => {
  it('the egg is a line you have not caught, hatches after 5 wins with its rare trait', () => {
    const meta = mkMeta();
    meta.dex.caught = ['emberkit'];
    const run = startRun(meta, 'emberkit', 21);
    const egg = layEgg(run);
    expect(egg.speciesId).not.toBe('emberkit');
    expect(layEgg(run)).toBe(egg);
    for (let i = 0; i < EGG_WINS - 1; i++) postBattleRecover(run, { won: true });
    postBattleRecover(run, {});
    expect(eggReady(run)).toBe(false);
    postBattleRecover(run, { won: true });
    expect(eggReady(run)).toBe(true);
    const c = hatchEgg(run)!;
    expect(c.speciesId).toBe(egg.speciesId);
    expect(c.trait).toBe(traitsOf(c.speciesId)[2]);
    expect(joinParty(run, c)).toBe(true);
    expect(allCreatures(run)).toContain(c);
    expect(runSurprises(run).egg).toBeUndefined();
    expect(hatchEgg(run)).toBeNull();
  });

  it('the dojo is three different trainers with no healing between, and ends on a loss', () => {
    const run = startRun(mkMeta(), 'emberkit', 31);
    const node = Object.values(run.map.nodes).find((n) => n.kind === 'battle')!;
    node.kind = 'hidden';
    run.currentId = node.id;
    expect(encounterKind(run, node)).toBe('hidden');
    enterDojo(run);
    expect(encounterKind(run, node)).toBe('elite');
    const teams: string[] = [];
    const lead = run.team[0];
    for (let i = 0; i < DOJO_ROUNDS; i++) {
      teams.push(makeEncounter(run, node).map((c) => c.speciesId).join());
      lead.hp = Math.ceil(stats(lead).hp / 2);
      postBattleRecover(run, { won: true });
      expect(lead.hp).toBe(Math.ceil(stats(lead).hp / 2));
    }
    expect(runSurprises(run).dojo!.wins).toBe(DOJO_ROUNDS);
    expect(new Set(teams).size).toBeGreaterThan(1);
    enterDojo(run);
    dojoResult(run, false);
    expect(dojoOn(run)).toBe(false);
    // Out of the dojo, wins heal again.
    runSurprises(run).dojo = undefined;
    postBattleRecover(run, { won: true });
    expect(lead.hp).toBeGreaterThan(Math.ceil(stats(lead).hp / 2));
  });

  it('a Fossil Site offers three seeded ancient forms, and the Hexlidex keeps each line once', () => {
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', 51);
    const a = fossilChoices(run);
    expect(a.length).toBe(3);
    expect(new Set(a.map((c) => c.speciesId)).size).toBe(3);
    expect(a.every((c) => c.ancient && c.hp === stats(c).hp)).toBe(true);
    expect(fossilChoices(run).map((c) => c.speciesId)).toEqual(a.map((c) => c.speciesId));
    expect(noteAncient(meta, a[0].speciesId)).toBe(true);
    expect(noteAncient(meta, a[0].speciesId)).toBe(false);
  });

  it("a friend's ghost takes Echo's place on unseeded runs only, with their team; bad server data is dropped", async () => {
    const { cleanGhost } = await import('../src/net/friends');
    expect(cleanGhost('nope')).toBeNull();
    expect(cleanGhost([{ speciesId: 'DROP TABLE' }, 5, null])).toBeNull();
    const team = cleanGhost([{ speciesId: 'emberkit', stage: 9, level: 900 }, { speciesId: 'nosuchline', stage: 1, level: 20 }])!;
    expect(team[0]).toEqual({ speciesId: 'emberkit', stage: 0, level: 100 });
    setGhostPool([{ name: 'Pal', look: null, team }]);
    let ghosts = 0;
    for (let seed = 1; seed < 4000 && ghosts < 3; seed++) {
      const run = startRun(mkMeta(), 'emberkit', seed);
      for (const fs of Object.values(runSurprises(run).floors)) {
        if (fs.enc !== 'ghost') continue;
        ghosts++;
        expect(fs.ghost!.name).toBe('Pal');
        const node = run.map.nodes[fs.encNode!];
        expect(encounterKind(run, node)).toBe('elite');
        // Lines the game doesn't know are left out of the ghost's team.
        expect(makeEncounter(run, node).map((c) => c.speciesId)).toEqual(['emberkit']);
      }
      const daily = startRun(mkMeta(), 'emberkit', seed, 'wildlands', 'd1');
      for (const fs of Object.values(runSurprises(daily).floors)) expect(fs.enc).not.toBe('ghost');
    }
    expect(ghosts).toBeGreaterThan(0);
    setGhostPool([]);
  });

  it('the caravan sells seven things, one of them free, and Scout sees no wild there', async () => {
    const { caravanShop } = await import('../src/logic/shop');
    const run = startRun(mkMeta(), 'emberkit', 41);
    const node = Object.values(run.map.nodes).find((n) => n.kind === 'battle')!;
    const fs = runSurprises(run).floors['0'];
    fs.enc = 'caravan';
    fs.encNode = node.id;
    expect(caravanAt(run, node)).toBe(true);
    expect(peekEncounter(run, node)).toBeNull();
    run.currentId = node.id;
    const shop = caravanShop(run);
    expect(shop.slots.length).toBe(7);
    expect(shop.slots.filter((s) => s.price === 0).length).toBe(1);
    const sum = (sh: typeof shop) => sh.slots.map((s) => `${s.item}:${s.price}`).join();
    expect(sum(caravanShop(run))).toBe(sum(shop));
  });
});

describe('embers from every run (2.0)', () => {
  it('a quick loss pays a little, a win pays a lot more, once', async () => {
    const { payRunEmbers, runEmbers, camp } = await import('../src/logic/camp');
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', 3);
    run.log.battlesWon = 6;
    const loss = runEmbers(run, false).total;
    expect(loss).toBeGreaterThanOrEqual(5);
    expect(loss).toBeLessThan(20);
    const win = runEmbers(run, true).total;
    expect(win).toBeGreaterThan(35);
    const before = camp(meta).embers;
    payRunEmbers(meta, run, true);
    payRunEmbers(meta, run, true);
    expect(camp(meta).embers - before).toBe(win);
  });
});
