import Phaser from 'phaser';
import { ELEMENT_COLORS, elementTextColor, type Element } from '../data/types';
import { creatureName, creatureTypes, levelCap, stats, type Creature } from '../logic/creature';
import { ensureCreatureTexture } from './sprites';

export const W = 450;
export const H = 800;
export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export const COLORS = {
  bg: 0x12101c,
  panel: 0x221d33,
  panelLight: 0x2f2847,
  stroke: 0x4a4068,
  text: '#f2eefc',
  textDim: '#a49cc0',
  accent: 0xffc94d,
  good: 0x5fd068,
  bad: 0xe0524a,
};

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  size = 18,
  color = COLORS.text,
  style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, ...style });
}

export interface ButtonOpts {
  color?: number;
  enabled?: boolean;
  fontSize?: number;
  sub?: string;
  textColor?: string;
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: ButtonOpts = {},
): Phaser.GameObjects.Container {
  const enabled = opts.enabled ?? true;
  const color = opts.color ?? COLORS.panelLight;
  const c = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, color).setStrokeStyle(2, enabled ? 0xffffff : COLORS.stroke, enabled ? 0.35 : 0.6);
  const t = text(scene, 0, opts.sub ? -9 : 0, label, opts.fontSize ?? 18, opts.textColor ?? COLORS.text, {
    align: 'center',
    wordWrap: { width: w - 12 },
  }).setOrigin(0.5);
  c.add([bg, t]);
  if (opts.sub) c.add(text(scene, 0, 12, opts.sub, 12, COLORS.textDim, { align: 'center', wordWrap: { width: w - 12 } }).setOrigin(0.5));
  c.setSize(w, h);
  if (!enabled) c.setAlpha(0.45);
  else {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => bg.setFillStyle(Phaser.Display.Color.ValueToColor(color).lighten(15).color));
    bg.on('pointerout', () => bg.setFillStyle(color));
    bg.on('pointerup', () => {
      bg.setFillStyle(color);
      onClick();
    });
  }
  return c;
}

export function typeChip(scene: Phaser.Scene, x: number, y: number, el: Element, small = false): Phaser.GameObjects.Container {
  const w = small ? 48 : 60;
  const h = small ? 16 : 20;
  const c = scene.add.container(x, y);
  c.add(scene.add.rectangle(0, 0, w, h, ELEMENT_COLORS[el]).setOrigin(0, 0.5));
  c.add(text(scene, w / 2, 0, el.toUpperCase(), small ? 10 : 11, elementTextColor(el), { fontStyle: 'bold' }).setOrigin(0.5));
  return c;
}

export function typeChips(scene: Phaser.Scene, x: number, y: number, types: readonly Element[], small = false) {
  const w = small ? 52 : 64;
  const unique = types[0] === types[1] ? [types[0]] : types;
  unique.forEach((t, i) => typeChip(scene, x + i * w, y, t, small));
  if (unique.length === 1) text(scene, x + w, y, 'PURE', small ? 10 : 11, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0, 0.5);
}

export class HpBar {
  private bg: Phaser.GameObjects.Rectangle;
  private fill: Phaser.GameObjects.Rectangle;
  private label?: Phaser.GameObjects.Text;
  constructor(
    private scene: Phaser.Scene,
    x: number,
    y: number,
    private w: number,
    h = 10,
    showText = true,
  ) {
    this.bg = scene.add.rectangle(x, y, w, h, 0x0b0912).setOrigin(0, 0.5).setStrokeStyle(1, 0x000000);
    this.fill = scene.add.rectangle(x + 1, y, w - 2, h - 2, COLORS.good).setOrigin(0, 0.5);
    if (showText) this.label = text(scene, x + w, y + h, '', 12, COLORS.textDim).setOrigin(1, 0);
  }
  objects() {
    return [this.bg, this.fill, ...(this.label ? [this.label] : [])];
  }
  set(hp: number, max: number, animate = false) {
    const frac = Math.max(0, Math.min(1, hp / max));
    const color = frac > 0.5 ? COLORS.good : frac > 0.2 ? COLORS.accent : COLORS.bad;
    this.fill.setFillStyle(color);
    const target = Math.max(0, (this.w - 2) * frac);
    if (animate) this.scene.tweens.add({ targets: this.fill, width: target, duration: 350, ease: 'Quad.easeOut' });
    else this.fill.width = target;
    this.label?.setText(`${Math.max(0, Math.ceil(hp))} / ${max}`);
  }
}

export function creatureSprite(scene: Phaser.Scene, x: number, y: number, c: Creature, scale = 3): Phaser.GameObjects.Image {
  const key = ensureCreatureTexture(scene, c.speciesId, c.stage);
  return scene.add.image(x, y, key).setScale(scale);
}

export function stars(n: number): string {
  return n > 0 ? '★'.repeat(n) : '';
}

/** Compact creature row: sprite, name, level, types, hp. Returns the container (height ~64). */
export function creatureRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  c: Creature,
  opts: { onClick?: () => void; highlight?: boolean; dim?: boolean; note?: string } = {},
): Phaser.GameObjects.Container {
  const h = 64;
  const cont = scene.add.container(x, y);
  const bg = scene.add
    .rectangle(0, 0, w, h, opts.highlight ? 0x3d335e : COLORS.panel)
    .setOrigin(0)
    .setStrokeStyle(2, opts.highlight ? COLORS.accent : COLORS.stroke);
  cont.add(bg);
  cont.add(scene.add.image(34, h / 2, ensureCreatureTexture(scene, c.speciesId, c.stage)).setScale(1.8));
  cont.add(text(scene, 66, 6, `${creatureName(c)}  ${stars(c.stars)}`, 16));
  const cap = levelCap(c);
  cont.add(text(scene, w - 8, 7, `Lv ${c.level}${c.level >= cap ? ' (MAX)' : ''}`, 13, c.level >= cap ? '#ffc94d' : COLORS.textDim).setOrigin(1, 0));
  const chips = scene.add.container(66, 34);
  const t = creatureTypes(c);
  const unique = t[0] === t[1] ? [t[0]] : t;
  unique.forEach((el, i) => chips.add(typeChip(scene, i * 52, 0, el, true)));
  cont.add(chips);
  const max = stats(c).hp;
  const bar = new HpBar(scene, w - 128, 38, 118, 8, false);
  bar.set(c.hp, max);
  cont.add(bar.objects());
  cont.add(text(scene, w - 8, 46, `${c.hp}/${max}`, 11, COLORS.textDim).setOrigin(1, 0));
  if (opts.note) cont.add(text(scene, 66, 48, opts.note, 11, '#ffc94d'));
  if (opts.dim) cont.setAlpha(0.4);
  if (opts.onClick) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerup', opts.onClick);
  }
  cont.setSize(w, h);
  return cont;
}

export function background(scene: Phaser.Scene, color = COLORS.bg) {
  scene.add.rectangle(0, 0, W, H, color).setOrigin(0);
}
