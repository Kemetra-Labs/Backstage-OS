"""Measured comparison of the V2 renders against the owner reference images.

Usage (from the repo root, after capture.mjs wrote 1448x1086 viewport shots into screenshots/v2):
    python docs/design-lab/v2/tools/compare.py

What is measured (objective, repeatable):
  grid_lum_corr   Pearson correlation of mean luminance over a 12 x 9 grid (global composition: where the light and dark masses sit)
  grid_edge_corr  Pearson correlation of mean edge strength over the same grid (where structure and text density sit)
  cyan_share      share of pixels that read as cyan accent, reference vs render
  amber_share     share of pixels that read as amber accent, reference vs render
  mean_rgb_dist   distance between the two images' mean colour
What is NOT measured: typography, copy, iconography, interaction. Content differs on purpose (see comparison.md), so a
perfect score is neither reachable nor wanted; the numbers show whether the composition and accent discipline are in the
same family, not that the render is "pixel perfect".
"""
import json
import math
import os
import sys

from PIL import Image, ImageFilter

ROOT = os.path.join('docs', 'design-lab', 'v2')
SHOTS = os.path.join(ROOT, 'screenshots', 'v2')
REFS = os.path.join(ROOT, 'reference')
OUT = os.path.join(ROOT, 'measurements.json')
SIDE = os.path.join(ROOT, 'screenshots', 'side-by-side')

PAIRS = [
    ('mission-map', '01-mission-map-v2.webp'),
    ('source-observatory', '02-source-observatory-v2.webp'),
    ('mission-replay', '03-mission-replay-v2.webp'),
    ('agent-flight-deck', '04-agent-flight-deck-v2.webp'),
]
GX, GY = 12, 9
SIZE = (1448, 1086)


def grid_means(img: Image.Image) -> list:
    w, h = img.size
    px = img.load()
    out = []
    for gy in range(GY):
        for gx in range(GX):
            x0, x1 = gx * w // GX, (gx + 1) * w // GX
            y0, y1 = gy * h // GY, (gy + 1) * h // GY
            tot = 0
            n = 0
            for y in range(y0, y1, 3):
                for x in range(x0, x1, 3):
                    tot += px[x, y]
                    n += 1
            out.append(tot / max(1, n))
    return out


def pearson(a: list, b: list) -> float:
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    va = math.sqrt(sum((x - ma) ** 2 for x in a))
    vb = math.sqrt(sum((y - mb) ** 2 for y in b))
    return cov / (va * vb) if va and vb else 0.0


def accent_shares(img: Image.Image) -> tuple:
    """Share of pixels whose hue reads as the cyan accent (170-200 deg) or the amber accent (25-48 deg), saturated and bright."""
    import colorsys
    rgb = img.convert('RGB').resize((362, 272))
    cyan = amber = 0
    total = rgb.width * rgb.height
    for r, g, b in rgb.getdata():
        h, sat, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        deg = h * 360
        if v < 0.55 or sat < 0.45:
            continue
        if 170 <= deg <= 200:
            cyan += 1
        elif 25 <= deg <= 48 and v > 0.65:
            amber += 1
    return cyan / total, amber / total


def mean_rgb(img: Image.Image) -> tuple:
    px = list(img.convert('RGB').resize((181, 136)).getdata())
    n = len(px)
    return tuple(sum(p[i] for p in px) / n for i in range(3))


def main() -> int:
    os.makedirs(SIDE, exist_ok=True)
    result = {}
    for name, ref_file in PAIRS:
        ref = Image.open(os.path.join(REFS, ref_file)).convert('RGB').resize(SIZE)
        shot_path = os.path.join(SHOTS, f'{name}-en-owner-1448.jpg')
        if not os.path.exists(shot_path):
            print('missing', shot_path)
            return 1
        shot = Image.open(shot_path).convert('RGB')
        if shot.size != SIZE:
            shot = shot.resize(SIZE)
        lum_ref, lum_shot = grid_means(ref.convert('L')), grid_means(shot.convert('L'))
        edge_ref = grid_means(ref.convert('L').filter(ImageFilter.FIND_EDGES))
        edge_shot = grid_means(shot.convert('L').filter(ImageFilter.FIND_EDGES))
        cr, ar = accent_shares(ref)
        cs, a_s = accent_shares(shot)
        mr, ms = mean_rgb(ref), mean_rgb(shot)
        result[name] = {
            'grid_lum_corr': round(pearson(lum_ref, lum_shot), 3),
            'grid_edge_corr': round(pearson(edge_ref, edge_shot), 3),
            'cyan_share_ref': round(cr, 4), 'cyan_share_v2': round(cs, 4),
            'amber_share_ref': round(ar, 4), 'amber_share_v2': round(a_s, 4),
            'mean_rgb_ref': [round(v, 1) for v in mr], 'mean_rgb_v2': [round(v, 1) for v in ms],
            'mean_rgb_dist': round(math.dist(mr, ms), 1),
        }
        # Side-by-side (reference left, render right) at half scale for the owner review.
        half = (SIZE[0] // 2, SIZE[1] // 2)
        sheet = Image.new('RGB', (half[0] * 2 + 12, half[1]), (24, 24, 24))
        sheet.paste(ref.resize(half), (0, 0))
        sheet.paste(shot.resize(half), (half[0] + 12, 0))
        sheet.save(os.path.join(SIDE, f'{name}.jpg'))
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
