import type Phaser from 'phaser';
import { CHANGELOG, versionNewer } from '../data/changelog';
import { openWhatsNew } from './credits';
import { icon, type IconId } from './icons';
import { holdScroll } from './scroll';
import { button, COLORS, fullRect, H, LANDSCAPE, text, W } from './widgets';

interface TourPage {
  glyph: IconId;
  title: string;
  /** The frame and title colour. */
  accent: number;
  body: string;
}

/** The 2.0 tour: what's new, one page each, for players who played before 2.0. */
export const TOUR: TourPage[] = [
  {
    glyph: 'crown',
    title: 'Welcome to Hexbound 2.0',
    accent: 0xffc94d,
    body: 'The biggest update yet. Here’s a quick look at what’s new.\n\nYour Hexlings, maps, titles and records are all still here.',
  },
  {
    glyph: 'sparkle',
    title: 'Boons',
    accent: 0xb48cff,
    body: 'After each guardian (and on Boon hexes ✦), choose a boon: a perk that bends the rules for the rest of the run. They stack into a build.\n\nGolden mythics are rare and strong. Red curses cost something but pay you back.',
  },
  {
    glyph: 'gem',
    title: 'Traits',
    accent: 0x7fc8ff,
    body: 'Every Hexling now has a trait: a passive that just works. Each line has three, two common and a rare one (◆), and final forms make it stronger.\n\nTap a trait to read it. The Hexlidex shows which ones you’ve found.',
  },
  {
    glyph: 'question',
    title: 'Rare surprises',
    accent: 0x8fe08a,
    body: 'About half of runs bring something rare: an omen, a strange floor, a hidden hex (???), a rare encounter, or an Elder guardian that rewards a mythic boon.\n\nEach one you find is kept in the Hexlidex.',
  },
  {
    glyph: 'flame',
    title: 'Embers and the Workshop',
    accent: 0xff9a4d,
    body: 'Every run pays embers, win or lose. Spend them at camp: decorations at the Ember stall, and lasting upgrades in the Workshop.',
  },
  {
    glyph: 'heart',
    title: 'Camp bond',
    accent: 0xff7a9a,
    body: 'Each line you play builds a bond with you, up to 5 hearts. Hearts evolve it at camp, start your runs with a bond heart, let you choose its trait, and more.',
  },
  {
    glyph: 'chart',
    title: 'And more',
    accent: 0xffc94d,
    body: 'Quick runs (2 floors) for a short session. New music and sound. New records, titles and leaderboards.\n\nHow to play on the title screen covers everything, any time.',
  },
];

/**
 * Show the tour, page by page (Skip ends it early). `gift`: welcome-back embers still waiting at
 * camp (mentioned on the Workshop page). `onDone` runs when it closes.
 */
export function openTour(scene: Phaser.Scene, gift = 0, onDone: () => void = () => {}) {
  const root = scene.add.container(0, 0).setDepth(2000);
  holdScroll(root);
  root.add(fullRect(scene, 0x000000, 0.6).setInteractive());
  const page = scene.add.container(0, 0);
  root.add(page);
  const w = LANDSCAPE ? 520 : W - 36;
  const h = LANDSCAPE ? 400 : 470;
  const x0 = W / 2 - w / 2;
  const y0 = (H - h) / 2;
  let i = 0;
  const close = () => {
    root.destroy();
    onDone();
  };
  const draw = () => {
    page.removeAll(true);
    const pg = TOUR[i];
    const body = pg.glyph === 'flame' && gift > 0 ? `${pg.body}\n\nYour next camp visit gives you ${gift} welcome-back embers for the runs you’ve already played.` : pg.body;
    const last = i === TOUR.length - 1;
    page.add(scene.add.rectangle(W / 2, y0, w, h, 0x2a2244).setOrigin(0.5, 0).setStrokeStyle(3, pg.accent));
    page.add(text(scene, x0 + 16, y0 + 14, 'NEW IN 2.0', 11, '#1a1426', { fontStyle: 'bold', backgroundColor: '#ffc94d', padding: { x: 5, y: 2 } }));
    if (!last) page.add(button(scene, x0 + w - 48, y0 + 24, 76, 32, 'Skip', close, { fontSize: 12 }));
    const iy = y0 + (LANDSCAPE ? 84 : 96);
    page.add(scene.add.circle(W / 2, iy, LANDSCAPE ? 38 : 44, pg.accent, 0.18));
    page.add(icon(scene, W / 2, iy, pg.glyph, LANDSCAPE ? 48 : 56));
    const ty = iy + (LANDSCAPE ? 50 : 60);
    page.add(text(scene, W / 2, ty, pg.title, LANDSCAPE ? 21 : 22, `#${pg.accent.toString(16).padStart(6, '0')}`, { fontStyle: 'bold', align: 'center', wordWrap: { width: w - 40 } }).setOrigin(0.5, 0));
    page.add(text(scene, W / 2, ty + 36, body, 15, COLORS.text, { wordWrap: { width: w - 48 }, lineSpacing: 4, align: 'center' }).setOrigin(0.5, 0));
    // Page dots, then the buttons.
    const by = y0 + h - 32;
    const dy = by - 40;
    TOUR.forEach((_, k) => page.add(scene.add.circle(W / 2 + (k - (TOUR.length - 1) / 2) * 16, dy, 4, k === i ? pg.accent : 0x5a5078)));
    if (i > 0) page.add(button(scene, x0 + 60, by, 90, 40, '', () => turn(-1), { glyph: 'back', fontSize: 15 }));
    if (last) {
      const news = CHANGELOG.filter((e) => !versionNewer('2.0', e.version));
      if (news.length) page.add(button(scene, W / 2 + 10, by, 130, 40, 'All changes', () => openWhatsNew(scene, news), { fontSize: 13, color: 0x2f4a6b }));
      page.add(button(scene, x0 + w - 66, by, 110, 40, 'Let’s go', close, { fontSize: 15, color: 0x3b6d4a }));
    } else page.add(button(scene, x0 + w - 66, by, 110, 40, 'Next', () => turn(1), { fontSize: 15, color: 0x3b6d4a, glyph: 'play' }));
  };
  const turn = (d: number) => {
    i = Math.max(0, Math.min(TOUR.length - 1, i + d));
    draw();
  };
  draw();
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 200 });
}
