import { Application } from 'pixi.js';
import { Loop } from './core/loop';
import { loadAssets } from './render/assets';
import { Game } from './game/game';

/** Risoluzione interna fissa: l'inquadratura è identica su ogni schermo. */
const VIEW_W = 1280;
const VIEW_H = 720;

async function boot(): Promise<void> {
  const mount = document.getElementById('stage')!;
  const bootMsg = document.getElementById('boot')!;

  const app = new Application();
  await app.init({
    width: VIEW_W,
    height: VIEW_H,
    background: '#0b0d16',
    antialias: false,
    roundPixels: true,
    resolution: 1,
    autoDensity: false,
    preference: 'webgl',
  });
  // Guidiamo noi il rendering: servono due passaggi per frame (split-screen).
  app.stop();
  mount.appendChild(app.canvas);

  // Il font deve essere pronto prima di creare i Text, o Pixi misura il fallback.
  try {
    await document.fonts.load('10px "Press Start 2P"');
    await document.fonts.ready;
  } catch { /* nessun font custom: si usa il monospace di sistema */ }

  const sheets = await loadAssets();
  const game = new Game(app.renderer, sheets, VIEW_W, VIEW_H);

  const fit = (): void => {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    app.canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
    app.canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
  };
  fit();
  window.addEventListener('resize', fit);

  if (import.meta.env.DEV) {
    // Aggancio per le prove: console -> __tandem.teleport(1, 1400, 380)
    (window as unknown as Record<string, unknown>)['__tandem'] = game.devHandle();
  }

  const loop = new Loop(
    1 / 120,
    (dt) => game.fixedUpdate(dt),
    (alpha, frameDelta) => {
      game.render(alpha, frameDelta, loop.fps);
      game.present(app.renderer);
    },
  );
  loop.start();

  // Senza questo, ogni hot-reload lascia in vita il gioco precedente: dopo
  // qualche modifica si ritrovano dieci istanze che disegnano sullo stesso
  // schermo e il frame rate crolla.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      loop.stop();
      game.destroy();
      window.removeEventListener('resize', fit);
      app.destroy(true, { children: true, texture: true });
      mount.replaceChildren();
    });
  }

  bootMsg.classList.add('hidden');
  setTimeout(() => bootMsg.remove(), 500);
}

boot().catch((err: unknown) => {
  console.error(err);
  const bootMsg = document.getElementById('boot');
  if (bootMsg) bootMsg.textContent = 'ERRORE DI AVVIO — VEDI CONSOLE';
});
