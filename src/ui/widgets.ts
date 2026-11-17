import Phaser from 'phaser';
import { menuBackdrop } from './backdrops';
import { HELD } from '../data/held';
import { STATUS } from '../data/status';
import { ELEMENT_COLORS, elementTextColor, type Element } from '../data/types';
import { creatureName, creatureTypes, levelCap, stats, type Creature } from '../logic/creature';
import { isMuted, setMuted, sfx } from './sound';
import { ensureCreatureTexture, SPRITE_FIT } from './sprites';
import { ensureIcon, icon as iconImage, type IconId } from './icons';

/**
 * The game is laid out on a 450x800 board held upright, or an 800x450 board for screens that
 * have a landscape layout when the device is held sideways. W and H always hold the current
 * board (they're live: read them when laying out, never copy them into module constants).
 */
export let W = 450;
export let H = 800;
/** True while the wide 800x450 board is in use. */
export let LANDSCAPE = false;

/** Screens (scene keys) that have a landscape layout; the rest stay upright, centered. */
const WIDE_READY = new Set<string>();
export function landscapeReady(...keys: string[]) {
  keys.forEach((k) => WIDE_READY.add(k));
}
/** Is the device held sideways (or a wide window)? */
export const deviceWide = () => typeof window !== 'undefined' && window.innerWidth > window.innerHeight * 1.1;
/** The board this scene should use right now. */
export const wantsWide = (key: string) => deviceWide() && WIDE_READY.has(key);

/** Switch the board (and resize the canvas) if this scene needs the other orientation. */
function useBoard(scene: Phaser.Scene) {
  const wide = wantsWide(scene.scene.key);
  if (wide === LANDSCAPE) return;
  LANDSCAPE = wide;
  W = wide ? 800 : 450;
  H = wide ? 450 : 800;
  scene.scale.setGameSize(Math.round(W * ZOOM), Math.round(H * ZOOM));
}

/**
 * ...but rendered at the screen's real pixel density so it stays sharp on phones. The canvas is
 * ZOOM times larger and every scene's camera zooms by ZOOM (see `background`), so layout code
 * keeps using 450x800 coordinates. Capped at 3 to keep the canvas a sensible size.
 * Sized for the screen held upright; the wide board fits a sideways screen at the same zoom, so
 * the game stays sharp whichever way the phone is turned.
 */
export const ZOOM = (() => {
  if (typeof window === 'undefined') return 1;
  const short = Math.min(window.innerWidth, window.innerHeight);
  const long = Math.max(window.innerWidth, window.innerHeight);
  const fit = Math.min(short / W, long / H);
  return Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * fit));
})();
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
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, resolution: ZOOM, ...style });
}

export interface ButtonOpts {
  color?: number;
  enabled?: boolean;
  fontSize?: number;
  sub?: string;
  textColor?: string;
  /** A creature sprite drawn at the left edge; text shifts right to make room. */
  icon?: Creature;
  /** A small gold tag on the top-right corner (e.g. "RECOMMENDED"), with a gold outline. */
  badge?: string;
  /** A pixel icon drawn just left of the label (or alone, when the label is empty). */
  glyph?: IconId;
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
  const iconW = opts.icon ? 64 : 0;
  const tx = iconW / 2;
  const t = text(scene, tx, 0, label, opts.fontSize ?? 18, opts.textColor ?? COLORS.text, {
    align: 'center',
    wordWrap: { width: w - 12 - iconW },
  }).setOrigin(0.5);
  c.add([bg, t]);
  // Label above its sub-line, the pair centered (a sub that wraps pushes the label up, not over it).
  const subT = opts.sub ? text(scene, tx, 0, opts.sub, 12, COLORS.textDim, { align: 'center', wordWrap: { width: w - 12 - iconW } }).setOrigin(0.5, 0) : null;
  if (subT) {
    const total = t.height + 1 + subT.height;
    t.setY(-total / 2 + t.height / 2);
    subT.setY(t.y + t.height / 2 + 1);
  }
  if (opts.glyph) {
    const size = Math.round((opts.fontSize ?? 18) * 1.25);
    const gap = label ? 6 : 0;
    const total = size + gap + (label ? t.width : 0);
    const left = tx - total / 2;
    const g = iconImage(scene, left + size / 2, t.y, opts.glyph, size).setName('glyph');
    t.setX(left + size + gap + t.width / 2);
    c.add(g);
  }
  if (opts.icon) c.add(creatureSprite(scene, -w / 2 + 32, -8, opts.icon, 1.6));
  if (subT) c.add(subT);
  if (opts.badge) {
    bg.setStrokeStyle(3, 0xffc94d, 1);
    const tag = text(scene, 0, 0, opts.badge, 10, '#1a1426', { fontStyle: 'bold' }).setOrigin(0.5);
    const tw = tag.width + 14;
    const bx = w / 2 - tw / 2 - 6;
    const by = -h / 2;
    tag.setPosition(bx, by);
    c.add([scene.add.rectangle(bx, by, tw, 18, 0xffc94d), tag]);
  }
  c.setSize(w, h);
  if (!enabled) c.setAlpha(0.45);
  else {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => bg.setFillStyle(Phaser.Display.Color.ValueToColor(color).lighten(15).color));
    bg.on('pointerout', () => bg.setFillStyle(color));
    bg.on('pointerup', () => {
      bg.setFillStyle(color);
      sfx.click();
      onClick();
    });
  }
  return c;
}

/** A small speaker toggle for sound and music. */
export function muteButton(scene: Phaser.Scene, x: number, y: number, size = 40) {
  const glyph = (): IconId => (isMuted() ? 'mute' : 'sound');
  const b = button(scene, x, y, size, size, '', () => {
    setMuted(!isMuted());
    setGlyph(b, glyph());
  }, { fontSize: Math.round(size * 0.5), glyph: glyph() });
  return b;
}

/** Swap the pixel icon on a button made with `glyph`. */
export function setGlyph(b: Phaser.GameObjects.Container, id: IconId) {
  const g = b.getByName('glyph') as Phaser.GameObjects.Image | null;
  g?.setTexture(ensureIcon(b.scene, id));
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
  return scene.add.image(x, y, key).setScale(scale * SPRITE_FIT);
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
  cont.add(scene.add.image(34, h / 2, ensureCreatureTexture(scene, c.speciesId, c.stage)).setScale(1.8 * SPRITE_FIT));
  const nameText = text(scene, 66, 6, `${creatureName(c)}  ${stars(c.stars)}`, 16);
  cont.add(nameText);
  let tagX = 66 + nameText.width + 8;
  if (c.held) {
    cont.add(iconImage(scene, tagX + 4, 16, HELD[c.held].icon, 18));
    tagX += 24;
  }
  if (c.status) {
    const def = STATUS[c.status.id];
    cont.add(scene.add.rectangle(tagX, 8, 34, 15, def.color).setOrigin(0));
    cont.add(text(scene, tagX + 17, 15.5, def.tag, 10, '#1a1426', { fontStyle: 'bold' }).setOrigin(0.5));
  }
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

export function background(scene: Phaser.Scene, color = COLORS.bg, decor: 'menu' | 'title' | 'none' = color === COLORS.bg ? 'menu' : 'none') {
  // Every scene draws its background first, so this is where the board is chosen (upright or
  // wide) and the camera gets its zoom.
  useBoard(scene);
  scene.cameras.main.setOrigin(0, 0).setZoom(ZOOM);
  scene.add.rectangle(0, 0, W, H, color).setOrigin(0);
  if (decor !== 'none') menuBackdrop(scene, W, H, color, decor === 'title');
}
