import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';
import { DexScene } from './scenes/DexScene';
import { BagScene } from './scenes/BagScene';
import { ArenaScene } from './scenes/ArenaScene';
import { DuelScene } from './scenes/DuelScene';
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
      EndScene,
      DexScene,
      PassivesScene,
    ],
  });

  // Handy for debugging in the browser console.
  Object.assign(window, { game, state });
}
