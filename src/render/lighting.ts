import { CanvasSource, Container, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import type { PassInfo } from './splitScreen';
import { WORLD } from './theme';

/**
 * ILLUMINAZIONE 2D.
 *
 * Tecnica classica della "lightmap": per ogni passaggio di camera si
 * disegnano tutte le luci (sprite a gradiente radiale, in somma) in una
 * texture piccola, partendo da un colore ambiente; poi quella texture viene
 * MOLTIPLICATA sopra il mondo già disegnato. Lontano dalle luci resta solo
 * l'ambiente (blu, smorzato); vicino a una luce i colori tornano pieni.
 *
 * Costo: una render texture a metà della risoluzione del mondo (≈ 330x190)
 * e qualche decina di sprite per passaggio. Le ombre portate non ci sono:
 * scelta voluta, il gioco deve restare leggero.
 *
 * Le luci si registrano in modalità immediata: ogni frame chi disegna
 * (personaggi, elementi, scenografia) chiama `sceneLights.put(...)` e la
 * pipeline le consuma e svuota la lista dopo il rendering.
 */

export interface LightSpec {
  x: number;
  y: number;
  /** Raggio in pixel di mondo. */
  radius: number;
  color: number;
  /** 0..1 (oltre 1 satura verso il bianco). */
  intensity: number;
}

export class LightRegistry {
  readonly items: LightSpec[] = [];
  private used = 0;

  put(x: number, y: number, radius: number, color: number, intensity = 1): void {
    if (intensity <= 0.01 || radius <= 1) return;
    let l = this.items[this.used];
    if (!l) { l = { x, y, radius, color, intensity }; this.items.push(l); }
    l.x = x; l.y = y; l.radius = radius; l.color = color; l.intensity = intensity;
    this.used++;
  }

  get count(): number { return this.used; }
  at(i: number): LightSpec { return this.items[i]!; }
  clear(): void { this.used = 0; }
}

/** Registro globale: lo riempiono i `draw()` e lo svuota la pipeline. */
export const sceneLights = new LightRegistry();

let lightTex: Texture | null = null;

/** Gradiente radiale morbido con un nucleo più caldo. */
export function lightTexture(): Texture {
  if (lightTex) return lightTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.78)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.36)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  lightTex = new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'linear' }) });
  return lightTex;
}

export class LightLayer {
  /** Sprite da mettere nel mondo sopra tutto ciò che va illuminato. */
  readonly overlay: Sprite;
  private readonly rt: RenderTexture;
  private readonly root = new Container();
  private readonly pool: Sprite[] = [];
  private readonly scale = 0.5;
  ambient: number = WORLD.ambient;
  enabled = true;

  constructor(lowW: number, lowH: number) {
    this.rt = RenderTexture.create({
      width: Math.ceil(lowW * this.scale), height: Math.ceil(lowH * this.scale),
      resolution: 1, scaleMode: 'linear',
    });
    this.overlay = new Sprite(this.rt);
    this.overlay.label = 'light-overlay';
    this.overlay.blendMode = 'multiply';
    this.overlay.scale.set(1 / this.scale);
    this.root.scale.set(this.scale);
  }

  /** Disegna la lightmap per questa camera e allinea l'overlay. */
  preparePass(renderer: Renderer, pass: PassInfo, lights: LightRegistry): void {
    this.overlay.visible = this.enabled;
    if (!this.enabled) return;
    const tex = lightTexture();
    const n = lights.count;
    // Cull grossolano: luci fuori dal rettangolo della texture si saltano.
    const x0 = pass.ox, y0 = pass.oy, x1 = pass.ox + pass.w, y1 = pass.oy + pass.h;
    let used = 0;
    for (let i = 0; i < n; i++) {
      const l = lights.at(i);
      if (l.x + l.radius < x0 || l.x - l.radius > x1 || l.y + l.radius < y0 || l.y - l.radius > y1) continue;
      let s = this.pool[used];
      if (!s) {
        s = new Sprite(tex);
        s.anchor.set(0.5);
        s.blendMode = 'add';
        this.pool.push(s);
        this.root.addChild(s);
      }
      s.visible = true;
      s.position.set(l.x, l.y);
      s.scale.set((l.radius * 2) / tex.width);
      s.tint = l.color;
      s.alpha = Math.min(1, l.intensity);
      used++;
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]!.visible = false;

    this.root.position.set(-pass.ox * this.scale, -pass.oy * this.scale);
    renderer.render({ container: this.root, target: this.rt, clear: true, clearColor: this.ambient });
    this.overlay.position.set(pass.ox, pass.oy);
  }
}
