import Phaser from 'phaser';
import { TIER_INFO, tierOf, type TitleTier } from '../logic/titles';
import { calm } from './motion';
import { text } from './widgets';

export interface BadgeOpts {
  /** Like setOrigin on text (default 0.5, 0.5). */
  originX?: number;
  originY?: number;
  /** Shrink to fit this width. */
  maxW?: number;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const hsv = (h: number, s: number, v: number) => (Phaser.Display.Color.HSVToRGB(h % 1, s, v) as Phaser.Types.Display.ColorObject).color;
const mix = (a: string, b: string, t: number) => {
  const ca = Phaser.Display.Color.HexStringToColor(a);
  const cb = Phaser.Display.Color.HexStringToColor(b);
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(ca, cb, 100, Math.round(t * 100));
  return hex(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
};

/** Glow strength per tier (shadow blur), and whether it pulses or sparkles. */
const LOOK: Record<TitleTier, { glow: number; pulse: boolean; sparkle: number }> = {
  common: { glow: 0, pulse: false, sparkle: 0 },
  rare: { glow: 6, pulse: false, sparkle: 0 },
  epic: { glow: 8, pulse: true, sparkle: 0 },
  legendary: { glow: 10, pulse: true, sparkle: 520 },
  mythic: { glow: 12, pulse: true, sparkle: 300 },
};

/**
 * A trainer title in its tier's color and effect: common plain, rare with a blue glow, epic with a
 * shimmering violet glow, legendary in pulsing gold with sparkles, mythic cycling through the
 * rainbow with sparkles. Reduce motion keeps the colors and glow but stops the animation.
 */
export function titleBadge(scene: Phaser.Scene, x: number, y: number, title: string, size = 14, o: BadgeOpts = {}): Phaser.GameObjects.Container {
  const tier = tierOf(title);
  const info = TIER_INFO[tier];
  const look = LOOK[tier];
  const root = scene.add.container(x, y);
  const t = text(scene, 0, 0, `${info.mark}${title}`, size, info.color, {
    fontStyle: 'bold',
    stroke: '#120e1c',
    strokeThickness: Math.max(3, Math.round(size / 4)),
  }).setOrigin(o.originX ?? 0.5, o.originY ?? 0.5);
  if (look.glow) t.setShadow(0, 0, info.color, look.glow, true, true);
  root.add(t);
  if (o.maxW && t.width > o.maxW) t.setScale(o.maxW / t.width);
  root.setSize(t.displayWidth, t.displayHeight);

  if (calm() || (!look.pulse && !look.sparkle)) return root;

  // The shimmer: epic and legendary pulse between their color and a pale tint; mythic cycles hues.
  const pale = tier === 'legendary' ? '#fff3c4' : '#f1dcff';
  const tween = scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: tier === 'mythic' ? 3200 : 1400,
    repeat: -1,
    yoyo: tier !== 'mythic',
    ease: tier === 'mythic' ? 'Linear' : 'Sine.easeInOut',
    onUpdate: (tw) => {
      if (!t.active) return;
      const v = tw.getValue() ?? 0;
      const color = tier === 'mythic' ? hex(hsv(v, 0.55, 1)) : mix(info.color, pale, v * 0.6);
      t.setColor(color);
      t.setShadow(0, 0, tier === 'mythic' ? hex(hsv(v + 0.08, 0.8, 1)) : info.color, look.glow * (0.6 + 0.6 * (tier === 'mythic' ? 0.7 : v)), true, true);
    },
  });

  // Sparkles drift up from random points along the title.
  const timer = look.sparkle
    ? scene.time.addEvent({
        delay: look.sparkle,
        loop: true,
        callback: () => {
          if (!t.active) return;
          const w = t.displayWidth;
          const h = t.displayHeight;
          const sx = (Math.random() - (o.originX ?? 0.5)) * w;
          const sy = (Math.random() - (o.originY ?? 0.5)) * h;
          const color = tier === 'mythic' ? hex(hsv(Math.random(), 0.5, 1)) : '#fff6d0';
          const s = text(scene, sx, sy, '✦', Math.max(8, Math.round(size * 0.65)), color, { stroke: '#120e1c', strokeThickness: 2 })
            .setOrigin(0.5)
            .setScale(0.4)
            .setAlpha(0.95);
          root.add(s);
          scene.tweens.add({ targets: s, y: sy - size * 0.8, scale: 1, alpha: 0, angle: 90, duration: 760, ease: 'Quad.easeOut', onComplete: () => s.destroy() });
        },
      })
    : null;

  root.once('destroy', () => {
    tween.remove();
    timer?.remove();
  });
  return root;
}

/** A title's tier name and color, for lists. */
export const tierLabel = (title: string) => TIER_INFO[tierOf(title)];

/** The sub-line to give a button that shows a title (see titleInButton). */
export const titleSub = (title: string) => `${TIER_INFO[tierOf(title)].mark}${title}`;

/** Swap a button's sub-line (made with titleSub) for the title's badge, with its color and effect. */
export function titleInButton(scene: Phaser.Scene, btn: Phaser.GameObjects.Container, title: string, size = 12) {
  const sub = btn.list.find((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text && o.text === titleSub(title));
  if (!sub) return;
  sub.setVisible(false);
  btn.add(titleBadge(scene, sub.x, sub.y, title, size, { originY: 0, maxW: Math.max(sub.width, btn.width - 16) }));
}
