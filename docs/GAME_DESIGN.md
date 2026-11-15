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
| Shop | Spend run currency |
| Event (?) | Random risk/reward |
| Boss | End of floor |

## Team
- **Start:** pick 1 starter from 3 random choices (from your unlocked starter pool).
- **Main team:** up to 4 creatures.
- **Bench:** up to 3 backups.
  - Can be swapped with the main team **before a battle**.
  - Act as a **second life**: if the whole main team dies, the bench steps in.
- **Permadeath:** a creature that faints is gone for the run.

### Catching
- After winning a battle against a wild creature you choose:
  - **Take the rewards** (XP, currency, items), or
  - **Catch it** — forfeit all rewards, gain a **raw level 1** copy of that creature.

## Battle
- **1v1 with swapping**, turn-based.
- Each creature has **2 types** (can be the same, e.g. Fire/Fire).
- Type advantages apply (see Types).

## Creature growth
| Upgrade | Power | Notes |
|---|---|---|
| Evolve | Largest | New form/sprite, big stat jump, new passive/skill slot |
| Prestige | 2nd largest | Multiplicative stat boost per star, raises level cap |
| Level Up | Small | Flat stat buff |
| Skill Buff | Sideways | Upgrades a skill's tier (numbers → added effect) |

### Boss reward (after each floor boss), choose 1
- Full team heal
- Full team prestige
- Single creature evolution

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

## Meta progression (between runs)
Runs unlock:
- New starters (added to the starter pool)
- New maps (each favoring different elements)
- Trainer upgrades — **only 1 can be equipped** as your trainer passive per run.

## Open questions
- **[OPEN]** Caught creatures are level 1: how do they catch up late in a run? (Bench/team XP share? Level scales to floor on evolution?)
- **[OPEN]** Second life: does the bench enter mid-battle, or only after a wipe ends the battle?
- **[OPEN]** Does swapping during battle cost your turn?
- **[OPEN]** How are moves defined — fixed per species, or learned/chosen?
- **[OPEN]** Run currency + what shops sell.
- **[OPEN]** Final type list and chart.
