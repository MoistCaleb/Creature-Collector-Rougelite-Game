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

/**
 * The board fills the whole screen. The layout (W x H) sits inside the phone's safe area (clear of
 * the notch / Dynamic Island and rounded corners), as large as it fits, and the rest of the screen
 * is margin: OX to the left of the layout and OY above it, FW x FH in all. Backgrounds, dimmers
 * and the battle scenery cover the margins too, so there are no empty bars on any phone shape.
 */
export let OX = 0;
export let OY = 0;
export let FW = 450;
export let FH = 800;

/** The phone's safe-area insets in CSS pixels (0 where there are none). */
function safeInsets() {
  // Tests can stand in for a device's insets.
  const fake = (window as unknown as { __insets?: { t: number; r: number; b: number; l: number } }).__insets;
  if (fake) return { ...fake };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return out;
}

/** How far a board may stretch across its short side on roomier screens (wider upright, taller sideways). */
export const BOARD_STRETCH = 1.25;

/** Screens whose layouts are fixed spots on the designed board, so they don't stretch. */
const FIXED_BOARD = new Set(['Battle']);

/** The board a scene should use on this screen right now. */
export function boardFor(key: string) {
  const wide = wantsWide(key);
  const base = { w: wide ? 800 : 450, h: wide ? 450 : 800 };
  if (typeof window === 'undefined') return { wide, bw: base.w, bh: base.h, ox: 0, oy: 0, fw: base.w, fh: base.h };
  const box = document.getElementById('game');
  const sw = box?.clientWidth || window.innerWidth;
  const sh = box?.clientHeight || window.innerHeight;
  const ins = safeInsets();
  // Sideways, the home bar only needs a thin strip: let the layout reach the bottom edge.
  if (wide) ins.b = Math.min(ins.b, 6);
  // A notch takes both sides alike (the phone reports it on both); an inset on one side only is an
  // overlay (like a foldable's status bubble), and keeping clear of it shoved the whole layout off
  // centre. Keep clear of the shared part only.
  const side = Math.min(ins.l, ins.r);
  ins.l = side;
  ins.r = side;
  const safeW = Math.max(1, sw - ins.l - ins.r);
  const safeH = Math.max(1, sh - ins.t - ins.b);
  const s = Math.min(safeW / base.w, safeH / base.h);
  // Wider (or taller) screens than the board: the board grows to use the room, up to a point
  // (layouts read W and H, so they spread out), and any rest is margin.
  // Screens laid out at fixed spots (the battle) keep the designed board; the scenery fills the rest.
  const stretch = FIXED_BOARD.has(key) ? 1 : BOARD_STRETCH;
  // Only across a board's short side (wider upright, taller sideways): ordinary phones, which are
  // narrower and taller than the board, keep it exactly as designed.
  const bw = wide ? base.w : Math.round(Math.min(base.w * stretch, Math.max(base.w, safeW / s)));
  const bh = wide ? Math.round(Math.min(base.h * stretch, Math.max(base.h, safeH / s))) : base.h;
  // Very unusual shapes (e.g. a nearly square unfolded screen) get at most this much margin.
  const fw = Math.round(Math.min(sw / s, bw * 1.6));
  const fh = Math.round(Math.min(sh / s, bh * 1.6));
  let ox = (ins.l + (safeW - bw * s) / 2) / s;
  let oy = (ins.t + (safeH - bh * s) / 2) / s;
  ox = Math.round(Math.max(0, Math.min(ox, fw - bw)));
  oy = Math.round(Math.max(0, Math.min(oy, fh - bh)));
  return { wide, bw, bh, ox, oy, fw, fh };
}

/** Does this scene need a different board than the one in use (turned phone, new screen size)? */
export function boardChanged(key: string) {
  const b = boardFor(key);
  return b.wide !== LANDSCAPE || Math.abs(b.fw - FW) > 2 || Math.abs(b.fh - FH) > 2 || Math.abs(b.ox - OX) > 2 || Math.abs(b.oy - OY) > 2;
}

/** Switch the board (and resize the canvas) for this scene and this screen. */
function useBoard(scene: Phaser.Scene) {
  const b = boardFor(scene.scene.key);
  LANDSCAPE = b.wide;
  W = b.bw;
  H = b.bh;
  OX = b.ox;
  OY = b.oy;
  if (b.fw !== FW || b.fh !== FH || Math.round(FW * ZOOM) !== scene.scale.width) {
    FW = b.fw;
    FH = b.fh;
    scene.scale.setGameSize(Math.round(FW * ZOOM), Math.round(FH * ZOOM));
  }
}

/** A rectangle over the whole screen, margins included (for dimmers and full-screen fills). */
export const fullRect = (scene: Phaser.Scene, color: number, alpha = 1) => scene.add.rectangle(-OX, -OY, FW, FH, color, alpha).setOrigin(0);

/** Clip a scrolling list to the rows between `top` and `bottom` (it must not slide into the margins). */
export function clipList(scene: Phaser.Scene, list: Phaser.GameObjects.Container, top: number, bottom = H) {
  const shape = scene.make.graphics({}, false).fillRect(-OX, top, FW, bottom - top);
  list.setMask(shape.createGeometryMask());
  scene.events.once('shutdown', () => shape.destroy());
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
  /** Keep the label on one line, shrinking it to fit (narrow buttons with long names). */
  oneLine?: boolean;
  /** Move the label and sub-line down (room for corner tags). */
  contentDy?: number;
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
    ...(opts.oneLine ? {} : { wordWrap: { width: w - 12 - iconW } }),
  }).setOrigin(0.5);
  if (opts.oneLine && t.width > w - 12 - iconW) t.setScale((w - 12 - iconW) / t.width);
  c.add([bg, t]);
  // Label above its sub-line, the pair centered (a sub that wraps pushes the label up, not over it).
  const subT = opts.sub ? text(scene, tx, 0, opts.sub, 12, COLORS.textDim, { align: 'center', wordWrap: { width: w - 12 - iconW } }).setOrigin(0.5, 0) : null;
  if (subT) {
    const total = t.displayHeight + 1 + subT.height;
    t.setY(-total / 2 + t.displayHeight / 2);
    subT.setY(t.y + t.displayHeight / 2 + 1);
  }
  if (opts.contentDy) {
    t.y += opts.contentDy;
    if (subT) subT.y += opts.contentDy;
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
    // A tap counts only when the press started on this button: a drag (scrolling a list) that
    // happens to end on a button doesn't press it.
    let pressedAt = -1;
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      pressedAt = p.downTime;
      bg.setFillStyle(Phaser.Display.Color.ValueToColor(color).lighten(15).color);
    });
    bg.on('pointerout', () => bg.setFillStyle(color));
    bg.on('pointerup', (p: Phaser.Input.Pointer) => {
      bg.setFillStyle(color);
      if (p.downTime !== pressedAt) return;
      pressedAt = -1;
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
  const key = ensureCreatureTexture(scene, c.speciesId, c.stage, c.shiny);
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
  cont.add(scene.add.image(34, h / 2, ensureCreatureTexture(scene, c.speciesId, c.stage, c.shiny)).setScale(1.8 * SPRITE_FIT));
  if (c.shiny) cont.add(iconImage(scene, 56, 12, 'sparkle', 14));
  const nameText = text(scene, 66, 6, `${creatureName(c)}  ${stars(c.stars)}`, 16);
  cont.add(nameText);
  const cap = levelCap(c);
  const lvText = text(scene, w - 8, 7, `Lv ${c.level}${c.level >= cap ? ' (MAX)' : ''}`, 13, c.level >= cap ? '#ffc94d' : COLORS.textDim).setOrigin(1, 0);
  cont.add(lvText);
  // The held item and status tag follow the name; on a narrow row (sideways lists) where they'd
  // run into the level, they move to the free space on the bottom line instead.
  const extras = (c.held ? 24 : 0) + (c.status ? 38 : 0);
  const fitsTop = 66 + nameText.width + 8 + extras <= w - 8 - lvText.width - 6;
  let tagX = fitsTop ? 66 + nameText.width + 8 : 66;
  const tagY = fitsTop ? 8 : 46;
  if (c.held) {
    cont.add(iconImage(scene, tagX + 4, tagY + 8, HELD[c.held].icon, 18));
    tagX += 24;
  }
  if (c.status) {
    const def = STATUS[c.status.id];
    cont.add(scene.add.rectangle(tagX, tagY, 34, 15, def.color).setOrigin(0));
    cont.add(text(scene, tagX + 17, tagY + 7.5, def.tag, 10, '#1a1426', { fontStyle: 'bold' }).setOrigin(0.5));
  }
  // Very long names still shrink rather than reach the level.
  const nameRoom = w - 8 - lvText.width - 6 - 66 - (fitsTop ? extras + 8 : 0);
  if (nameText.width > nameRoom) nameText.setScale(nameRoom / nameText.width);
  const chips = scene.add.container(66, 34);
  const t = creatureTypes(c);
  const unique = t[0] === t[1] ? [t[0]] : t;
  unique.forEach((el, i) => chips.add(typeChip(scene, i * 52, 0, el, true)));
  cont.add(chips);
  const max = stats(c).hp;
  // The bar sits right of the element tags; on a narrow row (sideways lists) it gets shorter
  // rather than covering them.
  const barX = Math.max(w - 128, 66 + unique.length * 52 + 4);
  const bar = new HpBar(scene, barX, 38, Math.max(40, w - 10 - barX), 8, false);
  bar.set(c.hp, max);
  cont.add(bar.objects());
  cont.add(text(scene, w - 8, 46, `${c.hp}/${max}`, 11, COLORS.textDim).setOrigin(1, 0));
  if (opts.note) cont.add(text(scene, fitsTop ? 66 : tagX + 6, 48, opts.note, 11, '#ffc94d'));
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
  scene.cameras.main.setOrigin(0, 0).setZoom(ZOOM).setScroll(-OX, -OY);
  fullRect(scene, color);
  if (decor !== 'none') menuBackdrop(scene, OX, OY, FW, FH, color, decor === 'title');
}
