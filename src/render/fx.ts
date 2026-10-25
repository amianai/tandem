import { Container, Graphics, type Texture } from 'pixi.js';
import { clamp, easeOutCubic, lerp } from '../core/math';
import type { LightRegistry } from './lighting';
import type { Particles } from './particles';
import type { Shock } from './post';
import { worldToScreen, type SplitScreen } from './splitScreen';
import { mixColor, PAL, ROLE_COLORS, type Role } from './theme';

/**
 * REGISTA DEGLI EFFETTI ("juice").
 *
 * Non tocca la logica di gioco: a ogni frame guarda lo stato dei personaggi
 * (a terra? in picchiata? in scatto? quanta massa?) e trasforma i CAMBI di
 * stato in effetti: anelli d'urto, lampi di luce, onde di distorsione a
 * schermo, schegge, polvere, il fascio dell'inversione, i granelli di massa
 * che volano da uno all'altro mentre si tira.
 *
 * Gli elementi del livello (cancelli, solai, piastre) segnalano i loro
 * eventi con `fxBus.emit(...)` dal proprio `draw()`.
 *
 * Principi (vedi docs/GRAFICA.md): ogni effetto è proporzionale alla causa
 * (massa, velocità d'impatto), dura poco (≤ 0.5 s), ed è LOCALE: a schermo
 * diviso l'impatto di uno non acceca la metà dell'altro.
 */

/** Il minimo che serve sapere di un personaggio (Player lo soddisfa). */
export interface FxActor {
  readonly id: 0 | 1;
  readonly role: Role;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly onGround: boolean;
  readonly mass: number;
  readonly isSlamming: boolean;
  readonly isDashing: boolean;
  readonly isGliding: boolean;
  /** La vista: la sua posizione è quella interpolata e disegnata. */
  readonly view: Container;
  /** Falso mentre è uno spirito: niente alone né effetti di movimento. */
  readonly alive?: boolean;
}

export type FxEvent =
  /** Schegge solide che cadono (solaio rotto, urti). */
  | { type: 'debris'; x: number; y: number; color: number; count: number; up?: number }
  /** Sbuffo di vapore/polvere (cancelli, piastre, oggetti posati). */
  | { type: 'puff'; x: number; y: number; count: number; color?: number; dir?: number }
  /** Anello che si allarga (piatto = a terra). */
  | { type: 'ring'; x: number; y: number; color: number; radius: number; flat?: boolean; life?: number }
  /** Lampo di luce dinamica. */
  | { type: 'flash'; x: number; y: number; color: number; radius: number; intensity?: number; life?: number }
  /** Scintille additive. */
  | { type: 'sparks'; x: number; y: number; color: number; count: number; up?: boolean }
  /** Onda d'urto a schermo (distorsione), di chi è la metà. */
  | { type: 'shock'; x: number; y: number; strength: number; owner: 0 | 1 };

class FxBus {
  private queue: FxEvent[] = [];
  private spare: FxEvent[] = [];
  emit(e: FxEvent): void { this.queue.push(e); }
  /** Ritorna gli eventi accumulati e svuota la coda. */
  drain(): readonly FxEvent[] {
    const out = this.queue;
    this.queue = this.spare;
    this.queue.length = 0;
    this.spare = out;
    return out;
  }
}

/** Coda globale degli eventi visivi del livello. */
export const fxBus = new FxBus();

/** Soglie della Bilancia (come MassSystem.HEAVY / LIGHT). */
const HEAVY = 0.6;
const LIGHT = 0.4;

interface Ring { x: number; y: number; age: number; life: number; color: number; radius: number; flat: boolean }
interface Flash { x: number; y: number; age: number; life: number; color: number; radius: number; intensity: number }
interface WorldShock { x: number; y: number; age: number; life: number; strength: number; owner: 0 | 1 }
interface Mote { from: 0 | 1; t: number; dur: number; ox: number; oy: number; seed: number }

interface Track {
  ground: boolean;
  slam: boolean;
  dash: boolean;
  fall: number;
  mass: number;
  moteAcc: number;
  init: boolean;
}

export class FxDirector {
  /** Sotto l'overlay delle luci: effetti "fisici", illuminati come il mondo. */
  readonly under = new Container();
  /** Sopra: effetti emissivi, in somma additiva. */
  readonly over = new Container();
  private readonly gUnder = new Graphics();
  private readonly gOver = new Graphics();

  private readonly rings: Ring[] = [];
  private readonly flashes: Flash[] = [];
  private readonly shocks: WorldShock[] = [];
  private readonly motes: Mote[] = [];
  private impact = { x: 0, y: 0, age: 1, life: 0.2, amount: 0, owner: 0 as 0 | 1 };
  private beam = { age: 1, life: 0.4 };
  private readonly track: [Track, Track] = [newTrack(), newTrack()];
  private prevInvert = 0;
  private actors: readonly FxActor[] = [];

  constructor(private readonly particles: Particles | null = null, private readonly dustTex: Texture | null = null) {
    this.under.label = 'fx-under';
    this.over.label = 'fx-over';
    this.gOver.blendMode = 'add';
    this.under.addChild(this.gUnder);
    this.over.addChild(this.gOver);
  }

  update(dt: number, frame: { players: readonly FxActor[]; invertFlash: number }, events: readonly FxEvent[]): void {
    this.actors = frame.players.filter((p) => p.alive !== false);
    frame.players.forEach((p, i) => {
      if (p.alive !== false) this.watch(p, this.track[i as 0 | 1], dt, frame.players);
    });
    // con uno dei due a terra non c'è massa che passa: via i granelli in volo
    if (this.actors.length < 2) this.motes.length = 0;

    // inversione delle masse: il flash della Bilancia sale di colpo a 1
    if (frame.invertFlash > this.prevInvert + 0.5) this.onInvert(frame.players);
    this.prevInvert = frame.invertFlash;

    for (const e of events) this.handle(e);

    age(this.rings, dt);
    age(this.flashes, dt);
    age(this.shocks, dt);
    this.impact.age += dt;
    this.beam.age += dt;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i]!;
      m.t += dt / m.dur;
      if (m.t >= 1) this.motes.splice(i, 1);
    }
    this.draw();
  }

  /* --- osservazione dei personaggi ------------------------------------ */

  private watch(p: FxActor, tr: Track, dt: number, all: readonly FxActor[]): void {
    const c = ROLE_COLORS[p.role];
    if (!tr.init) {
      Object.assign(tr, { ground: p.onGround, slam: p.isSlamming, dash: p.isDashing, mass: p.mass, init: true });
      return;
    }
    if (!p.onGround) tr.fall = Math.max(tr.fall, p.vy);

    // Atterraggio
    if (p.onGround && !tr.ground) {
      if (tr.slam) this.onSlam(p);
      else if (tr.fall > 250) this.onLand(p, tr.fall);
      tr.fall = 0;
    }
    if (p.onGround) tr.fall = 0;

    // Inizio della picchiata: un piccolo "carico" prima del colpo
    if (p.isSlamming && !tr.slam) {
      this.rings.push({ x: p.x, y: p.y - 8, age: 0, life: 0.18, color: c.light, radius: 10, flat: false });
      this.flashes.push({ x: p.x, y: p.y - 8, age: 0, life: 0.2, color: c.glow, radius: 60, intensity: 0.6 });
    }
    // Scatto: anello verticale e lampo freddo
    if (p.isDashing && !tr.dash) {
      this.rings.push({ x: p.x, y: p.y - 8, age: 0, life: 0.22, color: c.light, radius: 14, flat: false });
      this.flashes.push({ x: p.x, y: p.y - 8, age: 0, life: 0.25, color: c.glow, radius: 70, intensity: 0.7 });
    }

    // Abilità pronta: GHISA diventa pesante, SOFFIO diventa leggero. Come i
    // capelli di Madeline in Celeste, lo stato si legge sul personaggio.
    const ready = p.role === 'ghisa' ? p.mass >= HEAVY : p.mass <= LIGHT;
    const wasReady = p.role === 'ghisa' ? tr.mass >= HEAVY : tr.mass <= LIGHT;
    if (ready && !wasReady) {
      this.rings.push({ x: p.view.x, y: p.view.y - 9, age: 0, life: 0.32, color: c.light, radius: 15, flat: false });
      this.flashes.push({ x: p.view.x, y: p.view.y - 9, age: 0, life: 0.3, color: c.glow, radius: 70, intensity: 0.7 });
      if (this.particles && this.dustTex) {
        this.particles.emit({
          texture: this.dustTex, style: 'spark', x: p.view.x, y: p.view.y - 9, count: 8,
          speed: [30, 90], angle: [Math.PI * 1.1, Math.PI * 1.9], life: [0.25, 0.45],
          scale: [0.08, 0.15], gravity: 120, drag: 2, tint: c.light, additive: true,
        });
      }
    }

    // Massa che arriva mentre si tira: granelli dall'altro personaggio.
    const dm = p.mass - tr.mass;
    const other = all[p.id === 0 ? 1 : 0];
    if (other && dm > 0.0005 && dm < 0.15) {
      tr.moteAcc += dm * 160;
      while (tr.moteAcc >= 1 && this.motes.length < 60) {
        tr.moteAcc -= 1;
        this.motes.push({
          from: other.id, t: 0, dur: 0.42 + Math.random() * 0.2,
          ox: (Math.random() - 0.5) * 10, oy: -6 - Math.random() * 10, seed: Math.random() * 6.28,
        });
      }
    } else {
      tr.moteAcc = 0;
    }

    tr.ground = p.onGround;
    tr.slam = p.isSlamming;
    tr.dash = p.isDashing;
    tr.mass = p.mass;
    void dt;
  }

  private onSlam(p: FxActor): void {
    const c = ROLE_COLORS[p.role];
    const power = clamp(p.mass, 0.3, 1);
    this.rings.push({ x: p.x, y: p.y, age: 0, life: 0.38, color: c.light, radius: 40 + power * 30, flat: true });
    this.rings.push({ x: p.x, y: p.y, age: -0.05, life: 0.5, color: PAL.fog, radius: 26 + power * 20, flat: true });
    this.flashes.push({ x: p.x, y: p.y - 6, age: 0, life: 0.32, color: c.glow, radius: 150, intensity: 1.2 });
    this.shocks.push({ x: p.x, y: p.y - 4, age: 0, life: 0.5, strength: 0.6 + power * 0.6, owner: p.id });
    this.impact = { x: p.x, y: p.y - 6, age: 0, life: 0.22, amount: 0.9, owner: p.id };
    if (this.particles && this.dustTex) {
      this.particles.emit({
        texture: this.dustTex, style: 'debris', x: p.x, y: p.y - 1, count: 16,
        speed: [80, 220], angle: [Math.PI * 1.15, Math.PI * 1.85], life: [0.4, 0.8],
        gravity: 700, drag: 1.2, tint: PAL.slate3,
      });
      for (const dir of [-1, 1]) {
        this.particles.emit({
          texture: this.dustTex, style: 'dust', x: p.x + dir * 6, y: p.y - 2, count: 7,
          speed: [60, 150], angle: dir < 0 ? [Math.PI * 0.95, Math.PI * 1.08] : [-Math.PI * 0.08, Math.PI * 0.05],
          life: [0.35, 0.7], scale: [0.12, 0.2], drag: 4, alpha: 0.75,
        });
      }
    }
  }

  private onLand(p: FxActor, fall: number): void {
    const k = clamp((fall - 250) / 350, 0, 1);
    const heavy = p.mass >= 0.6;
    if (heavy && k > 0.3) {
      this.rings.push({ x: p.x, y: p.y, age: 0, life: 0.3, color: PAL.slate3, radius: 16 + k * 14, flat: true });
    }
    if (this.particles && this.dustTex) {
      for (const dir of [-1, 1]) {
        this.particles.emit({
          texture: this.dustTex, style: 'dust', x: p.x + dir * 4, y: p.y - 1, count: Math.round(2 + k * 4 + (heavy ? 2 : 0)),
          speed: [30, 60 + k * 70], angle: dir < 0 ? [Math.PI * 0.97, Math.PI * 1.1] : [-Math.PI * 0.1, Math.PI * 0.03],
          life: [0.25, 0.45], scale: [0.06, 0.12 + k * 0.06], drag: 5, alpha: 0.7,
        });
      }
    }
  }

  private onInvert(players: readonly FxActor[]): void {
    this.beam = { age: 0, life: 0.42 };
    for (const p of players) {
      const c = ROLE_COLORS[p.role];
      this.rings.push({ x: p.view.x, y: p.view.y - 8, age: 0, life: 0.35, color: c.light, radius: 22, flat: false });
      this.flashes.push({ x: p.view.x, y: p.view.y - 8, age: 0, life: 0.35, color: c.glow, radius: 110, intensity: 0.9 });
      this.shocks.push({ x: p.view.x, y: p.view.y - 8, age: 0, life: 0.35, strength: 0.35, owner: p.id });
    }
  }

  private handle(e: FxEvent): void {
    switch (e.type) {
      case 'ring':
        this.rings.push({ x: e.x, y: e.y, age: 0, life: e.life ?? 0.35, color: e.color, radius: e.radius, flat: e.flat ?? false });
        break;
      case 'flash':
        this.flashes.push({ x: e.x, y: e.y, age: 0, life: e.life ?? 0.3, color: e.color, radius: e.radius, intensity: e.intensity ?? 1 });
        break;
      case 'shock':
        this.shocks.push({ x: e.x, y: e.y, age: 0, life: 0.45, strength: e.strength, owner: e.owner });
        break;
      case 'debris':
        if (this.particles && this.dustTex) {
          this.particles.emit({
            texture: this.dustTex, style: 'debris', x: e.x, y: e.y, count: e.count,
            speed: [40, 160 + (e.up ?? 0)], angle: [Math.PI * 1.1, Math.PI * 1.9], life: [0.4, 0.9],
            gravity: 650, drag: 1, tint: e.color,
          });
        }
        break;
      case 'puff':
        if (this.particles && this.dustTex) {
          const dir = e.dir ?? 0;
          this.particles.emit({
            texture: this.dustTex, style: 'dust', x: e.x, y: e.y, count: e.count,
            speed: [20, 70],
            angle: dir === 0 ? [Math.PI, Math.PI * 2] : dir < 0 ? [Math.PI * 0.9, Math.PI * 1.2] : [-Math.PI * 0.2, Math.PI * 0.1],
            life: [0.3, 0.6], scale: [0.08, 0.16], drag: 3.5, alpha: 0.6, tint: e.color,
          });
        }
        break;
      case 'sparks':
        if (this.particles && this.dustTex) {
          this.particles.emit({
            texture: this.dustTex, style: 'spark', x: e.x, y: e.y, count: e.count,
            speed: [40, 150], angle: e.up ? [Math.PI * 1.2, Math.PI * 1.8] : [0, Math.PI * 2],
            life: [0.2, 0.5], scale: [0.06, 0.18], gravity: 260, drag: 2, tint: e.color, additive: true,
          });
        }
        break;
    }
  }

  /* --- disegno --------------------------------------------------------- */

  private draw(): void {
    const gu = this.gUnder.clear();
    const go = this.gOver.clear();

    // Alone a gradini attorno a ciascun personaggio (sopra le luci, additivo):
    // a colpo d'occhio, anche al buio e a schermo diviso, si sa dove si è.
    // GHISA brilla di più da pesante, SOFFIO da leggero.
    for (const a of this.actors) {
      const c = ROLE_COLORS[a.role];
      const k = a.role === 'ghisa' ? clamp((a.mass - 0.2) / 0.7, 0, 1) : clamp((0.8 - a.mass) / 0.7, 0, 1);
      const x = Math.round(a.view.x), y = Math.round(a.view.y) - 9;
      const base = 0.022 + k * 0.03;
      go.circle(x, y, 22).fill({ color: c.glow, alpha: base * 0.8 });
      go.circle(x, y, 14).fill({ color: c.glow, alpha: base * 1.1 });
      go.circle(x, y, 8).fill({ color: c.glow, alpha: base * 1.5 });
    }

    for (const r of this.rings) {
      if (r.age < 0) continue;
      const k = clamp(r.age / r.life, 0, 1);
      const e = easeOutCubic(k);
      const rad = 3 + (r.radius - 3) * e;
      const a = (1 - k) * (1 - k);
      const width = k < 0.4 ? 2 : 1;
      if (r.flat) {
        // anello schiacciato sul pavimento: si legge come un'onda a terra
        go.ellipse(Math.round(r.x), Math.round(r.y) - 0.5, rad, Math.max(1.5, rad * 0.22))
          .stroke({ width, color: r.color, alpha: a });
        gu.ellipse(Math.round(r.x), Math.round(r.y) + 0.5, rad * 0.8, Math.max(1, rad * 0.14))
          .stroke({ width: 1, color: PAL.ink, alpha: a * 0.5 });
      } else {
        go.circle(Math.round(r.x), Math.round(r.y), rad).stroke({ width, color: r.color, alpha: a });
      }
    }

    // Fascio dell'inversione: una saetta fra i due che si scambia i colori.
    if (this.beam.age < this.beam.life && this.actors.length === 2) {
      const k = this.beam.age / this.beam.life;
      const [a, b] = this.actors as [FxActor, FxActor];
      const ax = a.view.x, ay = a.view.y - 8, bx = b.view.x, by = b.view.y - 8;
      const segs = Math.max(6, Math.min(40, Math.round(Math.hypot(bx - ax, by - ay) / 14)));
      const nx = -(by - ay), ny = bx - ax;
      const nl = Math.hypot(nx, ny) || 1;
      const jitter = 5 * (1 - k);
      for (let pass = 0; pass < 2; pass++) {
        let px = ax, py = ay;
        for (let i = 1; i <= segs; i++) {
          const t = i / segs;
          const wob = i === segs ? 0 : Math.sin(i * 12.9898 + this.beam.age * 60 + pass * 3) * jitter;
          const x = lerp(ax, bx, t) + (nx / nl) * wob;
          const y = lerp(ay, by, t) + (ny / nl) * wob;
          const col = mixColor(ROLE_COLORS[a.role].main, ROLE_COLORS[b.role].main, pass === 0 ? t : 1 - t);
          go.moveTo(px, py).lineTo(x, y).stroke({ width: pass === 0 ? 1 : 1, color: pass === 0 ? col : PAL.bone, alpha: (1 - k) * (pass === 0 ? 1 : 0.6) });
          px = x; py = y;
        }
      }
    }

    // Granelli di massa: arco dal donatore al ricevente, si accendono all'arrivo.
    for (const m of this.motes) {
      const from = this.actors[m.from];
      const to = this.actors[m.from === 0 ? 1 : 0];
      if (!from || !to) continue;
      const e = m.t * m.t * (3 - 2 * m.t);
      const fx = from.view.x + m.ox, fy = from.view.y + m.oy;
      const tx = to.view.x, ty = to.view.y - 8;
      const lift = Math.sin(e * Math.PI) * (18 + Math.abs(tx - fx) * 0.08);
      const x = lerp(fx, tx, e) + Math.sin(m.seed + m.t * 9) * 2;
      const y = lerp(fy, ty, e) - lift;
      const col = mixColor(ROLE_COLORS[from.role].light, ROLE_COLORS[to.role].light, e);
      const a = Math.min(1, m.t * 6) * (0.6 + 0.4 * e);
      go.rect(Math.round(x), Math.round(y), 1, 1).fill({ color: col, alpha: a });
      if (m.t > 0.85) go.rect(Math.round(x) - 1, Math.round(y), 3, 1).fill({ color: col, alpha: a * 0.5 });
    }
  }

  /** Luci dinamiche degli effetti in corso. */
  registerLights(lights: LightRegistry): void {
    for (const f of this.flashes) {
      if (f.age < 0) continue;
      const k = clamp(f.age / f.life, 0, 1);
      lights.put(f.x, f.y, f.radius * (0.7 + 0.3 * k), f.color, f.intensity * (1 - k) * (1 - k));
    }
    if (this.beam.age < this.beam.life && this.actors.length === 2) {
      const [a, b] = this.actors as [FxActor, FxActor];
      const k = 1 - this.beam.age / this.beam.life;
      const n = 5;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        lights.put(lerp(a.view.x, b.view.x, t), lerp(a.view.y, b.view.y, t) - 8, 50, PAL.bone, 0.45 * k);
      }
    }
  }

  /**
   * Effetti a schermo per il post-processing, proiettati con la camera della
   * metà a cui appartengono (a schermo unico le camere coincidono).
   */
  screenEffects(split: SplitScreen, w: number, h: number): {
    shocks: Shock[]; impact: { x: number; y: number; r: number; amount: number };
  } {
    const camOf = (owner: 0 | 1) => (split.isSplit && owner === 1 ? split.camB : split.camA);
    const out: Shock[] = [];
    const live = this.shocks
      .filter((s) => s.age >= 0 && s.age < s.life)
      .sort((a, b) => b.strength * (1 - b.age / b.life) - a.strength * (1 - a.age / a.life));
    for (const s of live.slice(0, 2)) {
      const cam = camOf(s.owner);
      const p = worldToScreen(cam, s.x, s.y, w, h);
      const k = s.age / s.life;
      out.push({ x: p.x, y: p.y, r: easeOutCubic(k) * 95 * cam.zoom, strength: s.strength * (1 - k) * (1 - k) });
    }
    const im = this.impact;
    let impact = { x: 0, y: 0, r: 1, amount: 0 };
    if (im.age < im.life) {
      const cam = camOf(im.owner);
      const p = worldToScreen(cam, im.x, im.y, w, h);
      const k = im.age / im.life;
      impact = { x: p.x, y: p.y, r: 70 * cam.zoom, amount: im.amount * (1 - k) };
    }
    return { shocks: out, impact };
  }
}

function newTrack(): Track {
  return { ground: true, slam: false, dash: false, fall: 0, mass: 0.5, moteAcc: 0, init: false };
}

function age<T extends { age: number; life: number }>(list: T[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i]!;
    it.age += dt;
    if (it.age >= it.life) list.splice(i, 1);
  }
}
