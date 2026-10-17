export const TAU = Math.PI * 2;

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : clamp((v - a) / (b - a), 0, 1);

/** Sposta `v` verso `target` di al massimo `delta`. */
export const approach = (v: number, target: number, delta: number): number =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);

/**
 * Smoothing indipendente dal frame rate: a differenza di `lerp(a, b, 0.1)`
 * dentro un update, il risultato non cambia se il dt cambia.
 */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Differenza angolare minima, sempre in [-PI, PI]. */
export const angleDelta = (a: number, b: number): number => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export const dampAngle = (a: number, b: number, lambda: number, dt: number): number =>
  a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const randRange = (min: number, max: number): number => min + Math.random() * (max - min);
export const randSign = (): number => (Math.random() < 0.5 ? -1 : 1);

export interface Rect { x: number; y: number; w: number; h: number }

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
