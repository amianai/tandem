/**
 * TEMA GRAFICO — "Fonderia notturna".
 *
 * Unica fonte di verità per i colori. Tutto il resto (personaggi, terreno,
 * HUD, luci, post-processing) pesca da qui, così un ritocco di palette resta
 * coerente ovunque.
 *
 * Regole della palette (vedi docs/GRAFICA.md):
 * - l'ambiente vive nei blu-ardesia desaturati e scuri: non compete mai con i
 *   giocatori;
 * - i due giocatori sono le uniche due tinte sature e complementari
 *   (arancio brace / ciano aria): coppia leggibile anche per deuteranopi e
 *   protanopi, e distinguibile a colpo d'occhio a schermo diviso;
 * - i meccanismi usano una terza tinta di segnale (lime) che non si confonde
 *   con nessuno dei due; le gemme una quarta (viola).
 */

/** Palette ristretta: ogni colore usato a schermo dovrebbe venire da qui. */
export const PAL = {
  ink: 0x07080d,
  night0: 0x0c0e18,
  night1: 0x131626,
  night2: 0x1b1f33,
  slate0: 0x252a42,
  slate1: 0x30364f,
  slate2: 0x3e4562,
  slate3: 0x535b7c,
  steel0: 0x6c7696,
  steel1: 0x8e98b6,
  fog: 0xb3bdd4,
  bone: 0xece6d6,

  soot: 0x1a1716,
  rust0: 0x3b2522,
  rust1: 0x5e3427,
  rust2: 0x8c4a2e,
  brass0: 0x6e5a3a,
  brass1: 0xa88c55,
  brass2: 0xd8bf86,

  ember0: 0x7a1f12,
  ember1: 0xc8461c,
  ember2: 0xff7a2e,
  ember3: 0xffc27a,

  air0: 0x0f5370,
  air1: 0x1f93c2,
  air2: 0x4fd8ff,
  air3: 0xc4f4ff,

  signal0: 0x3d5a1e,
  signal1: 0xa6e34a,
  signal2: 0xe2ff9e,

  gem0: 0x5a2380,
  gem1: 0xb05cf0,
  gem2: 0xf0c4ff,

  alarm: 0xff4658,
} as const;

export type Role = 'ghisa' | 'soffio';

/** Le quattro tinte di un personaggio: corpo scuro, tinta piena, chiaro, luce. */
export interface RoleColors {
  /** Tinta identificativa: barra della massa, particelle, testi. */
  readonly main: number;
  readonly dark: number;
  readonly light: number;
  /** Colore della luce che il personaggio proietta nel mondo. */
  readonly glow: number;
}

export const ROLE_COLORS: Readonly<Record<Role, RoleColors>> = {
  ghisa: { main: PAL.ember2, dark: PAL.ember1, light: PAL.ember3, glow: 0xff9a52 },
  soffio: { main: PAL.air2, dark: PAL.air1, light: PAL.air3, glow: 0x7fe2ff },
};

/** Colori dei giocatori, da importare in game.ts / HUD. */
export const P1_COLOR = ROLE_COLORS.ghisa.main;   // GHISA
export const P2_COLOR = ROLE_COLORS.soffio.main;  // SOFFIO

/** Colori dell'HUD. `zavorra` serve alla barra a tre segmenti. */
export const HUD_COLORS = {
  ghisa: P1_COLOR,
  soffio: P2_COLOR,
  zavorra: PAL.brass2,
  text: PAL.bone,
  textDim: PAL.steel0,
  panel: PAL.night0,
  panelEdge: PAL.slate2,
  prompt: PAL.brass2,
  gem: PAL.gem1,
} as const;

/** Elementi del livello. */
export const ELEMENT_COLORS = {
  signalOn: PAL.signal1,
  signalOff: PAL.ember0,
  plate: PAL.slate3,
  plateActive: PAL.signal1,
  gate: PAL.slate1,
  updraft: 0xa9d8ff,
  crack: PAL.ember2,
  gem: PAL.gem1,
  goal: PAL.signal2,
  dust: 0x8a8fa6,
} as const;

/** Mondo: luce ambiente (moltiplicata) e colori di sfondo/nebbia. */
export const WORLD = {
  /** Luce ambiente: quanto resta visibile lontano da ogni sorgente. */
  ambient: 0x969dc0,
  sky: [PAL.night0, PAL.night1, 0x1e1a2e, 0x2e1c26] as const,
  fog: 0x39405c,
  horizon: 0x5a2a24,
  moon: 0xdde4f2,
} as const;

/** Scompone un colore 0xRRGGBB in [r, g, b] 0..1. */
export function rgb01(c: number): [number, number, number] {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

/** Interpolazione lineare fra due colori 0xRRGGBB. */
export function mixColor(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
