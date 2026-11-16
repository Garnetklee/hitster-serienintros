r"""Einmaliger Import: songs.csv -> app/data/serien.json.

Das Skript ist ein EINMALIGER Import. Danach ist app/data/serien.json die
Quelle der App und wird direkt gepflegt, entkoppelt vom Kartenprojekt
(tools/build_list.py, songs.csv). Deshalb bricht das Skript ab, wenn die
Zieldatei schon existiert. Nur mit --force wird sie überschrieben, und alle
Handänderungen an serien.json gehen dabei verloren.

Aufruf (aus dem Projektverzeichnis):
    .venv\Scripts\python tools\csv_zu_app.py
    .venv\Scripts\python tools\csv_zu_app.py --force

Nur Standardbibliothek. songs.csv: Semikolon, UTF-8 mit BOM.
"""
import argparse
import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
QUELLE = ROOT / "songs.csv"
ZIEL = ROOT / "app" / "data" / "serien.json"


def video_aus_link(url: str) -> tuple[str, int]:
    """Gibt (YouTube-ID, Startsekunde) aus youtu.be- oder watch?v=-Links zurück."""
    u = urlparse(url.strip())
    q = parse_qs(u.query)
    if u.netloc.endswith("youtu.be"):
        vid = u.path.strip("/")
    else:
        vid = (q.get("v") or [""])[0]
    if not re.fullmatch(r"[\w-]{11}", vid):
        raise ValueError(f"Keine YouTube-ID im Link: {url!r}")
    t = (q.get("t") or [""])[0]
    m = re.fullmatch(r"(\d+)s?", t)
    return vid, int(m.group(1)) if m else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true", help="vorhandene serien.json überschreiben")
    args = ap.parse_args()

    if ZIEL.exists() and not args.force:
        print(f"Abbruch: {ZIEL} existiert schon. Der Import ist einmalig, die JSON-Datei wird jetzt direkt gepflegt. "
              "Zum Überschreiben --force angeben.", file=sys.stderr)
        return 1

    songs = []
    with QUELLE.open(encoding="utf-8-sig", newline="") as f:
        for z in csv.DictReader(f, delimiter=";"):
            vid, start = video_aus_link(z["youtube"])
            songs.append({
                "id": z["nr"].strip().zfill(3),
                "nr": int(z["nr"]),
                "serie": z["serie"].strip(),
                "songtitel": z["songtitel"].strip(),
                "jahr": int(z["jahr"]),
                "sender": z["sender"].strip(),
                "interpret": z["interpret"].strip(),
                "komponist": z["komponist"].strip(),
                "kategorie": z["kategorie"].strip(),
                "youtube_id": vid,
                "start_sek": start,
                "embed_ok": True,
                "jahr_quelle": z["jahr_quelle"].strip(),
                "status": z["status"].strip(),
                "notiz": z["notiz"].strip(),
            })

    daten = {
        "generiert": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "anzahl": len(songs),
        "songs": songs,
    }
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    ZIEL.write_text(json.dumps(daten, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(songs)} Einträge nach {ZIEL} geschrieben.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
