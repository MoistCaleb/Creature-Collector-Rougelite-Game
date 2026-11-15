import Phaser from 'phaser';
import { ACHIEVEMENTS } from '../logic/achievements';
import { allCreatures, clearSavedRun, saveMeta } from '../logic/run';
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
    const earned = state.meta.newAchievements.splice(0);
    if (earned.length) {
      saveMeta(state.meta);
      lines.push(`Achievements: ${earned.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!.name).join(', ')}`);
    }
    const summary = text(this, W / 2, 160, lines.join('\n'), 16, COLORS.text, { align: 'center', lineSpacing: 6, wordWrap: { width: W - 40 } }).setOrigin(0.5, 0);

    const survivors = allCreatures(run);
    if (survivors.length) {
      const top = Math.max(290, 160 + summary.height + 20);
      text(this, 30, top, 'Survivors', 18, '#ffc94d');
      const room = Math.max(1, Math.floor((700 - top - 30) / 70));
      survivors.slice(0, Math.min(5, room)).forEach((c, i) => creatureRow(this, 30, top + 30 + i * 70, W - 60, c));
    }

    button(this, W / 2, 740, 260, 60, 'Back to title', () => {
      state.run = null;
      this.scene.start('Title');
    }, { color: 0x3b6d4a, fontSize: 20 });
  }
}
