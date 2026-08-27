// Tiny procedural sound kit: no assets, everything synthesised on demand.
export class Audio {
  constructor() { this.ctx = null; this.master = null; this.muted = false; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  tone({ f0, f1, dur = 0.15, type = 'sine', vol = 0.1, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.t + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1 ?? f0), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  noise({ dur = 0.3, vol = 0.15, lp = 1200, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.t + delay;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = lp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  }

  // A tile/prop drops in — pitch rises with the combo for that arcade ladder.
  pop(combo = 0) {
    const f = 300 + Math.min(combo, 45) * 14;
    this.tone({ f0: f * 1.6, f1: f * 0.72, dur: 0.09, type: 'triangle', vol: 0.075 });
  }
  crunch() { this.noise({ dur: 0.16, vol: 0.1, lp: 2400 }); }
  rumble() {
    this.tone({ f0: 90, f1: 28, dur: 0.85, type: 'sawtooth', vol: 0.14 });
    this.noise({ dur: 0.7, vol: 0.11, lp: 700 });
  }
  boom() {
    this.tone({ f0: 130, f1: 34, dur: 1.0, type: 'square', vol: 0.16 });
    this.noise({ dur: 0.9, vol: 0.16, lp: 480 });
  }
  unlockJingle() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.tone({ f0: f, f1: f, dur: 0.16, type: 'triangle', vol: 0.09, delay: i * 0.07 }));
  }
  victory() {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      this.tone({ f0: f, f1: f, dur: 0.45, type: 'sine', vol: 0.11, delay: i * 0.13 }));
  }
}
