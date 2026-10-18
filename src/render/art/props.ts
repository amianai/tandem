import type { Texture } from 'pixi.js';
import { PAL } from '../theme';
import { PixelCanvas } from './pixel';

/**
 * Piccoli oggetti dipinti in codice, condivisi fra gioco e pagina di prova.
 */

/**
 * Gemma: un cristallo viola sfaccettato. Il viola è la quarta tinta della
 * palette, lontana sia dall'arancio di GHISA sia dal ciano di SOFFIO.
 */
export function paintGem(): Texture {
  const W = 11, H = 13;
  const pc = new PixelCanvas(W, H);
  const cx = 5;
  // sagoma: punta in alto, corona, punta in basso
  const rows: [number, number][] = [
    [5, 5], [4, 6], [3, 7], [2, 8], [1, 9], [1, 9], [2, 8], [2, 8], [3, 7], [3, 7], [4, 6], [4, 6], [5, 5],
  ];
  rows.forEach(([a, b], y) => {
    for (let x = a; x <= b; x++) {
      // faccette: sinistra chiara, destra scura, banda centrale media
      let c: number = PAL.gem1;
      if (x < cx - 1) c = y < 5 ? PAL.gem2 : PAL.gem1;
      else if (x > cx + 1) c = PAL.gem0;
      if (y === 5) c = x < cx ? PAL.gem2 : PAL.gem1;  // cintura
      pc.set(x, y, c);
    }
  });
  // contorno scuro
  const sil = new Set<number>();
  rows.forEach(([a, b], y) => { for (let x = a; x <= b; x++) sil.add(y * W + x); });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (sil.has(y * W + x)) continue;
      const n = sil.has(y * W + x - 1) || sil.has(y * W + x + 1) || sil.has((y - 1) * W + x) || sil.has((y + 1) * W + x);
      if (n) pc.set(x, y, PAL.ink);
    }
  }
  // scintilla di riflesso
  pc.set(3, 4, 0xffffff);
  pc.set(4, 3, PAL.gem2);
  return pc.toTexture('gem');
}
