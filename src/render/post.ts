import {
  BlurFilter, Container, RenderTexture, Sprite,
  type Geometry, type Mesh, type Renderer, type Shader,
} from 'pixi.js';
import { BRIGHT_FRAG, POST_FRAG, shaderQuad, uniformsOf } from './shaders';

/**
 * POST-PROCESSING in spazio schermo, una volta sola per frame (non per
 * camera): la scena composta (le due metà dello split già ricucite) passa
 * da qui prima dell'HUD.
 *
 *   scena 1280x720 ──► bright pass 320x180 ──► blur 320x180 ──┐
 *        └───────────────────────────────────────────────────►├─► composizione ─► schermo
 *
 * Il bloom lavora a un sedicesimo dei pixel: costa pochissimo e dà comunque
 * l'alone alle sorgenti calde (visiere, scintille, lampade, gemme).
 */

export interface Shock {
  /** Centro in pixel schermo. */
  x: number;
  y: number;
  /** Raggio attuale in pixel schermo. */
  r: number;
  strength: number;
}

export interface PostSettings {
  bloom: number;
  threshold: number;
  vignette: number;
  grain: number;
  saturation: number;
  contrast: number;
  lift: [number, number, number];
  gain: [number, number, number];
}

export const DEFAULT_POST: PostSettings = {
  bloom: 0.85,
  threshold: 0.58,
  vignette: 0.42,
  grain: 0.032,
  saturation: 1.06,
  contrast: 0.22,
  // nero leggermente blu-violetto, bianchi appena caldi
  lift: [0.018, 0.016, 0.04],
  gain: [1.02, 0.99, 0.95],
};

export class PostProcess {
  /** Quad finale: va messo sullo stage, sotto l'HUD. */
  readonly output: Mesh<Geometry, Shader>;
  private readonly scene: RenderTexture;
  private readonly bloomA: RenderTexture;
  private readonly bloomB: RenderTexture;
  private readonly bright: Mesh<Geometry, Shader>;
  private readonly blurSprite: Sprite;
  private readonly blurRoot = new Container();
  settings: PostSettings = { ...DEFAULT_POST };
  enabled = true;

  constructor(private readonly width: number, private readonly height: number) {
    this.scene = RenderTexture.create({ width, height, resolution: 1, scaleMode: 'linear' });
    const bw = Math.round(width / 4), bh = Math.round(height / 4);
    this.bloomA = RenderTexture.create({ width: bw, height: bh, resolution: 1, scaleMode: 'linear' });
    this.bloomB = RenderTexture.create({ width: bw, height: bh, resolution: 1, scaleMode: 'linear' });

    this.bright = shaderQuad(BRIGHT_FRAG, { uTexture: this.scene.source }, {
      uSrcTexel: { value: new Float32Array([1 / width, 1 / height]), type: 'vec2<f32>' },
      uThreshold: { value: DEFAULT_POST.threshold, type: 'f32' },
      uKnee: { value: 0.2, type: 'f32' },
    }, bw, bh);

    this.blurSprite = new Sprite(this.bloomA);
    this.blurSprite.filters = [new BlurFilter({ strength: 5, quality: 3 })];
    this.blurRoot.addChild(this.blurSprite);

    const z = new Float32Array(4);
    this.output = shaderQuad(POST_FRAG, { uTexture: this.scene.source, uBloom: this.bloomB.source }, {
      uRes: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
      uTime: { value: 0, type: 'f32' },
      uBloomStrength: { value: DEFAULT_POST.bloom, type: 'f32' },
      uVignette: { value: DEFAULT_POST.vignette, type: 'f32' },
      uGrain: { value: DEFAULT_POST.grain, type: 'f32' },
      uShock0: { value: z.slice(), type: 'vec4<f32>' },
      uShock1: { value: z.slice(), type: 'vec4<f32>' },
      uImpact: { value: z.slice(), type: 'vec4<f32>' },
      uLift: { value: new Float32Array(DEFAULT_POST.lift), type: 'vec3<f32>' },
      uGain: { value: new Float32Array(DEFAULT_POST.gain), type: 'vec3<f32>' },
      uSaturation: { value: DEFAULT_POST.saturation, type: 'f32' },
      uContrast: { value: DEFAULT_POST.contrast, type: 'f32' },
    }, width, height);
    this.output.label = 'post';
  }

  /**
   * Compone `scene` (la radice dello split-screen) nella texture di scena e
   * prepara il bloom. Dopo, basta disegnare lo stage che contiene `output`.
   */
  run(renderer: Renderer, scene: Container, time: number, shocks: readonly Shock[],
      impact: { x: number; y: number; r: number; amount: number }): void {
    renderer.render({ container: scene, target: this.scene, clear: true });
    const s = this.settings;
    const u = uniformsOf(this.output);

    if (this.enabled && s.bloom > 0) {
      uniformsOf(this.bright)['uThreshold'] = s.threshold;
      renderer.render({ container: this.bright, target: this.bloomA, clear: true });
      renderer.render({ container: this.blurRoot, target: this.bloomB, clear: true });
    }

    u['uTime'] = time;
    u['uBloomStrength'] = this.enabled ? s.bloom : 0;
    u['uVignette'] = this.enabled ? s.vignette : 0;
    u['uGrain'] = this.enabled ? s.grain : 0;
    u['uSaturation'] = this.enabled ? s.saturation : 1;
    u['uContrast'] = this.enabled ? s.contrast : 0;
    setVec(u['uLift'], this.enabled ? s.lift : [0, 0, 0]);
    setVec(u['uGain'], this.enabled ? s.gain : [1, 1, 1]);

    const fill = (key: string, sh: Shock | undefined): void => {
      const v = u[key] as Float32Array;
      if (!sh || !this.enabled) { v[3] = 0; return; }
      v[0] = sh.x; v[1] = sh.y; v[2] = sh.r; v[3] = sh.strength;
    };
    fill('uShock0', shocks[0]);
    fill('uShock1', shocks[1]);
    const iv = u['uImpact'] as Float32Array;
    iv[0] = impact.x; iv[1] = impact.y; iv[2] = impact.r; iv[3] = this.enabled ? impact.amount : 0;
  }

  get sceneTexture(): RenderTexture { return this.scene; }
  get size(): { w: number; h: number } { return { w: this.width, h: this.height }; }
}

function setVec(target: unknown, v: readonly number[]): void {
  const a = target as Float32Array;
  for (let i = 0; i < v.length; i++) a[i] = v[i]!;
}
