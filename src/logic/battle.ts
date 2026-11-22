import { BOND_ENDURE, bondHearts } from '../data/natures';
import { BALANCE } from '../data/balance';
import { WEATHER, WEATHER_CHIP, WEATHER_IDS, weatherMult, weatherShort, weatherTurns, type WeatherId } from '../data/moves';
import { attackEl, attackValue, bulwarkRepeat, effectsAtTier, speedPower, warpTurns, healAtTier, MAX_STAGE, mendHeal, STAT_LABEL, TEAM_FX, teamFxTurns, TIER_POWER, type MoveDef, type StatKey, type TeamFxId } from '../data/moves';
import type { BossRule } from '../data/trainers';
import type { Element } from '../data/types';
import { effectivenessLabel, RESIST, stabMultiplier, typeMultiplier } from '../data/types';
import { creatureName, creatureTypes, fallbackMove, hasUses, isAlive, levelFactor, moveDef, spendUse, stats, usesLeft, type Creature, type MoveSlot } from './creature';
import { Rng } from './rng';
import { STATUS, type StatusId } from '../data/status';
import { TRAITS, traitOf, traitValue, type TraitId } from '../data/traits';
import { ELEMENTS } from '../data/types';

export type Side = 'player' | 'enemy';

export interface Combatant {
  c: Creature;
  atkStage: number;
  defStage: number;
  spdStage: number;
  /** Major status condition, if any, and the turns it has left. */
  status: StatusId | null;
  statusTurns: number;
  /** Team synergy multipliers (player side only). */
  syn?: { atk: number; def: number; spd: number };
  /** Last Stand Sash: 'fired' right after it saved the holder, then 'spent'. */
  sash?: 'fired' | 'spent';
  /** Bulwark is up this turn. */
  guarded?: boolean;
  /** Bond: 'fired' right after it hung on at 1 HP for you, then 'spent' (once a battle). */
  bonded?: 'fired' | 'spent';
  /** Bulwarks that held in a row (each one after the first is much less likely to). */
  guardStreak?: number;
  /** Traits: turns since it entered, whether its first move is used, Steadfast / Second Skin, Iron Will. */
  turnsIn?: number;
  eagerUsed?: boolean;
  endured?: 'fired' | 'spent';
  willUsed?: boolean;
  /** Avenger: the turn it's fired up for (the one after an ally fainted). */
  avenge?: number;
  /** Boons: Bedrock's first hit taken, Phantom Step used, Rampage knockouts, Forged's Defense gained. */
  bedrock?: boolean;
  phantom?: boolean;
  rampage?: number;
  forged?: number;
}

/** Element Touch: the status each element's hits can cause. */
const TOUCH_STATUS: Record<Element, StatusId> = {
  Fire: 'burn', Dragon: 'burn', Frost: 'freeze', Storm: 'para', Earth: 'para', Metal: 'para', Toxic: 'poison', Nature: 'poison',
  Spirit: 'sleep', Shadow: 'sleep', Light: 'confuse', Water: 'confuse',
};

/** Thornwall: your hits on their Hexlings cut you for this share of the damage. */
export const THORNS_RECOIL = 0.1;
/** Overclock: their Attack climbs one stage a turn, up to this many. */
export const OVERCLOCK_MAX = 3;

/** What a battle in progress needs to pick up exactly where it was after a reload. */
export interface BattleState {
  pActive: number;
  eActive: number;
  stages: { player: [number, number, number][]; enemy: [number, number, number][] };
  sash: { player: (string | null)[]; enemy: (string | null)[] };
  teamFx: Battle['teamFx'];
  potions: number | null;
  winded: number[];
  turnNo: number;
  lastEnemySwitch: number;
  night?: boolean;
  /** Time Warp turns left. */
  warp?: number;
  /** uids that already hung on through their bond this battle. */
  bonded?: number[];
  weather?: WeatherId | null;
  weatherLeft?: number;
}

export type PlayerAction =
  | { kind: 'move'; index: number }
  | { kind: 'swap'; index: number }
  /** Heal a party member by `heal` (fraction of max HP); uses the turn. */
  | { kind: 'potion'; index: number; heal: number };

export type BattleEvent =
  | { kind: 'text'; text: string }
  /** hp: the newcomer's HP at the moment it enters (later events in the turn may change it). */
  | { kind: 'swap'; side: Side; index: number; hp: number }
  | { kind: 'attack'; side: Side; move: string; moveId: string; /** Team slot of the Hexling using it. */ slot?: number }
  | { kind: 'stat'; side: Side; up: boolean }
  /** `mult` is the type multiplier for attack hits; absent for recoil, poison and field damage. */
  | { kind: 'damage'; side: Side; hp: number; maxHp: number; amount: number; mult?: number; element?: Element }
  | { kind: 'heal'; side: Side; hp: number; maxHp: number }
  | { kind: 'faint'; side: Side; index: number }
  | { kind: 'enemySend'; index: number; hp: number }
  /** A status condition was gained (or cleared, when null). */
  | { kind: 'status'; side: Side; status: StatusId | null }
  /** A team effect went up (or wore off) on a side. */
  | { kind: 'team'; side: Side; fx: TeamFxId; on: boolean }
  /** The weather changed (null: it cleared). */
  | { kind: 'weather'; id: WeatherId | null }
  /** A boon kicked in (2.0): the screen shows a callout. */
  | { kind: 'boon'; side: Side; id: string };

export type BattleOutcome = 'ongoing' | 'win' | 'lose' | 'needSwitch';

/** How much a stat stage changes a stat: +1 is x1.25, up to +4 x2; -1 is x0.8, down to -4 x0.5 (stages cap at MAX_STAGE). */
export const stageMult = (s: number) => (s >= 0 ? 1 + 0.25 * s : 1 / (1 + 0.25 * -s));

export class Battle {
  readonly player: Combatant[];
  readonly enemy: Combatant[];
  pActive: number;
  /** uids of player creatures that have been sent out (they earn full XP). */
  readonly fought = new Set<number>();
  eActive = 0;
  private rng: Rng;
  private playerDamageMult: number;
  private enemyDamageMult: number;
  private playerStatusMult: number;
  private playerImmune: StatusId[];
  private reserve: Creature[];
  /** Chance the enemy picks a random move instead of its best one. */
  private enemyRandomness: number;
  private permadeath: boolean;
  /** Smarter trainer/guardian play (see enemyTactics); potions left. */
  tactics: { potions: number; name?: string } | null;
  /** Turn the enemy last switched voluntarily (no two switches in a row). */
  private lastEnemySwitch = -10;
  /** When auto-battle last switched your Hexling (so it doesn't switch back and forth). */
  private lastAutoSwitch = -10;
  private turnNo = 0;
  /** Turns played so far. */
  get turns(): number {
    return this.turnNo;
  }
  /** Set for duels between two people (see the constructor option). */
  readonly duel: { player: string; enemy: string } | null;
  /** Team effects up on each side, with turns left (see TEAM_FX). */
  teamFx: Record<Side, Partial<Record<TeamFxId, number>>> = { player: {}, enemy: {} };
  /** Time Warp: turns left in which the slower Hexling moves first (0: off). */
  warp = 0;
  /** The weather (set by a weather move) and its turns left. */
  weather: WeatherId | null = null;
  weatherLeft = 0;
  /** Night falls (Night Stalker, Eclipse): it lasts the battle. */
  night = false;
  /** Who moved first this turn (Patient). */
  private firstSide: Side | null = null;

  hasFx(side: Side, fx: TeamFxId): boolean {
    return (this.teamFx[side][fx] ?? 0) > 0;
  }

  private sideOf(x: Combatant): Side {
    return this.enemy.includes(x) ? 'enemy' : 'player';
  }

  private teamName(side: Side): string {
    return this.duel ? `${this.duel[side]}'s team` : side === 'enemy' ? "The enemy's team" : 'Your team';
  }

  /** A team move: put an effect on the user's side (or, for Mend, heal the whole side now). */
  private useTeamMove(side: Side, def: MoveDef, tier: number, ev: BattleEvent[]) {
    const fx = def.team!;
    const team = side === 'player' ? this.player : this.enemy;
    if (fx === 'mend') {
      let any = false;
      for (const x of team) {
        if (!isAlive(x.c)) continue;
        const max = stats(x.c).hp;
        const healed = x.c.hp < max;
        x.c.hp = Math.min(max, x.c.hp + Math.ceil(max * mendHeal(tier)));
        const active = x === (side === 'player' ? this.p : this.e);
        if (healed && active) ev.push({ kind: 'heal', side, hp: x.c.hp, maxHp: max });
        if (x.status) {
          if (active) this.cure(x, side, ev);
          else x.status = null;
        }
        any = any || healed;
      }
      ev.push({ kind: 'text', text: any ? `${this.teamName(side)} is mended!` : `${this.teamName(side)} is already in good shape.` });
      return;
    }
    const was = this.hasFx(side, fx);
    this.teamFx[side][fx] = teamFxTurns(tier);
    ev.push({ kind: 'team', side, fx, on: true });
    ev.push({ kind: 'stat', side, up: true });
    ev.push({ kind: 'text', text: was ? `${TEAM_FX[fx].name} is renewed for ${this.teamName(side).toLowerCase()}!` : `${TEAM_FX[fx].name}: ${TEAM_FX[fx].desc.replace('your team', this.teamName(side).toLowerCase())}!` });
  }

  /** End of turn: team effects count down and wear off. */
  private tickTeamFx(ev: BattleEvent[]) {
    for (const side of ['player', 'enemy'] as const) {
      for (const fx of Object.keys(this.teamFx[side]) as TeamFxId[]) {
        const left = (this.teamFx[side][fx] ?? 0) - 1;
        if (left > 0) this.teamFx[side][fx] = left;
        else {
          delete this.teamFx[side][fx];
          ev.push({ kind: 'team', side, fx, on: false });
          ev.push({ kind: 'text', text: `${TEAM_FX[fx].name} wore off for ${this.teamName(side).toLowerCase()}.` });
        }
      }
    }
  }
  /** A floor boss's special rules (its own, plus extra ones at higher Heat). */
  readonly rules: BossRule[];
  private ruleNames: Partial<Record<BossRule, string>> = {};
  /** Second Wind: enemy creatures that have already used it. */
  private winded = new Set<number>();
  /** Bond hearts can save your Hexlings (runs only). */
  private bonds = false;
  /** Wild battles: the last enemy is left at 1 HP instead of fainting, so it can be caught. */
  private spareLast: boolean;
  /** The last enemy has been worn down to 1 HP: the battle is won and it awaits catch or finish. */
  spared: boolean;

  constructor(
    playerTeam: Creature[],
    enemyTeam: Creature[],
    rng: Rng = new Rng(),
    opts: {
      playerDamageMult?: number;
      /** Multiplies damage the enemy side deals (weekly Glass Cannon). */
      enemyDamageMult?: number;
      enemyRandomness?: number;
      /** Your fainted creatures are gone for good (runs); off for Arena and duels. */
      permadeath?: boolean;
      /**
       * Trainers and guardians: switch out of bad matchups, send in the best answer after a faint,
       * and use this many potions (heal 50%, cure status) when a creature is in trouble.
       */
      enemyTactics?: { potions: number; name?: string };
      /**
       * Duels between two people: names shown for each side ("Sam's Monolith"), and the enemy side
       * chooses its own next creature after a faint (see forcedEnemySwitch).
       */
      duel?: { player: string; enemy: string };
      rule?: BossRule;
      ruleName?: string;
      /** Several rules at once (a guardian at Heat 4+); takes the place of rule/ruleName. */
      rules?: { rule: BossRule; name: string }[];
      spareLast?: boolean;
      spared?: boolean;
      /** Team synergy multipliers for the player's creatures. */
      synergy?: { atk: number; def: number; spd: number };
      /** Team synergy for the enemy side (floor bosses). */
      enemySynergy?: { atk: number; def: number; spd: number };
      /** Chance multiplier for the player's moves inflicting a status (Afflicter). */
      playerStatusMult?: number;
      /** Statuses the player's creatures can't get (Tempered). */
      playerStatusImmune?: StatusId[];
      /** The player's bench: not in this battle, but their status timers still run. */
      reserve?: Creature[];
      /** Runs: your Hexlings' bond hearts can let them hang on at 1 HP. */
      bond?: boolean;
      /** Boons (2.0) on each side (runs: yours; duels: both people's). */
      boons?: { player: string[]; enemy: string[] };
      /** Coins you hold (Hoard). */
      coins?: number;
      /** Second Wind: asked when one of yours would faint; true if it's still unused this floor. */
      secondWind?: () => boolean;
      /** Surprises: an Eclipse floor's battles are at night; a Storm Front's open in weather. */
      night?: boolean;
      weather?: WeatherId | null;
    } = {},
  ) {
    this.playerDamageMult = opts.playerDamageMult ?? 1;
    this.enemyDamageMult = opts.enemyDamageMult ?? 1;
    this.enemyRandomness = opts.enemyRandomness ?? 0.25;
    this.permadeath = opts.permadeath ?? true;
    this.tactics = opts.enemyTactics ? { ...opts.enemyTactics } : null;
    this.duel = opts.duel ?? null;
    const list = opts.rules ?? (opts.rule ? [{ rule: opts.rule, name: opts.ruleName ?? 'The field' }] : []);
    this.rules = list.map((x) => x.rule);
    for (const x of list) this.ruleNames[x.rule] = x.name;
    this.spareLast = opts.spareLast ?? false;
    this.spared = opts.spared ?? false;
    this.player = playerTeam.map(fresh);
    if (opts.synergy) for (const x of this.player) x.syn = opts.synergy;
    this.playerStatusMult = opts.playerStatusMult ?? 1;
    this.playerImmune = opts.playerStatusImmune ?? [];
    this.reserve = opts.reserve ?? [];
    this.bonds = opts.bond ?? false;
    this.enemy = enemyTeam.map(fresh);
    if (opts.enemySynergy) for (const x of this.enemy) x.syn = opts.enemySynergy;
    this.pActive = Math.max(0, this.player.findIndex((p) => isAlive(p.c)));
    this.eActive = Math.max(0, this.enemy.findIndex((e) => isAlive(e.c)));
    if (this.player[this.pActive]) this.fought.add(this.player[this.pActive].c.uid);
    this.rng = rng;
    this.boonSets = { player: new Set(opts.boons?.player ?? []), enemy: new Set(opts.boons?.enemy ?? []) };
    this.coins = opts.coins ?? 0;
    this.windAsk = opts.secondWind ?? null;
    if (opts.night) this.night = true;
    if (opts.weather) this.setWeather(opts.weather, 5);
  }

  // Boons (2.0).
  private boonSets: Record<Side, Set<string>>;
  private coins: number;
  private windAsk: (() => boolean) | null;
  private windUsed: Record<Side, boolean> = { player: false, enemy: false };
  private firstMoved: Record<Side, boolean> = { player: false, enemy: false };
  private nightfallNext: Record<Side, boolean> = { player: false, enemy: false };

  /** The battle's in-progress state (stat stages, who's out, potions left...), for saving. */
  saveState(): BattleState {
    const st = (xs: Combatant[]) => xs.map((x) => [x.atkStage, x.defStage, x.spdStage] as [number, number, number]);
    const sa = (xs: Combatant[]) => xs.map((x) => x.sash ?? null);
    return {
      pActive: this.pActive,
      eActive: this.eActive,
      stages: { player: st(this.player), enemy: st(this.enemy) },
      sash: { player: sa(this.player), enemy: sa(this.enemy) },
      teamFx: { player: { ...this.teamFx.player }, enemy: { ...this.teamFx.enemy } },
      potions: this.tactics ? this.tactics.potions : null,
      winded: [...this.winded],
      turnNo: this.turnNo,
      lastEnemySwitch: this.lastEnemySwitch,
      warp: this.warp,
      weather: this.weather,
      weatherLeft: this.weatherLeft,
      night: this.night,
      bonded: this.player.filter((x) => x.bonded).map((x) => x.c.uid),
    };
  }

  /** Put back a saved state (after start(true), so entry effects don't stack on top of it). */
  restoreState(s: BattleState | undefined) {
    if (!s) return;
    const put = (xs: Combatant[], stages: [number, number, number][] = [], sash: (string | null)[] = []) =>
      xs.forEach((x, i) => {
        const v = stages[i];
        if (v) [x.atkStage, x.defStage, x.spdStage] = v.map((n) => Math.max(-MAX_STAGE, Math.min(MAX_STAGE, Number(n) || 0))) as [number, number, number];
        const sh = sash[i];
        x.sash = sh === 'fired' || sh === 'spent' ? sh : undefined;
      });
    put(this.player, s.stages?.player, s.sash?.player);
    put(this.enemy, s.stages?.enemy, s.sash?.enemy);
    if (this.player[s.pActive] && isAlive(this.player[s.pActive].c)) this.pActive = s.pActive;
    if (this.enemy[s.eActive] && isAlive(this.enemy[s.eActive].c)) this.eActive = s.eActive;
    if (s.teamFx) this.teamFx = { player: { ...s.teamFx.player }, enemy: { ...s.teamFx.enemy } };
    if (this.tactics && typeof s.potions === 'number') this.tactics.potions = s.potions;
    this.winded = new Set(s.winded ?? []);
    this.turnNo = s.turnNo ?? this.turnNo;
    this.lastEnemySwitch = s.lastEnemySwitch ?? this.lastEnemySwitch;
    this.warp = Math.max(0, Math.min(9, Number(s.warp) || 0));
    this.setWeather(s.weather, s.weatherLeft);
    this.night = !!s.night;
    if (Array.isArray(s.bonded)) for (const x of this.player) if (s.bonded.includes(x.c.uid)) x.bonded = 'spent';
  }

  /**
   * Applies entry effects for the opening creatures. Call once when the battle starts.
   * When resuming a saved battle, pass true to skip effects that cost HP (they already happened).
   */
  start(resuming = false): BattleEvent[] {
    const ev: BattleEvent[] = [];
    if (this.enemy[this.eActive]) this.onEnter('enemy', ev);
    if (this.player[this.pActive]) this.onEnter('player', ev, resuming);
    // Plague Bearer: the foe's first Hexling starts poisoned.
    if (!resuming)
      for (const side of ['player', 'enemy'] as const) {
        const foe = side === 'player' ? this.e : this.p;
        if (this.hb(side, 'plaguebearer') && foe && isAlive(foe.c) && !foe.status) {
          this.boonCall(side, 'plaguebearer', ev);
          this.inflict(foe, side === 'player' ? 'enemy' : 'player', 'poison', ev, 'Plague Bearer: ', { x: side === 'player' ? this.p : this.e, side });
        }
      }
    return ev;
  }

  /** Boss rules that trigger when a creature enters battle. */
  private onEnter(side: Side, ev: BattleEvent[], skipHpCost = false) {
    this.traitsOnEnter(side, ev, skipHpCost);
    this.boonsOnEnter(side, ev, skipHpCost);
    if (!this.rules.length) return;
    const x = side === 'player' ? this.p : this.e;
    if (!isAlive(x.c)) return;
    if (side === 'enemy') {
      if (this.has('bulwark')) this.ruleBump(x, side, 'def', 1, ev, 'bulwark');
      if (this.has('pride') && this.eActive === this.enemy.length - 1) {
        this.ruleBump(x, side, 'atk', 1, ev, 'pride');
        this.ruleBump(x, side, 'spd', 1, ev, 'pride');
      }
      return;
    }
    if (this.has('whiteout')) this.ruleBump(x, side, 'spd', -1, ev, 'whiteout');
    if (this.has('dread')) this.ruleBump(x, side, 'atk', -1, ev, 'dread');
    if (this.has('brittle')) this.ruleBump(x, side, 'def', -1, ev, 'brittle');
    if (this.has('miasma') && !x.status) this.inflict(x, side, 'poison', ev, `${this.rn('miasma')}: `);
    if (this.has('static') && !x.status && !skipHpCost && this.rng.chance(0.35)) this.inflict(x, side, 'para', ev, `${this.rn('static')}: `);
    if (this.has('riptide') && !skipHpCost) {
      const max = stats(x.c).hp;
      const dmg = Math.min(x.c.hp - 1, Math.max(1, Math.floor(max / 8)));
      if (dmg > 0) {
        x.c.hp -= dmg;
        ev.push({ kind: 'damage', side, hp: x.c.hp, maxHp: max, amount: dmg });
        ev.push({ kind: 'text', text: `${this.rn('riptide')}: ${creatureName(x.c)} is battered by the current!` });
      }
    }
  }

  /** Is this rule in play? */
  has(r: BossRule): boolean {
    return this.rules.includes(r);
  }

  /** A rule's name, for messages. */
  private rn(r: BossRule): string {
    return this.ruleNames[r] ?? 'The field';
  }

  private ruleBump(x: Combatant, side: Side, stat: StatKey, by: number, ev: BattleEvent[], rule: BossRule) {
    const key = stageKey(stat);
    const before = x[key];
    x[key] = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, before + by));
    if (x[key] === before) return;
    ev.push({ kind: 'stat', side, up: by > 0 });
    ev.push({ kind: 'text', text: `${this.rn(rule)}: ${creatureName(x.c)}'s ${STAT_LABEL[stat]} ${by > 0 ? 'rose' : 'fell'}!` });
  }

  get p(): Combatant {
    return this.player[this.pActive];
  }

  get e(): Combatant {
    return this.enemy[this.eActive];
  }

  outcome(): BattleOutcome {
    // A double knockout (e.g. recoil on the final blow) counts as a loss.
    if (this.player.every((x) => !isAlive(x.c))) return 'lose';
    if (this.spared || this.enemy.every((x) => !isAlive(x.c))) return 'win';
    if (!isAlive(this.p.c)) return 'needSwitch';
    return 'ongoing';
  }

  canSwapTo(index: number): boolean {
    return index !== this.pActive && !!this.player[index] && isAlive(this.player[index].c);
  }

  /** Free switch after your active creature faints. */
  forcedSwitch(index: number): BattleEvent[] {
    if (!this.canSwapTo(index)) return [];
    this.pActive = index;
    this.fought.add(this.p.c.uid);
    resetStages(this.p);
    const ev: BattleEvent[] = [
      { kind: 'swap', side: 'player', index, hp: this.p.c.hp },
      { kind: 'text', text: `Go, ${creatureName(this.p.c)}!` },
    ];
    this.onEnter('player', ev);
    return ev;
  }

  takeTurn(action: PlayerAction): BattleEvent[] {
    const ev: BattleEvent[] = [];
    this.turnNo++;
    this.firstSide = null;
    // Trainers may switch or drink a potion instead of attacking; that happens first.
    const plan = this.enemyPlan();
    if (plan) this.doEnemyPlan(plan, ev);
    const enemyMove = plan ? null : this.chooseEnemyMove();

    if (action.kind === 'potion') {
      const x = this.player[action.index];
      if (!x || !isAlive(x.c)) return ev;
      const max = stats(x.c).hp;
      const hurt = x.c.hp < max;
      x.c.hp = Math.min(max, x.c.hp + Math.ceil(max * action.heal));
      ev.push({ kind: 'text', text: `You use a Potion on ${creatureName(x.c)}.` });
      if (x === this.p && hurt) ev.push({ kind: 'heal', side: 'player', hp: x.c.hp, maxHp: max });
      if (hurt) ev.push({ kind: 'text', text: `${creatureName(x.c)} recovered health!` });
      // Potions also cure status conditions.
      if (x.status) {
        if (x === this.p) this.cure(x, 'player', ev);
        else {
          x.status = null;
          ev.push({ kind: 'text', text: `${creatureName(x.c)} is cured!` });
        }
      }
      if (isAlive(this.p.c) && enemyMove) this.useMove('enemy', enemyMove, ev);
    } else if (action.kind === 'swap') {
      if (!this.canSwapTo(action.index)) return ev;
      ev.push({ kind: 'text', text: `${creatureName(this.p.c)}, come back!` });
      this.leaving(this.p, 'player', ev);
      this.pActive = action.index;
      this.fought.add(this.p.c.uid);
      resetStages(this.p);
      ev.push({ kind: 'swap', side: 'player', index: action.index, hp: this.p.c.hp });
      ev.push({ kind: 'text', text: `Go, ${creatureName(this.p.c)}!` });
      this.onEnter('player', ev);
      this.benchPress('player', ev);
      if (isAlive(this.p.c) && enemyMove) this.useMove('enemy', enemyMove, ev);
    } else {
      const enemyAtStart = this.e;
      // A move with no uses left (or index -1) falls back to the creature's basic attack.
      const chosen = this.p.c.moves[action.index];
      const pSlot = chosen && hasUses(chosen) ? chosen : fallbackMove(this.p.c);
      const pPri = !!moveDef(pSlot).priority || this.clawProc(this.p) || this.slipping(this.p) || this.firstStrike('player');
      const ePri = !!enemyMove && (!!moveDef(enemyMove).priority || this.clawProc(this.e) || this.slipping(this.e) || this.firstStrike('enemy'));
      const playerFirst = pPri !== ePri ? pPri : this.has('tailwind') ? false : this.playerGoesFirst();
      const order = playerFirst ? (['player', 'enemy'] as const) : (['enemy', 'player'] as const);
      this.firstSide = order[0];
      for (const side of order) {
        // A spared creature is too weak to act; the battle is over.
        if (this.spared) break;
        // A freshly sent-in enemy doesn't act on the turn its predecessor fainted.
        if (side === 'enemy' && this.e !== enemyAtStart) continue;
        const actor = side === 'player' ? this.p : this.e;
        if (!isAlive(actor.c)) continue;
        const target = side === 'player' ? this.e : this.p;
        if (!isAlive(target.c)) continue;
        const slot = side === 'player' ? pSlot : enemyMove;
        if (!slot) continue;
        this.useMove(side, slot, ev);
      }
    }

    this.endOfTurn(ev);
    return ev;
  }

  // ------------------------------------------------------------ duels

  canEnemySwapTo(index: number): boolean {
    return index !== this.eActive && !!this.enemy[index] && isAlive(this.enemy[index].c);
  }

  /** In a duel, the enemy side's active creature fainted and it has to pick another. */
  enemyNeedsSwitch(): boolean {
    return !isAlive(this.e.c) && this.enemy.some((x) => isAlive(x.c));
  }

  /** In a duel, your active creature fainted and you have to pick another. */
  playerNeedsSwitch(): boolean {
    return !isAlive(this.p.c) && this.player.some((x) => isAlive(x.c));
  }

  /** Duel: the enemy side sends in its choice after a faint. */
  forcedEnemySwitch(index: number): BattleEvent[] {
    if (!this.canEnemySwapTo(index)) return [];
    const ev: BattleEvent[] = [];
    this.sendEnemy(index, ev);
    return ev;
  }

  private sendEnemy(index: number, ev: BattleEvent[]) {
    this.leaving(this.e, 'enemy', ev);
    this.eActive = index;
    resetStages(this.e);
    ev.push({ kind: 'enemySend', index, hp: this.e.c.hp });
    ev.push({ kind: 'text', text: `${this.duel?.enemy ?? this.tactics?.name ?? 'The enemy'} sends out ${creatureName(this.e.c)}!` });
    this.onEnter('enemy', ev);
  }

  /**
   * A duel turn: both sides are people. Switches happen first, then potions, then moves in
   * priority / speed order, then end-of-turn effects.
   */
  takeDuelTurn(pAct: PlayerAction, eAct: PlayerAction): BattleEvent[] {
    const ev: BattleEvent[] = [];
    this.turnNo++;
    this.firstSide = null;
    const names = this.duel ?? { player: 'You', enemy: 'The enemy' };
    if (pAct.kind === 'swap' && this.canSwapTo(pAct.index)) {
      ev.push({ kind: 'text', text: `${names.player} calls back ${creatureName(this.p.c)}.` });
      this.leaving(this.p, 'player', ev);
      this.pActive = pAct.index;
      this.fought.add(this.p.c.uid);
      resetStages(this.p);
      ev.push({ kind: 'swap', side: 'player', index: pAct.index, hp: this.p.c.hp });
      ev.push({ kind: 'text', text: `${names.player} sends out ${creatureName(this.p.c)}!` });
      this.onEnter('player', ev);
      this.benchPress('player', ev);
    }
    if (eAct.kind === 'swap' && this.canEnemySwapTo(eAct.index)) {
      ev.push({ kind: 'text', text: `${names.enemy} calls back ${creatureName(this.e.c)}.` });
      this.sendEnemy(eAct.index, ev);
      this.benchPress('enemy', ev);
    }
    // Potions next (the caller has checked each side still has one).
    const potion = (side: Side, act: PlayerAction) => {
      if (act.kind !== 'potion') return;
      const x = (side === 'player' ? this.player : this.enemy)[act.index];
      if (!x || !isAlive(x.c)) return;
      const active = side === 'player' ? this.p : this.e;
      const max = stats(x.c).hp;
      const hurt = x.c.hp < max;
      x.c.hp = Math.min(max, x.c.hp + Math.ceil(max * Math.max(0, Math.min(1, act.heal))));
      ev.push({ kind: 'text', text: `${names[side]} uses a Potion on ${creatureName(x.c)}.` });
      if (x === active && hurt) ev.push({ kind: 'heal', side, hp: x.c.hp, maxHp: max });
      if (hurt) ev.push({ kind: 'text', text: `${creatureName(x.c)} recovered health!` });
      if (x.status) {
        if (x === active) this.cure(x, side, ev);
        else {
          x.status = null;
          ev.push({ kind: 'text', text: `${creatureName(x.c)} is cured!` });
        }
      }
    };
    potion('player', pAct);
    potion('enemy', eAct);
    const slotFor = (act: PlayerAction, c: Creature): MoveSlot | null => {
      if (act.kind !== 'move') return null;
      const m = c.moves[act.index];
      return m && hasUses(m) ? m : fallbackMove(c);
    };
    const pSlot = slotFor(pAct, this.p.c);
    const eSlot = slotFor(eAct, this.e.c);
    const pAt = this.p;
    const eAt = this.e;
    let order: Side[] = [];
    if (pSlot && eSlot) {
      const pPri = !!moveDef(pSlot).priority || this.clawProc(this.p) || this.slipping(this.p) || this.firstStrike('player');
      const ePri = !!moveDef(eSlot).priority || this.clawProc(this.e) || this.slipping(this.e) || this.firstStrike('enemy');
      order = (pPri !== ePri ? pPri : this.playerGoesFirst()) ? ['player', 'enemy'] : ['enemy', 'player'];
      this.firstSide = order[0];
    } else if (pSlot) order = ['player'];
    else if (eSlot) order = ['enemy'];
    for (const side of order) {
      // A creature that was knocked out (or replaced) this turn doesn't get to act.
      const actor = side === 'player' ? this.p : this.e;
      if (actor !== (side === 'player' ? pAt : eAt) || !isAlive(actor.c)) continue;
      const target = side === 'player' ? this.e : this.p;
      if (!isAlive(target.c)) continue;
      this.useMove(side, side === 'player' ? pSlot! : eSlot!, ev);
    }
    this.endOfTurn(ev);
    return ev;
  }

  // ------------------------------------------------------------ traits (2.0)

  private is(x: Combatant, id: TraitId): boolean {
    return traitOf(x.c) === id;
  }

  private tv(x: Combatant, id: TraitId): number {
    return traitValue(x.c, id);
  }

  /** "Enemy Magmite's Magma Skin" */
  private traitName(x: Combatant, side: Side): string {
    const t = traitOf(x.c);
    return `${this.nameOf(side, x.c)}'s ${t ? TRAITS[t].name : 'trait'}`;
  }

  private traitsOnEnter(side: Side, ev: BattleEvent[], resuming: boolean) {
    const x = side === 'player' ? this.p : this.e;
    if (!x || !isAlive(x.c)) return;
    x.turnsIn = 0;
    x.eagerUsed = false;
    if (resuming) return;
    const t = traitOf(x.c);
    if (!t) return;
    const who = this.traitName(x, side);
    const foeSide: Side = side === 'player' ? 'enemy' : 'player';
    const foe = foeSide === 'player' ? this.p : this.e;
    const turns = x.c.stage >= 2 ? 3 : 2;
    switch (t) {
      case 'sunseeker':
        return this.traitWeather('sun', turns, who, ev);
      case 'rainrider':
        return this.traitWeather('rain', turns, who, ev);
      case 'sandshroud':
        return this.traitWeather('dust', turns, who, ev);
      case 'daybreak':
        return this.traitWeather('sun', this.tv(x, t), who, ev);
      case 'tidalcrown':
        return this.traitWeather('rain', this.tv(x, t), who, ev);
      case 'whiteoutveil':
        return this.traitWeather('hail', this.tv(x, t), who, ev);
      case 'nightstalker':
        return this.fallNight(who, ev);
      case 'eclipse':
        this.fallNight(who, ev);
        if (foe && isAlive(foe.c)) {
          this.bump(foe, foeSide, 'spd', -1, ev, true);
          if (this.tv(x, t) >= 2) this.bump(foe, foeSide, 'atk', -1, ev, true);
        }
        return;
      case 'quickstart':
        ev.push({ kind: 'text', text: `${who}: it's off to a quick start!` });
        return;
    }
  }

  /** A trait brings its weather (or keeps it going). */
  private traitWeather(w: WeatherId, turns: number, who: string, ev: BattleEvent[]) {
    const d = WEATHER[w];
    if (this.weather === w) {
      this.weatherLeft = Math.max(this.weatherLeft, turns);
      ev.push({ kind: 'text', text: `${who} keeps the ${d.name.toLowerCase()} going! (${this.weatherLeft} turns)` });
      return;
    }
    this.weather = w;
    this.weatherLeft = turns;
    ev.push({ kind: 'weather', id: w });
    ev.push({ kind: 'text', text: `${who}: ${d.start} ${weatherShort(w)} for ${turns} turns.` });
  }

  private fallNight(who: string, ev: BattleEvent[]) {
    if (this.night) return;
    this.night = true;
    ev.push({ kind: 'text', text: `${who}: night falls over the battle.` });
  }

  /** Speed from traits: Quick Start's first turns, Night Stalker at night, Rain Rider in rain. */
  private traitSpeed(x: Combatant): number {
    const t = traitOf(x.c);
    if (t === 'quickstart' && (x.turnsIn ?? 0) < 2) return stageMult(this.tv(x, t));
    if (t === 'nightstalker' && this.night) return stageMult(1);
    if (t === 'rainrider' && this.weather === 'rain') return stageMult(this.tv(x, t));
    return 1;
  }

  /** Slipstream: moves first while low. */
  private slipping(x: Combatant): boolean {
    return this.is(x, 'slipstream') && isAlive(x.c) && x.c.hp < stats(x.c).hp * this.tv(x, 'slipstream');
  }

  /** Regenerator: heals as it leaves the field. */
  private leaving(x: Combatant, side: Side, ev: BattleEvent[]) {
    if (!x || !isAlive(x.c) || !this.is(x, 'regenerator')) return;
    const max = stats(x.c).hp;
    if (x.c.hp >= max) return;
    x.c.hp = Math.min(max, x.c.hp + Math.ceil(max * this.tv(x, 'regenerator')));
    ev.push({ kind: 'text', text: `${this.traitName(x, side)}: it recovers as it pulls back.` });
  }

  /** Unshakable: foes can't lower its Attack (final form: any stat). */
  private unshaken(x: Combatant, side: Side, stat: StatKey, ev: BattleEvent[]): boolean {
    // Rootbound and Halo (boons): Nature / Light Hexlings' stats can't be lowered.
    const t = creatureTypes(x.c);
    for (const [id, el] of [['rootbound', 'Nature'], ['halo', 'Light']] as const)
      if (this.hb(side, id) && t.includes(el)) {
        this.boonCall(side, id, ev);
        ev.push({ kind: 'text', text: `${this.label(x)}'s ${STAT_LABEL[stat]} won't drop!` });
        return true;
      }
    if (!this.is(x, 'unshakable') || (this.tv(x, 'unshakable') < 2 && stat !== 'atk')) return false;
    ev.push({ kind: 'text', text: `${this.traitName(x, side)}: its ${STAT_LABEL[stat]} won't drop!` });
    return true;
  }

  /** Absorbers: a hit of their element heals them instead. */
  private absorbs(x: Combatant, side: Side, el: Element, ev: BattleEvent[]): boolean {
    const t = traitOf(x.c);
    if (!t || TRAITS[t].absorb !== el || !isAlive(x.c)) return false;
    const max = stats(x.c).hp;
    x.c.hp = Math.min(max, x.c.hp + Math.ceil(max * this.tv(x, t)));
    ev.push({ kind: 'heal', side, hp: x.c.hp, maxHp: max });
    ev.push({ kind: 'text', text: `${this.traitName(x, side)} soaks up the ${el} hit!` });
    return true;
  }

  /** Ethereal: now and then a hit passes straight through. */
  private slipsThrough(x: Combatant, side: Side, ev: BattleEvent[]): boolean {
    if (!this.is(x, 'ethereal') || !this.rng.chance(this.tv(x, 'ethereal'))) return false;
    ev.push({ kind: 'text', text: `${this.traitName(x, side)}: the hit passes straight through it!` });
    return true;
  }

  /** Damage from the attacker's and the defender's traits (and benched Cheerleaders). */
  private traitMult(user: Combatant, target: Combatant, def: MoveDef, el: Element, powerMult: number, side: Side, rmult: number): number {
    let m = 1;
    const t = traitOf(user.c);
    const v = t ? this.tv(user, t) : 0;
    switch (t) {
      case 'heavy':
        if (def.power * powerMult >= 70) m *= 1 + v;
        break;
      case 'technician':
        if (def.power <= 45) m *= 1 + v;
        break;
      case 'adaptable':
        if (creatureTypes(user.c).includes(el)) m *= 1 + v;
        break;
      case 'berserk':
        if (user.c.hp < stats(user.c).hp / 2) m *= 1 + v;
        break;
      case 'predator':
        if (target.c.hp < stats(target.c).hp / 2) m *= 1 + v;
        break;
      case 'eager':
        if (!user.eagerUsed) m *= 1 + v;
        break;
      case 'overload':
        m *= 1 + v * Math.min(3, user.turnsIn ?? 0);
        break;
      case 'piercing':
        if (rmult < 0.99) m *= Math.min(1 / rmult, Math.pow(v / RESIST, rmult < 0.5 ? 2 : 1));
        break;
      case 'patient':
        if (this.firstSide && this.firstSide !== side) m *= 1 + v;
        break;
      case 'nightstalker':
        if (this.night) m *= 1 + v;
        break;
      case 'sunseeker':
        if (this.weather === 'sun') m *= 1 + v;
        break;
      case 'guts':
        if (user.status) m *= 1 + v;
        break;
      case 'avenger':
        if (user.avenge === this.turnNo) m *= 1 + v;
        break;
    }
    const cheer = (side === 'player' ? this.player : this.enemy).filter((x) => x !== user && isAlive(x.c) && this.is(x, 'cheer'));
    if (cheer.length) m *= 1 + Math.max(...cheer.map((x) => this.tv(x, 'cheer')));
    const d = traitOf(target.c);
    const dv = d ? this.tv(target, d) : 0;
    switch (d) {
      case 'thickhide':
        if (rmult > 1.01) m *= 1 - dv;
        break;
      case 'scaled':
        if (this.speedOf(user) > this.speedOf(target)) m *= 1 - dv;
        break;
      case 'sandshroud':
        if (this.weather === 'dust') m *= 1 - dv;
        break;
      case 'bulwarkcore':
        if ((target.turnsIn ?? 0) < dv) m *= 0.8;
        break;
    }
    return m;
  }

  /** After a move lands: the user's traits, then the target's traits striking back. */
  private traitsAfterHit(user: Combatant, side: Side, target: Combatant, targetSide: Side, el: Element, total: number, superHit: boolean, ev: BattleEvent[]) {
    const ut = traitOf(user.c);
    const umax = stats(user.c).hp;
    const uname = this.traitName(user, side);
    if (ut && isAlive(user.c)) {
      const v = this.tv(user, ut);
      if (ut === 'leech' && total > 0 && user.c.hp < umax && !this.scorched(user)) {
        user.c.hp = Math.min(umax, user.c.hp + Math.ceil(total * v));
        ev.push({ kind: 'heal', side, hp: user.c.hp, maxHp: umax });
        ev.push({ kind: 'text', text: `${uname}: it drinks in the damage.` });
      }
      if (ut === 'tidalgrace' && el === 'Water' && user.c.hp < umax) {
        user.c.hp = Math.min(umax, user.c.hp + Math.ceil(umax * v));
        ev.push({ kind: 'heal', side, hp: user.c.hp, maxHp: umax });
        ev.push({ kind: 'text', text: `${uname}: the water refreshes it.` });
      }
      if (ut === 'hitandrun' && superHit) {
        this.bump(user, side, 'spd', 1, ev);
        if (v >= 2) this.bump(user, side, 'atk', 1, ev);
      }
      if (ut === 'touch' && isAlive(target.c) && !target.status && this.rng.chance(v))
        this.inflict(target, targetSide, TOUCH_STATUS[creatureTypes(user.c)[0]], ev, `${uname}: `, { x: user, side });
    }
    const tt = traitOf(target.c);
    if (tt && total > 0 && isAlive(user.c)) {
      const tv = this.tv(target, tt);
      const tn = this.traitName(target, targetSide);
      const onHit = (id: StatusId) => this.rng.chance(tv) && this.inflict(user, side, id, ev, `${tn}: `);
      switch (tt) {
        case 'roughskin': {
          const dmg = this.hurt(user, Math.max(1, Math.floor(umax * tv)));
          ev.push({ kind: 'damage', side, hp: user.c.hp, maxHp: umax, amount: dmg });
          ev.push({ kind: 'text', text: `${tn} cuts ${this.label(user)}!` });
          break;
        }
        case 'magmaskin':
          onHit('burn');
          break;
        case 'staticcoat':
          onHit('para');
          break;
        case 'toxicspines':
          onHit('poison');
          break;
        case 'frostaura':
          if (this.rng.chance(tv)) {
            ev.push({ kind: 'text', text: `${tn} chills ${this.label(user)}!` });
            this.bump(user, side, 'spd', -1, ev, true);
          }
          break;
      }
    }
    if (tt === 'ironwill' && isAlive(target.c) && !target.willUsed && target.c.hp < stats(target.c).hp / 2) {
      target.willUsed = true;
      ev.push({ kind: 'text', text: `${this.traitName(target, targetSide)}: it steels itself!` });
      this.bump(target, targetSide, 'def', this.tv(target, 'ironwill'), ev);
    }
    if (!isAlive(target.c) && isAlive(user.c) && ut) {
      const v = this.tv(user, ut);
      if (ut === 'momentum') {
        this.bump(user, side, 'spd', 1, ev);
        if (v >= 2) this.bump(user, side, 'atk', 1, ev);
      }
      if (ut === 'carnivore' && user.c.hp < umax) {
        user.c.hp = Math.min(umax, user.c.hp + Math.ceil(umax * v));
        ev.push({ kind: 'heal', side, hp: user.c.hp, maxHp: umax });
        ev.push({ kind: 'text', text: `${uname}: it feeds on its fallen foe.` });
      }
    }
  }

  /** End of turn: Rooted heals, Late Bloomer grows, Purifier shakes off its status. */
  private traitsEndOfTurn(ev: BattleEvent[]) {
    const out = this.outcome();
    if (out === 'win' || out === 'lose' || this.spared) return;
    for (const side of ['player', 'enemy'] as const) {
      const x = side === 'player' ? this.p : this.e;
      if (!x || !isAlive(x.c)) continue;
      x.turnsIn = (x.turnsIn ?? 0) + 1;
      const t = traitOf(x.c);
      if (!t) continue;
      const v = this.tv(x, t);
      const max = stats(x.c).hp;
      const who = this.traitName(x, side);
      if (t === 'rooted' && x.c.hp < max && !this.scorched(x)) {
        x.c.hp = Math.min(max, x.c.hp + Math.ceil(max * v));
        ev.push({ kind: 'heal', side, hp: x.c.hp, maxHp: max });
        ev.push({ kind: 'text', text: `${who}: it draws strength from its roots.` });
      }
      if (t === 'latebloomer' && x.turnsIn % v === 0) {
        ev.push({ kind: 'text', text: `${who}: it's coming into its own!` });
        this.bump(x, side, 'atk', 1, ev);
        if (x.c.stage >= 2) this.bump(x, side, 'def', 1, ev);
      }
      if (t === 'purifier' && x.status && this.rng.chance(v)) this.cure(x, side, ev);
    }
  }

  // ------------------------------------------------------------ boons (2.0)

  /** Does this side hold the boon? */
  private hb(side: Side, id: string): boolean {
    return this.boonSets[side].has(id);
  }

  /** A boon kicked in: the screen shows a callout. */
  private boonCall(side: Side, id: string, ev: BattleEvent[]) {
    ev.push({ kind: 'boon', side, id });
  }

  private sideOfC(x: Combatant): Side {
    return this.player.includes(x) ? 'player' : 'enemy';
  }

  /** Wildfire: burned foes can't heal. */
  private scorched(x: Combatant): boolean {
    return x.status === 'burn' && this.hb(this.sideOfC(x) === 'player' ? 'enemy' : 'player', 'wildfire');
  }

  /** First Strike: you move first on the first turn. */
  private firstStrike(side: Side): boolean {
    return this.turnNo === 1 && this.hb(side, 'firststrike');
  }

  /** Stat multipliers from boons (Attack goes into damage, Defense out of it, Speed into speedOf). */
  private boonStat(x: Combatant, stat: 'atk' | 'def' | 'spd'): number {
    const side = this.sideOfC(x);
    if (!this.boonSets[side].size) return 1;
    const t = creatureTypes(x.c);
    const team = side === 'player' ? this.player : this.enemy;
    const active = side === 'player' ? this.p : this.e;
    let m = 1;
    if (stat === 'spd' && this.hb(side, 'tailwind') && t.includes('Storm')) m *= 1.2;
    if (stat === 'atk' && this.hb(side, 'glassmenagerie')) m *= 1.4;
    if (stat === 'atk' && this.hb(side, 'shortfuse')) m *= 1.25;
    if (this.hb(side, 'dragonpride') && creatureTypes(active.c).includes('Dragon')) m *= 1.15;
    if (this.hb(side, 'rainbowsquad')) {
      const els = new Set(team.map((y) => creatureTypes(y.c)[0]));
      if (els.size >= 4) m *= 1.2;
    }
    if (this.hb(side, 'lonechampion') && x === active) {
      const slots = this.hb(side, 'glassmenagerie') ? 3 : 4;
      const down = slots - team.filter((y) => isAlive(y.c)).length;
      m *= 1 + 0.1 * Math.max(0, down);
    }
    return m;
  }

  /** Damage from boons, the attacker's side's and the defender's. */
  private boonMult(user: Combatant, target: Combatant, el: Element, side: Side, rmult: number, firstMove: boolean): number {
    const ts: Side = side === 'player' ? 'enemy' : 'player';
    if (!this.boonSets[side].size && !this.boonSets[ts].size) return 1;
    let m = this.boonStat(user, 'atk') / this.boonStat(target, 'def');
    const ut = creatureTypes(user.c);
    const tt = creatureTypes(target.c);
    if (this.hb(side, 'kindling') && el === 'Fire' && target.status === 'burn') m *= 1.2;
    if (this.hb(side, 'permafrost') && target.status === 'freeze') m *= 1.25;
    if (this.hb(side, 'venomsac') && ut.includes('Toxic') && target.status === 'poison') m *= 1.25;
    if (this.hb(side, 'ambush') && firstMove) m *= 1.5;
    if (this.hb(side, 'hoard') && el === 'Dragon' && side === 'player') m *= 1 + Math.min(0.25, 0.05 * Math.floor(this.coins / 100));
    if (this.hb(side, 'riptide') && el === 'Water' && this.speedOf(target) > this.speedOf(user)) m *= 1.3;
    if (this.hb(side, 'packtactics')) {
      const mates = (side === 'player' ? this.player : this.enemy).filter((y) => y !== user && creatureTypes(y.c).some((e) => ut.includes(e))).length;
      m *= 1 + 0.08 * mates;
    }
    if (this.hb(side, 'opportunist') && target.status) m *= 1.3;
    if (this.hb(side, 'rampage')) m *= 1 + 0.15 * (user.rampage ?? 0);
    // Fault Line: Earth moves ignore the foe's Defense boosts.
    if (this.hb(side, 'quake') && el === 'Earth' && target.defStage > 0) m *= stageMult(target.defStage);
    if (this.hb(ts, 'emberheart') && tt.includes('Fire') && el === 'Water') m *= 0.75;
    if (this.hb(ts, 'hailguard') && tt.includes('Frost') && this.speedOf(user) < this.speedOf(target)) m *= 0.8;
    if (this.hb(ts, 'dread') && tt.includes('Shadow')) m *= 0.85;
    if (this.hb(ts, 'halo') && tt.includes('Light')) m *= 0.85;
    if (this.hb(ts, 'bedrock') && !target.bedrock) {
      target.bedrock = true;
      m *= 0.5;
    }
    void rmult;
    return m;
  }

  /** Phantom Step: your Spirit Hexlings dodge the first attack aimed at each of them. */
  private phantomStep(x: Combatant, side: Side, ev: BattleEvent[]): boolean {
    if (!this.hb(side, 'phantomstep') || x.phantom || !creatureTypes(x.c).includes('Spirit')) return false;
    x.phantom = true;
    this.boonCall(side, 'phantomstep', ev);
    ev.push({ kind: 'text', text: `${this.label(x)} steps aside like a ghost!` });
    return true;
  }

  private boonsOnEnter(side: Side, ev: BattleEvent[], resuming: boolean) {
    const x = side === 'player' ? this.p : this.e;
    if (!x || !isAlive(x.c) || resuming) return;
    if (this.hb(side, 'glacier') && creatureTypes(x.c).includes('Frost')) {
      this.boonCall(side, 'glacier', ev);
      this.bump(x, side, 'def', 2, ev);
    }
    if (this.nightfallNext[side]) {
      this.nightfallNext[side] = false;
      this.boonCall(side, 'nightfall', ev);
      this.bump(x, side, 'spd', 1, ev);
    }
  }

  /** Bench Press: Hexlings you switch in enter at +1 Attack. */
  private benchPress(side: Side, ev: BattleEvent[]) {
    const x = side === 'player' ? this.p : this.e;
    if (!this.hb(side, 'benchpress') || !isAlive(x.c)) return;
    this.boonCall(side, 'benchpress', ev);
    this.bump(x, side, 'atk', 1, ev);
  }

  private boonsAfterHit(user: Combatant, side: Side, target: Combatant, targetSide: Side, el: Element, total: number, slot: MoveSlot, ev: BattleEvent[]) {
    // Extra statuses from boons (one roll per move).
    if (isAlive(target.c) && !target.status) {
      const extra: [string, Element, StatusId, number][] = [
        ['kindling', 'Fire', 'burn', 0.2],
        ['contagion', 'Toxic', 'poison', 0.25],
        ['possession', 'Spirit', 'confuse', 0.25],
      ];
      for (const [id, e, st, ch] of extra)
        if (this.hb(side, id) && el === e && !target.status && this.rng.chance(ch) && this.inflict(target, targetSide, st, ev, '', { x: user, side })) this.boonCall(side, id, ev);
    }
    if (isAlive(target.c)) {
      if (this.hb(side, 'brittle') && el === 'Frost' && this.rng.chance(0.3)) {
        this.boonCall(side, 'brittle', ev);
        this.bump(target, targetSide, 'def', -1, ev, true);
      }
      if (this.hb(side, 'undertow') && el === 'Water') this.bump(target, targetSide, 'spd', -1, ev, true);
    }
    const tt = creatureTypes(target.c);
    if (isAlive(user.c) && total > 0) {
      if (this.hb(targetSide, 'staticfield') && tt.includes('Storm') && !user.status && this.rng.chance(0.2) && this.inflict(user, side, 'para', ev, 'Static Field: ')) this.boonCall(targetSide, 'staticfield', ev);
      if (this.hb(targetSide, 'ironclad') && tt.includes('Metal')) {
        const umax = stats(user.c).hp;
        const back = this.hurt(user, Math.max(1, Math.round(total * 0.15)));
        this.boonCall(targetSide, 'ironclad', ev);
        ev.push({ kind: 'damage', side, hp: user.c.hp, maxHp: umax, amount: back });
        ev.push({ kind: 'text', text: `Ironclad sends some of it back at ${this.label(user)}!` });
      }
    }
    // A knockout.
    if (!isAlive(target.c) && isAlive(user.c)) {
      user.rampage = (user.rampage ?? 0) + (this.hb(side, 'rampage') ? 1 : 0);
      if (this.hb(side, 'overflow')) {
        if (slot.used) slot.used = Math.max(0, slot.used - 1);
        this.boonCall(side, 'overflow', ev);
        this.bump(user, side, 'atk', 1, ev);
      }
      if (this.hb(side, 'nightfall') && creatureTypes(user.c).includes('Shadow')) {
        this.boonCall(side, 'nightfall', ev);
        this.bump(user, side, 'spd', 1, ev);
      }
      if (this.hb(side, 'soullink') && creatureTypes(user.c).includes('Spirit')) {
        this.boonCall(side, 'soullink', ev);
        for (const y of side === 'player' ? this.player : this.enemy) {
          if (!isAlive(y.c)) continue;
          const max = stats(y.c).hp;
          y.c.hp = Math.min(max, y.c.hp + Math.ceil(max * 0.1));
          if (y === user) ev.push({ kind: 'heal', side, hp: y.c.hp, maxHp: max });
        }
        ev.push({ kind: 'text', text: 'Soul Link: the team is restored a little!' });
      }
    }
  }

  /** One of this side's Hexlings fainted: Haunting strikes back, Nightfall readies the next one. */
  private boonsOnFaint(side: Side, ev: BattleEvent[]) {
    if (this.hb(side, 'nightfall')) this.nightfallNext[side] = true;
    if (this.hb(side, 'haunting')) {
      const foeSide: Side = side === 'player' ? 'enemy' : 'player';
      const foe = foeSide === 'player' ? this.p : this.e;
      if (foe && isAlive(foe.c)) {
        const max = stats(foe.c).hp;
        const dmg = this.hurt(foe, Math.max(1, Math.floor(max * 0.2)));
        this.boonCall(side, 'haunting', ev);
        ev.push({ kind: 'damage', side: foeSide, hp: foe.c.hp, maxHp: max, amount: dmg });
        ev.push({ kind: 'text', text: `Haunting: its spirit strikes ${this.label(foe)}!` });
        if (!isAlive(foe.c)) this.handleFaint(foeSide, ev);
      }
    }
  }

  /** End of turn: Overgrowth heals Nature Hexlings; Forged hardens Metal ones. */
  private boonsEndOfTurn(ev: BattleEvent[]) {
    const out = this.outcome();
    if (out === 'win' || out === 'lose' || this.spared) return;
    for (const side of ['player', 'enemy'] as const) {
      const x = side === 'player' ? this.p : this.e;
      if (!x || !isAlive(x.c)) continue;
      const t = creatureTypes(x.c);
      const max = stats(x.c).hp;
      if (this.hb(side, 'overgrowth') && t.includes('Nature') && x.c.hp < max && !this.scorched(x)) {
        x.c.hp = Math.min(max, x.c.hp + Math.ceil(max / 16));
        ev.push({ kind: 'heal', side, hp: x.c.hp, maxHp: max });
        ev.push({ kind: 'text', text: `Overgrowth: ${this.label(x)} grows back a little.` });
      }
      if (this.hb(side, 'forged') && t.includes('Metal') && (x.forged ?? 0) < 3 && x.defStage < MAX_STAGE) {
        x.forged = (x.forged ?? 0) + 1;
        this.boonCall(side, 'forged', ev);
        this.bump(x, side, 'def', 1, ev);
      }
    }
  }

  // ------------------------------------------------------------ trainer tactics

  /** How hard the player's active creature can hit this enemy creature (best type multiplier of its attacks). */
  private threatTo(x: Combatant): number {
    const types = creatureTypes(x.c);
    let best = 0;
    for (const m of this.p.c.moves) {
      const d = moveDef(m);
      if (d.kind !== 'attack' || !hasUses(m)) continue;
      best = Math.max(best, typeMultiplier(attackElement(d, this.p, x), types));
    }
    return best || 1;
  }

  /** How well this enemy creature hits the player's active one (its best type multiplier). */
  private punchOf(x: Combatant): number {
    const types = creatureTypes(this.p.c);
    let best = 0;
    for (const m of x.c.moves) {
      const d = moveDef(m);
      if (d.kind !== 'attack' || !hasUses(m)) continue;
      best = Math.max(best, typeMultiplier(attackElement(d, x, this.p), types));
    }
    return best || 1;
  }

  /** The living enemy creature with the best matchup against the player's active one. */
  private bestEnemyAnswer(exclude = -1): number {
    let best = -1;
    let score = -Infinity;
    this.enemy.forEach((x, i) => {
      if (i === exclude || !isAlive(x.c)) return;
      const s = this.punchOf(x) / this.threatTo(x) + 0.3 * (x.c.hp / stats(x.c).hp);
      if (s > score) {
        score = s;
        best = i;
      }
    });
    return best;
  }

  // ------------------------------------------------------------ auto-battle (your side)

  /** How well one of your Hexlings matches up against the foe: its best hit over the foe's best hit on it, by HP. */
  private autoMatchup(x: Combatant): number {
    const best = (from: Combatant, to: Combatant) => {
      let v = 0;
      for (const m of from.c.moves) {
        const d = moveDef(m);
        if (d.kind !== 'attack' || !hasUses(m)) continue;
        const el = attackElement(d, from, to);
        v = Math.max(v, attackValue(d, m.tier) * typeMultiplier(el, creatureTypes(to.c)) * stabMultiplier(el, creatureTypes(from.c)));
      }
      return v || 1;
    };
    const off = best(x, this.e) * stats(x.c).atk;
    const def = best(this.e, x) * stats(this.e.c).atk;
    return (off / def) * (0.3 + x.c.hp / stats(x.c).hp);
  }

  /** Auto-battle: the living Hexling of yours with the best matchup against the foe (-1: none). */
  bestPlayerAnswer(exclude = -1): number {
    let best = -1;
    let score = -Infinity;
    this.player.forEach((x, i) => {
      if (i === exclude || !isAlive(x.c)) return;
      const s = this.autoMatchup(x);
      if (s > score) {
        score = s;
        best = i;
      }
    });
    return best;
  }

  /**
   * Auto-battle: instead of attacking this turn, switch to a teammate that matches up far better,
   * or drink a potion when your Hexling is low (or badly statused) and still worth keeping in.
   * `potions`: how many you carry (0 outside runs). Null = attack.
   */
  autoPlan(potions: number): { kind: 'potion' } | { kind: 'swap'; index: number } | null {
    if (this.spared || !isAlive(this.p.c) || !isAlive(this.e.c)) return null;
    const p = this.p;
    const frac = p.c.hp / stats(p.c).hp;
    const foeFrac = this.e.c.hp / stats(this.e.c).hp;
    const mine = this.autoMatchup(p);
    // Switch out of a bad matchup when a healthy teammate does at least twice as well (not twice in a row).
    if (this.turnNo - this.lastAutoSwitch > 2 && foeFrac > 0.2) {
      const i = this.bestPlayerAnswer(this.pActive);
      const alt = i >= 0 ? this.player[i] : null;
      if (alt && alt.c.hp / stats(alt.c).hp > 0.4 && this.autoMatchup(alt) > mine * 2) {
        this.lastAutoSwitch = this.turnNo;
        return { kind: 'swap', index: i };
      }
    }
    // Drink a potion when low or stuck with a bad status, unless the foe is about to go down anyway.
    const badStatus = p.status === 'sleep' || p.status === 'freeze' || ((p.status === 'burn' || p.status === 'poison') && frac < 0.5);
    if (potions > 0 && foeFrac > 0.25 && (frac < 0.3 || (badStatus && frac < 0.7))) return { kind: 'potion' };
    return null;
  }

  /** Trainers: drink a potion when in trouble, or switch out of a bad matchup. Null = just attack. */
  private enemyPlan(): { kind: 'potion' } | { kind: 'swap'; index: number } | null {
    const t = this.tactics;
    if (!t || this.spared || !isAlive(this.e.c) || !isAlive(this.p.c)) return null;
    const e = this.e;
    const frac = e.c.hp / stats(e.c).hp;
    const badStatus = e.status === 'sleep' || e.status === 'freeze' || ((e.status === 'burn' || e.status === 'poison') && frac < 0.6);
    if (t.potions > 0 && (frac < 0.3 || (badStatus && frac < 0.8)) && this.rng.chance(0.7)) return { kind: 'potion' };
    // Switch when the player's creature hits this one super-effectively and a teammate takes it far better.
    if (this.turnNo - this.lastEnemySwitch > 2 && this.threatTo(e) > 1.2 && frac > 0.2) {
      const i = this.bestEnemyAnswer(this.eActive);
      if (i >= 0 && this.threatTo(this.enemy[i]) <= 1 && this.enemy[i].c.hp / stats(this.enemy[i].c).hp > 0.4 && this.rng.chance(0.6)) {
        return { kind: 'swap', index: i };
      }
    }
    return null;
  }

  private doEnemyPlan(plan: { kind: 'potion' } | { kind: 'swap'; index: number }, ev: BattleEvent[]) {
    const who = this.tactics?.name ?? 'The enemy';
    if (plan.kind === 'potion') {
      const x = this.e;
      this.tactics!.potions--;
      if (this.scorched(x)) {
        ev.push({ kind: 'text', text: `${who} uses a Potion, but Wildfire's burn won't let ${creatureName(x.c)} heal!` });
        return;
      }
      const max = stats(x.c).hp;
      const hurt = x.c.hp < max;
      x.c.hp = Math.min(max, x.c.hp + Math.ceil(max * 0.5));
      ev.push({ kind: 'text', text: `${who} uses a Potion on ${creatureName(x.c)}!` });
      if (hurt) ev.push({ kind: 'heal', side: 'enemy', hp: x.c.hp, maxHp: max });
      if (x.status) this.cure(x, 'enemy', ev);
      return;
    }
    this.lastEnemySwitch = this.turnNo;
    ev.push({ kind: 'text', text: `${who} calls back ${creatureName(this.e.c)}!` });
    this.leaving(this.e, 'enemy', ev);
    this.eActive = plan.index;
    resetStages(this.e);
    ev.push({ kind: 'enemySend', index: plan.index, hp: this.e.c.hp });
    ev.push({ kind: 'text', text: `${who} sends out ${creatureName(this.e.c)}!` });
    this.onEnter('enemy', ev);
  }

  /** Quick Claw: a 25% chance to jump the queue this turn. */
  private clawProc(x: Combatant): boolean {
    return x.c.held === 'claw' && this.rng.chance(0.25);
  }

  /** A combatant's speed right now: stages, synergy, Swift Scarf, paralysis and Speed Boost. */
  speedOf(x: Combatant): number {
    const wind = this.hasFx(this.sideOf(x), 'tailwind') ? 1.5 : 1;
    return stats(x.c).spd * (x.syn?.spd ?? 1) * stageMult(x.spdStage) * (x.c.held === 'scarf' ? 1.25 : 1) * (x.status === 'para' ? 0.5 : 1) * wind * this.traitSpeed(x) * this.boonStat(x, 'spd');
  }

  private playerGoesFirst(): boolean {
    const ps = this.speedOf(this.p);
    const es = this.speedOf(this.e);
    if (ps === es) return this.rng.chance(0.5);
    // Time Warp: the slower one goes first.
    return this.warp > 0 ? ps < es : ps > es;
  }

  private chooseEnemyMove(): MoveSlot {
    const moves = this.e.c.moves.filter(hasUses);
    if (!moves.length) return fallbackMove(this.e.c);
    // Mostly pick the best expected damage, sometimes random.
    if (this.rng.chance(this.enemyRandomness)) return this.rng.pick(moves);
    return this.e.c.moves[this.bestMove('enemy')];
  }

  /**
   * Index of the move the AI rates highest for this side right now (used by auto-battle too), or -1
   * when every move is out of uses (the basic-attack fallback). Your side saves limited moves for
   * when they matter: a super-effective hit or a chance to finish the foe.
   */
  bestMove(side: Side): number {
    const user = side === 'player' ? this.p : this.e;
    const foe = side === 'player' ? this.e : this.p;
    let best = -1;
    let bestScore = -1;
    user.c.moves.forEach((m, i) => {
      if (!hasUses(m)) return;
      const d = moveDef(m);
      let score = d.kind !== 'attack' ? this.statusScore(m, user, foe) : this.attackScore(user, foe, m);
      if (side === 'player' && Number.isFinite(usesLeft(m)) && d.kind === 'attack') {
        const el = attackElement(d, user, foe);
        const matters = typeMultiplier(el, creatureTypes(foe.c)) > 1 || foe.c.hp / stats(foe.c).hp < 0.35;
        if (!matters) score *= 0.75;
      }
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  /** Speed attacks: power for this matchup over the listed power. */
  speedFactor(def: MoveDef, user: Combatant, target: Combatant): number {
    const u = this.speedOf(user);
    const t = Math.max(1, this.speedOf(target));
    const ratio = def.speedPower === 'fast' ? u / t : t / Math.max(1, u);
    return speedPower(ratio) / def.power;
  }

  private useBulwark(side: Side, user: Combatant, tier: number, ev: BattleEvent[]) {
    const streak = user.guardStreak ?? 0;
    const chance = streak === 0 ? 1 : Math.pow(bulwarkRepeat(tier), streak);
    if (this.rng.next() < chance) {
      user.guarded = true;
      user.guardStreak = streak + 1;
      ev.push({ kind: 'stat', side, up: true });
      ev.push({ kind: 'text', text: `${this.nameOf(side, user.c)} braced behind a Bulwark!` });
    } else {
      user.guardStreak = 0;
      ev.push({ kind: 'text', text: 'But the Bulwark crumbled! (It rarely holds twice in a row.)' });
    }
  }

  /** Put the weather back (a reload or a duel snapshot), ignoring anything malformed. */
  setWeather(w: unknown, left: unknown) {
    const ok = typeof w === 'string' && (WEATHER_IDS as string[]).includes(w);
    this.weather = ok ? (w as WeatherId) : null;
    this.weatherLeft = ok ? Math.max(0, Math.min(9, Number(left) || 0)) : 0;
    if (!this.weatherLeft) this.weather = null;
  }

  private useWeather(w: WeatherId, tier: number, ev: BattleEvent[]) {
    const d = WEATHER[w];
    // Counting this turn's end, so it lasts the turns it says.
    this.weatherLeft = weatherTurns(tier);
    if (this.weather === w) {
      ev.push({ kind: 'text', text: `The ${d.name.toLowerCase()} goes on! (${this.weatherLeft} turns)` });
      return;
    }
    this.weather = w;
    ev.push({ kind: 'weather', id: w });
    ev.push({ kind: 'text', text: `${d.start} ${weatherShort(w)} for ${this.weatherLeft} turns.` });
  }

  /** End of turn: dust and hail wear down the unsheltered, then the weather counts down. */
  private tickWeather(ev: BattleEvent[]) {
    if (!this.weather) return;
    const d = WEATHER[this.weather];
    if (d.shelter && !this.spared) {
      for (const side of ['player', 'enemy'] as const) {
        const x = side === 'player' ? this.p : this.e;
        if (!isAlive(x.c) || creatureTypes(x.c).some((t) => d.shelter!.includes(t))) continue;
        const max = stats(x.c).hp;
        const dmg = this.hurt(x, Math.max(1, Math.floor(max * WEATHER_CHIP)));
        ev.push({ kind: 'damage', side, hp: x.c.hp, maxHp: max, amount: dmg });
        ev.push({ kind: 'text', text: `${this.label(x)} is battered by the ${d.name.toLowerCase()}!` });
        this.sashNote(x, ev);
        if (!isAlive(x.c)) this.handleFaint(side, ev);
      }
    }
    if (--this.weatherLeft <= 0) {
      this.weather = null;
      this.weatherLeft = 0;
      ev.push({ kind: 'weather', id: null });
      ev.push({ kind: 'text', text: d.end });
    }
  }

  private useWarp(tier: number, ev: BattleEvent[]) {
    if (this.warp > 0) {
      this.warp = 0;
      ev.push({ kind: 'text', text: 'Time snapped back to normal!' });
      return;
    }
    // Counting this turn, so it shapes the next turns' order.
    this.warp = warpTurns(tier) + 1;
    ev.push({ kind: 'text', text: `Time twisted! For ${warpTurns(tier)} turns, slower Hexlings move first.` });
  }

  /** Expected damage-ish score for an attack, used by the AI. */
  private attackScore(user: Combatant, target: Combatant, m: MoveSlot): number {
    const d = moveDef(m);
    const el = attackElement(d, user, target);
    let v = attackValue(d, m.tier) * typeMultiplier(el, creatureTypes(target.c)) * stabMultiplier(el, creatureTypes(user.c));
    const targetFrac = target.c.hp / stats(target.c).hp;
    if (d.execute && targetFrac < 0.5) v *= 2;
    if (d.priority && targetFrac < 0.25) v *= 1.5;
    if (d.speedPower) v *= this.speedFactor(d, user, target);
    return v * weatherMult(this.weather, el);
  }

  /** How attractive a status move is to the AI right now (comparable to attack power). */
  private statusScore(m: MoveSlot, user: Combatant, foe: Combatant): number {
    const d = moveDef(m);
    const hpFrac = user.c.hp / stats(user.c).hp;
    // Bulwark: now and then, mostly when hurt, never twice in a row.
    if (d.protect) return (user.guardStreak ?? 0) > 0 ? 0 : hpFrac < 0.5 ? 45 : 12;
    // Weather: call it when it powers up your own element (and isn't already up).
    if (d.weather) {
      if (this.weather === d.weather && this.weatherLeft > 1) return 0;
      const mine = creatureTypes(user.c);
      const w = WEATHER[d.weather];
      if (!mine.includes(w.up)) return 0;
      return hpFrac < 0.35 ? 0 : creatureTypes(foe.c).includes(w.up) ? 20 : 55;
    }
    // Time Warp: set it up when slower, cancel the foe's when faster.
    if (d.warp) {
      const slower = this.speedOf(user) < this.speedOf(foe);
      return this.warp > 0 ? (slower ? 0 : 55) : slower ? 60 : 0;
    }
    if (d.kind === 'heal') return hpFrac < 0.5 ? 90 * (1 - hpFrac) : 0;
    if (d.team) {
      const side = this.sideOf(user);
      const team = side === 'player' ? this.player : this.enemy;
      if (d.team === 'mend') {
        // Worth it when the team as a whole is hurt or afflicted.
        const missing = team.filter((x) => isAlive(x.c)).reduce((t, x) => t + (1 - x.c.hp / stats(x.c).hp) + (x.status ? 0.3 : 0), 0);
        return missing > 0.6 ? 40 + 40 * Math.min(1.5, missing) : 0;
      }
      if (this.hasFx(side, d.team) || hpFrac < 0.35) return 0;
      // Better with teammates still to come who'd benefit too.
      return 45 + 8 * team.filter((x) => isAlive(x.c)).length;
    }
    if (hpFrac < 0.4) return 0;
    const holder = d.kind === 'debuff' ? foe : user;
    const room = effectsAtTier(d, m.tier).some((e) => {
      const cur = holder[stageKey(e.stat)];
      return e.stages > 0 ? cur < 2 : cur > -2;
    });
    // Debuffs that can inflict a condition are worth more against a healthy target.
    const bonus = d.status && !foe.status ? 20 * d.status.chance : 0;
    return room ? 50 * hpFrac + bonus : bonus * hpFrac;
  }

  private applyStatus(side: Side, slot: MoveSlot, ev: BattleEvent[]) {
    const def = moveDef(slot);
    const user = side === 'player' ? this.p : this.e;
    const target = side === 'player' ? this.e : this.p;
    // Debuffs hit the foe; buffs and heal moves' boosts (Fortress: heal + DEF) go on the user.
    const self = def.kind !== 'debuff';
    const holder = self ? user : target;
    const holderSide: Side = self ? side : side === 'player' ? 'enemy' : 'player';
    const name = this.nameOf(holderSide, holder.c);
    for (const e of effectsAtTier(def, slot.tier)) {
      if (!self && e.stages < 0 && this.unshaken(holder, holderSide, e.stat, ev)) continue;
      const key = stageKey(e.stat);
      const before = holder[key];
      holder[key] = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, before + e.stages));
      const diff = holder[key] - before;
      if (diff === 0) {
        ev.push({ kind: 'text', text: `${name}'s ${STAT_LABEL[e.stat]} won't go any ${e.stages > 0 ? 'higher' : 'lower'}!` });
        continue;
      }
      const how = Math.abs(diff) >= 2 ? (diff > 0 ? 'rose sharply' : 'fell harshly') : diff > 0 ? 'rose' : 'fell';
      ev.push({ kind: 'stat', side: holderSide, up: diff > 0 });
      ev.push({ kind: 'text', text: `${name}'s ${STAT_LABEL[e.stat]} ${how}!` });
    }
  }

  // ------------------------------------------------------------ status conditions

  private label(x: Combatant): string {
    return this.nameOf(this.enemy.includes(x) ? 'enemy' : 'player', x.c);
  }

  /** "Monolith" / "Enemy Monolith", or in duels "Sam's Monolith" on both sides. */
  nameOf(side: Side, c: Creature): string {
    if (this.duel) return `${this.duel[side]}'s ${creatureName(c)}`;
    return (side === 'enemy' ? 'Enemy ' : '') + creatureName(c);
  }

  /** Give a combatant a status. Fails if it already has one, has fainted, or its type is immune. */
  private inflict(x: Combatant, side: Side, id: StatusId, ev: BattleEvent[], prefix = '', from?: { x: Combatant; side: Side }): boolean {
    if (!isAlive(x.c) || x.status) return false;
    if (this.hasFx(this.sideOf(x), 'ward')) return false;
    const def = STATUS[id];
    // Contagion (a boon): your poison reaches Metal Hexlings too.
    const contagion = id === 'poison' && from && this.hb(from.side, 'contagion');
    if (creatureTypes(x.c).some((t) => def.immune.includes(t) && !(contagion && t === 'Metal'))) return false;
    if (side === 'player' && this.playerImmune.includes(id)) return false;
    // Ember Heart: your Fire Hexlings can't be frozen.
    if (id === 'freeze' && this.hb(side, 'emberheart') && creatureTypes(x.c).includes('Fire')) return false;
    x.status = id;
    x.statusTurns = this.rng.int(def.turns[0], def.turns[1]);
    // Boons that make the statuses you cause last longer.
    if (from) {
      const fs = from.side;
      x.statusTurns += (this.hb(fs, 'lingering') ? 2 : 0) + (id === 'burn' && this.hb(fs, 'wildfire') ? 2 : 0) + (id === 'freeze' && this.hb(fs, 'permafrost') ? 1 : 0);
    }
    // Resilient: statuses on it don't last as long.
    if (this.is(x, 'resilient')) x.statusTurns = Math.max(1, Math.round(x.statusTurns * this.tv(x, 'resilient')));
    ev.push({ kind: 'status', side, status: id });
    ev.push({ kind: 'text', text: `${prefix}${this.label(x)} ${def.verb}!` });
    // Mirror: the one who gave it the status may get the same.
    if (from && this.is(x, 'mirror') && isAlive(from.x.c) && this.rng.chance(this.tv(x, 'mirror')))
      this.inflict(from.x, from.side, id, ev, `${this.label(x)}'s Mirror: `);
    return true;
  }

  private cure(x: Combatant, side: Side, ev: BattleEvent[]) {
    if (!x.status) return;
    const def = STATUS[x.status];
    x.status = null;
    x.statusTurns = 0;
    ev.push({ kind: 'status', side, status: null });
    ev.push({ kind: 'text', text: `${this.label(x)} ${def.ends}!` });
  }

  /** Sleep, freeze, paralysis and confusion can stop a creature from acting. */
  private canAct(x: Combatant, side: Side, ev: BattleEvent[]): boolean {
    const who = this.label(x);
    switch (x.status) {
      case 'sleep':
        if (--x.statusTurns <= 0) {
          this.cure(x, side, ev);
          return true;
        }
        ev.push({ kind: 'text', text: `${who} is fast asleep.` });
        return false;
      case 'freeze':
        if (--x.statusTurns <= 0 || this.rng.chance(0.3)) {
          this.cure(x, side, ev);
          return true;
        }
        ev.push({ kind: 'text', text: `${who} is frozen solid!` });
        return false;
      case 'para':
        if (this.rng.chance(0.25)) {
          ev.push({ kind: 'text', text: `${who} is paralyzed! It can't move!` });
          return false;
        }
        return true;
      case 'confuse': {
        if (--x.statusTurns <= 0) {
          this.cure(x, side, ev);
          return true;
        }
        ev.push({ kind: 'text', text: `${who} is confused...` });
        if (!this.rng.chance(1 / 3)) return true;
        const max = stats(x.c).hp;
        const dmg = this.hurt(x, Math.max(1, Math.floor(max / 10)));
        ev.push({ kind: 'damage', side, hp: x.c.hp, maxHp: max, amount: dmg });
        ev.push({ kind: 'text', text: 'It hurt itself in its confusion!' });
        if (!isAlive(x.c)) this.handleFaint(side, ev);
        return false;
      }
      default:
        return true;
    }
  }

  private useMove(side: Side, slot: MoveSlot, ev: BattleEvent[]) {
    const user = side === 'player' ? this.p : this.e;
    if (!this.canAct(user, side, ev)) return;
    spendUse(slot);
    const target = side === 'player' ? this.e : this.p;
    const targetSide: Side = side === 'player' ? 'enemy' : 'player';
    const def = moveDef(slot);
    const who = this.nameOf(side, user.c);
    ev.push({ kind: 'attack', side, move: def.name, moveId: def.id, slot: side === 'player' ? this.pActive : this.eActive });
    ev.push({ kind: 'text', text: `${who} used ${def.name}!` });
    if (def.protect) return this.useBulwark(side, user, slot.tier, ev);
    user.guardStreak = 0;
    // The foe's Bulwark stops attacks and stat-lowering moves cold.
    if (target.guarded && (def.kind === 'attack' || def.kind === 'debuff') && !(def.element === 'Earth' && this.hb(side, 'quake'))) {
      ev.push({ kind: 'text', text: `${this.nameOf(targetSide, target.c)} blocked it behind its Bulwark!` });
      return;
    }
    if (def.warp) return this.useWarp(slot.tier, ev);
    if (def.weather) return this.useWeather(def.weather, slot.tier, ev);

    const targetSideOf: Side = side === 'player' ? 'enemy' : 'player';
    const acc =
      user.c.held === 'lens' || (side === 'enemy' && this.has('keeneye'))
        ? 100
        : def.accuracy * (def.kind === 'attack' && this.hasFx(targetSideOf, 'shroud') ? 0.8 : 1) * (side === 'player' && this.has('fog') ? 0.85 : 1);
    const steady = this.is(user, 'steady') && user.c.hp >= stats(user.c).hp * this.tv(user, 'steady');
    const veil = this.weather === 'hail' && this.is(target, 'whiteoutveil') ? 0.85 : 1;
    if (!steady && this.rng.next() * 100 >= acc * veil) {
      ev.push({ kind: 'text', text: 'It missed!' });
      return;
    }
    if (def.kind === 'heal') {
      const max = stats(user.c).hp;
      user.c.hp = Math.min(max, user.c.hp + Math.ceil(max * healAtTier(def, slot.tier)));
      ev.push({ kind: 'heal', side, hp: user.c.hp, maxHp: max });
      ev.push({ kind: 'text', text: `${who} recovered health!` });
      if (def.effects.length) this.applyStatus(side, slot, ev);
      return;
    }
    if (def.team) return this.useTeamMove(side, def, slot.tier, ev);
    if (def.kind !== 'attack') {
      this.firstMoved[side] = true;
      this.applyStatus(side, slot, ev);
      if (def.status && def.kind === 'debuff' && this.rng.chance(def.status.chance * (side === 'player' ? this.playerStatusMult : 1))) {
        this.inflict(target, targetSide, def.status.id, ev, '', { x: user, side });
      }
      return;
    }

    let el = attackElement(def, user, target);
    // Wildcard: its signature move takes whichever element hits the target hardest.
    if (def.signature && this.is(user, 'wildcard')) {
      const tt = creatureTypes(target.c);
      for (const e of ELEMENTS) if (typeMultiplier(e, tt) > typeMultiplier(el, tt)) el = e;
    }
    // Elemental Fusion: the best of the move's element and the user's own.
    if (this.hb(side, 'fusion')) {
      const tt = creatureTypes(target.c);
      for (const e of creatureTypes(user.c)) if (typeMultiplier(e, tt) > typeMultiplier(el, tt)) el = e;
    }
    // Absorbers turn a hit of their element into healing; Ethereal and Phantom Step slip a hit.
    if (this.absorbs(target, targetSide, el, ev) || this.slipsThrough(target, targetSide, ev) || this.phantomStep(target, targetSide, ev)) {
      user.eagerUsed = true;
      this.firstMoved[side] = true;
      return;
    }
    let powerMult = def.execute && target.c.hp < stats(target.c).hp / 2 ? 2 : 1;
    if (def.signature && this.is(user, 'wildcard')) powerMult *= 1 + this.tv(user, 'wildcard');
    // Speed attacks: their power depends on who's faster.
    if (def.speedPower) powerMult *= this.speedFactor(def, user, target);
    let hits = def.hits ?? 1;
    if (slot.tier >= 3 && def.element === 'Storm' && this.rng.chance(0.35)) hits += 1;
    // Echo: your first move each battle hits twice. Chain Lightning: Storm moves now and then too.
    if (this.hb(side, 'echo') && !this.firstMoved[side]) {
      hits += 1;
      this.boonCall(side, 'echo', ev);
    }
    if (this.hb(side, 'chainlightning') && el === 'Storm' && this.rng.chance(0.2)) {
      hits += 1;
      this.boonCall(side, 'chainlightning', ev);
    }
    const firstMove = !this.firstMoved[side];
    let total = 0;
    let landed = 0;
    let superHit = false;
    for (let h = 0; h < hits && isAlive(target.c) && !this.spared; h++) {
      const r = computeDamage(user, target, def, slot.tier, this.rng, el, powerMult);
      if (h === 0) superHit = r.mult > 1.01;
      const fxMult =
        this.traitMult(user, target, def, el, powerMult, side, r.mult) *
        this.boonMult(user, target, el, side, r.mult, firstMove) *
        (this.hasFx(side, 'rally') ? 1.25 : 1) *
        (this.hasFx(targetSide, 'guard') ? 0.75 : 1) *
        weatherMult(this.weather, el) *
        // Ironhide: each super-effective element only counts x1.25 against their Hexlings.
        (side === 'player' && this.has('ironhide') ? Math.pow(1.25 / 1.5, r.mult >= 2 ? 2 : r.mult > 1.01 ? 1 : 0) : 1);
      const raw = Math.max(1, Math.round(r.dmg * (side === 'player' ? this.playerDamageMult : this.enemyDamageMult) * fxMult));
      const dmg = this.hurt(target, raw, true);
      total += dmg;
      if (side === 'player') {
        user.c.dealt = (user.c.dealt ?? 0) + dmg;
        if (!isAlive(target.c)) user.c.kos = (user.c.kos ?? 0) + 1;
      }
      landed++;
      ev.push({ kind: 'damage', side: targetSide, hp: target.c.hp, maxHp: stats(target.c).hp, amount: dmg, mult: r.mult, element: el });
      this.sashNote(target, ev);
      // Moves named for a condition can inflict it: every hit rolls (a 3-hit move gets three chances).
      if (def.status && isAlive(target.c) && !target.status && this.rng.chance(def.status.chance * (side === 'player' ? this.playerStatusMult : 1))) {
        this.inflict(target, targetSide, def.status.id, ev, '', { x: user, side });
      }
      if (h === 0) {
        const label = effectivenessLabel(r.mult);
        if (label) ev.push({ kind: 'text', text: label });
        if (powerMult > 1) ev.push({ kind: 'text', text: 'A finishing blow!' });
      }
    }
    if (landed > 1) ev.push({ kind: 'text', text: `Hit ${landed} times!` });
    user.eagerUsed = true;
    if (firstMove && this.hb(side, 'ambush') && landed > 0) this.boonCall(side, 'ambush', ev);
    this.firstMoved[side] = true;
    if (landed > 0) this.traitsAfterHit(user, side, target, targetSide, el, total, superHit, ev);
    if (landed > 0) this.boonsAfterHit(user, side, target, targetSide, el, total, slot, ev);

    const userMax = stats(user.c).hp;
    // Second Wind: a guardian's Hexling dropping below a third heals once.
    if (side === 'player' && this.has('secondwind') && isAlive(target.c) && !this.winded.has(target.c.uid)) {
      const tmax = stats(target.c).hp;
      if (target.c.hp < tmax / 3) {
        this.winded.add(target.c.uid);
        target.c.hp = Math.min(tmax, target.c.hp + Math.ceil(tmax * 0.35));
        ev.push({ kind: 'heal', side: targetSide, hp: target.c.hp, maxHp: tmax });
        ev.push({ kind: 'text', text: `${this.rn('secondwind')}: Enemy ${creatureName(target.c)} catches a second wind!` });
      }
    }
    if (this.has('thorns') && side === 'player' && total > 0 && isAlive(user.c)) {
      const th = Math.max(1, Math.round(total * THORNS_RECOIL));
      user.c.hp = Math.max(0, user.c.hp - th);
      ev.push({ kind: 'damage', side, hp: user.c.hp, maxHp: userMax, amount: th });
      ev.push({ kind: 'text', text: `${this.rn('thorns')}: ${creatureName(user.c)} is cut by thorns!` });
    }
    if (target.c.held === 'barb' && total > 0 && isAlive(user.c) && !(this.spared && side === 'enemy')) {
      const bb = this.hurt(user, Math.max(1, Math.round(total * 0.15)));
      ev.push({ kind: 'damage', side, hp: user.c.hp, maxHp: userMax, amount: bb });
      ev.push({ kind: 'text', text: `${who} is pricked by the Barb Collar!` });
    }
    if (user.c.held === 'fang' && total > 0 && isAlive(user.c) && user.c.hp < userMax) {
      user.c.hp = Math.min(userMax, user.c.hp + Math.ceil(total * 0.15));
      ev.push({ kind: 'heal', side, hp: user.c.hp, maxHp: userMax });
      ev.push({ kind: 'text', text: `${who}'s Vampire Fang drinks deep.` });
    }
    if (def.drain && isAlive(user.c) && !this.scorched(user)) {
      user.c.hp = Math.min(userMax, user.c.hp + Math.ceil(total * def.drain));
      ev.push({ kind: 'heal', side, hp: user.c.hp, maxHp: userMax });
      ev.push({ kind: 'text', text: `${who} drained energy!` });
    }
    if (def.recoil && isAlive(user.c) && !(this.spared && side === 'enemy')) {
      const rc = this.hurt(user, Math.max(1, Math.round(total * def.recoil)));
      ev.push({ kind: 'damage', side, hp: user.c.hp, maxHp: userMax, amount: rc });
      ev.push({ kind: 'text', text: `${who} is hurt by recoil!` });
    }
    if (def.targetAfter && isAlive(target.c)) for (const e of def.targetAfter) this.bump(target, targetSide, e.stat, e.stages, ev, true);
    if (def.selfAfter && isAlive(user.c)) for (const e of def.selfAfter) this.bump(user, side, e.stat, e.stages, ev);

    if (slot.tier >= 3) this.applyTier3(def, user, target, side, total, ev);
    // A Fire hit thaws a frozen target (statuses from the move itself rolled on each hit, above).
    if (landed > 0 && isAlive(target.c)) {
      if (target.status === 'freeze' && el === 'Fire' && def.status?.id !== 'freeze') this.cure(target, targetSide, ev);
      // Venom coat: the side's hits may poison.
      if (this.hasFx(side, 'venom') && !target.status && this.rng.chance(0.3)) this.inflict(target, targetSide, 'poison', ev);
    }

    if (!isAlive(target.c)) this.handleFaint(targetSide, ev);
    if (!isAlive(user.c)) this.handleFaint(side, ev);
  }

  private applyTier3(
    def: MoveDef,
    user: Combatant,
    target: Combatant,
    side: Side,
    damage: number,
    ev: BattleEvent[],
  ) {
    const userMax = stats(user.c).hp;
    switch (def.element) {
      case 'Fire':
        this.inflict(target, side === 'player' ? 'enemy' : 'player', 'burn', ev, '', { x: user, side });
        break;
      case 'Frost':
        if (isAlive(target.c) && target.spdStage > -MAX_STAGE && !this.unshaken(target, side === 'player' ? 'enemy' : 'player', 'spd', ev)) {
          target.spdStage -= 1;
          ev.push({ kind: 'text', text: `${creatureName(target.c)}'s Speed fell!` });
        }
        break;
      case 'Nature': {
        const amt = Math.ceil(damage * 0.15);
        if (amt > 0 && isAlive(user.c)) {
          user.c.hp = Math.min(userMax, user.c.hp + amt);
          ev.push({ kind: 'heal', side, hp: user.c.hp, maxHp: userMax });
          ev.push({ kind: 'text', text: `${creatureName(user.c)} drained energy!` });
        }
        break;
      }
      case 'Earth':
        if (user.defStage < MAX_STAGE) {
          user.defStage += 1;
          ev.push({ kind: 'text', text: `${creatureName(user.c)}'s Defense rose!` });
        }
        break;
      case 'Water':
        if (isAlive(user.c) && damage > 0) {
          user.c.hp = Math.min(userMax, user.c.hp + Math.ceil(damage * 0.15));
          ev.push({ kind: 'heal', side, hp: user.c.hp, maxHp: userMax });
          ev.push({ kind: 'text', text: `${creatureName(user.c)} was refreshed!` });
        }
        break;
      case 'Storm':
      case 'Dragon':
        break; // handled in damage (double strike / bonus damage)
      case 'Toxic':
        this.inflict(target, side === 'player' ? 'enemy' : 'player', 'poison', ev, '', { x: user, side });
        break;
      case 'Metal':
        this.bump(user, side, 'atk', 1, ev);
        break;
      case 'Light':
        this.bump(user, side, 'spd', 1, ev);
        break;
      case 'Shadow':
        if (isAlive(target.c)) this.bump(target, side === 'player' ? 'enemy' : 'player', 'atk', -1, ev, true);
        break;
      case 'Spirit':
        if (isAlive(target.c)) this.bump(target, side === 'player' ? 'enemy' : 'player', 'def', -1, ev, true);
        break;
    }
  }

  /** Change one stat stage on a combatant, with messaging. */
  private bump(x: Combatant, side: Side, stat: StatKey, by: number, ev: BattleEvent[], fromFoe = false) {
    if (fromFoe && by < 0 && this.unshaken(x, side, stat, ev)) return;
    const key = stageKey(stat);
    const before = x[key];
    x[key] = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, before + by));
    if (x[key] === before) return;
    ev.push({ kind: 'stat', side, up: by > 0 });
    ev.push({ kind: 'text', text: `${creatureName(x.c)}'s ${STAT_LABEL[stat]} ${by > 0 ? 'rose' : 'fell'}!` });
  }

  private handleFaint(side: Side, ev: BattleEvent[]) {
    const idx = side === 'player' ? this.pActive : this.eActive;
    const c = side === 'player' ? this.p.c : this.e.c;
    // Avenger: its teammates are fired up next turn.
    for (const x of side === 'player' ? this.player : this.enemy) x.avenge = this.turnNo + 1;
    this.boonsOnFaint(side, ev);
    c.status = undefined;
    ev.push({ kind: 'faint', side, index: idx });
    ev.push({
      kind: 'text',
      text: side === 'player' && this.permadeath ? `${creatureName(c)} has fallen... forever.` : `${this.nameOf(side, c)} fainted!`,
    });
    if (side === 'enemy') {
      // In duels the other person picks their next creature themselves.
      const next = this.duel ? -1 : this.tactics ? this.bestEnemyAnswer() : this.enemy.findIndex((x) => isAlive(x.c));
      if (next >= 0) {
        this.eActive = next;
        resetStages(this.e);
        ev.push({ kind: 'enemySend', index: next, hp: this.e.c.hp });
        ev.push({ kind: 'text', text: `${this.tactics?.name ?? 'The enemy'} sends out ${creatureName(this.e.c)}!` });
        this.onEnter('enemy', ev);
        if (this.has('vengeance')) this.ruleBump(this.e, 'enemy', 'atk', 1, ev, 'vengeance');
      }
      if (this.has('curse') && isAlive(this.p.c)) {
        const max = stats(this.p.c).hp;
        const dmg = Math.max(1, Math.floor(max / 5));
        this.p.c.hp = Math.max(0, this.p.c.hp - dmg);
        ev.push({ kind: 'damage', side: 'player', hp: this.p.c.hp, maxHp: max, amount: dmg });
        ev.push({ kind: 'text', text: `${this.rn('curse')}: ${creatureName(this.p.c)} is struck by the curse!` });
        if (!isAlive(this.p.c)) this.handleFaint('player', ev);
      }
    }
  }

  /**
   * Applies damage to a combatant and returns what was dealt. In wild battles the last enemy
   * standing stops at 1 HP and is marked spared (ready to catch) instead of fainting.
   */
  private hurt(x: Combatant, dmg: number, foeHit = false): number {
    const isLastEnemy =
      this.spareLast && this.enemy.includes(x) && this.enemy.every((o) => o === x || !isAlive(o.c));
    const floor = isLastEnemy ? 1 : 0;
    const before = x.c.hp;
    // Last Stand Sash: once per battle, a knockout blow from full HP leaves 1 HP.
    if (x.c.held === 'sash' && !x.sash && dmg >= before && before === stats(x.c).hp && before > 1) {
      x.sash = 'fired';
      x.c.hp = 1;
      return before - 1;
    }
    // Steadfast and Second Skin: once a battle, a knockout blow leaves 1 HP.
    if (foeHit && !x.endured && dmg >= before && before > 1) {
      const max = stats(x.c).hp;
      const t = traitOf(x.c);
      if ((t === 'steadfast' && before >= max * this.tv(x, 'steadfast')) || t === 'secondskin') {
        x.endured = 'fired';
        x.c.hp = 1 + (t === 'secondskin' ? Math.floor(max * this.tv(x, 'secondskin')) : 0);
        return Math.max(0, before - x.c.hp);
      }
    }
    // Bond: your Hexling hangs on at 1 HP for you, now and then (once a battle).
    if (this.bonds && foeHit && !x.bonded && dmg >= before && before > 1 && this.player.includes(x)) {
      const hearts = bondHearts(x.c.bond);
      if (hearts && this.rng.chance(BOND_ENDURE[hearts])) {
        x.bonded = 'fired';
        x.c.hp = 1;
        return before - 1;
      }
    }
    // Second Wind (a mythic boon): once a floor, a Hexling that would faint comes back at 30%.
    if (foeHit && dmg >= before && floor === 0) {
      const side: Side = this.player.includes(x) ? 'player' : 'enemy';
      if (this.hb(side, 'secondwind') && !this.windUsed[side] && (side !== 'player' || !this.windAsk || this.windAsk())) {
        this.windUsed[side] = true;
        x.c.hp = Math.max(1, Math.round(stats(x.c).hp * 0.3));
        this.pendingWind = side;
        return Math.max(0, before - x.c.hp);
      }
    }
    x.c.hp = Math.max(floor, x.c.hp - dmg);
    if (isLastEnemy && x.c.hp === 1 && before - dmg <= 0) this.spared = true;
    return before - x.c.hp;
  }

  private endOfTurn(ev: BattleEvent[]) {
    // Bulwarks only last the turn.
    for (const x of [...this.player, ...this.enemy]) x.guarded = false;
    if (this.warp > 0 && --this.warp === 0) ev.push({ kind: 'text', text: 'Time returned to normal.' });
    if (this.spared) {
      ev.push({ kind: 'text', text: `The wild ${creatureName(this.e.c)} is too weak to fight on!` });
      return;
    }
    this.tickWeather(ev);
    if (this.outcome() !== 'ongoing' && this.outcome() !== 'needSwitch') return;
    this.ruleEndOfTurn(ev);
    this.tickTeamFx(ev);
    if (this.outcome() === 'ongoing' || this.outcome() === 'needSwitch') this.berries(ev);
    for (const side of ['player', 'enemy'] as const) {
      const x = side === 'player' ? this.p : this.e;
      if (!isAlive(x.c) || !x.status) continue;
      if (x.status === 'burn' || x.status === 'poison') {
        const max = stats(x.c).hp;
        // Virulence (a boon): the other side's poison hurts twice as much.
        const vir = x.status === 'poison' && this.hb(side === 'player' ? 'enemy' : 'player', 'virulence') ? 2 : 1;
        const dmg = this.hurt(x, Math.max(1, Math.floor((max / (x.status === 'burn' ? 12 : 8)) * vir)));
        ev.push({ kind: 'damage', side, hp: x.c.hp, maxHp: max, amount: dmg });
        ev.push({ kind: 'text', text: `${this.label(x)} is hurt by its ${x.status === 'burn' ? 'burn' : 'poison'}!` });
        this.sashNote(x, ev);
        if (!isAlive(x.c)) {
          this.handleFaint(side, ev);
          continue;
        }
      }
      // Burn, poison and paralysis wear off with time (the others count down when it tries to act).
      if ((x.status === 'burn' || x.status === 'poison' || x.status === 'para') && --x.statusTurns <= 0) this.cure(x, side, ev);
    }
    this.traitsEndOfTurn(ev);
    this.boonsEndOfTurn(ev);
    this.sidelines(ev);
  }

  /**
   * Your creatures that aren't fighting keep suffering their status: burn and poison still hurt
   * (never below 1 HP off the field) and every timer keeps counting down.
   */
  private sidelines(ev: BattleEvent[]) {
    const waiting = [...this.player.filter((x) => x !== this.p).map((x) => x.c), ...this.reserve];
    for (const c of waiting) {
      if (!isAlive(c) || !c.status) continue;
      const id = c.status.id;
      if (id === 'burn' || id === 'poison') {
        const max = stats(c).hp;
        c.hp = Math.max(1, c.hp - Math.max(1, Math.floor(max / (id === 'burn' ? 12 : 8))));
      }
      if (--c.status.turns <= 0) {
        c.status = undefined;
        ev.push({ kind: 'text', text: `On the sidelines, ${creatureName(c)} ${STATUS[id].ends}.` });
      }
    }
  }

  private pendingWind: Side | null = null;

  private sashNote(x: Combatant, ev: BattleEvent[]) {
    if (this.pendingWind) {
      const side = this.pendingWind;
      this.pendingWind = null;
      this.boonCall(side, 'secondwind', ev);
      ev.push({ kind: 'text', text: `Second Wind! ${this.label(x)} gets back up!` });
    }
    if (x.endured === 'fired') {
      x.endured = 'spent';
      ev.push({ kind: 'text', text: `${this.label(x)} hung on with its ${TRAITS[traitOf(x.c)!].name}!` });
    }
    if (x.bonded === 'fired') {
      x.bonded = 'spent';
      ev.push({ kind: 'text', text: `${creatureName(x.c)} hung on for you! ${'♥'.repeat(bondHearts(x.c.bond))}` });
    }
    if (x.sash !== 'fired') return;
    x.sash = 'spent';
    ev.push({ kind: 'text', text: `${creatureName(x.c)} hung on with its Last Stand Sash!` });
  }

  /** Berry Pouch: a little healing at the end of every turn. */
  private berries(ev: BattleEvent[]) {
    for (const side of ['player', 'enemy'] as const) {
      const x = side === 'player' ? this.p : this.e;
      const max = stats(x.c).hp;
      if (x.c.held !== 'berry' || !isAlive(x.c) || x.c.hp >= max || this.scorched(x)) continue;
      x.c.hp = Math.min(max, x.c.hp + Math.ceil(max / 12));
      ev.push({ kind: 'heal', side, hp: x.c.hp, maxHp: max });
      ev.push({ kind: 'text', text: `${this.nameOf(side, x.c)} snacks on a berry.` });
    }
  }

  /** Boss rules that trigger at the end of each turn. */
  private ruleEndOfTurn(ev: BattleEvent[]) {
    if (!this.rules.length || this.outcome() === 'win' || this.outcome() === 'lose') return;
    const p = this.p;
    const e = this.e;
    if (this.has('scorch') && isAlive(p.c) && !creatureTypes(p.c).includes('Fire')) {
      const max = stats(p.c).hp;
      const dmg = Math.max(1, Math.floor(max / 16));
      p.c.hp = Math.max(0, p.c.hp - dmg);
      ev.push({ kind: 'damage', side: 'player', hp: p.c.hp, maxHp: max, amount: dmg });
      ev.push({ kind: 'text', text: `${this.rn('scorch')}: ${creatureName(p.c)} is scorched!` });
      if (!isAlive(p.c)) this.handleFaint('player', ev);
    }
    if (this.has('overclock') && isAlive(e.c) && e[stageKey('atk')] < OVERCLOCK_MAX) this.ruleBump(e, 'enemy', 'atk', 1, ev, 'overclock');
    if (this.has('sanctuary') && isAlive(e.c)) {
      const max = stats(e.c).hp;
      if (e.c.hp < max) {
        e.c.hp = Math.min(max, e.c.hp + Math.ceil(max / 12));
        ev.push({ kind: 'heal', side: 'enemy', hp: e.c.hp, maxHp: max });
        ev.push({ kind: 'text', text: `${this.rn('sanctuary')}: Enemy ${creatureName(e.c)} is restored by the light!` });
      }
    }
    // Leech Field: your active Hexling feeds theirs.
    if (this.has('leech') && isAlive(p.c) && isAlive(e.c) && this.outcome() !== 'win') {
      const pmax = stats(p.c).hp;
      const dmg = Math.min(p.c.hp, Math.max(1, Math.floor(pmax / 16)));
      p.c.hp -= dmg;
      ev.push({ kind: 'damage', side: 'player', hp: p.c.hp, maxHp: pmax, amount: dmg });
      const emax = stats(e.c).hp;
      if (e.c.hp < emax) {
        e.c.hp = Math.min(emax, e.c.hp + dmg);
        ev.push({ kind: 'heal', side: 'enemy', hp: e.c.hp, maxHp: emax });
      }
      ev.push({ kind: 'text', text: `${this.rn('leech')}: Enemy ${creatureName(e.c)} drains ${creatureName(p.c)}!` });
      if (!isAlive(p.c)) this.handleFaint('player', ev);
    }
  }
}

function stageKey(stat: StatKey): 'atkStage' | 'defStage' | 'spdStage' {
  return stat === 'atk' ? 'atkStage' : stat === 'def' ? 'defStage' : 'spdStage';
}

/** A creature entering battle. Its status lives on the creature, so it carries over between battles. */
function fresh(c: Creature): Combatant {
  return {
    c,
    atkStage: 0,
    defStage: 0,
    spdStage: 0,
    get status() {
      return c.status?.id ?? null;
    },
    set status(id: StatusId | null) {
      c.status = id ? { id, turns: c.status?.turns ?? 0 } : undefined;
    },
    get statusTurns() {
      return c.status?.turns ?? 0;
    },
    set statusTurns(n: number) {
      if (c.status) c.status.turns = n;
    },
  };
}

function resetStages(x: Combatant) {
  x.rampage = 0;
  x.atkStage = 0;
  x.defStage = 0;
  x.spdStage = 0;
  x.guardStreak = 0;
  x.guarded = false;
}

/** The element an attack actually hits with (bestType moves pick the user's most effective type). */
export function attackElement(def: MoveDef, user: Combatant, target: Combatant): Element {
  if (!def.bestType) return attackEl(def);
  const types = creatureTypes(user.c);
  const tt = creatureTypes(target.c);
  return typeMultiplier(types[1], tt) > typeMultiplier(types[0], tt) ? types[1] : types[0];
}

export function computeDamage(
  user: Combatant,
  target: Combatant,
  def: MoveDef,
  tier: number,
  rng: Rng,
  element: Element = attackEl(def),
  powerMult = 1,
): { dmg: number; mult: number } {
  const us = stats(user.c);
  const ts = stats(target.c);
  const atk = us.atk * (user.syn?.atk ?? 1) * stageMult(user.atkStage);
  const dfn = ts.def * (target.syn?.def ?? 1) * stageMult(target.defStage);
  const mult = typeMultiplier(element, creatureTypes(target.c));
  const stab = stabMultiplier(element, creatureTypes(user.c));
  const held =
    (user.c.held === 'band' ? 1.15 : 1) *
    (user.c.held === 'charm' && stab > 1 ? 1.2 : 1) *
    (target.c.held === 'shell' ? 0.85 : 1) *
    (user.status === 'burn' ? 0.8 : 1);
  const power = def.power * powerMult * TIER_POWER[tier] * (tier >= 3 && def.element === 'Dragon' ? 1.2 : 1);
  const base = power * (atk / dfn) * levelFactor(user.c.level) * BALANCE.damageScale;
  const roll = 0.85 + rng.next() * 0.15;
  return { dmg: Math.max(1, Math.round(base * mult * stab * held * roll)), mult };
}
