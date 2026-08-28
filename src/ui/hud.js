import { WORLD } from '../world/build.js';

// Overlay: progress, size, combo, the "Size Up!" flourish, and a minimap of
// what is still standing.
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

  function toast(text) {
    const d = document.createElement('div');
    d.className = 'sizeup';
    d.textContent = text;
    toastWrap.appendChild(d);
    requestAnimationFrame(() => d.classList.add('in'));
    setTimeout(() => { d.classList.remove('in'); setTimeout(() => d.remove(), 500); }, 1500);
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
    tierEl.textContent = nt ? `Bigger stacks unlock at size ${nt.r.toFixed(0)}`
                            : 'Nothing left that you cannot swallow';
  }

  const MS = 132;
  mini.width = MS * 2; mini.height = MS * 2;
  mini.style.width = MS + 'px'; mini.style.height = MS + 'px';
  mctx.scale(2, 2);
  const scale = MS / WORLD.size;
  const off = WORLD.size / 2;

  function drawMini(hole) {
    mctx.clearRect(0, 0, MS, MS);
    mctx.fillStyle = '#5ec94f';
    mctx.fillRect(0, 0, MS, MS);
    mctx.fillStyle = 'rgba(30,40,60,0.55)';
    for (const o of world.objects) {
      if (o.state === 'gone') continue;
      if (o.count < 4) continue;                       // only the notable stacks
      const sz = o.count > 24 ? 2.4 : 1.5;
      mctx.fillRect((o.x + off) * scale - sz / 2, (o.z + off) * scale - sz / 2, sz, sz);
    }
    const hx = (hole.state.x + off) * scale, hy = (hole.state.z + off) * scale;
    mctx.fillStyle = '#111';
    mctx.beginPath();
    mctx.arc(hx, hy, Math.max(2.4, hole.state.r * scale), 0, 6.283);
    mctx.fill();
    mctx.strokeStyle = '#ffdf7a'; mctx.lineWidth = 1.6;
    mctx.stroke();
  }

  return { update, drawMini, toast };
}
