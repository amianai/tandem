import { Container, Graphics } from 'pixi.js';
import { clamp, damp, rectsOverlap, type Rect } from '../core/math';
import { TILE } from '../render/assets';
import { sceneLights } from '../render/lighting';
import { PAL } from '../render/theme';
import { MassSystem } from './mass';
import { boundsOf } from './elements';
import { Cell, type Tilemap } from './tilemap';

type T = { tx: number; ty: number };

/* ------------------------------------------------------------------ *
 * SCORIA — metallo fuso. Uccide al contatto, ma solo quando i piedi ci
 * affondano di qualche pixel: sfiorare il bordo non conta.
 * ------------------------------------------------------------------ */
export class SlagPool {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  /** Zona mortale: dalla superficie (più 3 px di tolleranza) fino in fondo. */
  readonly killZone: Rect;
  private readonly surface: Rect;

  static readonly TOLERANCE = 3;

  constructor(tiles: readonly T[], levelHeight: number) {
    this.container.addChild(this.gfx);
    const b = boundsOf(tiles);
    // la superficie sta a metà del tile marcato
    const top = b.y + TILE / 2;
    this.surface = { x: b.x, y: top, w: b.w, h: levelHeight - top };
    this.killZone = { x: b.x + 2, y: top + SlagPool.TOLERANCE, w: b.w - 4, h: levelHeight - top };
  }

  kills(box: Rect): boolean { return rectsOverlap(box, this.killZone); }

  /** Vicino alla scoria (non vale come punto sicuro per lo spirito). */
  near(box: Rect, margin: number): boolean {
    const z = this.killZone;
    return rectsOverlap(box, { x: z.x - margin, y: z.y - margin * 2, w: z.w + margin * 2, h: z.h });
  }

  draw(time: number): void {
    const { x, y, w, h } = this.surface;
    const g = this.gfx;
    g.clear();
    g.rect(x, y, w, h).fill({ color: PAL.ember0 });
    g.rect(x, y + 3, w, h).fill({ color: 0x4a120a, alpha: 0.7 });
    // superficie ondulata e incandescente
    for (let px = 0; px < w; px += 3) {
      const wave = Math.sin(time * 2.2 + (x + px) * 0.21) * 0.9 + Math.sin(time * 3.7 + (x + px) * 0.09);
      const top = y + Math.round(wave * 0.6);
      g.rect(x + px, top, 3, 2).fill({ color: PAL.ember2 });
      g.rect(x + px, top - 1, 3, 1).fill({ color: PAL.ember3, alpha: 0.55 + 0.3 * Math.sin(time * 4 + px) });
    }
    // bolle che salgono e scoppiano
    for (let i = 0; i < Math.max(1, Math.floor(w / 30)); i++) {
      const seed = i * 37.3 + x * 0.1;
      const cycle = (time * 0.7 + seed) % 1;
      const bx = x + ((seed * 53) % w);
      const by = y + 2 - cycle * 4;
      g.circle(bx, by, 1 + cycle * 1.5).stroke({ width: 1, color: PAL.ember3, alpha: 1 - cycle });
    }
    for (let lx = x + 18; lx < x + w; lx += 36) {
      sceneLights.put(lx, y, 70, PAL.ember2, 0.8 + 0.15 * Math.sin(time * 3 + lx));
    }
  }
}

/* ------------------------------------------------------------------ *
 * SFIATO — getto di vapore a ciclo fisso, con preavviso. Non uccide:
 * spinge via, tanto più forte quanto più sei leggero. Il primo corpo
 * pesante sulla traiettoria fa da scudo a chi gli sta dietro.
 * ------------------------------------------------------------------ */
export type VentPhase = 'idle' | 'warn' | 'blow';

export class Vent {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  readonly band: Rect;
  phase: VentPhase = 'idle';
  private t: number;
  /** Fino a dove arriva il getto adesso (si accorcia contro lo scudo). */
  private reachEnd: number;

  static readonly IDLE = 1.5;
  static readonly WARN = 0.55;
  static readonly BLOW = 0.7;
  static readonly LENGTH = 8 * TILE;
  static readonly ACCEL = 1900;

  constructor(readonly ox: number, readonly oy: number, readonly dir: -1 | 1, offset: number) {
    this.container.addChild(this.gfx);
    const x0 = dir > 0 ? ox : ox - Vent.LENGTH;
    this.band = { x: x0, y: oy - TILE, w: Vent.LENGTH, h: TILE * 1.6 };
    this.t = offset % (Vent.IDLE + Vent.WARN + Vent.BLOW);
    this.reachEnd = Vent.LENGTH;
  }

  /**
   * Avanza il ciclo e spinge i corpi nel getto. `bodies` sono i giocatori
   * vivi; ritorna true nel passo in cui il getto parte.
   */
  update(dt: number, bodies: readonly { box: Rect; mass: number; push: (ax: number, dt: number) => void }[]): boolean {
    const total = Vent.IDLE + Vent.WARN + Vent.BLOW;
    const before = this.phase;
    this.t = (this.t + dt) % total;
    this.phase = this.t < Vent.IDLE ? 'idle' : this.t < Vent.IDLE + Vent.WARN ? 'warn' : 'blow';
    this.reachEnd = Vent.LENGTH;
    if (this.phase !== 'blow') return false;

    // chi sta nel getto, dal più vicino al bocchettone
    const inJet = bodies
      .filter((b) => rectsOverlap(b.box, this.band))
      .map((b) => ({ b, d: Math.abs((b.box.x + b.box.w / 2) - this.ox) }))
      .sort((a, b) => a.d - b.d);
    for (const { b, d } of inJet) {
      b.push(this.dir * Vent.ACCEL * (1 - b.mass), dt);
      if (b.mass >= MassSystem.HEAVY) { this.reachEnd = d; break; }
    }
    return before !== 'blow';
  }

  draw(time: number): void {
    const g = this.gfx;
    g.clear();
    const { ox, oy, dir } = this;
    // bocchettone nel muro
    g.rect(dir > 0 ? ox - 6 : ox, oy - 7, 6, 14).fill({ color: PAL.slate2 }).stroke({ width: 1, color: PAL.night0 });
    g.rect(dir > 0 ? ox - 1 : ox, oy - 5, 1, 10).fill({ color: PAL.ink });
    if (this.phase === 'warn') {
      // preavviso: sbuffi corti e una spia rossa
      const k = (this.t - Vent.IDLE) / Vent.WARN;
      for (let i = 0; i < 3; i++) {
        const px = ox + dir * (3 + ((time * 40 + i * 7) % 12));
        g.circle(px, oy - 2 + i * 2, 1.5).fill({ color: PAL.fog, alpha: 0.5 * (1 - k * 0.3) });
      }
      g.rect(dir > 0 ? ox - 5 : ox + 1, oy - 10, 4, 2).fill({ color: PAL.alarm, alpha: 0.6 + 0.4 * Math.sin(time * 30) });
    } else if (this.phase === 'blow') {
      const len = this.reachEnd;
      for (let i = 0; i < 9; i++) {
        const t = ((time * 2.6 + i * 0.113) % 1);
        const px = ox + dir * t * len;
        const py = oy - 8 + ((i * 5) % 16);
        g.moveTo(px, py).lineTo(px + dir * 10, py).stroke({ width: 1.5, color: PAL.air3, alpha: 0.55 * (1 - t) });
      }
      g.rect(dir > 0 ? ox : ox - len, oy - 9, len, 18).fill({ color: PAL.fog, alpha: 0.08 });
      sceneLights.put(ox + dir * 20, oy, 40, PAL.fog, 0.35);
    }
  }
}

/* ------------------------------------------------------------------ *
 * LAMIERA — passerella sottile. Sotto un corpo pesante scricchiola e
 * cede in 0,4 s; si ricompone dopo qualche secondo.
 * ------------------------------------------------------------------ */
export class Sheet {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  private readonly tiles: T[];
  readonly top: Rect;
  private state: 'ok' | 'creak' | 'broken' = 'ok';
  private timer = 0;
  private shake = 0;

  static readonly CREAK = 0.4;
  static readonly RESPAWN = 4;

  constructor(private readonly map: Tilemap, tiles: readonly T[]) {
    this.container.addChild(this.gfx);
    this.tiles = [...tiles];
    const b = boundsOf(this.tiles);
    this.top = { x: b.x, y: b.y, w: b.w, h: 4 };
    for (const t of this.tiles) map.setCell(t.tx, t.ty, Cell.Solid);
  }

  get solid(): boolean { return this.state !== 'broken'; }

  /** Vero se `box` ci poggia sopra. */
  supports(box: Rect): boolean {
    const feet = box.y + box.h;
    return this.solid && Math.abs(feet - this.top.y) <= 1.5
      && box.x < this.top.x + this.top.w && box.x + box.w > this.top.x;
  }

  /** Ritorna true nel passo in cui cede. */
  update(dt: number, standing: readonly { box: Rect; mass: number }[]): boolean {
    this.shake = damp(this.shake, this.state === 'creak' ? 1 : 0, 20, dt);
    if (this.state === 'ok') {
      if (standing.some((s) => s.mass >= MassSystem.HEAVY && this.supports(s.box))) {
        this.state = 'creak';
        this.timer = Sheet.CREAK;
      }
    } else if (this.state === 'creak') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'broken';
        this.timer = Sheet.RESPAWN;
        for (const t of this.tiles) this.map.setCell(t.tx, t.ty, Cell.Empty);
        return true;
      }
    } else {
      this.timer -= dt;
      const occupied = standing.some((s) => rectsOverlap(s.box, { ...this.top, h: TILE }));
      if (this.timer <= 0 && !occupied) {
        this.state = 'ok';
        for (const t of this.tiles) this.map.setCell(t.tx, t.ty, Cell.Solid);
      }
    }
    return false;
  }

  draw(time: number): void {
    const g = this.gfx;
    g.clear();
    const { x, y, w } = this.top;
    if (this.state === 'broken') {
      const k = clamp(1 - this.timer / Sheet.RESPAWN, 0, 1);
      if (k > 0.7) g.rect(x, y, w, 3).stroke({ width: 1, color: PAL.steel0, alpha: (k - 0.7) * 2 });
      return;
    }
    const sx = Math.sin(time * 70) * this.shake;
    const sag = this.shake * 1.5;
    g.rect(x + sx, y + sag, w, 4).fill({ color: PAL.steel0 }).stroke({ width: 1, color: PAL.night1 });
    g.rect(x + sx, y + sag, w, 1).fill({ color: PAL.fog, alpha: 0.6 });
    for (let px = x + 4; px < x + w; px += 9) g.rect(px + sx, y + 1 + sag, 1, 1).fill({ color: PAL.night0 });
    // tiranti
    g.moveTo(x + 2, y + 4).lineTo(x + 2, y + 10).stroke({ width: 1, color: PAL.slate3 });
    g.moveTo(x + w - 2, y + 4).lineTo(x + w - 2, y + 10).stroke({ width: 1, color: PAL.slate3 });
  }
}

/* ------------------------------------------------------------------ *
 * MURO DI LOPPA — scoria spugnosa: lo abbattono solo gli scoppi delle
 * braci. (Il solaio fragile resta dello Schianto.)
 * ------------------------------------------------------------------ */
export class SlagWall {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  private readonly tiles: (T & { broken: boolean })[];

  constructor(private readonly map: Tilemap, tiles: readonly T[]) {
    this.container.addChild(this.gfx);
    this.tiles = tiles.map((t) => ({ ...t, broken: false }));
    for (const t of this.tiles) map.setCell(t.tx, t.ty, Cell.Solid);
  }

  /** Abbatte i blocchi entro `radius`; ritorna i centri dei blocchi crollati. */
  blast(x: number, y: number, radius: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const t of this.tiles) {
      if (t.broken) continue;
      const cx = t.tx * TILE + TILE / 2, cy = t.ty * TILE + TILE / 2;
      // il blocco conta dal bordo, non dal centro: basta che lo scoppio lo tocchi
      if (Math.hypot(cx - x, cy - y) > radius + TILE * 0.5) continue;
      t.broken = true;
      this.map.setCell(t.tx, t.ty, Cell.Empty);
      out.push({ x: cx, y: cy });
    }
    return out;
  }

  draw(time: number): void {
    const g = this.gfx;
    g.clear();
    for (const t of this.tiles) {
      if (t.broken) continue;
      const x = t.tx * TILE, y = t.ty * TILE;
      g.rect(x, y, TILE, TILE).fill({ color: 0x4b4038 });
      // grumi
      for (let i = 0; i < 5; i++) {
        const gx = x + ((t.tx * 7 + i * 5) % 14) + 2, gy = y + ((t.ty * 5 + i * 7) % 14) + 2;
        g.rect(gx, gy, 3, 2).fill({ color: i % 2 ? 0x6a5a4c : 0x2f2822 });
      }
      // venature calde: si capisce che il fuoco la può spaccare
      const glow = 0.35 + 0.25 * Math.sin(time * 2 + t.tx + t.ty);
      g.moveTo(x + 3, y + 5).lineTo(x + 9, y + 9).lineTo(x + 7, y + 15)
        .stroke({ width: 1, color: PAL.ember1, alpha: glow });
      g.rect(x, y, TILE, TILE).stroke({ width: 1, color: 0x1f1a16, alpha: 0.8 });
    }
  }
}

/* ------------------------------------------------------------------ *
 * FORNELLO — interruttore a fuoco: uno scoppio vicino lo accende e
 * resta acceso. Un cancello si apre quando TUTTI i suoi fornelli ardono.
 * ------------------------------------------------------------------ */
export class Brazier {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  lit = false;
  private flare = 0;

  constructor(readonly x: number, readonly y: number) {
    this.container.addChild(this.gfx);
  }

  /** Ritorna true se si è appena acceso. */
  tryLight(x: number, y: number, radius: number): boolean {
    if (this.lit || Math.hypot(this.x - x, this.y - 6 - y) > radius + 6) return false;
    this.lit = true;
    this.flare = 1;
    return true;
  }

  draw(time: number, dt: number): void {
    this.flare = Math.max(0, this.flare - dt * 2);
    const g = this.gfx;
    g.clear();
    const x = Math.round(this.x), y = Math.round(this.y);
    g.rect(x - 2, y - 6, 4, 6).fill({ color: PAL.slate1 });
    g.poly([x - 7, y - 11, x + 7, y - 11, x + 4, y - 6, x - 4, y - 6]).fill({ color: PAL.slate3 })
      .stroke({ width: 1, color: PAL.night0 });
    if (this.lit) {
      const f = Math.sin(time * 14) * 1.2;
      g.poly([x - 4, y - 11, x + f, y - 20 - this.flare * 6, x + 4, y - 11]).fill({ color: PAL.ember2 });
      g.poly([x - 2, y - 11, x + f * 0.5, y - 16, x + 2, y - 11]).fill({ color: PAL.ember3 });
      sceneLights.put(x, y - 13, 60 + this.flare * 40, PAL.ember2, 1 + this.flare);
    } else {
      // spento: un tizzone fioco dice "accendimi"
      g.rect(x - 3, y - 12, 6, 1).fill({ color: PAL.ember0, alpha: 0.6 + 0.3 * Math.sin(time * 3) });
    }
  }
}

/* ------------------------------------------------------------------ *
 * FORGIA — il checkpoint. Si accende se ci passate vivi tutti e due; se
 * morite entrambi ripartite dall'ultima accesa.
 * ------------------------------------------------------------------ */
export class Forge {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  lit = false;
  private flare = 0;

  constructor(readonly x: number, readonly y: number) {
    this.container.addChild(this.gfx);
  }

  touches(box: Rect): boolean {
    return rectsOverlap(box, { x: this.x - 16, y: this.y - 30, w: 32, h: 30 });
  }

  light(): void { this.lit = true; this.flare = 1; }

  draw(time: number, dt: number): void {
    this.flare = Math.max(0, this.flare - dt * 1.5);
    const g = this.gfx;
    g.clear();
    const x = Math.round(this.x), y = Math.round(this.y);
    g.rect(x - 9, y - 10, 18, 10).fill({ color: PAL.slate1 }).stroke({ width: 1, color: PAL.night0 });
    g.rect(x - 11, y - 13, 22, 3).fill({ color: PAL.brass0 });
    g.rect(x - 6, y - 8, 12, 5).fill({ color: this.lit ? PAL.ember1 : PAL.night0 });
    if (this.lit) {
      for (let i = -1; i <= 1; i++) {
        const f = Math.sin(time * 11 + i * 2) * 1.5;
        g.poly([x + i * 5 - 3, y - 13, x + i * 5 + f, y - 25 - (i === 0 ? 5 : 0) - this.flare * 8, x + i * 5 + 3, y - 13])
          .fill({ color: i === 0 ? PAL.ember3 : PAL.ember2 });
      }
      sceneLights.put(x, y - 16, 90 + this.flare * 60, PAL.ember2, 1.2 + this.flare);
    } else {
      g.rect(x - 4, y - 14, 8, 1).fill({ color: PAL.ember0, alpha: 0.5 + 0.3 * Math.sin(time * 2) });
    }
  }
}
