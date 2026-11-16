# Hitster – Eigene Edition „Kinderserien-Intros (DE-TV)“

## 1. Gibt es das schon offiziell?

Nein. Am nächsten dran ist **Hitster „Movies & TV Soundtracks“** (Jumbo, 154 Karten). Das ist aber international ausgerichtet
(Filmmusik, US-Serien) und hat keinen Schwerpunkt auf deutsche Kinderserien. Eine „Hitster Kids/Junior“-Edition mit
Titelliedern gibt es nicht. Die Nische ist also frei.

## 2. Spotify oder YouTube (Music)?

| Kriterium | Spotify | YouTube / YT Music |
|---|---|---|
| Deutsche Intros (Anime-Openings von RTL2, Disney/Nick-Synchros, KiKA) | lückenhaft, oft nur Cover/Karaoke-Versionen | fast alles da, meist das Original-TV-Intro |
| Offizielle Hitster-App liest eigene Karten | nein | nein |
| Blind abspielen (Titel verstecken) | nur mit Eigenbau-App + Premium/API | **SongSeeker** (Open Source) kann das schon |
| Startpunkt setzen (`?t=12`) | nein | ja |
| Risiko: Link stirbt | gering | mittel (Videos werden gelöscht/gesperrt) |
| Kosten | Premium nötig für Vollwiedergabe | kostenlos (Werbung möglich) |

**Empfehlung: YouTube.** Deine Vermutung stimmt: Für TV-Intros ist YouTube klar besser abgedeckt. YT-Music-Links sind
dieselben Video-IDs, das macht also keinen Unterschied. YouTube reicht.

## 3. Das wichtigste Problem: Spoiler beim Scannen

Wenn der QR-Code direkt `https://youtu.be/...` enthält und man ihn mit der normalen Handykamera scannt, öffnet sich
YouTube **mit Titel und Thumbnail**, und das Raten ist vorbei. Deshalb braucht man eine Scanner-App, die nur den Ton abspielt:

- **SongSeeker** (Web-App, github.com/andygruber/songseeker): scannt QR-Codes, akzeptiert direkte
  `youtube.com` / `youtu.be` / `music.youtube.com`-Links inkl. Startzeit und spielt sie über einen **0×0-Player** ab.
  Man sieht nichts. Läuft im Browser, muss aber über HTTPS gehostet werden (z. B. kostenlos auf GitHub Pages).
- **Tubester** (Android, F-Droid): Alternative, ist aber an den offiziellen Hitster-Datensatz gebunden und eher nicht
  für eigene Karten gedacht.

## 4. Empfohlene Architektur

```
Karte (Vorderseite: QR)  ──scan──►  SongSeeker (eigener Fork auf GitHub Pages)
                                         │
                       QR enthält:  https://<du>.github.io/songseeker/?c=042
                                         │
                                         ▼
                              playlists/kinderserien.csv
                              042 → youtu.be/XXXX?t=8
                                         │
                                         ▼
                                YouTube-Player (unsichtbar)
Karte (Rückseite): Jahr groß, Serie, Titel des Songs, Sender
```

**Warum eine eigene ID statt des YouTube-Links im QR?** Videos verschwinden. Mit der ID-Lösung tauscht man nur eine
Zeile in der CSV aus, und die gedruckte Karte funktioniert weiter. Mit dem direkten Link müsste man die Karte neu drucken.

- **Variante A (schnell):** Direkter YouTube-Link im QR und originales SongSeeker. Damit kann man in ca. 1 Abend spielen.
- **Variante B (robust, empfohlen):** SongSeeker forken, ein Lookup `?c=<id>` → eigene CSV ergänzen (wenige Zeilen JS,
  analog zur vorhandenen Hitster-CSV-Logik).

## 5. Welches Jahr kommt auf die Karte?

Das muss man festlegen, sonst gibt es Streit am Tisch. Vorschlag: **Jahr der deutschen Erstausstrahlung.** Das passt zum
Thema „lief im deutschen Fernsehen“. Pokémon war in Japan 1997 und in Deutschland 1999. Für die Spieler zählt das Jahr, in dem sie es gesehen haben.
Quelle zum Nachprüfen: fernsehserien.de (dort ist die deutsche Erstausstrahlung je Serie angegeben).

Zeitraum: Kern 2000–2015. Ältere „Klassiker“ (Biene Maja, Wickie, Pumuckl, Sendung mit der Maus …) als Anker bringen
Spannung, weil sie weit auseinanderliegen. Sie sollten aber höchstens ca. 20 % der Karten ausmachen, sonst wird es zu leicht.

## 6. Kartendesign (angelehnt ans Original)

Vorlage: offizielle Karte DEX01 / 13 (Bowie, „Ashes To Ashes“, 1980). Maß: ca. 6,5 × 6,5 cm, quadratisch.

**Vorderseite (QR-Seite)**
- schwarzer Hintergrund
- konzentrische, unterbrochene Neon-Kreisbögen (pink, cyan, gelb, lila, orange) um die Mitte
- QR-Code mittig, weiß auf schwarz (invertiert, quiet zone schwarz → vorher Scanbarkeit testen!)
- unten links klein grau: Set-Kürzel (z. B. `KTV01`), unten rechts: Kartennummer

**Rückseite (Lösungsseite)**
- vollflächige Farbe (Original: Farbe je Karte unterschiedlich, z. B. rot/pink; wir: Farbe nach Jahrzehnt oder zufällig aus fester Palette)
- oben links kleines Icon (Original: Radio → bei uns z. B. Fernseher 📺)
- oben mittig: **Serientitel** (Original: Interpret), fett, mittelgroß
- Mitte: **Jahr** sehr groß, extra fett, schwarz
- unten mittig, kursiv: **Songtitel** und darunter klein Interpret/Komponist
- unten links Set-Kürzel, unten rechts Kartennummer (weiß, klein)

Der SongSeeker-Card-Generator nimmt CSV (`Title, Artist, Year, URL, backcol`) und hat ein schlichteres Layout. Für das Original-Look
bauen wir besser einen eigenen kleinen Python-Generator (reportlab + qrcode), der dieses Layout exakt nachbaut und Vorder-
/Rückseite für Duplexdruck spiegelt.

### Generator & Druck

```
py -m venv .venv
.venv\Scripts\python -m pip install -r tools\requirements.txt
.venv\Scripts\python tools\make_cards.py          # -> karten.pdf (alle Karten)
.venv\Scripts\python tools\make_cards.py --test   # nur 1. Bogen zum Probedruck
.venv\Scripts\python tools\verify_qr.py           # liest alle QR-Codes aus dem PDF zurück
```

- 12 Karten (6,5 × 6,5 cm) pro A4-Bogen, Seiten im Wechsel: Vorderseiten, dann Rückseiten desselben Bogens.
- Rückseiten sind gespiegelt angeordnet → beim **Duplexdruck „lange Kante“** liegt jede Lösung genau hinter ihrem QR-Code.
  Druckt der Drucker an der kurzen Kante: `--flip short`.
- **Im Druckdialog „Tatsächliche Größe / 100 %“ wählen**, nicht „An Seite anpassen“, sonst stimmen Maße und Deckung nicht.
- Erst `--test` drucken, gegen das Licht halten oder an den Schnittmarken prüfen. Ist die Rückseite versetzt:
  `--back-offset X Y` (mm, z. B. `--back-offset 0.8 -0.5`). Gegen weiße Blitzer beim Schneiden: `--bleed 1`.
- Papier: ab ca. 250 g/m² wirkt es kartenähnlich. Schneiden mit Rollschneider entlang der Schnittmarken.
- Eigene Schrift (z. B. Titillium Web wie im Original): `Regular.ttf`, `Bold.ttf`, `Italic.ttf` nach `tools/fonts/` legen.
- QR-Inhalt: `https://garnetklee.github.io/songseeker/?c=ktv01-<nr>` (Variante B, `QR_BASE` in make_cards.py).
  Mit `--qr-base ""` stattdessen der direkte YouTube-Link (Variante A, originaler SongSeeker).

## 7. Ablauf / nächste Schritte

1. ✅ **Liste:** `songs.csv` (147 Einträge, Semikolon-CSV, öffnet direkt in Excel). Erzeugt aus `tools/build_list.py`;
   Änderungen dort machen und neu bauen. Jahr = deutsche Erstausstrahlung; `jahr_quelle` W = Wikipedia-Infobox,
   F = fernsehserien.de + zweite Quelle (Wikipedia, moviepilot, Presse), K = nicht belegbar. Offen (`status = prüfen`):
   nur noch Johnny Bravo und Code Lyoko, für beide war kein deutsches Startdatum zu finden.
2. ✅ **YouTube-Links:** zu jeder Serie gesucht und mit `tools/check_links.py` auf Verfügbarkeit und Einbettbarkeit geprüft
   (Einbetten muss erlaubt sein, sonst spielt SongSeeker nicht). Noch offen: reinhören, ob es wirklich die deutsche TV-Fassung
   ist, und ggf. Startzeit setzen.
3. ✅ **Generator bauen:** Python-Skript (CSV → PDF mit `qrcode` + `reportlab`), Vorder- und Rückseite für den Duplex-Druck
   gespiegelt, Kartengröße wie das Original (ca. 6,5 × 6,5 cm), 12 Karten pro A4-Seite.
4. ✅ **SongSeeker hosten:** Fork https://github.com/Garnetklee/songseeker (lokal: `songseeker/repo`), live auf
   https://garnetklee.github.io/songseeker/ (Variante B). Liste aktualisieren: `songs.csv` ändern →
   `tools/export_songseeker.py` → in `songseeker/repo` committen und pushen (nach ca. 1 min online).
   GitHub-Name und Repo-Name nie mehr ändern, sonst funktionieren die gedruckten Karten nicht mehr.
5. **Testdruck** und eine Proberunde, Linkcheck-Skript ab und zu laufen lassen (findet tote Videos).

Ich kann Schritt 2–4 übernehmen: Links recherchieren, den PDF-Generator schreiben und den SongSeeker-Fork mit ID-Lookup
vorbereiten.
