// audio.js — every sound in Coral Bay Heat is synthesized with WebAudio:
// a two-oscillator engine whose pitch follows speed, a two-tone siren,
// noise-burst crashes and shots, and little FM chimes for cash and jobs.
// Nothing is loaded; the graph is built on the first user gesture.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFlip = null;
  }

  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.3, low = 400, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = low;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t0);
  }

  blip() { this.tone(880, 0.07, 'square', 0.12); }
  cash() { this.tone(1320, 0.08, 'square', 0.14); this.tone(1760, 0.12, 'square', 0.12, null, 0.07); }
  pickup() { this.tone(520, 0.09, 'triangle', 0.2, 780); }
  crash(hard = 1) { this.noise(0.22 * hard, 0.32, 500); this.tone(90, 0.18, 'sine', 0.3, 45); }
  shot() { this.noise(0.09, 0.28, 2400); this.tone(150, 0.06, 'sawtooth', 0.1, 60); }
  punch() { this.noise(0.06, 0.18, 900); }
  jobDone() { [660, 880, 1100].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.16, null, i * 0.09)); }
  jobFail() { this.tone(300, 0.25, 'sawtooth', 0.14, 140); }
  busted() { [440, 415, 392, 370].forEach((f, i) => this.tone(f, 0.16, 'square', 0.13, null, i * 0.13)); }

  setEngine(on, speed01) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 420;
      this.engineOsc.connect(filter); filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      const target = on ? 0.05 + speed01 * 0.05 : 0;
      this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
      this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, this.ctx.currentTime, 0.06);
    }
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      let hi = false;
      this.sirenFlip = setInterval(() => {
        if (!this.sirenOsc) return;
        hi = !hi;
        this.sirenOsc.frequency.setValueAtTime(hi ? 960 : 690, this.ctx.currentTime);
      }, 380);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenFlip);
      this.sirenOsc.stop();
      this.sirenOsc = null; this.sirenGain = null;
    }
  }
}
