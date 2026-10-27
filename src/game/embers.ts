import { Container, Graphics } from 'pixi.js';
import { clamp, lerp, type Rect } from '../core/math';
import { sceneLights } from '../render/lighting';
import { PAL } from '../render/theme';
import type { Crate } from './objects';
import type { Physics } from './physics';
import { MassSystem } from './mass';

/*
 * BRACI & TIRAGGIO — i gadget.
 *
 * Una regola: GHISA arma, SOFFIO accende, il leggero decolla.
 *
 * - GHISA lancia braci che si attaccano alla prima superficie che toccano
 *   (muri, soffitti, pavimento, casse). Ne ha 3 in riserva, una nuova ogni
 *   0,7 s, e al massimo 3 accese nel mondo.
 * - SOFFIO soffia un cono d'aria: le braci nel cono si accendono una dopo
 *   l'altra e scoppiano.
 * - Lo scoppio non fa male a nessuno ma SPINGE, tanto più forte quanto più
 *   si è leggeri: è l'idea buona del vecchio Mantice, resa istantanea.
 * - Uno scoppio accende le braci vicine: le micce.
 */

export type EmberSize = 'big' | 'mid' | 'small';

export interface Ember {
  x: number; y: number;
  vx: number; vy: number;
  stuck: boolean;
  /** Se attaccata a una cassa, la segue. */
  crate: Crate | null;
  ox: number; oy: number;
  size: EmberSize;
  radius: number;
  /** < 0 = armata; altrimenti secondi allo scoppio. */
  fuse: number;
  age: number;
  seed: number;
  /** Colpo di cannone della Fusione: vola dritto e scoppia all'impatto. */
  missile: boolean;
}

export interface Explosion { x: number; y: number; radius: number; size: EmberSize }

/** Il cono del Tiraggio, per sapere chi ne è investito. */
export class Cone {
  constructor(
    readonly ox: number, readonly oy: number,
    readonly dx: number, readonly dy: number,
    readonly length: number, readonly halfAngle: number,
  ) {}

  /** Distanza lungo l'asse se (x, y) sta nel cono, altrimenti -1. */
  along(x: number, y: number): number {
    const rx = x - this.ox, ry = y - this.oy;
    const a = rx * this.dx + ry * this.dy;
    if (a < -4 || a > this.length) return -1;
    const perp = Math.abs(rx * this.dy - ry * this.dx);
    // base larga 7 px: a bruciapelo il cono non è una punta di spillo
    return perp <= Math.max(a, 0) * Math.tan(this.halfAngle) + 7 ? Math.max(a, 0) : -1;
  }
}

/** Parametri della brace in base alla massa di chi la lancia. */
function emberSpec(mass: number): { size: EmberSize; range: number; radius: number } {
  if (mass >= MassSystem.HEAVY) return { size: 'big', range: 4 * 18, radius: 3 * 18 };
  if (mass <= MassSystem.LIGHT) return { size: 'small', range: 8 * 18, radius: 2 * 18 };
  return { size: 'mid', range: 6 * 18, radius: 2.5 * 18 };
}

const GRAVITY = 900;
const SIZE = 4;

export class EmberSystem {
  static readonly RESERVE = 3;
  static readonly REGEN = 0.7;
  static readonly BLOW_COOLDOWN = 0.45;
  /** Ritardo fra una brace e la successiva nel cono e nelle micce. */
  static readonly CONE_STAGGER = 0.06;
  static readonly CHAIN_DELAY = 0.1;

  readonly container = new Container();
  private readonly gfx = new Graphics();
  readonly embers: Ember[] = [];

  reserve = EmberSystem.RESERVE;
  private regen = 0;
  blowCooldown = 0;
  /** Coni disegnati per qualche istante dopo il soffio. */
  private readonly gusts: { cone: Cone; age: number }[] = [];
  /** Spruzzi di una brace che si spegne (sostituita o caduta). */
  private readonly fizzles: { x: number; y: number; age: number }[] = [];

  constructor() {
    this.container.label = 'embers';
    this.container.addChild(this.gfx);
  }

  get armed(): number { return this.embers.length; }

  /* --- GHISA ---------------------------------------------------------- */

  /**
   * Lancia una brace da (x, y) verso `facing`. `aim`: in avanti ad arco,
   * in alto ripido, giù = ai piedi se a terra, in picchiata se in aria.
   * Ritorna false se la riserva è vuota.
   */
  throw(x: number, y: number, facing: number, mass: number, aim: 'forward' | 'up' | 'down',
        onGround: boolean, carryVx: number): boolean {
    if (this.reserve <= 0) return false;
    this.reserve--;
    if (this.embers.length >= EmberSystem.RESERVE) {
      const old = this.embers.shift()!;
      this.fizzles.push({ x: old.x, y: old.y, age: 0 });
    }
    const spec = emberSpec(mass);
    const e: Ember = {
      x: x + facing * 5, y: y - 12, vx: 0, vy: 0, stuck: false, crate: null, ox: 0, oy: 0,
      size: spec.size, radius: spec.radius, fuse: -1, age: 0, seed: Math.random() * 10, missile: false,
    };
    if (aim === 'down' && onGround) {
      // ai piedi: resta sul pavimento, un passo avanti
      e.x = x + facing * 4;
      e.y = y - 2;
      e.stuck = true;
    } else if (aim === 'down') {
      e.vx = carryVx * 0.3;
      e.vy = 320;
    } else {
      const angle = aim === 'up' ? 1.25 : 0.68;
      const speed = Math.sqrt(spec.range * GRAVITY);
      e.vx = Math.cos(angle) * speed * facing + carryVx * 0.4;
      e.vy = -Math.sin(angle) * speed;
    }
    this.embers.push(e);
    return true;
  }

  /**
   * Cannone della Fusione: GHISA spara, SOFFIO ha mirato. La brace parte
   * dritta e veloce, cala appena, e scoppia contro la prima cosa che tocca.
   */
  fire(x: number, y: number, dx: number, dy: number): boolean {
    if (this.reserve <= 0) return false;
    this.reserve--;
    if (this.embers.length >= EmberSystem.RESERVE) {
      const old = this.embers.shift()!;
      this.fizzles.push({ x: old.x, y: old.y, age: 0 });
    }
    const speed = 460;
    this.embers.push({
      x: x + dx * 10, y: y + dy * 10, vx: dx * speed, vy: dy * speed, stuck: false, crate: null,
      ox: 0, oy: 0, size: 'big', radius: 3 * 18, fuse: -1, age: 0, seed: Math.random() * 10, missile: true,
    });
    return true;
  }

  /** Fa scoppiare subito i colpi di cannone entro `r` da (x, y). */
  detonateMissilesNear(x: number, y: number, r: number): void {
    for (const e of this.embers) {
      if (e.missile && e.fuse < 0 && Math.hypot(e.x - x, e.y - y) <= r) e.fuse = 0.001;
    }
  }

  /* --- SOFFIO --------------------------------------------------------- */

  /**
   * Soffia un cono d'aria. Le braci nel cono si accendono in ordine di
   * distanza. Ritorna il cono (per spingere persone e casse) o null se il
   * soffio è ancora in ricarica.
   */
  blow(x: number, y: number, facing: number, mass: number, aim: 'forward' | 'up' | 'down'): Cone | null {
    if (this.blowCooldown > 0) return null;
    this.blowCooldown = EmberSystem.BLOW_COOLDOWN;
    // leggero = getto lungo e stretto; pesante = corto e largo
    const k = clamp((mass - 0.1) / 0.8, 0, 1);
    const length = lerp(7 * 18, 4 * 18, k);
    const half = lerp(0.24, 0.5, k);
    const down = aim === 'down';
    const cone = new Cone(x, y - 9, down ? 0 : facing, down ? 1 : 0, length, half);

    const hit = this.embers
      .map((e) => ({ e, d: cone.along(e.x, e.y) }))
      .filter((h) => h.d >= 0 && h.e.fuse < 0)
      .sort((a, b) => a.d - b.d);
    hit.forEach((h, i) => { h.e.fuse = 0.02 + i * EmberSystem.CONE_STAGGER; });

    this.gusts.push({ cone, age: 0 });
    return cone;
  }

  /** Accende le braci entro `radius` da (x, y): micce, Schianto, Scatto. */
  igniteNear(x: number, y: number, radius: number, delay: number): number {
    let n = 0;
    for (const e of this.embers) {
      if (e.fuse >= 0) continue;
      if (Math.hypot(e.x - x, e.y - y) <= radius) { e.fuse = delay; n++; }
    }
    return n;
  }

  /** Prima brace (armata) che tocca il rettangolo, per lo Scatto. */
  emberIn(box: Rect): Ember | null {
    for (const e of this.embers) {
      if (e.fuse >= 0) continue;
      if (e.x > box.x - 3 && e.x < box.x + box.w + 3 && e.y > box.y - 3 && e.y < box.y + box.h + 3) return e;
    }
    return null;
  }

  /** Brace in volo entro `r` da (x, y), che viene consumata (rinascita di SOFFIO). */
  takeFlyingNear(x: number, y: number, r: number): Ember | null {
    const i = this.embers.findIndex((e) => !e.stuck && Math.hypot(e.x - x, e.y - y) <= r);
    if (i < 0) return null;
    return this.embers.splice(i, 1)[0]!;
  }

  refill(): void { this.reserve = EmberSystem.RESERVE; this.regen = 0; }

  clear(): void { this.embers.length = 0; this.gusts.length = 0; }

  /* --- simulazione ---------------------------------------------------- */

  update(dt: number, physics: Physics, crates: readonly Crate[]): Explosion[] {
    this.blowCooldown = Math.max(0, this.blowCooldown - dt);
    if (this.reserve < EmberSystem.RESERVE) {
      this.regen += dt;
      if (this.regen >= EmberSystem.REGEN) { this.regen -= EmberSystem.REGEN; this.reserve++; }
    } else {
      this.regen = 0;
    }

    const out: Explosion[] = [];
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i]!;
      e.age += dt;
      if (e.crate) {
        e.x = e.crate.x + e.ox;
        e.y = e.crate.y + e.oy;
      } else if (!e.stuck) {
        this.fly(e, dt, physics, crates);
        if (e.y > physics.map.pixelHeight + 40) {
          this.embers.splice(i, 1);
          continue;
        }
      }
      if (e.fuse >= 0) {
        e.fuse -= dt;
        if (e.fuse <= 0) {
          this.embers.splice(i, 1);
          out.push({ x: e.x, y: e.y, radius: e.radius, size: e.size });
        }
      }
    }

    for (const g of this.gusts) g.age += dt;
    while (this.gusts.length && this.gusts[0]!.age > 0.3) this.gusts.shift();
    for (const f of this.fizzles) f.age += dt;
    while (this.fizzles.length && this.fizzles[0]!.age > 0.4) this.fizzles.shift();
    return out;
  }

  /** Volo a passi brevi: la brace si ferma sulla prima superficie che tocca. */
  private fly(e: Ember, dt: number, physics: Physics, crates: readonly Crate[]): void {
    e.vy = Math.min(e.vy + (e.missile ? 220 : GRAVITY) * dt, 700);
    const steps = Math.max(1, Math.ceil(Math.hypot(e.vx, e.vy) * dt / 2));
    for (let s = 0; s < steps; s++) {
      const nx = e.x + (e.vx * dt) / steps;
      const ny = e.y + (e.vy * dt) / steps;
      const box: Rect = { x: nx - SIZE / 2, y: ny - SIZE / 2, w: SIZE, h: SIZE };
      const crate = crates.find((c) => {
        const b = c.box;
        return box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y;
      });
      if (crate) {
        e.stuck = true; e.crate = crate; e.ox = e.x - crate.x; e.oy = e.y - crate.y;
        if (e.missile) e.fuse = 0.001;
        return;
      }
      if (physics.map.overlapsSolid(box)) {
        e.stuck = true;
        if (e.missile) e.fuse = 0.001;
        return;
      }
      e.x = nx; e.y = ny;
    }
  }

  /* --- disegno -------------------------------------------------------- */

  draw(time: number): void {
    const g = this.gfx;
    g.clear();

    for (const { cone, age } of this.gusts) {
      const k = age / 0.3;
      const a = (1 - k) * 0.35;
      const reach = cone.length * Math.min(1, 0.3 + k * 1.4);
      const spread = Math.tan(cone.halfAngle) * reach + 7;
      const px = -cone.dy, py = cone.dx;
      const tipX = cone.ox + cone.dx * reach, tipY = cone.oy + cone.dy * reach;
      g.poly([
        cone.ox + px * 4, cone.oy + py * 4,
        tipX + px * spread, tipY + py * spread,
        tipX - px * spread, tipY - py * spread,
        cone.ox - px * 4, cone.oy - py * 4,
      ]).fill({ color: PAL.air3, alpha: a * 0.35 });
      for (let i = 0; i < 5; i++) {
        const t = ((i * 0.23 + age * 3.2) % 1);
        const off = (i - 2) / 2.5 * spread * t;
        const sx = cone.ox + cone.dx * reach * t + px * off;
        const sy = cone.oy + cone.dy * reach * t + py * off;
        g.moveTo(sx, sy).lineTo(sx + cone.dx * 6, sy + cone.dy * 6)
          .stroke({ width: 1, color: PAL.air3, alpha: a * 1.6 });
      }
    }

    for (const e of this.embers) {
      const lit = e.fuse >= 0;
      const r = e.size === 'big' ? 3 : e.size === 'mid' ? 2.5 : 2;
      const flick = 0.75 + 0.25 * Math.sin(time * 17 + e.seed * 7);
      const x = Math.round(e.x), y = Math.round(e.y);
      if (lit) {
        // in procinto di scoppiare: bianco, pulsa veloce
        const p = 0.5 + 0.5 * Math.sin(time * 60);
        g.circle(x, y, r + 1.5 + p).fill({ color: PAL.bone, alpha: 0.9 });
        g.circle(x, y, r).fill({ color: 0xffffff });
        sceneLights.put(x, y, 40, PAL.ember3, 1.1);
      } else {
        g.circle(x, y, r + 1).fill({ color: PAL.ember0 });
        g.circle(x, y, r).fill({ color: PAL.ember1 });
        g.circle(x - 0.5, y - 0.5, r * 0.55).fill({ color: PAL.ember3, alpha: flick });
        // filo di fumo
        const sx = x + Math.sin(time * 3 + e.seed) * 2;
        g.circle(sx, y - 5 - ((time * 8 + e.seed * 3) % 5), 0.8).fill({ color: PAL.steel0, alpha: 0.5 });
        sceneLights.put(x, y, 26 + (e.size === 'big' ? 8 : 0), PAL.ember2, 0.55 * flick);
      }
    }

    for (const f of this.fizzles) {
      const k = f.age / 0.4;
      g.circle(f.x, f.y - k * 8, 2 + k * 4).fill({ color: PAL.steel1, alpha: (1 - k) * 0.5 });
    }
  }

  /** Tizzoni sulla schiena di GHISA: quanti ne restano in riserva. */
  drawReserve(g: Graphics, x: number, y: number, facing: number, time: number): void {
    for (let i = 0; i < EmberSystem.RESERVE; i++) {
      const on = i < this.reserve;
      const bx = Math.round(x - facing * (5 + i * 0.5)), by = Math.round(y - 17 + i * 3);
      g.rect(bx - 1, by - 1, 3, 3).fill({ color: on ? PAL.ember2 : PAL.rust0 });
      if (on) {
        g.rect(bx, by, 1, 1).fill({ color: PAL.ember3, alpha: 0.7 + 0.3 * Math.sin(time * 9 + i) });
      }
    }
  }
}
