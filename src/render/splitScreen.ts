import { Container, Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import { clamp, dampAngle, easeInOutCubic } from '../core/math';
import { clampToBounds, lerpCamera, type Bounds, type CameraState } from './camera';

export interface SplitConfig {
  /** Zoom quando i due sono separati e ognuno ha la sua metà. */
  splitZoom: number;
  /** Zoom minimo a schermo unico: sotto questo conviene dividere. */
  minMergedZoom: number;
  maxMergedZoom: number;
  /** Margine (px schermo) tra i personaggi e il bordo quando lo schermo è unico. */
  margin: number;
  /** Secondi dell'animazione di apertura/chiusura. */
  transition: number;
}

export const DEFAULT_SPLIT: SplitConfig = {
  splitZoom: 3,
  minMergedZoom: 2.05,
  maxMergedZoom: 3,
  margin: 190,
  transition: 0.26,
};

export interface Focus { x: number; y: number }

export interface RenderPassOptions {
  shakeX?: number;
  shakeY?: number;
  shakeAngle?: number;
  /** Chiamata prima di ogni passaggio: serve a spostare i layer di parallasse
   *  in modo diverso per ciascuna delle due camere. */
  beforePass?: (cam: CameraState) => void;
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
 */
export class SplitScreen {
  readonly root = new Container();

  private rtA: RenderTexture;
  private rtB: RenderTexture;
  private readonly spriteA = new Sprite();
  private readonly spriteB = new Sprite();
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
    this.rtA = RenderTexture.create({ width, height, resolution });
    this.rtB = RenderTexture.create({ width, height, resolution });
    this.spriteA.texture = this.rtA;
    this.spriteB.texture = this.rtB;
    this.root.addChild(this.spriteA, this.spriteB, this.maskA, this.maskB, this.divider);
    this.spriteA.mask = this.maskA;
    this.spriteB.mask = this.maskB;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.rtA.destroy(true);
    this.rtB.destroy(true);
    this.rtA = RenderTexture.create({ width, height, resolution: this.resolution });
    this.rtB = RenderTexture.create({ width, height, resolution: this.resolution });
    this.spriteA.texture = this.rtA;
    this.spriteB.texture = this.rtB;
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
      (this.height - cfg.margin * 0.62) / Math.max(dy, 1),
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

    this.divider.clear();
    if (e > 0.002) {
      const alpha = Math.min(1, e * 1.6);
      const grow = easeInOutCubic(Math.min(1, e * 1.3));
      this.divider
        .moveTo(x1, y1).lineTo(x2, y2)
        .stroke({ width: 7 * grow, color: 0x0b0d16, alpha: alpha * 0.95 })
        .moveTo(x1, y1).lineTo(x2, y2)
        .stroke({ width: 2 * grow, color: 0xc9d7ff, alpha: alpha * 0.85 });
    }
    this.divider.alpha = 1;
  }

  /**
   * Disegna il mondo due volte (una per camera) e ricompone le due metà.
   * Quando lo schermo è unico fa un solo passaggio.
   */
  render(renderer: Renderer, world: Container, opts: RenderPassOptions = {}): void {
    const { shakeX = 0, shakeY = 0, shakeAngle = 0, beforePass } = opts;
    const single = this.t <= 0.002;

    beforePass?.(this.camA);
    applyCamera(world, this.camA, this.width, this.height, shakeX, shakeY, shakeAngle);
    renderer.render({ container: world, target: this.rtA, clear: true });

    if (single) {
      // Niente secondo passaggio: spriteB resta acceso ma mascherato a zero,
      // così la sua Graphics continua a valere come maschera e non si disegna.
      this.divider.visible = false;
    } else {
      beforePass?.(this.camB);
      applyCamera(world, this.camB, this.width, this.height, shakeX, shakeY, shakeAngle);
      renderer.render({ container: world, target: this.rtB, clear: true });
      this.divider.visible = true;
    }
  }

  get isSplit(): boolean { return this.t > 0.002; }
}

/** Posiziona il mondo in modo che `cam` sia al centro del viewport. */
export function applyCamera(
  world: Container, cam: CameraState, w: number, h: number,
  shakeX = 0, shakeY = 0, shakeAngle = 0,
): void {
  world.scale.set(cam.zoom);
  world.rotation = shakeAngle;
  // Arrotondiamo la traslazione: su pixel art le posizioni frazionarie
  // fanno "nuotare" i bordi dei tile.
  world.position.set(
    Math.round(-cam.x * cam.zoom + w / 2 + shakeX),
    Math.round(-cam.y * cam.zoom + h / 2 + shakeY),
  );
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
