import { Container, Graphics, RenderTexture, Sprite, type Renderer, type Texture } from 'pixi.js';
import { ChordDetector, Keyboard, P1_BINDING, P2_BINDING, PlayerInput } from '../core/input';
import { rectsOverlap, type Rect } from '../core/math';
import { CHARS, TILE, TILES, type Sheets } from '../render/assets';
import { Background } from '../render/background';
import { Follower, Shake } from '../render/camera';
import { fxBus } from '../render/fx';
import { Particles } from '../render/particles';
import { RenderPipeline } from '../render/pipeline';
import { SplitScreen } from '../render/splitScreen';
import { ELEMENT_COLORS, P1_COLOR, P2_COLOR, PAL, ROLE_COLORS } from '../render/theme';
import { DebugOverlay } from '../ui/debug';
import { Hud } from '../ui/hud';
import { Spirit } from './death';
import {
  FragileFloor, Gate, HeavyPlate, horizontalRuns, toTile, Updraft, type Weight,
} from './elements';
import { EmberSystem, type Cone, type Explosion } from './embers';
import { Crawler } from './enemies';
import { Brazier, Forge, Hammer, HAMMER_FAST, HAMMER_SLOW, Sheet, SlagPool, SlagWall, Vent } from './hazards';
import { MassSystem } from './mass';
import { Crate } from './objects';
import { Physics } from './physics';
import { Pickups } from './pickups';
import { Player } from './player';
import { buildTileLayer, Tilemap, type LevelSource } from './tilemap';

const GATE_COLOR = ELEMENT_COLORS.signalOn;
/** Distanza entro cui compare il suggerimento di una stazione. */
const HINT_RANGE = 10 * TILE;
/** Distanza spirito-compagno entro cui l'accordo fa rinascere. */
const REVIVE_RANGE = 32;
/** Portata della rinascita col gadget (soffio sul Tizzone). */
const GADGET_REVIVE_RANGE = 5 * TILE;
const DEATH_HITSTOP = 0.08;
const LOSS_FADE = 0.8;
/** Spinta massima di uno scoppio, moltiplicata per (1 - massa). */
const BLAST_SPEED = 640;

type Point = { x: number; y: number };

export class Game {
  readonly stage = new Container();
  private readonly world = new Container();

  private readonly keyboard = new Keyboard();
  private readonly inputs: [PlayerInput, PlayerInput];
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
  private readonly embers = new EmberSystem();
  private readonly reserveGfx = new Graphics();
  private readonly crates: { crate: Crate; spawn: Point }[] = [];
  private readonly plates: { plate: HeavyPlate; gate: string }[] = [];
  private readonly braziers: { brazier: Brazier; gate: string }[] = [];
  private readonly gates = new Map<string, Gate>();
  private readonly fragile: FragileFloor | null;
  private readonly slagWall: SlagWall | null;
  private readonly slag: SlagPool[] = [];
  private readonly vents: Vent[] = [];
  private readonly sheets: Sheet[] = [];
  private readonly forges: Forge[] = [];
  private readonly hammers = new Map<string, Hammer>();
  private readonly crawlers: Crawler[] = [];
  /** Istante (tempo di gioco) in cui entrambi hanno toccato la bandiera. */
  finishedAt = -1;
  private readonly updraft: Updraft | null;
  private readonly goal: Rect | null;
  private readonly hints: { x: number; y: number; text: string }[] = [];

  /* --- morte ---------------------------------------------------------- */
  private readonly spirits: [Spirit, Spirit] = [new Spirit('ghisa'), new Spirit('soffio')];
  private readonly alive: [boolean, boolean] = [true, true];
  private readonly invuln: [number, number] = [0, 0];
  private readonly lastSafe: [Point, Point];
  private readonly checkpoint: [Point, Point];
  private hitstop = 0;
  /** < 0 = nessuna; altrimenti secondi dall'inizio della dissolvenza "colata persa". */
  private loss = -1;
  private lossOut = 0;
  private deaths = 0;
  private perfectRevives = 0;

  /** Messaggio breve: ha la precedenza sui suggerimenti. */
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

    this.inputs = [new PlayerInput(this.keyboard, P1_BINDING), new PlayerInput(this.keyboard, P2_BINDING)];
    this.chord = new ChordDetector(this.inputs[0], this.inputs[1]);
    this.detachInput = this.keyboard.install();

    this.map = new Tilemap(level);
    this.physics = new Physics(this.map);
    this.background = new Background(this.map.pixelWidth, this.map.pixelHeight);

    /* --- elementi del livello ----------------------------------------- */
    const tilesOf = (ch: string) => (this.map.markers.get(ch) ?? []).map(toTile);
    const links = level.links ?? {};
    const brazierChars = level.braziers ?? '';

    let hammerIndex = 0;
    for (const [ch, pace] of Object.entries(level.hammers ?? {})) {
      const tiles = tilesOf(ch);
      if (tiles.length) {
        this.hammers.set(ch, new Hammer(this.map, tiles, pace === 'fast' ? HAMMER_FAST : HAMMER_SLOW, hammerIndex++ * 0.37));
      }
    }
    for (const m of this.map.markers.get('Z') ?? []) this.crawlers.push(new Crawler(m.x, m.y));

    for (const gateChar of new Set(Object.values(links))) {
      if (this.hammers.has(gateChar)) continue;
      const tiles = tilesOf(gateChar);
      if (tiles.length) {
        const latch = (level.latching ?? '').includes(gateChar);
        this.gates.set(gateChar, new Gate(this.map, tiles, GATE_COLOR, latch));
      }
    }
    for (const [ch, gateChar] of Object.entries(links)) {
      if (brazierChars.includes(ch)) {
        for (const m of this.map.markers.get(ch) ?? []) {
          this.braziers.push({ brazier: new Brazier(m.x, m.y), gate: gateChar });
        }
      } else {
        for (const run of horizontalRuns(tilesOf(ch))) {
          this.plates.push({ plate: new HeavyPlate(run, GATE_COLOR), gate: gateChar });
        }
      }
    }

    const xTiles = tilesOf('X');
    this.fragile = xTiles.length ? new FragileFloor(this.map, xTiles) : null;
    const lTiles = tilesOf('L');
    this.slagWall = lTiles.length ? new SlagWall(this.map, lTiles) : null;
    const tTiles = tilesOf('T');
    for (const run of horizontalRuns(tTiles)) this.sheets.push(new Sheet(this.map, run));
    for (const run of horizontalRuns(tilesOf('~'))) this.slag.push(new SlagPool(run, this.map.pixelHeight));
    let ventIndex = 0;
    for (const [ch, dir] of [['<', -1], ['>', 1]] as const) {
      for (const t of tilesOf(ch)) {
        const ox = dir < 0 ? (t.tx + 1) * TILE : t.tx * TILE;
        this.vents.push(new Vent(ox, t.ty * TILE + TILE / 2, dir, ventIndex++ * 1.1));
      }
    }
    for (const m of this.map.markers.get('K') ?? []) this.forges.push(new Forge(m.x, m.y));
    const uTiles = tilesOf('U');
    this.updraft = uTiles.length ? new Updraft(uTiles, 0x9bd2ff) : null;

    const flag = this.map.markers.get('F')?.[0];
    this.goal = flag ? { x: flag.x - 10, y: flag.y - 22, w: 20, h: 22 } : null;

    for (const [ch, text] of Object.entries(level.hints ?? {})) {
      for (const p of this.map.markers.get(ch) ?? []) this.hints.push({ x: p.x, y: p.y, text });
    }

    /* --- terreno ------------------------------------------------------ */
    // I blocchi che possono sparire si disegnano da soli: se finissero anche
    // nel terreno cotto resterebbero visibili dopo essere crollati.
    const dynamicTiles = new Set(
      [...Object.values(links).flatMap((c) => tilesOf(c)), ...xTiles, ...lTiles, ...tTiles]
        .map((t) => `${t.tx},${t.ty}`),
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

    const crateMarkers = [
      ...(this.map.markers.get('C') ?? []).map((p) => ({ p, mass: Crate.MASS })),
      ...(this.map.markers.get('D') ?? []).map((p) => ({ p, mass: Crate.INGOT })),
    ];
    for (const { p, mass } of crateMarkers) {
      const crate = new Crate(mass);
      crate.placeAt(p.x, p.y);
      this.physics.add(crate);
      this.crates.push({ crate, spawn: { x: p.x, y: p.y } });
    }

    const framesFor = (idx: readonly number[]) => idx.map((i) => sheets.characters[i]!);
    this.players = [
      new Player(0, 'ghisa', this.inputs[0], framesFor(CHARS.green), P1_COLOR),
      new Player(1, 'soffio', this.inputs[1], framesFor(CHARS.pink), P2_COLOR),
    ];

    const s1 = this.map.spawns[0] ?? { x: 4 * TILE, y: 20 * TILE };
    const s2 = this.map.spawns[1] ?? { x: 7 * TILE, y: 20 * TILE };
    this.players[0].placeAt(s1.x, s1.y, true);
    this.players[1].placeAt(s2.x, s2.y, true);
    this.lastSafe = [{ ...s1 }, { ...s2 }];
    this.checkpoint = [{ ...s1 }, { ...s2 }];
    this.followers[0].snap(this.players[0].focusX, this.players[0].focusY);
    this.followers[1].snap(this.players[1].focusX, this.players[1].focusY);

    this.world.addChild(this.background.container, terrain);
    for (const s of this.slag) this.world.addChild(s.container);
    if (this.updraft) this.world.addChild(this.updraft.container);
    for (const g of this.gates.values()) this.world.addChild(g.container);
    if (this.fragile) this.world.addChild(this.fragile.container);
    if (this.slagWall) this.world.addChild(this.slagWall.container);
    for (const s of this.sheets) this.world.addChild(s.container);
    for (const { plate } of this.plates) this.world.addChild(plate.container);
    for (const { brazier } of this.braziers) this.world.addChild(brazier.container);
    for (const f of this.forges) this.world.addChild(f.container);
    for (const v of this.vents) this.world.addChild(v.container);
    for (const h of this.hammers.values()) this.world.addChild(h.container);
    for (const c of this.crawlers) this.world.addChild(c.view);
    this.world.addChild(this.pickups.container);
    for (const { crate } of this.crates) this.world.addChild(crate.view);
    this.world.addChild(
      this.embers.container,
      this.players[0].view,
      this.players[1].view,
      this.reserveGfx,
      this.spirits[0].view,
      this.spirits[1].view,
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
    if (e.code === 'KeyR' && e.shiftKey) this.restartFromCheckpoint();
  };

  private say(text: string, seconds = 1.8): void {
    this.flash = { text, until: this.time + seconds };
  }

  private get bothAlive(): boolean { return this.alive[0] && this.alive[1]; }

  /* ------------------------------------------------------------------ */

  fixedUpdate(dt: number): void {
    this.keyboard.advance(dt);
    // Hit-stop: alla morte il mondo si ferma un istante. L'orologio dei tasti
    // continua, così un tasto premuto in quel momento non va perso.
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    this.time += dt;

    if (this.loss >= 0) {
      this.loss += dt;
      if (this.loss >= LOSS_FADE) this.restartFromCheckpoint();
      this.particles.update(dt);
      return;
    }
    this.lossOut = Math.max(0, this.lossOut - dt);

    // 1. la Bilancia: ferma finché uno dei due è morto. Intanto l'accordo
    //    serve a rinascere.
    if (this.bothAlive) {
      if (this.mass.update(dt, this.inputs[0], this.inputs[1], this.chord)) {
        this.shake.add(0.3);
        for (const p of this.players) this.burst(p.x, p.y - 8, p.tint, 18);
      }
    } else {
      this.mass.invertFlash = Math.max(0, this.mass.invertFlash - dt * 2.4);
      this.tryChordRevive();
    }
    this.players[0].mass = this.mass.m1;
    this.players[1].mass = this.mass.m2;
    for (const i of [0, 1] as const) this.invuln[i] = Math.max(0, this.invuln[i] - dt);

    const living = this.players.filter((p) => this.alive[p.id]);

    // 2. correnti e vapore agiscono prima del passo fisico
    let liftedTooHeavy = false;
    if (this.updraft) {
      for (const p of living) if (this.updraft.apply(p, dt) && !p.isLight) liftedTooHeavy = true;
    }
    const ventBodies = living.map((p) => ({
      box: p.hitbox, mass: p.mass, push: (ax: number, d: number) => p.pushAccel(ax, 0, d),
    }));
    for (const v of this.vents) {
      if (v.update(dt, ventBodies)) fxBus.emit({ type: 'puff', x: v.ox, y: v.oy, count: 6, color: PAL.fog, dir: v.dir });
    }

    // 3. personaggi vivi
    this.physics.actors = living.map((p) => p.hitbox);
    this.physics.clearPushers();
    for (const p of living) {
      const dir = p.moveIntent;
      if (!p.onGround || dir === 0) continue;
      const box = p.hitbox;
      const body = this.physics.pushableAt({ ...box, x: box.x + dir });
      if (body) this.physics.addPusher(body, dir, p.mass);
    }
    const fx = { dust: this.dustTexture, spark: this.sparkTexture };
    const impacts: Point[] = [];

    for (const p of living) {
      p.update(dt, this.physics, this.particles, fx);
      this.handleEvents(p);

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
        for (const c of this.crawlers) {
          if (c.alive && Math.abs(c.x - impact.x) < 48 && Math.abs(c.y - impact.y) < 24) {
            c.stun = 1.6;
            c.blast(Math.sign(c.x - impact.x || 1) * 90, -120);
          }
        }
        // Schianto incendiario: accende le braci a terra lì intorno
        this.embers.igniteNear(impact.x, impact.y - 4, 3 * TILE, 0.05);
      }
      // Scatto attraverso una brace: la accende alle spalle e allunga lo Scatto
      if (p.isDashing) {
        const e = this.embers.emberIn(p.hitbox);
        if (e) { e.fuse = 0.08; p.extendDash(); }
      }
    }
    this.physics.actors = living.map((p) => p.hitbox);

    // 4. spiriti
    for (const i of [0, 1] as const) {
      const partner = this.players[i === 0 ? 1 : 0];
      this.spirits[i].update(dt, this.inputs[i], this.map, { x: partner.x, y: partner.y - 8 });
    }
    // una brace lanciata che centra lo Sbuffo fa rinascere SOFFIO
    if (this.spirits[1].active && this.alive[0]) {
      const s = this.spirits[1];
      if (this.embers.takeFlyingNear(s.x, s.y, 9)) this.revive(1, this.revivePoint(1, s), s.onBeat, 'ember');
    }

    // 5. corpi e braci
    for (const { crate, spawn } of this.crates) {
      crate.update(dt, this.physics);
      if (crate.y > this.map.pixelHeight + 48) crate.placeAt(spawn.x, spawn.y);
    }
    for (const ex of this.embers.update(dt, this.physics, this.crates.map((c) => c.crate))) {
      this.explode(ex);
    }

    // magli: bloccati dalla loro piastra; quello che schiacciano scoppia
    for (const [ch, h] of this.hammers) {
      const locked = this.plates.some(({ plate, gate }) => gate === ch && plate.active);
      if (h.update(dt, locked)) {
        this.embers.igniteNear(h.x + h.w / 2, h.bottom - 4, h.w / 2 + 6, 0.01);
        fxBus.emit({ type: 'puff', x: h.x + h.w / 2, y: h.bottom, count: 8, color: PAL.steel1 });
        const near = this.players.some((p) => this.alive[p.id] && Math.abs(p.x - (h.x + h.w / 2)) < 160);
        if (near) this.shake.add(0.12);
      }
    }
    for (const c of this.crawlers) {
      if (!c.alive) continue;
      c.update(dt, this.map);
      if (this.slag.some((s) => s.kills(c.box)) || c.y > this.map.pixelHeight + 32
          || [...this.hammers.values()].some((h) => h.kills(c.box))) {
        c.alive = false;
        fxBus.emit({ type: 'sparks', x: c.x, y: c.y - 4, color: PAL.ember3, count: 14, up: true });
        fxBus.emit({ type: 'flash', x: c.x, y: c.y - 4, color: PAL.ember2, radius: 50, intensity: 1, life: 0.3 });
      }
    }

    // 6. pericoli
    const standing = living.map((p) => ({ box: p.hitbox, mass: p.mass }));
    for (const s of this.sheets) {
      if (s.update(dt, standing)) {
        fxBus.emit({ type: 'debris', x: s.top.x + s.top.w / 2, y: s.top.y, color: PAL.steel0, count: 8 });
        this.shake.add(0.15);
      }
    }
    for (const p of living) {
      if (!this.alive[p.id] || this.invuln[p.id] > 0) continue;
      const box = p.hitbox;
      if (this.slag.some((s) => s.kills(box))) this.kill(p.id, 'slag');
      else if (p.y > this.map.pixelHeight + 32) this.kill(p.id, 'void');
      else if ([...this.hammers.values()].some((h) => h.kills(box))) this.kill(p.id, 'crush');
      else if (this.crawlers.some((c) => c.alive && rectsOverlap(c.box, box))) this.kill(p.id, 'burn');
    }
    for (const p of living) {
      if (!this.alive[p.id] || !p.onGround) continue;
      const box = p.hitbox;
      if (this.sheets.some((s) => s.supports(box))) continue;
      if (this.slag.some((s) => s.near(box, 14))) continue;
      if (this.vents.some((v) => rectsOverlap(box, v.band))) continue;
      if ([...this.hammers.values()].some((h) => box.x < h.x + h.w + 6 && box.x + box.w > h.x - 6)) continue;
      if (this.crawlers.some((c) => c.alive && Math.abs(c.x - p.x) < 40 && Math.abs(c.y - p.y) < 30)) continue;
      this.lastSafe[p.id] = { x: p.x, y: p.y };
    }

    // 7. piastre, fornelli e cancelli
    const weights: Weight[] = [
      ...living.map((p) => ({ box: p.hitbox, mass: p.mass })),
      ...this.crates.map(({ crate }) => ({ box: crate.box, mass: crate.mass })),
    ];
    let needsMass = false;
    const open = new Map<string, boolean>();
    for (const { plate, gate } of this.plates) {
      if (plate.update(dt, weights)) open.set(gate, true);
      if (plate.needsMoreMass) needsMass = true;
    }
    // un cancello a fuoco si apre quando TUTTI i suoi fornelli ardono
    const fireGates = new Map<string, boolean>();
    for (const { brazier, gate } of this.braziers) {
      fireGates.set(gate, (fireGates.get(gate) ?? true) && brazier.lit);
    }
    for (const [gate, allLit] of fireGates) if (allLit) open.set(gate, true);
    for (const [ch, gate] of this.gates) gate.update(dt, open.get(ch) ?? false);
    this.fragile?.update(dt, impacts);

    // 8. forge: si accendono solo se ci arrivate vivi tutti e due
    if (this.bothAlive) {
      for (const f of this.forges) {
        if (f.lit || !living.some((p) => f.touches(p.hitbox))) continue;
        f.light();
        this.checkpoint[0] = { x: f.x - 10, y: f.y };
        this.checkpoint[1] = { x: f.x + 10, y: f.y };
        fxBus.emit({ type: 'flash', x: f.x, y: f.y - 16, color: PAL.ember3, radius: 90, intensity: 1.4, life: 0.5 });
        this.say('FORGIA ACCESA: SE CADETE IN DUE, SI RIPARTE DA QUI');
      }
    }

    // 9. raccolta e traguardo (servono due corpi vivi)
    const boxes: Rect[] = living.map((p) => p.hitbox);
    if (this.pickups.update(dt, boxes, this.particles, this.sparkTexture) > 0) {
      this.hud.setGems(this.pickups.collected, this.pickups.total);
      this.shake.add(0.05);
    }
    if (!this.finished && this.goal && this.bothAlive && boxes.every((b) => rectsOverlap(b, this.goal!))) {
      this.finished = true;
      this.finishedAt = this.time;
      this.shake.add(0.5);
      for (const p of this.players) this.burst(p.x, p.y - 10, p.tint, 40);
    }

    this.updatePrompt(needsMass, liftedTooHeavy);
    this.particles.update(dt);
  }

  /* --- eventi dei personaggi ----------------------------------------- */

  private handleEvents(p: Player): void {
    for (const e of p.events.splice(0)) {
      switch (e.type) {
        case 'gadget':
          if (p.role === 'ghisa') {
            if (!this.embers.throw(p.x, p.y, p.facingDir, p.mass, e.aim, p.onGround, p.vx)) {
              this.burst(p.x - p.facingDir * 6, p.y - 14, PAL.steel0, 4);
            }
          } else {
            const cone = this.embers.blow(p.x, p.y, p.facingDir, p.mass, e.aim);
            if (cone) this.applyBlow(p, cone);
          }
          break;
        case 'denied':
          this.say('SCHIANTO (S IN ARIA): GHISA DEVE ESSERE PESANTE');
          this.burst(p.x, p.y - 10, 0x8b93a8, 6);
          break;
        case 'jumped':
        case 'landed':
          break;
      }
    }
  }

  /** Il Tiraggio spinge chi è leggero e le casse, e riattizza il Tizzone. */
  private applyBlow(from: Player, cone: Cone): void {
    fxBus.emit({
      type: 'puff', x: cone.ox + cone.dx * 10, y: cone.oy + cone.dy * 10, count: 8,
      color: PAL.air3, dir: cone.dx || 1,
    });
    const other = this.players[from.id === 0 ? 1 : 0];
    // Il compagno viene spinto solo se è in aria: chi plana può essere
    // soffiato oltre un baratro; chi è a terra (magari sopra una brace che
    // sta per fare da razzo) resta dov'è.
    if (this.alive[other.id] && !other.onGround && cone.along(other.x, other.y - 8) >= 0) {
      const s = 420 * (1 - other.mass);
      other.blast(cone.dx * s, cone.dy * s - (cone.dy === 0 ? 90 * (1 - other.mass) : 0));
    }
    for (const { crate } of this.crates) {
      if (cone.dy === 0 && cone.along(crate.x, crate.y - 8) >= 0) {
        crate.vx = cone.dx * (from.mass >= MassSystem.HEAVY ? 230 : 140);
      }
    }
    for (const c of this.crawlers) {
      if (c.alive && cone.along(c.x, c.y - 5) >= 0) {
        // getto leggero = lungo ma debole; pesante = corto ma potente
        const s = 300 + 260 * from.mass;
        // niente sollevamento: scivola a terra e cade nel primo vuoto che incontra
        c.blast(cone.dx * s, cone.dy * s);
      }
    }
    const t = this.spirits[0];
    if (t.active) {
      const d = cone.along(t.x, t.y);
      if (d >= 0 && d <= GADGET_REVIVE_RANGE) this.revive(0, this.revivePoint(0, t), t.onBeat, 'blow');
    }
  }

  /** Uno scoppio: spinge, accende le micce, abbatte la loppa, accende i fornelli. */
  private explode(ex: Explosion): void {
    const big = ex.size === 'big' ? 1 : ex.size === 'mid' ? 0.7 : 0.45;
    fxBus.emit({ type: 'flash', x: ex.x, y: ex.y, color: PAL.ember3, radius: ex.radius * 2.4, intensity: 1.7, life: 0.3 });
    fxBus.emit({ type: 'ring', x: ex.x, y: ex.y, color: PAL.ember2, radius: ex.radius, life: 0.35 });
    fxBus.emit({ type: 'sparks', x: ex.x, y: ex.y, color: PAL.ember3, count: 12 + Math.round(big * 10) });
    let owner: 0 | 1 = 0;
    let best = Infinity;
    for (const p of this.players) {
      const d = Math.hypot(p.x - ex.x, p.y - ex.y);
      if (this.alive[p.id] && d < best) { best = d; owner = p.id; }
    }
    fxBus.emit({ type: 'shock', x: ex.x, y: ex.y, strength: 0.5 + big * 0.5, owner });
    this.shake.add(0.14 + big * 0.18);

    for (const p of this.players) {
      if (!this.alive[p.id]) continue;
      const cx = p.x, cy = p.y - 8;
      const d = Math.hypot(cx - ex.x, cy - ex.y);
      if (d > ex.radius + 6) continue;
      // Brace sotto i piedi = razzo dritto in alto, senza deriva laterale.
      // Altrimenti sempre almeno per metà verso l'alto: è un trampolino.
      const underFeet = Math.abs(ex.x - p.x) <= 9 && ex.y >= p.y - 6;
      const nx = d < 4 || underFeet ? 0 : (cx - ex.x) / d;
      const ny = d < 4 || underFeet ? -1 : (cy - ex.y) / d;
      const up = Math.max(-ny, 0.5);
      const speed = BLAST_SPEED * (1 - p.mass);
      p.blast(nx * speed * 0.85, -up * speed);
    }

    // le micce arrivano un po' più in là dello scoppio stesso
    for (const c of this.crawlers) {
      if (!c.alive) continue;
      const cx = c.x, cy = c.y - 5;
      const d = Math.hypot(cx - ex.x, cy - ex.y);
      if (d > ex.radius + 6) continue;
      const nx = d < 4 ? 0 : (cx - ex.x) / d;
      const ny = d < 4 ? -1 : (cy - ex.y) / d;
      const speed = BLAST_SPEED * (1 - Crawler.MASS);
      c.blast(nx * speed * 0.85, -Math.max(-ny, 0.5) * speed);
    }
    this.embers.igniteNear(ex.x, ex.y, ex.radius * 1.25, EmberSystem.CHAIN_DELAY);

    for (const { crate } of this.crates) {
      const d = Math.hypot(crate.x - ex.x, crate.y - 8 - ex.y);
      if (d < ex.radius * 1.2) crate.shove(ex.x, 1 - d / (ex.radius * 1.2));
    }
    for (const b of this.slagWall?.blast(ex.x, ex.y, ex.radius) ?? []) {
      fxBus.emit({ type: 'debris', x: b.x, y: b.y, color: 0x6a5a4c, count: 7, up: 1 });
      this.shake.add(0.1);
    }
    for (const { brazier } of this.braziers) {
      if (brazier.tryLight(ex.x, ex.y, ex.radius)) {
        fxBus.emit({ type: 'flash', x: brazier.x, y: brazier.y - 14, color: PAL.ember2, radius: 60, intensity: 1.2, life: 0.4 });
        const left = this.braziers.filter((b) => !b.brazier.lit).length;
        this.say(left > 0 ? `FORNELLO ACCESO: NE MANCANO ${left}` : 'FORNELLI ACCESI: IL CANCELLO SI APRE');
      }
    }
    const s = this.spirits[1];
    if (s.active && Math.hypot(s.x - ex.x, s.y - ex.y) <= ex.radius + 6) {
      this.revive(1, this.revivePoint(1, s), s.onBeat, 'ember');
    }
  }

  /* --- morte e rinascita --------------------------------------------- */

  private kill(i: 0 | 1, cause: 'slag' | 'void' | 'crush' | 'burn'): void {
    if (!this.alive[i]) return;
    const p = this.players[i];
    this.alive[i] = false;
    this.deaths++;
    p.view.visible = false;
    const color = ROLE_COLORS[p.role].main;
    fxBus.emit({ type: 'flash', x: p.x, y: p.y - 8, color, radius: 80, intensity: 1.5, life: 0.4 });
    fxBus.emit({ type: 'debris', x: p.x, y: p.y - 8, color, count: 12, up: 1 });
    fxBus.emit({ type: 'shock', x: p.x, y: p.y - 8, strength: 0.8, owner: i });
    if (cause === 'slag') fxBus.emit({ type: 'sparks', x: p.x, y: p.y, color: PAL.ember3, count: 16, up: true });
    this.shake.add(0.45);
    this.hitstop = DEATH_HITSTOP;

    const safe = this.lastSafe[i];
    // un po' sopra i piedi: la scatola dello spirito non deve toccare il pavimento
    this.spirits[i].spawn(safe.x, safe.y - 20);

    const other = i === 0 ? 1 : 0;
    if (!this.alive[other]) {
      this.loss = 0;
      this.say('COLATA PERSA', 1.2);
      return;
    }
    this.say(i === 0
      ? 'GHISA È CADUTO: PORTA IL TIZZONE DA SOFFIO'
      : 'SOFFIO È CADUTO: PORTA LO SBUFFO DA GHISA', 2.2);
  }

  /** Accordo di rinascita: spirito vicino al compagno, Q e . insieme. */
  private tryChordRevive(): void {
    const dead: 0 | 1 = this.alive[0] ? 1 : 0;
    const livingId: 0 | 1 = dead === 0 ? 1 : 0;
    if (!this.alive[livingId]) return;
    const s = this.spirits[dead];
    const l = this.players[livingId];
    if (!s.active || Math.hypot(s.x - l.x, s.y - (l.y - 8)) > REVIVE_RANGE) return;
    if (!this.chord.inSync) return;
    this.chord.consume();
    this.revive(dead, { x: l.x, y: l.y }, s.onBeat, 'chord');
  }

  /** Dove rinasce chi viene rianimato a distanza: lì se è sicuro, altrimenti all'ultimo punto sicuro. */
  private revivePoint(i: 0 | 1, s: Spirit): Point {
    const feet = { x: s.x, y: s.y + 8 };
    const box: Rect = { x: feet.x - 6, y: feet.y - 16, w: 12, h: 16 };
    const inside = this.physics.overlapsSolid(box) || this.slag.some((p) => p.kills(box));
    let ground = false;
    const tx = Math.floor(feet.x / TILE);
    for (let ty = Math.floor(feet.y / TILE); ty < Math.floor(feet.y / TILE) + 9; ty++) {
      if (this.map.isSolid(tx, ty) || this.map.isOneWay(tx, ty)) { ground = true; break; }
      if (this.slag.some((p) => p.kills({ x: feet.x - 1, y: ty * TILE, w: 2, h: TILE }))) break;
    }
    return !inside && ground ? feet : { ...this.lastSafe[i] };
  }

  private revive(i: 0 | 1, at: Point, perfect: boolean, kind: 'chord' | 'blow' | 'ember'): void {
    if (this.alive[i]) return;
    const p = this.players[i];
    this.alive[i] = true;
    this.spirits[i].hide();
    p.placeAt(at.x, at.y);
    p.view.visible = true;
    this.invuln[i] = perfect ? 1 : 0.6;
    const color = ROLE_COLORS[p.role].main;

    if (kind === 'ember') p.blast(0, -280);
    fxBus.emit({ type: 'flash', x: at.x, y: at.y - 8, color: kind === 'blow' ? PAL.ember3 : color, radius: 70, intensity: 1.4, life: 0.4 });
    fxBus.emit({ type: 'ring', x: at.x, y: at.y - 8, color, radius: perfect ? 46 : 26, life: 0.4 });
    this.burst(at.x, at.y - 8, color, perfect ? 36 : 18);

    if (perfect) {
      this.perfectRevives++;
      this.embers.refill();
      this.embers.blowCooldown = 0;
      for (const q of this.players) q.refreshAbility();
      for (const { crate } of this.crates) {
        const d = Math.hypot(crate.x - at.x, crate.y - at.y);
        if (d < 50) crate.shove(at.x, 1 - d / 50);
      }
      this.shake.add(0.3);
      this.say('RINASCITA PERFETTA!', 1.4);
    } else {
      this.say('DI NUOVO IN DUE', 1.2);
    }
  }

  private restartFromCheckpoint(): void {
    this.loss = -1;
    this.lossOut = 0.5;
    for (const i of [0, 1] as const) {
      this.alive[i] = true;
      this.spirits[i].hide();
      const c = this.checkpoint[i];
      this.players[i].placeAt(c.x, c.y);
      this.players[i].view.visible = true;
      this.lastSafe[i] = { ...c };
      this.invuln[i] = 1;
    }
    this.embers.clear();
    this.embers.refill();
    this.say(this.forges.some((f) => f.lit) ? 'DI NUOVO DALLA FORGIA' : 'DI NUOVO DALL’INIZIO', 1.4);
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
    if (this.finished) {
      text = `INSIEME. FINE DEL LIVELLO.\nCADUTE ${this.deaths}  ·  RINASCITE PERFETTE ${this.perfectRevives}`;
    } else if (this.flash) text = this.flash.text;
    else if (!this.bothAlive && this.reviveReady()) text = 'Q + . INSIEME PER RINASCERE\nSUL BATTITO DELLO SPIRITO È PERFETTA';
    else if (needsMass) text = 'PESO INSUFFICIENTE SULLA PIASTRA';
    else if (liftedTooHeavy) text = 'TROPPO PESANTE PER LA CORRENTE';
    else text = this.nearestHint();

    if (text) this.hud.showPrompt(text); else this.hud.hidePrompt();

    const r = this.embers.reserve;
    this.hud.setObjectStatus(0, this.alive[0]
      ? `BRACI ${r}/${EmberSystem.RESERVE}`
      : 'TIZZONE: RAGGIUNGI SOFFIO');
    this.hud.setObjectStatus(1, this.alive[1]
      ? (this.embers.blowCooldown > 0 ? 'TIRAGGIO ...' : 'TIRAGGIO PRONTO')
      : 'SBUFFO: RAGGIUNGI GHISA');
  }

  private reviveReady(): boolean {
    const dead: 0 | 1 = this.alive[0] ? 1 : 0;
    const l = this.players[dead === 0 ? 1 : 0];
    const s = this.spirits[dead];
    return s.active && this.alive[l.id] && Math.hypot(s.x - l.x, s.y - (l.y - 8)) <= REVIVE_RANGE;
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
    for (const p of this.players) if (this.alive[p.id]) p.draw(alpha, this.time);
    for (const { plate } of this.plates) plate.draw(this.time);
    for (const g of this.gates.values()) g.draw(this.time);
    this.fragile?.draw(this.time);
    this.slagWall?.draw(this.time);
    for (const s of this.slag) s.draw(this.time);
    for (const s of this.sheets) s.draw(this.time);
    for (const v of this.vents) v.draw(this.time);
    for (const h of this.hammers.values()) h.draw(this.time);
    for (const c of this.crawlers) c.draw(alpha, this.time);
    for (const { brazier } of this.braziers) brazier.draw(this.time, frameDelta);
    for (const f of this.forges) f.draw(this.time, frameDelta);
    this.updraft?.draw(this.time, this.particles, this.sparkTexture, frameDelta);
    for (const { crate } of this.crates) crate.draw(alpha, this.time);
    this.embers.draw(this.time);

    this.reserveGfx.clear();
    const g = this.players[0];
    if (this.alive[0]) this.embers.drawReserve(this.reserveGfx, g.view.x, g.view.y, g.facingDir, this.time);
    const ready = this.reviveReady();
    this.spirits.forEach((s) => s.draw(alpha, this.time, ready));

    this.hud.setMass(
      frameDelta, this.mass.m1, this.mass.ballast, this.mass.m2,
      MassSystem.HEAVY, MassSystem.LIGHT, this.mass.invertFlash,
    );
    const lossAlpha = this.loss >= 0 ? Math.min(1, this.loss / (LOSS_FADE * 0.6)) : this.lossOut / 0.5;
    this.hud.setLoss(lossAlpha);
    this.hud.update(frameDelta);
    this.shake.update(frameDelta, this.time);

    const bounds = { w: this.map.pixelWidth, h: this.map.pixelHeight };
    this.followers.forEach((f, i) => {
      const p = this.players[i]!;
      const s = this.spirits[i]!;
      if (this.alive[i]) f.update(frameDelta, p.focusX, p.focusY, p.vx, p.vy);
      else f.update(frameDelta, s.x, s.y, 0, 0);
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
    for (const p of this.players) p.alive = this.alive[p.id];
    this.gfx.present(renderer, {
      time: this.time, players: this.players, shake: this.shake,
      invertFlash: this.mass.invertFlash, finished: this.finished, goal: this.goal,
    });
  }

  /** Riassunto della partita, per la campagna e la schermata finale. */
  get stats(): { deaths: number; perfect: number; gems: number; gemsTotal: number; time: number } {
    return {
      deaths: this.deaths, perfect: this.perfectRevives,
      gems: this.pickups.collected, gemsTotal: this.pickups.total, time: this.time,
    };
  }

  get clock(): number { return this.time; }

  /** Schermata finale della campagna (la mostra main.ts dopo l'ultimo livello). */
  showVictory(text: string): void { this.hud.showVictory(text); }

  /** Solo in sviluppo: comandi rapidi dalla console del browser. */
  devHandle() {
    return {
      game: this as unknown as Record<string, unknown>,
      teleport: (who: 0 | 1, x: number, y: number): void => { this.players[who].placeAt(x, y); },
      /** Imposta la massa di GHISA; SOFFIO prende il resto. */
      setMass: (m1: number): void => {
        const pool = 1 - this.mass.ballast;
        this.mass.m1 = Math.min(Math.max(m1, MassSystem.MIN), pool - MassSystem.MIN);
        this.mass.m2 = pool - this.mass.m1;
      },
      kill: (who: 0 | 1): void => this.kill(who, 'slag'),
      alive: this.alive,
      spirits: this.spirits,
      players: this.players,
      mass: this.mass,
      embers: this.embers,
      physics: this.physics,
      crates: this.crates.map((c) => c.crate),
      hammers: this.hammers,
      crawlers: this.crawlers,
      split: this.split,
      map: this.map,
    };
  }

  destroy(): void {
    this.detachInput();
    window.removeEventListener('keydown', this.onSystemKey);
  }
}
