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
  prestige,
  resolvePending,
  sharesType,
  stats,
  type Creature,
} from '../logic/creature';
import { NODE_INFO, type MapNode } from '../logic/map';
import { allCreatures, canMoveTo, currentNode, moveTo, FLOORS, registerJoin } from '../logic/run';
import { applyItem, canAfford, eligibleTargets, ITEMS, pay, rerollPrice, rollShop, unusableReason, type ShopSlot } from '../logic/shop';
import { hasSeenForm } from '../logic/dex';
import { dex, persist, state } from '../state';
import { EVENT_BY_ID, leaveEvent, rollEvent, rollTreasure, type EventOption } from '../logic/events';
import { openPicker, showMessage } from '../ui/picker';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, H, HpBar, text, W } from '../ui/widgets';

const TOP_BAR = 64;
const BOTTOM_BAR = 96;

function hexPoints(w: number, h: number): number[] {
  // flat-top hex in a w x h box
  return [w * 0.25, 0, w * 0.75, 0, w, h / 2, w * 0.75, h, w * 0.25, h, 0, h / 2];
}

export class MapScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private minScroll = 0;
  private maxScroll = 0;
  private dragStartY = 0;
  private layerStartY = 0;
  private dragging = false;

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

    // ---- map layer
    this.layer = this.add.container(0, 0);
    const cols = map.cols;
    const hexW = Math.min(112, (W - 30) / ((cols - 1) * 0.75 + 1));
    const hexH = hexW * 0.866;
    const nodes = Object.values(map.nodes);
    const minY = Math.min(...nodes.map((n) => n.y));
    const gridW = (cols - 1) * 0.75 * hexW;
    const pos = (n: MapNode) => ({
      x: W / 2 - gridW / 2 + n.col * 0.75 * hexW,
      y: 40 + (n.y - minY) * (hexH / 2),
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
      const hw = (hexW - 6) * size;
      const hh = (hexH - 5) * size;
      const hex = this.add.polygon(p.x, p.y, hexPoints(hw, hh), info.color).setStrokeStyle(
        isCurrent ? 4 : canGo ? 3 : 2,
        isCurrent ? 0xffc94d : canGo ? 0xffffff : 0x000000,
        isCurrent || canGo ? 1 : 0.5,
      );
      const icon = text(this, p.x, p.y - 8, info.icon, n.kind === 'boss' ? 34 : 26, '#ffffff').setOrigin(0.5);
      const label = text(this, p.x, p.y + hh * 0.26, info.label, 11, '#ffffff').setOrigin(0.5);
      this.layer.add([hex, icon, label]);
      if (!canGo && !isCurrent) {
        hex.setAlpha(visited ? 0.35 : 0.6);
        icon.setAlpha(visited ? 0.35 : 0.75);
        label.setAlpha(visited ? 0.35 : 0.75);
      }
      if (canGo) {
        this.tweens.add({ targets: [hex], scale: 1.07, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
        hex.setInteractive(new Phaser.Geom.Polygon(hexPoints(hw, hh)), Phaser.Geom.Polygon.Contains);
        hex.on('pointerup', () => {
          if (!this.dragging) this.enterNode(n);
        });
      }
    }

    // scrolling
    const mapH = 40 + (map.maxY - minY) * (hexH / 2) + hexH;
    const viewH = H - TOP_BAR - BOTTOM_BAR;
    this.minScroll = Math.min(TOP_BAR, TOP_BAR + viewH - mapH);
    this.maxScroll = TOP_BAR;
    const cur = pos(currentNode(run));
    this.layer.y = Phaser.Math.Clamp(TOP_BAR + viewH * 0.7 - cur.y, this.minScroll, this.maxScroll);
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      this.dragStartY = ptr.y;
      this.layerStartY = this.layer.y;
      this.dragging = false;
    });
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!ptr.isDown) return;
      if (Math.abs(ptr.y - this.dragStartY) > 8) this.dragging = true;
      if (this.dragging) this.layer.y = Phaser.Math.Clamp(this.layerStartY + ptr.y - this.dragStartY, this.minScroll, this.maxScroll);
    });

    this.drawTopBar();
    this.drawBottomBar();

    for (const c of allCreatures(run)) dex.creature(c, true);
    persist();
    const next = () =>
      run.shop ? this.openShop() : run.pendingNode ? this.resumeNode(run.pendingNode) : this.promptPendingMoves();
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
    openPicker(this, {
      title: `${creatureName(c)} wants to learn ${nm.name}`,
      subtitle: `${nm.element} · ${moveSummary(nm, 1)} · ${nm.accuracy}%\nForget a move to make room? (Skill tiers on the forgotten move are lost.)`,
      options: [
        ...c.moves.map((m) => {
          const d = moveDef(m);
          return { label: `Forget ${d.name}`, sub: `${d.element} · ${moveSummary(d, m.tier)} · T${m.tier}` };
        }),
        { label: `Don't learn ${nm.name}`, color: 0x3a3450 },
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
    text(this, 14, 38, `${run.map.biome} lands`, 14, '#' + ELEMENT_COLORS[run.map.biome].toString(16).padStart(6, '0'));
    text(this, 150, 10, `◉ ${run.coins}`, 16, '#ffc94d', { fontStyle: 'bold' });
    text(this, 150, 36, `◆ ${run.evoStones} stone${run.evoStones === 1 ? '' : 's'}`, 13, COLORS.textDim);
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
    const slot: ShopSlot = { item: offer.item, price: 0, sold: false };
    const reason = unusableReason(run, slot);
    openPicker(this, {
      title: 'Treasure',
      subtitle: 'The chest holds two things. You can only carry one.',
      options: [
        { label: `◉ ${offer.coins} coins`, color: 0x6b5a1c },
        { label: ITEMS[offer.item].name, sub: reason ?? ITEMS[offer.item].desc, disabled: !!reason, color: 0x4a3a1c },
      ],
      onPick: (i) => {
        if (i === 0) {
          run.coins += offer.coins;
          return showMessage(this, 'Treasure', `You take ◉ ${offer.coins}.`, this.done);
        }
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
        if (i === opts.length) return showMessage(this, ev.title, leaveEvent(run, ev), this.done);
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
    for (const c of allCreatures(run)) healFraction(c, frac);
    showMessage(this, 'Rest', `Your creatures recover ${frac * 100}% of their HP.`, this.done);
  }

  private doLevelUp() {
    const run = state.run!;
    openPicker(this, {
      title: 'Training Grounds',
      subtitle: 'How do you want to train?',
      options: [
        { label: 'Focus training', sub: 'One creature gains 3 levels' },
        { label: 'Team drills', sub: 'Every creature on your team gains 1 level' },
      ],
      onPick: (i) => {
        if (i === 1) {
          const lines = run.team.map((c) => `${creatureName(c)}: ${addLevels(c, 1) ? `Lv ${c.level}` : 'at level cap'}`);
          showMessage(this, 'Team drills', lines.join('\n'), this.done);
          return;
        }
        this.pickCreature('Focus training', 'Choose a creature (+3 levels)', allCreatures(run), (c) => c.level >= levelCap(c), (c) => {
          const gained = addLevels(c, 3);
          showMessage(this, 'Focus training', `${creatureName(c)} gained ${gained} level${gained === 1 ? '' : 's'}! Now Lv ${c.level}.`, this.done);
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
    // Three offers, never the same move twice.
    const picks: { c: Creature; i: number }[] = [];
    for (const o of run.rng.shuffle(offers)) {
      if (picks.length === 3) break;
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
        };
      }),
      onPick: (k) => {
        const { c, i } = picks[k];
        c.moves[i].tier += 1;
        this.done();
      },
    });
  }

  private doPrestige() {
    const run = state.run!;
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
      'Choose a creature to empower (+15% stats, +3 level cap)',
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
            prestige(target);
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
      if (sl.item !== 'recruit') return ITEMS[sl.item].name;
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
            sub: reason ?? (poor ? `${ITEMS[sl.item].desc} · not enough coins` : ITEMS[sl.item].desc),
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
      slot.sold = true;
      const result = applyItem(run, slot, target, moveIndex);
      if (slot.item === 'recruit') {
        dex.creature(slot.recruit!, true);
        registerJoin(run, slot.recruit!);
      }
      const who = target ? `${creatureName(target)}: ` : '';
      showMessage(this, ITEMS[slot.item].name, who + result, this.done);
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
