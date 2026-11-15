import Phaser from 'phaser';
import { TIER_POWER } from '../data/moves';
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
  battleXp,
  buryFallen,
  catchCreature,
  clearFloor,
  grantXp,
  makeEncounter,
  postBattleRecover,
  promoteBench,
  refillBench,
  rosterFull,
  type EncounterKind,
  type XpResult,
} from '../logic/run';
import { state } from '../state';
import { openPicker, showMessage } from '../ui/picker';
import { ensureCreatureTexture } from '../ui/sprites';
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
    this.enemies = makeEncounter(run, run.map.nodes[run.currentId]);
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
    this.playerSprite = this.add.image(PLAYER_POS.x, PLAYER_POS.y, '__DEFAULT').setScale(5).setFlipX(true);

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
    const intro =
      this.kind === 'battle'
        ? `A wild ${this.enemies.map(creatureName).join(' and a wild ')} appeared!`
        : this.kind === 'elite'
          ? 'An elite trainer challenges you!'
          : 'The floor guardian blocks your way!';
    this.msg.setText(intro);
    this.showActions();
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
    this.enemySprite.setTexture(ensureCreatureTexture(this, e.speciesId, e.stage)).setAlpha(1).setPosition(ENEMY_POS.x, ENEMY_POS.y);
    this.enemySprite.setScale(this.kind === 'boss' ? 6 : 5);
    this.fillPanel(this.enemyPanel, e);
    const alive = this.battle.enemy.filter((x) => isAlive(x.c)).length;
    this.pips.setText('●'.repeat(alive) + '○'.repeat(this.battle.enemy.length - alive));
  }

  private refreshPlayer() {
    const p = this.battle.p.c;
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
      const hint = mult > 1.01 ? ' ▲' : mult < 0.99 ? ' ▼' : '';
      const x = 12 + bw / 2 + (i % 2) * (bw + 12);
      const y = 640 + Math.floor(i / 2) * 74;
      const color = Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[d.element]).darken(45).color;
      this.actions.add(
        button(this, x, y, bw, 64, d.name + hint, () => this.act({ kind: 'move', index: i }), {
          color,
          sub: `${d.element}  ·  Pow ${Math.round(d.power * TIER_POWER[m.tier])}  ·  ${'✦'.repeat(m.tier)}`,
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
        case 'attack': {
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
    run.log.battlesWon += 1;
    const fallen = this.fallenNote();
    postBattleRecover(run);
    const xp = battleXp(this.enemies, this.kind);

    if (this.kind === 'battle') {
      const full = rosterFull(run);
      openPicker(this, {
        title: 'Victory!',
        subtitle: `Take the spoils, or catch a creature and forfeit them.${full ? '\n(Your roster is full: release one to catch.)' : ''}${fallen}`,
        options: [
          { label: 'Take rewards', sub: `+${xp} XP for the team (bench earns a share)`, color: 0x3b6d4a },
          ...this.enemies.map((e) => ({
            label: `Catch ${creatureName(e)}`,
            sub: `Forfeit rewards · get a raw Lv 1 ${state.run!.passive === 'scout' ? '(Lv 5) ' : ''}copy`,
            disabled: full,
            color: 0x3a4f7a,
          })),
        ],
        onPick: (i) => {
          if (i === 0) {
            showMessage(this, 'Rewards', this.xpLines(grantXp(run, xp)), () => this.toMap());
          } else {
            const c = catchCreature(run, this.enemies[i - 1])!;
            const where = run.team.includes(c) ? 'team' : 'bench';
            showMessage(this, 'Caught!', `${creatureName(c)} joined your ${where} at Lv ${c.level}.`, () => this.toMap());
          }
        },
      });
      return;
    }

    if (this.kind === 'elite') {
      run.evoStones += 1;
      const lines = this.xpLines(grantXp(run, xp));
      showMessage(this, 'Elite defeated!', `You found an Evolution Stone ◆\n\n${lines}${fallen}`, () => this.toMap());
      return;
    }

    // boss
    run.bossPending = false;
    const lines = this.xpLines(grantXp(run, xp));
    showMessage(this, 'Guardian defeated!', lines + fallen, () => this.bossReward());
  }

  private bossReward() {
    const run = state.run!;
    const evolvable = allCreatures(run).filter(canEvolve);
    openPicker(this, {
      title: 'Choose a boon',
      subtitle: 'The guardian’s power is yours to claim.',
      options: [
        { label: 'Full heal', sub: 'Heal everyone to full and refill your bench', color: 0x16614f },
        { label: 'Team prestige', sub: 'Every creature on your main team gains ★', color: 0x7a2a5a },
        { label: 'Evolve one', sub: 'Evolve any single creature now', color: 0x4a2f7a, disabled: evolvable.length === 0 },
      ],
      onPick: (i) => {
        if (i === 0) {
          for (const c of allCreatures(run)) healFraction(c, 1);
          const added = refillBench(run);
          this.finishFloor(added.length ? `Bench refilled: ${added.map(creatureName).join(', ')}` : 'Team fully healed.');
        } else if (i === 1) {
          run.team.forEach((c) => canPrestige(c) && prestige(c));
          this.finishFloor('Your team glows with prestige!');
        } else {
          openPicker(this, {
            title: 'Evolve which creature?',
            options: allCreatures(run).map((c) => ({ creature: c, disabled: !canEvolve(c) })),
            onPick: (k) => {
              const c = allCreatures(run)[k];
              const from = creatureName(c);
              evolve(c);
              this.finishFloor(`${from} evolved into ${creatureName(c)}!`);
            },
          });
        }
      },
    });
  }

  private finishFloor(note: string) {
    const run = state.run!;
    const won = clearFloor(run);
    const unlock = run.unlockedThisRun.length ? `\nNew starter unlocked: ${run.unlockedThisRun[run.unlockedThisRun.length - 1]}` : '';
    if (won) {
      this.scene.start('End', { won: true });
      return;
    }
    this.toMap(`${note}${unlock}\n\nYou climb to the ${run.map.biome} lands.`);
  }

  private onLose() {
    const run = state.run!;
    const fallen = run.team.filter((c) => !isAlive(c)).map(creatureName);
    if (!promoteBench(run)) {
      this.scene.start('End', { won: false });
      return;
    }
    if (this.kind === 'boss') run.bossPending = true;
    showMessage(
      this,
      'Your team has fallen',
      `Lost forever: ${fallen.join(', ')}\n\nNo rewards. Your bench steps up as your new team.${this.kind === 'boss' ? '\nThe guardian still blocks the way.' : ''}`,
      () => this.toMap(),
    );
  }
}
