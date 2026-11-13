#!/usr/bin/env python3
"""Gera os ícones do PWA em icons/ (requer Pillow: pip install pillow).

Uso: python3 tools/make-icons.py
"""
import math
import os
from PIL import Image, ImageDraw

BG = (139, 69, 19)        # --color-accent
FG = (253, 248, 240)      # --color-bg
SS = 4                    # supersampling (antialias)
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')


def artwork(size, rounded):
    """Livro aberto com ondas sonoras. Desenhado em 512 e escalado."""
    s = 512 * SS
    k = SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(96 * k), fill=BG)
    else:
        d.rectangle([0, 0, s, s], fill=BG)

    # livro: duas páginas
    left = [(250, 262), (112, 232), (112, 382), (250, 412)]
    right = [(262, 262), (400, 232), (400, 382), (262, 412)]
    for poly in (left, right):
        d.polygon([(x * k, y * k) for x, y in poly], fill=FG)

    # ondas sonoras nas laterais de um ponto central: (( • ))
    cx, cy = 256, 160
    d.ellipse([(cx - 20) * k, (cy - 20) * k, (cx + 20) * k, (cy + 20) * k], fill=FG)
    for r in (48, 86, 124):
        box = [(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k]
        for lo, hi in ((-30, 30), (150, 210)):
            d.arc(box, start=lo, end=hi, fill=FG, width=22 * k)
            for ang in (lo, hi):
                px = cx + (r - 11) * math.cos(math.radians(ang))
                py = cy + (r - 11) * math.sin(math.radians(ang))
                d.ellipse([(px - 11) * k, (py - 11) * k, (px + 11) * k, (py + 11) * k], fill=FG)

    return img.resize((size, size), Image.LANCZOS)


def save(name, size, rounded):
    artwork(size, rounded).save(os.path.join(OUT, name))
    print('gerado', name)


os.makedirs(OUT, exist_ok=True)
save('icon-192.png', 192, True)
save('icon-512.png', 512, True)
save('icon-maskable-512.png', 512, False)   # sem cantos: o Android recorta
save('apple-touch-icon.png', 180, False)    # iOS aplica os cantos
save('favicon-32.png', 32, True)
