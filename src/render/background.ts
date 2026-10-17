import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { CameraState } from './camera';

/** Texture di gradiente generata a runtime: niente file, niente banding. */
function gradientTexture(stops: readonly [number, string][], height = 256): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  for (const [pos, color] of stops) grad.addColorStop(pos, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, height);
  return Texture.from(canvas);
}

/** Profilo di colline deterministico: stesso disegno a ogni avvio. */
function ridge(width: number, baseY: number, amplitude: number, step: number, seed: number): number[] {
  const pts: number[] = [0, baseY + amplitude * 2];
  let s = seed;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let x = 0; x <= width; x += step) {
    const h = baseY - amplitude * (0.35 + rand() * 0.65);
    pts.push(x, h);
  }
  pts.push(width, baseY + amplitude * 2);
  return pts;
}

/**
 * Cielo + due fasce di colline con parallasse. Poiché il mondo viene
 * disegnato una volta per camera, la posizione dei layer va ricalcolata
 * prima di ogni passaggio: ci pensa `applyTo`.
 */
export class Background {
  readonly container = new Container();
  private readonly sky = new Sprite();
  private readonly far = new Container();
  private readonly near = new Container();

  constructor(levelWidth: number, levelHeight: number) {
    this.container.label = 'background';

    this.sky.texture = gradientTexture([
      [0, '#171a35'],
      [0.42, '#2a2f5e'],
      [0.72, '#4a4676'],
      [1, '#7b6183'],
    ]);
    this.sky.anchor.set(0.5);

    const w = levelWidth * 1.6;
    const ground = levelHeight;

    const farG = new Graphics();
    farG.poly(ridge(w, ground * 0.86, ground * 0.42, 46, 9001)).fill({ color: 0x2f3566, alpha: 0.85 });
    this.far.addChild(farG);

    const nearG = new Graphics();
    nearG.poly(ridge(w, ground * 0.97, ground * 0.3, 30, 4242)).fill({ color: 0x232849, alpha: 1 });
    this.near.addChild(nearG);

    this.container.addChild(this.sky, this.far, this.near);
  }

  /** Riposiziona i layer per la camera del passaggio corrente. */
  applyTo(cam: CameraState, viewW: number, viewH: number): void {
    const halfW = viewW / cam.zoom / 2 + 8;
    const halfH = viewH / cam.zoom / 2 + 8;
    this.sky.position.set(cam.x, cam.y);
    this.sky.width = halfW * 2;
    this.sky.height = halfH * 2;

    // k = 1 significa incollato alla camera; il layer scorre a (1 - k)
    // della velocità del mondo, quindi k alto = molto lontano.
    this.far.position.set(cam.x * 0.82, cam.y * 0.9);
    this.near.position.set(cam.x * 0.55, cam.y * 0.72);
  }
}
