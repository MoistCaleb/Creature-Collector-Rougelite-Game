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
