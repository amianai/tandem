import { Container, Graphics } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { clamp, damp, rectsOverlap, type Rect } from '../core/math';
import { drawFragile, drawGate, drawPlate, drawUpdraft } from '../render/art/elementsArt';
import { TILE } from '../render/assets';
import type { Particles } from '../render/particles';
import { Cell, type Tilemap } from './tilemap';
import { MassSystem } from './mass';
import type { Player } from './player';

/** Qualsiasi cosa che pesa e può stare su una piastra. */
export interface Weight { readonly box: Rect; readonly mass: number }

/** Raggruppa i tile di un marker in strisce orizzontali contigue. */
export function horizontalRuns(tiles: readonly { tx: number; ty: number }[]): { tx: number; ty: number }[][] {
  const sorted = [...tiles].sort((a, b) => a.ty - b.ty || a.tx - b.tx);
  const runs: { tx: number; ty: number }[][] = [];
  for (const t of sorted) {
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && prev.ty === t.ty && prev.tx === t.tx - 1) last.push(t);
    else runs.push([t]);
  }
  return runs;
}

/** Converte i marker del livello (centro-basso del tile) in coordinate tile. */
export const toTile = (p: { x: number; y: number }): { tx: number; ty: number } => ({
  tx: Math.floor(p.x / TILE),
  ty: Math.floor((p.y - 1) / TILE),
});

export function boundsOf(tiles: readonly { tx: number; ty: number }[]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of tiles) {
    minX = Math.min(minX, t.tx * TILE);
    minY = Math.min(minY, t.ty * TILE);
    maxX = Math.max(maxX, t.tx * TILE + TILE);
    maxY = Math.max(maxY, t.ty * TILE + TILE);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* ------------------------------------------------------------------ *
 * PIASTRA PESANTE — si abbassa quando il peso TOTALE che ci sta sopra
 * raggiunge la soglia: un giocatore pesante, la Zavorra carica, due casse,
 * oppure una cassa più un giocatore leggero. Scende un po' anche sotto
 * soglia, così si vede quanto manca.
 * ------------------------------------------------------------------ */
export class HeavyPlate {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  readonly bounds: Rect;
  active = false;
  /** 0 = alzata, 1 = premuta a fondo. */
  private press = 0;
  private hint = 0;
  /** Qualcuno ci sta sopra, ma non pesa abbastanza. */
  needsMoreMass = false;
  /** Peso sopra la piastra rispetto alla soglia (1 = basta). */
  load = 0;

  constructor(tiles: readonly { tx: number; ty: number }[], private readonly color: number) {
    this.container.addChild(this.gfx);
    const b = boundsOf(tiles);
    this.bounds = { x: b.x, y: b.y + TILE - 6, w: b.w, h: 6 };
  }

  update(dt: number, weights: readonly Weight[]): boolean {
    const zone: Rect = { x: this.bounds.x, y: this.bounds.y - 10, w: this.bounds.w, h: 16 };
    let total = 0;
    let anyOn = false;
    for (const w of weights) {
      if (!rectsOverlap(w.box, zone)) continue;
      anyOn = true;
      total += w.mass;
    }
    const heavyOn = total >= MassSystem.HEAVY - 1e-6;
    this.load = clamp(total / MassSystem.HEAVY, 0, 1);
    this.active = heavyOn;
    this.needsMoreMass = anyOn && !heavyOn;
    this.press = damp(this.press, heavyOn ? 1 : this.load * 0.45, 16, dt);
    // Se qualcuno ci sta sopra ma è troppo leggero, la piastra "trema".
    this.hint = damp(this.hint, anyOn && !heavyOn ? 1 : 0, 10, dt);
    return this.active;
  }

  draw(time: number): void {
    drawPlate(this.gfx, this, {
      bounds: this.bounds, press: this.press, hint: this.hint,
      active: this.active, load: this.load, color: this.color,
    }, time);
  }
}

/* ------------------------------------------------------------------ *
 * CANCELLO — tile solidi che si ritraggono quando il loro innesco è attivo.
 * ------------------------------------------------------------------ */
export class Gate {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  private readonly tiles: { tx: number; ty: number }[];
  private readonly bounds: Rect;
  private openness = 0;
  private solid = true;

  constructor(
    private readonly map: Tilemap,
    tiles: readonly { tx: number; ty: number }[],
    private readonly color: number,
    /** Se vero, una volta aperto non si richiude più. */
    private readonly latch = false,
  ) {
    this.container.addChild(this.gfx);
    this.tiles = [...tiles];
    this.bounds = boundsOf(this.tiles);
    for (const t of this.tiles) this.map.setCell(t.tx, t.ty, Cell.Solid);
  }

  private latched = false;

  update(dt: number, open: boolean): void {
    if (open && this.latch) this.latched = true;
    const target = this.latched || open;
    this.openness = damp(this.openness, target ? 1 : 0, 13, dt);
    const shouldBeSolid = this.openness < 0.5;
    if (shouldBeSolid !== this.solid) {
      this.solid = shouldBeSolid;
      for (const t of this.tiles) {
        this.map.setCell(t.tx, t.ty, shouldBeSolid ? Cell.Solid : Cell.Empty);
      }
    }
  }

  draw(time: number): void {
    drawGate(this.gfx, this, {
      bounds: this.bounds, openness: this.openness, latched: this.latched, color: this.color,
    }, time);
  }
}

/* ------------------------------------------------------------------ *
 * PAVIMENTO FRAGILE — cede solo all'onda d'urto dello Schianto.
 * ------------------------------------------------------------------ */
export class FragileFloor {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  private readonly tiles: { tx: number; ty: number; broken: boolean; shake: number }[];

  constructor(private readonly map: Tilemap, tiles: readonly { tx: number; ty: number }[]) {
    this.container.addChild(this.gfx);
    this.tiles = tiles.map((t) => ({ ...t, broken: false, shake: 0 }));
    for (const t of this.tiles) this.map.setCell(t.tx, t.ty, Cell.Solid);
  }

  /** Ritorna quanti tile ha rotto. */
  shatter(x: number, y: number, radius: number, particles: Particles, spark: Texture): number {
    let broken = 0;
    for (const t of this.tiles) {
      if (t.broken) continue;
      const cx = t.tx * TILE + TILE / 2;
      const cy = t.ty * TILE + TILE / 2;
      if (Math.hypot(cx - x, cy - y) > radius) continue;
      t.broken = true;
      broken++;
      this.map.setCell(t.tx, t.ty, Cell.Empty);
      particles.emit({
        texture: spark, x: cx, y: cy, count: 10,
        speed: [50, 200], life: [0.3, 0.7], scale: [0.09, 0.2],
        gravity: 520, drag: 2.2, tint: 0xb9a284,
      });
    }
    return broken;
  }

  update(dt: number, epicenters: readonly { x: number; y: number }[]): void {
    for (const t of this.tiles) {
      if (t.broken) { t.shake = 0; continue; }
      const cx = t.tx * TILE + TILE / 2;
      const cy = t.ty * TILE + TILE / 2;
      let near = 0;
      for (const e of epicenters) {
        near = Math.max(near, 1 - clamp(Math.hypot(cx - e.x, cy - e.y) / 90, 0, 1));
      }
      t.shake = damp(t.shake, near, 12, dt);
    }
  }

  draw(time: number): void {
    drawFragile(this.gfx, this, this.tiles, time);
  }
}

/* ------------------------------------------------------------------ *
 * CORRENTE ASCENSIONALE — solleva solo chi è leggero.
 * ------------------------------------------------------------------ */
export class Updraft {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  readonly bounds: Rect;

  constructor(tiles: readonly { tx: number; ty: number }[], private readonly color: number) {
    this.container.addChild(this.gfx);
    this.bounds = boundsOf(tiles);
  }

  apply(player: Player, dt: number): boolean {
    if (!rectsOverlap(player.hitbox, this.bounds)) return false;
    // La spinta è inversamente proporzionale alla massa: un corpo pesante
    // la attraversa senza accorgersene.
    const lift = (1 - player.mass) * 1750;
    player.vy = Math.max(player.vy - lift * dt, -240 * (1 - player.mass));
    return true;
  }

  draw(time: number, particles?: Particles, spark?: Texture, dt = 0): void {
    drawUpdraft(this.gfx, this.bounds, this.color, time, particles, spark, dt);
  }
}
