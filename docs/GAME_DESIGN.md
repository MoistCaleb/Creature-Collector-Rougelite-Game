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
- Unlock by runs won: Wildlands and Verdant Hollow from the start, then one more map per win. Winning marks a map ✓.

## Run structure
- A run = **3 floors**. Clearing the boss of floor 3 = win.
- Each floor is a **hex-lattice map** climbed bottom → top:
  - Single start tile, boss at the top.
  - Pointy-top hexes in horizontal rows. You move to either hex **touching yours from the row
    above** (never sideways/back), so every move climbs exactly one row.
  - **Every route to the boss is the same length** (25 / 29 / 32 nodes on floors 1 / 2 / 3), so the
    choice is which nodes you visit, not how many. The top bar shows "Boss in N steps".
  - Floors get wider as you go (5 / 6 / 7 hexes per row) with more elites.
- Generated as a honeycomb: ~88% of the grid is filled, then pruned to cells that are reachable and
  lead to the boss. Most nodes offer 2 moves (≥1.55 on average), with gaps that split lanes.
- Bare-bones first version: colored hexes with icons/letters.

### Node types (draft)
| Node | Effect |
|---|---|
| Battle | Wild trainer/creature fight. Win → rewards **or** catch |
| Trainer | Named trainer's team. No catching; ×3 XP, ×4 coins and an Evolution Stone |
| Level Up | Focus: one creature +6/+9/+12 levels (by floor) · Team drills: everyone incl. bench +3/+4/+5 · Catch-up camp: raise everyone to within 5 levels of your strongest |
| Prestige (star) | Prestige a creature |
| Skill | Choose 1 of 3 skill buffs |
| Heal | Restore HP |
| Treasure | Item |
| Shop | Spend coins: 5 random items, reroll for a rising fee. At least one per floor |
| Treasure | Choose: coins or a free item |
| Event (?) | One of 10 risk/reward events (Blood Bargain, Mysterious Egg, Gambler, Training Dummy, Ancient Tome, Healing Spring, Ambush, Shrine of Fate, Lost Hatchling, Cursed Idol) |
| Boss | End of floor: a named guardian with a special battle rule (see Bosses) |

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
- In wild battles the **last** wild creature can't faint: any damage that would knock it out leaves it
  at **1 HP** and ends the battle (earlier wild creatures in a 2-creature fight faint normally).
  The move buttons then become the choice:
  - **Continue** — finish it off and take the rewards (XP, coins), or
  - **Catch it** — forfeit all rewards; it joins **at its own level and evolution, with its moves**, at 40% HP
    (bond crystal animation). Scout passive: +3 levels, within the level cap.
- Trainers' and bosses' creatures always faint and can't be caught.
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

### Bosses
Each floor's guardian is chosen by the floor's element. Its team is all that element, and its ace
pairs it with a partner element. Every boss has one rule, shown on an intro card and on screen
during the fight:

| Element | Boss | Rule |
|---|---|---|
| Fire | Ignis, the Kiln Warden | Scorched Ground: your active creature takes 1/16 HP each turn unless Fire type |
| Frost | Hela, Queen of the Whiteout | Whiteout: your creatures enter with -1 Speed |
| Nature | Bramble, the Thornmother | Thornwall: hitting her creatures hurts you for 15% of the damage |
| Earth | Gorran, the Unmoved | Bulwark: his creatures enter with +1 Defense |
| Storm | Volta, the Living Gale | Tailwind: she always moves first unless you use a priority move |
| Water | Maren, Keeper of the Undertow | Riptide: creatures you send in take 1/8 HP (never fatal) |
| Metal | Forge, the Iron Engine | Overclock: his active creature gains +1 Attack every turn |
| Toxic | Morva, the Plague Bloom | Miasma: your creatures are poisoned on entry |
| Shadow | Nyx, the Eclipse | Dread: your creatures enter with -1 Attack |
| Light | Solenne, the Radiant | Sanctuary: her active creature heals 1/12 HP every turn |
| Spirit | Wraithe, the Hollow King | Death Curse: each of his fainting creatures hits your active one for 1/5 HP |
| Dragon | Vharos, the Last Wyrm | Dragon's Pride: his ace enters with +1 Attack and +1 Speed |

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
- **Coins** are per-run. Earned from battles (10 + 0.8 x enemy level each; trainers x4, bosses x3).
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

## Level curve (target)
- Level caps: 30 / 65 / 100 by evolution stage, +5 per ★.
- Floors are ~25-35 nodes per route. Enemy levels ease in then ramp: floor 1 ~1-23 (boss 25),
  floor 2 ~30-60 (boss 63), floor 3 ~63-95 (final boss 96-98). Teams reach ~100 by the final boss.
- XP per enemy = (3.2 / 1.1 / 1.4 by floor) x that enemy's own level-up cost. Floor 1 is generous so
  teams reach its boss at or above its level even with a few skipped fights. Creatures that
  fought get full XP; teammates who sat out and the bench get 50%. Catch-up bonus: +8% per level
  behind the top creature, capped at x2.

## Meta progression (between runs)
Runs unlock:
- New starters: any species that joins your party (caught, claimed, recruited, hatched) unlocks as a
  starter immediately, even if the run is lost
- New maps (one per run won)
- Trainer passives — unlocked by **achievements** with lifetime progress (won or lost runs);
  **only 1 can be equipped** per run:
  | Achievement | Goal | Passive |
  |---|---|---|
  | — | — | Mentor: bench earns full XP (default) |
  | First Aid | Rest at 10 Rest nodes | Field Medic: Rest heals fully |
  | Collector | Catch 10 creatures | Scout: caught creatures arrive 3 levels higher |
  | Veteran | Win 50 battles | Drill Sergeant: +10% damage |
  | Big Spender | Spend 500 coins | Haggler: 25% off shops |
  | Metamorphosis | Evolve 5 creatures | Evolutionist: start with an Evolution Stone |
  | Wanderer | Resolve 20 events | Explorer: treasure +50% coins |
  | Champion | Win a run | Champion: starter begins at Lv 10 |
  | Prospector | Earn 2,000 coins | Coin Purse: start with ◉50 |
  | Drill Master | Train at 15 Level Up nodes | Personal Trainer: Level Up nodes give 50% more levels |
  | Scholar | Upgrade 15 moves | Sage: Skill Shrines offer 4 choices |
  | Ascension | Earn 10 prestige stars | Ascendant: Prestige Altars need no sacrifice |
  | Second Wind | Survive 3 team wipes | Bodyguard: bench steps in fully healed |
  | Trainer Hunter | Defeat 10 trainers | Big Game Hunter: trainers drop 2 stones |
  | Naturalist | Catch 40 different species | Naturalist: +25% XP from wild battles |
  | Guardian Slayer | Defeat 15 floor bosses | Iron Will: survivors recover 70% after wins (normally 40%) |
  | Treasure Hunter | Open 15 treasure chests | Lucky Charm: coin-flip events succeed 75% |
  | Chemist | Use 15 potions | Apothecary: 2 starting potions, carry 8, they heal 75% |
  | Outfitter | Give your creatures 10 held items | Quartermaster: start with two held items |
  | Hexer | Inflict 30 status conditions | Afflicter: your moves inflict statuses twice as often |
  | Trial by Fire | Win a run at Heat 2 | Tempered: your creatures can't be burned or poisoned |
  | In Tune | Win 25 battles with a synergy active | Harmonist: team synergy bonuses doubled |

## Battle systems (later additions)

- **Status conditions** (one per creature; cleared on switching out or at battle end). Moves named for a
  condition can inflict it (Spark → paralysis, Acid Spit → poison...): attacks 10–20%, debuff moves 40%.
  | Status | Effect | Immune |
  |---|---|---|
  | Burn | −1/12 HP per turn, deals 20% less damage, 4 turns | Fire |
  | Poison | −1/8 HP per turn, 4 turns | Toxic, Metal |
  | Paralysis | half speed, 25% chance to lose the turn, 3–4 turns | Storm |
  | Freeze | can't act; 30% thaw chance per turn, 1–3 turns; a Fire hit thaws | Frost, Fire |
  | Sleep | can't act for 1–3 turns | — |
  | Confusion | 33% chance to hit itself for 1/10 HP instead, 2–4 turns | — |
- **Team synergy**: 2/3/4 creatures sharing an element on the main team give the whole team +6/12/18% to
  that element's stat (ATK: Fire, Dragon, Toxic, Shadow · DEF: Earth, Metal, Frost, Water · SPD: Storm,
  Light, Spirit, Nature). Player side only.
- **Potions** are carried (5, or 8 with Apothecary) and used from the battle screen (costs the turn) or the
  Team screen.
- **Evolution Stones** also drop from won wild battles: 5% / 7% / 9% by floor.

## Open questions
