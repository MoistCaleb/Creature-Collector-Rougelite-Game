import type { ArenaPick } from '../logic/arena';
import type { TrainerLook } from '../data/trainerLook';
import { makeArenaCreature } from '../logic/arena';
import { Battle, type BattleEvent, type PlayerAction } from '../logic/battle';
import { isAlive, stats, type Creature } from '../logic/creature';
import { Rng } from '../logic/rng';
import { synergyMults } from '../logic/synergy';
import type { StatusId } from '../data/status';

/**
 * Live duels between two phones. The host's phone runs the real battle; the guest sends its
 * choices and receives each turn's events (flipped to its point of view) plus a snapshot of the
 * battle state, which it copies into its own display-only Battle.
 */

export const DUEL_VERSION = 1;

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
  /** Stage race finale: the teams as they finished their runs (levels, stars, items), fully healed. */
  hostCreatures?: Creature[];
  guestCreatures?: Creature[];
}

/** A stage race: both play the same map from the same seed, then duel with what they've got. */
export interface RaceInfo {
  seed: number;
  mapId: string;
  starters: string[];
}

/** Where a racer is: shown on the other phone's map. */
export interface RaceProgress {
  floor: number;
  /** Run over (won or lost). */
  finished: boolean;
  won: boolean;
  /** Steps left to the boss node (map layouts with rows). */
  steps?: number;
  /** Team to bring to the final duel (empty if wiped out). */
  team?: Creature[];
}

export type DuelMsg =
  | { t: 'hello'; v: number; name: string; look?: TrainerLook; title?: string; teams: { name: string; picks: ArenaPick[] }[]; reply?: boolean }
  | { t: 'settings'; s: DuelSettings }
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
}

export interface Snap {
  player: SideSnap[];
  enemy: SideSnap[];
  pActive: number;
  eActive: number;
  /** Team effects up on each side, with turns left. */
  fx?: { player: Battle['teamFx']['player']; enemy: Battle['teamFx']['enemy'] };
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
    }));
  return { player: side(b.player), enemy: side(b.enemy), pActive: b.pActive, eActive: b.eActive, fx: { player: { ...b.teamFx.player }, enemy: { ...b.teamFx.enemy } } };
}

/** The same state seen from the other side of the field. */
export function flipSnap(s: Snap): Snap {
  return { player: s.enemy, enemy: s.player, pActive: s.eActive, eActive: s.pActive, fx: s.fx ? { player: s.fx.enemy, enemy: s.fx.player } : undefined };
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
    });
  side(b.player, s.player);
  side(b.enemy, s.enemy);
  b.pActive = s.pActive;
  b.eActive = s.eActive;
  b.teamFx = { player: { ...(s.fx?.player ?? {}) }, enemy: { ...(s.fx?.enemy ?? {}) } };
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
  return new Battle(mine, theirs, new Rng(info.seed), {
    permadeath: false,
    duel: names,
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

  constructor(
    readonly role: 'host' | 'guest',
    readonly info: StartInfo,
    private link: Link,
    battle?: Battle,
  ) {
    this.battle = battle ?? duelBattle(info, role);
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
    return { t: 'resume', info: this.info, snap: flipSnap(snapshot(this.battle)), next: this.lastGuestNext };
  }

  private tryResolve() {
    const b = this.battle;
    if (this.phase === 'choose') {
      if (!this.myAct || !this.theirAct) return;
      const events = b.takeDuelTurn(this.myAct, this.theirAct);
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
    this.link.send({ t: 'step', events: flipEvents(events), snap: flipSnap(snapshot(b)), next: theirs });
    this.view?.step(events, mine);
  }
}
