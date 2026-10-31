/** Tiny synthesized sound effects via the Web Audio API — no audio assets needed. */
export class Sound {
  private ctx: AudioContext | null = null;
  enabled = true;

  private context(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private noise(duration: number, filterFreq: number, gain: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.context();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start();
  }

  private tone(freq: number, start: number, duration: number, type: OscillatorType = 'triangle', gain = 0.15): void {
    const ctx = this.context();
    if (!ctx) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  splash(): void {
    this.noise(0.45, 2200, 0.25, 'bandpass');
  }

  hit(): void {
    this.noise(0.7, 600, 0.9);
    this.tone(70, 0, 0.4, 'sine', 0.4);
  }

  sunk(): void {
    this.noise(1.4, 400, 1);
    this.tone(55, 0, 1, 'sawtooth', 0.12);
  }

  victory(): void {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i * 0.14, i === 5 ? 0.9 : 0.25, 'square', 0.08));
  }

  defeat(): void {
    [392, 370, 349, 262].forEach((f, i) => this.tone(f, i * 0.4, i === 3 ? 1.4 : 0.45, 'sawtooth', 0.09));
  }
}
