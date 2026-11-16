import { BALANCE } from '../data/balance';
import Phaser from 'phaser';
import { MAX_TIER, MOVES, moveSummary, tierUpgradeText } from '../data/moves';
import { ELEMENT_COLORS } from '../data/types';
import {
  addLevels,
  canPrestige,
  creatureName,
  healFraction,
  levelCap,
  moveDef,
  recommendForget,
  resolvePending,
  sharesType,
  stats,
  type Creature,
} from '../logic/creature';
import { NODE_INFO, stepsToBoss, type MapNode } from '../logic/map';
import { BOSSES } from '../data/trainers';
import { allCreatures, canMoveTo, currentNode, highestLevel, moveTo, FLOORS, PASSIVES, earnCoins, prestigeTracked, registerJoin, trackStat } from '../logic/run';
import { ACHIEVEMENTS } from '../logic/achievements';
import { applyItem, canAfford, eligibleTargets, ITEMS, pay, rerollPrice, rollShop, slotDesc, slotName, unusableReason, type ShopSlot } from '../logic/shop';
import { hasSeenForm } from '../logic/dex';
import { dex, persist, state } from '../state';
import { EVENT_BY_ID, leaveEvent, rollEvent, rollTreasure, type EventOption } from '../logic/events';
import { openPicker, showMessage } from '../ui/picker';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { playMusic, sfx } from '../ui/sound';
import { Scroller } from '../ui/scroll';
import { background, button, COLORS, H, HpBar, muteButton, text, W } from '../ui/widgets';

const TOP_BAR = 82;
const BOTTOM_BAR = 96;

function hexPoints(w: number, h: number, pointy: boolean): number[] {
  // pointy-top (rows layout) or flat-top (older saved maps) hex in a w x h box
  if (pointy) return [w / 2, 0, w, h * 0.25, w, h * 0.75, w / 2, h, 0, h * 0.75, 0, h * 0.25];
  return [w * 0.25, 0, w * 0.75, 0, w, h / 2, w * 0.75, h, w * 0.25, h, 0, h / 2];
}

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
    background(this, Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[map.biome]).darken(82).color);
    playMusic('map');

    // ---- map layer
    this.layer = this.add.container(0, 0);
    const cols = map.cols;
    const pointy = map.layout === 'rows';
    // Pointy-top: half-hex columns, one row per step. Flat-top: the older half-row lattice.
    const hexW = pointy ? Math.min(90, (W - 24) / ((cols - 1) / 2 + 1)) : Math.min(112, (W - 30) / ((cols - 1) * 0.75 + 1));
    const hexH = pointy ? hexW * 1.1547 : hexW * 0.866;
    const colStep = pointy ? hexW / 2 : hexW * 0.75;
    const rowStep = pointy ? hexH * 0.75 : hexH / 2;
    const nodes = Object.values(map.nodes);
    const minY = Math.min(...nodes.map((n) => n.y));
    const gridW = (cols - 1) * colStep;
    const pos = (n: MapNode) => ({
      x: W / 2 - gridW / 2 + n.col * colStep,
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
      const icon = text(this, p.x, p.y - (pointy ? 6 : 8), info.icon, iconSize, '#ffffff').setOrigin(0.5);
      const label = text(this, p.x, p.y + hh * (pointy ? 0.2 : 0.26), n.kind === 'boss' ? BOSSES[map.biome].name : info.label, pointy && hexW < 64 ? 10 : 11, '#ffffff').setOrigin(0.5);
      this.layer.add([hex, icon, label]);
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

    // scrolling
    const mapH = 50 + (map.maxY - minY) * rowStep + hexH;
    const viewH = H - TOP_BAR - BOTTOM_BAR;
    this.minScroll = Math.min(TOP_BAR, TOP_BAR + viewH - mapH);
    this.maxScroll = TOP_BAR;
    const cur = pos(currentNode(run));
    this.layer.y = Phaser.Math.Clamp(TOP_BAR + viewH * 0.7 - cur.y, this.minScroll, this.maxScroll);
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
    const after = () =>
      run.shop ? this.openShop() : run.pendingNode ? this.resumeNode(run.pendingNode) : this.promptPendingMoves();
    // Announce any achievements earned since the last time the map was shown.
    const next = () => {
      const meta = state.meta;
      const ids = meta.newAchievements.splice(0);
      if (!ids.length) return after();
      persist();
      const lines = ids.map((id) => {
        const a = ACHIEVEMENTS.find((x) => x.id === id)!;
        return `${a.name}: ${a.desc}\nUnlocked passive: ${PASSIVES[a.passive].name}`;
      });
      showMessage(this, 'Achievement unlocked!', lines.join('\n\n') + '\n\nEquip passives from the title screen.', after);
    };
    if (data.banner) showMessage(this, `Floor ${run.floor + 1}`, data.banner, next);
    else next();
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
      subtitle: `${nm.element} · ${moveSummary(nm, 1)} · ${nm.accuracy}%\nForget a move to make room? (Skill tiers on the forgotten move are lost.)`,
      rows: [{ creature: c, text: `${creatureName(c)} · Lv ${c.level}`, big: true }],
      options: [
        ...c.moves.map((m, i) => {
          const d = moveDef(m);
          return { label: `Forget ${d.name}`, sub: `${d.element} · ${moveSummary(d, m.tier)} · T${m.tier}`, badge: rec === i ? tag : undefined };
        }),
        { label: `Don't learn ${nm.name}`, color: 0x3a3450, badge: rec === null ? tag : undefined },
      ],
      onPick: (i) => {
        resolvePending(c, id, i < c.moves.length ? i : null);
        dex.move(id);
        this.scene.restart();
      },
    });
  }

  private drawTopBar() {
    const run = state.run!;
    this.add.rectangle(0, 0, W, TOP_BAR, 0x0b0912, 0.92).setOrigin(0);
    text(this, 14, 10, `Floor ${run.floor + 1} / ${FLOORS}`, 20, '#ffc94d', { fontStyle: 'bold' });
    text(this, 14, 38, `${run.map.biome} lands${run.heat ? `  🔥${run.heat}` : ''}${run.daily ? '  📅' : ''}`, 14, '#' + ELEMENT_COLORS[run.map.biome].toString(16).padStart(6, '0'));
    text(this, 150, 10, `◉ ${run.coins}`, 16, '#ffc94d', { fontStyle: 'bold' });
    text(this, 150, 36, `◆ ${run.evoStones} stone${run.evoStones === 1 ? '' : 's'}`, 13, COLORS.textDim);
    if (run.map.layout === 'rows' && !run.bossPending) {
      const steps = stepsToBoss(run.map, run.currentId);
      text(this, 14, 60, steps === 1 ? 'Boss is next' : `☠ Boss in ${steps} steps`, 12, '#c9a3dd');
    }
    muteButton(this, W - 192, TOP_BAR / 2, 36);
    button(this, W - 134, TOP_BAR / 2, 70, 44, 'Dex', () => this.scene.start('Dex', { from: 'Map' }), { fontSize: 16 });
    button(this, W - 50, TOP_BAR / 2, 84, 44, 'Team', () => this.scene.start('Team'), { fontSize: 17 });
  }

  private drawBottomBar() {
    const run = state.run!;
    const y0 = H - BOTTOM_BAR;
    this.add.rectangle(0, y0, W, BOTTOM_BAR, 0x0b0912, 0.92).setOrigin(0);
    const slotW = W / 4;
    run.team.forEach((c, i) => {
      const x = slotW * i + slotW / 2;
      const img = this.add.image(x, y0 + 36, ensureCreatureTexture(this, c.speciesId, c.stage)).setScale(1.6 * SPRITE_FIT);
      img.setInteractive({ useHandCursor: true }).on('pointerup', () => this.scene.start('Team'));
      text(this, x, y0 + 64, `Lv ${c.level}`, 12, COLORS.textDim).setOrigin(0.5);
      new HpBar(this, x - 36, y0 + 84, 72, 7, false).set(c.hp, stats(c).hp);
    });
    if (run.bench.length) text(this, W - 6, y0 + 4, `Bench: ${run.bench.length}`, 11, COLORS.textDim).setOrigin(1, 0);
  }

  // ------------------------------------------------------------ nodes

  private enterNode(n: MapNode) {
    const run = state.run!;
    if (run.bossPending) {
      this.scene.start('Battle', { kind: 'boss' });
      return;
    }
    if (!canMoveTo(run, n.id)) return;
    moveTo(run, n.id);
    if (['levelup', 'skill', 'prestige', 'treasure', 'event'].includes(n.kind)) {
      // Remember the unresolved choice so a reload offers it again.
      run.pendingNode = n.kind;
      persist();
      return this.resumeNode(n.kind);
    }
    switch (n.kind) {
      case 'battle':
      case 'elite':
      case 'boss':
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
        this.scene.restart();
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
        { label: `◉ ${offer.coins} coins`, color: 0x6b5a1c },
        { label: slotName(slot), sub: reason ?? slotDesc(slot), disabled: !!reason, color: 0x4a3a1c },
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
          const blocked = o.blocked?.(run) ?? (o.target && !allCreatures(run).some((c) => o.eligible?.(run, c) ?? true) ? 'No creature can do this' : null);
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
    this.scene.restart();
  };

  private doHeal() {
    const run = state.run!;
    const frac = run.passive === 'medic' ? 1 : 0.5;
    trackStat(run, 'rests');
    for (const c of allCreatures(run)) healFraction(c, frac);
    sfx.heal();
    showMessage(this, 'Rest', `Your creatures recover ${frac * 100}% of their HP.`, this.done);
  }

  private doLevelUp() {
    const run = state.run!;
    const boost = run.passive === 'trainer' ? 1.5 : 1;
    const focus = Math.round(BALANCE.levelUpFocus[run.floor] * boost);
    const drill = Math.round(BALANCE.levelUpTeam[run.floor] * boost);
    const gap = BALANCE.levelUpCatchUpGap;
    const top = highestLevel(run);
    const behind = allCreatures(run).filter((c) => c.level < top - gap && c.level < levelCap(c));
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
        { label: 'Focus training', sub: `One creature gains ${focus} levels` },
        { label: 'Team drills', sub: `Every creature, bench included, gains ${drill} levels` },
        {
          label: 'Catch-up camp',
          sub: behind.length
            ? `${behind.length} creature${behind.length === 1 ? ' rises' : 's rise'} to within ${gap} levels of your strongest (Lv ${top})`
            : `Everyone is already within ${gap} levels of your strongest`,
          disabled: behind.length === 0,
        },
      ],
      onPick: (i) => {
        trackStat(run, 'levelups');
        if (i !== 0) sfx.levelUp();
        if (i === 1) {
          const rows = allCreatures(run).map((c) => ({ c, before: c.level }));
          for (const { c } of rows) addLevels(c, drill);
          return report('Team drills', rows);
        }
        if (i === 2) {
          const rows = behind.map((c) => ({ c, before: c.level }));
          for (const { c } of rows) addLevels(c, top - gap - c.level);
          return report('Catch-up camp', rows);
        }
        this.pickCreature('Focus training', `Choose a creature (+${focus} levels)`, allCreatures(run), (c) => c.level >= levelCap(c), (c) => {
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
          sub: tierUpgradeText(d, m.tier + 1),
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
    if (run.passive === 'ascendant') {
      return this.pickCreature(
        'Prestige Altar',
        'Ascendant: choose a creature to empower, no sacrifice needed (+15% stats, +5 level cap)',
        allCreatures(run),
        (c) => !canPrestige(c),
        (target) => {
          prestigeTracked(run, target);
          showMessage(this, 'Prestige!', `${creatureName(target)} is now ${'★'.repeat(target.stars)}`, this.done);
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
        'Prestige requires sacrificing a bench creature that shares a type with the one you empower.\n\nYou have no valid pair. The altar stays silent.',
        this.done,
      );
      return;
    }
    this.pickCreature(
      'Prestige Altar',
      'Choose a creature to empower (+15% stats, +5 level cap)',
      allCreatures(run),
      (c) => !targets.includes(c),
      (target) => {
        const fodder = run.bench.filter((b) => b !== target && sharesType(b, target));
        this.pickCreature(
          'Choose a sacrifice',
          `This bench creature will be gone forever to empower ${creatureName(target)}.`,
          fodder,
          () => false,
          (sac) => {
            run.bench = run.bench.filter((b) => b !== sac);
            prestigeTracked(run, target);
            showMessage(this, 'Prestige!', `${creatureName(sac)} was sacrificed.\n${creatureName(target)} is now ${'★'.repeat(target.stars)}`, this.done);
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
    const shop = run.shop!;
    const label = (sl: ShopSlot) => {
      if (sl.item !== 'recruit') return slotName(sl);
      const c = sl.recruit!;
      const name = hasSeenForm(state.meta.dex, c.speciesId, c.stage) ? creatureName(c) : 'Mystery creature';
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
          };
        }),
        { label: `Reroll stock   ◉ ${reroll}`, sub: 'New items, same shop', disabled: !canAfford(run, reroll) },
      ],
      onPick: (i) => {
        if (i === shop.slots.length) {
          pay(run, reroll);
          run.shop = rollShop(run, shop.rerolls + 1, shop.guaranteed);
          return this.scene.restart();
        }
        this.buy(shop.slots[i]);
      },
      cancelLabel: 'Leave shop',
      onCancel: () => {
        run.shop = null;
        this.scene.restart();
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
      subtitle: `${def.desc}. Choose a creature.`,
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
            return { label: `${d.name}  T${m.tier} → T${m.tier + 1}`, sub: tierUpgradeText(d, m.tier + 1) };
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
