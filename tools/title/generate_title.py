#!/usr/bin/env python3
"""
Génère le titre « QuestionsTime2 » en SVG, lettres converties en tracés
(aucune police à charger dans l'application).

Outil de développement uniquement : jamais chargé par l'application
(dossier tools/, absent de index.html et du service worker).

Prérequis (une fois) :
    pip install fonttools uharfbuzz

Police : Fraunces (licence SIL Open Font License 1.1, fonts/OFL.txt)
    https://github.com/google/fonts/tree/main/ofl/fraunces

Utilisation (depuis n'importe quel dossier) :
    python tools/title/generate_title.py     # -> assets/img_Titre.svg

Réglages dans TITLE (variante A retenue au lot 4) : axes de la police,
taille et place du « 2 », couleurs. Après régénération, incrémenter la
version du service worker. Les couleurs reprennent les jetons de themes.css :
--color-text #f4efe9 et --color-accent #e2b04a.
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = Path(__file__).resolve().parent
FONTS = HERE / "fonts"
OUTPUT = HERE.parent.parent / "assets" / "img_Titre.svg"

COLOR_TEXT = "#f4efe9"    # --color-text
COLOR_ACCENT = "#e2b04a"  # --color-accent
EM = 100.0                # 1 em = 100 unités SVG (coordonnées arrondies à 0,1)

FRAUNCES = "Fraunces[SOFT,WONK,opsz,wght].ttf"

# --------------------------------------------------------------------------
# Titre retenu (variante A)
#   word / two : police + axes variables
#   two_scale  : taille du « 2 » par rapport au mot
#   two_align  : "center" (centré sous le mot) ou "time" (à droite sous « Time »)
#   gap        : écart vertical entre le bas du mot et le haut du « 2 » (em)
#   word_fill / two_fill : couleur unie ou ("gradient", haut, bas)
# --------------------------------------------------------------------------
TITLE = dict(
    word=(FRAUNCES, {"wght": 700, "opsz": 72, "SOFT": 50, "WONK": 0}),
    two=(FRAUNCES, {"wght": 800, "opsz": 72, "SOFT": 50, "WONK": 0}),
    two_scale=1.2, two_align="center", gap=0.08,
    word_fill=COLOR_TEXT, two_fill=COLOR_ACCENT,
)

_font_cache: dict = {}


def load(file: str, axes: dict):
    """Instancie la police variable aux axes donnés (TTFont statique + blob)."""
    key = (file, tuple(sorted(axes.items())))
    if key not in _font_cache:
        font = TTFont(FONTS / file)
        static = instantiateVariableFont(font, axes)
        buf = io.BytesIO()
        static.save(buf)
        _font_cache[key] = (TTFont(io.BytesIO(buf.getvalue())), buf.getvalue())
    return _font_cache[key]


def shape(file: str, axes: dict, text: str):
    """Mise en forme HarfBuzz (crénage, ligatures) -> [(glyphe, x, y)], avance totale."""
    font, blob = load(file, axes)
    hb_font = hb.Font(hb.Face(blob))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, {"kern": True, "liga": True, "lnum": True})  # chiffres alignés
    order = font.getGlyphOrder()
    x = 0
    glyphs = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        glyphs.append((order[info.codepoint], x + pos.x_offset, pos.y_offset))
        x += pos.x_advance
    return font, glyphs, x


def outline(file, axes, text, scale, dx, baseline):
    """Tracé SVG (une seule <path>) + boîte englobante, à l'échelle `scale`."""
    font, glyphs, _ = shape(file, axes, text)
    upm = font["head"].unitsPerEm
    s = EM / upm * scale
    gs = font.getGlyphSet()
    svg = SVGPathPen(gs, ntos=lambda v: f"{round(v, 1):g}")
    bounds = BoundsPen(gs)
    for name, gx, gy in glyphs:
        # y inversé (SVG vers le bas), origine = ligne de base
        t = (s, 0, 0, -s, dx + gx * s, baseline - gy * s)
        gs[name].draw(TransformPen(svg, t))
        gs[name].draw(TransformPen(bounds, t))
    return svg.getCommands(), bounds.bounds, glyphs, s, gs


def ink_right_of(glyphs, s, gs, dx, upto_index):
    """Bord droit de l'encre du glyphe `upto_index` (fin de « Time »)."""
    name, gx, _ = glyphs[upto_index]
    b = BoundsPen(gs)
    gs[name].draw(b)
    return dx + (gx + b.bounds[2]) * s


def fill_attr(fill, gid, defs):
    if isinstance(fill, tuple):
        _, top, bottom = fill
        defs.append(
            f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/>'
            f"</linearGradient>"
        )
        return f"url(#{gid})"
    return fill


def build(v: dict) -> str:
    wfile, waxes = v["word"]
    tfile, taxes = v["two"]
    word_d, wb, wglyphs, ws, wgs = outline(wfile, waxes, "QuestionsTime", 1.0, 0, 0)
    # « 2 » : d'abord mesuré à l'origine, puis placé.
    _, tb, _, _, _ = outline(tfile, taxes, "2", v["two_scale"], 0, 0)
    two_w = tb[2] - tb[0]
    if v["two_align"] == "center":
        x2 = (wb[0] + wb[2]) / 2 - two_w / 2 - tb[0]
    else:  # aligné à droite sous la fin de « Time » (encre du « e »)
        right = ink_right_of(wglyphs, ws, wgs, 0, len(wglyphs) - 1)
        x2 = right - two_w - tb[0]
    y2 = wb[3] + v["gap"] * EM - tb[1]  # haut du « 2 » sous le bas du mot
    two_d, tb2, _, _, _ = outline(tfile, taxes, "2", v["two_scale"], x2, y2)

    pad = 1.0
    x0 = min(wb[0], tb2[0]) - pad
    y0 = min(wb[1], tb2[1]) - pad
    x1 = max(wb[2], tb2[2]) + pad
    y1 = max(wb[3], tb2[3]) + pad
    w, h = x1 - x0, y1 - y0

    defs: list[str] = []
    wf = fill_attr(v["word_fill"], "g1", defs)
    tf = fill_attr(v["two_fill"], "g2", defs)
    defs_xml = f"<defs>{''.join(defs)}</defs>" if defs else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" '
        f'width="{w:.0f}" height="{h:.0f}" role="img" aria-labelledby="t">'
        f'<title id="t">QuestionsTime2</title>{defs_xml}'
        f'<path fill="{wf}" d="{word_d}"/>'
        f'<path fill="{tf}" d="{two_d}"/>'
        f"</svg>\n"
    )


def main():
    svg = build(TITLE)
    OUTPUT.write_text(svg, encoding="utf-8")
    print(f"{OUTPUT.name}: {len(svg.encode())} octets")


if __name__ == "__main__":
    main()
