import Phaser from 'phaser';
import { allCreatures, clearSavedRun } from '../logic/run';
import { state } from '../state';
import { background, button, COLORS, creatureRow, text, W } from '../ui/widgets';

export class EndScene extends Phaser.Scene {
  constructor() {
    super('End');
  }

  create(data: { won: boolean }) {
    background(this);
    const run = state.run!;
    clearSavedRun();
    text(this, W / 2, 70, data.won ? 'VICTORY!' : 'RUN OVER', 42, data.won ? '#ffc94d' : '#e0524a', {
      fontStyle: 'bold',
    }).setOrigin(0.5);
    text(
      this,
      W / 2,
      120,
      data.won ? 'You conquered all three floors.' : `You fell on floor ${run.floor + 1}.`,
      17,
      COLORS.textDim,
    ).setOrigin(0.5);

    const lines = [
      `Battles won: ${run.log.battlesWon}`,
      `Creatures caught: ${run.log.caught}`,
      `Creatures lost: ${run.log.lost}`,
    ];
    if (run.unlockedThisRun.length) lines.push(`Unlocked: ${run.unlockedThisRun.join(', ')}`);
    text(this, W / 2, 160, lines.join('\n'), 17, COLORS.text, { align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0);

    const survivors = allCreatures(run);
    if (survivors.length) {
      text(this, 30, 290, 'Survivors', 18, '#ffc94d');
      survivors.slice(0, 5).forEach((c, i) => creatureRow(this, 30, 320 + i * 70, W - 60, c));
    }

    button(this, W / 2, 740, 260, 60, 'Back to title', () => {
      state.run = null;
      this.scene.start('Title');
    }, { color: 0x3b6d4a, fontSize: 20 });
  }
}
