import Phaser from 'phaser';
import { BOON_COLOR, BOONS, type BoonRarity } from '../data/boons';
import { boonGem } from './boonUi';
import { calm } from './motion';
import { holdScroll } from './scroll';
import { button, fullRect, H, LANDSCAPE, text, typeChip, W } from './widgets';

const RARITY_TAG: Record<BoonRarity, string> = { common: 'BOON', rare: '◆ RARE', mythic: '✦ MYTHIC', curse: '☠ CURSE' };
const RARITY_RANK: Record<BoonRarity, number> = { curse: 0, common: 1, rare: 2, mythic: 3 };
const light = (c: number, by: number) => Phaser.Display.Color.ValueToColor(c).lighten(by).color;

export interface BoonCardsConfig {
  ids: string[];
  title: string;
  subtitle: string;
  cancelLabel: string;
  onPick: (i: number) => void;
  onCancel: () => void;
}

/**
 * The boon offer as cards: dealt onto a dark stage with light rays behind them, each framed in its
 * rarity's colour with a big gem. Mythics shimmer gold, curses smoulder red. Tap one and it flares
 * while the others fall away. Upright the cards stack; sideways they stand in a row.
 */
export function openBoonCards(scene: Phaser.Scene, cfg: BoonCardsConfig): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setDepth(1000);
  holdScroll(root);
  const still = calm();
  root.add(fullRect(scene, 0x07040f, 0.92).setInteractive());

  // Rays from behind the cards, coloured by the best card on offer.
  const best = cfg.ids.map((id) => BOONS[id]?.rarity ?? 'common').sort((a, b) => RARITY_RANK[b] - RARITY_RANK[a])[0];
  const rayCol = best === 'mythic' ? 0xffd36a : best === 'rare' ? 0xb07aff : best === 'curse' ? 0xff5a6a : 0x7aa8ff;
  const cx = W / 2;
  const cy = LANDSCAPE ? H / 2 + 20 : H / 2 + 10;
  const rays = scene.add.graphics({ x: cx, y: cy }).setBlendMode(Phaser.BlendModes.ADD);
  const R = Math.max(W, H) * 1.1;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    rays.fillStyle(rayCol, i % 2 ? 0.05 : 0.09);
    rays.fillTriangle(0, 0, Math.cos(a - 0.09) * R, Math.sin(a - 0.09) * R, Math.cos(a + 0.09) * R, Math.sin(a + 0.09) * R);
  }
  root.add(rays);
  if (!still) scene.tweens.add({ targets: rays, angle: 360, duration: 60000, repeat: -1 });
  root.add(scene.add.circle(cx, cy, Math.min(W, H) * 0.36, rayCol, 0.08).setBlendMode(Phaser.BlendModes.ADD));

  // Title.
  const ty = LANDSCAPE ? 30 : 64;
  const title = text(scene, cx, ty, cfg.title.toUpperCase(), LANDSCAPE ? 26 : 28, '#ffe9a8', { fontStyle: 'bold', stroke: '#3a2408', strokeThickness: 6 }).setOrigin(0.5);
  const sub = text(scene, cx, ty + (LANDSCAPE ? 26 : 32), cfg.subtitle, 14, '#d8ccff', { align: 'center', wordWrap: { width: W - 60 } }).setOrigin(0.5, 0);
  root.add([title, sub]);
  if (!still) {
    title.setScale(0.6).setAlpha(0);
    scene.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, ease: 'Back.easeOut' });
  }

  // Card slots.
  const n = cfg.ids.length;
  const top = ty + (LANDSCAPE ? 30 : 38) + sub.height + (LANDSCAPE ? 12 : 18);
  const bottom = H - (LANDSCAPE ? 62 : 84);
  const gap = LANDSCAPE ? 14 : 12;
  const slots: { x: number; y: number; w: number; h: number }[] = [];
  if (LANDSCAPE) {
    const w = Math.min(230, (W - 48 - gap * (n - 1)) / n);
    const h = Math.min(300, bottom - top);
    const x0 = cx - (n * w + (n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) slots.push({ x: x0 + i * (w + gap) + w / 2, y: top + h / 2, w, h });
  } else {
    const w = W - 36;
    const h = Math.min(168, (bottom - top - gap * (n - 1)) / n);
    const y0 = top + (bottom - top - (n * h + (n - 1) * gap)) / 2;
    for (let i = 0; i < n; i++) slots.push({ x: cx, y: y0 + i * (h + gap) + h / 2, w, h });
  }

  let chosen = false;
  const cards: Phaser.GameObjects.Container[] = [];
  cfg.ids.forEach((id, i) => {
    const card = makeCard(scene, id, slots[i], still, () => {
      if (chosen) return;
      chosen = true;
      choose(i);
    });
    root.add(card);
    cards.push(card);
    // Dealt in, one after another.
    if (!still) {
      const s = slots[i];
      card.setAlpha(0).setScale(0.7).setPosition(s.x, s.y + (LANDSCAPE ? 120 : 60));
      card.setAngle(LANDSCAPE ? (i - (n - 1) / 2) * 6 : 0);
      scene.tweens.add({ targets: card, alpha: 1, scale: 1, y: s.y, angle: 0, delay: 140 + i * 130, duration: 420, ease: 'Back.easeOut' });
    }
  });

  const skip = button(scene, cx, H - (LANDSCAPE ? 30 : 42), 200, 44, cfg.cancelLabel, () => {
    if (chosen) return;
    chosen = true;
    root.destroy();
    cfg.onCancel();
  }, { fontSize: 16, color: 0x2a2440 });
  root.add(skip);

  const choose = (i: number) => {
    const card = cards[i];
    const r = BOONS[cfg.ids[i]].rarity;
    cards.forEach((c, k) => {
      if (k === i) return;
      if (still) c.setAlpha(0.25);
      else scene.tweens.add({ targets: c, alpha: 0, y: c.y + 40, scale: 0.85, duration: 260, ease: 'Quad.easeIn' });
    });
    skip.setAlpha(0.3);
    root.bringToTop(card);
    const s = slots[i];
    const flash = scene.add.rectangle(s.x, s.y, s.w, s.h, r === 'curse' ? 0xff4a5a : 0xffffff, 0.85).setBlendMode(Phaser.BlendModes.ADD);
    root.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, scaleX: 1.15, scaleY: 1.3, duration: 420 });
    if (!still) {
      scene.tweens.add({ targets: card, scale: 1.08, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
      burst(scene, root, s.x, s.y, BOON_COLOR[r], r === 'mythic' ? 26 : 16);
    }
    scene.time.delayedCall(still ? 200 : 560, () => {
      root.destroy();
      cfg.onPick(i);
    });
  };
  return root;
}

function makeCard(scene: Phaser.Scene, id: string, s: { x: number; y: number; w: number; h: number }, still: boolean, onTap: () => void): Phaser.GameObjects.Container {
  const b = BOONS[id];
  const col = BOON_COLOR[b.rarity];
  const c = scene.add.container(s.x, s.y);
  const hw = s.w / 2;
  const hh = s.h / 2;
  // Glow, frame, body, a band of colour at the top.
  const glow = scene.add.rectangle(0, 0, s.w + 14, s.h + 14, light(col, 15), b.rarity === 'common' ? 0.16 : 0.3).setBlendMode(Phaser.BlendModes.ADD);
  const body = scene.add.rectangle(0, 0, s.w, s.h, b.rarity === 'curse' ? 0x1e0a10 : 0x17112a, 1).setStrokeStyle(3, light(col, 25));
  const band = LANDSCAPE
    ? scene.add.rectangle(0, -hh + 50, s.w - 6, 94, col, 0.35)
    : scene.add.rectangle(-hw + 50, 0, 94, s.h - 6, col, 0.35);
  const inner = scene.add.rectangle(0, 0, s.w - 10, s.h - 10).setStrokeStyle(1, light(col, 40), 0.35);
  c.add([glow, body, band, inner]);
  if (!still) scene.tweens.add({ targets: glow, alpha: { from: glow.alpha, to: glow.alpha * 0.4 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  // The gem, big, on a halo.
  const gx = LANDSCAPE ? 0 : -hw + 50;
  const gy = LANDSCAPE ? -hh + 50 : 0;
  const halo = scene.add.circle(gx, gy, 32, light(col, 30), 0.22).setBlendMode(Phaser.BlendModes.ADD);
  const gem = boonGem(scene, gx, gy, id, 46);
  c.add([halo, gem]);
  if (!still) {
    scene.tweens.add({ targets: halo, scale: { from: 0.85, to: 1.2 }, alpha: { from: 0.3, to: 0.08 }, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: gem, y: gy - 4, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // Words: rarity tag, name, element, what it does.
  const tx = LANDSCAPE ? -hw + 12 : -hw + 108;
  const tw = LANDSCAPE ? s.w - 24 : s.w - 120;
  let y = LANDSCAPE ? -hh + 106 : -hh + 12;
  const tagCol = b.rarity === 'mythic' ? '#ffd36a' : b.rarity === 'rare' ? '#d2b0ff' : b.rarity === 'curse' ? '#ff7a86' : '#9ec4ff';
  const tag = text(scene, tx, y, RARITY_TAG[b.rarity], 11, tagCol, { fontStyle: 'bold' });
  c.add(tag);
  if (b.element) c.add(typeChip(scene, tx + tag.width + 8, y + 7, b.element, true));
  y += 18;
  const name = text(scene, tx, y, b.name, LANDSCAPE ? 19 : 20, '#ffffff', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 3 });
  if (name.width > tw) name.setScale(tw / name.width, 1);
  c.add(name);
  y += name.height + 4;
  const room = hh - 8 - y;
  const fs = LANDSCAPE ? 12 : 13;
  if (b.rarity === 'curse') {
    const d1 = text(scene, tx, y, `✗ ${b.drawback}`, fs, '#ff9aa4', { wordWrap: { width: tw }, lineSpacing: 2 });
    const d2 = text(scene, tx, y + d1.height + 4, `✓ ${b.reward}`, fs, '#9cf0a8', { wordWrap: { width: tw }, lineSpacing: 2 });
    const tot = d1.height + 4 + d2.height;
    if (tot > room) [d1, d2].forEach((t) => t.setScale(Math.max(0.75, room / tot)).setY(y + (t === d2 ? (d1.height + 4) * Math.max(0.75, room / tot) : 0)));
    c.add([d1, d2]);
  } else {
    const d = text(scene, tx, y, b.desc, fs, '#e6defa', { wordWrap: { width: tw }, lineSpacing: 2 });
    if (d.height > room) d.setScale(Math.max(0.75, room / d.height));
    c.add(d);
  }

  // Mythic: a gold shimmer sweeping across, and sparkles drifting up. Curse: a red smoulder.
  if (b.rarity === 'mythic' && !still) {
    const shine = scene.add.rectangle(-hw - 30, 0, 26, s.h - 8, 0xfff1b8, 0.22).setAngle(14).setBlendMode(Phaser.BlendModes.ADD);
    c.add(shine);
    scene.tweens.add({ targets: shine, x: hw + 30, duration: 1100, repeat: -1, repeatDelay: 1400, ease: 'Sine.easeInOut' });
    for (let k = 0; k < 4; k++) {
      const m = scene.add.circle(0, 0, 2, 0xfff1b8).setAlpha(0);
      c.add(m);
      const rise = () => {
        if (!m.active) return;
        m.setPosition(Phaser.Math.Between(-hw + 8, hw - 8), hh - 6).setAlpha(0);
        scene.tweens.add({ targets: m, y: -hh + 6, alpha: { from: 0.9, to: 0 }, duration: 1800, ease: 'Sine.easeOut', onComplete: rise });
      };
      scene.time.delayedCall(k * 450, rise);
    }
  }
  if (b.rarity === 'curse' && !still) {
    const ember = scene.add.rectangle(0, hh - 10, s.w - 8, 16, 0xff2a3a, 0.18).setBlendMode(Phaser.BlendModes.ADD);
    c.add(ember);
    scene.tweens.add({ targets: ember, alpha: 0.04, duration: 700, yoyo: true, repeat: -1 });
  }

  // Tap anywhere on the card.
  body.setInteractive({ useHandCursor: true });
  body.on('pointerover', () => !still && scene.tweens.add({ targets: c, scale: 1.03, duration: 100 }));
  body.on('pointerout', () => !still && scene.tweens.add({ targets: c, scale: 1, duration: 100 }));
  body.on('pointerup', onTap);
  return c;
}

/** Sparks flying out from a chosen card. */
function burst(scene: Phaser.Scene, root: Phaser.GameObjects.Container, x: number, y: number, col: number, count: number) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const d = 80 + Math.random() * 90;
    const p = scene.add.circle(x, y, 2 + Math.random() * 2.5, i % 2 ? 0xffffff : light(col, 30)).setBlendMode(Phaser.BlendModes.ADD);
    root.add(p);
    scene.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.3, duration: 520, ease: 'Quad.easeOut' });
  }
}

