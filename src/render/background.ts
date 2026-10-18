import { Container, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { bayer, fbm, hash2, PixelCanvas, rampDither, rng } from './art/pixel';
import type { CameraState } from './camera';
import type { PassInfo } from './splitScreen';
import { mixColor, PAL, WORLD } from './theme';

/**
 * SFONDO — una zona industriale di notte, in quattro piani di parallasse.
 *
 *   cielo (con luna e bagliore degli altiforni all'orizzonte)
 *   └ skyline lontano: ciminiere, torri di raffreddamento, capannoni
 *     └ piano medio: altoforno, nastri trasportatori, serbatoi
 *       └ piano vicino: tralicci e gru, quasi neri
 *
 * Prospettiva aerea: più un piano è lontano, più è chiaro, freddo e poco
 * contrastato (si "annega" nella nebbia); i piani vicini sono scuri e
 * dettagliati. Tra un piano e l'altro, una fascia di foschia retinata.
 * Tutto è dipinto in codice all'avvio; a runtime si muovono solo pochi
 * sprite (fumi, luci di segnalazione, fari).
 *
 * Il mondo viene disegnato una volta per camera: `applyTo` riposiziona i
 * piani prima di ogni passaggio.
 */

interface Layer {
  root: Container;
  /** 0 = solidale al mondo, 1 = solidale alla camera. */
  fx: number;
  fy: number;
}

interface Plume { sprite: Sprite; x: number; y: number; phase: number; speed: number }
interface Beacon { sprite: Sprite; phase: number }

export class Background {
  readonly container = new Container();
  private readonly sky: TilingSprite;
  private readonly layers: Layer[] = [];
  private readonly plumes: Plume[] = [];
  private readonly beacons: Beacon[] = [];
  private readonly beams: Sprite[] = [];
  private readonly moon: Sprite;
  private readonly floorY: number;

  constructor(levelWidth: number, levelHeight: number) {
    this.container.label = 'background';
    // linea del pavimento tipica: 4 tile dal fondo
    this.floorY = levelHeight - 4 * 18;

    const skyTex = paintSky(levelHeight + 400);
    this.sky = new TilingSprite({ texture: skyTex, width: 700, height: 420 });
    this.container.addChild(this.sky);

    // luna + alone
    const moonLayer = this.addLayer(0.97, 0.985);
    this.moon = new Sprite(paintMoon());
    this.moon.anchor.set(0.5);
    this.moon.position.set(levelWidth * 0.035 + 40, -levelHeight * 0.95);
    moonLayer.addChild(this.moon);

    // fari che spazzano il cielo, dietro lo skyline
    const beamLayer = this.addLayer(0.9, 0.95);
    const beamTex = paintBeam();
    for (let i = 0; i < 2; i++) {
      const s = new Sprite(beamTex);
      s.anchor.set(0.5, 1);
      s.blendMode = 'add';
      s.alpha = 0.5;
      beamLayer.addChild(s);
      this.beams.push(s);
    }

    const far = this.addLayer(0.86, 0.9);
    const mid = this.addLayer(0.64, 0.75);
    const near = this.addLayer(0.36, 0.5);

    const span = (f: number): number => Math.ceil(levelWidth * (1 - f) + 760);
    const baseOf = (fy: number): number => {
      // a camera sul pavimento, la base del piano cade appena sotto il suolo
      const camFloor = levelHeight - 140;
      return this.floorY + 6 - camFloor * fy;
    };

    this.placePainted(far, paintSkyline(span(0.86), 260, 11), -380, baseOf(0.9) - 260);
    this.placePainted(mid, paintIndustry(span(0.64), 300, 23), -380, baseOf(0.75) - 300);
    this.placePainted(near, paintNear(span(0.36), 340, 37), -380, baseOf(0.5) - 340);

    // fumi delle ciminiere lontane
    const puff = paintPuff();
    const r = rng(5);
    for (let i = 0; i < 9; i++) {
      const s = new Sprite(puff);
      s.anchor.set(0.5);
      s.tint = mixColor(PAL.slate2, WORLD.horizon, 0.25);
      far.addChild(s);
      this.plumes.push({
        sprite: s, x: -300 + r() * span(0.86) * 0.9, y: baseOf(0.9) - 150 - r() * 60,
        phase: r(), speed: 0.05 + r() * 0.04,
      });
    }
    // luci rosse di segnalazione in cima alle ciminiere
    const dot = paintDot();
    for (let i = 0; i < 7; i++) {
      const s = new Sprite(dot);
      s.anchor.set(0.5);
      s.tint = PAL.alarm;
      s.position.set(Math.round(-300 + r() * span(0.86) * 0.9), Math.round(baseOf(0.9) - 140 - r() * 70));
      far.addChild(s);
      this.beacons.push({ sprite: s, phase: r() * 6 });
    }
  }

  private addLayer(fx: number, fy: number): Container {
    const root = new Container();
    this.container.addChild(root);
    this.layers.push({ root, fx, fy });
    return root;
  }

  private placePainted(layer: Container, tex: Texture, x: number, y: number): void {
    const s = new Sprite(tex);
    s.position.set(Math.round(x), Math.round(y));
    layer.addChild(s);
  }

  /** Riposiziona i piani per la camera del passaggio corrente. */
  applyTo(cam: CameraState, viewW: number, viewH: number, pass?: PassInfo): void {
    const t = performance.now() / 1000;
    const ox = pass ? pass.ox : cam.x - viewW / cam.zoom / 2;
    const oy = pass ? pass.oy : cam.y - viewH / cam.zoom / 2;
    const w = pass ? pass.w : viewW / cam.zoom;
    const h = pass ? pass.h : viewH / cam.zoom;

    // Cielo: copre la texture del passaggio; scorre appena in verticale.
    this.sky.position.set(ox, oy);
    this.sky.width = w;
    this.sky.height = h;
    this.sky.tilePosition.set(-Math.round(ox * 0.03), -Math.round(oy * 0.03) - 200);

    for (const l of this.layers) {
      l.root.position.set(Math.round(cam.x * l.fx), Math.round(cam.y * l.fy));
    }

    for (const p of this.plumes) {
      const k = (t * p.speed + p.phase) % 1;
      p.sprite.position.set(Math.round(p.x + k * 26), Math.round(p.y - k * 60));
      p.sprite.scale.set(0.6 + k * 1.6);
      p.sprite.alpha = Math.sin(k * Math.PI) * 0.55;
    }
    for (const b of this.beacons) {
      b.sprite.alpha = Math.sin(t * 1.7 + b.phase) > 0.55 ? 1 : 0.15;
    }
    this.beams.forEach((s, i) => {
      s.position.set(Math.round(180 + i * 520), Math.round(this.floorY * 0.1 + 90));
      s.rotation = Math.sin(t * (0.11 + i * 0.04) + i * 2) * 0.55 + (i ? 0.25 : -0.25);
    });
  }
}

/* ------------------------------------------------------------------ *
 * Pittura dei piani
 * ------------------------------------------------------------------ */

function paintSky(height: number): Texture {
  const W = 64;
  const pc = new PixelCanvas(W, height);
  // dall'alto: notte fonda -> indaco -> viola fumoso -> bagliore d'altoforno
  const ramp = [PAL.night0, PAL.night0, PAL.night1, WORLD.sky[2], WORLD.sky[3], 0x3d2026, WORLD.horizon];
  for (let y = 0; y < height; y++) {
    const t = Math.pow(y / height, 1.6);
    for (let x = 0; x < W; x++) pc.set(x, y, rampDither(ramp, t, x, y));
  }
  // stelle rade, solo in alto, attenuate dal fumo
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash2(i, 1, 3) * W);
    const y = Math.floor(hash2(i, 2, 3) * height * 0.35);
    pc.set(x, y, hash2(i, 3, 3) < 0.3 ? PAL.steel1 : PAL.slate3);
  }
  return pc.toTexture('sky');
}

function paintMoon(): Texture {
  const R = 20, S = R * 2 + 24;
  const pc = new PixelCanvas(S, S);
  const c = S / 2;
  // alone retinato
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d > R && d < R + 11) {
        const t = 1 - (d - R) / 11;
        if (t * t > bayer(x, y) * 1.4) pc.set(x, y, PAL.slate1, 0.5);
      }
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      // terminatore: lato destro in ombra
      const lit = (-dx * 0.8 - dy * 0.4) / R + 0.55;
      const mare = fbm(x / 7, y / 7, 4) > 0.56;
      let col: number = lit > 0.3 ? WORLD.moon : lit > -0.1 ? PAL.fog : PAL.steel0;
      if (mare) col = mixColor(col, PAL.steel0, 0.55);
      pc.set(x, y, col);
    }
  }
  return pc.toTexture('moon');
}

function paintBeam(): Texture {
  const W = 40, H = 300;
  const pc = new PixelCanvas(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / H;                 // 0 in alto (lontano), 1 alla base
    const half = 2 + (1 - t) * (W / 2 - 2);
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x + 0.5 - W / 2) / half;
      if (d > 1) continue;
      const a = (1 - d) * (0.25 + 0.75 * t) * (1 - t * 0.2);
      if (a > bayer(x, y) * 0.9) pc.set(x, y, 0x5d6488, 0.22);
    }
  }
  return pc.toTexture('searchlight');
}

function paintPuff(): Texture {
  const S = 20;
  const pc = new PixelCanvas(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2);
      const n = fbm(x / 5, y / 5, 8);
      const a = (1 - d) * 1.4 * n;
      if (a > bayer(x, y)) pc.set(x, y, 0xffffff);
    }
  }
  return pc.toTexture('puff');
}

function paintDot(): Texture {
  const pc = new PixelCanvas(3, 3);
  pc.set(1, 1, 0xffffff);
  pc.set(0, 1, 0xffffff, 0.35); pc.set(2, 1, 0xffffff, 0.35);
  pc.set(1, 0, 0xffffff, 0.35); pc.set(1, 2, 0xffffff, 0.35);
  return pc.toTexture('beacon');
}

/** Colore di un piano: silhouette annegata nella nebbia secondo la distanza. */
function fogged(c: number, depth: number): number { return mixColor(c, WORLD.fog, depth); }

/** Riempie dal basso fino al bordo inferiore della tela. */
function column(pc: PixelCanvas, x: number, top: number, w: number, color: number): void {
  pc.rect(x, top, w, pc.height - top, color);
}

function windows(pc: PixelCanvas, x: number, top: number, w: number, h: number, seed: number, lit: number, dark: number): void {
  for (let y = top + 3; y < top + h - 2; y += 4) {
    for (let i = x + 2; i < x + w - 2; i += 4) {
      const r = hash2(i, y, seed);
      if (r < 0.16) pc.rect(i, y, 2, 1, lit);
      else if (r < 0.5) pc.rect(i, y, 2, 1, dark);
    }
  }
}

/** Skyline lontano: ciminiere, torri di raffreddamento, capannoni a shed. */
function paintSkyline(W: number, H: number, seed: number): Texture {
  const pc = new PixelCanvas(W, H);
  const r = rng(seed);
  const base = fogged(PAL.night2, 0.38);
  const rim = fogged(PAL.slate2, 0.4);
  const lit = mixColor(PAL.brass1, WORLD.fog, 0.3);
  const dark = fogged(PAL.night1, 0.3);
  // bagliore caldo alla base (altoforni dietro l'orizzonte)
  for (let y = H - 70; y < H; y++) {
    const t = (y - (H - 70)) / 70;
    for (let x = 0; x < W; x++) if (t * 0.9 > bayer(x, y)) pc.set(x, y, mixColor(WORLD.horizon, base, 0.5), 0.6);
  }
  let x = 0;
  while (x < W) {
    const kind = r();
    if (kind < 0.25) {
      // capannone con tetto a denti di sega
      const w = 40 + Math.floor(r() * 60), h = 26 + Math.floor(r() * 24);
      const top = H - h;
      column(pc, x, top, w, base);
      for (let i = 0; i < w; i += 10) {
        for (let k = 0; k < 6; k++) pc.hline(x + i, top - k, Math.max(1, Math.round(10 - k * 1.7)), base);
        pc.set(x + i, top - 6, rim);
      }
      windows(pc, x, top, w, h, seed + x, lit, dark);
      x += w + Math.floor(r() * 6);
    } else if (kind < 0.55) {
      // ciminiera con anelli
      const w = 5 + Math.floor(r() * 4), h = 90 + Math.floor(r() * 80);
      const top = H - h;
      column(pc, x, top, w, base);
      pc.vline(x, top, h, rim);
      for (let y = top + 6; y < H; y += 14) pc.hline(x - 1, y, w + 2, dark);
      pc.hline(x - 1, top, w + 2, rim);
      x += w + 6 + Math.floor(r() * 18);
    } else if (kind < 0.7) {
      // torre di raffreddamento (iperboloide)
      const w = 46 + Math.floor(r() * 20), h = 70 + Math.floor(r() * 30);
      const top = H - h;
      for (let y = top; y < H; y++) {
        const t = (y - top) / h;
        const half = (w / 2) * (0.62 + 0.38 * Math.pow(Math.abs(t - 0.62) / 0.62, 1.6));
        pc.hline(Math.round(x + w / 2 - half), y, Math.round(half * 2), base);
        pc.set(Math.round(x + w / 2 - half), y, rim);
      }
      x += w + Math.floor(r() * 10);
    } else {
      // blocco basso con serbatoio sferico
      const w = 24 + Math.floor(r() * 30), h = 18 + Math.floor(r() * 18);
      column(pc, x, H - h, w, base);
      pc.disc(x + w / 2, H - h - 6, 9, base);
      pc.hline(Math.round(x + w / 2 - 6), H - h - 14, 8, rim);
      windows(pc, x, H - h, w, h, seed + x * 3, lit, dark);
      x += w + Math.floor(r() * 12);
    }
  }
  return pc.toTexture('skyline');
}

/** Piano medio: altoforni, nastri trasportatori inclinati, serbatoi. */
function paintIndustry(W: number, H: number, seed: number): Texture {
  const pc = new PixelCanvas(W, H);
  const r = rng(seed);
  const base = fogged(PAL.night1, 0.2);
  const shade = fogged(PAL.night0, 0.15);
  const rim = fogged(PAL.slate2, 0.22);
  const lit = mixColor(PAL.ember3, PAL.brass1, 0.5);
  let x = 10;
  while (x < W) {
    const kind = r();
    if (kind < 0.3) {
      // altoforno: corpo conico, tubazioni, piattaforme
      const w = 44 + Math.floor(r() * 20), h = 150 + Math.floor(r() * 50);
      const top = H - h;
      const cx = Math.round(x + w / 2);
      for (let y = top; y < H; y++) {
        const t = (y - top) / h;
        const half = Math.round(w * (0.2 + 0.3 * Math.min(1, t * 1.8)));
        pc.hline(cx - half, y, half * 2, base);
        pc.set(cx - half, y, rim);
        pc.set(cx + half - 1, y, shade);
      }
      // tubo di presa a collo d'oca
      pc.rect(cx - 2, top - 26, 4, 26, base);
      pc.rect(cx - 2, top - 26, 22, 4, base);
      pc.rect(cx + 16, top - 26, 4, 60, base);
      pc.hline(cx - 2, top - 26, 22, rim);
      // anelli e bocca incandescente
      for (let y = top + 20; y < H; y += 22) pc.hline(Math.round(x + w * 0.25), y, Math.round(w * 0.5), shade);
      pc.rect(cx - 3, H - 40, 6, 4, lit);
      pc.rect(cx - 2, H - 36, 4, 1, PAL.ember2);
      x += w + 8 + Math.floor(r() * 20);
    } else if (kind < 0.55) {
      // nastro trasportatore inclinato su tralicci
      const len = 70 + Math.floor(r() * 60), rise = 40 + Math.floor(r() * 50);
      const y0 = H - 30;
      for (let i = 0; i < len; i++) {
        const y = Math.round(y0 - (i / len) * rise);
        pc.rect(x + i, y - 3, 1, 4, base);
        pc.set(x + i, y - 4, rim);
        if (i % 18 === 0) pc.rect(x + i, y, 2, H - y, shade);
      }
      x += len + Math.floor(r() * 10);
    } else if (kind < 0.75) {
      // serbatoi cilindrici affiancati
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const w = 22, h = 50 + Math.floor(r() * 30);
        const top = H - h;
        column(pc, x, top, w, base);
        pc.hline(x + 2, top - 1, w - 4, base);
        pc.hline(x + 3, top - 2, w - 6, rim);
        pc.vline(x, top, h, rim);
        pc.vline(x + w - 1, top, h, shade);
        for (let y = top + 8; y < H; y += 10) pc.hline(x, y, w, shade);
        x += w + 3;
      }
      x += 10 + Math.floor(r() * 20);
    } else {
      // edificio con finestre accese
      const w = 50 + Math.floor(r() * 40), h = 60 + Math.floor(r() * 40);
      const top = H - h;
      column(pc, x, top, w, base);
      pc.hline(x, top, w, rim);
      windows(pc, x, top, w, h, seed + x, lit, shade);
      x += w + Math.floor(r() * 16);
    }
  }
  // foschia alla base del piano
  fogBand(pc, H - 60, 60, fogged(PAL.slate0, 0.3), 0.55);
  return pc.toTexture('industry');
}

/** Piano vicino: tralicci reticolari, gru a portale, recinzioni. Quasi neri. */
function paintNear(W: number, H: number, seed: number): Texture {
  const pc = new PixelCanvas(W, H);
  const r = rng(seed);
  const base = PAL.night0;
  const rim = PAL.slate0;
  let x = 30;
  while (x < W) {
    const kind = r();
    if (kind < 0.45) {
      // traliccio reticolare
      const w = 14, h = 120 + Math.floor(r() * 120);
      const top = H - h;
      pc.vline(x, top, h, base); pc.vline(x + w - 1, top, h, base);
      pc.vline(x + 1, top, h, rim);
      for (let y = top; y < H; y += w) {
        pc.hline(x, y, w, base);
        pc.line(x, y, x + w - 1, Math.min(H - 1, y + w), base);
        pc.line(x + w - 1, y, x, Math.min(H - 1, y + w), base);
      }
      pc.rect(x - 3, top - 3, w + 6, 3, base);
      x += w + 30 + Math.floor(r() * 60);
    } else if (kind < 0.7) {
      // gru a portale con braccio e gancio
      const h = 150 + Math.floor(r() * 60), arm = 80 + Math.floor(r() * 60);
      const top = H - h;
      pc.rect(x, top, 5, h, base);
      pc.vline(x, top, h, rim);
      pc.rect(x - 20, top, arm + 20, 5, base);
      pc.hline(x - 20, top, arm + 20, rim);
      for (let i = 0; i < arm; i += 8) pc.line(x + i, top + 5, x + i + 4, top, base);
      const hx = x + arm - 10;
      pc.vline(hx, top + 5, 40, base);
      pc.rect(hx - 2, top + 45, 5, 4, base);
      x += arm + 40 + Math.floor(r() * 50);
    } else {
      // recinzione a rete
      const w = 60 + Math.floor(r() * 50), h = 22;
      const top = H - h - 30;
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          if (((i + j) % 4 === 0) || ((i - j + 400) % 4 === 0)) pc.set(x + i, top + j, base, 0.75);
        }
      }
      for (let i = 0; i <= w; i += 20) pc.rect(x + i, top - 2, 2, h + 32, base);
      x += w + 20 + Math.floor(r() * 40);
    }
  }
  fogBand(pc, H - 50, 50, PAL.night1, 0.7);
  return pc.toTexture('near');
}

/** Foschia retinata che sale dal basso. */
function fogBand(pc: PixelCanvas, top: number, h: number, color: number, max: number): void {
  for (let y = top; y < top + h; y++) {
    const t = ((y - top) / h) * max;
    for (let x = 0; x < pc.width; x++) {
      if (t > bayer(x, y)) pc.set(x, y, color, 0.6);
    }
  }
}
