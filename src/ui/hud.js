import { iconUrl } from '../world/tiles.js';

// In-game overlay: level label, clock, goal cards, the Size pill under the
// hole, boosters, "+1" popups and the little icons that fly to the card.
const el = (id) => document.getElementById(id);

export function createHUD() {
  const hud = el('hud');
  const lvl = el('lvl'), timer = el('timer'), timeText = el('timeText');
  const goalsEl = el('goals'), sizeLbl = el('sizeLbl'), hint = el('hint');
  const fxLayer = el('fx');
  const cards = new Map();
  let lastSec = -1, flying = 0, popping = 0;

  function fmt(t) {
    t = Math.max(0, Math.ceil(t));
    return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
  }

  function show(on) { hud.classList.toggle('hidden', !on); sizeLbl.classList.toggle('hidden', !on); }
  function setLevel(n) { lvl.textContent = `LEVEL ${n}`; }
  function setHint(text) { hint.textContent = text; hint.style.opacity = '1'; }
  function fadeHint() { hint.style.opacity = '0'; }

  function setGoals(goals) {
    goalsEl.innerHTML = '';
    cards.clear();
    for (const g of goals) {
      const d = document.createElement('div');
      d.className = 'goal';
      const icon = g.icon !== undefined
        ? `<img class="tileIcon" src="${iconUrl(g.icon)}" alt="">`
        : `<div class="tile ${g.shape === 'bead' ? 'bead' : ''}" style="background:${g.hex}"></div>`;
      d.innerHTML = `<div class="icon">${icon}</div><div class="num"></div>`;
      goalsEl.appendChild(d);
      cards.set(g.key, { el: d, num: d.querySelector('.num'), last: -1, t: 0 });
    }
  }

  function bumpCard(c) {
    c.el.classList.add('bump');
    clearTimeout(c.t);
    c.t = setTimeout(() => c.el.classList.remove('bump'), 120);
  }

  function updateGoals(goals) {
    for (const g of goals) {
      const c = cards.get(g.key);
      if (!c) continue;
      const left = g.need - g.have;
      if (left !== c.last) {
        c.num.textContent = left;
        c.el.classList.toggle('done', left <= 0);
        bumpCard(c);
        c.last = left;
      }
    }
  }

  function setTimer(left) {
    const s = Math.ceil(left);
    if (s !== lastSec) { timeText.textContent = fmt(left); lastSec = s; }
    timer.classList.toggle('warn', left <= 10 && left > 0);
  }

  function setSize(size, sx, sy) {
    sizeLbl.textContent = `Size ${size}`;
    sizeLbl.style.transform = `translate(${sx}px, ${sy}px) translateX(-50%)`;
  }

  function setBoosters(counts, active) {
    for (const b of document.querySelectorAll('.boost')) {
      const k = b.dataset.boost;
      const n = counts[k] || 0;
      b.querySelector('.cnt').textContent = n;
      b.classList.toggle('empty', n <= 0);
      b.classList.toggle('active', !!(active && active[k] > 0));
    }
  }

  // "+N" rising from the hole.
  function popup(text, sx, sy) {
    if (popping > 14) return;
    popping++;
    const d = document.createElement('div');
    d.className = 'pop';
    d.textContent = text;
    d.style.left = (sx + (Math.random() - 0.5) * 40) + 'px';
    d.style.top = (sy - 10 + (Math.random() - 0.5) * 20) + 'px';
    fxLayer.appendChild(d);
    setTimeout(() => { d.remove(); popping--; }, 850);
  }

  // A tile face that flies from the hole to its goal card.
  function flyIcon(key, icon, sx, sy) {
    const c = cards.get(key);
    if (!c || flying > 20) return;
    flying++;
    const img = document.createElement('img');
    img.className = 'fly';
    img.src = iconUrl(icon);
    img.style.left = sx + 'px';
    img.style.top = sy + 'px';
    fxLayer.appendChild(img);
    const r = c.el.getBoundingClientRect();
    const tx = r.left + r.width / 2 - sx, ty = r.top + r.height * 0.42 - sy;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      img.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0.55)`;
      img.style.opacity = '0.9';
    }));
    setTimeout(() => { img.remove(); flying--; bumpCard(c); }, 520);
  }

  function overlay(id, on) { el(id).classList.toggle('hidden', !on); }

  return { show, setLevel, setGoals, updateGoals, setTimer, setSize, setBoosters, setHint, fadeHint, popup, flyIcon, overlay, fmt };
}
