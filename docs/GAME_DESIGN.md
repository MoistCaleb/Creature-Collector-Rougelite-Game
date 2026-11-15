# Game Design — Creature Collector Roguelite

Working doc. Items marked **[OPEN]** still need a decision.

## Platform
- TypeScript + Phaser, runs in a mobile browser (portrait, one-thumb tap controls).
- Can be wrapped for app stores later (Capacitor).
- Art: procedural pixel creatures generated from parts (body, head, limbs, palette by type).

## Run structure
- A run = **3 floors**. Clearing the boss of floor 3 = win.
- Each floor is a **hex-lattice map** climbed bottom → top:
  - Single start tile, boss at the top.
  - You may move to any hex **connected above** your current one (never sideways/back).
  - One path per floor, but branching choices at every step.
  - Floors get wider/denser as you go (floor 1 narrow, floor 3 wide with more elites).
- Generated as a honeycomb: most of a 5/6/7-column grid is filled, then pruned to cells that are
  reachable and lead to the boss. Every node branches ~2 ways on average, with gaps that split lanes.
- Bare-bones first version: colored hexes with icons/letters.

### Node types (draft)
| Node | Effect |
|---|---|
| Battle | Wild trainer/creature fight. Win → rewards **or** catch |
| Elite | Harder fight, better rewards (evolution items) |
| Level Up | Level up a creature |
| Prestige (star) | Prestige a creature |
| Skill | Choose 1 of 3 skill buffs |
| Heal | Restore HP |
| Treasure | Item |
| Shop | Spend coins: 5 random items, reroll for a rising fee. At least one per floor |
| Event (?) | Random risk/reward |
| Boss | End of floor |

## Team
- **Start:** pick 1 starter from 3 random choices (from your unlocked starter pool).
- **Main team:** up to 4 creatures.
- **Bench:** up to 3 backups.
  - Can be swapped with the main team **before a battle**.
  - Act as a **second life**: if the whole main team dies, you lose that battle
    (no rewards) and the bench becomes your team (max 3 creatures, no bench left).
- **Permadeath:** a creature that faints is gone for the run.

### Early fairness (floor 1)
- First battle of a run: the matchup with your lead creature is neutral both ways. For the few dual types
  with no neutral opponent in the roster, it falls back to an enemy with no advantage over you.
- Other battles in the first ~third of floor 1: enemies never have a type advantage over your lead.

### Catching
- After winning a battle against a wild creature you choose:
  - **Take the rewards** (XP, currency, items), or
  - **Catch it** — forfeit all rewards, gain a **raw level 1** copy of that creature.
- **First catch:** the first time you ever catch a species (tracked in the Dex) it arrives with a free ★.
- **After the Dex is complete:** the bonus goes per element, per run. A catch earns ★ if at least one of its
  elements hasn't earned it yet this run, and uses up whichever of its elements were new. E.g. Fire/Water
  earns it (uses Fire + Water); then Water/Earth still earns it for Earth; then Fire/Earth does not.
  Resets every run. Starters don't use up elements.
- **Catch-up XP:** XP bonus scales with the level gap to your highest-level creature,
  so it's fast when far behind and tapers off as the gap closes.
  Draft: XP multiplier = 1 + 0.25 × (highest level − this creature's level).
- **Bench XP:** benched creatures earn a share of battle XP.

## Battle
- **1v1 with swapping**, turn-based. Switching uses your turn (the incoming creature takes the hit).
- **Moves:** each element has 4 attacks plus a stat-boost move and a stat-lowering move.
  Species learn from their two types at set levels; with 4 moves known, you choose what to forget (or skip).
  A creature can never know the same move twice. Evolving upgrades each attack to the next rank it doesn't know.
- **Stat stages:** ATK/DEF/SPD from -4 to +4 (±25% per stage), reset on switch.
- Survivors recover 30% HP after a win (tunable in `src/data/balance.ts`).
- Each creature has **2 types** (can be the same, e.g. Fire/Fire).
- Type advantages apply (see Types).

## Creature growth
| Upgrade | Power | Notes |
|---|---|---|
| Evolve | Largest | New form/sprite, big stat jump, new passive/skill slot |
| Prestige | 2nd largest | Multiplicative stat boost per star, raises level cap. At star nodes, costs a sacrificed bench creature sharing a type (weakens your second life) |
| Level Up | Small | Flat stat buff |
| Skill Buff | Sideways | Upgrades a skill's tier (numbers → added effect) |

### Boss reward (after each floor boss), choose 1
- Full heal (team + bench)
- Full team prestige
- Single creature evolution
- Claim a guardian: one of the boss's most-evolved creatures joins at Lv 1, keeping its form and level cap

### Floor 1 approach
- The row before the floor 1 boss is all shops (every route passes one), always stocking Potion + Full Restore.
  Floor 1's rests move one row down. Later floors keep a rest row before the boss.

## Types
- Biomes favor elements: fire lands spawn mostly Fire-type creatures, etc.
- Each creature has 2 type slots; same-type pairs (Fire/Fire) are "pure".

Draft chart (6 types, each strong vs 2, weak vs 2, neutral vs 1):

| Attacker → strong vs | |
|---|---|
| Fire | Frost, Nature |
| Frost | Nature, Earth |
| Nature | Earth, Storm |
| Earth | Storm, Water |
| Storm | Water, Fire |
| Water | Fire, Frost |

Proposed math:
- Super effective ×1.5, resisted ×0.67, per defending type → dual weakness = ×2.25.
- Pure types count their type once (no ×2.25 weakness possible) but get a bigger same-type-attack bonus.

## Coins & shops
- **Coins** are per-run. Earned from battles (6 + 2 x enemy level each; elites x2, bosses x3).
  Catching forfeits coins along with XP.
- **Shop stock** (5 of): Potion, Full Restore, Training Manual (+2 lv), Skill Scroll (+1 tier),
  Evolution Stone, Prestige Sigil (no sacrifice), Recruit (biome creature at ~60% of your top level;
  name hidden unless it's in your Dex). Items apply on purchase.
- Prices scale +100% per floor. **Haggler** passive (-25%) unlocks after spending 500 coins total.

## Creature Dex
- Persistent across runs: forms seen (per evolution stage), moves seen, elements seen.
- Evolutions show as ??? until you've seen that form (starter cards, team screen, dex).
- Elements tab reveals matchups once encountered.

## Meta progression (between runs)
Runs unlock:
- New starters (added to the starter pool)
- New maps (each favoring different elements)
- Trainer upgrades — **only 1 can be equipped** as your trainer passive per run.

## Open questions
- **[OPEN]** Multiple maps to choose between (biomes are currently random per floor).
- **[OPEN]** Final type list and chart.
