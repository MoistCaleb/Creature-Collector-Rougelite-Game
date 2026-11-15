import { BALANCE } from '../data/balance';
import { attackValue, effectsAtTier, healAtTier, MAX_STAGE, STAT_LABEL, TIER_POWER, type MoveDef, type StatKey } from '../data/moves';
import type { Element } from '../data/types';
import { effectivenessLabel, stabMultiplier, typeMultiplier } from '../data/types';
import { creatureName, creatureTypes, isAlive, levelFactor, moveDef, stats, type Creature, type MoveSlot } from './creature';
import { Rng } from './rng';

export type Side = 'player' | 'enemy';

export interface Combatant {
  c: Creature;
  atkStage: number;
  defStage: number;
  spdStage: number;
  burn: number; // damage-over-time turns remaining
  dot: 'burn' | 'poison';
}

export type PlayerAction = { kind: 'move'; index: number } | { kind: 'swap'; index: number };

export type BattleEvent =
  | { kind: 'text'; text: string }
  | { kind: 'swap'; side: Side; index: number }
  | { kind: 'attack'; side: Side; move: string; moveId: string }
  | { kind: 'stat'; side: Side; up: boolean }
  | { kind: 'damage'; side: Side; hp: number; maxHp: number; amount: number }
  | { kind: 'heal'; side: Side; hp: number; maxHp: number }
  | { kind: 'faint'; side: Side; index: number }
  | { kind: 'enemySend'; index: number };

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
  /** Chance the enemy picks a random move instead of its best one. */
  private enemyRandomness: number;

  constructor(
    playerTeam: Creature[],
    enemyTeam: Creature[],
    rng: Rng = new Rng(),
    opts: { playerDamageMult?: number; enemyRandomness?: number } = {},
  ) {
    this.playerDamageMult = opts.playerDamageMult ?? 1;
    this.enemyRandomness = opts.enemyRandomness ?? 0.25;
    this.player = playerTeam.map(fresh);
    this.enemy = enemyTeam.map(fresh);
    this.pActive = Math.max(0, this.player.findIndex((p) => isAlive(p.c)));
    this.eActive = Math.max(0, this.enemy.findIndex((e) => isAlive(e.c)));
    if (this.player[this.pActive]) this.fought.add(this.player[this.pActive].c.uid);
    this.rng = rng;
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
    if (this.enemy.every((x) => !isAlive(x.c))) return 'win';
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
    return [
      { kind: 'swap', side: 'player', index },
      { kind: 'text', text: `Go, ${creatureName(this.p.c)}!` },
    ];
  }

  takeTurn(action: PlayerAction): BattleEvent[] {
    const ev: BattleEvent[] = [];
    const enemyMove = this.chooseEnemyMove();

    if (action.kind === 'swap') {
      if (!this.canSwapTo(action.index)) return ev;
      ev.push({ kind: 'text', text: `${creatureName(this.p.c)}, come back!` });
      this.pActive = action.index;
      this.fought.add(this.p.c.uid);
      resetStages(this.p);
      ev.push({ kind: 'swap', side: 'player', index: action.index });
      ev.push({ kind: 'text', text: `Go, ${creatureName(this.p.c)}!` });
      this.useMove('enemy', enemyMove, ev);
    } else {
      const enemyAtStart = this.e;
      const pPri = !!moveDef(this.p.c.moves[action.index]).priority;
      const ePri = !!moveDef(enemyMove).priority;
      const playerFirst = pPri !== ePri ? pPri : this.playerGoesFirst();
      const order = playerFirst ? (['player', 'enemy'] as const) : (['enemy', 'player'] as const);
      for (const side of order) {
        // A freshly sent-in enemy doesn't act on the turn its predecessor fainted.
        if (side === 'enemy' && this.e !== enemyAtStart) continue;
        const actor = side === 'player' ? this.p : this.e;
        if (!isAlive(actor.c)) continue;
        const target = side === 'player' ? this.e : this.p;
        if (!isAlive(target.c)) continue;
        const slot = side === 'player' ? this.p.c.moves[action.index] : enemyMove;
        this.useMove(side, slot, ev);
      }
    }

    this.endOfTurn(ev);
    return ev;
  }

  private playerGoesFirst(): boolean {
    const ps = stats(this.p.c).spd * stageMult(this.p.spdStage);
    const es = stats(this.e.c).spd * stageMult(this.e.spdStage);
    if (ps === es) return this.rng.chance(0.5);
    return ps > es;
  }

  private chooseEnemyMove(): MoveSlot {
    const moves = this.e.c.moves;
    // Mostly pick the best expected damage, sometimes random.
    if (this.rng.chance(this.enemyRandomness)) return this.rng.pick(moves);
    let best = moves[0];
    let bestScore = -1;
    for (const m of moves) {
      const d = moveDef(m);
      const score = d.kind !== 'attack' ? this.statusScore(m) : this.attackScore(this.e, this.p, m);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
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
  private statusScore(m: MoveSlot): number {
    const d = moveDef(m);
    const hpFrac = this.e.c.hp / stats(this.e.c).hp;
    if (d.kind === 'heal') return hpFrac < 0.5 ? 90 * (1 - hpFrac) : 0;
    if (hpFrac < 0.4) return 0;
    const holder = d.kind === 'buff' ? this.e : this.p;
    const room = effectsAtTier(d, m.tier).some((e) => {
      const cur = holder[stageKey(e.stat)];
      return e.stages > 0 ? cur < 2 : cur > -2;
    });
    return room ? 50 * hpFrac : 0;
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

  private useMove(side: Side, slot: MoveSlot, ev: BattleEvent[]) {
    const user = side === 'player' ? this.p : this.e;
    const target = side === 'player' ? this.e : this.p;
    const targetSide: Side = side === 'player' ? 'enemy' : 'player';
    const def = moveDef(slot);
    const who = side === 'enemy' ? `Enemy ${creatureName(user.c)}` : creatureName(user.c);
    ev.push({ kind: 'attack', side, move: def.name, moveId: def.id });
    ev.push({ kind: 'text', text: `${who} used ${def.name}!` });

    if (this.rng.next() * 100 >= def.accuracy) {
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
      return;
    }

    const el = attackElement(def, user, target);
    const powerMult = def.execute && target.c.hp < stats(target.c).hp / 2 ? 2 : 1;
    let hits = def.hits ?? 1;
    if (slot.tier >= 3 && def.element === 'Storm' && this.rng.chance(0.35)) hits += 1;
    let total = 0;
    let landed = 0;
    for (let h = 0; h < hits && isAlive(target.c); h++) {
      const r = computeDamage(user, target, def, slot.tier, this.rng, el, powerMult);
      const dmg = side === 'player' ? Math.round(r.dmg * this.playerDamageMult) : r.dmg;
      target.c.hp = Math.max(0, target.c.hp - dmg);
      total += dmg;
      landed++;
      ev.push({ kind: 'damage', side: targetSide, hp: target.c.hp, maxHp: stats(target.c).hp, amount: dmg });
      if (h === 0) {
        const label = effectivenessLabel(r.mult);
        if (label) ev.push({ kind: 'text', text: label });
        if (powerMult > 1) ev.push({ kind: 'text', text: 'A finishing blow!' });
      }
    }
    if (landed > 1) ev.push({ kind: 'text', text: `Hit ${landed} times!` });

    const userMax = stats(user.c).hp;
    if (def.drain && isAlive(user.c)) {
      user.c.hp = Math.min(userMax, user.c.hp + Math.ceil(total * def.drain));
      ev.push({ kind: 'heal', side, hp: user.c.hp, maxHp: userMax });
      ev.push({ kind: 'text', text: `${who} drained energy!` });
    }
    if (def.recoil && isAlive(user.c)) {
      const rc = Math.max(1, Math.round(total * def.recoil));
      user.c.hp = Math.max(0, user.c.hp - rc);
      ev.push({ kind: 'damage', side, hp: user.c.hp, maxHp: userMax, amount: rc });
      ev.push({ kind: 'text', text: `${who} is hurt by recoil!` });
    }
    if (def.targetAfter && isAlive(target.c)) for (const e of def.targetAfter) this.bump(target, targetSide, e.stat, e.stages, ev);
    if (def.selfAfter && isAlive(user.c)) for (const e of def.selfAfter) this.bump(user, side, e.stat, e.stages, ev);

    if (slot.tier >= 3) this.applyTier3(def, user, target, side, total, ev);

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
        if (isAlive(target.c) && target.burn === 0) {
          target.burn = 3;
          target.dot = 'burn';
          ev.push({ kind: 'text', text: `${creatureName(target.c)} was burned!` });
        }
        break;
      case 'Frost':
        if (isAlive(target.c) && target.spdStage > -MAX_STAGE) {
          target.spdStage -= 1;
          ev.push({ kind: 'text', text: `${creatureName(target.c)}'s Speed fell!` });
        }
        break;
      case 'Nature': {
        const amt = Math.ceil(damage * 0.4);
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
        if (isAlive(user.c)) {
          user.c.hp = Math.min(userMax, user.c.hp + Math.ceil(userMax * 0.15));
          ev.push({ kind: 'heal', side, hp: user.c.hp, maxHp: userMax });
          ev.push({ kind: 'text', text: `${creatureName(user.c)} was refreshed!` });
        }
        break;
      case 'Storm':
      case 'Dragon':
        break; // handled in damage (double strike / bonus damage)
      case 'Toxic':
        if (isAlive(target.c) && target.burn === 0) {
          target.burn = 3;
          target.dot = 'poison';
          ev.push({ kind: 'text', text: `${creatureName(target.c)} was poisoned!` });
        }
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
        ev.push({ kind: 'enemySend', index: next });
        ev.push({ kind: 'text', text: `The enemy sends out ${creatureName(this.e.c)}!` });
      }
    }
  }

  private endOfTurn(ev: BattleEvent[]) {
    for (const side of ['player', 'enemy'] as const) {
      const x = side === 'player' ? this.p : this.e;
      if (x.burn > 0 && isAlive(x.c)) {
        const max = stats(x.c).hp;
        const dmg = Math.max(1, Math.floor(max / 12));
        x.c.hp = Math.max(0, x.c.hp - dmg);
        x.burn -= 1;
        ev.push({ kind: 'damage', side, hp: x.c.hp, maxHp: max, amount: dmg });
        ev.push({ kind: 'text', text: `${creatureName(x.c)} is hurt by its ${x.dot}!` });
        if (!isAlive(x.c)) this.handleFaint(side, ev);
      }
    }
  }
}

function stageKey(stat: StatKey): 'atkStage' | 'defStage' | 'spdStage' {
  return stat === 'atk' ? 'atkStage' : stat === 'def' ? 'defStage' : 'spdStage';
}

function fresh(c: Creature): Combatant {
  return { c, atkStage: 0, defStage: 0, spdStage: 0, burn: 0, dot: 'burn' };
}

function resetStages(x: Combatant) {
  x.atkStage = 0;
  x.defStage = 0;
  x.spdStage = 0;
  x.burn = 0;
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
  const atk = us.atk * stageMult(user.atkStage);
  const dfn = ts.def * stageMult(target.defStage);
  const mult = typeMultiplier(element, creatureTypes(target.c));
  const stab = stabMultiplier(element, creatureTypes(user.c));
  const power = def.power * powerMult * TIER_POWER[tier] * (tier >= 3 && def.element === 'Dragon' ? 1.2 : 1);
  const base = power * (atk / dfn) * levelFactor(user.c.level) * BALANCE.damageScale;
  const roll = 0.85 + rng.next() * 0.15;
  return { dmg: Math.max(1, Math.round(base * mult * stab * roll)), mult };
}
