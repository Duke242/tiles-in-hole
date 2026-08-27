import { CITY } from '../game/tune.js';

// DOM overlay: progress, size, combo, unlock toasts and the minimap.
export function createHUD(world) {
  const el = (id) => document.getElementById(id);
  const bar = el('barFill');
  const pctText = el('pctText');
  const sizeText = el('sizeText');
  const scoreText = el('scoreText');
  const comboEl = el('combo');
  const tierEl = el('tierLabel');
  const toastWrap = el('toasts');
  const mini = el('mini');
  const mctx = mini.getContext('2d');

  let toastTimer = 0;

  function toast(text, sub) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ''}`;
    toastWrap.appendChild(d);
    requestAnimationFrame(() => d.classList.add('in'));
    setTimeout(() => {
      d.classList.remove('in');
      setTimeout(() => d.remove(), 600);
    }, 2400);
  }

  function update(progress, hole, nextTier) {
    const s = progress.state;
    const pct = Math.min(100, (s.value / s.total) * 100);
    bar.style.width = pct.toFixed(1) + '%';
    pctText.textContent = pct < 10 ? pct.toFixed(1) + '%' : Math.floor(pct) + '%';
    sizeText.textContent = hole.state.r.toFixed(1);
    scoreText.textContent = s.score.toLocaleString();
    if (s.combo >= 4) {
      comboEl.classList.add('show');
      comboEl.textContent = 'COMBO ×' + s.combo;
    } else comboEl.classList.remove('show');
    const nt = nextTier(hole.state.r);
    tierEl.textContent = nt
      ? `Next unlock at size ${nt.r.toFixed(0)} — ${nt.label}`
      : 'Everything is on the menu';
  }

  // --- minimap ------------------------------------------------------------
  const MS = 132;
  mini.width = MS * 2; mini.height = MS * 2;
  mini.style.width = MS + 'px'; mini.style.height = MS + 'px';
  mctx.scale(2, 2);
  const scale = MS / (CITY.SPAN + 20);

  function drawMini(hole) {
    mctx.clearRect(0, 0, MS, MS);
    mctx.fillStyle = 'rgba(255,255,255,0.55)';
    mctx.fillRect(0, 0, MS, MS);
    // blocks
    for (const b of world.blocks) {
      mctx.fillStyle = b.giant ? '#b98cf0' : b.kind === 'park' ? '#8ed99a'
        : b.kind === 'downtown' ? '#9aa2b4' : b.kind === 'commercial' ? '#c9bfa6' : '#a8dcae';
      const x = (b.bx * CITY.P + CITY.RW + 10) * scale;
      const y = (b.bz * CITY.P + CITY.RW + 10) * scale;
      mctx.fillRect(x, y, CITY.INNER * scale, CITY.INNER * scale);
    }
    // remaining landmarks
    mctx.fillStyle = '#3b3f4a';
    for (const o of world.objects) {
      if (o.state === 'gone') continue;
      if (o.kind === 'tower' || o.kind === 'lowrise' || o.kind === 'shop') {
        mctx.fillRect((o.x + 10) * scale - 1, (o.z + 10) * scale - 1, 2.2, 2.2);
      }
    }
    mctx.fillStyle = '#7b2ff0';
    for (const g of world.giants) {
      if (g.state === 'gone') continue;
      mctx.beginPath();
      mctx.arc((g.x + 10) * scale, (g.z + 10) * scale, 3.4, 0, 6.283);
      mctx.fill();
    }
    // hole
    const hx = (hole.state.x + 10) * scale, hy = (hole.state.z + 10) * scale;
    mctx.fillStyle = '#111';
    mctx.beginPath();
    mctx.arc(hx, hy, Math.max(2.2, hole.state.r * scale), 0, 6.283);
    mctx.fill();
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.4;
    mctx.stroke();
  }

  return { update, drawMini, toast };
}
