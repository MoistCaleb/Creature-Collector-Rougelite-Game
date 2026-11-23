import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_STARTERS } from '../src/data/species';
import { WORKSHOP } from '../src/data/workshop';
import { emptyStats } from '../src/logic/achievements';
import { camp, CAMP_HEARTS } from '../src/logic/camp';
import { setFloorCeiling } from '../src/logic/creature';
import { emptyDex } from '../src/logic/dex';
import { favouriteTrait, maxBondLines, MYTHICS, mythicsFound, topBoons, workshopOwned } from '../src/logic/feats';
import { myScores } from '../src/logic/leaderboard';
import { recordRun, startRun, type Meta } from '../src/logic/run';
import { earnedTitles, takeNewTitles } from '../src/logic/titles';

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

describe('2.0 records, boards and titles', () => {
  it('the Workshop: Tinkerer at 10, Master Builder when complete, and the board', () => {
    const m = mkMeta();
    camp(m).workshop = WORKSHOP.slice(0, 10).map((u) => u.id);
    expect(workshopOwned(m)).toBe(10);
    expect(earnedTitles(m)).toContain('Tinkerer');
    expect(earnedTitles(m)).not.toContain('Master Builder');
    camp(m).workshop = WORKSHOP.map((u) => u.id);
    expect(earnedTitles(m)).toContain('Master Builder');
    expect(myScores(m).workshop).toBe(WORKSHOP.length);
  });

  it('bond: Kindred at 3 hearts, Soulbound at 5, Heart of Camp at 10 lines', () => {
    const m = mkMeta();
    camp(m).bond = { emberkit: CAMP_HEARTS[2] };
    expect(earnedTitles(m)).toContain('Kindred');
    expect(earnedTitles(m)).not.toContain('Soulbound');
    camp(m).bond.emberkit = CAMP_HEARTS[4];
    expect(maxBondLines(m)).toBe(1);
    expect(earnedTitles(m)).toContain('Soulbound');
    for (let i = 0; i < 10; i++) camp(m).bond[`x${i}`] = 999;
    expect(earnedTitles(m)).toContain('Heart of Camp');
    expect(myScores(m).bond5).toBe(11);
  });

  it('mythics: Myth Touched for one, Mythweaver for each kind; curses and offers alone don’t count', () => {
    const m = mkMeta();
    m.boonsSeen = MYTHICS.map((b) => b.id);
    m.boonPicks = { fragile: 3 };
    expect(mythicsFound(m)).toBe(0);
    m.boonPicks[MYTHICS[0].id] = 1;
    expect(earnedTitles(m)).toContain('Myth Touched');
    for (const b of MYTHICS) m.boonPicks[b.id] = 1;
    expect(earnedTitles(m)).toContain('Mythweaver');
    expect(myScores(m).mythics).toBe(MYTHICS.length);
    const fresh = takeNewTitles(m).map((t) => t.name);
    expect(fresh).toEqual(expect.arrayContaining(['Myth Touched', 'Mythweaver']));
    expect(takeNewTitles(m)).toEqual([]);
  });

  it('top boons: most taken first, unknown ids skipped', () => {
    const m = mkMeta();
    m.boonPicks = { [MYTHICS[0].id]: 2, fragile: 5, nonsense: 9 };
    const top = topBoons(m, 5);
    expect(top.map((t) => t.boon.id)).toEqual(['fragile', MYTHICS[0].id]);
  });

  it('a finished run counts its team’s traits for the favourite trait', () => {
    const m = mkMeta();
    const run = startRun(m, 'emberkit', 5, 'wildlands');
    run.team[0].trait = 'heavy';
    recordRun(run, false);
    expect(favouriteTrait(m)?.trait.id).toBe('heavy');
    expect(favouriteTrait(m)?.runs).toBe(1);
  });
});
