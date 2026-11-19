import type Phaser from 'phaser';
import { clearSavedRun } from '../logic/run';
import { persist, state } from '../state';
import { openPicker } from './picker';
import type { Element } from '../data/types';
import { openElementChart } from './elementChart';
import { openHowToPlay } from './howto';
import { openSettings } from './settings';

/**
 * The in-run menu (map and battle): resume, settings, the element chart (highlighting `focus`, e.g.
 * the foe's elements), how to play, exit to the title (the run is saved and picks up again from
 * "Continue run"), or abandon the run.
 */
export function openGameMenu(scene: Phaser.Scene, onResume: () => void = () => {}, focus: readonly Element[] = []) {
  const back = () => openGameMenu(scene, onResume, focus);
  openPicker(scene, {
    title: 'Menu',
    subtitle: 'Your run saves automatically. Exit any time and pick up again with "Continue run".',
    options: [
      { label: 'Resume', color: 0x3b6d4a, glyph: 'play' },
      { label: 'Settings', sub: 'Sound, speed, tips', glyph: 'gear' },
      { label: 'Element chart', sub: focus.length ? 'Your foe’s elements are highlighted' : 'What beats what', glyph: 'sparkle' },
      { label: 'How to play', glyph: 'book' },
      { label: 'Exit to title', sub: state.run?.race ? 'Leaves the online game (your own saved run is kept)' : 'Your run is saved', color: 0x2f4a6b, glyph: 'back' },
      { label: 'Abandon run', sub: 'End this run for good', color: 0x5a2a2a, glyph: 'skull' },
    ],
    onPick: (i) => {
      if (i === 0) return onResume();
      if (i === 1) return void openSettings(scene, back);
      if (i === 2) return void openElementChart(scene, focus, back);
      if (i === 3) return void openHowToPlay(scene, back);
      if (i === 4) {
        persist();
        state.run = null;
        return scene.scene.start('Title', {});
      }
      openPicker(scene, {
        title: 'Abandon this run?',
        subtitle: 'It ends here and can’t be continued. Starters you unlocked and Hexlidex entries are kept.',
        options: [{ label: 'Abandon run', color: 0x8a2c2c }],
        onPick: () => {
          clearSavedRun(state.run);
          state.run = null;
          scene.scene.start('Title', {});
        },
        onCancel: back,
        cancelLabel: 'Back',
      });
    },
    onCancel: onResume,
    cancelLabel: 'Close',
  });
}
