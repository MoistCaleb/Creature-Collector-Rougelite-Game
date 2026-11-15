/** Central tuning knobs. Run `npx vite-node scripts/simulate.ts` after changing these. */
export const BALANCE = {
  starterLevel: 5,
  /** Damage = power x (atk/def) x levelFactor x this. */
  damageScale: 0.45,
  /** Fraction of max HP survivors recover after winning a battle. */
  postBattleHeal: 0.7,
  /** Enemy level = floorBase + progress x floorRamp (+ small random). */
  floorBaseLevel: [1, 30, 63],
  floorRamp: [22, 30, 32],
  /** >1 keeps early nodes of each floor gentle and ramps up later. */
  rampCurve: 1.2,
  /** Floor boss levels (the lead creature is +2). */
  bossLevel: [25, 63, 96],
  /** Whether each floor boss's lead creature is one evolution ahead. */
  bossLeadEvolves: [false, true, true],
  eliteLevelBonus: 1,
  /** Per floor: each defeated enemy is worth this many of ITS OWN level-ups in XP (steady pacing at any level). */
  xpYield: [3.2, 1.1, 1.4],
  /** XP to next level = 10 + level x xpPerLevelNeeded + level² x xpQuad. */
  xpPerLevelNeeded: 5,
  xpQuad: 0.08,
  benchXpShare: 0.5,
  /** XP share for team members who didn't fight. */
  sideXpShare: 0.5,
  catchUpPerLevel: 0.08,
  catchUpMax: 2,
  coinsBase: 10,
  coinsPerEnemyLevel: 0.8,
  /** Level Up node: levels for Focus (one creature) and Team drills (everyone), per floor. */
  levelUpFocus: [6, 9, 12],
  levelUpTeam: [3, 4, 5],
  /** Catch-up camp raises creatures to within this many levels of your strongest. */
  levelUpCatchUpGap: 5,
  /** Shop prices multiply by 1 + this x floor index. */
  shopFloorMarkup: 1.0,
};
