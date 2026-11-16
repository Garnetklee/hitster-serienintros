// Einstellungen und Migration gespeicherter Stände (ohne DOM)

export const SETTINGS_VERSION = 1;
export const TARGET_CHOICES = [3, 5, 7, 10, 15];
export const DEFAULT_TARGET = 10;
export const MIN_TARGET = 3;
export const MAX_TARGET = 30;

/** Standardfilter: keine Kategorie gewählt (= alle), Zeitraum offen und damit aus den Daten. */
const defaultFilter = () => ({ kategorien: [], from: null, to: null, toMax: true });

/** Standard-Einstellungen für alles, was in einem gespeicherten Stand fehlen kann. */
export const defaultSettings = () => ({
  v: SETTINGS_VERSION,
  players: ['Spieler 1', 'Spieler 2'],
  target: DEFAULT_TARGET,
  filter: defaultFilter(),
  trackTime: false,
  handicaps: [],
});

function fillFilter(f) {
  const d = defaultFilter();
  const o = f && typeof f === 'object' ? f : {};
  return {
    kategorien: Array.isArray(o.kategorien) ? o.kategorien.map(String) : d.kategorien,
    from: Number(o.from) || d.from,
    to: Number(o.to) || d.to,
    toMax: o.toMax === undefined ? d.toMax : !!o.toMax,
  };
}

/** Gespeicherte Setup-Einstellungen: unbekannte Felder bleiben, fehlende bekommen Standardwerte. */
export function migrateSettings(st) {
  if (!st || typeof st !== 'object') return null;
  const d = defaultSettings();
  return {
    ...st,
    v: SETTINGS_VERSION,
    players: Array.isArray(st.players) && st.players.length ? st.players.map(String) : d.players,
    target: Math.min(MAX_TARGET, Math.max(MIN_TARGET, Number(st.target) || d.target)),
    filter: fillFilter(st.filter),
    trackTime: !!st.trackTime,
    handicaps: Array.isArray(st.handicaps) ? st.handicaps : d.handicaps,
  };
}

/** Laufendes Spiel aus einer älteren Version: fehlende Felder mit Standardwerten auffüllen. */
export function migrateState(saved) {
  saved.settings = migrateSettings(saved.settings) || defaultSettings();
  saved.first = saved.first ?? 0;
  saved.round = saved.round || 1;
  saved.active = saved.active || 0;
  saved.used = Array.isArray(saved.used) ? saved.used : [];
  for (const p of saved.players) {
    p.timeline = Array.isArray(p.timeline) ? p.timeline : [];
    p.handicap = p.handicap ?? null;
    p.freeSkips = p.freeSkips ?? 1;
    p.wrong = p.wrong || [];
    p.time = p.time || 0;
  }
  const c = saved.cur;
  if (c) {
    c.phase = c.phase || 'listen';
    c.gap = c.gap ?? null;
    c.elapsed = c.elapsed || 0;
    c.clockOn = !!c.clockOn;
    c.stalled = !!c.stalled;
    c.result = c.result ?? null;
  }
  return saved;
}
