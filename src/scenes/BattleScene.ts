import Phaser from 'phaser';
import { MOVES, moveSummary } from '../data/moves';
import { BOSSES, trainerName } from '../data/trainers';
import { ELEMENT_COLORS, typeMultiplier, type Element } from '../data/types';
import { damageNumber, ensureFxTextures, faintFx, healFx, playCatch, playEvolution, statusFx } from '../ui/fx';
import { moveImpact, playMove, type Style } from '../ui/movefx';
import { playMusic, sfx } from '../ui/sound';
import { BATTLE_SPEEDS, prefs } from '../ui/prefs';
import { Battle, type BattleEvent, type PlayerAction } from '../logic/battle';
import {
  canEvolve,
  canPrestige,
  creatureName,
  creatureTypes,
  healFraction,
  isAlive,
  moveDef,
  species,
  stats,
  type Creature,
} from '../logic/creature';
import {
  allCreatures,
  battleCoins,
  battleXp,
  buryFallen,
  catchCreature,
  clearFloor,
  grantXp,
  makeEncounter,
  postBattleRecover,
  promoteBench,
  claimGuardian,
  earnCoins,
  evolveTracked,
  prestigeTracked,
  trackStat,
  isUnlockedStarter,
  catchBonus,
  rosterFull,
  type EncounterKind,
  catchLevel,
  type XpResult,
} from '../logic/run';
import { dex, persist, state } from '../state';
import { openPicker, showMessage } from '../ui/picker';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, HpBar, stars, text, typeChip, W } from '../ui/widgets';

interface SidePanel {
  root: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  chips: Phaser.GameObjects.Container;
  bar: HpBar;
}

const ENEMY_POS = { x: 320, y: 200 };
const PLAYER_POS = { x: 120, y: 370 };

export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private kind: EncounterKind = 'battle';
  private enemies: Creature[] = [];
  private enemySprite!: Phaser.GameObjects.Image;
  private playerSprite!: Phaser.GameObjects.Image;
  private enemyPanel!: SidePanel;
  private playerPanel!: SidePanel;
  private pips!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private actions!: Phaser.GameObjects.Container;
  private busy = false;
  /** Tap during playback to speed it up. */
  private fast = false;
  /** Speed and auto-battle toggles, always on screen during the fight. */
  private controls!: Phaser.GameObjects.Container;
  private autoTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('Battle');
  }

  create(data: { kind: EncounterKind }) {
    const run = state.run!;
    this.kind = data.kind;
    this.busy = false;
    const resuming = !!run.activeBattle;
    if (run.activeBattle) {
      this.kind = run.activeBattle.kind;
      this.enemies = run.activeBattle.enemies;
    } else {
      this.enemies = makeEncounter(run, run.map.nodes[run.currentId]);
      run.activeBattle = { kind: this.kind, enemies: this.enemies, settled: false, summary: '' };
      if (this.kind === 'elite') run.activeBattle.trainer = trainerName((xs) => run.rng.pick(xs));
      persist();
    }
    const boss = this.kind === 'boss' ? BOSSES[run.map.biome] : null;
    const trainer = run.activeBattle.trainer ?? 'A trainer';
    this.battle = new Battle(run.team, this.enemies, run.rng, {
      playerDamageMult: run.passive === 'drill' ? 1.1 : 1,
      enemyRandomness: this.kind === 'battle' ? 0.5 : this.kind === 'elite' ? 0.25 : 0.1,
      rule: boss?.rule,
      ruleName: boss?.ruleName,
      // Wild creatures are left at 1 HP at the end so you can choose to catch them.
      spareLast: this.kind === 'battle',
      spared: run.activeBattle.spared,
    });
    this.input.on('pointerdown', () => {
      if (this.busy) this.fast = true;
    });

    background(this, Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[run.map.biome]).darken(78).color);
    this.add.ellipse(ENEMY_POS.x, ENEMY_POS.y + 72, 200, 44, 0x000000, 0.35);
    this.add.ellipse(PLAYER_POS.x, PLAYER_POS.y + 72, 200, 44, 0x000000, 0.35);

    this.enemySprite = this.add.image(ENEMY_POS.x, ENEMY_POS.y, '__DEFAULT').setScale(5);
    this.playerSprite = this.add.image(PLAYER_POS.x, PLAYER_POS.y, '__DEFAULT').setScale(5 * SPRITE_FIT).setFlipX(true);

    this.enemyPanel = this.makePanel(16, 16);
    this.playerPanel = this.makePanel(W - 16 - 270, 446);
    this.pips = text(this, W - 16, 24, '', 16, '#ffc94d').setOrigin(1, 0);
    const title = boss ? boss.name.toUpperCase() : this.kind === 'elite' ? 'TRAINER' : 'WILD';
    text(this, W - 16, 48, title, 14, this.kind === 'battle' ? COLORS.textDim : '#e0524a', { fontStyle: 'bold' }).setOrigin(1, 0);
    if (boss) {
      // The boss's rule stays on screen for the whole fight.
      this.add.rectangle(16, 96, 214, 58, 0x2a0f1a, 0.9).setOrigin(0).setStrokeStyle(2, 0xe0524a, 0.7);
      text(this, 24, 101, `☠ ${boss.ruleName}`, 13, '#ff8a7a', { fontStyle: 'bold' });
      text(this, 24, 119, boss.ruleDesc, 10, COLORS.text, { wordWrap: { width: 200 } });
    } else if (this.kind === 'elite') {
      text(this, 16, 96, trainer, 13, '#ffc94d', { fontStyle: 'bold' });
    }

    this.add.rectangle(12, 530, W - 24, 62, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.msg = text(this, 24, 540, '', 16, COLORS.text, { wordWrap: { width: W - 48 } });
    this.actions = this.add.container(0, 0);
    this.controls = this.add.container(0, 0);
    this.drawControls();

    this.refreshEnemy();
    this.refreshPlayer();
    const intro = resuming
      ? 'The battle resumes!'
      : this.kind === 'battle'
        ? `A wild ${this.enemies.map(creatureName).join(' and a wild ')} appeared!`
        : this.kind === 'elite'
          ? `${trainer} wants to battle!`
          : `${boss!.name}, ${boss!.title}, blocks your way!`;
    this.msg.setText(intro);
    this.showActions();
    ensureFxTextures(this);
    playMusic(boss ? 'boss' : 'battle');
    if (!resuming) this.entrance(this.enemySprite, 'enemy');
    // Entry effects of a boss rule (stat drops, poison...).
    const entry = this.battle.start(resuming);
    const begin = () => {
      if (boss && !resuming) this.bossEntrance();
      if (entry.length) this.play(entry);
      else this.maybeAuto();
    };
    // Resuming after a reload: pick up wherever the battle was left.
    if (resuming) {
      const o = this.battle.outcome();
      if (o === 'win') this.onWin();
      else if (o === 'lose') this.onLose();
      else if (o === 'needSwitch') this.openSwitch(true);
      else begin();
    } else if (boss) {
      openPicker(this, {
        title: `${boss.name}, ${boss.title}`,
        subtitle: `"${boss.quote}"\n\n☠ ${boss.ruleName}\n${boss.ruleDesc}`,
        options: [{ label: 'Fight!', color: 0x8a2c2c }],
        onPick: begin,
      });
    } else begin();
  }

  // ------------------------------------------------------------ panels

  private makePanel(x: number, y: number): SidePanel {
    const root = this.add.container(x, y);
    root.add(this.add.rectangle(0, 0, 270, 74, COLORS.panel, 0.92).setOrigin(0).setStrokeStyle(2, COLORS.stroke));
    const name = text(this, 12, 8, '', 17, COLORS.text, { fontStyle: 'bold' });
    const chips = this.add.container(12, 40);
    const bar = new HpBar(this, 140, 40, 118, 10, true);
    root.add([name, chips, ...bar.objects()]);
    return { root, name, chips, bar };
  }

  private fillPanel(p: SidePanel, c: Creature) {
    p.name.setText(`${creatureName(c)} Lv${c.level} ${stars(c.stars)}`);
    p.chips.removeAll(true);
    const t = creatureTypes(c);
    (t[0] === t[1] ? [t[0]] : t).forEach((el, i) => p.chips.add(typeChip(this, i * 64, 0, el, false)));
    p.bar.set(c.hp, stats(c).hp);
  }

  private refreshEnemy() {
    const e = this.battle.e.c;
    dex.creature(e);
    this.enemySprite.setTexture(ensureCreatureTexture(this, e.speciesId, e.stage)).setAlpha(1).setPosition(ENEMY_POS.x, ENEMY_POS.y);
    this.enemySprite.setScale((this.kind === 'boss' ? 6 : 5) * SPRITE_FIT);
    this.fillPanel(this.enemyPanel, e);
    const alive = this.battle.enemy.filter((x) => isAlive(x.c)).length;
    this.pips.setText('●'.repeat(alive) + '○'.repeat(this.battle.enemy.length - alive));
  }

  private refreshPlayer() {
    const p = this.battle.p.c;
    dex.creature(p, true);
    this.playerSprite.setTexture(ensureCreatureTexture(this, p.speciesId, p.stage)).setAlpha(1).setPosition(PLAYER_POS.x, PLAYER_POS.y);
    this.playerSprite.setScale(5 * SPRITE_FIT);
    this.fillPanel(this.playerPanel, p);
  }

  /** A creature pops in from nothing with a little puff. */
  private entrance(s: Phaser.GameObjects.Image, side: 'player' | 'enemy') {
    const full = s.scale;
    s.setScale(0.1).setAlpha(0.2);
    this.tweens.add({ targets: s, scale: full, alpha: 1, duration: 280, ease: 'Back.easeOut' });
    const c = side === 'player' ? this.battle.p.c : this.battle.e.c;
    faintFx(this, { x: s.x, y: s.y + 30 }, ELEMENT_COLORS[creatureTypes(c)[0]]);
  }

  /** The guardian looms: it grows, the screen shakes, and it roars. */
  private bossEntrance() {
    const s = this.enemySprite;
    const full = s.scale;
    sfx.bossRoar();
    this.cameras.main.shake(500, 0.012);
    this.cameras.main.flash(250, 120, 0, 0);
    this.tweens.add({ targets: s, scale: full * 1.25, yoyo: true, duration: 260, ease: 'Quad.easeOut' });
  }

  private spriteOf(side: 'player' | 'enemy') {
    return side === 'player' ? this.playerSprite : this.enemySprite;
  }

  // ------------------------------------------------------------ input

  private showActions() {
    this.actions.removeAll(true);
    const p = this.battle.p.c;
    const e = this.battle.e.c;
    const bw = (W - 36) / 2;
    p.moves.forEach((m, i) => {
      const d = moveDef(m);
      const mult = typeMultiplier(d.element, creatureTypes(e));
      const hint = d.kind !== 'attack' ? '' : mult > 1.01 ? ' ▲' : mult < 0.99 ? ' ▼' : '';
      const x = 12 + bw / 2 + (i % 2) * (bw + 12);
      const y = 640 + Math.floor(i / 2) * 74;
      const color = Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[d.element]).darken(45).color;
      this.actions.add(
        button(this, x, y, bw, 64, d.name + hint, () => this.act({ kind: 'move', index: i }), {
          color,
          sub: `${moveSummary(d, m.tier)}  ·  ${'✦'.repeat(m.tier)}`,
          fontSize: 17,
        }),
      );
    });
    const canSwap = this.battle.player.some((x, i) => i !== this.battle.pActive && isAlive(x.c));
    this.actions.add(button(this, W / 2, 768, 200, 44, '⇄ Switch', () => this.openSwitch(false), { enabled: canSwap, fontSize: 17 }));
  }

  /** Auto-battle and battle speed, on either side of the Switch button. */
  private drawControls() {
    this.controls.removeAll(true);
    const auto = prefs.autoBattle;
    this.controls.add(
      button(this, 62, 768, 100, 44, auto ? '▶ Auto ON' : '▶ Auto', () => {
        prefs.autoBattle = !prefs.autoBattle;
        this.drawControls();
        if (prefs.autoBattle) this.maybeAuto();
        else this.cancelAuto();
      }, { fontSize: 15, color: auto ? 0x3b6d4a : undefined }),
    );
    const speed = prefs.battleSpeed;
    this.controls.add(
      button(this, W - 62, 768, 100, 44, `⏩ ${speed}×`, () => {
        const i = BATTLE_SPEEDS.indexOf(speed as (typeof BATTLE_SPEEDS)[number]);
        prefs.battleSpeed = BATTLE_SPEEDS[(i + 1) % BATTLE_SPEEDS.length];
        this.drawControls();
        this.setSpeed();
      }, { fontSize: 15, color: speed > 1 ? 0x3a4f7a : undefined }),
    );
  }

  /** With auto-battle on, pick the best-rated move after a short beat. */
  private maybeAuto() {
    if (!prefs.autoBattle || this.busy || this.autoTimer || this.battle.outcome() !== 'ongoing') return;
    this.autoTimer = this.time.delayedCall(450, () => {
      this.autoTimer = null;
      if (!prefs.autoBattle || this.busy || this.battle.outcome() !== 'ongoing') return;
      this.act({ kind: 'move', index: this.battle.bestMove('player') });
    });
  }

  private cancelAuto() {
    this.autoTimer?.remove();
    this.autoTimer = null;
  }

  private openSwitch(forced: boolean) {
    this.cancelAuto();
    const list = this.battle.player;
    openPicker(this, {
      title: forced ? 'Choose your next creature' : 'Switch creature',
      subtitle: forced ? undefined : 'Switching uses your turn.',
      options: list.map((x, i) => ({
        creature: x.c,
        disabled: i === this.battle.pActive || !isAlive(x.c),
        note: i === this.battle.pActive ? 'In battle' : !isAlive(x.c) ? 'Fallen' : undefined,
      })),
      onPick: (i) => {
        if (forced) this.play(this.battle.forcedSwitch(i));
        else this.act({ kind: 'swap', index: i });
      },
      onCancel: forced ? undefined : () => this.maybeAuto(),
    });
  }

  private act(a: PlayerAction) {
    if (this.busy) return;
    this.cancelAuto();
    this.play(this.battle.takeTurn(a));
  }

  // ------------------------------------------------------------ playback

  /** Waits on the scene clock, which runs faster while the player taps to skip. */
  private wait(ms: number) {
    return new Promise<void>((res) => this.time.delayedCall(ms, res));
  }

  private setSpeed() {
    const base = prefs.battleSpeed;
    const k = this.fast ? Math.max(3, base * 2) : base;
    this.time.timeScale = k;
    this.tweens.timeScale = k;
  }

  private async play(events: BattleEvent[]) {
    this.busy = true;
    this.fast = false;
    this.actions.setVisible(false);
    let lastEl: Element = 'Fire';
    let lastStyle: Style = 'element';
    let attackerHome: { x: number; y: number } | undefined;
    // "X used Y!" is shown as the attack starts, so the hit lands right as the effect arrives.
    let shownEarly: BattleEvent | null = null;
    for (let idx = 0; idx < events.length; idx++) {
      const ev = events[idx];
      this.setSpeed();
      switch (ev.kind) {
        case 'text':
          if (ev === shownEarly) break;
          this.msg.setText(ev.text);
          if (ev.text === 'It missed!') sfx.miss();
          await this.wait(620);
          break;
        case 'stat': {
          const s = this.spriteOf(ev.side);
          ev.up ? sfx.statUp() : sfx.statDown();
          statusFx(this, s, lastEl, ev.up);
          const arrow = text(this, s.x, s.y - 60, ev.up ? '▲▲' : '▼▼', 28, ev.up ? '#8fe08a' : '#f08a80', { fontStyle: 'bold' }).setOrigin(0.5);
          s.setTint(ev.up ? 0xaaffaa : 0xff9a9a);
          this.tweens.add({ targets: arrow, y: arrow.y + (ev.up ? -30 : 30), alpha: 0, duration: 500, onComplete: () => arrow.destroy() });
          await this.wait(300);
          s.clearTint();
          break;
        }
        case 'attack': {
          dex.move(ev.moveId);
          const def = MOVES[ev.moveId];
          lastEl = def?.element ?? lastEl;
          const s = this.spriteOf(ev.side);
          const target = this.spriteOf(ev.side === 'player' ? 'enemy' : 'player');
          const next = events[idx + 1];
          if (next?.kind === 'text') {
            this.msg.setText(next.text);
            shownEarly = next;
          }
          attackerHome = { x: ev.side === 'player' ? PLAYER_POS.x : ENEMY_POS.x, y: ev.side === 'player' ? PLAYER_POS.y : ENEMY_POS.y };
          // Each move animates by what its name describes: bites bite, waves crash, roars shake.
          if (def) lastStyle = await playMove(this, def, s, target);
          // Status moves have no hit to follow, so keep their name up long enough to read.
          if (def?.kind !== 'attack') await this.wait(320);
          break;
        }
        case 'damage': {
          const s = this.spriteOf(ev.side);
          const panel = ev.side === 'player' ? this.playerPanel : this.enemyPanel;
          const at = { x: s.x, y: s.y };
          if (ev.mult !== undefined) {
            const big = ev.mult > 1.01;
            const weak = ev.mult < 0.99;
            moveImpact(this, lastStyle, ev.element ?? lastEl, at, big ? 1.7 : weak ? 0.6 : 1, attackerHome);
            sfx.hit(ev.mult);
            if (big) {
              // Hit-stop, flash and a heavy shake sell a super-effective blow.
              this.cameras.main.shake(260, 0.016);
              this.cameras.main.flash(120, 255, 255, 255, true);
              this.tweens.timeScale = 0.05;
              await new Promise<void>((r) => setTimeout(r, this.fast ? 20 : 70 / prefs.battleSpeed));
              this.setSpeed();
            } else if (!weak) this.cameras.main.shake(120, 0.005);
          } else sfx.dot();
          damageNumber(this, at, ev.amount, ev.mult ?? 1);
          s.setTintFill(0xffffff);
          this.tweens.add({ targets: s, x: s.x + 6, yoyo: true, repeat: 2, duration: 40, onComplete: () => s.setX(at.x) });
          this.time.delayedCall(120, () => s.clearTint());
          panel.bar.set(ev.hp, ev.maxHp, true);
          await this.wait(420);
          break;
        }
        case 'heal': {
          const panel = ev.side === 'player' ? this.playerPanel : this.enemyPanel;
          healFx(this, this.spriteOf(ev.side));
          sfx.heal();
          panel.bar.set(ev.hp, ev.maxHp, true);
          await this.wait(300);
          break;
        }
        case 'faint': {
          const s = this.spriteOf(ev.side);
          const c = ev.side === 'player' ? this.battle.player[ev.index].c : this.battle.enemy[ev.index].c;
          sfx.faint();
          s.setTintFill(0xffffff);
          faintFx(this, s, ELEMENT_COLORS[creatureTypes(c)[0]]);
          this.tweens.add({ targets: s, alpha: 0, y: s.y + 40, scaleY: s.scaleY * 0.2, duration: 450, onComplete: () => s.clearTint() });
          await this.wait(520);
          if (ev.side === 'enemy') {
            const alive = this.battle.enemy.filter((x) => isAlive(x.c)).length;
            this.pips.setText('●'.repeat(alive) + '○'.repeat(this.battle.enemy.length - alive));
          }
          break;
        }
        case 'swap':
          this.refreshPlayer();
          this.entrance(this.playerSprite, 'player');
          await this.wait(300);
          break;
        case 'enemySend':
          this.refreshEnemy();
          this.entrance(this.enemySprite, 'enemy');
          await this.wait(300);
          break;
      }
    }
    this.fast = false;
    this.setSpeed();
    this.busy = false;
    this.afterTurn();
  }

  private afterTurn() {
    const ab = state.run!.activeBattle;
    if (ab) {
      ab.fought = [...new Set([...(ab.fought ?? []), ...this.battle.fought])];
      if (this.battle.spared) ab.spared = true;
    }
    persist();
    switch (this.battle.outcome()) {
      case 'ongoing':
        this.msg.setText(`What will ${creatureName(this.battle.p.c)} do?`);
        this.showActions();
        this.actions.setVisible(true);
        this.maybeAuto();
        return;
      case 'needSwitch':
        this.openSwitch(true);
        return;
      case 'win':
        return this.onWin();
      case 'lose':
        return this.onLose();
    }
  }

  // ------------------------------------------------------------ results

  private toMap(banner?: string) {
    state.run!.activeBattle = null;
    this.scene.start('Map', banner ? { banner } : {});
  }

  private xpLines(res: XpResult[]): string {
    if (res.some((r) => r.levels > 0)) this.time.delayedCall(250, () => sfx.levelUp());
    return res.map((r) => `${r.name} +${r.xp} XP${r.levels ? `  ▲ ${r.levels} lv` : ''}`).join('\n');
  }

  private fallenNote(): string {
    const fallen = buryFallen(state.run!);
    return fallen.length ? `\n\nLost forever: ${fallen.join(', ')}` : '';
  }

  private onWin() {
    const run = state.run!;
    this.cancelAuto();
    this.controls.setVisible(false);
    const ab = run.activeBattle!;
    const xp = Math.round(battleXp(this.enemies, this.kind, state.run!.floor) * (this.kind === 'battle' && run.passive === 'naturalist' ? 1.25 : 1));
    const coins = battleCoins(this.enemies, this.kind);
    sfx.victory();
    playMusic(null);
    // Bookkeeping happens once, even if the page reloads before the reward choice.
    if (!ab.settled) {
      run.log.battlesWon += 1;
      trackStat(run, 'battlesWon');
      const fallen = this.fallenNote();
      postBattleRecover(run);
      ab.summary = fallen;
      if (this.kind === 'elite') {
        const stones = run.passive === 'hunter' ? 2 : 1;
        run.evoStones += stones;
        earnCoins(run, coins);
        trackStat(run, 'elites');
        ab.summary = `${ab.trainer ?? 'The trainer'} pays out ◉ ${coins} coins and ${stones === 2 ? '2 Evolution Stones ◆◆' : 'an Evolution Stone ◆'}\n\n${this.xpLines(grantXp(run, xp, ab.fought))}${fallen}`;
      } else if (this.kind === 'boss') {
        run.bossPending = false;
        earnCoins(run, coins);
        ab.summary = `◉ +${coins} coins\n\n${this.xpLines(grantXp(run, xp, ab.fought))}${fallen}`;
      }
      ab.settled = true;
      persist();
    }
    const fallen = ab.summary;

    if (this.kind === 'battle') {
      this.catchChoice(xp, coins, fallen);
      return;
    }

    if (this.kind === 'elite') {
      showMessage(this, 'Trainer defeated!', ab.summary, () => this.toMap());
      return;
    }

    // boss
    const bossDef = BOSSES[run.map.biome];
    showMessage(this, `${bossDef.name} is defeated!`, ab.summary, () => this.bossReward());
  }

  /**
   * Wild battle won: the last creature is left at 1 HP. The move buttons become a choice:
   * catch it (forfeit rewards) or finish it (take XP and coins).
   */
  private catchChoice(xp: number, coins: number, fallen: string) {
    const run = state.run!;
    const wild = this.enemies.find((e) => isAlive(e)) ?? null;
    this.actions.removeAll(true);
    this.actions.setVisible(true);
    this.msg.setText(
      wild ? `The wild ${creatureName(wild)} is barely standing! Catch it, or finish it for the rewards.` : 'Victory!',
    );
    if (wild) {
      // It sways, weakened.
      this.tweens.add({ targets: this.enemySprite, angle: 6, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
      this.enemySprite.setAlpha(0.85);
    }
    const full = rosterFull(run);
    const bonusTag = wild ? { species: ' · ★ first catch!', type: ' · ★ new type bonus!', none: '' }[catchBonus(run, wild.speciesId) ?? 'none'] : '';
    const level = wild ? catchLevel(run, wild) : 1;
    let chosen = false;
    if (wild) {
      this.actions.add(
        button(this, W / 2, 652, W - 24, 72, `◈ Catch ${creatureName(wild)}`, () => {
          if (chosen) return;
          chosen = true;
          this.doCatch(wild, fallen);
        }, {
          color: 0x3a4f7a,
          fontSize: 20,
          sub: full ? 'Your party is full (release one from the Team screen first)' : `Forfeit the rewards · joins at Lv ${level}${bonusTag}`,
          enabled: !full,
        }),
      );
    }
    this.actions.add(
      button(this, W / 2, wild ? 738 : 690, W - 24, 72, wild ? '⚔ Continue' : 'Take rewards', () => {
        if (chosen) return;
        chosen = true;
        this.finishWild(wild, xp, coins, fallen);
      }, { color: 0x3b6d4a, fontSize: 20, sub: `${wild ? 'Finish it · ' : ''}+${xp} XP for the team · +${coins} coins` }),
    );
  }

  private doCatch(wild: Creature, fallen: string) {
    const run = state.run!;
    this.actions.setVisible(false);
    this.tweens.killTweensOf(this.enemySprite);
    this.enemySprite.setVisible(false);
    const wasStarter = isUnlockedStarter(run, wild.speciesId);
    const { c, bonus: kind, newlyClaimed } = catchCreature(run, wild)!;
    const where = run.team.includes(c) ? 'team' : 'bench';
    const bonus =
      kind === 'species'
        ? `\n\n★ First of its kind! New Dex entry, so it arrives prestiged.`
        : kind === 'type'
          ? `\n\n★ Type bonus! It arrives prestiged. ${newlyClaimed.join(' and ')} is now used up for this run.`
          : '';
    const starterNote = wasStarter ? '' : `\n\nNew starter unlocked: ${species(c).names[0]}!`;
    run.activeBattle = null;
    persist();
    this.msg.setText(`You throw a bond crystal at ${creatureName(wild)}!`);
    playCatch(
      this,
      ensureCreatureTexture(this, wild.speciesId, wild.stage),
      5 * SPRITE_FIT,
      { x: PLAYER_POS.x + 30, y: PLAYER_POS.y - 30 },
      ENEMY_POS,
      ELEMENT_COLORS[creatureTypes(wild)[0]],
      kind === 'species' || kind === 'type',
      () => showMessage(this, 'Caught!', `${creatureName(c)} joined your ${where} at Lv ${c.level}.${bonus}${starterNote}${fallen}`, () => this.toMap()),
    );
  }

  private finishWild(wild: Creature | null, xp: number, coins: number, fallen: string) {
    const run = state.run!;
    const ab = run.activeBattle!;
    this.actions.setVisible(false);
    const reward = () => {
      earnCoins(run, coins);
      sfx.coin();
      const lines = this.xpLines(grantXp(run, xp, ab.fought));
      run.activeBattle = null;
      persist();
      showMessage(this, 'Victory!', `◉ +${coins} coins\n\n${lines}${fallen}`, () => this.toMap());
    };
    if (!wild) return reward();
    // Finish it: the final blow and the faint.
    wild.hp = 0;
    const finisher = this.battle.p.c;
    finisher.kos = (finisher.kos ?? 0) + 1;
    const s = this.enemySprite;
    this.tweens.killTweensOf(s);
    s.setAngle(0);
    this.msg.setText(`The wild ${creatureName(wild)} fainted!`);
    this.enemyPanel.bar.set(0, stats(wild).hp, true);
    sfx.hit(1);
    sfx.faint();
    s.setTintFill(0xffffff);
    faintFx(this, s, ELEMENT_COLORS[creatureTypes(wild)[0]]);
    this.tweens.add({ targets: s, alpha: 0, y: s.y + 40, scaleY: s.scaleY * 0.2, duration: 450 });
    this.pips.setText('○'.repeat(this.battle.enemy.length));
    this.time.delayedCall(700, reward);
  }

  private bossReward() {
    const run = state.run!;
    const evolvable = allCreatures(run).filter(canEvolve);
    const full = rosterFull(run);
    openPicker(this, {
      title: 'Choose a boon',
      subtitle: 'The guardian\u2019s power is yours to claim.',
      options: [
        { label: 'Full heal', sub: 'Heal your team and bench to full', color: 0x16614f },
        { label: 'Team prestige', sub: 'Every creature on your main team gains ★', color: 0x7a2a5a },
        { label: 'Evolve one', sub: 'Evolve any single creature now', color: 0x4a2f7a, disabled: evolvable.length === 0 },
        {
          label: 'Claim a guardian',
          sub: full ? 'Your party is full' : 'One of its creatures joins you at Lv 1, already evolved',
          color: 0x2f4a7a,
          disabled: full,
        },
      ],
      onPick: (i) => {
        if (i === 0) {
          for (const c of allCreatures(run)) healFraction(c, 1);
          this.finishFloor('Your creatures are fully healed.');
        } else if (i === 1) {
          run.team.forEach((c) => canPrestige(c) && prestigeTracked(run, c));
          this.finishFloor('Your team glows with prestige!');
        } else if (i === 2) {
          openPicker(this, {
            title: 'Evolve which creature?',
            options: allCreatures(run).map((c) => ({ creature: c, disabled: !canEvolve(c) })),
            onPick: (k) => {
              const c = allCreatures(run)[k];
              const from = creatureName(c);
              const fromKey = ensureCreatureTexture(this, c.speciesId, c.stage);
              evolveTracked(run, c);
              dex.creature(c, true);
              const toKey = ensureCreatureTexture(this, c.speciesId, c.stage);
              playEvolution(this, fromKey, toKey, 5 * SPRITE_FIT, ELEMENT_COLORS[creatureTypes(c)[0]], () =>
                this.finishFloor(`${from} evolved into ${creatureName(c)}!`),
              );
            },
          });
        } else {
          // Preview each guardian as it would join: Lv 1, same form, full HP.
          const top = Math.max(...this.enemies.map((e) => e.stage));
          const guardians = this.enemies.filter((e) => e.stage === top);
          const previews = guardians.map((e) => {
            const p = { ...e, level: 1, hp: 1 };
            p.hp = stats(p).hp;
            return p;
          });
          openPicker(this, {
            title: 'Claim a guardian',
            subtitle: 'It joins at Lv 1 but keeps its evolved form and higher level cap.',
            options: previews.map((p) => ({ creature: p })),
            onPick: (k) => {
              const c = claimGuardian(run, guardians[k])!;
              dex.creature(c, true);
              const where = run.team.includes(c) ? 'team' : 'bench';
              this.finishFloor(`${creatureName(c)} joined your ${where}!`);
            },
          });
        }
      },
    });
  }

  private finishFloor(note: string) {
    const run = state.run!;
    run.activeBattle = null;
    const won = clearFloor(run);
    if (won) {
      this.scene.start('End', { won: true });
      return;
    }
    this.toMap(`${note}\n\nYou climb to the ${run.map.biome} lands.`);
  }

  private onLose() {
    const run = state.run!;
    this.cancelAuto();
    this.controls.setVisible(false);
    const fallen = run.team.filter((c) => !isAlive(c)).map(creatureName);
    const foe = this.battle.e.c;
    const bossDef = this.kind === 'boss' ? BOSSES[run.map.biome] : null;
    run.log.endedBy = {
      label: bossDef ? `${bossDef.name}, ${bossDef.title}` : this.kind === 'elite' ? `${run.activeBattle?.trainer ?? 'A trainer'}'s ${creatureName(foe)}` : `a wild ${creatureName(foe)}`,
      speciesId: foe.speciesId,
      stage: foe.stage,
    };
    run.activeBattle = null;
    playMusic(null);
    sfx.defeat();
    if (!promoteBench(run)) {
      this.scene.start('End', { won: false });
      return;
    }
    if (this.kind === 'boss') run.bossPending = true;
    persist();
    showMessage(
      this,
      'Your team has fallen',
      `Lost forever: ${fallen.join(', ')}\n\nNo rewards. Your bench steps up as your new team.${this.kind === 'boss' ? '\nThe guardian still blocks the way.' : ''}`,
      () => this.toMap(),
    );
  }
}
