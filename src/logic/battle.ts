import { BALANCE } from '../data/balance';
import { TIER_POWER, type MoveDef } from '../data/moves';
import { effectivenessLabel, stabMultiplier, typeMultiplier } from '../data/types';
import { creatureName, creatureTypes, isAlive, levelFactor, moveDef, stats, type Creature, type MoveSlot } from './creature';
import { Rng } from './rng';

export type Side = 'player' | 'enemy';

export interface Combatant {
  c: Creature;
  atkStage: number;
  defStage: number;
  spdStage: number;
  burn: number; // turns remaining
}

export type PlayerAction = { kind: 'move'; index: number } | { kind: 'swap'; index: number };

export type BattleEvent =
  | { kind: 'text'; text: string }
  | { kind: 'swap'; side: Side; index: number }
  | { kind: 'attack'; side: Side; move: string }
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
    this.rng = rng;
  }

  get p(): Combatant {
    return this.player[this.pActive];
  }

  get e(): Combatant {
    return this.enemy[this.eActive];
  }

  outcome(): BattleOutcome {
    if (this.enemy.every((x) => !isAlive(x.c))) return 'win';
    if (this.player.every((x) => !isAlive(x.c))) return 'lose';
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
      resetStages(this.p);
      ev.push({ kind: 'swap', side: 'player', index: action.index });
      ev.push({ kind: 'text', text: `Go, ${creatureName(this.p.c)}!` });
      this.useMove('enemy', enemyMove, ev);
    } else {
      const enemyAtStart = this.e;
      const order = this.playerGoesFirst() ? (['player', 'enemy'] as const) : (['enemy', 'player'] as const);
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
      const score =
        d.power *
        TIER_POWER[m.tier] *
        (d.accuracy / 100) *
        typeMultiplier(d.element, creatureTypes(this.p.c)) *
        stabMultiplier(d.element, creatureTypes(this.e.c));
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  private useMove(side: Side, slot: MoveSlot, ev: BattleEvent[]) {
    const user = side === 'player' ? this.p : this.e;
    const target = side === 'player' ? this.e : this.p;
    const targetSide: Side = side === 'player' ? 'enemy' : 'player';
    const def = moveDef(slot);
    const who = side === 'enemy' ? `Enemy ${creatureName(user.c)}` : creatureName(user.c);
    ev.push({ kind: 'attack', side, move: def.name });
    ev.push({ kind: 'text', text: `${who} used ${def.name}!` });

    if (this.rng.next() * 100 >= def.accuracy) {
      ev.push({ kind: 'text', text: 'It missed!' });
      return;
    }

    const hits = slot.tier >= 3 && def.element === 'Storm' && this.rng.chance(0.35) ? 2 : 1;
    let total = 0;
    for (let h = 0; h < hits && isAlive(target.c); h++) {
      const r = computeDamage(user, target, def, slot.tier, this.rng);
      const mult = r.mult;
      const dmg = side === 'player' ? Math.round(r.dmg * this.playerDamageMult) : r.dmg;
      target.c.hp = Math.max(0, target.c.hp - dmg);
      total += dmg;
      ev.push({ kind: 'damage', side: targetSide, hp: target.c.hp, maxHp: stats(target.c).hp, amount: dmg });
      if (h === 0) {
        const label = effectivenessLabel(mult);
        if (label) ev.push({ kind: 'text', text: label });
      }
    }
    if (hits === 2) ev.push({ kind: 'text', text: 'Struck twice!' });

    if (slot.tier >= 3) this.applyTier3(def, user, target, side, total, ev);

    if (!isAlive(target.c)) this.handleFaint(targetSide, ev);
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
          ev.push({ kind: 'text', text: `${creatureName(target.c)} was burned!` });
        }
        break;
      case 'Frost':
        if (isAlive(target.c) && target.spdStage > -3) {
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
        if (user.defStage < 3) {
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
        break; // handled as double strike
    }
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
        ev.push({ kind: 'text', text: `${creatureName(x.c)} is hurt by its burn!` });
        if (!isAlive(x.c)) this.handleFaint(side, ev);
      }
    }
  }
}

function fresh(c: Creature): Combatant {
  return { c, atkStage: 0, defStage: 0, spdStage: 0, burn: 0 };
}

function resetStages(x: Combatant) {
  x.atkStage = 0;
  x.defStage = 0;
  x.spdStage = 0;
  x.burn = 0;
}

export function computeDamage(
  user: Combatant,
  target: Combatant,
  def: MoveDef,
  tier: number,
  rng: Rng,
): { dmg: number; mult: number } {
  const us = stats(user.c);
  const ts = stats(target.c);
  const atk = us.atk * stageMult(user.atkStage);
  const dfn = ts.def * stageMult(target.defStage);
  const mult = typeMultiplier(def.element, creatureTypes(target.c));
  const stab = stabMultiplier(def.element, creatureTypes(user.c));
  const power = def.power * TIER_POWER[tier];
  const base = power * (atk / dfn) * levelFactor(user.c.level) * BALANCE.damageScale;
  const roll = 0.85 + rng.next() * 0.15;
  return { dmg: Math.max(1, Math.round(base * mult * stab * roll)), mult };
}
