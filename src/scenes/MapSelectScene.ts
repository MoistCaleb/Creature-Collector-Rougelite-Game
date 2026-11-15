import Phaser from 'phaser';
import { MAPS, mapUnlocked } from '../data/maps';
import { saveMeta } from '../logic/run';
import { state } from '../state';
import { background, button, COLORS, text, typeChip, W } from '../ui/widgets';

/** Choose which map (set of floor elements) to run before picking a starter. */
export class MapSelectScene extends Phaser.Scene {
  constructor() {
    super('MapSelect');
  }

  create() {
    background(this);
    const meta = state.meta;
    text(this, W / 2 + 20, 30, 'Choose a map', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5);
    text(this, W / 2 + 20, 60, `Floor bosses defeated: ${meta.bossesDefeated}`, 14, COLORS.textDim).setOrigin(0.5);
    button(this, 40, 28, 64, 36, '◀', () => this.scene.start('Title'), { fontSize: 15 });

    const cardH = 80;
    MAPS.forEach((m, i) => {
      const y = 84 + i * (cardH + 5);
      const open = mapUnlocked(m, meta.bossesDefeated);
      const selected = meta.lastMap === m.id;
      const card = this.add
        .rectangle(16, y, W - 32, cardH, open ? COLORS.panel : 0x18141f)
        .setOrigin(0)
        .setStrokeStyle(2, selected && open ? COLORS.accent : COLORS.stroke);
      const cleared = meta.clearedMaps.includes(m.id);
      text(this, 30, y + 10, m.name + (cleared ? '  ✓' : ''), 18, open ? COLORS.text : '#5d5578', { fontStyle: 'bold' });
      text(this, 30, y + 36, open ? m.desc : `Locked: defeat ${m.bossesToUnlock} floor bosses (${meta.bossesDefeated}/${m.bossesToUnlock})`, 12, open ? COLORS.textDim : '#5d5578', {
        wordWrap: { width: W - 80 },
      });
      if (m.biomes) {
        m.biomes.forEach((el, k) => {
          const chip = typeChip(this, 30 + k * 66, y + 63, el, true);
          if (!open) chip.setAlpha(0.35);
        });
      } else text(this, 30, y + 60, 'Random elements', 12, open ? '#ffc94d' : '#5d5578');
      if (open) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerup', () => {
          meta.lastMap = m.id;
          saveMeta(meta);
          this.scene.start('Starter', { mapId: m.id });
        });
      }
    });
  }
}
