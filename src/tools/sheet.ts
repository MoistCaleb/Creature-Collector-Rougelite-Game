// Dev-only: every species and its evolutions on one page (npm run dev, then open /tools/sheet.html).
import { SPECIES } from '../data/species';
import { ELEMENT_COLORS, elementTextColor } from '../data/types';
import { paintCreature, SPRITE_SIZE } from '../ui/sprites';

const SCALE = 4;
const root = document.getElementById('sheet')!;
for (const sp of SPECIES) {
  const fam = document.createElement('div');
  fam.className = 'fam';
  const types = sp.types[0] === sp.types[1] ? [sp.types[0]] : [...sp.types];
  fam.innerHTML = `<h3>${sp.names[0]} line ${types
    .map((t) => `<span class="chip" style="background:#${ELEMENT_COLORS[t].toString(16).padStart(6, '0')};color:${elementTextColor(t)}">${t.toUpperCase()}</span>`)
    .join('')}</h3>`;
  const row = document.createElement('div');
  row.className = 'row';
  for (let stage = 0; stage < 3; stage++) {
    const wrap = document.createElement('div');
    wrap.className = 'stage';
    const c = document.createElement('canvas');
    c.width = SPRITE_SIZE * SCALE;
    c.height = SPRITE_SIZE * SCALE;
    const ctx = c.getContext('2d')!;
    ctx.scale(SCALE, SCALE);
    paintCreature(ctx, sp.id, stage);
    wrap.append(c, sp.names[stage]);
    row.append(wrap);
    if (stage < 2) {
      const a = document.createElement('span');
      a.className = 'arrow';
      a.textContent = '›';
      row.append(a);
    }
  }
  fam.append(row);
  root.append(fam);
}
