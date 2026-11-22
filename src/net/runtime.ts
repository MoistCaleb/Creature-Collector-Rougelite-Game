import { cleanBoonIds } from './duel';
import type Phaser from 'phaser';
import { cleanLook, type TrainerLook } from '../data/trainerLook';
import { cleanTitle } from '../logic/titles';
import type { ArenaPick } from '../logic/arena';
import { SPECIES_BY_ID } from '../data/species';
import { MOVES } from '../data/moves';
import type { BattleMatch } from '../scenes/BattleScene';
import { applySnap, cleanSettings, DEFAULT_SETTINGS, DUEL_VERSION, DuelController, type DuelSettings, type DuelMsg, type Next, type RaceInfo, type RaceProgress, type RosterEntry, type StartInfo, type GameMode, GAME_MODES, cleanMode } from './duel';
import { SPECIES } from '../data/species';
import { HELD } from '../data/held';
import { stats } from '../logic/creature';
import { Rng } from '../logic/rng';
import type { Creature } from '../logic/creature';
import { MAX_GUESTS, myPid, session } from './session';
import { hostAbandonRoyale, royale, royaleBack, royaleLost, royaleProgress } from './royale';

/**
 * Glue between the connection and the screens: who we're connected to, the duel in progress,
 * and starting (or resuming) the battle screen for it.
 */

export interface BroughtTeam {
  name: string;
  picks: ArenaPick[];
}

/** A player in the session: name and the teams they're bringing. */
export interface Opponent {
  name: string;
  look?: TrainerLook;
  /** Trainer title (see logic/titles), if they show one. */
  title?: string;
  teams: BroughtTeam[];
}

/** A series in progress: settings, which battle we're on, the score, and each side's pick. */
export interface Series {
  settings: DuelSettings;
  game: number;
  mine: number;
  theirs: number;
  myPick: number | null;
  theirPick: number | null;
}

export const duel = {
  /** The other player, once they've said hello. */
  opponent: null as Opponent | null,
  /** The duel in progress, if any. */
  controller: null as DuelController | null,
  /** Our own name and teams for this session. */
  me: null as Opponent | null,
  /** Session settings (the host's; the guest gets a copy). */
  settings: { ...DEFAULT_SETTINGS } as DuelSettings,
  /** Which saved teams we're bringing (indexes into our saved teams). */
  bring: [] as number[],
  series: null as Series | null,
  /** Set by the lobby so incoming messages can change screens. */
  game: null as Phaser.Game | null,
  /** Lobby redraw hook. */
  onChange: null as (() => void) | null,
  /** A stage race in progress: the map/seed, and where each racer is. */
  race: null as { info: RaceInfo; mine: RaceProgress | null; theirs: RaceProgress | null; duelStarted: boolean } | null,
  /** Redraw hook for screens showing race progress (map, end screen). */
  onRaceChange: null as (() => void) | null,
  /** The session's game mode (the host picks it before making the code; guests are told). */
  mode: 'duel' as GameMode,
  /** Everyone in the session, the host first (the host keeps it; guests get copies). */
  roster: [] as RosterEntry[],
  /** Host: each guest's current link (peer id), by player id. */
  peers: new Map<string, string>(),
  /** Host: each guest's hello (name, look, teams), by player id. */
  guests: new Map<string, Opponent>(),
};

/** Host: the player id behind a guest's link. */
export const pidOf = (peer: string): string | undefined => [...duel.peers.entries()].find(([, p]) => p === peer)?.[0];

/** A player's name from the roster. */
export const nameOf = (pid: string): string => duel.roster.find((r) => r.pid === pid)?.name ?? 'Player';

/** Potions each player gets per Arena duel battle. */
export const DUEL_POTIONS = 3;

/** Something is being played (no one new may join until it's over). */
const underway = () => !!(duel.race || duel.series || duel.controller || royale.active);

/** Host: rebuild the roster (yourself first) and send it to everyone. */
export function shareRoster() {
  if (session.role !== 'host' || !duel.me) return;
  const me: RosterEntry = { pid: myPid, name: duel.me.name, look: duel.me.look, title: duel.me.title, host: true };
  duel.roster = [me, ...[...duel.guests.entries()].map(([pid, g]) => ({ pid, name: g.name, look: g.look, title: g.title }))];
  // One-on-one modes (Arena duels, 2-player stage battles) need exactly one other player.
  duel.opponent = duel.guests.size === 1 ? [...duel.guests.values()][0] : null;
  session.send({ t: 'roster', players: duel.roster });
  duel.onChange?.();
}

export function cleanRoster(x: unknown): RosterEntry[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((r) => r && typeof r.pid === 'string')
    .slice(0, MAX_GUESTS + 1)
    .map((r) => ({ pid: String(r.pid).slice(0, 16), name: String(r.name || 'Player').slice(0, 16), look: cleanLook(r.look), title: cleanTitle(r.title), ...(r.host ? { host: true } : {}) }));
}

/** A map node id from the other player (shown only if it's on our map too). */
export const cleanNodeId = (x: unknown): string | undefined => (typeof x === 'string' && x.length <= 40 ? x : undefined);

/** The other player's lead Hexling, for their grayed-out token on the map. */
export function cleanLead(x: unknown): { speciesId: string; stage: number; shiny?: boolean } | undefined {
  const l = x as { speciesId?: unknown; stage?: unknown; shiny?: unknown } | null;
  if (!l || typeof l.speciesId !== 'string' || !SPECIES_BY_ID[l.speciesId] || ![0, 1, 2].includes(l.stage as number)) return undefined;
  return { speciesId: l.speciesId, stage: l.stage as number, ...(l.shiny === true ? { shiny: true } : {}) };
}

/** Drop anything malformed from creatures another phone sent (race finale, bracket matches). */
export function cleanCreatures(list: unknown): Creature[] {
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
      shiny: c.shiny === true ? true : undefined,
      pendingMoves: [],
    }))
    .filter((c) => c.moves.length > 0)
    .slice(0, 4)
    // HP within the creature's real maximum (a missing or bad value means full health).
    .map((c) => {
      const max = stats(c).hp;
      const hp = Number(c.hp);
      return { ...c, hp: Number.isFinite(hp) ? Math.max(0, Math.min(max, Math.round(hp))) : max };
    });
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
  if (royale.active) return royaleProgress(p);
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
    hostBoons: r.mine.boons ?? [],
    guestBoons: cleanBoonIds(r.theirs.boons),
    // Whatever potions each of you finished the stage with.
    potions: { host: r.mine.potions ?? 0, guest: r.theirs.potions ?? 0, hostHeal: r.mine.heal, guestHeal: r.theirs.heal },
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
    .map((p) => ({
      speciesId: p.speciesId,
      stage: p.stage,
      moves: (Array.isArray(p.moves) ? p.moves : []).filter((id) => typeof id === 'string' && !!MOVES[id]).slice(0, 4),
      // Their shiny shows up shiny on your screen too.
      ...(p.shiny === true ? { shiny: true } : {}),
    }))
    .slice(0, 4);
}

/** Say hello: our name and the teams we're bringing. */
export function sendHello() {
  if (!duel.me) return;
  // The host's details go to every guest (their one-on-one view), and the roster to everyone.
  if (session.role === 'host') {
    session.send({ t: 'hello', v: DUEL_VERSION, name: duel.me.name, look: duel.me.look, title: duel.me.title, teams: duel.me.teams, reply: true });
    return shareRoster();
  }
  session.send({ t: 'hello', v: DUEL_VERSION, name: duel.me.name, look: duel.me.look, title: duel.me.title, teams: duel.me.teams, pid: myPid });
}

/** Host: change a session setting and tell the guest. */
export function hostSetSettings(s: DuelSettings) {
  duel.settings = s;
  session.send({ t: 'settings', s, mode: duel.mode });
  duel.onChange?.();
}

/** Host: start a series with the current settings. Both players then pick a team for battle 1. */
export function hostStartSeries() {
  if (session.role !== 'host' || !duel.me || !duel.opponent) return;
  session.send({ t: 'series', s: duel.settings });
  beginSeries(duel.settings);
}

function beginSeries(s: DuelSettings) {
  duel.series = { settings: s, game: 1, mine: 0, theirs: 0, myPick: null, theirPick: null };
  toPick();
}

/** Go pick a team for the next battle (straight in when there's only one to choose). */
function toPick() {
  const sr = duel.series!;
  sr.myPick = null;
  sr.theirPick = null;
  goTo('Duel', { pick: true });
  if (sr.settings.teamsPerPlayer <= 1) setTimeout(() => submitPick(0), 50);
}

/** Your team for the next battle. */
export function submitPick(index: number) {
  const sr = duel.series;
  if (!sr) return;
  sr.myPick = index;
  if (session.role === 'guest') session.send({ t: 'pick', index });
  else tryStartGame();
  duel.onChange?.();
}

/** Host: both picked, so start the battle. */
function tryStartGame() {
  const sr = duel.series;
  if (!sr || sr.myPick === null || sr.theirPick === null || !duel.me || !duel.opponent) return;
  const size = sr.settings.teamSize;
  const info: StartInfo = {
    seed: Math.floor(Math.random() * 1e9),
    level: sr.settings.level,
    hostName: duel.me.name,
    guestName: duel.opponent.name,
    hostTeam: (duel.me.teams[sr.myPick]?.picks ?? []).slice(0, size),
    guestTeam: (duel.opponent.teams[sr.theirPick]?.picks ?? []).slice(0, size),
    potions: { host: DUEL_POTIONS, guest: DUEL_POTIONS },
  };
  session.send({ t: 'start', info });
  setTimeout(() => beginDuel(new DuelController('host', info, session)), 60);
}

/**
 * A series battle ended: update the score. Returns the series result once someone has won a
 * majority (or every battle is played), otherwise null and the next battle is up.
 */
export function recordSeriesGame(won: boolean): 'won' | 'lost' | 'draw' | null {
  const sr = duel.series;
  if (!sr) return null;
  if (won) sr.mine++;
  else sr.theirs++;
  const need = Math.floor(sr.settings.bestOf / 2) + 1;
  if (sr.mine >= need) return 'won';
  if (sr.theirs >= need) return 'lost';
  if (sr.game >= sr.settings.bestOf) return sr.mine === sr.theirs ? 'draw' : sr.mine > sr.theirs ? 'won' : 'lost';
  sr.game++;
  return null;
}

/** After a series battle's result screen: next battle, or back to the lobby. */
export function afterSeriesGame(over: boolean) {
  if (over || !duel.series) {
    duel.series = null;
    goTo('Duel', {});
  } else toPick();
}

export function beginDuel(controller: DuelController, initialNext?: Next, opp: { look?: TrainerLook; title?: string } | null = duel.opponent) {
  duel.controller = controller;
  const match: BattleMatch = {
    team: [],
    enemies: [],
    seed: controller.info.seed,
    title: 'DUEL',
    opponent: controller.opponentName,
    opponentLook: opp?.look,
    opponentTitle: opp?.title,
    randomness: 0,
    background: 0x14223a,
    duel: controller,
    initialNext,
    onEnd: () => {},
  };
  goTo('Battle', { kind: 'elite', match });
}

/** Phaser scene states: INIT 1 … CREATING 4, RUNNING 5, PAUSED 6 (then SLEEPING, SHUTDOWN). */
const SCENE_INIT = 1;
const SCENE_PAUSED = 6;

/** Switch to a screen from outside it (stopping whatever is showing; restarting it if it's that one). */
export function goTo(key: string, data: object) {
  const mgr = duel.game?.scene;
  if (!mgr) return;
  // Every screen that's showing or still being set up (one can be mid-create when this is called
  // from inside it, e.g. the host's own bracket match starting as their map screen opens).
  const active = mgr.getScenes(false).filter((s) => {
    const st = s.sys.settings.status;
    return st >= SCENE_INIT && st <= SCENE_PAUSED;
  });
  for (const s of active) if (s.scene.key !== key) s.scene.stop();
  const same = active.find((s) => s.scene.key === key);
  if (same) same.scene.restart(data);
  else mgr.start(key, data);
}

session.onMessage((msg: DuelMsg, from: string) => {
  switch (msg.t) {
    case 'hello': {
      const who: Opponent = {
        name: String(msg.name || 'Friend').slice(0, 16),
        look: cleanLook(msg.look),
        title: cleanTitle(msg.title),
        teams: (Array.isArray(msg.teams) ? msg.teams : []).slice(0, 3).map((t) => ({ name: String(t?.name ?? 'Team').slice(0, 18), picks: cleanTeam(t?.picks) })),
      };
      if (session.role !== 'host') {
        duel.opponent = who;
        duel.onChange?.();
        return;
      }
      const pid = typeof msg.pid === 'string' && msg.pid ? msg.pid.slice(0, 16) : from;
      if (!duel.guests.has(pid)) {
        // Someone new: only between games, and only up to 8 players.
        const why = underway()
          ? 'A game is already under way there. Try again when it ends.'
          : duel.guests.size >= Math.min(MAX_GUESTS, GAME_MODES[duel.mode].max - 1)
            ? `That game is full (${GAME_MODES[duel.mode].name}, ${GAME_MODES[duel.mode].max} players).`
            : '';
        if (why) {
          session.sendTo(from, { t: 'refuse', why });
          setTimeout(() => session.drop(from), 400);
          return;
        }
      }
      // A reconnecting player: their new link replaces the old one.
      const old = duel.peers.get(pid);
      if (old && old !== from) session.drop(old);
      duel.peers.set(pid, from);
      if (royale.active) {
        royaleBack(pid);
        return;
      }
      duel.guests.set(pid, who);
      // Answer with our own hello and the settings, then tell everyone who's here.
      if (duel.me && !msg.reply) session.sendTo(from, { t: 'hello', v: DUEL_VERSION, name: duel.me.name, look: duel.me.look, title: duel.me.title, teams: duel.me.teams, reply: true });
      session.sendTo(from, { t: 'settings', s: duel.settings, mode: duel.mode });
      shareRoster();
      return;
    }
    case 'roster':
      if (session.role === 'guest') {
        duel.roster = cleanRoster(msg.players);
        duel.onChange?.();
      }
      return;
    case 'refuse':
      if (session.role === 'guest') {
        session.fail(String(msg.why || 'The host turned the connection down.').slice(0, 120));
        duel.onChange?.();
      }
      return;
    case 'settings':
      if (session.role === 'guest') {
        duel.settings = cleanSettings(msg.s);
        duel.mode = cleanMode(msg.mode);
        duel.onChange?.();
      }
      return;
    case 'series':
      if (session.role === 'guest') beginSeries(cleanSettings(msg.s));
      return;
    case 'pick':
      if (session.role === 'host' && duel.series) {
        duel.series.theirPick = Math.max(0, Math.min(2, Math.round(Number(msg.index) || 0)));
        tryStartGame();
        duel.onChange?.();
      }
      return;
    case 'start':
      if (session.role === 'guest') {
        const info = { ...msg.info, hostTeam: cleanTeam(msg.info.hostTeam), guestTeam: cleanTeam(msg.info.guestTeam) };
        if (msg.info.hostCreatures) info.hostCreatures = cleanCreatures(msg.info.hostCreatures);
        if (msg.info.guestCreatures) info.guestCreatures = cleanCreatures(msg.info.guestCreatures);
        info.hostBoons = cleanBoonIds(msg.info.hostBoons);
        info.guestBoons = cleanBoonIds(msg.info.guestBoons);
        if (duel.race) duel.race.duelStarted = true;
        beginDuel(new DuelController('guest', info, session));
      }
      return;
    case 'race':
      if (session.role === 'guest') enterRace(msg.race);
      return;
    case 'progress':
      if (!duel.race) return;
      duel.race.theirs = { ...msg.p, team: msg.p.team ? cleanCreatures(msg.p.team) : undefined, at: cleanNodeId(msg.p.at), lead: cleanLead(msg.p.lead) };
      duel.onRaceChange?.();
      checkRaceEnd();
      return;
    case 'resume':
      if (session.role === 'guest') {
        const c = new DuelController('guest', msg.info, session);
        applySnap(c.battle, msg.snap);
        c.syncPots(msg.snap);
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
  if (duel.controller && session.role === 'host' && !royale.active) session.send(duel.controller.resumeMsg());
};

/** Host: a guest's link closed. Between games they leave the lobby; in a battle royale they get a grace period. */
session.onGuestLost = (peer) => {
  const pid = pidOf(peer);
  if (!pid) return;
  if (royale.active) return royaleLost(pid);
  if (underway()) return;
  duel.peers.delete(pid);
  duel.guests.delete(pid);
  shareRoster();
};

/** Host: end the battle royale for everyone (the lobby stays connected). */
export function leaveDuelRoyale() {
  hostAbandonRoyale();
  royale.reset();
}

/** Leave everything: connection, duel, race and opponent. */
export function leaveDuel() {
  hostAbandonRoyale();
  duel.controller = null;
  duel.opponent = null;
  duel.roster = [];
  duel.peers.clear();
  duel.guests.clear();
  royale.reset();
  duel.race = null;
  duel.series = null;
  duel.settings = { ...DEFAULT_SETTINGS };
  duel.mode = 'duel';
  session.close();
}

// During a race (not mid-duel; the battle screen handles that), a guest whose link drops keeps
// retrying the same code, and both sides re-share their progress once reconnected.
let retry: ReturnType<typeof setInterval> | null = null;
session.onStatus((s) => {
  if (s === 'lost' && session.role === 'guest' && ((duel.race && !duel.controller) || royale.active) && !retry) {
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
