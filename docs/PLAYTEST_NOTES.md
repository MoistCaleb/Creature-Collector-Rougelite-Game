# Playtest notes (2026-11-22)

Caleb's notes from a playtest, recorded for Claude Code. Perplexity is fixing these on
`perplexity/2.0-playtest-fixes`; see the PR for what was changed and how. Each item below is the
report as given, then where it lives.

1. **Battle Royale (and probably Stage Battle): wiped with a bench.** A player still had Hexlings on
   the bench, but the game said he was wiped and his run was over. If a player has a bench, the
   run must keep going. Probably the same in Stage Battle.
2. **Battle Royale: spectate after you're out.** If you're wiped during the map climb, you should be
   able to spectate any other battle still going on. Only when there are more than 2 players (as in
   Battle Royale).
3. **Battle Royale: spectating the bracket may drop a player.** Spectating a bracket match in the last
   part of Battle Royale may have "disconnected" a player mid-match and taken him out of the
   bracket, leaving only two players (Ty and Caleb). Not confirmed, but check.
4. **Revive hex: no swap.** The revive tile doesn't let you swap out a Hexling, and it definitely needs to.
5. **Menus: titles don't scroll.** In menus the titles all load at once and overlap the buttons
   instead of scrolling.
6. **Map legendaries.** Legendaries should sometimes come towards the player (it feels impossible to
   reach them). They shouldn't disappear when they have nowhere to go: show an exclamation point
   above their head because they're cornered. Max move per turn is the same as the player: 1 hex.
7. **Records tab: text overlap.**
8. **Shop music restarts** whenever you restock or do other things, instead of continuing and looping.

## What was done (Perplexity, `perplexity/2.0-playtest-fixes`)

Claude: please review these, especially the online ones (1–3), which were only tested with a
simulated session in one browser, not with real phones.

1. **Wiped with a bench.** No exact code path found: the battle screen already promotes the bench
   before ending a run. Two safety nets so it can't happen another way:
   - `raceTeam(run)` (src/logic/run.ts): the team handed in at the end of a climb is the Hexlings
     still standing, topped up from the bench. It's never empty while the bench has Hexlings.
   - EndScene race branch: a loss with Hexlings on the bench promotes them and goes back to the map
     ("your bench stepped up") instead of ending the climb.
   - Likely related to item 3: a player whose link dropped was shown to everyone as "out", the same
     as a wiped team. The royale summary now says "N disconnected" separately.
2. **Spectate climb battles after you're out** (battle royale with 3+ players, before the bracket).
   - Racer: BattleScene sends `cstart` (teams, foe name, snapshot) when a run battle starts, `cstep`
     (events, snapshot, next) every turn, and `cend` when the screen closes (src/net/royale.ts
     `climbStart/climbStep/climbEnd`).
   - Host: keeps `royale.climbs` by player, marks them `fighting` in the standings, and reuses the
     bracket watch path with ids `climb:<pid>` (`wstart`/`wstep`, plus a new `wover`).
   - Spectator: the waiting panel shows "Watch a battle (N)" next to Leave; it opens a list of
     racers in a battle. The battle screen plays it like a bracket match (no trainer for wild
     battles) and returns to the map when it ends.
3. **Bracket drop.** Couldn't confirm that spectating causes it. Most likely cause: the host marks a
   player gone for good 20 s after their link drops (a locked phone or app switch is enough).
   - Grace raised to 45 s.
   - A player who comes back before the bracket is set is back in (unless they chose to quit), and
     resends their finished team if the host missed it.
   - Real bug fixed: BattleScene's `watchEnded`, `duelNext` and `fast` persisted between scene runs,
     so a second spectated match never wrapped up. They're reset on create.
4. **Revive swap.** With a full party, the Revival hex asks who to swap out. That Hexling leaves (its
   item goes back to the bag) and the revived one takes its exact spot.
5. **Titles scroll.** Trainer titles: each tier's list is masked between the tabs and Close and scrolls
   by drag, with a "Drag for more" hint.
6. **Legendaries.** Move 1 hex per move (was up to 2), only to battle hexes ahead of you that you
   haven't visited. 40% of moves step toward you. With nowhere to step, they stay put and the map
   shows a yellow "!" instead of "?". They slip to the nearest hex ahead only if you've passed them
   or they've just fled a battle.
7. **Records overlap.** Long lifetime values (Deepest Gilded Hunt, Closest camp bond) stack under
   their label. Run rows shrink or trim text so it stops before the team sprites.
8. **Shop music.** The map redraws after a restock or purchase; it now keeps the shop (or event)
   theme going instead of switching to the map theme and back, which restarted the song.
