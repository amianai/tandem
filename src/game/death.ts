import { Container, Graphics } from 'pixi.js';
import { lerp, type Rect } from '../core/math';
import type { PlayerInput } from '../core/input';
import { sceneLights } from '../render/lighting';
import { PAL, ROLE_COLORS } from '../render/theme';
import type { Role } from './player';
import type { Tilemap } from './tilemap';

/**
 * LO SPIRITO — quello che resta di chi muore.
 *
 * Non c'è una schermata di morte: chi muore continua a giocare, guidando il
 * proprio spirito (GHISA diventa il Tizzone, SOFFIO lo Sbuffo) verso il
 * compagno. Vola senza gravità, attraversa i pericoli ma non i muri. Per
 * rinascere servono tutti e due: l'accordo Q + . quando lo spirito è vicino,
 * oppure il gadget del compagno. Lo spirito pulsa a tempo: un accordo sul
 * battito è una rinascita perfetta.
 */
export class Spirit {
  static readonly SPEED = 4.5 * 18;
  static readonly BEAT = 0.8;
  static readonly BEAT_WINDOW = 0.1;
  /** Oltre questa distanza dal compagno lo spirito accelera. */
  static readonly FAR = 260;
  static readonly SIZE = 8;

  readonly view = new Container();
  private readonly gfx = new Graphics();
  active = false;
  x = 0; y = 0;
  prevX = 0; prevY = 0;
  private born = 0;
  private clock = 0;

  constructor(readonly role: Role) {
    this.view.addChild(this.gfx);
    this.view.visible = false;
  }

  get box(): Rect {
    const s = Spirit.SIZE;
    return { x: this.x - s / 2, y: this.y - s / 2, w: s, h: s };
  }

  spawn(x: number, y: number): void {
    this.active = true;
    this.x = x; this.y = y; this.prevX = x; this.prevY = y;
    this.born = this.clock;
    this.view.visible = true;
  }

  hide(): void { this.active = false; this.view.visible = false; }

  /** 0 sul battito, poi cresce fino a BEAT. */
  get beatAge(): number { return (this.clock - this.born) % Spirit.BEAT; }

  /** L'accordo cade sul battito (± finestra)? */
  get onBeat(): boolean {
    const a = this.beatAge;
    return a <= Spirit.BEAT_WINDOW || a >= Spirit.BEAT - Spirit.BEAT_WINDOW;
  }

  update(dt: number, input: PlayerInput, map: Tilemap, partner: { x: number; y: number }): void {
    this.clock += dt;
    if (!this.active) return;
    this.prevX = this.x; this.prevY = this.y;
    const far = Math.hypot(partner.x - this.x, partner.y - this.y) > Spirit.FAR;
    const speed = Spirit.SPEED * (far ? 2 : 1);
    const ix = input.moveX;
    const iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(ix, iy) || 1;
    this.moveAxis((ix / len) * speed * dt, 0, map);
    this.moveAxis(0, (iy / len) * speed * dt, map);
    this.x = Math.max(4, Math.min(map.pixelWidth - 4, this.x));
    this.y = Math.max(4, Math.min(map.pixelHeight - 4, this.y));
  }

  private moveAxis(dx: number, dy: number, map: Tilemap): void {
    if (dx === 0 && dy === 0) return;
    const nx = this.x + dx, ny = this.y + dy;
    const s = Spirit.SIZE;
    if (!map.overlapsSolid({ x: nx - s / 2, y: ny - s / 2, w: s, h: s })) { this.x = nx; this.y = ny; }
  }

  draw(alpha: number, time: number, nearPartner: boolean): void {
    const g = this.gfx;
    g.clear();
    if (!this.active) return;
    const x = Math.round(lerp(this.prevX, this.x, alpha));
    const y = Math.round(lerp(this.prevY, this.y, alpha) + Math.sin(time * 3) * 1.5);
    const beat = 1 - this.beatAge / Spirit.BEAT;          // 1 sul battito, poi cala
    const pulse = beat * beat;
    const c = ROLE_COLORS[this.role];

    // anello del battito: si stringe verso il centro, e quando tocca è il momento
    const ring = 4 + (1 - pulse) * 10;
    g.circle(x, y, ring).stroke({ width: 1, color: c.light, alpha: 0.25 + pulse * 0.6 });

    if (this.role === 'ghisa') {
      // Tizzone: una brace con due occhi
      g.circle(x, y, 5 + pulse).fill({ color: PAL.ember0 });
      g.circle(x, y, 4 + pulse).fill({ color: PAL.ember1 });
      g.circle(x - 1, y - 1, 2.2).fill({ color: PAL.ember3, alpha: 0.8 });
      g.poly([x - 3, y - 4, x, y - 10 - pulse * 2, x + 3, y - 4]).fill({ color: PAL.ember2, alpha: 0.8 });
    } else {
      // Sbuffo: un anello di vapore con due occhi
      g.circle(x, y, 5.5 + pulse).stroke({ width: 2.5, color: PAL.air2, alpha: 0.9 });
      g.circle(x, y, 3).fill({ color: PAL.air3, alpha: 0.35 });
    }
    g.rect(x - 2, y - 1, 1, 2).fill({ color: PAL.ink });
    g.rect(x + 1, y - 1, 1, 2).fill({ color: PAL.ink });

    if (nearPartner) {
      // a portata di accordo: i due tasti sopra la testa
      const a = 0.6 + 0.4 * pulse;
      g.roundRect(x - 13, y - 25, 10, 9, 2).fill({ color: PAL.night0, alpha: 0.85 })
        .stroke({ width: 1, color: ROLE_COLORS.ghisa.main, alpha: a });
      g.roundRect(x + 3, y - 25, 10, 9, 2).fill({ color: PAL.night0, alpha: 0.85 })
        .stroke({ width: 1, color: ROLE_COLORS.soffio.main, alpha: a });
      g.rect(x - 9, y - 22, 2, 3).fill({ color: ROLE_COLORS.ghisa.main });   // Q
      g.rect(x + 7, y - 20, 2, 2).fill({ color: ROLE_COLORS.soffio.main });  // .
    }
    sceneLights.put(x, y, 46 + pulse * 20, c.glow, 0.7 + pulse * 0.5);
  }
}
