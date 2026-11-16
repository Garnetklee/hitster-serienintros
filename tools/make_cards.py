"""Erzeugt druckfertige Hitster-Karten (PDF) aus songs.csv.

Seitenfolge: Vorderseiten (QR) Blatt 1, Rückseiten (Lösung) Blatt 1, Vorderseiten Blatt 2, ...
Die Rückseiten sind gespiegelt angeordnet, sodass beim beidseitigen Druck jede Lösung genau
hinter ihrem QR-Code landet.

Beispiele:
    python tools/make_cards.py                         # alle Karten -> karten.pdf
    python tools/make_cards.py --test                  # nur 1. Bogen (Probedruck)
    python tools/make_cards.py --flip short            # Drucker wendet an der kurzen Kante
    python tools/make_cards.py --back-offset 0.5 -0.3  # Rückseite um x/y mm verschieben (Kalibrierung)
    python tools/make_cards.py --qr-base ""   # YouTube-Link direkt in den QR statt Kartennummer
"""
import argparse
import csv
import math
import random
import textwrap
from pathlib import Path

import qrcode
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent

CARD = 65 * mm
COLS, ROWS = 3, 4
SET_CODE = "KTV01"
# SongSeeker-Fork (github.com/Garnetklee/songseeker) löst ?c=ktv01-042 über playlists/ktv01.csv auf.
# Steht gedruckt auf den Karten: nicht mehr ändern.
QR_BASE = "https://garnetklee.github.io/songseeker/?c=ktv01-"

NEON = ["#FF2D6F", "#16B7F2", "#FFE01B", "#B03AD6", "#FF5A1F"]
BACK_COLORS = ["#F0405A", "#FFD23F", "#3EC1F3", "#FF8C42", "#B76CE0", "#5ED17A", "#FF6FB5", "#2FD3C6"]


# ---------------------------------------------------------------- Schriften
def register_fonts():
    """Eigene TTFs in tools/fonts (Regular/Bold/Italic) haben Vorrang, sonst Segoe UI, sonst Helvetica."""
    candidates = [
        (ROOT / "tools/fonts/Regular.ttf", ROOT / "tools/fonts/Bold.ttf", ROOT / "tools/fonts/Italic.ttf"),
        (Path("C:/Windows/Fonts/segoeui.ttf"), Path("C:/Windows/Fonts/segoeuib.ttf"), Path("C:/Windows/Fonts/segoeuii.ttf")),
    ]
    for reg, bold, ital in candidates:
        if reg.exists() and bold.exists() and ital.exists():
            pdfmetrics.registerFont(TTFont("F", str(reg)))
            pdfmetrics.registerFont(TTFont("F-Bold", str(bold)))
            pdfmetrics.registerFont(TTFont("F-Italic", str(ital)))
            return "F", "F-Bold", "F-Italic"
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


FONT, FONT_BOLD, FONT_ITALIC = register_fonts()


# ---------------------------------------------------------------- Layout
def grid_origin(page_w, page_h):
    return (page_w - COLS * CARD) / 2, (page_h - ROWS * CARD) / 2


def card_pos(i, side, flip, page_w, page_h, offset=(0, 0)):
    """Linke untere Ecke von Karte i (0..11) auf dem Bogen. Rückseiten werden gespiegelt."""
    col, row = i % COLS, i // COLS
    if side == "back":
        if flip == "long":
            col = COLS - 1 - col
        else:
            row = ROWS - 1 - row
    x0, y0 = grid_origin(page_w, page_h)
    x = x0 + col * CARD + offset[0] * mm
    y = page_h - y0 - (row + 1) * CARD + offset[1] * mm
    return x, y


def crop_marks(c, page_w, page_h, offset=(0, 0)):
    """Schnittmarken außerhalb des Kartenrasters (auf beiden Seiten deckungsgleich)."""
    x0, y0 = grid_origin(page_w, page_h)
    x0 += offset[0] * mm
    y0 += offset[1] * mm
    c.setStrokeColor(HexColor("#888888"))
    c.setLineWidth(0.3)
    gap, length = 1.5 * mm, 5 * mm
    for k in range(COLS + 1):
        x = x0 + k * CARD
        c.line(x, y0 - gap, x, y0 - gap - length)
        c.line(x, page_h - y0 + gap, x, page_h - y0 + gap + length)
    for k in range(ROWS + 1):
        y = y0 + k * CARD
        c.line(x0 - gap, y, x0 - gap - length, y)
        c.line(page_w - x0 + gap, y, page_w - x0 + gap + length, y)


# ---------------------------------------------------------------- Vorderseite
def draw_front(c, x, y, row, qr_data, bleed):
    c.saveState()
    c.setFillColor(black)
    c.rect(x - bleed, y - bleed, CARD + 2 * bleed, CARD + 2 * bleed, stroke=0, fill=1)

    # Neon-Ringe: unterbrochene Kreisbögen, pro Karte leicht anders (Seed = Kartennummer)
    rnd = random.Random(row["nr"])
    cx, cy = x + CARD / 2, y + CARD / 2
    c.setLineCap(1)
    radii = [13.5, 16, 18.3, 20.6, 22.9, 25.2, 27.5, 29.8]
    for k, r in enumerate(radii):
        r *= mm
        c.setStrokeColor(HexColor(NEON[(k + rnd.randint(0, 4)) % len(NEON)]))
        c.setLineWidth(0.9 if k % 2 else 0.7)
        start = rnd.uniform(0, 360)
        segments = rnd.choice([1, 2, 2, 3])
        for s in range(segments):
            extent = rnd.uniform(70, 300 / segments)
            c.arc(cx - r, cy - r, cx + r, cy + r, start, extent)
            start += extent + rnd.uniform(15, 60)

    # QR-Code: schwarze Module auf weißer Fläche (zuverlässig scanbar)
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
    qr.add_data(qr_data)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    n = len(matrix)
    size = 22 * mm
    quiet = 1.8 * mm
    qx, qy = cx - size / 2, cy - size / 2
    c.setFillColor(white)
    c.roundRect(qx - quiet, qy - quiet, size + 2 * quiet, size + 2 * quiet, 1.2 * mm, stroke=0, fill=1)
    m = size / n
    c.setFillColor(black)
    for r_i, line in enumerate(matrix):
        for c_i, on in enumerate(line):
            if on:
                c.rect(qx + c_i * m, qy + size - (r_i + 1) * m, m + 0.05, m + 0.05, stroke=0, fill=1)

    # Ecken
    c.setFillColor(HexColor("#5A5A5A"))
    c.setFont(FONT, 5.5)
    c.drawString(x + 4 * mm, y + 3.5 * mm, SET_CODE)
    c.drawRightString(x + CARD - 4 * mm, y + 3.5 * mm, str(int(row["nr"])))
    c.restoreState()


# ---------------------------------------------------------------- Rückseite
def fit_lines(text, font, max_size, min_size, max_width, max_lines):
    """Größte Schriftgröße, bei der text in max_lines Zeilen passt."""
    size = max_size
    while size >= min_size:
        avg = pdfmetrics.stringWidth("abcdefghijklmnopqrstuvwxyz", font, size) / 26
        width_chars = max(8, int(max_width / avg))
        lines = textwrap.wrap(text, width_chars) or [""]
        if len(lines) <= max_lines and all(pdfmetrics.stringWidth(l, font, size) <= max_width for l in lines):
            return size, lines
        size -= 0.5
    lines = textwrap.wrap(text, int(max_width / (min_size * 0.5)))[:max_lines]
    return min_size, lines


def draw_tv_icon(c, x, y, s):
    """Kleines Fernseher-Icon (statt Radio im Original), weiß halbtransparent."""
    c.saveState()
    c.setStrokeColor(white)
    c.setStrokeAlpha(0.8)
    c.setLineWidth(0.6)
    c.roundRect(x, y, s, s * 0.7, s * 0.12, stroke=1, fill=0)
    c.roundRect(x + s * 0.1, y + s * 0.1, s * 0.62, s * 0.5, s * 0.08, stroke=1, fill=0)
    c.circle(x + s * 0.86, y + s * 0.45, s * 0.05, stroke=1, fill=0)
    c.circle(x + s * 0.86, y + s * 0.25, s * 0.05, stroke=1, fill=0)
    c.line(x + s * 0.35, y + s * 0.7, x + s * 0.2, y + s * 0.95)
    c.line(x + s * 0.45, y + s * 0.7, x + s * 0.62, y + s * 0.95)
    c.restoreState()


def draw_back(c, x, y, row, bleed):
    c.saveState()
    color = BACK_COLORS[int(row["nr"]) % len(BACK_COLORS)]
    c.setFillColor(HexColor(color))
    c.rect(x - bleed, y - bleed, CARD + 2 * bleed, CARD + 2 * bleed, stroke=0, fill=1)

    # leichter Glanz in der Mitte wie beim Original
    c.setFillColor(white)
    c.setFillAlpha(0.12)
    c.circle(x + CARD / 2, y + CARD / 2, CARD * 0.38, stroke=0, fill=1)
    c.setFillAlpha(1)

    draw_tv_icon(c, x + 4 * mm, y + CARD - 9.5 * mm, 5.5 * mm)

    cx = x + CARD / 2
    inner = CARD - 12 * mm
    ink = HexColor("#111111")

    # Serie oben
    size, lines = fit_lines(row["serie"], FONT_BOLD, 10.5, 6.5, inner - 8 * mm, 2)
    c.setFillColor(ink)
    c.setFont(FONT_BOLD, size)
    top = y + CARD - 13 * mm
    for k, line in enumerate(lines):
        c.drawCentredString(cx, top - k * size * 1.15, line)

    # Jahr groß
    c.setFont(FONT_BOLD, 40)
    c.drawCentredString(cx, y + CARD / 2 - 6.5 * mm, str(row["jahr"]))

    # Songtitel kursiv + Interpret/Komponist klein
    who = row["interpret"] or row["komponist"]
    size, lines = fit_lines(row["songtitel"], FONT_ITALIC, 9.5, 6, inner, 2)
    base = y + (13.5 if who else 11) * mm
    c.setFont(FONT_ITALIC, size)
    for k, line in enumerate(reversed(lines)):
        c.drawCentredString(cx, base + k * size * 1.15, line)
    if who:
        wsize, wlines = fit_lines(who, FONT, 6.5, 5, inner, 1)
        c.setFont(FONT, wsize)
        c.drawCentredString(cx, y + 9.5 * mm, wlines[0])

    # Ecken
    c.setFillColor(white)
    c.setFont(FONT_BOLD, 5.5)
    c.drawString(x + 4 * mm, y + 3.5 * mm, SET_CODE)
    c.drawRightString(x + CARD - 4 * mm, y + 3.5 * mm, str(int(row["nr"])))
    c.restoreState()


# ---------------------------------------------------------------- Main
def qr_payload(row, qr_base):
    if qr_base:
        return f"{qr_base}{row['nr']}"
    return row["youtube"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", default=ROOT / "songs.csv", type=Path)
    ap.add_argument("--out", default=ROOT / "karten.pdf", type=Path)
    ap.add_argument("--flip", choices=["long", "short"], default="long",
                    help="Wendekante des Duplexdrucks (Standard: lange Kante)")
    ap.add_argument("--back-offset", nargs=2, type=float, default=[0, 0], metavar=("X_MM", "Y_MM"),
                    help="Rückseite verschieben, falls der Drucker versetzt druckt")
    ap.add_argument("--bleed", type=float, default=0.0,
                    help="Farbe über den Kartenrand hinaus (mm), verzeiht ungenaues Schneiden; Standard 0")
    ap.add_argument("--qr-base", default=QR_BASE, help="QR-Inhalt <qr-base><nr>; leer = YouTube-Link direkt")
    ap.add_argument("--only-ok", action="store_true", help="nur Einträge mit status=ok")
    ap.add_argument("--test", action="store_true", help="nur den ersten Bogen erzeugen")
    args = ap.parse_args()

    rows = list(csv.DictReader(args.csv.open(encoding="utf-8-sig"), delimiter=";"))
    if args.only_ok:
        rows = [r for r in rows if r["status"] == "ok"]
    per_sheet = COLS * ROWS
    if args.test:
        rows = rows[:per_sheet]

    page_w, page_h = A4
    bleed = args.bleed * mm
    c = canvas.Canvas(str(args.out), pagesize=A4)
    c.setTitle("Hitster – Kinderserien-Intros")
    sheets = math.ceil(len(rows) / per_sheet)
    for s in range(sheets):
        chunk = rows[s * per_sheet:(s + 1) * per_sheet]
        for i, row in enumerate(chunk):
            draw_front(c, *card_pos(i, "front", args.flip, page_w, page_h), row, qr_payload(row, args.qr_base), bleed)
        crop_marks(c, page_w, page_h)
        c.showPage()
        off = tuple(args.back_offset)
        for i, row in enumerate(chunk):
            draw_back(c, *card_pos(i, "back", args.flip, page_w, page_h, off), row, bleed)
        crop_marks(c, page_w, page_h, off)
        c.showPage()
    c.save()
    print(f"{len(rows)} Karten auf {sheets} Bögen ({sheets * 2} Seiten) -> {args.out}")


if __name__ == "__main__":
    main()
