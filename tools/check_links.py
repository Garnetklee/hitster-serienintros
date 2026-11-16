"""Prüft alle YouTube-Links in songs.csv per oEmbed (404 = weg, 401/403 = Einbetten verboten)."""
import csv, sys, urllib.request, urllib.error, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CSV = Path(__file__).resolve().parent.parent / "songs.csv"


def check(row):
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(row["youtube"])
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return row, r.status
    except urllib.error.HTTPError as e:
        return row, e.code
    except Exception as e:
        return row, str(e)[:40]


rows = list(csv.DictReader(CSV.open(encoding="utf-8-sig"), delimiter=";"))
with ThreadPoolExecutor(8) as ex:
    res = list(ex.map(check, rows))
bad = [(r, s) for r, s in res if s != 200]
for r, s in bad:
    print(f"{r['nr']} {r['serie']}: {s} {r['youtube']}")
print(f"{len(rows) - len(bad)}/{len(rows)} ok")
sys.exit(1 if bad else 0)
