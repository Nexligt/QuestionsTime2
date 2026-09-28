#!/usr/bin/env python3
"""
Génère les icônes PNG de l'application à partir du style du titre :
« Q2 » en Fraunces (mêmes réglages que le titre), ambre sur le fond de l'app.

Outil de développement uniquement : jamais chargé par l'application.

Prérequis (une fois) :
    pip install fonttools uharfbuzz cairosvg

Utilisation (depuis n'importe quel dossier) :
    python tools/title/generate_icons.py

Fichiers produits dans assets/icons/ :
    icon-192.png, icon-512.png                    (purpose "any")
    icon-maskable-192.png, icon-maskable-512.png  (purpose "maskable")
    apple-touch-icon.png                          (180 px, iPhone)
Après régénération, incrémenter la version du service worker.
"""
from __future__ import annotations

from pathlib import Path

import cairosvg

from generate_title import FRAUNCES, TITLE, outline

HERE = Path(__file__).resolve().parent
ICONS = HERE.parent.parent / "assets" / "icons"

COLOR_BG = "#201931"      # --color-bg
COLOR_ACCENT = "#e2b04a"  # --color-accent
TEXT = "Q2"
AXES = TITLE["word"][1]   # mêmes axes que « QuestionsTime » dans le titre

# (fichier, taille px, forme du fond, part de la largeur occupée par « Q2 »)
#   "rounded" : carré arrondi, coins transparents (icône « any ») ;
#   "full"    : fond plein bord à bord (maskable et Apple : le système découpe).
# Maskable : le contenu reste dans la zone sûre (cercle de 80 % du côté).
ICON_SPECS = [
    ("icon-192.png", 192, "rounded", 0.66),
    ("icon-512.png", 512, "rounded", 0.66),
    ("icon-maskable-192.png", 192, "full", 0.52),
    ("icon-maskable-512.png", 512, "full", 0.52),
    ("apple-touch-icon.png", 180, "full", 0.62),
]


def icon_svg(background: str, fill_ratio: float) -> str:
    """Icône carrée 100 × 100 : fond + « Q2 » centré (encre, pas la boîte)."""
    d, bounds, *_ = outline(FRAUNCES, AXES, TEXT, 1.0, 0, 0)
    x0, y0, x1, y1 = bounds
    w, h = x1 - x0, y1 - y0
    scale = 100 * fill_ratio / w
    tx = 50 - (x0 + w / 2) * scale
    ty = 50 - (y0 + h / 2) * scale
    bg = (
        f'<rect width="100" height="100" rx="22" fill="{COLOR_BG}"/>'
        if background == "rounded"
        else f'<rect width="100" height="100" fill="{COLOR_BG}"/>'
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f'{bg}<path fill="{COLOR_ACCENT}" transform="translate({tx:.3f} {ty:.3f}) scale({scale:.5f})" d="{d}"/>'
        "</svg>"
    )


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    for name, size, background, ratio in ICON_SPECS:
        path = ICONS / name
        cairosvg.svg2png(bytestring=icon_svg(background, ratio).encode(), write_to=str(path),
                         output_width=size, output_height=size)
        print(f"{name}: {size}×{size}, {path.stat().st_size} octets")


if __name__ == "__main__":
    main()
