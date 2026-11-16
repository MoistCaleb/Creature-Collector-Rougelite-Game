import type Phaser from 'phaser';
import type { ArenaPick } from '../logic/arena';
import { SPECIES_BY_ID } from '../data/species';
import { MOVES } from '../data/moves';
import type { BattleMatch } from '../scenes/BattleScene';
import { applySnap, DUEL_VERSION, DuelController, type DuelMsg, type Next, type StartInfo } from './duel';
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
};

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
      if (session.role === 'guest') beginDuel(new DuelController('guest', { ...msg.info, hostTeam: cleanTeam(msg.info.hostTeam), guestTeam: cleanTeam(msg.info.guestTeam) }, session));
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

/** Leave everything: connection, duel and opponent. */
export function leaveDuel() {
  duel.controller = null;
  duel.opponent = null;
  session.close();
}
