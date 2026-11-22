"""
Gemini part sheet -> game pixel parts.

Each sheet is grayscale parts with magenta (#FF00FF) marking secondary areas, on a plain light
background. For each part: cut it out, classify every source pixel (background, outline, four
gray tones, magenta light/dark, white), then downsample to the game's pixel grid by taking the
most common class in each cell (robust to JPEG noise and Gemini's uneven "pixels").

Usage: python3 parts.py SHEET.jpg OUT_PREFIX TARGET_HEIGHT
Writes OUT_PREFIX.json (class grids) and OUT_PREFIX-preview.png (crop | gray | recoloured).
"""
import json
import sys
from collections import Counter, deque

import numpy as np
from PIL import Image

# Classes
BG, INK, T0, T1, T2, T3, M0, M1, WH = range(9)  # T0 lightest .. T3 darkest; M0 magenta light, M1 dark
CH = {BG: '.', INK: 'D', T0: 'Y', T1: 'B', T2: 'K', T3: 'Q', M0: 'T', M1: 's', WH: 'W'}


def classify(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    sat = np.max(a, axis=2).astype(int) - np.min(a, axis=2).astype(int)
    cls = np.full(r.shape, T1, dtype=np.int8)
    magenta = (r - g > 70) & (b - g > 50)
    cls[lum >= 200] = T0
    cls[(lum >= 150) & (lum < 200)] = T1
    cls[(lum >= 105) & (lum < 150)] = T2
    cls[(lum >= 60) & (lum < 105)] = T3
    cls[lum < 60] = INK
    cls[magenta & (lum >= 110)] = M0
    cls[magenta & (lum < 110)] = M1
    cls[(lum > 232) & (sat < 28) & ~magenta] = WH  # white or background; decided by flood fill
    return cls


def background_mask(cls):
    """White pixels connected to the border are background; enclosed whites stay (eye whites)."""
    h, w = cls.shape
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cls[y, x] == WH and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if cls[y, x] == WH and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and cls[ny, nx] == WH:
                bg[ny, nx] = True
                q.append((ny, nx))
    return bg


def components(fg, gap=14):
    """Bounding boxes of parts: foreground grown by `gap` so loose bits (whiskers, antennae) join."""
    h, w = fg.shape
    # Cheap dilation with a box filter via cumulative sums.
    f = fg.astype(np.int32)
    c = np.pad(f, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    y0 = np.clip(np.arange(h) - gap, 0, h)
    y1 = np.clip(np.arange(h) + gap + 1, 0, h)
    x0 = np.clip(np.arange(w) - gap, 0, w)
    x1 = np.clip(np.arange(w) + gap + 1, 0, w)
    grown = (c[y1][:, x1] - c[y0][:, x1] - c[y1][:, x0] + c[y0][:, x0]) > 0
    seen = np.zeros((h, w), bool)
    boxes = []
    for sy in range(h):
        for sx in range(w):
            if not grown[sy, sx] or seen[sy, sx]:
                continue
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            ys, xs = [], []
            while q:
                y, x = q.popleft()
                ys.append(y)
                xs.append(x)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and grown[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(ys) > 2000:
                boxes.append((max(0, min(ys) + gap), max(0, min(xs) + gap), min(h, max(ys) - gap + 1), min(w, max(xs) - gap + 1)))
    # Reading order: group into rows by vertical centre (a new row starts below the previous row's middle), then left to right.
    boxes.sort(key=lambda b: (b[0] + b[2]) / 2)
    rows, cur = [], []
    for bx in boxes:
        if cur and (bx[0] + bx[2]) / 2 > max(c[2] for c in cur):
            rows.append(cur)
            cur = []
        cur.append(bx)
    if cur:
        rows.append(cur)
    return [bx for row in rows for bx in sorted(row, key=lambda b: b[1])]


def retone(img, cls, bg, box):
    """Grays get this part's own four tones (by its brightness quantiles), so dark parts recolour cleanly."""
    y0, x0, y1, x1 = box
    a = img[y0:y1, x0:x1].astype(int)
    c = cls[y0:y1, x0:x1]
    b = bg[y0:y1, x0:x1]
    lum = 0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]
    gray = (~b) & np.isin(c, [T0, T1, T2, T3])
    if gray.sum() < 50:
        return
    q1, q2 = np.percentile(lum[gray], [28, 74])
    new = np.where(lum >= q2, T0, np.where(lum >= q1, T1, T2))
    c[gray] = new[gray]


def downsample(cls, bg, box, target_h, ph=None):
    y0, x0, y1, x1 = box
    ph = ph or (y1 - y0) / target_h
    target_h = max(1, round((y1 - y0) / ph))
    tw = max(1, round((x1 - x0) / ph))
    out = np.full((target_h, tw), BG, dtype=np.int8)
    for ty in range(target_h):
        for tx in range(tw):
            ya, yb = int(y0 + ty * ph), int(y0 + (ty + 1) * ph)
            xa, xb = int(x0 + tx * ph), int(x0 + (tx + 1) * ph)
            cell = cls[ya:yb, xa:xb]
            cbg = bg[ya:yb, xa:xb]
            if cell.size == 0:
                continue
            if cbg.mean() > 0.5:
                continue
            vals = cell[~cbg].ravel().tolist()
            cnt = Counter(vals)
            # Outlines are thin in the source; keep them when they cover a fair share of the cell.
            if cnt.get(INK, 0) >= 0.3 * len(vals):
                out[ty, tx] = INK
            elif cnt.get(WH, 0) >= 0.22 * len(vals):
                out[ty, tx] = WH  # keep eye whites and highlights
            else:
                out[ty, tx] = cnt.most_common(1)[0][0]
    return out


def tidy(g):
    """Remove lone pixels, clean stray magenta specks, and add a 1-pixel outline around the silhouette."""
    h, w = g.shape
    # Stray magenta: a magenta pixel with fewer than 2 magenta neighbours takes its neighbours' majority.
    m = g.copy()
    for y in range(h):
        for x in range(w):
            if g[y, x] in (M0, M1):
                nb = [g[y + dy, x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and 0 <= y + dy < h and 0 <= x + dx < w]
                if sum(n in (M0, M1) for n in nb) < 2:
                    rest = [n for n in nb if n not in (M0, M1, BG)]
                    if rest:
                        m[y, x] = Counter(rest).most_common(1)[0][0]
    # Smooth the shading: a gray pixel that disagrees with most of its gray neighbours joins them.
    TONES = (T0, T1, T2, T3)
    for _ in range(2):
        s2 = m.copy()
        for y in range(h):
            for x in range(w):
                if m[y, x] not in TONES:
                    continue
                nb = [m[y + dy, x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and 0 <= y + dy < h and 0 <= x + dx < w and m[y + dy, x + dx] in TONES]
                if len(nb) >= 4:
                    top, n = Counter(nb).most_common(1)[0]
                    if top != m[y, x] and n >= 5:
                        s2[y, x] = top
        m = s2
    g = np.pad(m, 1, constant_values=BG)
    h, w = g.shape
    out = g.copy()
    for y in range(h):
        for x in range(w):
            if g[y, x] == BG and any(0 <= y + dy < h and 0 <= x + dx < w and g[y + dy, x + dx] not in (BG,) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[y, x] = INK
    g = out.copy()
    for y in range(h):
        for x in range(w):
            if g[y, x] == BG:
                continue
            nb = [g[y + dy, x + dx] if 0 <= y + dy < h and 0 <= x + dx < w else BG for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1))]
            if all(n == BG for n in nb):
                out[y, x] = BG
    return out


def main():
    sheet, prefix, target_h = sys.argv[1], sys.argv[2], int(sys.argv[3])
    im = np.array(Image.open(sheet).convert('RGB'))
    cls = classify(im)
    bg = background_mask(cls)
    boxes = components(~bg)
    parts = []
    # Drop text labels: short, wide, mostly-dark blobs under the parts.
    def is_label(box):
        y0, x0, y1, x1 = box
        sub = cls[y0:y1, x0:x1]
        ink = (sub == INK).mean()
        return (y1 - y0) < 70 and (x1 - x0) > 2.2 * (y1 - y0) and ink > 0.08
    boxes = [b for b in boxes if not is_label(b)]
    # Captions that survived (or other small debris): much shorter than a typical part.
    if len(boxes) > 2 and not (len(sys.argv) > 4 and sys.argv[4] == 'common'):
        hs = sorted(b[2] - b[0] for b in boxes)
        med = hs[len(hs) // 2]
        boxes = [b for b in boxes if (b[2] - b[0]) > 0.35 * med]
    # 'common': one scale for the whole sheet (the tallest part gets target_h), so sizes stay relative.
    common = len(sys.argv) > 4 and sys.argv[4] == 'common'
    ph = max(b[2] - b[0] for b in boxes) / target_h if common else None
    for box in boxes:
        retone(im, cls, bg, box)
        g = tidy(downsample(cls, bg, box, target_h, ph))
        parts.append({'box': [int(v) for v in box], 'rows': [''.join(CH[int(v)] for v in row) for row in g]})
    json.dump(parts, open(prefix + '.json', 'w'), indent=1)
    print(len(parts), 'parts', [len(p['rows'][0]) for p in parts])


if __name__ == '__main__':
    main()
