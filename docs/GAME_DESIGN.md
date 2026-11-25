# Game Design — Hexbound

The game is **Hexbound**; its creatures are **Hexlings** (player-facing text always says Hexling; code
still says `creature`).

Working doc. Items marked **[OPEN]** still need a decision.

## Platform
- TypeScript + Phaser, runs in a mobile browser (portrait, one-thumb tap controls).
- Can be wrapped for app stores later (Capacitor).
- Art: procedural pixel creatures generated from parts (body, head, limbs, palette by type).

- **Landscape:** every screen has a sideways layout on an 800x450 board (upright is 450x800). Turning the
  phone swaps the board and the screen lays itself out again; battles resume where they were. Typical
  splits: battle field left with message, moves and controls in a right column; map between an info column
  and a team column; lists and grids get more columns.
- **Any screen shape:** the game measures the screen and its safe area (notch/Dynamic Island, rounded corners,
  home bar) and fills the whole screen: the layout sits as large as it fits inside the safe area, and the
  margins around it show the scene's background (battle scenery, map, menu), so there are no black bars.
  Sideways, the home bar strip is ignored so the layout gets the full height. Very unusual shapes (nearly
  square unfolded phones) stretch by up to 60% and are letterboxed beyond that.

## Saving
- The run in progress saves after every map step, battle turn and choice (localStorage).
- **Save transfer** (Settings): the whole save (progress plus the run in progress) as one text code,
  `HEXB1.<deflate, base64url>.<checksum>` (`HEXB0.` uncompressed where the browser can't compress). A cut-off
  or edited code is rejected by the checksum. Loading asks first (showing the code's runs, wins, catches and
  Gilded), replaces everything, waits for the cloud copy to save, then reloads. `logic/saveCode.ts`.
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
| Trainer | Named trainer's team. No catching; ×3 XP, ×3 coins, a held item and a 50% chance of an Evolution Stone |
| Level Up | Focus: one creature +6/+9/+12 levels (by floor) · Team drills: everyone incl. bench +3/+4/+5 |
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
- **Catches keep their prestige:** a wild creature keeps the ★ it had in battle (floor 2–3 wilds carry 1–5 ★),
  so catching on higher floors pays off.
- **First catch:** the first time you ever catch a species (tracked in the Hexlidex) it gets **+1 ★** on top (max 5).
- **After the Hexlidex is complete:** the +1 ★ bonus goes per element, per run. A catch earns ★ if at least one of its
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
| Metal | Forge, the Iron Engine | Overclock: his active creature gains +1 Attack every turn, up to +3 |
| Toxic | Morva, the Plague Bloom | Miasma: your creatures are poisoned on entry |
| Shadow | Nyx, the Eclipse | Dread: your creatures enter with -1 Attack |
| Light | Solenne, the Radiant | Sanctuary: her active creature heals 1/12 HP every turn |
| Spirit | Wraithe, the Hollow King | Death Curse: each of his fainting creatures hits your active one for 1/5 HP |
| Dragon | Vharos, the Last Wyrm | Dragon's Pride: his ace enters with +1 Attack and +1 Speed |

**Extra rules at higher Heat:** from Heat 4 a guardian brings one extra rule on top of its own, and at Heat 8
two. Extra rules are picked by the run's seed and floor (the same on reload) from every other rule, including
eight that no guardian has as its own. Each extra rule takes 2 levels off the guardian's team to compensate.

| Extra rule | Effect |
|---|---|
| Brittle Air | Your Hexlings lose 1 Defense whenever they enter battle |
| Thick Fog | Your moves are 15% less accurate |
| Keen Eye | Their moves never miss |
| Leech Field | Every turn your active Hexling loses 1/16 HP and theirs heals that much |
| Vengeance | When one of theirs faints, the next enters with +1 Attack |
| Static Field | Your Hexlings may be paralysed when they enter (35%) |
| Ironhide | Super-effective hits on them count ×1.25 per element instead of ×1.5 |
| Second Wind | Once each, their Hexlings heal 35% when they drop below a third of their HP |

The rule card shows every rule (an extra one is tagged HEAT), and the battle screen lists each rule's name and
short summary for the whole fight.

### Boss reward (after each floor boss), choose 1
- Full heal (team + bench)
- Full team prestige
- Single creature evolution
- Claim a guardian: one of the boss's most-evolved creatures joins at its level +5 (within its stage cap and
  the next floor's level cap), keeping its form

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
- **Coins** are per-run. Earned from battles (10 + 0.35 x enemy level each; trainers x3, bosses x3).
  Catching forfeits coins along with XP.
- **Shop stock** (5 of): Potion, Full Restore, Training Manual (+2 lv), Skill Scroll (+1 tier),
  Evolution Stone, Prestige Sigil (no sacrifice), Recruit (biome creature at ~60% of your top level;
  name hidden unless it's in your Dex). Items apply on purchase.
- Prices scale +125% per floor. **Haggler** passive (-25%) unlocks after spending 500 coins total.

## Hexlidex
- Persistent across runs: forms seen (per evolution stage), moves seen, elements seen.
- Seen but never caught: the line's forms are drawn grayed out with "○ Seen" (the card says "Seen · not caught
  yet"); once caught they show in full colour with "● Caught". Seen-only forms show just their name, form
  and cry: stats appear once you've caught the line, and only caught lines can be favourites.
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
- Level caps: 30 / 65 / 100 by evolution stage, +5 per ★. Evolving needs Lv 30 (first) / Lv 65 (second),
  whatever the cap (a floor ceiling or stars don't change it), including the boss's "Evolve one" boon.
- **Trainer tactics:** trainers (1 potion) and guardians (2 potions) drink a potion (heal 50%, cure status)
  when a creature is low or badly afflicted, switch out of super-effective matchups to a teammate that resists
  (not two switches close together), and after a faint send in the creature with the best matchup. Arena
  ladder trainers do the same from round 3.
- **Team moves:** every line learns its element's team move at Lv 26. Effects sit on your side for 5 turns
  (+1 per skill tier), whoever is out, so switching keeps them: Power Boost (Fire/Dragon, +25% damage), Shield
  Wall (Earth/Metal, -25% damage taken), Speed Boost (Storm/Spirit, +50% speed), Status Guard (Light/Frost,
  no status), Poison Coating (Toxic, hits poison 30%), Dodge Boost (Shadow, attacks on you miss 20% more).
  Team Heal (Nature/Water) instead heals the whole team 15% and cures statuses. 8 uses. Guardians from floor 2 use them too.
- **Move uses:** basic attacks (ranks 1-2 of the main line, quick/multi/sap/boost specials) are unlimited.
  Mid attacks, drain moves and signatures have 15 uses; top-rank and 100+ power attacks and heals 10; buffs and
  debuffs 20. Uses carry between battles. Restored fully at rest nodes, on a new floor and by Full Restore;
  bench creatures get 25% back after each battle. A creature with every move spent uses a basic attack of its
  own type. Enemies start each battle with full uses. Auto-battle saves limited attacks for super-effective
  hits or finishing blows.
- Enemy prestige: on floors 2 and 3, enemies carry stars matching your main team's average (wild: same or one
  less; trainers and guardians: same), at most 3 on floor 2 and 5 on floor 3. Caught creatures don't keep them.
- Enemy move choice: wild creatures pick a random move 50% of the time, trainers 10%, bosses never.
- Each floor also has a level ceiling (45 / 70 / 100) so you can't outgrow it; XP past the ceiling is stored
  and coins are paid as at the stage cap, and the stored XP pours in when the next floor opens.
- Healing from attacks is a small share of the damage dealt: drain moves 20%, Nature rank-3 15%, Water rank-3 15%.
- XP earned at the cap is stored (up to 5 levels' worth) and pours in as soon as the cap rises (evolve or prestige).
  Capped creatures also turn that XP into coins: 1 per level's worth while storing, 2 once the store is full.
- Floors are ~25-35 nodes per route. Enemy levels ease in then ramp: floor 1 ~1-23 (boss 25),
  floor 2 ~30-60 (boss 63), floor 3 ~63-95 (final boss 96-98). Teams reach ~100 by the final boss.
- XP per enemy = (3.2 / 1.1 / 1.4 by floor) x that enemy's own level-up cost. Floor 1 is generous so
  teams reach its boss at or above its level even with a few skipped fights. Creatures that
  fought get full XP; teammates who sat out and the bench get 50%. Catch-up bonus: +8% per level
  behind the top creature, capped at x2.

## Trainers
- **Your trainer:** tap the trainer button on the title screen (or "Your trainer" in Play online) to set your
  name and look. Every part is a tile that opens a grid showing your trainer wearing each option: skin, hair
  (12 styles), hair color, eyes, face (glasses, shades, eyepatch...), hat (18), hat color, top (13), top color,
  accent, bottoms (6), bottoms color, shoes and shoe color (18 clothing colors). Shuffle picks a random look.
  The name is used in battles and shown to your opponent online.
- **In battle:** your trainer stands bottom-left behind your creature, seen from behind; opponents (trainers,
  guardians, Arena ladder and online opponents) stand top-right facing you. Wild battles have no one there.
  Whenever a side uses a move or sends a creature out, its trainer raises an arm to give the order, then
  lowers it.
  Each battle message bounces the trainer of the side it's about ("Enemy …" or the foe's name: theirs; your
  creatures or team: yours; otherwise the side of the event it follows, e.g. "It's super effective!").
- **Built from the same parts:** NPC trainers get a look from their name (the same trainer always looks the
  same); each guardian has hand-picked parts in its element's colors. Online, each phone sends its look and
  shows the other player's.
- **Accuracy** is shown on every move: battle buttons (top-left corner), learn/forget pickers, shrines, the
  Team screen, the Dex and the Arena team builder.

## Backgrounds
- **Battles** take place in a pixel-art environment for the floor's element (outside a run: the opponent's
  lead creature's element), each with its own weather and a ground pad under each side:
  Fire volcano (embers), Frost snowy peaks (snow), Nature meadow (leaves), Earth mesas (dust), Storm crags
  (rain, lightning), Water beach (bubbles), Metal factory (sparks), Toxic swamp (spores), Shadow ruins at
  night (motes), Light sunlit temple (glints), Spirit graveyard under the moon (wisps), Dragon crimson peaks
  (ash). The controls sit on a shaded strip below (upright) or to the right (sideways).
- **Stage variants:** each battle picks a stage at random: time of day (day, dusk, night or fog, as fits the
  element), one of two prop sets and range shapes, which side the sun/moon is on, and a fresh layout. Two
  battles in a row in the same element never share a time of day. The stage is saved with the battle, so
  resuming or rotating the phone keeps it.
- **Map:** the land's element as a tinted glow with its emblem (flame, snowflake, leaf...) scattered
  across it, and its weather drifting faintly.
- **Menus:** a soft glow and honeycomb with big element-colored hexagons drifting up and rising sparks; the
  title screen adds a glowing arcade floor.

## Daily runs

- One run per day, the same for everyone: the same 3 starters, map (Wildlands, seeded by the date) and Heat 0.
- **A boon to start** (2.07): every daily opens with a boon offer, seeded, so everyone with that starter sees the same three.
  Play today's or any missed day from the calendar; your best result per day is kept.
- **Each starter comes with a passive that suits it** (your own equipped passive isn't used). Every element
  has three fitting passives, and a starter draws from its elements' lists, seeded by the date, with the
  three starters getting different passives:
  | Element | Passives |
  |---|---|
  | Fire | Drill Sergeant, Afflicter, Coin Purse |
  | Frost | Iron Will, Tempered, Bodyguard |
  | Nature | Field Medic, Naturalist, Harmonist |
  | Earth | Bodyguard, Iron Will, Personal Trainer |
  | Storm | Drill Sergeant, Afflicter, Lucky Charm |
  | Water | Apothecary, Field Medic, Iron Will |
  | Metal | Quartermaster, Haggler, Tempered |
  | Toxic | Afflicter, Tempered, Apothecary |
  | Shadow | Big Game Hunter, Afflicter, Lucky Charm |
  | Light | Field Medic, Sage, Explorer |
  | Spirit | Sage, Lucky Charm, Mentor |
  | Dragon | Champion, Evolutionist, Drill Sergeant |

## Map tokens

- Your trainer stands on the current hex (gold ring) and hops to the next one; your lead Hexling follows
  a beat behind and stands on the trailing side (remembered with the run, `run.followSide`).
- **Stage battles**: the other player's trainer and lead Hexling are shown grayed out with their name,
  hopping as they move. Each step sends `at` (node id) and `lead` with the race progress message.

## Weekly challenge

- One run a week (Monday to Sunday, UTC), the same for everyone: fixed seed, 3 starters with suited passives
  (as dailies), Heat 0, and a **twist**. Twists rotate weekly: **Element Duo** (two elements only: every
  floor, wild Hexling, trainer and starter), **Swarm** (every wild battle is two Hexlings), **Glass Cannon**
  (both sides deal +30% damage), **Lean Times** (half healing after battles, +50% coins), **Gilded Week**
  (1 wild Hexling in 15 is Gilded). From 2026-11-30 (2.07) four more join, using the 2.0 systems, in the order
  Duo, **Omen Week** (the whole run under an omen; Blood Moon, Golden Age, Wild Surge and Starfall take turns),
  Swarm, **Wild Skies** (every battle opens in weather, as on a Storm Front floor), Glass Cannon, **Elder Week**
  (every guardian is an Elder), Lean Times, **Boon Rush** (a rare boon offer to start, a Boon hex every floor),
  Gilded. Weeks before that keep the five-twist rotation, so past records keep their twist. From the Daily & weekly screen. Best result and attempts per week are kept
  (`meta.weeklies`); no Gilded Hunt after a weekly. The crown on the map bar shows the twist.

## Gilded milestones

- Owning Gilded species unlocks trainer rewards: **5** title *Gilded Seeker* + Gilded laurel (hat), **15**
  Gilded coat + Gilded boots, **30** *Gilded Collector* + Gilded crown, **60** *Gilded Legend* + the Gilded
  clothing color, **120** *Gilded Master* + Golden glow aura (gold outline and sparkles).
- Locked pieces show dimmed in the trainer editor with what unlocks them. NPC trainers and guardians never
  wear them. Reaching a milestone is announced on the map (and listed on the end screen); the first title is
  worn automatically. Titles show under your name on the title screen, in the trainer editor and in Records,
  and online they're sent with your hello and shown in your opponent's cut-in. The Hexlidex's gilded count
  opens the milestone list. `logic/gilded.ts`.

## Vibration

- Removed. iPhone Safari has no vibration API, and the iOS 18 haptic-switch workaround didn't produce any
  vibration on a real iPhone, so the feature (Android vibration included) was dropped.

## Gilded Hunt (endless)

- After winning a normal run (not a daily or a stage battle), the end screen offers **Gilded Hunt**: keep
  climbing with the same team through endless floors. The win is already counted (history, streaks, unlocks).
- The team is fully healed and restored to start. Each hunt floor has a random element and the last floor's
  map shape, shops and XP tables. The floor level ceiling is lifted, so your Hexlings can reach their own cap
  (up to Lv 125 with 5★).
- **Enemies out-scale you:** always final forms, starting around Lv 94 and climbing 8 levels a floor (trainers +3,
  guardians +8), past your cap from about the 4th hunt floor. They carry 2★ to start, one more every two
  floors, up to **6★** (one past yours).
- **Gilded Hexlings everywhere:** about 1 wild Hexling in 12, and 1 in 20 of trainers' and guardians' Hexlings (a
  claimed guardian keeps its colours).
- Guardians keep their rules (and Heat extras). Beating one takes you a floor deeper; the hunt ends when your
  team falls ("HUNT OVER"). Records keep the deepest hunt floor and the most gilded Hexlings caught in one hunt.

## Catching a gilded that fainted first

- The one exception to "only the last wild Hexling can be caught": in a two-Hexling wild battle, if the first
  one was gilded and fainted, the catch screen also offers **Catch ✦ [gilded]** (beside catching the second one).
  You catch one or the other, or finish for the rewards. This applies in every run, not only Gilded Hunt.

## Trainer and guardian intros

- Before a trainer or guardian battle, a manga-style cut-in plays: a paper page where slanted strips slash in
  from alternating sides, each a tight black-and-white close-up — the trainer's (or guardian's) face on top,
  then up to two of their Hexlings — split by sketchy, overshooting ink lines.
- Sprites are inked like a manga page: solid blacks, crosshatch and fine-line screen tones, white paper (tone
  cut-offs come from each sprite's own brightness; trainers are inked by hand: white skin, solid black eyes).
- "NAME" slams in over a brush slash of the floor's element color, with the trainer's role or the guardian's
  title and floor, then "Approaching..." (red for guardians) as the dots tick in. Guardians get a heavier hit
  sound and shake. Tap to skip. Then the strips slash away and the battle begins.
- Each strip slams in on its own beat (fast, slightly overshooting) and lands with a thud, a white impact flash,
  a punch-zoom on the face, ink splatter off its edge and a camera jolt. The page holds ~2.6s (guardians ~3s).
- Online duels and Battle Arena rounds open with it too: the opponent's trainer, name and Hexlings ("Online duel", or "Battle Arena · Round N of 5").
- **Guardian rule card** (before the fight): a hazard-striped "GUARDIAN RULE" header, the guardian's name and
  quote, then the rule in big red letters with a chip saying whether it HURTS YOUR HEXLINGS or POWERS UP THEIR
  HEXLINGS, a short summary (e.g. "−1 SPEED WHEN YOU SEND ONE IN") and the full description. It slams in with a
  shake; the rule box pulses red.

## Help, settings and records

- **Settings** (gear on the title screen, or Menu in a run or battle): music and sound-effect volume (0-10),
  all sound on/off, first-time tips, **reduce motion**, battle speed, How to play, the element chart,
  Save transfer, Credits & version, and Erase all progress (asks twice).
- **Reduce motion** turns off camera shakes and full-screen flashes everywhere, the cut-in strip flashes and
  punch zooms, the boss card's jolt, and slows the evolution flicker so it never strobes. It starts on when
  the device asks for reduced motion.
- **Credits & version** (also the version line on the title screen): who made it, the version and build,
  and the **What's new** list (`data/changelog.ts`). After an update, What's new pops up once.
- **Updates (installed app)**: the app checks `version.json` on launch, on returning to the app and every
  30 minutes; a newer build shows a "New version ready · Update" bar instead of reloading by itself.
- **First-time tips**: a short card the first time you reach the map, the bench, a battle, a guardian, a
  catch, a shop, an event and a Prestige Altar. "No more tips" turns them off; Settings turns them back on
  (and shows them all again).
- **How to play**: six short pages (goal, map, battles, catching, growing stronger, elements), from the title
  screen, Settings or the in-run menu.
- **Element chart**: every element's strong-vs and weak-to elements and its synergy stat. Opened from a battle,
  the foe's elements are highlighted. Also in the Hexlidex (Chart) and Settings.
- **Records** (title screen): runs, wins, win rate, current and best win streak, top Heat won, most-used
  Hexling, lifetime counts, and the last 20 finished runs (result, map, Heat, date, the team that finished).
  Stage battles don't count.

## Gilded Hexlings

(Called *shiny* in the code and save data: `shiny`, `shinyOwned`, `ui/shiny.ts`. Players only ever see "gilded".)

- About 1 wild Hexling in 200 is **gilded**: the same Hexling in rare colors (its palette turned around the color
  wheel, by a fixed amount per family). Only wild battles; trainers and guardians never are.
- **The reveal** (the first time a gilded foe appears): the field dims, gold light rays spin up behind it,
  rainbow rings and a fountain of stars burst out, it shimmers through the rainbow, a "✦ GILDED! ✦" banner
  slams in under it, and a chime cascade plays. The message reads "Whoa! It's a GILDED X!".
  Your own gilded Hexlings get a shorter reveal when sent out.
- **While it's out**: a pulsing gold glow and halo, rising rainbow glitter, a gold panel and name, and a
  pulsing "✦ GILDED ✦" tab on its panel.
- **Its attacks**: it flashes through the rainbow and sprays stars at its target, and its hits land with a
  gold ring, rainbow sparks and a bright ping on top of the move's usual effect.
- Keeps its colors when caught and when it evolves. Purely cosmetic.
- The Hexlidex marks families you've seen gilded and shows their gilded forms; Records counts gilded Hexlings caught.
- Rolled from a hash of the run seed (not the run's random rolls), so daily runs stay identical for everyone.
- **One gilded unlocks the whole line:** catching (or claiming) a gilded in any of its three forms unlocks every
  form of that species gilded. A gilded-unlocked species **starts runs gilded** (the starter card has a "✦ Gilded /
  ✦ Normal" switch, remembered per species) and parades gilded on the title screen.
- **In the Hexlidex:** a gilded count in the header ("✦ N/120 gilded"); unlocked lines have a gold frame, a
  "✦ GILDED UNLOCKED" tag and every seen form drawn gilded with twinkling sparkles. The opened card shows each form
  gilded and large (normal colours in the corner) with "✦ Gilded unlocked: every form". Lines only seen gilded keep a
  small sparkle and the gilded in the corner.
- **Gilded Hexlings online:** every species you've caught (or claimed) gilded is recorded ("✦ Gilded caught" in the
  Hexlidex). In the team builder it shows ✦ GILDED in the picker, joins teams gilded, and has a "✦ Gilded: on/off"
  toggle. Gilded picks fight gilded in the Battle Arena and online duels (the other player sees it gilded too, with
  the full reveal); saved loadouts remember it. A pick can only be gilded for a species you own gilded.
  Older saves: if any gilded Hexlings were caught, the species seen gilded count as owned.

## Music

- All music is synthesized: each song is 16 bars (A A' B A) composed from a mode, two chord progressions and a
  seed, with bass, drums, pads, arpeggios and bells.
- Songs: title, map, wild battle, trainer battle, guardian, final guardian (floor 3), shop, event, arena
  (arena and online screens), victory and defeat.
- Map, battle, trainer and guardian songs take the floor's element: its mode (e.g. Fire harmonic minor,
  Light lydian, Nature dorian), tempo and instruments (echoing leads for Water and Spirit, bells for Frost
  and Light, arpeggios for Storm and Dragon), so all 12 elements sound different.

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
  | Ascension | Earn 10 prestige stars | Ascendant: once per floor, a Prestige Altar needs no sacrifice |
  | Second Wind | Survive 3 team wipes | Bodyguard: bench steps in fully healed |
  | Trainer Hunter | Defeat 10 trainers | Big Game Hunter: trainers always drop a stone, sometimes 2 |
  | Naturalist | Catch 40 different species | Naturalist: +25% XP from wild battles |
  | Guardian Slayer | Defeat 15 floor bosses | Iron Will: survivors recover 70% after wins (normally 40%) |
  | Treasure Hunter | Open 15 treasure chests | Lucky Charm: coin-flip events succeed 75% |
  | Chemist | Use 15 potions | Apothecary: 2 starting potions, carry 8, they heal 75% |
  | Outfitter | Give your creatures 10 held items | Quartermaster: start with two held items |
  | Hexer | Inflict 30 status conditions | Afflicter: your moves inflict statuses twice as often |
  | Trial by Fire | Win a run at Heat 2 | Tempered: your creatures can't be burned or poisoned |
  | In Tune | Win 25 battles with a synergy active | Harmonist: team synergy bonuses doubled |
- **Saved loadouts:** at the end of a normal run (won or lost), any surviving creature can be saved as a
  loadout (its form and moves, up to 40 kept). In the Arena team builder, a creature with saved loadouts
  shows "N SAVED"; open it and tap **Loadouts** to use one (moves not allowed in the Arena are swapped
  for defaults, and an unseen form falls back to the nearest one you've seen).

## Battle systems (later additions)

- **Status conditions** (one per creature; each lasts 3–5 battle turns and carries over between battles until it runs
  out). The timer also runs for creatures waiting or benched during a battle, and burn/poison still hurt them, but
  never below 1 HP off the field. Potions, Full Restores, Rest nodes and full heals cure it. Moves named for a
  condition can inflict it (Spark → paralysis, Acid Spit → poison...): attacks 10–20%, debuff moves 40%.
  | Status | Effect | Immune |
  |---|---|---|
  | Burn | −1/12 HP per turn, deals 20% less damage | Fire |
  | Poison | −1/8 HP per turn | Toxic, Metal |
  | Paralysis | half speed, 25% chance to lose the turn | Storm |
  | Freeze | can't act; 30% thaw chance per turn; a Fire hit thaws | Frost, Fire |
  | Sleep | can't act until it wakes | — |
  | Confusion | 33% chance to hit itself for 1/10 HP instead | — |
- **Team synergy**: 2/3/4 creatures sharing an element on the main team give the whole team +6/12/18% to
  that element's stat (ATK: Fire, Dragon, Toxic, Shadow · DEF: Earth, Metal, Frost, Water · SPD: Storm,
  Light, Spirit, Nature). Floor bosses' teams get synergy too; wild creatures and trainers don't.
- **Potions** are carried (5, or 8 with Apothecary) and used from the battle screen (costs the turn) or the
  Team screen.
- **Entrances**: your creatures and trainers'/guardians' are released from a glowing hexagon (and recalled into it
  on a switch); wild creatures burst out of something matching their first element: grass (Nature), flames (Fire),
  rocks (Earth), scrap (Metal), ice shards (Frost), dragon stones (Dragon), water (Water), sludge (Toxic), a shadow
  pool (Shadow), a lightning strike (Storm), a sunburst (Light) or gathering mist (Spirit).
- **Evolution Stones** also drop from won wild battles: 3% / 4% / 5% by floor.

## Balance report

`scripts/balance.ts` has a bot play about 10,000 runs and writes `docs/BALANCE_REPORT.md`: win rate by
Heat, where runs end, every starter at Heat 0 (and by element), guardian and extra-rule loss rates, Gilded
Hunt depth and the weekly twists. The bot is simple, so its numbers are for comparing, not absolute.
`RULES_ONLY=1 npx vite-node scripts/balance.ts` runs a bigger Heat 4-8 sample and prints just the guardian
rule loss rates (the report's rule table is small and noisy).

## Open questions

## Prehistoric forms (2.07)

- A Hexling's line from an earlier era: still recognisably the same Hexling, but with earthier, muted
  colours (amber where its element glow was, old ivory for bone) and different parts. Cosmetic only;
  Gilded wins if a Hexling is both. Saved as `ancient` on the creature and `meta.ancientFound` (the
  2.0 Fossil Site's "ancient form", renamed and redrawn).
- **Parts** (seeded per line, the same at every stage, `prehistoricPlan` in ui/sprites.ts): wings,
  capes, manes, fins and crystals not grown yet (bony plates or spines instead), antennae, ears,
  crowns and antlers swapped for horns, a spiked ridge or a crest, thin and flame tails clubbed or
  spiked, long arms shortened, a toothier mouth. Legs are only ever lost: a third of legged lines
  have none (they slither), and some six-legged lines walk on four.
- **Features** (two per line, `prehistoricFeatures` in ui/sprites2.ts): saw-toothed crest, bony frill
  around the head, horns, tusks, flank stripes, shoulder spikes.
- **Where:** about 1 wild Hexling in 250; 1 in 6 on an Ancient Ruins floor; the Fossil Site. Caught
  ones stay Prehistoric. The Hexlidex shows the form in the corner of each stage once found.
