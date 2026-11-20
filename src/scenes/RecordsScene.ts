import { DEX_FORMS, LEGENDS } from '../data/legends';
import { legendsCaught } from '../logic/run';
import Phaser from 'phaser';
import { gildedCount } from '../logic/gilded';
import { earnedTitles, TITLES } from '../logic/titles';
import { MAP_BY_ID } from '../data/maps';
import { SPECIES, SPECIES_BY_ID } from '../data/species';
import { mostUsed, type RunRecord } from '../logic/run';
import { state } from '../state';
import { Scroller } from '../ui/scroll';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { shinySparkle } from '../ui/shiny';
import { background, button, clipList, COLORS, H, LANDSCAPE, text, W } from '../ui/widgets';

const TOP = 72;

/** Lifetime records: wins and streaks, your most-used Hexling, lifetime counts and recent runs. */
export class RecordsScene extends Phaser.Scene {
  constructor() {
    super('Records');
  }

  create() {
    background(this);
    const meta = state.meta;
    const st = meta.stats;
    const list = this.add.container(0, TOP);
    clipList(this, list, TOP, H);

    // Upright: one column. Sideways: numbers on the left, recent runs on the right.
    const colW = LANDSCAPE ? (W - 36) / 2 : W - 24;
    const x0 = 12;
    let y = 0;
    const heading = (x: number, label: string) => {
      list.add(text(this, x + 2, y, label, 15, '#ffc94d', { fontStyle: 'bold' }));
      y += 24;
    };

    // Big numbers.
    heading(x0, 'Overall');
    const rate = meta.runs ? Math.round((meta.wins / meta.runs) * 100) : 0;
    const topHeat = Math.max(0, ...Object.values(meta.mapHeats ?? {}).flat());
    const tiles: [string, string][] = [
      ['Runs', String(meta.runs)],
      ['Wins', String(meta.wins)],
      ['Win rate', meta.runs ? `${rate}%` : '—'],
      ['Win streak', String(meta.streak ?? 0)],
      ['Best streak', String(meta.bestStreak ?? 0)],
      ['Top Heat won', topHeat ? String(topHeat) : '—'],
    ];
    const tw = (colW - 8) / 3;
    tiles.forEach(([label, value], i) => {
      const x = x0 + (i % 3) * (tw + 4);
      const yy = y + Math.floor(i / 3) * 62;
      list.add(this.add.rectangle(x, yy, tw, 56, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
      list.add(text(this, x + tw / 2, yy + 22, value, 22, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5));
      list.add(text(this, x + tw / 2, yy + 44, label, 11, COLORS.textDim).setOrigin(0.5));
    });
    y += 2 * 62 + 8;

    // Most used Hexling.
    const fav = mostUsed(meta);
    if (fav) {
      const sp = SPECIES_BY_ID[fav.speciesId];
      list.add(this.add.rectangle(x0, y, colW, 76, COLORS.panel).setOrigin(0).setStrokeStyle(2, 0xffc94d, 0.7));
      list.add(this.add.image(x0 + 42, y + 36, ensureCreatureTexture(this, sp.id, 0)).setScale(2.2 * SPRITE_FIT));
      list.add(text(this, x0 + 84, y + 12, 'Most used Hexling', 12, '#ffc94d', { fontStyle: 'bold' }));
      list.add(text(this, x0 + 84, y + 30, sp.names[0], 18, COLORS.text, { fontStyle: 'bold' }));
      list.add(text(this, x0 + 84, y + 52, `On your team for ${fav.runs} run${fav.runs === 1 ? '' : 's'}`, 12, COLORS.textDim));
      y += 86;
    }

    // Lifetime counts, two columns.
    heading(x0, 'Lifetime');
    const forms = DEX_FORMS;
    const counts: [string, string][] = [
      ['Battles won', st.battlesWon.toLocaleString()],
      ['Hexlings caught', st.caught.toLocaleString()],
      ['Trainers beaten', st.elites.toLocaleString()],
      ['Guardians beaten', meta.bossesDefeated.toLocaleString()],
      ['Evolutions', st.evolutions.toLocaleString()],
      ['Prestige stars', st.stars.toLocaleString()],
      ['Coins earned', st.coinsEarned.toLocaleString()],
      ['Coins spent', meta.coinsSpent.toLocaleString()],
      ['Potions used', st.potionsUsed.toLocaleString()],
      ['Statuses inflicted', st.statusInflicted.toLocaleString()],
      ['Events', st.events.toLocaleString()],
      ['Treasure opened', st.treasures.toLocaleString()],
      ['Hexlidex forms', `${meta.dex.forms.length}/${forms}`],
      ['Gilded Hexlings', `${meta.shinyCaught ?? 0} caught`],
      ['Arena best', `${meta.arenaBest ?? 0}/5`],
      ['Tournaments won', `${meta.tourneyWins ?? 0}`],
      ['Legendaries caught', `${legendsCaught(meta)}/${LEGENDS.length}`],
      ['Maps won', `${meta.clearedMaps.length}/${Object.keys(MAP_BY_ID).length}`],
      ['Deepest Gilded Hunt', meta.bestHunt ? `Floor ${meta.bestHunt}` : '—'],
      ['Best hunt haul', meta.bestHuntShinies ? `${meta.bestHuntShinies} gilded` : '—'],
      ['Gilded species', `${gildedCount(meta)}/${SPECIES.length}`],
      ['Titles earned', `${earnedTitles(meta).length}/${TITLES.length}`],
      ['Dailies played', String(Object.values(meta.dailies ?? {}).filter((r) => r.attempts > 0).length)],
      ['Weeklies won', `${Object.values(meta.weeklies ?? {}).filter((r) => r.best?.won).length}/${Object.values(meta.weeklies ?? {}).filter((r) => r.attempts > 0).length}`],
    ];
    const hw = (colW - 4) / 2;
    counts.forEach(([label, value], i) => {
      const x = x0 + (i % 2) * (hw + 4);
      const yy = y + Math.floor(i / 2) * 38;
      list.add(this.add.rectangle(x, yy, hw, 34, i % 4 < 2 ? COLORS.panelLight : COLORS.panel).setOrigin(0));
      list.add(text(this, x + 10, yy + 17, label, 12, COLORS.textDim).setOrigin(0, 0.5));
      list.add(text(this, x + hw - 10, yy + 17, value, 14, COLORS.text, { fontStyle: 'bold' }).setOrigin(1, 0.5));
    });
    y += Math.ceil(counts.length / 2) * 38 + 10;
    let bottom = y;

    // Recent runs.
    const rx = LANDSCAPE ? x0 + colW + 12 : x0;
    if (LANDSCAPE) y = 0;
    heading(rx, 'Recent runs');
    const runs = meta.history ?? [];
    if (!runs.length) {
      list.add(text(this, rx + 4, y, 'Finished runs show up here.', 13, COLORS.textDim));
      y += 30;
    }
    for (const r of runs) y = this.runRow(list, rx, y, colW, r);
    bottom = Math.max(bottom, y);

    // Header over the list.
    this.add.rectangle(0, 0, W, TOP - 4, COLORS.bg).setOrigin(0).setInteractive();
    text(this, 16, 14, 'Records', 24, '#ffc94d', { fontStyle: 'bold' });
    text(this, 16, 44, 'Every run counts, won or lost', 12, COLORS.textDim);
    button(this, W - 50, 30, 80, 40, 'Back', () => this.scene.start('Title', {}), { fontSize: 15 });
    button(this, W - 150, 30, 108, 40, 'Top 10', () => this.scene.start('Leaderboard', { from: 'Records' }), { fontSize: 15, color: 0x8a6a1a, glyph: 'crown' });

    const min = Math.min(TOP, H - bottom - 16);
    new Scroller(this, { get: () => list.y, set: (v) => list.setY(v), min: () => min, max: () => TOP });
  }

  /** One finished run: result, map, Heat and date, and the team that finished it. */
  private runRow(list: Phaser.GameObjects.Container, x: number, y: number, w: number, r: RunRecord): number {
    const h = 70;
    const color = r.won ? 0x5fd068 : 0xe0524a;
    list.add(this.add.rectangle(x, y, w, h, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
    list.add(this.add.rectangle(x, y, 6, h, color).setOrigin(0));
    const map = MAP_BY_ID[r.mapId]?.name ?? r.mapId;
    list.add(text(this, x + 16, y + 8, r.won ? 'WON' : `Floor ${r.floor}`, 15, r.won ? '#8fe08a' : '#ff8a7a', { fontStyle: 'bold' }));
    const date = new Date(r.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    list.add(text(this, x + 16, y + 28, `${map}${r.heat ? ` · Heat ${r.heat}` : ''}${r.daily ? ' · Daily' : ''}${r.weekly ? ' · Weekly' : ''}`, 12, COLORS.text));
    list.add(
      text(this, x + 16, y + 46, `${date} · ${r.battlesWon} wins · ${r.caught} caught${r.endedBy ? ` · ${r.endedBy}` : ''}`, 11, COLORS.textDim, {
        wordWrap: { width: w - 24 - Math.min(4, r.team.length) * 40 },
        maxLines: 1,
      }),
    );
    // The team that finished the run (up to 4 shown).
    r.team.slice(0, 4).forEach((c, i) => {
      const sx = x + w - 24 - i * 40;
      const img = this.add.image(sx, y + 30, ensureCreatureTexture(this, c.speciesId, c.stage, c.shiny)).setScale(1.15 * SPRITE_FIT);
      list.add(img);
      if (c.shiny) list.add(shinySparkle(this, sx + 12, y + 14, 8));
      list.add(text(this, sx, y + 56, `${c.level}`, 10, COLORS.textDim).setOrigin(0.5));
    });
    return y + h + 6;
  }
}
