// All sound is synthesised with WebAudio, nothing is loaded: gunshots, punches, crashes and
// explosions from shaped noise, a car engine that follows the revs, tyre squeal, a wailing
// police siren, menu blips, and three original radio stations composed on the fly by a
// step sequencer (chords, bass, drums and a lead line) that the car radio cycles through.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const STATIONS = [
  {
    name: 'WAVE 88.1', tag: 'sunset synth', bpm: 104, swing: 0,
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G
    scale: [57, 60, 62, 64, 67, 69, 72, 74, 76],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    bassRhythm: 'x.xxx.xxx.xxx.xx', lead: 0.45, pad: 'saw', leadWave: 'square',
  },
  {
    name: 'BAYSIDE 94.7', tag: 'beach house', bpm: 122, swing: 0.08,
    chords: [[62, 65, 69], [58, 62, 65], [53, 57, 60], [60, 64, 67]], // Dm Bb F C
    scale: [62, 64, 65, 67, 69, 72, 74, 77],
    kick: 'x...x...x...x...', snare: '...x..x....x..x.', hat: 'xxxxxxxxxxxxxxxx',
    bassRhythm: '..x...x...x..xx.', lead: 0.3, pad: 'triangle', leadWave: 'triangle',
  },
  {
    name: 'LOW TIDE FM', tag: 'lo-fi drift', bpm: 82, swing: 0.12,
    chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]], // Cmaj7 Am7 Fmaj7 G7
    scale: [60, 62, 64, 67, 69, 72, 74],
    kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    bassRhythm: 'x.......x.x.....', lead: 0.22, pad: 'sine', leadWave: 'sine',
  },
];

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = { master: 0.8, sfx: 0.9, music: 0.55 };
    this.station = -1;
    this.musicOn = false;
    this.stepIndex = 0;
    this.nextStep = 0;
    this.seed = 1;
  }

  /** Create the audio graph; must run inside a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.applyVolume();

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;

    this.buildEngine();
    this.buildSiren();
    this.buildSkid();
    this.buildRotor();
    this.timer = setInterval(() => this.schedule(), 50);
  }

  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.volume.master;
    this.sfx.gain.value = this.volume.sfx;
    this.music.gain.value = this.volume.music;
  }

  // ------------------------------------------------------------ building blocks
  noiseSource() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  env(gainNode, t, peak, attack, decay) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  burst({ freq = 1200, q = 0.8, type = 'bandpass', peak = 0.6, attack = 0.002, decay = 0.2, at = 0, out = null }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(out || this.sfx);
    this.env(g, t, peak, attack, decay);
    src.start(t);
    src.stop(t + attack + decay + 0.05);
  }

  tone({ freq = 440, to = null, type = 'sine', peak = 0.3, attack = 0.005, decay = 0.2, at = 0, out = null }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    const g = ctx.createGain();
    o.connect(g).connect(out || this.sfx);
    this.env(g, t, peak, attack, decay);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  /** Volume for a sound at distance d metres. */
  fall(d) { return 1 / (1 + (d * d) / 900); }

  // ------------------------------------------------------------ effects
  shot(kind = 'pistol', d = 0) {
    if (!this.ctx) return;
    const v = this.fall(d);
    if (v < 0.02) return;
    if (kind === 'shotgun') {
      this.burst({ freq: 700, q: 0.5, peak: 0.9 * v, decay: 0.35 });
      this.tone({ freq: 120, to: 40, type: 'sine', peak: 0.8 * v, decay: 0.25 });
    } else if (kind === 'smg') {
      this.burst({ freq: 2200, q: 0.9, peak: 0.45 * v, decay: 0.08 });
      this.tone({ freq: 180, to: 70, type: 'triangle', peak: 0.35 * v, decay: 0.07 });
    } else {
      this.burst({ freq: 1600, q: 0.7, peak: 0.7 * v, decay: 0.16 });
      this.tone({ freq: 160, to: 55, type: 'sine', peak: 0.55 * v, decay: 0.14 });
    }
  }

  punch() {
    if (!this.ctx) return;
    this.burst({ freq: 400, q: 1, peak: 0.5, decay: 0.08 });
    this.tone({ freq: 110, to: 60, peak: 0.5, decay: 0.1 });
  }

  impact() {
    if (!this.ctx) return;
    this.burst({ freq: 900, q: 2, peak: 0.25, decay: 0.06 });
  }

  crash(strength = 10, d = 0) {
    if (!this.ctx) return;
    const v = Math.min(1, strength / 20) * this.fall(d);
    if (v < 0.03) return;
    this.burst({ freq: 500, q: 0.6, peak: 0.9 * v, decay: 0.35 });
    this.burst({ freq: 3200, q: 3, peak: 0.35 * v, decay: 0.25, at: 0.02 });
    this.tone({ freq: 90, to: 40, peak: 0.6 * v, decay: 0.2 });
  }

  explosion(d = 0) {
    if (!this.ctx) return;
    const v = this.fall(d * 0.6);
    this.burst({ freq: 300, q: 0.4, type: 'lowpass', peak: 1.2 * v, attack: 0.01, decay: 1.6 });
    this.burst({ freq: 1400, q: 0.6, peak: 0.5 * v, attack: 0.005, decay: 0.5 });
    this.tone({ freq: 70, to: 25, peak: 1.0 * v, attack: 0.01, decay: 0.9 });
  }

  step(run) {
    if (!this.ctx) return;
    this.burst({ freq: run ? 900 : 700, q: 1.5, peak: run ? 0.08 : 0.05, decay: 0.05 });
  }

  horn() {
    if (!this.ctx) return;
    this.tone({ freq: 392, type: 'sawtooth', peak: 0.12, attack: 0.02, decay: 0.4 });
    this.tone({ freq: 494, type: 'sawtooth', peak: 0.1, attack: 0.02, decay: 0.4 });
  }

  ui(kind) {
    if (!this.ctx) return;
    switch (kind) {
      case 'move': this.tone({ freq: 660, type: 'triangle', peak: 0.12, decay: 0.06 }); break;
      case 'select': this.tone({ freq: 880, to: 1320, type: 'triangle', peak: 0.16, decay: 0.12 }); break;
      case 'cash':
        this.tone({ freq: 1318, type: 'square', peak: 0.08, decay: 0.08 });
        this.tone({ freq: 1760, type: 'square', peak: 0.08, decay: 0.16, at: 0.07 });
        break;
      case 'pickup': this.tone({ freq: 523, to: 1046, type: 'triangle', peak: 0.18, decay: 0.2 }); break;
      case 'wanted':
        this.tone({ freq: 220, type: 'square', peak: 0.1, decay: 0.12 });
        this.tone({ freq: 196, type: 'square', peak: 0.1, decay: 0.18, at: 0.12 });
        break;
      case 'pass':
        [60, 64, 67, 72, 76].forEach((n, i) => this.tone({ freq: NOTE(n + 7), type: 'triangle', peak: 0.2, decay: 0.5, at: i * 0.11 }));
        this.tone({ freq: NOTE(43), type: 'sawtooth', peak: 0.12, attack: 0.02, decay: 1.2, at: 0.44 });
        break;
      case 'fail':
        [64, 61, 57, 52].forEach((n, i) => this.tone({ freq: NOTE(n), type: 'sawtooth', peak: 0.12, decay: 0.45, at: i * 0.18 }));
        break;
      case 'wasted': this.tone({ freq: 300, to: 60, type: 'sawtooth', peak: 0.25, attack: 0.05, decay: 2.2 }); break;
      default: this.tone({ freq: 700, peak: 0.1, decay: 0.08 });
    }
  }

  // ------------------------------------------------------------ continuous voices
  buildEngine() {
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    this.engineFilter = f;
    this.engineOsc = [ctx.createOscillator(), ctx.createOscillator()];
    this.engineOsc[0].type = 'sawtooth';
    this.engineOsc[1].type = 'square';
    for (const o of this.engineOsc) { o.frequency.value = 40; o.connect(f); o.start(); }
    f.connect(this.engineGain).connect(this.sfx);
  }

  /** rpm 0..1, load 0..1; on=false fades the engine out. */
  engine(on, rpm, load) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 34 + rpm * 120;
    this.engineOsc[0].frequency.setTargetAtTime(base, t, 0.05);
    this.engineOsc[1].frequency.setTargetAtTime(base * 0.5 + 3, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(300 + rpm * 1400 + load * 600, t, 0.08);
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + load * 0.06 : 0, t, 0.1);
  }

  buildSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.55;
    const depth = ctx.createGain();
    depth.gain.value = 260;
    lfo.connect(depth).connect(this.sirenOsc.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 1.2;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(f).connect(this.sirenGain).connect(this.sfx);
    this.sirenOsc.start();
    lfo.start();
  }

  siren(level) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.06, this.ctx.currentTime, 0.2);
  }

  buildSkid() {
    const ctx = this.ctx;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 6;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    src.connect(f).connect(this.skidGain).connect(this.sfx);
    src.start();
  }

  skid(level) {
    if (!this.ctx) return;
    this.skidGain.gain.setTargetAtTime(level * 0.12, this.ctx.currentTime, 0.05);
  }

  /** Helicopter blades: low noise chopped by a fast amplitude wobble. */
  buildRotor() {
    const ctx = this.ctx;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(chop.gain);
    this.rotorGain = ctx.createGain();
    this.rotorGain.gain.value = 0;
    src.connect(f).connect(chop).connect(this.rotorGain).connect(this.sfx);
    src.start();
    lfo.start();
  }

  rotor(level) {
    if (!this.ctx) return;
    this.rotorGain.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, 0.2);
  }

  // ------------------------------------------------------------ radio
  /** Tune to station index (or -1 for off). Returns the station or null. */
  tune(index) {
    this.station = index;
    this.musicOn = index >= 0;
    this.stepIndex = 0;
    this.seed = 7 + index * 13;
    if (this.ctx) this.nextStep = this.ctx.currentTime + 0.1;
    return index >= 0 ? STATIONS[index] : null;
  }

  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  schedule() {
    if (!this.ctx || !this.musicOn || this.station < 0) return;
    const st = STATIONS[this.station];
    const stepLen = 60 / st.bpm / 4;
    const ahead = this.ctx.currentTime + 0.25;
    if (this.nextStep < this.ctx.currentTime - 0.5) this.nextStep = this.ctx.currentTime + 0.05;
    while (this.nextStep < ahead) {
      const i = this.stepIndex % 16;
      const bar = Math.floor(this.stepIndex / 16);
      const chord = st.chords[bar % st.chords.length];
      let t = this.nextStep - this.ctx.currentTime;
      if (i % 2 === 1) t += st.swing * stepLen;
      this.playStep(st, i, bar, chord, Math.max(0, t), stepLen);
      this.nextStep += stepLen;
      this.stepIndex += 1;
    }
  }

  playStep(st, i, bar, chord, at, stepLen) {
    const out = this.music;
    if (st.kick[i] === 'x') this.tone({ freq: 150, to: 42, type: 'sine', peak: 0.75, attack: 0.002, decay: 0.22, at, out });
    if (st.snare[i] === 'x') this.burst({ freq: 1900, q: 0.6, peak: 0.32, decay: 0.14, at, out });
    if (st.hat[i] === 'x') this.burst({ freq: 8000, q: 1.2, type: 'highpass', peak: i % 4 === 2 ? 0.12 : 0.06, decay: 0.03, at, out });
    if (st.bassRhythm[i] === 'x') {
      const root = chord[0] - 24 + (i === 14 ? 7 : 0);
      this.tone({ freq: NOTE(root), type: 'sawtooth', peak: 0.2, attack: 0.005, decay: stepLen * 1.6, at, out });
    }
    if (i === 0) {
      // the pad holds the chord for the whole bar
      for (const n of chord) this.tone({ freq: NOTE(n), type: st.pad, peak: 0.045, attack: 0.25, decay: stepLen * 15, at, out });
    }
    if (i % 2 === 0 && this.rand() < st.lead && bar % 4 !== 3) {
      const n = st.scale[Math.floor(this.rand() * st.scale.length)] + 12;
      this.tone({ freq: NOTE(n), type: st.leadWave, peak: 0.06, attack: 0.01, decay: stepLen * 2.2, at, out });
    }
  }
}
