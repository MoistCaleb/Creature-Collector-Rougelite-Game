import { describe, expect, it } from 'vitest';
import { DEFAULT_STARTERS } from '../src/data/species';
import { emptyStats } from '../src/logic/achievements';
import { buyCampItem, camp, CAMP_ITEM } from '../src/logic/camp';
import { emptyDex } from '../src/logic/dex';
import {
  GILDED_FIRE,
  GILDED_FIRE_EMBERS,
  GILDED_STARTER_IN,
  gildedStarterOffer,
  hasGildedStarters,
  HUNT_DECOR,
  HUNT_MILESTONES,
  huntMilestoneAt,
  nextHuntMilestone,
  payHuntMilestones,
  takeHuntNews,
} from '../src/logic/huntMilestones';
import { noteHunt, type Meta } from '../src/logic/run';
import { hasTitle, TITLE_BY_NAME, takeNewTitles } from '../src/logic/titles';

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

describe('Gilded Hunt milestones (2.0)', () => {
  it('follow the plan: 3, 5, 7, 10, then 12, 15, ... with escalating embers', () => {
    expect(HUNT_MILESTONES.slice(0, 4).map((m) => m.floor)).toEqual([3, 5, 7, 10]);
    expect(huntMilestoneAt(3)?.embers).toBe(25);
    expect(huntMilestoneAt(5)?.fire).toBe(true);
    expect(huntMilestoneAt(7)?.gildedStarter).toBe(true);
    expect(huntMilestoneAt(10)).toMatchObject({ embers: 100, decor: HUNT_DECOR });
    const late = HUNT_MILESTONES.filter((m) => m.floor >= 12);
    for (let i = 1; i < late.length; i++) {
      expect(late[i].floor - late[i - 1].floor).toBe(3);
      expect(late[i].embers!).toBeGreaterThan(late[i - 1].embers!);
    }
    // Past the list: every 3 floors, forever.
    expect(huntMilestoneAt(33)?.embers).toBeGreaterThan(0);
    expect(huntMilestoneAt(34)).toBeNull();
    expect(huntMilestoneAt(4)).toBeNull();
    // Every milestone title exists and is earned from the hunt.
    for (const m of HUNT_MILESTONES) if (m.title) expect(TITLE_BY_NAME[m.title]?.gilded, m.title).toBe(true);
    expect(CAMP_ITEM[HUNT_DECOR]?.reward).toBe(true);
  });

  it('pay once each, as you reach new deepest floors', () => {
    const meta = mkMeta();
    noteHunt(meta, 2, 0);
    expect(camp(meta).embers).toBe(0);
    noteHunt(meta, 3, 0);
    expect(camp(meta).embers).toBe(25);
    noteHunt(meta, 3, 2); // same floor, higher Heat: nothing new
    noteHunt(meta, 2, 0);
    expect(camp(meta).embers).toBe(25);
    noteHunt(meta, 5, 0);
    expect(camp(meta).owned).toContain(GILDED_FIRE);
    expect(camp(meta).fire).toBe(GILDED_FIRE);
    expect(hasTitle(meta, TITLE_BY_NAME['Deep Diver'])).toBe(true);
    expect(takeHuntNews(meta).map((n) => n.floor)).toEqual([3, 5]);
    expect(takeHuntNews(meta)).toEqual([]);
    expect(nextHuntMilestone(meta).floor).toBe(7);
    expect(hasGildedStarters(meta)).toBe(false);
    noteHunt(meta, 7, 0);
    expect(hasGildedStarters(meta)).toBe(true);
    noteHunt(meta, 10, 0);
    expect(camp(meta).embers).toBe(125);
    expect(camp(meta).owned).toContain(HUNT_DECOR);
    expect(payHuntMilestones(meta)).toEqual([]);
  });

  it('a save that went deep before 2.0 is paid everything up to its best, once', () => {
    const meta = mkMeta();
    meta.bestHunt = 12;
    camp(meta).owned.push(GILDED_FIRE); // bought at the Ember stall already
    const paid = payHuntMilestones(meta);
    expect(paid.map((p) => p.floor)).toEqual([3, 5, 7, 10, 12]);
    expect(camp(meta).embers).toBe(25 + GILDED_FIRE_EMBERS + 100 + 150);
    expect(camp(meta).owned.filter((id) => id === GILDED_FIRE).length).toBe(1);
    expect(payHuntMilestones(meta)).toEqual([]);
    // Hunt titles are announced with the milestone, not on their own.
    expect(takeNewTitles(meta).map((t) => t.name)).not.toContain('Hunt Master');
    expect(hasTitle(meta, TITLE_BY_NAME['Hunt Master'])).toBe(true);
  });

  it("the totem can't be bought, and the Gilded starter offer comes now and then, for lines not owned Gilded", () => {
    const meta = mkMeta();
    camp(meta).embers = 999;
    expect(buyCampItem(meta, HUNT_DECOR)).toBe('Not for sale.');
    const choices = DEFAULT_STARTERS.slice(0, 3);
    expect(gildedStarterOffer(meta, choices)).toBeNull();
    meta.bestHunt = 7;
    payHuntMilestones(meta);
    let offers = 0;
    for (let r = 0; r < 500; r++) {
      meta.runs = r;
      const id = gildedStarterOffer(meta, choices);
      if (id) {
        offers++;
        expect(choices).toContain(id);
      }
      // The same pick always offers the same (leaving and coming back doesn't reroll it).
      expect(gildedStarterOffer(meta, choices)).toBe(id);
    }
    expect(offers).toBeGreaterThan(500 / GILDED_STARTER_IN / 2);
    expect(offers).toBeLessThan((500 / GILDED_STARTER_IN) * 2);
    meta.shinyOwned = [...choices];
    for (let r = 0; r < 50; r++) {
      meta.runs = r;
      expect(gildedStarterOffer(meta, choices)).toBeNull();
    }
  });
});
