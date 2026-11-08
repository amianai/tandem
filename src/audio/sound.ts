/**
 * AUDIO — tutto sintetizzato al volo con Web Audio, niente file.
 *
 * Ogni suono è una piccola ricetta di oscillatori, rumore e filtri: pesa
 * zero byte e può dipendere dal gioco (uno scoppio grosso è più grave, un
 * atterraggio pesante più sordo). Il browser non lascia partire l'audio
 * prima che il giocatore tocchi un tasto: `unlock()` va chiamato al primo
 * input. `M` toglie e rimette tutto.
 */

type Wave = OscillatorType;

interface ToneOpts {
  type?: Wave;
  to?: number;          // frequenza finale (glissando esponenziale)
  attack?: number;
  delay?: number;
  pan?: number;
}

interface NoiseOpts {
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  attack?: number;
  delay?: number;
}

class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noiseBuf!: AudioBuffer;
  private muted = false;
  /** Ultimo istante in cui è suonato ogni tipo di suono: evita i "muri" di rumore. */
  private readonly last = new Map<string, number>();
  private musicTimer = 0;
  private nextNote = 0;
  private step = 0;

  get enabled(): boolean { return !this.muted; }

  /** Da chiamare al primo tasto o clic: prima il browser tiene l'audio spento. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    // un compressore leggero: venti scoppi insieme non devono spaccare le casse
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.22;
    this.music.connect(this.master);

    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.startMusic();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  dispose(): void {
    window.clearInterval(this.musicTimer);
    void this.ctx?.close();
    this.ctx = null;
  }

  /* --- mattoni ---------------------------------------------------------- */

  /** Vero se il suono `key` può suonare (non è suonato negli ultimi `gap` secondi). */
  private gate(key: string, gap: number): boolean {
    if (!this.ctx || this.muted) return false;
    const t = this.ctx.currentTime;
    if (t - (this.last.get(key) ?? -1) < gap) return false;
    this.last.set(key, t);
    return true;
  }

  private tone(freq: number, dur: number, vol: number, o: ToneOpts = {}, out?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    const g = ctx.createGain();
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = osc.connect(g);
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      node = node.connect(p);
    }
    node.connect(out ?? this.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, o: NoiseOpts = {}, out?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(out ?? this.sfx);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  /* --- suoni del gioco ---------------------------------------------------- */

  /** Salto: più è leggero, più è acuto e arioso. */
  jump(mass: number): void {
    if (!this.gate('jump', 0.05)) return;
    const f = 520 - mass * 260;
    this.tone(f, 0.14, 0.12, { type: 'square', to: f * 1.6 });
    this.noise(0.08, 0.05, { filter: 'highpass', freq: 3000 });
  }

  /** Atterraggio: `impact` 0..1, il pesante è un tonfo sordo. */
  land(impact: number, mass: number): void {
    if (impact < 0.15 || !this.gate('land', 0.06)) return;
    this.tone(110 - mass * 50, 0.18, 0.15 + impact * 0.25, { type: 'sine', to: 40 });
    this.noise(0.12, 0.08 + impact * 0.12, { freq: 500, to: 120 });
  }

  throwEmber(): void {
    if (!this.gate('throw', 0.04)) return;
    this.noise(0.12, 0.12, { filter: 'bandpass', freq: 900, to: 2400, q: 2 });
    this.tone(300, 0.08, 0.05, { type: 'triangle', to: 600 });
  }

  /** Il soffio: un getto d'aria filtrato che sale. */
  blow(mass: number): void {
    if (!this.gate('blow', 0.05)) return;
    this.noise(0.35, 0.22, { filter: 'bandpass', freq: 500 + (1 - mass) * 500, to: 2500, q: 1.2, attack: 0.03 });
  }

  /** Scoppio di una brace: grosso = più grave e lungo. */
  explosion(size: 'big' | 'mid' | 'small', missile = false): void {
    if (!this.gate('boom', 0.035)) return;
    const k = size === 'big' ? 1 : size === 'mid' ? 0.75 : 0.5;
    this.tone(90 * (1.4 - k * 0.4), 0.35 + k * 0.2, 0.35 * k + 0.1, { type: 'sine', to: 30 });
    this.noise(0.3 + k * 0.25, 0.35 * k + 0.12, { freq: 2500, to: 200 });
    this.noise(0.06, 0.2, { filter: 'highpass', freq: 2500 });
    if (missile) this.tone(900, 0.09, 0.08, { type: 'square', to: 300 });
  }

  /** Schianto di GHISA: un colpo di maglio sul pavimento. */
  slam(power: number): void {
    if (!this.gate('slam', 0.05)) return;
    this.tone(70, 0.5, 0.45 + power * 0.2, { type: 'sine', to: 28 });
    this.tone(140, 0.25, 0.15, { type: 'triangle', to: 50 });
    this.noise(0.4, 0.35, { freq: 900, to: 90 });
  }

  /** Maglio che batte: metallo su metallo. */
  hammer(volume: number): void {
    if (!this.gate('hammer', 0.08)) return;
    this.tone(180, 0.3, 0.25 * volume, { type: 'square', to: 60 });
    this.tone(1240, 0.25, 0.06 * volume, { type: 'sine' });
    this.tone(1870, 0.2, 0.04 * volume, { type: 'sine' });
    this.noise(0.2, 0.25 * volume, { freq: 1600, to: 200 });
  }

  /** Inversione delle masse: due note che si scambiano. */
  invert(): void {
    if (!this.gate('invert', 0.1)) return;
    this.tone(392, 0.16, 0.12, { type: 'triangle', to: 587, pan: -0.4 });
    this.tone(587, 0.16, 0.12, { type: 'triangle', to: 392, pan: 0.4 });
  }

  denied(): void {
    if (!this.gate('denied', 0.15)) return;
    this.tone(140, 0.12, 0.1, { type: 'square' });
    this.tone(110, 0.14, 0.1, { type: 'square', delay: 0.08 });
  }

  gem(): void {
    if (!this.gate('gem', 0.04)) return;
    [1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.25, 0.1, { type: 'triangle', delay: i * 0.06 }));
  }

  brazier(): void {
    if (!this.gate('brazier', 0.05)) return;
    this.noise(0.6, 0.18, { filter: 'bandpass', freq: 400, to: 1800, q: 0.7, attack: 0.05 });
    this.tone(330, 0.4, 0.08, { type: 'triangle', to: 494, delay: 0.05 });
  }

  /** Lo Scoriatore che si scioglie: uno sfrigolio. */
  melt(): void {
    if (!this.gate('melt', 0.06)) return;
    this.noise(0.5, 0.2, { filter: 'highpass', freq: 2000, to: 6000 });
    this.tone(400, 0.3, 0.08, { type: 'sawtooth', to: 80 });
  }

  vent(): void {
    if (!this.gate('vent', 0.3)) return;
    this.noise(0.7, 0.14, { filter: 'highpass', freq: 3500, attack: 0.05 });
  }

  death(): void {
    if (!this.gate('death', 0.1)) return;
    this.tone(330, 0.6, 0.18, { type: 'sawtooth', to: 55 });
    this.noise(0.5, 0.2, { freq: 1200, to: 100 });
  }

  /** Rinascita: arpeggio che sale; perfetta = più lungo e luminoso. */
  revive(perfect: boolean): void {
    if (!this.gate('revive', 0.1)) return;
    const notes = perfect ? [523, 659, 784, 1047, 1319] : [392, 494, 587];
    notes.forEach((f, i) => this.tone(f, 0.3, 0.11, { type: 'triangle', delay: i * 0.07 }));
  }

  resonanceFull(): void {
    if (!this.gate('res', 0.5)) return;
    [659, 988, 1319].forEach((f, i) => this.tone(f, 0.6, 0.08, { type: 'sine', delay: i * 0.09 }));
  }

  /** Fusione: un accordo che si gonfia. */
  fusion(): void {
    if (!this.gate('fusion', 0.3)) return;
    [131, 196, 262, 330, 392].forEach((f, i) => this.tone(f, 1.4, 0.09, { type: 'sawtooth', attack: 0.25, delay: i * 0.03 }));
    this.noise(1.2, 0.15, { filter: 'bandpass', freq: 300, to: 3000, attack: 0.3 });
  }

  unfuse(hit: boolean): void {
    if (!this.gate('unfuse', 0.2)) return;
    if (hit) this.noise(0.4, 0.3, { freq: 3000, to: 200 });
    this.tone(392, 0.4, 0.1, { type: 'triangle', to: 131 });
  }

  jet(): void {
    if (!this.gate('jet', 0.05)) return;
    this.noise(0.3, 0.25, { filter: 'bandpass', freq: 800, to: 300, q: 1 });
    this.tone(220, 0.2, 0.06, { type: 'sawtooth', to: 110 });
  }

  cannon(): void {
    if (!this.gate('cannon', 0.05)) return;
    this.tone(160, 0.18, 0.25, { type: 'square', to: 60 });
    this.noise(0.15, 0.25, { freq: 1800, to: 300 });
  }

  victory(): void {
    if (!this.gate('victory', 1)) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 0.12, { type: 'triangle', delay: i * 0.12 }));
    this.tone(1047, 1.2, 0.08, { type: 'sine', delay: 0.5 });
  }

  loss(): void {
    if (!this.gate('loss', 1)) return;
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 0.1, { type: 'triangle', delay: i * 0.14 }));
  }

  /* --- musica ------------------------------------------------------------- */

  /**
   * Musica della fonderia: un bordone basso e un arpeggio lento in La minore
   * pentatonico, generato in tempo reale. Poco, sotto tutto il resto.
   */
  private startMusic(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // bordone: due seghe appena stonate, filtrate scure
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const drone = ctx.createGain();
    drone.gain.value = 0.12;
    lp.connect(drone).connect(this.music);
    for (const f of [55, 55.4, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    // il filtro respira piano
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();

    const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
    this.nextNote = ctx.currentTime + 0.5;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx) return;
      // programmiamo le note un po' in anticipo: niente singhiozzi se il frame tarda
      while (this.nextNote < this.ctx.currentTime + 0.4) {
        const beat = this.step++ % 16;
        const delay = this.nextNote - this.ctx.currentTime;
        if (beat % 2 === 0 && Math.random() < 0.7) {
          const f = scale[Math.floor(Math.random() * scale.length)]!;
          this.tone(f, 1.1, 0.05, { type: 'triangle', attack: 0.02, delay }, this.music);
        }
        if (beat === 0) this.tone(110, 2.4, 0.06, { type: 'sine', attack: 0.3, delay }, this.music);
        this.nextNote += 0.42;
      }
    }, 100);
  }
}

export const sound = new Sound();
