import type Phaser from 'phaser';
import { clearSavedRun } from '../logic/run';
import { persist, state } from '../state';
import { openPicker } from './picker';
import { isMuted, setMuted } from './sound';

/**
 * The in-run menu (map and battle): resume, sound, exit to the title (the run is saved and picks
 * up again from "Continue run"), or abandon the run.
 */
export function openGameMenu(scene: Phaser.Scene, onResume: () => void = () => {}) {
  openPicker(scene, {
    title: 'Menu',
    subtitle: 'Your run saves automatically. Exit any time and pick up again with "Continue run".',
    options: [
      { label: 'Resume', color: 0x3b6d4a, glyph: 'play' },
      { label: `Sound: ${isMuted() ? 'off' : 'on'}`, sub: 'Tap to switch', glyph: isMuted() ? 'mute' : 'sound' },
      { label: 'Exit to title', sub: 'Your run is saved', color: 0x2f4a6b, glyph: 'back' },
      { label: 'Abandon run', sub: 'End this run for good', color: 0x5a2a2a, glyph: 'skull' },
    ],
    onPick: (i) => {
      if (i === 0) return onResume();
      if (i === 1) {
        setMuted(!isMuted());
        return openGameMenu(scene, onResume);
      }
      if (i === 2) {
        persist();
        state.run = null;
        return scene.scene.start('Title', {});
      }
      openPicker(scene, {
        title: 'Abandon this run?',
        subtitle: 'It ends here and can’t be continued. Starters you unlocked and Hexlidex entries are kept.',
        options: [{ label: 'Abandon run', color: 0x8a2c2c }],
        onPick: () => {
          clearSavedRun();
          state.run = null;
          scene.scene.start('Title', {});
        },
        onCancel: () => openGameMenu(scene, onResume),
        cancelLabel: 'Back',
      });
    },
    onCancel: onResume,
    cancelLabel: 'Close',
  });
}
