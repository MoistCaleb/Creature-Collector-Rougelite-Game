import Phaser from 'phaser';
import { HELD, heldName, type HeldId } from '../data/held';
import { creatureName } from '../logic/creature';
import { allCreatures, equipHeld, maxPotions, needsPotion, potionHeal, unequipHeld, usePotion } from '../logic/run';
import { sfx } from '../ui/sound';
import { persist, state } from '../state';
import { icon as pixelIcon } from '../ui/icons';
import { openPicker } from '../ui/picker';
import { background, button, COLORS, H, text, W } from '../ui/widgets';

const HEADER = 186;

/**
 * The Bag: potions, Evolution Stones and held items. Held items can be given to a creature (or
 * taken off one) right here.
 */
export class BagScene extends Phaser.Scene {
  constructor() {
    super('Bag');
  }

  create() {
    const run = state.run!;
    background(this);

    // Scrolling list of items (drawn first so the header covers it as it scrolls).
    const list = this.add.container(0, HEADER);
    const bag = run.bag ?? [];
    const kinds = [...new Set(bag)] as HeldId[];
    const count = (id: HeldId) => bag.filter((x) => x === id).length;
    let y = 0;
    list.add(text(this, 16, y, `Held items  (${bag.length})`, 16, COLORS.text, { fontStyle: 'bold' }));
    y += 28;
    if (!kinds.length) {
      list.add(
        text(this, 16, y, 'No held items yet. Trainers, treasure, events and shops give them out.', 13, COLORS.textDim, { wordWrap: { width: W - 32 } }),
      );
      y += 44;
    }
    for (const id of kinds) {
      const def = HELD[id];
      list.add(this.add.rectangle(10, y, W - 20, 64, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
      list.add(pixelIcon(this, 34, y + 32, def.icon, 28));
      const n = count(id);
      list.add(text(this, 58, y + 9, `${def.name}${n > 1 ? `  ×${n}` : ''}`, 15, COLORS.text, { fontStyle: 'bold' }));
      list.add(text(this, 58, y + 31, def.desc, 12, COLORS.textDim, { wordWrap: { width: W - 160 } }));
      list.add(button(this, W - 52, y + 32, 72, 36, 'Give', () => this.give(id), { fontSize: 15, color: 0x2f4a6b }));
      y += 70;
    }

    // Who's holding what.
    const holders = allCreatures(run).filter((c) => c.held);
    y += 10;
    list.add(text(this, 16, y, `Equipped  (${holders.length})`, 16, COLORS.text, { fontStyle: 'bold' }));
    y += 28;
    if (!holders.length) {
      list.add(text(this, 16, y, 'No creature is holding an item.', 13, COLORS.textDim));
      y += 30;
    }
    for (const c of holders) {
      const def = HELD[c.held!];
      list.add(this.add.rectangle(10, y, W - 20, 48, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
      list.add(pixelIcon(this, 34, y + 24, def.icon, 24));
      list.add(text(this, 58, y + 6, creatureName(c), 14, COLORS.text, { fontStyle: 'bold' }));
      list.add(text(this, 58, y + 26, def.name, 12, COLORS.textDim));
      list.add(
        button(this, W - 60, y + 24, 88, 32, 'Take off', () => {
          unequipHeld(run, c);
          persist();
          this.scene.restart({});
        }, { fontSize: 13, color: 0x3a3450 }),
      );
      y += 54;
    }

    // Drag to scroll when the list is taller than the screen.
    const room = H - HEADER - 10;
    const minY = HEADER - Math.max(0, y - room);
    if (minY < HEADER) {
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (!p.isDown) return;
        list.y = Phaser.Math.Clamp(list.y + (p.y - p.prevPosition.y) / this.cameras.main.zoom, minY, HEADER);
      });
      text(this, W / 2, H - 16, 'Drag to scroll', 11, COLORS.textDim).setOrigin(0.5).setDepth(5);
    }

    // Header: title, back to the map, potions and stones.
    this.add.rectangle(0, 0, W, HEADER - 6, COLORS.bg).setOrigin(0).setDepth(4).setInteractive();
    const head = (o: Phaser.GameObjects.GameObject & { setDepth(d: number): unknown }) => o.setDepth(5);
    head(text(this, 16, 14, 'Bag', 26, '#ffc94d', { fontStyle: 'bold' }));
    head(button(this, W - 60, 30, 100, 42, 'Map', () => this.scene.start('Map', {}), { color: 0x3b6d4a, fontSize: 17, glyph: 'play' }));
    const card = (x: number, iconId: 'potion' | 'stone', title: string, sub: string, color: string) => {
      head(this.add.rectangle(x, 62, (W - 36) / 2, 110, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke));
      head(pixelIcon(this, x + 26, 92, iconId, 32));
      head(text(this, x + 48, 76, title, 22, color, { fontStyle: 'bold' }));
      head(text(this, x + 12, 116, sub, 12, COLORS.textDim, { wordWrap: { width: (W - 36) / 2 - 20 } }));
    };
    card(12, 'potion', `${run.potions ?? 0}/${maxPotions(run)}`, `Potions · heal ${Math.round(potionHeal(run) * 100)}% and cure status. Also usable in battle.`, '#8fe08a');
    const hurt = allCreatures(run).some(needsPotion);
    head(
      button(this, 12 + (W - 36) / 2 - 40, 92, 64, 32, 'Use', () => this.drinkPotion(), {
        fontSize: 14,
        color: 0x2f5a4a,
        enabled: (run.potions ?? 0) > 0 && hurt,
      }),
    );
    card(24 + (W - 36) / 2, 'stone', `${run.evoStones}`, 'Evolution Stones · evolve a creature at Lv 30 / 65 from the Team screen.', '#e0a8ff');
  }

  /** Use a potion: choose a hurt (or afflicted) creature. */
  private drinkPotion() {
    const run = state.run!;
    const all = allCreatures(run);
    openPicker(this, {
      title: 'Use a Potion',
      subtitle: `Heals ${Math.round(potionHeal(run) * 100)}% HP and cures status conditions. ${run.potions ?? 0} left.`,
      options: all.map((c) => ({ creature: c, disabled: !needsPotion(c), note: needsPotion(c) ? undefined : 'Healthy' })),
      onPick: (k) => {
        if (usePotion(run, all[k])) sfx.heal();
        persist();
        this.scene.restart({});
      },
      onCancel: () => {},
    });
  }

  /** Give an item: choose who holds it (whatever they held goes back in the bag). */
  private give(id: HeldId) {
    const run = state.run!;
    const all = allCreatures(run);
    openPicker(this, {
      title: `Give ${heldName(id)}`,
      subtitle: `${HELD[id].desc}\nEach creature holds one item; its old one comes back to the bag.`,
      options: all.map((c) => ({ creature: c, note: c.held ? `Holds ${heldName(c.held)}` : undefined })),
      onPick: (k) => {
        equipHeld(run, all[k], id);
        persist();
        this.scene.restart({});
      },
      onCancel: () => {},
    });
  }
}
