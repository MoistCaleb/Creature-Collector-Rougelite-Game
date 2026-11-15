import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';
import { DexScene } from './scenes/DexScene';
import { EndScene } from './scenes/EndScene';
import { MapScene } from './scenes/MapScene';
import { MapSelectScene } from './scenes/MapSelectScene';
import { PassivesScene } from './scenes/PassivesScene';
import { StarterScene } from './scenes/StarterScene';
import { TeamScene } from './scenes/TeamScene';
import { TitleScene } from './scenes/TitleScene';
import { state } from './state';
import { COLORS, H, W } from './ui/widgets';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: COLORS.bg,
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [TitleScene, MapSelectScene, StarterScene, MapScene, BattleScene, TeamScene, EndScene, DexScene, PassivesScene],
});

// Handy for debugging in the browser console.
Object.assign(window, { game, state });
