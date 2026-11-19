import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';
import { DexScene } from './scenes/DexScene';
import { BagScene } from './scenes/BagScene';
import { ArenaScene } from './scenes/ArenaScene';
import { DuelScene } from './scenes/DuelScene';
import { BracketScene } from './scenes/BracketScene';
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
import { RecordsScene } from './scenes/RecordsScene';
import { openSettings } from './ui/settings';
import { installMotionGuard } from './ui/motion';
import { openElementChart } from './ui/elementChart';
import { openHowToPlay } from './ui/howto';
import { tip } from './ui/tips';
import { loadMeta } from './logic/run';
import { state } from './state';
import { boardChanged, COLORS, FH, FW, landscapeReady, ZOOM } from './ui/widgets';

/** Start the game. Call once the save storage is ready. */
export function startGame() {
  state.meta = loadMeta();
  installMotionGuard();
  // Screens with a landscape layout (the rest stay upright, centered, when the phone is sideways).
  landscapeReady('Battle', 'Map', 'Title', 'MapSelect', 'Starter', 'Team', 'Bag', 'End', 'Daily', 'Trainer', 'Passives', 'Dex', 'Arena', 'Teams', 'ArenaEdit', 'ArenaPick', 'Duel', 'Bracket', 'Records');
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: Math.round(FW * ZOOM),
    height: Math.round(FH * ZOOM),
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
      BracketScene,
      TeamsScene,
      ArenaEditScene,
      ArenaPickScene,
      DailyScene,
      TrainerScene,
      EndScene,
      DexScene,
      PassivesScene,
      RecordsScene,
    ],
  });

  // Re-fit whenever the game's box really changes size: turning the phone, browser bars sliding,
  // the notch moving sides. Window resize events alone fire before a rotation settles (leaving the
  // canvas sized for the old orientation, i.e. "zoomed in"), so watch the box itself, and check
  // again once the rotation animation is over.
  // Turning the phone (or the screen changing shape) also swaps the board: screens restart (with
  // the same data) and lay themselves out again; battles pick up where they were.
  let relayout = false;
  const refit = () => {
    game.scale.refresh();
    const active = game.scene.getScenes(true);
    if (!relayout && active.some((s) => boardChanged(s.scene.key))) {
      relayout = true;
      active.forEach((s) => s.scene.restart());
      setTimeout(() => (relayout = false), 200);
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event('game-layout')));
  };
  const box = document.getElementById('game');
  if (box && 'ResizeObserver' in window) new ResizeObserver(refit).observe(box);
  const later = () => [100, 350, 800].forEach((ms) => setTimeout(refit, ms));
  window.addEventListener('orientationchange', later);
  window.visualViewport?.addEventListener('resize', later);

  // Handy for debugging in the browser console.
  // Handles for testing in the browser console (and screenshot scripts).
  Object.assign(window, { game, state, ui: { openSettings, openElementChart, openHowToPlay, tip } });
}
