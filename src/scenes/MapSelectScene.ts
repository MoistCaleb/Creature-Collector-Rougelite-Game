import Phaser from 'phaser';
import { MAPS, mapUnlocked } from '../data/maps';
import { saveMeta } from '../logic/run';
import { HEAT_LEVELS } from '../data/heat';
import { openPicker } from '../ui/picker';
import { state } from '../state';
import { playMusic } from '../ui/sound';
import { background, button, COLORS, text, typeChip, W } from '../ui/widgets';

/** Choose which map (set of floor elements) to run before picking a starter. */
export class MapSelectScene extends Phaser.Scene {
  constructor() {
    super('MapSelect');
  }

  create() {
    background(this);
    playMusic('title');
    const meta = state.meta;
    text(this, W / 2 + 20, 30, 'Choose a map', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5);
    text(this, W / 2 + 20, 60, `Runs won: ${meta.wins}`, 14, COLORS.textDim).setOrigin(0.5);
    button(this, 40, 28, 64, 36, '', () => this.scene.start('Title', {}), { fontSize: 15, glyph: 'back' });
    // Heat (difficulty) picker, once the first run is won.
    const unlocked = meta.heatUnlocked ?? 0;
    if (unlocked > 0) {
      const heat = Math.min(meta.heat ?? 0, unlocked);
      button(this, W - 50, 28, 84, 36, String(heat), () => this.pickHeat(), { fontSize: 16, color: heat > 0 ? 0x7a2a1c : undefined, glyph: 'flame' });
    }

    const cardH = 80;
    MAPS.forEach((m, i) => {
      const y = 84 + i * (cardH + 5);
      const open = mapUnlocked(m, meta.wins);
      const selected = meta.lastMap === m.id;
      const card = this.add
        .rectangle(16, y, W - 32, cardH, open ? COLORS.panel : 0x18141f)
        .setOrigin(0)
        .setStrokeStyle(2, selected && open ? COLORS.accent : COLORS.stroke);
      const cleared = meta.clearedMaps.includes(m.id);
      text(this, 30, y + 10, m.name + (cleared ? '  ✓' : ''), 18, open ? COLORS.text : '#5d5578', { fontStyle: 'bold' });
      text(this, 30, y + 36, open ? m.desc : `Locked: win ${m.winsToUnlock} run${m.winsToUnlock === 1 ? '' : 's'} (${meta.wins}/${m.winsToUnlock})`, 12, open ? COLORS.textDim : '#5d5578', {
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

  private pickHeat() {
    const meta = state.meta;
    const unlocked = meta.heatUnlocked ?? 0;
    openPicker(this, {
      title: 'Heat',
      subtitle: `Each level adds its rule on top of every level below it. Win at your highest Heat to unlock the next.`,
      options: HEAT_LEVELS.map((h, i) => ({
        label: h.name,
        glyph: i > unlocked ? ('lock' as const) : i > 0 ? ('flame' as const) : undefined,
        badge: i === (meta.heat ?? 0) ? 'SELECTED' : undefined,
        sub: i > unlocked ? 'Win a run at the Heat below to unlock' : h.desc,
        disabled: i > unlocked,
        color: i === 0 ? 0x2f4a3a : 0x5a2a1c,
      })),
      onPick: (i) => {
        meta.heat = i;
        saveMeta(meta);
        this.scene.restart({});
      },
      onCancel: () => {},
      rowHeight: 58,
    });
  }
}