import type { Texture } from 'pixi.js';
import { TILE } from '../assets';
import { PAL } from '../theme';
import { bayer, fbm, hash2, PixelCanvas, rampDither } from './pixel';

/**
 * TERRENO dipinto in codice.
 *
 * Invece di accostare tile da 18 px (che a zoom non intero lasciano fessure e
 * mostrano la ripetizione), il terreno viene dipinto pixel per pixel in una
 * sola texture grande quanto il livello. Ogni pixel conosce la propria
 * distanza dall'aria in quattro direzioni e dall'esterno in generale, e da
 * lì si ricavano:
 *
 * - il "cappello" di lamiera chiodata sulle superfici calpestabili, con il
 *   filo di luce lunare in cima (la luce chiave arriva da sinistra in alto);
 * - i fianchi: chiari a sinistra, scuri a destra;
 * - il ventre in ombra sotto le sporgenze;
 * - la muratura interna, che scurisce con la profondità (occlusione
 *   ambientale gratuita: dà massa e volume ai blocchi);
 * - dettagli rari e deterministici: colature di ruggine, griglie di
 *   aerazione, detriti appoggiati sui piani.
 *
 * Le celle dei meccanismi (cancelli, solai fragili) NON vengono dipinte:
 * le disegnano le loro classi, che possono aprirle e romperle a runtime.
 */

/** Interfaccia minima della mappa: non dipendiamo dalla classe di gioco. */
export interface TerrainSource {
  readonly width: number;
  readonly height: number;
  isSolid(tx: number, ty: number): boolean;
  isOneWay(tx: number, ty: number): boolean;
}

const BIG = 999;

/**
 * @param skip celle "tx,ty" che appartengono a un meccanismo (cancelli, solai
 *             fragili): non si dipingono, e i loro vicini le trattano come aria.
 */
export function paintTerrain(map: TerrainSource, skip?: ReadonlySet<string>): Texture {
  const W = map.width * TILE;
  const H = map.height * TILE;
  const pc = new PixelCanvas(W, H);

  // Fuori dal livello è "pieno": i bordi esterni non hanno spigoli.
  const solidCell = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
    return map.isSolid(tx, ty) && !skip?.has(`${tx},${ty}`);
  };

  /* --- maschera per pixel e distanze nelle quattro direzioni ---------- */
  const mask = new Uint8Array(W * H);
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (!solidCell(tx, ty)) continue;
      for (let y = 0; y < TILE; y++) {
        mask.fill(1, (ty * TILE + y) * W + tx * TILE, (ty * TILE + y) * W + tx * TILE + TILE);
      }
    }
  }
  const top = new Uint16Array(W * H);
  const bot = new Uint16Array(W * H);
  const left = new Uint16Array(W * H);
  const right = new Uint16Array(W * H);
  for (let x = 0; x < W; x++) {
    let run = BIG;
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      run = mask[i] ? Math.min(BIG, run + 1) : -1;
      top[i] = Math.max(0, run);
    }
    run = BIG;
    for (let y = H - 1; y >= 0; y--) {
      const i = y * W + x;
      run = mask[i] ? Math.min(BIG, run + 1) : -1;
      bot[i] = Math.max(0, run);
    }
  }
  for (let y = 0; y < H; y++) {
    let run = BIG;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      run = mask[i] ? Math.min(BIG, run + 1) : -1;
      left[i] = Math.max(0, run);
    }
    run = BIG;
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      run = mask[i] ? Math.min(BIG, run + 1) : -1;
      right[i] = Math.max(0, run);
    }
  }
  const depth = chamferInside(mask, W, H);

  /* --- muratura e superfici --------------------------------------------- */
  const masonry = [PAL.slate1, PAL.slate0, PAL.night2, PAL.night1, PAL.night0];
  const ROW = 6;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      const tD = top[i]!, bD = bot[i]!, lD = left[i]!, rD = right[i]!;
      const d = depth[i]!;

      // Muratura: corsi sfalsati di blocchi irregolari, in coordinate mondo
      // (niente ripetizione per tile).
      const row = Math.floor(y / ROW);
      const rowOff = Math.floor(hash2(row, 7, 3) * 14);
      const bw = 11 + Math.floor(hash2(row, 1, 5) * 6);
      const bx = Math.floor((x + rowOff) / bw);
      const inRowY = y - row * ROW;
      const inBlockX = (x + rowOff) - bx * bw;
      const mortar = inRowY === ROW - 1 || inBlockX === bw - 1;
      const tone = hash2(bx, row, 11);
      const stain = fbm(x / 40, y / 26, 9);

      let t = Math.min(1, Math.max(0, (d - 3) / 26));
      t += (tone - 0.5) * 0.22 + (stain - 0.5) * 0.35;
      if (mortar) t += 0.28;
      // spigolo luminoso in alto a sinistra di ogni blocco: volume
      if (!mortar && (inRowY === 0 || inBlockX === 0) && d < 16) t -= 0.18;
      let c = rampDither(masonry, t, x, y);

      /* -- fianchi: luce da sinistra, ombra a destra -- */
      if (lD === 0) c = PAL.slate3;
      else if (lD === 1) c = PAL.slate2;
      if (rD === 0) c = PAL.ink;
      else if (rD === 1) c = PAL.night1;

      /* -- ventre delle sporgenze -- */
      if (bD === 0) c = PAL.ink;
      else if (bD === 1) c = PAL.night0;

      /* -- cappello di lamiera sulle superfici calpestabili -- */
      if (tD <= 4) {
        const worn = hash2(x, y, 21) < 0.06;
        if (tD === 0) c = worn ? PAL.steel0 : PAL.steel1;
        else if (tD === 1) c = PAL.steel0;
        else if (tD === 2) c = PAL.slate3;
        else if (tD === 3) c = PAL.slate2;
        else c = PAL.night1;
        // chiodi ogni 9 px, solo dove la lamiera è abbastanza larga
        if (lD >= 2 && rD >= 2 && (x % 9) === 4) {
          if (tD === 2) c = PAL.fog;
          if (tD === 3) c = PAL.slate1;
        }
        // giunti fra le lastre
        if ((x % 36) === 0 && tD >= 1 && tD <= 3) c = PAL.night2;
        // spigoli del cappello
        if (lD === 0) c = tD === 0 ? PAL.bone : PAL.steel0;
        if (rD === 0) c = PAL.ink;
        else if (rD === 1 && tD > 0) c = PAL.slate1;
      }

      pc.set(x, y, c);
    }
  }

  /* --- colature di ruggine sotto i chiodi -------------------------------- */
  for (let x = 0; x < W; x++) {
    if ((x % 9) !== 4 || hash2(x, 0, 41) > 0.22) continue;
    const len = 3 + Math.floor(hash2(x, 1, 43) * 11);
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (!mask[i] || top[i] !== 5) continue;
      if (left[i]! < 3 || right[i]! < 3) continue;
      for (let k = 0; k < len; k++) {
        const j = (y + k) * W + x;
        if (y + k >= H || !mask[j] || bot[j]! <= 1) break;
        const fade = k / len;
        if (fade > bayer(x, y + k) * 1.2) continue;
        pc.set(x, y + k, k < 2 ? PAL.rust2 : PAL.rust1);
      }
    }
  }

  /* --- griglie di aerazione nelle masse profonde ------------------------- */
  for (let ty = 1; ty < map.height - 1; ty++) {
    for (let tx = 1; tx < map.width - 1; tx++) {
      if (hash2(tx, ty, 61) > 0.07) continue;
      let deep = true;
      for (let j = -1; j <= 1 && deep; j++) {
        for (let i = -1; i <= 1; i++) if (!solidCell(tx + i, ty + j)) { deep = false; break; }
      }
      if (!deep) continue;
      drawVent(pc, tx * TILE + 3, ty * TILE + 5, 12, 8);
    }
  }

  /* --- piattaforme attraversabili: travi a doppia T reticolari ------------ */
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (!map.isOneWay(tx, ty)) continue;
      drawGirder(pc, tx * TILE, ty * TILE, !map.isOneWay(tx - 1, ty), !map.isOneWay(tx + 1, ty));
    }
  }

  /* --- detriti appoggiati sui piani --------------------------------------- */
  for (let x = 2; x < W - 2; x++) {
    const h = hash2(x, 3, 71);
    if (h > 0.045) continue;
    for (let y = 1; y < H; y++) {
      const i = y * W + x;
      if (!mask[i] || top[i] !== 0 || mask[i - W]) continue;
      if (left[i]! < 4 || right[i]! < 4) break;
      drawDebris(pc, x, y - 1, Math.floor(hash2(x, y, 73) * 4));
      break;
    }
  }

  return pc.toTexture('terrain');
}

/** Distanza (chamfer 3-4, in pixel) dal pixel vuoto più vicino. */
function chamferInside(mask: Uint8Array, W: number, H: number): Uint16Array {
  const INF = 60000;
  const d = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = mask[i] ? INF : 0;
  const at = (x: number, y: number): number => {
    // fuori dall'immagine conta come pieno: nessun bordo ai margini del livello
    if (x < 0 || y < 0 || x >= W || y >= H) return INF;
    return d[y * W + x]!;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i]!, at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i]!, at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  }
  for (let i = 0; i < W * H; i++) d[i] = Math.min(255, Math.round(d[i]! / 3));
  return d;
}

function drawVent(pc: PixelCanvas, x: number, y: number, w: number, h: number): void {
  pc.rect(x - 1, y - 1, w + 2, h + 2, PAL.night0);
  pc.rect(x, y, w, h, PAL.ink);
  for (let j = 1; j < h; j += 2) {
    pc.hline(x + 1, y + j, w - 2, PAL.slate0);
  }
  pc.hline(x - 1, y + h + 1, w + 2, PAL.slate1);
  pc.vline(x + w + 1, y - 1, h + 3, PAL.slate1);
}

function drawGirder(pc: PixelCanvas, x: number, y: number, capL: boolean, capR: boolean): void {
  const w = TILE;
  // flangia superiore
  pc.hline(x, y, w, PAL.steel1);
  pc.hline(x, y + 1, w, PAL.steel0);
  pc.hline(x, y + 2, w, PAL.slate2);
  // anima reticolare: diagonali alternate, i vuoti lasciano vedere lo sfondo
  for (let j = 3; j <= 6; j++) {
    for (let i = 0; i < w; i++) {
      const gx = x + i;
      const k = (gx + (j - 3)) % 9;
      const k2 = (gx - (j - 3) + 90) % 9;
      if (k === 0 || k2 === 0) pc.set(gx, y + j, j === 3 ? PAL.slate2 : PAL.slate1);
    }
  }
  // flangia inferiore
  pc.hline(x, y + 7, w, PAL.slate1);
  pc.hline(x, y + 8, w, PAL.night0);
  // chiodi sulla flangia
  for (let i = 4; i < w; i += 9) pc.set(x + i, y + 1, PAL.fog);
  if (capL) {
    pc.rect(x, y, 2, 9, PAL.slate2);
    pc.vline(x, y, 9, PAL.steel0);
    pc.set(x + 1, y + 4, PAL.fog);
  }
  if (capR) {
    pc.rect(x + w - 2, y, 2, 9, PAL.night1);
    pc.vline(x + w - 1, y, 9, PAL.ink);
  }
}

function drawDebris(pc: PixelCanvas, x: number, y: number, kind: number): void {
  switch (kind) {
    case 0: // bullone
      pc.hline(x - 1, y, 3, PAL.slate3);
      pc.set(x, y - 1, PAL.steel0);
      break;
    case 1: // mucchietto di scorie
      pc.hline(x - 2, y, 5, PAL.slate1);
      pc.hline(x - 1, y - 1, 3, PAL.slate2);
      pc.set(x, y - 2, PAL.slate3);
      pc.set(x + 1, y, PAL.rust1);
      break;
    case 2: // spezzone di tubo
      pc.hline(x - 3, y, 7, PAL.slate0);
      pc.hline(x - 3, y - 1, 7, PAL.steel0);
      pc.set(x - 3, y - 1, PAL.slate2);
      pc.set(x + 3, y, PAL.ink);
      break;
    default: // scaglie di ruggine
      pc.set(x - 1, y, PAL.rust1);
      pc.set(x + 2, y, PAL.rust2);
      pc.set(x, y, PAL.rust0);
  }
}
