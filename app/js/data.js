// Datenladen, Pool-Filter und reine Spiellogik (ohne DOM)

/** Reihenfolge der Kategorien in der Auswahl. Unbekannte Werte aus den Daten kommen alphabetisch dahinter. */
export const KATEGORIE_REIHENFOLGE = ['Klassiker', 'Magazin', 'Realserie', 'Disney', 'Cartoon 90er', 'Vorschule', 'Anime', 'Cartoon'];

/** Schnellwahl für den Zeitraum. null bedeutet: Grenze aus den Daten. */
export const QUICK_RANGES = {
  alle: { from: null, to: null },
  klassiker: { from: null, to: 1999 },
  kern: { from: 2000, to: 2015 },
};

const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const bool = (v) => (v === true || v === 'ja' || v === 'true' ? true : v === false || v === 'nein' || v === 'false' ? false : null);

/** Bringt einen Eintrag aus serien.json in die Form, die die App erwartet. */
export function normalize(s) {
  return {
    ...s,
    id: String(s.id),
    nr: num(s.nr),
    serie: s.serie || '',
    songtitel: s.songtitel || '',
    jahr: num(s.jahr),
    sender: s.sender || '',
    interpret: s.interpret || '',
    komponist: s.komponist || '',
    kategorie: s.kategorie || '',
    youtube_id: (s.youtube_id || '').trim(),
    start_sek: num(s.start_sek) || 0,
    embed_ok: bool(s.embed_ok),
    jahr_quelle: s.jahr_quelle || '',
    status: s.status || '',
    notiz: s.notiz || '',
  };
}

/** Lädt data/serien.json. */
export async function loadSongs() {
  const file = 'data/serien.json';
  let json;
  try {
    const res = await fetch(file, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    throw new Error(`Die Intro-Liste (${file}) konnte nicht geladen werden.`, { cause: e });
  }
  const list = Array.isArray(json) ? json : json.songs;
  if (!Array.isArray(list) || !list.length) throw new Error(`Die Intro-Liste (${file}) ist leer.`);
  const songs = list.map(normalize).filter((s) => s.id && s.jahr);
  return { file, generiert: json.generiert || '', songs };
}

export const hasVideo = (s) => !!s.youtube_id && s.embed_ok !== false;

/** Alle Kategorien der Daten, in fester Reihenfolge. */
export function kategorien(songs) {
  const found = [...new Set(songs.map((s) => s.kategorie).filter(Boolean))];
  const rank = (k) => { const i = KATEGORIE_REIHENFOLGE.indexOf(k); return i < 0 ? 999 : i; };
  return found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'de'));
}

/** Filtert die Intros nach den Setup-Einstellungen. dev=true ignoriert die YouTube-Pflicht. Keine Kategorie gewählt = alle. */
export function filterPool(songs, f, dev = false) {
  const kats = f.kategorien && f.kategorien.length ? new Set(f.kategorien) : null;
  return songs.filter((s) => {
    if (!dev && !hasVideo(s)) return false;
    if (f.from && s.jahr < f.from) return false;
    if (f.to && s.jahr > f.to) return false;
    if (kats && !kats.has(s.kategorie)) return false;
    return true;
  });
}

/** Grenzen einer Schnellwahl für den Zeitraum, bezogen auf die Jahre in den Daten. */
export function quickRange(name, minYear, maxYear) {
  const q = QUICK_RANGES[name];
  if (!q) return null;
  return { from: q.from ?? minYear, to: q.to ?? maxYear };
}

/** Filter eines Spielers: Handicap ersetzt Kategorien und Zeitraum. */
export function playerFilter(base, hc) {
  if (!hc) return base;
  return { ...base, kategorien: hc.kategorien || [], from: hc.from, to: hc.to };
}

/** Kurzbeschreibung einer Auswahl, z. B. „Cartoon, Anime · 2000–2015“. */
export function filterLabel(f, alle = []) {
  const kats = f.kategorien && f.kategorien.length && f.kategorien.length < alle.length ? f.kategorien.join(', ') : 'Alle Kategorien';
  return `${kats} · ${f.from}–${f.to}`;
}

/** Kurzbeschreibung eines Handicaps. */
export const handicapLabel = (hc, alle = []) => (hc ? filterLabel(hc, alle) : '');

/** Passt das Jahr in die Lücke `gap` (0..n) der nach Jahr sortierten Zeitleiste? Gleiche Jahre zählen als richtig. */
export function fitsGap(timeline, gap, year) {
  const left = gap > 0 ? timeline[gap - 1] : null;
  const right = gap < timeline.length ? timeline[gap] : null;
  return (!left || left.jahr <= year) && (!right || year <= right.jahr);
}

/** Index, an dem ein Intro sortiert eingefügt wird. */
export function sortedIndex(timeline, year) {
  let i = 0;
  while (i < timeline.length && timeline[i].jahr <= year) i++;
  return i;
}

/**
 * Kann nach dem Zug von `active` in dieser Runde noch jemand zum Führenden aufschließen?
 * Gleichstand zählt, dann teilen sich die Spieler den Sieg.
 */
export function canStillCatchUp(players, active, first) {
  const cards = (p) => p.timeline.length;
  const top = Math.max(...players.map(cards));
  for (let i = (active + 1) % players.length; i !== first; i = (i + 1) % players.length) {
    if (cards(players[i]) + 1 >= top) return true;
  }
  return false;
}

/** Rangliste nach Karten, gleich viele Karten teilen sich den Platz. */
export function rankPlayers(players) {
  const list = players.map((p, i) => ({ ...p, i, sc: p.timeline.length })).sort((a, b) => b.sc - a.sc);
  list.forEach((r, n) => {
    const prev = list[n - 1];
    r.rank = prev && prev.sc === r.sc ? prev.rank : n + 1;
  });
  return list;
}

/** Balkenhöhe der Siegerehrung in px: proportional zu den Karten, die Platzzahl muss aber hineinpassen. */
export function podiumHeight(cards, top, max = 160, min = 44) {
  return top > 0 ? Math.max(min, Math.round((max * cards) / top)) : min;
}

/** iPhone und iPad lassen Webseiten die Lautstärke nicht ändern, iPadOS gibt sich dabei als Mac aus. */
export function volumeLocked(ua, platform, touchPoints) {
  return /iP(hone|ad|od)/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}

/** Jeder Spieler hat pro Spiel ein freies Überspringen. */
export const FREE_SKIPS = 1;
export const canSkip = (p) => p.freeSkips > 0;

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Ab so vielen Abspielfehlern in Folge liegt es an YouTube und nicht an den einzelnen Intros. */
export const MAX_ERROR_SERIES = 3;

/** Gibt die Intros einer Fehlerserie an den Pool zurück, das aktuelle bleibt gezogen. */
export function giveBackSongs(used, failedIds, keepId) {
  const back = new Set(failedIds);
  back.delete(keepId);
  return used.filter((id) => !back.has(id));
}

/** Überlappung der Karten in px: 0, solange alles passt, sonst so wenig wie möglich, begrenzt auf maxShare der Kartenbreite. */
export function overlapPx(n, slotW, avail, maxShare = 0.45) {
  if (n < 2) return 0;
  const need = n * slotW - avail;
  if (need <= 0) return 0;
  // n-1 Überlappungen, dazu links und rechts je eine halbe als Platz fürs Auseinanderschieben
  return Math.min(Math.ceil(need / Math.max(n - 2, 0.5)), Math.round(slotW * maxShare));
}

/** Millisekunden als m:ss, ab einer Stunde als h:mm:ss. */
export function fmtDuration(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const fold = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss');
const words = (t) => fold(t).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Interpret, ersatzweise Komponist, für die Karte. Leer, wenn beides fehlt. */
export const urheber = (s) => s.interpret || s.komponist || '';

/** Startsekunde im Video. */
export const songStart = (s) => s.start_sek || 0;

/** „1970er“ für ein Jahr. */
export const jahrzehnt = (jahr) => `${Math.floor(jahr / 10) * 10}er`;

/** Hauptsender: erster Teil vor „ / “, ohne Klammerzusatz („ARD (NDR)“ wird „ARD“). */
export function hauptsender(sender) {
  return String(sender || '').split(' / ')[0].replace(/\s*\([^)]*\)/g, '').trim();
}

/** Intros suchen: Jedes Suchwort muss in Serie, Songtitel, Sender, Kategorie oder Jahr vorkommen. Älteste zuerst. */
export function searchSongs(songs, query, max = 8, ausser = []) {
  const ws = words(query);
  if (!ws.length) return [];
  const skip = new Set(ausser);
  return songs
    .filter((s) => {
      if (skip.has(s.id)) return false;
      const hay = words(`${s.serie} ${s.songtitel} ${s.sender} ${s.kategorie} ${s.jahr}`).join(' ');
      return ws.every((w) => hay.includes(w));
    })
    .sort((a, b) => a.jahr - b.jahr || a.serie.localeCompare(b.serie, 'de'))
    .slice(0, max);
}

/** Zählt nach einem Schlüssel und liefert [{ name, count, from, to }], größte Gruppe zuerst. */
export function countBy(songs, keyFn, order = null) {
  const m = new Map();
  for (const s of songs) {
    const k = keyFn(s);
    if (!k) continue;
    const e = m.get(k) || { name: k, count: 0, from: s.jahr, to: s.jahr };
    e.count++;
    e.from = Math.min(e.from, s.jahr);
    e.to = Math.max(e.to, s.jahr);
    m.set(k, e);
  }
  const list = [...m.values()];
  return order ? list.sort(order) : list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'));
}

/** Kennzahlen und Auswertungen für die Statistikseite: nach Kategorie, Sender und Jahrzehnt. */
export function overviewStats(songs) {
  const years = songs.map((s) => s.jahr);
  return {
    intros: songs.length,
    serien: new Set(songs.map((s) => s.serie)).size,
    senderAnzahl: new Set(songs.map((s) => hauptsender(s.sender)).filter(Boolean)).size,
    von: Math.min(...years),
    bis: Math.max(...years),
    kategorien: countBy(songs, (s) => s.kategorie, (a, b) => {
      const r = (k) => { const i = KATEGORIE_REIHENFOLGE.indexOf(k); return i < 0 ? 999 : i; };
      return r(a.name) - r(b.name) || a.name.localeCompare(b.name, 'de');
    }),
    sender: countBy(songs, (s) => hauptsender(s.sender)),
    jahrzehnte: countBy(songs, (s) => jahrzehnt(s.jahr), (a, b) => a.name.localeCompare(b.name)),
  };
}

/** Alle Intros eines Jahres, nach Serie sortiert. */
export const entriesOfYear = (songs, year) => songs.filter((s) => s.jahr === year).sort((a, b) => a.serie.localeCompare(b.serie, 'de'));

/** Eintrag für den Spielverlauf aus der fertigen Rangliste. */
export function historyEntry(ranking, { when, pool, target }) {
  return {
    zeit: when,
    pool,
    ziel: target,
    spieler: ranking.map((r) => ({ name: r.name, platz: r.rank, karten: r.sc, zeit: r.time || 0 })),
  };
}
