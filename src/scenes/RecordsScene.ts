import { DEX_FORMS, LEGENDS } from '../data/legends';
import { legendsCaught } from '../logic/run';
import Phaser from 'phaser';
import { campHearts, closestBond } from '../logic/camp';
import { formatDuration } from '../logic/runClock';
import { gildedCount } from '../logic/gilded';
import { earnedTitles, prehistoricCount, TITLES } from '../logic/titles';
import { MAP_BY_ID } from '../data/maps';
import { BOON_COLOR } from '../data/boons';
import { ELEMENTS } from '../data/types';
import { WORKSHOP } from '../data/workshop';
import { boonsTaken, COLLECTABLE, eldersBeaten, favouriteTrait, maxBondLines, MYTHICS, mythicsFound, surprisesFound, topBoons, workshopOwned } from '../logic/feats';
import { SPECIES, SPECIES_BY_ID } from '../data/species';
import { mostUsed, type RunRecord } from '../logic/run';
import { state } from '../state';
import { Scroller } from '../ui/scroll';
import { colours, ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { icon } from '../ui/icons';
import { shinySparkle } from '../ui/shiny';
import { background, button, clipList, COLORS, H, LANDSCAPE, text, W } from '../ui/widgets';

const TOP = 72;

/** Keeps a line of text within `max` pixels: shrinks it a little first, then trims it with an ellipsis. */
function fit(t: Phaser.GameObjects.Text, max: number, minScale = 0.8): Phaser.GameObjects.Text {
  if (max <= 0 || t.width <= max) return t;
  const scale = Math.max(minScale, max / t.width);
  t.setScale(scale);
  if (t.width * scale <= max) return t;
  const full = t.text;
  let n = full.length;
  while (n > 1 && t.width * scale > max) t.setText(full.slice(0, --n).trimEnd() + '…');
  return t;
}

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
    const rr = meta.runRecord ?? { wins: 0, losses: 0 };
    const played = rr.wins + rr.losses;
    const rate = played ? Math.round((rr.wins / played) * 100) : 0;
    const topHeat = Math.max(0, ...Object.values(meta.mapHeats ?? {}).flat());
    const tiles: [string, string][] = [
      ['Run W/L', `${rr.wins}–${rr.losses}`],
      ['Wins (all time)', String(meta.wins)],
      ['Win rate', played ? `${rate}%` : '—'],
      ['Win streak', String(meta.streak ?? 0)],
      ['Best streak', String(meta.bestStreak ?? 0)],
      ['Top Heat won', topHeat ? String(topHeat) : '—'],
      // Online games: duels, stage battles, battle royales and online tournaments (losses from v1.46).
      ['Online W/L', `${meta.onlineWins ?? 0}–${meta.onlineLosses ?? 0}`],
      ['Online streak', String(meta.onlineStreak ?? 0)],
      ['Best online streak', String(meta.bestOnlineStreak ?? 0)],
      // Quick runs (2.0): their own record.
      ['Quick run W/L', `${meta.quick?.wins ?? 0}–${meta.quick?.losses ?? 0}`],
      ['Quick streak', String(meta.quick?.streak ?? 0)],
      ['Fastest quick win', meta.quick?.fastest ? formatDuration(meta.quick.fastest) : '—'],
    ];
    const tw = (colW - 8) / 3;
    tiles.forEach(([label, value], i) => {
      const x = x0 + (i % 3) * (tw + 4);
      const yy = y + Math.floor(i / 3) * 62;
      list.add(this.add.rectangle(x, yy, tw, 56, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
      list.add(fit(text(this, x + tw / 2, yy + 22, value, 22, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5), tw - 10, 0.6));
      list.add(fit(text(this, x + tw / 2, yy + 44, label, 11, COLORS.textDim).setOrigin(0.5), tw - 8));
    });
    y += Math.ceil(tiles.length / 3) * 62 + 8;

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

    // Favourite trait and the boons you take most (2.0).
    const ft = favouriteTrait(meta);
    const boons = topBoons(meta, 5);
    if (ft || boons.length) heading(x0, 'Boons and traits');
    if (ft) {
      list.add(this.add.rectangle(x0, y, colW, 64, COLORS.panel).setOrigin(0).setStrokeStyle(2, 0x5cc2ff, 0.7));
      list.add(text(this, x0 + 12, y + 10, 'Favourite trait', 12, '#5cc2ff', { fontStyle: 'bold' }));
      list.add(text(this, x0 + colW - 12, y + 10, `${ft.runs} run${ft.runs === 1 ? '' : 's'}`, 12, COLORS.textDim).setOrigin(1, 0));
      list.add(fit(text(this, x0 + 12, y + 26, ft.trait.name, 16, COLORS.text, { fontStyle: 'bold' }), colW - 24));
      list.add(fit(text(this, x0 + 12, y + 46, ft.trait.text, 11, COLORS.textDim), colW - 24, 0.75));
      y += 72;
    }
    if (boons.length) {
      list.add(text(this, x0 + 2, y, `Boons you take most · ${boonsTaken(meta)} taken in all`, 12, COLORS.textDim));
      y += 20;
      for (const { boon, picks } of boons) {
        list.add(this.add.rectangle(x0, y, colW, 30, COLORS.panel).setOrigin(0));
        list.add(this.add.rectangle(x0, y, 5, 30, BOON_COLOR[boon.rarity]).setOrigin(0));
        const mark = boon.rarity === 'curse' ? '☠ ' : boon.rarity === 'mythic' ? '✦ ' : '';
        list.add(fit(text(this, x0 + 14, y + 15, `${mark}${boon.name}`, 13, COLORS.text, { fontStyle: 'bold' }).setOrigin(0, 0.5), colW - 80));
        list.add(text(this, x0 + colW - 10, y + 15, `×${picks}`, 13, COLORS.text, { fontStyle: 'bold' }).setOrigin(1, 0.5));
        y += 34;
      }
      y += 6;
    }

    // Lifetime counts, two columns.
    heading(x0, 'Lifetime');
    const forms = DEX_FORMS;
    const closest = closestBond(meta);
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
      ['Deepest Gilded Hunt', meta.bestHunt ? `Floor ${meta.bestHunt}${meta.bestHuntHeat ? ` · Heat ${meta.bestHuntHeat}` : ''}` : '—'],
      ['Best hunt haul', meta.bestHuntShinies ? `${meta.bestHuntShinies} gilded` : '—'],
      ['Gilded species', `${gildedCount(meta)}/${SPECIES.length}`],
      ['Prehistoric forms', `${prehistoricCount(meta)}/${SPECIES.length}`],
      ['Titles earned', `${earnedTitles(meta).length}/${TITLES.length}`],
      ['Closest camp bond', closest ? `${SPECIES_BY_ID[closest.speciesId].names[0]} ${'♥'.repeat(campHearts(meta, closest.speciesId))}` : '—'],
      ['Camp challenges', String(meta.camp?.done ?? 0)],
      // 2.0's long-term feats (also leaderboards).
      ['Workshop upgrades', `${workshopOwned(meta)}/${WORKSHOP.length}`],
      ['Lines at 5 hearts', String(maxBondLines(meta))],
      ['Rare surprises', `${surprisesFound(meta)}/${COLLECTABLE.length}`],
      ['Elders beaten', `${eldersBeaten(meta)}/${ELEMENTS.length}`],
      ['Mythic boons found', `${mythicsFound(meta)}/${MYTHICS.length}`],
      ['Boons taken', String(boonsTaken(meta))],
      ['Fastest win', meta.fastestWin ? formatDuration(meta.fastestWin) : '—'],
      ['Hexlidex rewards', String(meta.dexClaimed?.length ?? 0)],
      ['Dailies played', String(Object.values(meta.dailies ?? {}).filter((r) => r.attempts > 0).length)],
      ['Weeklies won', `${Object.values(meta.weeklies ?? {}).filter((r) => r.best?.won).length}/${Object.values(meta.weeklies ?? {}).filter((r) => r.attempts > 0).length}`],
    ];
    const hw = (colW - 4) / 2;
    counts.forEach(([label, value], i) => {
      const x = x0 + (i % 2) * (hw + 4);
      const yy = y + Math.floor(i / 2) * 38;
      list.add(this.add.rectangle(x, yy, hw, 34, i % 4 < 2 ? COLORS.panelLight : COLORS.panel).setOrigin(0));
      const l = text(this, x + 10, yy + 17, label, 12, COLORS.textDim).setOrigin(0, 0.5);
      const v = text(this, x + hw - 10, yy + 17, value, 14, COLORS.text, { fontStyle: 'bold' }).setOrigin(1, 0.5);
      // Long pairs (Deepest Gilded Hunt, Closest camp bond…) stack instead of running into each other:
      // the label along the top, the value under it on the right.
      if (l.width + v.width + 28 > hw) {
        l.setFontSize(11).setY(yy + 9);
        v.setFontSize(13).setY(yy + 24);
        fit(l, hw - 20);
        fit(v, hw - 20, 0.85);
      }
      list.add([l, v]);
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
    // Text stops short of the team sprites on the right.
    const room = w - 24 - Math.min(4, r.team.length) * 40;
    list.add(fit(text(this, x + 16, y + 28, `${map}${r.heat ? ` · Heat ${r.heat}` : ''}${r.daily ? ' · Daily' : ''}${r.weekly ? ' · Weekly' : ''}`, 12, COLORS.text), room));
    list.add(fit(text(this, x + 16, y + 46, `${date} · ${r.battlesWon} wins · ${r.caught} caught${r.endedBy ? ` · ${r.endedBy}` : ''}`, 11, COLORS.textDim), room, 0.9));
    // The team that finished the run (up to 4 shown).
    r.team.slice(0, 4).forEach((c, i) => {
      const sx = x + w - 24 - i * 40;
      const img = this.add.image(sx, y + 30, ensureCreatureTexture(this, c.speciesId, c.stage, colours(c))).setScale(1.15 * SPRITE_FIT);
      list.add(img);
      if (c.shiny) list.add(shinySparkle(this, sx + 12, y + 14, 8));
      else if (c.ancient) list.add(icon(this, sx + 12, y + 14, 'amber', 9));
      list.add(text(this, sx, y + 56, `${c.level}`, 10, COLORS.textDim).setOrigin(0.5));
    });
    return y + h + 6;
  }
}
