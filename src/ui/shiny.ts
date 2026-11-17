import type Phaser from 'phaser';
import { icon } from './icons';

/** Odds that a wild Hexling is shiny. */
export const SHINY_ODDS = 1 / 200;

/** A small twinkling sparkle, marking a shiny Hexling. */
export function shinySparkle(scene: Phaser.Scene, x: number, y: number, size = 12): Phaser.GameObjects.Image {
  const s = icon(scene, x, y, 'sparkle', size);
  scene.tweens.add({ targets: s, alpha: 0.35, scale: s.scale * 0.7, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
  return s;
}

/** A burst of sparkles around a shiny Hexling as it appears. */
export function shinyBurst(scene: Phaser.Scene, x: number, y: number, radius = 60, depth = 20) {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
    const s = icon(scene, x, y, 'sparkle', 14 + Math.random() * 10).setDepth(depth).setAlpha(0);
    scene.tweens.add({
      targets: s,
      x: x + Math.cos(a) * radius * (0.7 + Math.random() * 0.5),
      y: y + Math.sin(a) * radius * (0.7 + Math.random() * 0.5),
      alpha: { from: 1, to: 0 },
      angle: 90,
      delay: i * 40,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => s.destroy(),
    });
  }
}
