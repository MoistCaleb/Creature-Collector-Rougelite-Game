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
import { background, button, COLORS, fullRect, H, LANDSCAPE, text, W } from '../ui/widgets';

type Part = (typeof LOOK_PARTS)[number];

const TILE_H = 50;
const TILE_GAP = 6;
/** Part tiles: two columns under the preview (upright), or three beside it (sideways). */
const tiles = () =>
  LANDSCAPE
    ? { x0: 196, top: 60, cols: 3, w: (W - 196 - 16 - 12) / 3 }
    : { x0: 16, top: 288, cols: 2, w: (W - 38) / 2 };

/** Which preview pose is showing (kept while you edit). */
let previewPose: TrainerPose = 'stand';

/** The swatch color for a part, when the part is a color. */
function swatch(key: keyof TrainerLook, v: number): number | null {
  if (key === 'skin') return SKIN_TONES[v];
  if (key === 'hairColor') return HAIR_COLORS[v];
  if (key === 'eyes') return EYE_COLORS[v];
  if (key === 'hatColor' || key === 'topColor' || key === 'accent' || key === 'bottomColor' || key === 'shoeColor') return CLOTH_COLORS[v];
  return null;
}

/**
 * Trainer editor: your name and how your trainer looks. Each part is a tile; tapping it opens a
 * picker that shows your trainer wearing every option. Your trainer stands beside your team in
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

  private set(next: TrainerLook) {
    state.meta.trainerLook = cleanLook(next);
    saveMeta(state.meta);
    this.scene.restart({ from: this.from });
  }

  create() {
    background(this);
    playMusic('title');
    const meta = state.meta;
    const look = myLook(meta);

    button(this, 40, 28, 64, 36, '', () => this.scene.start(this.from, {}), { fontSize: 15, glyph: 'back' });
    text(this, W / 2 + 20, 14, 'Your trainer', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);

    // Preview: tap it to see how you look in battle (from behind, giving an order).
    const py = LANDSCAPE ? -6 : 0;
    const panel = this.add.rectangle(16, 62 + py, 160, 212, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.add.ellipse(96, 248 + py, 110, 22, 0x000000, 0.35);
    const pose: TrainerPose = previewPose === 'stand' ? 'stand' : 'backCommand';
    const img = this.add.image(pose === 'backCommand' ? 105 : 96, 164 + py, ensureTrainerTexture(this, look, pose)).setScale(5);
    this.tweens.add({ targets: img, y: 160 + py, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    text(this, 96, 266 + py, pose === 'backCommand' ? 'In battle (from behind) · tap' : 'Tap to see it in battle', 10, COLORS.textDim).setOrigin(0.5, 1);
    panel.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      previewPose = previewPose === 'stand' ? 'back' : 'stand';
      this.scene.restart({ from: this.from });
    });

    // Name, shuffle and a note on where the trainer shows up.
    const nx = LANDSCAPE ? 96 : 307;
    const nw = LANDSCAPE ? 160 : 262;
    button(this, nx, LANDSCAPE ? 306 : 92, nw, 56, myName(meta), () => this.rename(), { fontSize: 20, sub: LANDSCAPE ? 'Tap to rename' : 'Your name · tap to change', color: 0x2f4a6b });
    button(this, nx, LANDSCAPE ? 364 : 158, nw, 44, 'Shuffle look', () => {
      sfx.coin();
      this.set(randomLook(new Rng((Math.random() * 2 ** 31) | 0)));
    }, { fontSize: 16 });
    text(
      this,
      LANDSCAPE ? 196 : 180,
      LANDSCAPE ? 352 : 192,
      'Your trainer stands beside your team in every battle. Online, your opponent sees your trainer and name, and you see theirs.',
      12,
      COLORS.textDim,
      { wordWrap: { width: LANDSCAPE ? W - 212 : 256 }, lineSpacing: 3 },
    );

    // One tile per part, two columns; tap to choose from a grid of previews.
    const t = tiles();
    const TILE_W = t.w;
    LOOK_PARTS.forEach((part, i) => {
      const x = t.x0 + (i % t.cols) * (TILE_W + 6);
      const y = t.top + Math.floor(i / t.cols) * (TILE_H + TILE_GAP);
      const v = look[part.key];
      const bg = this.add.rectangle(x, y, TILE_W, TILE_H, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke);
      text(this, x + 10, y + 6, part.label, 11, COLORS.textDim);
      const sw = swatch(part.key, v);
      if (sw !== null) this.add.rectangle(x + 10, y + 26, 16, 16, sw).setOrigin(0).setStrokeStyle(2, 0xffffff, 0.5);
      text(this, x + (sw !== null ? 32 : 10), y + 24, part.names[v], 15, COLORS.text, { fontStyle: 'bold' });
      text(this, x + TILE_W - 12, y + TILE_H / 2, '▾', 16, COLORS.textDim).setOrigin(1, 0.5);
      bg.setInteractive({ useHandCursor: true }).on('pointerup', () => this.openPart(part, look));
    });
  }

  /** A grid of every option for one part, each shown on your trainer; tap one to wear it. */
  private openPart(part: Part, look: TrainerLook) {
    const layer = this.add.container(0, 0).setDepth(50);
    layer.add(fullRect(this, 0x000000, 0.65).setInteractive());
    const pm = LANDSCAPE ? 10 : 30;
    layer.add(this.add.rectangle(10, pm, W - 20, H - 2 * pm, COLORS.bg).setOrigin(0).setStrokeStyle(2, COLORS.stroke));
    layer.add(text(this, W / 2, pm + 10, part.label, 22, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0));
    const n = part.names.length;
    const cols = LANDSCAPE ? 7 : 4;
    const cellW = (W - 36) / cols;
    const rows = Math.ceil(n / cols);
    const top = LANDSCAPE ? 50 : 84;
    const cellH = Math.min(118, (H - top - (LANDSCAPE ? 62 : 146)) / rows);
    // Colors of a hat you aren't wearing would show nothing: preview them on a cap.
    const base: TrainerLook = part.key === 'hatColor' && look.hat === 0 ? { ...look, hat: 1 } : look;
    const close = () => layer.destroy();
    part.names.forEach((name, v) => {
      const x = 18 + (v % cols) * cellW;
      const y = top + Math.floor(v / cols) * cellH;
      const current = look[part.key] === v;
      const cell = this.add
        .rectangle(x + 2, y, cellW - 4, cellH - 6, current ? 0x3a2f58 : COLORS.panel)
        .setOrigin(0)
        .setStrokeStyle(2, current ? 0xffc94d : COLORS.stroke, current ? 1 : 0.6);
      layer.add(cell);
      const preview = { ...base, [part.key]: v } as TrainerLook;
      const scale = Math.min(2.4, (cellH - 30) / 34);
      layer.add(this.add.image(x + cellW / 2, y + (cellH - 22) / 2, ensureTrainerTexture(this, preview, 'stand')).setScale(scale));
      const sw = swatch(part.key, v);
      if (sw !== null) layer.add(this.add.rectangle(x + 8, y + 6, 12, 12, sw).setOrigin(0).setStrokeStyle(1, 0xffffff, 0.6));
      const label = text(this, x + cellW / 2, y + cellH - 18, name, 11, current ? '#ffc94d' : COLORS.text, { fontStyle: current ? 'bold' : 'normal' }).setOrigin(0.5);
      if (label.width > cellW - 10) label.setScale((cellW - 10) / label.width);
      layer.add(label);
      cell.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        if (current) return close();
        sfx.coin();
        this.set({ ...look, [part.key]: v });
      });
    });
    layer.add(button(this, W / 2, LANDSCAPE ? H - 34 : H - 62, 200, LANDSCAPE ? 36 : 44, 'Close', close, { fontSize: 16 }));
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
