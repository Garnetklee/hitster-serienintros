"""Exportiert die Zuordnung Kartennummer -> YouTube-Link in den SongSeeker-Fork (playlists/ktv01.csv).

Enthält bewusst nur nr und url (keine Serientitel), damit die öffentliche Datei
beim Spielen nichts verrät. Nach jeder Änderung an songs.csv neu ausführen und
in songseeker/repo committen und pushen.
"""
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    src = ROOT / "songs.csv"
    out = ROOT / "songseeker" / "repo" / "playlists" / "ktv01.csv"
    with open(src, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["Card#", "URL"])
        for r in rows:
            w.writerow([r["nr"], r["youtube"]])
    print(f"{len(rows)} Einträge -> {out}")


if __name__ == "__main__":
    main()
