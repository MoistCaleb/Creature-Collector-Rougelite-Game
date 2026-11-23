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
