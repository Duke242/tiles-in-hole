// Goal card, clock, and the win/lose calls. A free-play board has no card
// and no clock: it only counts what was eaten and how long it took, and
// finishes when the game says the board is bare.
export function createProgress(level, { onWin, onLose }) {
  const free = !!level.free;
  const state = {
    goals: level.goals.map((g) => ({ ...g, have: 0 })),
    time: level.time, left: level.time, elapsed: 0,
    status: 'playing', eaten: 0, freeze: 0, started: false, free,
  };

  function credit(key, n) {
    state.eaten += n;
    if (state.status !== 'playing' || free) return;
    const g = state.goals.find((x) => x.key === key);
    if (!g || g.have >= g.need) return;
    g.have = Math.min(g.need, g.have + n);
    if (state.goals.every((x) => x.have >= x.need)) {
      state.status = 'won';
      onWin(state);
    }
  }

  function update(dt) {
    if (state.status !== 'playing' || !state.started) return;
    state.elapsed += dt;
    if (free) return;
    if (state.freeze > 0) { state.freeze -= dt; return; }
    state.left -= dt;
    if (state.left <= 0) {
      state.left = 0;
      state.status = 'lost';
      onLose(state);
    }
  }

  function fail(reason) {
    if (state.status !== 'playing') return;
    state.status = 'lost';
    state.reason = reason;
    onLose(state);
  }
  function addTime(s) { state.left += s; }
  function revive(s) { state.left = s; state.status = 'playing'; }
  function finish() {
    if (state.status !== 'playing') return;
    state.status = 'won';
    onWin(state);
  }

  return { state, credit, update, addTime, revive, fail, finish };
}
