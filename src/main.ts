import { startGame } from './boot';
import { setupPwa } from './pwa';
import { initStorage } from './storage';
import { accountAtBoot } from './ui/accountUi';
import { startFriends } from './ui/friendsUi';

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
    // Friends: show as online, and hear about invites.
    void startFriends();
  });
