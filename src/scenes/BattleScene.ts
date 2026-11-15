import Phaser from 'phaser';
import { moveSummary } from '../data/moves';
import { ELEMENT_COLORS, typeMultiplier } from '../data/types';
import { Battle, type BattleEvent, type PlayerAction } from '../logic/battle';
import {
  canEvolve,
  canPrestige,
  creatureName,
  creatureTypes,
  evolve,
  healFraction,
  isAlive,
  moveDef,
  prestige,
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
  catchBonus,
  rosterFull,
  type EncounterKind,
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
      persist();
    }
    this.battle = new Battle(run.team, this.enemies, run.rng, {
      playerDamageMult: run.passive === 'drill' ? 1.1 : 1,
      enemyRandomness: this.kind === 'battle' ? 0.5 : this.kind === 'elite' ? 0.25 : 0.1,
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
    const title = this.kind === 'boss' ? 'BOSS' : this.kind === 'elite' ? 'ELITE' : 'WILD';
    text(this, W - 16, 48, title, 14, this.kind === 'battle' ? COLORS.textDim : '#e0524a', { fontStyle: 'bold' }).setOrigin(1, 0);

    this.add.rectangle(12, 530, W - 24, 62, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.msg = text(this, 24, 540, '', 16, COLORS.text, { wordWrap: { width: W - 48 } });
    this.actions = this.add.container(0, 0);

    this.refreshEnemy();
    this.refreshPlayer();
    const intro = resuming
      ? 'The battle resumes!'
      : this.kind === 'battle'
        ? `A wild ${this.enemies.map(creatureName).join(' and a wild ')} appeared!`
        : this.kind === 'elite'
          ? 'An elite trainer challenges you!'
          : 'The floor guardian blocks your way!';
    this.msg.setText(intro);
    this.showActions();
    // Resuming after a reload: pick up wherever the battle was left.
    if (resuming) {
      const o = this.battle.outcome();
      if (o === 'win') this.onWin();
      else if (o === 'lose') this.onLose();
      else if (o === 'needSwitch') this.openSwitch(true);
    }
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
    this.fillPanel(this.playerPanel, p);
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

  private openSwitch(forced: boolean) {
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
      onCancel: forced ? undefined : () => {},
    });
  }

  private act(a: PlayerAction) {
    if (this.busy) return;
    this.play(this.battle.takeTurn(a));
  }

  // ------------------------------------------------------------ playback

  private wait(ms: number) {
    return new Promise<void>((res) => this.time.delayedCall(this.fast ? ms / 4 : ms, res));
  }

  private async play(events: BattleEvent[]) {
    this.busy = true;
    this.fast = false;
    this.actions.setVisible(false);
    for (const ev of events) {
      switch (ev.kind) {
        case 'text':
          this.msg.setText(ev.text);
          await this.wait(620);
          break;
        case 'stat': {
          const s = ev.side === 'player' ? this.playerSprite : this.enemySprite;
          const arrow = text(this, s.x, s.y - 60, ev.up ? '▲▲' : '▼▼', 28, ev.up ? '#8fe08a' : '#f08a80', { fontStyle: 'bold' }).setOrigin(0.5);
          s.setTint(ev.up ? 0xaaffaa : 0xff9a9a);
          this.tweens.add({ targets: arrow, y: arrow.y + (ev.up ? -30 : 30), alpha: 0, duration: 500, onComplete: () => arrow.destroy() });
          await this.wait(300);
          s.clearTint();
          break;
        }
        case 'attack': {
          dex.move(ev.moveId);
          const s = ev.side === 'player' ? this.playerSprite : this.enemySprite;
          const dx = ev.side === 'player' ? 30 : -30;
          this.tweens.add({ targets: s, x: s.x + dx, y: s.y + (ev.side === 'player' ? -12 : 12), yoyo: true, duration: 120 });
          await this.wait(150);
          break;
        }
        case 'damage': {
          const s = ev.side === 'player' ? this.playerSprite : this.enemySprite;
          const panel = ev.side === 'player' ? this.playerPanel : this.enemyPanel;
          s.setTintFill(0xffffff);
          this.tweens.add({ targets: s, x: s.x + 6, yoyo: true, repeat: 2, duration: 40 });
          this.time.delayedCall(120, () => s.clearTint());
          panel.bar.set(ev.hp, ev.maxHp, true);
          await this.wait(380);
          break;
        }
        case 'heal': {
          const panel = ev.side === 'player' ? this.playerPanel : this.enemyPanel;
          panel.bar.set(ev.hp, ev.maxHp, true);
          await this.wait(250);
          break;
        }
        case 'faint': {
          const s = ev.side === 'player' ? this.playerSprite : this.enemySprite;
          this.tweens.add({ targets: s, alpha: 0, y: s.y + 40, duration: 450 });
          await this.wait(500);
          if (ev.side === 'enemy') {
            const alive = this.battle.enemy.filter((x) => isAlive(x.c)).length;
            this.pips.setText('●'.repeat(alive) + '○'.repeat(this.battle.enemy.length - alive));
          }
          break;
        }
        case 'swap':
          this.refreshPlayer();
          await this.wait(250);
          break;
        case 'enemySend':
          this.refreshEnemy();
          await this.wait(250);
          break;
      }
    }
    this.busy = false;
    this.afterTurn();
  }

  private afterTurn() {
    const ab = state.run!.activeBattle;
    if (ab) ab.fought = [...new Set([...(ab.fought ?? []), ...this.battle.fought])];
    persist();
    switch (this.battle.outcome()) {
      case 'ongoing':
        this.msg.setText(`What will ${creatureName(this.battle.p.c)} do?`);
        this.showActions();
        this.actions.setVisible(true);
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
    return res.map((r) => `${r.name} +${r.xp} XP${r.levels ? `  ▲ ${r.levels} lv` : ''}`).join('\n');
  }

  private fallenNote(): string {
    const fallen = buryFallen(state.run!);
    return fallen.length ? `\n\nLost forever: ${fallen.join(', ')}` : '';
  }

  private onWin() {
    const run = state.run!;
    const ab = run.activeBattle!;
    const xp = battleXp(this.enemies, this.kind);
    const coins = battleCoins(this.enemies, this.kind);
    // Bookkeeping happens once, even if the page reloads before the reward choice.
    if (!ab.settled) {
      run.log.battlesWon += 1;
      const fallen = this.fallenNote();
      postBattleRecover(run);
      ab.summary = fallen;
      if (this.kind === 'elite') {
        run.evoStones += 1;
        run.coins += coins;
        ab.summary = `You found an Evolution Stone ◆ and ◉ ${coins} coins\n\n${this.xpLines(grantXp(run, xp, ab.fought))}${fallen}`;
      } else if (this.kind === 'boss') {
        run.bossPending = false;
        run.coins += coins;
        ab.summary = `◉ +${coins} coins\n\n${this.xpLines(grantXp(run, xp, ab.fought))}${fallen}`;
      }
      ab.settled = true;
      persist();
    }
    const fallen = ab.summary;

    if (this.kind === 'battle') {
      const full = rosterFull(run);
      openPicker(this, {
        title: 'Victory!',
        subtitle: `Take the spoils, or catch a creature and forfeit them.${full ? '\n(Your roster is full: release one to catch.)' : ''}${fallen}`,
        options: [
          { label: 'Take rewards', sub: `+${xp} XP for the team · +${coins} coins`, color: 0x3b6d4a },
          ...this.enemies.map((e) => ({
            label: `Catch ${creatureName(e)}`,
            sub: `Forfeit XP and coins · raw Lv ${run.passive === 'scout' ? 5 : 1} copy${{ species: ' · ★ first catch!', type: ' · ★ new type bonus!', none: '' }[catchBonus(run, e.speciesId) ?? 'none']}`,
            disabled: full,
            color: 0x3a4f7a,
          })),
        ],
        onPick: (i) => {
          if (i === 0) {
            run.coins += coins;
            showMessage(this, 'Rewards', `◉ +${coins} coins\n\n${this.xpLines(grantXp(run, xp, ab.fought))}`, () => this.toMap());
          } else {
            const { c, bonus: kind, newlyClaimed } = catchCreature(run, this.enemies[i - 1])!;
            const where = run.team.includes(c) ? 'team' : 'bench';
            const bonus =
              kind === 'species'
                ? `\n\n★ First of its kind! New Dex entry, so it arrives prestiged.`
                : kind === 'type'
                  ? `\n\n★ Type bonus! It arrives prestiged. ${newlyClaimed.join(' and ')} is now used up for this run.`
                  : '';
            showMessage(this, 'Caught!', `${creatureName(c)} joined your ${where} at Lv ${c.level}.${bonus}`, () => this.toMap());
          }
        },
      });
      return;
    }

    if (this.kind === 'elite') {
      showMessage(this, 'Elite defeated!', ab.summary, () => this.toMap());
      return;
    }

    // boss
    showMessage(this, 'Guardian defeated!', ab.summary, () => this.bossReward());
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
          run.team.forEach((c) => canPrestige(c) && prestige(c));
          this.finishFloor('Your team glows with prestige!');
        } else if (i === 2) {
          openPicker(this, {
            title: 'Evolve which creature?',
            options: allCreatures(run).map((c) => ({ creature: c, disabled: !canEvolve(c) })),
            onPick: (k) => {
              const c = allCreatures(run)[k];
              const from = creatureName(c);
              evolve(c);
              dex.creature(c, true);
              this.finishFloor(`${from} evolved into ${creatureName(c)}!`);
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
    const unlock = run.unlockedThisRun.length ? `\nUnlocked: ${run.unlockedThisRun.join(", ")}` : '';
    if (won) {
      this.scene.start('End', { won: true });
      return;
    }
    this.toMap(`${note}${unlock}\n\nYou climb to the ${run.map.biome} lands.`);
  }

  private onLose() {
    const run = state.run!;
    const fallen = run.team.filter((c) => !isAlive(c)).map(creatureName);
    run.activeBattle = null;
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
