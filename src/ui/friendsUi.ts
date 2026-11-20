import type Phaser from 'phaser';
import { cleanName, myLook, myName, nameProblem } from '../data/trainerLook';
import { saveMeta } from '../logic/run';
import { myTitle } from '../logic/titles';
import { GAME_MODES } from '../net/duel';
import { claimUsername, dismissInvite, friendsAvailable, listenForInvites, loadProfile, shareLook, startPresence, stopListening, type Invite } from '../net/friends';
import { postMyScores } from '../net/leaderboard';
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
let scoreTimer: ReturnType<typeof setInterval> | null = null;

/** Signed in with a username: show as online to friends, and pop up their invites. */
export async function startFriends() {
  if (started || !friendsAvailable()) return;
  try {
    const p = await loadProfile();
    if (!p) return;
    started = true;
    // Your username is your trainer name: if they drifted apart (renamed while offline), line them up.
    const name = myName(state.meta);
    if (p.username !== name) {
      try {
        if (nameProblem(name) || name === 'Trainer') throw new Error('keep');
        await claimUsername(name);
      } catch {
        state.meta.duelName = p.username;
        saveMeta(state.meta);
      }
    }
    void shareLook(myLook(state.meta), myTitle(state.meta) ?? null).catch(() => {});
    startPresence(activityNow);
    listenForInvites(showInvite);
    // Leaderboards: send your numbers now and whenever they change (checked every minute).
    void postMyScores(state.meta);
    scoreTimer ??= setInterval(() => document.visibilityState === 'visible' && void postMyScores(state.meta), 60_000);
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

/**
 * Change your trainer name, which is also your username for friends: signed in, the name has to
 * be free (it's claimed on the server first); otherwise it just changes on this device.
 */
export function editTrainerName(o: { title?: string; body?: string; onDone: () => void; onCancel?: () => void }) {
  const signedIn = friendsAvailable();
  card({
    title: o.title ?? 'Your trainer name',
    body:
      o.body ??
      `Shown in battles and to other players${signedIn ? ', and it’s your username on friends lists and leaderboards' : ''}. 3 to 16 letters, numbers, spaces, _ - or .`,
    field: { type: 'text', placeholder: 'Trainer name', value: myName(state.meta) === 'Trainer' ? '' : myName(state.meta) },
    buttons: [
      { label: 'Cancel', onClick: (c) => (c.close(), o.onCancel?.()) },
      {
        label: 'Save',
        primary: true,
        onClick: async (c) => {
          const name = cleanName(c.value());
          const problem = nameProblem(name);
          if (problem) return c.status(problem, 'error');
          c.busy(true);
          try {
            // Signed in: the name must be free (it becomes your username too). Before friends are
            // set up on the server, it just changes here.
            if (signedIn) {
              try {
                await claimUsername(name);
              } catch (e) {
                if (!(e instanceof Error && /set up on the server/.test(e.message))) throw e;
              }
            }
            state.meta.duelName = name;
            saveMeta(state.meta);
            c.close();
            // A brand-new username: start showing as online and listening for invites now.
            void startFriends();
            o.onDone();
          } catch (e) {
            c.busy(false);
            c.status(e instanceof Error ? e.message : 'Couldn’t save that name.', 'error');
          }
        },
      },
    ],
  });
}
