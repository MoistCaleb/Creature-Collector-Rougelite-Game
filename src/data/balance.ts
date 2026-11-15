/** Central tuning knobs. Run `npx vite-node scripts/simulate.ts` after changing these. */
export const BALANCE = {
  starterLevel: 5,
  /** Damage = power x (atk/def) x levelFactor x this. */
  damageScale: 0.45,
  /** Fraction of max HP survivors recover after winning a battle. */
  postBattleHeal: 0.3,
  /** Enemy level = floorBase + progress x floorRamp (+ small random). */
  floorBaseLevel: [1, 10, 19],
  floorRamp: [6, 7, 7],
  bossLevelBonus: [5, 7, 8],
  eliteLevelBonus: 1,
  xpPerEnemyLevel: 15,
  benchXpShare: 0.5,
};
