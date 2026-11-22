import json, sys
from PIL import Image, ImageDraw
src = Image.open(sys.argv[1]).convert('RGB'); parts = json.load(open(sys.argv[2])); out = sys.argv[3]
def mix(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
def hexc(h): return ((h >> 16) & 255, (h >> 8) & 255, h & 255)
SH, LI = hexc(0x241448), hexc(0xfff2cc)
def ramp(base, sec):
    b, s = hexc(base), hexc(sec)
    return {'Y': mix(b, LI, .35), 'B': b, 'K': mix(b, SH, .3), 'Q': mix(b, SH, .55), 'T': mix(s, LI, .2), 's': mix(s, SH, .3), 'D': mix(b, (16, 10, 30), .9), 'W': (255, 255, 255)}
PALS = [('Gray', None), ('Fire', ramp(0xd8603a, 0xffd54a)), ('Water', ramp(0x3a8ee8, 0x9fe8ff)), ('Nature', ramp(0x4caf50, 0xc8935a)), ('Shadow', ramp(0x6a5aa0, 0xff5a6a))]
GRAY = {'Y': (225, 225, 225), 'B': (175, 175, 175), 'K': (125, 125, 125), 'Q': (85, 85, 85), 'T': (255, 120, 255), 's': (170, 0, 170), 'D': (30, 30, 30), 'W': (255, 255, 255)}
Z = 6; CELL = 34 * Z; PAD = 12
cols = 1 + len(PALS)
img = Image.new('RGB', (PAD + cols * (CELL + PAD), PAD + len(parts) * (CELL + PAD)), (29, 24, 48))
d = ImageDraw.Draw(img)
for i, p in enumerate(parts):
    y = PAD + i * (CELL + PAD)
    y0, x0, y1, x1 = p['box']
    crop = src.crop((x0, y0, x1, y1)); crop.thumbnail((CELL, CELL))
    d.rectangle([PAD, y, PAD + CELL, y + CELL], fill=(240, 240, 240)); img.paste(crop, (PAD, y))
    rows = p['rows']
    for j, (name, pal) in enumerate(PALS):
        x = PAD + (j + 1) * (CELL + PAD)
        d.rectangle([x, y, x + CELL, y + CELL], fill=(42, 36, 64))
        pal = pal or GRAY
        ox = x + (CELL - len(rows[0]) * Z) // 2; oy = y + (CELL - len(rows) * Z) // 2
        for ry, row in enumerate(rows):
            for rx, ch in enumerate(row):
                if ch == '.': continue
                d.rectangle([ox + rx * Z, oy + ry * Z, ox + rx * Z + Z - 1, oy + ry * Z + Z - 1], fill=pal[ch])
img.save(out)
