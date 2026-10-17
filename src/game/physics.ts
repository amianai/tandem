import { rectsOverlap, type Rect } from '../core/math';
import type { Tilemap } from './tilemap';

/**
 * 'full' = solido da ogni lato (casse, Zavorra).
 * 'top'  = solido solo dall'alto, come le piattaforme '=' (Mantice).
 */
export type SolidKind = 'full' | 'top';

export interface SolidBody {
  readonly box: Rect;
  readonly solidKind: SolidKind;
}

export interface Pushable extends SolidBody {
  /** Massa minima di chi spinge: sotto questa soglia il corpo non si muove. */
  readonly minPusherMass: number;
  /** Prova a spostarsi di `dx`; ritorna lo spostamento effettivo. */
  push(dx: number, pusherMass: number): number;
}

/** Quello che serve a un personaggio per muoversi nel mondo. */
export interface Collider {
  overlapsSolid(box: Rect, ignore?: unknown): boolean;
  oneWayBelow(box: Rect, prevBottom: number, ignore?: unknown): number | null;
  pushableAt(box: Rect): Pushable | null;
}

const isPushable = (b: SolidBody): b is Pushable => 'push' in b;

/**
 * Collisioni fra tilemap e corpi dinamici. I giocatori non si scontrano fra
 * loro, ma bloccano i corpi: una cassa spinta contro l'altro giocatore si
 * ferma invece di incastrarlo dentro di sé.
 */
export class Physics implements Collider {
  readonly bodies: SolidBody[] = [];
  /** Hitbox dei giocatori, aggiornate a ogni passo: ostacoli per i corpi. */
  actors: Rect[] = [];

  constructor(readonly map: Tilemap) {}

  add(body: SolidBody): void {
    if (!this.bodies.includes(body)) this.bodies.push(body);
  }

  remove(body: SolidBody): void {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  overlapsSolid(box: Rect, ignore?: unknown): boolean {
    if (this.map.overlapsSolid(box)) return true;
    for (const b of this.bodies) {
      if (b === ignore || b.solidKind !== 'full') continue;
      if (rectsOverlap(b.box, box)) return true;
    }
    return false;
  }

  /** Per i corpi: oltre a muri e altri corpi, li fermano anche i giocatori. */
  bodyBlocked(box: Rect, self: unknown): boolean {
    if (this.overlapsSolid(box, self)) return true;
    return this.actors.some((a) => rectsOverlap(a, box));
  }

  /** Spazio libero da tutto, superfici 'top' comprese: serve per posare oggetti. */
  isFree(box: Rect): boolean {
    if (this.bodyBlocked(box, undefined)) return false;
    return !this.bodies.some((b) => rectsOverlap(b.box, box));
  }

  oneWayBelow(box: Rect, prevBottom: number, ignore?: unknown): number | null {
    let best = this.map.oneWayBelow(box, prevBottom);
    const bottom = box.y + box.h;
    for (const b of this.bodies) {
      if (b === ignore || b.solidKind !== 'top') continue;
      const top = b.box.y;
      const crossing = prevBottom <= top + 0.001 && bottom >= top;
      const overlapX = box.x < b.box.x + b.box.w && box.x + box.w > b.box.x;
      if (crossing && overlapX && (best === null || top < best)) best = top;
    }
    return best;
  }

  pushableAt(box: Rect): Pushable | null {
    for (const b of this.bodies) {
      if (isPushable(b) && b.solidKind === 'full' && rectsOverlap(b.box, box)) return b;
    }
    return null;
  }

  /** Vero se i piedi di `box` poggiano esattamente sul corpo `body`. */
  standsOn(box: Rect, body: SolidBody): boolean {
    const feet = box.y + box.h;
    const overlapX = box.x < body.box.x + body.box.w && box.x + box.w > body.box.x;
    return overlapX && Math.abs(feet - body.box.y) <= 1.5;
  }
}
