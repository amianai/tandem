import type { Graphics, Texture } from 'pixi.js';
import { clamp, easeOutCubic } from '../../core/math';
import { TILE } from '../assets';
import { fxBus } from '../fx';
import { sceneLights } from '../lighting';
import type { Particles } from '../particles';
import { mixColor, PAL } from '../theme';
import { hash2 } from './pixel';

/**
 * ARTE DEGLI ELEMENTI DEL LIVELLO (piastre, cancelli, solai fragili,
 * correnti d'aria). I `draw()` in `game/elements.ts` delegano qui, passando
 * lo stato che serve: la memoria visiva (per accorgersi che un cancello ha
 * appena iniziato a muoversi, che un tile si è appena rotto...) vive in una
 * WeakMap di questo modulo, così le classi di gioco non hanno campi grafici.
 *
 * Linguaggio visivo comune: i meccanismi sono acciaio scuro con una spia di
 * SEGNALE (lime = attivo/aperto, brace spenta = inattivo). Piastra e
 * cancello collegati condividono la spia: si capisce cosa apre cosa.
 */

interface Rect { x: number; y: number; w: number; h: number }

const memory = new WeakMap<object, Record<string, number>>();
function mem(key: object): Record<string, number> {
  let m = memory.get(key);
  if (!m) { m = {}; memory.set(key, m); }
  return m;
}

/* ------------------------------------------------------------------ *
 * PIASTRA — tampone d'acciaio su un alloggiamento, con una fila di LED che
 * mostra QUANTO peso c'è sopra rispetto alla soglia (la Bilancia si legge
 * anche qui, non solo nella barra).
 * ------------------------------------------------------------------ */
export interface PlateLook {
  bounds: Rect;
  /** 0..1 abbassamento. */
  press: number;
  /** 0..1 "trema": qualcuno sopra ma troppo leggero. */
  hint: number;
  active: boolean;
  /** 0..1 peso rispetto alla soglia. */
  load: number;
  /** Colore di segnale del collegamento. */
  color: number;
}

export function drawPlate(g: Graphics, key: object, p: PlateLook, time: number): void {
  const m = mem(key);
  const { x, y, w } = p.bounds;
  const dy = Math.round(p.press * 3);
  const shiver = p.hint > 0.05 ? Math.round(Math.sin(time * 40) * p.hint) : 0;
  g.clear();

  // alloggiamento incassato
  g.rect(x, y + 3, w, 3).fill({ color: PAL.night0 });
  g.rect(x, y + 3, w, 1).fill({ color: PAL.slate1 });
  g.rect(x, y + 3, 1, 3).fill({ color: PAL.slate2 });
  g.rect(x + w - 1, y + 3, 1, 3).fill({ color: PAL.ink });

  // tampone
  const px = x + 2 + shiver, pw = w - 4, py = y + dy;
  g.rect(px, py, pw, 3).fill({ color: PAL.slate3 });
  g.rect(px, py, pw, 1).fill({ color: p.active ? PAL.fog : PAL.steel0 });
  g.rect(px + pw - 1, py, 1, 3).fill({ color: PAL.slate1 });
  // frecce verso il basso: "premere qui"
  const arrow = p.active ? p.color : PAL.brass0;
  for (let ax = px + 3; ax + 3 <= px + pw - 2; ax += 7) {
    g.rect(ax, py + 1, 3, 1).fill({ color: arrow });
    g.rect(ax + 1, py + 2, 1, 1).fill({ color: arrow });
  }

  // LED del carico sul fronte dell'alloggiamento
  const leds = Math.max(2, Math.floor((w - 4) / 3));
  const lit = p.active ? leds : Math.floor(p.load * leds + 1e-3);
  for (let i = 0; i < leds; i++) {
    const on = i < lit;
    const c = on ? (p.active ? p.color : PAL.brass2) : PAL.night2;
    g.rect(x + 2 + i * 3, y + 5, 2, 1).fill({ color: c });
  }

  // luce e eventi
  const cx = x + w / 2;
  if (p.active) sceneLights.put(cx, y, 48, p.color, 0.65);
  else if (p.load > 0.02) sceneLights.put(cx, y + 2, 34, PAL.brass2, 0.25 + p.load * 0.25);
  const was = m['active'] ?? 0;
  if (p.active && !was) {
    fxBus.emit({ type: 'puff', x: x + 1, y: y + 4, count: 3, dir: -1 });
    fxBus.emit({ type: 'puff', x: x + w - 1, y: y + 4, count: 3, dir: 1 });
    fxBus.emit({ type: 'ring', x: cx, y: y + 4, color: p.color, radius: w * 0.7, flat: true, life: 0.3 });
    fxBus.emit({ type: 'flash', x: cx, y, color: p.color, radius: 70, intensity: 0.7, life: 0.25 });
  }
  m['active'] = p.active ? 1 : 0;
}

/* ------------------------------------------------------------------ *
 * CANCELLO — saracinesca di ferro a doghe che si arrotola verso l'alto,
 * con le guide sempre visibili e una spia sul cassonetto.
 * ------------------------------------------------------------------ */
export interface GateLook {
  bounds: Rect;
  /** 0 = chiuso, 1 = aperto. */
  openness: number;
  latched: boolean;
  color: number;
}

export function drawGate(g: Graphics, key: object, p: GateLook, time: number): void {
  const m = mem(key);
  const { x, y, w, h } = p.bounds;
  const e = easeOutCubic(p.openness);
  g.clear();

  // guide laterali: si vede sempre dove passa la saracinesca
  g.rect(x, y, 2, h).fill({ color: PAL.night0 });
  g.rect(x, y, 1, h).fill({ color: PAL.slate2 });
  g.rect(x + w - 2, y, 2, h).fill({ color: PAL.night0 });
  g.rect(x + w - 1, y, 1, h).fill({ color: PAL.slate1 });

  const shown = Math.round(h * (1 - e));
  if (shown >= 1) {
    const sx = x + 2, sw = w - 4;
    g.rect(sx, y, sw, shown).fill({ color: PAL.slate1 });
    // doghe
    for (let yy = y; yy < y + shown - 3; yy += 4) {
      g.rect(sx, yy, sw, 1).fill({ color: PAL.slate3 });
      g.rect(sx, yy + 1, sw, 2).fill({ color: PAL.slate2 });
      g.rect(sx, yy + 3, sw, 1).fill({ color: PAL.night1 });
    }
    // montante centrale con rivetti
    g.rect(sx + Math.floor(sw / 2) - 1, y, 2, shown).fill({ color: PAL.night2 });
    for (let yy = y + 2; yy < y + shown - 4; yy += 8) {
      g.rect(sx + Math.floor(sw / 2) - 1, yy, 1, 1).fill({ color: PAL.steel0 });
    }
    // bordo inferiore con strisce di pericolo
    const by = y + shown - 3;
    g.rect(sx, by, sw, 3).fill({ color: PAL.ink });
    for (let i = 0; i < sw; i++) {
      if ((i >> 1) % 2 === 0) g.rect(sx + i, by + 1, 1, 1).fill({ color: PAL.brass1 });
    }
    g.rect(sx, by, sw, 1).fill({ color: PAL.steel0 });
  }

  // cassonetto in cima, con la spia
  g.rect(x - 1, y - 4, w + 2, 4).fill({ color: PAL.night1 });
  g.rect(x - 1, y - 4, w + 2, 1).fill({ color: PAL.slate3 });
  g.rect(x, y - 1, w, 1).fill({ color: PAL.ink });
  const open = p.openness > 0.5;
  const lamp = open ? p.color : mixColor(PAL.ember0, PAL.alarm, 0.5 + 0.5 * Math.sin(time * 3));
  g.rect(x + w / 2 - 2, y - 3, 4, 2).fill({ color: lamp });
  sceneLights.put(x + w / 2, y - 2, 40, open ? p.color : PAL.alarm, open ? 0.6 : 0.3);

  // movimento: scintille sulle guide e vapore dal basso
  const prev = m['open'] ?? p.openness;
  const moving = Math.abs(p.openness - prev) > 0.004;
  if (moving && hash2(Math.floor(time * 30), 1, 9) < 0.5) {
    const by = y + shown;
    fxBus.emit({ type: 'sparks', x: x + 1, y: by, color: PAL.ember3, count: 1 });
    fxBus.emit({ type: 'sparks', x: x + w - 1, y: by, color: PAL.ember3, count: 1 });
  }
  if (p.openness > 0.02 && prev <= 0.02) {
    fxBus.emit({ type: 'puff', x: x + w / 2, y: y + h - 2, count: 6 });
    fxBus.emit({ type: 'flash', x: x + w / 2, y: y - 2, color: p.color, radius: 60, intensity: 0.6, life: 0.3 });
  }
  if (p.openness < 0.05 && prev >= 0.05) {
    // chiusura: tonfo
    fxBus.emit({ type: 'puff', x: x + 2, y: y + h - 1, count: 4, dir: -1 });
    fxBus.emit({ type: 'puff', x: x + w - 2, y: y + h - 1, count: 4, dir: 1 });
  }
  m['open'] = p.openness;
}

/* ------------------------------------------------------------------ *
 * SOLAIO FRAGILE — lastra di ghisa crepata. Le crepe covano una brace
 * debole, nel colore di GHISA: è lui che la può sfondare.
 * ------------------------------------------------------------------ */
export interface FragileTile { tx: number; ty: number; broken: boolean; shake: number }

export function drawFragile(g: Graphics, key: object, tiles: readonly FragileTile[], time: number): void {
  const m = mem(key);
  g.clear();
  const glow = 0.45 + 0.25 * Math.sin(time * 1.7);
  tiles.forEach((t, i) => {
    const flag = `b${i}`;
    if (t.broken) {
      if (!m[flag]) {
        m[flag] = 1;
        const cx = t.tx * TILE + TILE / 2, cy = t.ty * TILE + TILE / 2;
        fxBus.emit({ type: 'debris', x: cx, y: cy, color: PAL.rust1, count: 8, up: 60 });
        fxBus.emit({ type: 'debris', x: cx, y: cy, color: PAL.slate2, count: 6 });
        fxBus.emit({ type: 'puff', x: cx, y: cy + 4, count: 5 });
        fxBus.emit({ type: 'flash', x: cx, y: cy, color: PAL.ember2, radius: 50, intensity: 0.6, life: 0.3 });
      }
      return;
    }
    const x = t.tx * TILE + Math.round(Math.sin(time * 30 + t.tx) * t.shake * 1.4);
    const y = t.ty * TILE;
    const seed = t.tx * 7 + t.ty * 13;
    g.rect(x, y, TILE, TILE).fill({ color: PAL.rust0 });
    // grana della lastra
    for (let k = 0; k < 10; k++) {
      const gx = Math.floor(hash2(seed, k, 1) * TILE), gy = 4 + Math.floor(hash2(seed, k, 2) * (TILE - 5));
      g.rect(x + gx, y + gy, 1, 1).fill({ color: k < 5 ? PAL.rust1 : PAL.soot });
    }
    // bordo superiore consumato
    g.rect(x, y, TILE, 1).fill({ color: PAL.rust2 });
    g.rect(x, y + 1, TILE, 2).fill({ color: PAL.rust1 });
    g.rect(x, y + 3, TILE, 1).fill({ color: PAL.soot });
    // crepe a zigzag, con brace dentro
    const c1 = 3 + Math.floor(hash2(seed, 0, 3) * 5), c2 = 10 + Math.floor(hash2(seed, 0, 4) * 5);
    for (const cx0 of [c1, c2]) {
      let cx = cx0;
      for (let yy = 1; yy < TILE; yy++) {
        cx += hash2(seed + cx0, yy, 5) < 0.33 ? -1 : hash2(seed + cx0, yy, 6) < 0.5 ? 1 : 0;
        cx = clamp(cx, 1, TILE - 2);
        g.rect(x + cx, y + yy, 1, 1).fill({ color: PAL.ink });
        if (yy % 3 === 0) g.rect(x + cx, y + yy, 1, 1).fill({ color: PAL.ember1, alpha: glow * 0.9 });
      }
    }
    g.rect(x, y, 1, TILE).fill({ color: PAL.rust1 });
    g.rect(x + TILE - 1, y, 1, TILE).fill({ color: PAL.ink, alpha: 0.6 });
    g.rect(x, y + TILE - 1, TILE, 1).fill({ color: PAL.ink });
  });
}

/* ------------------------------------------------------------------ *
 * CORRENTE ASCENSIONALE — bocchetta con ventola alla base, strie d'aria
 * che salgono, granelli trascinati. Solo chi è leggero ci vola.
 * ------------------------------------------------------------------ */
export function drawUpdraft(
  g: Graphics, bounds: Rect, color: number, time: number,
  particles?: Particles, spark?: Texture, dt = 0,
): void {
  const { x, y, w, h } = bounds;
  g.clear();
  // colonna: velo leggero e due bordi tratteggiati che "scorrono" in su
  g.rect(x, y, w, h).fill({ color, alpha: 0.05 });
  g.rect(x, y + h - 40, w, 40).fill({ color, alpha: 0.04 });
  const dash = Math.floor(time * 20) % 6;
  for (let yy = y + ((6 - dash) % 6); yy < y + h; yy += 6) {
    g.rect(x, yy, 1, 3).fill({ color, alpha: 0.22 });
    g.rect(x + w - 1, yy, 1, 3).fill({ color, alpha: 0.22 });
  }
  // strie che salgono a velocità diverse
  for (let i = 0; i < 7; i++) {
    const speed = 0.35 + hash2(i, 0, 3) * 0.4;
    const phase = (time * speed + hash2(i, 1, 3)) % 1;
    const len = 6 + Math.floor(hash2(i, 2, 3) * 10);
    const sx = x + 2 + Math.floor(hash2(i, 3, 3) * (w - 4));
    const sy = Math.round(y + h - phase * h);
    const a = 0.5 * Math.sin(phase * Math.PI);
    g.rect(sx, sy, 1, len).fill({ color, alpha: a });
  }
  // bocchetta con ventola che gira (pale alternate)
  const by = y + h - 3;
  g.rect(x - 1, by, w + 2, 3).fill({ color: PAL.night0 });
  g.rect(x - 1, by, w + 2, 1).fill({ color: PAL.slate3 });
  const spin = Math.floor(time * 24) % 3;
  for (let i = 0; i < w; i++) {
    if ((i + spin) % 3 === 0) g.rect(x + i, by + 1, 1, 2).fill({ color: PAL.slate2 });
  }
  sceneLights.put(x + w / 2, by, 36, color, 0.3);
  if (particles && spark && Math.random() < dt * 22) {
    particles.emit({
      texture: spark, x: x + Math.random() * w, y: y + h - 4, count: 1,
      speed: [40, 80], angle: [-Math.PI / 2 - 0.15, -Math.PI / 2 + 0.15],
      life: [0.6, 1.1], scale: [0.05, 0.09], tint: color, additive: true, drag: 0.4,
    });
  }
}
