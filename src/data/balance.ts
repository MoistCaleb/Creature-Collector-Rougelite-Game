/** Central tuning knobs. Run `npx vite-node scripts/simulate.ts` after changing these. */
export const BALANCE = {
  starterLevel: 5,
  /** Damage = power x (atk/def) x levelFactor x this. */
  damageScale: 0.45,
  /** Fraction of max HP survivors recover after winning a battle. */
  /** Chance a won wild battle drops an Evolution Stone, by floor. */
  stoneDropChance: [0.03, 0.04, 0.05],
  /** Chance a trainer (elite) pays out an Evolution Stone (Stone Hunter: always, plus this chance of a second). */
  eliteStoneChance: 0.5,
  postBattleHeal: 0.4,
  /** Iron Will passive's post-battle recovery instead. */
  ironWillHeal: 0.7,
  /** Fraction of max HP a caught creature joins with. */
  catchHp: 0.4,
  /** Enemy level = floorBase + progress x floorRamp (+ small random). */
  floorBaseLevel: [1, 30, 63],
  floorRamp: [22, 30, 32],
  /** >1 keeps early nodes of each floor gentle and ramps up later. */
  rampCurve: 1.2,
  /** Floor boss levels (the lead creature is +2). */
  bossLevel: [25, 63, 96],
  /** Highest level your creatures can reach on each floor (XP past it is stored for the next floor). */
  floorLevelCap: [45, 75, 105],
  /** Whether each floor boss's lead creature is one evolution ahead. */
  bossLeadEvolves: [false, true, true],
  eliteLevelBonus: 1,
  /** Per floor: each defeated enemy is worth this many of ITS OWN level-ups in XP (steady pacing at any level). */
  xpYield: [3.2, 1.1, 1.4],
  /** XP to next level = 10 + level x xpPerLevelNeeded + level² x xpQuad. */
  xpPerLevelNeeded: 5,
  xpQuad: 0.08,
  benchXpShare: 0.5,
  /**
   * Coins for XP earned at the level cap, per level's worth of that XP (so it stays modest at any
   * level): while it's being stored, and once the store is full.
   */
  capCoinsPerLevel: 1,
  fullBankCoinsPerLevel: 2,
  /** XP share for team members who didn't fight. */
  sideXpShare: 0.5,
  catchUpPerLevel: 0.08,
  catchUpMax: 2,
  coinsBase: 10,
  coinsPerEnemyLevel: 0.35,
  /** Level Up node: levels for Focus (one creature) and Team drills (everyone), per floor. */
  levelUpFocus: [6, 9, 12],
  levelUpTeam: [3, 4, 5],
  /** Catch-up camp raises creatures to within this many levels of your strongest. */
  levelUpCatchUpGap: 5,
  /** Trainer (elite) battles: no catching, but XP and coins are multiplied by these. */
  trainerXpMult: 3,
  trainerCoinMult: 3,
  /** Shop prices multiply by 1 + this x floor index. */
  shopFloorMarkup: 1.25,
};
