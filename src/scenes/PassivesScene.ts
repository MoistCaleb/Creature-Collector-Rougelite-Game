import Phaser from 'phaser';
import { achievementFor, progress } from '../logic/achievements';
import { PASSIVES, saveMeta, type PassiveId } from '../logic/run';
import { state } from '../state';
import { background, button, COLORS, text, W } from '../ui/widgets';

/** Trainer passives and the achievements that unlock them. Tap an unlocked passive to equip it. */
export class PassivesScene extends Phaser.Scene {
  constructor() {
    super('Passives');
  }

  create() {
    background(this);
    const meta = state.meta;
    text(this, 16, 14, 'Passives', 24, '#ffc94d', { fontStyle: 'bold' });
    text(this, 16, 44, 'Achievements unlock passives in any run, won or lost.\nTap an unlocked passive to equip it.', 12, COLORS.textDim, {
      lineSpacing: 2,
      wordWrap: { width: W - 130 },
    });
    button(this, W - 50, 30, 80, 40, 'Back', () => this.scene.start('Title'), { fontSize: 15 });

    const ids = Object.keys(PASSIVES) as PassiveId[];
    const rowH = 74;
    ids.forEach((id, i) => {
      const y = 84 + i * (rowH + 4);
      const p = PASSIVES[id];
      const ach = achievementFor(id);
      const unlocked = meta.unlockedPassives.includes(id);
      const equipped = meta.equippedPassive === id;
      const bg = this.add
        .rectangle(12, y, W - 24, rowH, unlocked ? COLORS.panel : 0x18141f)
        .setOrigin(0)
        .setStrokeStyle(2, equipped ? COLORS.accent : COLORS.stroke);
      text(this, 24, y + 8, p.name + (equipped ? '  · equipped' : ''), 16, unlocked ? COLORS.text : '#6d6588', { fontStyle: 'bold' });
      text(this, 24, y + 30, p.desc, 12, unlocked ? COLORS.textDim : '#5d5578');
      if (ach) {
        const have = Math.min(progress(meta, ach), ach.goal);
        const label = `${ach.name}: ${ach.desc}`;
        text(this, 24, y + 50, label, 11, unlocked ? '#8fe08a' : '#a49cc0');
        const bw = 110;
        this.add.rectangle(W - 24 - bw, y + 56, bw, 8, 0x0b0912).setOrigin(0, 0.5);
        this.add.rectangle(W - 24 - bw, y + 56, Math.max(2, (bw * have) / ach.goal), 8, unlocked ? 0x5fd068 : 0xffc94d).setOrigin(0, 0.5);
        text(this, W - 24, y + 36, `${have}/${ach.goal}`, 11, COLORS.textDim).setOrigin(1, 0);
      } else {
        text(this, 24, y + 50, 'Unlocked from the start', 11, '#8fe08a');
      }
      if (unlocked) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerup', () => {
          meta.equippedPassive = equipped ? null : id;
          saveMeta(meta);
          this.scene.restart();
        });
      }
    });
  }
}
