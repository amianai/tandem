import { Container, RenderTexture, Sprite, type Renderer, type Texture } from 'pixi.js';
import { ChordDetector, Keyboard, P1_BINDING, P2_BINDING, PlayerInput } from '../core/input';
import { rectsOverlap, type Rect } from '../core/math';
import { CHARS, TILE, TILES, type Sheets } from '../render/assets';
import { Background } from '../render/background';
import { Follower, Shake } from '../render/camera';
import { Particles } from '../render/particles';
import { RenderPipeline } from '../render/pipeline';
import { SplitScreen } from '../render/splitScreen';
import { ELEMENT_COLORS, P1_COLOR, P2_COLOR } from '../render/theme';
import { DebugOverlay } from '../ui/debug';
import { Hud } from '../ui/hud';
import {
  FragileFloor, Gate, HeavyPlate, horizontalRuns, toTile, Updraft, type Weight,
} from './elements';
import { MassSystem } from './mass';
import { Ballast, Bellows, Crate } from './objects';
import { Physics } from './physics';
import { Pickups } from './pickups';
import { Player } from './player';
import { buildTileLayer, Tilemap, type LevelSource } from './tilemap';

const GATE_COLOR = ELEMENT_COLORS.signalOn;

/** Distanza (px) entro cui si riprende un oggetto posato. */
const PICKUP_RANGE_X = 22;
const PICKUP_RANGE_Y = 20;
/** Distanza entro cui compare il suggerimento di una stazione. */
const HINT_RANGE = 10 * TILE;

export class Game {
  readonly stage = new Container();
  private readonly world = new Container();

  private readonly keyboard = new Keyboard();
  private readonly input1: PlayerInput;
  private readonly input2: PlayerInput;
  private readonly chord: ChordDetector;

  private readonly map: Tilemap;
  private readonly physics: Physics;
  private readonly background: Background;
  private readonly particles = new Particles();
  private readonly players: [Player, Player];
  private readonly followers: [Follower, Follower] = [new Follower(), new Follower()];
  private readonly shake = new Shake();
  private readonly split: SplitScreen;
  private readonly gfx: RenderPipeline;
  private readonly hud: Hud;
  private readonly debug = new DebugOverlay();
  private readonly pickups: Pickups;
  private readonly sparkTexture: Texture;
  private readonly dustTexture: Texture;

  private readonly mass = new MassSystem();
  private readonly ballast = new Ballast();
  private readonly bellows = new Bellows();
  private readonly crates: { crate: Crate; spawn: { x: number; y: number } }[] = [];
  private readonly plates: { plate: HeavyPlate; gate: string }[] = [];
  private readonly gates = new Map<string, Gate>();
  private readonly fragile: FragileFloor | null;
  private readonly updraft: Updraft | null;
  private readonly goal: Rect | null;
  private readonly hints: { x: number; y: number; text: string }[] = [];

  /** Messaggio breve (rifiuti, conferme): ha la precedenza sui suggerimenti. */
  private flash: { text: string; until: number } | null = null;
  private time = 0;
  private finished = false;
  private readonly detachInput: () => void;

  constructor(
    renderer: Renderer,
    sheets: Sheets,
    private readonly viewWidth: number,
    private readonly viewHeight: number,
    readonly level: LevelSource,
  ) {
    this.sparkTexture = sheets.particles['star_08']!;
    this.dustTexture = sheets.particles['smoke_08']!;

    this.input1 = new PlayerInput(this.keyboard, P1_BINDING);
    this.input2 = new PlayerInput(this.keyboard, P2_BINDING);
    this.chord = new ChordDetector(this.input1, this.input2);
    this.detachInput = this.keyboard.install();

    this.map = new Tilemap(level);
    this.physics = new Physics(this.map);
    this.background = new Background(this.map.pixelWidth, this.map.pixelHeight);

    /* --- elementi del livello ----------------------------------------- */
    const tilesOf = (ch: string) => (this.map.markers.get(ch) ?? []).map(toTile);
    const links = level.links ?? {};

    for (const gateChar of new Set(Object.values(links))) {
      const tiles = tilesOf(gateChar);
      if (tiles.length) {
        const latch = (level.latching ?? '').includes(gateChar);
        this.gates.set(gateChar, new Gate(this.map, tiles, GATE_COLOR, latch));
      }
    }
    for (const [plateChar, gateChar] of Object.entries(links)) {
      for (const run of horizontalRuns(tilesOf(plateChar))) {
        this.plates.push({ plate: new HeavyPlate(run, GATE_COLOR), gate: gateChar });
      }
    }

    const xTiles = tilesOf('X');
    this.fragile = xTiles.length ? new FragileFloor(this.map, xTiles) : null;
    const uTiles = tilesOf('U');
    this.updraft = uTiles.length ? new Updraft(uTiles, 0x9bd2ff) : null;

    const flag = this.map.markers.get('F')?.[0];
    this.goal = flag ? { x: flag.x - 10, y: flag.y - 22, w: 20, h: 22 } : null;

    for (const [ch, text] of Object.entries(level.hints ?? {})) {
      for (const p of this.map.markers.get(ch) ?? []) this.hints.push({ x: p.x, y: p.y, text });
    }

    /* --- terreno ------------------------------------------------------ */
    // Cancelli e solaio fragile si disegnano da soli e possono sparire:
    // se finissero anche nel terreno cotto resterebbero visibili da aperti.
    const dynamicTiles = new Set(
      [...Object.values(links).flatMap((c) => tilesOf(c)), ...xTiles].map((t) => `${t.tx},${t.ty}`),
    );
    const tileLayer = buildTileLayer(this.map, sheets, dynamicTiles);
    const baked = RenderTexture.create({
      width: this.map.pixelWidth, height: this.map.pixelHeight, resolution: 1,
    });
    renderer.render({ container: tileLayer, target: baked, clear: true });
    tileLayer.destroy({ children: true });
    const terrain = new Sprite(baked);
    terrain.label = 'terrain';

    this.pickups = new Pickups(this.map.markers.get('*') ?? [], sheets.terrain[TILES.gem]!);

    for (const p of this.map.markers.get('C') ?? []) {
      const crate = new Crate();
      crate.placeAt(p.x, p.y);
      this.physics.add(crate);
      this.crates.push({ crate, spawn: { x: p.x, y: p.y } });
    }

    const framesFor = (idx: readonly number[]) => idx.map((i) => sheets.characters[i]!);
    this.players = [
      new Player(0, 'ghisa', this.input1, framesFor(CHARS.green), P1_COLOR),
      new Player(1, 'soffio', this.input2, framesFor(CHARS.pink), P2_COLOR),
    ];

    const s1 = this.map.spawns[0] ?? { x: 4 * TILE, y: 20 * TILE };
    const s2 = this.map.spawns[1] ?? { x: 7 * TILE, y: 20 * TILE };
    this.players[0].placeAt(s1.x, s1.y, true);
    this.players[1].placeAt(s2.x, s2.y, true);
    this.followers[0].snap(this.players[0].focusX, this.players[0].focusY);
    this.followers[1].snap(this.players[1].focusX, this.players[1].focusY);

    this.world.addChild(this.background.container, terrain);
    if (this.updraft) this.world.addChild(this.updraft.container);
    for (const g of this.gates.values()) this.world.addChild(g.container);
    if (this.fragile) this.world.addChild(this.fragile.container);
    for (const { plate } of this.plates) this.world.addChild(plate.container);
    this.world.addChild(this.pickups.container);
    for (const { crate } of this.crates) this.world.addChild(crate.view);
    this.world.addChild(
      this.bellows.view,
      this.players[0].view,
      this.players[1].view,
      // la Zavorra in spalla va sopra GHISA
      this.ballast.view,
      this.particles.container,
    );

    /* --- schermo ------------------------------------------------------ */
    this.split = new SplitScreen(viewWidth, viewHeight, 1);
    this.hud = new Hud(viewWidth, viewHeight, level.name, this.hudInfo());
    this.debug.container.position.set(viewWidth - 250, 12);
    this.stage.addChild(this.split.root, this.hud.container, this.debug.container);
    // Pipeline grafica: luci, effetti, scenografia, post-processing.
    this.gfx = new RenderPipeline({
      renderer, world: this.world, stage: this.stage, split: this.split,
      background: this.background, particles: this.particles, map: this.map,
      viewW: this.viewWidth, viewH: this.viewHeight,
    });

    this.split.snap(
      { x: this.players[0].focusX, y: this.players[0].focusY },
      { x: this.players[1].focusX, y: this.players[1].focusY },
      { w: this.map.pixelWidth, h: this.map.pixelHeight },
    );
    this.hud.setGems(0, this.pickups.total);
    this.carryObjects();

    window.addEventListener('keydown', this.onSystemKey);
  }

  private hudInfo() {
    return [
      { name: 'GHISA', color: P1_COLOR, keys: ['W', 'A', 'S', 'D', 'Q', 'E'] },
      { name: 'SOFFIO', color: P2_COLOR, keys: ['↑', '←', '↓', '→', '.', '-'] },
    ];
  }

  private onSystemKey = (e: KeyboardEvent): void => {
    if (e.code === 'F1') { e.preventDefault(); this.debug.toggle(); }
    if (e.code === 'KeyR' && e.shiftKey) {
      for (const p of this.players) p.respawn(this.particles, this.sparkTexture);
    }
  };

  private say(text: string, seconds = 1.8): void {
    this.flash = { text, until: this.time + seconds };
  }

  /* ------------------------------------------------------------------ */

  fixedUpdate(dt: number): void {
    this.keyboard.advance(dt);
    this.time += dt;

    // 1. la Bilancia decide chi è pesante e chi è leggero
    if (this.mass.update(dt, this.input1, this.input2, this.chord)) {
      this.shake.add(0.3);
      for (const p of this.players) this.burst(p.x, p.y - 8, p.tint, 18);
    }
    this.players[0].mass = this.mass.m1;
    this.players[1].mass = this.mass.m2;

    // 2. le correnti agiscono prima del passo fisico
    let liftedTooHeavy = false;
    if (this.updraft) {
      for (const p of this.players) {
        if (this.updraft.apply(p, dt) && !p.isLight) liftedTooHeavy = true;
      }
    }

    // 3. personaggi
    this.physics.actors = this.players.map((p) => p.hitbox);
    const onBellows = this.players.map((p) =>
      this.bellows.state === 'placed' && this.physics.standsOn(p.hitbox, this.bellows));
    const fx = { dust: this.dustTexture, spark: this.sparkTexture };
    const impacts: { x: number; y: number }[] = [];

    this.players.forEach((p, i) => {
      p.update(dt, this.physics, this.particles, fx);
      this.physics.actors[i] = p.hitbox;
      this.handleEvents(p, onBellows[i]!);

      const impact = p.takeImpact();
      if (impact) {
        impacts.push(impact);
        this.shake.add(0.35 + impact.power * 0.3);
        const broken = this.fragile?.shatter(
          impact.x, impact.y + 8, 42, this.particles, this.sparkTexture,
        ) ?? 0;
        if (broken > 0) this.shake.add(0.25);
        for (const { crate } of this.crates) {
          const d = Math.abs(crate.x - impact.x);
          if (d < 64 && Math.abs(crate.y - impact.y) < 24) crate.shove(impact.x, 1 - d / 64);
        }
      }
      if (p.y > this.map.pixelHeight + 48) {
        p.respawn(this.particles, this.sparkTexture);
        this.shake.add(0.2);
      }
    });

    // 4. corpi
    for (const { crate, spawn } of this.crates) {
      crate.update(dt, this.physics);
      if (crate.y > this.map.pixelHeight + 48) crate.placeAt(spawn.x, spawn.y);
    }
    this.ballast.update(dt, this.physics);
    if (this.ballast.state === 'placed' && this.ballast.y > this.map.pixelHeight + 48) {
      this.pickUpBallast();
      this.say('LA ZAVORRA È CADUTA: TORNA A GHISA');
    }
    this.bellows.update(dt, this.physics);
    if (this.bellows.state === 'placed' && this.bellows.y > this.map.pixelHeight + 48) {
      this.bellows.startRecall();
      this.physics.remove(this.bellows);
    }
    if (this.bellows.state === 'recalling') {
      const s = this.players[1];
      if (this.bellows.updateRecall(dt, s.x, s.y - 3)) this.bellows.state = 'carried';
    }
    this.carryObjects();

    // 5. piastre e cancelli: conta il peso totale appoggiato
    const weights: Weight[] = [
      ...this.players.map((p) => ({ box: p.hitbox, mass: p.mass })),
      ...this.crates.map(({ crate }) => ({ box: crate.box, mass: crate.mass })),
    ];
    if (this.ballast.state === 'placed') weights.push({ box: this.ballast.box, mass: this.ballast.mass });

    let needsMass = false;
    const open = new Map<string, boolean>();
    for (const { plate, gate } of this.plates) {
      if (plate.update(dt, weights)) open.set(gate, true);
      if (plate.needsMoreMass) needsMass = true;
    }
    for (const [ch, gate] of this.gates) gate.update(dt, open.get(ch) ?? false);
    this.fragile?.update(dt, impacts);

    // 6. raccolta e traguardo
    const boxes: Rect[] = this.players.map((p) => p.hitbox);
    if (this.pickups.update(dt, boxes, this.particles, this.sparkTexture) > 0) {
      this.hud.setGems(this.pickups.collected, this.pickups.total);
      this.shake.add(0.05);
    }
    if (!this.finished && this.goal && boxes.every((b) => rectsOverlap(b, this.goal!))) {
      this.finished = true;
      this.shake.add(0.5);
      for (const p of this.players) this.burst(p.x, p.y - 10, p.tint, 40);
    }

    this.updatePrompt(needsMass, liftedTooHeavy);
    this.particles.update(dt);
  }

  /* --- eventi dei personaggi ----------------------------------------- */

  private handleEvents(p: Player, wasOnBellows: boolean): void {
    for (const e of p.events.splice(0)) {
      switch (e.type) {
        case 'jumped':
          // Saltare da un Mantice carico: lancio con tutta l'energia.
          if (wasOnBellows && this.bellows.charge > 0.05) {
            const h = this.bellows.release(p.mass);
            p.launch(h);
            this.shake.add(0.3);
            this.burst(this.bellows.x, this.bellows.y - 6, P2_COLOR, 26);
          }
          break;
        case 'landed':
          if (this.bellows.state === 'placed' && this.physics.standsOn(p.hitbox, this.bellows)) {
            const added = this.bellows.absorb(p.mass, e.vy, e.slam);
            if (added > 0.05) {
              this.burst(this.bellows.x, this.bellows.y - 6, P2_COLOR, Math.round(8 + added * 24));
              if (this.bellows.charge >= 0.95) this.say('MANTICE CARICO: CHI È LEGGERO CI SALTI SOPRA');
            }
          }
          break;
        case 'object':
          if (p.role === 'ghisa') this.useBallast(p); else this.useBellows(p);
          break;
        case 'denied':
          this.say(e.need === 'heavy'
            ? 'SCHIANTO: GHISA DEVE ESSERE PESANTE'
            : 'SCATTO: SOFFIO DEVE ESSERE LEGGERO');
          this.burst(p.x, p.y - 10, 0x8b93a8, 6);
          break;
      }
    }
  }

  /* --- oggetti -------------------------------------------------------- */

  private useBallast(p: Player): void {
    const b = this.ballast;
    if (b.state === 'carried') {
      const spot = this.findSpot(p, b.w, b.h);
      if (!spot) { this.say('NON C’È SPAZIO PER POSARE LA ZAVORRA'); return; }
      b.state = 'placed';
      b.placeAt(spot.x, spot.y);
      b.mass = this.mass.depositBallast();
      b.dropped();
      this.physics.add(b);
      this.shake.add(0.12 + b.mass * 0.3);
      this.burst(spot.x, spot.y - 4, P1_COLOR, 14);
      if (b.mass < 0.05) this.say('ZAVORRA VUOTA: GHISA ERA GIÀ LEGGERO');
      return;
    }
    if (this.near(p, b)) { this.pickUpBallast(); return; }
    this.say('LA ZAVORRA PESA TROPPO PER RICHIAMARLA:\nTORNA A PRENDERLA');
  }

  private pickUpBallast(): void {
    this.physics.remove(this.ballast);
    this.mass.withdrawBallast();
    this.ballast.state = 'carried';
    this.ballast.mass = 0;
    this.carryObjects();
  }

  private useBellows(p: Player): void {
    const m = this.bellows;
    if (m.state === 'recalling') return;
    if (m.state === 'carried') {
      const spot = this.findSpot(p, m.w, m.h);
      if (!spot) { this.say('NON C’È SPAZIO PER POSARE IL MANTICE'); return; }
      m.state = 'placed';
      m.placeAt(spot.x, spot.y);
      m.charge = 0;
      this.physics.add(m);
      this.burst(spot.x, spot.y - 4, P2_COLOR, 10);
      return;
    }
    this.physics.remove(m);
    if (this.near(p, m)) {
      m.state = 'carried';
      m.charge = 0;
      this.carryObjects();
    } else {
      // È leggero: SOFFIO lo richiama da qualsiasi distanza, ma perde la carica.
      m.startRecall();
    }
  }

  private near(p: Player, o: { x: number; y: number }): boolean {
    return Math.abs(p.x - o.x) <= PICKUP_RANGE_X && Math.abs(p.y - o.y) <= PICKUP_RANGE_Y;
  }

  /** Davanti al personaggio se c'è posto, altrimenti dietro. */
  private findSpot(p: Player, w: number, h: number): { x: number; y: number } | null {
    const facing = p.facingDir;
    for (const dir of [facing, -facing]) {
      const x = Math.round(p.x + dir * (6 + w / 2 + 1));
      const box: Rect = { x: x - w / 2, y: p.y - h, w, h };
      // deve poggiare su qualcosa, non restare sospeso sul vuoto
      const below: Rect = { x: box.x, y: p.y, w, h: 2 };
      if (this.physics.isFree(box) && this.physics.overlapsSolid(below)) return { x, y: p.y };
    }
    return null;
  }

  /** Gli oggetti trasportati seguono chi li porta. */
  private carryObjects(): void {
    const [g, s] = this.players;
    if (this.ballast.state === 'carried') this.ballast.carryAt(g.x, g.y, g.facingDir);
    if (this.bellows.state === 'carried') this.bellows.carryAt(s.x, s.y, s.facingDir);
  }

  private burst(x: number, y: number, tint: number, count: number): void {
    this.particles.emit({
      texture: this.sparkTexture, x, y, count,
      speed: [50, 200], life: [0.25, 0.6], scale: [0.08, 0.2],
      tint, additive: true, drag: 3,
    });
  }

  /* --- messaggi ------------------------------------------------------- */

  private updatePrompt(needsMass: boolean, liftedTooHeavy: boolean): void {
    if (this.flash && this.time > this.flash.until) this.flash = null;

    let text: string | null = null;
    if (this.finished) text = 'INSIEME. FINE DEL LIVELLO.';
    else if (this.flash) text = this.flash.text;
    else if (needsMass) text = 'PESO INSUFFICIENTE SULLA PIASTRA';
    else if (liftedTooHeavy) text = 'TROPPO PESANTE PER LA CORRENTE';
    else text = this.nearestHint();

    if (text) this.hud.showPrompt(text); else this.hud.hidePrompt();

    const b = this.ballast;
    this.hud.setObjectStatus(0, b.state === 'carried'
      ? 'ZAVORRA IN SPALLA'
      : `ZAVORRA POSATA  ${Math.round(b.mass * 100)}%`);
    const m = this.bellows;
    this.hud.setObjectStatus(1, m.state === 'carried'
      ? 'MANTICE IN MANO'
      : m.state === 'recalling' ? 'MANTICE IN VOLO'
        : `MANTICE POSATO  CARICA ${Math.round(m.charge * 100)}%`);
  }

  private nearestHint(): string | null {
    let best: string | null = null;
    let bestD = HINT_RANGE;
    for (const h of this.hints) {
      for (const p of this.players) {
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (d < bestD) { bestD = d; best = h.text; }
      }
    }
    return best;
  }

  /* --- disegno -------------------------------------------------------- */

  render(alpha: number, frameDelta: number, fps: number): void {
    for (const p of this.players) p.draw(alpha, this.time);
    for (const { plate } of this.plates) plate.draw(this.time);
    for (const g of this.gates.values()) g.draw(this.time);
    this.fragile?.draw(this.time);
    this.updraft?.draw(this.time, this.particles, this.sparkTexture, frameDelta);
    for (const { crate } of this.crates) crate.draw(alpha);
    this.ballast.draw(alpha, this.time);
    this.bellows.draw(alpha, this.time);

    this.hud.setMass(
      frameDelta, this.mass.m1, this.mass.ballast, this.mass.m2,
      MassSystem.HEAVY, MassSystem.LIGHT, this.mass.invertFlash,
    );
    this.hud.update(frameDelta);
    this.shake.update(frameDelta, this.time);

    const bounds = { w: this.map.pixelWidth, h: this.map.pixelHeight };
    this.followers.forEach((f, i) => {
      const p = this.players[i]!;
      f.update(frameDelta, p.focusX, p.focusY, p.vx, p.vy);
    });

    this.split.update(
      frameDelta,
      { x: this.followers[0].x, y: this.followers[0].y },
      { x: this.followers[1].x, y: this.followers[1].y },
      bounds,
    );

    const dx = this.players[0].x - this.players[1].x;
    const dy = this.players[0].y - this.players[1].y;
    this.debug.update({
      fps,
      splitT: this.split.t,
      distance: Math.hypot(dx, dy),
      camZoom: this.split.camA.zoom,
      players: this.players.map((p) => ({ vx: p.vx, vy: p.vy, onGround: p.onGround })),
      heldKeys: this.keyboard.heldCount,
      mass: this.mass.m2,
    });
  }

  present(renderer: Renderer): void {
    this.gfx.present(renderer, {
      time: this.time, players: this.players, shake: this.shake,
      invertFlash: this.mass.invertFlash, finished: this.finished, goal: this.goal,
    });
  }

  /** Solo in sviluppo: comandi rapidi dalla console del browser. */
  devHandle() {
    return {
      game: this as unknown as Record<string, unknown>,
      teleport: (who: 0 | 1, x: number, y: number): void => { this.players[who].placeAt(x, y); },
      /** Imposta le masse dei due giocatori (la Zavorra resta com'è). */
      setMass: (m1: number): void => {
        const pool = 1 - this.mass.ballast;
        this.mass.m1 = Math.min(Math.max(m1, MassSystem.MIN), pool - MassSystem.MIN);
        this.mass.m2 = pool - this.mass.m1;
      },
      players: this.players,
      mass: this.mass,
      physics: this.physics,
      ballast: this.ballast,
      bellows: this.bellows,
      crates: this.crates.map((c) => c.crate),
      split: this.split,
      map: this.map,
    };
  }

  destroy(): void {
    this.detachInput();
    window.removeEventListener('keydown', this.onSystemKey);
  }
}
