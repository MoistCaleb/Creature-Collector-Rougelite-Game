import { accountsAvailable, currentUser } from '../net/account';
import { openAccount } from './accountUi';
import type Phaser from 'phaser';
import { resetProgress } from '../logic/run';
import { flushCloud } from '../storage';
import { openElementChart } from './elementChart';
import { openHowToPlay } from './howto';
import { openPanel } from './panel';
import { openCredits } from './credits';
import { APP_VERSION } from '../data/changelog';
import { decodeSave, exportSave, importSave, summarize } from '../logic/saveCode';
import { copyText, openTextBox } from './textBox';
import { BUG_PLACES, pendingBugReports, submitBugReport } from '../net/bugReport';
import { openPicker } from './picker';
import { BATTLE_SPEEDS, prefs } from './prefs';
import { applyVolumes, isMuted, setMuted, sfx } from './sound';
import { button, COLORS, LANDSCAPE, text } from './widgets';

const ROW = 50;

/**
 * Settings, as a panel over any screen (title, map, battle): volumes, sound on/off,
 * battle speed, first-time tips, How to play, the element chart, and erasing all progress.
 */
export function openSettings(scene: Phaser.Scene, onClose: () => void = () => {}) {
  const rows = 7;
  // Bug reports need the server (not in the claude.ai version).
  const bigs = accountsAvailable() ? 6 : 5;
  const p = openPanel(scene, 'Settings', {
    w: LANDSCAPE ? 760 : 430,
    h: LANDSCAPE ? 440 : 50 + rows * ROW + 4 + bigs * 54 + 66,
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

    toggle('Reduce motion', 'Less screen shake, flashes and zooms', prefs.reduceMotion, () => {
      prefs.reduceMotion = !prefs.reduceMotion;
    });
    toggle('Day, night & holidays', 'The map follows your clock and calendar', prefs.worldClock, () => {
      prefs.worldClock = !prefs.worldClock;
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
    if (accountsAvailable()) {
      const u = currentUser();
      big('Account & saves', u ? `Signed in · ${u.email}` : 'Sign in to keep your progress on every device', () => openAccount(scene, { copy: () => void showCode(), load: () => pasteCode(scene) }), 0x2f5a4a, 'phone');
    } else big('Save transfer', 'Move your progress to another device', () => openSaveTransfer(scene), 0x2f5a4a, 'phone');
    if (accountsAvailable()) big('Report a bug', 'Tell us what went wrong, and where', () => openBugReport(scene), 0x3a5a3a, 'bug');
    big('Credits & version', `v${APP_VERSION} · what’s new`, () => openCredits(scene), 0x3a3352, 'star');
    big('Erase all progress', 'Start over from scratch', () => confirmErase(scene), 0x5a2a2a, 'skull');
  };
  draw();
  return p;
}

/** Report a bug: where it happened, then what happened (the game adds version, screen, run and device). */
export function openBugReport(scene: Phaser.Scene) {
  // The screen under the Settings panel (Settings opens over any screen).
  const screen = scene.scene.key;
  const waiting = pendingBugReports();
  openPicker(scene, {
    title: 'Report a bug',
    subtitle: `Where did it happen?${waiting ? `\n(${waiting} earlier report${waiting === 1 ? ' is' : 's are'} waiting to send.)` : ''}`,
    options: BUG_PLACES.map((p) => ({ label: p.label, sub: p.sub, color: 0x2f4a6b })),
    rowHeight: 62,
    onPick: (i) => {
      const place = BUG_PLACES[i];
      openTextBox({
        title: `Report a bug · ${place.label}`,
        body: 'What happened? What were you doing, and what did you expect instead?\nThe game adds its version, this screen, your run and your device for you.',
        placeholder: 'e.g. After catching a Hexling on floor 2, the map froze and I couldn’t tap any hex.',
        prose: true,
        maxLength: 2000,
        actions: [
          {
            label: 'Send',
            primary: true,
            onClick: async (b) => {
              const text = b.value().trim();
              if (text.length < 5) {
                b.setStatus('Write a few words about what happened.', 'error');
                return false;
              }
              b.setStatus('Sending…', 'info');
              const how = await submitBugReport(place.id, text, screen);
              b.close();
              openPicker(scene, {
                title: how === 'sent' ? 'Thanks!' : 'Saved',
                subtitle:
                  how === 'sent'
                    ? 'Your report is in. It’ll be looked at the next time the game gets worked on.'
                    : 'It couldn’t be sent right now (no connection?), so it’s saved on this device and will send by itself next time.',
                options: [],
                onPick: () => {},
                onCancel: () => {},
                cancelLabel: 'OK',
              });
              return true;
            },
          },
          { label: 'Cancel', onClick: () => true },
        ],
      });
    },
    onCancel: () => {},
    cancelLabel: 'Cancel',
  });
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
        onPick: async () => {
          resetProgress();
          // Wait for the cloud copy to be cleared too, or the old save comes back after the reload.
          await flushCloud();
          window.location.reload();
        },
        onCancel: () => {},
        cancelLabel: 'Keep my progress',
      }),
    onCancel: () => {},
    cancelLabel: 'Cancel',
  });
}

/** Save transfer: copy your save as a code, or load one from another device. */
function openSaveTransfer(scene: Phaser.Scene) {
  openPicker(scene, {
    title: 'Save transfer',
    subtitle:
      'Your save lives on this device. To move it (say from the browser to the installed app, or to a new phone), copy your save code here and load it on the other device.\n\nKeep a copy somewhere safe, like your notes, as a backup.',
    options: [
      { label: 'Copy my save code', color: 0x2f5a4a, glyph: 'phone', sub: 'Everything: Hexlidex, Gilded, unlocks, teams, records and your run' },
      { label: 'Load a save code', color: 0x2f4a6b, glyph: 'arrowUp', sub: 'Replaces the progress on this device' },
    ],
    onPick: (i) => (i === 0 ? void showCode() : pasteCode(scene)),
    onCancel: () => {},
  });
}

async function showCode() {
  const code = await exportSave();
  const share = typeof navigator.share === 'function';
  const box = openTextBox({
    title: 'Your save code',
    body: `Copy all of it (${code.length.toLocaleString()} characters), then paste it into Settings › Save transfer › Load a save code on the other device.`,
    value: code,
    readOnly: true,
    actions: [
      {
        label: 'Copy',
        primary: true,
        onClick: async (b) => {
          const ok = await copyText(code);
          if (ok) {
            b.setLabel(0, 'Copied!');
            b.setStatus('Copied. Paste it somewhere safe or on your other device.', 'ok');
          } else b.setStatus('Couldn’t copy here: tap the code, select all and copy it.', 'error');
          return false;
        },
      },
      ...(share
        ? [
            {
              label: 'Share…',
              onClick: async (b: import('./textBox').TextBoxHandle) => {
                try {
                  await navigator.share({ title: 'Hexbound save code', text: code });
                } catch {
                  b.setStatus('Not shared.', 'info');
                }
                return false;
              },
            },
          ]
        : []),
      { label: 'Done', onClick: () => true },
    ],
  });
  box.setStatus('Anyone with this code can load your progress, so keep it to yourself.', 'info');
}

function pasteCode(scene: Phaser.Scene) {
  openTextBox({
    title: 'Load a save code',
    body: 'Paste a code you copied from Hexbound. It replaces all progress on this device.',
    placeholder: 'HEXB1.…',
    actions: [
      {
        label: 'Load',
        primary: true,
        onClick: async (b) => {
          try {
            const bundle = await decodeSave(b.value());
            const s = summarize(bundle);
            b.close();
            const when = s.at ? new Date(s.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'an unknown date';
            openPicker(scene, {
              title: 'Replace your progress?',
              subtitle: `The code is from ${when}:\n${s.runs} runs · ${s.wins} wins · ${s.caught} species caught · ${s.gilded} Gilded${s.runInProgress ? '\nIt has a run in progress.' : ''}\n\nEverything on this device${currentUser() ? ' and in your account' : ''} is replaced. Copy your own code first if you want to keep it.`,
              options: [{ label: 'Load this save', color: 0x8a2c2c, glyph: 'arrowUp' }],
              onPick: async () => {
                await importSave(bundle);
                window.location.reload();
              },
              onCancel: () => {},
              cancelLabel: 'Cancel',
            });
            return true;
          } catch (e) {
            b.setStatus(e instanceof Error ? e.message : 'That code didn’t work.', 'error');
            return false;
          }
        },
      },
      { label: 'Cancel', onClick: () => true },
    ],
  });
}
