import { Container, Graphics } from 'pixi.js';
import { TILE } from '../render/assets';
import { clamp, damp, easeOutCubic, type Rect } from '../core/math';
import { Cell, type Tilemap } from './tilemap';
import type { Particles } from '../render/particles';
import type { Texture } from 'pixi.js';

export interface DoorFeedback {
  p1Holding: boolean;
  p2Holding: boolean;
  inSync: boolean;
  bothNear: boolean;
}

/**
 * Porta ad accordo: si apre solo se entrambi i giocatori tengono premuto il
 * proprio tasto azione nello stesso momento, standole vicino. È l'unica
 * serratura che una persona sola non può forzare, perché i due tasti stanno
 * agli estremi opposti della tastiera.
 */
export class ChordDoor {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  private readonly tiles: { tx: number; ty: number }[] = [];

  readonly bounds: Rect;
  /** 0..1, quanto è carica la serratura. */
  charge = 0;
  opened = false;
  private openAnim = 0;
  private glow1 = 0;
  private glow2 = 0;
  private shakePhase = 0;

  static readonly HOLD_TIME = 0.7;
  static readonly RANGE = 76;

  constructor(
    private readonly map: Tilemap,
    tilePositions: readonly { x: number; y: number }[],
    private readonly colorA: number,
    private readonly colorB: number,
  ) {
    this.container.label = 'chord-door';
    this.container.addChild(this.gfx);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of tilePositions) {
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor((p.y - 1) / TILE);
      this.tiles.push({ tx, ty });
      minX = Math.min(minX, tx * TILE);
      minY = Math.min(minY, ty * TILE);
      maxX = Math.max(maxX, tx * TILE + TILE);
      maxY = Math.max(maxY, ty * TILE + TILE);
    }
    this.bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  get centerX(): number { return this.bounds.x + this.bounds.w / 2; }
  get centerY(): number { return this.bounds.y + this.bounds.h / 2; }

  distanceTo(x: number, y: number): number {
    const dx = Math.max(this.bounds.x - x, 0, x - (this.bounds.x + this.bounds.w));
    const dy = Math.max(this.bounds.y - y, 0, y - (this.bounds.y + this.bounds.h));
    return Math.hypot(dx, dy);
  }

  update(dt: number, fb: DoorFeedback, particles: Particles, spark: Texture): boolean {
    this.glow1 = damp(this.glow1, fb.p1Holding && fb.bothNear ? 1 : 0, 14, dt);
    this.glow2 = damp(this.glow2, fb.p2Holding && fb.bothNear ? 1 : 0, 14, dt);

    if (this.opened) {
      this.openAnim = Math.min(1, this.openAnim + dt * 2.2);
      return false;
    }

    const charging = fb.bothNear && fb.inSync;
    if (charging) {
      this.charge = Math.min(1, this.charge + dt / ChordDoor.HOLD_TIME);
      this.shakePhase += dt * 40;
      if (Math.random() < dt * 34) {
        particles.emit({
          texture: spark,
          x: this.centerX + (Math.random() - 0.5) * this.bounds.w,
          y: this.bounds.y + Math.random() * this.bounds.h,
          count: 1, speed: [20, 70], life: [0.2, 0.45], scale: [0.08, 0.15],
          tint: Math.random() < 0.5 ? this.colorA : this.colorB,
          additive: true, gravity: -30,
        });
      }
    } else {
      this.charge = Math.max(0, this.charge - dt * 1.4);
    }

    if (this.charge >= 1) { this.open(particles, spark); return true; }
    return false;
  }

  private open(particles: Particles, spark: Texture): void {
    this.opened = true;
    for (const { tx, ty } of this.tiles) this.map.setCell(tx, ty, Cell.Empty);
    for (let i = 0; i < 2; i++) {
      particles.emit({
        texture: spark, x: this.centerX, y: this.centerY,
        count: 34, speed: [60, 320], life: [0.35, 0.85], scale: [0.1, 0.26],
        tint: i === 0 ? this.colorA : this.colorB, additive: true, drag: 2.2, gravity: 140,
      });
    }
  }

  draw(time: number): void {
    const g = this.gfx;
    g.clear();
    if (this.openAnim >= 1) { this.container.visible = false; return; }

    const { x, y, w, h } = this.bounds;
    const open = easeOutCubic(this.openAnim);
    const shake = this.charge > 0 && !this.opened ? Math.sin(this.shakePhase) * this.charge * 1.4 : 0;
    const halfW = w / 2;

    // due battenti che scorrono via all'apertura
    const slide = open * (h * 0.62);
    const alpha = 1 - open;

    for (let i = 0; i < 2; i++) {
      const isA = i === 0;
      const glow = isA ? this.glow1 : this.glow2;
      const color = isA ? this.colorA : this.colorB;
      const px = x + (isA ? 0 : halfW) + shake * (isA ? -1 : 1);
      const py = y - (isA ? slide : -slide);

      g.roundRect(px + 0.5, py + 0.5, halfW - 1, h - 1, 2)
        .fill({ color: 0x1d2140, alpha: alpha * 0.96 })
        .stroke({ width: 1, color, alpha: alpha * (0.35 + glow * 0.65) });

      // barre luminose interne: si accendono quando quel giocatore tiene il tasto
      const bars = 4;
      for (let b = 0; b < bars; b++) {
        const bh = h / bars;
        const by = py + b * bh + bh * 0.28;
        const pulse = 0.25 + 0.75 * glow * (0.6 + 0.4 * Math.sin(time * 9 - b));
        g.rect(px + 3, by, halfW - 6, bh * 0.36)
          .fill({ color, alpha: alpha * pulse * 0.9 });
      }
    }

    // indicatore di carica al centro
    if (this.charge > 0.001 && !this.opened) {
      const cy = y + h / 2;
      const r = 7;
      g.circle(this.centerX, cy, r).fill({ color: 0x0b0d16, alpha: 0.8 });
      const sweep = clamp(this.charge, 0, 1) * Math.PI * 2;
      g.moveTo(this.centerX, cy)
        .arc(this.centerX, cy, r - 1.5, -Math.PI / 2, -Math.PI / 2 + sweep)
        .lineTo(this.centerX, cy)
        .fill({ color: 0xfff2c4, alpha: 0.95 });
    }
  }
}
