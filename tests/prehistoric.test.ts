import { describe, expect, it } from 'vitest';
import { SPECIES } from '../src/data/species';
import { catchCreature, makeEncounter, PREHISTORIC_IN, startRun, type Meta } from '../src/logic/run';
import { createCreature } from '../src/logic/creature';
import { colours, familyPlan, prehistoricPlan, stagePlan, type Family, type StagePlan } from '../src/ui/sprites';
import { emptyDex } from '../src/logic/dex';
import { emptyStats } from '../src/logic/achievements';
import { DEFAULT_STARTERS } from '../src/data/species';

const mkMeta = (): Meta => ({
  unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(),
  coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
});

describe('Prehistoric forms', () => {
  it('change parts the same way at every stage, and change something for most lines', () => {
    let changed = 0;
    for (const sp of SPECIES) {
      const fam = familyPlan(sp.id, sp.types) as Family;
      const before = [0, 1, 2].map((s) => ({ ...(stagePlan(sp.id, s, fam, sp.types) as StagePlan) }));
      const runs = [0, 1].map(() => before.map((p) => {
        const P = { ...p };
        const F = { ...fam };
        prehistoricPlan(sp.id, P, F);
        return JSON.stringify([P, F]);
      }));
      expect(runs[0]).toEqual(runs[1]); // seeded
      if (runs[0].some((x, s) => x !== JSON.stringify([before[s], fam]))) changed++;
    }
    expect(changed / SPECIES.length).toBeGreaterThan(0.7);
  });

  it('turn up in the wild about 1 in PREHISTORIC_IN, and stay Prehistoric when caught', () => {
    const meta = mkMeta();
    let pre = 0;
    let total = 0;
    let caught: ReturnType<typeof createCreature> | null = null;
    for (let seed = 1; seed <= 400; seed++) {
      const run = startRun(meta, 'emberkit', seed);
      const node = Object.values(run.map.nodes).find((n) => n.kind === 'battle')!;
      for (const e of makeEncounter(run, node)) {
        total++;
        if (e.ancient) {
          pre++;
          if (!caught) caught = catchCreature(run, e)?.c ?? null;
        }
      }
    }
    expect(pre).toBeGreaterThan(0);
    expect(pre / total).toBeLessThan(4 / PREHISTORIC_IN);
    expect(caught?.ancient).toBe(true);
    expect(meta.ancientFound).toContain(caught!.speciesId);
  });

  it('Gilded colours win over Prehistoric', () => {
    expect(colours({ shiny: true, ancient: true })).toBe(true);
    expect(colours({ ancient: true, alt: true })).toBe('ancient');
  });
});

describe('Looks in the team builder and on the starter screen', () => {
  it('only unlocked looks can be picked, one at a time, and they carry into battle', async () => {
    const { pickLooks, withLook, validArenaTeam, makeArenaCreature, lookOf } = await import('../src/logic/arena');
    const meta = mkMeta();
    meta.dex.caught.push('emberkit');
    expect(pickLooks(meta, 'emberkit')).toEqual(['normal']);
    meta.ancientFound = ['emberkit'];
    meta.shinyOwned = ['emberkit'];
    expect(pickLooks(meta, 'emberkit')).toEqual(['normal', 'gilded', 'prehistoric']);
    const p = withLook(withLook({ speciesId: 'emberkit', stage: 0, moves: [] as string[] }, 'gilded'), 'prehistoric');
    expect(lookOf(p)).toBe('prehistoric');
    expect(p.shiny).toBeUndefined();
    expect(makeArenaCreature(p).ancient).toBe(true);
    expect(lookOf(validArenaTeam(meta, [p])[0])).toBe('prehistoric');
    meta.ancientFound = [];
    expect(lookOf(validArenaTeam(meta, [p])[0])).toBe('normal');
  });

  it('a starter starts in the look picked for it, if unlocked', async () => {
    const { setStarterLook, starterLook } = await import('../src/logic/run');
    const meta = mkMeta();
    meta.shinyOwned = ['emberkit'];
    expect(starterLook(meta, 'emberkit')).toBe('gilded');
    expect(startRun(meta, 'emberkit', 3).team[0].shiny).toBe(true);
    setStarterLook(meta, 'emberkit', 'prehistoric');
    expect(starterLook(meta, 'emberkit')).toBe('gilded'); // not found yet
    meta.ancientFound = ['emberkit'];
    const c = startRun(meta, 'emberkit', 3).team[0];
    expect(c.ancient).toBe(true);
    expect(c.shiny).toBeUndefined();
  });
});
