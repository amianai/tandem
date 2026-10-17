import { clamp } from '../core/math';
import type { ChordDetector, PlayerInput } from '../core/input';

/**
 * LA BILANCIA — la regola centrale del gioco.
 *
 * I due personaggi si dividono una quantità di massa costante. Non se ne crea
 * e non se ne distrugge: tutto quello che uno guadagna, l'altro lo perde.
 * Tenendo premuto il proprio tasto azione tiri massa verso di te; premendolo
 * *insieme* all'altro, le due masse si invertono di colpo.
 *
 * Pesante = lento, salto corto, ma attiva le piastre e sfonda.
 * Leggero  = salto alto e planata, ma non sposta niente e viene spinto via.
 */
export class MassSystem {
  /** Frazione di massa in mano al giocatore 2. 0.5 = equilibrio perfetto. */
  private balance = 0.5;

  /** Solo estetica: quanto sta scorrendo massa, e in che verso (-1 / +1). */
  flow = 0;
  invertFlash = 0;
  private invertCooldown = 0;

  static readonly HEAVY = 0.6;
  static readonly LIGHT = 0.4;
  static readonly RATE = 0.62;
  static readonly MIN = 0.1;
  static readonly INVERT_COOLDOWN = 0.7;

  get massP1(): number { return 1 - this.balance; }
  get massP2(): number { return this.balance; }

  massOf(id: 0 | 1): number { return id === 0 ? this.massP1 : this.massP2; }

  isHeavy(id: 0 | 1): boolean { return this.massOf(id) >= MassSystem.HEAVY; }
  isLight(id: 0 | 1): boolean { return this.massOf(id) <= MassSystem.LIGHT; }

  /** Ritorna true nel frame in cui avviene l'inversione. */
  update(dt: number, p1: PlayerInput, p2: PlayerInput, chord: ChordDetector): boolean {
    this.invertCooldown = Math.max(0, this.invertCooldown - dt);
    this.invertFlash = Math.max(0, this.invertFlash - dt * 2.4);

    // Accordo: i due tasti premuti quasi insieme. Non è eseguibile da una
    // persona sola, i tasti stanno agli estremi opposti della tastiera.
    if (chord.inSync && this.invertCooldown <= 0) {
      this.balance = 1 - this.balance;
      this.invertCooldown = MassSystem.INVERT_COOLDOWN;
      this.invertFlash = 1;
      this.flow = 0;
      chord.consume();
      return true;
    }

    const pull1 = p1.aHeld && !p2.aHeld;
    const pull2 = p2.aHeld && !p1.aHeld;
    if (pull1) {
      this.balance -= MassSystem.RATE * dt;
      this.flow = -1;
    } else if (pull2) {
      this.balance += MassSystem.RATE * dt;
      this.flow = 1;
    } else {
      this.flow = 0;
    }

    // Nessuno resta mai completamente senza massa: diventerebbe ingovernabile.
    this.balance = clamp(this.balance, MassSystem.MIN, 1 - MassSystem.MIN);
    return false;
  }

  get value(): number { return this.balance; }
}
