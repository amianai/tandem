import { Container, Graphics, RenderTexture, type Geometry, type Mesh, type Renderer, type Shader } from 'pixi.js';
import { clamp, dampAngle, easeInOutCubic } from '../core/math';
import { clampToBounds, lerpCamera, type Bounds, type CameraState } from './camera';
import { shaderQuad, uniformsOf, UPSCALE_FRAG } from './shaders';
import { PAL, P1_COLOR, P2_COLOR } from './theme';

export interface SplitConfig {
  /** Zoom quando i due sono separati e ognuno ha la sua metà. */
  splitZoom: number;
  /** Zoom minimo a schermo unico: sotto questo conviene dividere. */
  minMergedZoom: number;
  maxMergedZoom: number;
  /** Margine (px schermo) tra i personaggi e il bordo quando lo schermo è unico. */
  margin: number;
  /** Margine verticale: più ampio, perché in alto c'è l'HUD e lo sprite
   *  sporge sopra il punto inseguito dalla camera. */
  marginY: number;
  /** Secondi dell'animazione di apertura/chiusura. */
  transition: number;
}

export const DEFAULT_SPLIT: SplitConfig = {
  splitZoom: 3,
  minMergedZoom: 2.05,
  maxMergedZoom: 3,
  margin: 190,
  marginY: 270,
  transition: 0.26,
};

export interface Focus { x: number; y: number }

/**
 * Un passaggio di disegno del mondo: la camera e il rettangolo di mondo
 * (in pixel di mondo, origine intera) coperto dalla render texture.
 */
export interface PassInfo {
  readonly cam: CameraState;
  /** Angolo in alto a sinistra della texture, in pixel di mondo (intero). */
  readonly ox: number;
  readonly oy: number;
  readonly w: number;
  readonly h: number;
  /** 0 = camera di GHISA (o schermo unico), 1 = camera di SOFFIO. */
  readonly index: 0 | 1;
}

export interface RenderPassOptions {
  shakeX?: number;
  shakeY?: number;
  shakeAngle?: number;
  /** Chiamata prima di ogni passaggio: serve a spostare i layer di parallasse
   *  e a preparare le luci in modo diverso per ciascuna delle due camere. */
  beforePass?: (cam: CameraState, pass: PassInfo) => void;
}

/**
 * Split-screen dinamico.
 *
 * Idea chiave: le due camere non "saltano" mai. Quando `t = 0` sono
 * esattamente la stessa camera (centro fra i due personaggi), quindi le due
 * metà mostrano un'immagine identica e la cucitura è invisibile. Man mano che
 * `t` sale, ogni camera scivola verso il proprio personaggio e la linea di
 * taglio compare in dissolvenza. Nessun cambio di inquadratura brusco.
 *
 * La linea di taglio è perpendicolare al segmento che unisce i due
 * personaggi: chi sta a sinistra ha la metà di sinistra, chi sta in alto la
 * metà di sopra, e ruota con continuità nel mezzo.
 *
 * Rendering: ogni camera disegna il mondo a 1:1 (un pixel di texture = un
 * pixel di mondo) in una texture piccola, poi un quad la ingrandisce allo
 * zoom della camera con uno shader "sharp bilinear". Risultato: pixel tutti
 * della stessa misura a qualunque zoom, camera che scorre di frazioni di
 * pixel senza tremolio, e tutto (terreno, personaggi, particelle, luci) sulla
 * stessa griglia. In più il mondo costa meno: si riempiono ~4-9 volte meno
 * pixel che disegnandolo direttamente a 1280x720.
 */
export class SplitScreen {
  readonly root = new Container();

  /** Lato della texture di mondo: copre la vista allo zoom minimo + margini. */
  readonly lowW: number;
  readonly lowH: number;
  private lowA: RenderTexture;
  private lowB: RenderTexture;
  private readonly quadA: Mesh<Geometry, Shader>;
  private readonly quadB: Mesh<Geometry, Shader>;
  private readonly maskA = new Graphics();
  private readonly maskB = new Graphics();
  private readonly divider = new Graphics();

  /** 0 = schermo unico, 1 = diviso. */
  t = 0;
  /** Stato "logico" richiesto, con isteresi. */
  private wantSplit = false;
  private angle = 0;
  private angleReady = false;

  readonly camA: CameraState = { x: 0, y: 0, zoom: 3 };
  readonly camB: CameraState = { x: 0, y: 0, zoom: 3 };
  private readonly merged: CameraState = { x: 0, y: 0, zoom: 3 };
  private readonly ownA: CameraState = { x: 0, y: 0, zoom: 3 };
  private readonly ownB: CameraState = { x: 0, y: 0, zoom: 3 };

  constructor(
    private width: number,
    private height: number,
    private readonly resolution: number,
    public config: SplitConfig = DEFAULT_SPLIT,
  ) {
    // Margine per lo scuotimento (traslazione + rotazione) e il sub-pixel.
    const margin = 20;
    this.lowW = Math.ceil(width / config.minMergedZoom / 2) * 2 + margin;
    this.lowH = Math.ceil(height / config.minMergedZoom / 2) * 2 + margin;
    this.lowA = this.makeLow();
    this.lowB = this.makeLow();
    this.quadA = this.makeQuad(this.lowA);
    this.quadB = this.makeQuad(this.lowB);
    this.root.addChild(this.quadA, this.quadB, this.maskA, this.maskB, this.divider);
    this.quadA.mask = this.maskA;
    this.quadB.mask = this.maskB;
  }

  private makeLow(): RenderTexture {
    return RenderTexture.create({
      width: this.lowW, height: this.lowH, resolution: this.resolution,
      // lineare: serve allo shader di ingrandimento, che sfuma solo il bordo
      scaleMode: 'linear',
    });
  }

  private makeQuad(rt: RenderTexture): Mesh<Geometry, Shader> {
    return shaderQuad(
      UPSCALE_FRAG,
      { uTexture: rt.source },
      {
        uTexSize: { value: new Float32Array([this.lowW, this.lowH]), type: 'vec2<f32>' },
        uScale: { value: 3, type: 'f32' },
      },
      this.lowW, this.lowH,
    );
  }

  resize(width: number, height: number): void {
    // La texture di mondo dipende solo dallo zoom minimo: basta aggiornare
    // le dimensioni del viewport.
    this.width = width;
    this.height = height;
  }

  /** Normale della linea di taglio (da A verso B) e apertura 0..1 (con easing). */
  get splitNormal(): { nx: number; ny: number; e: number } {
    return { nx: Math.cos(this.angle), ny: Math.sin(this.angle), e: easeInOutCubic(this.t) };
  }

  /** Forza lo stato iniziale senza animazione (a inizio livello). */
  snap(a: Focus, b: Focus, bounds: Bounds): void {
    this.angle = Math.atan2(b.y - a.y, b.x - a.x);
    this.angleReady = true;
    this.update(1 / 60, a, b, bounds, true);
    this.t = this.wantSplit ? 1 : 0;
  }

  update(dt: number, a: Focus, b: Focus, bounds: Bounds, immediate = false): void {
    const { config: cfg } = this;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);

    // Zoom necessario per tenere entrambi dentro una sola inquadratura.
    const fitZoom = Math.min(
      (this.width - cfg.margin) / Math.max(dx, 1),
      (this.height - cfg.marginY) / Math.max(dy, 1),
      cfg.maxMergedZoom,
    );

    // Isteresi: separare e riunire a soglie diverse evita lo sfarfallio
    // quando la distanza oscilla intorno al limite.
    if (this.wantSplit) {
      if (fitZoom > cfg.minMergedZoom * 1.14) this.wantSplit = false;
    } else if (fitZoom < cfg.minMergedZoom) {
      this.wantSplit = true;
    }

    const target = this.wantSplit ? 1 : 0;
    if (immediate) {
      this.t = target;
    } else {
      const speed = dt / cfg.transition;
      this.t = target > this.t ? Math.min(target, this.t + speed) : Math.max(target, this.t - speed);
    }

    const targetAngle = Math.atan2(b.y - a.y, b.x - a.x);
    if (!this.angleReady) { this.angle = targetAngle; this.angleReady = true; }
    // L'angolo insegue piano: la linea non deve mai frullare.
    this.angle = immediate ? targetAngle : dampAngle(this.angle, targetAngle, 7, dt);

    this.merged.x = (a.x + b.x) / 2;
    this.merged.y = (a.y + b.y) / 2;
    this.merged.zoom = clamp(fitZoom, cfg.minMergedZoom, cfg.maxMergedZoom);
    clampToBounds(this.merged, bounds, this.width, this.height);

    // Ogni giocatore va al centro della PROPRIA metà, non sulla cucitura:
    // spostiamo ciascuna camera di un quarto di schermo lungo la normale.
    const nx = Math.cos(this.angle);
    const ny = Math.sin(this.angle);
    const halfExtent = (Math.abs(nx) * this.width + Math.abs(ny) * this.height) / 4;
    const off = halfExtent / cfg.splitZoom;

    this.ownA.x = a.x + nx * off; this.ownA.y = a.y + ny * off; this.ownA.zoom = cfg.splitZoom;
    this.ownB.x = b.x - nx * off; this.ownB.y = b.y - ny * off; this.ownB.zoom = cfg.splitZoom;

    const e = easeInOutCubic(this.t);
    lerpCamera(this.merged, this.ownA, e, this.camA);
    lerpCamera(this.merged, this.ownB, e, this.camB);
    clampToBounds(this.camA, bounds, this.width, this.height);
    clampToBounds(this.camB, bounds, this.width, this.height);

    this.updateMasks(e);
  }

  private updateMasks(e: number): void {
    const { width: w, height: h } = this;
    const cx = w / 2;
    const cy = h / 2;
    const nx = Math.cos(this.angle);
    const ny = Math.sin(this.angle);

    const screen = [0, 0, w, 0, w, h, 0, h];
    if (e <= 0.002) {
      // Schermo unico: A prende tutto, B viene mascherato fuori campo.
      drawPoly(this.maskA, screen);
      drawPoly(this.maskB, OFFSCREEN);
    } else {
      drawPoly(this.maskA, clipHalfPlane(screen, nx, ny, cx, cy));
      drawPoly(this.maskB, clipHalfPlane(screen, -nx, -ny, cx, cy));
    }

    // La linea: direzione perpendicolare alla normale.
    const dxL = -ny, dyL = nx;
    const len = w + h;
    const x1 = cx - dxL * len, y1 = cy - dyL * len;
    const x2 = cx + dxL * len, y2 = cy + dyL * len;

    // Fascia scura con un filo del colore di ciascun giocatore sul proprio
    // lato: a colpo d'occhio si sa di chi è ogni metà.
    this.divider.clear();
    if (e > 0.002) {
      const alpha = Math.min(1, e * 1.6);
      const grow = easeInOutCubic(Math.min(1, e * 1.3));
      const half = 4 * grow;
      const edge = (side: number, color: number): void => {
        const ox = nx * side * half, oy = ny * side * half;
        this.divider
          .moveTo(x1 + ox, y1 + oy).lineTo(x2 + ox, y2 + oy)
          .stroke({ width: 2 * grow, color, alpha: alpha * 0.9 });
      };
      this.divider
        .moveTo(x1, y1).lineTo(x2, y2)
        .stroke({ width: 10 * grow, color: PAL.ink, alpha: alpha * 0.96 });
      edge(-1, P1_COLOR);
      edge(1, P2_COLOR);
    }
    this.divider.alpha = 1;
  }

  /**
   * Disegna il mondo due volte (una per camera) nelle texture piccole e
   * aggiorna i quad che le ingrandiscono. Con lo schermo unico fa un solo
   * passaggio. La composizione finale la fa chi disegna `root`.
   */
  render(renderer: Renderer, world: Container, opts: RenderPassOptions = {}): void {
    const single = this.t <= 0.002;
    this.renderPass(renderer, world, this.camA, this.lowA, this.quadA, 0, opts);
    if (single) {
      // Niente secondo passaggio: quadB resta acceso ma mascherato a zero,
      // così la sua Graphics continua a valere come maschera e non si disegna.
      this.divider.visible = false;
    } else {
      this.renderPass(renderer, world, this.camB, this.lowB, this.quadB, 1, opts);
      this.divider.visible = true;
    }
  }

  private renderPass(
    renderer: Renderer, world: Container, cam: CameraState,
    target: RenderTexture, quad: Mesh<Geometry, Shader>, index: 0 | 1, opts: RenderPassOptions,
  ): void {
    const { shakeX = 0, shakeY = 0, shakeAngle = 0, beforePass } = opts;
    // Origine intera: il mondo cade sempre sulla griglia della texture.
    const ox = Math.floor(cam.x) - this.lowW / 2;
    const oy = Math.floor(cam.y) - this.lowH / 2;
    world.scale.set(1);
    world.rotation = 0;
    world.position.set(-ox, -oy);
    beforePass?.(cam, { cam, ox, oy, w: this.lowW, h: this.lowH, index });
    renderer.render({ container: world, target, clear: true });

    // Il resto frazionario della camera, lo zoom e lo scuotimento vivono
    // tutti nel quad: si muovono in modo continuo, a costo zero.
    quad.pivot.set(cam.x - ox, cam.y - oy);
    quad.position.set(this.width / 2 + shakeX, this.height / 2 + shakeY);
    quad.scale.set(cam.zoom);
    quad.rotation = shakeAngle;
    uniformsOf(quad)['uScale'] = cam.zoom;
  }

  get isSplit(): boolean { return this.t > 0.002; }
}

/** Proietta un punto del mondo sullo schermo, per una data camera. */
export function worldToScreen(
  cam: CameraState, x: number, y: number, w: number, h: number,
): { x: number; y: number } {
  return { x: (x - cam.x) * cam.zoom + w / 2, y: (y - cam.y) * cam.zoom + h / 2 };
}

/** Sutherland–Hodgman contro un semipiano: tiene i punti con dot(p-c, n) <= 0. */
function clipHalfPlane(poly: number[], nx: number, ny: number, cx: number, cy: number): number[] {
  const out: number[] = [];
  const n = poly.length / 2;
  const side = (x: number, y: number): number => (x - cx) * nx + (y - cy) * ny;

  for (let i = 0; i < n; i++) {
    const ax = poly[i * 2]!, ay = poly[i * 2 + 1]!;
    const j = (i + 1) % n;
    const bx = poly[j * 2]!, by = poly[j * 2 + 1]!;
    const sa = side(ax, ay), sb = side(bx, by);

    if (sa <= 0) out.push(ax, ay);
    if ((sa <= 0) !== (sb <= 0)) {
      const t = sa / (sa - sb);
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }
  return out;
}

/** Triangolo degenere fuori dallo schermo: maschera "vuota" ma valida. */
const OFFSCREEN = [-8, -8, -7, -8, -7, -7];

function drawPoly(g: Graphics, points: number[]): void {
  g.clear();
  if (points.length < 6) return;
  g.poly(points).fill({ color: 0xffffff });
}

export { clipHalfPlane };
export type { CameraState };
