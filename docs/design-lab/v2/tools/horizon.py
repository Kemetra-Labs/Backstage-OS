"""Renders the V2 planet horizon (BACK-18 stage 2) as a static, pre-rendered webp. Deterministic: same seed, same file.

Usage (from the repo root):
    python docs/design-lab/v2/tools/horizon.py

Writes app/src/design-lab/v2/assets/horizon.webp. Nothing is cropped or traced from the owner reference images; the image
is drawn from scratch with the V2 token colours below (copied from app/src/design-lab/v2/styles/tokens.css).

Geometry contract with base.css: the image is laid over `.kv2-horizon` by its `::before`, which starts 28 % of the element
height above it (block size 128 %). The planet is the ellipse centred on the bottom edge, with rx = width / 2 and
ry = height / 1.28, so its limb lands exactly on the element's own elliptical top edge (the CSS fallback underneath).
Stretching the image with the panel keeps that alignment at any aspect ratio.
"""
import os

import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join('app', 'src', 'design-lab', 'v2', 'assets', 'horizon.webp')
W, H = 2400, 900
HEADROOM = 1.28  # must match `inset-block-start: -28%` in base.css
SEED = 18

# Token colours (tokens.css): cyan, cyan-2, ink, ground.
CYAN = np.array([0x2D, 0xE2, 0xEC], dtype=np.float64)
CYAN_2 = np.array([0x18, 0xB4, 0xC6], dtype=np.float64)
INK = np.array([0xE8, 0xF3, 0xF9], dtype=np.float64)
GROUND = np.array([0x05, 0x0C, 0x14], dtype=np.float64)


def value_noise(rng: np.random.Generator, scale: int, blur: float) -> np.ndarray:
    """Smooth 0..1 noise: random cells, upscaled and blurred."""
    small = rng.random((H // scale + 2, W // scale + 2))
    img = Image.fromarray((small * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(img, dtype=np.float64) / 255.0


def main() -> int:
    rng = np.random.default_rng(SEED)
    y, x = np.mgrid[0:H, 0:W].astype(np.float64)
    cx, cy = W / 2, H
    rx, ry = W / 2, H / HEADROOM
    d = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    s = (d - 1.0) * ry  # signed distance from the limb in pixels (accurate near the top, which is what shows)
    lit = np.exp(-((x - cx) / (0.62 * rx)) ** 2)  # the limb is brightest at the top centre and fades to the sides
    out_side = s > 0

    rgb = np.zeros((H, W, 3))
    alpha = np.zeros((H, W))

    # Atmosphere above the limb: a tight bright band plus a wide soft haze, both transparent-backed.
    a_out = lit * (0.78 * np.exp(-s / 16.0) + 0.32 * np.exp(-s / 85.0)) + 0.10 * np.exp(-s / 60.0)
    a_out = np.clip(np.where(out_side, a_out, 0.0), 0.0, 1.0)
    core = np.clip(np.exp(-s / 10.0), 0, 1)[..., None]
    col_out = CYAN * (1 - 0.35 * core) + INK * (0.35 * core)

    # Planet body: opaque, dark teal, with inner scattering under the limb and slow surface variation.
    depth = np.clip(-s, 0, None)
    n1 = value_noise(rng, 40, 18)
    n2 = value_noise(rng, 12, 4)
    terrain = 0.65 * n1 + 0.35 * n2
    scatter = lit * (0.62 * np.exp(-depth / 34.0) + 0.30 * np.exp(-depth / 170.0)) + 0.06 * np.exp(-depth / 120.0)
    body = GROUND * (1.0 + 1.6 * terrain[..., None]) + CYAN_2 * (0.10 + 0.08 * terrain)[..., None] * np.exp(-depth / 420.0)[..., None]
    col_in = body * (1 - scatter[..., None]) + CYAN * scatter[..., None]

    # City lights: seeded points, denser near the lit limb, drawn small then bloomed a little.
    lights = np.zeros((H, W))
    n = 5200
    px = rng.integers(0, W, n)
    py = rng.integers(0, H, n)
    keep = (s[py, px] < -4) & (rng.random(n) < np.exp(s[py, px] / 260.0) * (0.35 + 0.65 * lit[py, px]))
    lights[py[keep], px[keep]] = rng.uniform(0.45, 1.0, keep.sum())
    big = keep & (rng.random(n) < 0.18)
    for oy, ox in ((0, 1), (1, 0), (1, 1)):
        lights[np.clip(py[big] + oy, 0, H - 1), np.clip(px[big] + ox, 0, W - 1)] = 0.8
    glow = np.asarray(Image.fromarray((lights * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6)), dtype=np.float64) / 255.0
    sparks = np.clip(lights * 0.75 + glow * 1.9, 0, 1)[..., None]
    col_in = col_in * (1 - sparks) + (INK * 0.55 + CYAN * 0.45) * sparks

    # The limb itself: a thin near-white line, strongest where the light is.
    line = np.exp(-(s / 2.1) ** 2) * (0.35 + 0.65 * lit)
    rgb = np.where(out_side[..., None], col_out, col_in)
    alpha = np.where(out_side, a_out, 1.0)
    rgb = rgb * (1 - line[..., None]) + (INK * 0.6 + CYAN * 0.4) * line[..., None]
    alpha = np.maximum(alpha, line)

    img = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    Image.fromarray(img, 'RGBA').resize((1600, 600), Image.LANCZOS).save(OUT, 'WEBP', quality=82, method=6)
    print(OUT, os.path.getsize(OUT), 'bytes')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
