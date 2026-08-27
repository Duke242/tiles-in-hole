import { TIERS } from './tune.js';

// Score, combo, tier unlocks and the win condition.
export function createProgress(world, onUnlock, onWin) {
  const state = {
    value: 0, total: world.totalValue,
    count: 0, totalCount: world.totalCount,
    combo: 0, comboTimer: 0, best: 0,
    score: 0, tier: 0, won: false, time: 0,
  };

  function bump() {
    state.combo++;
    state.comboTimer = 1.3;
    if (state.combo > state.best) state.best = state.combo;
  }

  function creditRaw(v) {
    state.value += v;
    state.score += Math.round(v * (1 + Math.min(state.combo, 40) * 0.06));
  }

  function credit(o, silent = false) {
    creditRaw(o.value ?? 0);
    state.count++;
    if (!silent) bump();
    if (state.count >= state.totalCount && !state.won) {
      state.won = true;
      onWin(state);
    }
  }

  function update(dt, holeR) {
    state.time += dt;
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
    let t = 0;
    for (let i = 0; i < TIERS.length; i++) if (holeR >= TIERS[i].r) t = i;
    if (t > state.tier) {
      state.tier = t;
      onUnlock(TIERS[t], t);
    }
  }

  function nextTier(holeR) {
    for (const t of TIERS) if (t.r > holeR) return t;
    return null;
  }

  return { state, credit, creditRaw, update, nextTier };
}
