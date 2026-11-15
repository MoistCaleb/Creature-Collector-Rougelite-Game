import Phaser from 'phaser';
import { SPECIES } from '../data/species';
import { PASSIVES, saveMeta, type PassiveId } from '../logic/run';
import { state } from '../state';
import { openPicker } from '../ui/picker';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, H, text, W } from '../ui/widgets';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    background(this);
    const meta = state.meta;

    // Parade of creatures you've unlocked as starters
    const ids = meta.unlockedStarters.slice(0, 6);
    ids.forEach((id, i) => {
      const key = ensureCreatureTexture(this, id, 0);
      const x = 55 + i * 68;
      const img = this.add.image(x, 190, key).setScale(2.2 * SPRITE_FIT);
      this.tweens.add({ targets: img, y: 180, yoyo: true, repeat: -1, duration: 700 + i * 90, ease: 'Sine.easeInOut' });
    });

    text(this, W / 2, 70, 'CREATURE', 44, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5);
    text(this, W / 2, 115, 'ROGUELITE', 30, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5);

    text(this, W / 2, 270, `Runs: ${meta.runs}   Wins: ${meta.wins}`, 16, COLORS.textDim).setOrigin(0.5);
    text(this, W / 2, 294, `Starters unlocked: ${meta.unlockedStarters.length} / ${SPECIES.length}`, 16, COLORS.textDim).setOrigin(0.5);

    button(this, W / 2, 380, 280, 70, 'START RUN', () => this.scene.start('Starter'), { color: 0x3b6d4a, fontSize: 26 });

    const passiveLabel = () => {
      const p = meta.equippedPassive;
      return p ? `Trainer passive: ${PASSIVES[p].name}` : 'Trainer passive: none';
    };
    button(
      this,
      W / 2,
      470,
      320,
      58,
      passiveLabel(),
      () => this.choosePassive(),
      { sub: meta.equippedPassive ? PASSIVES[meta.equippedPassive].desc : 'Tap to equip one', fontSize: 16 },
    );

    button(this, W / 2, 550, 200, 50, 'Creature Dex', () => this.scene.start('Dex', { from: 'Title' }), { fontSize: 17 });

    text(
      this,
      W / 2,
      H - 130,
      'Climb 3 floors. Pick your path.\nCatch creatures, evolve, prestige.\nDeath is permanent.',
      16,
      COLORS.textDim,
      { align: 'center', lineSpacing: 6 },
    ).setOrigin(0.5);
  }

  private choosePassive() {
    const meta = state.meta;
    const all = Object.keys(PASSIVES) as PassiveId[];
    openPicker(this, {
      title: 'Trainer Passive',
      subtitle: 'Equip one passive for your runs.',
      options: [
        { label: 'None', sub: 'No passive' },
        ...all.map((id) => {
          const unlocked = meta.unlockedPassives.includes(id);
          return {
            label: PASSIVES[id].name + (meta.equippedPassive === id ? '  (equipped)' : ''),
            sub: unlocked ? PASSIVES[id].desc : `Locked: ${PASSIVES[id].unlock}`,
            disabled: !unlocked,
          };
        }),
      ],
      onPick: (i) => {
        meta.equippedPassive = i === 0 ? null : all[i - 1];
        saveMeta(meta);
        this.scene.restart();
      },
      onCancel: () => {},
    });
  }
}
