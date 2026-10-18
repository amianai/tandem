import { CanvasSource, Texture } from 'pixi.js';

/**
 * Pittura di pixel art in codice.
 *
 * Tutti gli asset del gioco (terreno, sfondi, particelle, gemme) vengono
 * dipinti qui una volta sola all'avvio, pixel per pixel, su un buffer RGBA.
 * Niente antialiasing, niente interpolazione: solo colori della palette,
 * dithering ordinato per le sfumature e rumore deterministico per la
 * variazione. Così l'arte resta coerente con la griglia del mondo (1 pixel di
 * texture = 1 pixel di mondo) e non dipende da pacchetti esterni.
 */
export class PixelCanvas {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  readonly px: Uint8ClampedArray;

  constructor(readonly width: number, readonly height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.image = this.ctx.createImageData(width, height);
    this.px = this.image.data;
  }

  /** Scrive un pixel con alpha (0..1) mescolato sopra quello che c'è. */
  set(x: number, y: number, color: number, a = 1): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || a <= 0) return;
    const i = (y * this.width + x) * 4;
    const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
    const d = this.px;
    if (a >= 1) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      return;
    }
    // "source over" su alpha non premoltiplicato
    const da = d[i + 3]! / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    d[i] = (r * a + d[i]! * da * (1 - a)) / oa;
    d[i + 1] = (g * a + d[i + 1]! * da * (1 - a)) / oa;
    d[i + 2] = (b * a + d[i + 2]! * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }

  /** Alpha del pixel (0..1). */
  alphaAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.px[(y * this.width + x) * 4 + 3]! / 255;
  }

  /** Moltiplica il colore esistente (ombre, AO) senza toccare l'alpha. */
  shade(x: number, y: number, k: number): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const d = this.px;
    d[i] = d[i]! * k; d[i + 1] = d[i + 1]! * k; d[i + 2] = d[i + 2]! * k;
  }

  clearPx(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.px[i + 3] = 0;
  }

  rect(x: number, y: number, w: number, h: number, color: number, a = 1): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color, a);
  }

  hline(x: number, y: number, w: number, color: number, a = 1): void { this.rect(x, y, w, 1, color, a); }
  vline(x: number, y: number, h: number, color: number, a = 1): void { this.rect(x, y, 1, h, color, a); }

  /** Linea di Bresenham: nessun pixel "a metà". */
  line(x0: number, y0: number, x1: number, y1: number, color: number, a = 1): void {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, color, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Disco pieno, centro e raggio anche frazionari (test sul centro del pixel). */
  disc(cx: number, cy: number, r: number, color: number, a = 1): void {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, color, a);
      }
    }
  }

  /** Riempie un poligono convesso o concavo (regola pari-dispari, scanline). */
  poly(points: readonly number[], color: number, a = 1): void {
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < points.length; i += 2) {
      minY = Math.min(minY, points[i]!); maxY = Math.max(maxY, points[i]!);
    }
    const n = points.length / 2;
    const xs: number[] = [];
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const ax = points[i * 2]!, ay = points[i * 2 + 1]!;
        const j = (i + 1) % n;
        const bx = points[j * 2]!, by = points[j * 2 + 1]!;
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
          xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]!); x < Math.round(xs[k + 1]!); x++) this.set(x, y, color, a);
      }
    }
  }

  /** Copia i pixel nel canvas. Va chiamato prima di usare il canvas. */
  commit(): HTMLCanvasElement {
    this.ctx.putImageData(this.image, 0, 0);
    return this.canvas;
  }

  /** Texture Pixi con campionamento "nearest": pixel netti a ogni zoom. */
  toTexture(label?: string): Texture {
    this.commit();
    const source = new CanvasSource({ resource: this.canvas, scaleMode: 'nearest', label });
    return new Texture({ source, label });
  }
}

/* ------------------------------------------------------------------ *
 * Rumore e dithering deterministici: stesso disegno a ogni avvio.
 * ------------------------------------------------------------------ */

/** Hash intero -> [0, 1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise liscio in [0, 1). */
export function noise2(x: number, y: number, seed = 0): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

/** Rumore frattale a più ottave. */
export function fbm(x: number, y: number, seed = 0, octaves = 3): number {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += noise2(x * f, y * f, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / norm;
}

const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

/** Soglia di Bayer 4x4 in (0, 1): `t > bayer(x, y)` = dithering ordinato. */
export function bayer(x: number, y: number): number {
  return (BAYER4[((y & 3) << 2) | (x & 3)]! + 0.5) / 16;
}

/**
 * Sceglie un colore da una rampa in base a `t` (0..1) con dithering:
 * le sfumature diventano bande nette con un bordo a trama, come nella pixel
 * art dipinta a mano.
 */
export function rampDither(ramp: readonly number[], t: number, x: number, y: number): number {
  const n = ramp.length - 1;
  const f = Math.max(0, Math.min(0.9999, t)) * n;
  const i = Math.floor(f);
  const frac = f - i;
  return ramp[frac > bayer(x, y) ? Math.min(n, i + 1) : i]!;
}

/** Generatore pseudo-casuale con seme (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
