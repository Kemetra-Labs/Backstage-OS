"""Builds the owner-review triptychs: V1 (left), V2 render (middle), owner reference (right), each at 1448x1086 scaled to 1/3."""
import os

from PIL import Image, ImageDraw

ROOT = os.path.join('docs', 'design-lab', 'v2')
OUT = os.path.join(ROOT, 'screenshots', 'triptych')
os.makedirs(OUT, exist_ok=True)
ROWS = [
    ('mission-map', '01-mission-map-v2.webp', 'mission-map-v1-static-1448.jpg'),
    ('source-observatory', '02-source-observatory-v2.webp', 'source-observatory-v1-static-1448.jpg'),
    ('mission-replay', '03-mission-replay-v2.webp', 'mission-replay-v1-react-s1-1448.jpg'),
    ('agent-flight-deck', '04-agent-flight-deck-v2.webp', 'agent-flight-deck-v1-static-1448.jpg'),
]
W, H = 724, 543  # half scale per panel so text stays readable
for name, ref, v1 in ROWS:
    panels = [
        ('V1 (current frontend)', Image.open(os.path.join(ROOT, 'screenshots', 'v1', v1)).convert('RGB')),
        ('V2 render', Image.open(os.path.join(ROOT, 'screenshots', 'v2', f'{name}-en-owner-1448.jpg')).convert('RGB')),
        ('Owner reference', Image.open(os.path.join(ROOT, 'reference', ref)).convert('RGB')),
    ]
    sheet = Image.new('RGB', (W * 3 + 24, H + 26), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    for i, (label, im) in enumerate(panels):
        sheet.paste(im.resize((W, H)), (i * (W + 12), 26))
        d.text((i * (W + 12) + 6, 7), label, fill=(220, 230, 235))
    sheet.save(os.path.join(OUT, f'{name}.jpg'))
    print(os.path.join(OUT, f'{name}.jpg'))
