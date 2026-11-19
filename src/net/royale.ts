import { champion, cleanBracket, makeBracket, readyMatches, setWinner, type Bracket } from '../logic/bracket';
import type { Creature } from '../logic/creature';
import { Rng } from '../logic/rng';
import { activeTeam, makeArenaCreature } from '../logic/arena';
import { state } from '../state';
import { SPECIES } from '../data/species';
import { DuelController, type DuelMsg, type RaceInfo, type RaceProgress, type RosterEntry, type Standing, type StartInfo } from './duel';
import { myPid, session } from './session';
import { beginDuel, cleanCreatures, cleanRoster, duel, goTo, nameOf, pidOf } from './runtime';

/**
 * Battle royale: 3 to 8 players race the same stage, then everyone with a team left meets in a
 * single-elimination bracket. The host's phone keeps the race standings and the bracket, starts
 * each match and passes match messages between guests (every guest only talks to the host).
 * Matches run like a stage battle finale: one of the two players' phones runs the real battle.
 */

/** How long a player whose link dropped has to come back before they're out. */
const GRACE = 20000;

interface HostRacer {
  progress: RaceProgress | null;
  /** Their finished team (empty: wiped out). */
  team: Creature[] | null;
  gone: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

export const royale = {
  active: false,
  info: null as RaceInfo | null,
  players: [] as RosterEntry[],
  standings: [] as Standing[],
  bracket: null as Bracket | null,
  /** The winner (from the bracket, or the last one standing). */
  champion: null as string | null,
  /** Set when it ends early (host left, every team wiped out). */
  ended: '' as string,
  /** Your bracket match in progress. */
  match: null as { id: string; opp: string; controller: DuelController } | null,
  /** The champion's online win has been counted. */
  winCounted: false,
  /** Host: everyone's race and team. */
  racers: new Map<string, HostRacer>(),
  /** Host: matches already started. */
  started: new Set<string>(),
  /** An online tournament (Arena teams, no stage race) rather than a battle royale. */
  tourney: false,
  /** Redraw hook for whichever screen shows the royale. */
  onChange: null as (() => void) | null,
  reset() {
    for (const r of this.racers.values()) if (r.timer) clearTimeout(r.timer);
    this.active = false;
    this.tourney = false;
    this.info = null;
    this.players = [];
    this.standings = [];
    this.bracket = null;
    this.champion = null;
    this.ended = '';
    this.match = null;
    this.winCounted = false;
    this.racers = new Map();
    this.started = new Set();
  },
};

const changed = () => royale.onChange?.();

/** "Round of 8" style label for the race status: how many are still in it. */
export function royaleSummary(): string {
  const s = royale.standings;
  if (!s.length) return 'starting';
  const racing = s.filter((x) => !x.finished && !x.gone).length;
  const ready = s.filter((x) => x.finished && x.alive).length;
  const out = s.filter((x) => !x.alive || x.gone).length;
  return [`${racing} racing`, ready ? `${ready} at the boss` : '', out ? `${out} out` : ''].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- starting

/** Host: start a battle royale on this map with everyone in the lobby. */
export function hostStartRoyale(mapId: string) {
  if (session.role !== 'host' || duel.roster.length < 3) return;
  const seed = Math.floor(Math.random() * 1e9);
  const starters = new Rng(seed).shuffle(SPECIES.map((s) => s.id)).slice(0, 3);
  const race: RaceInfo = { seed, mapId, starters };
  const players = duel.roster;
  session.send({ t: 'royale', race, players });
  enterRoyale(race, players);
  for (const p of players) royale.racers.set(p.pid, { progress: null, team: null, gone: false });
  shareStandings();
}

/** Host: start an online tournament with everyone in the lobby, each bringing their active Arena team. */
export function hostStartTourney() {
  if (session.role !== 'host' || duel.roster.length < 3) return;
  const race: RaceInfo = { seed: Math.floor(Math.random() * 1e9), mapId: '', starters: [], tourney: true };
  const players = duel.roster;
  session.send({ t: 'royale', race, players });
  enterRoyale(race, players);
  for (const p of players) royale.racers.set(p.pid, { progress: null, team: null, gone: false });
  shareStandings();
  submitArenaTeam();
}

/** Tournament: hand in your active Arena team (Lv 50, full health). */
function submitArenaTeam() {
  const team = activeTeam(state.meta).map((p) => makeArenaCreature(p));
  royaleProgress({ floor: 0, finished: true, won: true, team: JSON.parse(JSON.stringify(team)) });
}

/** "battle royale" or "tournament", for messages. */
export const royaleLabel = () => (royale.tourney ? 'tournament' : 'battle royale');

function enterRoyale(race: RaceInfo, players: RosterEntry[]) {
  royale.reset();
  royale.active = true;
  royale.tourney = !!race.tourney;
  royale.info = race;
  royale.players = players;
  goTo(race.tourney ? 'Bracket' : 'Starter', { race });
}

// ---------------------------------------------------------------- the race (host keeps score)

/** Share where you are (or your finished team). */
export function royaleProgress(p: RaceProgress) {
  if (session.role === 'host') onProgress(myPid, p);
  else session.send({ t: 'progress', p });
}

function onProgress(pid: string | undefined, p: RaceProgress) {
  const r = pid ? royale.racers.get(pid) : undefined;
  if (!r || r.gone || r.progress?.finished) return;
  r.progress = { floor: Number(p.floor) || 0, finished: !!p.finished, won: !!p.won, steps: typeof p.steps === 'number' ? p.steps : undefined };
  if (p.finished) r.team = pid === myPid ? (p.team ?? []) : cleanCreatures(p.team);
  shareStandings();
  hostCheck();
}

function shareStandings() {
  royale.standings = royale.players.map((p) => {
    const r = royale.racers.get(p.pid);
    const finished = !!r?.progress?.finished || !!r?.gone;
    return {
      pid: p.pid,
      name: p.name,
      floor: r?.progress?.floor ?? 0,
      steps: r?.progress?.steps,
      finished,
      alive: !r?.gone && (!r?.progress?.finished || !!r?.team?.length),
      ...(r?.gone ? { gone: true } : {}),
    };
  });
  session.send({ t: 'standings', list: royale.standings });
  changed();
}

/** Host: once everyone is done (or only one team is left), set up the bracket or crown the winner. */
function hostCheck() {
  if (royale.bracket || royale.champion || royale.ended) return schedule();
  const all = [...royale.racers.entries()];
  const contenders = all.filter(([, r]) => !r.gone && (!r.progress?.finished || r.team?.length));
  if (contenders.length === 0) return endRoyale(royale.tourney ? 'No one brought an Arena team.' : 'Every team was wiped out. No one wins this time.');
  // Everyone else fell: the last one standing wins, even mid-stage.
  if (contenders.length === 1) {
    royale.champion = contenders[0][0];
    return publish();
  }
  if (!all.every(([, r]) => r.gone || r.progress?.finished)) return;
  royale.bracket = makeBracket(
    contenders.map(([pid]) => pid),
    new Rng(royale.info?.seed ?? 1),
  );
  schedule();
}

/** Host: start every match that's ready, settle walkovers, then share the bracket. */
function schedule() {
  const b = royale.bracket;
  if (!b) return publish();
  for (let more = true; more; ) {
    more = false;
    for (const { round, index, m } of readyMatches(b)) {
      const id = `${round}-${index}`;
      if (royale.started.has(id)) continue;
      const ra = royale.racers.get(m.a!)!;
      const rb = royale.racers.get(m.b!)!;
      // Someone who left loses by default.
      if (ra.gone || rb.gone) {
        setWinner(b, round, index, ra.gone ? m.b! : m.a!);
        more = true;
        continue;
      }
      royale.started.add(id);
      const info: StartInfo = {
        seed: Math.floor(Math.random() * 1e9),
        hostName: nameOf(m.a!),
        guestName: nameOf(m.b!),
        hostTeam: [],
        guestTeam: [],
        hostCreatures: ra.team ?? [],
        guestCreatures: rb.team ?? [],
      };
      deliver(m.a!, { t: 'mstart', match: id, info, role: 'host', opp: m.b! });
      deliver(m.b!, { t: 'mstart', match: id, info, role: 'guest', opp: m.a! });
    }
  }
  royale.champion = champion(b);
  publish();
}

function publish() {
  session.send({ t: 'bracket', b: royale.bracket ?? undefined, champion: royale.champion ?? undefined });
  changed();
}

function endRoyale(why: string) {
  royale.ended = why;
  session.send({ t: 'royaleEnd', why });
  changed();
}

/** Host: a message for one player (yourself included). */
function deliver(pid: string, msg: DuelMsg) {
  if (pid === myPid) return onMessage(msg, '');
  const peer = duel.peers.get(pid);
  if (peer) session.sendTo(peer, msg);
}

// ---------------------------------------------------------------- matches

/** Pass a match message to the other player (through the host). */
function sendRelay(to: string, m: DuelMsg) {
  if (session.role === 'host') relay(myPid, to, m);
  else session.send({ t: 'relay', to, m });
}

function relay(from: string, to: string, m: DuelMsg) {
  if (to === myPid) return onRelay(from, m);
  const peer = duel.peers.get(to);
  if (peer) session.sendTo(peer, { t: 'relay', from, m });
}

function onRelay(from: string | undefined, m: DuelMsg) {
  if (royale.match && from === royale.match.opp) royale.match.controller.receive(m);
}

function startMatch(id: string, info: StartInfo, role: 'host' | 'guest', opp: string) {
  const c = new DuelController(role, info, { send: (m) => sendRelay(opp, m) });
  royale.match = { id, opp, controller: c };
  const o = royale.players.find((p) => p.pid === opp);
  beginDuel(c, undefined, o ? { look: o.look, title: o.title } : null);
}

/** Your match ended: tell the host. */
export function reportMatch(won: boolean) {
  const m = royale.match;
  if (!m) return;
  royale.match = null;
  duel.controller = null;
  if (session.role === 'host') onResult(myPid, m.id, won);
  else session.send({ t: 'mresult', match: m.id, won });
}

function onResult(pid: string | undefined, id: string, won: boolean) {
  const b = royale.bracket;
  const [round, index] = id.split('-').map(Number);
  const m = b?.rounds[round]?.[index];
  if (!b || !pid || !m || m.winner || (m.a !== pid && m.b !== pid)) return;
  const other = m.a === pid ? m.b! : m.a!;
  setWinner(b, round, index, won ? pid : other);
  schedule();
}

// ---------------------------------------------------------------- dropped links (host)

/** A player's link dropped: they have a little while to come back. */
export function royaleLost(pid: string) {
  const r = royale.racers.get(pid);
  if (!r || r.gone) return;
  if (r.timer) clearTimeout(r.timer);
  r.timer = setTimeout(() => goneFor(pid), GRACE);
}

/** A dropped player came back in time. */
export function royaleBack(pid: string) {
  const r = royale.racers.get(pid);
  if (r?.timer) clearTimeout(r.timer);
  if (r) r.timer = undefined;
  // Bring them up to date.
  const peer = duel.peers.get(pid);
  if (!peer) return;
  session.sendTo(peer, { t: 'standings', list: royale.standings });
  session.sendTo(peer, { t: 'bracket', b: royale.bracket ?? undefined, champion: royale.champion ?? undefined });
}

function goneFor(pid: string) {
  const r = royale.racers.get(pid);
  if (!r || r.gone) return;
  r.gone = true;
  r.timer = undefined;
  // Mid-match: their opponent wins.
  const b = royale.bracket;
  if (b)
    for (const { round, index, m } of readyMatches(b)) {
      if (m.a !== pid && m.b !== pid) continue;
      const opp = m.a === pid ? m.b! : m.a!;
      if (royale.started.has(`${round}-${index}`)) relay(pid, opp, { t: 'forfeit' });
      setWinner(b, round, index, opp);
    }
  shareStandings();
  hostCheck();
}

// ---------------------------------------------------------------- messages

function onMessage(msg: DuelMsg, from: string) {
  const host = session.role === 'host';
  switch (msg.t) {
    case 'royale':
      if (!host) {
        enterRoyale(msg.race, cleanRoster(msg.players));
        if (royale.tourney) submitArenaTeam();
      }
      return;
    case 'standings':
      if (!host && royale.active && Array.isArray(msg.list)) {
        const ids = new Set(royale.players.map((p) => p.pid));
        royale.standings = msg.list
          .filter((x) => x && ids.has(x.pid))
          .map((x) => ({ pid: x.pid, name: nameIn(x.pid), floor: Number(x.floor) || 0, steps: typeof x.steps === 'number' ? x.steps : undefined, finished: !!x.finished, alive: !!x.alive, ...(x.gone ? { gone: true } : {}) }));
        changed();
      }
      return;
    case 'bracket':
      if (!host && royale.active) {
        const ids = new Set(royale.players.map((p) => p.pid));
        royale.bracket = msg.b ? cleanBracket(msg.b, ids) : null;
        royale.champion = typeof msg.champion === 'string' && ids.has(msg.champion) ? msg.champion : null;
        changed();
      }
      return;
    case 'progress':
      if (host && royale.active) onProgress(pidOf(from), msg.p);
      return;
    case 'mstart':
      if (!royale.active || (host && from)) return;
      startMatch(
        String(msg.match),
        { ...msg.info, hostTeam: [], guestTeam: [], hostCreatures: cleanCreatures(msg.info.hostCreatures), guestCreatures: cleanCreatures(msg.info.guestCreatures) },
        msg.role === 'host' ? 'host' : 'guest',
        String(msg.opp),
      );
      return;
    case 'mresult':
      if (host && royale.active) onResult(pidOf(from), String(msg.match), !!msg.won);
      return;
    case 'relay':
      if (host) {
        const fromPid = pidOf(from);
        if (fromPid && typeof msg.to === 'string') relay(fromPid, msg.to, msg.m);
      } else onRelay(msg.from, msg.m);
      return;
    case 'quit':
      if (host && royale.active) {
        const pid = pidOf(from);
        if (pid) goneFor(pid);
      }
      return;
    case 'royaleEnd':
      if (!host && royale.active) {
        royale.ended = String(msg.why || `The ${royaleLabel()} ended.`).slice(0, 120);
        changed();
      }
      return;
  }
}

const nameIn = (pid: string) => royale.players.find((p) => p.pid === pid)?.name ?? 'Player';

session.onMessage(onMessage);

/** Guest leaving early: tell the host, so your matches go to your opponents. */
export function royaleQuit() {
  if (session.role === 'guest' && royale.active) session.send({ t: 'quit' });
}

/** Host leaving: tell everyone it's over. */
export function hostAbandonRoyale() {
  if (session.role === 'host' && royale.active && !royale.champion) session.send({ t: 'royaleEnd', why: `The host left, so the ${royaleLabel()} is over.` });
}
