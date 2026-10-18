import { Container, Graphics } from 'pixi.js';
import { clamp, lerp } from '../../core/math';
import { fxBus } from '../fx';
import { sceneLights } from '../lighting';
import { mixColor, PAL, ROLE_COLORS } from '../theme';

/**
 * KIT DEGLI OGGETTI — viste autonome per Zavorra, Mantice e Casse.
 *
 * Ogni vista è `{ container, update(stato, tempo) }`: non conosce la logica,
 * legge solo lo stato documentato qui sotto. Il `container` va aggiunto al
 * MONDO (non dentro una vista già posizionata): `update` lo mette da solo in
 * (x, y) arrotondati. Se lo si mette dentro una vista che è già in (x, y),
 * basta passare x = y = 0.
 *
 * Come il resto dell'arte: pixel interi, palette del tema, luci registrate in
 * `sceneLights`, eventi visivi (tonfi, sbuffi, scintille) su `fxBus`. La
 * memoria visiva (per accorgersi di un atterraggio, di una carica piena...)
 * sta dentro la vista stessa.
 *
 * Colori: la Zavorra appartiene a GHISA (ghisa scura, brace arancio), il
 * Mantice a SOFFIO (gomma scura, aria ciano), la Cassa è neutra (acciaio e
 * ottone) e porta stampigliato il suo peso.
 */

/* ------------------------------------------------------------------ *
 * Pennello in pixel interi, coordinate locali (centro-basso = 0,0).
 * ------------------------------------------------------------------ */
function px(g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  if (w <= 0 || h <= 0) return;
  g.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).fill({ color, alpha });
}

/** Cifre 3x5 per le stampigliature. */
const DIGITS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111',
};
function stencil(g: Graphics, text: string, x: number, y: number, color: number, alpha = 1): void {
  for (let k = 0; k < text.length; k++) {
    const d = DIGITS[text[k]!];
    if (!d) continue;
    for (let i = 0; i < 15; i++) if (d[i] === '1') px(g, x + k * 4 + (i % 3), y + Math.floor(i / 3), 1, 1, color, alpha);
  }
}

/* ================================================================== *
 * ZAVORRA (di GHISA)
 * ================================================================== */
export interface ZavorraState {
  /** Centro-basso, coordinate mondo. */
  x: number;
  y: number;
  /** 16 */
  w: number;
  /** 14 */
  h: number;
  /** 'carried' = sulla schiena di GHISA (x, y sono già sulla schiena). */
  state: 'carried' | 'placed';
  /** 0..1 massa trattenuta nel ferro. */
  mass: number;
  facing: -1 | 1;
}

/**
 * Un contrappeso di ghisa con maniglia ad anello. Sul fronte una finestrella
 * mostra il metallo fuso: il livello e il calore dicono quanta massa c'è
 * dentro. Carica = incandescente, con crepe che pulsano e gocce di scintille.
 */
export class ZavorraView {
  readonly container = new Container();
  private readonly g = new Graphics();
  private prevState: ZavorraState['state'] | null = null;
  private settle = 0;
  private lastTime = -1;
  private drip = 0;

  constructor() {
    this.container.label = 'zavorra';
    this.container.addChild(this.g);
  }

  update(s: ZavorraState, time: number): void {
    const dt = this.lastTime < 0 ? 0 : clamp(time - this.lastTime, 0, 0.1);
    this.lastTime = time;
    const ix = Math.round(s.x), iy = Math.round(s.y);
    this.container.position.set(ix, iy);
    const g = this.g.clear();
    const heat = clamp(s.mass / 0.9, 0, 1);
    const molten = mixColor(PAL.ember0, PAL.ember3, heat);

    if (s.state === 'placed' && this.prevState === 'carried') {
      // posata: tonfo proporzionale alla massa
      this.settle = 1;
      fxBus.emit({ type: 'puff', x: ix - s.w / 2, y: iy - 1, count: 3 + Math.round(heat * 4), dir: -1 });
      fxBus.emit({ type: 'puff', x: ix + s.w / 2, y: iy - 1, count: 3 + Math.round(heat * 4), dir: 1 });
      if (heat > 0.2) fxBus.emit({ type: 'ring', x: ix, y: iy, color: PAL.ember3, radius: 18 + heat * 14, flat: true, life: 0.3 });
    }
    this.prevState = s.state;
    this.settle = Math.max(0, this.settle - dt * 4);

    if (s.state === 'carried') {
      // versione compatta "da spalla": blocco con cinghie, finestrella fioca
      const f = s.facing;
      px(g, -4, -9, 9, 8, PAL.slate2);
      px(g, -4, -9, 9, 1, PAL.steel0);
      px(g, -4, -9, 1, 8, PAL.slate3);
      px(g, 4, -9, 1, 8, PAL.night1);
      px(g, -4, -2, 9, 1, PAL.night1);
      px(g, -1, -11, 3, 2, PAL.slate3);          // anello
      px(g, 0, -10, 1, 1, PAL.night0);
      px(g, f > 0 ? 2 : -3, -8, 1, 7, PAL.rust1); // cinghia verso GHISA
      px(g, -2, -6, 5, 2, molten, 0.4 + heat * 0.6);
      sceneLights.put(ix, iy - 5, 24, ROLE_COLORS.ghisa.glow, 0.15 + heat * 0.3);
      return;
    }

    // posata: blocco tronco-piramidale 16x14 con il "tonfo" d'appoggio
    const sq = this.settle;
    const squashY = Math.round(sq * 2);
    const W = s.w + Math.round(sq * 2), H = s.h - squashY;
    const x0 = -Math.floor(W / 2);
    const top = -H;
    // corpo, più largo alla base
    px(g, x0 + 1, top + 2, W - 2, H - 2, PAL.slate2);
    px(g, x0, top + 5, W, H - 5, PAL.slate2);
    px(g, x0 + 2, top + 1, W - 4, 1, PAL.slate3);
    // smussi e luci: spigolo sinistro chiaro, destro scuro
    px(g, x0 + 1, top + 2, 1, 3, PAL.steel0);
    px(g, x0, top + 5, 1, H - 6, PAL.slate3);
    px(g, x0 + 2, top + 1, W - 4, 1, PAL.steel1);
    px(g, x0 + W - 2, top + 2, 1, 3, PAL.slate1);
    px(g, x0 + W - 1, top + 5, 1, H - 6, PAL.night1);
    // base
    px(g, x0, -2, W, 2, PAL.night1);
    px(g, x0 + 1, -2, W - 2, 1, PAL.slate1);
    // anello di sollevamento
    px(g, -2, top - 2, 5, 1, PAL.slate3);
    px(g, -2, top - 1, 1, 2, PAL.slate3);
    px(g, 2, top - 1, 1, 2, PAL.slate1);
    // finestrella del fuso: il livello sale con la massa
    const wx = -4, wy = top + 4, ww = 8, wh = Math.max(3, H - 8);
    px(g, wx - 1, wy - 1, ww + 2, wh + 2, PAL.ink);
    px(g, wx, wy, ww, wh, PAL.night0);
    const level = Math.round(wh * heat);
    if (level > 0) {
      px(g, wx, wy + wh - level, ww, level, molten);
      // pelle del bagno, più chiara, che ondeggia
      const wob = Math.round(Math.sin(time * 3) * 0.6);
      px(g, wx + 1 + wob, wy + wh - level, ww - 3, 1, mixColor(molten, 0xfff2d6, 0.5));
    }
    // vetro: riflesso
    px(g, wx, wy, 1, 2, PAL.steel0, 0.6);
    // rivetti
    for (const rx of [x0 + 2, x0 + W - 3]) px(g, rx, -4, 1, 1, PAL.fog);

    // carica: crepe incandescenti che pulsano sugli spigoli
    if (heat > 0.45) {
      const pulse = 0.55 + 0.45 * Math.sin(time * 5);
      const a = (heat - 0.45) / 0.55 * pulse;
      px(g, x0 + 3, top + 3, 1, 2, PAL.ember2, a);
      px(g, x0 + 4, top + 5, 1, 1, PAL.ember2, a);
      px(g, x0 + W - 4, top + 6, 1, 2, PAL.ember2, a);
      px(g, x0 + W - 3, top + 8, 1, 1, PAL.ember2, a);
      this.drip -= dt;
      if (this.drip <= 0) {
        this.drip = lerp(0.6, 0.15, heat);
        fxBus.emit({ type: 'sparks', x: ix + (Math.random() - 0.5) * W, y: iy - 2, color: PAL.ember3, count: 1 });
      }
    }
    sceneLights.put(ix, iy - H / 2, 30 + heat * 46, ROLE_COLORS.ghisa.glow, 0.15 + heat * 0.75);
  }
}

/* ================================================================== *
 * MANTICE (di SOFFIO)
 * ================================================================== */
export interface ManticeState {
  /** Centro-basso, coordinate mondo. */
  x: number;
  y: number;
  /** 18 */
  w: number;
  /** 8 */
  h: number;
  state: 'carried' | 'placed' | 'recalling';
  /** 0..1 energia accumulata. */
  charge: number;
  /** 0..1 compressione (1 = schiacciato a metà altezza). */
  squash: number;
  /** 1 al lancio, poi decade a 0. */
  launchPulse: number;
}

/**
 * Un mantice a fisarmonica fra due piastre d'acciaio. Le pieghe si
 * illuminano di ciano dall'interno man mano che si carica, e un manometro
 * sul fianco segna la pressione. A carica piena sfiata sbuffi d'aria; al
 * lancio la piastra superiore scatta in alto con un anello d'aria.
 */
export class ManticeView {
  readonly container = new Container();
  private readonly g = new Graphics();
  private readonly trail: { x: number; y: number; age: number }[] = [];
  private lastTime = -1;
  private hiss = 0;
  private prevPulse = 0;
  private prevFull = false;

  constructor() {
    this.container.label = 'mantice';
    this.container.addChild(this.g);
  }

  update(s: ManticeState, time: number): void {
    const dt = this.lastTime < 0 ? 0 : clamp(time - this.lastTime, 0, 0.1);
    this.lastTime = time;
    const ix = Math.round(s.x), iy = Math.round(s.y);
    this.container.position.set(ix, iy);
    const g = this.g.clear();
    const air = ROLE_COLORS.soffio;
    const c = clamp(s.charge, 0, 1);

    // scia mentre torna in volo
    for (const t of this.trail) t.age += dt;
    while (this.trail.length && this.trail[0]!.age > 0.3) this.trail.shift();
    if (s.state === 'recalling') this.trail.push({ x: ix, y: iy, age: 0 });
    for (const t of this.trail) {
      const a = (1 - t.age / 0.3) * 0.6;
      px(g, t.x - ix - 2, t.y - iy - 3, 4, 2, air.main, a);
    }

    if (s.state !== 'placed') {
      // ripiegato: un "libro" di pieghe fra due piastrine
      const spin = s.state === 'recalling' ? Math.round(Math.sin(time * 20) * 1) : 0;
      px(g, -4, -5 + spin, 9, 1, PAL.steel0);
      px(g, -4, -4 + spin, 9, 2, PAL.slate1);
      px(g, -3, -3 + spin, 7, 1, air.dark);
      px(g, -4, -2 + spin, 9, 1, PAL.slate2);
      sceneLights.put(ix, iy - 3, 22, air.glow, 0.25);
      this.prevFull = false;
      return;
    }

    // lancio: la piastra superiore scatta con un piccolo rimbalzo
    const pulse = s.launchPulse;
    if (pulse > 0.9 && this.prevPulse <= 0.9) {
      fxBus.emit({ type: 'ring', x: ix, y: iy - s.h, color: air.light, radius: 22, life: 0.3 });
      fxBus.emit({ type: 'flash', x: ix, y: iy - s.h, color: air.glow, radius: 80, intensity: 0.9, life: 0.3 });
      fxBus.emit({ type: 'puff', x: ix - s.w / 2, y: iy - 2, count: 4, dir: -1, color: PAL.fog });
      fxBus.emit({ type: 'puff', x: ix + s.w / 2, y: iy - 2, count: 4, dir: 1, color: PAL.fog });
    }
    this.prevPulse = pulse;
    const pop = pulse > 0 ? Math.sin(pulse * Math.PI) * 3 : 0;
    const h = Math.max(3, Math.round(s.h * (1 - s.squash * 0.5) + pop));
    const W = s.w;
    const x0 = -Math.floor(W / 2);

    // base
    px(g, x0 - 1, -2, W + 2, 2, PAL.night1);
    px(g, x0 - 1, -2, W + 2, 1, PAL.slate2);
    // pieghe a fisarmonica: alternano sporgenze e rientranze
    const folds = Math.max(2, h - 3);
    for (let k = 0; k < folds; k++) {
      const y = -2 - (k + 1);
      const out = k % 2 === 0;
      const inset = out ? 0 : 1;
      px(g, x0 + inset, y, W - inset * 2, 1, out ? PAL.slate1 : PAL.night1);
      // luce interna nelle rientranze, cresce con la carica
      if (!out && c > 0.02) px(g, x0 + 2, y, W - 4, 1, air.main, 0.25 + c * 0.75);
      if (out) px(g, x0, y, 1, 1, PAL.slate3);
    }
    // piastra superiore con la striscia LED della carica
    const ty = -2 - folds - 2;
    px(g, x0 - 1, ty, W + 2, 2, PAL.slate3);
    px(g, x0 - 1, ty, W + 2, 1, PAL.steel1);
    const ledW = W - 4;
    const lit = Math.round(ledW * c);
    px(g, x0 + 2, ty + 1, ledW, 1, PAL.night0);
    if (lit > 0) px(g, x0 + 2, ty + 1, lit, 1, c >= 0.95 ? air.light : air.main);
    // manometro sul fianco: lancetta che sale con la pressione
    const mx = x0 + W - 1, my = -5;
    px(g, mx, my - 1, 3, 3, PAL.night0);
    px(g, mx + 1, my, 1, 1, PAL.bone);
    const ang = lerp(Math.PI * 0.9, Math.PI * 0.1, c);
    px(g, mx + 1 + Math.round(Math.cos(ang)), my - Math.round(Math.sin(ang)), 1, 1, c > 0.9 ? PAL.alarm : air.light);

    // carica piena: sfiati d'aria intermittenti
    const full = c >= 0.95;
    if (full && !this.prevFull) {
      fxBus.emit({ type: 'flash', x: ix, y: iy - 6, color: air.glow, radius: 60, intensity: 0.6, life: 0.4 });
    }
    this.prevFull = full;
    if (full) {
      this.hiss -= dt;
      if (this.hiss <= 0) {
        this.hiss = 0.35 + Math.random() * 0.4;
        const side = Math.random() < 0.5 ? -1 : 1;
        fxBus.emit({ type: 'puff', x: ix + side * (W / 2 + 1), y: iy - 4, count: 2, dir: side, color: PAL.fog });
      }
    }
    sceneLights.put(ix, iy - 4, 26 + c * 40, air.glow, 0.12 + c * 0.6 + pulse * 0.5);
  }
}

/* ================================================================== *
 * CASSA (neutra)
 * ================================================================== */
export interface CassaState {
  /** Centro-basso, coordinate mondo. */
  x: number;
  y: number;
  /** 16 */
  w: number;
  /** 16 */
  h: number;
  vx: number;
  vy: number;
}

/**
 * Cassa d'acciaio con angolari, fascia d'ottone e il peso stampigliato
 * ("35" = 0,35 della massa totale): chi la vede sa quanto conta sulla
 * piastra. Strisciando a terra fa polvere e scintille dagli spigoli; cadendo
 * si schiaccia un attimo e solleva polvere.
 */
export class CassaView {
  readonly container = new Container();
  private readonly g = new Graphics();
  private lastTime = -1;
  private fall = 0;
  private squash = 0;
  private scrape = 0;
  private prevY: number | null = null;

  constructor(private readonly label = '35') {
    this.container.label = 'cassa';
    this.container.addChild(this.g);
  }

  update(s: CassaState, time: number): void {
    const dt = this.lastTime < 0 ? 0 : clamp(time - this.lastTime, 0, 0.1);
    this.lastTime = time;
    const ix = Math.round(s.x), iy = Math.round(s.y);
    this.container.position.set(ix, iy);

    // atterraggio: si legge dalla velocità che crolla dopo una caduta
    if (s.vy > 60) this.fall = Math.max(this.fall, s.vy);
    const grounded = Math.abs(s.vy) < 1 && this.prevY !== null && Math.abs(iy - this.prevY) < 1;
    if (grounded && this.fall > 120) {
      const k = clamp(this.fall / 500, 0, 1);
      this.squash = 0.6 + k * 0.4;
      fxBus.emit({ type: 'puff', x: ix - s.w / 2, y: iy - 1, count: 2 + Math.round(k * 4), dir: -1 });
      fxBus.emit({ type: 'puff', x: ix + s.w / 2, y: iy - 1, count: 2 + Math.round(k * 4), dir: 1 });
      this.fall = 0;
    }
    if (grounded) this.fall = 0;
    this.prevY = iy;
    this.squash = Math.max(0, this.squash - dt * 6);

    // trascinamento: polvere e qualche scintilla dallo spigolo dietro
    if (grounded && Math.abs(s.vx) > 8) {
      this.scrape -= dt;
      if (this.scrape <= 0) {
        this.scrape = 0.08;
        const back = -Math.sign(s.vx);
        fxBus.emit({ type: 'puff', x: ix + back * (s.w / 2), y: iy - 1, count: 1, dir: back });
        if (Math.random() < 0.35) fxBus.emit({ type: 'sparks', x: ix + back * (s.w / 2), y: iy - 1, color: PAL.ember3, count: 1 });
      }
    }

    const g = this.g.clear();
    const sq = Math.round(this.squash * 2);
    const W = s.w + sq, H = s.h - sq;
    const x0 = -Math.floor(W / 2), top = -H;
    // corpo
    px(g, x0, top, W, H, PAL.slate1);
    // corrugazioni
    for (let y = top + 3; y < -2; y += 3) px(g, x0 + 2, y, W - 4, 1, PAL.slate2);
    // angolari
    for (const [cx, cy] of [[x0, top], [x0 + W - 3, top], [x0, -3], [x0 + W - 3, -3]] as const) {
      px(g, cx, cy, 3, 3, PAL.steel0);
      px(g, cx + 1, cy + 1, 1, 1, PAL.slate1);
    }
    // bordi: luce a sinistra/in alto, ombra a destra/in basso
    px(g, x0 + 3, top, W - 6, 1, PAL.steel0);
    px(g, x0, top + 3, 1, H - 6, PAL.slate3);
    px(g, x0 + W - 1, top + 3, 1, H - 6, PAL.night1);
    px(g, x0 + 3, -1, W - 6, 1, PAL.night1);
    // fascia d'ottone con il peso stampigliato
    const by = top + Math.floor(H / 2) - 3;
    px(g, x0 + 1, by, W - 2, 7, PAL.brass0);
    px(g, x0 + 1, by, W - 2, 1, PAL.brass1);
    stencil(g, this.label, -Math.floor((this.label.length * 4 - 1) / 2), by + 1, PAL.ink, 0.85);
  }
}
