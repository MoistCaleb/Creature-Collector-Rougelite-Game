import type Phaser from 'phaser';
import { holdScroll, Scroller } from './scroll';
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

/**
 * A panel sized to what's in it: `build` lays its content out from y = 0 at the given left edge and
 * width, into `body`, and returns how tall it came out. The panel grows to fit, up to the board's
 * height; past that, the content scrolls (drag or wheel) between the title and the Close button.
 */
export function openFittedPanel(
  scene: Phaser.Scene,
  title: string,
  opts: { w?: number; minH?: number; onClose?: () => void; closeLabel?: string; depth?: number },
  build: (body: Phaser.GameObjects.Container, x0: number, w: number) => number,
): Panel {
  const pw = Math.min(opts.w ?? W - 24, W - 12);
  const body = scene.add.container(0, 0);
  const contentH = build(body, (W - pw) / 2 + 18, pw - 36);
  // 50 above for the title, 64 below for the Close button.
  const chrome = 50 + 64;
  let scroller: Scroller | null = null;
  const p = openPanel(scene, title, {
    ...opts,
    w: pw,
    h: Math.max(opts.minH ?? 0, contentH + chrome),
    onClose: () => {
      scroller?.dispose();
      opts.onClose?.();
    },
  });
  const top = p.top - 4;
  const bottom = p.y + p.h - 60;
  body.setY(top);
  p.root.add(body);
  const overflow = top + contentH - bottom;
  if (overflow > 0) {
    const shape = scene.make.graphics({}, false).fillRect(p.x, top - 4, p.w, bottom - top + 4);
    body.setMask(shape.createGeometryMask());
    body.once('destroy', () => shape.destroy());
    const hint = text(scene, p.x + p.w - 10, p.y + p.h - 54, 'Drag to see more', 11, COLORS.textDim).setOrigin(1, 1);
    p.root.add(hint);
    scroller = new Scroller(scene, {
      get: () => body.y,
      set: (v) => {
        body.setY(v);
        hint.setVisible(v > top - overflow + 4);
      },
      min: () => top - overflow - 4,
      max: () => top,
      popup: true,
    });
  }
  return p;
}
