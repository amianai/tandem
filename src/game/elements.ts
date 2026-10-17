import { Container, Graphics } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { clamp, damp, easeOutCubic, rectsOverlap, type Rect } from '../core/math';
import { TILE } from '../render/assets';
import type { Particles } from '../render/particles';
import { Cell, type Tilemap } from './tilemap';
import type { Player } from './player';

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
 * PIASTRA PESANTE — si abbassa solo sotto un corpo abbastanza pesante.
 * È il modo più diretto di rendere leggibile la Bilancia: se la piastra
 * non scende, uno dei due deve cedere massa all'altro.
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

  constructor(tiles: readonly { tx: number; ty: number }[], private readonly color: number) {
    this.container.addChild(this.gfx);
    const b = boundsOf(tiles);
    this.bounds = { x: b.x, y: b.y + TILE - 6, w: b.w, h: 6 };
  }

  update(dt: number, players: readonly Player[]): boolean {
    const zone: Rect = { x: this.bounds.x, y: this.bounds.y - 10, w: this.bounds.w, h: 16 };
    let heavyOn = false;
    let anyOn = false;
    for (const p of players) {
      if (!rectsOverlap(p.hitbox, zone)) continue;
      anyOn = true;
      if (p.isHeavy) heavyOn = true;
    }
    this.active = heavyOn;
    this.needsMoreMass = anyOn && !heavyOn;
    this.press = damp(this.press, heavyOn ? 1 : 0, 16, dt);
    // Se qualcuno ci sta sopra ma è troppo leggero, la piastra "trema".
    this.hint = damp(this.hint, anyOn && !heavyOn ? 1 : 0, 10, dt);
    return this.active;
  }

  draw(time: number): void {
    const { x, y, w, h } = this.bounds;
    const dy = this.press * 4;
    const shiver = this.hint * Math.sin(time * 26) * 0.9;
    this.gfx.clear()
      .roundRect(x + 1, y + 10, w - 2, 4, 1)
      .fill({ color: 0x0c0f1e, alpha: 0.85 })
      .roundRect(x + 2 + shiver, y + dy, w - 4, h, 2)
      .fill({ color: this.active ? this.color : 0x39406b })
      .roundRect(x + 2 + shiver, y + dy, w - 4, 2, 1)
      .fill({ color: 0xffffff, alpha: this.active ? 0.35 : 0.12 });
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
    const { x, y, w, h } = this.bounds;
    const e = easeOutCubic(this.openness);
    const g = this.gfx;
    g.clear();

    // Guide fisse: si vede sempre dove passerà il cancello.
    g.rect(x + 1, y, 1, h).fill({ color: this.color, alpha: 0.2 });
    g.rect(x + w - 2, y, 1, h).fill({ color: this.color, alpha: 0.2 });

    const shown = h * (1 - e);
    if (shown < 1) return;
    g.roundRect(x + 1, y, w - 2, shown, 2)
      .fill({ color: 0x161a33 })
      .stroke({ width: 1, color: this.color, alpha: 0.55 });
    const bars = Math.max(1, Math.floor(shown / TILE));
    for (let i = 0; i < bars; i++) {
      const by = y + i * TILE + 5;
      if (by + 3 > y + shown) break;
      g.rect(x + 3, by, w - 6, 3)
        .fill({ color: this.color, alpha: 0.32 + 0.12 * Math.sin(time * 3 + i) });
    }
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
    const g = this.gfx;
    g.clear();
    for (const t of this.tiles) {
      if (t.broken) continue;
      const x = t.tx * TILE + Math.sin(time * 30 + t.tx) * t.shake * 1.2;
      const y = t.ty * TILE;
      g.rect(x, y, TILE, TILE).fill({ color: 0x6b5a45 });
      g.rect(x, y, TILE, 2).fill({ color: 0x8a7458 });
      // crepe
      g.moveTo(x + 4, y).lineTo(x + 7, y + 8).lineTo(x + 3, y + TILE)
        .stroke({ width: 1, color: 0x3a3025, alpha: 0.8 });
      g.moveTo(x + 12, y).lineTo(x + 10, y + 9).lineTo(x + 14, y + TILE)
        .stroke({ width: 1, color: 0x3a3025, alpha: 0.8 });
      g.rect(x, y, TILE, TILE).stroke({ width: 1, color: 0x2a2318, alpha: 0.5 });
    }
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
    const { x, y, w, h } = this.bounds;
    const g = this.gfx;
    g.clear();
    g.rect(x, y, w, h).fill({ color: this.color, alpha: 0.07 });
    for (let i = 0; i < 4; i++) {
      const phase = (time * 0.55 + i * 0.25) % 1;
      const ly = y + h - phase * h;
      g.moveTo(x + 3 + i * (w - 6) / 4, ly)
        .lineTo(x + 3 + i * (w - 6) / 4, ly + 9)
        .stroke({ width: 1, color: this.color, alpha: 0.28 * (1 - phase) });
    }
    if (particles && spark && Math.random() < dt * 26) {
      particles.emit({
        texture: spark, x: x + Math.random() * w, y: y + h - 4, count: 1,
        speed: [30, 70], angle: [-Math.PI / 2 - 0.25, -Math.PI / 2 + 0.25],
        life: [0.5, 1], scale: [0.05, 0.1], tint: this.color, additive: true, drag: 0.6,
      });
    }
  }
}
