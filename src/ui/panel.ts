import type Phaser from 'phaser';
import { holdScroll } from './scroll';
import { button, COLORS, fullRect, H, text, W } from './widgets';

export interface Panel {
  root: Phaser.GameObjects.Container;
  /** Panel box in layout coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** First free y under the title. */
  top: number;
  close: () => void;
}

/**
 * A modal panel over the current scene (dims everything, margins included), with a title and a
 * Close button at the bottom. Returns the root container to add content to.
 */
export function openPanel(
  scene: Phaser.Scene,
  title: string,
  opts: { w?: number; h?: number; onClose?: () => void; closeLabel?: string; depth?: number } = {},
): Panel {
  const w = Math.min(opts.w ?? W - 24, W - 12);
  const h = Math.min(opts.h ?? H - 40, H - 12);
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  const root = scene.add.container(0, 0).setDepth(opts.depth ?? 1000);
  holdScroll(root);
  root.add(fullRect(scene, 0x000000, 0.78).setInteractive());
  root.add(scene.add.rectangle(x, y, w, h, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke));
  root.add(text(scene, W / 2, y + 14, title, 22, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0));
  const close = () => {
    root.destroy();
    opts.onClose?.();
  };
  root.add(button(scene, W / 2, y + h - 30, 180, 40, opts.closeLabel ?? 'Close', close, { fontSize: 16 }));
  return { root, x, y, w, h, top: y + 50, close };
}
