import { BALANCE } from '../data/balance';
import Phaser from 'phaser';
import { itemReveal, stoneReveal } from '../ui/stoneReveal';
import { openGameMenu } from '../ui/gameMenu';
import { duel, sendProgress } from '../net/runtime';
import { session } from '../net/session';
import { accText, MAX_TIER, maxUsesText, MOVES, moveSummary, tierUpgradeText } from '../data/moves';
import { ELEMENT_COLORS } from '../data/types';
import {
  addLevels,
  canPrestige,
  creatureName,
  healFraction,
  levelCap,
  restoreUses,
  usesText,
  moveDef,
  recommendForget,
  resolvePending,
  sharesType,
  stats,
  type Creature,
} from '../logic/creature';
import { NODE_INFO, stepsToBoss, type MapNode } from '../logic/map';
import { BOSSES } from '../data/trainers';
import { allCreatures, canMoveTo, currentNode, moveTo, FLOORS, PASSIVES, earnCoins, prestigeTracked, registerJoin, releaseNote, trackStat } from '../logic/run';
import { ACHIEVEMENTS } from '../logic/achievements';
import { icon as pixelIcon, NODE_ICONS } from '../ui/icons';
import { applyItem, canAfford, eligibleTargets, ITEMS, pay, rerollPrice, rollShop, slotDesc, slotGlyph, slotName, unusableReason, type ShopSlot } from '../logic/shop';
import { hasSeenForm } from '../logic/dex';
import { dex, persist, state } from '../state';
import { announceGilded } from '../ui/gildedUi';
import { TWISTS } from '../logic/run';
import { EVENT_BY_ID, leaveEvent, rollEvent, rollTreasure, type EventOption } from '../logic/events';
import { openPicker, showMessage } from '../ui/picker';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { playMusic, sfx } from '../ui/sound';
import { ensureTrainerTexture } from '../ui/trainerSprite';
import { myLook } from '../data/trainerLook';
import { calm } from '../ui/motion';
import { Scroller } from '../ui/scroll';
import { background, button, clipList, COLORS, FH, FW, H, HpBar, LANDSCAPE, OX, OY, text, W } from '../ui/widgets';
import { mapBackdrop } from '../ui/backdrops';
import { tip, tipDone } from '../ui/tips';

const TOP_BAR = 82;
const BOTTOM_BAR = 96;
/** Sideways: info and buttons in a left column, the team in a right column, the map between. */
const SIDE_L = 176;
const SIDE_R = 150;
/** The map's area: [x, width, top, bottom] for the board in use. */
const mapArea = () =>
  LANDSCAPE ? { x: SIDE_L, w: W - SIDE_L - SIDE_R, top: 0, bottom: H } : { x: 0, w: W, top: TOP_BAR, bottom: H - BOTTOM_BAR };

function hexPoints(w: number, h: number, pointy: boolean): number[] {
  // pointy-top (rows layout) or flat-top (older saved maps) hex in a w x h box
  if (pointy) return [w / 2, 0, w, h * 0.25, w, h * 0.75, w / 2, h, 0, h * 0.75, 0, h * 0.25];
  return [w * 0.25, 0, w * 0.75, 0, w, h / 2, w * 0.75, h, w * 0.25, h, 0, h / 2];
}

/** Where your lead Hexling stands relative to your trainer (behind and to the side). */
const FOLLOW = { x: -22, y: 9 };

export class MapScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private minScroll = 0;
  private maxScroll = 0;
  private scroller!: Scroller;

  constructor() {
    super('Map');
  }

  create(data: { banner?: string } = {}) {
    const run = state.run!;
    if (run.activeBattle) {
      // A battle was in progress when the game was closed.
      this.scene.start('Battle', { kind: run.activeBattle.kind });
      return;
    }
    const map = run.map;
    const base = Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[map.biome]).darken(82).color;
    background(this, base);
    mapBackdrop(this, map.biome, { w: W, h: H, ox: OX, oy: OY, fw: FW, fh: FH }, base);
    playMusic('map', map.biome);

    // ---- map layer
    this.layer = this.add.container(0, 0);
    // The map scrolls within the layout; it never slides into the screen's margins.
    clipList(this, this.layer, 0, H);
    const cols = map.cols;
    const pointy = map.layout === 'rows';
    // Pointy-top: half-hex columns, one row per step. Flat-top: the older half-row lattice.
    const area = mapArea();
    const hexW = pointy ? Math.min(90, (area.w - 24) / ((cols - 1) / 2 + 1)) : Math.min(112, (area.w - 30) / ((cols - 1) * 0.75 + 1));
    const hexH = pointy ? hexW * 1.1547 : hexW * 0.866;
    const colStep = pointy ? hexW / 2 : hexW * 0.75;
    const rowStep = pointy ? hexH * 0.75 : hexH / 2;
    const nodes = Object.values(map.nodes);
    const minY = Math.min(...nodes.map((n) => n.y));
    const gridW = (cols - 1) * colStep;
    const pos = (n: MapNode) => ({
      x: area.x + area.w / 2 - gridW / 2 + n.col * colStep,
      y: 50 + (n.y - minY) * rowStep,
    });

    const reachableIds = new Set<string>();
    if (run.bossPending) reachableIds.add(run.currentId);
    else for (const id of currentNode(run).next) reachableIds.add(id);

    // edges
    const g = this.add.graphics();
    this.layer.add(g);
    for (const n of nodes) {
      const a = pos(n);
      for (const nx of n.next) {
        const b = pos(map.nodes[nx]);
        const onPath = run.visited.includes(n.id) && run.visited.includes(nx);
        const fromCurrent = n.id === run.currentId && reachableIds.has(nx);
        g.lineStyle(fromCurrent ? 5 : 3, onPath ? 0xffc94d : fromCurrent ? 0xffffff : 0x000000, onPath || fromCurrent ? 0.9 : 0.35);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }

    // nodes
    for (const n of nodes) {
      const p = pos(n);
      const info = NODE_INFO[n.kind];
      const visited = run.visited.includes(n.id);
      const isCurrent = n.id === run.currentId;
      const canGo = reachableIds.has(n.id);
      const size = n.kind === 'boss' ? 1.25 : 1;
      const hw = (hexW - (pointy ? 4 : 6)) * size;
      const hh = (hexH - (pointy ? 4 : 5)) * size;
      const hex = this.add.polygon(p.x, p.y, hexPoints(hw, hh, pointy), info.color).setStrokeStyle(
        isCurrent ? 4 : canGo ? 3 : 2,
        isCurrent ? 0xffc94d : canGo ? 0xffffff : 0x000000,
        isCurrent || canGo ? 1 : 0.5,
      );
      const iconSize = n.kind === 'boss' ? 34 : pointy ? Math.round(Math.min(26, hexW * 0.42)) : 26;
      const icon = pixelIcon(this, p.x, p.y - (pointy ? 6 : 8), NODE_ICONS[n.kind] ?? 'question', Math.round(iconSize * 1.05));
      const label = text(this, p.x, p.y + hh * (pointy ? 0.2 : 0.26), n.kind === 'boss' ? (run.race ? `vs ${run.race.opponent}` : BOSSES[map.biome].name) : info.label, pointy && hexW < 64 ? 10 : 11, '#ffffff').setOrigin(0.5);
      this.layer.add([hex, icon, label]);
      // Your token stands on the current hex: fade what's under it (it comes back as you hop away).
      if (isCurrent) {
        icon.setAlpha(0.15);
        label.setAlpha(0.15);
        this.underToken = [icon, label];
      }
      if (!canGo && !isCurrent) {
        hex.setAlpha(visited ? 0.35 : 0.6);
        icon.setAlpha(visited ? 0.35 : 0.75);
        label.setAlpha(visited ? 0.35 : 0.75);
      }
      if (canGo) {
        this.tweens.add({ targets: [hex], scale: 1.07, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
        hex.setInteractive(new Phaser.Geom.Polygon(hexPoints(hw, hh, pointy)), Phaser.Geom.Polygon.Contains);
        hex.on('pointerup', () => {
          if (!this.scroller.moved) this.enterNode(n);
        });
      }
    }

    // Your token: your trainer standing on the hex you're on (see hopTo).
    this.posOf = (id: string) => {
      const q = pos(map.nodes[id]);
      return { x: q.x, y: q.y + hexH * 0.12 };
    };
    this.makeToken();

    // scrolling
    const mapH = 50 + (map.maxY - minY) * rowStep + hexH;
    const viewH = area.bottom - area.top;
    this.minScroll = Math.min(area.top, area.top + viewH - mapH);
    this.maxScroll = area.top;
    const cur = pos(currentNode(run));
    this.layer.y = Phaser.Math.Clamp(area.top + viewH * 0.7 - cur.y, this.minScroll, this.maxScroll);
    // Drag to scroll the map, with flick momentum. A drag never counts as tapping a node.
    this.scroller = new Scroller(this, {
      get: () => this.layer.y,
      set: (y) => this.layer.setY(y),
      min: () => this.minScroll,
      max: () => this.maxScroll,
    });

    this.drawTopBar();
    this.drawBottomBar();

    for (const c of allCreatures(run)) dex.creature(c, true);
    persist();
    const resume = () =>
      run.shop ? this.openShop() : run.pendingNode ? this.resumeNode(run.pendingNode) : this.promptPendingMoves();
    // First-time tips come before anything that's waiting.
    const after = () => tip(this, 'map', () => (run.bench.length ? tip(this, 'bench', resume) : resume()));
    // Announce any achievements earned since the last time the map was shown.
    const next = () => {
      const meta = state.meta;
      const ids = meta.newAchievements.splice(0);
      if (!ids.length) return announceGilded(this, meta, after);
      persist();
      const lines = ids.map((id) => {
        const a = ACHIEVEMENTS.find((x) => x.id === id)!;
        return `${a.name}: ${a.desc}\nUnlocked passive: ${PASSIVES[a.passive].name}`;
      });
      showMessage(this, 'Achievement unlocked!', lines.join('\n\n') + '\n\nEquip passives from the title screen.', () => announceGilded(this, meta, after));
    };
    const afterBanner = () => (data.banner ? showMessage(this, run.hunt ? `Gilded Hunt · floor ${run.hunt.depth}` : `Floor ${run.floor + 1}`, data.banner, next) : next());
    // New held items and Evolution Stones since the map was last shown get their own moments.
    const items = run.newItems ?? [];
    run.newItems = [];
    const afterItems = () => (items.length ? itemReveal(this, items, afterBanner) : afterBanner());
    const gained = run.evoStones - (run.stonesSeen ?? run.evoStones);
    run.stonesSeen = run.evoStones;
    if (gained > 0 || items.length) persist();
    if (gained > 0) stoneReveal(this, gained, run.evoStones, afterItems);
    else afterItems();
  }

  /** Creatures that leveled into a new move with a full move list ask what to forget. */
  private promptPendingMoves() {
    const run = state.run!;
    const c = allCreatures(run).find((x) => x.pendingMoves.length > 0);
    if (!c) return;
    const id = c.pendingMoves[0];
    const nm = MOVES[id];
    const rec = recommendForget(c, id);
    const tag = 'RECOMMENDED';
    openPicker(this, {
      title: `${creatureName(c)} wants to learn ${nm.name}`,
      subtitle: `${nm.element} · ${moveSummary(nm, 1)} · ${accText(nm)} · ${maxUsesText(nm)}\nForget a move to make room? (Skill tiers on the forgotten move are lost.)`,
      rows: [{ creature: c, text: `${creatureName(c)} · Lv ${c.level}`, big: true }],
      options: [
        ...c.moves.map((m, i) => {
          const d = moveDef(m);
          return { label: `Forget ${d.name}`, sub: `${d.element} · ${moveSummary(d, m.tier)} · ${accText(d)} · T${m.tier} · ${usesText(m)}`, badge: rec === i ? tag : undefined };
        }),
        { label: `Don't learn ${nm.name}`, color: 0x3a3450, badge: rec === null ? tag : undefined },
      ],
      onPick: (i) => {
        resolvePending(c, id, i < c.moves.length ? i : null);
        dex.move(id);
        this.scene.restart({});
      },
    });
  }

  private drawTopBar() {
    const run = state.run!;
    if (run.race) this.drawRaceStatus();
    if (LANDSCAPE) return this.drawSideInfo();
    this.add.rectangle(-OX, -OY, FW, TOP_BAR + OY, 0x0b0912, 0.92).setOrigin(0);
    text(this, 14, 10, run.race ? 'Stage battle' : run.hunt ? `Gilded Hunt ${run.hunt.depth}` : `Floor ${run.floor + 1} / ${FLOORS}`, 20, '#ffc94d', { fontStyle: 'bold' });
    const biome = text(this, 14, 38, `${run.map.biome} lands`, 14, '#' + ELEMENT_COLORS[run.map.biome].toString(16).padStart(6, '0'));
    // Heat and daily markers after the land name.
    let mx = 14 + biome.width + 12;
    if (run.heat) {
      pixelIcon(this, mx, 46, 'flame', 16);
      const t = text(this, mx + 10, 38, String(run.heat), 14, '#ff8a3a', { fontStyle: 'bold' });
      mx += 22 + t.width;
    }
    if (run.daily) pixelIcon(this, mx, 46, 'calendar', 16);
    if (run.weekly && run.twist) {
      // The weekly twist: tap the crown to read it again.
      const tw = TWISTS[run.twist];
      pixelIcon(this, mx, 46, 'crown', 16)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => showMessage(this, `Weekly: ${tw.name}`, tw.desc));
    }
    text(this, 150, 10, `◉ ${run.coins}`, 16, '#ffc94d', { fontStyle: 'bold' });
    pixelIcon(this, 158, 45, 'stone', 16);
    text(this, 170, 36, `${run.evoStones}`, 14, run.evoStones ? '#e0a8ff' : COLORS.textDim, { fontStyle: 'bold' });
    if (run.map.layout === 'rows' && !run.bossPending) {
      const steps = stepsToBoss(run.map, run.currentId);
      pixelIcon(this, 21, 67, 'skull', 14);
      const foe = run.race ? run.race.opponent : 'Boss';
      text(this, 32, 60, steps === 1 ? `${foe} is next` : `${foe} in ${steps} steps`, 12, '#c9a3dd');
    }
    button(this, W - 226, TOP_BAR / 2, 40, 44, '', () => openGameMenu(this), { glyph: 'menu' });
    button(this, W - 170, TOP_BAR / 2, 60, 44, 'Hexlidex', () => this.scene.start('Dex', { from: 'Map' }), { fontSize: 12 });
    // The Bag shows a dot when it holds items nobody is using yet.
    const bag = button(this, W - 106, TOP_BAR / 2, 60, 44, 'Bag', () => this.scene.start('Bag', {}), { fontSize: 15 });
    if ((run.bag ?? []).length) bag.add(this.add.circle(24, -16, 5, 0xffc94d));
    button(this, W - 40, TOP_BAR / 2, 64, 44, 'Team', () => this.scene.start('Team', {}), { fontSize: 15 });
  }

  /** Sideways: floor, land, coins, stones, steps to the boss and the buttons, in a left column. */
  private drawSideInfo() {
    const run = state.run!;
    this.add.rectangle(-OX, -OY, SIDE_L + OX, FH, 0x0b0912, 0.92).setOrigin(0);
    text(this, 14, 12, run.race ? 'Stage battle' : run.hunt ? `Gilded Hunt ${run.hunt.depth}` : `Floor ${run.floor + 1} / ${FLOORS}`, 20, '#ffc94d', { fontStyle: 'bold' });
    const biome = text(this, 14, 40, `${run.map.biome} lands`, 14, '#' + ELEMENT_COLORS[run.map.biome].toString(16).padStart(6, '0'));
    let mx = 14 + biome.width + 12;
    if (run.heat) {
      pixelIcon(this, mx, 48, 'flame', 16);
      const t = text(this, mx + 10, 40, String(run.heat), 14, '#ff8a3a', { fontStyle: 'bold' });
      mx += 22 + t.width;
    }
    if (run.daily) pixelIcon(this, mx, 48, 'calendar', 16);
    if (run.weekly && run.twist) {
      // The weekly twist: tap the crown to read it again.
      const tw = TWISTS[run.twist];
      pixelIcon(this, mx, 48, 'crown', 16)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => showMessage(this, `Weekly: ${tw.name}`, tw.desc));
    }
    text(this, 14, 70, `◉ ${run.coins}`, 16, '#ffc94d', { fontStyle: 'bold' });
    pixelIcon(this, 100, 80, 'stone', 16);
    text(this, 112, 70, `${run.evoStones}`, 16, run.evoStones ? '#e0a8ff' : COLORS.textDim, { fontStyle: 'bold' });
    if (run.map.layout === 'rows' && !run.bossPending) {
      const steps = stepsToBoss(run.map, run.currentId);
      pixelIcon(this, 21, 109, 'skull', 14);
      const foe = run.race ? run.race.opponent : 'Boss';
      text(this, 32, 101, steps === 1 ? `${foe} is next` : `${foe} in ${steps} steps`, 12, '#c9a3dd', { wordWrap: { width: SIDE_L - 40 } });
    }
    const bw = SIDE_L - 24;
    button(this, SIDE_L / 2, 186, bw, 44, 'Team', () => this.scene.start('Team', {}), { fontSize: 16 });
    const bag = button(this, SIDE_L / 2, 238, bw, 44, 'Bag', () => this.scene.start('Bag', {}), { fontSize: 16 });
    if ((run.bag ?? []).length) bag.add(this.add.circle(bw / 2 - 12, -12, 5, 0xffc94d));
    button(this, SIDE_L / 2, 290, bw, 44, 'Hexlidex', () => this.scene.start('Dex', { from: 'Map' }), { fontSize: 16 });
    button(this, SIDE_L / 2, 342, bw, 44, 'Menu', () => openGameMenu(this), { fontSize: 16, glyph: 'menu' });
  }

  /** Stage race: share where we are, and show where the other racer is. */
  private drawRaceStatus() {
    const run = state.run!;
    sendProgress({ floor: run.floor, finished: false, won: false, steps: run.map.layout === 'rows' ? stepsToBoss(run.map, run.currentId) : undefined });
    const t = (LANDSCAPE ? text(this, 14, 400, '', 12, '#8fd0ff', { fontStyle: 'bold', wordWrap: { width: SIDE_L - 24 } }) : text(this, W - 8, 66, '', 12, '#8fd0ff', { fontStyle: 'bold' }).setOrigin(1, 0)).setDepth(5);
    const draw = () => {
      if (!t.active) return;
      const them = duel.race?.theirs;
      const where = !session.connected
        ? 'reconnecting…'
        : !them
          ? 'starting'
          : them.finished
            ? them.won
              ? 'waiting at the boss!'
              : 'team wiped out'
            : them.steps !== undefined
              ? `${them.steps} steps to go`
              : 'on the way';
      t.setText(`vs ${run.race!.opponent}: ${where}`);
    };
    draw();
    duel.onRaceChange = draw;
    this.events.once('shutdown', () => {
      if (duel.onRaceChange === draw) duel.onRaceChange = null;
    });
  }

  private drawBottomBar() {
    const run = state.run!;
    if (LANDSCAPE) {
      // Sideways: the team down a right column.
      const x0 = W - SIDE_R;
      this.add.rectangle(x0, -OY, FW - OX - x0, FH, 0x0b0912, 0.92).setOrigin(0);
      const slotH = (H - 20) / 4;
      run.team.forEach((c, i) => {
        const y = 10 + slotH * i;
        const img = this.add.image(x0 + 40, y + slotH / 2 - 4, ensureCreatureTexture(this, c.speciesId, c.stage, c.shiny)).setScale(1.6 * SPRITE_FIT);
        img.setInteractive({ useHandCursor: true }).on('pointerup', () => this.scene.start('Team', {}));
        text(this, x0 + 76, y + slotH / 2 - 18, `Lv ${c.level}`, 13, COLORS.text, { fontStyle: 'bold' });
        new HpBar(this, x0 + 76, y + slotH / 2 + 4, SIDE_R - 88, 7, false).set(c.hp, stats(c).hp);
      });
      if (run.bench.length) text(this, W - 6, H - 4, `Bench: ${run.bench.length}`, 11, COLORS.textDim).setOrigin(1, 1);
      return;
    }
    const y0 = H - BOTTOM_BAR;
    this.add.rectangle(-OX, y0, FW, FH - OY - y0, 0x0b0912, 0.92).setOrigin(0);
    const slotW = W / 4;
    run.team.forEach((c, i) => {
      const x = slotW * i + slotW / 2;
      const img = this.add.image(x, y0 + 36, ensureCreatureTexture(this, c.speciesId, c.stage, c.shiny)).setScale(1.6 * SPRITE_FIT);
      img.setInteractive({ useHandCursor: true }).on('pointerup', () => this.scene.start('Team', {}));
      text(this, x, y0 + 64, `Lv ${c.level}`, 12, COLORS.textDim).setOrigin(0.5);
      new HpBar(this, x - 36, y0 + 84, 72, 7, false).set(c.hp, stats(c).hp);
    });
    if (run.bench.length) text(this, W - 6, y0 + 4, `Bench: ${run.bench.length}`, 11, COLORS.textDim).setOrigin(1, 0);
  }

  // ------------------------------------------------------------ nodes

  /** Where the token stands on a node (layer coordinates). */
  private posOf: (id: string) => { x: number; y: number } = () => ({ x: 0, y: 0 });
  private token: Phaser.GameObjects.Container | null = null;
  private tokenBody: Phaser.GameObjects.Image | null = null;
  private hopping = false;
  /** Your lead Hexling, trailing just behind your trainer. */
  private follower: Phaser.GameObjects.Container | null = null;
  private followerBody: Phaser.GameObjects.Image | null = null;
  private underToken: Phaser.GameObjects.GameObject[] = [];

  /** Your trainer on the current hex, bobbing gently, with a gold ring underfoot. */
  private makeToken() {
    const run = state.run!;
    const at = this.posOf(run.currentId);
    // Your lead Hexling follows a step behind (drawn over your trainer, see below).
    const lead = run.team[0];
    if (lead) {
      const f = this.add.container(at.x + FOLLOW.x, at.y + FOLLOW.y);
      const fShadow = this.add.ellipse(0, 0, 22, 7, 0x000000, 0.4);
      const fBody = this.add
        .image(0, 0, ensureCreatureTexture(this, lead.speciesId, lead.stage, lead.shiny))
        .setOrigin(0.5, 0.92)
        .setScale(1.4 * SPRITE_FIT)
        .setFlipX(true); // facing your trainer
      f.add([fShadow, fBody]);
      this.layer.add(f);
      // A little out of step with your trainer's bob, like it's walking along.
      this.tweens.add({ targets: fBody, y: -2, yoyo: true, repeat: -1, duration: 430, delay: 200, ease: 'Sine.easeInOut' });
      this.follower = f;
      this.followerBody = fBody;
    }
    const c = this.add.container(at.x, at.y);
    const ring = this.add.ellipse(0, 0, 40, 14, 0xffc94d, 0.35).setStrokeStyle(2, 0xffc94d, 0.9);
    const shadow = this.add.ellipse(0, 0, 26, 8, 0x000000, 0.45);
    const body = this.add.image(0, 0, ensureTrainerTexture(this, myLook(run.meta), 'stand')).setOrigin(0.5, 0.94).setScale(1.5);
    c.add([ring, shadow, body]);
    this.layer.add(c);
    this.tweens.add({ targets: ring, scaleX: 1.25, scaleY: 1.25, alpha: 0.4, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: body, y: -3, yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });
    this.token = c;
    // The Hexling is always drawn in front of your trainer.
    if (this.follower) this.layer.bringToTop(this.follower);
    this.tokenBody = body;
  }

  /** Hop the token to a node: a jump in an arc, a squash on landing, then `done`. */
  private hopTo(id: string, done: () => void) {
    const c = this.token;
    const body = this.tokenBody;
    if (!c || !body) return done();
    const to = this.posOf(id);
    const from = { x: c.x, y: c.y };
    this.hopping = true;
    this.tweens.killTweensOf(body);
    body.setY(0).setFlipX(to.x < from.x);
    // Keep the landing spot in view.
    const area = mapArea();
    const want = Phaser.Math.Clamp(area.top + (area.bottom - area.top) * 0.65 - to.y, this.minScroll, this.maxScroll);
    if (Math.abs(want - this.layer.y) > 4) this.tweens.add({ targets: this.layer, y: want, duration: 420, ease: 'Sine.easeInOut' });
    const lift = calm() ? 10 : 34;
    sfx.hop();
    this.tweens.add({ targets: this.underToken, alpha: 0.5, duration: 300 });
    // Crouch, then jump.
    this.tweens.add({
      targets: body,
      scaleX: 1.7,
      scaleY: 1.25,
      duration: 70,
      yoyo: true,
      onComplete: () => {
        this.followHop(to, from, lift);
        const arc = { t: 0 };
        this.tweens.add({
          targets: arc,
          t: 1,
          duration: calm() ? 260 : 380,
          ease: 'Sine.easeInOut',
          onUpdate: () => {
            c.setPosition(from.x + (to.x - from.x) * arc.t, from.y + (to.y - from.y) * arc.t);
            body.setY(-Math.sin(arc.t * Math.PI) * lift);
          },
          onComplete: () => {
            sfx.land();
            body.setY(0);
            this.tweens.add({
              targets: body,
              scaleX: 1.75,
              scaleY: 1.2,
              duration: 80,
              yoyo: true,
              onComplete: () => {
                body.setScale(1.5);
                this.time.delayedCall(90, () => {
                  this.hopping = false;
                  done();
                });
              },
            });
          },
        });
      },
    });
  }

  /** The lead Hexling hops after your trainer, a beat later and a little lower. */
  private followHop(to: { x: number; y: number }, from: { x: number; y: number }, lift: number) {
    const f = this.follower;
    const body = this.followerBody;
    if (!f || !body) return;
    const start = { x: f.x, y: f.y };
    const end = { x: to.x + FOLLOW.x * (to.x < from.x ? -1 : 1), y: to.y + FOLLOW.y };
    this.tweens.killTweensOf(body);
    body.setY(0).setFlipX(end.x > start.x);
    const arc = { t: 0 };
    this.tweens.add({
      targets: arc,
      t: 1,
      delay: calm() ? 60 : 170,
      duration: calm() ? 240 : 360,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        f.setPosition(start.x + (end.x - start.x) * arc.t, start.y + (end.y - start.y) * arc.t);
        body.setY(-Math.sin(arc.t * Math.PI) * lift * 0.7);
      },
      onComplete: () => {
        body.setY(0);
        this.tweens.add({ targets: body, scaleX: 1.55 * SPRITE_FIT, scaleY: 1.25 * SPRITE_FIT, duration: 70, yoyo: true });
      },
    });
  }

  private enterNode(n: MapNode) {
    const run = state.run!;
    if (this.hopping) return;
    if (run.bossPending) {
      this.scene.start('Battle', { kind: 'boss' });
      return;
    }
    if (!canMoveTo(run, n.id)) return;
    this.hopTo(n.id, () => this.arrive(n));
  }

  /** After the hop: move there and do what the node does. */
  private arrive(n: MapNode) {
    const run = state.run!;
    moveTo(run, n.id);
    if (['levelup', 'skill', 'prestige', 'treasure', 'event'].includes(n.kind)) {
      // Remember the unresolved choice so a reload offers it again.
      run.pendingNode = n.kind;
      persist();
      return this.resumeNode(n.kind);
    }
    switch (n.kind) {
      case 'boss':
        // Stage battle: the boss here is the other player. The stage ends and the duel starts.
        if (run.race) {
          persist();
          return void this.scene.start('End', { won: true });
        }
        this.scene.start('Battle', { kind: n.kind });
        return;
      case 'battle':
      case 'elite':
        this.scene.start('Battle', { kind: n.kind });
        return;
      case 'heal':
        return this.doHeal();
      case 'levelup':
        return this.doLevelUp();
      case 'skill':
        return this.doSkill();
      case 'prestige':
        return this.doPrestige();
      case 'shop':
        // The shop right before the floor 1 boss always stocks healing.
        run.shop = rollShop(run, 0, run.floor === 0 && n.next.includes(run.map.bossId) ? ['potion', 'restore'] : []);
        persist();
        return this.openShop();
      default:
        this.scene.restart({});
    }
  }

  private resumeNode(kind: string) {
    switch (kind) {
      case 'levelup':
        return this.doLevelUp();
      case 'skill':
        return this.doSkill();
      case 'prestige':
        return this.doPrestige();
      case 'treasure':
        return this.doTreasure();
      case 'event':
        return this.doEvent();
    }
  }

  // ------------------------------------------------------------ treasure & events

  private doTreasure() {
    const run = state.run!;
    if (!run.treasure) {
      run.treasure = rollTreasure(run);
      persist();
    }
    const offer = run.treasure;
    const slot: ShopSlot = { item: offer.item, price: 0, sold: false, held: offer.held };
    const reason = unusableReason(run, slot);
    openPicker(this, {
      title: 'Treasure',
      subtitle: 'The chest holds two things. You can only carry one.',
      options: [
        { label: `${offer.coins} coins`, color: 0x6b5a1c, glyph: 'coin' },
        { label: slotName(slot), sub: reason ?? slotDesc(slot), disabled: !!reason, color: 0x4a3a1c, glyph: slotGlyph(slot) },
      ],
      onPick: (i) => {
        if (i === 0) {
          earnCoins(run, offer.coins);
          trackStat(run, 'treasures');
          return showMessage(this, 'Treasure', `You take ◉ ${offer.coins}.`, this.done);
        }
        trackStat(run, 'treasures');
        this.buy(slot, () => this.doTreasure());
      },
    });
  }

  private doEvent() {
    const run = state.run!;
    playMusic('event');
    if (!tipDone('event')) return void tip(this, 'event', () => this.doEvent());
    if (!run.eventId) {
      run.eventId = rollEvent(run).id;
      persist();
    }
    const ev = EVENT_BY_ID[run.eventId];
    const opts = ev.options;
    openPicker(this, {
      title: ev.title,
      subtitle: ev.text,
      options: [
        ...opts.map((o) => {
          const blocked = o.blocked?.(run) ?? (o.target && !allCreatures(run).some((c) => o.eligible?.(run, c) ?? true) ? 'No Hexling can do this' : null);
          return { label: o.label, sub: blocked ?? o.sub(run), disabled: !!blocked, color: 0x2f4a6b };
        }),
        { label: ev.leave ?? 'Walk away', color: 0x3a3450 },
      ],
      onPick: (i) => {
        if (i === opts.length) {
          trackStat(run, 'events');
          return showMessage(this, ev.title, leaveEvent(run, ev), this.done);
        }
        const o = opts[i];
        if (!o.target) return this.resolveEvent(o);
        const list = allCreatures(run);
        openPicker(this, {
          title: o.label,
          subtitle: o.sub(run),
          options: list.map((c) => ({ creature: c, disabled: !(o.eligible?.(run, c) ?? true) })),
          onPick: (k) => this.resolveEvent(o, list[k]),
          onCancel: () => this.doEvent(),
          cancelLabel: 'Back',
        });
      },
    });
  }

  private resolveEvent(o: EventOption, target?: Creature) {
    const run = state.run!;
    const ev = EVENT_BY_ID[run.eventId!];
    const res = o.run(run, target);
    trackStat(run, 'events');
    if (res.joined) dex.creature(res.joined, true);
    if (res.battle) {
      run.pendingNode = null;
      run.eventId = null;
      persist();
      return this.scene.start('Battle', { kind: res.battle });
    }
    showMessage(this, ev.title, res.text, this.done);
  }

  /** Finish the current node's choice and redraw the map. */
  private done = () => {
    const run = state.run!;
    run.pendingNode = null;
    run.eventId = null;
    run.treasure = null;
    persist();
    this.scene.restart({});
  };

  private doHeal() {
    const run = state.run!;
    const frac = run.passive === 'medic' ? 1 : 0.5;
    trackStat(run, 'rests');
    for (const c of allCreatures(run)) {
      healFraction(c, frac);
      c.status = undefined;
      restoreUses(c);
    }
    sfx.heal();
    showMessage(this, 'Rest', `Your Hexlings recover ${frac * 100}% of their HP, shake off any status conditions and get every move's uses back.`, this.done);
  }

  private doLevelUp() {
    const run = state.run!;
    const boost = run.passive === 'trainer' ? 1.5 : 1;
    const focus = Math.round(BALANCE.levelUpFocus[run.floor] * boost);
    const drill = Math.round(BALANCE.levelUpTeam[run.floor] * boost);
    const report = (title: string, rows: { c: Creature; before: number }[]) =>
      openPicker(this, {
        title,
        rows: rows.map(({ c, before }) => ({
          creature: c,
          text: `${creatureName(c)}: ${c.level > before ? `Lv ${before} → ${c.level}` : 'at level cap'}`,
        })),
        options: [{ label: 'Continue', color: 0x3b6d4a }],
        onPick: this.done,
      });
    openPicker(this, {
      title: 'Training Grounds',
      subtitle: 'How do you want to train?',
      options: [
        { label: 'Focus training', sub: `One Hexling gains ${focus} levels` },
        { label: 'Team drills', sub: `Every Hexling, bench included, gains ${drill} levels` },
      ],
      onPick: (i) => {
        trackStat(run, 'levelups');
        if (i !== 0) sfx.levelUp();
        if (i === 1) {
          const rows = allCreatures(run).map((c) => ({ c, before: c.level }));
          for (const { c } of rows) addLevels(c, drill);
          return report('Team drills', rows);
        }
        this.pickCreature('Focus training', `Choose a Hexling (+${focus} levels)`, allCreatures(run), (c) => c.level >= levelCap(c), (c) => {
          const before = c.level;
          addLevels(c, focus);
          sfx.levelUp();
          report('Focus training', [{ c, before }]);
        }, true);
      },
    });
  }

  private doSkill() {
    const run = state.run!;
    const offers: { c: Creature; i: number }[] = [];
    for (const c of allCreatures(run)) c.moves.forEach((m, i) => m.tier < MAX_TIER && offers.push({ c, i }));
    if (offers.length === 0) {
      showMessage(this, 'Skill Shrine', 'All of your moves are fully upgraded!', this.done);
      return;
    }
    // Three offers (four with Sage), never the same move twice.
    const want = run.passive === 'sage' ? 4 : 3;
    const picks: { c: Creature; i: number }[] = [];
    for (const o of run.rng.shuffle(offers)) {
      if (picks.length === want) break;
      if (!picks.some((p) => p.c.moves[p.i].id === o.c.moves[o.i].id)) picks.push(o);
    }
    openPicker(this, {
      title: 'Skill Shrine',
      subtitle: 'Choose one move to upgrade',
      options: picks.map(({ c, i }) => {
        const m = c.moves[i];
        const d = moveDef(m);
        return {
          label: `${creatureName(c)}: ${d.name}  T${m.tier} → T${m.tier + 1}`,
          sub: `${tierUpgradeText(d, m.tier + 1)} · ${accText(d)}`,
          icon: c,
        };
      }),
      onPick: (k) => {
        const { c, i } = picks[k];
        c.moves[i].tier += 1;
        trackStat(run, 'skillUps');
        sfx.statUp();
        this.done();
      },
    });
  }

  private doPrestige() {
    const run = state.run!;
    if (!tipDone('prestige')) return void tip(this, 'prestige', () => this.doPrestige());
    // Ascendant: one sacrifice-free prestige per floor.
    if (run.passive === 'ascendant' && run.ascendFloor !== run.floor) {
      return this.pickCreature(
        'Prestige Altar',
        'Ascendant: this floor\u2019s free prestige, no sacrifice needed (+15% stats, +5 level cap)',
        allCreatures(run),
        (c) => !canPrestige(c),
        (target) => {
          run.ascendFloor = run.floor;
          const lv = target.level;
          prestigeTracked(run, target);
          showMessage(this, 'Prestige!', `${creatureName(target)} is now ${'★'.repeat(target.stars)}${releaseNote(target, lv)}`, this.done);
        },
        true,
      );
    }
    const targets = allCreatures(run).filter(
      (t) => canPrestige(t) && run.bench.some((b) => b !== t && sharesType(b, t)),
    );
    if (targets.length === 0) {
      showMessage(
        this,
        'Prestige Altar',
        'Prestige requires sacrificing a bench Hexling that shares a type with the one you empower.\n\nYou have no valid pair. The altar stays silent.',
        this.done,
      );
      return;
    }
    this.pickCreature(
      'Prestige Altar',
      'Choose a Hexling to empower (+15% stats, +5 level cap)',
      allCreatures(run),
      (c) => !targets.includes(c),
      (target) => {
        const fodder = run.bench.filter((b) => b !== target && sharesType(b, target));
        this.pickCreature(
          'Choose a sacrifice',
          `This bench Hexling will be gone forever to empower ${creatureName(target)}.`,
          fodder,
          () => false,
          (sac) => {
            run.bench = run.bench.filter((b) => b !== sac);
            const lv = target.level;
            prestigeTracked(run, target);
            showMessage(this, 'Prestige!', `${creatureName(sac)} was sacrificed.\n${creatureName(target)} is now ${'★'.repeat(target.stars)}${releaseNote(target, lv)}`, this.done);
          },
          true,
        );
      },
      true,
    );
  }

  // ------------------------------------------------------------ shop

  private openShop() {
    const run = state.run!;
    playMusic('shop');
    if (!tipDone('shop')) return void tip(this, 'shop', () => this.openShop());
    const shop = run.shop!;
    const label = (sl: ShopSlot) => {
      if (sl.item !== 'recruit') return slotName(sl);
      const c = sl.recruit!;
      const name = hasSeenForm(state.meta.dex, c.speciesId, c.stage) ? creatureName(c) : 'Mystery Hexling';
      return `Recruit: ${name} Lv ${c.level}`;
    };
    const reroll = rerollPrice(run, shop);
    openPicker(this, {
      title: `Shop   ◉ ${run.coins}`,
      subtitle: 'Items take effect right away.',
      options: [
        ...shop.slots.map((sl) => {
          const reason = sl.sold ? 'Sold' : unusableReason(run, sl);
          const poor = !canAfford(run, sl.price);
          return {
            label: `${label(sl)}   ◉ ${sl.price}`,
            sub: reason ?? (poor ? `${slotDesc(sl)} · not enough coins` : slotDesc(sl)),
            disabled: sl.sold || !!reason || poor,
            color: 0x4a3a1c,
            glyph: slotGlyph(sl),
          };
        }),
        { label: `Reroll stock   ◉ ${reroll}`, sub: 'New items, same shop', disabled: !canAfford(run, reroll) },
      ],
      onPick: (i) => {
        if (i === shop.slots.length) {
          pay(run, reroll);
          run.shop = rollShop(run, shop.rerolls + 1, shop.guaranteed);
          return this.scene.restart({});
        }
        this.buy(shop.slots[i]);
      },
      cancelLabel: 'Leave shop',
      onCancel: () => {
        run.shop = null;
        this.scene.restart({});
      },
    });
  }

  private buy(slot: ShopSlot, back: () => void = () => this.openShop()) {
    const run = state.run!;
    const finish = (target?: Creature, moveIndex?: number) => {
      pay(run, slot.price);
      sfx.coin();
      slot.sold = true;
      const result = applyItem(run, slot, target, moveIndex);
      if (slot.item === 'recruit') {
        dex.creature(slot.recruit!, true);
        registerJoin(run, slot.recruit!);
      }
      const who = target ? `${creatureName(target)}: ` : '';
      showMessage(this, slotName(slot), who + result, this.done);
    };
    const def = ITEMS[slot.item];
    if (def.target === 'none') return finish();
    const eligible = eligibleTargets(run, slot.item);
    openPicker(this, {
      title: def.name,
      subtitle: `${def.desc}. Choose a Hexling.`,
      options: allCreatures(run).map((c) => ({ creature: c, disabled: !eligible.includes(c) })),
      onPick: (k) => {
        const c = allCreatures(run)[k];
        if (def.target !== 'move') return finish(c);
        const moves = c.moves.map((m, idx) => ({ m, idx })).filter(({ m }) => m.tier < MAX_TIER);
        openPicker(this, {
          title: 'Upgrade which move?',
          rows: [{ creature: c, text: `${creatureName(c)} · Lv ${c.level}`, big: true }],
          options: moves.map(({ m }) => {
            const d = moveDef(m);
            return { label: `${d.name}  T${m.tier} → T${m.tier + 1}`, sub: `${tierUpgradeText(d, m.tier + 1)} · ${accText(d)}` };
          }),
          onPick: (j) => finish(c, moves[j].idx),
          onCancel: back,
          cancelLabel: 'Back',
        });
      },
      onCancel: back,
      cancelLabel: 'Back',
    });
  }

  private pickCreature(
    title: string,
    subtitle: string,
    list: Creature[],
    disabled: (c: Creature) => boolean,
    onPick: (c: Creature) => void,
    cancellable = false,
  ) {
    openPicker(this, {
      title,
      subtitle,
      options: list.map((c) => ({ creature: c, disabled: disabled(c), note: disabled(c) ? 'Not eligible' : undefined })),
      onPick: (i) => onPick(list[i]),
      onCancel: cancellable ? this.done : undefined,
      cancelLabel: 'Skip',
    });
  }
}
