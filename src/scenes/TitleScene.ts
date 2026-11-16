import Phaser from 'phaser';
import { SPECIES } from '../data/species';
import { clearSavedRun, hasSavedRun, loadRun, PASSIVES, todayUtc } from '../logic/run';
import { state } from '../state';
import { installOption, onInstallChange, promptInstall } from '../pwa';
import { openPicker, showMessage } from '../ui/picker';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { playMusic } from '../ui/sound';
import { buzz, canVibrate } from '../ui/haptics';
import type { IconId } from '../ui/icons';
import { prefs } from '../ui/prefs';
import { background, button, COLORS, H, muteButton, setGlyph, text, W } from '../ui/widgets';

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
      const glyph = (): IconId => (prefs.haptics ? 'vibe' : 'vibeOff');
      const b = button(this, W - 78, 30, 40, 40, '', () => {
        prefs.haptics = !prefs.haptics;
        setGlyph(b, glyph());
        buzz(30);
      }, { fontSize: 20, glyph: glyph() });
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

    text(this, W / 2, 270, `Runs: ${meta.runs}   Wins: ${meta.wins}${meta.heatUnlocked ? `   Heat ${meta.heatUnlocked} unlocked` : ''}`, 16, COLORS.textDim).setOrigin(0.5);
    text(this, W / 2, 294, `Starters unlocked: ${meta.unlockedStarters.length} / ${SPECIES.length}`, 16, COLORS.textDim).setOrigin(0.5);

    if (hasSavedRun()) {
      button(this, W / 2, 360, 280, 64, 'CONTINUE RUN', () => this.continueRun(), { color: 0x3b6d4a, fontSize: 24 });
      button(this, W / 2, 420, 200, 40, 'New run', () => this.confirmNewRun(), { fontSize: 15 });
    } else {
      button(this, W / 2, 380, 280, 70, 'START RUN', () => this.scene.start('MapSelect', {}), { color: 0x3b6d4a, fontSize: 26 });
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
      () => this.scene.start('Passives', {}),
      { sub: meta.equippedPassive ? PASSIVES[meta.equippedPassive].desc : 'Passives & achievements', fontSize: 16 },
    );

    button(this, W / 2 - 82, 550, 156, 54, 'Creature Dex', () => this.scene.start('Dex', { from: 'Title' }), { fontSize: 16 });
    // Daily run: the same seed for everyone today.
    const today = todayUtc();
    const best = meta.daily?.date === today ? meta.daily.best : null;
    button(this, W / 2 + 82, 550, 156, 54, 'Daily run', () => this.startDaily(today), {
      fontSize: 16,
      glyph: 'calendar',
      color: 0x2f4a6b,
      sub: best ? `Best: ${best.won ? 'won!' : `floor ${best.floor + 1}`}` : 'New run every day',
    });

    button(this, W / 2, 616, 320, 50, 'Battle Arena', () => this.scene.start('Arena', {}), {
      fontSize: 17,
      glyph: 'swords',
      color: 0x5a2a3a,
      sub: `Lv 50 teams from your Dex · best ${meta.arenaBest ?? 0}/5`,
    });

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
        672,
        200,
        40,
        'Install app',
        () => {
          if (opt === 'prompt') void promptInstall().then(() => this.scene.restart({}));
          else
            showMessage(
              this,
              'Install on iPhone',
              'In Safari, tap the Share button (the square with an arrow), then "Add to Home Screen".\n\nThe game then opens fullscreen from its own icon and works offline.',
            );
        },
        { fontSize: 16, color: 0x2f4a7a, glyph: 'phone' },
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
      this.scene.restart({});
      return;
    }
    state.run = run;
    this.scene.start('Map', {});
  }

  private startDaily(date: string) {
    const go = () => this.scene.start('Starter', { daily: date });
    if (!hasSavedRun()) return go();
    openPicker(this, {
      title: 'Abandon your run?',
      subtitle: 'Starting the daily run ends your current run.',
      options: [{ label: 'Abandon and play the daily', color: 0x8a2c2c }],
      onPick: () => {
        clearSavedRun();
        go();
      },
      onCancel: () => {},
    });
  }

  private confirmNewRun() {
    openPicker(this, {
      title: 'Abandon your run?',
      subtitle: 'Your current run will be lost.',
      options: [{ label: 'Abandon and start fresh', color: 0x8a2c2c }],
      onPick: () => {
        clearSavedRun();
        this.scene.start('MapSelect', {});
      },
      onCancel: () => {},
    });
  }


}
