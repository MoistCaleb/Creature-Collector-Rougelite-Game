import { isBoon } from '../data/boons';
import type { ArenaPick } from '../logic/arena';
import type { TrainerLook } from '../data/trainerLook';
import { makeArenaCreature } from '../logic/arena';
import { Battle, neutralLoad, neutralSave, type BattleEvent, type NeutralSave, type PlayerAction } from '../logic/battle';
import { isAlive, stats, type Creature } from '../logic/creature';
import { Rng } from '../logic/rng';
import { synergyMults } from '../logic/synergy';
import type { StatusId } from '../data/status';

/**
 * Live duels between two phones. The host's phone runs the real battle; the guest sends its
 * choices and receives each turn's events (flipped to its point of view) plus a snapshot of the
 * battle state, which it copies into its own display-only Battle.
 */

/** Bumped when battles change in ways both phones must agree on (2.0: traits, boons, speed attacks). */
export const DUEL_VERSION = 2;

/** What a session is for, chosen by the host before the code is made. */
export type GameMode = 'duel' | 'stage' | 'royale' | 'tourney';

export const GAME_MODES: Record<GameMode, { name: string; min: number; max: number; desc: string }> = {
  duel: { name: 'Arena duel', min: 2, max: 2, desc: 'Your saved Lv 50 teams battle live. Best of 1, 3 or 5. 3 potions per battle.' },
  stage: { name: 'Stage battle', min: 2, max: 2, desc: 'Both play the same stage; the boss at the end is the other player. Bring the potions you have left.' },
  royale: { name: 'Battle royale', min: 3, max: 8, desc: 'Everyone races the same stage; the survivors meet in a bracket. Bring the potions you have left.' },
  tourney: { name: 'Tournament', min: 3, max: 8, desc: 'Everyone’s Lv 50 Arena team goes straight into a knockout bracket. 5 potions for the whole tournament.' },
};

export const cleanMode = (x: unknown): GameMode => (typeof x === 'string' && x in GAME_MODES ? (x as GameMode) : 'duel');

/** What the player has to do next. */
export type Next =
  | { phase: 'choose' }
  /** Your creature fainted: pick the next one. */
  | { phase: 'switch' }
  /** The other player is picking their next creature. */
  | { phase: 'waitSwitch' }
  | { phase: 'end'; won: boolean };

/** The host's choices for a duel session. */
export interface DuelSettings {
  /** Battles in the series: first to win a majority takes it. */
  bestOf: number;
  /** Teams each player brings; before each battle they pick one of them. */
  teamsPerPlayer: number;
  /** Creatures from the chosen team that fight (the first N). */
  teamSize: number;
  level: number;
}

export const DEFAULT_SETTINGS: DuelSettings = { bestOf: 1, teamsPerPlayer: 1, teamSize: 4, level: 50 };

/** The values each setting cycles through. */
export const SETTING_CHOICES: Record<keyof DuelSettings, number[]> = {
  bestOf: [1, 3, 5],
  teamsPerPlayer: [1, 2, 3],
  teamSize: [1, 2, 3, 4],
  level: [25, 50, 75, 100],
};

/** Keep settings from the other phone within the allowed choices. */
export function cleanSettings(s: Partial<DuelSettings> | undefined): DuelSettings {
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(SETTING_CHOICES) as (keyof DuelSettings)[]) {
    const v = Number(s?.[k]);
    if (SETTING_CHOICES[k].includes(v)) out[k] = v;
  }
  return out;
}

export interface StartInfo {
  /** Creature level for Arena-style duels (default 50). */
  level?: number;
  seed: number;
  hostName: string;
  guestName: string;
  hostTeam: ArenaPick[];
  guestTeam: ArenaPick[];
  /** Potions each side may use in this battle, and how much one heals (fraction of max HP). None if absent. */
  potions?: { host: number; guest: number; hostHeal?: number; guestHeal?: number };
  /** Stage race finale: the teams as they finished their runs (levels, stars, items), fully healed. */
  hostCreatures?: Creature[];
  guestCreatures?: Creature[];
  /** Stage race finale and royale bracket (2.0): the boons each side picked on its climb. */
  hostBoons?: string[];
  guestBoons?: string[];
}

/** A stage race: both play the same map from the same seed, then duel with what they've got. */
export interface RaceInfo {
  seed: number;
  mapId: string;
  starters: string[];
  /** Online tournament: no stage, everyone brings their saved Lv 50 Arena team straight into the bracket. */
  tourney?: boolean;
}

/** Where a racer is: shown on the other phone's map. */
export interface RaceProgress {
  floor: number;
  /** Run over (won or lost). */
  finished: boolean;
  won: boolean;
  /** Steps left to the boss node (map layouts with rows). */
  steps?: number;
  /** Finished: potions left from the run, and how much one heals. */
  potions?: number;
  heal?: number;
  /** Team to bring to the final duel (empty if wiped out). */
  team?: Creature[];
  /** Boons picked on the climb (2.0): they apply in the duel and the bracket. */
  boons?: string[];
  /** Map node they're on, and their lead Hexling (shown grayed out on the other player's map). */
  at?: string;
  lead?: { speciesId: string; stage: number; shiny?: boolean; ancient?: boolean; alt?: boolean };
}

/** Someone in the session, as the host lists them for everyone. */
export interface RosterEntry {
  pid: string;
  name: string;
  look?: TrainerLook;
  title?: string;
  /** The host. */
  host?: boolean;
}

/** A battle royale racer's place, as the host shares it. */
export interface Standing {
  pid: string;
  name: string;
  floor: number;
  steps?: number;
  finished: boolean;
  /** Has a team for the bracket (or is still racing). */
  alive: boolean;
  /** Lost the connection for good. */
  gone?: boolean;
  /** In a battle on their climb right now (battle royale: others who are out can watch it). */
  fighting?: boolean;
  /** Map hex they're on, and their lead Hexling (drawn grayed out on everyone's map). */
  at?: string;
  lead?: { speciesId: string; stage: number; shiny?: boolean; ancient?: boolean; alt?: boolean };
}

export type DuelMsg =
  | { t: 'hello'; v: number; name: string; look?: TrainerLook; title?: string; teams: { name: string; picks: ArenaPick[] }[]; reply?: boolean; pid?: string }
  /** Host: everyone in the session. */
  | { t: 'roster'; players: RosterEntry[] }
  /** Host: you can't join right now (full, or a game is under way). */
  | { t: 'refuse'; why: string }
  /** Host: a battle royale starts on this map with these players. */
  | { t: 'royale'; race: RaceInfo; players: RosterEntry[] }
  | { t: 'standings'; list: Standing[] }
  /** Host: the tournament bracket (and the champion, once decided). */
  | { t: 'bracket'; b?: import('../logic/bracket').Bracket; champion?: string }
  /** Host: your bracket match starts (you run it as 'host', or follow as 'guest'). */
  | { t: 'mstart'; match: string; info: StartInfo; role: 'host' | 'guest'; opp: string }
  /** A match result, from a player to the host. */
  | { t: 'mresult'; match: string; won: boolean; left?: number; oppLeft?: number }
  /** A message between two guests in a match, passed along by the host. */
  | { t: 'relay'; to?: string; from?: string; m: DuelMsg }
  /** Guest: leaving the battle royale. */
  | { t: 'quit' }
  /** Host: the battle royale is over early (host left, everyone gone). */
  | { t: 'royaleEnd'; why: string }
  /** Host: the session's settings and its game mode (fixed when the host made the code). */
  | { t: 'settings'; s: DuelSettings; mode?: GameMode }
  /** Host: start a series with these settings (both go pick a team for battle 1). */
  | { t: 'series'; s: DuelSettings }
  /** Guest: the team it picked for the next battle. */
  | { t: 'pick'; index: number }
  | { t: 'start'; info: StartInfo }
  | { t: 'act'; a: PlayerAction }
  | { t: 'switch'; index: number }
  | { t: 'step'; events: BattleEvent[]; snap: Snap; next: Next }
  | { t: 'resume'; info: StartInfo; snap: Snap; next: Next }
  | { t: 'race'; race: RaceInfo }
  | { t: 'progress'; p: RaceProgress }
  /** Spectator to host: watch this bracket match ('' to stop watching). */
  | { t: 'watch'; match: string }
  /** Host to spectator: the match you asked to watch, as it stands. */
  | { t: 'wstart'; match: string; info: StartInfo; snap?: Snap; next?: Next; wild?: boolean }
  /** A turn of a bracket match, from its runner's side (runner to host, host to spectators). */
  | { t: 'wstep'; match: string; events: BattleEvent[]; snap: Snap; next: Next }
  /** Battle royale climb (racer to host): a battle on my climb starts, as it stands. */
  | { t: 'cstart'; info: StartInfo; snap: Snap; next: Next; wild?: boolean }
  /** A turn of that battle (racer to host). */
  | { t: 'cstep'; events: BattleEvent[]; snap: Snap; next: Next }
  /** That battle's screen closed (racer to host). */
  | { t: 'cend' }
  /** Host to spectators: the battle you're watching is over (or its player left). */
  | { t: 'wover'; match: string }
  /** The sender gives up this battle. */
  | { t: 'forfeit' }
  | { t: 'lobby' };

// ---------------------------------------------------------------- snapshots

interface SideSnap {
  hp: number;
  status: { id: StatusId; turns: number } | null;
  used: number[];
  atk: number;
  def: number;
  spd: number;
  sash: 'fired' | 'spent' | null;
  /** Neutral move effects on it (Jeer, Echo, Toll, Snare, Hush). */
  nx?: NeutralSave;
}

export interface Snap {
  player: SideSnap[];
  enemy: SideSnap[];
  pActive: number;
  eActive: number;
  /** Team effects up on each side, with turns left. */
  fx?: { player: Battle['teamFx']['player']; enemy: Battle['teamFx']['enemy'] };
  /** Time Warp turns left. */
  warp?: number;
  /** The weather and its turns left. */
  wx?: [string, number] | null;
  /** Potions left on each side. */
  pots?: { player: number; enemy: number };
  /** Night (Night Stalker, Eclipse, Turn of Day), or day brought by Turn of Day. */
  night?: boolean;
  dawn?: boolean;
}

export function snapshot(b: Battle): Snap {
  const side = (xs: Battle['player']): SideSnap[] =>
    xs.map((x) => ({
      hp: x.c.hp,
      status: x.c.status ? { ...x.c.status } : null,
      used: x.c.moves.map((m) => m.used ?? 0),
      atk: x.atkStage,
      def: x.defStage,
      spd: x.spdStage,
      sash: x.sash ?? null,
      nx: neutralSave(x),
    }));
  return { player: side(b.player), enemy: side(b.enemy), pActive: b.pActive, eActive: b.eActive, fx: { player: { ...b.teamFx.player }, enemy: { ...b.teamFx.enemy } }, warp: b.warp, wx: b.weather ? [b.weather, b.weatherLeft] : null, night: b.night, dawn: b.dawn };
}

/** A snapshot with each side's potions left (from the runner's side). */
const withPots = (snap: Snap, pots: { host: number; guest: number }): Snap => ({ ...snap, pots: { player: pots.host, enemy: pots.guest } });

/** The same state seen from the other side of the field. */
export function flipSnap(s: Snap): Snap {
  return { player: s.enemy, enemy: s.player, pActive: s.eActive, eActive: s.pActive, fx: s.fx ? { player: s.fx.enemy, enemy: s.fx.player } : undefined, warp: s.warp, wx: s.wx, pots: s.pots ? { player: s.pots.enemy, enemy: s.pots.player } : undefined, night: s.night, dawn: s.dawn };
}

export function applySnap(b: Battle, s: Snap) {
  const side = (xs: Battle['player'], ss: SideSnap[]) =>
    xs.forEach((x, i) => {
      const v = ss[i];
      if (!v) return;
      x.c.hp = v.hp;
      x.c.status = v.status ? { ...v.status } : undefined;
      x.c.moves.forEach((m, k) => (m.used = v.used[k] ?? 0));
      x.atkStage = v.atk;
      x.defStage = v.def;
      x.spdStage = v.spd;
      x.sash = v.sash ?? undefined;
      neutralLoad(x, v.nx ?? [0, 0, 0, 0, 0, 0, null]);
    });
  side(b.player, s.player);
  side(b.enemy, s.enemy);
  b.pActive = s.pActive;
  b.eActive = s.eActive;
  b.teamFx = { player: { ...(s.fx?.player ?? {}) }, enemy: { ...(s.fx?.enemy ?? {}) } };
  b.warp = Math.max(0, Math.min(9, Number(s.warp) || 0));
  b.setWeather(Array.isArray(s.wx) ? s.wx[0] : null, Array.isArray(s.wx) ? s.wx[1] : 0);
  b.night = !!s.night;
  b.dawn = !!s.dawn && !b.night;
}

/** Battle events seen from the other side of the field. */
export function flipEvents(events: BattleEvent[]): BattleEvent[] {
  const other = (s: 'player' | 'enemy') => (s === 'player' ? 'enemy' : 'player');
  return events.map((e): BattleEvent => {
    switch (e.kind) {
      case 'swap':
        return e.side === 'player' ? { kind: 'enemySend', index: e.index, hp: e.hp } : { ...e, side: other(e.side) };
      case 'enemySend':
        return { kind: 'swap', side: 'player', index: e.index, hp: e.hp };
      case 'text':
      case 'weather':
        return e;
      default:
        return { ...e, side: other(e.side) } as BattleEvent;
    }
  });
}

/** Build a duel battle from one player's point of view (host: player = host team). */
export function duelBattle(info: StartInfo, role: 'host' | 'guest'): Battle {
  const level = info.level ?? 50;
  const host = info.hostCreatures ? info.hostCreatures.map(readyForDuel) : info.hostTeam.map((p) => makeArenaCreature(p, { level }));
  const guest = info.guestCreatures ? info.guestCreatures.map(readyForDuel) : info.guestTeam.map((p) => makeArenaCreature(p, { level }));
  const [mine, theirs] = role === 'host' ? [host, guest] : [guest, host];
  const names = role === 'host' ? { player: info.hostName, enemy: info.guestName } : { player: info.guestName, enemy: info.hostName };
  const [myBoons, theirBoons] = role === 'host' ? [info.hostBoons, info.guestBoons] : [info.guestBoons, info.hostBoons];
  return new Battle(mine, theirs, new Rng(info.seed), {
    permadeath: false,
    duel: names,
    boons: { player: cleanBoonIds(myBoons), enemy: cleanBoonIds(theirBoons) },
    synergy: synergyMults(mine),
    enemySynergy: synergyMults(theirs),
  });
}

/** A run creature heading into the race finale: a copy, fully healed, no status, all move uses. */
export function readyForDuel(c: Creature): Creature {
  const x: Creature = JSON.parse(JSON.stringify(c));
  x.hp = stats(x).hp;
  x.status = undefined;
  for (const m of x.moves) m.used = 0;
  x.pendingMoves = [];
  return x;
}

// ---------------------------------------------------------------- turn flow

/** What the duel needs from the connection. */
export interface Link {
  send(msg: DuelMsg): void;
  /** Runner only: every resolved turn as this phone sees it (for spectators). */
  watch?(events: BattleEvent[], snap: Snap, next: Next): void;
}

/** What the duel needs from the battle screen. */
export interface DuelView {
  /** Play these events, then do what `next` says. */
  step(events: BattleEvent[], next: Next): void;
}

/**
 * Runs one duel for one phone. Host: collects both players' choices, resolves the turn on the real
 * battle and sends the result. Guest: forwards its choices and applies what the host sends.
 */
export class DuelController {
  readonly battle: Battle;
  private view: DuelView | null = null;
  private myAct: PlayerAction | null = null;
  private theirAct: PlayerAction | null = null;
  private mySwitch: number | null = null;
  private theirSwitch: number | null = null;
  private phase: 'choose' | 'switch' | 'end' = 'choose';
  /** Last state sent to the guest (host only), so a reconnecting guest can pick up from here. */
  lastGuestNext: Next = { phase: 'choose' };
  /** Potions left on each side (the runner keeps count; the guest copies it from each turn). */
  pots: { host: number; guest: number };

  constructor(
    readonly role: 'host' | 'guest',
    readonly info: StartInfo,
    private link: Link,
    battle?: Battle,
  ) {
    this.battle = battle ?? duelBattle(info, role);
    const n = (v: unknown) => Math.max(0, Math.min(99, Math.round(Number(v) || 0)));
    this.pots = { host: n(info.potions?.host), guest: n(info.potions?.guest) };
  }

  /** Potions this battle allows at all. */
  get potionsAllowed() {
    return !!this.info.potions;
  }

  /** Your potions left. */
  myPotions() {
    return this.role === 'host' ? this.pots.host : this.pots.guest;
  }

  /** How much one of your potions heals. */
  myHeal() {
    return potionHealOf(this.info, this.role);
  }

  /** Copy the potion counts from a turn the host sent (from your side of the field). */
  syncPots(snap: Snap | undefined) {
    if (!snap?.pots || this.role !== 'guest') return;
    const n = (v: unknown) => Math.max(0, Math.min(99, Math.round(Number(v) || 0)));
    this.pots = { guest: n(snap.pots.player), host: n(snap.pots.enemy) };
  }

  get opponentName() {
    return this.role === 'host' ? this.info.guestName : this.info.hostName;
  }

  attach(view: DuelView) {
    this.view = view;
  }

  /** Your move / switch for this turn. */
  submitAction(a: PlayerAction) {
    if (this.role === 'guest') return this.link.send({ t: 'act', a });
    if (this.phase !== 'choose') return;
    this.myAct = a;
    this.tryResolve();
  }

  /** Your replacement after a faint. */
  submitSwitch(index: number) {
    if (this.role === 'guest') return this.link.send({ t: 'switch', index });
    if (this.phase !== 'switch') return;
    this.mySwitch = index;
    this.tryResolve();
  }

  /** A message from the other phone. */
  /** Give up this battle: the other player wins it. */
  forfeit() {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.link.send({ t: 'forfeit' });
    this.view?.step([{ kind: 'text', text: 'You forfeit the battle.' }], { phase: 'end', won: false });
  }

  receive(msg: DuelMsg) {
    if (msg.t === 'forfeit') {
      if (this.phase === 'end') return;
      this.phase = 'end';
      this.view?.step([{ kind: 'text', text: `${this.opponentName} forfeits!` }], { phase: 'end', won: true });
      return;
    }
    if (this.role === 'guest') {
      if (msg.t === 'step') {
        applySnap(this.battle, msg.snap);
        this.syncPots(msg.snap);
        this.view?.step(msg.events, msg.next);
      }
      return;
    }
    if (msg.t === 'act' && this.phase === 'choose') {
      this.theirAct = msg.a;
      this.tryResolve();
    } else if (msg.t === 'switch' && this.phase === 'switch') {
      this.theirSwitch = msg.index;
      this.tryResolve();
    }
  }

  /** Host: what the guest needs to rejoin after a dropped connection. */
  resumeMsg(): DuelMsg {
    return { t: 'resume', info: this.info, snap: flipSnap(withPots(snapshot(this.battle), this.pots)), next: this.lastGuestNext };
  }

  private tryResolve() {
    const b = this.battle;
    if (this.phase === 'choose') {
      if (!this.myAct || !this.theirAct) return;
      const events = b.takeDuelTurn(this.potionCheck(this.myAct, 'host'), this.potionCheck(this.theirAct, 'guest'));
      this.myAct = this.theirAct = null;
      this.publish(events);
    } else if (this.phase === 'switch') {
      const meNeed = b.playerNeedsSwitch();
      const themNeed = b.enemyNeedsSwitch();
      if ((meNeed && this.mySwitch === null) || (themNeed && this.theirSwitch === null)) return;
      const events: BattleEvent[] = [];
      if (meNeed) events.push(...b.forcedSwitch(this.mySwitch!));
      if (themNeed) events.push(...b.forcedEnemySwitch(this.theirSwitch!));
      this.mySwitch = this.theirSwitch = null;
      this.publish(events);
    }
  }

  /** A potion only goes through if that side has one left (it heals the battle's set amount). */
  private potionCheck(a: PlayerAction, side: 'host' | 'guest'): PlayerAction {
    if (a.kind !== 'potion') return a;
    if (this.pots[side] <= 0) return { kind: 'move', index: -1 };
    this.pots[side]--;
    return { ...a, heal: potionHealOf(this.info, side) };
  }

  /** After resolving: work out what each side does next, then tell both screens. */
  private publish(events: BattleEvent[]) {
    const b = this.battle;
    const hostLost = b.player.every((x) => !isAlive(x.c));
    const guestLost = b.enemy.every((x) => !isAlive(x.c));
    let mine: Next;
    let theirs: Next;
    if (hostLost || guestLost) {
      // Both out at once counts as a loss for both.
      this.phase = 'end';
      mine = { phase: 'end', won: !hostLost };
      theirs = { phase: 'end', won: !guestLost };
    } else if (b.playerNeedsSwitch() || b.enemyNeedsSwitch()) {
      this.phase = 'switch';
      mine = { phase: b.playerNeedsSwitch() ? 'switch' : 'waitSwitch' };
      theirs = { phase: b.enemyNeedsSwitch() ? 'switch' : 'waitSwitch' };
    } else {
      this.phase = 'choose';
      mine = theirs = { phase: 'choose' };
    }
    this.lastGuestNext = theirs;
    const snap = withPots(snapshot(b), this.pots);
    this.link.send({ t: 'step', events: flipEvents(events), snap: flipSnap(snap), next: theirs });
    this.link.watch?.(events, snap, mine);
    this.view?.step(events, mine);
  }
}

/** How much a potion heals for one side of a battle (50% unless the battle says otherwise). */
export function potionHealOf(info: StartInfo, side: 'host' | 'guest'): number {
  const v = Number(side === 'host' ? info.potions?.hostHeal : info.potions?.guestHeal);
  return Number.isFinite(v) && v > 0 ? Math.min(1, v) : 0.5;
}

/** Only real boons (from the other phone, so checked). */
export function cleanBoonIds(list: unknown): string[] {
  return Array.isArray(list) ? [...new Set(list.filter(isBoon))].slice(0, 40) : [];
}
