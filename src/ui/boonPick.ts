import Phaser from 'phaser';
import { BOON_COLOR, BOONS } from '../data/boons';
import { runBoons, skipOffer, takeBoon } from '../logic/boons';
import type { Run } from '../logic/run';
import { persist } from '../state';
import { openPicker, showMessage } from './picker';
import { sfx } from './sound';

const RARITY_LABEL = { common: 'Boon', rare: '◆ Rare boon', mythic: '✦ Mythic boon', curse: '☠ Curse' } as const;

/** One line for a boon on a card: its element and rarity, then what it does (curses: cost and reward). */
export function boonCardText(id: string): { label: string; sub: string } {
  const b = BOONS[id];
  const tag = `${RARITY_LABEL[b.rarity]}${b.element ? ` · ${b.element}` : ''}`;
  if (b.rarity === 'curse') return { label: `${b.name}  ·  ${tag}`, sub: `✗ ${b.drawback}\n✓ ${b.reward}` };
  return { label: `${b.name}  ·  ${tag}`, sub: b.desc };
}

/**
 * The boon on offer: pick one (some offers let you take 2), or skip. Loops through any offers a
 * curse queued up, then calls `onDone`. The offer is saved, so a reload brings back the same cards.
 */
export function openBoonOffer(scene: Phaser.Scene, run: Run, onDone: () => void) {
  const rb = runBoons(run);
  const offer = rb.offer;
  if (!offer || !offer.ids.length) return onDone();
  sfx.boonOffer();
  const many = offer.picks > 1;
  const title = offer.mode === 'mythic' ? 'Mythic boon' : offer.mode === 'rare' ? 'Rare boons' : 'Choose a boon';
  openPicker(scene, {
    title,
    subtitle: `${many ? `Take ${offer.picks} of these.` : 'Take one for the rest of this run.'}${offer.ids.some((id) => BOONS[id].rarity === 'curse') ? ' Curses cost you something but pay you back.' : ''}`,
    options: offer.ids.map((id) => ({ ...boonCardText(id), color: BOON_COLOR[BOONS[id].rarity] })),
    rowHeight: 92,
    cancelLabel: many ? 'Done' : 'Skip',
    onCancel: () => {
      skipOffer(run);
      persist();
      openBoonOffer(scene, run, onDone);
    },
    onPick: (i) => {
      const id = offer.ids[i];
      const b = BOONS[id];
      const res = takeBoon(run, id);
      persist();
      sfx.boonPick(b.rarity);
      const next = () => openBoonOffer(scene, run, onDone);
      showMessage(scene, b.rarity === 'curse' ? `Cursed: ${b.name}` : `${b.name}!`, `${b.rarity === 'curse' ? `${b.drawback}\n${b.reward}` : b.desc}${res.note ? `\n\n${res.note}` : ''}`, next);
    },
  });
}
