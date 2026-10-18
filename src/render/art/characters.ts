import { Container, defaultFilterVert, Filter, GlProgram, Graphics } from 'pixi.js';
import { clamp, lerp } from '../../core/math';
import { sceneLights } from '../lighting';
import { OUTLINE_FRAG } from '../shaders';
import { mixColor, PAL, rgb01, ROLE_COLORS, type Role } from '../theme';

/**
 * PERSONAGGI — disegnati in codice, a pixel interi, a ogni frame.
 *
 * Niente spritesheet: ogni personaggio è un piccolo "rig" di parti
 * (gambe, busto, testa, braccia, sciarpa) posizionate da poche formule.
 * Viene disegnato direttamente nella texture del mondo a 1:1, quindi esce
 * pixel art vera (come i modelli 3D di Dead Cells renderizzati piccoli e
 * senza antialiasing), ma con un'animazione continua: squash & stretch,
 * corsa, respiro, inclinazione, scie e moto secondario reagiscono a velocità
 * e massa senza fotogrammi disegnati a mano.
 *
 * Un filtro sulla sagoma aggiunge il contorno scuro, il filo di luce lunare
 * in alto e un filo del colore del giocatore sul lato posteriore.
 *
 * La MASSA si legge sul corpo, non solo nella barra:
 * - GHISA è ghisa: più è pesante più si allarga e si arroventa (griglia sul
 *   petto, visiera, gocce di scintille, fumo dallo sfiato).
 * - SOFFIO è stoffa e aria: più è leggero più è snello e la sciarpa si
 *   allunga e fluttua; da pesante la sciarpa si accorcia e pende.
 */

export interface CharacterState {
  /** Piedi, coordinate mondo (interpolate, non arrotondate). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** -1 o 1. */
  facing: number;
  /** 0..1 */
  mass: number;
  /** 1 = neutro; >1 allungato, <1 schiacciato (dal salto/atterraggio). */
  squash: number;
  /** Fase della corsa: +1 a ogni passo. */
  runPhase: number;
  slamming: boolean;
  dashing: boolean;
  gliding: boolean;
}

interface Ghost { x: number; y: number; facing: number; age: number; sx: number; sy: number }
interface Puff { x: number; y: number; vx: number; vy: number; age: number; life: number }

/** Un pennello che lavora in coordinate del rig (piedi = 0,0, avanti = +x). */
class Brush {
  g!: Graphics;
  facing = 1;
  sx = 1;
  sy = 1;
  /** Inclinazione: px di spostamento orizzontale per px di altezza. */
  shear = 0;
  ox = 0;
  oy = 0;

  /** Rettangolo pieno; (x, y) è l'angolo in alto a sinistra rivolto in avanti. */
  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    if (w <= 0 || h <= 0) return;
    const yy = this.oy + y * this.sy;
    const hh = h * this.sy;
    const lean = -(y + h / 2) * this.shear;
    let xx = this.ox + (x * this.sx + lean);
    const ww = w * this.sx;
    if (this.facing < 0) xx = this.ox * 2 - xx - ww;
    const x0 = Math.round(xx), y0 = Math.round(yy);
    const x1 = Math.round(xx + ww), y1 = Math.round(yy + hh);
    if (x1 <= x0 || y1 <= y0) return;
    this.g.rect(x0, y0, x1 - x0, y1 - y0).fill({ color, alpha });
  }

  px(x: number, y: number, color: number, alpha = 1): void { this.rect(x, y, 1, 1, color, alpha); }
}

export class CharacterArt {
  /** Da aggiungere alla vista del giocatore (posizionata ai suoi piedi). */
  readonly view = new Container();
  private readonly body = new Container();
  private readonly bodyG = new Graphics();
  private readonly ghostG = new Graphics();
  private readonly fxG = new Graphics();
  private readonly brush = new Brush();
  private readonly filter: Filter;
  private readonly colors;

  private lastTime = -1;
  private ghosts: Ghost[] = [];
  private ghostTimer = 0;
  private puffs: Puff[] = [];
  private puffTimer = 0;
  private blink = 0;
  private nextBlink = 2;
  /** Sciarpa di SOFFIO: catena di punti in coordinate mondo. */
  private readonly scarf: { x: number; y: number; px: number; py: number }[] = [];
  private scarfReady = false;

  constructor(readonly role: Role) {
    this.colors = ROLE_COLORS[role];
    this.view.label = `art-${role}`;
    this.ghostG.blendMode = 'add';
    this.body.addChild(this.bodyG);
    this.view.addChild(this.ghostG, this.fxG, this.body);
    this.brush.g = this.bodyG;

    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: OUTLINE_FRAG, name: 'char-outline' }),
      resources: {
        outlineUniforms: {
          uOutline: { value: new Float32Array(rgb01(PAL.ink)), type: 'vec3<f32>' },
          uRim: { value: new Float32Array(rgb01(0xd8e2ff)), type: 'vec3<f32>' },
          uTint: { value: new Float32Array(rgb01(this.colors.main)), type: 'vec3<f32>' },
          uFacing: { value: 1, type: 'f32' },
          uTintRim: { value: 0.45, type: 'f32' },
        },
      },
      padding: 2,
      resolution: 1,
      antialias: 'off',
    });
    this.body.filters = [this.filter];
  }

  update(s: CharacterState, time: number): void {
    const dt = this.lastTime < 0 ? 1 / 60 : clamp(time - this.lastTime, 0, 1 / 20);
    this.lastTime = time;
    const ix = Math.round(s.x), iy = Math.round(s.y);

    (this.filter.resources['outlineUniforms'] as { uniforms: Record<string, unknown> })
      .uniforms['uFacing'] = s.facing;

    // battito di ciglia (visiera / occhio che si spegne un istante)
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blink = 0.11; this.nextBlink = 2.5 + Math.random() * 3; }
    this.blink = Math.max(0, this.blink - dt);

    this.updateGhosts(s, dt, ix, iy);
    this.bodyG.clear();
    if (this.role === 'ghisa') this.drawGhisa(s, time, dt, ix, iy);
    else this.drawSoffio(s, time, dt, ix, iy);
    this.drawGhosts(ix, iy);
    this.registerLight(s, ix, iy);
  }

  /* --- posa comune ------------------------------------------------------ */

  private setupBrush(s: CharacterState, time: number): { bob: number; run: number; air: number } {
    const b = this.brush;
    const moving = s.onGround && Math.abs(s.vx) > 24;
    const run = moving ? s.runPhase * Math.PI : 0;
    const air = s.onGround ? 0 : clamp(s.vy / 340, -1, 1);
    // respiro a riposo, molleggio in corsa
    const breath = moving || !s.onGround ? 0 : Math.sin(time * 2.3) * 0.035;
    let sx = s.squash > 0 ? 2 - s.squash : 1;
    let sy = s.squash * (1 - air * 0.06) + breath;
    if (s.dashing) { sx *= 1.25; sy *= 0.84; }
    if (s.slamming) { sx *= 0.86; sy *= 1.14; }
    b.facing = s.facing;
    b.sx = clamp(sx, 0.6, 1.5);
    b.sy = clamp(sy, 0.55, 1.5);
    b.shear = s.dashing ? 0.28 : clamp(s.vx / 520, -0.22, 0.22) * s.facing * (s.onGround ? 1 : 0.6);
    b.ox = 0;
    b.oy = 0;
    const bob = moving ? Math.round(Math.abs(Math.sin(run)) * 1) : 0;
    return { bob, run, air };
  }

  /* --- GHISA -------------------------------------------------------------- */

  private drawGhisa(s: CharacterState, time: number, dt: number, ix: number, iy: number): void {
    const b = this.brush;
    const { bob, run, air } = this.setupBrush(s, time);
    const m = s.mass;
    const heat = clamp((m - 0.25) / 0.6, 0, 1);
    const heavy = m >= 0.6;

    const W = Math.round(lerp(9, 13, m));           // busto
    const H = Math.round(lerp(8, 7, m));
    const legH = Math.round(lerp(5, 3, m));
    const hw = Math.floor(W / 2);
    const top = -legH - H - bob;                    // sommità del busto
    const hot = mixColor(PAL.ember0, PAL.ember3, heat);
    const visor = this.blink > 0 ? PAL.night1 : mixColor(this.colors.dark, PAL.ember3, heat * 0.8);

    const iron = { hi: PAL.steel1, lit: PAL.steel0, mid: PAL.slate3, dark: PAL.slate2, deep: PAL.night2 };

    // gambe: in corsa si alternano, in aria si raccolgono
    const legSwing = Math.sin(run) * 2.2;
    const lift = (a: number): number => Math.max(0, Math.cos(a)) * 1.5;
    const tuck = s.onGround ? 0 : air < 0 ? 2 : 1;
    const backX = -hw + 1 - legSwing, frontX = hw - 3 + legSwing;
    b.rect(backX, -legH - lift(run + Math.PI) + tuck - bob * 0, 2, legH - tuck, iron.deep);
    b.rect(backX - 1, -1 - lift(run + Math.PI), 3, 1, PAL.ink);

    // braccio posteriore
    const armSwing = s.onGround ? Math.sin(run) * 1.5 : 0;
    const armsUp = s.slamming ? 1 : !s.onGround && air < -0.2 ? 0.5 : 0;
    b.rect(-hw - 2 + armSwing * 0.5, top + 2 - armsUp * 6, 2, 5, iron.dark);

    // sfiato sulla schiena (fuma da pesante)
    b.rect(-hw - 1, top - 4, 2, 4, iron.dark);
    b.px(-hw - 1, top - 4, iron.lit);

    // busto: blocco di ghisa con spigoli smussati
    b.rect(-hw, top, W, H, iron.mid);
    b.rect(-hw, top, 1, H, iron.lit);
    b.rect(-hw + W - 1, top, 1, H, iron.dark);
    b.rect(-hw, top + H - 1, W, 1, iron.dark);
    // cintura con fibbia d'ottone
    b.rect(-hw, top + H - 2, W, 1, iron.deep);
    b.px(0, top + H - 2, PAL.brass1);
    // griglia del forno sul petto: due feritoie che si arroventano
    const gx = Math.max(-hw + 2, hw - 5);
    b.rect(gx, top + 2, 3, 1, hot);
    b.rect(gx, top + 4, 3, 1, hot);
    b.rect(gx, top + 3, 3, 1, iron.deep);
    if (heat > 0.75) b.px(gx + 1, top + 2, 0xfff0d0);

    // elmo: secchio di ghisa con visiera a feritoia, staccato dal busto
    const hW = W - 3, hH = 6;
    const hx = -Math.floor(hW / 2) + 1;
    const hy = top - hH;
    b.rect(hx + 1, top - 1, hW - 2, 1, PAL.ink);
    b.rect(hx, hy + 1, hW, hH - 1, iron.lit);
    b.rect(hx + 1, hy, hW - 2, 1, iron.hi);
    b.rect(hx, hy + 1, 1, hH - 2, iron.hi);
    b.rect(hx + hW - 1, hy + 1, 1, hH - 1, iron.dark);
    // rivetti
    b.px(hx + 1, hy + hH - 2, iron.deep);
    // visiera
    const vw = Math.max(3, Math.round(hW * 0.45));
    b.rect(hx + hW - vw - 1, hy + 2, vw, 1, visor);
    b.rect(hx + hW - vw - 1, hy + 3, vw + 1, 1, iron.deep);

    // gamba anteriore
    b.rect(frontX, -legH - lift(run) + tuck, 2, legH - tuck, iron.dark);
    b.rect(frontX, -1 - lift(run), 3, 1, PAL.ink);

    // braccio anteriore: pesante, con pugno
    if (s.slamming) {
      // pugni uniti sopra la testa: il martello
      b.rect(-1, hy - 5, 4, 5, iron.lit);
      b.rect(-1, hy - 6, 4, 2, iron.hi);
    } else {
      const ay = top + 2 - armsUp * 6 - armSwing * 0.5;
      const ax = hw - 2 - armSwing * 0.6;
      // braccio staccato dal busto da un filo scuro, spallaccio sopra
      b.rect(ax - 1, ay, 1, 5, PAL.ink);
      b.rect(ax, ay, 3, 4, iron.dark);
      b.rect(ax, ay + 4, 3, 2, iron.hi);
      b.rect(ax - 1, ay - 2, 5, 3, iron.lit);
      b.rect(ax - 1, ay - 2, 5, 1, iron.hi);
      b.rect(ax + 3, ay - 1, 1, 2, iron.dark);
    }

    // fumo dallo sfiato e gocce di scintille: la ghisa rovente
    this.puffTimer -= dt;
    if (heavy && this.puffTimer <= 0) {
      this.puffTimer = lerp(0.5, 0.18, heat);
      const vxBack = -s.facing * 6;
      this.puffs.push({
        x: ix - s.facing * (hw + 1), y: iy + top - 5, vx: vxBack + (Math.random() - 0.5) * 4,
        vy: -14 - Math.random() * 8, age: 0, life: 0.9 + Math.random() * 0.5,
      });
    }
    this.drawPuffs(dt, ix, iy);
  }

  /* --- SOFFIO ------------------------------------------------------------- */

  private drawSoffio(s: CharacterState, time: number, dt: number, ix: number, iy: number): void {
    const b = this.brush;
    const { bob, run, air } = this.setupBrush(s, time);
    const m = s.mass;
    const light = clamp((0.75 - m) / 0.5, 0, 1);

    const legH = Math.round(lerp(5, 3, m));
    const cloakH = Math.round(lerp(8, 7, m));
    const topW = Math.round(lerp(4, 6, m));
    const hemW = Math.round(lerp(8, 11, m));
    const top = -legH - cloakH - bob;
    const cloth = { hi: PAL.bone, mid: PAL.fog, shade: PAL.steel0, deep: PAL.slate2 };
    const eye = this.blink > 0 ? PAL.steel0 : mixColor(this.colors.dark, PAL.air3, 0.4 + light * 0.6);

    // sciarpa (dietro a tutto): simulazione a catena
    this.simScarf(s, dt, ix, iy + top + 1, light);
    this.drawScarf(ix, iy);

    // gambe sottili
    const legSwing = Math.sin(run) * 2;
    const lift = (a: number): number => Math.max(0, Math.cos(a)) * 1.5;
    const tuck = s.onGround ? 0 : air < 0 ? 2 : 1;
    b.rect(-2 - legSwing, -legH - lift(run + Math.PI) + tuck, 1, legH - tuck, PAL.slate1);
    b.rect(-3 - legSwing, -1 - lift(run + Math.PI), 2, 1, PAL.ink);
    b.rect(1 + legSwing, -legH - lift(run) + tuck, 1, legH - tuck, PAL.slate2);
    b.rect(1 + legSwing, -1 - lift(run), 2, 1, PAL.ink);

    // mantello: stretto alle spalle, svasato e sfrangiato all'orlo;
    // in planata si apre ad ala
    const wings = s.gliding ? 1 : 0;
    for (let r = 0; r < cloakH; r++) {
      const t = r / Math.max(1, cloakH - 1);
      let w = Math.round(lerp(topW, hemW, t * t));
      let x0 = -Math.floor(w / 2) - (t > 0.5 ? 1 : 0);
      if (wings) {
        const span = Math.round(lerp(topW + 10, hemW, t));
        w = span; x0 = -Math.floor(span / 2);
      }
      const y = top + r;
      const last = r === cloakH - 1;
      b.rect(x0, y, w, 1, last ? cloth.shade : cloth.mid);
      b.px(x0 + w - 1, y, cloth.hi);
      if (w > 2) b.px(x0, y, cloth.shade);
      // orlo sfrangiato: frange alterne che ondeggiano
      if (last) {
        const wave = Math.floor(time * 6) % 2;
        for (let k = 0; k < w; k += 2) b.px(x0 + k + wave, y + 1, cloth.shade);
      }
    }
    // fascia diagonale nel colore del giocatore
    for (let k = 0; k < Math.min(4, cloakH - 2); k++) b.px(-1 + k, top + 1 + k, this.colors.dark);
    if (wings) {
      // mani che reggono i lembi del mantello
      b.px(-Math.floor((topW + 8) / 2) - 1, top, PAL.slate2);
      b.px(Math.floor((topW + 8) / 2), top, PAL.slate2);
    } else {
      const armSwing = s.onGround ? Math.sin(run) * 1.2 : air < -0.2 ? -2 : 1;
      b.rect(Math.floor(topW / 2), top + 1 + Math.round(armSwing * 0.5), 1, 4, PAL.slate2);
    }

    // testa: maschera di porcellana con un solo occhio, dentro un cappuccio
    const hx = -3, hy = top - 6;
    // cappuccio scuro con la punta all'indietro
    b.rect(hx - 1, hy - 1, 6, 1, PAL.slate1);
    b.rect(hx - 2, hy, 3, 5, PAL.slate1);
    b.px(hx - 3, hy, PAL.slate1);
    b.px(hx - 4, hy - 1, PAL.slate2);
    b.rect(hx - 1, hy + 5, 4, 1, PAL.slate1);
    // maschera
    b.rect(hx + 1, hy, 5, 1, cloth.hi);
    b.rect(hx + 1, hy + 1, 6, 4, cloth.hi);
    b.rect(hx + 6, hy + 1, 1, 4, cloth.mid);
    b.rect(hx + 2, hy + 5, 4, 1, cloth.mid);
    // occhio
    b.rect(hx + 4, hy + 2, 2, 1, eye);
    if (light > 0.6 && this.blink <= 0) b.px(hx + 5, hy + 2, 0xffffff);
    // fessura della bocca
    b.px(hx + 5, hy + 4, cloth.shade);
  }

  private simScarf(s: CharacterState, dt: number, ax: number, ay: number, light: number): void {
    const n = Math.round(lerp(4, 10, light));
    const seg = 2;
    while (this.scarf.length < n) {
      const last = this.scarf[this.scarf.length - 1];
      const x = last ? last.x - s.facing * seg : ax, y = last ? last.y : ay;
      this.scarf.push({ x, y, px: x, py: y });
    }
    this.scarf.length = n;
    if (!this.scarfReady) {
      this.scarf.forEach((p, i) => { p.x = p.px = ax - s.facing * seg * i; p.y = p.py = ay; });
      this.scarfReady = true;
    }
    const h = Math.max(dt, 1 / 240) / 2;
    // leggero = galleggia e ondeggia all'indietro; pesante = pende
    const g = lerp(480, 70, light);
    const trail = -s.facing * (20 + Math.abs(s.vx) * 1.6) * (0.5 + light);
    for (let step = 0; step < 2; step++) {
      for (let i = 1; i < n; i++) {
        const p = this.scarf[i]!;
        const vx = (p.x - p.px) * 0.96;
        const vy = (p.y - p.py) * 0.96;
        p.px = p.x; p.py = p.y;
        // onda che corre lungo la sciarpa, più ampia verso la punta
        const flutter = Math.sin(this.lastTime * 6.5 - i * 0.9) * 340 * (0.3 + light) * (i / n);
        p.x += vx + trail * h * h;
        p.y += vy + (g + flutter) * h * h;
      }
      const a = this.scarf[0]!;
      a.x = a.px = ax - s.facing; a.y = a.py = ay;
      for (let k = 0; k < 3; k++) {
        for (let i = 1; i < n; i++) {
          const p = this.scarf[i - 1]!, q = this.scarf[i]!;
          const dx = q.x - p.x, dy = q.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const corr = (d - seg) / d;
          q.x -= dx * corr; q.y -= dy * corr;
        }
      }
    }
    if (s.dashing) {
      // nello scatto la sciarpa schiocca dritta all'indietro
      this.scarf.forEach((p, i) => { p.x = ax - s.facing * seg * i * 1.2; p.y = ay + i * 0.2; p.px = p.x; p.py = p.y; });
    }
  }

  private drawScarf(ix: number, iy: number): void {
    const g = this.bodyG;
    const n = this.scarf.length;
    for (let i = 0; i < n; i++) {
      const p = this.scarf[i]!;
      const x = Math.round(p.x) - ix, y = Math.round(p.y) - iy;
      const tip = i >= n - 2;
      g.rect(x, y, 2, 1).fill({ color: tip ? this.colors.light : this.colors.main });
      g.rect(x, y + 1, 2, 1).fill({ color: this.colors.dark });
    }
  }

  /* --- effetti propri ---------------------------------------------------- */

  private drawPuffs(dt: number, ix: number, iy: number): void {
    const g = this.fxG.clear();
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.age += dt;
      if (p.age >= p.life) { this.puffs.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.98;
      const k = p.age / p.life;
      const r = 1 + Math.floor(k * 2.5);
      g.rect(Math.round(p.x) - ix - Math.floor(r / 2), Math.round(p.y) - iy - Math.floor(r / 2), r, r)
        .fill({ color: k < 0.15 ? PAL.ember1 : PAL.slate2, alpha: (1 - k) * 0.7 });
    }
  }

  private updateGhosts(s: CharacterState, dt: number, ix: number, iy: number): void {
    for (const gh of this.ghosts) gh.age += dt;
    this.ghosts = this.ghosts.filter((gh) => gh.age < 0.26);
    const trail = this.role === 'soffio' ? s.dashing : s.slamming;
    this.ghostTimer -= dt;
    if (trail && this.ghostTimer <= 0) {
      this.ghostTimer = 0.03;
      this.ghosts.push({ x: ix, y: iy, facing: s.facing, age: 0, sx: this.brush.sx, sy: this.brush.sy });
    }
  }

  /** Scie: sagome nel colore del giocatore, in somma additiva, che svaniscono. */
  private drawGhosts(ix: number, iy: number): void {
    const g = this.ghostG.clear();
    for (const gh of this.ghosts) {
      const k = gh.age / 0.26;
      const a = (1 - k) * 0.42;
      const ox = gh.x - ix, oy = gh.y - iy;
      const col = this.colors.main;
      if (this.role === 'ghisa') {
        // picchiata: sagoma appena accennata e strie verticali (motion smear)
        const h = Math.round(16 * gh.sy);
        g.rect(ox - 4, oy - h, 9, h - 3).fill({ color: col, alpha: a * 0.3 });
        g.rect(ox - 4, oy - h - 4, 1, h).fill({ color: this.colors.light, alpha: a * 0.8 });
        g.rect(ox + 4, oy - h - 2, 1, h - 2).fill({ color: this.colors.light, alpha: a * 0.8 });
        g.rect(ox, oy - h - 6, 1, 6).fill({ color: this.colors.light, alpha: a });
      } else {
        const w = Math.round(9 * gh.sx);
        g.rect(ox - Math.floor(w / 2), oy - 12, w, 9).fill({ color: col, alpha: a * 0.8 });
        g.rect(ox - 3, oy - 17, 6, 5).fill({ color: col, alpha: a * 0.6 });
      }
    }
  }

  /** Ognuno si porta dietro la propria luce: lo si ritrova al buio e a schermo diviso. */
  private registerLight(s: CharacterState, ix: number, iy: number): void {
    const m = s.mass;
    if (this.role === 'ghisa') {
      const heat = clamp((m - 0.25) / 0.6, 0, 1);
      sceneLights.put(ix, iy - 9, 70 + heat * 34, this.colors.glow, 0.75 + heat * 0.4);
    } else {
      const light = clamp((0.75 - m) / 0.5, 0, 1);
      sceneLights.put(ix, iy - 10, 72 + light * 26, this.colors.glow, 0.75 + light * 0.3);
    }
    // luce di riempimento neutra, piccola: la sagoma resta leggibile
    sceneLights.put(ix, iy - 8, 34, 0xdfe6ff, 0.5);
  }
}
