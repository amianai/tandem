import { Container, Graphics } from 'pixi.js';
import { lerp, type Rect } from '../core/math';
import { sceneLights } from '../render/lighting';
import { PAL } from '../render/theme';
import type { Tilemap } from './tilemap';

/**
 * SCORIATORE — un grumo di scoria che striscia avanti e indietro e brucia
 * chi lo tocca. Non si può colpire: si gira ai muri e ai bordi, quindi non
 * cade da solo. Ma pesa poco (0,3), e il soffio o uno scoppio lo spingono
 * via: se finisce nella scoria o nel vuoto, si scioglie.
 */
export class Crawler {
  static readonly W = 14;
  static readonly H = 10;
  static readonly SPEED = 30;
  static readonly MASS = 0.3;

  readonly view = new Container();
  private readonly gfx = new Graphics();
  x: number; y: number;
  prevX: number; prevY: number;
  vy = 0;
  extVx = 0;
  dir: -1 | 1;
  alive = true;
  stun = 0;
  private phase = Math.random() * 6;
  private onGround = false;

  constructor(x: number, y: number) {
    this.x = x; this.y = y; this.prevX = x; this.prevY = y;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.view.addChild(this.gfx);
  }

  get box(): Rect { return { x: this.x - Crawler.W / 2, y: this.y - Crawler.H, w: Crawler.W, h: Crawler.H }; }
  private boxAt(x: number, y: number): Rect { return { x: x - Crawler.W / 2, y: y - Crawler.H, w: Crawler.W, h: Crawler.H }; }

  blast(vx: number, vy: number): void {
    this.extVx = vx;
    this.vy = Math.min(this.vy, vy);
    this.onGround = false;
  }

  update(dt: number, map: Tilemap): void {
    if (!this.alive) return;
    this.prevX = this.x; this.prevY = this.y;
    this.phase += dt;
    this.stun = Math.max(0, this.stun - dt);

    // cammina; si gira ai muri e (solo se non è stato sbalzato) ai bordi
    const walking = this.stun <= 0 && Math.abs(this.extVx) < 20 && this.onGround;
    if (walking) {
      const ahead = this.x + this.dir * (Crawler.W / 2 + 1);
      const wall = map.overlapsSolid(this.boxAt(this.x + this.dir * 2, this.y - 1));
      const floor = map.isSolid(Math.floor(ahead / 18), Math.floor((this.y + 2) / 18))
        || map.isOneWay(Math.floor(ahead / 18), Math.floor((this.y + 2) / 18));
      if (wall || !floor) this.dir = this.dir === 1 ? -1 : 1;
    }
    const vx = (walking ? this.dir * Crawler.SPEED : 0) + this.extVx;
    this.extVx *= Math.exp(-(this.onGround ? 6 : 1.2) * dt);
    if (Math.abs(this.extVx) < 2) this.extVx = 0;

    // orizzontale a passi di un pixel
    let dx = vx * dt;
    while (Math.abs(dx) > 0) {
      const m = Math.sign(dx) * Math.min(1, Math.abs(dx));
      dx -= m;
      if (map.overlapsSolid(this.boxAt(this.x + m, this.y))) { this.extVx = 0; break; }
      this.x += m;
    }
    // verticale
    this.vy = Math.min(this.vy + 1300 * dt, 600);
    let dy = this.vy * dt;
    this.onGround = false;
    while (Math.abs(dy) > 0) {
      const m = Math.sign(dy) * Math.min(1, Math.abs(dy));
      dy -= m;
      if (map.overlapsSolid(this.boxAt(this.x, this.y + m))) {
        if (m > 0) this.onGround = true;
        this.vy = 0;
        break;
      }
      this.y += m;
    }
    if (!this.onGround && this.vy === 0) this.onGround = map.overlapsSolid(this.boxAt(this.x, this.y + 1));
  }

  draw(alpha: number, time: number): void {
    const g = this.gfx;
    g.clear();
    if (!this.alive) return;
    const x = Math.round(lerp(this.prevX, this.x, alpha));
    const y = Math.round(lerp(this.prevY, this.y, alpha));
    const squish = Math.sin(this.phase * 9) * (this.stun > 0 ? 0 : 1);
    const w = 14 + squish, h = 9 - squish * 0.6;
    g.ellipse(x, y - h / 2, w / 2, h / 2).fill({ color: PAL.rust1 });
    g.ellipse(x, y - h / 2 - 1, w / 2 - 2, h / 2 - 2).fill({ color: PAL.ember1 });
    // crosta che pulsa di calore
    const heat = 0.5 + 0.5 * Math.sin(time * 5 + this.x);
    g.rect(x - 4, y - h + 1, 2, 1).fill({ color: PAL.ember3, alpha: heat });
    g.rect(x + 2, y - h + 2, 2, 1).fill({ color: PAL.ember3, alpha: 1 - heat });
    // occhi, verso la direzione di marcia (storditi: due trattini)
    const ex = x + this.dir * 3;
    if (this.stun > 0) {
      g.rect(ex - 3, y - 6, 2, 1).fill({ color: PAL.ink });
      g.rect(ex + 1, y - 6, 2, 1).fill({ color: PAL.ink });
    } else {
      g.rect(ex - 3, y - 7, 2, 2).fill({ color: PAL.bone });
      g.rect(ex + 1, y - 7, 2, 2).fill({ color: PAL.bone });
    }
    sceneLights.put(x, y - 5, 34, PAL.ember2, 0.65);
  }
}
