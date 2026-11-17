import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';
import { DexScene } from './scenes/DexScene';
import { BagScene } from './scenes/BagScene';
import { ArenaScene } from './scenes/ArenaScene';
import { DuelScene } from './scenes/DuelScene';
import { TeamsScene } from './scenes/TeamsScene';
import { ArenaEditScene } from './scenes/ArenaEditScene';
import { ArenaPickScene } from './scenes/ArenaPickScene';
import { DailyScene } from './scenes/DailyScene';
import { TrainerScene } from './scenes/TrainerScene';
import { EndScene } from './scenes/EndScene';
import { MapScene } from './scenes/MapScene';
import { MapSelectScene } from './scenes/MapSelectScene';
import { PassivesScene } from './scenes/PassivesScene';
import { StarterScene } from './scenes/StarterScene';
import { TeamScene } from './scenes/TeamScene';
import { TitleScene } from './scenes/TitleScene';
import { loadMeta } from './logic/run';
import { state } from './state';
import { COLORS, H, W, ZOOM } from './ui/widgets';

/** Start the game. Call once the save storage is ready. */
export function startGame() {
  state.meta = loadMeta();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: Math.round(W * ZOOM),
    height: Math.round(H * ZOOM),
    backgroundColor: COLORS.bg,
    pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [
      TitleScene,
      MapSelectScene,
      StarterScene,
      MapScene,
      BattleScene,
      TeamScene,
      BagScene,
      ArenaScene,
      DuelScene,
      TeamsScene,
      ArenaEditScene,
      ArenaPickScene,
      DailyScene,
      TrainerScene,
      EndScene,
      DexScene,
      PassivesScene,
    ],
  });

  // Re-fit whenever the game's box really changes size: turning the phone, browser bars sliding,
  // the notch moving sides. Window resize events alone fire before a rotation settles (leaving the
  // canvas sized for the old orientation, i.e. "zoomed in"), so watch the box itself, and check
  // again once the rotation animation is over.
  const refit = () => {
    game.scale.refresh();
    requestAnimationFrame(() => window.dispatchEvent(new Event('game-layout')));
  };
  const box = document.getElementById('game');
  if (box && 'ResizeObserver' in window) new ResizeObserver(refit).observe(box);
  const later = () => [100, 350, 800].forEach((ms) => setTimeout(refit, ms));
  window.addEventListener('orientationchange', later);
  window.visualViewport?.addEventListener('resize', later);

  // Handy for debugging in the browser console.
  Object.assign(window, { game, state });
}
