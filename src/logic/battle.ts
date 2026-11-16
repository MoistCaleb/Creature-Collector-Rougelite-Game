import { BALANCE } from '../data/balance';
import { attackValue, effectsAtTier, healAtTier, MAX_STAGE, STAT_LABEL, TIER_POWER, type MoveDef, type StatKey } from '../data/moves';
import type { BossRule } from '../data/trainers';
import type { Element } from '../data/types';
import { effectivenessLabel, stabMultiplier, typeMultiplier } from '../data/types';
import { creatureName, creatureTypes, fallbackMove, hasUses, isAlive, levelFactor, moveDef, spendUse, stats, usesLeft, type Creature, type MoveSlot } from './creature';
import { Rng } from './rng';
import { STATUS, type StatusId } from '../data/status';

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
  | { kind: 'attack'; side: Side; move: string; moveId: string }
  | { kind: 'stat'; side: Side; up: boolean }
  /** `mult` is the type multiplier for attack hits; absent for recoil, poison and field damage. */
  | { kind: 'damage'; side: Side; hp: number; maxHp: number; amount: number; mult?: number; element?: Element }
  | { kind: 'heal'; side: Side; hp: number; maxHp: number }
  | { kind: 'faint'; side: Side; index: number }
  | { kind: 'enemySend'; index: number; hp: number }
  /** A status condition was gained (or cleared, when null). */
  | { kind: 'status'; side: Side; status: StatusId | null };

export type BattleOutcome = 'ongoing' | 'win' | 'lose' | 'needSwitch';

const stageMult = (s: number) => (s >= 0 ? 1 + 0.25 * s : 1 / (1 + 0.25 * -s));

export class Battle {
  readonly player: Combatant[];
  readonly enemy: Combatant[];
  pActive: number;
  /** uids of player creatures that have been sent out (they earn full XP). */
  readonly fought = new Set<number>();
  eActive = 0;
  private rng: Rng;
  private playerDamageMult: number;
  private playerStatusMult: number;
  private playerImmune: StatusId[];
  private reserve: Creature[];
  /** Chance the enemy picks a random move instead of its best one. */
  private enemyRandomness: number;
  /** A floor boss's special rule, if any. */
  readonly rule: BossRule | null;
  private ruleName: string;
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
      enemyRandomness?: number;
      rule?: BossRule;
      ruleName?: string;
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
    } = {},
  ) {
    this.playerDamageMult = opts.playerDamageMult ?? 1;
    this.enemyRandomness = opts.enemyRandomness ?? 0.25;
    this.rule = opts.rule ?? null;
    this.ruleName = opts.ruleName ?? 'The field';
    this.spareLast = opts.spareLast ?? false;
    this.spared = opts.spared ?? false;
    this.player = playerTeam.map(fresh);
    if (opts.synergy) for (const x of this.player) x.syn = opts.synergy;
    this.playerStatusMult = opts.playerStatusMult ?? 1;
    this.playerImmune = opts.playerStatusImmune ?? [];
    this.reserve = opts.reserve ?? [];
    this.enemy = enemyTeam.map(fresh);
    if (opts.enemySynergy) for (const x of this.enemy) x.syn = opts.enemySynergy;
    this.pActive = Math.max(0, this.player.findIndex((p) => isAlive(p.c)));
    this.eActive = Math.max(0, this.enemy.findIndex((e) => isAlive(e.c)));
    if (this.player[this.pActive]) this.fought.add(this.player[this.pActive].c.uid);
    this.rng = rng;
  }

  /**
   * Applies entry effects for the opening creatures. Call once when the battle starts.
   * When resuming a saved battle, pass true to skip effects that cost HP (they already happened).
   */
  start(resuming = false): BattleEvent[] {
    const ev: BattleEvent[] = [];
    if (this.enemy[this.eActive]) this.onEnter('enemy', ev);
    if (this.player[this.pActive]) this.onEnter('player', ev, resuming);
    return ev;
  }

  /** Boss rules that trigger when a creature enters battle. */
  private onEnter(side: Side, ev: BattleEvent[], skipHpCost = false) {
    const r = this.rule;
    if (!r) return;
    const x = side === 'player' ? this.p : this.e;
    if (!isAlive(x.c)) return;
    if (side === 'enemy') {
      if (r === 'bulwark') this.ruleBump(x, side, 'def', 1, ev);
      if (r === 'pride' && this.eActive === this.enemy.length - 1) {
        this.ruleBump(x, side, 'atk', 1, ev);
        this.ruleBump(x, side, 'spd', 1, ev);
      }
      return;
    }
    if (r === 'whiteout') this.ruleBump(x, side, 'spd', -1, ev);
    if (r === 'dread') this.ruleBump(x, side, 'atk', -1, ev);
    if (r === 'miasma' && !x.status) this.inflict(x, side, 'poison', ev, `${this.ruleName}: `);
    if (r === 'riptide' && !skipHpCost) {
      const max = stats(x.c).hp;
      const dmg = Math.min(x.c.hp - 1, Math.max(1, Math.floor(max / 8)));
      if (dmg > 0) {
        x.c.hp -= dmg;
        ev.push({ kind: 'damage', side, hp: x.c.hp, maxHp: max, amount: dmg });
        ev.push({ kind: 'text', text: `${this.ruleName}: ${creatureName(x.c)} is battered by the current!` });
      }
    }
  }

  private ruleBump(x: Combatant, side: Side, stat: StatKey, by: number, ev: BattleEvent[]) {
    const key = stageKey(stat);
    const before = x[key];
    x[key] = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, before + by));
    if (x[key] === before) return;
    ev.push({ kind: 'stat', side, up: by > 0 });
    ev.push({ kind: 'text', text: `${this.ruleName}: ${creatureName(x.c)}'s ${STAT_LABEL[stat]} ${by > 0 ? 'rose' : 'fell'}!` });
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
    const enemyMove = this.chooseEnemyMove();

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
      if (isAlive(this.p.c)) this.useMove('enemy', enemyMove, ev);
    } else if (action.kind === 'swap') {
      if (!this.canSwapTo(action.index)) return ev;
      ev.push({ kind: 'text', text: `${creatureName(this.p.c)}, come back!` });
      this.pActive = action.index;
      this.fought.add(this.p.c.uid);
      resetStages(this.p);
      ev.push({ kind: 'swap', side: 'player', index: action.index, hp: this.p.c.hp });
      ev.push({ kind: 'text', text: `Go, ${creatureName(this.p.c)}!` });
      this.onEnter('player', ev);
      if (isAlive(this.p.c)) this.useMove('enemy', enemyMove, ev);
    } else {
      const enemyAtStart = this.e;
      // A move with no uses left (or index -1) falls back to the creature's basic attack.
      const chosen = this.p.c.moves[action.index];
      const pSlot = chosen && hasUses(chosen) ? chosen : fallbackMove(this.p.c);
      const pPri = !!moveDef(pSlot).priority || this.clawProc(this.p);
      const ePri = !!moveDef(enemyMove).priority || this.clawProc(this.e);
      const playerFirst = pPri !== ePri ? pPri : this.rule === 'tailwind' ? false : this.playerGoesFirst();
      const order = playerFirst ? (['player', 'enemy'] as const) : (['enemy', 'player'] as const);
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
        this.useMove(side, slot, ev);
      }
    }

    this.endOfTurn(ev);
    return ev;
  }

  /** Quick Claw: a 25% chance to jump the queue this turn. */
  private clawProc(x: Combatant): boolean {
    return x.c.held === 'claw' && this.rng.chance(0.25);
  }

  private playerGoesFirst(): boolean {
    const ps = stats(this.p.c).spd * (this.p.syn?.spd ?? 1) * stageMult(this.p.spdStage) * (this.p.c.held === 'scarf' ? 1.25 : 1) * (this.p.status === 'para' ? 0.5 : 1);
    const es = stats(this.e.c).spd * (this.e.syn?.spd ?? 1) * stageMult(this.e.spdStage) * (this.e.c.held === 'scarf' ? 1.25 : 1) * (this.e.status === 'para' ? 0.5 : 1);
    if (ps === es) return this.rng.chance(0.5);
    return ps > es;
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

  /** Expected damage-ish score for an attack, used by the AI. */
  private attackScore(user: Combatant, target: Combatant, m: MoveSlot): number {
    const d = moveDef(m);
    const el = attackElement(d, user, target);
    let v = attackValue(d, m.tier) * typeMultiplier(el, creatureTypes(target.c)) * stabMultiplier(el, creatureTypes(user.c));
    const targetFrac = target.c.hp / stats(target.c).hp;
    if (d.execute && targetFrac < 0.5) v *= 2;
    if (d.priority && targetFrac < 0.25) v *= 1.5;
    return v;
  }

  /** How attractive a status move is to the AI right now (comparable to attack power). */
  private statusScore(m: MoveSlot, user: Combatant, foe: Combatant): number {
    const d = moveDef(m);
    const hpFrac = user.c.hp / stats(user.c).hp;
    if (d.kind === 'heal') return hpFrac < 0.5 ? 90 * (1 - hpFrac) : 0;
    if (hpFrac < 0.4) return 0;
    const holder = d.kind === 'buff' ? user : foe;
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
    const holder = def.kind === 'buff' ? user : target;
    const holderSide: Side = def.kind === 'buff' ? side : side === 'player' ? 'enemy' : 'player';
    const name = (holderSide === 'enemy' ? 'Enemy ' : '') + creatureName(holder.c);
    for (const e of effectsAtTier(def, slot.tier)) {
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
    return (this.enemy.includes(x) ? 'Enemy ' : '') + creatureName(x.c);
  }

  /** Give a combatant a status. Fails if it already has one, has fainted, or its type is immune. */
  private inflict(x: Combatant, side: Side, id: StatusId, ev: BattleEvent[], prefix = ''): boolean {
    if (!isAlive(x.c) || x.status) return false;
    const def = STATUS[id];
    if (creatureTypes(x.c).some((t) => def.immune.includes(t))) return false;
    if (side === 'player' && this.playerImmune.includes(id)) return false;
    x.status = id;
    x.statusTurns = this.rng.int(def.turns[0], def.turns[1]);
    ev.push({ kind: 'status', side, status: id });
    ev.push({ kind: 'text', text: `${prefix}${this.label(x)} ${def.verb}!` });
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
    const who = side === 'enemy' ? `Enemy ${creatureName(user.c)}` : creatureName(user.c);
    ev.push({ kind: 'attack', side, move: def.name, moveId: def.id });
    ev.push({ kind: 'text', text: `${who} used ${def.name}!` });

    if (this.rng.next() * 100 >= (user.c.held === 'lens' ? 100 : def.accuracy)) {
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
    if (def.kind !== 'attack') {
      this.applyStatus(side, slot, ev);
      if (def.status && def.kind === 'debuff' && this.rng.chance(def.status.chance * (side === 'player' ? this.playerStatusMult : 1))) {
        this.inflict(target, targetSide, def.status.id, ev);
      }
      return;
    }

    const el = attackElement(def, user, target);
    const powerMult = def.execute && target.c.hp < stats(target.c).hp / 2 ? 2 : 1;
    let hits = def.hits ?? 1;
    if (slot.tier >= 3 && def.element === 'Storm' && this.rng.chance(0.35)) hits += 1;
    let total = 0;
    let landed = 0;
    for (let h = 0; h < hits && isAlive(target.c) && !this.spared; h++) {
      const r = computeDamage(user, target, def, slot.tier, this.rng, el, powerMult);
      const raw = side === 'player' ? Math.round(r.dmg * this.playerDamageMult) : r.dmg;
      const dmg = this.hurt(target, raw);
      total += dmg;
      if (side === 'player') {
        user.c.dealt = (user.c.dealt ?? 0) + dmg;
        if (!isAlive(target.c)) user.c.kos = (user.c.kos ?? 0) + 1;
      }
      landed++;
      ev.push({ kind: 'damage', side: targetSide, hp: target.c.hp, maxHp: stats(target.c).hp, amount: dmg, mult: r.mult, element: el });
      this.sashNote(target, ev);
      if (h === 0) {
        const label = effectivenessLabel(r.mult);
        if (label) ev.push({ kind: 'text', text: label });
        if (powerMult > 1) ev.push({ kind: 'text', text: 'A finishing blow!' });
      }
    }
    if (landed > 1) ev.push({ kind: 'text', text: `Hit ${landed} times!` });

    const userMax = stats(user.c).hp;
    if (this.rule === 'thorns' && side === 'player' && total > 0 && isAlive(user.c)) {
      const th = Math.max(1, Math.round(total * 0.15));
      user.c.hp = Math.max(0, user.c.hp - th);
      ev.push({ kind: 'damage', side, hp: user.c.hp, maxHp: userMax, amount: th });
      ev.push({ kind: 'text', text: `${this.ruleName}: ${creatureName(user.c)} is cut by thorns!` });
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
    if (def.drain && isAlive(user.c)) {
      user.c.hp = Math.min(userMax, user.c.hp + Math.ceil(total * def.drain));
      ev.push({ kind: 'heal', side, hp: user.c.hp, maxHp: userMax });
      ev.push({ kind: 'text', text: `${who} drained energy!` });
    }
    if (def.recoil && isAlive(user.c) && !(this.spared && side === 'enemy')) {
      const rc = this.hurt(user, Math.max(1, Math.round(total * def.recoil)));
      ev.push({ kind: 'damage', side, hp: user.c.hp, maxHp: userMax, amount: rc });
      ev.push({ kind: 'text', text: `${who} is hurt by recoil!` });
    }
    if (def.targetAfter && isAlive(target.c)) for (const e of def.targetAfter) this.bump(target, targetSide, e.stat, e.stages, ev);
    if (def.selfAfter && isAlive(user.c)) for (const e of def.selfAfter) this.bump(user, side, e.stat, e.stages, ev);

    if (slot.tier >= 3) this.applyTier3(def, user, target, side, total, ev);
    // A Fire hit thaws a frozen target; moves named for a condition can inflict it.
    if (landed > 0 && isAlive(target.c)) {
      if (target.status === 'freeze' && el === 'Fire') this.cure(target, targetSide, ev);
      if (def.status && this.rng.chance(def.status.chance * (side === 'player' ? this.playerStatusMult : 1))) {
        this.inflict(target, targetSide, def.status.id, ev);
      }
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
        this.inflict(target, side === 'player' ? 'enemy' : 'player', 'burn', ev);
        break;
      case 'Frost':
        if (isAlive(target.c) && target.spdStage > -MAX_STAGE) {
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
        this.inflict(target, side === 'player' ? 'enemy' : 'player', 'poison', ev);
        break;
      case 'Metal':
        this.bump(user, side, 'atk', 1, ev);
        break;
      case 'Light':
        this.bump(user, side, 'spd', 1, ev);
        break;
      case 'Shadow':
        if (isAlive(target.c)) this.bump(target, side === 'player' ? 'enemy' : 'player', 'atk', -1, ev);
        break;
      case 'Spirit':
        if (isAlive(target.c)) this.bump(target, side === 'player' ? 'enemy' : 'player', 'def', -1, ev);
        break;
    }
  }

  /** Change one stat stage on a combatant, with messaging. */
  private bump(x: Combatant, side: Side, stat: StatKey, by: number, ev: BattleEvent[]) {
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
    c.status = undefined;
    ev.push({ kind: 'faint', side, index: idx });
    ev.push({
      kind: 'text',
      text: side === 'player' ? `${creatureName(c)} has fallen... forever.` : `Enemy ${creatureName(c)} fainted!`,
    });
    if (side === 'enemy') {
      const next = this.enemy.findIndex((x) => isAlive(x.c));
      if (next >= 0) {
        this.eActive = next;
        resetStages(this.e);
        ev.push({ kind: 'enemySend', index: next, hp: this.e.c.hp });
        ev.push({ kind: 'text', text: `The enemy sends out ${creatureName(this.e.c)}!` });
        this.onEnter('enemy', ev);
      }
      if (this.rule === 'curse' && isAlive(this.p.c)) {
        const max = stats(this.p.c).hp;
        const dmg = Math.max(1, Math.floor(max / 5));
        this.p.c.hp = Math.max(0, this.p.c.hp - dmg);
        ev.push({ kind: 'damage', side: 'player', hp: this.p.c.hp, maxHp: max, amount: dmg });
        ev.push({ kind: 'text', text: `${this.ruleName}: ${creatureName(this.p.c)} is struck by the curse!` });
        if (!isAlive(this.p.c)) this.handleFaint('player', ev);
      }
    }
  }

  /**
   * Applies damage to a combatant and returns what was dealt. In wild battles the last enemy
   * standing stops at 1 HP and is marked spared (ready to catch) instead of fainting.
   */
  private hurt(x: Combatant, dmg: number): number {
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
    x.c.hp = Math.max(floor, x.c.hp - dmg);
    if (isLastEnemy && x.c.hp === 1 && before - dmg <= 0) this.spared = true;
    return before - x.c.hp;
  }

  private endOfTurn(ev: BattleEvent[]) {
    if (this.spared) {
      ev.push({ kind: 'text', text: `The wild ${creatureName(this.e.c)} is too weak to fight on!` });
      return;
    }
    this.ruleEndOfTurn(ev);
    if (this.outcome() === 'ongoing' || this.outcome() === 'needSwitch') this.berries(ev);
    for (const side of ['player', 'enemy'] as const) {
      const x = side === 'player' ? this.p : this.e;
      if (!isAlive(x.c) || !x.status) continue;
      if (x.status === 'burn' || x.status === 'poison') {
        const max = stats(x.c).hp;
        const dmg = this.hurt(x, Math.max(1, Math.floor(max / (x.status === 'burn' ? 12 : 8))));
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

  private sashNote(x: Combatant, ev: BattleEvent[]) {
    if (x.sash !== 'fired') return;
    x.sash = 'spent';
    ev.push({ kind: 'text', text: `${creatureName(x.c)} hung on with its Last Stand Sash!` });
  }

  /** Berry Pouch: a little healing at the end of every turn. */
  private berries(ev: BattleEvent[]) {
    for (const side of ['player', 'enemy'] as const) {
      const x = side === 'player' ? this.p : this.e;
      const max = stats(x.c).hp;
      if (x.c.held !== 'berry' || !isAlive(x.c) || x.c.hp >= max) continue;
      x.c.hp = Math.min(max, x.c.hp + Math.ceil(max / 12));
      ev.push({ kind: 'heal', side, hp: x.c.hp, maxHp: max });
      ev.push({ kind: 'text', text: `${side === 'enemy' ? 'Enemy ' : ''}${creatureName(x.c)} snacks on a berry.` });
    }
  }

  /** Boss rules that trigger at the end of each turn. */
  private ruleEndOfTurn(ev: BattleEvent[]) {
    const r = this.rule;
    if (!r || this.outcome() === 'win' || this.outcome() === 'lose') return;
    const p = this.p;
    const e = this.e;
    if (r === 'scorch' && isAlive(p.c) && !creatureTypes(p.c).includes('Fire')) {
      const max = stats(p.c).hp;
      const dmg = Math.max(1, Math.floor(max / 16));
      p.c.hp = Math.max(0, p.c.hp - dmg);
      ev.push({ kind: 'damage', side: 'player', hp: p.c.hp, maxHp: max, amount: dmg });
      ev.push({ kind: 'text', text: `${this.ruleName}: ${creatureName(p.c)} is scorched!` });
      if (!isAlive(p.c)) this.handleFaint('player', ev);
    }
    if (r === 'overclock' && isAlive(e.c)) this.ruleBump(e, 'enemy', 'atk', 1, ev);
    if (r === 'sanctuary' && isAlive(e.c)) {
      const max = stats(e.c).hp;
      if (e.c.hp < max) {
        e.c.hp = Math.min(max, e.c.hp + Math.ceil(max / 12));
        ev.push({ kind: 'heal', side: 'enemy', hp: e.c.hp, maxHp: max });
        ev.push({ kind: 'text', text: `${this.ruleName}: Enemy ${creatureName(e.c)} is restored by the light!` });
      }
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
  x.atkStage = 0;
  x.defStage = 0;
  x.spdStage = 0;
}

/** The element an attack actually hits with (bestType moves pick the user's most effective type). */
export function attackElement(def: MoveDef, user: Combatant, target: Combatant): Element {
  if (!def.bestType) return def.element;
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
  element: Element = def.element,
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
