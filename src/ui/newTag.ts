import type Phaser from 'phaser';
import { calm } from './motion';
import { text } from './widgets';

/** A small gold "NEW" tag (top-right at x, y), pulsing gently: something you haven't looked at yet. */
export function newTag(scene: Phaser.Scene, x: number, y: number, size = 10): Phaser.GameObjects.Text {
  const t = text(scene, x, y, 'NEW', size, '#1a1426', { fontStyle: 'bold', backgroundColor: '#ffc94d', padding: { x: 4, y: 1 } }).setOrigin(1, 0);
  if (!calm()) scene.tweens.add({ targets: t, alpha: 0.55, yoyo: true, repeat: -1, duration: 650, ease: 'Sine.easeInOut' });
  return t;
}
