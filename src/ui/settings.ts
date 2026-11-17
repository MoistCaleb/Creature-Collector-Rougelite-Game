import type Phaser from 'phaser';
import { resetProgress } from '../logic/run';
import { openElementChart } from './elementChart';
import { openHowToPlay } from './howto';
import { openPanel } from './panel';
import { openPicker } from './picker';
import { BATTLE_SPEEDS, prefs } from './prefs';
import { applyVolumes, isMuted, setMuted, sfx } from './sound';
import { button, COLORS, LANDSCAPE, text } from './widgets';

const ROW = 52;

/**
 * Settings, as a panel over any screen (title, map, battle): volumes, sound on/off,
 * battle speed, first-time tips, How to play, the element chart, and erasing all progress.
 */
export function openSettings(scene: Phaser.Scene, onClose: () => void = () => {}) {
  const rows = 5;
  const p = openPanel(scene, 'Settings', {
    w: LANDSCAPE ? 760 : 430,
    h: LANDSCAPE ? 430 : 50 + rows * ROW + 4 + 3 * 54 + 66,
    onClose,
  });
  const body = scene.add.container(0, 0);
  p.root.add(body);

  const draw = () => {
    body.removeAll(true);
    // Upright: one column. Sideways: settings on the left, the buttons on the right.
    const colW = LANDSCAPE ? 420 : p.w - 28;
    const x0 = p.x + 14;
    let y = p.top;
    const label = (s: string, sub?: string) => {
      body.add(scene.add.rectangle(x0, y, colW, ROW - 6, COLORS.panelLight).setOrigin(0));
      body.add(text(scene, x0 + 12, y + (sub ? 8 : (ROW - 6) / 2), s, 15, COLORS.text, { fontStyle: 'bold' }).setOrigin(0, sub ? 0 : 0.5));
      if (sub) body.add(text(scene, x0 + 12, y + 27, sub, 11, COLORS.textDim));
    };
    const cy = () => y + (ROW - 6) / 2;
    const right = x0 + colW - 10;

    const volume = (name: string, get: () => number, set: (v: number) => void) => {
      label(name);
      const v = get();
      const segW = 14;
      const segs = 10;
      const barR = right - 40;
      const barL = barR - segs * (segW + 2);
      for (let i = 0; i < segs; i++) {
        const seg = scene.add
          .rectangle(barL + i * (segW + 2), cy(), segW, 22, i < v ? 0xffc94d : 0x3a3352)
          .setOrigin(0, 0.5)
          .setInteractive({ useHandCursor: true });
        seg.on('pointerup', () => {
          set(v === i + 1 ? i : i + 1);
          change();
        });
        body.add(seg);
      }
      body.add(button(scene, barL - 22, cy(), 32, 32, '−', () => (set(Math.max(0, v - 1)), change()), { fontSize: 18 }));
      body.add(button(scene, right - 16, cy(), 32, 32, '+', () => (set(Math.min(10, v + 1)), change()), { fontSize: 18 }));
      y += ROW;
    };
    const change = () => {
      applyVolumes();
      sfx.coin();
      draw();
    };
    const toggle = (name: string, sub: string, on: boolean, flip: () => void) => {
      label(name, sub);
      body.add(
        button(scene, right - 40, cy(), 76, 34, on ? 'On' : 'Off', () => {
          flip();
          draw();
        }, { fontSize: 15, color: on ? 0x3b6d4a : 0x4a3a4a }),
      );
      y += ROW;
    };

    volume('Music', () => prefs.musicVol, (v) => (prefs.musicVol = v));
    volume('Sound effects', () => prefs.sfxVol, (v) => (prefs.sfxVol = v));
    toggle('All sound', 'Music, effects and cries', !isMuted(), () => setMuted(!isMuted()));
    toggle('First-time tips', prefs.tips ? 'Short tips the first time you see something' : 'Turn on to see every tip again', prefs.tips, () => {
      prefs.tips = !prefs.tips;
      if (prefs.tips) prefs.tipsSeen = [];
    });

    // Battle speed: three choices.
    label('Battle speed', 'Also on the battle screen');
    BATTLE_SPEEDS.forEach((s, i) => {
      const on = prefs.battleSpeed === s;
      body.add(
        button(scene, right - 140 + i * 52, cy(), 46, 34, `${s}×`, () => {
          prefs.battleSpeed = s;
          draw();
        }, { fontSize: 15, color: on ? 0x3a4f7a : undefined }),
      );
    });
    y += ROW;

    // Buttons: How to play, Element chart, Erase.
    const bx = LANDSCAPE ? p.x + 14 + 420 + 16 : x0;
    const bw = LANDSCAPE ? p.w - 28 - 420 - 16 : colW;
    let by = LANDSCAPE ? p.top : y + 4;
    const big = (name: string, sub: string, fn: () => void, color?: number, glyph?: import('./icons').IconId) => {
      body.add(button(scene, bx + bw / 2, by + 23, bw, 46, name, fn, { fontSize: 16, sub, color, glyph }));
      by += 54;
    };
    big('How to play', 'The basics, in a few pages', () => openHowToPlay(scene), 0x2f4a6b, 'book');
    big('Element chart', 'What beats what', () => openElementChart(scene), 0x2f4a6b);
    big('Erase all progress', 'Start over from scratch', () => confirmErase(scene), 0x5a2a2a, 'skull');
  };
  draw();
  return p;
}

function confirmErase(scene: Phaser.Scene) {
  openPicker(scene, {
    title: 'Erase all progress?',
    subtitle: 'Your run, starters, Hexlidex, achievements, passives, maps, Heat levels, teams and records are all deleted.',
    options: [{ label: 'Erase everything', color: 0x8a2c2c, glyph: 'skull' }],
    onPick: () =>
      openPicker(scene, {
        title: 'Are you sure?',
        subtitle: 'This can’t be undone.',
        options: [{ label: 'Yes, erase it all', color: 0x8a2c2c }],
        onPick: () => {
          resetProgress();
          window.location.reload();
        },
        onCancel: () => {},
        cancelLabel: 'Keep my progress',
      }),
    onCancel: () => {},
    cancelLabel: 'Cancel',
  });
}
