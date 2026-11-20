import type Phaser from 'phaser';
import { myLook } from '../data/trainerLook';
import { myTitle } from '../logic/titles';
import { GAME_MODES } from '../net/duel';
import { dismissInvite, friendsAvailable, listenForInvites, loadProfile, shareLook, startPresence, stopListening, type Invite } from '../net/friends';
import { session } from '../net/session';
import { state } from '../state';
import { card } from './accountUi';
import { sfx } from './sound';

/** What friends see you doing, from the screen you're on. */
function activityNow(): string {
  const g = (globalThis as unknown as { game?: Phaser.Game }).game;
  const key = g?.scene.getScenes(true)[0]?.scene.key ?? '';
  if (['Map', 'Battle', 'Team', 'Bag', 'Starter', 'MapSelect'].includes(key)) return session.role ? 'Playing online' : 'In a run';
  if (['Duel', 'Bracket'].includes(key)) return session.role ? 'In an online lobby' : 'Looking for a game';
  if (['Arena', 'Tournament', 'ArenaPick', 'ArenaEdit', 'Teams'].includes(key)) return 'In the Battle Arena';
  if (key === 'Camp') return 'Resting at camp';
  return 'Online';
}

let started = false;

/** Signed in with a username: show as online to friends, and pop up their invites. */
export async function startFriends() {
  if (started || !friendsAvailable()) return;
  try {
    const p = await loadProfile();
    if (!p) return;
    started = true;
    void shareLook(myLook(state.meta), myTitle(state.meta) ?? null).catch(() => {});
    startPresence(activityNow);
    listenForInvites(showInvite);
  } catch {
    /* offline or not set up: try again next launch */
  }
}

export function stopFriends() {
  stopListening();
  started = false;
}

/** "Sam invited you to a Battle royale": Join takes you straight into their lobby. */
function showInvite(inv: Invite) {
  if (Date.now() - inv.at > 10 * 60 * 1000) return;
  sfx.coin();
  const mode = GAME_MODES[inv.mode]?.name ?? 'game';
  if (session.role) {
    card({
      title: `${inv.username} invited you`,
      body: `They want you in their ${mode}, but you’re already in an online game. Leave it first, then join with code ${inv.code}.`,
      buttons: [{ label: 'OK', primary: true, onClick: (c) => (c.close(), void dismissInvite(inv.id)) }],
    });
    return;
  }
  card({
    title: `${inv.username} invited you!`,
    body: `Join their ${mode}?${inv.mode === 'duel' || inv.mode === 'tourney' ? ' You’ll bring your active Battle Arena team.' : ''}`,
    buttons: [
      { label: 'Not now', onClick: (c) => (c.close(), void dismissInvite(inv.id)) },
      {
        label: 'Join',
        primary: true,
        onClick: (c) => {
          c.close();
          void dismissInvite(inv.id);
          const g = (globalThis as unknown as { game?: Phaser.Game }).game;
          if (!g) return;
          // Leave whatever you're doing (a run is saved as you go) and go straight to their lobby.
          for (const s of g.scene.getScenes(true)) s.scene.stop();
          g.scene.start('Duel', { joinCode: inv.code });
        },
      },
    ],
  });
}
