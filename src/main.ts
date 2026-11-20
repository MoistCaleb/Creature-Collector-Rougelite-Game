import { startGame } from './boot';
import { setupPwa } from './pwa';
import { initStorage } from './storage';
import { accountAtBoot } from './ui/accountUi';
import { startFriends } from './ui/friendsUi';
import { startRunClock } from './logic/runClock';
import { state } from './state';

setupPwa();

// Load the save (cloud copy when available) before any game state is read.
const el = document.getElementById('game');
const note = document.createElement('div');
note.textContent = 'Loading save…';
note.style.cssText = 'color:#8e86ad;font:16px sans-serif;text-align:center;padding-top:45vh';
el?.appendChild(note);

initStorage()
  .catch(() => {})
  // Signed in: sync with the account before the game reads the save.
  .then(() => accountAtBoot())
  .catch(() => {})
  .then(() => {
    note.remove();
    startGame();
    // How long runs take: active play only.
    startRunClock(
      () => state.run ?? null,
      () => (globalThis as unknown as { game?: { scene: { getScenes(active: boolean): { scene: { key: string } }[] } } }).game?.scene.getScenes(true)[0]?.scene.key ?? '',
    );
    // Friends: show as online, and hear about invites.
    void startFriends();
  });
