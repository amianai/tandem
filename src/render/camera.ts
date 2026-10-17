import { clamp, damp, lerp } from '../core/math';

export interface CameraState { x: number; y: number; zoom: number }

export interface Bounds { w: number; h: number }

/** Limita il centro camera perché non si veda oltre il bordo del livello. */
export function clampToBounds(cam: CameraState, bounds: Bounds, viewW: number, viewH: number): void {
  const halfW = viewW / (2 * cam.zoom);
  const halfH = viewH / (2 * cam.zoom);
  cam.x = bounds.w <= halfW * 2 ? bounds.w / 2 : clamp(cam.x, halfW, bounds.w - halfW);
  cam.y = bounds.h <= halfH * 2 ? bounds.h / 2 : clamp(cam.y, halfH, bounds.h - halfH);
}

export function lerpCamera(a: CameraState, b: CameraState, t: number, out: CameraState): CameraState {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.zoom = lerp(a.zoom, b.zoom, t);
  return out;
}

/**
 * Inseguitore morbido con lookahead: la camera anticipa il movimento,
 * così si vede più spazio nella direzione in cui si sta andando.
 */
export class Follower {
  x = 0;
  y = 0;
  private leadX = 0;
  private leadY = 0;

  constructor(
    private readonly lookaheadX = 26,
    private readonly lookaheadY = 14,
    private readonly stiffness = 9,
  ) {}

  snap(x: number, y: number): void { this.x = x; this.y = y; this.leadX = 0; this.leadY = 0; }

  update(dt: number, targetX: number, targetY: number, vx: number, vy: number): void {
    const desiredLeadX = clamp(vx / 140, -1, 1) * this.lookaheadX;
    // In caduta guardiamo più in basso, in salita quasi per niente.
    const desiredLeadY = clamp(vy / 420, -0.4, 1) * this.lookaheadY;
    this.leadX = damp(this.leadX, desiredLeadX, 3.5, dt);
    this.leadY = damp(this.leadY, desiredLeadY, 3.5, dt);
    this.x = damp(this.x, targetX + this.leadX, this.stiffness, dt);
    this.y = damp(this.y, targetY + this.leadY, this.stiffness, dt);
  }
}

/** Trauma-based screen shake: si accumula e decade da solo. */
export class Shake {
  private trauma = 0;
  offsetX = 0;
  offsetY = 0;
  angle = 0;

  add(amount: number): void { this.trauma = clamp(this.trauma + amount, 0, 1); }

  update(dt: number, time: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma; // quadratico: piccoli colpi restano discreti
    const t = time * 34;
    this.offsetX = Math.sin(t * 1.7) * 7 * s;
    this.offsetY = Math.cos(t * 2.3) * 7 * s;
    this.angle = Math.sin(t * 1.1) * 0.012 * s;
  }
}
