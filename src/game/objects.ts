import { Container, Graphics } from 'pixi.js';
import { approach, clamp, damp, easeOutCubic, lerp, type Rect } from '../core/math';
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

  readonly view = new Container();
  protected readonly gfx = new Graphics();

  constructor() { this.view.addChild(this.gfx); }

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

  protected viewPosition(alpha: number): void {
    this.view.position.set(
      Math.round(lerp(this.prevX, this.x, alpha)),
      Math.round(lerp(this.prevY, this.y, alpha)),
    );
  }
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
  /** Chi è sotto questa soglia ci sbatte contro e basta. */
  readonly minPusherMass = 0.3;
  private physics: Physics | null = null;

  update(dt: number, physics: Physics): void {
    this.physics = physics;
    this.simulate(dt, physics);
  }

  push(dx: number, pusherMass: number): number {
    if (!this.physics || pusherMass < this.minPusherMass) return 0;
    return this.moveX(dx, this.physics);
  }

  /** Onda d'urto dello Schianto: la cassa viene sbalzata via. */
  shove(fromX: number, strength: number): void {
    const dir = Math.sign(this.x - fromX) || 1;
    this.vx = dir * 210 * strength;
    this.vy = -170 * strength;
    this.onGround = false;
  }

  draw(alpha: number): void {
    this.viewPosition(alpha);
    const g = this.gfx;
    g.clear()
      .rect(-8, -16, 16, 16).fill({ color: 0x8a5a33 })
      .rect(-8, -16, 16, 3).fill({ color: 0xa8713f })
      .rect(-8, -16, 16, 16).stroke({ width: 1, color: 0x3b2414 })
      .moveTo(-7, -15).lineTo(7, -1).stroke({ width: 1, color: 0x5b3a20 })
      .moveTo(7, -15).lineTo(-7, -1).stroke({ width: 1, color: 0x5b3a20 });
  }
}

/* ------------------------------------------------------------------ *
 * ZAVORRA — l'oggetto di GHISA.
 *
 * Un blocco di ghisa che GHISA porta sulla schiena. Posato a terra, GHISA
 * ci scarica dentro tutta la sua massa: il blocco pesa quanto pesava lui,
 * preme le piastre da solo e fa da gradino. In cambio GHISA resta leggero
 * e senza Schianto finché non torna a riprenderlo. A piedi: è troppo
 * pesante per essere richiamato a distanza.
 * ------------------------------------------------------------------ */
export class Ballast extends Body {
  readonly w = 16;
  readonly h = 14;
  readonly solidKind = 'full' as const;
  state: 'carried' | 'placed' = 'carried';
  mass = 0;
  facing = 1;
  private settle = 0;

  update(dt: number, physics: Physics): void {
    if (this.state !== 'placed') return;
    this.simulate(dt, physics);
    this.settle = Math.max(0, this.settle - dt * 3);
  }

  /** Chiamato quando viene posata: fa partire il piccolo "tonfo". */
  dropped(): void { this.settle = 1; }

  /** Posizione sulla schiena del portatore, per il disegno. */
  carryAt(x: number, y: number, facing: number): void {
    this.x = x - facing * 7;
    this.y = y - 5;
    this.prevX = this.x; this.prevY = this.y;
    this.facing = facing;
  }

  draw(alpha: number, time: number): void {
    const g = this.gfx;
    g.clear();
    if (this.state === 'carried') {
      this.view.position.set(Math.round(this.x), Math.round(this.y));
      g.roundRect(-4, -8, 8, 8, 1).fill({ color: 0x3c4458 }).stroke({ width: 1, color: 0x1a1e29 });
      return;
    }
    this.viewPosition(alpha);
    const sq = easeOutCubic(this.settle);
    const charge = clamp(this.mass / 0.9, 0, 1);
    const glow = charge * (0.55 + 0.45 * Math.sin(time * 3));
    g.roundRect(-8 - sq, -14 + sq * 2, 16 + sq * 2, 14 - sq * 2, 2)
      .fill({ color: 0x3c4458 })
      .stroke({ width: 1, color: 0x161a24 });
    g.rect(-6, -11 + sq * 2, 12, 2).fill({ color: 0x5eead4, alpha: 0.25 + glow * 0.7 });
    g.rect(-6, -6 + sq, 12 * charge, 2).fill({ color: 0x5eead4, alpha: 0.9 });
  }
}

/* ------------------------------------------------------------------ *
 * MANTICE — l'oggetto di SOFFIO.
 *
 * Un mantice pneumatico basso. Un corpo pesante che ci atterra sopra lo
 * comprime e lo carica (lo Schianto lo riempie quasi del tutto); chi ci
 * salta sopra quando è carico viene sparato in alto con tutta l'energia
 * accumulata. A parità di energia, più sei leggero più voli: chi pesa lo
 * carica, chi è leggero lo usa. È leggero: SOFFIO lo richiama da ovunque.
 * ------------------------------------------------------------------ */
export class Bellows extends Body {
  readonly w = 18;
  readonly h = 8;
  readonly solidKind = 'top' as const;
  state: 'carried' | 'placed' | 'recalling' = 'carried';
  /** 0..1 energia accumulata. */
  charge = 0;
  /** 0..1 compressione visiva. */
  squash = 0;
  /** 1 al lancio, poi decade: per il lampo. */
  launchPulse = 0;
  private recallT = 0;
  private recallFrom = { x: 0, y: 0 };

  /** Altezza (px) a cui spedisce un corpo di massa `mass` a carica piena. */
  static launchHeight(charge: number, mass: number): number {
    return charge * lerp(340, 110, clamp(mass, 0, 1));
  }

  update(dt: number, physics: Physics): void {
    this.squash = damp(this.squash, 0, 9, dt);
    this.launchPulse = Math.max(0, this.launchPulse - dt * 2.5);
    if (this.state === 'placed') this.simulate(dt, physics);
  }

  /** Un corpo ci è atterrato sopra: accumula energia. Ritorna la carica aggiunta. */
  absorb(mass: number, impactVy: number, slam: boolean): number {
    const k = slam ? 1.1 : 0.3;
    const add = mass * Math.pow(clamp(impactVy / 640, 0, 1), 2) * k;
    const before = this.charge;
    this.charge = clamp(this.charge + add, 0, 1);
    this.squash = clamp(0.4 + add * 1.5, 0, 1);
    return this.charge - before;
  }

  /** Rilascia la carica; ritorna l'altezza di lancio per quella massa. */
  release(mass: number): number {
    const h = Bellows.launchHeight(this.charge, mass);
    this.charge = 0;
    this.launchPulse = 1;
    this.squash = 1;
    return h;
  }

  startRecall(): void {
    this.state = 'recalling';
    this.recallT = 0;
    this.recallFrom = { x: this.x, y: this.y };
    this.charge = 0;
  }

  /** Fa volare il mantice verso (tx, ty). Ritorna true quando è arrivato. */
  updateRecall(dt: number, tx: number, ty: number): boolean {
    this.recallT = Math.min(1, this.recallT + dt / 0.35);
    const e = easeOutCubic(this.recallT);
    this.prevX = this.x; this.prevY = this.y;
    this.x = lerp(this.recallFrom.x, tx, e);
    // arco: sale un po' a metà tragitto
    this.y = lerp(this.recallFrom.y, ty, e) - Math.sin(e * Math.PI) * 28;
    return this.recallT >= 1;
  }

  carryAt(x: number, y: number, facing: number): void {
    this.x = x + facing * 6;
    this.y = y - 3;
    this.prevX = this.x; this.prevY = this.y;
  }

  draw(alpha: number, time: number): void {
    const g = this.gfx;
    g.clear();
    if (this.state === 'carried') {
      this.view.position.set(Math.round(this.x), Math.round(this.y));
      g.roundRect(-4, -4, 8, 4, 1).fill({ color: 0x6b4a5c }).stroke({ width: 1, color: 0x2a1a24 });
      return;
    }
    this.viewPosition(alpha);
    const h = 8 * (1 - this.squash * 0.5);
    const glow = this.charge * (0.6 + 0.4 * Math.sin(time * 8));
    // soffietto a pieghe
    g.rect(-9, -h, 18, h).fill({ color: 0x4a3542 });
    for (let i = 1; i < 4; i++) {
      g.moveTo(-9, -h * i / 4).lineTo(9, -h * i / 4).stroke({ width: 1, color: 0x2a1a24, alpha: 0.7 });
    }
    g.rect(-10, -h - 2, 20, 2).fill({ color: 0x8e6a7e });
    g.rect(-10, -h - 2, 20, 2).fill({ color: 0xff6fb5, alpha: glow });
    g.rect(-9, -h, 18, h).stroke({ width: 1, color: 0x1e121a });
    if (this.launchPulse > 0) {
      g.circle(0, -h, 6 + (1 - this.launchPulse) * 16)
        .stroke({ width: 2, color: 0xff6fb5, alpha: this.launchPulse * 0.8 });
    }
  }
}
