import Phaser from 'phaser';
import { SPECIES } from '../data/species';
import { clearSavedRun, hasSavedRun, loadRun, PASSIVES } from '../logic/run';
import { state } from '../state';
import { installOption, onInstallChange, promptInstall } from '../pwa';
import { openPicker, showMessage } from '../ui/picker';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { playMusic } from '../ui/sound';
import { buzz, canVibrate } from '../ui/haptics';
import { prefs } from '../ui/prefs';
import { background, button, COLORS, H, muteButton, text, W } from '../ui/widgets';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    background(this);
    playMusic('title');
    text(this, 8, H - 8, `build ${__BUILD__}`, 10, '#4a4068').setOrigin(0, 1);
    muteButton(this, W - 30, 30);
    if (canVibrate) {
      // Vibration toggle (only on devices that can vibrate).
      const label = () => (prefs.haptics ? '📳' : '📴');
      const b = button(this, W - 78, 30, 40, 40, label(), () => {
        prefs.haptics = !prefs.haptics;
        (b.list[1] as Phaser.GameObjects.Text).setText(label());
        buzz(30);
      }, { fontSize: 18 });
    }
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

    if (hasSavedRun()) {
      button(this, W / 2, 360, 280, 64, 'CONTINUE RUN', () => this.continueRun(), { color: 0x3b6d4a, fontSize: 24 });
      button(this, W / 2, 420, 200, 40, 'New run', () => this.confirmNewRun(), { fontSize: 15 });
    } else {
      button(this, W / 2, 380, 280, 70, 'START RUN', () => this.scene.start('MapSelect'), { color: 0x3b6d4a, fontSize: 26 });
    }

    const passiveLabel = () => {
      const p = meta.equippedPassive;
      return p ? `Trainer passive: ${PASSIVES[p].name}` : 'Trainer passive: none';
    };
    button(
      this,
      W / 2,
      480,
      320,
      58,
      passiveLabel(),
      () => this.scene.start('Passives'),
      { sub: meta.equippedPassive ? PASSIVES[meta.equippedPassive].desc : 'Passives & achievements', fontSize: 16 },
    );

    button(this, W / 2, 550, 200, 50, 'Creature Dex', () => this.scene.start('Dex', { from: 'Title' }), { fontSize: 17 });

    // "Install app" appears when the browser can install the game (or on iPhone, with steps).
    let install: Phaser.GameObjects.Container | null = null;
    const drawInstall = () => {
      install?.destroy();
      install = null;
      const opt = installOption();
      if (!opt) return;
      install = button(
        this,
        W / 2,
        612,
        200,
        44,
        '📲 Install app',
        () => {
          if (opt === 'prompt') void promptInstall().then(() => this.scene.restart());
          else
            showMessage(
              this,
              'Install on iPhone',
              'In Safari, tap the Share button (the square with an arrow), then "Add to Home Screen".\n\nThe game then opens fullscreen from its own icon and works offline.',
            );
        },
        { fontSize: 16, color: 0x2f4a7a },
      );
    };
    drawInstall();
    const off = onInstallChange(drawInstall);
    this.events.once('shutdown', off);

    text(
      this,
      W / 2,
      H - 90,
      'Climb 3 floors. Pick your path.\nCatch creatures, evolve, prestige.\nDeath is permanent.',
      16,
      COLORS.textDim,
      { align: 'center', lineSpacing: 6 },
    ).setOrigin(0.5);
  }

  private continueRun() {
    const run = loadRun(state.meta);
    if (!run) {
      clearSavedRun();
      this.scene.restart();
      return;
    }
    state.run = run;
    this.scene.start('Map');
  }

  private confirmNewRun() {
    openPicker(this, {
      title: 'Abandon your run?',
      subtitle: 'Your current run will be lost.',
      options: [{ label: 'Abandon and start fresh', color: 0x8a2c2c }],
      onPick: () => {
        clearSavedRun();
        this.scene.start('MapSelect');
      },
      onCancel: () => {},
    });
  }


}
