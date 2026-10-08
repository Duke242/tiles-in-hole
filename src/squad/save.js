// Squad Rush progress in localStorage. Blocked storage (private mode) just
// means starting from level 1 each visit.
const KEY = 'squadrush.save.v1';
const DEFAULTS = { unlocked: 1, sound: true, best: 0, bestBoss: 0, levels: {} };

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...s, levels: { ...(s.levels || {}) } };
  } catch (_) {
    return structuredClone(DEFAULTS);
  }
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* storage blocked */ }
}
