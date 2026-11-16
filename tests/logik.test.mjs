// Spiellogik mit den echten Intros. Start im Projektordner: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalize, filterPool, kategorien, hasVideo, quickRange, playerFilter, filterLabel, handicapLabel, fitsGap, sortedIndex,
  canStillCatchUp, rankPlayers, podiumHeight, volumeLocked, canSkip, FREE_SKIPS, giveBackSongs, MAX_ERROR_SERIES, overlapPx,
  fmtDuration, hauptsender, jahrzehnt, countBy, overviewStats, searchSongs, entriesOfYear, historyEntry, urheber, songStart,
  KATEGORIE_REIHENFOLGE,
} from '../app/js/data.js';
import { SETTINGS_VERSION, DEFAULT_TARGET, defaultSettings, migrateSettings, migrateState } from '../app/js/settings.js';
import { karteRueck, karteVorn, playKnopf, kartenFarbe, SET_KUERZEL } from '../app/js/karten.js';

const APP = new URL('../app/', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('data/serien.json', APP), 'utf8'));
const songs = raw.songs.map(normalize);
const byId = (id) => songs.find((s) => s.id === id);
const FILTER = { kategorien: [], from: 1950, to: 2030 };

test('Daten: 147 Einträge mit id, Jahr und YouTube-ID', () => {
  assert.equal(raw.anzahl, 147);
  assert.equal(songs.length, 147);
  assert.equal(new Set(songs.map((s) => s.id)).size, 147);
  for (const s of songs) {
    assert.match(s.id, /^\d{3}$/, `id ${s.id}`);
    assert.equal(s.id, String(s.nr).padStart(3, '0'));
    assert.ok(Number.isInteger(s.jahr) && s.jahr >= 1950 && s.jahr <= 2020, `Jahr ${s.id}`);
    assert.match(s.youtube_id, /^[\w-]{11}$/, `Video ${s.id}`);
    assert.equal(s.embed_ok, true);
    assert.ok(s.serie && s.songtitel && s.sender && s.kategorie, `Felder ${s.id}`);
    assert.ok(Number.isInteger(s.start_sek) && s.start_sek >= 0);
  }
});

test('Daten: Nummern laufen nach Jahr sortiert', () => {
  for (let i = 1; i < songs.length; i++) assert.ok(songs[i].jahr >= songs[i - 1].jahr, `Reihenfolge bei ${songs[i].id}`);
});

test('Kategorien: alle acht, in fester Reihenfolge', () => {
  assert.deepEqual(kategorien(songs), ['Klassiker', 'Magazin', 'Realserie', 'Disney', 'Cartoon 90er', 'Vorschule', 'Anime', 'Cartoon']);
  assert.deepEqual(kategorien(songs), KATEGORIE_REIHENFOLGE);
  // Unbekannte Werte aus den Daten kommen alphabetisch hinter die bekannten
  const extra = [...songs, { ...songs[0], kategorie: 'Zeichentrick' }, { ...songs[0], kategorie: 'Dokumentation' }];
  assert.deepEqual(kategorien(extra).slice(-2), ['Dokumentation', 'Zeichentrick']);
});

test('Pool: keine Kategorie gewählt heißt alle, sonst nur die gewählten', () => {
  assert.equal(filterPool(songs, FILTER).length, 147);
  const cartoon = filterPool(songs, { ...FILTER, kategorien: ['Cartoon'] });
  assert.equal(cartoon.length, 39);
  assert.ok(cartoon.every((s) => s.kategorie === 'Cartoon'));
  const zwei = filterPool(songs, { ...FILTER, kategorien: ['Cartoon', 'Anime'] });
  assert.equal(zwei.length, 39 + 20);
  assert.equal(filterPool(songs, { ...FILTER, kategorien: ['gibt es nicht'] }).length, 0);
});

test('Pool: Zeitraum von/bis ist inklusive, Schnellwahlen', () => {
  const n = (f) => filterPool(songs, { ...FILTER, ...f }).length;
  assert.equal(n({ from: 2000, to: 2015 }), songs.filter((s) => s.jahr >= 2000 && s.jahr <= 2015).length);
  assert.equal(n({ from: 1971, to: 1971 }), songs.filter((s) => s.jahr === 1971).length);
  assert.ok(n({ from: 1971, to: 1971 }) >= 2);
  const min = Math.min(...songs.map((s) => s.jahr));
  const max = Math.max(...songs.map((s) => s.jahr));
  assert.deepEqual(quickRange('alle', min, max), { from: min, to: max });
  assert.deepEqual(quickRange('klassiker', min, max), { from: min, to: 1999 });
  assert.deepEqual(quickRange('kern', min, max), { from: 2000, to: 2015 });
  assert.equal(quickRange('unbekannt', min, max), null);
  const klassiker = filterPool(songs, { ...FILTER, ...quickRange('klassiker', min, max) });
  assert.ok(klassiker.length > 0 && klassiker.every((s) => s.jahr <= 1999));
});

test('Pool: Intros ohne Video nur im Dev-Modus', () => {
  const kaputt = songs.map((s, i) => (i < 5 ? { ...s, embed_ok: false } : i < 8 ? { ...s, youtube_id: '' } : s));
  assert.equal(filterPool(kaputt, FILTER).length, 139);
  assert.equal(filterPool(kaputt, FILTER, true).length, 147);
  assert.equal(hasVideo(kaputt[0]), false);
  assert.equal(hasVideo(kaputt[6]), false);
  assert.equal(hasVideo(kaputt[20]), true);
});

test('Handicap: eigene Kategorien und Zeitraum ersetzen die gemeinsame Auswahl', () => {
  const base = { ...FILTER, kategorien: ['Klassiker'], from: 1960, to: 1990 };
  assert.equal(playerFilter(base, null), base);
  const hc = { kategorien: ['Anime'], from: 2000, to: 2010 };
  const f = playerFilter(base, hc);
  assert.deepEqual([f.kategorien, f.from, f.to], [['Anime'], 2000, 2010]);
  const pool = filterPool(songs, f);
  assert.ok(pool.length > 0 && pool.every((s) => s.kategorie === 'Anime' && s.jahr >= 2000 && s.jahr <= 2010));
  // Handicap ohne Kategorie heißt: alle Kategorien im eigenen Zeitraum
  assert.equal(filterPool(songs, playerFilter(base, { kategorien: [], from: 2000, to: 2010 })).length,
    songs.filter((s) => s.jahr >= 2000 && s.jahr <= 2010).length);
});

test('Beschriftung von Pool und Handicap', () => {
  const alle = kategorien(songs);
  assert.equal(filterLabel({ kategorien: [], from: 2000, to: 2015 }, alle), 'Alle Kategorien · 2000–2015');
  assert.equal(filterLabel({ kategorien: alle, from: 2000, to: 2015 }, alle), 'Alle Kategorien · 2000–2015');
  assert.equal(handicapLabel({ kategorien: ['Cartoon', 'Anime'], from: 1990, to: 2000 }, alle), 'Cartoon, Anime · 1990–2000');
  assert.equal(handicapLabel(null, alle), '');
});

test('Zeitleiste: Lücken und gleiche Jahre', () => {
  const tl = [{ jahr: 1974 }, { jahr: 1980 }, { jahr: 1980 }, { jahr: 1999 }];
  assert.equal(fitsGap(tl, 0, 1960), true);
  assert.equal(fitsGap(tl, 0, 1975), false);
  assert.equal(fitsGap(tl, 1, 1977), true);
  assert.equal(fitsGap(tl, 1, 1981), false);
  assert.equal(fitsGap(tl, 4, 2005), true);
  assert.equal(fitsGap(tl, 4, 1990), false);
  // Gleiche Jahre zählen als richtig, links wie rechts
  assert.equal(fitsGap(tl, 1, 1974), true);
  assert.equal(fitsGap(tl, 1, 1980), true);
  assert.equal(fitsGap(tl, 3, 1980), true);
  assert.equal(fitsGap([], 0, 2000), true);
  assert.equal(sortedIndex(tl, 1960), 0);
  assert.equal(sortedIndex(tl, 1980), 3); // hinter den gleichen Jahren
  assert.equal(sortedIndex(tl, 2010), 4);
});

test('Zeitleiste mit echten Daten: jede Lücke, in die ein Intro sortiert wird, passt', () => {
  const tl = songs.filter((_, i) => i % 3 === 0);
  for (const s of songs) {
    const g = sortedIndex(tl, s.jahr);
    assert.equal(fitsGap(tl, g, s.jahr), true, s.id);
  }
});

test('letzte Runde läuft nur weiter, wenn noch jemand aufholen kann', () => {
  const sp = (karten) => ({ timeline: Array(karten).fill('x') });
  // A hat 10, B ist als Nächster dran und hat 9: Gleichstand ist noch möglich
  assert.equal(canStillCatchUp([sp(10), sp(9)], 0, 0), true);
  assert.equal(canStillCatchUp([sp(10), sp(8)], 0, 0), false);
  // B kann nicht mehr, C hinter ihm aber schon: Die Runde läuft weiter
  assert.equal(canStillCatchUp([sp(10), sp(5), sp(9)], 0, 0), true);
  // Nach Cs Zug ist die Runde um, A war Startspieler
  assert.equal(canStillCatchUp([sp(10), sp(5), sp(9)], 2, 0), false);
  // Wer vor dem Führenden schon dran war, zählt nicht: B erreicht das Ziel, nur C ist noch dran
  assert.equal(canStillCatchUp([sp(9), sp(10), sp(5)], 1, 0), false);
  // Solo: nie jemand zum Aufholen
  assert.equal(canStillCatchUp([sp(10)], 0, 0), false);
});

test('Rangliste: gleich viele Karten teilen sich den Platz', () => {
  const sp = (name, karten) => ({ name, timeline: Array(karten).fill('x') });
  const r = rankPlayers([sp('A', 10), sp('B', 10), sp('C', 7), sp('D', 7), sp('E', 3)]);
  assert.deepEqual(r.map((x) => x.rank), [1, 1, 3, 3, 5]);
  assert.deepEqual(r.map((x) => x.name), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(r.map((x) => x.i), [0, 1, 2, 3, 4]);
  assert.equal(r.filter((x) => x.rank === 1).length, 2); // geteilter Sieg
  assert.deepEqual(rankPlayers([sp('A', 4), sp('B', 9)]).map((x) => [x.name, x.rank]), [['B', 1], ['A', 2]]);
});

test('Siegerehrung: Balken proportional zu den Karten', () => {
  assert.equal(podiumHeight(10, 10), 160);
  assert.equal(podiumHeight(5, 10), 80);
  assert.equal(podiumHeight(1, 10), 44); // Platzzahl muss hineinpassen
  assert.equal(podiumHeight(0, 0), 44);
});

test('Überspringen: ein Gratis-Überspringen pro Spieler und Spiel', () => {
  assert.equal(FREE_SKIPS, 1);
  assert.equal(canSkip({ freeSkips: 1 }), true);
  assert.equal(canSkip({ freeSkips: 0 }), false);
});

test('Fehlerserie: Intros gehen zurück in den Pool, das aktuelle bleibt gezogen', () => {
  assert.equal(MAX_ERROR_SERIES, 3);
  const used = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(giveBackSongs(used, ['b', 'c', 'd'], 'd'), ['a', 'd', 'e']);
  assert.deepEqual(giveBackSongs(used, ['d', 'd', 'd'], 'd'), used);
});

test('Lautstärkeregler: nur iPhone und iPad gelten als gesperrt', () => {
  assert.equal(volumeLocked('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5), true);
  assert.equal(volumeLocked('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5), true); // iPadOS
  assert.equal(volumeLocked('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0), false);
  assert.equal(volumeLocked('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0), false);
});

test('Überlappung: erst wenn nötig, höchstens 45 % der Karte', () => {
  assert.equal(overlapPx(1, 100, 50), 0);
  assert.equal(overlapPx(3, 100, 400), 0);
  assert.ok(overlapPx(6, 100, 400) > 0);
  assert.ok(overlapPx(40, 100, 400) <= 45);
});

test('Zeitanzeige', () => {
  assert.equal(fmtDuration(0), '0:00');
  assert.equal(fmtDuration(65000), '1:05');
  assert.equal(fmtDuration(3725000), '1:02:05');
});

test('Statistik: Hauptsender, Jahrzehnt und Zählung', () => {
  assert.equal(hauptsender('ARD (NDR)'), 'ARD');
  assert.equal(hauptsender('ARD / SWR'), 'ARD');
  assert.equal(hauptsender('Nick Jr. / Super RTL'), 'Nick Jr.');
  assert.equal(hauptsender('DFF (DDR)'), 'DFF');
  assert.equal(hauptsender('KiKA'), 'KiKA');
  assert.equal(hauptsender(''), '');
  assert.equal(jahrzehnt(1974), '1970er');
  assert.equal(jahrzehnt(2000), '2000er');
  const c = countBy([{ jahr: 1990, k: 'a' }, { jahr: 2000, k: 'b' }, { jahr: 1995, k: 'a' }, { jahr: 1, k: '' }], (s) => s.k);
  assert.deepEqual(c, [{ name: 'a', count: 2, from: 1990, to: 1995 }, { name: 'b', count: 1, from: 2000, to: 2000 }]);
});

test('Statistik mit echten Daten: Summen stimmen', () => {
  const o = overviewStats(songs);
  assert.equal(o.intros, 147);
  assert.equal(o.von, 1959);
  assert.equal(o.bis, 2014);
  assert.deepEqual(o.kategorien.map((k) => k.name), KATEGORIE_REIHENFOLGE);
  assert.equal(o.kategorien.reduce((a, k) => a + k.count, 0), 147);
  assert.equal(o.jahrzehnte.reduce((a, k) => a + k.count, 0), 147);
  assert.equal(o.sender.reduce((a, k) => a + k.count, 0), 147);
  assert.deepEqual(o.jahrzehnte.map((k) => k.name), [...o.jahrzehnte.map((k) => k.name)].sort());
  assert.ok(o.sender[0].count >= o.sender[1].count);
  assert.ok(o.serien > 100 && o.serien <= 147);
  assert.ok(o.senderAnzahl >= 10);
  assert.equal(entriesOfYear(songs, 1971).every((s) => s.jahr === 1971), true);
});

test('Suche: Serie, Sender, Jahr, ohne Akzente, ohne ausgeschlossene Karte', () => {
  const maja = searchSongs(songs, 'biene maja');
  assert.ok(maja.length >= 1 && maja[0].serie.includes('Maja'));
  assert.ok(searchSongs(songs, 'sandmännchen').length >= 1);
  assert.ok(searchSongs(songs, 'sandmannchen').length >= 1);
  assert.ok(searchSongs(songs, '1971').every((s) => s.jahr === 1971 || `${s.serie} ${s.songtitel} ${s.sender}`.includes('1971')));
  assert.equal(searchSongs(songs, 'biene maja', 8, [maja[0].id]).some((s) => s.id === maja[0].id), false);
  assert.equal(searchSongs(songs, '   ').length, 0);
  assert.ok(searchSongs(songs, 'a', 3).length <= 3);
  const alt = searchSongs(songs, 'ard');
  assert.deepEqual(alt, [...alt].sort((a, b) => a.jahr - b.jahr || a.serie.localeCompare(b.serie, 'de')));
});

test('Spielverlauf: Eintrag übernimmt Rangliste und Pool-Beschriftung', () => {
  const r = rankPlayers([{ name: 'A', timeline: ['1', '2'], time: 0 }, { name: 'B', timeline: ['1', '2', '3'], time: 5000 }]);
  const e = historyEntry(r, { when: '2026-01-01T00:00:00Z', pool: 'Alle Kategorien · 1959–2014', target: 10 });
  assert.deepEqual(e.spieler.map((s) => [s.name, s.platz, s.karten, s.zeit]), [['B', 1, 3, 5000], ['A', 2, 2, 0]]);
  assert.equal(e.pool, 'Alle Kategorien · 1959–2014');
  assert.equal(e.ziel, 10);
  assert.equal('modus' in e, false);
});

test('Interpret oder ersatzweise Komponist, Startsekunde', () => {
  assert.equal(urheber({ interpret: 'Kinderchor', komponist: 'X' }), 'Kinderchor');
  assert.equal(urheber({ interpret: '', komponist: 'Hans Posegga' }), 'Hans Posegga');
  assert.equal(urheber({ interpret: '', komponist: '' }), '');
  assert.equal(songStart({ start_sek: 12 }), 12);
  assert.equal(songStart({}), 0);
});

test('normalize: fehlende Felder bekommen Standardwerte', () => {
  const s = normalize({ id: 7, jahr: '1999', youtube_id: ' abc ' });
  assert.equal(s.id, '7');
  assert.equal(s.jahr, 1999);
  assert.equal(s.youtube_id, 'abc');
  assert.equal(s.start_sek, 0);
  assert.equal(s.serie, '');
  assert.equal(s.embed_ok, null);
});

test('Migration der Einstellungen: leer, fehlende Felder, unbekannte Felder bleiben', () => {
  assert.equal(migrateSettings(null), null);
  assert.equal(migrateSettings(undefined), null);
  const leer = migrateSettings({});
  assert.deepEqual(leer, { ...defaultSettings(), filter: { kategorien: [], from: null, to: null, toMax: true } });
  assert.equal(leer.v, SETTINGS_VERSION);
  assert.equal(SETTINGS_VERSION, 1);
  const alt = migrateSettings({ players: ['Anna'], target: '7', filter: { kategorien: ['Cartoon'], from: '2000' }, extra: 1, trackTime: 1 });
  assert.deepEqual(alt.players, ['Anna']);
  assert.equal(alt.target, 7);
  assert.deepEqual(alt.filter, { kategorien: ['Cartoon'], from: 2000, to: null, toMax: true });
  assert.equal(alt.trackTime, true);
  assert.equal(alt.extra, 1);
  assert.deepEqual(alt.handicaps, []);
  // Ziel bleibt im erlaubten Bereich, Unsinn fällt auf den Standard zurück
  assert.equal(migrateSettings({ target: 99 }).target, 30);
  assert.equal(migrateSettings({ target: 1 }).target, 3);
  assert.equal(migrateSettings({ target: 'x' }).target, DEFAULT_TARGET);
});

test('Migration eines laufenden Spiels: Felder werden aufgefüllt', () => {
  const saved = {
    settings: { players: ['A', 'B'], target: 5 },
    players: [{ name: 'A', timeline: ['001'] }, { name: 'B', timeline: ['002'], freeSkips: 0, wrong: ['003'] }],
    cur: { songId: '004' },
  };
  const m = migrateState(saved);
  assert.equal(m.first, 0);
  assert.equal(m.round, 1);
  assert.deepEqual(m.used, []);
  assert.equal(m.settings.v, SETTINGS_VERSION);
  assert.deepEqual(m.settings.filter.kategorien, []);
  assert.deepEqual(m.players[0], { name: 'A', timeline: ['001'], handicap: null, freeSkips: 1, wrong: [], time: 0 });
  assert.equal(m.players[1].freeSkips, 0); // verbrauchtes Überspringen bleibt verbraucht
  assert.deepEqual(m.players[1].wrong, ['003']);
  assert.deepEqual(m.cur, { songId: '004', phase: 'listen', gap: null, elapsed: 0, clockOn: false, stalled: false, result: null });
  // zweimal migrieren ändert nichts
  assert.deepEqual(migrateState(structuredClone(m)), m);
});

test('Karten: Rückseite enthält alle Elemente und die Farbgruppe', () => {
  const s = byId('007');
  const html = karteRueck(s);
  for (const k of ['k-jahr', 'k-serie', 'k-titel', 'k-interpret', 'k-sender', 'k-tv', 'k-set', 'k-nr']) assert.ok(html.includes(`class="${k}`) || html.includes(`<span class="${k}"`), k);
  assert.ok(html.includes(`data-farbe="${s.nr % 8}"`));
  assert.ok(html.includes(`>${SET_KUERZEL}<`));
  assert.ok(html.includes('>007<'));
  assert.ok(html.includes(`>${s.jahr}<`));
  assert.ok(karteRueck(s, { klein: true, klasse: 'correct new' }).includes('karte-rueck klein correct new'));
  assert.equal(kartenFarbe({ nr: 147 }), 3);
  // Ersatzweise Komponist, wenn kein Interpret
  const ohne = byId('002');
  assert.equal(ohne.interpret, '');
  assert.ok(karteRueck(ohne).includes('Hans Posegga'));
  // HTML-Sonderzeichen werden maskiert
  assert.ok(karteRueck({ ...s, serie: '<b>x</b> & "y"' }).includes('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;'));
});

test('Spoiler: verdeckte Karte und Play-Knopf verraten nichts', () => {
  for (const status of ['idle', 'loading', 'playing', 'paused']) {
    const html = karteVorn({ klasse: 'pulse', status });
    assert.ok(html.includes('karte-vorn') && html.includes('data-play') && html.includes('data-drag'));
    assert.equal(/data-id|data-farbe|\d{3}/.test(html), false, status);
    for (const s of songs) {
      for (const f of [s.serie, s.songtitel, s.youtube_id, s.sender]) assert.equal(html.includes(f), false, `${status} ${s.id}`);
    }
  }
  assert.equal(playKnopf('playing').label, 'Pause');
  assert.equal(playKnopf('idle').label, 'Abspielen');
  assert.equal(playKnopf('loading').label, 'Lädt');
});

/** Alle Dateien unter app/ (ohne die Daten). */
function appFiles(dir = fileURLToPath(APP), out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'data') appFiles(p, out); } else out.push(p);
  }
  return out;
}

test('Eigener Namensraum: localStorage-Schlüssel und Cache-Name mit ktv-Präfix, keine ESC-Reste', () => {
  const files = appFiles().filter((f) => /\.(js|html|css|webmanifest)$/.test(f));
  assert.ok(files.length >= 9);
  const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  const keys = [...all.matchAll(/'((?:ktv|esc)_[a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 5, `Schlüssel: ${keys}`);
  assert.ok(keys.every((k) => k.startsWith('ktv_')), `Schlüssel: ${keys}`);
  assert.match(readFileSync(new URL('sw.js', APP), 'utf8'), /const VERSION = 'ktv-hitster-v\d+'/);
  for (const bad of [/\besc_/i, /window\.ESC/, /refrain/i, /land_iso/, /steal|klauen/i, /te-deum/, /ikonen/i, /higher.?lower/i, /\btoken/i, /screen-(hl|stream|music)/, /musikBaustein/]) {
    assert.equal(bad.test(all), false, `Rest gefunden: ${bad}`);
  }
});

test('Service Worker: jede JS-Datei der App ist im Cache eingetragen', () => {
  const sw = readFileSync(new URL('sw.js', APP), 'utf8');
  for (const f of readdirSync(new URL('js/', APP))) assert.ok(sw.includes(`'js/${f}'`), f);
});
