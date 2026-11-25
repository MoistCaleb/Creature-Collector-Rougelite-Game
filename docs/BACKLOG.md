# Backlog: ideas for later

Ideas we've agreed are good but parked. Pick one up by moving it into a plan.

## Shareable run card
At the end of a run, a Share button that makes an image of the team (sprites, levels, Gilded
and Prehistoric looks), the Heat, the map, how it ended (the guardian beaten or the hex you fell
on) and the MVP. Uses the Web Share API where there is one (phones), else downloads the PNG.
Draw it on an offscreen canvas from the existing sprite textures; keep it under ~200 KB.

## Eggs and breeding
Builds on camp bond. A rough shape to start from:
- Two Hexlings at camp with 3+ hearts each (and a shared element, or one being Neutral-friendly)
  can leave an egg, at most one at a time.
- The egg hatches after a few finished runs (carried like care: comes back per run).
- The baby is the first stage of one parent's line, may inherit one parent's trait (if found)
  and a move from the other, and starts with a little bond.
- Needs: egg item + sprite, a hatch scene, Hexlidex "Hatched" count, save migration, tests.
- Keep it out of seeded runs (daily, weekly) and online races, like other camp perks.
Open: does a hatched Hexling join runs as a starter option, or as a camp-only pet first?
