import type Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { campStage } from '../logic/camp';
import { createCreature, creatureName, moveDef, type Creature } from '../logic/creature';
import {
  eggLength,
  hatchlingPreview,
  hatchNest,
  inheritedMoves,
  isLegendId,
  layNestEgg,
  nest,
  NURSERY_MAX,
  PARENT_HEARTS,
  parentsAvailable,
  releaseHatchling,
  RELEASE_EMBERS,
  TIER_NAMES,
  whyNot,
  type Hatchling,
} from '../logic/nest';
import { saveMeta } from '../logic/run';
import { state } from '../state';
import { playHatch } from './hatch';
import { openPicker, showMessage, type PickOption } from './picker';
import { sfx } from './sound';
import { traitName } from './traitText';

/**
 * The camp Nest (2.07): lay an egg from two parents, watch it hatch, and keep up to NURSERY_MAX
 * hatchlings in the Nursery (release ones you don't want for embers). Hatchlings start normal runs
 * from the starter screen.
 */

const nm = (id: string) => SPECIES_BY_ID[id]?.names[0] ?? id;
const runs = (n: number) => `${n} run${n === 1 ? '' : 's'}`;

/** A parent as it looks at camp (for the pickers). */
function parentPreview(id: string): Creature {
  return createCreature(id, 5, isLegendId(id) ? 0 : campStage(state.meta, id));
}

/** Everything about a hatchling, for its card and its hatching. */
export function hatchlingText(h: Hatchling): string {
  const c = hatchlingPreview(h);
  const trait = h.trait ? traitName(h.speciesId, h.trait) : '—';
  const from = inheritedMoves(h);
  return [
    `${nm(h.speciesId)} × ${nm(h.other)}${h.legendary ? ' (legendary)' : ''} · ${TIER_NAMES[h.tier - 1]} egg`,
    `Trait: ${trait}`,
    `Stars: ${h.stars ? '★'.repeat(h.stars) : 'none'}`,
    `Starts with: ${c.moves.map((m) => moveDef(m).name).join(', ')}`,
    from.length ? `Learns from ${nm(h.other)}: ${from.join(', ')}` : `Learns only its own line's moves`,
  ].join('\n');
}

/** The Nest menu: the egg (or laying one) and the Nursery. */
export function openNest(scene: Phaser.Scene, onChange: () => void) {
  const meta = state.meta;
  const n = nest(meta);
  const egg = n.egg;
  const opts: PickOption[] = [];
  const acts: (() => void)[] = [];
  if (egg) {
    const legend = isLegendId(egg.b);
    if (egg.left <= 0) {
      opts.push({ label: 'The egg is hatching!', sub: `${nm(egg.a)} × ${nm(egg.b)}`, color: 0x8a5a1a, glyph: 'star' });
      acts.push(() => hatchNow(scene, onChange));
    } else {
      opts.push({ label: `${TIER_NAMES[egg.tier - 1]} egg · ${runs(egg.left)} to go`, sub: `${nm(egg.a)} × ${nm(egg.b)}${legend ? ' · a legendary parent' : ''}`, disabled: true, color: legend ? 0x6a5a1c : undefined });
      acts.push(() => {});
    }
  } else {
    const ok = parentsAvailable(meta);
    const full = n.brood.length >= NURSERY_MAX;
    const can = !full && ok.regular.length > 0 && ok.regular.length + ok.legends.length >= 2;
    opts.push({
      label: 'Lay an egg',
      sub: full
        ? 'The Nursery is full: release a hatchling first'
        : can
          ? 'Choose two parents'
          : `Needs two camp crew Hexlings with ${PARENT_HEARTS}+ hearts (or one and a legendary you've caught)`,
      disabled: !can,
      color: 0x3b6d4a,
    });
    acts.push(() => pickParent(scene, null, onChange));
  }
  for (const h of n.brood) {
    const c = hatchlingPreview(h);
    opts.push({ icon: c, label: creatureName(c), sub: `${nm(h.speciesId)} × ${nm(h.other)} · ${h.trait ? traitName(h.speciesId, h.trait) : ''}${h.stars ? ` · ${'★'.repeat(h.stars)}` : ''}`, color: h.legendary ? 0x5a4a1c : undefined });
    acts.push(() => hatchlingCard(scene, h, onChange));
  }
  openPicker(scene, {
    title: 'Nest',
    subtitle: `Nursery ${n.brood.length}/${NURSERY_MAX}. Pick a hatchling on the starter screen to start a normal run with it.`,
    options: opts,
    rowHeight: 64,
    cancelLabel: 'Close',
    onCancel: () => {},
    onPick: (i) => acts[i](),
  });
}

/** Choose a parent (first, then its partner), then confirm. */
function pickParent(scene: Phaser.Scene, first: string | null, onChange: () => void) {
  const meta = state.meta;
  const ok = parentsAvailable(meta);
  const ids = [...ok.regular, ...ok.legends].filter((id) => id !== first && (!first || !whyNot(meta, first, id)));
  openPicker(scene, {
    title: first ? `A partner for ${nm(first)}` : 'Choose the first parent',
    subtitle: first
      ? 'The baby is one parent’s line, with the other’s colour, one of its parts and some of its moves.'
      : `Camp crew Hexlings with ${PARENT_HEARTS}+ hearts, and legendaries you've caught. (Two legendaries can't breed.)`,
    options: ids.map((id) => ({ icon: parentPreview(id), label: nm(id), sub: isLegendId(id) ? 'Legendary: the baby is always its partner’s line' : SPECIES_BY_ID[id].types.join(' / '), color: isLegendId(id) ? 0x6a5a1c : undefined })),
    rowHeight: 64,
    cancelLabel: 'Back',
    onCancel: () => openNest(scene, onChange),
    onPick: (i) => (first ? confirmBreed(scene, first, ids[i], onChange) : pickParent(scene, ids[i], onChange)),
  });
}

function confirmBreed(scene: Phaser.Scene, a: string, b: string, onChange: () => void) {
  const legend = isLegendId(a) || isLegendId(b);
  openPicker(scene, {
    title: `${nm(a)} × ${nm(b)}`,
    subtitle: `The egg takes ${legend ? '5–7' : '3–7'} finished runs: the longer it takes, the stronger the baby (better odds of its rare trait, and up to ★★).`,
    options: [{ label: 'Lay the egg', color: 0x3b6d4a }],
    cancelLabel: 'Back',
    onCancel: () => pickParent(scene, a, onChange),
    onPick: () => {
      const egg = layNestEgg(state.meta, a, b, Date.now());
      if (!egg) return openNest(scene, onChange);
      saveMeta(state.meta);
      sfx.boonOffer();
      showMessage(scene, `A ${TIER_NAMES[egg.tier - 1].toLowerCase()} egg!`, `${nm(a)} and ${nm(b)} have an egg. It hatches after ${runs(eggLength(egg.tier))}.`, onChange);
    },
  });
}

/** Hatch the nest's egg with the animation, then show the baby. */
export function hatchNow(scene: Phaser.Scene, then: () => void) {
  const meta = state.meta;
  const egg = nest(meta).egg;
  if (!egg) return then();
  const look = { a: egg.a, b: egg.b, tier: egg.tier, legendary: isLegendId(egg.b) };
  const h = hatchNest(meta);
  if (!h) return then();
  saveMeta(meta);
  playHatch(scene, look, hatchlingPreview(h), () =>
    showMessage(scene, `${creatureName(hatchlingPreview(h))} hatched!`, `${hatchlingText(h)}\n\nIt's in the Nursery: pick it on the starter screen for a normal run.`, then),
  );
}

/** A hatchling in the Nursery: everything about it, and releasing it. */
function hatchlingCard(scene: Phaser.Scene, h: Hatchling, onChange: () => void) {
  const c = hatchlingPreview(h);
  openPicker(scene, {
    title: creatureName(c),
    rows: [{ creature: c, text: hatchlingText(h), big: true }],
    options: [{ label: `Release (+${RELEASE_EMBERS[h.tier - 1]} embers)`, color: 0x6a2a2a }],
    cancelLabel: 'Back',
    onCancel: () => openNest(scene, onChange),
    onPick: () =>
      openPicker(scene, {
        title: `Release ${creatureName(c)}?`,
        subtitle: 'It leaves the Nursery for good.',
        options: [{ label: 'Release', color: 0x6a2a2a }],
        cancelLabel: 'Keep it',
        onCancel: () => hatchlingCard(scene, h, onChange),
        onPick: () => {
          const embers = releaseHatchling(state.meta, h.id);
          saveMeta(state.meta);
          sfx.coin();
          showMessage(scene, 'Released', `${creatureName(c)} wanders off happily. +${embers} embers.`, onChange);
        },
      }),
  });
}
