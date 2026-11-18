import { titleBadge } from '../ui/titleBadge';
import { addOnlineWin} from '../logic/titles';
import { titleNews } from '../logic/cosmetics';
import { tip, tipDone } from '../ui/tips';
import { trainerCutIn } from '../ui/cutin';
import { bossRuleCard, RULE_TAGS } from '../ui/bossCard';
import { shinyAttackStart, shinyAura, shinyImpact, shinyReveal, type ShinyAura } from '../ui/shiny';
import { openSettings } from '../ui/settings';
import { openElementChart } from '../ui/elementChart';
import Phaser from 'phaser';
import { bossLook, lookForName, myLook, myName, type TrainerLook } from '../data/trainerLook';
import { battleBackdrop, battlePad, onField, pickStage } from '../ui/backdrops';
import { ensureTrainerTexture, TRAINER_W, trainerSpan } from '../ui/trainerSprite';
import { trainerFlare, trainerFx } from '../ui/trainerFx';
import { calm } from '../ui/motion';
import { accText, maxUses, MOVES, moveSummary, TEAM_FX, type TeamFxId } from '../data/moves';
import { BOSSES, guardianRules, trainerName } from '../data/trainers';
import { BALANCE } from '../data/balance';
import { cry } from '../ui/cries';
import { emergeFrom, recallToHex, releaseFromHex } from '../ui/entrance';
import { SYNERGY_LABEL, synergyMults, teamSynergy } from '../logic/synergy';
import { ensureIcon, icon } from '../ui/icons';
import { STATUS, type StatusId } from '../data/status';
import { HELD, heldName } from '../data/held';
import { ELEMENT_COLORS, typeMultiplier, type Element } from '../data/types';
import { damageNumber, ensureFxTextures, faintFx, healFx, playCatch, playEvolution, statusFx } from '../ui/fx';
import { moveImpact, playMove, type Style } from '../ui/movefx';
import { playMusic, sfx } from '../ui/sound';
import { BATTLE_SPEEDS, prefs } from '../ui/prefs';
import { Battle, stageMult, type BattleEvent, type PlayerAction } from '../logic/battle';
import { openPanel } from '../ui/panel';
import { Rng } from '../logic/rng';
import type { DuelController, Next } from '../net/duel';
import { session } from '../net/session';
import { afterSeriesGame, duel, endRace, leaveDuel, recordSeriesGame, sendHello } from '../net/runtime';
import {
  canEvolve,
  getFloorCeiling,
  setFloorCeiling,
  fallbackMove,
  hasUses,
  outOfMoves,
  usesLeft,
  evolveLevel,
  readyToEvolve,
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
  fillTeamFromBench,
  catchCreature,
  clearFloor,
  grantXp,
  makeEncounter,
  postBattleRecover,
  promoteBench,
  claimGuardian,
  GUARDIAN_BONUS_LEVELS,
  guardianLevel,
  rollHeld,
  stash,
  potionHeal,
  notePotion,
  needsPotion,
  earnCoins,
  evolveTracked,
  prestigeTracked,
  releaseNote,
  trackStat,
  isUnlockedStarter,
  catchBonus,
  catchStars,
  rosterFull,
  type EncounterKind,
  catchLevel,
  type XpResult,
  noteShiny,
  GLASS_MULT,
  saveMeta,
} from '../logic/run';
import { dex, persist, state } from '../state';
import { openPicker, showMessage } from '../ui/picker';
import { openGameMenu } from '../ui/gameMenu';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, HpBar, stars, text, typeChip, LANDSCAPE, W, H, OX, OY, FW, FH } from '../ui/widgets';

interface SidePanel {
  root: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  chips: Phaser.GameObjects.Container;
  bar: HpBar;
  /** Status tag (BRN, PSN...) at the top right. */
  status: Phaser.GameObjects.Container;
  /** Held item icon, just after the name. */
  held: Phaser.GameObjects.Image;
  /** The panel's frame (gold for a shiny) and the SHINY tab on its bottom edge. */
  frame: Phaser.GameObjects.Rectangle;
  shiny: Phaser.GameObjects.Container;
}

/**
 * A battle outside a run (the Lv 50 Arena, and later multiplayer): both teams are given, nothing is
 * saved or rewarded, and `onEnd` decides what happens next.
 */
export interface BattleMatch {
  /** The battle stage variant (picked on first draw, kept when the screen restarts). */
  stage?: number;
  team: Creature[];
  enemies: Creature[];
  seed: number;
  /** Shown top-right, e.g. "ARENA". */
  title: string;
  /** Opponent's name, shown under the title and in the intro. */
  opponent: string;
  /** Chance the opponent picks a random move (lower = smarter). */
  randomness: number;
  background: number;
  onEnd: (won: boolean) => void;
  /** A live duel against another phone: the controller supplies the battle and resolves turns. */
  duel?: DuelController;
  /** Duel resumed after a dropped connection: what to do first. */
  initialNext?: Next;
  /** Computer opponents that switch and use potions (see Battle's enemyTactics). */
  tactics?: { potions: number };
  /** How the opponent's trainer looks (online: theirs; otherwise made from their name). */
  opponentLook?: TrainerLook;
  /** Their trainer title (online), shown in the cut-in. */
  opponentTitle?: string;
}

/** Where everything goes on the battle screen: upright (450x800) or wide (800x450). */
const TALL = {
  enemy: { x: 320, y: 200 },
  player: { x: 120, y: 370 },
  enemyPanel: { x: 16, y: 16 },
  playerPanel: { x: 450 - 16 - 270, y: 446 },
  /** Right edge for the pips and the battle title. */
  titleRight: 434,
  pipsY: 24,
  titleY: 48,
  menu: { x: 414, y: 116 },
  msg: { x: 12, y: 530, w: 426, h: 62 },
  moves: { x0: 12, y0: 640, bw: 207, gap: 12, rowH: 74, h: 64 },
  fallback: { x: 225, y: 640, w: 426, noteY: 690 },
  switchBtn: { x: 169, y: 768, w: 106 },
  potionBtn: { x: 281, y: 768, w: 106 },
  autoBtn: { x: 62, y: 768, w: 100 },
  speedBtn: { x: 388, y: 768, w: 100 },
  enemyFx: { x: 16, y: 118 },
  playerFx: { x: 434, y: 424 },
  playerTrainer: { x: 38, y: 440 },
  enemyTrainer: { x: 404, y: 212 },
  waiting: { x: 225, y: 700 },
  catchBtn: { x: 225, y: 652, w: 426, h: 72 },
  finishY: { wild: 738, other: 690 },
  /** Where the environment shows (the rest is shaded under the controls). */
  field: { w: 450, h: 520 },
};
/** Sideways: the field on the left, the message, moves and controls in a column on the right. */
const WIDE: typeof TALL = {
  enemy: { x: 390, y: 150 },
  player: { x: 165, y: 300 },
  enemyPanel: { x: 16, y: 12 },
  playerPanel: { x: 250, y: 362 },
  titleRight: 518,
  pipsY: 12,
  titleY: 34,
  menu: { x: 764, y: 28 },
  msg: { x: 532, y: 54, w: 256, h: 88 },
  moves: { x0: 532, y0: 188, bw: 124, gap: 8, rowH: 80, h: 72 },
  fallback: { x: 660, y: 188, w: 256, noteY: 230 },
  switchBtn: { x: 594, y: 345, w: 124 },
  potionBtn: { x: 726, y: 345, w: 124 },
  autoBtn: { x: 594, y: 403, w: 124 },
  speedBtn: { x: 726, y: 403, w: 124 },
  enemyFx: { x: 16, y: 190 },
  playerFx: { x: 518, y: 340 },
  playerTrainer: { x: 50, y: 352 },
  enemyTrainer: { x: 488, y: 160 },
  waiting: { x: 660, y: 270 },
  catchBtn: { x: 660, y: 210, w: 256, h: 70 },
  finishY: { wild: 290, other: 210 },
  field: { w: 524, h: 450 },
};
let L = TALL;
let ENEMY_POS = L.enemy;
let PLAYER_POS = L.player;
/** Pick the layout for the board in use (call right after `background`). */
function useLayout() {
  L = LANDSCAPE ? WIDE : TALL;
  ENEMY_POS = L.enemy;
  PLAYER_POS = L.player;
}

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
  /** Set for battles outside a run (see BattleMatch). */
  private match: BattleMatch | null = null;

  constructor() {
    super('Battle');
  }

  create(data: { kind: EncounterKind; match?: BattleMatch }) {
    this.statsOpen = false;
    this.panelPress = null;
    this.match = data.match ?? null;
    if (this.match) return this.createMatch(this.match);
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
    // Its own rule, plus extra ones at Heat 4+ (the same ones every time this floor is loaded).
    const rules = boss ? guardianRules(boss, run.heat ?? 0, run.seed, run.floor) : [];
    const trainer = run.activeBattle.trainer ?? 'A trainer';
    this.battle = new Battle(run.team, this.enemies, run.rng, {
      playerDamageMult: (run.passive === 'drill' ? 1.1 : 1) * (run.twist === 'glass' ? GLASS_MULT : 1),
      enemyDamageMult: run.twist === 'glass' ? GLASS_MULT : 1,
      enemyRandomness: BALANCE.enemyRandomness[this.kind],
      rules: rules.map((r) => ({ rule: r.rule, name: r.name })),
      // Wild creatures are left at 1 HP at the end so you can choose to catch them.
      spareLast: this.kind === 'battle',
      spared: run.activeBattle.spared,
      synergy: synergyMults(run.team, run.passive === 'harmonist' ? 2 : 1),
      // Guardians' themed teams get synergy too.
      enemySynergy: boss ? synergyMults(this.enemies) : undefined,
      playerStatusMult: run.passive === 'afflicter' ? 2 : 1,
      playerStatusImmune: run.passive === 'tempered' ? ['burn', 'poison'] : [],
      reserve: run.bench,
      // Trainers and guardians switch and use potions (guardians carry more).
      enemyTactics:
        this.kind === 'battle'
          ? undefined
          : { potions: this.kind === 'boss' ? BALANCE.bossPotions : BALANCE.trainerPotions, name: boss ? boss.name : (run.activeBattle.trainer ?? 'The trainer') },
    });
    this.input.on('pointerdown', () => {
      if (this.busy) this.fast = true;
    });

    background(this, Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[run.map.biome]).darken(78).color);
    useLayout();
    // The stage is picked once per battle and saved, so resuming or rotating keeps it.
    run.activeBattle!.stage ??= pickStage(run.map.biome);
    this.drawField(run.map.biome, run.activeBattle!.stage);
    this.drawTrainers(boss ? bossLook(boss.element) : this.kind === 'elite' ? lookForName(trainer) : null, boss ? boss.name : this.kind === 'elite' ? trainer : null);

    this.enemySprite = this.add.image(ENEMY_POS.x, ENEMY_POS.y, '__DEFAULT').setScale(5);
    this.playerSprite = this.add.image(PLAYER_POS.x, PLAYER_POS.y, '__DEFAULT').setScale(5 * SPRITE_FIT).setFlipX(true);
    this.trainerInFront();

    this.enemyPanel = this.makePanel(L.enemyPanel.x, L.enemyPanel.y, 'enemy');
    this.playerPanel = this.makePanel(L.playerPanel.x, L.playerPanel.y, 'player');
    this.pips = onField(text(this, L.titleRight, L.pipsY, '', 16, '#ffc94d').setOrigin(1, 0));
    const title = boss ? boss.name.toUpperCase() : this.kind === 'elite' ? 'TRAINER' : 'WILD';
    onField(text(this, L.titleRight, L.titleY, title, 14, this.kind === 'battle' ? COLORS.text : '#ff6a5a', { fontStyle: 'bold' }).setOrigin(1, 0));
    if (boss) {
      // The boss's rule stays on screen for the whole fight.
      // The boss's rules stay on screen for the whole fight (several at higher Heat: name and summary).
      let ry = 96;
      if (rules.length === 1) {
        this.add.rectangle(16, ry, 214, 58, 0x2a0f1a, 0.9).setOrigin(0).setStrokeStyle(2, 0xe0524a, 0.7);
        icon(this, 32, 109, 'skull', 15);
        text(this, 44, 101, boss.ruleName, 13, '#ff8a7a', { fontStyle: 'bold' });
        text(this, 24, 119, boss.ruleDesc, 10, COLORS.text, { wordWrap: { width: 200 } });
        ry += 64;
      } else {
        const h = 8 + rules.length * 30;
        this.add.rectangle(16, ry, 214, h, 0x2a0f1a, 0.9).setOrigin(0).setStrokeStyle(2, 0xe0524a, 0.7);
        rules.forEach((r, i) => {
          const y = ry + 6 + i * 30;
          icon(this, 30, y + 7, 'skull', 12);
          text(this, 40, y, r.name, 12, '#ff8a7a', { fontStyle: 'bold' });
          text(this, 24, y + 15, RULE_TAGS[r.rule].tag.toLowerCase().replace(/^./, (c) => c.toUpperCase()), 9, COLORS.text);
        });
        ry += h + 6;
      }
      const syn = teamSynergy(this.enemies);
      if (syn.length) {
        const line = syn.map((s) => `${s.element} ×${s.count} ${SYNERGY_LABEL[s.stat]} +${Math.round(s.bonus * 100)}%`).join(' · ');
        text(this, 16, ry, `Synergy: ${line}`, 10, '#ff8a7a', { wordWrap: { width: 214 } });
      }
    } else if (this.kind === 'elite') {
      onField(text(this, 16, 96, trainer, 13, '#ffc94d', { fontStyle: 'bold' }));
    }

    this.add.rectangle(L.msg.x, L.msg.y, L.msg.w, L.msg.h, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.msg = text(this, L.msg.x + 12, L.msg.y + 10, '', 16, COLORS.text, { wordWrap: { width: L.msg.w - 24 } });
    this.actions = this.add.container(0, 0);
    this.controls = this.add.container(0, 0);
    this.drawControls();
    // Menu: exit to the title mid-battle (the battle resumes from "Continue run").
    button(this, L.menu.x, L.menu.y, 48, 36, '', () => {
      if (this.busy) return;
      this.cancelAuto();
      // Settings may change the battle speed: redraw the controls on the way back.
      openGameMenu(this, () => this.afterMenu(), this.shownEnemy ? creatureTypes(this.shownEnemy) : []);
    }, { glyph: 'menu' }).setDepth(5);

    this.refreshEnemy();
    this.refreshPlayer();
    this.drawTeamFx();
    const intro = resuming
      ? 'The battle resumes!'
      : this.kind === 'battle'
        ? `A ${this.enemies.map((e) => `${e.shiny ? '✦GILDED✦' : 'wild'} ${creatureName(e)}`).join(' and a ')} appeared!`
        : this.kind === 'elite'
          ? `${trainer} challenges ${state.meta.duelName ? myName(state.meta) : 'you'}!`
          : `${boss!.name}, ${boss!.title}, blocks your way!`;
    this.msg.setText(intro);
    this.showActions();
    ensureFxTextures(this);
    // The floor's element colours the music; floor 3's guardian has its own song.
    playMusic(boss ? (run.floor === 2 && !run.hunt ? 'final' : 'boss') : this.kind === 'elite' ? 'trainer' : 'battle', run.map.biome);
    // Entry effects of a boss rule (stat drops, poison...).
    const entry = this.battle.start(resuming);
    // Resuming: stat stages, who's out, the foe's potions and used-up rule effects come back too.
    if (resuming && run.activeBattle.state) {
      this.battle.restoreState(run.activeBattle.state);
      this.refreshEnemy();
      this.refreshPlayer();
    }
    const begin = () => {
      if (boss && !resuming) this.bossEntrance();
      const go = () => (entry.length ? this.play(entry) : this.maybeAuto());
      if (resuming || tipDone(boss ? 'boss' : 'battle')) return go();
      // First battle / first guardian: a short tip first (after the guardian's entrance).
      this.time.delayedCall(boss ? 2200 : 300, () => tip(this, boss ? 'boss' : 'battle', go));
    };
    // Resuming after a reload: pick up wherever the battle was left.
    if (resuming) {
      this.startAura('enemy');
      this.startAura('player');
      const o = this.battle.outcome();
      if (o === 'win') this.onWin();
      else if (o === 'lose') this.onLose();
      else if (o === 'needSwitch') this.openSwitch(true);
      else begin();
    } else {
      // Both sides take the field: the enemy appears, then you release your lead.
      this.enemySprite.setVisible(false);
      this.playerSprite.setVisible(false);
      this.actions.setVisible(false);
      this.busy = true;
      void (async () => {
        // Trainers and guardians get a manga-style cut-in first.
        if (boss || this.kind === 'elite') {
          await trainerCutIn(this, {
            name: boss ? boss.name : trainer,
            sub: boss ? `${boss.title} · ${run.hunt ? `Gilded Hunt floor ${run.hunt.depth}` : `Guardian of floor ${run.floor + 1}`}` : 'Trainer',
            look: boss ? bossLook(boss.element) : lookForName(trainer),
            team: this.enemies,
            boss: !!boss,
            accent: ELEMENT_COLORS[run.map.biome],
          });
        }
        await this.wait(250);
        await this.enterEnemy();
        if (this.kind === 'battle') this.msg.setText(intro);
        await this.wait(200);
        this.msg.setText(`Go, ${creatureName(this.battle.p.c)}!`);
        await this.enterPlayer();
        this.busy = false;
        this.fast = false;
        this.setSpeed();
        this.msg.setText(intro);
        this.actions.setVisible(true);
        if (boss) {
          // The guardian's rule, impossible to miss.
          bossRuleCard(this, boss, rules, begin);
        } else begin();
      })();
    }
  }

  /**
   * Trainers stand off to the side, behind their creatures: you bottom-left, seen from behind (arm raised toward the
   * fight), the opponent top-right (wild battles have no one there).
   */
  private drawTrainers(enemy: TrainerLook | null, foeName: string | null) {
    this.foeName = foeName;
    // Each trainer sits in a holder that idles up and down; the image inside it hops on its own.
    const place = (x: number, y: number, key: string, scale: number, delay: number) => {
      this.add.ellipse(x, y + 17 * scale - 4, 15 * scale, 4 * scale, 0x000000, 0.3);
      const holder = this.add.container(x, y);
      const img = this.add.image(0, 0, key).setScale(scale);
      holder.add(img);
      this.tweens.add({ targets: holder, y: y - 3, yoyo: true, repeat: -1, duration: 900, delay, ease: 'Sine.easeInOut' });
      return img;
    };
    this.trainers = {};
    const mine = myLook(state.meta);
    const rest = ensureTrainerTexture(this, mine, 'back');
    const act = ensureTrainerTexture(this, mine, 'backCommand');
    // Wide gear (wings, a jetpack, a greatsword) reaches the sprite's edges: step in so it stays on screen.
    const left = Math.min(trainerSpan(this, rest)[0], trainerSpan(this, act)[0]);
    const px = Math.max(L.playerTrainer.x, 4 - OX + (TRAINER_W / 2 - left) * 3.1);
    this.trainers.player = { img: place(px, L.playerTrainer.y, rest, 3.1, 0), rest, act, look: mine };
    trainerFx(this, this.trainers.player.img, mine, { back: true });
    if (enemy) {
      const eRest = ensureTrainerTexture(this, enemy, 'stand');
      // Mirrored, so the sprite's left edge is on the right: keep it on screen too.
      const eLeft = Math.min(trainerSpan(this, eRest)[0], trainerSpan(this, ensureTrainerTexture(this, enemy, 'command'))[0]);
      // (Sideways, the field ends where the message column starts.)
      const rightEdge = LANDSCAPE ? L.field.w - 6 : W + OX - 4;
      const ex = Math.min(L.enemyTrainer.x, rightEdge - (TRAINER_W / 2 - eLeft) * 2.8);
      const them = place(ex, L.enemyTrainer.y, eRest, 2.8, 450).setFlipX(true);
      this.trainers.enemy = { img: them, rest: eRest, act: ensureTrainerTexture(this, enemy, 'command'), look: enemy };
      trainerFx(this, them, enemy);
    }
  }

  /** The opposing trainer's (or guardian's / opponent's) name, to tell which side a message is about. */
  private foeName: string | null = null;

  /**
   * Your trainer stands in front of your Hexling (lower on the field, nearer you), so draw them over
   * it, effects and all, but still under the panels and messages that come after.
   */
  private trainerInFront() {
    const holder = this.trainers.player?.img.parentContainer;
    if (holder && this.playerSprite) this.children.moveAbove(holder as unknown as Phaser.GameObjects.GameObject, this.playerSprite);
  }

  /**
   * After a spotlight lifted a Hexling above everything: back under the panels (and, for yours,
   * behind your trainer standing in front of it).
   */
  private restoreOrder(side: 'player' | 'enemy') {
    const sprite = this.spriteOf(side);
    const panel = (side === 'player' ? this.playerPanel : this.enemyPanel)?.root;
    const list = this.children;
    const below = [this.playerPanel?.root, this.enemyPanel?.root].filter((x): x is Phaser.GameObjects.Container => !!x?.active);
    const first = below.sort((a, b) => list.getIndex(a) - list.getIndex(b))[0] ?? panel;
    if (first) list.moveBelow(sprite as unknown as Phaser.GameObjects.GameObject, first);
    if (side === 'player') this.trainerInFront();
  }

    /** The winner celebrates facing forward: arm out, a few hops and a flare of their aura's color. */
  private cheer(side: 'player' | 'enemy') {
    const t = this.trainers[side];
    if (!t || !t.img.active) return;
    t.timer?.remove();
    // Your trainer turns around to face you to celebrate (seen from the front, arm out).
    t.img.setTexture(side === 'player' ? ensureTrainerTexture(this, t.look, 'command') : t.act);
    trainerFlare(this, t.img, t.look);
    if (calm()) return;
    this.tweens.killTweensOf(t.img);
    t.hopping = true;
    this.tweens.add({ targets: t.img, y: -14, duration: 150, yoyo: true, repeat: 2, ease: 'Quad.easeOut', onComplete: () => (t.img.y = 0) });
  }

  /** A little hop: this trainer is the one the message is about. */
  private hop(side: 'player' | 'enemy') {
    const t = this.trainers[side];
    if (!t || !t.img.active || t.hopping) return;
    t.hopping = true;
    this.tweens.add({
      targets: t.img,
      y: -9,
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        t.img.y = 0;
        t.hopping = false;
      },
    });
  }

  /**
   * Which side a battle message is about: enemy markers ("Enemy …", "wild …", the foe's name) win,
   * then your creatures, your name or your team; otherwise the side of the nearest event before it
   * (e.g. "It's super effective!" after a hit), or after it.
   */
  private aboutSide(msg: string, events: BattleEvent[], idx: number): 'player' | 'enemy' | null {
    const has = (s: string | null | undefined) => !!s && msg.includes(s);
    const enemyNames = this.battle.enemy.map((x) => creatureName(x.c));
    if (/\bEnemy\b|\bwild\b|enemy's team/i.test(msg) || has(this.foeName)) return 'enemy';
    if (this.match?.duel) {
      if (has(`${this.match.opponent}'s`)) return 'enemy';
      if (has(`${myName(state.meta)}'s`)) return 'player';
    }
    if (/Your team|\byour\b/i.test(msg) || this.battle.player.some((x) => has(creatureName(x.c)))) return 'player';
    if (!this.match?.duel && enemyNames.some(has)) return 'enemy';
    const sided = (e: BattleEvent | undefined) => (e && 'side' in e ? e.side : e?.kind === 'enemySend' ? 'enemy' : null);
    for (let k = idx - 1; k >= 0; k--) {
      const s = sided(events[k]);
      if (s) return s;
    }
    for (let k = idx + 1; k < events.length; k++) {
      const s = sided(events[k]);
      if (s) return s;
    }
    return null;
  }

  /** Show a battle message, and bounce the trainer whose side it's about. */
  private say(msg: string, events: BattleEvent[], idx: number) {
    this.msg.setText(msg);
    const side = this.aboutSide(msg, events, idx);
    if (side) this.hop(side);
  }

  /** The element's environment behind the field, and a pad under each side. */
  private drawField(el: Element, stage: number) {
    battleBackdrop(this, el, stage, { w: W, h: H, ox: OX, oy: OY, fw: FW, fh: FH }, L.field);
    battlePad(this, el, stage, ENEMY_POS.x, ENEMY_POS.y + 72);
    battlePad(this, el, stage, PLAYER_POS.x, PLAYER_POS.y + 72);
  }

  /** Trainers standing beside the field: arms down, and their textures for giving an order. */
  private trainers: Partial<Record<'player' | 'enemy', { img: Phaser.GameObjects.Image; rest: string; act: string; look: TrainerLook; timer?: Phaser.Time.TimerEvent; hopping?: boolean }>> = {};

  /** A trainer gives an order (a move or sending a creature out): raise the arm, then lower it. */
  private order(side: 'player' | 'enemy') {
    const t = this.trainers[side];
    if (!t || !t.img.active) return;
    t.img.setTexture(t.act);
    t.timer?.remove();
    t.timer = this.time.delayedCall(700, () => {
      if (t.img.active) t.img.setTexture(t.rest);
    });
  }

  /** A battle outside a run: same field, panels and animations; no rewards, potions or saving. */
  private createMatch(m: BattleMatch) {
    this.kind = 'elite';
    this.busy = false;
    this.enemies = m.enemies;
    // Lv 50 stays Lv 50: a run's floor level cap doesn't apply here.
    const ceiling = getFloorCeiling();
    setFloorCeiling(Infinity);
    this.events.once('shutdown', () => setFloorCeiling(ceiling));
    this.battle =
      m.duel?.battle ??
      new Battle(m.team, m.enemies, new Rng(m.seed), {
        enemyRandomness: m.randomness,
        enemyTactics: m.tactics ? { ...m.tactics, name: m.opponent } : undefined,
        permadeath: false,
        synergy: synergyMults(m.team),
        enemySynergy: synergyMults(m.enemies),
      });
    if (m.duel) {
      this.enemies = this.battle.enemy.map((x) => x.c);
      m.duel.attach({
        step: (events, next) => {
          // Wait for any turn still animating (e.g. a forfeit arriving mid-turn).
          const go = () => {
            if (!this.scene.isActive()) return;
            if (this.busy) return void this.time.delayedCall(150, go);
            this.duelNext = next;
            this.hideWaiting();
            void this.play(events);
          };
          go();
        },
      });
      this.watchConnection();
    }
    this.input.on('pointerdown', () => {
      if (this.busy) this.fast = true;
    });
    background(this, m.background);
    useLayout();
    // Outside a run, the field is the opponent's lead creature's home ground.
    const el = creatureTypes(this.enemies[0])[0];
    m.stage ??= pickStage(el);
    this.drawField(el, m.stage);
    this.drawTrainers(m.opponentLook ?? lookForName(m.opponent), m.opponent);
    this.enemySprite = this.add.image(ENEMY_POS.x, ENEMY_POS.y, '__DEFAULT').setScale(5);
    this.playerSprite = this.add.image(PLAYER_POS.x, PLAYER_POS.y, '__DEFAULT').setScale(5 * SPRITE_FIT).setFlipX(true);
    this.trainerInFront();
    this.enemyPanel = this.makePanel(L.enemyPanel.x, L.enemyPanel.y, 'enemy');
    this.playerPanel = this.makePanel(L.playerPanel.x, L.playerPanel.y, 'player');
    this.pips = onField(text(this, L.titleRight, L.pipsY, '', 16, '#ffc94d').setOrigin(1, 0));
    onField(text(this, L.titleRight, L.titleY, m.title, 14, '#ff6a5a', { fontStyle: 'bold' }).setOrigin(1, 0));
    onField(text(this, 16, 96, m.opponent, 13, '#ffc94d', { fontStyle: 'bold' }));
    if (m.duel && m.opponentTitle) titleBadge(this, 16, 113, m.opponentTitle, 11, { originX: 0, originY: 0, maxW: 150 });
    this.add.rectangle(L.msg.x, L.msg.y, L.msg.w, L.msg.h, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.msg = text(this, L.msg.x + 12, L.msg.y + 10, '', 16, COLORS.text, { wordWrap: { width: L.msg.w - 24 } });
    this.actions = this.add.container(0, 0);
    this.controls = this.add.container(0, 0);
    this.drawControls();
    button(this, L.menu.x, L.menu.y, 48, 36, '', () => this.openMatchMenu(), { glyph: 'menu' }).setDepth(5);
    this.refreshEnemy();
    this.refreshPlayer();
    this.drawTeamFx();
    const intro = m.duel ? `Duel against ${m.opponent}!` : `${m.opponent} wants to battle!`;
    this.msg.setText(intro);
    this.showActions();
    ensureFxTextures(this);
    playMusic('trainer', creatureTypes(this.enemies[0])[0]);
    const entry = m.duel ? [] : this.battle.start();
    this.enemySprite.setVisible(false);
    this.playerSprite.setVisible(false);
    this.actions.setVisible(false);
    this.busy = true;
    void (async () => {
      // Online duels and Arena battles open with the cut-in too: their trainer, name and Hexlings.
      {
        await trainerCutIn(this, {
          name: m.opponent,
          sub: m.duel ? 'Online duel' : `Battle Arena · ${m.title.replace(/^ARENA (\d+)\/(\d+)$/, 'Round $1 of $2')}`,
          badge: m.duel ? m.opponentTitle : undefined,
          look: m.opponentLook ?? lookForName(m.opponent),
          team: this.enemies,
          accent: ELEMENT_COLORS[creatureTypes(this.enemies[0])[0]],
        });
      }
      await this.wait(250);
      await this.enterEnemy();
      await this.wait(200);
      this.msg.setText(`Go, ${creatureName(this.battle.p.c)}!`);
      await this.enterPlayer();
      this.busy = false;
      this.fast = false;
      this.setSpeed();
      this.msg.setText(intro);
      this.actions.setVisible(true);
      if (m.duel) return this.duelProceed(m.initialNext ?? { phase: 'choose' });
      if (entry.length) this.play(entry);
      else this.maybeAuto();
    })();
  }

  // ------------------------------------------------------------ duels

  /** Arena and duel battles: resume, sound, or give up this battle. */
  private openMatchMenu() {
    const m = this.match!;
    if (!m.duel && this.busy) return;
    this.cancelAuto();
    const giveUp = m.duel ? 'Forfeit this battle' : 'Leave the ladder';
    const sub = m.duel ? `${m.opponent} wins this battle` : 'Counts as losing this round';
    openPicker(this, {
      title: 'Menu',
      options: [
        { label: 'Resume', color: 0x3b6d4a, glyph: 'play' },
        { label: 'Settings', sub: 'Sound, speed', glyph: 'gear' },
        { label: 'Element chart', sub: 'Your foe’s elements are highlighted', glyph: 'sparkle' },
        { label: giveUp, sub, color: 0x5a2a2a, glyph: 'skull' },
      ],
      onPick: (i) => {
        if (i === 0) return this.maybeAuto();
        if (i === 1) return void openSettings(this, () => this.afterMenu());
        if (i === 2) return void openElementChart(this, this.shownEnemy ? creatureTypes(this.shownEnemy) : [], () => this.maybeAuto());
        openPicker(this, {
          title: `${giveUp}?`,
          subtitle: sub + '.',
          options: [{ label: giveUp, color: 0x8a2c2c }],
          onPick: () => {
            if (m.duel) m.duel.forfeit();
            else this.endMatch(false);
          },
          onCancel: () => this.maybeAuto(),
          cancelLabel: 'Back',
        });
      },
      onCancel: () => this.maybeAuto(),
      cancelLabel: 'Close',
    });
  }

  /** Back from a menu: settings may have changed the speed. */
  private afterMenu() {
    this.drawControls();
    this.setSpeed();
    this.maybeAuto();
  }

  /** What the duel wants next, applied once the current turn has played out. */
  private duelNext: Next | null = null;
  private waiting: Phaser.GameObjects.Text | null = null;

  private showWaiting(what: string) {
    this.hideWaiting();
    this.msg.setText(what);
    this.waiting = text(this, L.waiting.x, L.waiting.y, 'Waiting…', 18, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5);
    this.tweens.add({ targets: this.waiting, alpha: 0.35, yoyo: true, repeat: -1, duration: 600 });
  }

  private hideWaiting() {
    this.waiting?.destroy();
    this.waiting = null;
  }

  private duelProceed(next: Next) {
    const opp = this.match!.opponent;
    switch (next.phase) {
      case 'choose':
        this.msg.setText(`What will ${creatureName(this.battle.p.c)} do?`);
        this.showActions();
        this.actions.setVisible(true);
        this.maybeAuto();
        return;
      case 'switch':
        this.openSwitch(true);
        return;
      case 'waitSwitch':
        this.actions.setVisible(false);
        this.showWaiting(`${opp} is choosing their next Hexling.`);
        return;
      case 'end':
        this.endMatch(next.won);
        return;
    }
  }

  /** Dropped connections: say so, and pick up again if the other phone comes back. */
  private watchConnection() {
    let box: Phaser.GameObjects.Container | null = null;
    let retry: Phaser.Time.TimerEvent | null = null;
    const off = session.onStatus((s) => {
      if (s === 'lost' && !box) {
        box = openPicker(this, {
          title: 'Connection lost',
          subtitle:
            session.role === 'guest'
              ? 'Trying to reconnect to the host… Keep the game open on both phones.'
              : `Waiting for ${this.match!.opponent} to reconnect… Keep the game open.`,
          options: [{ label: 'Give up and leave', color: 0x5a2a2a }],
          onPick: () => {
            leaveDuel();
            this.scene.start('Duel', {});
          },
        });
        // The guest keeps trying the same code; the host just waits for it.
        if (session.role === 'guest') {
          retry = this.time.addEvent({ delay: 3000, loop: true, callback: () => void session.connectGuest().then((ok) => ok && sendHello()) });
        }
      } else if (s === 'connected' && box) {
        box.destroy();
        box = null;
        retry?.remove();
        retry = null;
      }
    });
    this.events.once('shutdown', () => {
      off();
      retry?.remove();
    });
  }

  /** The enemy's current creature takes the field: wild ones burst out of the terrain, others from a hexagon. */
  private enterEnemy() {
    const c = this.battle.e.c;
    const el = creatureTypes(c)[0];
    const voice = () => cry(c.speciesId, c.stage);
    const shine = (p: Promise<unknown>) => (c.shiny ? p.then(() => this.shinyEntrance('enemy', c)) : p);
    if (this.kind === 'battle') return shine(emergeFrom(this, this.enemySprite, el, voice));
    this.order('enemy');
    return shine(releaseFromHex(this, this.enemySprite, ELEMENT_COLORS[el], voice));
  }

  private enterPlayer() {
    const c = this.battle.p.c;
    this.order('player');
    const p = releaseFromHex(this, this.playerSprite, ELEMENT_COLORS[creatureTypes(c)[0]], () => cry(c.speciesId, c.stage));
    return c.shiny ? p.then(() => this.shinyEntrance('player', c)) : p;
  }

  // ------------------------------------------------------------ shiny Hexlings

  /** Glitter on the field around each shiny Hexling that's out. */
  private auras: Partial<Record<'player' | 'enemy', ShinyAura>> = {};

  /**
   * A shiny takes the field: the full reveal for a foe (the first time, with the SHINY! banner),
   * a shorter one for yours, then it keeps glittering while it's out.
   */
  private async shinyEntrance(side: 'player' | 'enemy', c: Creature) {
    const sprite = this.spriteOf(side);
    if (side === 'enemy') {
      const first = !this.revealed.has(c.uid);
      this.revealed.add(c.uid);
      noteShiny(state.meta, c.speciesId);
      if (first) this.msg.setText(`Whoa! It's a GILDED ${creatureName(c)}!`);
      await shinyReveal(this, sprite, first, () => this.restoreOrder(side));
    } else await shinyReveal(this, sprite, false, () => this.restoreOrder(side));
    this.startAura(side);
  }
  private revealed = new Set<number>();

  private startAura(side: 'player' | 'enemy') {
    this.clearAura(side);
    const c = side === 'player' ? this.shownPlayer : this.shownEnemy;
    const s = this.spriteOf(side);
    if (c?.shiny && s.visible && s.alpha > 0.5) this.auras[side] = shinyAura(this, s);
  }

  private clearAura(side: 'player' | 'enemy') {
    this.auras[side]?.destroy();
    delete this.auras[side];
  }

  // ------------------------------------------------------------ panels

  /** Open while a Hexling's stats are showing (one at a time). */
  private statsOpen = false;
  /** Which panel the current press started on. */
  private panelPress: 'player' | 'enemy' | null = null;

  /**
   * A Hexling's stats right now: each stat with its change (stages go up to ±2: x1.5 / x0.67) and
   * what it comes to with synergy, a Swift Scarf and paralysis; its condition, held item and moves
   * (a foe's moves only once you've seen them).
   */
  private showCombatant(side: 'player' | 'enemy') {
    if (this.statsOpen || !this.battle) return;
    const x = side === 'player' ? this.battle.p : this.battle.e;
    const c = x.c;
    if (!c) return;
    this.statsOpen = true;
    const p = openPanel(this, `${creatureName(c)}  Lv ${c.level}${c.stars ? '  ' + '★'.repeat(c.stars) : ''}`, {
      w: LANDSCAPE ? 640 : W - 20,
      h: LANDSCAPE ? H - 16 : 640,
      depth: 1500,
      onClose: () => (this.statsOpen = false),
    });
    const r = p.root;
    const x0 = p.x + 18;
    const w = p.w - 36;
    let y = p.top - 4;
    // Who, elements and condition.
    const t = creatureTypes(c);
    (t[0] === t[1] ? [t[0]] : t).forEach((el, i) => r.add(typeChip(this, x0 + i * 64, y + 10, el, false)));
    r.add(text(this, x0 + w, y + 2, side === 'player' ? 'Your Hexling' : this.match ? 'Opponent' : 'Enemy', 13, side === 'player' ? '#8fd0ff' : '#ff8a7a', { fontStyle: 'bold' }).setOrigin(1, 0));
    y += 30;
    const max = stats(c).hp;
    const cond = x.status ? `${STATUS[x.status].name} (${x.statusTurns} turn${x.statusTurns === 1 ? '' : 's'} left): ${STATUS[x.status].desc}` : 'No condition';
    r.add(text(this, x0, y, `HP ${c.hp} / ${max}  ·  ${cond}`, 13, x.status ? '#ffc94d' : COLORS.textDim, { wordWrap: { width: w } }));
    y += 22 + (x.status ? 16 : 0);

    // Stats: base, change, now.
    const s = stats(c);
    const syn = x.syn ?? { atk: 1, def: 1, spd: 1 };
    const rows: [string, number, number, number][] = [
      ['Attack', s.atk, x.atkStage, s.atk * syn.atk * stageMult(x.atkStage)],
      ['Defense', s.def, x.defStage, s.def * syn.def * stageMult(x.defStage)],
      ['Speed', s.spd, x.spdStage, s.spd * syn.spd * stageMult(x.spdStage) * (c.held === 'scarf' ? 1.25 : 1) * (x.status === 'para' ? 0.5 : 1)],
    ];
    const cx = [x0, x0 + w * 0.36, x0 + w * 0.62, x0 + w];
    r.add(text(this, cx[1], y, 'Base', 12, COLORS.textDim));
    r.add(text(this, cx[2], y, 'Change', 12, COLORS.textDim));
    r.add(text(this, cx[3], y, 'Now', 12, COLORS.textDim).setOrigin(1, 0));
    y += 18;
    for (const [label, base, stage, now] of rows) {
      r.add(this.add.rectangle(x0 - 6, y - 3, w + 12, 24, COLORS.panelLight, 0.6).setOrigin(0));
      r.add(text(this, cx[0], y, label, 15, COLORS.text, { fontStyle: 'bold' }));
      r.add(text(this, cx[1], y, String(base), 15, COLORS.text));
      const ch = stage === 0 ? '—' : `${stage > 0 ? '▲ +' : '▼ '}${stage}  (×${stageMult(stage).toFixed(2).replace(/0$/, '')})`;
      r.add(text(this, cx[2], y, ch, 15, stage > 0 ? '#8fe08a' : stage < 0 ? '#ff8a7a' : COLORS.textDim, { fontStyle: stage ? 'bold' : 'normal' }));
      const n = Math.round(now);
      r.add(text(this, cx[3], y, String(n), 15, n > base ? '#8fe08a' : n < base ? '#ff8a7a' : COLORS.text, { fontStyle: 'bold' }).setOrigin(1, 0));
      y += 28;
    }
    r.add(
      text(this, x0, y, 'Moves can raise or lower a stat by up to 2 steps (+2 = ×1.5, −2 = ×0.67). Changes wear off when it switches out. “Now” includes synergy, Swift Scarf and paralysis.', 11, COLORS.textDim, {
        wordWrap: { width: w },
        lineSpacing: 2,
      }),
    );
    y += LANDSCAPE ? 34 : 46;

    // Held item.
    r.add(text(this, x0, y, c.held ? `Held: ${HELD[c.held].name} · ${HELD[c.held].desc}` : 'Held: nothing', 13, c.held ? COLORS.text : COLORS.textDim, { wordWrap: { width: w } }));
    y += 24;

    // Moves (a foe's only once seen).
    const seen = state.meta.dex.moves;
    const cols = LANDSCAPE ? 2 : 1;
    const mw = (w - (cols - 1) * 10) / cols;
    c.moves.forEach((m, i) => {
      const d = moveDef(m);
      const mx = x0 + (i % cols) * (mw + 10);
      const my = y + Math.floor(i / cols) * 40;
      const known = side === 'player' || seen.includes(m.id);
      r.add(this.add.rectangle(mx - 6, my - 3, mw + 12, 36, known ? Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[d.element]).darken(55).color : COLORS.panelLight, 0.9).setOrigin(0));
      if (!known) {
        r.add(text(this, mx, my + 8, '??? · not seen yet', 13, '#6d6888'));
        return;
      }
      const left = usesLeft(m);
      const uses = Number.isFinite(left) ? ` · ${left}/${maxUses(d)} uses` : '';
      const top = text(this, mx, my, `${d.name} · T${m.tier}${uses}`, 13, COLORS.text, { fontStyle: 'bold' });
      if (top.width > mw) top.setScale(mw / top.width);
      const sub = text(this, mx, my + 16, `${d.element} · ${moveSummary(d, m.tier)} · ${accText(d)}`, 11, COLORS.textDim);
      if (sub.width > mw) sub.setScale(mw / sub.width);
      r.add([top, sub]);
    });
  }

  private makePanel(x: number, y: number, side: 'player' | 'enemy'): SidePanel {
    const root = this.add.container(x, y);
    // Tap the panel to see this Hexling's stats, stat changes, condition, item and moves.
    root.add(
      this.add
        .rectangle(0, 0, 270, 74, COLORS.panel, 0.92)
        .setOrigin(0)
        .setStrokeStyle(2, COLORS.stroke)
        .setInteractive({ useHandCursor: true })
        // Both the press and the release on the panel: a tap that skipped the cut-in (pressed on it,
        // released here once it was gone) doesn't open the stats.
        .on('pointerdown', () => (this.panelPress = side))
        .on('pointerup', () => {
          if (this.panelPress === side) this.showCombatant(side);
          this.panelPress = null;
        }),
    );
    root.add(text(this, 12, 58, 'ⓘ tap for stats', 10, '#8e86ad'));
    const name = text(this, 12, 8, '', 17, COLORS.text, { fontStyle: 'bold' });
    const chips = this.add.container(12, 40);
    const bar = new HpBar(this, 140, 40, 118, 10, true);
    const status = this.add.container(262, 9);
    const held = icon(this, 0, 18, 'bag', 18).setVisible(false);
    root.add([name, chips, ...bar.objects(), status, held]);
    const frame = root.getAt(0) as Phaser.GameObjects.Rectangle;
    // SHINY tab on the bottom edge.
    const shiny = this.add.container(135, 74).setVisible(false);
    shiny.add(this.add.rectangle(0, 0, 104, 22, 0xffd86b).setStrokeStyle(2, 0x7a4a00));
    shiny.add(text(this, 0, 0, '✦ GILDED ✦', 13, '#4a2a00', { fontStyle: 'bold' }).setOrigin(0.5));
    root.add(shiny);
    this.tweens.add({ targets: shiny, scale: 1.08, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
    return { root, name, chips, bar, status, held, frame, shiny };
  }

  private setStatus(p: SidePanel, id: StatusId | null) {
    p.status.removeAll(true);
    if (id) {
      const def = STATUS[id];
      p.status.add(this.add.rectangle(0, 0, 40, 18, def.color).setOrigin(1, 0));
      p.status.add(text(this, -20, 9, def.tag, 11, '#1a1426', { fontStyle: 'bold' }).setOrigin(0.5));
    }
    // A status can arrive (or clear) mid-battle: re-fit the name line around it.
    this.fitName(p);
  }

  /**
   * The name line: long names with many stars shrink so the name, the held item after it and the
   * status tag in the corner never overlap.
   */
  private fitName(p: SidePanel) {
    p.name.setScale(1);
    const room = 258 - 12 - (p.status.length ? 46 : 0) - (p.held.visible ? 26 : 0);
    if (p.name.width > room) p.name.setScale(room / p.name.width);
    p.held.setX(12 + p.name.displayWidth + 13);
  }

  private fillPanel(p: SidePanel, c: Creature, hp = c.hp) {
    p.name.setText(`${creatureName(c)} Lv${c.level} ${stars(c.stars)}`);
    p.held.setVisible(!!c.held);
    if (c.held) p.held.setTexture(ensureIcon(this, HELD[c.held].icon));
    // Also fits the name line (see fitName).
    this.setStatus(p, c.status?.id ?? null);
    // A shiny's panel is gold, with a SHINY tab.
    p.name.setColor(c.shiny ? '#ffd86b' : COLORS.text);
    p.frame.setStrokeStyle(c.shiny ? 3 : 2, c.shiny ? 0xffd86b : COLORS.stroke);
    p.shiny.setVisible(!!c.shiny);
    p.chips.removeAll(true);
    const t = creatureTypes(c);
    (t[0] === t[1] ? [t[0]] : t).forEach((el, i) => p.chips.add(typeChip(this, i * 64, 0, el, false)));
    p.bar.set(hp, stats(c).hp);
  }

  /** hp: what the bar should show now (during playback the logic may already be ahead). */
  /** The creature the enemy sprite is showing. */
  private shownEnemy: Creature | null = null;

  private refreshEnemy(hp?: number) {
    const e = this.battle.e.c;
    if (this.shownEnemy !== e) this.clearAura('enemy');
    this.shownEnemy = e;
    dex.creature(e);
    this.enemySprite.setTexture(ensureCreatureTexture(this, e.speciesId, e.stage, e.shiny)).setAlpha(1).setPosition(ENEMY_POS.x, ENEMY_POS.y);
    this.enemySprite.setScale((this.kind === 'boss' ? 6 : 5) * SPRITE_FIT);
    this.fillPanel(this.enemyPanel, e, hp);
    const alive = this.battle.enemy.filter((x) => isAlive(x.c)).length;
    this.pips.setText('●'.repeat(alive) + '○'.repeat(this.battle.enemy.length - alive));
  }

  /** The creature the player's sprite is showing (playback can lag behind the battle logic). */
  private shownPlayer: Creature | null = null;

  private refreshPlayer(hp?: number) {
    const p = this.battle.p.c;
    if (this.shownPlayer !== p) this.clearAura('player');
    this.shownPlayer = p;
    dex.creature(p, true);
    this.playerSprite.setTexture(ensureCreatureTexture(this, p.speciesId, p.stage, p.shiny)).setAlpha(1).setPosition(PLAYER_POS.x, PLAYER_POS.y);
    this.playerSprite.setScale(5 * SPRITE_FIT);
    this.fillPanel(this.playerPanel, p, hp);
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
    const { x0, y0, bw, gap, rowH, h: bh } = L.moves;
    if (outOfMoves(p)) {
      // Every move is spent: only the basic attack is left until uses are restored.
      const fb = moveDef(fallbackMove(p));
      const color = Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[fb.element]).darken(45).color;
      this.actions.add(
        button(this, L.fallback.x, L.fallback.y, L.fallback.w, 64, `${fb.name} (basic attack)`, () => this.act({ kind: 'move', index: -1 }), {
          color,
          sub: `${moveSummary(fb, 1)} · ${accText(fb)}`,
          fontSize: 17,
        }),
      );
      this.actions.add(text(this, L.fallback.x, L.fallback.noteY, 'Out of move uses! Rest, bench it, or use a Full Restore.', 13, '#ffc94d', { align: 'center', wordWrap: { width: L.fallback.w } }).setOrigin(0.5, 0));
    }
    p.moves.forEach((m, i) => {
      if (outOfMoves(p)) return;
      const d = moveDef(m);
      const mult = typeMultiplier(d.element, creatureTypes(e));
      const hint = d.kind !== 'attack' ? '' : mult > 1.01 ? ' ▲' : mult < 0.99 ? ' ▼' : '';
      const x = x0 + bw / 2 + (i % 2) * (bw + gap);
      const y = y0 + Math.floor(i / 2) * rowH;
      const color = Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[d.element]).darken(45).color;
      this.actions.add(
        button(this, x, y, bw, bh, d.name + hint, () => this.act({ kind: 'move', index: i }), {
          color,
          sub: `${moveSummary(d, m.tier)}  ·  ${'✦'.repeat(m.tier)}`,
          fontSize: 17,
          enabled: hasUses(m),
          // Long names stay on one line (shrinking), clear of the accuracy and uses in the corners.
          oneLine: true,
          contentDy: LANDSCAPE ? 6 : 2,
        }),
      );
      // Hit chance in the top-left corner; limited moves show their uses left in the top-right.
      this.actions.add(text(this, x - bw / 2 + 6, y - bh / 2 + 2, accText(d), 11, d.accuracy < 100 ? '#ffc94d' : '#d8d2ec', { fontStyle: 'bold' }).setAlpha(hasUses(m) ? 1 : 0.5));
      const left = usesLeft(m);
      if (Number.isFinite(left)) {
        const max = maxUses(d)!;
        this.actions.add(
          text(this, x + bw / 2 - 6, y - bh / 2 + 2, `${left}/${max}`, 11, left === 0 ? '#e0524a' : left <= 2 ? '#ffc94d' : '#d8d2ec', { fontStyle: 'bold' }).setOrigin(1, 0),
        );
      }
    });
    const canSwap = this.battle.player.some((x, i) => i !== this.battle.pActive && isAlive(x.c));
    this.actions.add(button(this, L.switchBtn.x, L.switchBtn.y, L.switchBtn.w, 44, '⇄ Switch', () => this.openSwitch(false), { enabled: canSwap, fontSize: 15 }));
    // No potions outside a run.
    if (this.match) return;
    const potions = state.run!.potions ?? 0;
    const hurt = this.battle.player.some((x) => needsPotion(x.c));
    this.actions.add(
      button(this, L.potionBtn.x, L.potionBtn.y, L.potionBtn.w, 44, `Potion ${potions}`, () => this.openPotion(), {
        enabled: potions > 0 && hurt,
        glyph: 'potion',
        fontSize: 15,
        color: 0x2f5a4a,
      }),
    );
  }

  /** Auto-battle and battle speed, on either side of the Switch button. */
  private drawControls() {
    this.controls.removeAll(true);
    const auto = prefs.autoBattle;
    this.controls.add(
      button(this, L.autoBtn.x, L.autoBtn.y, L.autoBtn.w, 44, auto ? 'Auto ON' : 'Auto', () => {
        prefs.autoBattle = !prefs.autoBattle;
        this.drawControls();
        if (prefs.autoBattle) this.maybeAuto();
        else this.cancelAuto();
      }, { fontSize: 15, color: auto ? 0x3b6d4a : undefined, glyph: 'play' }),
    );
    const speed = prefs.battleSpeed;
    this.controls.add(
      button(this, L.speedBtn.x, L.speedBtn.y, L.speedBtn.w, 44, `${speed}×`, () => {
        const i = BATTLE_SPEEDS.indexOf(speed as (typeof BATTLE_SPEEDS)[number]);
        prefs.battleSpeed = BATTLE_SPEEDS[(i + 1) % BATTLE_SPEEDS.length];
        this.drawControls();
        this.setSpeed();
      }, { fontSize: 15, color: speed > 1 ? 0x3a4f7a : undefined, glyph: 'fast' }),
    );
  }

  /** With auto-battle on, after a short beat: switch, drink a potion or use the best-rated move. */
  private maybeAuto() {
    if (!prefs.autoBattle || this.busy || this.autoTimer || this.battle.outcome() !== 'ongoing') return;
    this.autoTimer = this.time.delayedCall(450, () => {
      this.autoTimer = null;
      if (!prefs.autoBattle || this.busy || this.battle.outcome() !== 'ongoing') return;
      // Switch out of a bad matchup or drink a potion when it matters (potions only in runs).
      const run = state.run;
      const potions = !this.match && run ? (run.potions ?? 0) : 0;
      const plan = this.battle.autoPlan(potions);
      if (plan?.kind === 'potion' && run) {
        run.potions = Math.max(0, (run.potions ?? 0) - 1);
        notePotion(run);
        return this.act({ kind: 'potion', index: this.battle.pActive, heal: potionHeal(run) });
      }
      if (plan?.kind === 'swap') return this.act({ kind: 'swap', index: plan.index });
      this.act({ kind: 'move', index: this.battle.bestMove('player') });
    });
  }

  private cancelAuto() {
    this.autoTimer?.remove();
    this.autoTimer = null;
  }

  /** Use a carried potion on any party member (uses your turn). */
  private openPotion() {
    this.cancelAuto();
    const run = state.run!;
    const list = this.battle.player;
    openPicker(this, {
      title: `Use a Potion (${run.potions ?? 0} left)`,
      subtitle: `Heals ${Math.round(potionHeal(run) * 100)}% of max HP and cures status conditions. Uses your turn.`,
      options: list.map((x) => ({
        creature: x.c,
        disabled: !needsPotion(x.c),
        note: !isAlive(x.c) ? 'Fallen' : !needsPotion(x.c) ? 'Healthy' : undefined,
      })),
      onPick: (i) => {
        run.potions = Math.max(0, (run.potions ?? 0) - 1);
        notePotion(run);
        this.act({ kind: 'potion', index: i, heal: potionHeal(run) });
      },
      onCancel: () => this.maybeAuto(),
    });
  }

  private openSwitch(forced: boolean) {
    this.cancelAuto();
    const list = this.battle.player;
    const pick = (i: number) => {
      if (forced && this.match?.duel) {
        this.showWaiting(`Waiting for ${this.match.opponent}.`);
        this.match.duel.submitSwitch(i);
      } else if (forced) this.play(this.battle.forcedSwitch(i));
      else this.act({ kind: 'swap', index: i });
    };
    // Auto-battle sends in the best matchup itself after a fainting.
    if (forced && prefs.autoBattle) {
      const best = this.battle.bestPlayerAnswer();
      if (best >= 0) {
        this.time.delayedCall(450, () => (prefs.autoBattle ? pick(best) : this.openSwitch(true)));
        return;
      }
    }
    openPicker(this, {
      title: forced ? 'Choose your next Hexling' : 'Switch Hexling',
      subtitle: forced ? undefined : 'Switching uses your turn.',
      options: list.map((x, i) => ({
        creature: x.c,
        disabled: i === this.battle.pActive || !isAlive(x.c),
        note: i === this.battle.pActive ? 'In battle' : !isAlive(x.c) ? 'Fallen' : undefined,
      })),
      onPick: pick,
      onCancel: forced ? undefined : () => this.maybeAuto(),
    });
  }

  private act(a: PlayerAction) {
    if (this.busy) return;
    this.cancelAuto();
    if (this.match?.duel) {
      this.actions.setVisible(false);
      this.showWaiting(`Waiting for ${this.match.opponent} to choose.`);
      this.match.duel.submitAction(a);
      return;
    }
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
    let shinyHit = false;
    // "X used Y!" is shown as the attack starts, so the hit lands right as the effect arrives.
    let shownEarly: BattleEvent | null = null;
    for (let idx = 0; idx < events.length; idx++) {
      const ev = events[idx];
      this.setSpeed();
      switch (ev.kind) {
        case 'text':
          if (ev === shownEarly) break;
          this.say(ev.text, events, idx);
          if (ev.text === 'It missed!') sfx.miss();
          await this.wait(620);
          break;
        case 'stat': {
          const s = this.spriteOf(ev.side);
          ev.up ? sfx.statUp() : sfx.statDown();
          statusFx(this, s, lastEl, ev.up);
          const arrow = onField(text(this, s.x, s.y - 60, ev.up ? '▲▲' : '▼▼', 28, ev.up ? '#8fe08a' : '#f08a80', { fontStyle: 'bold' }).setOrigin(0.5));
          s.setTint(ev.up ? 0xaaffaa : 0xff9a9a);
          this.tweens.add({ targets: arrow, y: arrow.y + (ev.up ? -30 : 30), alpha: 0, duration: 500, onComplete: () => arrow.destroy() });
          await this.wait(300);
          s.clearTint();
          break;
        }
        case 'attack': {
          this.order(ev.side);
          dex.move(ev.moveId);
          const def = MOVES[ev.moveId];
          lastEl = def?.element ?? lastEl;
          const s = this.spriteOf(ev.side);
          const target = this.spriteOf(ev.side === 'player' ? 'enemy' : 'player');
          const next = events[idx + 1];
          if (next?.kind === 'text') {
            this.say(next.text, events, idx + 1);
            shownEarly = next;
          }
          attackerHome = { x: ev.side === 'player' ? PLAYER_POS.x : ENEMY_POS.x, y: ev.side === 'player' ? PLAYER_POS.y : ENEMY_POS.y };
          // Shiny Hexlings attack with extra sparkle.
          shinyHit = !!(ev.side === 'player' ? this.shownPlayer : this.shownEnemy)?.shiny;
          if (shinyHit) shinyAttackStart(this, s, target);
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
            if (shinyHit) shinyImpact(this, at, s.depth + 3);
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
          this.clearAura(ev.side);
          cry(c.speciesId, c.stage, true);
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
        case 'team':
          this.drawTeamFx();
          if (ev.on) sfx.statUp();
          break;
        case 'status': {
          const panel = ev.side === 'player' ? this.playerPanel : this.enemyPanel;
          if (ev.side === 'enemy' && ev.status && !this.match) trackStat(state.run!, 'statusInflicted');
          this.setStatus(panel, ev.status);
          if (ev.status) {
            const s = this.spriteOf(ev.side);
            sfx.statDown();
            s.setTint(STATUS[ev.status].color);
            this.tweens.add({ targets: s, scaleX: s.scaleX * 1.08, scaleY: s.scaleY * 0.92, yoyo: true, repeat: 1, duration: 90 });
            await this.wait(320);
            s.clearTint();
          }
          break;
        }
        case 'swap': {
          // Call the old creature back (unless it just fainted), then release the new one.
          const s = this.playerSprite;
          if (s.visible && s.alpha > 0.5 && this.shownPlayer) {
            this.clearAura('player');
            await recallToHex(this, s, ELEMENT_COLORS[creatureTypes(this.shownPlayer)[0]]);
          }
          this.refreshPlayer(ev.hp);
          await this.enterPlayer();
          break;
        }
        case 'enemySend': {
          // A voluntary switch: call the old one back first (a fainted one has already gone).
          const s = this.enemySprite;
          if (s.visible && s.alpha > 0.5 && this.shownEnemy && this.shownEnemy !== this.battle.enemy[ev.index].c) {
            this.clearAura('enemy');
            await recallToHex(this, s, ELEMENT_COLORS[creatureTypes(this.shownEnemy)[0]]);
          }
          this.refreshEnemy(ev.hp);
          await this.enterEnemy();
          break;
        }
      }
    }
    this.fast = false;
    this.setSpeed();
    this.busy = false;
    this.afterTurn();
  }

  /** Team effects up on each side: a colored tag with turns left, by each side's panel. */
  private fxChips: Phaser.GameObjects.Container | null = null;
  private drawTeamFx() {
    this.fxChips?.destroy();
    this.fxChips = this.add.container(0, 0).setDepth(5);
    // Enemy chips go left to right under its panel (clear of the HP numbers and the menu button);
    // the player's go right to left above its panel.
    for (const side of ['enemy', 'player'] as const) {
      let x = side === 'enemy' ? L.enemyFx.x : L.playerFx.x;
      const y = side === 'enemy' ? L.enemyFx.y : L.playerFx.y;
      for (const [fx, left] of Object.entries(this.battle.teamFx[side]) as [TeamFxId, number][]) {
        if (!left) continue;
        const def = TEAM_FX[fx];
        const t = text(this, 0, 0, `${def.tag} · ${left}`, 11, '#1a1426', { fontStyle: 'bold' });
        const w = t.width + 10;
        if (side === 'player') x -= w;
        this.fxChips.add(this.add.rectangle(x, y, w, 16, def.color).setOrigin(0));
        this.fxChips.add(t.setPosition(x + 5, y + 2));
        x += side === 'player' ? -4 : w + 4;
      }
    }
  }

  private afterTurn() {
    this.drawTeamFx();
    const ab = this.match ? null : state.run!.activeBattle;
    if (ab) {
      ab.fought = [...new Set([...(ab.fought ?? []), ...this.battle.fought])];
      if (this.battle.spared) ab.spared = true;
      ab.state = this.battle.saveState();
    }
    if (!this.match) persist();
    if (this.match?.duel) {
      const next = this.duelNext ?? { phase: 'choose' as const };
      this.duelNext = null;
      return this.duelProceed(next);
    }
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
        return this.match ? this.endMatch(true) : this.onWin();
      case 'lose':
        return this.match ? this.endMatch(false) : this.onLose();
    }
  }

  private endMatch(won: boolean) {
    this.cancelAuto();
    this.hideWaiting();
    this.controls.setVisible(false);
    this.actions.setVisible(false);
    playMusic(null);
    if (won) sfx.victory();
    else sfx.defeat();
    this.cheer(won ? 'player' : 'enemy');
    if (this.match!.duel) return this.endDuel(won);
    this.match!.onEnd(won);
  }

  private endDuel(won: boolean) {
    const opp = this.match!.opponent;
    const race = !!this.match!.duel!.info.hostCreatures;
    duel.controller = null;
    const meta = state.meta;
    if (race) {
      const title = won ? 'You won the stage battle!' : `${opp} won the stage battle`;
      const body = (won ? `Your team beat ${opp}'s at the boss!` : `${opp}'s team beat yours at the boss.`) + (won ? titleNews(addOnlineWin(meta)) : '');
      if (won) saveMeta(meta);
      return showMessage(this, title, body, () => {
        endRace();
        state.run = null;
        this.scene.start('Duel', {});
      });
    }
    // Arena duels are a series (best of 1, 3 or 5).
    const sr = duel.series;
    const result = recordSeriesGame(won);
    const score = sr && sr.settings.bestOf > 1 ? `\n\nYou ${sr.mine} – ${sr.theirs} ${opp}` : '';
    let title = won ? 'You win!' : 'You lost';
    let body = (won ? `You beat ${opp}!` : `${opp} wins this one.`) + score;
    // A won series (or single battle) counts toward the online titles.
    const seriesWon = result === 'won' || (won && !sr);
    if (sr && sr.settings.bestOf > 1) {
      if (result === 'won') title = 'You win the series!';
      else if (result === 'lost') title = `${opp} wins the series`;
      else if (result === 'draw') title = 'The series is a draw';
      else body += `\n\nNext: battle ${sr.game} of ${sr.settings.bestOf}.`;
    }
    if (seriesWon) {
      body += titleNews(addOnlineWin(meta));
      saveMeta(meta);
    }
    showMessage(this, title, body, () => afterSeriesGame(result !== null));
  }

  // ------------------------------------------------------------ results

  private toMap(banner?: string) {
    state.run!.activeBattle = null;
    this.scene.start('Map', banner ? { banner } : {});
  }

  private xpLines(res: XpResult[]): string {
    if (res.some((r) => r.levels > 0)) this.time.delayedCall(250, () => sfx.levelUp());
    const lines = res.map((r) => {
      if (r.levels) return `${r.name} +${r.xp} XP  ▲ ${r.levels} lv`;
      if (r.full) return r.banked ? `${r.name} +${r.xp} XP stored (now full)  ◉ +${r.coins}` : `${r.name} at cap, store full  ◉ +${r.coins}`;
      if (r.banked || r.coins) return `${r.name} +${r.xp} XP stored  ◉ +${r.coins}`;
      return `${r.name} +${r.xp} XP`;
    });
    const capCoins = res.reduce((t, r) => t + r.coins, 0);
    if (capCoins) sfx.coin();
    return lines.join('\n');
  }

  private fallenNote(): string {
    const fallen = buryFallen(state.run!);
    if (!fallen.length) return '';
    // Bench creatures step up to fill the empty slots.
    const up = fillTeamFromBench(state.run!).map(creatureName);
    return `\n\nLost forever: ${fallen.join(', ')}${up.length ? `\nFrom the bench: ${up.join(', ')} joined the team` : ''}`;
  }

  private onWin() {
    const run = state.run!;
    this.cancelAuto();
    this.controls.setVisible(false);
    const ab = run.activeBattle!;
    // Stage races pay double.
    const raceMult = run.race ? 2 : 1;
    const xp = Math.round(battleXp(this.enemies, this.kind, state.run!.floor) * (this.kind === 'battle' && run.passive === 'naturalist' ? 1.25 : 1) * raceMult);
    const coins = battleCoins(this.enemies, this.kind, run.heat ?? 0, run.twist ?? null) * raceMult;
    sfx.victory();
    this.cheer('player');
    playMusic(null);
    // Bookkeeping happens once, even if the page reloads before the reward choice.
    if (!ab.settled) {
      run.log.battlesWon += 1;
      trackStat(run, 'battlesWon');
      if (teamSynergy(run.team).length) trackStat(run, 'synergyWins');
      const fallen = this.fallenNote();
      postBattleRecover(run);
      ab.summary = fallen;
      // Wild creatures sometimes leave an Evolution Stone behind.
      if (this.kind === 'battle' && run.rng.chance(BALANCE.stoneDropChance[run.floor] ?? 0)) {
        run.evoStones += 1;
        ab.summary = `\n\n◆ It dropped an Evolution Stone!${fallen}`;
      }
      if (this.kind === 'elite') {
        // Half the time a trainer pays a stone; Big Game Hunter always gets one on top.
        const stones = (run.passive === 'hunter' ? 1 : 0) + (run.rng.chance(BALANCE.eliteStoneChance) ? 1 : 0);
        run.evoStones += stones;
        earnCoins(run, coins);
        trackStat(run, 'elites');
        // The trainer hands over one of their held items (or a random one).
        const theirs = this.enemies.map((e) => e.held).filter((h) => !!h);
        const prize = theirs.length ? run.rng.pick(theirs)! : rollHeld(run.rng);
        stash(run, prize);
        ab.summary = `${ab.trainer ?? 'The trainer'} pays out ◉ ${coins} coins, ${stones === 2 ? '2 Evolution Stones ◆◆, ' : stones === 1 ? 'an Evolution Stone ◆, ' : ''}and ${heldName(prize)} (in your bag)\n\n${this.xpLines(grantXp(run, xp, ab.fought))}${fallen}`;
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
      tip(this, 'catch');
      // It sways, weakened.
      this.tweens.add({ targets: this.enemySprite, angle: 6, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
      this.enemySprite.setAlpha(0.85);
    }
    const full = rosterFull(run);
    const bonusTag = wild ? { species: ' · +★ first catch!', type: ' · +★ type bonus!', none: '' }[catchBonus(run, wild.speciesId) ?? 'none'] : '';
    // Catches keep their prestige stars (plus the bonus).
    const starTag = wild && catchStars(run, wild) > 0 ? ` · ${'★'.repeat(catchStars(run, wild))}` : '';
    const level = wild ? catchLevel(run, wild) : 1;
    let chosen = false;
    // The one exception: in a two-Hexling wild battle, a shiny that fainted first can still be caught.
    const shinyFirst =
      this.kind === 'battle' && this.enemies.length === 2 && this.enemies[0].shiny && !isAlive(this.enemies[0]) ? this.enemies[0] : null;
    if (shinyFirst) {
      const sLevel = catchLevel(run, shinyFirst);
      const sStars = catchStars(run, shinyFirst);
      this.msg.setText(
        wild
          ? `The gilded ${creatureName(shinyFirst)} can still be caught! Catch it, catch the ${creatureName(wild)}, or finish for the rewards.`
          : `The gilded ${creatureName(shinyFirst)} can still be caught!`,
      );
      const half = wild ? (L.catchBtn.w - 8) / 2 : L.catchBtn.w;
      const sx = wild ? L.catchBtn.x - L.catchBtn.w / 2 + half / 2 : L.catchBtn.x;
      const btn = button(this, sx, L.catchBtn.y, half, L.catchBtn.h, `Catch ✦ ${creatureName(shinyFirst)}`, () => {
        if (chosen) return;
        chosen = true;
        if (!full) return this.doCatch(shinyFirst, fallen);
        this.pickRelease(`Catch ${creatureName(shinyFirst)}`, (out) => this.doCatch(shinyFirst, fallen, out), () => (chosen = false));
      }, { color: 0x7a5a1c, fontSize: wild ? 15 : 20, glyph: 'sparkle', badge: 'GILDED', sub: `Lv ${sLevel}${sStars ? ` · ${'★'.repeat(sStars)}` : ''}` });
      this.actions.add(btn);
    }
    if (wild) {
      // Beside the shiny's button when there is one.
      const half = shinyFirst ? (L.catchBtn.w - 8) / 2 : L.catchBtn.w;
      const cx = shinyFirst ? L.catchBtn.x + L.catchBtn.w / 2 - half / 2 : L.catchBtn.x;
      this.actions.add(
        button(this, cx, L.catchBtn.y, half, L.catchBtn.h, `Catch ${creatureName(wild)}`, () => {
          if (chosen) return;
          chosen = true;
          if (!full) return this.doCatch(wild, fallen);
          // Party full: release one to make room, or back out and keep deciding.
          this.pickRelease(`Catch ${creatureName(wild)}`, (out) => this.doCatch(wild, fallen, out), () => (chosen = false));
        }, {
          color: 0x3a4f7a,
          fontSize: shinyFirst ? 15 : 20,
          glyph: 'crystal',
          sub: shinyFirst
            ? `Lv ${level}${starTag}`
            : full
              ? `Party full: release one to make room · Lv ${level}${starTag}${bonusTag}`
              : `Forfeit the rewards · joins at Lv ${level}${starTag}${bonusTag}`,
        }),
      );
    }
    this.actions.add(
      button(this, L.catchBtn.x, wild ? L.finishY.wild : L.finishY.other, L.catchBtn.w, L.catchBtn.h, wild ? 'Continue' : 'Take rewards', () => {
        if (chosen) return;
        chosen = true;
        this.finishWild(wild, xp, coins, fallen);
      }, { color: 0x3b6d4a, fontSize: 20, sub: `${wild ? 'Finish it · ' : ''}+${xp} XP for the team · +${coins} coins`, glyph: wild ? 'swords' : 'coin' }),
    );
  }

  /** Choose a creature to release so a newcomer can take its place. */
  private pickRelease(title: string, onPick: (out: Creature) => void, onCancel: () => void) {
    const run = state.run!;
    const all = allCreatures(run);
    openPicker(this, {
      title,
      subtitle: 'Your party is full. Release one to make room; it leaves for good and the newcomer takes its spot. Held items go back to your bag.',
      options: all.map((c) => ({ creature: c, note: run.team.includes(c) ? 'Team' : 'Bench' })),
      onPick: (k) => onPick(all[k]),
      onCancel,
    });
  }

  private doCatch(wild: Creature, fallen: string, release?: Creature) {
    const run = state.run!;
    this.actions.setVisible(false);
    this.tweens.killTweensOf(this.enemySprite);
    this.clearAura('enemy');
    this.enemySprite.setVisible(false);
    const wasStarter = isUnlockedStarter(run, wild.speciesId);
    const releasedName = release ? creatureName(release) : '';
    const { c, bonus: kind, newlyClaimed } = catchCreature(run, wild, release)!;
    const where = run.team.includes(c) ? 'team' : 'bench';
    const releasedNote = release ? `${releasedName} was released.\n\n` : '';
    const bonus =
      kind === 'species'
        ? `\n\n★ First of its kind! New Hexlidex entry: +1 prestige star.`
        : kind === 'type'
          ? `\n\n★ Type bonus: +1 prestige star. ${newlyClaimed.join(' and ')} is now used up for this run.`
          : '';
    const starterNote = wasStarter ? '' : `\n\nNew starter unlocked: ${species(c).names[0]}!`;
    run.activeBattle = null;
    persist();
    this.msg.setText(`You throw a bond crystal at ${creatureName(wild)}!`);
    playCatch(
      this,
      ensureCreatureTexture(this, wild.speciesId, wild.stage, wild.shiny),
      5 * SPRITE_FIT,
      { x: PLAYER_POS.x + 30, y: PLAYER_POS.y - 30 },
      ENEMY_POS,
      ELEMENT_COLORS[creatureTypes(wild)[0]],
      kind === 'species' || kind === 'type',
      () => {
        cry(c.speciesId, c.stage);
        showMessage(this, 'Caught!', `${releasedNote}${creatureName(c)} joined your ${where} at Lv ${c.level}.${bonus}${starterNote}${fallen}`, () => this.toMap());
      },
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
    const evolvable = allCreatures(run).filter(readyToEvolve);
    const full = rosterFull(run);
    openPicker(this, {
      title: 'Choose a boon',
      subtitle: 'The guardian\u2019s power is yours to claim.',
      options: [
        { label: 'Full heal', sub: 'Heal your team and bench to full', color: 0x16614f },
        { label: 'Team prestige', sub: 'Every Hexling on your main team gains ★', color: 0x7a2a5a },
        { label: 'Evolve one', sub: evolvable.length ? 'Evolve a Hexling that has reached its evolution level' : 'No Hexling has reached its evolution level (Lv 30 / 65)', color: 0x4a2f7a, disabled: evolvable.length === 0 },
        {
          label: 'Claim a guardian',
          sub: full
            ? `Joins at its level +${GUARDIAN_BONUS_LEVELS}, already evolved (release one to make room)`
            : `One of its Hexlings joins you at its level +${GUARDIAN_BONUS_LEVELS}, already evolved`,
          color: 0x2f4a7a,
        },
      ],
      onPick: (i) => {
        if (i === 0) {
          for (const c of allCreatures(run)) healFraction(c, 1);
          this.finishFloor('Your Hexlings are fully healed.');
        } else if (i === 1) {
          let notes = '';
          run.team.forEach((c) => {
            const lv = c.level;
            if (canPrestige(c) && prestigeTracked(run, c) && c.level > lv) notes += `\n${creatureName(c)}: stored XP +${c.level - lv} lv`;
          });
          this.finishFloor(`Your team glows with prestige!${notes}`);
        } else if (i === 2) {
          openPicker(this, {
            title: 'Evolve which Hexling?',
            options: allCreatures(run).map((c) => ({ creature: c, disabled: !readyToEvolve(c), note: canEvolve(c) && !readyToEvolve(c) ? `Evolves at Lv ${evolveLevel(c)}` : undefined })),
            onPick: (k) => {
              const c = allCreatures(run)[k];
              const from = creatureName(c);
              const fromKey = ensureCreatureTexture(this, c.speciesId, c.stage, c.shiny);
              const lv = c.level;
              evolveTracked(run, c);
              const note = releaseNote(c, lv);
              dex.creature(c, true);
              const toKey = ensureCreatureTexture(this, c.speciesId, c.stage, c.shiny);
              playEvolution(this, fromKey, toKey, 5 * SPRITE_FIT, ELEMENT_COLORS[creatureTypes(c)[0]], () => {
                cry(c.speciesId, c.stage);
                this.finishFloor(`${from} evolved into ${creatureName(c)}!${note}`);
              });
            },
          });
        } else {
          // Preview each guardian as it would join: its level +5, same form, full HP.
          const top = Math.max(...this.enemies.map((e) => e.stage));
          const guardians = this.enemies.filter((e) => e.stage === top);
          const previews = guardians.map((e) => {
            const p = { ...e, level: guardianLevel(run, e), stars: 0, held: undefined, status: undefined, hp: 1 };
            p.hp = stats(p).hp;
            return p;
          });
          openPicker(this, {
            title: 'Claim a guardian',
            subtitle: `It joins ${GUARDIAN_BONUS_LEVELS} levels above its own level, in its evolved form, at full health.`,
            options: previews.map((p) => ({ creature: p })),
            onPick: (k) => {
              const claim = (release?: Creature) => {
                const releasedNote = release ? `${creatureName(release)} was released.\n` : '';
                const c = claimGuardian(run, guardians[k], release)!;
                dex.creature(c, true);
                const where = run.team.includes(c) ? 'team' : 'bench';
                this.finishFloor(`${releasedNote}${creatureName(c)} joined your ${where}!`);
              };
              if (!full) return claim();
              this.pickRelease(`Claim ${creatureName(guardians[k])}`, claim, () => this.bossReward());
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
    this.toMap(
      run.hunt
        ? `${note}\n\nThe hunt goes deeper: floor ${run.hunt.depth}, the ${run.map.biome} lands. Enemies grow stronger.`
        : `${note}\n\nYou climb to the ${run.map.biome} lands.`,
    );
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
