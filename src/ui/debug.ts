import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export interface DebugSnapshot {
  fps: number;
  splitT: number;
  distance: number;
  camZoom: number;
  players: readonly { vx: number; vy: number; onGround: boolean }[];
  heldKeys: number;
  mass: number;
}

/** Pannello diagnostico: F1 per accendere/spegnere. */
export class DebugOverlay {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly text: Text;
  visible = false;

  constructor() {
    this.container.label = 'debug';
    this.text = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0x9ef0c0, lineHeight: 15 }),
    });
    this.text.position.set(10, 8);
    this.container.addChild(this.bg, this.text);
    this.container.visible = false;
    this.container.eventMode = 'none';
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
  }

  update(s: DebugSnapshot): void {
    if (!this.visible) return;
    const p = s.players
      .map((pl, i) => `P${i + 1} vx ${pl.vx.toFixed(0).padStart(4)}  vy ${pl.vy.toFixed(0).padStart(4)}  ${pl.onGround ? 'suolo' : 'aria '}`)
      .join('\n');
    this.text.text =
      `fps      ${s.fps.toFixed(0)}\n` +
      `split    ${s.splitT.toFixed(2)}\n` +
      `distanza ${s.distance.toFixed(0)} px\n` +
      `zoom     ${s.camZoom.toFixed(2)}\n` +
      `tasti    ${s.heldKeys}\n` +
      `bilancia ${(1 - s.mass).toFixed(2)} | ${s.mass.toFixed(2)}\n` +
      p;
    this.bg.clear()
      .roundRect(0, 0, this.text.width + 20, this.text.height + 16, 4)
      .fill({ color: 0x000000, alpha: 0.6 });
  }
}
