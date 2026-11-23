import json
from PIL import Image, ImageDraw
H = json.load(open('heads-front.json')); B = json.load(open('heads-back.json'))
E = json.load(open('eyes.json')); M = json.load(open('mouths.json'))
def mix(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
def hexc(h): return ((h >> 16) & 255, (h >> 8) & 255, h & 255)
SH, LI, INKC = hexc(0x241448), hexc(0xfff2cc), (20, 12, 32)
def body_pal(base, sec):
    b, s = hexc(base), hexc(sec)
    return {'Y': mix(b, LI, .35), 'B': b, 'K': mix(b, SH, .3), 'Q': mix(b, SH, .5), 'T': mix(s, LI, .15), 's': mix(s, SH, .3), 'D': mix(b, INKC, .88), 'W': (255, 255, 255)}
def eye_pal(iris):
    i = hexc(iris)
    return {'Y': (250, 250, 250), 'B': (215, 215, 222), 'K': (150, 150, 165), 'Q': (90, 90, 105), 'T': i, 's': mix(i, SH, .4), 'D': INKC, 'W': (255, 255, 255)}
MOUTH = {'Y': (250, 246, 236), 'B': (225, 220, 210), 'K': (120, 60, 70), 'Q': (80, 30, 45), 'T': (235, 110, 140), 's': (170, 60, 90), 'D': INKC, 'W': (255, 255, 255)}
# Where faces go on each blank head (fractions of its width/height): eye centre, eye spacing, mouth (or None).
ANCH = [
    (0.44, 0.46, 0.17, (0.20, 0.80)),  # canine
    (0.50, 0.58, 0.19, (0.50, 0.80)),  # feline
    (0.55, 0.34, 0.12, None),          # reptile (mouth drawn in)
    (0.60, 0.36, 0.12, None),          # bird (beak)
    (0.52, 0.56, 0.17, None),          # insect (mandibles)
    (0.50, 0.60, 0.20, (0.50, 0.83)),  # mascot
    (0.40, 0.50, 0.16, None),          # skull
    (0.50, 0.30, 0.25, None),          # frog (mouth drawn in)
]
# Eye parts (in sheet order): 0,1 cute; 2,3 normal; 4 fierce pair; 5,6 sleepy; 7,8 glowing; 9,10 hollow; 11 cyclops; 12,13 bug.
COMBOS = [((0, 1), 0, 0x3a2a20), ((2, 3), 1, 0xe0a020), ((4,), 2, 0xff5020), ((7, 8), 3, 0xffd040)]
Z, C, PAD = 7, 40, 10
cols = 2 + len(COMBOS)
img = Image.new('RGB', (PAD + cols * (C * Z + PAD), PAD + len(H) * (C * Z + PAD)), (29, 24, 48))
d = ImageDraw.Draw(img)
def paste(canvas, rows, ox, oy, pal):
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.' and 0 <= oy + y < C and 0 <= ox + x < C:
                canvas[oy + y][ox + x] = pal[ch]
def draw(canvas, cx, cy):
    d.rectangle([cx, cy, cx + C * Z, cy + C * Z], fill=(42, 36, 64))
    for y in range(C):
        for x in range(C):
            if canvas[y][x]: d.rectangle([cx + x * Z, cy + y * Z, cx + x * Z + Z - 1, cy + y * Z + Z - 1], fill=canvas[y][x])
pal = body_pal(0xd8603a, 0xffd54a)
for i, head in enumerate(H):
    rows = head['rows']; h, w = len(rows), len(rows[0])
    hx, hy = (C - w) // 2, (C - h) // 2 + 2
    y = PAD + i * (C * Z + PAD)
    blank = [[None] * C for _ in range(C)]; paste(blank, rows, hx, hy, pal); draw(blank, PAD, y)
    ex, ey, sp, mouth = ANCH[i]
    for j, (eyes, m, iris) in enumerate(COMBOS):
        cv = [[None] * C for _ in range(C)]
        paste(cv, rows, hx, hy, pal)
        if mouth:
            mr = M[m]['rows']
            paste(cv, mr, hx + round(mouth[0] * w) - len(mr[0]) // 2, hy + round(mouth[1] * h) - len(mr) // 2, MOUTH)
        ecx, ecy = hx + ex * w, hy + ey * h
        if len(eyes) == 1:
            er = E[eyes[0]]['rows']
            paste(cv, er, round(ecx - len(er[0]) / 2), round(ecy - len(er) / 2), eye_pal(iris))
        else:
            for k, (part, off) in enumerate(zip(eyes, (-sp, sp * 0.85))):
                er = E[part]['rows']
                paste(cv, er, round(ecx + off * w - len(er[0]) / 2), round(ecy - len(er) / 2), eye_pal(iris))
        draw(cv, PAD + (j + 1) * (C * Z + PAD), y)
    back = B[i]['rows']; bh, bw = len(back), len(back[0])
    cv = [[None] * C for _ in range(C)]; paste(cv, back, (C - bw) // 2, (C - bh) // 2 + 2, pal)
    draw(cv, PAD + (cols - 1) * (C * Z + PAD), y)
img.save('faces.png'); print(img.size)
