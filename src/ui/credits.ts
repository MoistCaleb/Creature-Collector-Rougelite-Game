import type Phaser from 'phaser';
import { APP_VERSION, changesSince, CHANGELOG, versionNewer, type ChangelogEntry } from '../data/changelog';
import { Scroller } from './scroll';
import { openPanel } from './panel';
import { prefs } from './prefs';
import { button, COLORS, LANDSCAPE, text } from './widgets';

const CREDITS: [string, string][] = [
  ['Game design & direction', 'MoistCaleb'],
  ['Code, pixel art & sound', 'Built with Claude Code'],
  ['Engine', 'Phaser 3'],
  ['Online play', 'PeerJS'],
  ['Music & sound effects', 'Composed live in your device as you play'],
];

/** Credits and the version you're running, with a link to the What's new list. */
export function openCredits(scene: Phaser.Scene, onClose: () => void = () => {}) {
  const p = openPanel(scene, 'Credits', { w: LANDSCAPE ? 560 : 420, h: LANDSCAPE ? 420 : 520, onClose });
  const cx = p.x + p.w / 2;
  let y = p.top + 4;
  p.root.add(text(scene, cx, y, 'HEXBOUND', 34, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0));
  y += 44;
  p.root.add(text(scene, cx, y, `Version ${APP_VERSION}  ·  build ${__BUILD__}`, 12, COLORS.textDim).setOrigin(0.5, 0));
  y += LANDSCAPE ? 26 : 34;
  for (const [role, who] of CREDITS) {
    p.root.add(text(scene, cx, y, role.toUpperCase(), 11, '#8e86ad', { fontStyle: 'bold' }).setOrigin(0.5, 0));
    p.root.add(text(scene, cx, y + 15, who, 15, COLORS.text, { fontStyle: 'bold', align: 'center', wordWrap: { width: p.w - 40 } }).setOrigin(0.5, 0));
    y += LANDSCAPE ? 40 : 48;
  }
  p.root.add(text(scene, cx, y + 2, 'Thanks for playing!', 14, '#8fe08a', { fontStyle: 'italic' }).setOrigin(0.5, 0));
  p.root.add(button(scene, cx, p.y + p.h - 80, 200, 40, 'What’s new', () => openWhatsNew(scene, CHANGELOG.filter((e) => !versionNewer('1.0', e.version))), { fontSize: 15, color: 0x2f4a6b, glyph: 'book' }));
  return p;
}

/** The changelog, newest first. Drag (or use the mouse wheel) to scroll when it doesn't all fit. */
export function openWhatsNew(scene: Phaser.Scene, entries: ChangelogEntry[], onClose: () => void = () => {}) {
  // Tall enough for what's listed (about two lines an item), up to most of the screen.
  const est = 110 + entries.reduce((t, e) => t + 34 + e.items.length * (LANDSCAPE ? 22 : 38), 0);
  let scroller: Scroller | null = null;
  const p = openPanel(scene, 'What\u2019s new', {
    w: LANDSCAPE ? 700 : 430,
    h: Math.min(LANDSCAPE ? 430 : 700, est),
    onClose: () => {
      scroller?.dispose();
      onClose();
    },
    closeLabel: 'Got it',
    depth: 1100,
  });
  const x0 = p.x + 20;
  const ww = p.w - 40;
  const top = p.top;
  const bottom = p.y + p.h - 60;
  const list = scene.add.container(0, 0);
  p.root.add(list);
  let y = top;
  for (const e of entries) {
    list.add(text(scene, x0, y, `${e.title}  \u00b7  v${e.version}`, 16, '#ffc94d', { fontStyle: 'bold' }));
    y += 24;
    for (const item of e.items) {
      const t = text(scene, x0 + 16, y, item, 13, COLORS.text, { wordWrap: { width: ww - 16 }, lineSpacing: 2 });
      list.add([text(scene, x0, y, '\u2726', 13, '#ffc94d'), t]);
      y += t.height + 6;
    }
    y += 10;
  }
  const overflow = y - bottom;
  if (overflow > 0) {
    // Only the list area shows; the rest scrolls under the panel's edges.
    const shape = scene.make.graphics({}, false).fillRect(p.x, top - 4, p.w, bottom - top + 4);
    list.setMask(shape.createGeometryMask());
    list.once('destroy', () => shape.destroy());
    const hint = text(scene, p.x + p.w - 14, p.y + 18, 'Drag to see more', 11, COLORS.textDim).setOrigin(1, 0);
    p.root.add(hint);
    scroller = new Scroller(scene, {
      get: () => list.y,
      set: (v) => {
        list.setY(v);
        hint.setVisible(v > -overflow + 4);
      },
      min: () => -overflow - 4,
      max: () => 0,
    });
  }
  return p;
}

/**
 * After an update, show what changed once (players who've never finished a run just start
 * fresh, with nothing to compare). Returns true if the popup opened.
 */
export function maybeShowWhatsNew(scene: Phaser.Scene, hasPlayed: boolean): boolean {
  const seen = prefs.lastVersion;
  prefs.lastVersion = APP_VERSION;
  if (!hasPlayed || seen === APP_VERSION) return false;
  const news = changesSince(seen ?? '0.8');
  if (!news.length) return false;
  openWhatsNew(scene, news);
  return true;
}
