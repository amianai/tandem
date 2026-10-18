import { Container, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { TILE } from '../assets';
import type { LightRegistry } from '../lighting';
import type { PassInfo } from '../splitScreen';
import { ELEMENT_COLORS, PAL } from '../theme';
import { bayer, hash2, PixelCanvas, rng } from './pixel';

/**
 * SCENOGRAFIA — oggetti di contorno che danno scala e atmosfera al livello
 * senza toccare il gameplay: lampioni industriali (con il loro cono di luce
 * retinato), catene che pendono dall'alto, pannelli informativi dove il
 * livello ha un suggerimento, il portale d'uscita sulla bandiera, cenere che
 * vaga nell'aria.
 *
 * Tutto viene piazzato in modo deterministico leggendo la mappa: niente da
 * annotare a mano nei livelli. I lampioni evitano i marker (cancelli,
 * piastre, oggetti), così non coprono mai un meccanismo.
 */

export interface ScenerySource {
  readonly width: number;
  readonly height: number;
  readonly markers: ReadonlyMap<string, readonly { x: number; y: number }[]>;
  isSolid(tx: number, ty: number): boolean;
  isOneWay(tx: number, ty: number): boolean;
}

interface Lamp { x: number; y: number; bulbX: number; bulbY: number; flicker: number; cone: Sprite }
interface Chain { root: Container; phase: number; amp: number }
interface Board { x: number; y: number; screen: Sprite; phase: number }

const HINT_KEYS = 'abcdefghijklmno';

export class Scenery {
  /** Dietro al terreno e ai personaggi, illuminato dalla lightmap. */
  readonly back = new Container();
  /** Davanti a tutto, emissivo: coni di luce, fascio d'uscita, cenere. */
  readonly front = new Container();

  private readonly lamps: Lamp[] = [];
  private readonly chains: Chain[] = [];
  private readonly boards: Board[] = [];
  private readonly ash: { s: Sprite; x: number; y: number; vx: number; vy: number; ph: number }[] = [];
  private goal: { posts: Sprite; beam: Sprite; x: number; y: number } | null = null;
  private time = 0;
  private finishedGlow = 0;

  constructor(map: ScenerySource) {
    this.back.label = 'scenery-back';
    this.front.label = 'scenery-front';
    this.placeChains(map);
    this.placeLamps(map);
    this.placeBoards(map);
    this.placeGoal(map);
    this.placeAsh();
  }

  /* --- piazzamento --------------------------------------------------- */

  private placeLamps(map: ScenerySource): void {
    const blocked = new Set<number>();
    for (const [ch, list] of map.markers) {
      if (ch === '.') continue;
      for (const m of list) {
        const tx = Math.floor(m.x / TILE);
        for (let d = -2; d <= 2; d++) blocked.add(tx + d);
      }
    }
    const lampTex = paintLamp();
    const coneTex = paintCone();
    let last = -999;
    for (let tx = 4; tx < map.width - 4; tx++) {
      if (tx - last < 13 || blocked.has(tx)) continue;
      if (hash2(tx, 0, 91) > 0.35) continue;
      // superficie calpestabile con almeno 5 tile d'aria sopra
      for (let ty = 2; ty < map.height; ty++) {
        if (!map.isSolid(tx, ty) || map.isSolid(tx, ty - 1) || map.isOneWay(tx, ty - 1)) continue;
        let clear = true;
        for (let k = 1; k <= 5; k++) {
          if (map.isSolid(tx, ty - k) || map.isOneWay(tx, ty - k)) { clear = false; break; }
        }
        if (!clear || !map.isSolid(tx - 1, ty) || !map.isSolid(tx + 1, ty)) continue;
        const dir = hash2(tx, ty, 93) < 0.5 ? -1 : 1;
        const x = tx * TILE + 9, y = ty * TILE;
        const s = new Sprite(lampTex);
        s.anchor.set(0.5, 1);
        s.scale.x = dir;
        s.position.set(x, y);
        this.back.addChild(s);
        const bulbX = x + dir * 6, bulbY = y - 56;
        const cone = new Sprite(coneTex);
        cone.anchor.set(0.5, 0);
        cone.position.set(bulbX, bulbY + 1);
        cone.blendMode = 'add';
        this.front.addChild(cone);
        this.lamps.push({ x, y, bulbX, bulbY, flicker: hash2(tx, 1, 95) < 0.25 ? 1 : 0, cone });
        last = tx;
        break;
      }
    }
  }

  private placeChains(map: ScenerySource): void {
    const link = paintChainLink();
    const hook = paintHook();
    const r = rng(77);
    const W = map.width * TILE;
    for (let x = 60 + r() * 80; x < W - 40; x += 110 + r() * 170) {
      const len = Math.round(50 + r() * 120);
      const root = new Container();
      root.position.set(Math.round(x), 0);
      const chain = new TilingSprite({ texture: link, width: 3, height: len });
      chain.position.set(-1, 0);
      const h = new Sprite(hook);
      h.anchor.set(0.5, 0);
      h.position.set(0, len - 1);
      root.addChild(chain, h);
      this.back.addChild(root);
      this.chains.push({ root, phase: r() * 6.28, amp: 0.012 + r() * 0.02 });
    }
  }

  private placeBoards(map: ScenerySource): void {
    const post = paintBoard();
    const screen = paintBoardScreen();
    for (const ch of HINT_KEYS) {
      for (const m of map.markers.get(ch) ?? []) {
        const s = new Sprite(post);
        s.anchor.set(0.5, 1);
        s.position.set(Math.round(m.x), Math.round(m.y));
        const sc = new Sprite(screen);
        sc.anchor.set(0.5, 1);
        sc.position.set(Math.round(m.x), Math.round(m.y) - 13);
        sc.blendMode = 'add';
        this.back.addChild(s);
        this.front.addChild(sc);
        this.boards.push({ x: m.x, y: m.y - 17, screen: sc, phase: hash2(m.x, m.y, 5) * 6 });
      }
    }
  }

  private placeGoal(map: ScenerySource): void {
    const f = map.markers.get('F')?.[0];
    if (!f) return;
    const posts = new Sprite(paintGoal());
    posts.anchor.set(0.5, 1);
    posts.position.set(Math.round(f.x), Math.round(f.y));
    const beam = new Sprite(paintGoalBeam());
    beam.anchor.set(0.5, 1);
    beam.position.set(Math.round(f.x), Math.round(f.y) - 2);
    beam.blendMode = 'add';
    this.back.addChild(posts);
    this.front.addChild(beam);
    this.goal = { posts, beam, x: f.x, y: f.y };
  }

  private placeAsh(): void {
    const dot = paintAshDot();
    const r = rng(303);
    for (let i = 0; i < 70; i++) {
      const s = new Sprite(dot);
      const ember = r() < 0.18;
      s.tint = ember ? PAL.ember2 : r() < 0.5 ? PAL.slate3 : PAL.steel0;
      s.alpha = ember ? 0.8 : 0.45 + r() * 0.3;
      if (ember) s.blendMode = 'add';
      this.front.addChild(s);
      this.ash.push({
        s, x: r() * ASH_W, y: r() * ASH_H,
        vx: ember ? -4 + r() * 8 : 3 + r() * 6,
        vy: ember ? -(6 + r() * 10) : 3 + r() * 5,
        ph: r() * 6.28,
      });
    }
  }

  /* --- per frame ------------------------------------------------------- */

  update(dt: number, time: number, goalRect: unknown, finished: boolean, lights: LightRegistry): void {
    void goalRect;
    this.time = time;
    for (const l of this.lamps) {
      let k = 1;
      if (l.flicker) {
        // un lampione su quattro ha il neon stanco: brevi cadute di tensione
        const n = Math.sin(time * 13.7) + Math.sin(time * 7.1 + 1.3) + Math.sin(time * 2.3);
        k = n > 2.1 ? 0.25 : n > 1.7 ? 0.65 : 1;
      }
      l.cone.alpha = 0.55 * k;
      lights.put(l.bulbX, l.bulbY + 4, 92, 0xffd29c, 0.8 * k);
      lights.put(l.bulbX, l.y - 6, 58, 0xffc890, 0.45 * k);
    }
    for (const c of this.chains) {
      c.root.rotation = Math.sin(time * 0.9 + c.phase) * c.amp;
    }
    for (const b of this.boards) {
      const k = 0.75 + 0.25 * Math.sin(time * 2 + b.phase);
      b.screen.alpha = k;
      lights.put(b.x, b.y, 46, ELEMENT_COLORS.signalOn, 0.35 * k);
    }
    if (this.goal) {
      this.finishedGlow += ((finished ? 1 : 0) - this.finishedGlow) * Math.min(1, dt * 3);
      const pulse = 0.7 + 0.3 * Math.sin(time * 2.4);
      this.goal.beam.alpha = (0.45 + 0.55 * this.finishedGlow) * pulse;
      this.goal.beam.scale.x = 1 + this.finishedGlow * 0.6;
      lights.put(this.goal.x, this.goal.y - 14, 110 + this.finishedGlow * 60, ELEMENT_COLORS.goal, 0.7 + this.finishedGlow * 0.5);
    }
  }

  /** Cenere: posizioni avvolte nel rettangolo del passaggio corrente. */
  applyPass(pass: PassInfo): void {
    const t = this.time;
    for (const a of this.ash) {
      const x = a.x + a.vx * t + Math.sin(t * 0.7 + a.ph) * 6;
      const y = a.y + a.vy * t;
      a.s.position.set(
        Math.round(pass.ox + wrap(x - pass.ox * 0.85, ASH_W) - (ASH_W - pass.w) / 2),
        Math.round(pass.oy + wrap(y - pass.oy * 0.85, ASH_H) - (ASH_H - pass.h) / 2),
      );
    }
  }
}

const ASH_W = 700;
const ASH_H = 420;
const wrap = (v: number, m: number): number => ((v % m) + m) % m;

/* ------------------------------------------------------------------ *
 * Pittura degli oggetti di scena
 * ------------------------------------------------------------------ */

function paintLamp(): Texture {
  // palo 2 px, braccio verso destra, paralume a campana, lampadina
  const W = 16, H = 60;
  const pc = new PixelCanvas(W, H);
  const px = 7;
  pc.rect(px - 3, H - 2, 8, 2, PAL.night1);
  pc.hline(px - 3, H - 2, 8, PAL.slate2);
  pc.rect(px, 6, 2, H - 8, PAL.night1);
  pc.vline(px, 6, H - 8, PAL.slate2);
  for (let y = 14; y < H - 4; y += 12) pc.hline(px - 1, y, 4, PAL.night0);
  // braccio
  pc.hline(px, 4, 7, PAL.slate1);
  pc.hline(px, 3, 7, PAL.slate3);
  // paralume
  pc.rect(px + 3, 4, 7, 2, PAL.night1);
  pc.hline(px + 4, 4, 5, PAL.slate3);
  pc.hline(px + 2, 6, 9, PAL.night0);
  // lampadina
  pc.hline(px + 5, 7, 3, PAL.ember3);
  pc.set(px + 6, 8, 0xfff2d6);
  return pc.toTexture('lamp');
}

function paintCone(): Texture {
  const W = 56, H = 62;
  const pc = new PixelCanvas(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const half = 3 + t * (W / 2 - 3);
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x + 0.5 - W / 2) / half;
      if (d > 1) continue;
      const a = (1 - t) * (1 - d * d) * 0.9 + 0.08;
      // due livelli retinati: pixel art, non un gradiente liscio
      if (a > 0.55 && a * 0.9 > bayer(x, y) * 0.8) pc.set(x, y, 0xffd9a8, 0.16);
      else if (a > bayer(x, y)) pc.set(x, y, 0xffd9a8, 0.08);
    }
  }
  return pc.toTexture('lamp-cone');
}

function paintChainLink(): Texture {
  const pc = new PixelCanvas(3, 6);
  pc.vline(0, 0, 3, PAL.slate2); pc.vline(2, 0, 3, PAL.night1);
  pc.set(1, 0, PAL.slate3); pc.set(1, 2, PAL.night1);
  pc.set(1, 3, PAL.slate2); pc.set(1, 4, PAL.slate1); pc.set(1, 5, PAL.slate2);
  return pc.toTexture('chain');
}

function paintHook(): Texture {
  const pc = new PixelCanvas(9, 11);
  pc.rect(3, 0, 3, 3, PAL.slate1);
  pc.hline(3, 0, 3, PAL.slate3);
  pc.vline(4, 3, 5, PAL.slate2);
  pc.vline(5, 3, 5, PAL.night1);
  pc.hline(1, 8, 5, PAL.slate2);
  pc.hline(1, 9, 5, PAL.night1);
  pc.vline(0, 5, 4, PAL.slate2);
  pc.set(1, 5, PAL.slate3);
  return pc.toTexture('hook');
}

function paintBoard(): Texture {
  const W = 16, H = 26;
  const pc = new PixelCanvas(W, H);
  pc.rect(7, 12, 2, H - 12, PAL.night1);
  pc.vline(7, 12, H - 12, PAL.slate2);
  pc.rect(4, H - 2, 8, 2, PAL.night1);
  // cassa del pannello
  pc.rect(1, 2, 14, 11, PAL.night0);
  pc.rect(2, 3, 12, 9, PAL.slate1);
  pc.hline(1, 2, 14, PAL.slate3);
  pc.rect(3, 4, 10, 6, PAL.ink);
  // strisce di pericolo sotto
  for (let x = 1; x < 15; x++) pc.set(x, 12, ((x >> 1) & 1) ? PAL.brass1 : PAL.night0);
  return pc.toTexture('board');
}

function paintBoardScreen(): Texture {
  const pc = new PixelCanvas(10, 6);
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 10; x++) {
      if (y % 2 === 1 && x > 0 && x < 9 && hash2(x, y, 7) < 0.75) pc.set(x, y, PAL.signal1, 0.9);
      else pc.set(x, y, PAL.signal0, 0.35);
    }
  }
  return pc.toTexture('board-screen');
}

function paintGoal(): Texture {
  const W = 34, H = 40;
  const pc = new PixelCanvas(W, H);
  for (const x of [1, W - 5]) {
    pc.rect(x, 4, 4, H - 4, PAL.night1);
    pc.vline(x, 4, H - 4, PAL.slate3);
    pc.vline(x + 3, 4, H - 4, PAL.ink);
    for (let y = 8; y < H; y += 6) pc.set(x + 1, y, PAL.signal1);
  }
  pc.rect(0, 0, W, 5, PAL.night1);
  pc.hline(0, 0, W, PAL.steel0);
  for (let x = 2; x < W - 2; x++) pc.set(x, 3, ((x >> 1) & 1) ? PAL.signal1 : PAL.signal0);
  pc.rect(0, H - 2, W, 2, PAL.slate2);
  return pc.toTexture('goal');
}

function paintGoalBeam(): Texture {
  const W = 24, H = 220;
  const pc = new PixelCanvas(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / H; // 0 in alto, 1 alla base
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x + 0.5 - W / 2) / (W / 2);
      const a = (1 - d) * Math.pow(t, 1.5);
      if (a > bayer(x, y) * 0.85) pc.set(x, y, PAL.signal2, a > 0.5 ? 0.3 : 0.16);
    }
  }
  return pc.toTexture('goal-beam');
}

function paintAshDot(): Texture {
  const pc = new PixelCanvas(1, 1);
  pc.set(0, 0, 0xffffff);
  return pc.toTexture('ash');
}
