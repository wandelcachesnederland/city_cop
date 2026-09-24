// Tiny synthesized WebAudio sound engine (no assets)
class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  muted = false;
  siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  engine: { osc: OscillatorNode; gain: GainNode } | null = null;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.2, slide = 0, delay = 0) {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.3, filterFreq = 2000, delay = 0, type: BiquadFilterType = 'lowpass') {
    const c = this.ctx;
    if (!c || !this.master || !this.noiseBuf) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  shoot() {
    this.noise(0.18, 0.5, 3000);
    this.tone(160, 0.15, 'square', 0.25, -120);
  }
  enemyShot() {
    this.noise(0.14, 0.25, 1800);
    this.tone(220, 0.1, 'sawtooth', 0.1, -150);
  }
  hit() {
    this.noise(0.1, 0.4, 800);
    this.tone(90, 0.2, 'sine', 0.4, -40);
  }
  hurt() {
    this.tone(200, 0.25, 'sawtooth', 0.25, -150);
    this.noise(0.15, 0.3, 600);
  }
  cuff() {
    this.tone(1800, 0.05, 'square', 0.12);
    this.tone(2400, 0.05, 'square', 0.12, 0, 0.08);
    this.noise(0.05, 0.2, 5000, 0.12, 'highpass');
  }
  coin(combo = 1) {
    const base = 660 + Math.min(combo, 6) * 60;
    this.tone(base, 0.08, 'square', 0.12);
    this.tone(base * 1.25, 0.08, 'square', 0.12, 0, 0.07);
    this.tone(base * 1.5, 0.14, 'square', 0.12, 0, 0.14);
  }
  heart() {
    this.tone(520, 0.12, 'triangle', 0.2);
    this.tone(780, 0.2, 'triangle', 0.2, 0, 0.1);
  }
  paper() {
    this.noise(0.12, 0.2, 4000, 0, 'highpass');
    this.tone(900, 0.05, 'triangle', 0.1, 300, 0.05);
  }
  bad() {
    this.tone(180, 0.35, 'sawtooth', 0.22);
    this.tone(120, 0.45, 'sawtooth', 0.22, 0, 0.12);
  }
  crash(v = 1) {
    this.noise(0.3, 0.5 * v, 1200);
    this.tone(70, 0.3, 'sine', 0.4 * v, -30);
  }
  horn() {
    this.tone(400, 0.25, 'square', 0.08);
    this.tone(500, 0.25, 'square', 0.06);
  }
  blip() {
    this.tone(880, 0.05, 'square', 0.08);
  }
  door() {
    this.tone(300, 0.08, 'triangle', 0.2, 200);
    this.noise(0.1, 0.15, 900, 0.05);
  }
  whoosh() {
    this.noise(0.8, 0.3, 700);
    this.tone(120, 0.8, 'sine', 0.2, 300);
  }
  radio() {
    this.noise(0.12, 0.12, 3000, 0, 'bandpass');
    this.tone(1200, 0.06, 'square', 0.06, 0, 0.12);
    this.tone(1500, 0.06, 'square', 0.06, 0, 0.2);
  }
  powerup() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'square', 0.1, 0, i * 0.06));
  }
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.25, 0, i * 0.18));
  }
  setSiren(on: boolean) {
    const c = this.ctx;
    if (!c || !this.master) return;
    if (on && !this.siren) {
      const osc = c.createOscillator();
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      const gain = c.createGain();
      osc.type = 'square';
      osc.frequency.value = 750;
      lfo.frequency.value = 1.6;
      lfoGain.gain.value = 250;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = 0.035;
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.siren = { osc, lfo, gain };
    } else if (!on && this.siren) {
      this.siren.osc.stop();
      this.siren.lfo.stop();
      this.siren = null;
    }
  }
  setEngine(on: boolean, speed = 0) {
    const c = this.ctx;
    if (!c || !this.master) return;
    if (on && !this.engine) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 40;
      gain.gain.value = 0.03;
      osc.connect(gain).connect(this.master);
      osc.start();
      this.engine = { osc, gain };
    } else if (!on && this.engine) {
      this.engine.osc.stop();
      this.engine = null;
    }
    if (this.engine) this.engine.osc.frequency.setTargetAtTime(40 + Math.abs(speed) * 0.25, c.currentTime, 0.05);
  }
  stopLoops() {
    this.setSiren(false);
    this.setEngine(false);
  }
}

export const sfx = new Sfx();
