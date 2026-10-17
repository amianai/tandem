import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { clamp, damp } from '../core/math';

const FONT = '"Press Start 2P", monospace';

const style = (size: number, color: number, alpha = 1): TextStyle =>
  new TextStyle({
    fontFamily: FONT, fontSize: size, fill: { color, alpha }, letterSpacing: 1,
    lineHeight: Math.round(size * 1.8), align: 'center',
  });

/** Tastino disegnato: cornice + lettera, per la legenda dei comandi. */
function keycap(label: string, color: number): Container {
  const c = new Container();
  const text = new Text({ text: label, style: style(8, 0xf2f5ff) });
  const w = Math.max(16, text.width + 10);
  const h = 16;
  const g = new Graphics();
  g.roundRect(0, 0, w, h, 3).fill({ color: 0x11142b, alpha: 0.9 }).stroke({ width: 1, color, alpha: 0.8 });
  g.roundRect(1.5, 1.5, w - 3, h - 5, 2).stroke({ width: 1, color: 0xffffff, alpha: 0.07 });
  text.position.set((w - text.width) / 2, (h - text.height) / 2 - 1);
  c.addChild(g, text);
  return c;
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

  constructor(
    private width: number,
    private height: number,
    levelName: string,
    players: readonly HudPlayerInfo[],
  ) {
    this.container.label = 'hud';
    this.container.eventMode = 'none';

    this.levelText = new Text({ text: levelName.toUpperCase(), style: style(8, 0x7d8cc4) });
    this.levelText.position.set(16, 14);

    this.gemText = new Text({ text: '', style: style(10, 0x8fe3ff) });
    this.gemText.position.set(16, 30);

    this.promptText = new Text({ text: '', style: style(9, 0xfff2c4) });
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

    this.buildLegend(players);
    this.container.addChild(
      this.levelText, this.gemText, this.legend, this.massBar.container, this.promptBox,
      ...this.status,
    );
  }

  private buildLegend(players: readonly HudPlayerInfo[]): void {
    this.legend.removeChildren();
    players.forEach((p, i) => {
      const group = new Container();
      const name = new Text({ text: p.name, style: style(8, p.color) });
      group.addChild(name);
      let x = name.width + 10;
      for (const k of p.keys) {
        const cap = keycap(k, p.color);
        cap.position.set(x, -4);
        group.addChild(cap);
        x += cap.width + 4;
      }
      group.position.set(i === 0 ? 16 : this.width - x - 16, this.height - 26);
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
      this.promptBg.clear()
        .roundRect(0, 0, w, h, 6).fill({ color: 0x0b0d16, alpha: 0.82 })
        .roundRect(0.5, 0.5, w - 1, h - 1, 6).stroke({ width: 1, color: 0xfff2c4, alpha: 0.35 });
      this.promptText.position.set(14, (h - this.promptText.height) / 2);
      // In alto, sotto la barra della massa: in basso coprirebbe i personaggi,
      // che in un platform stanno quasi sempre nella metà inferiore.
      this.promptBox.position.set((this.width - w) / 2, 66);
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
