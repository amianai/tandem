import { Container, type Texture } from 'pixi.js';
import { approach, clamp, damp, lerp, type Rect } from '../core/math';
import type { PlayerInput } from '../core/input';
import { MassSystem } from './mass';
import type { Collider } from './physics';
import type { Particles } from '../render/particles';
import { CharacterArt } from '../render/art/characters';

/**
 * I due ruoli sono fissi e specularmente inutili da soli:
 * GHISA sfonda solo se è pesante, SOFFIO scatta solo se è leggero.
 * Siccome la massa è una sola e va divisa, non possono mai essere
 * entrambi al massimo della propria forma.
 */
export type Role = 'ghisa' | 'soffio';

export interface PlayerFx {
  dust: Texture;
  spark: Texture;
}

export interface SlamImpact { x: number; y: number; power: number }

/**
 * Cose successe al personaggio durante l'ultimo passo, che il gioco legge e
 * svuota: così la logica degli oggetti resta fuori dal personaggio.
 */
export type PlayerEvent =
  | { type: 'jumped' }
  | { type: 'landed'; vy: number; slam: boolean }
  /** Tasto gadget: GHISA lancia una brace, SOFFIO soffia. `aim` dai tasti di direzione. */
  | { type: 'gadget'; aim: 'forward' | 'up' | 'down' }
  /** Abilità tentata nello stato di massa sbagliato. */
  | { type: 'denied'; need: 'heavy' | 'light' };

export interface PlayerTuning {
  runSpeed: number;
  groundAccel: number;
  groundDecel: number;
  airAccel: number;
  airDecel: number;
  jumpVelocity: number;
  gravity: number;
  fallGravityMul: number;
  apexGravityMul: number;
  apexThreshold: number;
  maxFall: number;
  jumpCut: number;
  coyoteTime: number;
  jumpBuffer: number;
}

export const DEFAULT_TUNING: PlayerTuning = {
  runSpeed: 112,
  groundAccel: 980,
  groundDecel: 1350,
  airAccel: 660,
  airDecel: 400,
  jumpVelocity: 375,
  gravity: 1250,
  fallGravityMul: 1.55,
  apexGravityMul: 0.55,
  apexThreshold: 58,
  maxFall: 470,
  jumpCut: 0.42,
  coyoteTime: 0.1,
  jumpBuffer: 0.13,
};

const HITBOX_W = 11;
const HITBOX_H = 16;
const ABILITY_BUFFER = 0.15;
const SLAM_SPEED = 640;
const DASH_SPEED = 340;
const DASH_TIME = 0.16;
const GLIDE_FALL = 62;

export class Player {
  x = 0; y = 0;
  vx = 0; vy = 0;
  prevX = 0; prevY = 0;

  /** 0 = quasi senza massa, 1 = tutta la massa. Aggiornato dalla Bilancia. */
  mass = 0.5;

  onGround = false;
  private wasOnGround = false;
  private coyote = 0;
  private jumping = false;
  private facing = 1;
  private runPhase = 0;
  private squash = 1;
  private slamming = false;
  private dashTimer = 0;
  private dashDir = 1;
  private dashSpent = false;
  private gliding = false;
  private pendingImpact: SlamImpact | null = null;
  /** Rallentamento mentre si spinge una cassa (1 = nessuno). */
  private pushDrag = 1;
  /**
   * Velocità orizzontale ricevuta dall'esterno (esplosioni, vapore). È
   * separata da `vx` perché quella insegue sempre l'input: una spinta
   * sommata a `vx` verrebbe cancellata nel giro di pochi passi.
   */
  extVx = 0;
  /** Secondi passati da quando ha lasciato il suolo. */
  private airTime = 0;
  private dashExtended = false;
  readonly events: PlayerEvent[] = [];
  /** Falso mentre il giocatore è uno spirito (lo imposta il gioco). */
  alive = true;

  readonly view = new Container();
  /** Il personaggio disegnato (rig procedurale, vedi render/art/characters.ts). */
  private readonly art: CharacterArt;
  readonly spawn = { x: 0, y: 0 };

  constructor(
    readonly id: 0 | 1,
    readonly role: Role,
    private readonly input: PlayerInput,
    /** Non più usati: i personaggi sono disegnati in codice. */
    _frames: readonly Texture[],
    readonly tint: number,
    private readonly tuning: PlayerTuning = DEFAULT_TUNING,
  ) {
    this.art = new CharacterArt(role);
    this.view.addChild(this.art.view);
    this.view.label = `player${id}`;
  }

  get hitbox(): Rect {
    return { x: this.x - HITBOX_W / 2, y: this.y - HITBOX_H, w: HITBOX_W, h: HITBOX_H };
  }

  get focusX(): number { return this.x; }
  get focusY(): number { return this.y - HITBOX_H * 0.5; }
  get isHeavy(): boolean { return this.mass >= MassSystem.HEAVY; }
  get isLight(): boolean { return this.mass <= MassSystem.LIGHT; }
  get isDashing(): boolean { return this.dashTimer > 0; }
  get isSlamming(): boolean { return this.slamming; }
  get isGliding(): boolean { return this.gliding; }
  /** -1 o 1: verso cui guarda il personaggio. */
  get facingDir(): number { return this.facing; }
  /** -1, 0, 1: dove il giocatore sta cercando di andare (serve a sommare le spinte). */
  get moveIntent(): number { return this.input.moveX; }

  /** L'urto va letto una volta sola: il gioco lo consuma e lo trasforma in onda. */
  takeImpact(): SlamImpact | null {
    const i = this.pendingImpact;
    this.pendingImpact = null;
    return i;
  }

  /**
   * Spara il personaggio in alto fino a circa `height` pixel. La velocità
   * si calcola con la gravità della sua massa attuale, quindi l'altezza è
   * davvero quella; e non è un salto, perciò rilasciare il tasto non la taglia.
   */
  launch(height: number): void {
    const g = this.tuning.gravity * lerp(0.62, 1.42, this.mass);
    this.vy = -Math.sqrt(2 * g * Math.max(height, 0));
    this.jumping = false;
    this.slamming = false;
    this.dashTimer = 0;
    this.onGround = false;
    this.coyote = 0;
    this.squash = 1.45;
  }

  /**
   * Spinta istantanea (esplosione): la componente verticale sostituisce la
   * caduta, quella orizzontale va nella velocità esterna.
   */
  blast(vx: number, vy: number): void {
    this.extVx = vx;
    this.vy = Math.min(this.vy, vy);
    this.jumping = false;
    this.slamming = false;
    this.onGround = false;
    this.coyote = 0;
    this.squash = 1.38;
  }

  /** Spinta continua (getto di vapore), in px/s². */
  pushAccel(ax: number, ay: number, dt: number): void {
    this.extVx += ax * dt;
    this.vy += ay * dt;
  }

  /** Attraversare una brace durante lo Scatto lo allunga della metà, una volta. */
  extendDash(): boolean {
    if (this.dashTimer <= 0 || this.dashExtended) return false;
    this.dashExtended = true;
    this.dashTimer += DASH_TIME * 0.5;
    return true;
  }

  /** Rinascita perfetta: abilità di ruolo di nuovo disponibile. */
  refreshAbility(): void { this.dashSpent = false; }

  placeAt(x: number, y: number, isSpawn = false): void {
    this.x = x; this.y = y;
    this.prevX = x; this.prevY = y;
    this.vx = 0; this.vy = 0; this.extVx = 0;
    this.slamming = false;
    this.dashTimer = 0;
    if (isSpawn) { this.spawn.x = x; this.spawn.y = y; }
  }

  respawn(particles?: Particles, puff?: Texture): void {
    if (particles && puff) {
      particles.emit({
        texture: puff, x: this.spawn.x, y: this.spawn.y - 8, count: 14,
        speed: [30, 120], life: [0.25, 0.55], scale: [0.14, 0.26],
        tint: this.tint, drag: 3, additive: true,
      });
    }
    this.placeAt(this.spawn.x, this.spawn.y);
  }

  update(dt: number, map: Collider, particles: Particles, fx: PlayerFx): void {
    this.prevX = this.x;
    this.prevY = this.y;

    // Se un corpo ci è finito addosso (cassa caduta, oggetto posato male),
    // risaliamo di qualche pixel invece di restare incastrati.
    for (let i = 0; i < 10 && map.overlapsSolid(this.hitbox); i++) this.y -= 1;
    const t = this.tuning;
    const m = this.mass;

    // La massa riscala tutta la fisica: è il solo canale con cui i due
    // giocatori si influenzano a vicenda.
    const gravityScale = lerp(0.62, 1.42, m);
    const jumpScale = lerp(1.3, 0.8, m);
    const speedScale = lerp(1.18, 0.84, m);
    const maxFall = lerp(280, 640, m);

    this.updateAbility(dt, particles, fx);

    /* --- orizzontale ------------------------------------------------- */
    if (this.dashTimer > 0) {
      this.vx = this.dashDir * DASH_SPEED;
    } else if (!this.slamming) {
      const move = this.input.moveX;
      const accel = this.onGround
        ? (move !== 0 ? t.groundAccel : t.groundDecel)
        : (move !== 0 ? t.airAccel : t.airDecel);
      this.vx = approach(this.vx, move * t.runSpeed * speedScale * this.pushDrag, accel * dt);
      if (move !== 0) this.facing = move > 0 ? 1 : -1;
    } else {
      this.vx = approach(this.vx, 0, 2400 * dt);
    }

    /* --- verticale ---------------------------------------------------- */
    this.coyote = this.onGround ? t.coyoteTime : Math.max(0, this.coyote - dt);

    if (!this.slamming && this.dashTimer <= 0
        && this.input.jumpBuffered(t.jumpBuffer) && this.coyote > 0) {
      this.input.consumeJump();
      this.events.push({ type: 'jumped' });
      this.coyote = 0;
      this.vy = -t.jumpVelocity * jumpScale;
      this.jumping = true;
      this.onGround = false;
      this.squash = 1.32;
      particles.emit({
        texture: fx.dust, x: this.x, y: this.y, count: 7,
        speed: [30, 85], angle: [Math.PI * 0.15, Math.PI * 0.85],
        life: [0.18, 0.36], scale: [0.1, 0.18], gravity: 240, tint: 0xd8e2ff, alpha: 0.75,
      });
    }

    if (this.jumping && this.vy < 0 && !this.input.up) {
      this.vy *= Math.pow(t.jumpCut, dt * 60);
      if (this.vy > -40) this.jumping = false;
    }
    if (this.vy >= 0) this.jumping = false;

    if (this.dashTimer > 0) {
      this.vy = 0;
      this.gliding = false;
    } else if (this.slamming) {
      this.vy = SLAM_SPEED;
      this.gliding = false;
    } else {
      let g = t.gravity * gravityScale;
      if (this.vy > 0) g *= t.fallGravityMul;
      if (Math.abs(this.vy) < t.apexThreshold && !this.onGround) g *= t.apexGravityMul;
      this.vy = Math.min(this.vy + g * dt, maxFall);

      // Planata: solo da leggeri, tenendo premuto il salto mentre si scende.
      this.gliding = this.isLight && !this.onGround && this.vy > 0 && this.input.up;
      if (this.gliding) {
        this.vy = Math.min(this.vy, GLIDE_FALL);
        if (Math.random() < dt * 22) {
          particles.emit({
            texture: fx.spark, x: this.x + (Math.random() - 0.5) * 10, y: this.y - 6,
            count: 1, speed: [6, 22], life: [0.3, 0.6], scale: [0.06, 0.11],
            tint: this.tint, additive: true, gravity: -20,
          });
        }
      }
    }

    /* --- collisioni --------------------------------------------------- */
    this.pushDrag = 1;
    this.moveX((this.vx + this.extVx) * dt, map);
    // la spinta esterna si smorza: in fretta a terra, piano in aria
    this.extVx *= Math.exp(-(this.onGround ? 9 : 2.2) * dt);
    if (Math.abs(this.extVx) < 2) this.extVx = 0;
    this.wasOnGround = this.onGround;
    const fallSpeed = this.vy;
    this.moveY(this.vy * dt, map);

    /* --- feedback ----------------------------------------------------- */
    if (this.onGround && !this.wasOnGround) this.onLand(particles, fx, fallSpeed);
    if (this.onGround) {
      this.dashSpent = false;
      if (Math.abs(this.vx) > 24) {
        this.runPhase += Math.abs(this.vx) * dt * 0.052;
        if (Math.random() < Math.abs(this.vx) * dt * 0.02) {
          particles.emit({
            texture: fx.dust, x: this.x - this.facing * 4, y: this.y, count: 1,
            speed: [8, 26], angle: [Math.PI, Math.PI * 2],
            life: [0.2, 0.36], scale: [0.07, 0.12], tint: 0xe6ecff, alpha: 0.5, gravity: 60,
          });
        }
      } else {
        this.runPhase = 0;
      }
    }

    this.squash = damp(this.squash, 1, 12, dt);
  }

  private updateAbility(dt: number, particles: Particles, fx: PlayerFx): void {
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.airTime = this.onGround ? 0 : this.airTime + dt;
    if (this.dashTimer <= 0) this.dashExtended = false;

    if (this.role === 'ghisa') {
      // Schianto: GIÙ premuto in aria ("giù = picchiata"). Il tasto deve
      // essere premuto DOPO lo stacco: chi tiene giù per scendere da una
      // piattaforma attraversabile non picchia per sbaglio.
      if (!this.onGround && !this.slamming
          && this.input.sinceDownPress() <= ABILITY_BUFFER
          && this.input.sinceDownPress() < this.airTime) {
        this.input.consumeDown();
        if (this.isHeavy) this.startSlam(particles, fx);
        else this.events.push({ type: 'denied', need: 'heavy' });
      }
      // Brace: sempre, a terra e in aria. Su/giù scelgono la traiettoria.
      if (this.input.abilityBuffered(1 / 30)) {
        this.input.consumeAbility();
        this.events.push({ type: 'gadget', aim: this.input.up ? 'up' : this.input.down ? 'down' : 'forward' });
      }
      return;
    }

    // SOFFIO: a terra soffia; in aria scatta se può, altrimenti soffia.
    if (!this.input.abilityBuffered(this.onGround ? 1 / 30 : ABILITY_BUFFER)) return;
    const canDash = !this.onGround && this.isLight && !this.dashSpent
      && this.dashTimer <= 0 && !this.input.down;
    if (!canDash) {
      this.input.consumeAbility();
      this.events.push({ type: 'gadget', aim: this.input.down ? 'down' : 'forward' });
      return;
    }
    this.input.consumeAbility();
    this.dashTimer = DASH_TIME;
    this.dashDir = this.input.moveX !== 0 ? Math.sign(this.input.moveX) : this.facing;
    this.dashSpent = true;
    this.squash = 1.35;
    particles.emit({
      texture: fx.spark, x: this.x, y: this.y - 8, count: 14,
      speed: [60, 190], angle: [0, Math.PI * 2],
      life: [0.14, 0.34], scale: [0.07, 0.15], tint: this.tint, additive: true, drag: 5,
    });
  }

  private startSlam(particles: Particles, fx: PlayerFx): void {
    this.slamming = true;
    this.vy = SLAM_SPEED;
    particles.emit({
      texture: fx.spark, x: this.x, y: this.y - 8, count: 10,
      speed: [40, 120], angle: [Math.PI * 1.1, Math.PI * 1.9],
      life: [0.15, 0.3], scale: [0.08, 0.16], tint: this.tint, additive: true,
    });
  }

  private onLand(particles: Particles, fx: PlayerFx, impactVy: number): void {
    const impact = clamp(impactVy / this.tuning.maxFall, 0, 1);
    this.squash = lerp(1, 0.66, impact);
    this.events.push({ type: 'landed', vy: impactVy, slam: this.slamming });

    if (this.slamming) {
      this.slamming = false;
      this.squash = 0.42;
      this.pendingImpact = { x: this.x, y: this.y, power: this.mass };
      particles.emit({
        texture: fx.spark, x: this.x, y: this.y, count: 28,
        speed: [90, 330], angle: [Math.PI * 1.02, Math.PI * 1.98],
        life: [0.25, 0.6], scale: [0.1, 0.24], gravity: 420, drag: 3,
        tint: this.tint, additive: true,
      });
      return;
    }

    if (impact > 0.18) {
      particles.emit({
        texture: fx.dust, x: this.x, y: this.y, count: Math.round(4 + impact * 12),
        speed: [40, 40 + impact * 150], angle: [Math.PI * 1.05, Math.PI * 1.95],
        life: [0.2, 0.45], scale: [0.09, 0.2], gravity: 300, drag: 3.4,
        tint: 0xe9eeff, alpha: 0.7,
      });
    }
  }

  private moveX(dx: number, map: Collider): void {
    if (dx === 0) return;
    const step = Math.sign(dx);
    let remaining = Math.abs(dx);
    while (remaining > 0) {
      const move = Math.min(remaining, 1);
      remaining -= move;
      const nextX = this.x + step * move;
      const box: Rect = { x: nextX - HITBOX_W / 2, y: this.y - HITBOX_H, w: HITBOX_W, h: HITBOX_H };
      if (map.overlapsSolid(box)) {
        // Contro una cassa, da terra: proviamo a spingerla. Chi è leggero
        // non la smuove; chi è pesante la spinge più svelto.
        const crate = this.onGround ? map.pushableAt(box) : null;
        if (crate && crate.push(step * move, this.mass) !== 0 && !map.overlapsSolid(box)) {
          this.x = nextX;
          // una fila di casse si spinge più piano di una cassa sola
          this.pushDrag = lerp(0.35, 0.75, this.mass) / Math.max(1, crate.lastChain * 0.75);
          continue;
        }
        this.vx = 0; this.extVx = 0; this.dashTimer = 0; return;
      }
      this.x = nextX;
    }
  }

  private moveY(dy: number, map: Collider): void {
    this.onGround = false;
    if (dy === 0) {
      const probe: Rect = { x: this.x - HITBOX_W / 2, y: this.y - HITBOX_H + 1, w: HITBOX_W, h: HITBOX_H };
      this.onGround = map.overlapsSolid({ ...probe, y: probe.y + 1 });
      return;
    }
    const step = Math.sign(dy);
    let remaining = Math.abs(dy);
    while (remaining > 0) {
      const move = Math.min(remaining, 1);
      remaining -= move;
      const prevBottom = this.y;
      const nextY = this.y + step * move;
      const box: Rect = { x: this.x - HITBOX_W / 2, y: nextY - HITBOX_H, w: HITBOX_W, h: HITBOX_H };

      if (map.overlapsSolid(box)) {
        if (step > 0) this.onGround = true;
        this.vy = 0;
        return;
      }
      if (step > 0 && !this.input.down) {
        const top = map.oneWayBelow(box, prevBottom);
        if (top !== null) {
          this.y = top;
          this.vy = 0;
          this.onGround = true;
          return;
        }
      }
      this.y = nextY;
    }
  }

  draw(alpha: number, time: number): void {
    const x = lerp(this.prevX, this.x, alpha);
    const y = lerp(this.prevY, this.y, alpha);
    this.view.position.set(Math.round(x), Math.round(y));
    this.art.update({
      x, y, vx: this.vx, vy: this.vy, onGround: this.onGround, facing: this.facing,
      mass: this.mass, squash: this.squash, runPhase: this.runPhase,
      slamming: this.slamming, dashing: this.dashTimer > 0, gliding: this.gliding,
    }, time);
  }
}
