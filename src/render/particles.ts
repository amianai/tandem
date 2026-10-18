import { Container, Sprite, type Texture } from 'pixi.js';
import { randRange } from '../core/math';
import { PixelCanvas } from './art/pixel';
import { ELEMENT_COLORS } from './theme';

/**
 * Stili di particella "pixel art". Invece di rimpicciolire una texture
 * morbida da 512 px (che a 1:1 diventa una macchia rumorosa), ogni stile ha
 * pochi fotogrammi disegnati in pixel interi e la particella passa dal più
 * grande al più piccolo mentre muore: come nei platform 2D curati.
 *
 * - `spark`: scintilla additiva, 3 → 2 → 1 px; se veloce diventa una stria;
 * - `dust`: sbuffo di polvere a disco retinato, si sfalda;
 * - `debris`: scheggia solida con gravità, non additiva;
 * - `texture`: la texture passata, scalata come prima (retrocompatibile).
 */
export type ParticleStyle = 'spark' | 'dust' | 'debris' | 'texture';

interface Particle {
  sprite: Sprite;
  style: ParticleStyle;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  gravity: number;
  drag: number;
  spin: number;
  startScale: number; endScale: number;
  /** Dimensione in pixel per gli stili pixel art. */
  size: number;
  startAlpha: number;
  active: boolean;
}

export interface EmitOptions {
  texture: Texture;
  x: number; y: number;
  count?: number;
  speed?: [number, number];
  angle?: [number, number];
  life?: [number, number];
  scale?: [number, number];
  endScale?: number;
  gravity?: number;
  drag?: number;
  alpha?: number;
  tint?: number;
  additive?: boolean;
  spin?: number;
  /** Forza uno stile; altrimenti lo si deduce dalla texture (vedi `registerParticleStyle`). */
  style?: ParticleStyle;
}

/* ------------------------------------------------------------------ *
 * Registro texture -> stile: chi emette continua a passare le texture di
 * sempre (scintilla, fumo) e qui le reinterpretiamo in pixel art.
 * ------------------------------------------------------------------ */
const styleOf = new Map<Texture, ParticleStyle>();

export function registerParticleStyle(texture: Texture, style: ParticleStyle): void {
  styleOf.set(texture, style);
}

interface Frames { spark: Texture[]; streak: Texture; dust: Texture[]; debris: Texture[] }
let frames: Frames | null = null;

function pixelFrames(): Frames {
  if (frames) return frames;
  const W = 0xffffff;
  const spark = [1, 2, 3].map((n) => {
    const pc = new PixelCanvas(n, n);
    if (n === 3) { // piccola croce: più viva di un quadrato
      pc.set(1, 0, W); pc.set(0, 1, W); pc.set(1, 1, W); pc.set(2, 1, W); pc.set(1, 2, W);
    } else pc.rect(0, 0, n, n, W);
    return pc.toTexture();
  });
  const st = new PixelCanvas(4, 1);
  st.rect(1, 0, 3, 1, W);
  st.set(0, 0, W, 0.5);
  const dust = [1, 2, 3, 4, 5].map((r) => {
    const s = r * 2 + 1;
    const pc = new PixelCanvas(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const d = Math.hypot(x - r, y - r) / (r + 0.5);
        if (d > 1) continue;
        // bordo retinato: il centro pieno, la periferia a scacchiera
        if (d > 0.62 && ((x + y) & 1)) continue;
        pc.set(x, y, W);
      }
    }
    return pc.toTexture();
  });
  const debris = [[2, 2], [2, 1], [3, 2]].map(([w, h]) => {
    const pc = new PixelCanvas(w!, h!);
    pc.rect(0, 0, w!, h!, W);
    return pc.toTexture();
  });
  frames = { spark, streak: st.toTexture(), dust, debris };
  return frames;
}

/** Le polveri chiarissime di prima stonerebbero nella fonderia buia. */
function dustTint(t: number): number {
  const r = (t >> 16) & 255, g = (t >> 8) & 255, b = t & 255;
  return r > 200 && g > 200 && b > 200 ? ELEMENT_COLORS.dust : t;
}

/**
 * Sistema a particelle con pool fisso: nessuna allocazione durante il gioco,
 * quindi nessun singhiozzo del garbage collector a metà salto.
 */
export class Particles {
  readonly container = new Container();
  private readonly pool: Particle[] = [];
  private cursor = 0;

  constructor(capacity = 480) {
    this.container.label = 'particles';
    pixelFrames();
    for (let i = 0; i < capacity; i++) {
      const sprite = new Sprite();
      sprite.visible = false;
      this.container.addChild(sprite);
      this.pool.push({
        sprite, style: 'texture', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, gravity: 0, drag: 0,
        spin: 0, startScale: 1, endScale: 0, size: 1, startAlpha: 1, active: false,
      });
    }
  }

  emit(o: EmitOptions): void {
    const count = o.count ?? 8;
    const [sMin, sMax] = o.speed ?? [40, 110];
    const [aMin, aMax] = o.angle ?? [0, Math.PI * 2];
    const [lMin, lMax] = o.life ?? [0.25, 0.5];
    const [scMin, scMax] = o.scale ?? [0.12, 0.2];
    const style = o.style ?? styleOf.get(o.texture) ?? 'texture';

    for (let i = 0; i < count; i++) {
      const p = this.take();
      const angle = randRange(aMin, aMax);
      const speed = randRange(sMin, sMax);
      p.style = style;
      p.x = o.x; p.y = o.y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.maxLife = randRange(lMin, lMax);
      p.life = p.maxLife;
      p.gravity = o.gravity ?? 0;
      p.drag = o.drag ?? 2;
      p.spin = o.spin ?? 0;
      p.startScale = randRange(scMin, scMax);
      p.endScale = o.endScale ?? 0;
      p.startAlpha = o.alpha ?? 1;
      p.active = true;

      const s = p.sprite;
      s.alpha = p.startAlpha;
      s.visible = true;
      s.rotation = 0;
      if (style === 'texture') {
        s.texture = o.texture;
        s.anchor.set(0.5);
        s.scale.set(p.startScale);
        s.rotation = randRange(0, Math.PI * 2);
        s.tint = o.tint ?? 0xffffff;
        s.blendMode = o.additive ? 'add' : 'normal';
        s.position.set(o.x, o.y);
        continue;
      }
      s.scale.set(1);
      if (style === 'spark') {
        // scala 0.06..0.26 dei vecchi emettitori -> 1..3 pixel
        p.size = p.startScale < 0.1 ? 1 : p.startScale < 0.17 ? 2 : 3;
        s.texture = pixelFrames().spark[p.size - 1]!;
        s.tint = o.tint ?? 0xffffff;
        s.blendMode = o.additive === false ? 'normal' : 'add';
      } else if (style === 'dust') {
        p.size = Math.max(1, Math.min(5, Math.round(p.startScale * 26)));
        s.texture = pixelFrames().dust[p.size - 1]!;
        s.tint = dustTint(o.tint ?? ELEMENT_COLORS.dust);
        s.blendMode = 'normal';
        s.alpha = p.startAlpha = Math.min(0.85, p.startAlpha);
      } else {
        p.size = Math.floor(Math.random() * 3);
        s.texture = pixelFrames().debris[p.size]!;
        s.tint = o.tint ?? 0x6c7696;
        s.blendMode = 'normal';
      }
      this.place(p);
    }
  }

  update(dt: number): void {
    const f = pixelFrames();
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      const damping = Math.exp(-p.drag * dt);
      p.vx *= damping;
      p.vy = p.vy * damping + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const s = p.sprite;
      const k = p.life / p.maxLife;          // 1 -> 0

      if (p.style === 'texture') {
        s.position.set(p.x, p.y);
        s.rotation += p.spin * dt;
        s.alpha = p.startAlpha * k;
        s.scale.set(p.endScale + (p.startScale - p.endScale) * k);
        continue;
      }
      if (p.style === 'spark') {
        const speed = Math.hypot(p.vx, p.vy);
        const n = Math.max(1, Math.ceil(p.size * Math.min(1, k * 1.6)));
        if (speed > 140 && n > 1) {
          s.texture = f.streak;
          s.rotation = Math.atan2(p.vy, p.vx);
        } else {
          s.texture = f.spark[n - 1]!;
          s.rotation = 0;
        }
        s.alpha = p.startAlpha * Math.min(1, k * 2.2);
      } else if (p.style === 'dust') {
        const n = Math.max(1, Math.ceil(p.size * (0.35 + 0.65 * k)));
        s.texture = f.dust[n - 1]!;
        s.alpha = p.startAlpha * k;
      } else {
        s.alpha = Math.min(1, k * 3);
      }
      this.place(p);
    }
  }

  /**
   * Posizione intera: le particelle stanno sulla griglia dei pixel del mondo.
   * Con l'ancora al centro, una texture di lato dispari cadrebbe a metà
   * pixel; quindi ancora in alto a sinistra e centro arrotondato a mano.
   * Le strie ruotate tengono l'ancora al centro, sul centro di un pixel.
   */
  private place(p: Particle): void {
    const s = p.sprite;
    if (s.rotation !== 0) {
      if (s.anchor.x !== 0.5) s.anchor.set(0.5);
      s.position.set(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5);
      return;
    }
    if (s.anchor.x !== 0) s.anchor.set(0);
    const w = s.texture.width, h = s.texture.height;
    s.position.set(Math.round(p.x - w / 2), Math.round(p.y - h / 2));
  }

  private take(): Particle {
    // Ring buffer: se finiamo i slot riusiamo i più vecchi.
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[(this.cursor + i) % this.pool.length]!;
      if (!p.active) {
        this.cursor = (this.cursor + i + 1) % this.pool.length;
        return p;
      }
    }
    const p = this.pool[this.cursor]!;
    this.cursor = (this.cursor + 1) % this.pool.length;
    return p;
  }
}
