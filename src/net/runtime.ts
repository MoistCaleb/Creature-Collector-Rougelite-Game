import type Phaser from 'phaser';
import type { ArenaPick } from '../logic/arena';
import { SPECIES_BY_ID } from '../data/species';
import { MOVES } from '../data/moves';
import type { BattleMatch } from '../scenes/BattleScene';
import { applySnap, DUEL_VERSION, DuelController, type DuelMsg, type Next, type RaceInfo, type RaceProgress, type StartInfo } from './duel';
import { SPECIES } from '../data/species';
import { HELD } from '../data/held';
import { Rng } from '../logic/rng';
import type { Creature } from '../logic/creature';
import { session } from './session';

/**
 * Glue between the connection and the screens: who we're connected to, the duel in progress,
 * and starting (or resuming) the battle screen for it.
 */

export interface Opponent {
  name: string;
  team: ArenaPick[];
}

export const duel = {
  /** The other player, once they've said hello. */
  opponent: null as Opponent | null,
  /** The duel in progress, if any. */
  controller: null as DuelController | null,
  /** Our own name and team for this session. */
  me: null as Opponent | null,
  /** Set by the lobby so incoming messages can change screens. */
  game: null as Phaser.Game | null,
  /** Lobby redraw hook. */
  onChange: null as (() => void) | null,
  /** A stage race in progress: the map/seed, and where each racer is. */
  race: null as { info: RaceInfo; mine: RaceProgress | null; theirs: RaceProgress | null; duelStarted: boolean } | null,
  /** Redraw hook for screens showing race progress (map, end screen). */
  onRaceChange: null as (() => void) | null,
};

/** Drop anything malformed from creatures the other phone sent for the race finale. */
function cleanCreatures(list: unknown): Creature[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c): c is Creature => !!c && typeof c.speciesId === 'string' && !!SPECIES_BY_ID[c.speciesId])
    .map((c) => ({
      ...c,
      level: Math.max(1, Math.min(125, Math.round(Number(c.level) || 1))),
      stage: Math.max(0, Math.min(2, Math.round(Number(c.stage) || 0))),
      stars: Math.max(0, Math.min(5, Math.round(Number(c.stars) || 0))),
      moves: (Array.isArray(c.moves) ? c.moves : [])
        .filter((m) => m && typeof m.id === 'string' && !!MOVES[m.id])
        .map((m) => ({ id: m.id, tier: Math.max(1, Math.min(3, Math.round(Number(m.tier) || 1))) }))
        .slice(0, 4),
      held: c.held && HELD[c.held] ? c.held : undefined,
      pendingMoves: [],
    }))
    .filter((c) => c.moves.length > 0)
    .slice(0, 4);
}

// ---------------------------------------------------------------- stage race

/** Host: start a stage race on this map (both phones pick a starter next). */
export function hostStartRace(mapId: string) {
  if (session.role !== 'host' || !duel.opponent) return;
  const seed = Math.floor(Math.random() * 1e9);
  const starters = new Rng(seed).shuffle(SPECIES.map((s) => s.id)).slice(0, 3);
  const race: RaceInfo = { seed, mapId, starters };
  session.send({ t: 'race', race });
  enterRace(race);
}

function enterRace(race: RaceInfo) {
  duel.race = { info: race, mine: null, theirs: null, duelStarted: false };
  goTo('Starter', { race });
}

/** Share where you are in the race (called from the map and the end screen). */
export function sendProgress(p: RaceProgress) {
  if (!duel.race) return;
  duel.race.mine = p;
  session.send({ t: 'progress', p });
  checkRaceEnd();
}

/**
 * Both runs over: the host starts the finale duel with the two finished teams. If someone has no
 * team left, there's nothing to fight and the result is decided right there (see raceVerdict).
 */
function checkRaceEnd() {
  const r = duel.race;
  if (!r?.mine?.finished || !r.theirs?.finished || r.duelStarted) return;
  duel.onRaceChange?.();
  if (session.role !== 'host' || !r.mine.team?.length || !r.theirs.team?.length || !duel.me || !duel.opponent) return;
  r.duelStarted = true;
  const info: StartInfo = {
    seed: Math.floor(Math.random() * 1e9),
    hostName: duel.me.name,
    guestName: duel.opponent.name,
    hostTeam: [],
    guestTeam: [],
    hostCreatures: r.mine.team,
    guestCreatures: r.theirs.team,
  };
  session.send({ t: 'start', info });
  // Let the screen that reported the finish (often the end screen, mid-setup) settle first.
  setTimeout(() => beginDuel(new DuelController('host', info, session)), 60);
}

/** With both runs over: 'duel' if both have a team, otherwise who won by default. */
export function raceVerdict(): 'duel' | 'win' | 'lose' | 'draw' | null {
  const r = duel.race;
  if (!r?.mine?.finished || !r.theirs?.finished) return null;
  const mine = !!r.mine.team?.length;
  const theirs = !!r.theirs.team?.length;
  if (mine && theirs) return 'duel';
  return mine ? 'win' : theirs ? 'lose' : 'draw';
}

export function endRace() {
  duel.race = null;
}

/** Drop anything malformed from a team the other phone sent. */
function cleanTeam(team: unknown): ArenaPick[] {
  if (!Array.isArray(team)) return [];
  return team
    .filter((p): p is ArenaPick => !!p && typeof p.speciesId === 'string' && !!SPECIES_BY_ID[p.speciesId] && [0, 1, 2].includes(p.stage))
    .map((p) => ({ speciesId: p.speciesId, stage: p.stage, moves: (Array.isArray(p.moves) ? p.moves : []).filter((id) => typeof id === 'string' && !!MOVES[id]).slice(0, 4) }))
    .slice(0, 4);
}

/** Say hello: our name and team. */
export function sendHello() {
  if (duel.me) session.send({ t: 'hello', v: DUEL_VERSION, name: duel.me.name, team: duel.me.team });
}

/** Host: start a duel with the connected guest. */
export function hostStartDuel() {
  if (session.role !== 'host' || !duel.me || !duel.opponent) return;
  const info: StartInfo = {
    seed: Math.floor(Math.random() * 1e9),
    hostName: duel.me.name,
    guestName: duel.opponent.name,
    hostTeam: duel.me.team,
    guestTeam: duel.opponent.team,
  };
  session.send({ t: 'start', info });
  beginDuel(new DuelController('host', info, session));
}

function beginDuel(controller: DuelController, initialNext?: Next) {
  duel.controller = controller;
  const match: BattleMatch = {
    team: [],
    enemies: [],
    seed: controller.info.seed,
    title: 'DUEL',
    opponent: controller.opponentName,
    randomness: 0,
    background: 0x14223a,
    duel: controller,
    initialNext,
    onEnd: () => {},
  };
  goTo('Battle', { kind: 'elite', match });
}

/** Switch to a screen from outside it (stopping whatever is showing; restarting it if it's that one). */
function goTo(key: string, data: object) {
  const mgr = duel.game?.scene;
  if (!mgr) return;
  const active = mgr.getScenes(true);
  for (const s of active) if (s.scene.key !== key) s.scene.stop();
  const same = active.find((s) => s.scene.key === key);
  if (same) same.scene.restart(data);
  else mgr.start(key, data);
}

session.onMessage((msg: DuelMsg) => {
  switch (msg.t) {
    case 'hello':
      duel.opponent = { name: String(msg.name || 'Friend').slice(0, 16), team: cleanTeam(msg.team) };
      // The host answers with its own hello so the guest sees who it's facing.
      if (session.role === 'host') sendHello();
      duel.onChange?.();
      return;
    case 'start':
      if (session.role === 'guest') {
        const info = { ...msg.info, hostTeam: cleanTeam(msg.info.hostTeam), guestTeam: cleanTeam(msg.info.guestTeam) };
        if (msg.info.hostCreatures) info.hostCreatures = cleanCreatures(msg.info.hostCreatures);
        if (msg.info.guestCreatures) info.guestCreatures = cleanCreatures(msg.info.guestCreatures);
        if (duel.race) duel.race.duelStarted = true;
        beginDuel(new DuelController('guest', info, session));
      }
      return;
    case 'race':
      if (session.role === 'guest') enterRace(msg.race);
      return;
    case 'progress':
      if (!duel.race) return;
      duel.race.theirs = { ...msg.p, team: msg.p.team ? cleanCreatures(msg.p.team) : undefined };
      duel.onRaceChange?.();
      checkRaceEnd();
      return;
    case 'resume':
      if (session.role === 'guest') {
        const c = new DuelController('guest', msg.info, session);
        applySnap(c.battle, msg.snap);
        beginDuel(c, msg.next);
      }
      return;
    case 'lobby':
      duel.controller = null;
      goTo('Duel', {});
      return;
    default:
      duel.controller?.receive(msg);
  }
});

/** Host: a guest (re)connected. Mid-duel, hand it everything it needs to pick up again. */
session.onGuestJoined = () => {
  if (duel.controller && session.role === 'host') session.send(duel.controller.resumeMsg());
};

/** Leave everything: connection, duel, race and opponent. */
export function leaveDuel() {
  duel.controller = null;
  duel.opponent = null;
  duel.race = null;
  session.close();
}

// During a race (not mid-duel; the battle screen handles that), a guest whose link drops keeps
// retrying the same code, and both sides re-share their progress once reconnected.
let retry: ReturnType<typeof setInterval> | null = null;
session.onStatus((s) => {
  if (s === 'lost' && session.role === 'guest' && duel.race && !duel.controller && !retry) {
    retry = setInterval(() => void session.connectGuest().then((ok) => ok && sendHello()), 3000);
  }
  if (s === 'connected') {
    if (retry) clearInterval(retry);
    retry = null;
    if (duel.race?.mine) session.send({ t: 'progress', p: duel.race.mine });
  }
  if (s === 'idle' && retry) {
    clearInterval(retry);
    retry = null;
  }
  duel.onRaceChange?.();
});
