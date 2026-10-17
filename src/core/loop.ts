/**
 * Game loop a timestep fisso con interpolazione di rendering.
 *
 * La fisica gira sempre a `step` secondi esatti (determinismo, collisioni
 * precise, feel identico su 60Hz e 144Hz). Il rendering riceve `alpha`, la
 * frazione di step da interpolare tra stato precedente e stato corrente.
 */
export class Loop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  /** Secondi di tempo reale trascorsi nell'ultimo frame (per animazioni non fisiche). */
  frameDelta = 0;
  fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;

  constructor(
    private readonly step: number,
    private readonly fixedUpdate: (dt: number) => void,
    private readonly render: (alpha: number, frameDelta: number) => void,
    private readonly maxSubSteps = 8,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    // Clamp: dopo un tab in background non recuperiamo minuti di simulazione.
    const delta = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    this.frameDelta = delta;

    this.fpsAccum += delta;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSubSteps) {
      this.fixedUpdate(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    // Se siamo troppo indietro molliamo il debito invece di spiralare.
    if (steps === this.maxSubSteps) this.accumulator = 0;

    this.render(this.accumulator / this.step, delta);
  };
}
