import Phaser from 'phaser';
import { BOON_COLOR, BOONS } from '../data/boons';
import { ELEMENT_COLORS } from '../data/types';
import { calm } from './motion';
import { text } from './widgets';

/** Lighter / darker shades of a colour, for gem facets. */
const shade = (c: number, by: number) => {
  const col = Phaser.Display.Color.ValueToColor(c);
  return (by > 0 ? col.lighten(by) : col.darken(-by)).color;
};

/**
 * One boon as a small cut gem: its rarity's colour, with an element dot for element boons. Mythics
 * get a gold rim, curses a dark crack. `s` is the gem's height in pixels.
 */
export function boonGem(scene: Phaser.Scene, x: number, y: number, id: string, s = 16): Phaser.GameObjects.Container {
  const b = BOONS[id];
  const c = scene.add.container(x, y);
  if (!b) return c;
  const base = BOON_COLOR[b.rarity];
  const h = s / 2;
  const g = scene.add.graphics();
  // Facets: light top-left, base right, dark bottom.
  g.fillStyle(shade(base, -25), 1).fillPoints([{ x: -h, y: 0 }, { x: h, y: 0 }, { x: 0, y: h }], true);
  g.fillStyle(base, 1).fillPoints([{ x: 0, y: -h }, { x: h, y: 0 }, { x: 0, y: 0 }], true);
  g.fillStyle(shade(base, 30), 1).fillPoints([{ x: 0, y: -h }, { x: -h, y: 0 }, { x: 0, y: 0 }], true);
  const rim = b.rarity === 'mythic' ? 0xfff1a8 : b.rarity === 'curse' ? 0x2a0c12 : 0xe8e0ff;
  g.lineStyle(Math.max(1, s / 12), rim, b.rarity === 'common' ? 0.7 : 1).strokePoints([{ x: 0, y: -h }, { x: h, y: 0 }, { x: 0, y: h }, { x: -h, y: 0 }], true);
  c.add(g);
  if (b.element) c.add(scene.add.circle(0, 0, Math.max(2, s / 7), ELEMENT_COLORS[b.element]).setStrokeStyle(1, 0x14101e));
  if (b.rarity === 'curse') c.add(scene.add.line(0, 0, -h / 3, -h / 2, h / 4, h / 2, 0x14101e).setLineWidth(1.5).setOrigin(0));
  return c;
}

/**
 * The boons you hold, at a glance: a gold-rimmed badge with a gem for each (rarest first) and the
 * count. It glows softly so it's easy to spot; tap it for the full list. `maxW` caps its width (extra
 * boons show as +N). Returns null when there are no boons. `pulse()` makes it flash (a boon fired).
 */
export function boonBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  ids: readonly string[],
  onTap: () => void,
  opts: { maxW?: number; h?: number; label?: boolean } = {},
): (Phaser.GameObjects.Container & { pulse: () => void }) | null {
  const held = ids.filter((id) => BOONS[id]);
  if (!held.length) return null;
  const order = { mythic: 0, rare: 1, common: 2, curse: 3 } as const;
  const sorted = [...held].sort((a, b) => order[BOONS[a].rarity] - order[BOONS[b].rarity]);
  const h = opts.h ?? 30;
  const gs = Math.round(h * 0.56);
  const step = gs + 3;
  const maxW = opts.maxW ?? 220;
  const c = scene.add.container(x, y) as Phaser.GameObjects.Container & { pulse: () => void };
  const parts: Phaser.GameObjects.GameObject[] = [];
  let cx = 10;
  if (opts.label !== false) {
    const lab = text(scene, cx, 0, 'BOONS', Math.round(h * 0.4), '#ffe9a8', { fontStyle: 'bold' }).setOrigin(0, 0.5);
    parts.push(lab);
    cx += lab.width + 8;
  }
  const count = text(scene, 0, 0, String(held.length), Math.round(h * 0.5), '#ffffff', { fontStyle: 'bold' }).setOrigin(0, 0.5);
  // How many gems fit before the count.
  const room = maxW - cx - count.width - 18;
  let fit = Math.max(1, Math.floor(room / step));
  if (fit < sorted.length) fit = Math.max(1, Math.floor((room - 22) / step));
  sorted.slice(0, fit).forEach((id, i) => parts.push(boonGem(scene, cx + gs / 2 + i * step, 0, id, gs)));
  cx += Math.min(fit, sorted.length) * step;
  if (sorted.length > fit) {
    const more = text(scene, cx, 0, `+${sorted.length - fit}`, Math.round(h * 0.4), '#c9b8ff', { fontStyle: 'bold' }).setOrigin(0, 0.5);
    parts.push(more);
    cx += more.width + 4;
  }
  count.setX(cx + 4);
  parts.push(count);
  const w = cx + 4 + count.width + 10;
  const glow = scene.add.rectangle(w / 2, 0, w + 8, h + 8, 0xffc94d, 0.18).setOrigin(0.5);
  const bg = scene.add
    .rectangle(w / 2, 0, w, h, 0x1c1430, 0.95)
    .setStrokeStyle(2, 0xffc94d)
    .setInteractive({ useHandCursor: true });
  bg.on('pointerup', onTap);
  c.add([glow, bg, ...parts]);
  c.setSize(w, h);
  if (!calm()) scene.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.32 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  c.pulse = () => {
    if (!c.active) return;
    glow.setAlpha(0.7);
    scene.tweens.add({ targets: glow, alpha: 0.18, duration: 500 });
    if (!calm()) scene.tweens.add({ targets: c, scale: { from: 1.12, to: 1 }, duration: 260, ease: 'Back.easeOut' });
  };
  return c;
}
