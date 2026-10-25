/**
 * Input da tastiera basato su `KeyboardEvent.code` (posizione fisica del tasto),
 * non su `key`: così i binding restano identici su layout IT, US, DVORAK.
 */

export interface Binding {
  readonly left: string;
  readonly right: string;
  readonly up: string;
  readonly down: string;
  readonly a: string;
  readonly b: string;
}

/** Etichette da mostrare a schermo, layout italiano. */
export const KEY_LABELS: Record<string, string> = {
  KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyQ: 'Q', KeyE: 'E',
  ArrowUp: '↑', ArrowLeft: '←', ArrowDown: '↓', ArrowRight: '→',
  Period: '.', Slash: '-', Comma: ',', Space: 'SPAZIO',
  ShiftRight: 'MAIUSC', Enter: 'INVIO',
};

export const P1_BINDING: Binding = {
  left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', a: 'KeyQ', b: 'KeyE',
};

export const P2_BINDING: Binding = {
  left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
  a: 'Period', b: 'Slash',
};

/** Tasti che il browser userebbe per scrollare la pagina. */
const SWALLOW = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab',
  'Period', 'Slash', 'Quote', 'Backquote',
]);

export class Keyboard {
  private readonly held = new Set<string>();
  /** Istante (secondi, orologio di gioco) dell'ultimo press per ogni tasto. */
  private readonly pressedAt = new Map<string, number>();
  private readonly releasedAt = new Map<string, number>();
  private clock = 0;

  install(target: Window = window): () => void {
    const onDown = (e: KeyboardEvent): void => {
      if (SWALLOW.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.held.add(e.code);
      this.pressedAt.set(e.code, this.clock);
    };
    const onUp = (e: KeyboardEvent): void => {
      if (SWALLOW.has(e.code)) e.preventDefault();
      this.held.delete(e.code);
      this.releasedAt.set(e.code, this.clock);
    };
    // Se la finestra perde il focus con dei tasti premuti, il keyup non arriva
    // mai e il personaggio resta "incantato" a correre: puliamo tutto.
    const onBlur = (): void => this.held.clear();

    target.addEventListener('keydown', onDown, { passive: false });
    target.addEventListener('keyup', onUp, { passive: false });
    target.addEventListener('blur', onBlur);

    return () => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    };
  }

  advance(dt: number): void {
    this.clock += dt;
  }

  get time(): number { return this.clock; }

  isHeld(code: string): boolean { return this.held.has(code); }

  /** Da quanti secondi è stato premuto il tasto; Infinity se mai premuto. */
  sincePress(code: string): number {
    const t = this.pressedAt.get(code);
    return t === undefined ? Infinity : this.clock - t;
  }

  sinceRelease(code: string): number {
    const t = this.releasedAt.get(code);
    return t === undefined ? Infinity : this.clock - t;
  }

  /** Consuma il press: usato dal jump buffer, così non spara due volte. */
  consumePress(code: string): void { this.pressedAt.delete(code); }

  /** Quanti tasti sono fisicamente premuti ora (diagnostica anti-ghosting). */
  get heldCount(): number { return this.held.size; }
}

/** Vista sulla tastiera filtrata sui tasti di un singolo giocatore. */
export class PlayerInput {
  constructor(
    private readonly kb: Keyboard,
    public binding: Binding,
  ) {}

  get moveX(): number {
    const l = this.kb.isHeld(this.binding.left) ? 1 : 0;
    const r = this.kb.isHeld(this.binding.right) ? 1 : 0;
    return r - l;
  }

  get up(): boolean { return this.kb.isHeld(this.binding.up); }
  get down(): boolean { return this.kb.isHeld(this.binding.down); }
  get aHeld(): boolean { return this.kb.isHeld(this.binding.a); }
  get bHeld(): boolean { return this.kb.isHeld(this.binding.b); }

  /** Vero se `up` è stato premuto entro `window` secondi (jump buffer). */
  jumpBuffered(window: number): boolean {
    return this.kb.sincePress(this.binding.up) <= window;
  }

  consumeJump(): void { this.kb.consumePress(this.binding.up); }

  sinceAPress(): number { return this.kb.sincePress(this.binding.a); }
  consumeA(): void { this.kb.consumePress(this.binding.a); }

  /** Vero se il tasto abilità è stato premuto entro `window` secondi. */
  abilityBuffered(window: number): boolean {
    return this.kb.sincePress(this.binding.b) <= window;
  }

  consumeAbility(): void { this.kb.consumePress(this.binding.b); }

  /** Da quanti secondi è stato premuto "giù" (Infinity se mai). */
  sinceDownPress(): number { return this.kb.sincePress(this.binding.down); }
  consumeDown(): void { this.kb.consumePress(this.binding.down); }

  label(slot: keyof Binding): string {
    const code = this.binding[slot];
    return KEY_LABELS[code] ?? code;
  }
}

/**
 * Rileva gli "accordi": due giocatori che premono il proprio tasto azione
 * entro una finestra temporale stretta. È l'unica meccanica che una persona
 * sola non può eseguire, perché i tasti sono fisicamente lontani.
 */
export class ChordDetector {
  static readonly WINDOW = 0.18;

  constructor(
    private readonly p1: PlayerInput,
    private readonly p2: PlayerInput,
  ) {}

  /** Entrambi tengono premuto il tasto azione adesso. */
  get held(): boolean { return this.p1.aHeld && this.p2.aHeld; }

  /** I due press sono avvenuti entro la finestra: accordo "pulito". */
  get inSync(): boolean {
    if (!this.held) return false;
    return Math.abs(this.p1.sinceAPress() - this.p2.sinceAPress()) <= ChordDetector.WINDOW;
  }

  /** 0..1: quanto sono stati sincroni i due press (1 = perfetto). */
  get precision(): number {
    if (!this.held) return 0;
    const gap = Math.abs(this.p1.sinceAPress() - this.p2.sinceAPress());
    return Math.max(0, 1 - gap / ChordDetector.WINDOW);
  }

  consume(): void { this.p1.consumeA(); this.p2.consumeA(); }
}
