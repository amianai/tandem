import { Assets, Rectangle, Texture, TextureSource } from 'pixi.js';

export const TILE = 18;      // px del tileset terreno
export const CHAR = 24;      // px del tileset personaggi

export interface Sheets {
  terrain: Texture[];
  characters: Texture[];
  backgrounds: Texture[];
  industrial: Texture[];
  particles: Record<string, Texture>;
}

/** Taglia uno spritesheet a griglia regolare in texture indipendenti. */
function slice(base: Texture, tileW: number, tileH: number): Texture[] {
  const cols = Math.floor(base.width / tileW);
  const rows = Math.floor(base.height / tileH);
  const out: Texture[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      out.push(new Texture({
        source: base.source,
        frame: new Rectangle(x * tileW, y * tileH, tileW, tileH),
      }));
    }
  }
  return out;
}

const PARTICLE_FILES = ['circle_05', 'star_08', 'spark_04', 'smoke_08', 'light_01', 'trace_01'];

export async function loadAssets(): Promise<Sheets> {
  // Pixel art: nessuna interpolazione, mai.
  TextureSource.defaultOptions.scaleMode = 'nearest';

  const [terrain, characters, backgrounds, industrial] = await Promise.all([
    Assets.load<Texture>('/assets/tiles/terrain.png'),
    Assets.load<Texture>('/assets/tiles/characters.png'),
    Assets.load<Texture>('/assets/tiles/backgrounds.png'),
    Assets.load<Texture>('/assets/tiles/industrial.png'),
  ]);

  const particleTextures = await Promise.all(
    PARTICLE_FILES.map((n) => Assets.load<Texture>(`/assets/particles/${n}.png`)),
  );
  const particles: Record<string, Texture> = {};
  PARTICLE_FILES.forEach((n, i) => { particles[n] = particleTextures[i]!; });

  return {
    terrain: slice(terrain, TILE, TILE),
    characters: slice(characters, CHAR, CHAR),
    backgrounds: slice(backgrounds, CHAR, CHAR),
    industrial: slice(industrial, TILE, TILE),
    particles,
  };
}

/* ------------------------------------------------------------------ *
 * Indici nel tileset Kenney "Pixel Platformer" (20 colonne x 9 righe).
 * Nomi nostri, così i livelli non contengono numeri magici.
 * (indice = riga * 20 + colonna; /tileset.html li mostra a schermo)
 * ------------------------------------------------------------------ */
/** Un set orizzontale: tappo sinistro, centro ripetibile, tappo destro, tile isolato. */
export interface TileSet {
  readonly single: number;
  readonly left: number;
  readonly mid: number;
  readonly right: number;
}

export const TILES = {
  grass:   { single: 0,   left: 1,   mid: 2,   right: 3 } satisfies TileSet,
  dirt:    { single: 120, left: 121, mid: 122, right: 123 } satisfies TileSet,
  /** Set con bordi anche sopra e sotto: per blocchi isolati, non per riempire. */
  dirtBlock: { single: 140, left: 141, mid: 142, right: 143 } satisfies TileSet,
  beam:    { single: 47,  left: 48,  mid: 49,  right: 50 } satisfies TileSet,
  gem: 67,
  coin: 151,
  spike: 68,
  flag: 111,
} as const;

/** Sceglie il tile giusto in base a cosa c'è a sinistra e a destra. */
export function pickTile(set: TileSet, leftOpen: boolean, rightOpen: boolean): number {
  if (leftOpen && rightOpen) return set.single;
  if (leftOpen) return set.left;
  if (rightOpen) return set.right;
  return set.mid;
}

/** Frame dei personaggi: 2 pose per colore (idle + passo). */
export const CHARS = {
  green:  [0, 1],
  blue:   [2, 3],
  pink:   [4, 5],
  yellow: [6, 7],
} as const;

export type CharColor = keyof typeof CHARS;
