import { Container, Sprite } from 'pixi.js';
import { pickTile, TILE, TILES, type Sheets } from '../render/assets';
import type { Rect } from '../core/math';

export const enum Cell {
  Empty = 0,
  Solid = 1,
  /** Piattaforma attraversabile dal basso, solida solo scendendo. */
  OneWay = 2,
}

export interface SpawnPoint { x: number; y: number }

export interface LevelSource {
  readonly name: string;
  /** Righe ASCII; vengono paddate automaticamente alla riga più lunga. */
  readonly rows: readonly string[];
  readonly legend?: Readonly<Record<string, Cell>>;
  /** Piastra (minuscola) -> cancello (maiuscola) che apre. */
  readonly links?: Readonly<Record<string, string>>;
  /** Cancelli che, una volta aperti, restano aperti. */
  readonly latching?: string;
  /** Suggerimento mostrato quando un giocatore è vicino al marker. */
  readonly hints?: Readonly<Record<string, string>>;
}

const DEFAULT_LEGEND: Record<string, Cell> = {
  '#': Cell.Solid,
  '=': Cell.OneWay,
};

export class Tilemap {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  readonly spawns: SpawnPoint[] = [];
  readonly markers = new Map<string, SpawnPoint[]>();

  constructor(source: LevelSource) {
    const legend = { ...DEFAULT_LEGEND, ...(source.legend ?? {}) };
    this.width = source.rows.reduce((m, r) => Math.max(m, r.length), 0);
    this.height = source.rows.length;
    this.cells = new Uint8Array(this.width * this.height);

    for (let y = 0; y < this.height; y++) {
      const row = source.rows[y] ?? '';
      for (let x = 0; x < this.width; x++) {
        const ch = row[x] ?? '.';
        const cell = legend[ch];
        if (cell !== undefined) this.cells[y * this.width + x] = cell;
        if (ch === '.' || ch === ' ' || ch === '#' || ch === '=') continue;
        // Qualsiasi altro carattere è un marker posizionale (spawn, porte, ...).
        const pos: SpawnPoint = { x: x * TILE + TILE / 2, y: y * TILE + TILE };
        if (ch === '1' || ch === '2') this.spawns[Number(ch) - 1] = pos;
        const list = this.markers.get(ch);
        if (list) list.push(pos); else this.markers.set(ch, [pos]);
      }
    }
  }

  get pixelWidth(): number { return this.width * TILE; }
  get pixelHeight(): number { return this.height * TILE; }

  at(tx: number, ty: number): Cell {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return Cell.Empty;
    return this.cells[ty * this.width + tx] as Cell;
  }

  setCell(tx: number, ty: number, cell: Cell): void {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return;
    this.cells[ty * this.width + tx] = cell;
  }

  isSolid(tx: number, ty: number): boolean { return this.at(tx, ty) === Cell.Solid; }
  isOneWay(tx: number, ty: number): boolean { return this.at(tx, ty) === Cell.OneWay; }

  /** Un AABB in pixel interseca almeno un tile pieno? */
  overlapsSolid(r: Rect): boolean {
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 0.001) / TILE);
    const y0 = Math.floor(r.y / TILE);
    const y1 = Math.floor((r.y + r.h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }

  /**
   * Prima riga di piattaforma one-way attraversata scendendo.
   * Ritorna la y (pixel) del bordo superiore, o null.
   */
  oneWayBelow(r: Rect, prevBottom: number): number | null {
    const bottom = r.y + r.h;
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 0.001) / TILE);
    const ty0 = Math.floor(prevBottom / TILE);
    const ty1 = Math.floor((bottom - 0.001) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      const top = ty * TILE;
      // Deve essere attraversata dall'alto in questo passo, non già dentro.
      if (prevBottom <= top + 0.001 && bottom >= top) {
        for (let tx = x0; tx <= x1; tx++) {
          if (this.isOneWay(tx, ty)) return top;
        }
      }
    }
    return null;
  }
}

/**
 * Costruisce il layer grafico dei tile. Sceglie l'aspetto in base ai vicini
 * (autotiling semplice: bordo erboso in cima, terra sotto).
 */
export function buildTileLayer(map: Tilemap, sheets: Sheets, skip?: ReadonlySet<string>): Container {
  const layer = new Container();
  layer.label = 'tiles';

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const cell = map.at(x, y);
      if (cell === Cell.Empty) continue;
      if (skip?.has(`${x},${y}`)) continue;

      let index: number;
      if (cell === Cell.OneWay) {
        index = pickTile(TILES.beam, !map.isOneWay(x - 1, y), !map.isOneWay(x + 1, y));
      } else {
        const set = map.isSolid(x, y - 1) ? TILES.dirt : TILES.grass;
        index = pickTile(set, !map.isSolid(x - 1, y), !map.isSolid(x + 1, y));
      }

      const texture = sheets.terrain[index];
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.position.set(x * TILE, y * TILE);
      layer.addChild(sprite);
    }
  }
  return layer;
}
