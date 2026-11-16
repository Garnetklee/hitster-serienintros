// Hitster Serienintros – Hauptmodul (UI + Spielablauf)
import {
  loadSongs, filterPool, fitsGap, pickRandom, MAX_ERROR_SERIES, giveBackSongs, hasVideo, overlapPx, fmtDuration,
  kategorien, quickRange, playerFilter, filterLabel, handicapLabel, canStillCatchUp, rankPlayers, podiumHeight, volumeLocked,
  canSkip, songStart, searchSongs, overviewStats, historyEntry, FREE_SKIPS,
} from './data.js';
import * as YTP from './player.js';
import { SETTINGS_VERSION, TARGET_CHOICES, MIN_TARGET, MAX_TARGET, DEFAULT_TARGET, migrateSettings, migrateState } from './settings.js';
import { startFireworks } from './fireworks.js';
import { esc, karteRueck, karteVorn, karteFlip, playKnopf, ikon, katFarbe, markeSvg, ringeSvg, SET_KUERZEL } from './karten.js';

const KEY_STATE = 'ktv_hitster_state';
const KEY_SETTINGS = 'ktv_hitster_settings';
const KEY_ERRORS = 'ktv_hitster_errors';
const KEY_HISTORY = 'ktv_hitster_history';
const KEY_VOLUME = 'ktv_hitster_volume'; // nur Gerätekomfort
const HISTORY_MAX = 200;
const SENDER_TOP = 10;
const NEON_ANZAHL = 5; // Neonfarben: jeder Spieler bekommt reihum eine (Klasse pf0 bis pf4)
const pf = (i) => `pf${i % NEON_ANZAHL}`;
const DEV = new URLSearchParams(location.search).get('dev') === '1';

let DATA = { file: '', generiert: '', songs: [] };
let BY_ID = new Map();
let KATEGORIEN = []; // alle Kategorien der Daten in fester Reihenfolge
let state = null; // laufendes Spiel
let audioStatus = 'idle'; // idle | loading | playing | paused

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------------ Speicher */
const store = {
  get(k, fb = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('localStorage', e); } },
  del(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
};
function save() { if (state) { state.savedAt = new Date().toISOString(); store.set(KEY_STATE, state); } }
const readErrors = () => store.get(KEY_ERRORS, []);
function logError(song, code) {
  const list = readErrors();
  list.push({ id: song ? song.id : '', youtube_id: song ? song.youtube_id : '', code: String(code), zeit: new Date().toISOString() });
  store.set(KEY_ERRORS, list.slice(-300));
}

/* ------------------------------------------------------------------ Toast */
let toastTimer = null;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ------------------------------------------------------------------ Setup */
const setup = {
  names: ['Spieler 1', 'Spieler 2'],
  handicaps: [], // je Spieler null oder { kategorien, from, to }
  kategorien: new Set(),
  minYear: 1950,
  maxYear: 2020,
};

function readFilter() {
  const to = parseInt($('#inp-to').value, 10) || setup.maxYear;
  return {
    kategorien: KATEGORIEN.filter((k) => setup.kategorien.has(k)),
    from: parseInt($('#inp-from').value, 10) || setup.minYear,
    to,
    toMax: to >= setup.maxYear,
  };
}

/** Kategorie-Chips für Setup und Handicap. Nichts gewählt heißt alle. */
function katChipsHTML(sel) {
  return KATEGORIEN.map((k) => {
    const on = sel.has(k);
    return `<button type="button" class="chip ${on ? 'on' : ''}" style="--kc:var(--kf${katFarbe(k)})" data-kat="${esc(k)}" aria-pressed="${on}"><span>${esc(k)}</span></button>`;
  }).join('');
}

/** Setzt die Jahresfelder auf eine Schnellwahl. */
function applyQuick(name, fromEl, toEl) {
  const r = quickRange(name, setup.minYear, setup.maxYear);
  if (!r) return;
  fromEl.value = r.from;
  toEl.value = r.to;
}

/** Ziel-Auswahl an das freie Feld anpassen, bei einem anderen Wert ist keine Auswahl markiert. */
function syncTarget() {
  const v = $('#inp-target').value;
  $$('input[name=target]').forEach((r) => { r.checked = r.value === v; });
}

function renderPlayerInputs() {
  const box = $('#player-list');
  box.innerHTML = setup.names.map((n, i) =>
    `<div class="player-input ${pf(i)}"><span class="pnum">${i + 1}</span><input type="text" maxlength="16" value="${esc(n)}" data-i="${i}" aria-label="Name Spieler ${i + 1}" enterkeyhint="done">${hcButton(i)}</div>`).join('');
  $$('input', box).forEach((inp) => inp.addEventListener('input', () => { setup.names[+inp.dataset.i] = inp.value; updateCount(); }));
  $$('[data-hc]', box).forEach((b) => b.addEventListener('click', () => openHandicap(+b.dataset.hc)));
  $('#btn-add-player').disabled = setup.names.length >= 8;
  $('#btn-remove-player').disabled = setup.names.length <= 1;
}

function hcButton(i) {
  const hc = setup.handicaps[i];
  return `<button type="button" class="hc-btn ${hc ? 'on' : ''}" data-hc="${i}" title="Handicap: eigene Kategorien und eigener Zeitraum für diesen Spieler" aria-label="Handicap">${ikon('waage')}</button>${hc ? `<button type="button" class="hc-info" data-hc="${i}">Handicap: ${esc(handicapLabel(hc, KATEGORIEN))}</button>` : ''}`;
}

/* ------------------------------------------------------------------ Handicap pro Spieler */
let hcIndex = -1;
let hcKats = new Set();

function readHandicap() {
  return {
    kategorien: KATEGORIEN.filter((k) => hcKats.has(k)),
    from: parseInt($('#hc-from').value, 10) || setup.minYear,
    to: parseInt($('#hc-to').value, 10) || setup.maxYear,
  };
}

function updateHandicapCount() {
  const n = filterPool(DATA.songs, playerFilter(readFilter(), readHandicap()), DEV).length;
  $('#hc-count').textContent = `${n} Intros in diesem Pool${n < 5 ? ' – zu wenige, es wird dann aus dem gemeinsamen Pool gezogen' : ''}`;
}

function openHandicap(i) {
  hcIndex = i;
  const hc = setup.handicaps[i] || readFilter();
  hcKats = new Set(hc.kategorien);
  $('#hc-title').textContent = `Handicap für ${(setup.names[i] || '').trim() || `Spieler ${i + 1}`}`;
  $('#hc-kat-chips').innerHTML = katChipsHTML(hcKats);
  $('#hc-from').value = hc.from;
  $('#hc-to').value = hc.to;
  for (const id of ['#hc-from', '#hc-to']) { $(id).min = setup.minYear; $(id).max = setup.maxYear; }
  updateHandicapCount();
  $('#dlg-handicap').showModal();
}

function closeHandicap(hc) {
  setup.handicaps[hcIndex] = hc;
  $('#dlg-handicap').close();
  renderPlayerInputs();
  updateCount();
}

function initHandicap() {
  $('#dlg-handicap').addEventListener('input', updateHandicapCount);
  $('#hc-kat-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    hcKats.has(b.dataset.kat) ? hcKats.delete(b.dataset.kat) : hcKats.add(b.dataset.kat);
    $('#hc-kat-chips').innerHTML = katChipsHTML(hcKats);
    updateHandicapCount();
  });
  $('#hc-quick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quick]'); if (!b) return;
    applyQuick(b.dataset.quick, $('#hc-from'), $('#hc-to'));
    updateHandicapCount();
  });
  $('#hc-ok').onclick = () => closeHandicap(readHandicap());
  $('#hc-reset').onclick = () => closeHandicap(null);
}

function updateCount() {
  const f = readFilter();
  const n = filterPool(DATA.songs, f, DEV).length;
  const need = setup.names.length + 5;
  $('#pool-count').textContent = n;
  $('#pool-need').textContent = n < need ? `– mindestens ${need} nötig` : '';
  $('#btn-start').disabled = n < need;
  $('.pool-count').classList.toggle('low', n < need);
  $('#kat-info').textContent = setup.kategorien.size ? `(${setup.kategorien.size} gewählt)` : '(alle)';
  $('#kat-chips').innerHTML = katChipsHTML(setup.kategorien);
}

function applySettings(st) {
  if (!st) return;
  setup.names = st.players.slice(0, 8);
  $('#inp-target').value = st.target;
  const f = st.filter;
  setup.kategorien = new Set(f.kategorien.filter((k) => KATEGORIEN.includes(k)));
  if (f.from) $('#inp-from').value = Math.max(f.from, setup.minYear);
  // „bis“ am alten Datenende gespeichert -> mit neuen Daten bis zum neuen Ende
  if (f.to && !f.toMax) $('#inp-to').value = Math.min(f.to, setup.maxYear);
  $('#chk-time').checked = !!st.trackTime;
  setup.handicaps = []; // Handicaps gelten nur für ein Spiel, neue starten mit der allgemeinen Auswahl
}

function initSetup() {
  const years = DATA.songs.map((s) => s.jahr);
  setup.minYear = Math.min(...years);
  setup.maxYear = Math.max(...years);
  for (const id of ['#inp-from', '#inp-to']) { $(id).min = setup.minYear; $(id).max = setup.maxYear; }
  $('#inp-from').value = setup.minYear;
  $('#inp-to').value = setup.maxYear;
  $('#inp-target').min = MIN_TARGET;
  $('#inp-target').max = MAX_TARGET;
  $('#inp-target').value = DEFAULT_TARGET;

  $('#target-opts').innerHTML = TARGET_CHOICES.map((n) =>
    `<label class="chip-radio"><input type="radio" name="target" value="${n}"><span>${n}</span></label>`).join('');
  applySettings(migrateSettings(store.get(KEY_SETTINGS)));
  syncTarget();
  renderPlayerInputs();

  const withVideo = DATA.songs.filter(hasVideo).length;
  const hint = $('#noid-hint');
  if (DEV) {
    hint.hidden = false;
    hint.innerHTML = `<b>Dev-Modus aktiv:</b> Intros ohne YouTube-Video kommen in den Pool und werden ohne Audio gespielt (${withVideo} von ${DATA.songs.length} Intros haben ein Video).`;
  } else if (!withVideo) {
    hint.hidden = false;
    hint.innerHTML = `<b>Noch keine Intros mit YouTube-Video.</b> Zum Testen ohne Audio: <a href="?dev=1">Dev-Modus öffnen (?dev=1)</a>.`;
  }

  $('#btn-add-player').onclick = () => { if (setup.names.length < 8) { setup.names.push(`Spieler ${setup.names.length + 1}`); renderPlayerInputs(); updateCount(); } };
  $('#btn-remove-player').onclick = () => { if (setup.names.length > 1) { setup.names.pop(); setup.handicaps.length = Math.min(setup.handicaps.length, setup.names.length); renderPlayerInputs(); updateCount(); } };
  $('#setup').addEventListener('input', updateCount);
  $('#setup').addEventListener('change', updateCount);
  $('#target-opts').addEventListener('change', (e) => { $('#inp-target').value = e.target.value; });
  $('#inp-target').addEventListener('input', syncTarget);
  $('#kat-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    setup.kategorien.has(b.dataset.kat) ? setup.kategorien.delete(b.dataset.kat) : setup.kategorien.add(b.dataset.kat);
    updateCount();
  });
  $('#range-quick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quick]'); if (!b) return;
    applyQuick(b.dataset.quick, $('#inp-from'), $('#inp-to'));
    updateCount();
  });
  $('#stats-input').addEventListener('input', renderSearch);
  $('#btn-start').onclick = startGame;

  offerResume();
  updateCount();
}

/** Gespeichertes Spiel auf der Startseite zum Fortsetzen anbieten. */
function offerResume() {
  const saved = store.get(KEY_STATE);
  const ok = saved && !saved.finished && Array.isArray(saved.players) && saved.players.length;
  $('#resume-box').hidden = !ok;
  if (!ok) return;
  const when = saved.savedAt ? new Date(saved.savedAt).toLocaleString('de-DE') : '';
  $('#resume-info').textContent = `${saved.players.map((p) => `${p.name} (${(p.timeline || []).length})`).join(', ')} · gespeichert ${when}`;
  $('#btn-resume').onclick = () => resumeGame(migrateState(saved));
  $('#btn-discard').onclick = () => { store.del(KEY_STATE); $('#resume-box').hidden = true; };
}

/* ------------------------------------------------------------------ Spielzustand */
const S = (id) => BY_ID.get(id);
const activeP = () => state.players[state.active];
const tlSongs = (p) => p.timeline.map(S).filter(Boolean);
const score = (p) => p.timeline.length;
const isSolo = () => state.players.length === 1;
function pool() { return state ? filterPool(DATA.songs, state.settings.filter, DEV) : filterPool(DATA.songs, readFilter(), DEV); }

/** Zieht für Spieler i (Standard: wer dran ist), mit Handicap aus seinem eigenen Pool, wenn dort noch etwas übrig ist. */
function draw(i = state.active) {
  const used = new Set(state.used);
  const hc = state.players[i]?.handicap;
  const own = hc ? filterPool(DATA.songs, playerFilter(state.settings.filter, hc), DEV).filter((s) => !used.has(s.id)) : [];
  const candidates = own.length ? own : pool().filter((s) => !used.has(s.id));
  if (!candidates.length) return null;
  const s = pickRandom(candidates);
  state.used.push(s.id);
  return s;
}

let errorSeries = []; // Intro-IDs der Abspielfehler seit dem letzten erfolgreichen Start
const youtubeBlocked = () => errorSeries.length >= MAX_ERROR_SERIES;

function newTurn(song) {
  return { songId: song.id, phase: 'listen', gap: null, elapsed: 0, clockOn: false, stalled: false, result: null };
}

function startGame() {
  testStop();
  errorSeries = [];
  const names = setup.names.map((n, i) => (n || '').trim() || `Spieler ${i + 1}`);
  const settings = {
    v: SETTINGS_VERSION,
    players: names,
    target: Math.min(MAX_TARGET, Math.max(MIN_TARGET, parseInt($('#inp-target').value, 10) || DEFAULT_TARGET)),
    filter: readFilter(),
    trackTime: $('#chk-time').checked,
    handicaps: names.map((_, i) => setup.handicaps[i] || null),
  };
  store.set(KEY_SETTINGS, settings);
  state = {
    v: 1, settings, active: 0, round: 1, used: [], cur: null, finished: false,
    players: names.map((name, i) => ({ name, timeline: [], freeSkips: FREE_SKIPS, wrong: [], time: 0, handicap: settings.handicaps[i] })),
  };
  state.players.forEach((p, i) => {
    const s = draw(i);
    if (s) p.timeline.push(s.id);
  });
  state.active = Math.floor(Math.random() * state.players.length);
  state.first = state.active;
  showScreen('game');
  startTurn();
}

function resumeGame(saved) {
  testStop();
  errorSeries = [];
  state = saved;
  // Intros, die es nicht mehr gibt, entfernen
  for (const p of state.players) {
    p.timeline = p.timeline.filter((id) => BY_ID.has(id));
    p.wrong = p.wrong.filter((id) => BY_ID.has(id));
  }
  showScreen('game');
  if (!state.cur || !S(state.cur.songId)) { startTurn(); return; }
  save();
  render();
  loadAudio(false);
  if (state.cur.clockOn) clockStart();
}

function startTurn() {
  hidePlayer();
  const song = draw();
  if (!song) { toast('Der Pool ist leer – Spielende!'); endGame(); return; }
  state.cur = newTurn(song);
  save();
  render();
  loadAudio(true);
}

function loadAudio(tryAutoplay) {
  const song = S(state.cur.songId);
  if (!song.youtube_id) { setAudioStatus('idle'); YTP.stop(); return; }
  const userActive = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
  const autoplay = tryAutoplay && userActive && state.cur.phase === 'listen';
  setAudioStatus(autoplay ? 'loading' : 'idle');
  YTP.load(song.youtube_id, songStart(song), autoplay);
}

/** Neue Karte statt der aktuellen (Fehler oder Überspringen). */
function replaceSong(reason) {
  clockStop();
  startTurn();
  if (reason) toast(reason);
}

function setGap(g) {
  const c = state.cur;
  if (c.phase !== 'listen') return;
  c.gap = g;
  if (g !== null) clockStart();
  save(); render();
  if (g !== null) scrollToGap(g);
}

/** Jeder Spieler darf pro Spiel einmal gratis überspringen. */
function skip() {
  const p = activeP();
  if (state.cur.phase !== 'listen' || !canSkip(p)) return;
  p.freeSkips -= 1;
  replaceSong(`${p.name} überspringt.`);
}

/** Ja/Nein-Dialog, liefert true bei Bestätigung. */
function confirmDlg(title, text, okLabel, cancelLabel) {
  return new Promise((resolve) => {
    const d = $('#dlg-confirm');
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#confirm-ok').textContent = okLabel;
    $('#confirm-cancel').textContent = cancelLabel;
    // Ergebnis direkt melden: Das close-Ereignis kommt erst mit dem nächsten Frame, im Hintergrund also gar nicht
    const finish = (answer) => { d.close(); resolve(answer); };
    $('#confirm-ok').onclick = () => finish(true);
    $('#confirm-cancel').onclick = () => finish(false);
    d.oncancel = (e) => { e.preventDefault(); finish(false); };
    d.showModal();
  });
}

function reveal() {
  const c = state.cur;
  if (c.phase !== 'listen' || c.gap === null) return;
  clockStop();
  hidePlayer();
  const p = activeP();
  const song = S(c.songId);
  const correct = fitsGap(tlSongs(p), c.gap, song.jahr);
  if (correct) p.timeline.splice(c.gap, 0, song.id);
  else p.wrong.push(song.id);
  c.result = { correct };
  c.phase = 'reveal';
  save(); render();
  if (correct) scrollToCard(song.id);
}

const nextPlayer = () => (state.active + 1) % state.players.length;
const targetReached = () => state.players.some((p) => score(p) >= state.settings.target);
/** Spielende: Ziel erreicht und in dieser Runde kann niemand mehr aufholen. */
const gameDecided = () => targetReached() && !canStillCatchUp(state.players, state.active, state.first);

function nextTurn() {
  const next = nextPlayer();
  if (gameDecided()) { endGame(); return; }
  state.active = next;
  state.round += next === state.first ? 1 : 0;
  startTurn();
}

function endGame() {
  clockStop();
  hidePlayer();
  YTP.stop();
  state.finished = true;
  save();
  store.del(KEY_STATE);
  const target = state.settings.target;
  const solo = isSolo();
  const ranking = rankPlayers(state.players);
  const top = ranking[0];
  logGame(ranking);
  const winners = ranking.filter((r) => r.rank === 1);
  const rounds = `${state.round} ${state.round === 1 ? 'Runde' : 'Runden'}`;
  const cardsText = (r) => `${r.sc} ${r.sc === 1 ? 'Karte' : 'Karten'}`;
  if (solo) {
    $('#end-title').textContent = top.sc >= target ? `Geschafft in ${rounds}!` : `${top.sc} von ${target} Karten nach ${rounds}`;
    $('#end-sub').textContent = cardsText(top);
  } else {
    $('#end-title').textContent = winners.length > 1
      ? `Geteilter Sieg: ${winners.map((w) => w.name).join(' & ')}`
      : `${top.name} gewinnt${top.sc >= target ? '!' : ' (meiste Karten)'}`;
    $('#end-sub').textContent = winners.length > 1 ? `${winners.length} Spieler mit je ${cardsText(top)}` : '';
  }
  $('#end-tv').style.display = solo ? '' : 'none';
  const podium = winners.length > 1 ? ranking.slice(0, 3) : [ranking[1], ranking[0], ranking[2]].filter(Boolean);
  $('#end-podium').innerHTML = solo ? '' : podium.map((r) =>
    `<div class="podium-step rank-${r.rank} ${pf(r.i)}">
      <div class="podium-name">${r.rank === 1 ? `${ikon('krone', 'krone')} ` : ''}${esc(r.name)}</div>
      <div class="podium-score">${cardsText(r)}</div>
      <div class="podium-block" style="height:${podiumHeight(r.sc, top.sc)}px">${r.rank}</div>
    </div>`).join('');
  $('#end-ranking').innerHTML = solo ? '' : `<ol class="ranking">${ranking.map((r) =>
    `<li value="${r.rank}" class="${pf(r.i)}"><span class="r-name">${esc(r.name)}</span><span class="r-cards">${cardsText(r)}</span></li>`).join('')}</ol>`;
  $('#end-tabs').innerHTML = solo ? '' : ranking.map((r) => `<button type="button" class="btn small ghost ${pf(r.i)}" data-end="${r.i}">${esc(r.name)}</button>`).join('');
  $$('#end-tabs [data-end]').forEach((b) => b.addEventListener('click', () => showEndCards(+b.dataset.end)));
  renderEndTimes(solo);
  showEndCards(top.i);
  showScreen('end');
  if (!solo || top.sc >= target) startFireworks($('#fireworks'));
}

/** Gesamtzeit groß, bei mehreren Spielern im Vergleich, schnellste zuerst. */
function renderEndTimes(solo) {
  const box = $('#end-times');
  box.hidden = !state.settings.trackTime;
  if (box.hidden) return;
  const list = state.players.slice().sort((a, b) => a.time - b.time);
  const max = Math.max(...list.map((p) => p.time), 1);
  box.innerHTML = solo
    ? `<h3>${ikon('uhr')} Gesamtzeit</h3><div class="time-big">${fmtDuration(list[0].time)}</div>`
    : `<h3>${ikon('uhr')} Gesamtzeit</h3>${list.map((p) =>
      `<div class="time-row ${pf(state.players.indexOf(p))}"><span class="time-name">${esc(p.name)}</span><span class="time-bar"><i style="width:${(p.time / max) * 100}%"></i></span><span class="time-val">${fmtDuration(p.time)}</span></div>`).join('')}`;
}

/** Zeitleiste und falsch geratene Karten eines Spielers in der Auswertung. */
function showEndCards(i) {
  const p = state.players[i];
  $('#end-tl-title').textContent = `Zeitleiste von ${p.name} (${p.timeline.length} ${p.timeline.length === 1 ? 'Karte' : 'Karten'})`;
  $('#end-tl').innerHTML = tlSongs(p).map((s) => karteRueck(s, { klein: true })).join('');
  const wrong = p.wrong.map(S).filter(Boolean).sort((a, b) => a.jahr - b.jahr);
  $('#end-wrong-title').textContent = `Falsch geraten (${wrong.length})`;
  $('#end-wrong').innerHTML = wrong.map((s) => karteRueck(s, { klein: true, klasse: 'wrong' })).join('') || '<div class="muted">Keine falschen Karten.</div>';
  fitOverlap($('#end-tl'));
  fitOverlap($('#end-wrong'));
  $$('#end-tabs [data-end]').forEach((b) => b.classList.toggle('on', +b.dataset.end === i));
}

/* ------------------------------------------------------------------ Rendern */
let screen = 'setup';
let backTo = 'setup'; // Bildschirm, zu dem der Reiter „Spielen“ von der Statistik zurückführt

function showScreen(name) {
  screen = name;
  for (const s of ['setup', 'game', 'end', 'stats']) $(`#screen-${s}`).hidden = s !== name;
  $('#btn-menu').hidden = name !== 'game';
  $('#tab-play').classList.toggle('on', name !== 'stats');
  $('#tab-stats').classList.toggle('on', name === 'stats');
  document.body.classList.toggle('on-setup', name === 'setup');
  window.scrollTo(0, 0);
}

function youtubeLink(id) {
  const https = `https://www.youtube.com/watch?v=${id}`;
  if (/android/i.test(navigator.userAgent)) {
    return { href: `intent://www.youtube.com/watch?v=${id}#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=${encodeURIComponent(https)};end`, target: '' };
  }
  return { href: https, target: ' target="_blank" rel="noopener"' };
}

function render() {
  if (!state || !state.cur) return;
  const p = activeP();
  renderScoreboard();
  $('#turn-banner').className = `turn-banner ${pf(state.active)}`;
  $('#turn-banner').innerHTML = `<span class="tb-name">${esc(p.name)}</span> ist dran <span class="muted small">· Runde ${state.round}${DEV ? ' · Dev-Modus' : ''}</span>${targetReached() && !isSolo() ? ' <span class="last-round">Letzte Runde</span>' : ''}`;
  renderTimeline();
  renderDeck();
  renderControls();
  renderReveal();
}

function renderScoreboard() {
  const target = state.settings.target;
  $('#scoreboard').innerHTML = state.players.map((pl, i) =>
    `<button class="score ${pf(i)} ${i === state.active ? 'active' : ''}" data-i="${i}">
      <span class="s-name">${esc(pl.name)}${pl.handicap ? ` <span class="s-hc" title="Handicap: ${esc(handicapLabel(pl.handicap, KATEGORIEN))}">${ikon('waage')}</span>` : ''}</span>
      <span class="s-cards">Karten <b>${score(pl)}</b>/${target}</span>
      <span class="s-skips" title="Gratis-Überspringen übrig">${ikon('skip')} ${pl.freeSkips}</span>
    </button>`).join('');
  $$('#scoreboard .score').forEach((b) => b.addEventListener('click', () => showTimeline(+b.dataset.i)));
}

/** Seed der Ringe: Zahl der bisher gezogenen Karten. Wechselt pro Zug, bleibt beim Neuzeichnen gleich und verrät nichts über die Karte. */
const ringSeed = () => (state ? state.used.length : 0);

function renderTimeline() {
  const c = state.cur;
  const el = $('#timeline');
  const scroll = el.scrollLeft;
  const tl = tlSongs(activeP());
  const song = S(c.songId);
  let html = '';
  if (c.phase === 'reveal') {
    const r = c.result;
    tl.forEach((s, i) => {
      if (!r.correct && i === c.gap) html += karteRueck(song, { klein: true, klasse: 'wrong new' });
      html += karteRueck(s, { klein: true, klasse: s.id === song.id ? 'correct new' : '' });
    });
    if (!r.correct && c.gap === tl.length) html += karteRueck(song, { klein: true, klasse: 'wrong new' });
  } else {
    for (let i = 0; i <= tl.length; i++) {
      const placed = c.gap === i;
      html += `<div class="gap ${placed ? 'placed' : ''}" data-gap="${i}">${placed ? karteVorn({ status: audioStatus, kein: !song.youtube_id, seed: ringSeed() }) : ''}</div>`;
      if (i < tl.length) html += karteRueck(tl[i], { klein: true });
    }
  }
  el.innerHTML = html;
  fitOverlap(el);
  el.scrollLeft = scroll;
  $$('[data-drag]', el).forEach(bindDrag);
}

/** Karten überlappen lassen, sobald sonst seitlich gescrollt werden müsste. */
function fitOverlap(el) {
  if (!el.clientWidth) return;
  const cards = $$('.karte', el);
  const pad = parseFloat(getComputedStyle(el).getPropertyValue('--tl-pad')) || 0;
  const w = cards.length ? cards[0].offsetWidth + 8 : 0;
  const avail = el.clientWidth - 2 * pad;
  // Leere Ablageplätze brauchen Platz, solange nichts überlappt. Reicht der Platz dafür nicht, überlappen die Karten und die Plätze schrumpfen.
  const leer = $$('.gap:not(.placed)', el).length;
  const slot = parseFloat(getComputedStyle(el).getPropertyValue('--slot-w')) || 0;
  let px = cards.length ? overlapPx(cards.length, w, avail - leer * slot) : 0;
  if (px > 0) px = Math.max(overlapPx(cards.length, w, avail), 1);
  el.style.setProperty('--overlap', `${px}px`);
  // Anteil der Karte, der bei Überlappung sichtbar bleibt (Texte bleiben links, damit sie nicht verdeckt werden)
  el.style.setProperty('--sicht', cards.length ? (1 - px / cards[0].offsetWidth).toFixed(3) : '1');
  el.classList.toggle('overlap', px > 0);
}

function renderDeck() {
  const c = state.cur;
  const d = $('#deck');
  if (c.phase !== 'listen') { d.innerHTML = ''; return; }
  const song = S(c.songId);
  const audioNote = song.youtube_id ? '' : '<div class="muted small">Kein Video – Dev-Modus ohne Audio</div>';
  if (c.gap === null) {
    d.innerHTML = `<div class="deck-slot">${karteVorn({ klasse: 'pulse', status: audioStatus, kein: !song.youtube_id, seed: ringSeed() })}</div>
      <div class="deck-hint">Höre das Intro und ziehe die Karte an die richtige Stelle deiner Zeitleiste.${audioNote}</div>`;
    $$('[data-drag]', d).forEach(bindDrag);
  } else {
    d.innerHTML = `<button type="button" class="deck-slot deck-return" id="deck-return">${ikon('undo')}<small>Zurücklegen</small></button>
      <div class="deck-hint">Karte liegt. Du kannst sie verschieben oder hierher zurückziehen.${audioNote}</div>`;
    $('#deck-return').onclick = () => setGap(null);
  }
}

function renderControls() {
  const c = state.cur;
  const el = $('#controls');
  if (c.phase !== 'listen') { el.innerHTML = ''; return; }
  const p = activeP();
  const hasAudio = !!S(c.songId).youtube_id;
  const skipsLeft = canSkip(p);
  el.innerHTML = `
    <div class="row player-row">
      <button class="btn" id="btn-restart" ${hasAudio ? '' : 'disabled'}>${ikon('restart')} Neu ab Start</button>
      <button class="btn hint" id="btn-hint" ${hasAudio ? '' : 'disabled'}>${ikon('bulb')} Hinweis: Video einblenden <small>(gratis)</small></button>
    </div>
    <div class="stall" id="stall" ${c.stalled ? '' : 'hidden'}>
      <span>${youtubeBlocked() ? 'YouTube lehnt gerade alle Videos ab. Die betroffenen Intros bleiben im Pool. Versuche es gleich noch einmal oder lade die Seite neu.' : 'Noch keine Musik? Tippe auf Abspielen. Läuft Werbung, kannst du sie im Player überspringen.'}</span>
      <div class="row">
        ${youtubeBlocked() ? `<button class="btn small" id="btn-yt-retry">${ikon('restart')} Erneut versuchen</button>` : ''}
        <button class="btn small" id="btn-stall-player">${ikon('tv')} Player zeigen</button>
        <button class="btn small" id="btn-other-song">Anderes Intro (gratis)</button>
      </div>
    </div>
    <div class="row action-row">
      <button class="btn ghost" id="btn-skip" ${skipsLeft ? '' : 'disabled'}>Überspringen <small>(${skipsLeft ? 'einmal gratis' : 'verbraucht'})</small></button>
      <button class="btn primary big" id="btn-reveal" ${c.gap !== null ? '' : 'disabled'}>Auflösen</button>
    </div>`;
  $('#btn-restart').onclick = () => {
    if (!YTP.isReady()) { toast('Player lädt noch …'); return; }
    setAudioStatus('loading');
    YTP.restart();
  };
  $('#btn-skip').onclick = skip;
  $('#btn-other-song').onclick = () => replaceSong('Neue Karte.');
  $('#btn-hint').onclick = () => showPlayer('hint');
  $('#btn-stall-player').onclick = () => showPlayer('ad');
  if (youtubeBlocked()) $('#btn-yt-retry').onclick = () => loadAudio(true);
  $('#btn-reveal').onclick = reveal;
}

function renderReveal() {
  const c = state.cur;
  const el = $('#reveal');
  if (c.phase !== 'reveal') { el.hidden = true; el.innerHTML = ''; return; }
  const r = c.result;
  const song = S(c.songId);
  const p = activeP();
  const gameOver = gameDecided();
  const nextName = state.players[nextPlayer()].name;
  const yt = song.youtube_id ? youtubeLink(song.youtube_id) : null;
  const unsicher = song.jahr_quelle === 'A' || song.jahr_quelle === 'K';
  el.hidden = false;
  el.innerHTML = `<div class="reveal-card">${karteFlip(song, { klasse: `gross ${r.correct ? 'correct' : 'wrong'}`, seed: ringSeed() })}</div>
    <div class="reveal-info">
      <div class="verdict ${r.correct ? 'ok' : 'bad'}">${ikon(r.correct ? 'haken' : 'kreuz')} ${r.correct ? `Richtig! ${esc(p.name)} behält die Karte.` : 'Leider falsch – die Karte fliegt raus.'}</div>
      <div class="line reveal-jahr">Deutsche Erstausstrahlung: <b>${esc(song.jahr)}</b> · ${esc(song.sender)}</div>
      <div class="line reveal-kat">Kategorie: <b>${esc(song.kategorie)}</b></div>
      ${unsicher ? '<div class="line muted small">Das Jahr ist eine Annahme und nicht sicher belegt.</div>' : ''}
      ${state.settings.trackTime ? `<div class="line">${ikon('uhr')} ${fmtDuration(c.elapsed)} für diese Karte · ${esc(p.name)} gesamt ${fmtDuration(p.time)}</div>` : ''}
      ${yt ? `<div class="row"><a class="btn yt" id="btn-yt" href="${esc(yt.href)}"${yt.target}>${ikon('play')} Ganzes Video auf YouTube</a></div>` : ''}
      <div class="row"><button class="btn primary big" id="btn-next">${gameOver ? (isSolo() ? 'Zur Auswertung' : 'Zur Siegerehrung') : `Weiter: ${esc(nextName)}`}</button></div>
    </div>`;
  $('#btn-next').onclick = nextTurn;
  if (yt) $('#btn-yt').addEventListener('click', () => YTP.pause());
}

function showTimeline(i) {
  const p = state.players[i];
  $('#tl-title').textContent = `Zeitleiste von ${p.name} (${p.timeline.length} ${p.timeline.length === 1 ? 'Karte' : 'Karten'})`;
  $('#tl-view').innerHTML = tlSongs(p).map((s) => karteRueck(s, { klein: true })).join('') || '<div class="muted">Noch keine Karten.</div>';
  $('#dlg-timeline').showModal();
  fitOverlap($('#tl-view'));
}

function scrollToGap(g) {
  const el = $(`#timeline .gap[data-gap="${g}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
function scrollToCard(id) {
  const el = $(`#timeline .karte.new[data-id="${CSS.escape(id)}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

/* ------------------------------------------------------------------ Drag & Drop (Pointer-Events, Touch-tauglich) */
let drag = null;
let dragEndedAt = 0; // nach einem Ziehen löst der Play-Knopf keinen Klick aus
const DRAG_BAND = 140; // so weit darf der Finger über/unter der Zeitleiste sein

function bindDrag(card) {
  card.addEventListener('pointerdown', onDragStart);
}

function onDragStart(e) {
  const c = state.cur;
  if (c.phase !== 'listen') return;
  if (e.button !== undefined && e.button !== 0) return;
  const onPlay = !!e.target.closest('.karte-play');
  // Auf dem Play-Knopf bleibt der Klick erhalten, gezogen wird trotzdem ab 6 px
  if (!onPlay) e.preventDefault();
  const src = e.currentTarget;
  const rect = src.getBoundingClientRect();
  drag = { src, onPlay, startX: e.clientX, startY: e.clientY, dx: e.clientX - rect.left, dy: e.clientY - rect.top, w: rect.width, h: rect.height, ghost: null, gap: null, moved: false, x: e.clientX, y: e.clientY, raf: null };
  window.addEventListener('pointermove', onDragMove, { passive: false });
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragCancel);
}

function onDragMove(e) {
  if (!drag) return;
  e.preventDefault();
  drag.x = e.clientX; drag.y = e.clientY;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
    drag.moved = true;
    const g = drag.src.cloneNode(true);
    g.classList.add('ghost');
    g.classList.remove('pulse');
    g.style.width = `${drag.w}px`;
    g.style.height = `${drag.h}px`;
    document.body.appendChild(g);
    drag.ghost = g;
    drag.src.classList.add('drag-src');
    document.body.classList.add('dragging');
    drag.raf = requestAnimationFrame(autoScroll);
  }
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(-4deg)`;
  updateDropTarget();
}

function updateDropTarget() {
  const tlEl = $('#timeline');
  const r = tlEl.getBoundingClientRect();
  let best = null;
  const slot = $('#deck .deck-slot');
  const sr = slot ? slot.getBoundingClientRect() : null;
  drag.overDeck = !!sr && drag.x > sr.left - 12 && drag.x < sr.right + 12 && drag.y > sr.top - 12 && drag.y < sr.bottom + 12;
  if (slot) slot.classList.toggle('hover', drag.overDeck);
  if (!drag.overDeck && drag.y > r.top - DRAG_BAND && drag.y < r.bottom + DRAG_BAND) {
    let bestD = Infinity;
    for (const g of $$('.gap', tlEl)) {
      const gr = g.getBoundingClientRect();
      if (gr.right < r.left - 20 || gr.left > r.right + 20) continue; // nicht sichtbar
      const d = Math.abs(drag.x - (gr.left + gr.width / 2));
      if (d < bestD) { bestD = d; best = g; }
    }
  }
  $$('.gap.hover', tlEl).forEach((g) => g !== best && g.classList.remove('hover'));
  if (best) best.classList.add('hover');
  drag.gap = best ? +best.dataset.gap : null;
}

function autoScroll() {
  if (!drag) return;
  const tlEl = $('#timeline');
  const r = tlEl.getBoundingClientRect();
  if (!drag.overDeck && drag.y > r.top - DRAG_BAND && drag.y < r.bottom + DRAG_BAND) {
    const edge = Math.min(90, r.width / 4);
    const speed = (depth) => 3 + 9 * Math.min(1, depth / edge);
    if (drag.x < r.left + edge) tlEl.scrollLeft -= speed(r.left + edge - drag.x);
    else if (drag.x > r.right - edge) tlEl.scrollLeft += speed(drag.x - (r.right - edge));
    updateDropTarget();
  }
  drag.raf = requestAnimationFrame(autoScroll);
}

function cleanupDrag() {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragCancel);
  if (drag) {
    if (drag.raf) cancelAnimationFrame(drag.raf);
    if (drag.ghost) drag.ghost.remove();
    drag.src.classList.remove('drag-src');
  }
  document.body.classList.remove('dragging');
  $$('#timeline .gap.hover').forEach((g) => g.classList.remove('hover'));
  $$('#deck .deck-slot.hover').forEach((s) => s.classList.remove('hover'));
}

function onDragEnd() {
  const d = drag;
  cleanupDrag();
  drag = null;
  if (d && d.moved) dragEndedAt = Date.now();
  if (d && d.moved && d.overDeck) { if (state.cur.gap !== null) setGap(null); }
  else if (d && d.moved && d.gap !== null) setGap(d.gap);
  else if (d && !d.moved && !d.onPlay && state.cur.gap === null) toast('Ziehe die Karte in die Zeitleiste.');
}
function onDragCancel() { cleanupDrag(); drag = null; }

/* ------------------------------------------------------------------ Abspielen */
/** Aktualisiert alle Play-Knöpfe (verdeckte Karte in Deck oder Zeitleiste). */
function setAudioStatus(st) {
  audioStatus = st;
  const k = playKnopf(st);
  for (const b of $$('[data-play]')) {
    b.innerHTML = k.html;
    b.setAttribute('aria-label', k.label);
  }
  // Ringe drehen sich, solange das Intro läuft; beim Laden pulsiert der Knopf
  for (const c of $$('.karte-vorn[data-drag]')) {
    c.classList.toggle('spielt', st === 'playing');
    c.classList.toggle('laedt', st === 'loading');
  }
}

function togglePlay() {
  if (Date.now() - dragEndedAt < 400) return;
  if (!YTP.isReady()) { toast('Player lädt noch …'); return; }
  if (audioStatus === 'idle' || audioStatus === 'paused') setAudioStatus('loading');
  YTP.toggle();
}

/** Das Intro hängt: nichts automatisch überspringen, die Spieler entscheiden. */
function handleStall(st, cur) {
  if (!state || !state.cur || state.cur.phase !== 'listen') return;
  const song = S(state.cur.songId);
  if (!song || !cur || cur.videoId !== song.youtube_id) return;
  logError(song, `timeout (Status ${st})`);
  state.cur.stalled = true;
  save();
  const box = $('#stall');
  if (box) box.hidden = false;
}

/** Einzelne Fehler ersetzen die Karte kostenlos. Bei einer Serie liegt es an YouTube: anhalten, statt den Pool zu verbrauchen. */
function handlePlayError(song, code) {
  errorSeries.push(song.id);
  if (!youtubeBlocked()) { replaceSong(`Video nicht abspielbar (Fehler ${code}) – neue Karte.`); return; }
  state.used = giveBackSongs(state.used, errorSeries, song.id);
  state.cur.stalled = true;
  setAudioStatus('idle');
  save();
  render();
  toast(`YouTube spielt gerade nichts ab (Fehler ${code}).`, 5000);
}

/** Nicht gestartet (Autoplay blockiert oder Werbung): Hinweis zeigen, nichts neu laden. */
function handleBlocked(cur) {
  setAudioStatus('idle');
  if (!state || !state.cur || state.cur.phase !== 'listen') return;
  const song = S(state.cur.songId);
  if (!song || !cur || cur.videoId !== song.youtube_id) return;
  state.cur.stalled = true;
  save();
  const box = $('#stall');
  if (box) box.hidden = false;
}

/* ------------------------------------------------------------------ Player einblenden (Werbung überspringen) */
let playerShown = false;
let playerMode = 'ad'; // ad: Ausschnitt zum Überspringen | hint: ganzes Video als Hinweis
let shownWhilePlaying = false;

function showPlayer(mode = 'ad') {
  playerShown = true;
  playerMode = mode;
  shownWhilePlaying = YTP.state() === YTP.State.PLAYING;
  const wrap = $('#yt-wrap');
  wrap.classList.add('show');
  wrap.classList.toggle('masked', mode === 'ad');
  wrap.classList.toggle('hint-bar', mode === 'hint');
  wrap.removeAttribute('aria-hidden');
  $('#yt-bar-text').textContent = mode === 'hint'
    ? 'Hinweis: Das Video bleibt sichtbar, bis du es schließt.'
    : 'Sobald im Ausschnitt „Überspringen“ erscheint, tippe darauf. Das Fenster schließt sich, wenn das Intro startet.';
  $('#btn-unmask-player').hidden = mode === 'hint';
  $('#yt-bar').hidden = false;
}

function hidePlayer() {
  playerShown = false;
  const wrap = $('#yt-wrap');
  wrap.classList.remove('show', 'masked', 'hint-bar');
  wrap.setAttribute('aria-hidden', 'true');
  $('#yt-bar').hidden = true;
}

/* ------------------------------------------------------------------ Zeit tracken */
let clockFrom = null; // Beginn der laufenden Messung, die Summen stehen im Spielstand

/** Läuft ab dem ersten Abspielen oder Ziehen. Lade- und Werbezeit zählen so nicht mit. */
function clockStart() {
  const c = state && state.cur;
  if (!c || !state.settings.trackTime || c.phase !== 'listen' || clockFrom !== null || document.hidden) return;
  c.clockOn = true;
  clockFrom = Date.now();
}

function clockStop() {
  if (clockFrom === null) return;
  const dt = Date.now() - clockFrom;
  clockFrom = null;
  state.cur.elapsed += dt;
  activeP().time += dt;
}

/** Versteckter Tab zählt nicht, beim Schließen bleibt die bisherige Zeit gespeichert. */
function clockVisibility() {
  if (document.hidden) { clockStop(); save(); }
  else if (state && state.cur && state.cur.clockOn) clockStart();
}

/* ------------------------------------------------------------------ Intro testen */
let testSong = null;

function testStop() {
  if (!testSong) return;
  testSong = null;
  $('#test-box').hidden = true;
  hidePlayer();
  YTP.stop();
}

function testPlay(from) {
  hidePlayer();
  YTP.load(testSong.youtube_id, from, true);
}

function testPick(s) {
  testSong = s;
  $('#test-box').hidden = false;
  $('#test-info').innerHTML = `<b>${esc(s.serie)}</b> · ${esc(s.songtitel)}<div class="muted small">${s.jahr} · ${esc(s.sender)} · Karte ${esc(s.id)} · Start bei ${songStart(s)} s</div>`;
  testPlay(songStart(s));
  testTick();
}

function testTick() {
  if (!testSong) return;
  const playing = YTP.isPlaying();
  $('#test-pos').textContent = `Position ${Math.floor(YTP.position())} s (${fmtDuration(YTP.position() * 1000)} von ${fmtDuration(YTP.duration() * 1000)})`;
  $('#btn-test-toggle').innerHTML = playing ? `${ikon('pause')} Pause` : `${ikon('play')} Weiter`;
}

function initTest() {
  let found = [];
  $('#test-search').addEventListener('input', (e) => {
    found = searchSongs(DATA.songs.filter(hasVideo), e.target.value);
    const none = e.target.value.trim() && !found.length;
    $('#test-results').innerHTML = none ? '<li class="muted small">Kein Intro gefunden.</li>' : found.map((s, i) =>
      `<li><button type="button" data-i="${i}"><b>${s.jahr}</b><span>${esc(s.serie)} – ${esc(s.songtitel)}</span></button></li>`).join('');
  });
  $('#test-results').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) testPick(found[+b.dataset.i]);
  });
  $('#btn-test-start').onclick = () => testPlay(songStart(testSong));
  $('#btn-test-zero').onclick = () => testPlay(0);
  $('#btn-test-toggle').onclick = () => YTP.toggle();
  $('#btn-test-video').onclick = () => showPlayer('hint');
  $('#advanced').addEventListener('toggle', () => { if (!$('#advanced').open) testStop(); });
  setInterval(testTick, 500);
}

/* ------------------------------------------------------------------ Player-Ereignisse */
/** Lautstärkeregler, alle zeigen denselben Wert. */
function initVolume() {
  document.documentElement.classList.toggle('no-volume', volumeLocked(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
  const v = store.get(KEY_VOLUME, 100);
  YTP.setVolume(v);
  for (const r of $$('input.vol')) r.value = v;
  document.addEventListener('input', (e) => {
    const r = e.target;
    if (!r.matches || !r.matches('input.vol')) return;
    const n = Number(r.value);
    YTP.setVolume(n);
    for (const o of $$('input.vol')) if (o !== r) o.value = n;
    store.set(KEY_VOLUME, n);
  });
}

function initAudio() {
  if (!DATA.songs.some((s) => s.youtube_id)) return; // nichts abzuspielen
  initVolume();
  YTP.initPlayer({
    onState(st) {
      if (st === YTP.State.PLAYING) errorSeries = [];
      // Werbung vorbei, das Intro lädt oder startet: Player sofort verstecken, damit nichts verraten wird
      if (playerShown && playerMode === 'ad' && !shownWhilePlaying && (st === YTP.State.PLAYING || st === YTP.State.BUFFERING)) hidePlayer();
      if (st !== YTP.State.PLAYING) shownWhilePlaying = false;
      if (testSong) return;
      if (st === YTP.State.PLAYING) clockStart();
      if (st === YTP.State.PLAYING) setAudioStatus('playing');
      else if (st === YTP.State.BUFFERING) setAudioStatus('loading');
      else if (st === YTP.State.PAUSED) setAudioStatus('paused');
      else if (st === YTP.State.ENDED || st === YTP.State.CUED) setAudioStatus('idle');
      if (st === YTP.State.PLAYING && state && state.cur && state.cur.stalled) {
        state.cur.stalled = false;
        save();
        const box = $('#stall');
        if (box) box.hidden = true;
      }
    },
    onError(code, cur) {
      if (testSong) { toast(`Video nicht abspielbar (Fehler ${code}).`, 5000); return; }
      if (!state || !state.cur) return;
      const song = S(state.cur.songId);
      if (!song || !cur || cur.videoId !== song.youtube_id) return;
      logError(song, code);
      console.warn('YouTube-Fehler', code); // ohne Kartennummer: kein Spoiler
      if (state.cur.phase === 'listen') handlePlayError(song, code);
    },
    onStalled(st, cur) { handleStall(st, cur); },
    onRetry() { if (!testSong) setAudioStatus('loading'); },
    onBlocked(cur) { handleBlocked(cur); },
    onApiFail() { toast('YouTube-Player konnte nicht geladen werden (offline?).', 5000); },
  });
}

/* ------------------------------------------------------------------ Navigation */
/** Laufendes Spiel anhalten, der Stand bleibt gespeichert. */
function pauseGame() {
  clockStop();
  save();
  hidePlayer();
  YTP.stop();
}

/** Klick aufs Logo: zurück zur Startseite, ein laufendes Spiel lässt sich dort fortsetzen. */
function goHome() {
  if (screen === 'setup') return;
  if (screen === 'end' || (state && state.finished)) { state = null; location.reload(); return; }
  if (state) { pauseGame(); state = null; }
  testStop();
  offerResume();
  updateCount();
  showScreen('setup');
}

function openStats() {
  if (screen === 'stats' || !DATA.songs.length) return;
  if (screen === 'game') pauseGame();
  testStop();
  backTo = screen;
  renderOverview();
  renderSearch();
  renderHistory();
  showScreen('stats');
}

function closeStats() {
  if (screen !== 'stats') return;
  if (backTo === 'game' && state) resumeGame(state);
  else showScreen(backTo);
}

/* ------------------------------------------------------------------ Spielverlauf */
function logGame(ranking) {
  const entry = historyEntry(ranking, {
    when: new Date().toISOString(),
    pool: filterLabel(state.settings.filter, KATEGORIEN),
    target: state.settings.target,
  });
  store.set(KEY_HISTORY, [entry, ...store.get(KEY_HISTORY, [])].slice(0, HISTORY_MAX));
}

function renderHistory() {
  const list = store.get(KEY_HISTORY, []);
  $('#btn-clear-history').hidden = !list.length;
  $('#stats-history').innerHTML = list.length ? list.map((g) => {
    const winners = g.spieler.filter((p) => p.platz === 1).map((p) => p.name).join(' & ');
    const players = g.spieler.map((p) => `${esc(p.name)}: ${p.karten} ${p.karten === 1 ? 'Karte' : 'Karten'}${p.zeit ? `, ${fmtDuration(p.zeit)}` : ''}`).join(' · ');
    return `<div class="history-item">
      <div>${g.spieler.length > 1 ? `${ikon('krone', 'krone')} <b>${esc(winners)}</b>` : `<b>${esc(winners)}</b> (solo)`}</div>
      <div class="small">${players}</div>
      <div class="history-sub">${esc(new Date(g.zeit).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }))} · Pool: ${esc(g.pool)} · Ziel: ${esc(g.ziel)} Karten</div>
    </div>`;
  }).join('') : '<div class="muted small">Noch keine beendeten Spiele auf diesem Gerät.</div>';
}

/* ------------------------------------------------------------------ Statistik */
let overviewDone = false;
let senderAll = false;
let OVERVIEW = null;

function barsHTML(list, max, nachKategorie = false) {
  return list.map((e) =>
    `<div class="bar" ${nachKategorie ? `style="--kc:var(--kf${katFarbe(e.name)})"` : ''} title="${e.from === e.to ? e.from : `${e.from}–${e.to}`}"><span class="bar-name">${esc(e.name)}</span><span class="bar-track"><i style="width:${(e.count / max) * 100}%"></i></span><span class="bar-count">${e.count}</span></div>`).join('');
}

function renderSender() {
  const list = senderAll ? OVERVIEW.sender : OVERVIEW.sender.slice(0, SENDER_TOP);
  $('#stats-sender').innerHTML = barsHTML(list, OVERVIEW.sender[0].count);
  $('#btn-sender-more').hidden = OVERVIEW.sender.length <= SENDER_TOP;
  $('#btn-sender-more').textContent = senderAll ? `Nur die ${SENDER_TOP} größten zeigen` : `Alle ${OVERVIEW.sender.length} Sender anzeigen`;
}

function renderOverview() {
  if (overviewDone) return;
  overviewDone = true;
  const o = OVERVIEW = overviewStats(DATA.songs);
  const tiles = [[o.intros, 'Intros'], [o.serien, 'Serien'], [o.kategorien.length, 'Kategorien'], [o.senderAnzahl, 'Sender'], [`${o.von}–${o.bis}`, 'Erstausstrahlung']];
  $('#stats-tiles').innerHTML = tiles.map(([n, l]) => `<div class="tile"><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join('');
  $('#stats-kategorie').innerHTML = barsHTML(o.kategorien, Math.max(...o.kategorien.map((k) => k.count)), true);
  $('#stats-jahrzehnt').innerHTML = barsHTML(o.jahrzehnte, Math.max(...o.jahrzehnte.map((k) => k.count)));
  renderSender();
  $('#btn-sender-more').onclick = () => { senderAll = !senderAll; renderSender(); };
}

/** Intros nach Serie, Sender oder Jahr. Die Karte, die gerade verdeckt ist, taucht nicht auf. */
function renderSearch() {
  const box = $('#stats-result');
  const text = $('#stats-input').value;
  if (!text.trim()) { box.innerHTML = ''; return; }
  const verdeckt = state && state.cur && state.cur.phase === 'listen' ? [state.cur.songId] : [];
  const list = searchSongs(DATA.songs, text, 30, verdeckt);
  box.innerHTML = list.length ? list.map((s) =>
    `<div class="entry"><span class="entry-year">${s.jahr}</span><div><div><b>${esc(s.serie)}</b> · ${esc(s.songtitel)}</div><div class="entry-sub">${esc(s.sender)} · ${esc(s.kategorie)}</div></div></div>`).join('')
    : '<div class="muted small">Nichts gefunden.</div>';
}

/* ------------------------------------------------------------------ Info-Dialog */
function openInfo() {
  const withVideo = DATA.songs.filter(hasVideo).length;
  const years = DATA.songs.map((s) => s.jahr);
  $('#info-data').innerHTML = `
    <div>Set <b>${SET_KUERZEL}</b> · Datenquelle: <b>${esc(DATA.file)}</b>${DATA.generiert ? ` (erzeugt ${esc(DATA.generiert)})` : ''}</div>
    <div>${DATA.songs.length} Intros (${Math.min(...years)}–${Math.max(...years)}), davon ${withVideo} mit abspielbarem Video.</div>
    <div>Dev-Modus: ${DEV ? 'an' : 'aus'} <span class="muted">(URL-Parameter ?dev=1)</span></div>`;
  renderErrors();
  $('#dlg-info').showModal();
}
function renderErrors() {
  const list = readErrors();
  $('#err-count').textContent = `(${list.length})`;
  // Karten-ID und Video-ID verraten das Intro: solange eine Karte verdeckt ist, bleiben sie ausgeblendet
  const verdeckt = !!(state && state.cur && state.cur.phase === 'listen');
  $('#btn-clear-errors').hidden = verdeckt;
  $('#err-list').innerHTML = verdeckt
    ? '<div class="muted">Während eine Karte verdeckt ist, bleibt das Fehler-Log ausgeblendet.</div>'
    : list.length
      ? `<table><tr><th>Zeit</th><th>Karte</th><th>YouTube</th><th>Code</th></tr>${list.slice().reverse().map((e) =>
        `<tr><td>${esc(new Date(e.zeit).toLocaleString('de-DE'))}</td><td>${esc(e.id)}</td><td>${esc(e.youtube_id)}</td><td>${esc(e.code)}</td></tr>`).join('')}</table>`
      : '<div class="muted">Keine Fehler protokolliert.</div>';
}

/* ------------------------------------------------------------------ Start */
/** Icons, Marken und Hintergrundringe in das statische Markup einsetzen. */
function initGrafik() {
  $$('[data-ikon]').forEach((e) => { e.innerHTML = ikon(e.dataset.ikon); });
  $$('[data-marke]').forEach((e) => { e.innerHTML = markeSvg(+e.dataset.marke, { klasse: e.dataset.dreht ? 'dreht' : '' }); });
  $('#bg-ringe').innerHTML = ringeSvg(11);
}

async function main() {
  initGrafik();
  $('#btn-hide-player').onclick = hidePlayer;
  $('#btn-unmask-player').onclick = () => $('#yt-wrap').classList.remove('masked');
  // Enter schließt nur die Tastatur, löst nie etwas aus
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key === 'Enter' && t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'number')) {
      e.preventDefault();
      t.blur();
    }
  });
  // Play/Pause auf der verdeckten Karte (Deck oder Zeitleiste)
  $('#screen-game').addEventListener('click', (e) => { if (e.target.closest('[data-play]')) togglePlay(); });
  $('#btn-info').onclick = openInfo;
  $('#btn-home').onclick = goHome;
  $('#tab-stats').onclick = openStats;
  $('#tab-play').onclick = closeStats;
  $('#btn-clear-history').onclick = () => {
    if (!confirm('Alle vergangenen Spiele auf diesem Gerät löschen?')) return;
    store.del(KEY_HISTORY);
    renderHistory();
  };
  $('#btn-clear-errors').onclick = () => { store.del(KEY_ERRORS); renderErrors(); };
  $('#btn-menu').onclick = () => $('#dlg-menu').showModal();
  $('#btn-end-game').onclick = () => { $('#dlg-menu').close(); endGame(); };
  $('#btn-abort-game').onclick = () => {
    $('#dlg-menu').close();
    if (!confirm('Spiel wirklich abbrechen? Der Spielstand wird gelöscht.')) return;
    YTP.stop(); store.del(KEY_STATE); state = null; location.reload();
  };
  $('#btn-new-game').onclick = () => { state = null; location.reload(); };
  document.addEventListener('visibilitychange', clockVisibility);
  window.addEventListener('pagehide', () => { clockStop(); save(); });
  const tlObserver = new ResizeObserver((list) => list.forEach((x) => fitOverlap(x.target)));
  for (const id of ['#timeline', '#tl-view', '#end-tl', '#end-wrong']) tlObserver.observe($(id));
  initTest();
  initHandicap();

  try {
    DATA = await loadSongs();
  } catch (e) {
    $('#loading').textContent = e.message;
    return;
  }
  BY_ID = new Map(DATA.songs.map((s) => [s.id, s]));
  KATEGORIEN = kategorien(DATA.songs);
  $('#loading').hidden = true;
  $('#setup').hidden = false;
  initSetup();
  initAudio();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
  }
}

// Für Tests/Inspektion
window.KTV = {
  get state() { return state; },
  get data() { return DATA; },
  pool,
  song: S,
  draw: () => state && draw(),
  setGap: (g) => setGap(g),
  reveal: () => reveal(),
  next: () => nextTurn(),
  skip: () => skip(),
  score: (p) => score(p),
  stall: (st, cur) => handleStall(st, cur),
  showPlayer: (mode) => showPlayer(mode),
  fit: () => fitOverlap($('#timeline')),
  end: () => endGame(),
  openStats: () => openStats(),
  closeStats: () => closeStats(),
  goHome: () => goHome(),
  get screen() { return screen; },
  render: () => render(),
  errors: readErrors,
  player: YTP,
  dev: DEV,
};

main();
