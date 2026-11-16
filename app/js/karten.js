// Karten-Markup: aufgedeckte Karte (Rückseite mit Lösung) und verdeckte Karte (Vorderseite mit Play-Knopf).
// Alle Funktionen liefern nur HTML-Text. Das Aussehen steckt in css/style.css und folgt dem gedruckten Kartendesign
// (tools/make_cards.py: draw_front, draw_back, draw_tv_icon).
import { KATEGORIE_REIHENFOLGE } from './data.js';

export const SET_KUERZEL = 'KTV01';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Neonfarben der Kartenvorderseite (wie NEON in make_cards.py). */
export const NEON = ['#FF2D6F', '#16B7F2', '#FFE01B', '#B03AD6', '#FF5A1F'];
/** Rückseitenfarben, Index = Kartennummer % 8 (wie BACK_COLORS in make_cards.py). */
export const BACK_COLORS = ['#F0405A', '#FFD23F', '#3EC1F3', '#FF8C42', '#B76CE0', '#5ED17A', '#FF6FB5', '#2FD3C6'];

/** Farbgruppe 0–7 einer Karte, nur aus der Kartennummer. */
export const kartenFarbe = (song) => (song.nr ?? 0) % 8;

/** Feste Kartenfarbe (0–7) einer Kategorie, für Chips und Balken. */
export function katFarbe(kategorie) {
  const i = KATEGORIE_REIHENFOLGE.indexOf(kategorie);
  return (i < 0 ? 0 : i) % 8;
}

/* ------------------------------------------------------------------ Ringe der Vorderseite */
const RADII = [13.5, 16, 18.3, 20.6, 22.9, 25.2, 27.5, 29.8];
// Umlaufzeit je Ring in Sekunden (langsam, unterschiedlich); die Richtung wechselt per CSS (gerade Ringe rückwärts)
const DAUER = [34, 46, 58, 40, 66, 50, 72, 54];

/** Kleiner seedbarer Zufallsgenerator (mulberry32). */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ringe wie draw_front: je Ring Farbe, 1–3 Bögen mit Lücken. Reine Funktion des Seeds.
 * Für die verdeckte Karte ist der Seed NICHT die Kartennummer (die verrät das Jahr), sondern z. B. die Zahl der gezogenen Karten.
 */
export function ringeDaten(seed) {
  const rnd = mulberry32(Math.imul((seed | 0) + 0x7f4a7c15, 0x9E3779B1));
  const uni = (a, b) => a + rnd() * (b - a);
  const ganz = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  return RADII.map((r, k) => {
    const farbe = NEON[(k + ganz(0, 4)) % NEON.length];
    let start = uni(0, 360);
    const n = [1, 2, 2, 3][ganz(0, 3)];
    const boegen = [];
    for (let s = 0; s < n; s++) {
      const ext = uni(70, 300 / n);
      boegen.push({ start, ext });
      start += ext + uni(15, 60);
    }
    return { r, farbe, breite: k % 2 ? 1.0 : 0.8, boegen };
  });
}

const zahl = (n) => String(+n.toFixed(2));

/** Ringe als Inline-SVG (viewBox 65×65, Mitte 32,5). Jeder Ring ist eine Gruppe, damit er sich einzeln drehen kann. */
export function ringeSvg(seed, { klasse = '' } = {}) {
  const m = 32.5;
  const gruppen = ringeDaten(seed).map((ring, k) => {
    const d = ring.boegen.map(({ start, ext }) => {
      const p = (deg) => { const a = (deg * Math.PI) / 180; return `${zahl(m + ring.r * Math.cos(a))} ${zahl(m - ring.r * Math.sin(a))}`; };
      return `M${p(start)}A${ring.r} ${ring.r} 0 ${ext > 180 ? 1 : 0} 0 ${p(start + ext)}`;
    }).join('');
    return `<g class="ring" style="--d:${DAUER[k]}s"><path d="${d}" fill="none" stroke="${ring.farbe}" stroke-width="${ring.breite}" stroke-linecap="round"/></g>`;
  }).join('');
  return `<svg class="ringe ${klasse}" viewBox="0 0 65 65" aria-hidden="true" focusable="false">${gruppen}</svg>`;
}

/* ------------------------------------------------------------------ Fernseher (draw_tv_icon) */
/** Formen im Raster 0–100 (y nach unten), Linienfarbe über currentColor. */
export const TV_INNEN = `<g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
<rect x="0" y="30" width="100" height="70" rx="12"/><rect x="10" y="40" width="62" height="50" rx="8"/>
<circle cx="86" cy="55" r="5"/><circle cx="86" cy="75" r="5"/><path d="M35 30L20 5M45 30L62 5"/></g>`;
const tvSvg = (klasse) => `<svg class="${klasse}" viewBox="-5 0 110 106" aria-hidden="true" focusable="false">${TV_INNEN}</svg>`;

/**
 * Marke: Kartenvorderseite mit Ringen, in der Mitte das weiße Quadrat mit Fernseher (Hero, Kopfzeile, Icon).
 * Eigenständiges SVG ohne CSS-Abhängigkeit (die Ringe drehen sich, wenn die Klasse „dreht“ gesetzt ist).
 */
export function markeSvg(seed, { klasse = '' } = {}) {
  const ringe = ringeSvg(seed).replace('<svg class="ringe "', '<svg class="ringe" x="0" y="0" width="65" height="65"');
  return `<svg class="marke ${klasse}" viewBox="0 0 65 65" aria-hidden="true" focusable="false">
<rect width="65" height="65" rx="5" fill="#000"/>${ringe}
<rect x="19.2" y="19.2" width="26.6" height="26.6" rx="3.4" fill="#fff"/>
<svg x="23.4" y="23.2" width="18.2" height="18.2" viewBox="-5 0 110 106" style="color:#111">${TV_INNEN}</svg></svg>`;
}

/* ------------------------------------------------------------------ Icons (Inline-SVG statt Emoji) */
const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  waage: '<path d="M12 4v16M7 20h10M4 8h16"/><path d="M4 8l-2.5 6a3.5 3 0 0 0 5 0zM20 8l-2.5 6a3.5 3 0 0 0 5 0z"/>',
  skip: '<path d="M5 5l9 7-9 7zM18 5v14"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v5h5"/>',
  undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  pause: '<rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/>',
  anfang: '<path d="M6 5v14M19 5L9 12l10 7z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  laut0: '<path d="M4 9v6h4l5 4V5L8 9z"/>',
  laut1: '<path d="M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
  uhr: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  krone: '<path d="M3 18.5h18l1-11-5.2 4L12 4.5 7.2 11.5 2 7.5z"/>',
  haken: '<path d="M4.5 12.5l5 5L19.5 6.5"/>',
  kreuz: '<path d="M6 6l12 12M18 6L6 18"/>',
  tv: '',
};
const VOLL = new Set(['play', 'pause', 'skip', 'krone']);

/** Inline-SVG-Icon, erbt Farbe und Schriftgröße vom Umfeld. */
export function ikon(name, klasse = '') {
  if (name === 'tv') return tvSvg(`ikon tv ${klasse}`);
  return `<svg class="ikon ${VOLL.has(name) ? 'voll' : ''} ${klasse}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
}

/* ------------------------------------------------------------------ Karten */
/** Abzeichen (Haken/Kreuz) für richtig/falsch an der Karte. */
const abzeichen = (ok) => `<span class="k-abzeichen ${ok ? 'ok' : 'bad'}" role="img" aria-label="${ok ? 'Richtig' : 'Falsch'}">${ikon(ok ? 'haken' : 'kreuz')}</span>`;

/**
 * Aufgedeckte Karte = Kartenrückseite. Wird für die Auflösung, die Zeitleiste, die Auswertung und die Dialoge benutzt.
 * Elemente: .k-tv .k-sender .k-serie .k-jahr .k-titel .k-interpret .k-set .k-nr
 * Optionen: klein (kleine Zeitleistenkarte), klasse (zusätzliche CSS-Klassen, z. B. „correct new“, „gross wrong“).
 * Kommt „correct“ oder „wrong“ in klasse vor, trägt die Karte zusätzlich ein Abzeichen.
 * Interpret oder ersatzweise Komponist steht in .k-interpret, bei beidem leer bleibt das Element leer.
 */
export function karteRueck(song, { klein = false, klasse = '' } = {}) {
  const urheber = song.interpret || song.komponist || '';
  const nr = String(song.nr ?? song.id).padStart(3, '0');
  const urteil = /\bcorrect\b/.test(klasse) ? abzeichen(true) : /\bwrong\b/.test(klasse) ? abzeichen(false) : '';
  return `<div class="karte karte-rueck ${klein ? 'klein' : ''} ${klasse}" data-id="${esc(song.id)}" data-farbe="${kartenFarbe(song)}">
    ${tvSvg('k-tv')}
    <div class="k-sender">${esc(song.sender)}</div>
    <div class="k-serie">${esc(song.serie)}</div>
    <div class="k-jahr">${esc(song.jahr)}</div>
    <div class="k-unten">
      <div class="k-titel">${esc(song.songtitel)}</div>
      <div class="k-interpret ${song.interpret ? '' : 'komponist'}">${esc(urheber)}</div>
    </div>
    <div class="k-fuss"><span class="k-set">${SET_KUERZEL}</span><span class="k-nr">${esc(nr)}</span></div>
    ${urteil}
  </div>`;
}

/** Inhalt des Play-Knopfs je Zustand: idle | loading | playing | paused. */
export function playKnopf(status) {
  if (status === 'loading') return { html: '<svg class="spin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" opacity=".18"/><path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>', label: 'Lädt' };
  if (status === 'playing') return { html: ikon('pause', 'play-ikon'), label: 'Pause' };
  return { html: ikon('play', 'play-ikon'), label: 'Abspielen' };
}

const statusKlasse = (status) => (status === 'playing' ? 'spielt' : status === 'loading' ? 'laedt' : '');

/**
 * Verdeckte aktuelle Karte = Kartenvorderseite: schwarz, Neon-Ringe, weißer Knopf in der Mitte (dort ist auf dem Druck der QR-Code).
 * Enthält nichts über das Intro. Der Seed bestimmt nur das Ringmuster und darf nie die Kartennummer sein.
 * Der Knopf trägt data-play, die Verdrahtung macht app.js.
 */
export function karteVorn({ klasse = '', status = 'idle', kein = false, seed = 0 } = {}) {
  const k = playKnopf(status);
  return `<div class="karte karte-vorn ${klasse} ${statusKlasse(status)}" data-drag="1" role="group" aria-label="Verdeckte Karte">
    ${ringeSvg(seed)}
    <button type="button" class="karte-play" data-play aria-label="${k.label}" ${kein ? 'disabled' : ''}>${k.html}</button>
    <span class="k-set">${SET_KUERZEL}</span><span class="k-frage" aria-hidden="true">?</span>
  </div>`;
}

/**
 * Auflösung: Die Karte dreht sich von der Vorderseite (gleiche Ringe wie vorher) auf die Rückseite.
 * Die Vorderseite hat keinen bedienbaren Knopf.
 */
export function karteFlip(song, { klasse = '', seed = 0 } = {}) {
  const vorn = `<div class="karte karte-vorn ${klasse}" aria-hidden="true">${ringeSvg(seed)}<span class="karte-play deko">${ikon('play', 'play-ikon')}</span><span class="k-set">${SET_KUERZEL}</span><span class="k-frage">?</span></div>`;
  return `<div class="flip"><div class="flip-inner"><div class="flip-face flip-front">${vorn}</div><div class="flip-face flip-back">${karteRueck(song, { klasse })}</div></div></div>`;
}
