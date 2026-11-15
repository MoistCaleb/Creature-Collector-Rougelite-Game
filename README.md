# Creature Collector Roguelite

A mobile-first (portrait, one-thumb) creature-collector roguelite built with TypeScript + Phaser 3.
Runs in any phone browser.

See [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) for the design.

## Play / develop

```bash
npm install
npm run dev        # dev server; open the printed Network URL on your phone (same Wi-Fi)
npm run build      # production build into dist/
npm test           # logic unit tests
npx vite-node scripts/simulate.ts 500   # balance simulator: plays 500 runs headlessly
```

## What's in the first playable

- **Starter pick** — 3 random from your unlocked pool.
- **Hex map** — 3 floors, climb bottom → top, move to any connected hex above you. Floors widen as you go.
- **Nodes** — Battle, Elite (drops Evolution Stone), Level Up, Skill, Prestige, Rest, Shop, Boss.
- **Coins & shops** — earn coins from fights, spend them on heals, training, scrolls, stones, sigils and recruits.
- **Creature Dex** — forms, moves and elements you've seen; evolutions stay hidden until encountered.
- **Battles** — 1v1 with switching (costs your turn), 6 elements, dual types, pure-type STAB bonus.
- **Catching** — after a wild win: take XP *or* catch a raw Lv 1 copy (catch-up XP helps it grow).
- **Team 4 + bench 3** — bench gets 50% XP, is your second life if the team wipes, and is prestige fuel.
- **Permadeath** — fallen creatures are gone.
- **Growth** — Level Up (small), Skill tiers (T3 adds an effect), Prestige (★, +15% stats, +3 level cap), Evolve (biggest).
- **Boss boon** — full heal + refill bench, team prestige, or evolve one.
- **Meta** — bosses unlock new starters; trainer passives unlock; equip one per run.
- **Procedural pixel creatures** — generated from species seed; evolution grows horns/spikes.

## Layout

```
src/data/      species, moves, types chart, balance knobs
src/logic/     pure game logic (no Phaser): battle, map gen, creature growth, run state
src/scenes/    Phaser scenes: Title, Starter, Map, Battle, Team, End
src/ui/        widgets, modal picker, procedural sprite generator
scripts/       balance simulator
tests/         vitest unit tests
```
