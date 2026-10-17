import { Container, Sprite, type Texture } from 'pixi.js';
import { rectsOverlap, type Rect } from '../core/math';
import type { Particles } from '../render/particles';

interface Gem {
  sprite: Sprite;
  x: number; y: number;
  taken: boolean;
  phase: number;
}

/** Gemme raccoglibili: servono da guida visiva sul percorso. */
export class Pickups {
  readonly container = new Container();
  private readonly gems: Gem[] = [];
  collected = 0;

  constructor(positions: readonly { x: number; y: number }[], texture: Texture) {
    this.container.label = 'pickups';
    for (const p of positions) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(p.x, p.y - 9);
      this.container.addChild(sprite);
      this.gems.push({ sprite, x: p.x, y: p.y - 9, taken: false, phase: Math.random() * Math.PI * 2 });
    }
  }

  get total(): number { return this.gems.length; }

  update(dt: number, boxes: readonly Rect[], particles: Particles, spark: Texture): number {
    let taken = 0;
    for (const gem of this.gems) {
      if (gem.taken) continue;
      gem.phase += dt * 2.6;
      gem.sprite.y = gem.y + Math.sin(gem.phase) * 2.2;
      gem.sprite.rotation = Math.sin(gem.phase * 0.5) * 0.12;

      const box: Rect = { x: gem.x - 7, y: gem.y - 7, w: 14, h: 14 };
      if (boxes.some((b) => rectsOverlap(b, box))) {
        gem.taken = true;
        gem.sprite.visible = false;
        this.collected++;
        taken++;
        particles.emit({
          texture: spark, x: gem.x, y: gem.y, count: 16,
          speed: [40, 170], life: [0.25, 0.6], scale: [0.08, 0.18],
          tint: 0x8fe3ff, additive: true, gravity: 90, drag: 2.5,
        });
      }
    }
    return taken;
  }
}
