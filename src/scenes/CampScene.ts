import Phaser from 'phaser';
import { DEX_FORMS, LEGENDS } from '../data/legends';
import { MAP_BY_ID } from '../data/maps';
import { SPECIES, SPECIES_BY_ID } from '../data/species';
import { CLOTH_COLORS, cleanLook, myLook, myName, type TrainerLook } from '../data/trainerLook';
import { ELEMENT_COLORS } from '../data/types';
import { dayPhase } from '../logic/ambience';
import {
  buyCampItem,
  camp,
  BOND_HEART,
  BOND_POINTS,
  bondColours,
  bondReward,
  bondToNext,
  CAMP_HEARTS,
  campVisitor,
  toggleBondColours,
  CAMP_ITEMS,
  CARE,
  campCrew,
  campHearts,
  campStage,
  caredToday,
  care,
  challenges,
  claimChallenge,
  CREW_MAX,
  fireColors,
  growth,
  legendFloors,
  prepOffers,
  PREPS,
  TIER_EMBERS,
  TIER_NAMES,
  type Care,
  type ChallengeState,
  type PrepId,
  campPairs,
  openGifts,
} from '../logic/camp';
import { createCreature } from '../logic/creature';
import { type WorkshopBranch } from '../data/workshop';
import { openWorkshopTree } from '../ui/workshopTree';
import { titleNews } from '../logic/cosmetics';
import { workshopProgress } from '../logic/workshop';
import { payHuntMilestones } from '../logic/huntMilestones';
import { payWelcomeBack, welcomeText } from '../logic/welcomeBack';
import { tip } from '../ui/tips';
import { announceHunt } from '../ui/gildedUi';
import { Rng } from '../logic/rng';
import { applyPrep, clearSavedRun, floorsOf, hasSavedRun, legendsCaught, loadRun, rivalHello, saveMeta } from '../logic/run';
import { myTitle, takeNewTitles } from '../logic/titles';
import { friendsAvailable, listFriends, type Friend } from '../net/friends';
import { state } from '../state';
import { card } from '../ui/accountUi';
import { cry } from '../ui/cries';
import { calm } from '../ui/motion';
import { openPicker, showMessage } from '../ui/picker';
import { prefs } from '../ui/prefs';
import { playMusic, sfx } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT , type Colours } from '../ui/sprites';
import { titleBadge } from '../ui/titleBadge';
import { trainerFx } from '../ui/trainerFx';
import { ensureTrainerTexture } from '../ui/trainerSprite';
import { background, button, COLORS, H, LANDSCAPE, text, W } from '../ui/widgets';

/** The camp's regular visitors: who they are, how they look, and which daily challenge they hand out. */
const VISITORS = [
  { name: 'Mori', tier: 0, look: { hat: 3, hatColor: 10, top: 9, topColor: 17, accent: 1, hair: 4, hairColor: 2, skin: 2 } },
  { name: 'Professor Alder', tier: 1, look: { hat: 0, top: 3, topColor: 11, accent: 6, hair: 0, hairColor: 4, face: 1, skin: 0 } },
  { name: 'Your rival', tier: 2, look: { hat: 13, hatColor: 0, top: 2, topColor: 13, accent: 0, hair: 1, hairColor: 0, skin: 3 } },
] as const;

const CHALLENGE_LINES = [
  (c: string) => `Do me a favour today? ${c}, and I'll pay you in embers!`,
  (c: string) => `For my research: ${c.charAt(0).toLowerCase()}${c.slice(1)}. Embers for your trouble.`,
  (c: string) => `Bet you can't ${c.charAt(0).toLowerCase()}${c.slice(1)} today. Prove me wrong.`,
];

/**
 * Camp: where you rest between runs, and where every run starts. Before a run (prep mode) you take
 * one thing for the road and hear the news; between runs your visitors hand out daily challenges
 * for embers, you spend time with the Hexlings who stay here, and the camp grows as you play.
 * Online friends sit by your fire with their favourite Hexling.
 */
export class CampScene extends Phaser.Scene {
  private prep = false;
  private alive = false;
  private fx = 0;
  private fy = 0;
  private rx = 0;
  private ry = 0;

  constructor() {
    super('Camp');
  }

  /** Reopen the Workshop on this branch after a purchase (the scene restarts to redraw). */
  private reopen: WorkshopBranch | 'list' | null = null;

  init(data: { prep?: boolean; workshop?: WorkshopBranch | 'list' }) {
    this.prep = !!data.prep && !!state.run;
    this.reopen = data.workshop ?? null;
  }

  /** Gifts your crew found while you were away (2.07): opened on arrival, their embers yours. */
  private showGifts(then: () => void) {
    const meta = state.meta;
    const gifts = openGifts(meta);
    const pairs = campPairs(meta);
    if (!gifts.length) return then();
    saveMeta(meta);
    sfx.coin();
    const name = (id: string) => SPECIES_BY_ID[id]?.names[campStage(meta, id)] ?? SPECIES_BY_ID[id]?.names[0] ?? id;
    const lines = gifts.map((g) => `${name(g.speciesId)} found ${g.what}: +${g.embers} embers`);
    const together = pairs.length ? `\n\n${pairs.map(([a, b]) => `${name(a)} and ${name(b)}`).join(', ')} kept each other company (+1 bond each).` : '';
    showMessage(this, 'While you were away', `${lines.join('\n')}${together}`, () => this.scene.restart());
    void then;
  }

  create() {
    this.alive = true;
    this.events.once('shutdown', () => (this.alive = false));
    const meta = state.meta;
    camp(meta);
    background(this, 0x0c0a18);
    playMusic('title');
    const phase = prefs.worldClock ? dayPhase() : 'night';
    const sky: Record<string, [number, number]> = { dawn: [0x3a2a5a, 0xd88a7a], day: [0x2a5a9a, 0x8ac0e8], dusk: [0x2a1a4a, 0xe07a4a], night: [0x0a0a24, 0x1e1a40] };
    const [top, bottom] = sky[phase];
    const groundY = H * (LANDSCAPE ? 0.5 : 0.4);
    // The open ground around the fire: clear of the signposts (or the choice before a run).
    const x1 = LANDSCAPE ? W - (this.prep ? 280 : 200) : W;
    const floorBottom = LANDSCAPE ? H - 20 : H - (this.prep ? 286 : 136);

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
    const pines = this.add.graphics().fillStyle(0x0e0c1e, 1);
    for (let x = 10; x < W; x += 34 + ((x * 13) % 20)) {
      const h = 44 + ((x * 31) % 30);
      pines.fillTriangle(x - 12, groundY, x, groundY - h, x + 12, groundY);
    }
    this.add.rectangle(-W, groundY, W * 3, H - groundY + 40, 0x1e2a1c).setOrigin(0);
    this.add.rectangle(-W, groundY, W * 3, 6, 0x2c3a26).setOrigin(0);

    // ---- the fire (bigger as you win more, in the colour you chose)
    const grow = growth(meta, DEX_FORMS);
    const fx = (this.fx = x1 / 2);
    const fy = (this.fy = groundY + (floorBottom - groundY) * 0.5);
    const rx = (this.rx = Math.min(190, x1 * 0.38));
    const ry = (this.ry = (floorBottom - groundY) * 0.34);
    this.scenery(groundY, x1, floorBottom, phase);
    this.growthBack(grow, groundY, x1, floorBottom);
    const fireDepth = fy / 1000;
    const [c0, c1, c2] = fireColors(meta);
    const big = 1 + grow.fire * 0.14;
    this.add.circle(fx, fy - 10, 150 * big, c1, 0.05);
    const glow = this.add.circle(fx, fy - 10, 95 * big, c1, 0.08);
    if (!calm()) this.tweens.add({ targets: glow, scale: 1.12, alpha: 0.18, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
    this.add.ellipse(fx, fy + 6, 70 * big, 16, 0x000000, 0.35);
    this.add.rectangle(fx, fy, 56 * big, 9, 0x6a3a1a).setAngle(18).setStrokeStyle(1, 0x2a160a);
    this.add.rectangle(fx, fy, 56 * big, 9, 0x7a4a24).setAngle(-18).setStrokeStyle(1, 0x2a160a);
    if (grow.fire >= 2) this.add.rectangle(fx, fy + 2, 60 * big, 8, 0x5a321a).setStrokeStyle(1, 0x2a160a);
    // A ring of stones once you've won a run.
    if (grow.fire >= 1) for (let i = 0; i < 10; i++) this.add.ellipse(fx + Math.cos((i / 10) * Math.PI * 2) * 38 * big, fy + 4 + Math.sin((i / 10) * Math.PI * 2) * 9, 12, 7, 0x6a6a7a).setStrokeStyle(1, 0x2a2a3a);
    const flames = [c0, c1, c2].map((c, i) =>
      this.add.ellipse(fx, fy - 14 - i * 4, (34 - i * 10) * big, (40 - i * 10) * big, c, 0.95).setOrigin(0.5, 0.8).setDepth(fireDepth),
    );
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
      speedY: { min: -60, max: -30 },
      speedX: { min: -12, max: 12 },
      lifespan: 1600,
      frequency: calm() ? 300 : 110 / big,
      tint: [c2, c1],
      alpha: { start: 1, end: 0 },
      scale: { min: 0.8, max: 1.4 },
      blendMode: 'ADD',
    });
    this.growthFront(grow, x1, floorBottom);

    // ---- your trainer, sitting by the fire
    const look = myLook(meta);
    const mx = fx - rx * 0.8;
    const my = fy + 4;
    this.add.ellipse(mx, my, 34, 9, 0x000000, 0.35);
    const me = this.add.image(mx, my, ensureTrainerTexture(this, look, 'stand')).setOrigin(0.5, 0.94).setScale(2).setDepth(my / 1000);
    trainerFx(this, me, look);
    text(this, mx, my + 6, myName(meta), 12, '#ffe9a8', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(2);

    // ---- the Hexlings who stay at camp, around the back of the fire
    const crew = campCrew(meta);
    crew.forEach((c, i) => {
      const a = Math.PI + ((i + 1) * Math.PI) / (crew.length + 1);
      this.wanderer(c.speciesId, c.stage, c.shiny || (c.alt ? 'alt' : false), { x: fx + Math.cos(a) * rx, y: fy + Math.sin(a) * ry + 8 }, fx);
    });
    // Camp bond heart 5: a best friend who isn't staying drops by, in front of the fire.
    const guest = campVisitor(meta);
    if (guest) {
      const look = (meta.shinyOwned ?? []).includes(guest) && !(meta.shinyOff ?? []).includes(guest) ? true : bondColours(meta, guest) ? 'alt' : false;
      this.wanderer(guest, campStage(meta, guest), look, { x: fx + rx * 0.62, y: fy + ry * 0.72 + 8 }, fx, true);
    }

    // ---- visitors
    this.visitors(groundY, x1);

    // ---- header
    const last = meta.history?.[0];
    text(this, W / 2, LANDSCAPE ? 14 : 22, 'Camp', LANDSCAPE ? 24 : 28, '#ffc94d', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 4 }).setOrigin(0.5, 0);
    const run = state.run;
    const lastLine = this.prep && run
      ? `Getting ready for ${MAP_BY_ID[run.mapId]?.name ?? 'the road'}`
      : last
        ? last.won
          ? `Last run: won ${MAP_BY_ID[last.mapId]?.name ?? ''}${last.heat ? ` at Heat ${last.heat}` : ''}!`
          : `Last run: fell on floor ${last.floor}${last.endedBy ? ` to ${last.endedBy}` : ''}.`
        : 'Rest up. Adventure is waiting.';
    text(this, W / 2, LANDSCAPE ? 44 : 56, lastLine, 13, '#e8e0ff', { stroke: '#14101e', strokeThickness: 3, align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5, 0);
    const title = myTitle(meta);
    if (title) titleBadge(this, W / 2, LANDSCAPE ? 70 : 84, title, 12, { maxW: 220 });

    this.trophies(LANDSCAPE ? 16 : 14, LANDSCAPE ? 96 : 110);
    if (this.prep) this.prepPanel();
    else {
      this.campButtons();
      // Gilded Hunt milestones (2.0): saves that went deep before 2.0 are paid here, once.
      payHuntMilestones(meta);
      // Welcome-back embers (2.0): saves from before it get a head start on the Workshop, once.
      const welcome = payWelcomeBack(meta);
      saveMeta(meta);
      if (welcome) {
        sfx.coin();
        showMessage(this, 'Welcome to Hexbound 2.0!', welcomeText(welcome), () => this.scene.restart());
      } else announceHunt(this, meta, () => this.showGifts(() => tip(this, 'camp')));
      if (this.reopen) {
        this.reopen = null;
        this.workshop();
      }
      this.signposts();
    }

    // ---- friends who are online, by your fire
    if (friendsAvailable()) void this.friendsByFire();
  }

  // ================================================================ growth

  /**
   * The camp itself, there from day one: a dirt clearing and path, grass, trees, bushes and rocks,
   * your gear by the fire, smoke, fireflies (or butterflies by day), and wild Hexlings wandering by.
   */
  private scenery(groundY: number, x1: number, floorBottom: number, phase: string) {
    const { fx, fy, rx, ry } = this;
    const rng = new Rng(7331);
    const r = (a: number, b: number) => a + rng.next() * (b - a);
    const d = (y: number) => y / 1000;

    // Grass: lighter and darker patches, then tufts.
    const ground = this.add.graphics();
    for (let i = 0; i < 26; i++) {
      ground.fillStyle(i % 2 ? 0x24341f : 0x1a2618, 0.7).fillEllipse(r(0, W), r(groundY + 10, H), r(60, 140), r(14, 30));
    }
    // The clearing around the fire, and a path out of camp.
    ground.fillStyle(0x3a3020, 0.55).fillEllipse(fx, fy + 4, rx * 2.3, ry * 2.5);
    ground.fillStyle(0x4a3c28, 0.35).fillEllipse(fx, fy + 4, rx * 1.4, ry * 1.5);
    ground.fillStyle(0x3a3020, 0.5).fillPoints(
      [
        { x: fx - 16, y: fy + ry },
        { x: fx + 16, y: fy + ry },
        { x: fx + 50, y: H + 20 },
        { x: fx - 34, y: H + 20 },
      ],
      true,
    );
    const tufts = this.add.graphics();
    for (let i = 0; i < 70; i++) {
      const x = r(0, W);
      const y = r(groundY + 8, H);
      if (Math.hypot((x - fx) / (rx * 1.15), (y - fy) / (ry * 1.25)) < 1) continue;
      const c = rng.next() < 0.5 ? 0x3a5a30 : 0x2e4a28;
      tufts.lineStyle(2, c, 1);
      tufts.lineBetween(x, y, x - 3, y - 6).lineBetween(x, y, x, y - 8).lineBetween(x, y, x + 3, y - 6);
    }
    // Tiny wildflowers in the grass.
    for (let i = 0; i < 18; i++) {
      const x = r(0, W);
      const y = r(groundY + 14, H);
      if (Math.hypot((x - fx) / (rx * 1.2), (y - fy) / (ry * 1.3)) < 1) continue;
      this.add.circle(x, y, 1.6, [0xf0e2c0, 0xffd04a, 0xc8a8f0, 0xff8ab0][i % 4]).setAlpha(0.85);
    }

    // Trees: a row of small ones on the horizon, big ones framing the camp.
    const pine = (x: number, y: number, h: number, color: number) => {
      const t = this.add.graphics().setDepth(d(y));
      t.fillStyle(0x3a2a1a, 1).fillRect(x - h * 0.05, y - h * 0.22, h * 0.1, h * 0.22);
      for (let k = 0; k < 3; k++) {
        const w = h * (0.42 - k * 0.1);
        const base = y - h * 0.18 - k * h * 0.24;
        t.fillStyle(color, 1).fillTriangle(x - w, base, x, base - h * 0.42, x + w, base);
      }
      t.fillStyle(0xffffff, 0.04).fillTriangle(x, y - h, x + h * 0.1, y - h * 0.5, x, y - h * 0.5);
    };
    const oak = (x: number, y: number, size: number) => {
      const t = this.add.graphics().setDepth(d(y));
      t.fillStyle(0x3a2a1a, 1).fillRect(x - size * 0.08, y - size * 0.7, size * 0.16, size * 0.7);
      t.fillStyle(0x1e3a22, 1).fillCircle(x, y - size * 0.95, size * 0.45).fillCircle(x - size * 0.32, y - size * 0.75, size * 0.34).fillCircle(x + size * 0.32, y - size * 0.75, size * 0.34);
      t.fillStyle(0x2a4a2c, 1).fillCircle(x - size * 0.1, y - size * 1.05, size * 0.25);
    };
    for (let i = 0; i < 6; i++) pine(r(0, x1), groundY + r(2, 8), r(34, 50), 0x16301e);
    pine(-6, floorBottom - 30, LANDSCAPE ? 120 : 150, 0x14301c);
    oak(x1 + 4, LANDSCAPE ? floorBottom : floorBottom - 60, LANDSCAPE ? 80 : 96);
    pine(x1 * 0.16, groundY + 70, 70, 0x18341f);

    // Bushes (some with berries) and rocks around the edges.
    const bush = (x: number, y: number, s: number, berries: boolean) => {
      const b = this.add.graphics().setDepth(d(y));
      b.fillStyle(0x1e3a20, 1).fillCircle(x - s * 0.5, y - s * 0.4, s * 0.5).fillCircle(x + s * 0.5, y - s * 0.4, s * 0.5).fillCircle(x, y - s * 0.7, s * 0.6);
      b.fillStyle(0x2c5030, 1).fillCircle(x - s * 0.15, y - s * 0.85, s * 0.28);
      if (berries) for (let k = 0; k < 4; k++) b.fillStyle(0xd8443a, 1).fillCircle(x + r(-s * 0.7, s * 0.7), y - r(s * 0.3, s), 2);
    };
    const rock = (x: number, y: number, s: number) => {
      const g = this.add.graphics().setDepth(d(y));
      g.fillStyle(0x4a4a58, 1).fillEllipse(x, y - s * 0.3, s * 1.6, s);
      g.fillStyle(0x6a6a7a, 1).fillEllipse(x - s * 0.2, y - s * 0.45, s * 0.8, s * 0.4);
    };
    bush(x1 * 0.3, groundY + 40, 14, true);
    bush(x1 * 0.72, floorBottom - 6, 16, false);
    bush(x1 * 0.06 + 30, floorBottom - 64, 13, true);
    bush(x1 * 0.93, groundY + 92, 12, true);
    rock(x1 * 0.4, floorBottom - 10, 12);
    rock(x1 * 0.88, groundY + 120, 9);
    rock(x1 * 0.2, groundY + 120, 8);
    rock(x1 * 0.56, groundY + 50, 7);

    // Your gear: a bedroll and pack by your spot, log seats, a woodpile and a cooking pot.
    const mx = fx - rx * 0.8;
    const gear = this.add.graphics().setDepth(d(fy - 6));
    gear.fillStyle(0x8a3a3a, 1).fillRoundedRect(mx - 46, fy - 26, 34, 14, 4);
    gear.fillStyle(0xb85a4a, 1).fillCircle(mx - 46, fy - 19, 7);
    gear.fillStyle(0x6a5a2a, 1).fillRoundedRect(mx + 16, fy - 18, 14, 16, 3);
    gear.fillStyle(0x8a7a3a, 1).fillRect(mx + 18, fy - 14, 10, 3);
    const log = (x: number, y: number, a: number) => this.add.rectangle(x, y, 40, 10, 0x6a4424).setStrokeStyle(1, 0x2a160a).setAngle(a).setDepth(d(y));
    log(fx - rx * 0.45, fy - ry * 0.9, -8);
    log(fx + rx * 0.45, fy - ry * 0.9, 8);
    const wp = this.add.graphics().setDepth(d(fy + ry * 0.6));
    const wx = fx + rx * 0.95;
    const wy = fy + ry * 0.6;
    [[0, 0], [10, 0], [20, 0], [5, -8], [15, -8], [10, -16]].forEach(([ox, oy]) => wp.fillStyle(0x7a4a24, 1).fillCircle(wx + ox, wy + oy, 5).fillStyle(0xc89a5a, 1).fillCircle(wx + ox, wy + oy, 2.5));
    const pot = this.add.graphics().setDepth(d(fy + 2));
    const ptx = fx + 34;
    pot.lineStyle(2, 0x3a3a44, 1).lineBetween(ptx - 10, fy + 6, ptx, fy - 22).lineBetween(ptx + 10, fy + 6, ptx, fy - 22);
    pot.fillStyle(0x2a2a34, 1).fillEllipse(ptx, fy - 6, 18, 14);
    pot.fillStyle(0x8a6a4a, 1).fillEllipse(ptx, fy - 12, 14, 4);
    if (!calm()) {
      // Steam from the pot, smoke from the fire.
      this.time.addEvent({
        delay: 700,
        loop: true,
        callback: () => {
          const s = this.add.circle(ptx + r(-3, 3), fy - 16, 3, 0xffffff, 0.35).setDepth(d(fy + 3));
          this.tweens.add({ targets: s, y: s.y - 24, x: s.x + r(-6, 6), alpha: 0, scale: 2, duration: 1600, onComplete: () => s.destroy() });
        },
      });
      this.time.addEvent({
        delay: 900,
        loop: true,
        callback: () => {
          const s = this.add.circle(fx + r(-6, 6), fy - 54, 6, 0x9a9aaa, 0.22).setDepth(d(fy) + 0.002);
          this.tweens.add({ targets: s, y: s.y - 80, x: s.x + r(-20, 20), alpha: 0, scale: 3, duration: 3200, onComplete: () => s.destroy() });
        },
      });
    }

    // Fireflies after dark, butterflies by day.
    if (!calm()) {
      const night = phase !== 'day';
      for (let i = 0; i < (night ? 16 : 6); i++) {
        const x = r(10, x1 - 10);
        const y = r(groundY + 10, floorBottom);
        const bug = night
          ? this.add.circle(x, y, 2, 0xe8ff8a).setBlendMode(Phaser.BlendModes.ADD).setDepth(3)
          : this.add.text(x, y, '⋈', { fontSize: '10px', color: ['#ffd04a', '#8ad0ff', '#ff8ab0'][i % 3] }).setOrigin(0.5).setDepth(3);
        const drift = () => {
          if (!bug.active) return;
          this.tweens.add({ targets: bug, x: Phaser.Math.Clamp(bug.x + r(-40, 40), 6, x1 - 6), y: Phaser.Math.Clamp(bug.y + r(-30, 30), groundY + 6, floorBottom), duration: r(1800, 3600), ease: 'Sine.easeInOut', onComplete: drift });
        };
        drift();
        if (night) this.tweens.add({ targets: bug, alpha: 0.15, yoyo: true, repeat: -1, duration: r(500, 1400), delay: r(0, 1200) });
        else this.tweens.add({ targets: bug, scaleX: 0.3, yoyo: true, repeat: -1, duration: 160 });
      }
    }

    // Now and then a wild Hexling wanders past on the far side of camp.
    if (!calm()) {
      const pool = SPECIES.filter((sp) => !LEGENDS.some((l) => l.id === sp.id));
      const passBy = () => {
        if (!this.alive) return;
        const sp = pool[Math.floor(Math.random() * pool.length)];
        const left = Math.random() < 0.5;
        const y = groundY + r(14, 26);
        const w = this.add.image(left ? -20 : x1 + 20, y, ensureCreatureTexture(this, sp.id, 0)).setOrigin(0.5, 0.92).setScale(1.1 * SPRITE_FIT).setFlipX(left).setAlpha(0.95).setDepth(d(y));
        const hop = this.tweens.add({ targets: w, y: y - 3, yoyo: true, repeat: -1, duration: 170 });
        this.tweens.add({
          targets: w,
          x: left ? x1 + 20 : -20,
          duration: r(9000, 14000),
          onComplete: () => {
            hop.remove();
            w.destroy();
          },
        });
        this.time.delayedCall(r(5000, 11000), passBy);
      };
      this.time.delayedCall(1200, passBy);
    }
  }

  /** What's behind the fire: tents, banners, statues, the string lights. */
  private growthBack(grow: ReturnType<typeof growth>, groundY: number, x1: number, floorBottom: number) {
    const owned = state.meta.camp?.owned ?? [];
    const depth = (y: number) => y / 1000;
    // Tents (runs played).
    const tents = [
      [x1 * 0.2, groundY + 30],
      [x1 * 0.8, groundY + 26],
      [x1 * 0.34, groundY + 12],
    ].slice(0, grow.tents);
    const tentColors = [0x8a4a2a, 0x2a6a5a, 0x5a3a8a];
    tents.forEach(([x, y], i) => {
      const t = this.add.graphics().setDepth(depth(y));
      t.fillStyle(tentColors[i], 1).fillTriangle(x - 30, y, x, y - 40, x + 30, y);
      t.fillStyle(0x14101e, 1).fillTriangle(x - 8, y, x, y - 22, x + 8, y);
      t.lineStyle(2, 0x2a1a10, 1).strokeTriangle(x - 30, y, x, y - 40, x + 30, y);
    });
    // A banner for each map won, on poles along the horizon.
    grow.banners.slice(0, 8).forEach((id, i, all) => {
      const x = x1 / 2 + (i - (all.length - 1) / 2) * 26;
      const y = groundY + 6;
      const m = MAP_BY_ID[id];
      const color = m?.biomes ? ELEMENT_COLORS[m.biomes[0]] : 0xc9c0e0;
      this.add.rectangle(x, y, 2, 30, 0x8a6a4a).setOrigin(0.5, 1);
      const flag = this.add.rectangle(x + 1, y - 28, 14, 18, color).setOrigin(0, 0).setStrokeStyle(1, 0x14101e);
      if (!calm()) this.tweens.add({ targets: flag, scaleX: 0.8, yoyo: true, repeat: -1, duration: 700 + i * 90, ease: 'Sine.easeInOut' });
    });
    // Statues of the legendaries you've caught.
    grow.statues.forEach((id, i) => {
      const x = x1 * 0.66 + i * 34;
      const y = groundY + 16;
      this.add.rectangle(x, y, 26, 8, 0x5a5a6a).setStrokeStyle(1, 0x2a2a3a).setDepth(depth(y));
      this.add.image(x, y - 4, ensureCreatureTexture(this, id, 0)).setOrigin(0.5, 1).setScale(0.9 * SPRITE_FIT).setTint(0xb8b8c8).setDepth(depth(y));
    });
    // Bought: string lights over camp.
    if (owned.includes('lanterns')) {
      const ly = groundY - 34;
      const n = 11;
      for (let i = 0; i < n; i++) {
        const x = x1 * 0.08 + ((x1 * 0.84) / (n - 1)) * i;
        const sag = Math.sin((i / (n - 1)) * Math.PI) * 16;
        const bulb = this.add.circle(x, ly + sag, 3, [0xffd04a, 0xff8ab0, 0x8ad0ff, 0x8fe08a][i % 4]);
        this.add.circle(x, ly + sag, 7, 0xffe08a, 0.12);
        if (!calm()) this.tweens.add({ targets: bulb, alpha: 0.5, yoyo: true, repeat: -1, duration: 900 + i * 60 });
      }
    }
    if (owned.includes('chimes')) {
      const x = x1 * 0.08;
      this.add.rectangle(x, groundY - 50, 30, 3, 0x6a4a2a);
      for (let i = 0; i < 4; i++) {
        const bar = this.add.rectangle(x - 10 + i * 7, groundY - 48, 2, 14 + i * 3, 0xc9d3e0).setOrigin(0.5, 0);
        if (!calm()) this.tweens.add({ targets: bar, angle: 8, yoyo: true, repeat: -1, duration: 600 + i * 130, ease: 'Sine.easeInOut' });
      }
    }
    if (owned.includes('pond')) {
      const y = groundY + 54;
      this.add.ellipse(x1 * 0.86, y, 70, 22, 0x2a6ad8, 0.85).setStrokeStyle(2, 0x1a3a7a).setDepth(depth(y) - 0.01);
      this.add.ellipse(x1 * 0.84, y - 3, 22, 4, 0xa0d8ff, 0.6).setDepth(depth(y));
    }
    if (owned.includes('crystal')) {
      const x = x1 * 0.58;
      const y = groundY + 30;
      const c = this.add.polygon(x, y, [0, -24, 9, -6, 0, 6, -9, -6], 0x6ae0f0).setStrokeStyle(2, 0xd0f8ff).setDepth(depth(y));
      const halo = this.add.circle(x, y - 10, 18, 0x6ae0f0, 0.15);
      if (!calm()) this.tweens.add({ targets: [c, halo], alpha: 0.6, yoyo: true, repeat: -1, duration: 1400 });
    }
    // The Gilded Hunt totem (floor 10 milestone): a carved post with a gilded crest.
    if (owned.includes('hunt-totem')) {
      const x = x1 * 0.76;
      const y = groundY + 26;
      const d = depth(y);
      this.add.rectangle(x, y, 10, 58, 0x6a4a2a).setOrigin(0.5, 1).setStrokeStyle(1, 0x2a1a10).setDepth(d);
      for (const k of [0, 1, 2]) this.add.rectangle(x, y - 12 - k * 15, 14, 4, 0xb07a10).setDepth(d);
      const crest = this.add.polygon(x, y - 66, [0, -12, 11, 0, 0, 12, -11, 0], 0xffc94d).setStrokeStyle(2, 0xfff4b0).setDepth(d);
      const glow = this.add.circle(x, y - 66, 16, 0xffc94d, 0.18).setDepth(d);
      if (!calm()) this.tweens.add({ targets: [crest, glow], alpha: 0.65, yoyo: true, repeat: -1, duration: 1200 });
    }
    // Elder stones (rare surprises): a standing stone for each land whose Elder guardian you've beaten.
    const elders = state.meta.eldersBeaten ?? [];
    elders.slice(0, 12).forEach((el, i) => {
      const x = x1 * 0.44 + (i - (Math.min(12, elders.length) - 1) / 2) * 17;
      const y = groundY + 38 + (i % 2) * 4;
      const col = ELEMENT_COLORS[el as keyof typeof ELEMENT_COLORS] ?? 0x9a94b0;
      // (A polygon is placed by its middle: 18 px tall, so its foot sits on y.)
      this.add.polygon(x, y - 9, [1, 18, 0, 6, 4, 0, 9, 1, 12, 7, 11, 18], 0x7a7486).setStrokeStyle(1, 0x2a2638).setDepth(depth(y));
      const rune = this.add.rectangle(x, y - 11, 3, 6, col).setDepth(depth(y) + 0.001);
      if (!calm()) this.tweens.add({ targets: rune, alpha: 0.45, yoyo: true, repeat: -1, duration: 1100 + i * 110 });
    });
    if (owned.includes('flag')) {
      const x = x1 * 0.42;
      const y = groundY + 34;
      this.add.rectangle(x, y, 3, 70, 0x8a6a4a).setOrigin(0.5, 1).setDepth(depth(y));
      const look = myLook(state.meta);
      const flag = this.add.rectangle(x + 2, y - 68, 26, 16, CLOTH_COLORS[look.topColor] ?? 0xd8443a).setOrigin(0, 0).setStrokeStyle(2, CLOTH_COLORS[look.accent] ?? 0xffffff).setDepth(depth(y));
      if (!calm()) this.tweens.add({ targets: flag, scaleX: 0.85, yoyo: true, repeat: -1, duration: 650, ease: 'Sine.easeInOut' });
    }
    void floorBottom;
  }

  /** What's around the fire: lanterns (Heat), the Hexlidex board, the gilded shrine, and bought bits. */
  private growthFront(grow: ReturnType<typeof growth>, x1: number, floorBottom: number) {
    const { fx, fy, rx, ry } = this;
    const owned = state.meta.camp?.owned ?? [];
    // A lantern for each Heat level won, around the front of the fire.
    for (let i = 0; i < Math.min(8, grow.lanterns); i++) {
      const a = 0.15 + (i / 7) * (Math.PI - 0.3);
      const x = fx + Math.cos(a) * rx * 1.18;
      const y = fy + Math.sin(a) * ry * 1.3 + 10;
      this.add.rectangle(x, y, 2, 16, 0x5a4a3a).setOrigin(0.5, 1).setDepth(y / 1000);
      const l = this.add.circle(x, y - 18, 4, 0xffb04a).setDepth(y / 1000);
      this.add.circle(x, y - 18, 9, 0xffb04a, 0.15).setDepth(y / 1000);
      if (!calm()) this.tweens.add({ targets: l, alpha: 0.6, yoyo: true, repeat: -1, duration: 700 + i * 80 });
    }
    // The Hexlidex board.
    if (grow.board >= 10) {
      const x = x1 * 0.1 + 6;
      const y = floorBottom - 18;
      this.add.rectangle(x, y, 3, 30, 0x6a4a2a).setOrigin(0.5, 1).setDepth(y / 1000);
      this.add.rectangle(x, y - 34, 52, 30, 0x8a6a3a).setStrokeStyle(2, 0x3a2a1a).setDepth(y / 1000);
      text(this, x, y - 40, 'Hexlidex', 9, '#2a1a08', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(y / 1000 + 0.001);
      text(this, x, y - 28, `${grow.board}%`, 11, '#2a1a08', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(y / 1000 + 0.001);
    }
    // The gilded shrine.
    if (grow.shrine) {
      const x = x1 * 0.9 - 6;
      const y = floorBottom - 16;
      this.add.rectangle(x, y, 26, 10, 0x8a6a2a).setStrokeStyle(1, 0x3a2a0a).setDepth(y / 1000);
      this.add.rectangle(x, y - 14, 16, 18, 0xe0a820).setStrokeStyle(1, 0x6a4a0a).setDepth(y / 1000);
      const star = text(this, x, y - 34, '✦', 16, '#ffe08a').setOrigin(0.5).setDepth(y / 1000);
      if (!calm()) this.tweens.add({ targets: star, y: star.y - 4, alpha: 0.6, yoyo: true, repeat: -1, duration: 1000 });
    }
    if (owned.includes('flowers')) {
      for (let i = 0; i < 9; i++) {
        const x = x1 * 0.24 + (i % 3) * 9 + Math.floor(i / 3) * 4;
        const y = floorBottom - 8 - Math.floor(i / 3) * 7;
        this.add.circle(x, y, 3, [0xff8ab0, 0xffd04a, 0xc8a8f0][i % 3]).setDepth(y / 1000);
      }
    }
    if (owned.includes('bench')) {
      const y = fy + ry + 22;
      this.add.rectangle(fx + rx * 0.35, y, 54, 10, 0x7a4a24).setStrokeStyle(1, 0x2a160a).setDepth(y / 1000);
    }
    if (owned.includes('mushrooms')) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = x1 * 0.74 + Math.cos(a) * 16;
        const y = floorBottom - 14 + Math.sin(a) * 6;
        this.add.rectangle(x, y, 2, 5, 0xf0e2c0).setDepth(y / 1000);
        const cap = this.add.ellipse(x, y - 3, 8, 5, 0x6ae0a0).setDepth(y / 1000);
        if (!calm()) this.tweens.add({ targets: cap, alpha: 0.5, yoyo: true, repeat: -1, duration: 1100 + i * 120 });
      }
    }
  }

  // ================================================================ the Hexlings at camp

  /** One of the Hexlings staying at camp: little walks and naps. Tap to spend time with it. */
  private wanderer(speciesId: string, stage: number, shiny: Colours, home: { x: number; y: number }, fx: number, visiting = false) {
    if (!SPECIES_BY_ID[speciesId]) return;
    const c = this.add.container(home.x, home.y);
    const shadow = this.add.ellipse(0, 0, 26, 8, 0x000000, 0.35);
    const img = this.add.image(0, 0, ensureCreatureTexture(this, speciesId, stage, shiny)).setOrigin(0.5, 0.92).setScale(1.8 * SPRITE_FIT).setFlipX(home.x > fx);
    c.add([shadow, img]);
    const hearts = campHearts(state.meta, speciesId);
    if (hearts) c.add(text(this, 0, 4, '♥'.repeat(hearts), 10, '#ff8ab0', { stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5, 0));
    if (visiting) c.add(text(this, 0, -62, 'visiting', 10, '#e8e0ff', { stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5, 0));
    // Close friends (heart 3 on): a warm glow.
    if (hearts >= BOND_HEART.startBond) {
      const halo = this.add.ellipse(0, -14, 46, 46, 0xff8ab0, 0.18);
      c.addAt(halo, 0);
      if (!calm()) this.tweens.add({ targets: halo, scale: 1.15, alpha: 0.32, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
    }
    c.setDepth(c.y / 1000);
    img.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      cry(speciesId, stage);
      this.tweens.add({ targets: img, y: -12, yoyo: true, duration: 180, ease: 'Quad.easeOut' });
      if (!this.prep) this.careFor(speciesId, stage, c);
      else this.bubble(c, '♥', '#ff8ab0');
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
        img.setFlipX(c.x < fx);
      } else this.tweens.add({ targets: img, y: -9, yoyo: true, duration: 170 });
      this.time.delayedCall(Phaser.Math.Between(1800, 4200), act);
    };
    this.time.delayedCall(Phaser.Math.Between(400, 2500), act);
  }

  /** Pet, feed or play with a camp Hexling (each once between runs, losses too; each one builds your bond). */
  private careFor(speciesId: string, stage: number, c: Phaser.GameObjects.Container) {
    const meta = state.meta;
    const name = SPECIES_BY_ID[speciesId].names[stage] ?? SPECIES_BY_ID[speciesId].names[0];
    const hearts = campHearts(meta, speciesId);
    const done = caredToday(meta, speciesId);
    const next = bondToNext(meta, speciesId);
    const labels: Record<Care, [string, string]> = {
      pet: ['Pet', 'A scratch behind the ears.'],
      feed: ['Feed', 'A handful of berries.'],
      play: ['Play', 'A game of chase around the fire.'],
    };
    const now = hearts ? `${hearts >= BOND_HEART.max ? 'Best friends! ' : ''}${bondReward(Math.min(hearts, BOND_HEART.max), name).replace(/^./, (ch) => ch.toUpperCase())}.` : '';
    const toNext = next
      ? `${next.points}/${next.next} bond to the next heart: ${bondReward(hearts + 1, name)}. Bond grows from runs together (finishing +${BOND_POINTS.finished}, winning +${BOND_POINTS.won}, MVP +${BOND_POINTS.mvp}, each guardian +${BOND_POINTS.guardian}) and pet, feed and play here after each run (+${BOND_POINTS.care} each).`
      : '';
    const alt = hearts >= BOND_HEART.max;
    const altOn = bondColours(meta, speciesId);
    openPicker(this, {
      title: `${name} ${'♥'.repeat(hearts)}${'♡'.repeat(CAMP_HEARTS.length - hearts)}`,
      subtitle: [now, toNext].filter(Boolean).join(' '),
      options: [
        ...CARE.map((k) => ({ label: labels[k][0], sub: done.includes(k) ? 'Done · again after your next run' : labels[k][1], disabled: done.includes(k), color: 0x6a3a5a })),
        ...(alt ? [{ label: `Bond colours: ${altOn ? 'on' : 'off'}`, sub: 'Tap to switch', color: 0x3a4a6a }] : []),
      ],
      cancelLabel: 'Back',
      onCancel: () => {},
      onPick: (i) => {
        if (i >= CARE.length) {
          toggleBondColours(meta, speciesId);
          saveMeta(meta);
          this.scene.restart();
          return;
        }
        const gained = care(meta, speciesId, CARE[i]);
        saveMeta(meta);
        sfx.coin();
        this.bubble(c, `♥ +${BOND_POINTS.care}`, '#ff8ab0');
        if (gained) {
          sfx.bondHeart();
          const h = campHearts(meta, speciesId);
          const news = titleNews(takeNewTitles(meta));
          if (news) saveMeta(meta);
          showMessage(this, `${name} trusts you more!`, `Camp bond ${'♥'.repeat(h)}: ${bondReward(h, name)}.${news}`, () => this.scene.restart());
        }
      },
    });
  }

  private bubble(c: Phaser.GameObjects.Container, s: string, color: string) {
    const t = text(this, c.x + 6, c.y - 46, s, 14, color, { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5).setDepth(5);
    this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
  }

  // ================================================================ visitors

  private visitors(groundY: number, x1: number) {
    const meta = state.meta;
    const run = state.run;
    const list = challenges(meta);
    const spots = [
      { x: 34, y: groundY + 44 },
      { x: x1 - 34, y: groundY + 44 },
      { x: x1 * 0.62, y: groundY + 22 },
    ];
    VISITORS.forEach((v, i) => {
      // Before a run, your rival only drops by if this run has one.
      if (this.prep && i === 2 && !run?.rival) return;
      const { x, y } = spots[i];
      const look = cleanLook(v.look) as TrainerLook;
      this.add.ellipse(x, y, 30, 8, 0x000000, 0.35).setDepth(y / 1000);
      const img = this.add.image(x, y, ensureTrainerTexture(this, look, 'stand')).setOrigin(0.5, 0.94).setScale(1.6).setDepth(y / 1000).setFlipX(x > this.fx);
      const short = i === 1 ? 'Alder' : i === 2 ? (this.prep && run?.rival ? run.rival.name : 'Rival') : v.name;
      text(this, x, y + 4, short, 10, '#e8e0ff', { stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(2);
      // A speech bubble when they have something for you: gold "!" for something to claim or big
      // news, white "?" for today's challenge, "…" for a word before the run. It bobs, and a
      // glow under their feet draws the eye; it clears once you've heard them out.
      const ch = list[v.tier];
      const news = this.prep ? this.newsFrom(i) : null;
      const flag = this.prep ? (i === 1 && legendFloors(run!, floorsOf(run!)).length ? '!' : news ? '…' : '') : ch.complete && !ch.claimed ? '!' : ch.claimed ? '' : '?';
      const bubble = flag ? this.talkBubble(x, y, flag) : null;
      img.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        sfx.click();
        if (news) {
          bubble?.destroy();
          showMessage(this, short === 'Alder' ? 'Professor Alder' : short, news);
        } else if (!this.prep) this.challengeFrom(i, ch);
      });
    });
  }

  /** A speech bubble over a visitor (and a glow at their feet). Destroying it clears both. */
  private talkBubble(x: number, y: number, mark: string): Phaser.GameObjects.Container {
    const urgent = mark === '!';
    const fill = urgent ? 0xffd04a : 0xf4f0ff;
    const glow = this.add.ellipse(x, y, 46, 14, urgent ? 0xffd04a : 0xc8d8ff, 0.35).setDepth(y / 1000 - 0.001).setBlendMode(Phaser.BlendModes.ADD);
    const c = this.add.container(x, y - 76).setDepth(4);
    const g = this.add.graphics();
    g.fillStyle(0x14101e, 1).fillRoundedRect(-17, -15, 34, 28, 9);
    g.fillStyle(fill, 1).fillRoundedRect(-15, -13, 30, 24, 8);
    // The tail, pointing down at their head.
    g.fillStyle(0x14101e, 1).fillTriangle(-7, 9, 7, 9, 0, 21);
    g.fillStyle(fill, 1).fillTriangle(-5, 8, 5, 8, 0, 17);
    const t = text(this, 0, -2, mark, mark === '…' ? 16 : 18, '#2a1a08', { fontStyle: 'bold' }).setOrigin(0.5);
    c.add([g, t]);
    c.once('destroy', () => glow.destroy());
    if (!calm()) {
      this.tweens.add({ targets: c, y: c.y - 6, yoyo: true, repeat: -1, duration: 560, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: glow, alpha: 0.1, scaleX: 1.25, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
      // Every few seconds the bubble pops, so it catches the eye.
      this.time.addEvent({
        delay: urgent ? 1800 : 3200,
        loop: true,
        callback: () => c.active && this.tweens.add({ targets: c, scale: { from: 1.25, to: 1 }, duration: 320, ease: 'Back.easeOut' }),
      });
    }
    return c;
  }

  /** What a visitor has to say before a run. */
  private newsFrom(i: number): string {
    const run = state.run!;
    if (i === 0) return run.prep && run.prep !== 'skip' ? 'Good choice! Safe travels, and come see me in the shops.' : 'Take something for the road! On the house, just this once. Pick one below.';
    if (i === 1) {
      const floors = legendFloors(run, floorsOf(run));
      const lands = (run.biomes ?? []).slice(0, floorsOf(run)).join(', then ');
      if (floors.length)
        return `Exciting news! A legendary Hexling has been sighted up ahead: it should be roaming floor ${floors.map((f) => f + 1).join(' and ')}. Look for the glowing hex!${lands ? ` The lands ahead: ${lands}.` : ''}`;
      return lands ? `My notes say the lands ahead are ${lands}. Plan your team around them!` : 'Stay curious out there!';
    }
    return rivalHello(run) || 'See you out there.';
  }

  private challengeFrom(i: number, ch: ChallengeState) {
    const meta = state.meta;
    const who = VISITORS[i].name;
    const line = ch.claimed ? 'That’s done for today. New one tomorrow!' : ch.complete ? 'You did it! Here, as promised.' : CHALLENGE_LINES[i](ch.text);
    openPicker(this, {
      title: who,
      subtitle: `“${line}”\n\n${TIER_NAMES[ch.tier]}: ${ch.text} (${ch.progress}/${ch.goal}) · ${TIER_EMBERS[ch.tier]} embers`,
      options: [
        ch.claimed
          ? { label: 'Claimed', disabled: true }
          : { label: ch.complete ? `Claim ${TIER_EMBERS[ch.tier]} embers` : `${ch.progress}/${ch.goal} so far`, disabled: !ch.complete, color: 0x8a5a1a, glyph: 'flame' as const },
        { label: 'All of today’s challenges', color: 0x2f4a6b },
      ],
      cancelLabel: 'Back',
      onCancel: () => {},
      onPick: (k) => {
        if (k === 1) return this.challengeList();
        const got = claimChallenge(meta, ch.tier);
        saveMeta(meta);
        if (got) sfx.coin();
        this.scene.restart();
      },
    });
  }

  private challengeList() {
    const meta = state.meta;
    const list = challenges(meta);
    openPicker(this, {
      title: 'Daily challenges',
      subtitle: `From your visitors. New ones every day at midnight. You have ${meta.camp?.embers ?? 0} embers: spend them at the Ember stall.`,
      options: list.map((ch, i) => ({
        label: `${TIER_NAMES[ch.tier]}: ${ch.text}`,
        sub: `${VISITORS[i].name} · ${ch.claimed ? 'Claimed' : ch.complete ? `Tap to claim ${TIER_EMBERS[ch.tier]} embers` : `${ch.progress}/${ch.goal} · ${TIER_EMBERS[ch.tier]} embers`}`,
        disabled: ch.claimed || !ch.complete,
        color: ch.complete && !ch.claimed ? 0x8a5a1a : undefined,
      })),
      cancelLabel: 'Back',
      onCancel: () => {},
      onPick: (i) => {
        if (claimChallenge(meta, list[i].tier)) sfx.coin();
        saveMeta(meta);
        this.scene.restart();
      },
    });
  }

  // ================================================================ buttons between runs

  private campButtons() {
    const meta = state.meta;
    const c = camp(meta);
    const ready = challenges(meta).filter((ch) => ch.complete && !ch.claimed).length;
    const items: [string, () => void, number][] = [
      [`Challenges${ready ? ` (${ready}!)` : ''}`, () => this.challengeList(), ready ? 0x8a5a1a : 0x4a3a2a],
      [`Ember stall · ${c.embers}`, () => this.stall(), 0x6a3a1a],
      [workshopProgress(meta).next && c.embers >= workshopProgress(meta).next!.cost ? 'Workshop (!)' : 'Workshop', () => this.workshop(), 0x4a3a5a],
      ['Camp crew', () => this.crewPicker(), 0x3a4a2a],
    ];
    items.forEach(([label, fn, color], i) => {
      // Upright: a stack top right. Sideways: a row along the top right.
      // (Sideways, four fit where three used to, clear of the title.)
      const bx = LANDSCAPE ? W - 53 - (items.length - 1 - i) * 82 : W - 72;
      const by = LANDSCAPE ? 30 : 110 + i * 40;
      button(this, bx, by, LANDSCAPE ? 78 : 128, 34, label, () => (sfx.click(), fn()), { fontSize: LANDSCAPE ? 11 : 12, color }).setDepth(3);
    });
  }

  /** Spend embers on decorations and fire colours; switch between the fires you own. */
  private stall() {
    const meta = state.meta;
    const c = camp(meta);
    // Rewards (the Gilded Hunt totem) only show once they're yours.
    const items = CAMP_ITEMS.filter((it) => !it.reward || c.owned.includes(it.id));
    const opts = items.map((it) => {
      const own = c.owned.includes(it.id);
      const inUse = it.kind === 'fire' && c.fire === it.id;
      return {
        label: it.name,
        sub: own ? (it.kind === 'fire' ? (inUse ? 'Burning now' : 'Owned · tap to light it') : 'At your camp') : `${it.cost} embers · ${it.desc}`,
        disabled: own ? it.kind !== 'fire' || inUse : c.embers < it.cost,
        color: own ? 0x2f3f2a : 0x6a3a1a,
      };
    });
    const plain = c.fire ? [{ label: 'Plain fire', sub: 'The good old orange campfire', color: 0x4a3a2a }] : [];
    openPicker(this, {
      title: 'Ember stall',
      subtitle: `You have ${c.embers} embers. Earn more from the daily challenges.`,
      options: [...opts, ...plain],
      rowHeight: 56,
      cancelLabel: 'Back',
      onCancel: () => {},
      onPick: (i) => {
        if (i >= items.length) c.fire = undefined;
        else {
          const it = items[i];
          if (c.owned.includes(it.id)) c.fire = it.id;
          else if (buyCampItem(meta, it.id) === null) sfx.coin();
        }
        saveMeta(meta);
        this.scene.restart();
      },
    });
  }

  /** The Workshop (2.0): lasting upgrades for embers, as a tech tree of four branches. */
  private workshop() {
    const meta = state.meta;
    let built = false;
    openWorkshopTree(this, {
      meta,
      afterBuy: (u, done) => {
        built = true;
        const fresh = takeNewTitles(meta);
        saveMeta(meta);
        if (fresh.length) showMessage(this, `${u.name} built!`, titleNews(fresh).replace(/^\n+/, ''), done);
        else done();
      },
      // Embers changed: redraw the camp.
      onClose: () => built && this.scene.restart(),
    });
  }

  /** Choose who stays at camp (up to three of the species you've caught). */
  private crewPicker() {
    const meta = state.meta;
    const current = campCrew(meta).map((c) => c.speciesId);
    openPicker(this, {
      title: 'Camp crew',
      subtitle: `Who stays at camp (up to ${CREW_MAX}). Spend time with them after each run to build your bond.`,
      options: [
        ...Array.from({ length: CREW_MAX }, (_, i) => {
          const id = current[i];
          return id
            ? { label: SPECIES_BY_ID[id].names[campStage(meta, id)], sub: `${'♥'.repeat(campHearts(meta, id)) || 'No bond yet'} · tap to swap`, icon: createCreature(id, 5, campStage(meta, id)), color: 0x3a4a2a }
            : { label: 'Empty spot', sub: 'Tap to invite someone', color: 0x2a2440 };
        }),
        ...(meta.camp?.crew?.length ? [{ label: 'Back to last run’s team', color: 0x4a3a2a }] : []),
      ],
      cancelLabel: 'Done',
      onCancel: () => this.scene.restart(),
      onPick: (slot) => {
        if (slot >= CREW_MAX) {
          camp(meta).crew = undefined;
          saveMeta(meta);
          return this.scene.restart();
        }
        this.pickSpecies(current, slot);
      },
    });
  }

  /** Choose a Hexling line for a camp spot: most used first, with a name search. */
  private pickSpecies(current: string[], slot: number, query = '') {
    const meta = state.meta;
    const q = query.trim().toLowerCase();
    const caught = [...new Set([...meta.dex.caught, ...meta.unlockedStarters])].filter((id) => SPECIES_BY_ID[id] && SPECIES.some((s) => s.id === id));
    const used = (id: string) => meta.usage?.[id] ?? 0;
    const pool = caught
      .filter((id) => !current.includes(id) || current[slot] === id)
      .filter((id) => !q || SPECIES_BY_ID[id].names.some((n) => n.toLowerCase().includes(q)))
      .sort(
        (a, b) =>
          used(b) - used(a) ||
          (meta.camp?.bond[b] ?? 0) - (meta.camp?.bond[a] ?? 0) ||
          SPECIES_BY_ID[a].names[0].localeCompare(SPECIES_BY_ID[b].names[0]),
      );
    const empty = current[slot] && !q;
    const lead = 1 + (empty ? 1 : 0);
    openPicker(this, {
      title: 'Who stays at camp?',
      subtitle: q ? `Lines matching “${query.trim()}”: ${pool.length}` : 'Any Hexling line you’ve caught, most used first.',
      options: [
        q ? { label: `Search: ${query.trim()}`, sub: 'Tap to change or clear', glyph: 'book' as const, color: 0x2f4a6b } : { label: 'Search by name', glyph: 'book' as const, color: 0x2f4a6b },
        ...(empty ? [{ label: 'Leave this spot empty', color: 0x4a3a2a }] : []),
        ...pool.map((id) => {
          const n = used(id);
          const hearts = '♥'.repeat(campHearts(meta, id));
          const runs = n ? `${n} run${n === 1 ? '' : 's'}` : '';
          return { label: SPECIES_BY_ID[id].names[campStage(meta, id)], sub: [runs, hearts].filter(Boolean).join(' · ') || ' ', icon: createCreature(id, 5, campStage(meta, id)) };
        }),
      ],
      rowHeight: 60,
      cancelLabel: 'Back',
      onCancel: () => this.crewPicker(),
      onPick: (i) => {
        if (i === 0) return this.searchSpecies(current, slot, query);
        const next = [...current];
        if (empty && i === 1) next.splice(slot, 1);
        else next[slot] = pool[i - lead];
        camp(meta).crew = next.filter(Boolean).slice(0, CREW_MAX);
        saveMeta(meta);
        this.crewPicker();
      },
    });
  }

  /** Type part of a name (any of the line's forms). */
  private searchSpecies(current: string[], slot: number, query: string) {
    card({
      title: 'Search Hexlings',
      body: 'Type part of a name. Any form of the line counts.',
      field: { type: 'text', placeholder: 'e.g. ember', value: query },
      buttons: [
        { label: 'Clear', onClick: (c) => (c.close(), this.pickSpecies(current, slot)) },
        { label: 'Search', primary: true, onClick: (c) => (c.close(), this.pickSpecies(current, slot, c.value())) },
      ],
    });
  }

  // ================================================================ before a run

  /** One thing for the road (three to choose from), then set out. */
  private prepPanel() {
    const run = state.run!;
    const offers = prepOffers(run.seed);
    const [px, py, pw, ph] = LANDSCAPE ? [W - 272, 92, 262, H - 100] : [10, H - 280, W - 20, 272];
    this.add.rectangle(px, py, pw, ph, 0x1a1428, 0.94).setOrigin(0).setStrokeStyle(2, 0x6a4a2a).setDepth(4);
    text(this, px + pw / 2, py + 10, 'Before you set out', 16, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(4);
    const floors = legendFloors(run, floorsOf(run));
    const tip = floors.length
      ? `Alder: “A legendary is roaming floor ${floors.map((f) => f + 1).join(' and ')}!”`
      : 'Take one thing for the road. Tap a visitor for news.';
    text(this, px + pw / 2, py + 32, tip, 12, floors.length ? '#ffe08a' : COLORS.textDim, { align: 'center', wordWrap: { width: pw - 20 } }).setOrigin(0.5, 0).setDepth(4);

    const take = (id: PrepId | 'skip') => {
      applyPrep(run, id);
      sfx.coin();
      const p = id === 'skip' ? null : PREPS[id];
      this.scene.start('Map', p ? { banner: `${p.name}: ${p.desc}` } : {});
    };
    const top = py + 66;
    if (LANDSCAPE) {
      const ch = (ph - 66 - 54) / 3 - 6;
      offers.forEach((id, i) => this.offerCard(px + 10, top + i * (ch + 6), pw - 20, ch, id, () => take(id)));
    } else {
      const cw = (pw - 20 - 12) / 3;
      offers.forEach((id, i) => this.offerCard(px + 10 + i * (cw + 6), top, cw, 132, id, () => take(id)));
    }
    button(this, px + pw / 2, py + ph - 28, Math.min(220, pw - 20), 38, 'Set out with nothing', () => take('skip'), { fontSize: 13, color: 0x3a3352 }).setDepth(4);
  }

  private offerCard(x: number, y: number, w: number, h: number, id: PrepId, onTake: () => void) {
    const p = PREPS[id];
    const bg = this.add.rectangle(x, y, w, h, 0x3a2a1a).setOrigin(0).setStrokeStyle(2, 0xffc94d, 0.7).setDepth(4).setInteractive({ useHandCursor: true });
    text(this, x + w / 2, y + 8, p.name, 13, '#ffe08a', { fontStyle: 'bold', align: 'center', wordWrap: { width: w - 10 } }).setOrigin(0.5, 0).setDepth(4);
    text(this, x + w / 2, y + (LANDSCAPE ? 26 : 44), p.desc, 11, COLORS.text, { align: 'center', wordWrap: { width: w - 12 } }).setOrigin(0.5, 0).setDepth(4);
    if (!LANDSCAPE) text(this, x + w / 2, y + h - 18, `from ${p.from}`, 10, COLORS.textDim).setOrigin(0.5, 0).setDepth(4);
    bg.on('pointerover', () => bg.setFillStyle(0x5a3a1a)).on('pointerout', () => bg.setFillStyle(0x3a2a1a)).on('pointerup', onTake);
  }

  // ================================================================ friends by the fire

  private async friendsByFire() {
    let friends: Friend[] = [];
    try {
      friends = (await listFriends()).filter((f) => f.status === 'accepted' && f.online).slice(0, 3);
    } catch {
      return;
    }
    if (!this.alive || !friends.length) return;
    const { fx, fy, rx, ry } = this;
    friends.forEach((f, i) => {
      const a = 0.3 + i * 0.62;
      const x = fx + Math.cos(a) * rx;
      const y = fy + Math.sin(a) * ry + 10;
      this.add.ellipse(x, y, 30, 8, 0x000000, 0.35).setDepth(y / 1000);
      const img = this.add.image(x, y, ensureTrainerTexture(this, f.look, 'stand')).setOrigin(0.5, 0.94).setScale(1.6).setDepth(y / 1000).setFlipX(true);
      trainerFx(this, img, f.look);
      text(this, x, y + 4, f.username, 10, '#8fe08a', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(2);
      if (f.buddy && SPECIES_BY_ID[f.buddy.id]) {
        const bx = x + 26;
        const b = this.add.image(bx, y + 2, ensureCreatureTexture(this, f.buddy.id, f.buddy.stage, f.buddy.shiny)).setOrigin(0.5, 0.92).setScale(1.3 * SPRITE_FIT).setDepth(y / 1000).setFlipX(true);
        if (!calm()) this.tweens.add({ targets: b, y: b.y - 3, yoyo: true, repeat: -1, duration: 900 + i * 150, ease: 'Sine.easeInOut' });
      }
      img.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        sfx.click();
        const buddy = f.buddy && SPECIES_BY_ID[f.buddy.id] ? ` with ${SPECIES_BY_ID[f.buddy.id].names[f.buddy.stage] ?? SPECIES_BY_ID[f.buddy.id].names[0]}` : '';
        openPicker(this, {
          title: f.username,
          subtitle: `Sitting by your fire${buddy}. ${f.activity && f.activity !== 'Online' ? f.activity : 'Online'}.`,
          options: [{ label: 'Invite to play', color: 0x8a2c2c }],
          cancelLabel: 'Back',
          onCancel: () => {},
          onPick: () => this.scene.start('Friends', { from: 'Camp' }),
        });
      });
    });
  }

  // ================================================================ trophies and signposts

  /** Runs won, tournaments, legendaries, and a pennant for each map you've won. */
  private trophies(x: number, y: number) {
    const meta = state.meta;
    const rows: [string, string][] = [
      ['Runs won', String(meta.wins)],
      ['Tournaments', String(meta.tourneyWins ?? 0)],
      ['Legendaries', `${legendsCaught(meta)}/${LEGENDS.length}`],
    ];
    const w = LANDSCAPE ? 150 : 132;
    const h = 22 + rows.length * 18;
    this.add.rectangle(x, y, w, h, 0x1a1428, 0.82).setOrigin(0).setStrokeStyle(2, 0x6a4a2a);
    text(this, x + 8, y + 5, 'TROPHIES', 10, '#ffc94d', { fontStyle: 'bold' });
    rows.forEach(([label, value], i) => {
      text(this, x + 8, y + 22 + i * 18, label, 11, COLORS.textDim);
      text(this, x + w - 8, y + 22 + i * 18, value, 11, COLORS.text, { fontStyle: 'bold' }).setOrigin(1, 0);
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
      go.forEach(([label, fn, color], i) => {
        button(this, W - 100, 110 + i * 54, 180, 46, label, () => (sfx.click(), fn()), { fontSize: 15, color }).setDepth(3);
      });
      return;
    }
    const [first, ...rest] = go;
    button(this, W / 2, H - 98, 260, 52, first[0], () => (sfx.click(), first[1]()), { fontSize: 18, color: first[2] }).setDepth(3);
    const bw = (W - 40) / rest.length;
    rest.forEach(([label, fn, color], i) => {
      button(this, 20 + bw / 2 + i * bw, H - 40, bw - 6, 44, label, () => (sfx.click(), fn()), { fontSize: rest.length > 4 ? 11 : 12, color }).setDepth(3);
    });
  }
}
