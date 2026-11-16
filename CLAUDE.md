# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

Eigene Hitster-Edition „Kinderserien-Intros (DE-TV)“, Set-Kürzel `KTV01`: gedruckte Karten mit QR-Code vorne und Lösung (Serie, Jahr, Song) hinten. Gespielt wird mit einem SongSeeker-Fork, der das YouTube-Intro in einem unsichtbaren Player abspielt. Hintergrund und Designentscheidungen stehen in `KONZEPT.md`.

Das Projekt hat zwei unabhängige Teile:

- **Kartenprojekt** (`tools/`, `songs.csv`, `songseeker/`): gedruckte Karten plus SongSeeker-Fork, siehe unten.
- **Digitale Version** (`app/`, `tests/`): eigenständige PWA „Hitster Serienintros“, die ohne Karten auf einem Gerät gespielt wird, siehe Abschnitt „Digitale Version“.

Der Fork in `songseeker/repo` ist ein eigenes Repo (`origin` = github.com/Garnetklee/songseeker) und im Projekt-Repo per `.gitignore` ausgenommen.

## Befehle

Aus dem Projektverzeichnis ausführen (Windows). Für das Kartenprojekt gibt es keine automatischen Tests; `verify_qr.py` und `check_links.py` sind die Prüfungen. Die digitale Version hat `node --test`.

```
py -m venv .venv
.venv\Scripts\python -m pip install -r tools\requirements.txt

.venv\Scripts\python tools\build_list.py          # build_list.py -> songs.csv
.venv\Scripts\python tools\check_links.py         # YouTube-Links per oEmbed prüfen, Exit 1 bei Fehlern
.venv\Scripts\python tools\make_cards.py          # songs.csv -> karten.pdf
.venv\Scripts\python tools\verify_qr.py           # QR-Codes aus karten.pdf zurücklesen und abgleichen
.venv\Scripts\python tools\export_songseeker.py   # songs.csv -> songseeker/repo/playlists/ktv01.csv
```

Probedruck: `make_cards.py --test --out karten_test.pdf`. Ohne `--out` überschreibt `--test` die vollständige `karten.pdf`. Weitere Druckoptionen (`--flip`, `--back-offset`, `--bleed`) sind im Kopf von `make_cards.py` und in `KONZEPT.md` beschrieben.

## Datenfluss

```
tools/build_list.py (DATA)  ->  songs.csv  ->  make_cards.py       ->  karten.pdf  ->  verify_qr.py
                                           ->  export_songseeker.py ->  playlists/ktv01.csv (im Fork, push = live)
```

- **`DATA` in `tools/build_list.py` ist die Quelle.** `songs.csv` wird komplett überschrieben, Änderungen also in `DATA` machen und neu bauen.
- **Die Kartennummer `nr` wird beim Bauen vergeben**: sortiert nach `(jahr, serie)` und fortlaufend nummeriert. Ein neuer Eintrag oder ein geändertes Jahr verschiebt die Nummern der folgenden Karten. Dann passen bereits gedruckte Karten nicht mehr zur Liste, also vorher klären, ob schon gedruckt wurde. Einen YouTube-Link zu tauschen ändert keine Nummern.
- `songs.csv`: Semikolon, UTF-8 mit BOM (für Excel). `ktv01.csv`: Komma, Kopf `Card#,URL`, nur Nummer und Link.

## Karten und Fork hängen über die QR-URL zusammen

- Der QR-Code enthält `https://garnetklee.github.io/songseeker/?c=ktv01-<nr>` (`QR_BASE` in `make_cards.py`). Der Fork löst das über `playlists/<set>.csv` auf.
- **Diese URL ist auf den Karten gedruckt.** `QR_BASE`, GitHub-Name und Repo-Name dürfen sich nicht ändern.
- **Keine Spoiler:** Der QR-Code enthält deshalb nur die Kartennummer, und `ktv01.csv` ist öffentlich und enthält bewusst keine Titel. Die App zeigt bei eigenen Karten weder Titel noch Video-ID oder Dauer, auch nicht in Fehlermeldungen (nur die Kartennummer).
- Ein totes Video wird repariert, indem der Link in `DATA` getauscht, neu gebaut, exportiert und der Fork gepusht wird. Die Karte selbst bleibt gültig.

## SongSeeker-Fork (`songseeker/repo`)

Statische App ohne Build-Schritt (`index.html`, `app.js`, `style.css`), veröffentlicht über GitHub Pages ca. 1 Minute nach dem Push. Kein Service Worker; die CSV wird mit `cache: "no-cache"` geladen. Bei Änderungen an `app.js` die Versionsnummer in `index.html` (`app.js?version=…`) hochzählen. Die Kamera braucht HTTPS. Offizielle Hitster-Karten funktionieren auf GitHub Pages nicht, weil ihre Playlists nicht im Repo liegen.

## Inhaltliche Regeln

- `jahr` ist das Jahr der **deutschen Erstausstrahlung**, nicht das des Originals (Pokémon: 1999, nicht 1997).
- `jahr_quelle`: W = Wikipedia-Infobox, F = fernsehserien.de plus zweite Quelle, A = bewusst festgelegte Annahme, K = unbelegt. K ergibt `status = prüfen`, alles andere `ok`.
- Das Video muss das Einbetten erlauben, sonst spielt SongSeeker es nicht ab (`check_links.py` meldet das als 401/403).
- Zeitraum: Kern 2000–2015; ältere Klassiker höchstens ca. 20 % der Karten.
- Startzeiten werden als `?t=<sekunden>` an den YouTube-Link gehängt.

## Digitale Version (`app/`)

Statische PWA aus HTML und ES-Modulen ohne Build, Backend und npm-Abhängigkeiten. Vorlage war die ESC-Edition (`..\Hitster ESC`), übernommen wurden nur das Hitster-Spiel, Handicaps und die Statistik. Es gibt keine Tokens, keine Zusatzregeln und keine weiteren Spielmodi.

```
.venv\Scripts\python -m http.server 8766 -d app   # lokal starten (Preview-Name: ktv-app)
node --test                                       # alle Tests
```

- **`app/data/serien.json` ist die Quelle der App**, nicht `songs.csv`. Die Liste wurde einmalig mit `tools/csv_zu_app.py` übernommen und wird seitdem direkt im JSON gepflegt. Das Skript bricht ab, wenn die Datei existiert; `--force` überschreibt alle Änderungen im JSON. Ein getauschter Link im Kartenprojekt kommt also nicht von selbst in die App und umgekehrt.
- **Spoiler:** `nr`/`id` sind nach Jahr sortiert. Vor der Auflösung dürfen weder Nummer noch Serie, Titel, Sender, Kategorie oder Video-ID sichtbar sein, auch nicht in Fehlermeldungen, `title`-Attributen oder als Seed der Ringe auf der verdeckten Karte. Ein Test prüft das Markup der verdeckten Karte.
- **Design = die gedruckten Karten:** verdeckte Karte wie `draw_front` (schwarz, Neon-Ringe, Play-Knopf an der Stelle des QR-Codes), aufgedeckte Karte wie `draw_back` (Farbe `nr % 8` aus `BACK_COLORS`). Das Kartenmarkup kommt ausschließlich aus `app/js/karten.js`. Keine externen Schriften oder CDNs.
- **Gleiches Origin wie die ESC-App** (garnetklee.github.io): alle `localStorage`-Schlüssel und der Cache-Name tragen das Präfix `ktv_` bzw. `ktv-hitster-`. Nie `esc_`-Schlüssel verwenden.
- Architektur wie in der Vorlage: ein serialisierbares `state` in `app/js/app.js` (UI und Ablauf), reine Logik ohne DOM in `data.js` und `settings.js` (dort auch `SETTINGS_VERSION` und die Migrationen), `player.js` kapselt den verdeckten YouTube-Player. `window.KTV` steuert das Spiel im Browser (`state`, `setGap`, `reveal`, `next`), `?dev=1` spielt auch Einträge ohne Video.
- **Bei Änderungen an App-Dateien `VERSION` in `app/sw.js` erhöhen** und neue Dateien in `SHELL` eintragen. Das JSON kommt network-first und braucht keine neue Version.
- Geänderte Spielstand- oder Einstellungsfelder: `SETTINGS_VERSION` erhöhen, Migration ergänzen, Test schreiben.
- Deployment: `.github/workflows/pages.yml` veröffentlicht `app/` bei jedem Push auf `main`. Das Repo ist öffentlich und enthält die Lösungen.

## Veraltete Dokumente

`songseeker/PROMPT_VM_SESSION.md` ist der ursprüngliche Auftrag für den Fork. Das dort genannte Format `?c=042` und die Spalten `nr,url` gelten nicht mehr; maßgeblich sind der Code und die README des Forks.
