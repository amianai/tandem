import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { clamp, damp } from '../core/math';
import { HUD_COLORS, PAL } from '../render/theme';

/**
 * Stile dell'HUD: un carattere tecnico e squadrato (Chakra Petch), maiuscolo
 * e spaziato, su targhette scure con un filo d'accento. Niente fumetti né
 * arrotondamenti morbidi: deve sembrare la strumentazione della fonderia.
 * Le dimensioni passate a `style` restano quelle storiche (pensate per il
 * vecchio carattere pixel): qui vengono riscalate.
 */
const FONT = '"Chakra Petch", "Rajdhani", system-ui, sans-serif';
const SIZE_K = 1.55;

const style = (size: number, color: number, alpha = 1, weight: '500' | '700' = '500'): TextStyle =>
  new TextStyle({
    fontFamily: FONT, fontSize: Math.round(size * SIZE_K), fontWeight: weight,
    fill: { color, alpha }, letterSpacing: 1.5,
    lineHeight: Math.round(size * SIZE_K * 1.35), align: 'center',
  });

/** Tastino: placca scura con il bordo del colore del giocatore e lo spessore sotto. */
function keycap(label: string, color: number): Container {
  const c = new Container();
  const text = new Text({ text: label, style: style(8, HUD_COLORS.text, 1, '700') });
  const w = Math.max(20, Math.round(text.width) + 12);
  const h = 20;
  const g = new Graphics();
  g.rect(0, 2, w, h - 2).fill({ color: PAL.ink, alpha: 0.9 });                  // spessore
  g.rect(0, 0, w, h - 3).fill({ color: PAL.night1, alpha: 0.95 });
  g.rect(0, 0, w, 1).fill({ color, alpha: 0.9 });                               // filo d'accento
  g.rect(0, 0, 1, h - 3).fill({ color: PAL.slate2, alpha: 0.8 });
  g.rect(w - 1, 0, 1, h - 3).fill({ color: PAL.ink, alpha: 0.8 });
  text.position.set(Math.round((w - text.width) / 2), Math.round((h - 3 - text.height) / 2));
  c.addChild(g, text);
  return c;
}

/** Targhetta scura con il filo d'accento a sinistra. */
function plate(g: Graphics, x: number, y: number, w: number, h: number, accent: number): void {
  g.rect(x, y, w, h).fill({ color: PAL.night0, alpha: 0.78 });
  g.rect(x, y, 2, h).fill({ color: accent });
  g.rect(x + 2, y, w - 2, 1).fill({ color: PAL.slate2, alpha: 0.7 });
  g.rect(x + 2, y + h - 1, w - 2, 1).fill({ color: PAL.ink, alpha: 0.9 });
}

export interface HudPlayerInfo {
  name: string;
  color: number;
  keys: readonly string[];
}

/**
 * La barra della Bilancia: la massa totale divisa fra GHISA (da sinistra),
 * la Zavorra (al centro, quando è posata) e SOFFIO (da destra). Le tacche
 * segnano le soglie; il nome di ciascuno si accende quando la sua abilità
 * è disponibile (GHISA pesante, SOFFIO leggero).
 */
class MassBar {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  private readonly labelA: Text;
  private readonly labelB: Text;
  private readonly labelBallast: Text;
  private shownA = 0.5;
  private shownBallast = 0;
  private flash = 0;

  static readonly W = 330;
  static readonly H = 13;

  constructor(private readonly colorA: number, private readonly colorB: number,
              nameA: string, nameB: string) {
    this.labelA = new Text({ text: nameA, style: style(8, colorA) });
    this.labelB = new Text({ text: nameB, style: style(8, colorB) });
    this.labelBallast = new Text({ text: 'ZAVORRA', style: style(7, 0xb8c0d6) });
    this.container.addChild(this.gfx, this.labelA, this.labelB, this.labelBallast);
  }

  place(centerX: number, y: number): void {
    this.container.position.set(centerX - MassBar.W / 2, y);
    this.labelA.position.set(0, -14);
    this.labelB.position.set(MassBar.W - this.labelB.width, -14);
  }

  update(dt: number, m1: number, ballast: number, m2: number,
         heavyAt: number, lightAt: number, flash: number): void {
    this.shownA = damp(this.shownA, m1, 18, dt);
    this.shownBallast = damp(this.shownBallast, ballast, 18, dt);
    this.flash = Math.max(flash, this.flash - dt * 3);

    const { W, H } = MassBar;
    const a = W * this.shownA;
    const b = a + W * this.shownBallast;
    const g = this.gfx;
    g.clear();
    g.roundRect(-2, -2, W + 4, H + 4, 4).fill({ color: 0x0b0d16, alpha: 0.72 });
    g.rect(0, 0, a, H).fill({ color: this.colorA, alpha: 0.9 });
    if (b - a > 0.5) {
      g.rect(a, 0, b - a, H).fill({ color: 0x5b6378 });
      for (let x = a + 2; x < b - 1; x += 5) g.rect(x, 2, 2, H - 4).fill({ color: 0x8b93a8, alpha: 0.6 });
    }
    g.rect(b, 0, W - b, H).fill({ color: this.colorB, alpha: 0.9 });

    // soglie: GHISA si misura da sinistra, SOFFIO da destra
    for (const [x, color] of [[W * lightAt, this.colorA], [W * heavyAt, this.colorA],
                              [W - W * lightAt, this.colorB], [W - W * heavyAt, this.colorB]] as const) {
      g.rect(x - 0.5, -3, 1, H + 6).fill({ color, alpha: 0.28 });
    }
    g.rect(a - 1.5, -4, 3, H + 8).fill({ color: 0xf4f7ff, alpha: 0.95 });
    if (b - a > 0.5) g.rect(b - 1.5, -4, 3, H + 8).fill({ color: 0xf4f7ff, alpha: 0.95 });

    if (this.flash > 0.01) {
      g.roundRect(-4, -4, W + 8, H + 8, 5)
        .stroke({ width: 2, color: 0xffffff, alpha: this.flash * 0.9 });
    }

    // nome acceso = abilità disponibile
    this.labelA.alpha = m1 >= heavyAt ? 1 : 0.4;
    this.labelB.alpha = m2 <= lightAt ? 1 : 0.4;
    this.labelBallast.visible = this.shownBallast > 0.04;
    this.labelBallast.position.set((a + b) / 2 - this.labelBallast.width / 2, H + 5);
  }
}

export class Hud {
  readonly container = new Container();
  private readonly gemText: Text;
  private readonly levelText: Text;
  private readonly promptBox = new Container();
  private readonly promptText: Text;
  private readonly promptBg = new Graphics();
  private promptAlpha = 0;
  private promptTarget = 0;
  private readonly legend = new Container();
  private readonly massBar: MassBar;
  private readonly status: [Text, Text];
  private readonly frame = new Graphics();
  /** Schermata "colata persa": velo scuro e scritta, sopra tutto. */
  private readonly lossLayer = new Container();
  private readonly lossBg = new Graphics();
  private readonly lossText: Text;

  constructor(
    private width: number,
    private height: number,
    levelName: string,
    players: readonly HudPlayerInfo[],
  ) {
    this.container.label = 'hud';
    this.container.eventMode = 'none';

    this.levelText = new Text({ text: levelName.toUpperCase(), style: style(8, HUD_COLORS.textDim, 1, '700') });
    this.levelText.position.set(28, 16);

    this.gemText = new Text({ text: '', style: style(9, HUD_COLORS.text, 1, '700') });
    this.gemText.position.set(44, 36);

    this.promptText = new Text({ text: '', style: style(9, HUD_COLORS.prompt) });
    this.promptBox.addChild(this.promptBg, this.promptText);
    this.promptBox.alpha = 0;

    this.massBar = new MassBar(
      players[0]!.color, players[1]!.color, players[0]!.name, players[1]!.name,
    );
    this.massBar.place(width / 2, 34);

    this.status = [
      new Text({ text: '', style: style(7, players[0]!.color) }),
      new Text({ text: '', style: style(7, players[1]!.color) }),
    ];

    this.lossText = new Text({ text: 'COLATA PERSA', style: style(28, HUD_COLORS.prompt, 1, '700') });
    this.lossText.anchor.set(0.5);
    this.lossText.position.set(width / 2, height / 2);
    this.lossBg.rect(0, 0, width, height).fill({ color: 0x07080d });
    this.lossLayer.addChild(this.lossBg, this.lossText);
    this.lossLayer.visible = false;

    this.resText = new Text({ text: 'RISONANZA', style: style(7, 0xa08a52) });

    this.buildLegend(players);
    this.container.addChild(this.resGfx, this.resText);
    this.container.addChild(
      this.frame, this.levelText, this.gemText, this.legend, this.massBar.container, this.promptBox,
      ...this.status, this.lossLayer,
    );
    this.drawFrame();
  }

  /** Targhetta del livello in alto a sinistra, con l'icona della gemma. */
  private drawFrame(): void {
    const g = this.frame.clear();
    plate(g, 16, 12, 196, 46, HUD_COLORS.gem);
    // gemma stilizzata
    const gx = 30, gy = 39;
    g.poly([gx, gy - 6, gx + 6, gy, gx, gy + 6, gx - 6, gy]).fill({ color: PAL.gem1 });
    g.poly([gx, gy - 6, gx, gy + 6, gx - 6, gy]).fill({ color: PAL.gem2 });
    g.rect(gx - 1, gy - 3, 1, 2).fill({ color: 0xffffff });
  }

  private buildLegend(players: readonly HudPlayerInfo[]): void {
    this.legend.removeChildren();
    players.forEach((p, i) => {
      const group = new Container();
      const tag = new Graphics();
      const name = new Text({ text: p.name, style: style(8, p.color, 1, '700') });
      name.position.set(10, Math.round((20 - name.height) / 2) - 1);
      tag.rect(0, 0, Math.round(name.width) + 18, 17).fill({ color: PAL.night0, alpha: 0.8 });
      tag.rect(0, 0, 3, 17).fill({ color: p.color });
      group.addChild(tag, name);
      let x = Math.round(name.width) + 26;
      for (const k of p.keys) {
        const cap = keycap(k, p.color);
        cap.position.set(x, -1);
        group.addChild(cap);
        x += cap.width + 4;
      }
      group.position.set(i === 0 ? 16 : this.width - x - 16, this.height - 30);
      this.legend.addChild(group);
    });
  }

  setGems(collected: number, total: number): void {
    this.gemText.text = `GEMME ${collected}/${total}`;
  }

  showPrompt(text: string): void {
    if (this.promptText.text !== text) {
      this.promptText.text = text;
      const w = this.promptText.width + 28;
      const h = this.promptText.height + 16;
      // pannello con staffe agli angoli, come una targa di cantiere
      const b = this.promptBg.clear()
        .rect(0, 0, w, h).fill({ color: PAL.night0, alpha: 0.86 })
        .rect(0, 0, w, 1).fill({ color: PAL.slate2, alpha: 0.6 })
        .rect(0, h - 1, w, 1).fill({ color: PAL.ink });
      const c = HUD_COLORS.prompt;
      for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as const) {
        b.rect(sx > 0 ? cx : cx - 8, sy > 0 ? cy : cy - 2, 8, 2).fill({ color: c, alpha: 0.85 });
        b.rect(sx > 0 ? cx : cx - 2, sy > 0 ? cy : cy - 8, 2, 8).fill({ color: c, alpha: 0.85 });
      }
      this.promptText.position.set(14, (h - this.promptText.height) / 2);
      // In alto, sotto la barra della massa: in basso coprirebbe i personaggi,
      // che in un platform stanno quasi sempre nella metà inferiore.
      this.promptBox.position.set((this.width - w) / 2, 80);
    }
    this.promptTarget = 1;
  }

  hidePrompt(): void { this.promptTarget = 0; }

  setMass(dt: number, m1: number, ballast: number, m2: number,
          heavyAt: number, lightAt: number, flash: number): void {
    this.massBar.update(dt, m1, ballast, m2, heavyAt, lightAt, flash);
  }

  /** Riga di stato dell'oggetto di ciascun giocatore, sopra la legenda. */
  setObjectStatus(i: 0 | 1, text: string): void {
    const t = this.status[i];
    if (t.text !== text) t.text = text;
    t.position.set(i === 0 ? 16 : this.width - t.width - 16, this.height - 44);
  }

  private victory = false;
  private readonly resGfx = new Graphics();
  private readonly resText: Text;
  private shownRes = 0;

  /**
   * La Risonanza: una sottile barra d'oro sotto la Bilancia. Piena = la
   * Fusione è pronta; durante la Fusione diventa il conto alla rovescia.
   */
  setResonance(dt: number, value: number, fusionLeft: number, time: number): void {
    this.shownRes = damp(this.shownRes, value, 10, dt);
    const W = 330, x = this.width / 2 - W / 2, y = 60;
    const g = this.resGfx.clear();
    g.roundRect(x - 2, y - 2, W + 4, 8, 3).fill({ color: 0x0b0d16, alpha: 0.72 });
    const gold = 0xffc94a;
    if (fusionLeft > 0) {
      const k = fusionLeft / 7;
      const blink = fusionLeft < 1.6 ? 0.45 + 0.55 * Math.abs(Math.sin(time * 14)) : 1;
      g.rect(x, y, W * k, 4).fill({ color: 0xfff1b8, alpha: blink });
      this.resText.text = `FUSIONE  ${fusionLeft.toFixed(1)}`;
      this.resText.style.fill = 0xfff1b8;
    } else {
      const full = value >= 1;
      const pulse = full ? 0.6 + 0.4 * Math.sin(time * 8) : 1;
      g.rect(x, y, W * this.shownRes, 4).fill({ color: gold, alpha: pulse });
      for (let i = 1; i < 4; i++) g.rect(x + (W * i) / 4, y, 1, 4).fill({ color: 0x0b0d16, alpha: 0.6 });
      this.resText.text = full ? 'RISONANZA PIENA  ·  Q + . INSIEME: FUSIONE' : 'RISONANZA';
      this.resText.style.fill = full ? 0xfff1b8 : 0xa08a52;
    }
    this.resText.position.set(this.width / 2 - this.resText.width / 2, y + 7);
  }

  /** Schermata di vittoria: resta finché non si ricomincia. */
  showVictory(text: string): void {
    this.victory = true;
    this.lossText.text = text;
    this.lossText.style.fontSize = 20;
    this.lossText.style.align = 'center';
    this.lossText.style.lineHeight = 34;
    this.lossLayer.visible = true;
    this.lossBg.alpha = 0.85;
    this.lossText.alpha = 1;
    this.lossText.scale.set(1);
  }

  /** 0 = invisibile, 1 = schermo coperto. */
  setLoss(alpha: number): void {
    if (this.victory) return;
    this.lossLayer.visible = alpha > 0.01;
    this.lossBg.alpha = Math.min(1, alpha) * 0.85;
    this.lossText.alpha = Math.min(1, alpha * 1.5);
    this.lossText.scale.set(1 + (1 - Math.min(1, alpha)) * 0.15);
  }

  update(dt: number): void {
    this.promptAlpha = damp(this.promptAlpha, this.promptTarget, 12, dt);
    this.promptBox.alpha = clamp(this.promptAlpha, 0, 1);
    this.promptBox.visible = this.promptAlpha > 0.01;
  }

  resize(width: number, height: number, players: readonly HudPlayerInfo[]): void {
    this.width = width;
    this.height = height;
    this.buildLegend(players);
  }
}
