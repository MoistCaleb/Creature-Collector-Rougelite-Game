import Phaser from 'phaser';
import { champion, knockedOut, roundName } from '../logic/bracket';
import { activeTeam } from '../logic/arena';
import { creatureName, getFloorCeiling, setFloorCeiling } from '../logic/creature';
import { saveMeta } from '../logic/run';
import { takeNewTitles } from '../logic/titles';
import { titleNews } from '../logic/cosmetics';
import { myMatch, newTournament, nextCpuMatch, playCpuMatch, recordMine, teamFor, trainerOf, YOU, type Tournament } from '../logic/tournament';
import { lookForName, myLook, myName } from '../data/trainerLook';
import { state } from '../state';
import { drawBracket, drawChampion } from '../ui/bracketView';
import { openPicker, showMessage } from '../ui/picker';
import { playMusic, sfx } from '../ui/sound';
import { background, button, COLORS, H, LANDSCAPE, text, W } from '../ui/widgets';
import type { BattleMatch } from './BattleScene';

/** Start a fresh tournament with your active team (saved, so it survives closing the app). */
export function startTournament(): Tournament {
  const meta = state.meta;
  const t = newTournament(activeTeam(meta), Date.now() % 1e9);
  meta.tourney = t;
  saveMeta(meta);
  return t;
}

/**
 * Arena tournament: an 8-trainer single-elimination bracket. Your matches start from here; the
 * computer trainers' matches play out on the bracket in between.
 */
export class TournamentScene extends Phaser.Scene {
  constructor() {
    super('Tournament');
  }

  create() {
    const meta = state.meta;
    const t = meta.tourney;
    // A tournament saved by an older or damaged save: drop it.
    if (t && !(Array.isArray(t.bracket?.rounds) && Array.isArray(t.trainers) && Array.isArray(t.picks))) delete meta.tourney;
    if (!meta.tourney || !t) return this.scene.start('Arena', {});
    // A run's floor level cap doesn't apply to Lv 50 Arena creatures.
    const ceiling = getFloorCeiling();
    setFloorCeiling(Infinity);
    this.events.once('shutdown', () => setFloorCeiling(ceiling));
    background(this);
    playMusic('arena');

    const b = t.bracket;
    const champ = champion(b);
    if (champ === YOU && !t.counted) {
      t.counted = true;
      meta.tourneyWins = (meta.tourneyWins ?? 0) + 1;
      this.news = titleNews(takeNewTitles(meta)).replace(/^\n+/, ' ');
      sfx.victory();
    }
    saveMeta(meta);

    text(this, W / 2, LANDSCAPE ? 8 : 16, 'Arena Tournament', LANDSCAPE ? 22 : 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    const status = text(this, W / 2, LANDSCAPE ? 36 : 52, this.statusText(t), 13, COLORS.text, { align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5, 0);

    const top = status.y + status.height + (LANDSCAPE ? 22 : 30);
    const bottom = H - (LANDSCAPE ? 60 : 84) - (champ && !LANDSCAPE ? 120 : 0);
    const width = champ && LANDSCAPE ? W - 160 : W;
    drawBracket(this, b, { top, bottom, width }, { nameOf: (id) => this.nameOf(t, id), me: YOU });
    if (champ) drawChampion(this, champ === YOU ? myName(meta) : this.nameOf(t, champ), champ === YOU ? myLook(meta) : lookForName(this.nameOf(t, champ)), bottom + 70);

    // Two buttons along the bottom: the main action, and leaving.
    const by = H - (LANDSCAPE ? 30 : 40);
    const bw = Math.min(260, (W - 36) / 2);
    const left = W / 2 - bw / 2 - 6;
    const right = W / 2 + bw / 2 + 6;
    const mine = myMatch(t);
    const cpu = nextCpuMatch(t);
    const opts = { fontSize: 15 };
    if (champ) {
      button(this, left, by, bw, 46, 'New tournament', () => this.again(), { ...opts, color: 0x3b6d4a, glyph: 'swords', enabled: activeTeam(meta).length > 0 });
      button(this, right, by, bw, 46, 'Back to the Arena', () => this.leave(true), { ...opts, color: 0x2f4a6b });
    } else if (mine && !cpu) {
      const m = b.rounds[mine.round][mine.index];
      const opp = m.a === YOU ? m.b : m.a;
      button(this, left, by, bw, 46, opp ? `Fight the ${roundName(b, mine.round)}` : 'Waiting…', () => opp && this.fight(t, opp, mine.round), {
        ...opts,
        color: 0x8a2c2c,
        glyph: 'swords',
        enabled: !!opp,
      });
      button(this, right, by, bw, 46, 'Leave the tournament', () => this.leave(false), { ...opts, color: 0x5a2a2a });
    } else {
      // Out (or waiting on the other matches): they play out one by one; or skip to the end.
      button(this, left, by, bw, 46, mine ? 'Skip ahead' : 'Skip to the end', () => this.skip(t), { ...opts, color: 0x2f4a6b, enabled: !!cpu });
      button(this, right, by, bw, 46, mine ? 'Leave the tournament' : 'Back to the Arena', () => this.leave(!mine), { ...opts, color: mine ? 0x5a2a2a : 0x2f4a6b });
    }

    // The other matches finish one at a time, so you can watch the bracket fill in.
    if (cpu)
      this.time.delayedCall(900, () => {
        playCpuMatch(t, cpu.round, cpu.index);
        saveMeta(meta);
        sfx.click();
        this.scene.restart();
      });
  }

  private news = '';

  private nameOf(t: Tournament, id: string): string {
    return trainerOf(t, id)?.name ?? 'Trainer';
  }

  private statusText(t: Tournament): string {
    const b = t.bracket;
    const champ = champion(b);
    if (champ === YOU) return `You win the tournament!${this.news}`;
    if (champ) return `${this.nameOf(t, champ)} wins the tournament.`;
    if (knockedOut(b, YOU)) {
      const r = b.rounds.findIndex((round) => round.some((m) => (m.a === YOU || m.b === YOU) && m.winner && m.winner !== YOU));
      const m = b.rounds[r].find((x) => x.a === YOU || x.b === YOU)!;
      return `You were knocked out in the ${roundName(b, r)} by ${this.nameOf(t, m.winner!)}. Watch the rest play out.`;
    }
    const mine = myMatch(t);
    if (!mine) return '';
    const m = b.rounds[mine.round][mine.index];
    const opp = m.a === YOU ? m.b : m.a;
    if (opp) return `${roundName(b, mine.round)}: you vs ${this.nameOf(t, opp)}. Your team is fully healed.`;
    return `You’re through to the ${roundName(b, mine.round)}! The other matches are being played…`;
  }

  private fight(t: Tournament, oppId: string, round: number) {
    const opp = trainerOf(t, oppId)!;
    const enemies = teamFor(t, oppId);
    const name = roundName(t.bracket, round);
    openPicker(this, {
      title: `${name}: ${opp.name}`,
      subtitle: `${opp.name} sends out ${enemies.length} Hexlings. Your team is fully healed.`,
      rows: enemies.map((c) => ({ creature: c, text: `${creatureName(c)} · Lv ${c.level}` })),
      options: [{ label: 'Fight!', color: 0x8a2c2c }],
      onPick: () => {
        const match: BattleMatch = {
          team: teamFor(t, YOU),
          enemies,
          seed: t.seed + round * 31,
          title: name.toUpperCase(),
          sub: `Arena Tournament · ${name}`,
          opponent: opp.name,
          randomness: opp.randomness,
          tactics: opp.potions ? { potions: opp.potions } : undefined,
          background: 0x1a1430,
          onEnd: (won) => this.matchOver(won, name),
        };
        this.scene.start('Battle', { kind: 'elite', match });
      },
      onCancel: () => this.scene.restart(),
      cancelLabel: 'Back',
    });
  }

  /** Runs in the Battle scene when your match ends. */
  private matchOver(won: boolean, name: string) {
    const meta = state.meta;
    const t = meta.tourney;
    const battle = this.scene.get('Battle');
    if (!t) return battle.scene.start('Arena', {});
    recordMine(t, won);
    saveMeta(meta);
    const final = !myMatch(t) && won;
    const title = final ? 'Tournament won!' : won ? `${name} won!` : 'Knocked out';
    const body = final ? 'You beat every trainer in the bracket.' : won ? 'On to the next round. Your team will be fully healed.' : 'Your tournament ends here. Watch how the rest plays out.';
    showMessage(battle, title, body, () => battle.scene.start('Tournament'));
  }

  private skip(t: Tournament) {
    for (let cpu = nextCpuMatch(t); cpu; cpu = nextCpuMatch(t)) playCpuMatch(t, cpu.round, cpu.index);
    saveMeta(state.meta);
    this.scene.restart();
  }

  private again() {
    startTournament();
    this.scene.restart();
  }

  private leave(done: boolean) {
    const go = () => {
      delete state.meta.tourney;
      saveMeta(state.meta);
      this.scene.start('Arena', {});
    };
    if (done) return go();
    openPicker(this, {
      title: 'Leave the tournament?',
      subtitle: 'Your tournament ends here, and you can’t come back to it.',
      options: [{ label: 'Leave', color: 0x8a2c2c }],
      onPick: go,
      onCancel: () => {},
      cancelLabel: 'Stay',
    });
  }
}

