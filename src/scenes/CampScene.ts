import { friendsAvailable } from '../net/friends';
import Phaser from 'phaser';
import { LEGENDS } from '../data/legends';
import { MAP_BY_ID } from '../data/maps';
import { SPECIES_BY_ID } from '../data/species';
import { ELEMENT_COLORS } from '../data/types';
import { myLook, myName } from '../data/trainerLook';
import { dayPhase } from '../logic/ambience';
import { clearSavedRun, hasSavedRun, legendsCaught, loadRun } from '../logic/run';
import { myTitle } from '../logic/titles';
import { state } from '../state';
import { cry } from '../ui/cries';
import { calm } from '../ui/motion';
import { prefs } from '../ui/prefs';
import { playMusic, sfx } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { titleBadge } from '../ui/titleBadge';
import { trainerFx } from '../ui/trainerFx';
import { ensureTrainerTexture } from '../ui/trainerSprite';
import { background, button, COLORS, H, LANDSCAPE, text, W } from '../ui/widgets';

/**
 * Camp: where you rest between runs. Purely for looks: your trainer by the fire, the Hexlings who
 * finished your last run wandering around it, your trophies, and signposts to everywhere else.
 * Nothing here carries into a run.
 */
export class CampScene extends Phaser.Scene {
  constructor() {
    super('Camp');
  }

  create() {
    const meta = state.meta;
    background(this, 0x0c0a18);
    playMusic('title');
    const phase = prefs.worldClock ? dayPhase() : 'night';
    const sky: Record<string, [number, number]> = { dawn: [0x3a2a5a, 0xd88a7a], day: [0x2a5a9a, 0x8ac0e8], dusk: [0x2a1a4a, 0xe07a4a], night: [0x0a0a24, 0x1e1a40] };
    const [top, bottom] = sky[phase];
    const groundY = H * (LANDSCAPE ? 0.5 : 0.4);
    // The open ground around the fire: clear of the signposts.
    const x1 = LANDSCAPE ? W - 200 : W;
    const floorBottom = LANDSCAPE ? H - 20 : H - 136;

    // ---- sky, stars, hills, ground
    const g = this.add.graphics();
    const bands = 18;
    for (let i = 0; i < bands; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(top), Phaser.Display.Color.ValueToColor(bottom), bands - 1, i);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).fillRect(-W, (groundY * i) / bands, W * 3, groundY / bands + 1);
    }
    if (phase !== 'day') {
      for (let i = 0; i < 40; i++) {
        const s = this.add.rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, groundY - 60), 2, 2, 0xfff6d0, Math.random() * 0.6 + 0.2);
        if (!calm()) this.tweens.add({ targets: s, alpha: 0.1, yoyo: true, repeat: -1, duration: Phaser.Math.Between(900, 2600), delay: Phaser.Math.Between(0, 2000) });
      }
      const moonY = LANDSCAPE ? groundY * 0.22 : groundY * 0.45;
      this.add.circle(W * 0.84, moonY, 22, 0xf4ecd0).setAlpha(0.9);
      this.add.circle(W * 0.84 + 8, moonY - 5, 20, top);
    } else this.add.circle(W * 0.84, LANDSCAPE ? groundY * 0.22 : groundY * 0.45, 26, 0xfff0a0);
    const hills = this.add.graphics().fillStyle(0x14102a, 1);
    for (let x = -40; x < W + 80; x += 70) hills.fillTriangle(x, groundY, x + 50, groundY - 70 - ((x * 7) % 40), x + 100, groundY);
    // Pines along the horizon.
    const pines = this.add.graphics().fillStyle(0x0e0c1e, 1);
    for (let x = 10; x < W; x += 34 + ((x * 13) % 20)) {
      const h = 44 + ((x * 31) % 30);
      pines.fillTriangle(x - 12, groundY, x, groundY - h, x + 12, groundY);
    }
    this.add.rectangle(-W, groundY, W * 3, H - groundY + 40, 0x1e2a1c).setOrigin(0);
    this.add.rectangle(-W, groundY, W * 3, 6, 0x2c3a26).setOrigin(0);

    // ---- the fire
    const fx = x1 / 2;
    const fy = groundY + (floorBottom - groundY) * 0.48;
    const rx = Math.min(190, x1 * 0.38);
    const ry = (floorBottom - groundY) * 0.34;
    const fireDepth = fy / 1000;
    this.add.circle(fx, fy - 10, 150, 0xff9a3a, 0.05);
    const glow = this.add.circle(fx, fy - 10, 95, 0xff9a3a, 0.08);
    if (!calm()) this.tweens.add({ targets: glow, scale: 1.12, alpha: 0.18, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
    this.add.ellipse(fx, fy + 6, 70, 16, 0x000000, 0.35);
    this.add.rectangle(fx, fy, 56, 9, 0x6a3a1a).setAngle(18).setStrokeStyle(1, 0x2a160a);
    this.add.rectangle(fx, fy, 56, 9, 0x7a4a24).setAngle(-18).setStrokeStyle(1, 0x2a160a);
    const flames = [0xff4a1a, 0xff8a2a, 0xffd04a].map((c, i) => this.add.ellipse(fx, fy - 14 - i * 4, 34 - i * 10, 40 - i * 10, c, 0.95).setOrigin(0.5, 0.8).setDepth(fireDepth));
    flames.forEach((f, i) => {
      if (!calm()) this.tweens.add({ targets: f, scaleY: 1.25, scaleX: 0.85, yoyo: true, repeat: -1, duration: 160 + i * 70, ease: 'Sine.easeInOut' });
    });
    const px = 'camp-px';
    if (!this.textures.exists(px)) {
      const pg = this.make.graphics({}, false).fillStyle(0xffffff).fillRect(0, 0, 2, 2);
      pg.generateTexture(px, 2, 2);
      pg.destroy();
    }
    this.add.particles(fx, fy - 30, px, {
      // (over the fire)
      speedY: { min: -60, max: -30 },
      speedX: { min: -12, max: 12 },
      lifespan: 1600,
      frequency: calm() ? 300 : 110,
      tint: [0xffd04a, 0xff8a2a],
      alpha: { start: 1, end: 0 },
      scale: { min: 0.8, max: 1.4 },
      blendMode: 'ADD',
    });

    // ---- your trainer, sitting by the fire
    const look = myLook(meta);
    const mx = fx - rx * 0.8;
    const my = fy + 4;
    this.add.ellipse(mx, my, 34, 9, 0x000000, 0.35);
    const me = this.add.image(mx, my, ensureTrainerTexture(this, look, 'stand')).setOrigin(0.5, 0.94).setScale(2).setDepth(my / 1000);
    trainerFx(this, me, look);
    me.setFlipX(false);
    text(this, mx, my + 6, myName(meta), 12, '#ffe9a8', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(2);

    // ---- the Hexlings who finished your last run (or your starters, before your first run)
    const last = meta.history?.[0];
    const team = last?.team.length
      ? last.team.slice(0, 6)
      : meta.unlockedStarters.slice(0, 3).map((id) => ({ speciesId: id, stage: 0, level: 5, shiny: false }));
    // In a ring around the fire (your trainer has the spot on the left).
    team.forEach((c, i) => {
      const a = Math.PI + ((i + 1) * Math.PI * 2) / (team.length + 1);
      this.wanderer(c.speciesId, c.stage, !!c.shiny, { x: fx + Math.cos(a) * rx, y: fy + Math.sin(a) * ry + 8 }, fx);
    });

    // ---- header: camp, and how the last run went
    text(this, W / 2, LANDSCAPE ? 14 : 22, 'Camp', LANDSCAPE ? 24 : 28, '#ffc94d', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 4 }).setOrigin(0.5, 0);
    const lastLine = last
      ? last.won
        ? `Last run: won ${MAP_BY_ID[last.mapId]?.name ?? ''}${last.heat ? ` at Heat ${last.heat}` : ''}!`
        : `Last run: fell on floor ${last.floor}${last.endedBy ? ` to ${last.endedBy}` : ''}.`
      : 'Rest up. Adventure is waiting.';
    text(this, W / 2, LANDSCAPE ? 44 : 56, lastLine, 13, '#e8e0ff', { stroke: '#14101e', strokeThickness: 3, align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5, 0);
    const title = myTitle(meta);
    if (title) titleBadge(this, W / 2, LANDSCAPE ? 70 : 84, title, 12, { maxW: 220 });

    // ---- trophies: a little shelf of what you've done
    this.trophies(LANDSCAPE ? 16 : 14, LANDSCAPE ? 96 : 110);

    // ---- signposts
    this.signposts();
  }

  /** One of last run's Hexlings, idling around the fire: little walks, naps, tap for a cry. */
  private wanderer(speciesId: string, stage: number, shiny: boolean, home: { x: number; y: number }, fx: number) {
    if (!SPECIES_BY_ID[speciesId]) return;
    const c = this.add.container(home.x, home.y);
    const shadow = this.add.ellipse(0, 0, 26, 8, 0x000000, 0.35);
    const img = this.add.image(0, 0, ensureCreatureTexture(this, speciesId, stage, shiny)).setOrigin(0.5, 0.92).setScale(1.8 * SPRITE_FIT).setFlipX(home.x > fx);
    c.add([shadow, img]);
    c.setDepth(c.y / 1000);
    img.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      cry(speciesId, stage);
      this.bubble(c, '♥', '#ff8ab0');
      this.tweens.add({ targets: img, y: -12, yoyo: true, duration: 180, ease: 'Quad.easeOut' });
    });
    const act = () => {
      if (!c.active) return;
      const r = Math.random();
      if (r < 0.45) {
        const tx = home.x + Phaser.Math.Between(-22, 22);
        const ty = home.y + Phaser.Math.Between(-8, 8);
        img.setFlipX(tx > c.x);
        const bounce = this.tweens.add({ targets: img, y: -3, yoyo: true, repeat: -1, duration: 150 });
        this.tweens.add({
          targets: c,
          x: tx,
          y: ty,
          duration: 900,
          ease: 'Sine.easeInOut',
          onUpdate: () => c.setDepth(c.y / 1000),
          onComplete: () => {
            bounce.remove();
            img.setY(0);
          },
        });
      } else if (r < 0.65) {
        for (let k = 0; k < 3; k++) this.time.delayedCall(k * 900, () => c.active && this.bubble(c, 'z', '#d8e0ff'));
      } else if (r < 0.8) {
        // Turn to the fire for a bit.
        img.setFlipX(c.x < fx);
      } else this.tweens.add({ targets: img, y: -9, yoyo: true, duration: 170 });
      this.time.delayedCall(Phaser.Math.Between(1800, 4200), act);
    };
    this.time.delayedCall(Phaser.Math.Between(400, 2500), act);
  }

  private bubble(c: Phaser.GameObjects.Container, s: string, color: string) {
    const t = text(this, c.x + 6, c.y - 46, s, 14, color, { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5).setDepth(5);
    this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
  }

  /** Runs won, tournaments, legendaries, and a pennant for each map you've won. */
  private trophies(x: number, y: number) {
    const meta = state.meta;
    const rows: [string, string][] = [
      ['Runs won', String(meta.wins)],
      ['Tournaments', String(meta.tourneyWins ?? 0)],
      ['Legendaries', `${legendsCaught(meta)}/${LEGENDS.length}`],
    ];
    const w = LANDSCAPE ? 150 : 132;
    const h = 22 + rows.length * 18 + (meta.clearedMaps.length ? 26 : 0);
    this.add.rectangle(x, y, w, h, 0x1a1428, 0.82).setOrigin(0).setStrokeStyle(2, 0x6a4a2a);
    text(this, x + 8, y + 5, 'TROPHIES', 10, '#ffc94d', { fontStyle: 'bold' });
    rows.forEach(([label, value], i) => {
      text(this, x + 8, y + 22 + i * 18, label, 11, COLORS.textDim);
      text(this, x + w - 8, y + 22 + i * 18, value, 11, COLORS.text, { fontStyle: 'bold' }).setOrigin(1, 0);
    });
    // Pennants: one per map won, in its first land's color.
    meta.clearedMaps.slice(0, 8).forEach((id, i) => {
      const m = MAP_BY_ID[id];
      const color = m?.biomes ? ELEMENT_COLORS[m.biomes[0]] : 0xc9c0e0;
      const px = x + 10 + i * 15;
      const py = y + h - 22;
      this.add.rectangle(px, py, 2, 16, 0x8a6a4a).setOrigin(0);
      this.add.triangle(px + 2, py, 0, 0, 10, 4, 0, 8, color).setOrigin(0);
    });
  }

  /** Wooden signposts: where to go from camp. */
  private signposts() {
    const meta = state.meta;
    const saved = hasSavedRun();
    const go: [string, () => void, number][] = [
      [
        saved ? 'Continue run' : 'Set out',
        () => {
          if (!saved) return this.scene.start('MapSelect', {});
          const run = loadRun(meta);
          if (!run) {
            clearSavedRun();
            return this.scene.restart();
          }
          state.run = run;
          this.scene.start('Map', {});
        },
        0x3b6d4a,
      ],
      ['Battle Arena', () => this.scene.start('Arena', {}), 0x6a4a2a],
      ['Hexlidex', () => this.scene.start('Dex', { from: 'Camp' }), 0x6a4a2a],
      ['Records', () => this.scene.start('Records', {}), 0x6a4a2a],
      ...(friendsAvailable() ? ([['Friends', () => this.scene.start('Friends', { from: 'Camp' }), 0x2f4a6b]] as [string, () => void, number][]) : []),
      ['Title screen', () => this.scene.start('Title', {}), 0x4a3a2a],
    ];
    if (LANDSCAPE) {
      // A column of signs on the right.
      go.forEach(([label, fn, color], i) => {
        button(this, W - 100, 110 + i * 54, 180, 46, label, () => (sfx.click(), fn()), { fontSize: 15, color }).setDepth(3);
      });
      return;
    }
    // Upright: the main way out big, the rest in a row of four under it.
    const [first, ...rest] = go;
    button(this, W / 2, H - 98, 260, 52, first[0], () => (sfx.click(), first[1]()), { fontSize: 18, color: first[2] }).setDepth(3);
    const bw = (W - 40) / rest.length;
    rest.forEach(([label, fn, color], i) => {
      button(this, 20 + bw / 2 + i * bw, H - 40, bw - 6, 44, label, () => (sfx.click(), fn()), { fontSize: rest.length > 4 ? 11 : 12, color }).setDepth(3);
    });
  }
}
