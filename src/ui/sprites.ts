import Phaser from 'phaser';
import { SPECIES, SPECIES_BY_ID } from '../data/species';
import { ELEMENT_COLORS, type Element } from '../data/types';
import { hashString, Rng } from '../logic/rng';

export const SPRITE_SIZE = 40;
/** Multiply display scales by this so sprites keep their on-screen size if SPRITE_SIZE changes. */
export const SPRITE_FIT = 32 / SPRITE_SIZE;

/**
 * Pixel roles (shading and outline are computed when painting):
 * 0 empty, 1 body, 2 secondary (markings, wings, fins), 3 belly / plates, 4 eye white, 5 pupil,
 * 6 horn / bone, 7 glow, 8 claw / fang, 9 dark (brow, mouth), 10 signature (element feature), 11 signature highlight
 */
type Px = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

type Loco = 'biped' | 'quad' | 'insect' | 'floater' | 'slime' | 'serpent' | 'avian';
type BodyShape = 'round' | 'pear' | 'drop' | 'oval' | 'vtorso' | 'boxy' | 'wide' | 'segmented' | 'tall' | 'hulk';
type HeadShape = 'merged' | 'round' | 'wide' | 'long' | 'skull' | 'flat' | 'beak';
type Arms = 'none' | 'stub' | 'claws' | 'long' | 'fists' | 'blades' | 'tentacles' | 'pincers';
type Back = 'none' | 'batwings' | 'featherwings' | 'bugwings' | 'spines' | 'shell' | 'mane' | 'fins';
type Top = 'none' | 'ears' | 'longears' | 'antennae' | 'horns-swept' | 'horns-ram' | 'antlers' | 'unihorn' | 'crest' | 'crown';
type Mouth = 'none' | 'smile' | 'fangs' | 'tusks' | 'mandibles' | 'jaw' | 'beak';
type Pattern = 'spots' | 'hstripes' | 'vstripes' | 'belly' | 'chevrons' | 'core' | 'rings';
type Tail = 'none' | 'thin' | 'spiked' | 'club' | 'flame';

interface Family {
  loco: Loco;
  eyes: 1 | 2 | 3 | 4;
  pattern: Pattern;
  tail: Tail;
  tailSide: 1 | -1;
  hueJitter: number;
}

interface StagePlan {
  body: BodyShape;
  head: HeadShape;
  arms: Arms;
  back: Back;
  top: Top;
  mouth: Mouth;
}

export { familyPlan, stagePlan, paletteFor };
export type { Loco, BodyShape, HeadShape, Arms, Back, Top, Mouth, Pattern, Tail, Family, StagePlan };

const pickW = <T extends string>(rng: Rng, w: Partial<Record<T, number>>): T => rng.weighted<T>(w);

const LOCO_BIAS: Partial<Record<Element, Partial<Record<Loco, number>>>> = {
  Toxic: { slime: 5, insect: 3, biped: 1 },
  Spirit: { floater: 6, serpent: 1, avian: 1 },
  Water: { serpent: 4, biped: 2, slime: 1, quad: 1 },
  Dragon: { biped: 3, quad: 3, serpent: 2 },
  Metal: { biped: 3, quad: 2, insect: 2 },
  Earth: { quad: 4, biped: 3, insect: 1 },
  Storm: { avian: 5, biped: 2, insect: 1 },
  Light: { avian: 3, floater: 3, biped: 2 },
  Shadow: { biped: 3, quad: 2, floater: 2, insect: 1 },
  Frost: { quad: 3, biped: 3, avian: 1, serpent: 1 },
  Nature: { biped: 3, insect: 3, quad: 2, slime: 1 },
  Fire: { biped: 4, quad: 3, avian: 1 },
};

/** Hand-picked body types where the family's name suggests one (everything else is rolled by element). */
const LOCO_OVERRIDE: Record<string, Loco> = {
  emberkit: 'biped', cinderpup: 'quad', flicklet: 'floater', magmite: 'slime',
  frostling: 'avian', snowmote: 'floater', icebuck: 'quad', shiverfin: 'serpent',
  sproutle: 'biped', mosskit: 'quad', beetlet: 'insect', budlet: 'biped',
  pebblin: 'quad', molet: 'quad', dustbun: 'biped', golemite: 'biped',
  zapling: 'avian', staticat: 'quad', gustling: 'floater', sparkbug: 'insect',
  puddlet: 'serpent', tidepup: 'quad', jellet: 'floater', shellop: 'slime',
  cogling: 'biped', boltkit: 'quad', mitebot: 'insect', edgelet: 'insect',
  sludgit: 'slime', toadlet: 'quad', stingit: 'insect', oozel: 'serpent',
  gloomkit: 'biped', mothlet: 'insect', murkpup: 'quad', creepet: 'insect',
  glimmer: 'floater', lumbug: 'insect', prismkit: 'quad', dawnling: 'avian',
  wispling: 'floater', boolet: 'floater', lampling: 'serpent', maskit: 'biped',
  drakelet: 'biped', wyrmlet: 'serpent', draclet: 'avian', hatchwyrm: 'quad',
  lavapup: 'quad', ashtoad: 'quad', kindrake: 'biped', scaldlet: 'avian', hexkit: 'biped', dimember: 'floater',
  blazejay: 'avian', plasmite: 'floater', penglet: 'biped', narwee: 'serpent', lilyfrog: 'quad', kelpling: 'serpent',
  eddylet: 'serpent', mistlet: 'serpent', stingrae: 'floater', blobble: 'slime', stumpling: 'biped', truffkin: 'slime',
  shroomlet: 'biped', pitchling: 'slime', buzzlet: 'insect', sproutbolt: 'biped', drillmole: 'quad', ferrock: 'biped',
  sandling: 'serpent', craglet: 'quad', magnetite: 'floater', whirlbot: 'floater', snowpip: 'avian', cryospark: 'floater',
  wailet: 'floater', grimlet: 'floater', belladot: 'slime', plaguerat: 'quad', cherublet: 'floater', lumenwisp: 'floater',
  aurorabit: 'quad', flashkit: 'avian', glintmite: 'insect', squirelet: 'biped', yukilet: 'floater', rimeghost: 'floater',
  woollet: 'quad', slablet: 'biped', gildwing: 'avian',
};

/** Position of a pure-type family among the families of its element (0..3), for accent variety. */
function pureIndex(id: string): number {
  const sp = SPECIES_BY_ID[id];
  if (sp.types[0] !== sp.types[1]) return -1;
  return SPECIES.filter((x) => x.types[0] === sp.types[0] && x.types[1] === sp.types[0]).findIndex((x) => x.id === id);
}

function familyPlan(id: string, types: readonly Element[]): Family {
  const r = new Rng(hashString(id + ':family'));
  const eyeRoll = pickW<'one' | 'two' | 'three' | 'four'>(r, { two: 7, one: 1.5, three: 1, four: 1.5 });
  const rolled = pickW<Loco>(r, LOCO_BIAS[types[0]] ?? { biped: 1 });
  return {
    loco: LOCO_OVERRIDE[id] ?? rolled,
    eyes: ({ one: 1, two: 2, three: 3, four: 4 } as const)[eyeRoll],
    pattern: r.pick(['spots', 'hstripes', 'vstripes', 'belly', 'chevrons', 'core', 'rings'] as const),
    tail: pickW<Tail>(r, { none: 3, thin: 2, spiked: 2, club: 1, flame: types.includes('Fire') ? 3 : 0 }),
    tailSide: r.chance(0.5) ? 1 : -1,
    hueJitter: r.next() * 0.2 - 0.1,
  };
}

/** Each evolution re-rolls the silhouette from its own seed; the family keeps palette, eyes and signature. */
function stagePlan(id: string, stage: number, fam: Family, types: readonly Element[]): StagePlan {
  const r = new Rng(hashString(`${id}:stage${stage}`));
  const has = (e: Element) => types.includes(e);
  const L = fam.loco;
  if (stage === 0) {
    return {
      body: L === 'serpent' ? 'tall' : r.pick(['round', 'pear', 'drop', 'round'] as const),
      head: L === 'slime' || r.chance(0.3) ? 'merged' : L === 'avian' ? 'beak' : 'round',
      arms: L === 'avian' || L === 'slime' || L === 'serpent' ? 'none' : r.pick(['none', 'stub', 'stub'] as const),
      back: L === 'avian' ? 'featherwings' : r.chance(0.15) ? 'fins' : 'none',
      top: r.pick(['none', 'ears', 'longears', 'antennae', 'ears'] as const),
      mouth: L === 'avian' ? 'beak' : L === 'insect' ? 'mandibles' : r.pick(['smile', 'none', 'smile'] as const),
    };
  }
  const mid = stage === 1;
  return {
    body: pickW<BodyShape>(r, {
      oval: mid ? 3 : 1,
      pear: mid ? 2 : 1,
      vtorso: mid ? 2 : 4,
      boxy: has('Metal') || has('Earth') ? 4 : 1,
      wide: L === 'quad' ? 4 : 1,
      segmented: L === 'insect' ? 6 : 0,
      tall: L === 'serpent' || L === 'floater' ? 4 : 1,
      hulk: mid ? 0 : L === 'biped' || L === 'quad' ? 3 : 1,
    }),
    head:
      L === 'avian'
        ? 'beak'
        : L === 'slime'
          ? r.pick(['merged', 'round', 'skull'] as const)
          : pickW<HeadShape>(r, { round: 2, wide: 2, long: 2, skull: mid ? 1 : 3, flat: 1, merged: L === 'quad' ? 2 : 0.5 }),
    arms:
      L === 'avian'
        ? 'none'
        : pickW<Arms>(r, {
            claws: mid ? 3 : 1,
            long: 2,
            fists: has('Earth') || has('Metal') ? 3 : mid ? 0.5 : 1.5,
            blades: L === 'insect' ? 4 : has('Shadow') || has('Metal') ? 2 : 1,
            tentacles: has('Water') || has('Spirit') || has('Toxic') ? 3 : 0.3,
            pincers: L === 'insect' || has('Water') ? 2 : 0.3,
            stub: mid ? 1 : 0,
            none: L === 'serpent' || L === 'slime' ? 3 : 0.3,
          }),
    back:
      L === 'avian'
        ? 'featherwings'
        : pickW<Back>(r, {
            none: mid ? 4 : 1,
            batwings: has('Dragon') || has('Shadow') ? 4 : 0.6,
            featherwings: has('Light') || has('Storm') ? 3 : 0.3,
            bugwings: L === 'insect' || has('Nature') ? 3 : 0.3,
            spines: has('Frost') || has('Earth') || has('Dragon') ? 2.5 : 1,
            shell: has('Earth') || has('Metal') || has('Water') ? 2.5 : 0.4,
            mane: has('Fire') || has('Light') ? 2.5 : 0.6,
            fins: has('Water') ? 3 : 0.4,
          }),
    top: pickW<Top>(r, {
      ears: mid ? 2 : 0.5,
      longears: mid ? 1 : 0.5,
      antennae: L === 'insect' || has('Storm') ? 3 : 0.5,
      'horns-swept': 2,
      'horns-ram': mid ? 1 : 2,
      antlers: has('Nature') || has('Frost') ? 3 : 0.5,
      unihorn: has('Light') ? 3 : 0.8,
      crest: has('Dragon') || has('Water') ? 2.5 : 1,
      crown: mid ? 0 : 1.5,
      none: 0.5,
    }),
    mouth:
      L === 'avian'
        ? 'beak'
        : L === 'insect'
          ? 'mandibles'
          : pickW<Mouth>(r, { fangs: mid ? 4 : 2, tusks: 1.5, jaw: mid ? 0.5 : 4, mandibles: 0.4, none: 0.3 }),
  };
}

interface Draw {
  put: (x: number, y: number, v: Px, onlyOver?: Px[], mirror?: boolean) => void;
  blob: (ex: number, ey: number, rx: number, ry: number, v: Px, o?: { taper?: number; p?: number; over?: Px[] }) => void;
  line: (x0: number, y0: number, x1: number, y1: number, v: Px, thick?: number, mirror?: boolean) => void;
  tri: (ax: number, ay: number, bx: number, by: number, qx: number, qy: number, v: Px) => void;
}

/**
 * Drawing in design units (a 40-pixel grid). `k` > 1 draws the same shapes on a finer grid
 * (S × k pixels): smoother curves and room for detail, same silhouette.
 */
function makeDraw(g: Px[][], S: number, cx: number, k = 1): Draw {
  const N = g.length;
  const setPx = (ox: number, oy: number, v: Px, onlyOver?: Px[], mirror = true) => {
    if (ox < 0 || oy < 0 || ox >= N || oy >= N) return;
    if (onlyOver && !onlyOver.includes(g[oy][ox])) return;
    g[oy][ox] = v;
    if (mirror) g[oy][N - 1 - ox] = v;
  };
  const put: Draw['put'] = (x, y, v, onlyOver, mirror = true) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= S || yi >= S) return;
    if (k === 1) return setPx(xi, yi, v, onlyOver, mirror);
    for (let oy = Math.floor(yi * k); oy < Math.floor((yi + 1) * k); oy++)
      for (let ox = Math.floor(xi * k); ox < Math.floor((xi + 1) * k); ox++) setPx(ox, oy, v, onlyOver, mirror);
  };
  const toD = (o: number) => (o + 0.5) / k - 0.5;
  const blob: Draw['blob'] = (ex, ey, rx, ry, v, o = {}) => {
    const p = o.p ?? 2;
    const taper = o.taper ?? 0;
    if (k === 1) {
      for (let y = Math.floor(ey - ry); y <= Math.ceil(ey + ry); y++) {
        const dy = (y - ey) / ry;
        if (Math.abs(dy) > 1) continue;
        const hw = rx * Math.pow(1 - Math.pow(Math.abs(dy), p), 1 / p) * (1 - taper * dy);
        for (let x = Math.floor(ex - hw); x <= Math.max(ex, cx); x++) if (x >= ex - hw - 0.01 && x <= ex + hw) put(x, y, v, o.over);
      }
      return;
    }
    const half = Math.max(ex, cx);
    for (let oy = Math.floor((ey - ry) * k); oy <= Math.ceil((ey + ry + 1) * k); oy++) {
      const dy = (toD(oy) - ey) / ry;
      if (Math.abs(dy) > 1) continue;
      const hw = rx * Math.pow(1 - Math.pow(Math.abs(dy), p), 1 / p) * (1 - taper * dy);
      for (let ox = Math.floor((ex - hw) * k); ox <= Math.ceil((half + 1) * k); ox++) {
        const X = toD(ox);
        if (X >= ex - hw - 0.2 && X <= ex + hw + 0.2 && X <= half + 0.5) setPx(ox, oy, v, o.over);
      }
    }
  };
  const line: Draw['line'] = (x0, y0, x1, y1, v, thick = 1, mirror = true) => {
    if (k === 1) {
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2);
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const y = y0 + ((y1 - y0) * i) / n;
        for (let t = 0; t < thick; t++) put(x - t, y, v, undefined, mirror);
      }
      return;
    }
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 3 * k);
    const r = (thick * k) / 2;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n - (thick - 1) / 2;
      const y = y0 + ((y1 - y0) * i) / n;
      const ox = (x + 0.5) * k - 0.5;
      const oy = (y + 0.5) * k - 0.5;
      for (let py = Math.round(oy - r + 0.5); py <= Math.round(oy + r - 0.5); py++)
        for (let px = Math.round(ox - r + 0.5); px <= Math.round(ox + r - 0.5); px++) setPx(px, py, v, undefined, mirror);
    }
  };
  const tri: Draw['tri'] = (ax, ay, bx, by, qx, qy, v) => {
    const sign = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
    const inside = (x: number, y: number) => {
      const d1 = sign(x, y, ax, ay, bx, by);
      const d2 = sign(x, y, bx, by, qx, qy);
      const d3 = sign(x, y, qx, qy, ax, ay);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    };
    if (k === 1) {
      for (let y = Math.floor(Math.min(ay, by, qy)); y <= Math.ceil(Math.max(ay, by, qy)); y++)
        for (let x = Math.floor(Math.min(ax, bx, qx)); x <= Math.ceil(Math.max(ax, bx, qx)); x++) if (inside(x, y)) put(x, y, v);
      return;
    }
    for (let oy = Math.floor(Math.min(ay, by, qy) * k); oy <= Math.ceil((Math.max(ay, by, qy) + 1) * k); oy++)
      for (let ox = Math.floor(Math.min(ax, bx, qx) * k); ox <= Math.ceil((Math.max(ax, bx, qx) + 1) * k); ox++)
        if (inside(toD(ox), toD(oy))) setPx(ox, oy, v);
  };
  return { put, blob, line, tri };
}

const SHAPES: Record<BodyShape, { rx: number; ry: number; taper: number; p: number }> = {
  round: { rx: 7, ry: 7, taper: 0, p: 2 },
  pear: { rx: 7, ry: 7, taper: -0.35, p: 2 },
  drop: { rx: 6.5, ry: 7.5, taper: -0.6, p: 2 },
  oval: { rx: 6, ry: 8, taper: 0.05, p: 2 },
  vtorso: { rx: 7.5, ry: 8, taper: 0.45, p: 2.2 },
  boxy: { rx: 7.5, ry: 7, taper: 0.1, p: 4 },
  wide: { rx: 10, ry: 6, taper: 0.05, p: 2.4 },
  segmented: { rx: 6, ry: 5, taper: 0, p: 2 },
  tall: { rx: 5, ry: 9.5, taper: 0.1, p: 2.2 },
  hulk: { rx: 10, ry: 8.5, taper: 0.55, p: 2.6 },
};

/** Where the face goes, for painters that draw it themselves (the hi-res remaster). */
export interface FaceInfo {
  cx: number;
  eyeY: number;
  spread: number;
  faceR: number;
  my: number;
  eyes: 1 | 2 | 3 | 4;
  visor: boolean;
  hollow: boolean;
  mouth: Mouth;
  stage: number;
  headTop: number;
  hy: number;
  by: number;
  rx: number;
  ry: number;
  shoulderX: number;
  shoulderY: number;
  hrx: number;
  loco: Loco;
  back: Back;
  ground: number;
}

/** The design grid is 40 pixels; `k` > 1 draws it finer (k = 1.4: 56 pixels). `face`: filled in, and with k > 1 the face is left out for the caller to draw. */
export function buildGrid(speciesId: string, stage: number, k = 1, face?: Partial<FaceInfo>): Px[][] {
  const types = SPECIES_BY_ID[speciesId].types;
  const fam = familyPlan(speciesId, types);
  const P = stagePlan(speciesId, stage, fam, types);
  const S = 40;
  const N = Math.round(S * k);
  const g: Px[][] = Array.from({ length: N }, () => Array<Px>(N).fill(0));
  const cx = S / 2 - 0.5;
  const ground = S - 2;
  const r = new Rng(hashString(`${speciesId}:detail${stage}`));
  const D = makeDraw(g, S, cx, k);
  const { put, blob, line, tri } = D;

  // ---------------------------------------------------------------- body metrics
  const size = [0.7, 0.85, 1.0][stage];
  const shape = SHAPES[P.body];
  const rx = shape.rx * size;
  const ry = shape.ry * size;
  const L = fam.loco;
  const LEG: Record<Loco, number[]> = {
    biped: [2, 4, 5],
    quad: [2, 3, 4],
    insect: [2, 3, 4],
    avian: [2, 3, 5],
    floater: [0, 0, 0],
    slime: [0, 0, 0],
    serpent: [0, 0, 0],
  };
  const legLen = LEG[L][stage];
  const lift = L === 'floater' ? [4, 6, 7][stage] : L === 'serpent' ? [3, 5, 6][stage] : 0;
  const by = ground - legLen - lift - ry + (L === 'slime' ? 1 : 0);
  const bodyTop = P.body === 'segmented' ? by - ry * 2.1 : by - ry;
  const hw = (y: number) => {
    const dy = (y - by) / ry;
    if (Math.abs(dy) > 1) return rx * 0.6;
    return rx * Math.pow(1 - Math.pow(Math.abs(dy), shape.p), 1 / shape.p) * (1 - shape.taper * dy);
  };
  const shoulderY = P.body === 'segmented' ? by - ry * 1.4 : by - ry * 0.5;
  const shoulderX = cx - (P.body === 'segmented' ? rx * 0.8 : hw(shoulderY));

  const hBase = [4.6, 4.2, 4.4][stage];
  const HEADS: Record<HeadShape, { rx: number; ry: number; taper: number; p: number }> = {
    merged: { rx: 0, ry: 0, taper: 0, p: 2 },
    round: { rx: hBase * 1.1, ry: hBase, taper: 0, p: 2 },
    wide: { rx: hBase * 1.5, ry: hBase * 0.8, taper: 0, p: 2.5 },
    long: { rx: hBase * 0.85, ry: hBase * 1.3, taper: 0.2, p: 2 },
    skull: { rx: hBase * 1.15, ry: hBase * 1.05, taper: -0.3, p: 2.2 },
    flat: { rx: hBase * 1.3, ry: hBase * 0.7, taper: 0.15, p: 3 },
    beak: { rx: hBase, ry: hBase * 0.95, taper: 0.1, p: 2 },
  };
  const H = HEADS[P.head];
  const merged = P.head === 'merged';
  const hy = merged ? by - ry * 0.4 : bodyTop - H.ry * 0.55;
  const headTop = merged ? bodyTop : hy - H.ry;
  const faceY = merged ? by - ry * 0.35 : hy;
  const faceR = merged ? Math.min(rx, ry) * 0.7 : Math.min(H.rx, H.ry);

  // ---------------------------------------------------------------- back parts (behind the body)
  const wingY = shoulderY - 1;
  const wingX = shoulderX + 1;
  const ws = [5, 8, 11][stage];
  switch (P.back) {
    case 'batwings':
      tri(wingX, wingY, wingX - ws, wingY - ws * 0.8, wingX - ws * 0.6, wingY + ws * 0.6, 2);
      tri(wingX - ws * 0.4, wingY, wingX - ws, wingY - ws * 0.8, wingX - ws * 1.05, wingY + ws * 0.3, 2);
      line(wingX, wingY, wingX - ws, wingY - ws * 0.8, 6);
      for (let k = 1; k <= 2; k++) line(wingX - ws, wingY - ws * 0.8, wingX - ws * (0.4 + 0.25 * k), wingY + ws * (0.6 - 0.2 * k), 6);
      put(wingX - ws - 1, wingY - ws * 0.8 - 1, 8);
      break;
    case 'featherwings': {
      const span = L === 'avian' ? ws + 2 : ws;
      for (let i = 0; i <= span; i++) {
        const top = wingY - (span - i) * 0.15 - i * 0.55;
        const len = 3 + (span - i) * 0.35 + (i % 2);
        for (let y = top; y <= top + len; y++) put(wingX - i, y, i % 3 === 0 ? 11 : 2);
      }
      break;
    }
    case 'bugwings':
      blob(wingX - ws * 0.55, wingY - ws * 0.35, ws * 0.55, ws * 0.38, 2, { over: [0] });
      blob(wingX - ws * 0.45, wingY + ws * 0.35, ws * 0.42, ws * 0.28, 11, { over: [0] });
      break;
    case 'spines':
      for (let k = 0; k < 2 + stage; k++) {
        const sy = shoulderY - 1 + k * 2.5;
        const sx = cx - hw(sy) + 1;
        tri(sx, sy, sx + 2, sy + 1, sx - 3 - stage, sy - 2 - stage * 0.5, 6);
      }
      break;
    case 'shell':
      blob(cx, by - ry * 0.1, rx + 2.5, ry + 1.5, 3, { p: 2.5 });
      for (let k = -1; k <= 1; k++) line(cx - rx - 2, by + k * 3, cx - rx + 1, by + k * 3, 9);
      break;
    case 'mane':
      blob(cx, hy + 1, (merged ? rx : H.rx) + 3, (merged ? ry * 0.6 : H.ry) + 3, 10);
      for (let k = 0; k < 5; k++) put(cx - (merged ? rx : H.rx) - 3 + k * 0.3, hy - 2 + k * 2, 11);
      break;
    case 'fins':
      tri(shoulderX + 1, shoulderY, shoulderX - 3 - stage * 2, shoulderY - 3 - stage, shoulderX - 1, shoulderY + 4, 2);
      break;
    case 'none':
      break;
  }

  // tail: asymmetric, sticks out to one side
  if (fam.tail !== 'none' && L !== 'slime') {
    const side = fam.tailSide;
    const tx0 = cx + side * (rx * 0.6);
    const ty0 = by + ry * 0.6;
    const len = [4, 6, 8][stage];
    const tipX = tx0 + side * len;
    const tipY = ty0 - len * 0.6;
    line(tx0, ty0, tipX, tipY, 1, stage === 2 ? 2 : 1, false);
    if (fam.tail === 'spiked') for (let k = 1; k < len; k += 2) put(tx0 + side * k, ty0 - k * 0.6 - 1, 6, [0], false);
    if (fam.tail === 'club') for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) put(tipX + dx, tipY + dy, 6, undefined, false);
    if (fam.tail === 'flame') {
      put(tipX, tipY - 1, 10, undefined, false);
      put(tipX + side, tipY - 2, 11, undefined, false);
      put(tipX, tipY - 2, 10, undefined, false);
      put(tipX - side, tipY - 1, 10, undefined, false);
    }
  }

  // ---------------------------------------------------------------- locomotion
  if (L === 'biped' || L === 'quad') {
    const legW = stage === 2 ? 3 : 2;
    const xs = L === 'quad' ? [cx - rx * 0.85, cx - rx * 0.35] : [cx - rx * 0.5];
    for (const lx of xs) {
      for (let y = by + ry - 2; y <= ground; y++) for (let k = 0; k < legW; k++) put(lx + k, y, 1);
      if (stage >= 1) {
        put(lx - 1, ground, 8);
        if (stage === 2) put(lx + legW, ground, 8);
      }
    }
  } else if (L === 'insect') {
    for (let k = 0; k < 3; k++) {
      const sy = by - ry * 0.3 + k * ry * 0.45;
      const sx = cx - hw(sy) + 1;
      const kx = sx - 3 - stage;
      line(sx, sy, kx, sy - 1 - (k === 0 ? 1 : 0), 1);
      line(kx, sy - 1, kx - 1 + k, ground, 1);
      if (stage >= 1) put(kx - 1 + k, ground, 8);
    }
  } else if (L === 'avian') {
    const lx = cx - rx * 0.35;
    line(lx, by + ry - 1, lx, ground, 6);
    put(lx - 1, ground, 6);
    put(lx + 1, ground, 6);
    if (stage >= 1) put(lx - 2, ground, 8);
  } else if (L === 'floater') {
    const n = 2 + stage;
    for (let k = 0; k < n; k++) {
      const wx = cx - rx * 0.85 + (k * rx * 0.85) / n;
      const len = lift + 1 - (k % 2) * 2;
      for (let y = 0; y < len; y++) put(wx + Math.sin(y * 0.9 + k) * 0.8, by + ry - 1 + y, 1);
    }
  } else if (L === 'serpent') {
    blob(cx, ground - lift / 2, rx + 3 + stage, lift / 2 + 1.2, 1);
    blob(cx, ground - lift / 2, (rx + 3 + stage) * 0.55, lift / 4 + 0.4, 3, { over: [1] });
  }

  // ---------------------------------------------------------------- body
  if (P.body === 'segmented') {
    blob(cx, by, rx, ry, 1);
    blob(cx, by - ry * 1.35, rx * 0.8, ry * 0.75, 1);
  } else {
    blob(cx, by, rx, ry, 1, { taper: shape.taper, p: shape.p });
  }
  if (L === 'slime') for (let k = 0; k < 2 + stage; k++) for (let y = 0; y < 2 + (k % 2); y++) put(cx - rx * (0.25 + 0.22 * k), by + ry + y, 1);

  const over: Px[] = [1];
  switch (fam.pattern) {
    case 'spots':
      for (let i = 0; i < 3 + stage * 2; i++) put(cx - rx * (0.25 + r.next() * 0.6), by - ry * 0.6 + r.next() * ry * 1.2, 2, over);
      break;
    case 'hstripes':
      for (let k = 0; k < 2 + stage; k++) for (let x = cx - rx; x < cx - rx * 0.45; x++) put(x, by - ry * 0.55 + k * 3, 2, over);
      break;
    case 'vstripes':
      for (let y = by - ry; y < by + ry; y++) if (Math.floor(y) % 3 !== 0) put(cx - rx * 0.62, y, 2, over);
      break;
    case 'belly':
      blob(cx, by + ry * 0.2, rx * 0.55, ry * 0.65, 3, { over });
      break;
    case 'chevrons':
      for (let k = 0; k < 2 + stage; k++) for (let i = 0; i < 4; i++) put(cx - i, by - ry * 0.4 + k * 3 + i * 0.6, 2, over);
      break;
    case 'core':
      blob(cx, by - ry * 0.1, 1.6 + stage * 0.6, 1.6 + stage * 0.6, 7, { over });
      blob(cx, by - ry * 0.1, 0.8 + stage * 0.4, 0.8 + stage * 0.4, 11, { over: [7] });
      break;
    case 'rings':
      for (let k = 0; k < 3 + stage; k++) for (let x = cx - rx; x <= cx; x++) put(x, by - ry + 1 + k * 3.2, 3, over);
      break;
  }

  // ---------------------------------------------------------------- arms
  const ax = shoulderX + 1;
  const ay = shoulderY + 0.5;
  const reach = [2, 4, 6][stage];
  switch (P.arms) {
    case 'stub':
      line(ax, ay, ax - 2, ay + 2, 1, 2);
      break;
    case 'claws':
      line(ax, ay, ax - reach, ay + reach * 0.7, 1, 2);
      put(ax - reach - 1, ay + reach * 0.7 + 1, 8);
      put(ax - reach + 1, ay + reach * 0.7 + 1.5, 8);
      break;
    case 'long':
      line(ax, ay, ax - reach * 0.6, ay + reach, 1, 2);
      line(ax - reach * 0.6, ay + reach, ax - reach * 0.4, ay + reach * 2, 1, 2);
      put(ax - reach * 0.4 - 1, ay + reach * 2 + 1, 8);
      break;
    case 'fists':
      line(ax, ay, ax - reach, ay + reach * 0.5, 1, 3);
      blob(ax - reach - 1, ay + reach * 0.5 + 2, 2 + stage * 0.5, 2 + stage * 0.5, 1);
      put(ax - reach - 2, ay + reach * 0.5 + 2, 9);
      break;
    case 'blades':
      line(ax, ay, ax - reach * 0.7, ay - reach * 0.3, 1, 2);
      tri(ax - reach * 0.7, ay - reach * 0.3, ax - reach * 0.7 + 1, ay - reach * 0.3 + 1, ax - reach * 0.7 - 2, ay + reach * 1.6, 8);
      break;
    case 'tentacles':
      for (let k = 0; k < 2; k++) {
        const sy = ay + k * 2.5;
        for (let i = 0; i < reach + 3; i++) put(ax - i, sy + Math.sin(i * 0.9 + k * 2) * 1.3 + i * 0.35, k === 0 ? 1 : 2);
      }
      break;
    case 'pincers': {
      const px = ax - reach;
      const py = ay + reach * 0.4;
      line(ax, ay, px, py, 1, 2);
      tri(px, py - 1, px - 3 - stage, py - 3 - stage, px - 1, py + 1, 6);
      tri(px, py + 1, px - 3 - stage, py + 1, px - 1, py + 2, 6);
      break;
    }
    case 'none':
      break;
  }

  // ---------------------------------------------------------------- head
  if (!merged) blob(cx, hy, H.rx, H.ry, 1, { taper: H.taper, p: H.p });
  if (P.head === 'long') blob(cx, hy + H.ry * 0.45, H.rx * 0.55, H.ry * 0.4, 3, { over: [1] });

  const tY = headTop + 0.5;
  const tX = cx - (merged ? rx : H.rx) * 0.6;
  const big = [0.6, 1, 1.5][stage];
  switch (P.top) {
    case 'ears':
      tri(tX, tY + 1, tX + 2.5, tY + 1, tX - 1, tY - 3 * big, 1);
      put(tX, tY - 0.5, 2);
      break;
    case 'longears':
      for (let i = 0; i < 6 * big + 2; i++) {
        put(tX - i * 0.35, tY - i, 1);
        put(tX - i * 0.35 + 1, tY - i, i > 1 ? 2 : 1);
      }
      break;
    case 'antennae': {
      const len = 3 + 3 * big;
      line(tX + 1, tY, tX - len * 0.5, tY - len, 9);
      blob(tX - len * 0.5, tY - len - 0.5, 1, 1, 11);
      break;
    }
    case 'horns-swept':
      for (let i = 0; i < 4 * big + 1; i++) {
        put(tX - i * 0.8, tY - i * 0.7, 6);
        if (i < 2 * big) put(tX - i * 0.8 + 1, tY - i * 0.7, 6);
      }
      break;
    case 'horns-ram':
      for (let i = 0; i < 9; i++) {
        const a = (i / 8) * Math.PI * 1.3;
        put(tX - 1 - Math.sin(a) * 2.5 * big, tY + 1 - Math.cos(a) * 2.2 * big + i * 0.25, 6);
      }
      break;
    case 'antlers': {
      const len = 4 * big + 1;
      line(tX, tY, tX - len * 0.4, tY - len, 6);
      line(tX - len * 0.2, tY - len * 0.5, tX - len * 0.7, tY - len * 0.6, 6);
      line(tX - len * 0.4, tY - len, tX - len * 0.8, tY - len * 1.1, 6);
      if (stage === 2) line(tX - len * 0.3, tY - len * 0.75, tX - len * 0.1, tY - len * 1.15, 6);
      break;
    }
    case 'unihorn':
      tri(cx - 1, tY + 1, cx + 0.5, tY + 1, cx, tY - 5 * big - 1, 6);
      break;
    case 'crest':
      for (let i = 0; i < 4 * big + 2; i++) put(cx - (i % 2), tY - i * 0.8, i % 3 === 0 ? 11 : 2);
      tri(tX + 1, tY + 1, tX + 3, tY + 2, tX - 2 * big, tY - 2 * big, 2);
      break;
    case 'crown':
      for (let k = 0; k < 3; k++) tri(cx - k * 2.2 - 1, tY + 1, cx - k * 2.2 + 0.5, tY + 1, cx - k * 2.2 - 0.3, tY - 3 - (k === 0 ? 2 : 0), 6);
      break;
    case 'none':
      break;
  }

  drawSignature(types[0], D, { cx, headTop, hy, shoulderX, shoulderY, by, rx, ry, stage, hrx: merged ? rx : H.rx });

  // ---------------------------------------------------------------- face
  const visor = types[0] === 'Metal' && stage > 0;
  const hollow = (types[0] === 'Spirit' || types[0] === 'Shadow') && stage > 0;
  const eyeY = Math.round(faceY - faceR * (stage === 0 ? 0 : 0.15));
  const spread = Math.max(1.5, faceR * 0.42);
  if (face) {
    Object.assign(face, {
      cx, eyeY, spread, faceR, my: Math.round(faceY + faceR * 0.55), eyes: fam.eyes, visor, hollow, mouth: P.mouth, stage,
      headTop, hy, by, rx, ry, shoulderX, shoulderY, hrx: merged ? rx : H.rx, loco: L, back: P.back, ground,
    } satisfies FaceInfo);
    if (k > 1) return g;
  }
  const eyeAt = (x: number, y: number) => {
    if (hollow) {
      put(x, y, 9);
      put(x + 1, y, 9);
      put(x, y + 1, 9);
      put(x + 1, y + 1, 7);
      put(x - 1, y - 1, 9);
      return;
    }
    if (stage === 0) {
      for (let dx = 0; dx < 2; dx++) for (let dy = -1; dy < 2; dy++) put(x + dx, y + dy, 4);
      put(x + 1, y, 5);
      put(x + 1, y + 1, 5);
      put(x, y + 1, 5);
    } else if (stage === 1) {
      put(x, y, 4);
      put(x + 1, y, 5);
      put(x, y + 1, 4);
      put(x + 1, y + 1, 5);
      put(x - 1, y - 2, 9);
      put(x, y - 1, 9);
      put(x + 1, y - 1, 9);
    } else {
      put(x - 1, y, 7);
      put(x, y, 7);
      put(x + 1, y + 1, 7);
      put(x - 2, y - 2, 9);
      put(x - 1, y - 1, 9);
      put(x, y - 1, 9);
      put(x + 1, y, 9);
    }
  };
  if (visor) {
    for (let x = cx - faceR * 0.8; x <= cx; x++) {
      put(x, eyeY, 7);
      put(x, eyeY - 1, 9);
    }
  } else if (fam.eyes === 1) {
    const ex = cx - 1;
    for (let dx = 0; dx < 2; dx++) for (let dy = -1; dy <= 1; dy++) put(ex + dx, eyeY + dy, stage === 2 ? 7 : 4);
    put(cx - 0.5, eyeY, 5);
    if (stage > 0) for (let dx = -1; dx < 2; dx++) put(ex + dx, eyeY - 2, 9);
  } else {
    eyeAt(cx - spread - 1, eyeY);
    if (fam.eyes === 3) {
      put(cx - 0.5, eyeY - 3, stage === 2 ? 7 : 4);
      put(cx - 0.5, eyeY - 2, 5);
    }
    if (fam.eyes === 4) eyeAt(cx - spread * 0.6, eyeY + 2.5);
  }

  const my = Math.round(faceY + faceR * 0.55);
  switch (P.mouth) {
    case 'smile':
      put(cx - 1.5, my, 9);
      put(cx - 0.5, my + 0.5, 9);
      break;
    case 'fangs':
      put(cx - 1.5, my, 9);
      put(cx - 0.5, my, 9);
      put(cx - 1.5, my + 1, 8);
      break;
    case 'tusks':
      put(cx - 1.5, my, 9);
      put(cx - 0.5, my, 9);
      line(cx - 2.5, my, cx - 3.5, my - 2 - stage, 8);
      break;
    case 'mandibles':
      line(cx - 1.5, my, cx - 3, my + 1.5 + stage * 0.5, 6);
      put(cx - 1.5, my + 2 + stage * 0.5, 6);
      break;
    case 'jaw':
      for (let x = cx - 3.5; x <= cx; x++) put(x, my, 9);
      put(cx - 3.5, my - 1, 8);
      put(cx - 1.5, my + 1, 8);
      put(cx - 2.5, my + 1, 8);
      put(cx - 0.5, my - 1, 8);
      break;
    case 'beak':
      tri(cx - 2, my - 2, cx + 0.5, my - 2, cx - 0.5, my + 1 + stage, 6);
      break;
    case 'none':
      break;
  }
  return g;
}

interface Anchors {
  cx: number;
  headTop: number;
  hy: number;
  shoulderX: number;
  shoulderY: number;
  by: number;
  rx: number;
  ry: number;
  stage: number;
  hrx: number;
}

/** The family's primary element shows up as a feature that grows with each evolution. */
function drawSignature(el: Element, d: Draw, c: Anchors) {
  const s = c.stage;
  const k = [1, 1.6, 2.3][s];
  const top = c.headTop;
  switch (el) {
    case 'Fire':
      for (let i = 0; i < 2 + s; i++) {
        const fx = c.cx - i * 1.6;
        const h = (3 - i * 0.6) * k;
        d.tri(fx - 1, top + 1, fx + 1, top + 1, fx - 0.3, top - h, 10);
        d.put(fx - 0.2, top - h * 0.4, 11);
      }
      break;
    case 'Frost':
      for (let i = 0; i < 1 + s; i++) {
        const x = c.shoulderX + 1 + i * 2;
        d.tri(x - 1, c.shoulderY, x + 1, c.shoulderY, x - 0.5 - i * 0.5, c.shoulderY - 2.5 * k + i, 10);
        d.put(x - 0.3, c.shoulderY - 1, 11);
      }
      if (s === 2) d.tri(c.cx - 1, top, c.cx + 0.5, top, c.cx - 0.3, top - 4, 10);
      break;
    case 'Nature': {
      const lx = c.cx - c.hrx * 0.3;
      d.line(lx, top + 0.5, lx - 1 * k, top - 2 * k, 10);
      d.blob(lx - 1.5 * k, top - 2 * k, 1.2 * k, 0.8 * k, 10);
      if (s >= 1) d.blob(c.shoulderX + 1, c.shoulderY - 1, 1.5 * k * 0.7, 1 * k * 0.7, 10);
      if (s === 2) d.blob(c.cx - c.rx * 0.7, c.by + c.ry * 0.6, 1.6, 1, 11);
      break;
    }
    case 'Earth':
      // pebbles → craggy rock pauldrons
      d.blob(c.shoulderX + 1, c.shoulderY - 0.5, 1 + s * 0.8, 0.8 + s * 0.6, 10, { taper: 0.3 });
      d.put(c.shoulderX + 0.5, c.shoulderY - 1, 11);
      if (s === 2) d.tri(c.shoulderX - 0.5, c.shoulderY - 1, c.shoulderX + 2, c.shoulderY - 1, c.shoulderX + 0.5, c.shoulderY - 4, 10);
      break;
    case 'Storm': {
      const x = c.cx - c.hrx * 0.4;
      const h = 3 * k;
      d.line(x, top + 1, x - 1.2, top - h * 0.45, 10);
      d.line(x - 1.2, top - h * 0.45, x + 0.3, top - h * 0.55, 10);
      d.line(x + 0.3, top - h * 0.55, x - 1, top - h, 10);
      d.put(x - 1, top - h - 0.5, 11);
      break;
    }
    case 'Water': {
      const fy = c.hy;
      const fx = c.cx - c.hrx - 0.5;
      d.tri(fx + 1, fy - 1, fx + 1, fy + 2, fx - 2 * k, fy - 1.5 * k, 10);
      if (s === 2) d.tri(fx + 1, fy + 1, fx + 1, fy + 3, fx - 2.5 * k, fy + 2.5, 11);
      break;
    }
    case 'Metal':
      d.put(c.shoulderX + 1.5, c.shoulderY, 11);
      d.put(c.cx - c.rx * 0.5, c.by + c.ry * 0.3, 11);
      if (s >= 1) {
        d.line(c.cx - 0.5, top + 1, c.cx - 0.5, top - 2 * k, 6);
        d.put(c.cx - 0.5, top - 2 * k - 1, 7);
      }
      break;
    case 'Toxic':
      for (let i = 0; i < 1 + s * 2; i++) {
        const bx = c.cx - 2 - i * 1.7;
        const byy = top - 1.5 - (i % 2) * 2 - i * 0.6;
        d.blob(bx, byy, 0.7 + (i % 2) * 0.5, 0.7 + (i % 2) * 0.5, i % 2 ? 11 : 10);
      }
      break;
    case 'Shadow':
      for (let i = 0; i < 1 + s; i++) {
        const sx = c.cx - 1 - i * 2.5;
        for (let y = 0; y < 2 + s * 1.5; y++) d.put(sx + Math.sin(y + i) * 0.8, top - y, y % 2 ? 11 : 10);
      }
      break;
    case 'Light': {
      const hy = top - 2 - s;
      const w = 2 + s * 1.2;
      for (let x = c.cx - w; x <= c.cx; x++) d.put(x, hy, 10);
      d.put(c.cx - w - 1, hy + 1, 10);
      d.put(c.cx - w * 0.5, hy - 1, 11);
      break;
    }
    case 'Spirit':
      for (let i = 0; i < 1 + s; i++) {
        const ox = c.cx - c.rx - 2 - i * 1.5;
        const oy = c.shoulderY - 2 + i * 3;
        d.blob(ox, oy, 0.8, 0.8, 10);
        d.put(ox, oy, 11);
      }
      break;
    case 'Dragon': {
      const fx = c.cx - c.hrx - 0.3;
      const fy = c.hy - 1;
      for (let i = 0; i < 1 + s; i++) d.tri(fx + 1, fy + i * 1.5, fx + 1, fy + i * 1.5 + 2, fx - 2 * k + i, fy - 1 * k + i * 1.8, 10);
      break;
    }
  }
}

// ------------------------------------------------------------------ painting

function shade(color: number, f: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

/** Small per-family colour shift so families of the same element aren't identical. */
function jitter(color: number, j: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const mix = (v1: number, v2: number) => Math.max(0, Math.min(255, Math.round(v1 + (v2 - v1) * Math.abs(j))));
  return j >= 0 ? (mix(r, g) << 16) | (mix(g, b) << 8) | mix(b, r) : (mix(r, b) << 16) | (mix(g, r) << 8) | mix(b, g);
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** A related contrasting colour used as the accent for one family of each pure element. */
const PURE_ACCENT: Record<Element, number> = {
  Fire: 0xffe14d,
  Frost: 0x3d6bff,
  Nature: 0xc8935a,
  Earth: 0x6fd36a,
  Storm: 0x5a7dff,
  Water: 0x2fd6c0,
  Metal: 0xd94060,
  Toxic: 0x7dff6a,
  Shadow: 0xd33a4a,
  Light: 0xff9fd0,
  Spirit: 0x9fe8ff,
  Dragon: 0xffc94d,
};

const SIGNATURE_COLOR: Record<Element, number> = {
  Fire: 0xffb02e,
  Frost: 0xd8f6ff,
  Nature: 0x3fae4a,
  Earth: 0x8a6a48,
  Storm: 0xfff27a,
  Water: 0x7fd4ff,
  Metal: 0xdfe6ee,
  Toxic: 0x7dff6a,
  Shadow: 0x9a7dff,
  Light: 0xffe680,
  Spirit: 0xb8f4ff,
  Dragon: 0xff8a3d,
};

/** Rotate a color's hue by `deg` degrees (and lift its saturation a little). */
function hueShift(color: number, deg: number): number {
  const r = ((color >> 16) & 255) / 255;
  const g = ((color >> 8) & 255) / 255;
  const b = (color & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let sat = 0;
  if (d > 0) {
    sat = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  h = (h + deg + 360) % 360;
  sat = Math.min(1, sat * 1.15);
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round(Math.max(0, Math.min(1, v + m)) * 255);
  return (to(rr) << 16) | (to(gg) << 8) | to(bb);
}

/** How far a species' shiny colors are turned around the color wheel (fixed per family). */
export function shinyHue(speciesId: string): number {
  let h = 0;
  for (const ch of speciesId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 120 + (h % 120);
}

function paletteFor(speciesId: string, stage: number, shiny = false) {
  const p = basePalette(speciesId, stage);
  if (!shiny) return p;
  const deg = shinyHue(speciesId);
  for (const k of [1, 2, 3, 9, 10, 11]) p.pal[k] = hueShift(p.pal[k], deg);
  return { pal: p.pal, outline: hueShift(p.outline, deg), shadow: hueShift(p.shadow, deg), light: hueShift(p.light, deg) };
}

function basePalette(speciesId: string, stage: number) {
  const types = SPECIES_BY_ID[speciesId].types;
  const [t1, t2] = types;
  const fam = familyPlan(speciesId, types);
  const dark = t1 === 'Shadow';
  const base = jitter(shade(ELEMENT_COLORS[t1], dark ? [1.25, 1.15, 1.05][stage] : [0.97, 0.86, 0.74][stage]), fam.hueJitter);
  let sec = ELEMENT_COLORS[t2];
  if (t1 === t2) {
    // Pure families of one element each get a different accent.
    const accents = [shade(ELEMENT_COLORS[t1], 0.55), PURE_ACCENT[t1], 0x2a2238, shade(ELEMENT_COLORS[t1], 1.55)];
    sec = accents[Math.max(0, pureIndex(speciesId)) % accents.length];
    if (stage === 2) sec = shade(sec, 1.1);
  } else if (stage === 2) sec = shade(sec, 1.1);
  const sig = SIGNATURE_COLOR[t1];
  const pal: Record<number, number> = {
    1: base,
    2: sec,
    3: stage === 2 ? shade(sec, 0.78) : shade(base, 1.45),
    4: 0xffffff,
    5: 0x1a1428,
    6: stage === 2 ? 0xf3ead2 : 0xd8d0c0,
    7: t1 === 'Light' || t2 === 'Light' ? 0xff4d6d : stage === 2 ? 0xfff07a : 0xffe08a,
    8: 0xffffff,
    9: shade(base, 0.22),
    10: sig,
    11: shade(sig, 1.4),
  };
  return { pal, outline: shade(base, stage === 2 ? 0.18 : 0.3), shadow: shade(base, 0.72), light: shade(base, 1.25) };
}

/** Paints a creature onto any 2D canvas context at (ox, oy), one canvas pixel per sprite pixel. */
export function paintCreature(ctx: CanvasRenderingContext2D, speciesId: string, stage: number, ox = 0, oy = 0, shiny = false) {
  const grid = buildGrid(speciesId, stage);
  const { pal, outline, shadow, light } = paletteFor(speciesId, stage, shiny);
  const S = SPRITE_SIZE;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && grid[y][x] !== 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = grid[y][x];
      if (v === 0) {
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
          ctx.fillStyle = hex(outline);
          ctx.fillRect(ox + x, oy + y, 1, 1);
        }
        continue;
      }
      let col = pal[v];
      if (v === 1) {
        if (!filled(x, y + 1) || !filled(x + 1, y + 1)) col = shadow;
        else if (!filled(x, y - 1) || !filled(x - 1, y - 1)) col = light;
      }
      ctx.fillStyle = hex(col);
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
}

export function creatureTextureKey(speciesId: string, stage: number, shiny = false): string {
  return `cr-${speciesId}-${stage}${shiny ? '-s' : ''}`;
}

/**
 * A grayed-out copy of a creature sprite (Hexlidex: seen but never caught): its colours turned to a
 * dim, cool gray, keeping the outline and shading readable.
 */
/** `solid`: fully opaque (the rival's Hexling on a stage-race map); otherwise slightly see-through (Hexlidex). */
export function ensureGrayTexture(scene: Phaser.Scene, speciesId: string, stage: number, solid = false): string {
  const key = `${creatureTextureKey(speciesId, stage)}-gray${solid ? '-solid' : ''}`;
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext('2d')!;
  paintCreature(ctx, speciesId, stage);
  const img = ctx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const lum = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    const v = solid ? 30 + lum * 0.8 : 70 + lum * 0.5;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v + (solid ? 6 : 14);
    d[i + 3] = solid ? 255 : 230;
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** Draws (once) and returns the texture key for a creature sprite (`shiny`: its rare colors). */
export function ensureCreatureTexture(scene: Phaser.Scene, speciesId: string, stage: number, shiny = false): string {
  const key = creatureTextureKey(speciesId, stage, shiny);
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  paintCreature(canvas.getContext('2d')!, speciesId, stage, 0, 0, shiny);
  scene.textures.addCanvas(key, canvas);
  return key;
}
