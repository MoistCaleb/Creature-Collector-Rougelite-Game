import Phaser from 'phaser';

/**
 * Pixel-art icons in the same style as the creature sprites: hand-drawn grids, painted to a
 * canvas with a dark one-pixel outline. Used instead of emoji so every platform looks the same.
 */

const PALETTE: Record<string, string> = {
  W: '#ffffff',
  w: '#c8c4d8',
  g: '#8a86a0',
  d: '#4a4560',
  R: '#e0524a',
  r: '#9a2c2c',
  O: '#ff8a3a',
  Y: '#ffc94d',
  y: '#c08a20',
  G: '#5ad06a',
  j: '#2f8a3e',
  B: '#4aa0f0',
  b: '#2a5aa0',
  C: '#8fdcf0',
  P: '#b05ae0',
  p: '#6a3a9a',
  N: '#a0683a',
  n: '#6a4020',
  S: '#f0a0b0',
  E: '#f4ead0',
};
const OUTLINE = '#1a1426';

const ICONS = {
  flame: [
    '.....O......',
    '.....OO.....',
    '....OOO.....',
    '....OYOO....',
    '...OOYOO.O..',
    '...OYYYOOO..',
    '..OOYYYYOO..',
    '..OYYWWYYO..',
    '..OYWWWWYO..',
    '..OYWWWWYO..',
    '...OYWWYO...',
    '....OOOO....',
  ],
  // Settings: a cog.
  gear: [
    '.....WW.....',
    '..W..WW..W..',
    '.WWWWWWWWWW.',
    '..WWwwwwWW..',
    '..WWw..wWW..',
    'WWWw....wWWW',
    'WWWw....wWWW',
    '..WWw..wWW..',
    '..WWwwwwWW..',
    '.WWWWWWWWWW.',
    '..W..WW..W..',
    '.....WW.....',
  ],
  // How to play: an open book.
  book: [
    '............',
    '.EEEE..EEEE.',
    'EwwwEE.EwwwE',
    'EEEEwEEwEEEE',
    'EwwwEEEEwwwE',
    'EEEEwEEwEEEE',
    'EwwwEEEEwwwE',
    'EEEEwEEwEEEE',
    'EEEEEEEEEEEE',
    'bbbbbbbbbbbb',
    '.....bb.....',
    '............',
  ],
  // Records: a bar chart.
  chart: [
    '............',
    '.........GG.',
    '.........GG.',
    '.....YY..GG.',
    '.....YY..GG.',
    '.....YY..GG.',
    '.BB..YY..GG.',
    '.BB..YY..GG.',
    '.BB..YY..GG.',
    '.BB..YY..GG.',
    'WWWWWWWWWWWW',
    '............',
  ],
  // Menu: three bars.
  menu: [
    '............',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '............',
    '............',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '............',
    '............',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '............',
  ],
  calendar: [
    '..d.....d...',
    '.RRdRRRRdRR.',
    '.RRRRRRRRRR.',
    '.WWWWWWWWWW.',
    '.WdWWdWWdWW.',
    '.WWWWWWWWWW.',
    '.WdWWdWWdWW.',
    '.WWWWWWWWWW.',
    '.WdWWdWWRRW.',
    '.WWWWWWWRRW.',
    '.WWWWWWWWWW.',
  ],
  bag: [
    '....nnnn....',
    '...n....n...',
    '..NNNNNNNN..',
    '.NNNNNNNNNN.',
    '.NNnnnnnnNN.',
    '.NNnYYnnnNN.',
    '.NNnnnnnnNN.',
    '.NNNNNNNNNN.',
    '.NNNNNNNNNN.',
    '.NnNNNNNNnN.',
    '.NNNNNNNNNN.',
  ],
  sound: [
    '.....w......',
    '....ww...w..',
    '..wwww....w.',
    '.wwwww..w.w.',
    '.wwwww..w..w',
    '.wwwww..w..w',
    '.wwwww..w.w.',
    '..wwww....w.',
    '....ww...w..',
    '.....w......',
  ],
  mute: [
    '.....w......',
    '....ww......',
    '..wwww.R...R',
    '.wwwww..R.R.',
    '.wwwww...R..',
    '.wwwww..R.R.',
    '..wwww.R...R',
    '....ww......',
    '.....w......',
  ],
  phone: [
    '..dddddddd..',
    '..dBBBBBBd..',
    '..dBBWWBBd..',
    '..dBBWWBBd..',
    '..dBBWWBBd..',
    '..dWWWWWWd..',
    '..dBWWWWBd..',
    '..dBBWWBBd..',
    '..dBBBBBBd..',
    '..dddddddd..',
    '..dddwwddd..',
    '..dddddddd..',
  ],
  lock: [
    '....gggg....',
    '...g....g...',
    '...g....g...',
    '...g....g...',
    '..YYYYYYYY..',
    '..YYYYYYYY..',
    '..YYYnnYYY..',
    '..YYYnnYYY..',
    '..YYYYnYYY..',
    '..YYYYYYYY..',
    '..yyyyyyyy..',
  ],
  fast: [
    '.W....W.....',
    '.WW...WW....',
    '.WWW..WWW...',
    '.WWWW.WWWW..',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWWW.WWWW..',
    '.WWW..WWW...',
    '.WW...WW....',
    '.W....W.....',
  ],
  play: [
    '..W.......',
    '..WW......',
    '..WWW.....',
    '..WWWW....',
    '..WWWWW...',
    '..WWWWW...',
    '..WWWW....',
    '..WWW.....',
    '..WW......',
    '..W.......',
  ],
  back: [
    '.......W..',
    '......WW..',
    '.....WWW..',
    '....WWWW..',
    '...WWWWW..',
    '...WWWWW..',
    '....WWWW..',
    '.....WWW..',
    '......WW..',
    '.......W..',
  ],
  skull: [
    '...wwwwww...',
    '..wwwwwwww..',
    '.wwwwwwwwww.',
    '.wwwwwwwwww.',
    '.wwddwwddww.',
    '.wwddwwddww.',
    '.wwwwwwwwww.',
    '..wwwwdwww..',
    '...wwwwww...',
    '...wdwdwd...',
    '...wwwwww...',
  ],
  swords: [
    'w..........w',
    '.w........w.',
    '..w......w..',
    '...w....w...',
    '....w..w....',
    '.....ww.....',
    '.....ww.....',
    '....w..w....',
    '..Nw....wN..',
    '..NN....NN..',
    '.N........N.',
  ],
  crown: [
    '.Y...Y...Y.',
    '.YY..Y..YY.',
    '.YYY.Y.YYY.',
    '.YYYYYYYYY.',
    '.YYRYYYRYY.',
    '.YYYYYYYYY.',
    '.yyyyyyyyy.',
  ],
  arrowUp: [
    '.....GG.....',
    '....GGGG....',
    '...GGGGGG...',
    '..GGGGGGGG..',
    '.GGGGGGGGGG.',
    '....GGGG....',
    '....GGGG....',
    '....GGGG....',
    '....GGGG....',
    '....jjjj....',
  ],
  star: [
    '.....YY.....',
    '.....YY.....',
    '....YYYY....',
    'YYYYYYYYYYYY',
    '.YYYYYYYYYY.',
    '..YYYYYYYY..',
    '...YYYYYY...',
    '..YYYYYYYY..',
    '..YYY..YYY..',
    '.YYY....YYY.',
    '.YY......YY.',
  ],
  sparkle: [
    '.....P......',
    '.....P......',
    '....PWP.....',
    '.PPPWWWPPP..',
    '....PWP.....',
    '.....P......',
    '.....P...P..',
    '........PWP.',
    '.........P..',
  ],
  cross: [
    '....GGGG....',
    '....GWWG....',
    '....GWWG....',
    'GGGGGWWGGGGG',
    'GWWWWWWWWWWG',
    'GWWWWWWWWWWG',
    'GGGGGWWGGGGG',
    '....GWWG....',
    '....GWWG....',
    '....GGGG....',
  ],
  coin: [
    '...YYYYYY...',
    '..YyyyyyyY..',
    '.YyYYYYYYyY.',
    '.YyYYyyYYyY.',
    '.YyYyYYYYyY.',
    '.YyYYyyYYyY.',
    '.YyYYYYyYyY.',
    '.YyYYyyYYyY.',
    '..YyyyyyyY..',
    '...YYYYYY...',
  ],
  chest: [
    '..NNNNNNNN..',
    '.NnnnnnnnnN.',
    '.NNNNNNNNNN.',
    '.nnnnYYnnnn.',
    '.NNNNyyNNNN.',
    '.NNNNNNNNNN.',
    '.NNNNNNNNNN.',
    '.nnnnnnnnnn.',
  ],
  bug: [
    '..d......d..',
    '...d....d...',
    '....dGGd....',
    '...GGGGGG...',
    '.d.jGGGGj.d.',
    '..djjGGjjd..',
    '...jGjjGj...',
    '.d.jjGGjj.d.',
    '..djGjjGjd..',
    '...jjjjjj...',
    '....jjjj....',
  ],
  question: [
    '...WWWWW....',
    '..WW...WW...',
    '.......WW...',
    '......WW....',
    '.....WW.....',
    '.....WW.....',
    '............',
    '.....WW.....',
    '.....WW.....',
  ],
  gem: [
    '.....CC.....',
    '....CWCC....',
    '...CWCCCC...',
    '..CCCCCCCB..',
    '...CCCCCB...',
    '....CCBB....',
    '.....BB.....',
  ],
  // Evolution Stone: a faceted violet gem with a bright core.
  stone: [
    '.....pp.....',
    '....pPPp....',
    '...pPWPPp...',
    '..pPWSPPPp..',
    '.pPPSPPPPPp.',
    '.pPPPPPPPpp.',
    '..pPPPPPpp..',
    '...pPPPpp...',
    '....pPpp....',
    '.....pp.....',
  ],
  crystal: [
    '.....BB.....',
    '....BCCB....',
    '...BCWCCB...',
    '..BCWCCCCB..',
    '..BCCCCCCB..',
    '...BCCCCB...',
    '....BCCB....',
    '.....BB.....',
  ],
  potion: [
    '....dddd....',
    '.....ww.....',
    '.....ww.....',
    '....wGGw....',
    '...wGGGGw...',
    '..wGGWGGGw..',
    '..wGGGGGGw..',
    '..wGGGGGGw..',
    '...wGGGGw...',
    '....wwww....',
  ],
  // Held items
  band: [
    '..RRRRRRRR..',
    '.RRWWRRRRRR.',
    '.RRRRRRRRRR.',
    '.rrrrrrrrrr.',
    '..rrrrrrrr..',
  ],
  charm: [
    '....g..g....',
    '.....gg.....',
    '.....g......',
    '....PPPP....',
    '...PWPPPP...',
    '..PWPPPPPp..',
    '..PPPPPPPp..',
    '..PPPPPPpp..',
    '...PPPPpp...',
    '....pppp....',
  ],
  shell: [
    '....SSSS....',
    '...SWWWSS...',
    '..SWSSSWSS..',
    '..SWSWWSWS..',
    '..SWSSWSWS..',
    '..SSWWWSWS..',
    '...SSSSWS...',
    '....SSSS....',
  ],
  scarf: [
    '..BBBBBBBB..',
    '.BWBWBWBWBB.',
    '.BBBBBBBBBB.',
    '.......BB...',
    '.......BWB..',
    '.......BBB..',
    '........BW..',
    '........BB..',
  ],
  claw: [
    '..W...W...W.',
    '..WW..WW..WW',
    '..WW..WW..WW',
    '.wWW.wWW.wWW',
    '.wW..wW..wW.',
    'NNNNNNNNNN..',
    'NnnnnnnnnN..',
    'NNNNNNNNNN..',
  ],
  lens: [
    '...gggg.....',
    '..gCCCCg....',
    '.gCWCCCCg...',
    '.gCCCCCCg...',
    '.gCCCCCCg...',
    '..gCCCCg....',
    '...gggg.N...',
    '........NN..',
    '.........NN.',
    '..........N.',
  ],
  fang: [
    '..WWWWWWWW..',
    '..WWWWWWWW..',
    '...WWwWWW...',
    '...WWwWW....',
    '....WWWW....',
    '....WWW.....',
    '.....RR.....',
    '.....R......',
  ],
  barb: [
    '..w...w...w.',
    '.www.www.www',
    '.NNNNNNNNNN.',
    'NNnnnnnnnnNN',
    'NN........NN',
    'NNnnnYnnnnNN',
    '.NNNNNNNNNN.',
  ],
  berry: [
    '.....jj.....',
    '....jGj.....',
    '...RRjRR....',
    '..RWRRRRR...',
    '..RRRRRRR...',
    '..RRRRRRr...',
    '...RRRRr....',
    '....rrr.....',
  ],
  sash: [
    '..YYY..YYY..',
    '.YYyYYYYyYY.',
    '.YyYYYYYYyY.',
    '..YYYYYYYY..',
    '....YYYY....',
    '...YY..YY...',
    '..YY....YY..',
    '..Yy....yY..',
  ],
  heart: [
    '..RRR..RRR..',
    '.RSSRRRRRRR.',
    'RRSRRRRRRRRR',
    'RRRRRRRRRRRR',
    'RRRRRRRRRRRR',
    '.RRRRRRRRRR.',
    '..RRRRRRRR..',
    '...RRRRRR...',
    '....RRRR....',
    '.....RR.....',
  ],
  egg: [
    '....EEEE....',
    '...EEEEEE...',
    '..EEEGEEEE..',
    '..EEGGGEEE..',
    '.EEEEEEEEEE.',
    '.EEEEEEGEEE.',
    '.EEEEEGGGEE.',
    '..EEEEEEEE..',
    '...EEEEEE...',
  ],
} satisfies Record<string, string[]>;

export type IconId = keyof typeof ICONS;

/** Every icon is painted on a square canvas of this many pixels (grid + outline, centered). */
const CANVAS = 14;

export function ensureIcon(scene: Phaser.Scene, id: IconId): string {
  const key = `icon:${id}`;
  if (scene.textures.exists(key)) return key;
  const rows = ICONS[id];
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const ox = Math.floor((CANVAS - w) / 2);
  const oy = Math.floor((CANVAS - h) / 2);
  const filled = (x: number, y: number) => {
    const r = rows[y - oy];
    const ch = r?.[x - ox];
    return !!ch && ch !== '.';
  };
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS;
  canvas.height = CANVAS;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) {
      if (filled(x, y)) {
        ctx.fillStyle = PALETTE[rows[y - oy][x - ox]] ?? '#ff00ff';
        ctx.fillRect(x, y, 1, 1);
      } else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** An icon image `size` layout pixels across. */
export function icon(scene: Phaser.Scene, x: number, y: number, id: IconId, size = 20): Phaser.GameObjects.Image {
  return scene.add.image(x, y, ensureIcon(scene, id)).setScale(size / CANVAS);
}

/** Icons for the map's node kinds. */
export const NODE_ICONS: Record<string, IconId> = {
  start: 'gem',
  battle: 'swords',
  elite: 'crown',
  levelup: 'arrowUp',
  prestige: 'star',
  skill: 'sparkle',
  heal: 'cross',
  shop: 'coin',
  treasure: 'chest',
  event: 'question',
  revive: 'heart',
  boon: 'sparkle',
  hidden: 'question',
  boss: 'skull',
};

/** For tests: every grid fits the canvas with room for its outline, and uses known colors. */
export function iconProblems(): string[] {
  const out: string[] = [];
  for (const [id, rows] of Object.entries(ICONS)) {
    if (rows.length > CANVAS - 2) out.push(`${id}: too tall`);
    for (const r of rows) {
      if (r.length > CANVAS - 2) out.push(`${id}: row too wide "${r}"`);
      for (const ch of r) if (ch !== '.' && !PALETTE[ch]) out.push(`${id}: unknown color ${ch}`);
    }
  }
  return out;
}
