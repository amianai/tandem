import { Container, RenderTexture, Sprite, type Renderer, type Texture } from 'pixi.js';
import { ChordDetector, Keyboard, P1_BINDING, P2_BINDING, PlayerInput } from '../core/input';
import { rectsOverlap, type Rect } from '../core/math';
import { CHARS, TILE, TILES, type Sheets } from '../render/assets';
import { Background } from '../render/background';
import { Follower, Shake } from '../render/camera';
import { Particles } from '../render/particles';
import { SplitScreen } from '../render/splitScreen';
import { DebugOverlay } from '../ui/debug';
import { Hud } from '../ui/hud';
import { FragileFloor, Gate, HeavyPlate, toTile, Updraft } from './elements';
import { SANDBOX } from './levels';
import { MassSystem } from './mass';
import { Pickups } from './pickups';
import { Player } from './player';
import { buildTileLayer, Tilemap } from './tilemap';

const P1_COLOR = 0x5eead4;   // GHISA
const P2_COLOR = 0xff6fb5;   // SOFFIO

export class Game {
  readonly stage = new Container();
  private readonly world = new Container();

  private readonly keyboard = new Keyboard();
  private readonly input1: PlayerInput;
  private readonly input2: PlayerInput;
  private readonly chord: ChordDetector;

  private readonly map: Tilemap;
  private readonly background: Background;
  private readonly particles = new Particles();
  private readonly players: [Player, Player];
  private readonly followers: [Follower, Follower] = [new Follower(), new Follower()];
  private readonly shake = new Shake();
  private readonly split: SplitScreen;
  private readonly hud: Hud;
  private readonly debug = new DebugOverlay();
  private readonly pickups: Pickups;
  private readonly sparkTexture: Texture;
  private readonly dustTexture: Texture;

  private readonly mass = new MassSystem();
  private readonly platesG: HeavyPlate[];
  private readonly plateR: HeavyPlate | null;
  private readonly gateG: Gate | null;
  private readonly gateH: Gate | null;
  private readonly fragile: FragileFloor | null;
  private readonly updraft: Updraft | null;
  private readonly goal: Rect | null;

  private time = 0;
  private finished = false;
  private readonly detachInput: () => void;

  constructor(
    renderer: Renderer,
    sheets: Sheets,
    private readonly viewWidth: number,
    private readonly viewHeight: number,
  ) {
    this.sparkTexture = sheets.particles['star_08']!;
    this.dustTexture = sheets.particles['smoke_08']!;

    this.input1 = new PlayerInput(this.keyboard, P1_BINDING);
    this.input2 = new PlayerInput(this.keyboard, P2_BINDING);
    this.chord = new ChordDetector(this.input1, this.input2);
    this.detachInput = this.keyboard.install();

    this.map = new Tilemap(SANDBOX);
    this.background = new Background(this.map.pixelWidth, this.map.pixelHeight);

    /* --- elementi guidati dalla Bilancia ------------------------------ */
    const tilesOf = (ch: string) => (this.map.markers.get(ch) ?? []).map(toTile);

    this.platesG = [...tilesOf('p'), ...tilesOf('q')].map((t) => new HeavyPlate([t], 0xffc75a));
    const rTiles = tilesOf('r');
    this.plateR = rTiles.length ? new HeavyPlate(rTiles, 0xffc75a) : null;

    const gTiles = tilesOf('G');
    this.gateG = gTiles.length ? new Gate(this.map, gTiles, 0xffc75a) : null;
    const hTiles = tilesOf('H');
    this.gateH = hTiles.length ? new Gate(this.map, hTiles, 0xffc75a, true) : null;

    const xTiles = tilesOf('X');
    this.fragile = xTiles.length ? new FragileFloor(this.map, xTiles) : null;

    const uTiles = tilesOf('U');
    this.updraft = uTiles.length ? new Updraft(uTiles, 0x9bd2ff) : null;

    const flag = this.map.markers.get('F')?.[0];
    this.goal = flag ? { x: flag.x - 10, y: flag.y - 22, w: 20, h: 22 } : null;

    /* --- terreno ------------------------------------------------------ */
    const tileLayer = buildTileLayer(this.map, sheets);
    const baked = RenderTexture.create({
      width: this.map.pixelWidth, height: this.map.pixelHeight, resolution: 1,
    });
    renderer.render({ container: tileLayer, target: baked, clear: true });
    tileLayer.destroy({ children: true });
    const terrain = new Sprite(baked);
    terrain.label = 'terrain';

    this.pickups = new Pickups(this.map.markers.get('*') ?? [], sheets.terrain[TILES.gem]!);

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
    if (this.gateG) this.world.addChild(this.gateG.container);
    if (this.gateH) this.world.addChild(this.gateH.container);
    if (this.fragile) this.world.addChild(this.fragile.container);
    for (const p of this.platesG) this.world.addChild(p.container);
    if (this.plateR) this.world.addChild(this.plateR.container);
    this.world.addChild(
      this.pickups.container,
      this.players[0].view,
      this.players[1].view,
      this.particles.container,
    );

    /* --- schermo ------------------------------------------------------ */
    this.split = new SplitScreen(viewWidth, viewHeight, 1);
    this.hud = new Hud(viewWidth, viewHeight, SANDBOX.name, this.hudInfo());
    this.debug.container.position.set(viewWidth - 250, 12);
    this.stage.addChild(this.split.root, this.hud.container, this.debug.container);

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
    if (e.code === 'KeyR' && e.shiftKey) {
      for (const p of this.players) p.respawn(this.particles, this.sparkTexture);
    }
  };

  /* ------------------------------------------------------------------ */

  fixedUpdate(dt: number): void {
    this.keyboard.advance(dt);
    this.time += dt;

    // 1. la Bilancia decide chi è pesante e chi è leggero
    if (this.mass.update(dt, this.input1, this.input2, this.chord)) {
      this.shake.add(0.3);
      for (const p of this.players) {
        this.particles.emit({
          texture: this.sparkTexture, x: p.x, y: p.y - 8, count: 18,
          speed: [50, 200], life: [0.25, 0.6], scale: [0.08, 0.2],
          tint: p.tint, additive: true, drag: 3,
        });
      }
    }
    this.players[0].mass = this.mass.massP1;
    this.players[1].mass = this.mass.massP2;

    // 2. le correnti agiscono prima del passo fisico, così si integrano
    let liftedTooHeavy = false;
    if (this.updraft) {
      for (const p of this.players) {
        if (this.updraft.apply(p, dt) && !p.isLight) liftedTooHeavy = true;
      }
    }

    // 3. fisica dei personaggi
    const fx = { dust: this.dustTexture, spark: this.sparkTexture };
    const impacts: { x: number; y: number }[] = [];
    for (const p of this.players) {
      p.update(dt, this.map, this.particles, fx);
      const impact = p.takeImpact();
      if (impact) {
        impacts.push(impact);
        this.shake.add(0.35 + impact.power * 0.3);
        const broken = this.fragile?.shatter(
          impact.x, impact.y + 8, 42, this.particles, this.sparkTexture,
        ) ?? 0;
        if (broken > 0) this.shake.add(0.25);
      }
      if (p.y > this.map.pixelHeight + 48) {
        p.respawn(this.particles, this.sparkTexture);
        this.shake.add(0.2);
      }
    }

    // 4. piastre e cancelli
    let needsMass = false;
    let openG = false;
    for (const plate of this.platesG) {
      if (plate.update(dt, this.players)) openG = true;
      if (plate.needsMoreMass) needsMass = true;
    }
    this.gateG?.update(dt, openG);

    let openH = false;
    if (this.plateR) {
      openH = this.plateR.update(dt, this.players);
      if (this.plateR.needsMoreMass) needsMass = true;
    }
    this.gateH?.update(dt, openH);

    this.fragile?.update(dt, impacts);

    // 5. raccolta e traguardo
    const boxes: Rect[] = this.players.map((p) => p.hitbox);
    if (this.pickups.update(dt, boxes, this.particles, this.sparkTexture) > 0) {
      this.hud.setGems(this.pickups.collected, this.pickups.total);
      this.shake.add(0.05);
    }
    if (!this.finished && this.goal && boxes.every((b) => rectsOverlap(b, this.goal!))) {
      this.finished = true;
      this.shake.add(0.5);
      for (const p of this.players) {
        this.particles.emit({
          texture: this.sparkTexture, x: p.x, y: p.y - 10, count: 40,
          speed: [60, 300], life: [0.6, 1.4], scale: [0.1, 0.24],
          tint: p.tint, additive: true, gravity: 220, drag: 1.6,
        });
      }
    }

    this.updatePrompt(needsMass, liftedTooHeavy);
    this.particles.update(dt);
  }

  private updatePrompt(needsMass: boolean, liftedTooHeavy: boolean): void {
    if (this.finished) {
      this.hud.showPrompt('INSIEME. FINE DEL LIVELLO.');
    } else if (needsMass) {
      this.hud.showPrompt('TROPPO LEGGERO PER LA PIASTRA');
    } else if (liftedTooHeavy) {
      this.hud.showPrompt('TROPPO PESANTE PER LA CORRENTE');
    } else {
      this.hud.hidePrompt();
    }
  }

  render(alpha: number, frameDelta: number, fps: number): void {
    for (const p of this.players) p.draw(alpha, this.time);
    for (const plate of this.platesG) plate.draw(this.time);
    this.plateR?.draw(this.time);
    this.gateG?.draw(this.time);
    this.gateH?.draw(this.time);
    this.fragile?.draw(this.time);
    this.updraft?.draw(this.time, this.particles, this.sparkTexture, frameDelta);

    this.hud.setMass(
      frameDelta, this.mass.value,
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
      mass: this.mass.value,
    });
  }

  present(renderer: Renderer): void {
    this.split.render(renderer, this.world, {
      shakeX: this.shake.offsetX,
      shakeY: this.shake.offsetY,
      shakeAngle: this.shake.angle,
      beforePass: (cam) => this.background.applyTo(cam, this.viewWidth, this.viewHeight),
    });
    renderer.render({ container: this.stage });
  }

  devHandle() {
    return {
      game: this as unknown as Record<string, unknown>,
      teleport: (who: 0 | 1, x: number, y: number): void => { this.players[who].placeAt(x, y); },
      players: this.players,
      mass: this.mass,
      split: this.split,
      map: this.map,
    };
  }

  destroy(): void {
    this.detachInput();
    window.removeEventListener('keydown', this.onSystemKey);
  }
}
