import type Phaser from 'phaser';
import { openPanel } from './panel';
import { openPicker } from './picker';
import { prefs } from './prefs';
import { button, COLORS, LANDSCAPE, text } from './widgets';

/**
 * Settings › Accessibility: reduce motion, larger text, brighter text and the flashing-lights
 * warning. Text options apply to each screen as it's next opened.
 */
export function openAccessibility(scene: Phaser.Scene, onClose: () => void = () => {}) {
  const ROW = LANDSCAPE ? 62 : 70;
  const opts: { name: string; sub: string; get: () => boolean; flip: () => void }[] = [
    {
      name: 'Reduce motion',
      sub: 'Less screen shake, fewer flashes and zooms',
      get: () => prefs.reduceMotion,
      flip: () => (prefs.reduceMotion = !prefs.reduceMotion),
    },
    {
      name: 'Larger text',
      sub: 'Small text is drawn bigger (on screens you open next)',
      get: () => prefs.largerText,
      flip: () => (prefs.largerText = !prefs.largerText),
    },
    {
      name: 'Brighter text',
      sub: 'Grey hints and notes are easier to read (on screens you open next)',
      get: () => prefs.brightText,
      flip: () => (prefs.brightText = !prefs.brightText),
    },
    {
      name: 'Flashing lights warning',
      sub: 'Shown when the game starts',
      get: () => prefs.motionWarning,
      flip: () => (prefs.motionWarning = !prefs.motionWarning),
    },
  ];
  const p = openPanel(scene, 'Accessibility', { w: LANDSCAPE ? 560 : 430, h: 50 + opts.length * ROW + 10 + 66, onClose, depth: 1100 });
  const body = scene.add.container(0, 0);
  p.root.add(body);
  const draw = () => {
    body.removeAll(true);
    const x0 = p.x + 14;
    const colW = p.w - 28;
    opts.forEach((o, i) => {
      const y = p.top + i * ROW;
      const on = o.get();
      body.add(scene.add.rectangle(x0, y, colW, ROW - 6, COLORS.panelLight).setOrigin(0));
      body.add(text(scene, x0 + 12, y + 8, o.name, 15, COLORS.text, { fontStyle: 'bold' }));
      body.add(text(scene, x0 + 12, y + 28, o.sub, 11, COLORS.textDim, { wordWrap: { width: colW - 120 } }));
      body.add(
        button(scene, x0 + colW - 50, y + (ROW - 6) / 2, 76, 34, on ? 'On' : 'Off', () => {
          o.flip();
          draw();
        }, { fontSize: 15, color: on ? 0x3b6d4a : 0x4a3a4a }),
      );
    });
  };
  draw();
  return p;
}

/**
 * The photosensitivity warning, on every launch until "Don't show again" (it can be turned back
 * on in Accessibility). Offers to turn on Reduce motion there and then. Calls `then` once closed.
 */
export function maybeShowMotionWarning(scene: Phaser.Scene, then: () => void): boolean {
  if (!prefs.motionWarning) return false;
  const already = prefs.reduceMotion;
  openPicker(scene, {
    title: 'Flashing lights',
    subtitle:
      'This game has flashing lights, screen shake and fast movement, which may trigger seizures in people with photosensitive epilepsy.' +
      (already
        ? '\n\nReduce motion is on: fewer flashes, shakes and zooms.'
        : '\n\nTurn on Reduce motion for fewer flashes, shakes and zooms. It is also in Settings › Accessibility.'),
    options: [
      ...(already ? [] : [{ label: 'Turn on Reduce motion', color: 0x3b6d4a }]),
      { label: 'Continue', color: already ? 0x3b6d4a : undefined },
      { label: 'Don’t show again', color: 0x3a3352 },
    ],
    onPick: (i) => {
      const pick = already ? i + 1 : i;
      if (pick === 0) prefs.reduceMotion = true;
      if (pick === 2) prefs.motionWarning = false;
      then();
    },
  });
  return true;
}
