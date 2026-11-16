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

## Install it as an app

The game is an installable web app (PWA): it opens fullscreen from its own home-screen icon and
works offline after the first visit. It needs to be served from its own web address:

- **GitHub Pages:** `.github/workflows/deploy.yml` builds and publishes `dist/` on every push to
  `main`. One-time setup: repository **Settings → Pages → Source: GitHub Actions**. (Pages on a
  private repository needs a paid GitHub plan; on a public one it's free.)
- **Any static host** (Netlify, Cloudflare Pages, Vercel…): run `npm run build` and upload `dist/`.

Then open the site on your phone:
- **Android (Chrome):** tap **📲 Install app** on the title screen.
- **iPhone (Safari):** tap Share → **Add to Home Screen** (the title screen button explains this).

Saves on the installed app live on that device. The claude.ai preview keeps its own cloud save.

## What's in the first playable

- **Starter pick** — 3 random from your unlocked pool.
- **Hex map** — 3 floors, climb bottom → top, move to any connected hex above you. Floors widen as you go.
- **Nodes** — Battle, Elite (drops Evolution Stone), Level Up, Skill, Prestige, Rest, Shop, Boss.
- **Coins & shops** — earn coins from fights, spend them on heals, training, scrolls, stones, sigils and recruits.
- **Creature Dex** — forms, moves and elements you've seen; evolutions stay hidden until encountered.
- **Battles** — 1v1 with switching (costs your turn), 6 elements, dual types, pure-type STAB bonus.
- **Catching** — the last wild creature is left at 1 HP: finish it for XP and coins, *or* catch it (it joins at its own level and evolution).
- **Team 4 + bench 3** — bench gets 50% XP, is your second life if the team wipes, and is prestige fuel.
- **Permadeath** — fallen creatures are gone.
- **Growth** — Level Up (small), Skill tiers (T3 adds an effect), Prestige (★, +15% stats, +3 level cap), Evolve (biggest).
- **Boss boon** — full heal + refill bench, team prestige, or evolve one.
- **Meta** — bosses unlock new starters; trainer passives unlock; equip one per run.
- **Procedural pixel creatures** — generated from species seed; evolution grows horns/spikes.
- **Held items** — 11 items (one per creature), equipped from the Team screen; from shops, chests, events and trainer prizes.
- **Events** — 23 events with trade-offs; none repeats in a run until you've seen them all.
- **Battle Arena** — build a Lv 50 team from creatures you've caught (forms you've seen, moves you pick) and climb a 5-round ladder of trainers.
- **Duel a friend** — from the Battle Arena: one phone hosts and shows a 5-digit code, the other enters it, and you battle your Arena teams live, phone to phone (WebRTC via PeerJS). Reconnects if a phone drops.
- **Bag** — the map's Bag button shows potions, Evolution Stones and held items; give or take off items right there.
- **Heat** — beat a run to unlock Heat 1–8: each level stacks a harder rule. Pick it after choosing a map; each Heat won on a map lights one of its 8 flame tokens.
- **Daily run** — the same seed, starters and map for everyone each day; your best result is kept.
- **Battle controls** — 1×/2×/3× speed and auto-battle; vibration on Android.
- **Run summary** — what beat you, your MVP, stats, survivors and the fallen.

## Layout

```
src/data/      species, moves, types chart, balance knobs
src/logic/     pure game logic (no Phaser): battle, map gen, creature growth, run state
src/scenes/    Phaser scenes: Title, Starter, Map, Battle, Team, End
src/ui/        widgets, modal picker, procedural sprite generator
scripts/       balance simulator
tests/         vitest unit tests
```
