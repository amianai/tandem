import { Container } from 'pixi.js';
import { approach, lerp, type Rect } from '../core/math';
import { CassaView } from '../render/art/objects';
import type { Physics, Pushable, SolidBody, SolidKind } from './physics';

const GRAVITY = 1400;
const MAX_FALL = 600;

/**
 * Corpo rigido elementare: AABB con gravità, si muove a passi di un pixel
 * come i personaggi, così non attraversa mai niente. x,y = centro-basso.
 */
abstract class Body implements SolidBody {
  x = 0; y = 0;
  vx = 0; vy = 0;
  prevX = 0; prevY = 0;
  onGround = false;
  abstract readonly w: number;
  abstract readonly h: number;
  abstract readonly solidKind: SolidKind;

  /**
   * Resta in (0,0): le viste del kit grafico si posizionano da sole in
   * coordinate mondo, così tonfi e scintille nascono nel punto giusto.
   */
  readonly view = new Container();

  get box(): Rect { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  boxAt(x: number, y: number): Rect { return { x: x - this.w / 2, y: y - this.h, w: this.w, h: this.h }; }

  placeAt(x: number, y: number): void {
    this.x = x; this.y = y; this.prevX = x; this.prevY = y;
    this.vx = 0; this.vy = 0;
  }

  protected simulate(dt: number, physics: Physics): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    if (this.onGround) this.vx = approach(this.vx, 0, 900 * dt);
    this.moveX(this.vx * dt, physics);
    this.moveY(this.vy * dt, physics);
  }

  protected moveX(dx: number, physics: Physics): number {
    const step = Math.sign(dx);
    let remaining = Math.abs(dx);
    let moved = 0;
    while (remaining > 0) {
      const m = Math.min(remaining, 1);
      remaining -= m;
      if (physics.bodyBlocked(this.boxAt(this.x + step * m, this.y), this)) { this.vx = 0; break; }
      this.x += step * m;
      moved += step * m;
    }
    return moved;
  }

  protected moveY(dy: number, physics: Physics): void {
    this.onGround = false;
    const step = Math.sign(dy);
    let remaining = Math.abs(dy);
    while (remaining > 0) {
      const m = Math.min(remaining, 1);
      remaining -= m;
      const next = this.boxAt(this.x, this.y + step * m);
      if (physics.bodyBlocked(next, this)) {
        if (step > 0) this.onGround = true;
        this.vy = 0;
        return;
      }
      if (step > 0) {
        const top = physics.oneWayBelow(next, this.y, this);
        if (top !== null) { this.y = top; this.vy = 0; this.onGround = true; return; }
      }
      this.y += step * m;
    }
    // ferma ma appoggiata: controlla comunque il contatto col suolo
    if (dy === 0) this.onGround = physics.bodyBlocked(this.boxAt(this.x, this.y + 1), this);
  }

  /** Posizione interpolata per il disegno, fra lo stato fisico precedente e quello corrente. */
  protected drawX(alpha: number): number { return lerp(this.prevX, this.x, alpha); }
  protected drawY(alpha: number): number { return lerp(this.prevY, this.y, alpha); }
}

/* ------------------------------------------------------------------ *
 * CASSA — l'oggetto generico. Pesa, si spinge, conta sulle piastre.
 * ------------------------------------------------------------------ */
export class Crate extends Body implements Pushable {
  readonly w = 16;
  readonly h = 16;
  readonly solidKind = 'full' as const;
  /** Una cassa pesa un po' più di un terzo della massa totale. */
  static readonly MASS = 0.35;
  readonly mass = Crate.MASS;
  /** Peso minimo di chi spinge, per ogni cassa della fila. */
  readonly minPusherMass = 0.3;
  lastChain = 1;
  private physics: Physics | null = null;
  private readonly art = new CassaView();

  constructor() {
    super();
    this.view.addChild(this.art.container);
  }

  update(dt: number, physics: Physics): void {
    this.physics = physics;
    this.simulate(dt, physics);
  }

  /**
   * Le casse a contatto nel verso della spinta si muovono tutte insieme:
   * senza questo due casse accostate diventavano un muro inamovibile, perché
   * ognuna aspettava che l'altra si spostasse. Serve un peso proporzionale
   * alla fila (0,3 per cassa) e chi spinge insieme somma il proprio peso.
   */
  push(dx: number, pusherMass: number): number {
    const physics = this.physics;
    if (!physics || dx === 0) return 0;
    const dir = Math.sign(dx);

    const chain: Crate[] = [this];
    for (let cur: Crate = this; chain.length < 6;) {
      const next = physics.pushableAt(cur.boxAt(cur.x + dir, cur.y), cur);
      if (!(next instanceof Crate) || chain.includes(next)) break;
      chain.push(next);
      cur = next;
    }

    const mass = Math.max(pusherMass, physics.pushersMass(this, dir));
    if (mass < this.minPusherMass * chain.length) return 0;

    // Prima la cassa in testa: se lei è contro un muro non si muove nessuna.
    const moved = chain[chain.length - 1]!.moveX(dx, physics);
    if (moved === 0) return 0;
    for (let i = chain.length - 2; i >= 0; i--) chain[i]!.moveX(moved, physics);
    this.lastChain = chain.length;
    return moved;
  }

  /** Onda d'urto dello Schianto: la cassa viene sbalzata via. */
  shove(fromX: number, strength: number): void {
    const dir = Math.sign(this.x - fromX) || 1;
    this.vx = dir * 210 * strength;
    this.vy = -170 * strength;
    this.onGround = false;
  }

  draw(alpha: number, time: number): void {
    this.art.update({
      x: this.drawX(alpha), y: this.drawY(alpha), w: this.w, h: this.h, vx: this.vx, vy: this.vy,
    }, time);
  }
}
