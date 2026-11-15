# Game Design — Creature Collector Roguelite

Working doc. Items marked **[OPEN]** still need a decision.

## Platform
- TypeScript + Phaser, runs in a mobile browser (portrait, one-thumb tap controls).
- Can be wrapped for app stores later (Capacitor).
- Art: procedural pixel creatures generated from parts (body, head, limbs, palette by type).

## Saving
- The run in progress saves after every map step, battle turn and choice (localStorage).
- "Continue run" resumes exactly: mid-battle with current HP, open shops, unresolved node choices, events
  and treasure (contents are fixed once rolled, so reloading can't re-roll them).

## Maps
- Picked before the starter. Each map fixes the element of floors 1-3:
  Wildlands (random), Verdant Hollow (Nature/Toxic/Earth), Tidal Depths (Water/Frost/Storm),
  Volcanic Rift (Fire/Earth/Dragon), Ironworks (Metal/Storm/Fire), Haunted Spires (Shadow/Spirit/Toxic),
  Frozen Wastes (Frost/Spirit/Water), Celestial Peaks (Light/Storm/Dragon).
- Unlock by total floor bosses defeated across runs (0, 0, 2, 4, 7, 10, 14, 19). Winning marks a map ✓.

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
| Treasure | Choose: coins or a free item |
| Event (?) | One of 10 risk/reward events (Blood Bargain, Mysterious Egg, Gambler, Training Dummy, Ancient Tome, Healing Spring, Ambush, Shrine of Fate, Lost Hatchling, Cursed Idol) |
| Boss | End of floor |

## Team
- **Start:** pick 1 starter from 3 random choices (from your unlocked starter pool).
- **Main team:** up to 4 creatures.
- **Bench:** up to 3 backups.
  - Can be swapped with the main team **before a battle**.
  - Act as a **second life**: if the whole main team dies, you lose that battle
    (no rewards) and the bench becomes your team (max 3 creatures, no bench left).
- **Permadeath:** a creature that faints is gone for the run.

### First battle fairness
- First battle of a run: the matchup with your lead creature is neutral both ways. For the few dual types
  with no neutral opponent in the roster, it falls back to an enemy with no advantage over you.

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
- **Moves:** each element has a 10-move pool: a 4-rank attack line (upgraded on evolution), 3 special
  attacks (quick/first-strike, heavy+recoil, multi-hit, drain, stat-sapping, self-boosting), a stat boost,
  a stat drop, and a heal or second boost. Each family learns its own seeded mix of its elements' pools,
  plus a **signature move** (learned at Lv 11) whose effect matches its name: first-strike, finisher (x2 vs
  hurt targets), flurry, draining, all-out (lowers own DEF/SPD), best-of-your-types strike, fortify+heal,
  or a heavy curse.
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

12 elements. Each is strong against 3 and weak to 3. Light/Shadow and Spirit/Shadow are mutual rivalries
(both sides hit x1.5).

| Element | Strong against |
|---|---|
| Fire | Frost, Nature, Metal |
| Frost | Nature, Earth, Dragon |
| Nature | Water, Earth, Storm |
| Earth | Fire, Storm, Toxic |
| Storm | Water, Metal, Spirit |
| Water | Fire, Earth, Toxic |
| Metal | Frost, Light, Toxic |
| Toxic | Nature, Spirit, Dragon |
| Shadow | Spirit, Light, Water |
| Light | Shadow, Frost, Dragon |
| Spirit | Shadow, Metal, Light |
| Dragon | Fire, Storm, Shadow |

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

## Creatures & sprites
- 120 families (3 forms each): 4 pure families per element, 2-3 families for each of 22 thematic dual pairings,
  plus a few singles. Body types are hand-picked where the name suggests one.
- Procedural 40x40 pixel art from a parts library. Per family (kept across evolutions): locomotion
  (biped, quad, insect, floater, slime, serpent, avian; biased by element), eye count (1-4), pattern,
  tail, palette, and an element signature that grows each stage (flame crown, ice crystals, leaves,
  rock pauldrons, lightning antenna, fins, rivets/antenna, bubbles, smoke, halo, soul orbs, frills).
- Per stage (re-rolled at each evolution so silhouettes change): body shape, head shape, arms
  (claws, fists, blades, tentacles, pincers...), back (bat/feather/bug wings, spines, shell, mane, fins),
  head-top (ears, horns, antlers, unihorn, crest, crown) and mouth (fangs, tusks, jaw, mandibles, beak).
- Base forms are small with big round eyes; middle forms get brows and fangs; finals are biggest with
  glowing slit eyes and heavy jaws. See `docs/creature-sheet-1.png` to `-3.png` (regenerate via `npm run dev` →
  `/tools/sheet.html`).

## Meta progression (between runs)
Runs unlock:
- New starters (added to the starter pool)
- New maps (each favoring different elements)
- Trainer upgrades — **only 1 can be equipped** as your trainer passive per run.

## Open questions
