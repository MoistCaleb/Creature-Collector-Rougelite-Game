import type Phaser from 'phaser';
import { ELEMENT_COLORS, type Element } from '../data/types';
import { NEUTRAL_COLOR } from '../data/moves';

/**
 * A pixel symbol for each element (flame, snowflake, leaf...), so elements can be told apart
 * by shape as well as colour. X is the element's colour, W a light highlight, x a shade, d dark.
 */
export const ELEMENT_GLYPHS: Record<Element | 'Neutral', string[]> = {
  Fire: [
    '....X.....',
    '....XX....',
    '...XXX....',
    '...XWXX.X.',
    '..XXWXXXX.',
    '..XWWWXXX.',
    '.XXWWWWXX.',
    '.XXWWWWXX.',
    '..XXWWXX..',
    '...XXXX...',
  ],
  Frost: [
    '....X....',
    '.X..X..X.',
    '..X.X.X..',
    '...XWX...',
    'XXXWWWXXX',
    '...XWX...',
    '..X.X.X..',
    '.X..X..X.',
    '....X....',
  ],
  Nature: [
    '.......XX',
    '.....XXXX',
    '...XXXXWX',
    '..XXXXWXX',
    '.XXXXWXXX',
    '.XXXWXXX.',
    '.XXWXXX..',
    '..WXXX...',
    '.W.......',
    'W........',
  ],
  Earth: [
    '....X.....',
    '...XXX....',
    '...XWXX...',
    '..XWXXX.X.',
    '..XXXXXXXX',
    '.XXXxXXXXX',
    '.XXxxxXXXX',
    'XXxxxxxXXX',
    'XXXXXXXXXX',
  ],
  Storm: [
    '....XXXX',
    '...XXXX.',
    '..XXXX..',
    '.XXXX...',
    'XXXXXXX.',
    '...XXXX.',
    '..XXXX..',
    '..XXX...',
    '.XXX....',
    '.XX.....',
    '.X......',
  ],
  Water: [
    '....X....',
    '....X....',
    '...XXX...',
    '...XXX...',
    '..XXXXX..',
    '.XWXXXXX.',
    '.XWXXXXX.',
    '.XWWXXXX.',
    '..XXXXX..',
    '...XXX...',
  ],
  Metal: [
    '...XXXX...',
    '..XWWWXX..',
    '.XWX..XXX.',
    'XWX....XXX',
    'XXX....XXx',
    '.XXX..XXx.',
    '..XXXXXx..',
    '...xxxx...',
  ],
  Toxic: [
    '......XX.',
    '.....XWWX',
    '.....XXXX',
    '..XX..XX.',
    '.XWWX....',
    'XWXXXX...',
    'XXXXXX...',
    '.XXXX.XX.',
    '..XX.XWX.',
    '......XX.',
  ],
  Shadow: [
    '...XXXX...',
    '.XXXX.....',
    '.XXX......',
    'XXXX......',
    'XXXW......',
    'XXXX......',
    '.XXX......',
    '.XXXX.....',
    '...XXXX...',
  ],
  Light: [
    '....X....',
    '.X..X..X.',
    '..XXXXX..',
    '..XWWWX..',
    'XXXWWWXXX',
    '..XWWWX..',
    '..XXXXX..',
    '.X..X..X.',
    '....X....',
  ],
  Spirit: [
    '...XX....',
    '..XXXX...',
    '.XXXXXX..',
    'XXdXXdXX.',
    'XXdXXdXX.',
    'XXXXXXXX.',
    '.XXXXXXXX',
    '..XXXXX.X',
    '....XXX..',
  ],
  Dragon: [
    'X.......X',
    'XX.....XX',
    '.XX...XX.',
    '..XXXXX..',
    '.XXXXXXX.',
    '.XdXXXdX.',
    '.XXXXXXX.',
    '..XXXXX..',
    '..W.W.W..',
  ],
  Neutral: [
    '...XXX...',
    '.XXXXXXX.',
    '.XXWWWXX.',
    'XXWXXXXXX',
    'XXWXXXXXX',
    'XXXXXXXXX',
    '.XXXXXXx.',
    '.XXXXXXx.',
    '...xxx...',
  ],
};

const CANVAS = 14;
const OUTLINE = '#1a1426';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
function mix(c: number, to: number, t: number): number {
  const ch = (s: number) => Math.round(((c >> s) & 255) * (1 - t) + ((to >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
const lum = (c: number) => 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);

/** The colour a symbol is painted in: the element's, lifted when it's too dark to read on the game's dark panels. */
function glyphColour(el: Element | 'Neutral'): number {
  const c = el === 'Neutral' ? NEUTRAL_COLOR : ELEMENT_COLORS[el];
  return lum(c) < 90 ? mix(c, 0xffffff, 0.35) : c;
}

/** The texture key of an element's symbol (`onColour`: drawn in white, for sitting on a chip of that element's colour). */
export function ensureElementIcon(scene: Phaser.Scene, el: Element | 'Neutral', onColour = false): string {
  const key = `elicon:${el}${onColour ? ':on' : ''}`;
  if (scene.textures.exists(key)) return key;
  const rows = ELEMENT_GLYPHS[el];
  const base = onColour ? (lum(ELEMENT_COLORS[el as Element] ?? NEUTRAL_COLOR) > 140 ? 0x1a1428 : 0xffffff) : glyphColour(el);
  const pal: Record<string, string> = {
    X: hex(base),
    W: hex(onColour ? base : mix(base, 0xffffff, 0.55)),
    x: hex(onColour ? base : mix(base, 0x000000, 0.35)),
    d: onColour ? hex(lum(base) > 140 ? 0xffffff : 0x1a1428) : OUTLINE,
  };
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const ox = Math.floor((CANVAS - w) / 2);
  const oy = Math.floor((CANVAS - h) / 2);
  const at = (x: number, y: number) => {
    const ch = rows[y - oy]?.[x - ox];
    return ch && ch !== '.' ? ch : null;
  };
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS;
  canvas.height = CANVAS;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) {
      const ch = at(x, y);
      if (ch) {
        ctx.fillStyle = pal[ch];
        ctx.fillRect(x, y, 1, 1);
      } else if (!onColour && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** An element's symbol, `size` layout pixels across. */
export function elementIcon(scene: Phaser.Scene, x: number, y: number, el: Element | 'Neutral', size = 12, onColour = false): Phaser.GameObjects.Image {
  return scene.add.image(x, y, ensureElementIcon(scene, el, onColour)).setScale(size / CANVAS);
}
