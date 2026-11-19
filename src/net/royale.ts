import { champion, cleanBracket, makeBracket, readyMatches, setWinner, type Bracket } from '../logic/bracket';
import type { Creature } from '../logic/creature';
import { Rng } from '../logic/rng';
import { activeTeam, makeArenaCreature } from '../logic/arena';
import { state } from '../state';
import { SPECIES } from '../data/species';
import { applySnap, duelBattle, DuelController, type DuelMsg, type Next, type Snap, type RaceInfo, type RaceProgress, type RosterEntry, type Standing, type StartInfo } from './duel';
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
  /** The match you're watching as a spectator (null: none). */
  watching: null as string | null,
  /** Host: each started match's teams, its latest turn, and who's watching it. */
  infos: new Map<string, StartInfo>(),
  lastStep: new Map<string, { snap: Snap; next: Next }>(),
  watchers: new Map<string, Set<string>>(),
  /** The match you're watching was decided (the battle screen winds down). */
  onWatchOver: null as (() => void) | null,
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
    this.watching = null;
    this.infos = new Map();
    this.lastStep = new Map();
    this.watchers = new Map();
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
      royale.infos.set(id, info);
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
  checkWatch();
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
  // Your own match starts: stop watching anyone else's.
  if (royale.watching) stopWatching();
  const c = new DuelController(role, info, {
    send: (m) => sendRelay(opp, m),
    // The runner shares every turn with the host, for anyone watching.
    watch: role === 'host' ? (events, snap, next) => sendWatchStep({ t: 'wstep', match: id, events, snap, next }) : undefined,
  });
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
  royale.watchers.delete(id);
  royale.lastStep.delete(id);
  const [round, index] = id.split('-').map(Number);
  const m = b?.rounds[round]?.[index];
  if (!b || !pid || !m || m.winner || (m.a !== pid && m.b !== pid)) return;
  const other = m.a === pid ? m.b! : m.a!;
  setWinner(b, round, index, won ? pid : other);
  schedule();
}

// ---------------------------------------------------------------- spectators

/** Can you watch this match? Both players known, not decided, not yours, and you aren't mid-match. */
export function canWatch(round: number, index: number): boolean {
  const m = royale.bracket?.rounds[round]?.[index];
  return !!m && !!m.a && !!m.b && !m.winner && m.a !== myPid && m.b !== myPid && !royale.match;
}

/** Ask to watch a bracket match live (the battle screen opens once the host answers). */
export function watchMatch(round: number, index: number) {
  if (!canWatch(round, index)) return;
  const id = `${round}-${index}`;
  royale.watching = id;
  if (session.role === 'host') onWatch(myPid, id);
  else session.send({ t: 'watch', match: id });
}

/** Stop watching (the caller goes back to the bracket). */
export function stopWatching() {
  if (!royale.watching) return;
  royale.watching = null;
  royale.onWatchOver = null;
  if (session.role === 'host') onWatch(myPid, '');
  else session.send({ t: 'watch', match: '' });
}

/** The runner's turn: to the host, who passes it on. */
function sendWatchStep(msg: Extract<DuelMsg, { t: 'wstep' }>) {
  if (session.role === 'host') onWatchStep(myPid, msg);
  else session.send(msg);
}

/** Host: someone wants to watch a match (or stop: ''). */
function onWatch(pid: string | undefined, id: string) {
  if (!pid) return;
  for (const set of royale.watchers.values()) set.delete(pid);
  const info = royale.infos.get(id);
  const [round, index] = id.split('-').map(Number);
  const m = royale.bracket?.rounds[round]?.[index];
  if (!info || !m || m.winner || m.a === pid || m.b === pid) return;
  if (!royale.watchers.has(id)) royale.watchers.set(id, new Set());
  royale.watchers.get(id)!.add(pid);
  const last = royale.lastStep.get(id);
  deliver(pid, { t: 'wstart', match: id, info, snap: last?.snap, next: last?.next });
}

/** Host: a match's runner played a turn; keep it and pass it to its watchers. */
function onWatchStep(pid: string | undefined, msg: Extract<DuelMsg, { t: 'wstep' }>) {
  const [round, index] = String(msg.match).split('-').map(Number);
  const m = royale.bracket?.rounds[round]?.[index];
  if (!pid || !m || m.a !== pid || !msg.snap || !Array.isArray(msg.events)) return;
  royale.lastStep.set(msg.match, { snap: msg.snap, next: msg.next });
  for (const w of royale.watchers.get(msg.match) ?? []) deliver(w, msg);
}

/** Spectator: the match you asked for, ready to show. */
let watchCtl: DuelController | null = null;

function onWatchStart(msg: Extract<DuelMsg, { t: 'wstart' }>) {
  if (royale.watching !== msg.match || royale.match) return;
  const info = { ...msg.info, hostTeam: [], guestTeam: [], hostCreatures: cleanCreatures(msg.info.hostCreatures), guestCreatures: cleanCreatures(msg.info.guestCreatures) };
  // The runner's side is "yours" on screen; the other player is the opponent.
  const battle = duelBattle(info, 'host');
  if (msg.snap) applySnap(battle, msg.snap);
  watchCtl = new DuelController('guest', info, { send: () => {} }, battle);
  const [round, index] = msg.match.split('-').map(Number);
  const m = royale.bracket?.rounds[round]?.[index];
  const a = royale.players.find((p) => p.pid === m?.a);
  const b = royale.players.find((p) => p.pid === m?.b);
  goTo('Battle', {
    kind: 'elite',
    match: {
      team: [],
      enemies: [],
      seed: info.seed,
      title: 'WATCHING',
      opponent: info.guestName,
      opponentLook: b?.look,
      opponentTitle: b?.title,
      randomness: 0,
      background: 0x14223a,
      duel: watchCtl,
      initialNext: msg.next?.phase === 'end' ? { phase: 'choose' } : msg.next,
      spectate: { player: info.hostName, playerLook: a?.look },
      onEnd: () => {},
    },
  });
}

function onWatchedStep(msg: Extract<DuelMsg, { t: 'wstep' }>) {
  if (royale.watching === msg.match && watchCtl) watchCtl.receive({ t: 'step', events: msg.events, snap: msg.snap, next: msg.next });
}

/** The match you're watching has a winner in the bracket: let the battle screen wrap up. */
function checkWatch() {
  const id = royale.watching;
  if (!id) return;
  const [round, index] = id.split('-').map(Number);
  if (royale.bracket?.rounds[round]?.[index]?.winner || royale.ended) royale.onWatchOver?.();
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
        checkWatch();
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
    case 'watch':
      if (host && royale.active) onWatch(pidOf(from), String(msg.match || ''));
      return;
    case 'wstart':
      if (!royale.active || (host && from)) return;
      onWatchStart(msg);
      return;
    case 'wstep':
      if (!royale.active) return;
      if (host && from) onWatchStep(pidOf(from), msg);
      else onWatchedStep(msg);
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
        checkWatch();
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
