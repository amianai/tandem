import { Container, RenderTexture, Texture, type Renderer } from 'pixi.js';
import type { Background } from './background';
import { FxDirector, fxBus, type FxActor } from './fx';
import { LightLayer, sceneLights } from './lighting';
import type { Particles } from './particles';
import { PostProcess } from './post';
import { Scenery, type ScenerySource } from './art/scenery';
import type { PassInfo, SplitScreen } from './splitScreen';

/**
 * PIPELINE DI RENDERING — tutto ciò che sta fra "il mondo è aggiornato" e
 * "il frame è a schermo". In `game.ts` resta solo un aggancio di poche righe.
 *
 * Per ogni frame:
 *  1. il regista degli effetti legge lo stato dei personaggi e genera il
 *     "juice" (anelli d'urto, scie, lampi) e le luci dinamiche;
 *  2. per ogni camera dello split: parallasse, lightmap, mondo a 1:1 nella
 *     texture piccola (vedi `SplitScreen`);
 *  3. le due metà vengono ricucite nella texture di scena;
 *  4. post-processing a schermo intero (bloom, grading, vignettatura, grana,
 *     onde d'urto) una sola volta;
 *  5. HUD sopra, pulito.
 */

export interface PipelineOptions {
  renderer: Renderer;
  world: Container;
  stage: Container;
  split: SplitScreen;
  background: Background;
  /** Particelle del gioco: l'overlay delle luci va subito sotto. */
  particles: Particles;
  /** Mappa del livello, per la scenografia (lampioni, catene, nebbia). */
  map: ScenerySource;
  viewW: number;
  viewH: number;
}

/** Quello che la pipeline legge dal gioco a ogni frame. */
export interface FrameInput {
  time: number;
  players: readonly FxActor[];
  shake: { offsetX: number; offsetY: number; angle: number };
  /** 1 nel frame dell'inversione delle masse, poi decade. */
  invertFlash: number;
  /** Traguardo raggiunto da entrambi. */
  finished: boolean;
  goal: { x: number; y: number; w: number; h: number } | null;
}

export class RenderPipeline {
  private readonly lights: LightLayer;
  private readonly post: PostProcess;
  private readonly fx: FxDirector;
  private readonly scenery: Scenery;
  private lastNow = performance.now();
  /** Millisecondi di JS spesi nell'ultimo `present` (diagnostica). */
  lastCostMs = 0;

  constructor(private readonly opt: PipelineOptions) {
    const { world, stage, split } = opt;
    this.lights = new LightLayer(split.lowW, split.lowH);
    this.post = new PostProcess(opt.viewW, opt.viewH);
    this.fx = new FxDirector(opt.particles, Texture.WHITE);
    this.scenery = new Scenery(opt.map);

    // Ordine nel mondo:
    //   sfondo, scenografia dietro, terreno, elementi, personaggi
    //   | overlay luci (moltiplica tutto ciò che sta sotto)
    //   | particelle ed effetti emissivi, primo piano scuro
    world.addChildAt(this.scenery.back, Math.min(1, world.children.length));
    const pIndex = world.getChildIndex(opt.particles.container);
    world.addChildAt(this.lights.overlay, pIndex);
    world.addChildAt(this.fx.under, world.getChildIndex(this.lights.overlay));
    world.addChild(this.fx.over, this.scenery.front);

    // Lo split non va più a schermo direttamente: passa dal post-processing.
    const idx = stage.getChildIndex(split.root);
    stage.removeChild(split.root);
    stage.addChildAt(this.post.output, idx);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>)['__gfx'] = this.devHandle();
    }
  }

  present(renderer: Renderer, frame: FrameInput): void {
    const t0 = performance.now();
    const dt = Math.min(0.1, (t0 - this.lastNow) / 1000);
    this.lastNow = t0;
    const { split, background, world, viewW, viewH } = this.opt;

    this.fx.update(dt, frame, fxBus.drain());
    this.scenery.update(dt, frame.time, frame.goal, frame.finished, sceneLights);
    this.fx.registerLights(sceneLights);

    split.render(renderer, world, {
      shakeX: frame.shake.offsetX,
      shakeY: frame.shake.offsetY,
      shakeAngle: frame.shake.angle,
      beforePass: (cam, pass: PassInfo) => {
        background.applyTo(cam, viewW, viewH, pass);
        this.scenery.applyPass(pass);
        this.lights.preparePass(renderer, pass, sceneLights);
      },
    });

    const screen = this.fx.screenEffects(split, viewW, viewH);
    this.post.run(renderer, split.root, frame.time, screen.shocks, screen.impact);
    renderer.render({ container: this.opt.stage });
    sceneLights.clear();
    this.lastCostMs = performance.now() - t0;
  }

  /* --- strumenti di sviluppo ------------------------------------------- */

  private devHandle() {
    return {
      pipeline: this,
      post: this.post,
      lights: this.lights,
      /** Mostra ingrandita una zona dell'ultimo frame (in pixel 1280x720). */
      inspect: (x: number, y: number, w = 320, h = 180): void => this.inspect(x, y, w, h),
      /** Come `inspect`, ma con un rettangolo in coordinate MONDO (camera A). */
      inspectWorld: (x: number, y: number, w = 120, h = 68): void => {
        const cam = this.opt.split.camA;
        const sx = (x - cam.x) * cam.zoom + this.opt.viewW / 2;
        const sy = (y - cam.y) * cam.zoom + this.opt.viewH / 2;
        this.inspect(Math.round(sx), Math.round(sy), Math.round(w * cam.zoom), Math.round(h * cam.zoom));
      },
      closeInspect: (): void => document.getElementById('gfx-inspect')?.remove(),
    };
  }

  private inspect(x: number, y: number, w: number, h: number): void {
    const r = this.opt.renderer;
    const rt = RenderTexture.create({ width: this.opt.viewW, height: this.opt.viewH });
    r.render({ container: this.opt.stage, target: rt, clear: true });
    const full = r.extract.canvas(rt) as HTMLCanvasElement;
    rt.destroy(true);
    document.getElementById('gfx-inspect')?.remove();
    const c = document.createElement('canvas');
    c.id = 'gfx-inspect';
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(full, x, y, w, h, 0, 0, w, h);
    Object.assign(c.style, {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh', objectFit: 'contain',
      imageRendering: 'pixelated', background: '#000', zIndex: '50',
    });
    c.onclick = () => c.remove();
    document.body.appendChild(c);
  }
}
