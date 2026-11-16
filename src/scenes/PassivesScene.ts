import Phaser from 'phaser';
import { achievementFor, progress } from '../logic/achievements';
import { PASSIVES, saveMeta, type PassiveId } from '../logic/run';
import { state } from '../state';
import { Scroller } from '../ui/scroll';
import { background, button, COLORS, H, text, W } from '../ui/widgets';

const TOP = 84;

/** Trainer passives and the achievements that unlock them. Tap an unlocked passive to equip it. */
export class PassivesScene extends Phaser.Scene {
  private list!: Phaser.GameObjects.Container;
  private listH = 0;
  private scroller!: Scroller;

  constructor() {
    super('Passives');
  }

  create() {
    background(this);
    const meta = state.meta;
    this.list = this.add.container(0, TOP);
    this.list.setMask(this.make.graphics({}).fillRect(0, TOP, W, H - TOP).createGeometryMask());

    const ids = Object.keys(PASSIVES) as PassiveId[];
    // Unlocked first (equipped on top), then locked by how close they are.
    ids.sort((a, b) => {
      const ua = meta.unlockedPassives.includes(a) ? 1 : 0;
      const ub = meta.unlockedPassives.includes(b) ? 1 : 0;
      if (ua !== ub) return ub - ua;
      const pa = achievementFor(a) ? progress(meta, achievementFor(a)!) / achievementFor(a)!.goal : 1;
      const pb = achievementFor(b) ? progress(meta, achievementFor(b)!) / achievementFor(b)!.goal : 1;
      return pb - pa;
    });
    const rowH = 74;
    ids.forEach((id, i) => {
      const y = i * (rowH + 4);
      const p = PASSIVES[id];
      const ach = achievementFor(id);
      const unlocked = meta.unlockedPassives.includes(id);
      const equipped = meta.equippedPassive === id;
      const bg = this.add
        .rectangle(12, y, W - 24, rowH, unlocked ? COLORS.panel : 0x18141f)
        .setOrigin(0)
        .setStrokeStyle(2, equipped ? COLORS.accent : COLORS.stroke);
      this.list.add(bg);
      this.list.add(text(this, 24, y + 8, p.name + (equipped ? '  · equipped' : ''), 16, unlocked ? COLORS.text : '#6d6588', { fontStyle: 'bold' }));
      this.list.add(text(this, 24, y + 30, p.desc, 12, unlocked ? COLORS.textDim : '#5d5578', { wordWrap: { width: W - 170 } }));
      if (ach) {
        const have = Math.min(progress(meta, ach), ach.goal);
        this.list.add(text(this, 24, y + 52, `${ach.name}: ${ach.desc}`, 11, unlocked ? '#8fe08a' : '#a49cc0'));
        const bw = 110;
        this.list.add(this.add.rectangle(W - 24 - bw, y + 58, bw, 8, 0x0b0912).setOrigin(0, 0.5));
        this.list.add(this.add.rectangle(W - 24 - bw, y + 58, Math.max(2, (bw * have) / ach.goal), 8, unlocked ? 0x5fd068 : 0xffc94d).setOrigin(0, 0.5));
        this.list.add(text(this, W - 24, y + 36, `${have.toLocaleString()}/${ach.goal.toLocaleString()}`, 11, COLORS.textDim).setOrigin(1, 0));
      } else {
        this.list.add(text(this, 24, y + 52, 'Unlocked from the start', 11, '#8fe08a'));
      }
      if (unlocked) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerup', () => {
          if (this.scroller.moved) return;
          meta.equippedPassive = equipped ? null : id;
          saveMeta(meta);
          this.scene.restart();
        });
      }
    });
    this.listH = ids.length * (rowH + 4);

    // Header on top of the list.
    this.add.rectangle(0, 0, W, TOP - 4, COLORS.bg).setOrigin(0);
    text(this, 16, 14, 'Passives', 24, '#ffc94d', { fontStyle: 'bold' });
    const owned = meta.unlockedPassives.length;
    text(this, 16, 44, `${owned}/${ids.length} unlocked · tap one to equip\nAchievements count in every run, won or lost`, 12, COLORS.textDim, {
      lineSpacing: 2,
      wordWrap: { width: W - 130 },
    });
    button(this, W - 50, 30, 80, 40, 'Back', () => this.scene.start('Title', {}), { fontSize: 15 });

    // Drag / wheel to scroll, with flick momentum. A drag never counts as tapping a passive.
    const min = Math.min(TOP, H - this.listH - 16);
    this.scroller = new Scroller(this, {
      get: () => this.list.y,
      set: (y) => this.list.setY(y),
      min: () => min,
      max: () => TOP,
    });
  }
}
