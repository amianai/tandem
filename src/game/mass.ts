import type { ChordDetector, PlayerInput } from '../core/input';

/**
 * LA BILANCIA — la regola centrale del gioco.
 *
 * La massa totale vale sempre 1 e non si crea né si distrugge. Può stare in
 * tre posti: GHISA, SOFFIO e la Zavorra (quando GHISA la posa a terra).
 *
 * - Tenendo premuto il proprio tasto azione si tira massa dall'altro.
 * - Premendo i due tasti insieme le masse dei due giocatori si scambiano.
 * - Posando la Zavorra, GHISA ci scarica dentro tutta la sua massa: è l'unico
 *   modo per essere leggeri tutti e due nello stesso momento.
 *
 * Pesante = lento, salto corto, ma preme le piastre e sfonda.
 * Leggero  = salto alto e planata, ma non sposta niente e viene spinto via.
 */
export class MassSystem {
  m1 = 0.5;
  m2 = 0.5;
  /** Massa parcheggiata nella Zavorra posata. */
  ballast = 0;

  invertFlash = 0;
  private invertCooldown = 0;

  static readonly HEAVY = 0.6;
  static readonly LIGHT = 0.4;
  static readonly RATE = 0.62;
  /** Nessuno resta mai completamente senza massa: diventerebbe ingovernabile. */
  static readonly MIN = 0.1;
  static readonly INVERT_COOLDOWN = 0.7;

  get massP1(): number { return this.m1; }
  get massP2(): number { return this.m2; }

  massOf(id: 0 | 1): number { return id === 0 ? this.m1 : this.m2; }
  isHeavy(id: 0 | 1): boolean { return this.massOf(id) >= MassSystem.HEAVY; }
  isLight(id: 0 | 1): boolean { return this.massOf(id) <= MassSystem.LIGHT; }

  /** GHISA posa la Zavorra: tutta la sua massa oltre il minimo passa al ferro. */
  depositBallast(): number {
    const amount = Math.max(0, this.m1 - MassSystem.MIN);
    this.m1 -= amount;
    this.ballast += amount;
    return amount;
  }

  /** GHISA riprende la Zavorra e con lei la massa che conteneva. */
  withdrawBallast(): number {
    const amount = this.ballast;
    this.m1 += amount;
    this.ballast = 0;
    return amount;
  }

  /** Ritorna true nel frame in cui avviene l'inversione. */
  update(dt: number, p1: PlayerInput, p2: PlayerInput, chord: ChordDetector): boolean {
    this.invertCooldown = Math.max(0, this.invertCooldown - dt);
    this.invertFlash = Math.max(0, this.invertFlash - dt * 2.4);

    // Accordo: i due tasti premuti quasi insieme. Non è eseguibile da una
    // persona sola, i tasti stanno agli estremi opposti della tastiera.
    if (chord.inSync && this.invertCooldown <= 0) {
      [this.m1, this.m2] = [this.m2, this.m1];
      this.invertCooldown = MassSystem.INVERT_COOLDOWN;
      this.invertFlash = 1;
      chord.consume();
      return true;
    }

    const pull1 = p1.aHeld && !p2.aHeld;
    const pull2 = p2.aHeld && !p1.aHeld;
    if (pull1) this.transferFrom(1, MassSystem.RATE * dt);
    else if (pull2) this.transferFrom(0, MassSystem.RATE * dt);
    return false;
  }

  /** Sposta massa da `from` all'altro giocatore senza scendere sotto il minimo. */
  private transferFrom(from: 0 | 1, amount: number): void {
    const moved = Math.min(amount, Math.max(0, this.massOf(from) - MassSystem.MIN));
    if (from === 0) { this.m1 -= moved; this.m2 += moved; }
    else { this.m2 -= moved; this.m1 += moved; }
  }
}
