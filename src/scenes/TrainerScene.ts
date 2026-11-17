import Phaser from 'phaser';
import {
  CLOTH_COLORS,
  cleanLook,
  EYE_COLORS,
  HAIR_COLORS,
  LOOK_PARTS,
  myLook,
  myName,
  randomLook,
  SKIN_TONES,
  type TrainerLook,
} from '../data/trainerLook';
import { Rng } from '../logic/rng';
import { saveMeta } from '../logic/run';
import { state } from '../state';
import { playMusic, sfx } from '../ui/sound';
import { ensureTrainerTexture, type TrainerPose } from '../ui/trainerSprite';
import { background, button, COLORS, text, W } from '../ui/widgets';

const ROW_TOP = 290;
const ROW_H = 44;

/** Which preview pose is showing (kept while you edit). */
let previewPose: TrainerPose = 'stand';

/** The swatch color for a part, when the part is a color. */
function swatch(key: keyof TrainerLook, v: number): number | null {
  if (key === 'skin') return SKIN_TONES[v];
  if (key === 'hairColor') return HAIR_COLORS[v];
  if (key === 'eyes') return EYE_COLORS[v];
  if (key === 'hatColor' || key === 'topColor' || key === 'accent' || key === 'bottomColor') return CLOTH_COLORS[v];
  return null;
}

/**
 * Trainer editor: your name and how your trainer looks. Your trainer stands beside your team in
 * every battle, and online your opponent sees it (and you see theirs).
 */
export class TrainerScene extends Phaser.Scene {
  private from = 'Title';

  constructor() {
    super('Trainer');
  }

  init(data: { from?: string }) {
    this.from = data.from ?? 'Title';
  }

  create() {
    background(this);
    playMusic('title');
    const meta = state.meta;
    const look = myLook(meta);
    const set = (next: TrainerLook) => {
      meta.trainerLook = cleanLook(next);
      saveMeta(meta);
      this.scene.restart({ from: this.from });
    };

    button(this, 40, 28, 64, 36, '', () => this.scene.start(this.from, {}), { fontSize: 15, glyph: 'back' });
    text(this, W / 2 + 20, 14, 'Your trainer', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);

    // Preview: tap it to see the battle pose.
    const panel = this.add.rectangle(16, 62, 150, 212, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.add.ellipse(91, 248, 110, 22, 0x000000, 0.35);
    const img = this.add.image(previewPose === 'command' ? 104 : 91, 160, ensureTrainerTexture(this, look, previewPose)).setScale(4.4);
    this.tweens.add({ targets: img, y: 156, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    text(this, 91, 266, previewPose === 'command' ? 'Battle pose · tap' : 'Tap for battle pose', 10, COLORS.textDim).setOrigin(0.5, 1);
    panel.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      previewPose = previewPose === 'stand' ? 'command' : 'stand';
      this.scene.restart({ from: this.from });
    });

    // Name, shuffle and a note on where the trainer shows up.
    button(this, 307, 92, 262, 56, myName(meta), () => this.rename(), { fontSize: 20, sub: 'Your name · tap to change', color: 0x2f4a6b });
    button(this, 307, 158, 262, 44, 'Shuffle look', () => {
      sfx.coin();
      set(randomLook(new Rng((Math.random() * 2 ** 31) | 0)));
    }, { fontSize: 16 });
    text(
      this,
      180,
      192,
      'Your trainer stands beside your team in every battle. Online, your opponent sees your trainer and name, and you see theirs.',
      12,
      COLORS.textDim,
      { wordWrap: { width: 256 }, lineSpacing: 3 },
    );

    // One row per part: ‹ value ›.
    LOOK_PARTS.forEach((part, i) => {
      const y = ROW_TOP + i * ROW_H;
      const v = look[part.key];
      const n = part.names.length;
      this.add.rectangle(16, y - 19, W - 32, ROW_H - 6, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke);
      text(this, 28, y, part.label, 15, COLORS.text, { fontStyle: 'bold' }).setOrigin(0, 0.5);
      button(this, 214, y, 44, 32, '‹', () => set({ ...look, [part.key]: (v - 1 + n) % n }), { fontSize: 20 });
      button(this, W - 42, y, 44, 32, '›', () => set({ ...look, [part.key]: (v + 1) % n }), { fontSize: 20 });
      const sw = swatch(part.key, v);
      const cx = (214 + W - 42) / 2;
      if (sw !== null) {
        this.add.rectangle(cx - 52, y, 16, 16, sw).setStrokeStyle(2, 0xffffff, 0.5);
        text(this, cx + 8, y, part.names[v], 14, COLORS.text).setOrigin(0.5);
      } else text(this, cx, y, part.names[v], 14, COLORS.text).setOrigin(0.5);
    });
  }

  private rename() {
    const meta = state.meta;
    const name = window.prompt('Your trainer name', myName(meta));
    if (name === null) return;
    meta.duelName = name.trim().slice(0, 16) || 'Trainer';
    saveMeta(meta);
    this.scene.restart({ from: this.from });
  }
}
