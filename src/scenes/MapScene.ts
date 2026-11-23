import { hasBoon, openOffer, rollOffer, runBoons, takeBoon } from '../logic/boons';
import { DOJO_ROUNDS, EGG_WINS, eggReady, enterDojo, findSurprise, floorSurprise, fossilChoices, hatchEgg, layEgg, leaveDojo, noteAncient } from '../logic/surprises';
import { SURPRISES } from '../data/surprises';
import { BOON_COLOR, BOONS } from '../data/boons';
import { boonCardText, openBoonList, openBoonOffer } from '../ui/boonPick';
import { boonBadge } from '../ui/boonUi';
import { BALANCE } from '../data/balance';
import Phaser from 'phaser';
import { itemReveal, stoneReveal } from '../ui/stoneReveal';
import { openGameMenu } from '../ui/gameMenu';
import { duel, sendProgress } from '../net/runtime';
import { royale, royaleSummary } from '../net/royale';
import { myPid, session } from '../net/session';
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
  naturalMoves,
  resolvePending,
  stats,
  type Creature,
} from '../logic/creature';
import { NODE_INFO, stepsToBoss, type MapNode } from '../logic/map';
import { BOSSES } from '../data/trainers';
import { caravanAt, fillTeamFromBench, joinParty, placeRng, unequipHeld, reviveFallen, revivedForm, rivalHere, rivalTrainerName, rosterFull } from '../logic/run';
import { raceWaitPanel } from '../ui/raceWait';
import { researcherHint, shopTalk } from '../logic/talk';
import { hashString } from '../logic/rng';
import { allCreatures, altarOptions, altarUsable, canMoveTo, currentNode, moveTo, floorsOf, PASSIVES, earnCoins, encounterKind, peekEncounter, prestigeTracked, registerJoin, releaseNote, scoutRange, trackStat } from '../logic/run';
import { ACHIEVEMENTS } from '../logic/achievements';
import { icon as pixelIcon, NODE_ICONS } from '../ui/icons';
import { freeRerollReady, reviveShare, useFreeReroll } from '../logic/workshop';
import { applyItem, canAfford, caravanShop, eligibleTargets, ITEMS, pay, priceFor, rerollPrice, rollShop, slotDesc, slotGlyph, slotName, unusableReason, type ShopSlot } from '../logic/shop';
import { hasSeenForm } from '../logic/dex';
import { SPECIES_BY_ID } from '../data/species';
import { traitName } from '../ui/traitText';
import { dex, persist, state } from '../state';
import { announceGilded } from '../ui/gildedUi';
import { TWISTS } from '../logic/run';
import { EVENT_BY_ID, leaveEvent, rollEvent, rollTreasure, type EventOption } from '../logic/events';
import { openPicker, showMessage } from '../ui/picker';
import { colours, ensureCreatureTexture, ensureGrayTexture, SPRITE_FIT } from '../ui/sprites';
import { playMusic, sfx } from '../ui/sound';
import { ensureGrayTrainerTexture, ensureTrainerTexture } from '../ui/trainerSprite';
import { trainerFx } from '../ui/trainerFx';
import { titleBadge } from '../ui/titleBadge';
import { lookForName, myLook, type TrainerLook } from '../data/trainerLook';
import { calm } from '../ui/motion';
import { Scroller } from '../ui/scroll';
import { background, button, clipList, COLORS, FH, FW, H, HpBar, LANDSCAPE, OX, OY, text, W } from '../ui/widgets';
import { mapBackdrop } from '../ui/backdrops';
import { dot, mapLife, type MapLife } from '../ui/mapLife';
import { cry } from '../ui/cries';
import { bondHearts } from '../data/natures';

/** How the Prestige Altar works, in one place for every prompt. */
const ALTAR_RULES =
  'Give a Hexling a star (★): +15% to every stat and +5 to its level cap, up to 5★. It costs a Hexling from your bench that shares an element with it, and the sacrifice leaves your team for good.';
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

/** A Hexling shown following a trainer on the map. */
interface Lead {
  speciesId: string;
  stage: number;
  shiny?: boolean;
}

/** A trainer token on the map and the Hexling following it. */
interface Walker {
  c: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  f: Phaser.GameObjects.Container | null;
  fBody: Phaser.GameObjects.Image | null;
  lead?: Lead;
  /** Which side of the trainer the Hexling stands on (-1 left, 1 right). */
  side: number;
  /** Node it's on. */
  at: string;
  /** The other player in a stage race (grayed out). */
  ghost: boolean;
  /** Rivals: which spot around the hex they stand on (so several don't stack up). */
  slot?: number;
}

/** Stage race: the side the rival's Hexling last stood on (kept between map visits). */
let rivalSide = -1;
/** Battle royale: the same, for each rival. */
const royaleSides = new Map<string, number>();

/** Where rivals stand around a hex, by slot: up and to the right first, then around. */
const RIVAL_SPOTS = [
  { x: 16, y: -12 },
  { x: -18, y: -12 },
  { x: 24, y: 4 },
  { x: -26, y: 4 },
  { x: 0, y: -20 },
  { x: 12, y: 12 },
  { x: -12, y: 12 },
];

/** Where your lead Hexling stands relative to your trainer (behind and to the side). */
const FOLLOW = { x: 22, y: 9 };

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
    // The scene object is reused between visits: start with no tokens from last time.
    this.me = null;
    this.wonByDefault = false;
    this.rival = null;
    this.rivals = new Map();
    this.roamerSprite = null;
    this.hopping = false;
    this.underToken = [];
    if (run.activeBattle) {
      // A battle was in progress when the game was closed.
      this.scene.start('Battle', { kind: run.activeBattle.kind });
      return;
    }
    const map = run.map;
    const base = Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[map.biome]).darken(82).color;
    background(this, base);
    mapBackdrop(this, map.biome, { w: W, h: H, ox: OX, oy: OY, fw: FW, fh: FH }, base);
    // Redrawing with the shop (or an event) still open keeps its music going instead of starting
    // the map theme and then the shop's again from the top.
    if (run.race?.done) playMusic('showdown');
    else if (run.shop) playMusic('shop');
    else if (run.pendingNode === 'event') playMusic('event');
    else this.mapMusic();

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
    const at = (col: number, y: number) => ({
      x: area.x + area.w / 2 - gridW / 2 + col * colStep,
      y: 50 + (y - minY) * rowStep,
    });
    const pos = (n: MapNode) => at(n.col, n.y);

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
    // Scout: see who's waiting on the battle hexes ahead (final form: two hexes ahead).
    const scouted = new Set<string>();
    const range = scoutRange(run);
    const fog = hasBoon(run, 'fogofwar');
    if (range >= 1) for (const id of reachableIds) scouted.add(id);
    if (range >= 2) for (const id of [...reachableIds]) for (const nx of map.nodes[id]?.next ?? []) scouted.add(nx);
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
      // Fog of War (a curse): only the hexes next to you (and the guardian's) show what they are.
      const fogged = fog && !canGo && !isCurrent && !visited && n.kind !== 'boss';
      const icon = pixelIcon(this, p.x, p.y - (pointy ? 6 : 8), fogged ? 'question' : (NODE_ICONS[n.kind] ?? 'question'), Math.round(iconSize * 1.05));
      const label = text(this, p.x, p.y + hh * (pointy ? 0.2 : 0.26), fogged ? '?' : n.kind === 'boss' ? (run.race ? `vs ${run.race.opponent}` : BOSSES[map.biome].name) : rivalHere(run, n.id) ? 'Rival' : info.label, pointy && hexW < 64 ? 10 : 11, '#ffffff').setOrigin(0.5);
      if (fogged) hex.setFillStyle(0x3a3650);
      this.layer.add([hex, icon, label]);
      // A rare encounter or hidden hex: a twinkle in the corner.
      const fsx = floorSurprise(run);
      if ((fsx.encNode === n.id || fsx.hexNode === n.id) && !visited) {
        const tw = pixelIcon(this, p.x - hw * 0.36, p.y - hh * 0.34, 'sparkle', 14);
        this.layer.add(tw);
        this.tweens.add({ targets: tw, alpha: 0.35, yoyo: true, repeat: -1, duration: 700 });
      }
      const peek = scouted.has(n.id) ? peekEncounter(run, n) : null;
      if (peek) {
        const img = this.add.image(p.x + hw * 0.36, p.y - hh * 0.34, ensureCreatureTexture(this, peek.speciesId, run.hunt ? 2 : Math.min(2, run.floor))).setScale(0.75 * SPRITE_FIT);
        this.layer.add(img);
        if (peek.count > 1) this.layer.add(text(this, p.x + hw * 0.36 + 12, p.y - hh * 0.34 + 8, `+${peek.count - 1}`, 10, '#ffe9a8', { stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5));
      }
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

    // Wild Hexlings, birds, the time of day and holidays.
    this.life = mapLife(this, {
      layer: this.layer,
      biome: map.biome,
      stage: run.hunt ? 2 : map.floor,
      nodes,
      cols,
      at,
      hexW,
      hexH,
      area,
      tapOk: () => !this.scroller?.moved,
      // Wild Hexlings keep off your hex, the hexes you can move to, and the guardian's.
      blocked: (at) => {
        const r = state.run!;
        const here = at ?? r.currentId;
        return new Set([here, r.map.bossId, ...(r.map.nodes[here]?.next ?? []), ...(r.roamer ? [r.roamer.node] : []), ...(r.rival?.node ? [r.rival.node] : [])]);
      },
    });

    // Your token: your trainer standing on the hex you're on (see hopTo).
    this.posOf = (id: string) => {
      const q = pos(map.nodes[id]);
      return { x: q.x, y: q.y + hexH * 0.12 };
    };
    this.makeToken();
    this.drawRoamer();
    this.drawRival();

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
    const resumeNode = () =>
      run.shop ? this.openShop() : run.pendingNode ? this.resumeNode(run.pendingNode) : this.promptPendingMoves();
    // A boon on offer (after a guardian, or from a curse) comes first; then a redraw shows its effects.
    const resume = () => (run.boons?.offer ? openBoonOffer(this, run, () => this.scene.restart({})) : resumeNode());
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
    const afterFloorBanner = () => (data.banner ? showMessage(this, run.race?.done ? (run.race.done.won ? 'Stage cleared!' : 'Stage over') : run.race ? (run.race.royale ? 'Battle royale' : 'Stage battle') : run.hunt ? `Gilded Hunt · floor ${run.hunt.depth}` : `Floor ${run.floor + 1}`, data.banner, next) : next());
    // Rare surprises announce themselves once: the run's omen, then this floor's.
    // The Hatchery's egg hatches on the map, once it has seen enough battles.
    const afterBanner = () => this.announceSurprises(() => this.hatchIfReady(afterFloorBanner));
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
    // Moves picked up from the land (learned straight into a free slot) get a moment of their own.
    const landC = allCreatures(run).find((x) => x.landNews?.length);
    if (landC) {
      const ids = landC.landNews!;
      landC.landNews = [];
      persist();
      const lines = ids.map((id) => `${MOVES[id].name}: ${MOVES[id].element} · ${moveSummary(MOVES[id], 1)}`).join('\n');
      return showMessage(
        this,
        'Learned from the land!',
        `${creatureName(landC)} picked up ${ids.length > 1 ? 'moves' : 'a move'} from the ${MOVES[ids[0]].element} lands instead of its usual one.\n\n${lines}`,
        () => this.promptPendingMoves(),
      );
    }
    const c = allCreatures(run).find((x) => x.pendingMoves.length > 0);
    if (!c) return;
    const id = c.pendingMoves[0];
    const nm = MOVES[id];
    const rec = recommendForget(c, id);
    const tag = 'RECOMMENDED';
    const fromLand = c.landMoves?.includes(id) ? `\nLearned from the ${nm.element} lands, in place of its usual move.` : '';
    openPicker(this, {
      title: `${creatureName(c)} wants to learn ${nm.name}`,
      subtitle: `${nm.element} · ${moveSummary(nm, 1)} · ${accText(nm)} · ${maxUsesText(nm)}${fromLand}\nForget a move to make room? (Skill tiers on the forgotten move are lost.)`,
      rows: [{ creature: c, text: `${creatureName(c)} · Lv ${c.level}`, big: true }],
      options: [
        ...c.moves.map((m, i) => {
          const d = moveDef(m);
          return { label: `Forget ${d.name}`, sub: `${d.element} · ${moveSummary(d, m.tier)} · ${accText(d)} · T${m.tier} · ${usesText(m)}`, badge: rec === i ? tag : undefined };
        }),
        { label: `Don't learn ${nm.name}`, color: 0x3a3450, badge: rec === null ? tag : undefined },
      ],
      onPick: (i) => {
        const done = (slot: number | null) => {
          resolvePending(c, id, slot);
          dex.move(id);
          this.scene.restart({});
        };
        if (i >= c.moves.length) return done(null);
        // Forgetting is for good: make sure it's the right one.
        this.confirmForget(c, i, nm.name, () => done(i), () => this.promptPendingMoves());
      },
    });
  }

  /** "Forget Ember for Water Pulse?" Forgetting a move can't be undone, so ask first. */
  private confirmForget(c: Creature, index: number, learning: string, yes: () => void, no: () => void) {
    const old = moveDef(c.moves[index]);
    const tier = c.moves[index].tier > 1 ? ` Its skill tier (T${c.moves[index].tier}) is lost too.` : '';
    openPicker(this, {
      title: `Forget ${old.name}?`,
      subtitle: `${creatureName(c)} forgets ${old.name} for good and learns ${learning}.${tier}`,
      rows: [{ creature: c, text: `${creatureName(c)} · Lv ${c.level}`, big: true }],
      options: [
        { label: `Forget ${old.name}`, sub: `${old.element} · ${moveSummary(old, c.moves[index].tier)} · ${accText(old)}`, color: 0x8a2c2c },
        { label: 'Choose again', color: 0x3a3450 },
      ],
      onPick: (k) => (k === 0 ? yes() : no()),
    });
  }

  private drawTopBar() {
    const run = state.run!;
    if (run.race) this.drawRaceStatus();
    if (LANDSCAPE) return this.drawSideInfo();
    this.add.rectangle(-OX, -OY, FW, TOP_BAR + OY, 0x0b0912, 0.92).setOrigin(0);
    text(this, 14, 10, run.race ? (run.race.royale ? 'Battle royale' : 'Stage battle') : run.hunt ? `Gilded Hunt ${run.hunt.depth}` : `Floor ${run.floor + 1} / ${floorsOf(run)}`, 20, '#ffc94d', { fontStyle: 'bold' });
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
      const st = text(this, 32, 60, steps === 1 ? `${foe} is next` : `${foe} in ${steps} steps`, 12, '#c9a3dd');
      // A quick run: tagged after the steps line (the rows above are full).
      if (run.quick) text(this, 32 + st.width + 10, 60, 'QUICK RUN', 11, '#8fd6ff', { fontStyle: 'bold' });
    }
    button(this, W - 226, TOP_BAR / 2, 40, 44, '', () => openGameMenu(this), { glyph: 'menu' });
    button(this, W - 170, TOP_BAR / 2, 60, 44, 'Hexlidex', () => this.scene.start('Dex', { from: 'Map' }), { fontSize: 12 });
    // The Bag shows a dot when it holds items nobody is using yet.
    const bag = button(this, W - 106, TOP_BAR / 2, 60, 44, 'Bag', () => this.scene.start('Bag', {}), { fontSize: 15 });
    if ((run.bag ?? []).length) bag.add(this.add.circle(24, -16, 5, 0xffc94d));
    button(this, W - 40, TOP_BAR / 2, 64, 44, 'Team', () => this.scene.start('Team', {}), { fontSize: 15 });
    // Boons: a badge just under the bar.
    this.boonChip(10, TOP_BAR + 20, W - 20);
  }

  /** Boons held: a glowing badge with a gem for each; tap for the list. */
  private boonChip(x: number, y: number, maxW: number) {
    const run = state.run!;
    const b = boonBadge(this, x, y, run.boons?.held ?? [], () => openBoonList(this, run), { maxW });
    b?.setDepth(6);
  }

  /** Sideways: floor, land, coins, stones, steps to the boss and the buttons, in a left column. */
  private drawSideInfo() {
    const run = state.run!;
    this.add.rectangle(-OX, -OY, SIDE_L + OX, FH, 0x0b0912, 0.92).setOrigin(0);
    text(this, 14, 12, run.race ? (run.race.royale ? 'Battle royale' : 'Stage battle') : run.hunt ? `Gilded Hunt ${run.hunt.depth}` : `Floor ${run.floor + 1} / ${floorsOf(run)}`, 20, '#ffc94d', { fontStyle: 'bold' });
    const biome = text(this, 14, 40, `${run.map.biome} lands`, 14, '#' + ELEMENT_COLORS[run.map.biome].toString(16).padStart(6, '0'));
    let mx = 14 + biome.width + 12;
    if (run.heat) {
      pixelIcon(this, mx, 48, 'flame', 16);
      const t = text(this, mx + 10, 40, String(run.heat), 14, '#ff8a3a', { fontStyle: 'bold' });
      mx += 22 + t.width;
    }
    if (run.quick) text(this, mx - 2, 41, 'QUICK', 12, '#8fd6ff', { fontStyle: 'bold' });
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
    this.boonChip(10, 140, SIDE_L - 20);
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

  /** Stage race: tell the other player where we are (for their map) and who leads our team. */
  private shareProgress() {
    const run = state.run!;
    if (!run.race || run.race.done) return;
    const lead = run.team[0];
    sendProgress({
      floor: run.floor,
      finished: false,
      won: false,
      steps: run.map.layout === 'rows' ? stepsToBoss(run.map, run.currentId) : undefined,
      at: run.currentId,
      lead: lead ? { speciesId: lead.speciesId, stage: lead.stage, ...(lead.shiny ? { shiny: true } : {}) } : undefined,
    });
  }

  /** Stage race: share where we are, and show where the other racer is. */
  private drawRaceStatus() {
    const run = state.run!;
    this.shareProgress();
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
      t.setText(run.race!.royale ? `Battle royale: ${royaleSummary()}` : `vs ${run.race!.opponent}: ${where}`);
    };
    const update = () => {
      draw();
      this.updateRival();
      this.checkRivalWiped();
    };
    update();
    duel.onRaceChange = update;
    royale.onChange = update;
    this.events.once('shutdown', () => {
      if (duel.onRaceChange === update) duel.onRaceChange = null;
      if (royale.onChange === update) royale.onChange = null;
    });
  }

  private drawBottomBar() {
    const run = state.run!;
    // Your part of the race is over: the bar becomes a panel about the others still climbing.
    if (run.race?.done) {
      const box = LANDSCAPE ? { x: W - SIDE_R + 4, y: 8, w: SIDE_R - 8, h: H - 16 } : { x: 6, y: H - BOTTOM_BAR + 4, w: W - 12, h: BOTTOM_BAR - 8 };
      if (LANDSCAPE) this.add.rectangle(W - SIDE_R, -OY, FW - OX - (W - SIDE_R), FH, 0x0b0912, 0.92).setOrigin(0);
      else this.add.rectangle(-OX, H - BOTTOM_BAR, FW, FH - OY - (H - BOTTOM_BAR), 0x0b0912, 0.92).setOrigin(0);
      raceWaitPanel(this, run, run.race.done.won, { ...box, depth: 5 });
      return;
    }
    if (LANDSCAPE) {
      // Sideways: the team down a right column.
      const x0 = W - SIDE_R;
      this.add.rectangle(x0, -OY, FW - OX - x0, FH, 0x0b0912, 0.92).setOrigin(0);
      const slotH = (H - 20) / 4;
      run.team.forEach((c, i) => {
        const y = 10 + slotH * i;
        const img = this.add.image(x0 + 40, y + slotH / 2 - 4, ensureCreatureTexture(this, c.speciesId, c.stage, colours(c))).setScale(1.6 * SPRITE_FIT);
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
      const img = this.add.image(x, y0 + 36, ensureCreatureTexture(this, c.speciesId, c.stage, colours(c))).setScale(1.6 * SPRITE_FIT);
      img.setInteractive({ useHandCursor: true }).on('pointerup', () => this.scene.start('Team', {}));
      text(this, x, y0 + 64, `Lv ${c.level}`, 12, COLORS.textDim).setOrigin(0.5);
      new HpBar(this, x - 36, y0 + 84, 72, 7, false).set(c.hp, stats(c).hp);
    });
    if (run.bench.length) text(this, W - 6, y0 + 4, `Bench: ${run.bench.length}`, 11, COLORS.textDim).setOrigin(1, 0);
  }

  // ------------------------------------------------------------ nodes

  /** Where the token stands on a node (layer coordinates). */
  private posOf: (id: string) => { x: number; y: number } = () => ({ x: 0, y: 0 });
  /** You: your trainer and lead Hexling. */
  private me: Walker | null = null;
  /** Stage race: the other player, grayed out, moving as they move. */
  private rival: Walker | null = null;
  /** Battle royale: every other racer still on the stage, by player id. */
  private rivals = new Map<string, Walker>();
  private hopping = false;
  private life: MapLife | null = null;
  private underToken: Phaser.GameObjects.GameObject[] = [];

  /** Your trainer on the current hex (gold ring), with your lead Hexling a step behind. */
  private makeToken() {
    const run = state.run!;
    const lead = run.team[0];
    this.me = this.makeWalker(run.currentId, myLook(run.meta), lead ? { speciesId: lead.speciesId, stage: lead.stage, shiny: lead.shiny } : null, run.followSide ?? -1, null);
    this.leadMood();
  }

  /**
   * Your lead Hexling's mood on the map: happy after a win, worn out when hurt, uneasy with the
   * guardian a step away. Tap it for a cry (and its bond hearts); now and then it looks around.
   */
  private leadMood() {
    const run = state.run!;
    const w = this.me;
    const lead = run.team[0];
    if (!w?.f || !w.fBody || !lead) return;
    const body = w.fBody;
    const f = w.f;
    const say = (s: string, color = '#ffffff', delay = 0) =>
      this.time.delayedCall(delay, () => {
        if (!f.active) return;
        const t = text(this, f.x, f.y - 40, s, 15, color, { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5);
        this.layer.add(t);
        this.tweens.add({ targets: t, y: t.y - 14, alpha: 0, delay: 500, duration: 900, onComplete: () => t.destroy() });
      });
    const jump = (delay = 0, times = 1) => this.tweens.add({ targets: body, y: -9, yoyo: true, repeat: times - 1, duration: 170, delay, ease: 'Quad.easeOut' });
    const key = `${run.seed}:${lead.uid}`;
    const wins = run.log.battlesWon;
    const seen = MapScene.mood;
    const frac = lead.hp / stats(lead).hp;
    if (seen.key === key && wins > seen.wins) {
      say(frac < 0.3 ? '♪…' : '♪', '#ffe14d', 500);
      jump(500, 2);
    } else if (frac < 0.3) say('…', '#a8c0e8', 600);
    else if (!run.bossPending && stepsToBoss(run.map, run.currentId) === 1) say('!', '#ff8a7a', 600);
    MapScene.mood = { key, wins };
    body.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      if (this.scroller.moved || this.hopping) return;
      cry(lead.speciesId, lead.stage);
      const hearts = bondHearts(lead.bond);
      say(hearts ? '♥'.repeat(hearts) : '♪', hearts ? '#ff8ab0' : '#ffffff');
      jump();
    });
    // Now and then: a look around, or a happy hop if you're close.
    this.time.addEvent({
      delay: 9000,
      loop: true,
      callback: () => {
        if (this.hopping || !f.active) return;
        if (bondHearts(lead.bond) >= 2 && Math.random() < 0.4) {
          jump();
          say('♥', '#ff8ab0');
        } else {
          body.setFlipX(!body.flipX);
          this.time.delayedCall(800, () => f.active && body.setFlipX(!body.flipX));
        }
      },
    });
  }

  /** Your rival, standing on the trainer hex they wait on this floor, with a RIVAL tag. */
  private drawRival() {
    const run = state.run!;
    const r = run.rival;
    if (!r?.node || !rivalHere(run, r.node) || run.currentId === r.node) return;
    const p = this.posOf(r.node);
    const c = this.add.container(p.x + 16, p.y - 2);
    const look = lookForName(rivalTrainerName(r));
    const body = this.add.image(0, 0, ensureTrainerTexture(this, look, 'stand')).setOrigin(0.5, 0.94).setScale(1.25).setFlipX(true);
    const shadow = this.add.ellipse(0, 0, 22, 7, 0x000000, 0.4);
    const tagText = text(this, 0, -54, 'RIVAL', 10, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
    const tag = this.add.rectangle(0, -54, tagText.width + 10, 15, 0xc8323c).setStrokeStyle(1, 0x14101e);
    c.add([shadow, body, tag, tagText]);
    this.layer.add(c);
    trainerFx(this, body, look);
    this.tweens.add({ targets: body, y: -2, yoyo: true, repeat: -1, duration: 640, ease: 'Sine.easeInOut' });
  }

  private roamerSprite: Phaser.GameObjects.Container | null = null;

  /**
   * A roaming legendary: its dark silhouette hovering over the battle hex it's on, glimmering. It
   * glides to a new hex each time you move. The first time on a floor, a line says it's there.
   */
  private drawRoamer() {
    const run = state.run!;
    const r = run.roamer;
    if (!r || !run.map.nodes[r.node]) {
      if (this.roamerSprite) {
        const s = this.roamerSprite;
        this.roamerSprite = null;
        this.tweens.add({ targets: s, alpha: 0, duration: 500, onComplete: () => s.destroy() });
      }
      return;
    }
    const p = this.posOf(r.node);
    const at = { x: p.x, y: p.y - 6 };
    // Cornered (nowhere to step), it stays put with a "!" over its head instead of the usual "?".
    const markFor = () => (r.cornered ? '!' : '?');
    if (this.roamerSprite?.active) {
      this.tweens.add({ targets: this.roamerSprite, x: at.x, y: at.y, duration: 900, ease: 'Sine.easeInOut' });
      const m = this.roamerSprite.getByName('mark') as Phaser.GameObjects.Text | null;
      if (m && m.text !== markFor()) {
        m.setText(markFor()).setColor(r.cornered ? '#ffd84d' : '#e0c8ff').setFontSize(r.cornered ? 22 : 16);
        if (r.cornered) this.tweens.add({ targets: m, scale: 1.35, yoyo: true, duration: 180, repeat: 2 });
      }
      return;
    }
    const c = this.add.container(at.x, at.y);
    const glow = this.add.ellipse(0, 4, 64, 22, 0xb48aff, 0.25);
    const body = this.add.image(0, 0, ensureGrayTexture(this, r.id, 2, true)).setOrigin(0.5, 0.85).setScale(1.9 * SPRITE_FIT).setTint(0x2a1a4a).setAlpha(0.9);
    const mark = text(this, 0, -62, markFor(), r.cornered ? 22 : 16, r.cornered ? '#ffd84d' : '#e0c8ff', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 4 })
      .setOrigin(0.5)
      .setName('mark');
    c.add([glow, body, mark]);
    this.layer.add(c);
    this.roamerSprite = c;
    this.tweens.add({ targets: body, y: -5, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: glow, scaleX: 1.3, alpha: 0.08, yoyo: true, repeat: -1, duration: 900 });
    const sparks = this.add.particles(0, -20, dot(this), {
      emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 26) as never },
      lifespan: 1000,
      frequency: 240,
      tint: [0xe0c8ff, 0xffffff],
      alpha: { start: 1, end: 0 },
      scale: { start: 1.6, end: 0 },
      blendMode: 'ADD',
    });
    c.add(sparks);
    if (!r.announced) {
      r.announced = true;
      persist();
      const t = text(this, mapArea().x + mapArea().w / 2, mapArea().top + 52, 'Something legendary is roaming this floor…', 14, '#e0c8ff', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 4 }).setOrigin(0.5).setDepth(6);
      this.tweens.add({ targets: t, alpha: 0, delay: 3500, duration: 900, onComplete: () => t.destroy() });
    }
  }

  /** The last wins count the lead Hexling reacted to (per run and Hexling). */
  private static mood = { key: '', wins: 0 };

  /**
   * A trainer token with their lead Hexling following (drawn in front of the trainer). A rival
   * (`ghostName` set) is grayed out, stands a little up and to the side, and has a name tag.
   */
  private makeWalker(nodeId: string, look: TrainerLook, lead: Lead | null, side: number, ghostName: string | null, slot = 0): Walker {
    const ghost = ghostName !== null;
    const at = this.offsetPos(nodeId, ghost, slot);
    const c = this.add.container(at.x, at.y);
    const ringColor = ghost ? 0x8fd0ff : 0xffc94d;
    const ring = this.add.ellipse(0, 0, 40, 14, ringColor, ghost ? 0.18 : 0.35).setStrokeStyle(2, ringColor, ghost ? 0.6 : 0.9);
    const shadow = this.add.ellipse(0, 0, 26, 8, 0x000000, ghost ? 0.25 : 0.45);
    const body = this.add.image(0, 0, ghost ? ensureGrayTrainerTexture(this, look) : ensureTrainerTexture(this, look, 'stand')).setOrigin(0.5, 0.94).setScale(1.5);
    c.add([ring, shadow, body]);
    if (ghost) {
      // Their name, and their title (in its tier's color and effect) under it.
      const title = duel.opponent?.title;
      c.add(text(this, 0, title ? -70 : -58, ghostName, 10, '#8fd0ff', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5));
      if (title) c.add(titleBadge(this, 0, -58, title, 9, { maxW: 110 }));
    }
    this.layer.add(c);
    trainerFx(this, body, look, { gray: ghost });
    this.tweens.add({ targets: ring, scaleX: 1.25, scaleY: 1.25, alpha: ghost ? 0.1 : 0.4, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: body, y: -3, yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });
    const w: Walker = { c, body, f: null, fBody: null, side, at: nodeId, ghost, slot };
    if (lead) this.setLead(w, lead);
    return w;
  }

  /** (Re)place a walker's following Hexling. */
  private setLead(w: Walker, lead: Lead) {
    w.f?.destroy();
    const f = this.add.container(w.c.x + FOLLOW.x * w.side, w.c.y + FOLLOW.y);
    const fShadow = this.add.ellipse(0, 0, 22, 7, 0x000000, w.ghost ? 0.25 : 0.4);
    const key = w.ghost ? ensureGrayTexture(this, lead.speciesId, lead.stage, true) : ensureCreatureTexture(this, lead.speciesId, lead.stage, colours(lead));
    const fBody = this.add
      .image(0, 0, key)
      .setOrigin(0.5, 0.92)
      .setScale(1.4 * SPRITE_FIT)
      .setFlipX(w.side < 0); // facing its trainer
    f.add([fShadow, fBody]);
    // Drawn in front of its trainer.
    this.layer.addAt(f, this.layer.getIndex(w.c) + 1);
    // A little out of step with the trainer's bob, like it's walking along.
    this.tweens.add({ targets: fBody, y: -2, yoyo: true, repeat: -1, duration: 430, delay: 200, ease: 'Sine.easeInOut' });
    w.f = f;
    w.fBody = fBody;
    w.lead = lead;
  }

  /** Where a walker stands on a node: a rival stands a little up and to the side. */
  private offsetPos(id: string, ghost: boolean, slot = 0) {
    const p = this.posOf(id);
    const o = RIVAL_SPOTS[slot % RIVAL_SPOTS.length];
    return ghost ? { x: p.x + o.x, y: p.y + o.y } : p;
  }

  /** Hop your token to a node, then `done`. */
  private hopTo(id: string, done: () => void) {
    const w = this.me;
    if (!w) return done();
    const to = this.posOf(id);
    this.hopping = true;
    // Keep the landing spot in view.
    const area = mapArea();
    const want = Phaser.Math.Clamp(area.top + (area.bottom - area.top) * 0.65 - to.y, this.minScroll, this.maxScroll);
    if (Math.abs(want - this.layer.y) > 4) this.tweens.add({ targets: this.layer, y: want, duration: 420, ease: 'Sine.easeInOut' });
    sfx.hop();
    this.tweens.add({ targets: this.underToken, alpha: 0.5, duration: 300 });
    this.hopWalker(w, id, () => {
      state.run!.followSide = w.side as -1 | 1;
      this.life?.scare(w.c.x, w.c.y, id);
      this.time.delayedCall(90, () => {
        this.hopping = false;
        done();
      });
    });
  }

  /**
   * A walker's hop: crouch, jump in an arc, squash on landing; its Hexling hops after it a beat
   * later and a little lower, landing on the trailing side.
   */
  private hopWalker(w: Walker, id: string, done: () => void = () => {}) {
    const { c, body } = w;
    const to = this.offsetPos(id, w.ghost, w.slot);
    const from = { x: c.x, y: c.y };
    w.at = id;
    this.tweens.killTweensOf(body);
    body.setY(0).setFlipX(to.x < from.x);
    const lift = calm() ? 10 : 34;
    this.tweens.add({
      targets: body,
      scaleX: 1.7,
      scaleY: 1.25,
      duration: 70,
      yoyo: true,
      onComplete: () => {
        this.followHop(w, to, from, lift);
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
            if (!w.ghost) sfx.land();
            body.setY(0);
            this.tweens.add({
              targets: body,
              scaleX: 1.75,
              scaleY: 1.2,
              duration: 80,
              yoyo: true,
              onComplete: () => {
                body.setScale(1.5);
                this.tweens.add({ targets: body, y: -3, yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });
                done();
              },
            });
          },
        });
      },
    });
  }

  /** The following Hexling's hop: it trails behind (the right side when heading left, and so on). */
  private followHop(w: Walker, to: { x: number; y: number }, from: { x: number; y: number }, lift: number) {
    const { f, fBody: body } = w;
    if (!f || !body) return;
    const start = { x: f.x, y: f.y };
    // Straight up keeps its side.
    w.side = to.x < from.x - 1 ? 1 : to.x > from.x + 1 ? -1 : w.side;
    const end = { x: to.x + FOLLOW.x * w.side, y: to.y + FOLLOW.y };
    this.tweens.killTweensOf(body);
    body.setY(0).setFlipX(end.x > start.x);
    const scale = 1.4 * SPRITE_FIT;
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
        body.setY(0).setFlipX(w.side < 0);
        this.tweens.add({
          targets: body,
          scaleX: scale * 1.1,
          scaleY: scale * 0.9,
          duration: 70,
          yoyo: true,
          onComplete: () => {
            body.setScale(scale);
            this.tweens.add({ targets: body, y: -2, yoyo: true, repeat: -1, duration: 430, ease: 'Sine.easeInOut' });
          },
        });
      },
    });
  }

  /** Set once the stage battle has been decided by the other racer's team falling. */
  private wonByDefault = false;

  /** Stage race: the other racer's whole team fell, so the stage battle is over and you win it. */
  private checkRivalWiped() {
    const run = state.run!;
    if (run.race?.done) return;
    if (run.race?.royale) return this.checkRoyaleOver();
    const them = duel.race?.theirs;
    if (!run.race || this.wonByDefault || !them?.finished || them.team?.length) return;
    this.wonByDefault = true;
    showMessage(this, 'Stage battle over!', `${run.race.opponent}\u2019s team was wiped out, so the stage battle is yours.`, () =>
      this.scene.start('End', { won: true, byDefault: true }),
    );
  }

  /** Battle royale, mid-stage: every other team fell (you win), or it ended early. */
  private checkRoyaleOver() {
    if (this.wonByDefault) return;
    if (royale.ended) {
      this.wonByDefault = true;
      showMessage(this, 'Battle royale over', royale.ended, () => {
        royale.reset();
        state.run = null;
        this.scene.start(session.connected ? 'Duel' : 'Title', {});
      });
    } else if (royale.champion === myPid) {
      this.wonByDefault = true;
      showMessage(this, 'Last trainer standing!', 'Every other team was wiped out, so the battle royale is yours.', () =>
        this.scene.start('End', { won: true, byDefault: true }),
      );
    }
  }

  /** Stage race: show (or move) the other player's grayed-out token where they are. */
  private updateRival() {
    const run = state.run!;
    if (run.race?.royale) return this.updateRoyaleRivals();
    const them = duel.race?.theirs;
    if (!run.race || !them?.at || !run.map.nodes[them.at] || !this.layer?.active) return;
    const lead = them.lead ?? null;
    if (!this.rival) {
      this.rival = this.makeWalker(them.at, duel.opponent?.look ?? lookForName(run.race.opponent), lead, rivalSide, run.race.opponent);
      // Behind your own token (their Hexling still in front of them).
      const r = this.rival;
      if (this.me) {
        this.layer.moveBelow(r.c, this.me.c);
        if (r.f) this.layer.moveAbove(r.f, r.c);
      }
    } else {
      const r = this.rival;
      if (lead && (!r.lead || r.lead.speciesId !== lead.speciesId || r.lead.stage !== lead.stage)) this.setLead(r, lead);
      if (r.at !== them.at) this.hopWalker(r, them.at, () => (rivalSide = r.side));
    }
  }

  /**
   * Battle royale: a grayed-out token for every other racer still on the stage, hopping along as
   * they move. Racers who finish (or drop out) leave the map.
   */
  private updateRoyaleRivals() {
    const run = state.run!;
    if (!this.layer?.active) return;
    const others = royale.standings.filter((x) => x.pid !== myPid);
    const here = new Set<string>();
    others.forEach((st) => {
      const on = !!st.at && !!run.map.nodes[st.at] && !st.finished && !st.gone;
      if (!on) return;
      here.add(st.pid);
      const player = royale.players.find((p) => p.pid === st.pid);
      const slot = Math.max(0, royale.players.filter((p) => p.pid !== myPid).findIndex((p) => p.pid === st.pid));
      const lead = st.lead ?? null;
      let w = this.rivals.get(st.pid);
      if (!w) {
        w = this.makeWalker(st.at!, player?.look ?? lookForName(st.name), lead, royaleSides.get(st.pid) ?? -1, st.name, slot);
        // Behind your own token (their Hexling still in front of them).
        if (this.me) {
          this.layer.moveBelow(w.c, this.me.c);
          if (w.f) this.layer.moveAbove(w.f, w.c);
        }
        this.rivals.set(st.pid, w);
      } else {
        if (lead && (!w.lead || w.lead.speciesId !== lead.speciesId || w.lead.stage !== lead.stage)) this.setLead(w, lead);
        const ww = w;
        if (w.at !== st.at) this.hopWalker(w, st.at!, () => royaleSides.set(st.pid, ww.side));
      }
    });
    // Off the stage now (at the boss, wiped out or gone): take them off the map.
    for (const [pid, w] of this.rivals) {
      if (here.has(pid)) continue;
      this.tweens.add({ targets: [w.c, w.f].filter(Boolean), alpha: 0, duration: 400, onComplete: () => (w.c.destroy(), w.f?.destroy()) });
      this.rivals.delete(pid);
    }
  }

  private enterNode(n: MapNode) {
    const run = state.run!;
    if (this.hopping || run.race?.done) return;
    if (run.bossPending) {
      this.scene.start('Battle', { kind: 'boss' });
      return;
    }
    if (!canMoveTo(run, n.id)) return;
    // A Prestige Altar with nothing to sacrifice does nothing: say so, and let you pick another hex.
    if (n.kind === 'prestige' && !altarUsable(run)) {
      const others = currentNode(run).next.filter((id) => id !== n.id);
      openPicker(this, {
        title: 'Nothing to sacrifice',
        subtitle: `This Prestige Altar can\u2019t do anything for you right now.\n\n${ALTAR_RULES}`,
        options: [
          ...(others.length ? [{ label: 'Choose another hex', sub: 'Stay where you are', color: 0x2f4a6b }] : []),
          { label: 'Go anyway', sub: others.length ? 'Move here; the altar stays silent' : 'It\u2019s the only way forward; the altar stays silent' },
        ],
        onPick: (i) => {
          if (others.length && i === 0) return;
          this.hopTo(n.id, () => this.arrive(n));
        },
      });
      return;
    }
    this.hopTo(n.id, () => this.arrive(n));
  }

  /** After the hop: move there and do what the node does. */
  private arrive(n: MapNode) {
    const run = state.run!;
    moveTo(run, n.id);
    this.drawRoamer();
    // The other player sees you hop there.
    this.shareProgress();
    // A rare encounter on this hex: it's found now.
    const fsur = floorSurprise(run);
    if (fsur.enc && fsur.encNode === n.id && findSurprise(state.meta, fsur.enc)) persist();
    if (['levelup', 'skill', 'prestige', 'treasure', 'event', 'revive', 'boon', 'hidden'].includes(n.kind)) {
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
        // Travelling caravan (a surprise): a shop on wheels instead of a battle.
        if (caravanAt(run, n)) {
          run.shop = caravanShop(run);
          persist();
          return this.openShop();
        }
        // Haunted Floor (a curse): every battle on this floor is a trainer.
        this.scene.start('Battle', { kind: encounterKind(run, n) });
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
        run.shopVisits = (run.shopVisits ?? 0) + 1;
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
      case 'revive':
        return this.doRevive();
      case 'boon':
        return this.doBoonHex();
      case 'hidden':
        return this.doHidden();
    }
  }

  /** The map's song: the land's own, or a rare floor's (2.0). */
  private mapMusic() {
    const run = state.run!;
    const rare = floorSurprise(run).floor;
    if (rare) playMusic('rare', rare);
    else playMusic('map', run.map.biome);
  }

  /** Banners for the run's omen (once a run) and this floor's rare floor and Elder (once a floor). */
  private announceSurprises(then: () => void) {
    const run = state.run!;
    const rs = run.surprises;
    if (!rs) return then();
    const fs = floorSurprise(run);
    const lines: string[] = [];
    if (rs.omen && !rs.omenAnnounced) {
      rs.omenAnnounced = true;
      findSurprise(state.meta, rs.omen);
      lines.push(`Omen: ${SURPRISES[rs.omen].name}\n${SURPRISES[rs.omen].desc}`);
    }
    if (!fs.announced && (fs.floor || fs.elder || fs.hex)) {
      fs.announced = true;
      if (fs.floor) {
        findSurprise(state.meta, fs.floor);
        lines.push(`${SURPRISES[fs.floor].name}!\n${SURPRISES[fs.floor].desc}${fs.floor === 'shattered' && fs.second ? ` (${run.map.biome} and ${fs.second})` : ''}`);
      }
      if (fs.elder) {
        findSurprise(state.meta, 'elder');
        lines.push(`An Elder guardian waits at the top of this floor.\n${SURPRISES.elder.desc}`);
      }
      if (fs.hex) lines.push('Something glitters on a hex ahead (???).');
    }
    if (!lines.length) return then();
    persist();
    sfx.shinyReveal();
    // An omen gets its own ominous song while it's announced; the map's comes back after.
    const omen = lines[0].startsWith('Omen:');
    if (omen) playMusic('omen');
    showMessage(this, 'A rare surprise!', lines.join('\n\n'), () => {
      if (omen) this.mapMusic();
      tip(this, 'surprise', then);
    });
  }

  /** Hatchery (a surprise): the egg hatches once it's seen enough battles (it waits if the party is full). */
  private hatchIfReady(then: () => void) {
    const run = state.run!;
    if (!eggReady(run)) return then();
    const name = SPECIES_BY_ID[run.surprises!.egg!.speciesId]?.names[0] ?? 'a Hexling';
    const hatch = (release?: Creature) => {
      const gone = release ? creatureName(release) : '';
      const c = hatchEgg(run);
      if (!c) return then();
      joinParty(run, c, release);
      dex.creature(c, true);
      sfx.shinyReveal();
      persist();
      showMessage(
        this,
        'The egg hatches!',
        `${release ? `${gone} was released.\n\n` : ''}Out pops ${creatureName(c)} (Lv ${c.level}), with its rare trait${c.trait ? `: ${traitName(c.speciesId, c.trait)}` : ''}. It joins your ${run.team.includes(c) ? 'team' : 'bench'}.`,
        then,
      );
    };
    if (!rosterFull(run)) return hatch();
    const all = allCreatures(run);
    openPicker(this, {
      title: 'The egg is hatching!',
      subtitle: `A ${name} is about to hatch, but your party is full. Release one to make room, or let it wait (it hatches the next time there's room).`,
      options: all.map((c) => ({ creature: c, note: run.team.includes(c) ? 'Team' : 'Bench' })),
      onPick: (k) => hatch(all[k]),
      onCancel: then,
      cancelLabel: 'Not yet',
    });
  }

  /** Hidden hexes (surprises): a wishing well, a cursed altar, a hidden shop, a hatchery or a dojo. */
  private doHidden() {
    const run = state.run!;
    const fs = floorSurprise(run);
    const id = fs.hex ?? 'well';
    if (findSurprise(state.meta, id)) persist();
    sfx.discover();
    if (id === 'hatchery') {
      if (run.surprises?.egg)
        return showMessage(this, 'Hatchery', 'An empty nest. You already carry an egg, warm in your bag.', this.done);
      return openPicker(this, {
        title: 'Hatchery',
        subtitle: `A warm nest, left alone, with one speckled egg in it. Carry it for ${EGG_WINS} won battles and it hatches into a line you haven't caught yet, always with its rare ◆ trait.`,
        options: [
          { label: 'Take the egg', color: 0x2f6b4a },
          { label: 'Leave it', color: 0x3a3450 },
        ],
        onPick: (i) => {
          if (i === 1) return this.done();
          layEgg(run);
          persist();
          showMessage(this, 'Hatchery', `You tuck the egg into your bag. It hatches after ${EGG_WINS} won battles.`, this.done);
        },
      });
    }
    if (id === 'dojo') return this.doDojo();
    if (id === 'fossil') return this.doFossil();
    // A boon gained here: open it as an offer of one (or a mythic offer), then move on.
    const offerAndGo = (mode: 'normal' | 'mythic') => {
      openOffer(run, `hidden${run.floor}:${id}:${mode}`, mode);
      persist();
      openBoonOffer(this, run, this.done);
    };
    if (id === 'well') {
      const toss = (amount: number) => {
        pay(run, amount);
        const r = placeRng(run, `well:${amount}`).next() + (amount >= 60 ? 0.15 : 0);
        if (r < 0.3) return showMessage(this, 'Wishing Well', 'Plink... nothing happens. The coins are gone.', this.done);
        if (r < 0.55) {
          earnCoins(run, amount * 2);
          return showMessage(this, 'Wishing Well', `The well coughs up ◉ ${amount * 2}!`, this.done);
        }
        if (r < 0.92) return showMessage(this, 'Wishing Well', 'Your wish is heard: a boon!', () => offerAndGo('normal'));
        return showMessage(this, 'Wishing Well', 'The water glows gold: a mythic boon!', () => offerAndGo('mythic'));
      };
      return openPicker(this, {
        title: 'Wishing Well',
        subtitle: 'Toss in coins and make a wish. Anything could happen, including nothing. Bigger wishes are luckier.',
        options: [
          { label: 'Toss ◉ 25', disabled: run.coins < 25, color: 0x2f4a6b },
          { label: 'Toss ◉ 60', sub: 'Better odds', disabled: run.coins < 60, color: 0x4a3a7a },
          { label: 'Walk away', color: 0x3a3450 },
        ],
        onPick: (i) => (i === 0 ? toss(25) : i === 1 ? toss(60) : this.done()),
      });
    }
    if (id === 'altar') {
      const list = allCreatures(run);
      return openPicker(this, {
        title: 'Cursed Altar',
        subtitle: 'The altar wants something precious. Give it, and it gives back a mythic boon.',
        options: [
          { label: 'Offer a Hexling', sub: 'It leaves your team for good', disabled: list.length < 2, color: 0x6a2a3a },
          { label: `Offer half your coins (◉ ${Math.floor(run.coins / 2)})`, disabled: run.coins < 20, color: 0x6b5a1c },
          { label: 'Walk away', color: 0x3a3450 },
        ],
        onPick: (i) => {
          if (i === 2) return this.done();
          if (i === 1) {
            run.coins -= Math.floor(run.coins / 2);
            return offerAndGo('mythic');
          }
          openPicker(this, {
            title: 'Offer which Hexling?',
            options: list.map((c) => ({ creature: c })),
            onPick: (k) => {
              const c = list[k];
              unequipHeld(run, c);
              run.team = run.team.filter((x) => x !== c);
              run.bench = run.bench.filter((x) => x !== c);
              fillTeamFromBench(run);
              offerAndGo('mythic');
            },
            onCancel: () => this.doHidden(),
            cancelLabel: 'Back',
          });
        },
      });
    }
    // The hidden shop: three boons for coins.
    const ids = rollOffer(run, `hiddenshop${run.floor}`).filter((b) => BOONS[b].rarity !== 'curse' && !hasBoon(run, b));
    const price = priceFor(run, 120);
    return openPicker(this, {
      title: `Hidden Shop   ◉ ${run.coins}`,
      subtitle: 'A cloaked stranger sells boons, not items.',
      options: [
        ...ids.map((b) => ({ ...boonCardText(b), label: `${BOONS[b].name}   ◉ ${price}`, disabled: run.coins < price, color: BOON_COLOR[BOONS[b].rarity] })),
        { label: 'Leave', color: 0x3a3450 },
      ],
      rowHeight: 86,
      onPick: (i) => {
        if (i >= ids.length) return this.done();
        pay(run, price);
        runBoons(run).offer = { ids: [ids[i]], picks: 1, mode: 'normal', tag: 'hiddenshop' };
        takeBoon(run, ids[i]);
        sfx.boonPick(BOONS[ids[i]].rarity);
        persist();
        showMessage(this, `${BOONS[ids[i]].name}!`, BOONS[ids[i]].desc, this.done);
      },
    });
  }

  /** Fossil Site (a surprise): bring back one of three ancient forms (swap someone out if the party is full). */
  private doFossil() {
    const run = state.run!;
    const forms = fossilChoices(run);
    const full = rosterFull(run);
    openPicker(this, {
      title: 'Fossil Site',
      subtitle: `Three fossils in the rock. Bring one back as an ancient form: its line in amber stone, for good in your Hexlidex.${full ? '\nYour party is full: you\u2019ll pick someone to swap out.' : ''}`,
      options: forms.map((c) => ({ creature: c, note: `Ancient form · Lv ${c.level}` })),
      onPick: (i) => {
        const c = forms[i];
        const take = (release?: Creature) => {
          const gone = release ? creatureName(release) : '';
          if (!joinParty(run, c, release)) return this.done();
          const fresh = noteAncient(state.meta, c.speciesId);
          dex.creature(c, true);
          sfx.shinyReveal();
          persist();
          showMessage(
            this,
            'An ancient form!',
            `${release ? `${gone} was released.\n\n` : ''}${creatureName(c)} shakes off the dust of ages and joins your ${run.team.includes(c) ? 'team' : 'bench'}.${fresh ? '\n\nNew in your Hexlidex: its ancient form.' : ''}`,
            this.done,
          );
        };
        if (!full) return take();
        const all = allCreatures(run);
        openPicker(this, {
          title: `Swap out for ${creatureName(c)}?`,
          subtitle: 'Your party is full. Release one to make room; it leaves for good. Held items go back to your bag.',
          options: all.map((x) => ({ creature: x, note: run.team.includes(x) ? 'Team' : 'Bench' })),
          onPick: (k) => take(all[k]),
          onCancel: () => this.doFossil(),
          cancelLabel: 'Back',
        });
      },
      onCancel: this.done,
      cancelLabel: 'Leave them',
    });
  }

  /** Dojo (a surprise): three trainers in a row, no healing between; win them all for a boon and a Limit Breaker. */
  private doDojo() {
    const run = state.run!;
    const d = run.surprises?.dojo;
    const fight = () => this.scene.start('Battle', { kind: 'elite' });
    if (d?.lost) {
      leaveDojo(run);
      persist();
      return showMessage(this, 'Dojo', 'The Dojo Master bows. "Come back stronger."', this.done);
    }
    if (d && d.wins >= DOJO_ROUNDS) {
      // The prize: a boon, then a Limit Breaker for one Hexling.
      leaveDojo(run);
      openOffer(run, `dojo${run.floor}`);
      persist();
      sfx.victory();
      const limit = (): void =>
        this.buy({ item: 'limit', price: 0, sold: false }, () => limit());
      return showMessage(this, 'Dojo cleared!', 'The Dojo Master bows low. "Take these. You\u2019ve earned them."\n\nA boon, and a Limit Breaker.', () =>
        openBoonOffer(this, run, limit),
      );
    }
    if (d) return showMessage(this, 'Dojo', `Round ${d.wins + 1} of ${DOJO_ROUNDS}. No time to rest: the next challenger steps up.`, fight);
    openPicker(this, {
      title: 'Dojo',
      subtitle: `A hall of polished wood. ${DOJO_ROUNDS} trainers wait, one after another, with no healing between. Beat all ${DOJO_ROUNDS} for a boon and a Limit Breaker. Lose, and the run goes on without them.`,
      options: [
        { label: 'Step onto the mat', color: 0x6a2a3a },
        { label: 'Walk away', color: 0x3a3450 },
      ],
      onPick: (i) => {
        if (i === 1) return this.done();
        enterDojo(run);
        persist();
        fight();
      },
    });
  }

  /** Boon hex: an offer of boons (the same one after a reload). */
  private doBoonHex() {
    const run = state.run!;
    const key = `${run.floor}:${run.currentId}`;
    const rb = runBoons(run);
    // Each Boon hex offers once (a reload brings back the same offer, then moves on).
    if (rb.hexDone === key && !rb.offer) return this.done();
    if (rb.hexDone !== key) {
      rb.hexDone = key;
      openOffer(run, `hex${key}`);
    }
    persist();
    openBoonOffer(this, run, this.done);
  }

  /** Revival hex: bring back one fallen Hexling at 60% of the level it fell at. */
  private doRevive() {
    const run = state.run!;
    const grave = run.log.graveyard ?? [];
    if (!grave.length)
      return showMessage(this, 'Revival', 'A warm glow, but no one to bring back: none of your Hexlings has fallen this run. Lucky you.', this.done);
    const full = rosterFull(run);
    const forms = grave.map((c) => revivedForm(c, run));
    openPicker(this, {
      title: 'Revival',
      subtitle: `Bring back one fallen Hexling at ${Math.round(reviveShare(run) * 100)}% of the level it fell at, fully healed. Once per floor.${full ? '\nYour party is full: you\u2019ll pick someone to swap out.' : ''}`,
      options: forms.map((c, i) => ({ creature: c, note: `Fell at Lv ${grave[i].level} → returns at Lv ${c.level}${full ? ' · swap someone out' : ''}` })),
      onPick: (i) => {
        const back = (release?: Creature) => {
          const name = release ? creatureName(release) : '';
          const c = reviveFallen(run, grave[i].uid, release);
          if (!c) return this.done();
          sfx.levelUp();
          dex.creature(c, true);
          persist();
          showMessage(this, 'Revival', `${release ? `${name} was released.\n\n` : ''}${creatureName(c)} is back, at Lv ${c.level}! It joins your ${run.team.includes(c) ? 'team' : 'bench'}.`, this.done);
        };
        if (!full) return back();
        // Party full: swap someone out (they leave for good) or go back to the list.
        const all = allCreatures(run);
        openPicker(this, {
          title: `Swap out for ${creatureName(forms[i])}?`,
          subtitle: 'Your party is full. Release one to make room; it leaves for good and the revived Hexling takes its spot. Held items go back to your bag.',
          options: all.map((c) => ({ creature: c, note: run.team.includes(c) ? 'Team' : 'Bench' })),
          onPick: (k) => back(all[k]),
          onCancel: () => this.doRevive(),
          cancelLabel: 'Back',
        });
      },
      onCancel: this.done,
      cancelLabel: 'Leave',
    });
  }

  // ------------------------------------------------------------ treasure & events

  private doTreasure() {
    const run = state.run!;
    if (!run.treasure) {
      run.treasure = rollTreasure(run);
      persist();
    }
    const offer = run.treasure;
    const slots: ShopSlot[] = [{ item: offer.item, price: 0, sold: false, held: offer.held }];
    // Treasure Nose sniffed out a third thing.
    if (offer.extra) slots.push({ item: offer.extra.item, price: 0, sold: false, held: offer.extra.held });
    openPicker(this, {
      title: 'Treasure',
      subtitle: offer.extra ? 'Treasure Nose found a third thing! You can only carry one.' : 'The chest holds two things. You can only carry one.',
      options: [
        { label: `${offer.coins} coins`, color: 0x6b5a1c, glyph: 'coin' },
        ...slots.map((slot) => {
          const reason = unusableReason(run, slot);
          return { label: slotName(slot), sub: reason ?? slotDesc(slot), disabled: !!reason, color: 0x4a3a1c, glyph: slotGlyph(slot) };
        }),
      ],
      onPick: (i) => {
        if (i === 0) {
          earnCoins(run, offer.coins);
          trackStat(run, 'treasures');
          return showMessage(this, 'Treasure', `You take ◉ ${offer.coins}.`, this.done);
        }
        trackStat(run, 'treasures');
        this.buy(slots[i - 1], () => this.doTreasure());
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
    // Now and then the researcher is there too, with a hint.
    const hint = hashString(`${run.seed}:${run.currentId}:alder`) % 2 === 0 ? `\n\n${researcherHint(run)}` : '';
    openPicker(this, {
      title: ev.title,
      subtitle: ev.text + hint,
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
    // Boons: Bloom heals everyone to full; Blood Price (a curse) stops rests healing.
    const frac = hasBoon(run, 'bloodprice') ? 0 : run.passive === 'medic' || hasBoon(run, 'bloom') ? 1 : 0.5;
    trackStat(run, 'rests');
    for (const c of allCreatures(run)) {
      if (frac) healFraction(c, frac);
      c.status = undefined;
      restoreUses(c);
    }
    sfx.heal();
    showMessage(
      this,
      'Rest',
      frac
        ? `Your Hexlings recover ${frac * 100}% of their HP, shake off any status conditions and get every move's uses back.`
        : "Blood Price: no healing here. Your Hexlings shake off any status conditions and get every move's uses back.",
      this.done,
    );
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
    for (const o of placeRng(run, 'shrine').shuffle(offers)) {
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
    const { free, pairs } = altarOptions(run);
    const starLine = (c: Creature) => `${c.stars}★ → ${c.stars + 1}★`;
    const empowered = (sac: Creature | null, target: Creature, lv: number) =>
      showMessage(
        this,
        'Prestige!',
        `${sac ? `${creatureName(sac)} was sacrificed.\n` : ''}${creatureName(target)} is now ${'★'.repeat(target.stars)}: +15% to every stat and +5 to its level cap.${releaseNote(target, lv)}`,
        this.done,
      );
    // Ascendant: one sacrifice-free prestige per floor.
    if (free) {
      return this.pickCreature(
        'Prestige Altar',
        'Ascendant: this floor\u2019s prestige is free, no sacrifice needed. Give one Hexling a star: +15% to every stat and +5 to its level cap.',
        allCreatures(run),
        (c) => !canPrestige(c),
        (target) => {
          run.ascendFloor = run.floor;
          const lv = target.level;
          prestigeTracked(run, target);
          empowered(null, target, lv);
        },
        true,
      );
    }
    if (pairs.length === 0) {
      showMessage(
        this,
        'Prestige Altar',
        `The altar stays silent: you have no Hexling to sacrifice.\n\n${ALTAR_RULES}`,
        this.done,
      );
      return;
    }
    // Step 1: who gets the star (and who could pay for it).
    openPicker(this, {
      title: 'Prestige Altar',
      subtitle: ALTAR_RULES,
      options: pairs.map(({ target, fodder }) => ({
        icon: target,
        label: `${creatureName(target)}  ${starLine(target)}`,
        sub: `Sacrifice: ${fodder.map(creatureName).join(', ')}`,
      })),
      cancelLabel: 'Leave the altar',
      onCancel: this.done,
      onPick: (i) => {
        const { target, fodder } = pairs[i];
        // Step 2: who pays.
        this.pickCreature(
          `Sacrifice for ${creatureName(target)}`,
          `The Hexling you pick leaves your team for good. ${creatureName(target)} goes ${starLine(target)}: +15% to every stat and +5 to its level cap.`,
          fodder,
          () => false,
          (sac) => {
            run.bench = run.bench.filter((b) => b !== sac);
            const lv = target.level;
            prestigeTracked(run, target);
            empowered(sac, target, lv);
          },
          true,
          'Leave the altar',
        );
      },
    });
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
    const rerollFree = freeRerollReady(run) && rerollPrice(run, shop) > 0;
    const reroll = rerollFree ? 0 : rerollPrice(run, shop);
    const wagon = !!shop.caravan;
    openPicker(this, {
      title: `${wagon ? 'Travelling caravan' : 'Shop'}   ◉ ${run.coins}`,
      subtitle: wagon
        ? 'A painted wagon rolls up, piled high. "One thing on the house, friend. The rest, you pay for."'
        : `${shopTalk(run)}\nItems take effect right away.`,
      options: [
        ...shop.slots.map((sl) => {
          const reason = sl.sold ? 'Sold' : unusableReason(run, sl);
          const poor = !canAfford(run, sl.price);
          return {
            label: `${label(sl)}   ${sl.price === 0 && wagon ? 'FREE' : `◉ ${sl.price}`}`,
            sub: reason ?? (poor ? `${slotDesc(sl)} · not enough coins` : slotDesc(sl)),
            disabled: sl.sold || !!reason || poor,
            color: 0x4a3a1c,
            glyph: slotGlyph(sl),
          };
        }),
        ...(wagon
          ? []
          : [{ label: `Reroll stock   ◉ ${reroll}`, sub: rerollFree ? 'Free once this floor (Restocker)' : 'New items, same shop', disabled: !canAfford(run, reroll) }]),
      ],
      onPick: (i) => {
        if (i === shop.slots.length && !wagon) {
          // Restocker (Workshop): the first reroll on each floor is free.
          if (rerollFree) useFreeReroll(run);
          else pay(run, reroll);
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
    const finish = (target?: Creature, moveIndex?: number, newMove?: string) => {
      pay(run, slot.price);
      sfx.coin();
      slot.sold = true;
      const result = applyItem(run, slot, target, moveIndex, newMove);
      if (newMove) dex.move(newMove);
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
        if (slot.item === 'relearn') return this.relearnFlow(c, (idx, id) => finish(c, idx, id), back);
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

  /** Move Relearn: pick a move it would naturally know, then the move it forgets (and confirm). */
  private relearnFlow(c: Creature, done: (index: number, id: string) => void, back: () => void) {
    const pool = naturalMoves(c);
    const choose = () =>
      openPicker(this, {
        title: 'Relearn which move?',
        subtitle: 'Any move it would naturally know by now. It replaces one of its current moves.',
        rows: [{ creature: c, text: `${creatureName(c)} · Lv ${c.level}`, big: true }],
        options: pool.map((id) => {
          const d = MOVES[id];
          return { label: d.name, sub: `${d.element} · ${moveSummary(d, 1)} · ${accText(d)} · ${maxUsesText(d)}` };
        }),
        onPick: (j) => replace(pool[j]),
        onCancel: back,
        cancelLabel: 'Back',
      });
    const replace = (id: string) =>
      openPicker(this, {
        title: `Learn ${MOVES[id].name}`,
        subtitle: 'Which move does it forget?',
        rows: [{ creature: c, text: `${creatureName(c)} · Lv ${c.level}`, big: true }],
        options: c.moves.map((m) => {
          const d = moveDef(m);
          return { label: `Forget ${d.name}`, sub: `${d.element} · ${moveSummary(d, m.tier)} · ${accText(d)} · T${m.tier} · ${usesText(m)}` };
        }),
        onPick: (i) => this.confirmForget(c, i, MOVES[id].name, () => done(i, id), () => replace(id)),
        onCancel: choose,
        cancelLabel: 'Back',
      });
    choose();
  }

  private pickCreature(
    title: string,
    subtitle: string,
    list: Creature[],
    disabled: (c: Creature) => boolean,
    onPick: (c: Creature) => void,
    cancellable = false,
    cancelLabel = 'Skip',
  ) {
    openPicker(this, {
      title,
      subtitle,
      options: list.map((c) => ({ creature: c, disabled: disabled(c), note: disabled(c) ? 'Not eligible' : undefined })),
      onPick: (i) => onPick(list[i]),
      onCancel: cancellable ? this.done : undefined,
      cancelLabel,
    });
  }
}
