import Phaser from 'phaser';
import { BOON_COLOR, BOONS } from '../data/boons';
import { ELEMENT_COLORS } from '../data/types';
import { runBoons, skipOffer, takeBoon } from '../logic/boons';
import type { Run } from '../logic/run';
import { persist } from '../state';
import { openBoonCards } from './boonCards';
import { openPicker, showMessage } from './picker';
import { sfx } from './sound';
import { tip, tipDone } from './tips';

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
  // The first time: what boons are.
  if (!tipDone('boon')) return void tip(scene, 'boon', () => openBoonOffer(scene, run, onDone));
  sfx.boonOffer();
  const many = offer.picks > 1;
  const title = offer.mode === 'mythic' ? 'Mythic boon' : offer.mode === 'rare' ? 'Rare boons' : 'Choose a boon';
  openBoonCards(scene, {
    title,
    subtitle: `${many ? `Take ${offer.picks} of these.` : 'Take one for the rest of this run.'}${offer.ids.some((id) => BOONS[id].rarity === 'curse') ? ' Curses cost you something but pay you back.' : ''}`,
    ids: offer.ids,
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
      // The card already showed what it does: only stop to explain something extra.
      if (res.note) showMessage(scene, b.rarity === 'curse' ? `Cursed: ${b.name}` : `${b.name}!`, res.note, next);
      else next();
    },
  });
}

/** A boon's row colour in the list: its element's (deepened so white text reads on it), else its rarity's. */
export function boonRowColor(id: string): number {
  const b = BOONS[id];
  if (!b.element) return BOON_COLOR[b.rarity];
  const col = Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[b.element]);
  const hsv = Phaser.Display.Color.RGBToHSV(col.red, col.green, col.blue) as Phaser.Types.Display.HSVColorObject;
  // Pale elements (Light, Frost, Storm) get richer so they don't turn muddy when deepened; Metal stays steel.
  const out = Phaser.Display.Color.HSVToRGB(hsv.h, b.element === 'Metal' ? hsv.s : Math.max(hsv.s, 0.55), Math.min(hsv.v, 0.62)) as Phaser.Types.Display.ColorObject;
  return Phaser.Display.Color.GetColor(out.r, out.g, out.b);
}

/** Your boons this run (and curses), from the map bar or the menu. */
export function openBoonList(scene: Phaser.Scene, src: Run | readonly string[], onClose: () => void = () => {}) {
  const held = Array.isArray(src) ? [...(src as readonly string[])] : ((src as Run).boons?.held ?? []);
  openPicker(scene, {
    title: `Boons (${held.length})`,
    subtitle: held.length ? 'They last for the rest of this run.' : 'No boons yet. Beat a guardian or find a Boon hex to choose one.',
    options: held.map((id) => ({ ...boonCardText(id), color: boonRowColor(id) })),
    rowHeight: 86,
    onPick: () => onClose(),
    onCancel: onClose,
    cancelLabel: 'Close',
  });
}
