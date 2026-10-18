import { Application, Container, Graphics, RenderTexture, Sprite, Text, TextStyle, TextureSource, Texture } from 'pixi.js';
import { CharacterArt, type CharacterState } from './render/art/characters';
import { CassaView, ManticeView, ZavorraView } from './render/art/objects';
import { FxDirector, fxBus } from './render/fx';
import { sceneLights } from './render/lighting';
import { Particles } from './render/particles';
import { PAL } from './render/theme';

/**
 * PAGINA DI PROVA DEL KIT ARTISTICO (/art.html, solo sviluppo).
 *
 * Mostra le viste di Zavorra, Mantice e Casse in tutti gli stati, più un
 * foglio dei personaggi, senza nessuna logica di gioco: gli stati sono
 * sintetici e animati nel tempo. Si disegna a 1:1 in una texture 320x180 e
 * la si ingrandisce x4, come fa il gioco con il mondo.
 */

const W = 320, H = 180, SCALE = 4;

async function boot(): Promise<void> {
  TextureSource.defaultOptions.scaleMode = 'nearest';
  const app = new Application();
  await app.init({ width: W * SCALE, height: H * SCALE, background: PAL.night0, antialias: false, preference: 'webgl' });
  document.getElementById('stage')!.appendChild(app.canvas);
  try { await document.fonts.load('16px "Chakra Petch"'); } catch { /* fallback */ }

  const scene = new Container();
  const rt = RenderTexture.create({ width: W, height: H, resolution: 1 });
  const view = new Sprite(rt);
  view.scale.set(SCALE);
  const labels = new Container();
  app.stage.addChild(view, labels);
  // ?zoom=8&cx=160&cy=150 : ingrandisce una zona (per giudicare i pixel)
  const q = new URLSearchParams(location.search);
  const zoom = Number(q.get('zoom')) || 0;
  if (zoom) {
    const cxp = Number(q.get('cx') ?? 160), cyp = Number(q.get('cy') ?? 150);
    view.scale.set(zoom);
    view.position.set(W * SCALE / 2 - cxp * zoom, H * SCALE / 2 - cyp * zoom);
    labels.visible = false;
  }

  // pavimenti delle quattro file
  const floors = new Graphics();
  const rows = [44, 86, 128, 172];
  for (const y of rows) {
    floors.rect(0, y, W, 4).fill({ color: PAL.slate1 }).rect(0, y, W, 1).fill({ color: PAL.steel0 });
  }
  scene.addChild(floors);

  const particles = new Particles(240);
  const fx = new FxDirector(particles, Texture.WHITE);

  const label = (text: string, x: number, y: number): void => {
    const t = new Text({
      text,
      style: new TextStyle({ fontFamily: '"Chakra Petch", sans-serif', fontSize: 13, fontWeight: '500', fill: PAL.steel1, letterSpacing: 1 }),
    });
    t.anchor.set(0.5, 0);
    t.position.set(x * SCALE, y * SCALE + 6);
    labels.addChild(t);
  };
  const title = new Text({
    text: 'TANDEM · KIT OGGETTI E PERSONAGGI',
    style: new TextStyle({ fontFamily: '"Chakra Petch", sans-serif', fontSize: 18, fontWeight: '700', fill: PAL.bone, letterSpacing: 3 }),
  });
  title.position.set(16, 10);
  labels.addChild(title);

  /* --- Zavorra ------------------------------------------------------- */
  const zx = [40, 90, 140, 190, 250];
  const zav = zx.map(() => new ZavorraView());
  zav.forEach((z) => scene.addChild(z.container));
  ['IN SPALLA', 'POSATA 0%', 'POSATA 50%', 'POSATA 100%', 'POSA (CICLO)'].forEach((t, i) => label(t, zx[i]!, rows[0]!));

  /* --- Mantice ------------------------------------------------------- */
  const mx = [30, 75, 120, 165, 215, 270];
  const man = mx.map(() => new ManticeView());
  man.forEach((m) => scene.addChild(m.container));
  ['IN MANO', 'IN VOLO', 'CARICA 0', 'CARICA 50%', 'CARICA PIENA', 'SCHIACCIA+LANCIO'].forEach((t, i) => label(t, mx[i]!, rows[1]!));

  /* --- Casse ---------------------------------------------------------- */
  const cx = [50, 150, 250];
  const casse = cx.map(() => new CassaView());
  casse.forEach((c) => scene.addChild(c.container));
  ['FERMA', 'SPINTA', 'CADUTA'].forEach((t, i) => label(t, cx[i]!, rows[2]!));

  /* --- Personaggi ----------------------------------------------------- */
  const chars: { art: CharacterArt; pose: (t: number) => Partial<CharacterState>; x: number }[] = [
    { art: new CharacterArt('ghisa'), x: 22, pose: () => ({ mass: 0.15 }) },
    { art: new CharacterArt('ghisa'), x: 52, pose: () => ({ mass: 0.9 }) },
    { art: new CharacterArt('ghisa'), x: 82, pose: (t) => ({ mass: 0.7, vx: 90, runPhase: t * 4.6 }) },
    { art: new CharacterArt('ghisa'), x: 112, pose: (t) => ({ mass: 0.9, onGround: false, slamming: true, vy: 640, y: -8 - ((t * 60) % 10) }) },
    { art: new CharacterArt('soffio'), x: 170, pose: () => ({ mass: 0.15 }) },
    { art: new CharacterArt('soffio'), x: 200, pose: () => ({ mass: 0.85 }) },
    { art: new CharacterArt('soffio'), x: 230, pose: (t) => ({ mass: 0.3, vx: 110, runPhase: t * 5.2 }) },
    { art: new CharacterArt('soffio'), x: 262, pose: (t) => ({ mass: 0.15, onGround: false, gliding: true, vy: 60, y: -10 + Math.sin(t * 2) * 2 }) },
    { art: new CharacterArt('soffio'), x: 296, pose: (t) => ({ mass: 0.15, onGround: false, dashing: (t % 1.2) < 0.25, vx: 340, vy: 0, y: -12 }) },
  ];
  chars.forEach((c) => scene.addChild(c.art.view));
  ['G LEGGERO', 'G PESANTE', 'G CORSA', 'G SCHIANTO', 'S LEGGERO', 'S PESANTE', 'S CORSA', 'S PLANATA', 'S SCATTO']
    .forEach((t, i) => label(t, chars[i]!.x, rows[3]! - 30));
  scene.addChild(fx.under, particles.container, fx.over);

  let time = 0;
  app.ticker.add((tk) => {
    const dt = Math.min(0.05, tk.deltaMS / 1000);
    time += dt;

    const yz = rows[0]!;
    zav[0]!.update({ x: zx[0]!, y: yz - 6, w: 16, h: 14, state: 'carried', mass: 0, facing: 1 }, time);
    zav[1]!.update({ x: zx[1]!, y: yz, w: 16, h: 14, state: 'placed', mass: 0, facing: 1 }, time);
    zav[2]!.update({ x: zx[2]!, y: yz, w: 16, h: 14, state: 'placed', mass: 0.45, facing: 1 }, time);
    zav[3]!.update({ x: zx[3]!, y: yz, w: 16, h: 14, state: 'placed', mass: 0.9, facing: 1 }, time);
    const cyc = time % 2.5;
    zav[4]!.update({ x: zx[4]!, y: cyc < 0.6 ? yz - 6 : yz, w: 16, h: 14, state: cyc < 0.6 ? 'carried' : 'placed', mass: cyc < 0.6 ? 0 : 0.8, facing: -1 }, time);

    const ym = rows[1]!;
    man[0]!.update({ x: mx[0]!, y: ym - 4, w: 18, h: 8, state: 'carried', charge: 0, squash: 0, launchPulse: 0 }, time);
    const fly = (Math.sin(time * 2) + 1) / 2;
    man[1]!.update({ x: mx[1]! - 12 + fly * 24, y: ym - 8 - Math.sin(fly * Math.PI) * 10, w: 18, h: 8, state: 'recalling', charge: 0, squash: 0, launchPulse: 0 }, time);
    man[2]!.update({ x: mx[2]!, y: ym, w: 18, h: 8, state: 'placed', charge: 0, squash: 0, launchPulse: 0 }, time);
    man[3]!.update({ x: mx[3]!, y: ym, w: 18, h: 8, state: 'placed', charge: 0.5, squash: 0, launchPulse: 0 }, time);
    man[4]!.update({ x: mx[4]!, y: ym, w: 18, h: 8, state: 'placed', charge: 1, squash: 0, launchPulse: 0 }, time);
    const lc = time % 3;
    const squash = lc < 1 ? Math.max(0, 1 - lc * 3) : 0;
    const charge = lc < 2 ? Math.min(1, lc) : 0;
    const pulse = lc >= 2 ? Math.max(0, 1 - (lc - 2) * 2.5) : 0;
    man[5]!.update({ x: mx[5]!, y: ym, w: 18, h: 8, state: 'placed', charge, squash: Math.max(squash, pulse), launchPulse: pulse }, time);

    const yc = rows[2]!;
    casse[0]!.update({ x: cx[0]!, y: yc, w: 16, h: 16, vx: 0, vy: 0 }, time);
    const slide = Math.sin(time * 1.2);
    casse[1]!.update({ x: cx[1]! + slide * 20, y: yc, w: 16, h: 16, vx: Math.cos(time * 1.2) * 24, vy: 0 }, time);
    const fall = time % 2;
    const fy = fall < 0.5 ? yc - 24 + (fall / 0.5) ** 2 * 24 : yc;
    casse[2]!.update({ x: cx[2]!, y: fy, w: 16, h: 16, vx: 0, vy: fall < 0.5 ? 260 * (fall / 0.5) : 0 }, time);

    const yp = rows[3]!;
    for (const c of chars) {
      const p = c.pose(time);
      const st: CharacterState = {
        x: c.x, y: yp + (p.y ?? 0), vx: p.vx ?? 0, vy: p.vy ?? 0, onGround: p.onGround ?? true,
        facing: 1, mass: p.mass ?? 0.5, squash: 1, runPhase: p.runPhase ?? 0,
        slamming: p.slamming ?? false, dashing: p.dashing ?? false, gliding: p.gliding ?? false,
      };
      c.art.view.position.set(Math.round(st.x), Math.round(st.y));
      c.art.update(st, time);
    }

    fx.update(dt, { players: [], invertFlash: 0 }, fxBus.drain());
    particles.update(dt);
    sceneLights.clear();
    app.renderer.render({ container: scene, target: rt, clear: true, clearColor: PAL.night1 });
  });
}

boot().catch((e: unknown) => console.error(e));
