// Progress lives in localStorage; everything is optional so a blocked storage
// (private mode) still lets you play from level 1.
const KEY = 'tih.save.v1';

const DEFAULTS = { level: 1, coins: 0, sound: true, boosters: { boost: 3, magnet: 3, time: 3 } };

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...s, boosters: { ...DEFAULTS.boosters, ...(s.boosters || {}) } };
  } catch (_) {
    return structuredClone(DEFAULTS);
  }
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* storage blocked */ }
}
