import { Container, Sprite, type Texture } from 'pixi.js';
import { randRange } from '../core/math';

interface Particle {
  sprite: Sprite;
  vx: number; vy: number;
  life: number; maxLife: number;
  gravity: number;
  drag: number;
  spin: number;
  startScale: number; endScale: number;
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
}

/**
 * Sistema a particelle con pool fisso: nessuna allocazione durante il gioco,
 * quindi nessun singhiozzo del garbage collector a metà salto.
 */
export class Particles {
  readonly container = new Container();
  private readonly pool: Particle[] = [];
  private cursor = 0;

  constructor(capacity = 420) {
    this.container.label = 'particles';
    for (let i = 0; i < capacity; i++) {
      const sprite = new Sprite();
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.container.addChild(sprite);
      this.pool.push({
        sprite, vx: 0, vy: 0, life: 0, maxLife: 1, gravity: 0, drag: 0,
        spin: 0, startScale: 1, endScale: 0, startAlpha: 1, active: false,
      });
    }
  }

  emit(o: EmitOptions): void {
    const count = o.count ?? 8;
    const [sMin, sMax] = o.speed ?? [40, 110];
    const [aMin, aMax] = o.angle ?? [0, Math.PI * 2];
    const [lMin, lMax] = o.life ?? [0.25, 0.5];
    const [scMin, scMax] = o.scale ?? [0.12, 0.2];

    for (let i = 0; i < count; i++) {
      const p = this.take();
      const angle = randRange(aMin, aMax);
      const speed = randRange(sMin, sMax);
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
      s.texture = o.texture;
      s.position.set(o.x, o.y);
      s.scale.set(p.startScale);
      s.alpha = p.startAlpha;
      s.tint = o.tint ?? 0xffffff;
      s.rotation = randRange(0, Math.PI * 2);
      s.blendMode = o.additive ? 'add' : 'normal';
      s.visible = true;
    }
  }

  update(dt: number): void {
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
      const s = p.sprite;
      s.x += p.vx * dt;
      s.y += p.vy * dt;
      s.rotation += p.spin * dt;

      const k = p.life / p.maxLife;          // 1 -> 0
      s.alpha = p.startAlpha * k;
      s.scale.set(p.endScale + (p.startScale - p.endScale) * k);
    }
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
