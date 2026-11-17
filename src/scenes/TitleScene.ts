import Phaser from 'phaser';
import { SPECIES } from '../data/species';
import { clearSavedRun, hasSavedRun, loadRun, PASSIVES, starterShiny, todayUtc, dailyPlayed } from '../logic/run';
import { state } from '../state';
import { installOption, onInstallChange, promptInstall } from '../pwa';
import { openPicker, showMessage } from '../ui/picker';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { ensureTrainerTexture } from '../ui/trainerSprite';
import { myLook, myName } from '../data/trainerLook';
import { playMusic } from '../ui/sound';
import { openSettings } from '../ui/settings';
import { openHowToPlay } from '../ui/howto';
import { background, button, COLORS, H, LANDSCAPE, muteButton, text, W } from '../ui/widgets';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    background(this, COLORS.bg, 'title');
    playMusic('title');
    text(this, 8, H - 8, `build ${__BUILD__}`, 10, '#4a4068').setOrigin(0, 1);
    muteButton(this, W - 30, 30);
    // Settings: volumes, battle speed, tips, erasing progress.
    button(this, W - 78, 30, 40, 40, '', () => openSettings(this, () => this.scene.restart({})), { fontSize: 20, glyph: 'gear' });
    const meta = state.meta;
    // Upright: one centered column. Sideways: the title and parade on the left, buttons on the right.
    const lx = LANDSCAPE ? 215 : W / 2;
    const cx = LANDSCAPE ? 600 : W / 2;
    const ly = (y: number) => (LANDSCAPE ? { 70: 90, 115: 136, 190: 228, 180: 218, 270: 300, 294: 324 }[y] ?? y : y);
    const ry = (y: number) => (LANDSCAPE ? y - 280 : y);

    // Your trainer (top-left): tap to edit name and look.
    const tb = button(this, 66, 30, 116, 46, '', () => this.scene.start('Trainer', { from: 'Title' }), { color: 0x2f4a6b });
    tb.add(this.add.image(-38, 0, ensureTrainerTexture(this, myLook(meta))).setScale(1.15));
    const nm = text(this, 12, -8, myName(meta), 13, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5);
    if (nm.width > 76) nm.setScale(76 / nm.width);
    tb.add([nm, text(this, 12, 10, 'Edit trainer', 10, COLORS.textDim).setOrigin(0.5)]);

    // Parade of creatures you've unlocked as starters
    const ids = meta.unlockedStarters.slice(0, 6);
    ids.forEach((id, i) => {
      const key = ensureCreatureTexture(this, id, 0, starterShiny(meta, id));
      const x = lx - 170 + i * 68;
      const img = this.add.image(x, ly(190), key).setScale(2.2 * SPRITE_FIT);
      this.tweens.add({ targets: img, y: ly(180), yoyo: true, repeat: -1, duration: 700 + i * 90, ease: 'Sine.easeInOut' });
    });

    text(this, lx, LANDSCAPE ? 104 : 86, 'HEXBOUND', 52, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5);
    text(this, lx, LANDSCAPE ? 146 : 126, 'A HEXLING ROGUELITE', 18, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5);

    text(this, lx, ly(270), `Runs: ${meta.runs}   Wins: ${meta.wins}${meta.heatUnlocked ? `   Heat ${meta.heatUnlocked} unlocked` : ''}`, 16, COLORS.textDim).setOrigin(0.5);
    text(this, lx, ly(294), `Starters unlocked: ${meta.unlockedStarters.length} / ${SPECIES.length}`, 16, COLORS.textDim).setOrigin(0.5);

    if (hasSavedRun()) {
      button(this, cx, ry(360), 280, 64, 'CONTINUE RUN', () => this.continueRun(), { color: 0x3b6d4a, fontSize: 24 });
      button(this, cx, ry(420), 200, 40, 'New run', () => this.confirmNewRun(), { fontSize: 15 });
    } else {
      button(this, cx, ry(380), 280, 70, 'START RUN', () => this.scene.start('MapSelect', {}), { color: 0x3b6d4a, fontSize: 26 });
    }

    const passiveLabel = () => {
      const p = meta.equippedPassive;
      return p ? `Trainer passive: ${PASSIVES[p].name}` : 'Trainer passive: none';
    };
    button(
      this,
      cx,
      ry(480),
      320,
      58,
      passiveLabel(),
      () => this.scene.start('Passives', {}),
      { sub: meta.equippedPassive ? PASSIVES[meta.equippedPassive].desc : 'Passives & achievements', fontSize: 16 },
    );

    button(this, cx - 82, ry(550), 156, 54, 'Hexlidex', () => this.scene.start('Dex', { from: 'Title' }), { fontSize: 16 });
    // Daily run: the same seed for everyone today.
    const today = todayUtc();
    const best = dailyPlayed(meta, today)?.best ?? null;
    button(this, cx + 82, ry(550), 156, 54, 'Daily runs', () => this.scene.start('Daily', {}), {
      fontSize: 16,
      glyph: 'calendar',
      color: 0x2f4a6b,
      sub: best ? `Today: ${best.won ? 'won!' : `floor ${best.floor + 1}`}` : 'Today + past days',
    });

    button(this, cx - 82, ry(614), 156, 54, 'Battle Arena', () => this.scene.start('Arena', {}), {
      fontSize: 16,
      glyph: 'swords',
      color: 0x5a2a3a,
      sub: `Lv 50 · best ${meta.arenaBest ?? 0}/5`,
    });
    button(this, cx + 82, ry(614), 156, 54, 'Play online', () => this.scene.start('Duel', {}), {
      fontSize: 16,
      glyph: 'phone',
      color: 0x2f4a6b,
      sub: 'Duels · Stage battles',
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
        cx,
        LANDSCAPE ? ry(666) : ry(734),
        200,
        36,
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

    // How to play and Records (sideways: under the title, on the left).
    const hx = LANDSCAPE ? lx : cx;
    const hy = LANDSCAPE ? 392 : ry(676);
    button(this, hx - 82, hy, 156, 46, 'How to play', () => openHowToPlay(this), { fontSize: 15, glyph: 'book' });
    button(this, hx + 82, hy, 156, 46, 'Records', () => this.scene.start('Records', {}), {
      fontSize: 15,
      glyph: 'chart',
      sub: meta.streak ? `Win streak ${meta.streak}` : undefined,
    });
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
