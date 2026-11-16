"""Rendert die Vorderseiten von karten.pdf und liest jeden QR-Code zurück (Abgleich mit songs.csv).

--qr-base wie bei make_cards.py übergeben, wenn dort nicht der Standard genutzt wurde.
"""
import argparse, csv, sys
from pathlib import Path
import cv2, numpy as np, pymupdf

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from make_cards import CARD, COLS, ROWS, QR_BASE, card_pos, qr_payload  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--qr-base", default=QR_BASE)
ap.add_argument("--pdf", default=str(ROOT / "karten.pdf"))
args = ap.parse_args()

# Der OpenCV-Decoder scheitert gelegentlich an einzelnen Auflösungen; ein Code gilt als ok,
# sobald er bei einer davon korrekt gelesen wird.
DPIS = (200, 300, 400)
rows = list(csv.DictReader((ROOT / "songs.csv").open(encoding="utf-8-sig"), delimiter=";"))
doc = pymupdf.open(args.pdf)
det = cv2.QRCodeDetector()
w, h = doc[0].rect.width, doc[0].rect.height
found = {}
for dpi in DPIS:
    scale = dpi / 72
    for s in range(0, len(doc), 2):
        pix = doc[s].get_pixmap(dpi=dpi)
        img = np.frombuffer(pix.samples, np.uint8).reshape(pix.h, pix.w, pix.n)[:, :, :3]
        for i in range(COLS * ROWS):
            idx = (s // 2) * COLS * ROWS + i
            if idx >= len(rows) or found.get(idx) == qr_payload(rows[idx], args.qr_base):
                continue
            x, y = card_pos(i, "front", "long", w, h)
            top = h - y - CARD
            crop = img[int(top * scale):int((top + CARD) * scale), int(x * scale):int((x + CARD) * scale)]
            data, *_ = det.detectAndDecode(np.ascontiguousarray(crop))
            if data:
                found[idx] = data
ok = bad = 0
for idx, row in enumerate(rows):
    if found.get(idx) == qr_payload(row, args.qr_base):
        ok += 1
    else:
        bad += 1
        print("FEHLER", row["nr"], row["serie"], repr(found.get(idx, "")))
print(f"{ok} ok, {bad} fehlerhaft")
