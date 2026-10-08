// The game itself, as plain data: squad, zombies, bullets, gates, boss and
// boss hazards, stepped by update(dt). The renderer only reads this state,
// so whole runs can be simulated in Node (tests, balance checks).
//
// Coordinates: x runs across the road (-LANE_HALF..LANE_HALF), d is the
// distance along it. The squad runs towards larger d.
import { makeRng } from '../core/rng.js';
import {
  LANE_HALF, RUN_SPEED, MAX_ZOMBIES, MAX_BULLETS, FIRE_RATE, BULLET_SPEED, BULLET_RANGE, BOSS_EVERY,
  applyGate, shootGate, formationSlot, squadRadius, steerLimit, ZOMBIES,
  bossStats, freeBoss, freeDifficulty, freeChunk, inHazard,
} from './logic.js';

const SPAWN_AHEAD = 70;   // events appear this far in front of the squad
const WAKE_DIST = 26;     // zombies start shambling over when this close
const CELL = 2;           // spatial hash cell size along d
const STEER_SPEED = 14;

export class Sim {
  // mode 'level' takes { level } (an entry of LEVELS); mode 'free' takes { seed }.
  constructor({ mode, level = null, seed = 1 }) {
    this.mode = mode;
    this.level = level;
    this.rng = makeRng(seed);
    this.time = 0;
    this.runTime = 0;          // time spent running (not fighting a boss)
    this.status = 'running';   // 'running' | 'won' | 'lost'
    this.endTimer = 0;
    this.score = 0;
    this.kills = 0;
    this.bossesBeaten = 0;
    this.fx = [];              // one-shot effects for the renderer and audio
    this.shots = 0;            // shots fired since the renderer last looked

    this.squad = { x: 0, target: 0, d: 0, speed: RUN_SPEED, soldiers: [] };
    this.zombies = [];
    this.bullets = [];
    this.gates = [];
    this.hazards = [];
    this.boss = null;
    this.fighting = false;
    this.nextGateId = 1;

    if (mode === 'level') {
      this.pending = level.events.map((e) => structuredClone(e));
      this.goalD = this.pending[this.pending.length - 1].d;
      this.addSoldiers(level.start, 0, 0);
    } else {
      this.pending = [];
      this.genD = 25;
      this.nextBossAt = BOSS_EVERY;
      this.bossQueued = false;
      this.addSoldiers(1, 0, 0);
    }
  }

  get count() { return this.squad.soldiers.length; }
  get distance() { return this.squad.d; }
  get finalScore() { return this.score + Math.floor(this.squad.d); }

  steer(x) { this.squad.target = x; }

  addSoldiers(n, x, d) {
    for (let i = 0; i < n; i++) {
      this.squad.soldiers.push({
        x: x + this.rng.r(-0.3, 0.3), d: d + this.rng.r(-0.3, 0.3),
        cool: this.rng.r(0, 1 / FIRE_RATE), phase: this.rng.r(0, 6.28), shot: 0,
      });
    }
  }

  // Remove the n soldiers closest to (x, d) — whoever got bitten or crushed.
  killSoldiersNear(n, x, d) {
    const s = this.squad.soldiers;
    for (let k = 0; k < n && s.length; k++) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < s.length; i++) {
        const dd = (s[i].x - x) ** 2 + (s[i].d - d) ** 2;
        if (dd < bestD) { bestD = dd; best = i; }
      }
      const [dead] = s.splice(best, 1);
      this.fx.push({ type: 'soldierDown', x: dead.x, d: dead.d });
    }
  }

  setCount(n) {
    const s = this.squad.soldiers;
    if (n > s.length) this.addSoldiers(n - s.length, this.squad.x, this.squad.d);
    else while (s.length > n) {
      const dead = s.pop();
      this.fx.push({ type: 'soldierDown', x: dead.x, d: dead.d, quiet: true });
    }
  }

  update(dt) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    if (this.status !== 'running') { this.endTimer += dt; this.moveSoldiers(dt); return; }
    if (this.mode === 'free') this.generate();
    this.spawnEvents();
    this.moveSquad(dt);
    this.fire(dt);
    this.buildGrid();
    this.moveBullets(dt);
    // A boss killed by this frame's bullets ends a level run right here, so
    // nothing left on the road can bite after the win.
    if (this.status !== 'running') return;
    this.moveZombies(dt);
    this.passGates();
    this.updateBoss(dt);
    this.updateHazards(dt);
    if (!this.fighting) this.runTime += dt;
    if (this.count === 0 && this.status === 'running') {
      this.status = 'lost';
      this.fx.push({ type: 'lost' });
    }
  }

  // ---------- spawning ----------

  generate() {
    while (!this.bossQueued && this.genD < this.squad.d + SPAWN_AHEAD + 30) {
      if (this.runTime >= this.nextBossAt) {
        this.pending.push({ d: this.genD + 20, type: 'boss', tier: this.bossesBeaten + 1 });
        this.bossQueued = true;
        break;
      }
      const diff = freeDifficulty(this.runTime + (this.genD - this.squad.d) / RUN_SPEED, this.bossesBeaten);
      const chunk = freeChunk(this.rng, diff, this.genD, this.count, this.genD === 25);
      this.pending.push(...chunk.events);
      this.genD = chunk.next;
    }
  }

  spawnEvents() {
    while (this.pending.length && this.pending[0].d - this.squad.d < SPAWN_AHEAD) {
      const e = this.pending.shift();
      if (e.type === 'gates') {
        this.gates.push({ id: this.nextGateId++, d: e.d, left: e.left, right: e.right, passed: false, version: 0 });
      } else if (e.type === 'horde') {
        this.spawnHorde(e);
      } else if (e.type === 'boss') {
        this.spawnBoss(e);
      }
    }
  }

  spawnHorde(e) {
    for (let i = 0; i < e.count; i++) {
      // Fill a disc of radius `spread` around the horde centre.
      const a = this.rng.r(0, Math.PI * 2), r = Math.sqrt(this.rng.f()) * e.spread;
      const x = Math.max(-LANE_HALF + 0.4, Math.min(LANE_HALF - 0.4, e.x + Math.cos(a) * r));
      this.addZombie(e.kind, x, e.d + Math.sin(a) * r * 1.4, e.hpMul || 1);
    }
  }

  addZombie(kind, x, d, hpMul = 1, awake = false) {
    if (this.zombies.length >= MAX_ZOMBIES) return;
    const k = ZOMBIES[kind];
    const hp = Math.max(1, Math.round(k.hp * hpMul));
    this.zombies.push({
      kind, x, d, hp, maxHp: hp, r: k.r, speed: k.speed * this.rng.r(0.85, 1.15),
      bite: k.bite, score: k.score, scale: k.scale, awake, phase: this.rng.r(0, 6.28), flash: 0,
    });
  }

  spawnBoss(e) {
    const stats = this.mode === 'free' ? freeBoss(e.tier) : bossStats(e.tier);
    this.boss = {
      x: 0, d: e.d, hp: stats.hp, maxHp: stats.hp, stats, r: stats.size * 0.75,
      cool: 2.2, flash: 0, lunge: 0, attackN: 0, crushAcc: 0,
    };
    this.fx.push({ type: 'bossSpawn', tier: e.tier });
  }

  // ---------- squad ----------

  moveSquad(dt) {
    const sq = this.squad;
    const lim = steerLimit(this.count);
    const target = Math.max(-lim, Math.min(lim, sq.target));
    const step = STEER_SPEED * dt;
    sq.x += Math.max(-step, Math.min(step, target - sq.x));
    sq.x = Math.max(-lim, Math.min(lim, sq.x));
    if (this.boss && !this.fighting && sq.d >= this.boss.d - 16) {
      this.fighting = true;
      this.fx.push({ type: 'fight' });
    }
    const want = this.fighting ? 0 : RUN_SPEED;
    sq.speed += (want - sq.speed) * Math.min(1, dt * 3);
    sq.d += sq.speed * dt;
    this.moveSoldiers(dt);
  }

  moveSoldiers(dt) {
    const sq = this.squad, s = sq.soldiers;
    const k = Math.min(1, dt * 10);
    for (let i = 0; i < s.length; i++) {
      const slot = formationSlot(i, s.length);
      s[i].x += (sq.x + slot.x - s[i].x) * k;
      s[i].d += (sq.d + slot.d - s[i].d) * k;
      s[i].d += sq.speed * dt * (1 - k); // keep pace while settling
    }
  }

  // Each soldier shoots at whatever is closest in front of it, within a
  // narrow cone; with nothing to aim at the bullet just flies straight.
  fire(dt) {
    const s = this.squad.soldiers;
    const near = this.targetsAhead();
    for (const so of s) {
      so.cool -= dt;
      so.shot = Math.max(0, so.shot - dt);
      if (so.cool > 0) continue;
      so.shot = 0.05; // muzzle flash time, for the renderer
      so.cool += (1 / FIRE_RATE) * this.rng.r(0.85, 1.15);
      if (this.bullets.length >= MAX_BULLETS) continue;
      let vx = 0, best = Infinity;
      for (const t of near) {
        const dd = t.d - so.d;
        if (dd < 0.5 || dd > BULLET_RANGE) continue;
        const slope = (t.x - so.x) / dd;
        if (Math.abs(slope) > (t === this.boss ? 0.6 : 0.35)) continue;
        const score = dd + Math.abs(t.x - so.x) * 3;
        if (score < best) { best = score; vx = slope * BULLET_SPEED; }
      }
      this.bullets.push({ x: so.x, d: so.d + 0.3, vx, travelled: 0 });
      this.shots++;
    }
  }

  targetsAhead() {
    const sq = this.squad, out = [];
    for (const z of this.zombies) {
      const dd = z.d - sq.d;
      if (dd > -1 && dd < BULLET_RANGE + 2) out.push(z);
    }
    if (out.length > 24) {
      out.sort((a, b) => a.d - b.d);
      out.length = 24;
    }
    if (this.boss && this.boss.d - sq.d < BULLET_RANGE + 2) out.push(this.boss);
    return out;
  }

  // ---------- bullets ----------

  buildGrid() {
    const g = this.grid = new Map();
    for (const z of this.zombies) {
      const c = Math.floor(z.d / CELL);
      let a = g.get(c);
      if (!a) g.set(c, a = []);
      a.push(z);
    }
  }

  moveBullets(dt) {
    const out = [];
    for (const b of this.bullets) {
      const d0 = b.d;
      b.d += BULLET_SPEED * dt;
      b.x += b.vx * dt;
      b.travelled += BULLET_SPEED * dt;
      if (this.bulletHits(b, d0) || b.travelled > BULLET_RANGE || Math.abs(b.x) > LANE_HALF + 2) continue;
      out.push(b);
    }
    this.bullets = out;
  }

  bulletHits(b, d0) {
    // Zombies first: they stand between the squad and everything else.
    let hit = null, hitD = Infinity;
    for (let c = Math.floor(d0 / CELL) - 1; c <= Math.floor(b.d / CELL) + 1; c++) {
      const cell = this.grid.get(c);
      if (!cell) continue;
      for (const z of cell) {
        if (z.hp <= 0 || Math.abs(b.x - z.x) > z.r + 0.08) continue;
        if (z.d + z.r < d0 || z.d - z.r > b.d) continue;
        if (z.d < hitD) { hit = z; hitD = z.d; }
      }
    }
    if (hit) { this.damageZombie(hit, 1); return true; }

    for (const g of this.gates) {
      if (g.passed || g.d <= d0 || g.d > b.d) continue;
      const side = b.x < 0 ? g.left : g.right;
      if (shootGate(side)) { g.version++; this.fx.push({ type: 'gateTick', id: g.id }); }
      return true;
    }

    const boss = this.boss;
    if (boss && boss.hp > 0 && Math.abs(b.x - boss.x) < boss.r && b.d >= boss.d - boss.r * 0.6) {
      boss.hp -= 1;
      boss.flash = 0.08;
      if (boss.hp <= 0) this.killBoss();
      return true;
    }
    return false;
  }

  damageZombie(z, n) {
    z.hp -= n;
    z.flash = 0.08;
    if (z.hp > 0) this.fx.push({ type: 'hit', x: z.x, d: z.d, scale: z.scale });
    if (z.hp <= 0) {
      this.kills++;
      this.score += z.score;
      this.fx.push({ type: 'zombieDown', x: z.x, d: z.d, kind: z.kind, scale: z.scale });
    }
  }

  // ---------- zombies ----------

  moveZombies(dt) {
    const sq = this.squad, R = squadRadius(this.count);
    for (const z of this.zombies) {
      if (z.hp <= 0) continue;
      z.flash = Math.max(0, z.flash - dt);
      z.phase += dt * (3 + z.speed * 2);
      const dx = sq.x - z.x, dd = sq.d - z.d;
      if (!z.awake && -dd < WAKE_DIST) z.awake = true;
      if (z.awake) {
        const len = Math.hypot(dx, dd) || 1;
        z.x += (dx / len) * z.speed * 0.75 * dt;
        z.d += (dd / len) * z.speed * dt;
      }
      // Bite: only near the squad's edge, against the nearest soldier.
      if (dx * dx + dd * dd < (R + z.r + 0.4) ** 2) {
        let nearest = Infinity;
        for (const s of sq.soldiers) nearest = Math.min(nearest, (s.x - z.x) ** 2 + (s.d - z.d) ** 2);
        if (nearest < (z.r + 0.25) ** 2) {
          this.killSoldiersNear(z.bite, z.x, z.d);
          z.hp = 0;
          this.fx.push({ type: 'bite', x: z.x, d: z.d });
        }
      }
    }
    this.separate(dt);
    this.zombies = this.zombies.filter((z) => z.hp > 0 && z.d > sq.d - 5);
  }

  // Cheap crowd spacing so a horde reads as a crowd, not one stacked blob.
  separate(dt) {
    const g = this.grid;
    for (const z of this.zombies) {
      if (z.hp <= 0) continue;
      const c = Math.floor(z.d / CELL);
      for (let k = c - 1; k <= c + 1; k++) {
        const cell = g.get(k);
        if (!cell) continue;
        for (const o of cell) {
          if (o === z || o.hp <= 0) continue;
          const dx = z.x - o.x, dd = z.d - o.d, min = z.r + o.r;
          const q = dx * dx + dd * dd;
          if (q >= min * min || q < 1e-6) continue;
          const dist = Math.sqrt(q), push = (min - dist) * 0.5 * Math.min(1, dt * 12);
          z.x += (dx / dist) * push; z.d += (dd / dist) * push;
        }
      }
      z.x = Math.max(-LANE_HALF + 0.3, Math.min(LANE_HALF - 0.3, z.x));
    }
  }

  // ---------- gates ----------

  passGates() {
    const sq = this.squad;
    for (const g of this.gates) {
      if (g.passed || sq.d < g.d) continue;
      g.passed = true;
      const side = sq.x < 0 ? 'left' : 'right';
      const gate = g[side], before = this.count;
      const after = applyGate(before, gate);
      g.chosen = side;
      this.setCount(after);
      this.fx.push({ type: 'gate', id: g.id, side, gate: { ...gate }, before, after, x: sq.x, d: g.d });
    }
    this.gates = this.gates.filter((g) => !g.passed || g.d > sq.d - 6);
  }

  // ---------- boss ----------

  updateBoss(dt) {
    const b = this.boss;
    if (!b) return;
    const sq = this.squad, st = b.stats;
    b.flash = Math.max(0, b.flash - dt);
    b.lunge = Math.max(0, b.lunge - dt);
    if (b.hp <= 0) return;
    if (!this.fighting) return;
    // Drift across to follow the squad, and slowly close in.
    const step = 1.3 * dt;
    b.x += Math.max(-step, Math.min(step, sq.x - b.x));
    const R = squadRadius(this.count);
    const contactD = sq.d + R + b.r * 0.8;
    if (b.d > contactD) b.d = Math.max(contactD, b.d - st.approach * dt);
    else {
      b.crushAcc += st.crush * dt;
      while (b.crushAcc >= 1 && this.count) {
        b.crushAcc -= 1;
        this.killSoldiersNear(1, b.x, b.d - b.r);
        this.fx.push({ type: 'crush', x: b.x, d: b.d - b.r });
      }
    }
    b.cool -= dt;
    if (b.cool <= 0) {
      b.cool = st.interval;
      this.bossAttack(st.attacks[b.attackN++ % st.attacks.length]);
    }
  }

  bossAttack(kind) {
    const b = this.boss, sq = this.squad, st = b.stats, rng = this.rng;
    if (kind === 'spit') {
      for (let i = 0; i < st.spitCount; i++) {
        const x = i === 0 ? sq.x : Math.max(-LANE_HALF + 1, Math.min(LANE_HALF - 1, sq.x + rng.r(-2.6, 2.6)));
        const d = sq.d + (i === 0 ? 0 : rng.r(-1.8, 2.2));
        this.hazards.push({ kind, shape: 'circle', x, d, r: 1.25, t: 0, delay: 1.25 + i * 0.06 });
      }
    } else if (kind === 'sweep') {
      const left = sq.x < 0;
      this.hazards.push({ kind, shape: 'rect', x0: left ? -LANE_HALF - 1 : 0, x1: left ? 0 : LANE_HALF + 1,
        d0: sq.d - 3.5, d1: sq.d + 4, t: 0, delay: 1.45 });
    } else if (kind === 'summon') {
      for (let i = 0; i < st.summonCount; i++) {
        this.addZombie('runner', Math.max(-3.5, Math.min(3.5, b.x + rng.r(-2.5, 2.5))), b.d - b.r - rng.r(0, 2),
          1 + 0.15 * (st.tier - 1), true);
      }
      this.fx.push({ type: 'roar' });
    } else if (kind === 'charge') {
      this.hazards.push({ kind, shape: 'rect', x0: sq.x - 1.15, x1: sq.x + 1.15,
        d0: sq.d - 3, d1: b.d, t: 0, delay: 1.35 });
    }
    this.fx.push({ type: 'telegraph', kind });
  }

  updateHazards(dt) {
    const keep = [];
    for (const h of this.hazards) {
      h.t += dt;
      if (h.t < h.delay) { keep.push(h); continue; }
      const alive = [];
      let killed = 0;
      for (const s of this.squad.soldiers) {
        if (!inHazard(h, s.x, s.d)) { alive.push(s); continue; }
        killed++;
        this.fx.push({ type: 'soldierDown', x: s.x, d: s.d });
      }
      this.squad.soldiers = alive;
      if (h.kind === 'charge' && this.boss) this.boss.lunge = 0.45;
      this.fx.push({ type: 'boom', hazard: h, killed });
    }
    this.hazards = keep;
  }

  killBoss() {
    const b = this.boss;
    this.score += 500 * b.stats.tier;
    this.fx.push({ type: 'bossDown', x: b.x, d: b.d, tier: b.stats.tier });
    this.hazards = [];
    this.boss = null;
    this.fighting = false;
    for (const z of this.zombies) { z.hp = 0; this.fx.push({ type: 'zombieDown', x: z.x, d: z.d, kind: z.kind, scale: z.scale }); }
    if (this.mode === 'level') {
      this.status = 'won';
      this.fx.push({ type: 'won' });
    } else {
      this.bossesBeaten++;
      this.nextBossAt = this.runTime + BOSS_EVERY;
      this.bossQueued = false;
      this.genD = this.squad.d + 30;
    }
  }
}

// A simple autopilot: dodge telegraphed hazards, take the better gate,
// otherwise drift towards the nearest zombies. Used by the tests and by
// ?bot=1 in the browser.
export function botTarget(sim) {
  const sq = sim.squad, lim = steerLimit(sim.count), R = squadRadius(sim.count);
  if (sim.hazards.length) {
    let bestX = sq.x, best = -Infinity;
    for (let x = -lim; x <= lim + 1e-6; x += 0.25) {
      let hits = 0;
      for (const h of sim.hazards) {
        for (const [ox, od] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R], [R * 0.7, R * 0.7], [-R * 0.7, R * 0.7]]) {
          if (inHazard(h, x + ox, sq.d + od)) hits++;
        }
      }
      const score = -hits * 10 - Math.abs(x - sq.x) * 0.3;
      if (score > best) { best = score; bestX = x; }
    }
    return bestX;
  }
  const gate = sim.gates.find((g) => !g.passed && g.d > sq.d && g.d - sq.d < 30);
  if (gate) {
    const l = applyGate(sim.count, gate.left), r = applyGate(sim.count, gate.right);
    return l >= r ? -2 : 2;
  }
  let nearest = null;
  for (const z of sim.zombies) if (z.d > sq.d && (!nearest || z.d < nearest.d)) nearest = z;
  if (sim.boss) return sim.boss.x;
  return nearest ? nearest.x * 0.6 : 0;
}
