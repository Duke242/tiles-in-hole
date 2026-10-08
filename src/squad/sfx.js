// Squad Rush sounds, built on the shared synth kit: no audio files.
import { Audio } from '../core/audio.js';

export class Sfx extends Audio {
  // Called once per frame with how many shots went off; a whole squad
  // firing becomes a steady rattle instead of hundreds of clicks.
  shots(n) {
    if (!n) return;
    const now = performance.now();
    if (now - (this._lastShot || 0) < 75) return;
    this._lastShot = now;
    const v = Math.min(0.07, 0.025 + n * 0.004);
    this.noise({ dur: 0.05, vol: v, lp: 3800 });
    this.tone({ f0: 900, f1: 300, dur: 0.04, type: 'square', vol: v * 0.35 });
  }
  splat() {
    const now = performance.now();
    if (now - (this._lastSplat || 0) < 60) return;
    this._lastSplat = now;
    this.noise({ dur: 0.12, vol: 0.07, lp: 900 });
    this.tone({ f0: 180, f1: 70, dur: 0.12, type: 'triangle', vol: 0.06 });
  }
  ouch() {
    const now = performance.now();
    if (now - (this._lastOuch || 0) < 90) return;
    this._lastOuch = now;
    this.tone({ f0: 520, f1: 240, dur: 0.12, type: 'sawtooth', vol: 0.05 });
  }
  gateGood(big) {
    const notes = big ? [523, 659, 784, 1046] : [587, 784, 988];
    notes.forEach((f, i) => this.tone({ f0: f, f1: f, dur: 0.12, type: 'triangle', vol: 0.09, delay: i * 0.05 }));
  }
  gateBad() {
    this.tone({ f0: 400, f1: 180, dur: 0.35, type: 'sawtooth', vol: 0.08 });
    this.tone({ f0: 300, f1: 120, dur: 0.4, type: 'square', vol: 0.05, delay: 0.08 });
  }
  gateTick() {
    const now = performance.now();
    if (now - (this._lastTick || 0) < 50) return;
    this._lastTick = now;
    this.tone({ f0: 1400, f1: 1600, dur: 0.04, type: 'sine', vol: 0.04 });
  }
  warn() {
    this.tone({ f0: 880, f1: 880, dur: 0.09, type: 'square', vol: 0.05 });
    this.tone({ f0: 660, f1: 660, dur: 0.09, type: 'square', vol: 0.05, delay: 0.12 });
  }
  roar() {
    this.tone({ f0: 140, f1: 60, dur: 0.9, type: 'sawtooth', vol: 0.15 });
    this.tone({ f0: 110, f1: 45, dur: 1.0, type: 'square', vol: 0.08, delay: 0.05 });
    this.noise({ dur: 0.8, vol: 0.09, lp: 500 });
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone({ f0: f, f1: f * 0.97, dur: 0.3, type: 'triangle', vol: 0.09, delay: i * 0.18 }));
  }
}
