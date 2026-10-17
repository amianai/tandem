# TANDEM — prototipo

Gioco co-op per **due giocatori su una sola tastiera**, che gira nel browser.
Piattaforme a livelli con round brevi, schermo unico che **si divide da solo**
quando i due si allontanano.

## La Bilancia

I due personaggi si dividono **una quantità di massa costante**: tutto quello
che uno guadagna, l'altro lo perde. Tenendo premuto il proprio tasto azione
tiri massa verso di te; premendolo *insieme* all'altro, le due masse si
invertono di colpo.

- **Pesante** — lento, salto corto, ma preme le piastre e sfonda.
- **Leggero** — salto altissimo, planata, ma non sposta niente e vola via.

I due ruoli sono fissi e specularmente inutili da soli:

| | abilità | condizione |
|---|---|---|
| **GHISA** (P1) | Schianto: onda d'urto che sfonda i solai fragili | solo se **pesante** |
| **SOFFIO** (P2) | Scatto aereo | solo se **leggero** |

Siccome la massa è una sola, non possono mai essere entrambi al massimo della
propria forma: ogni azione va negoziata.

## Avvio

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # typecheck + bundle in dist/
```

## Comandi

| | movimento | salto | tira massa | abilità |
|---|---|---|---|---|
| **GHISA** | `A` `D` | `W` | `Q` | `E` |
| **SOFFIO** | `←` `→` | `↑` | `.` | `-` |

`Q` + `.` premuti **insieme** = inversione delle masse.

`F1` pannello diagnostico · `Shift+R` respawn di entrambi.

I binding usano `KeyboardEvent.code`, cioè la **posizione fisica** del tasto:
funzionano identici su layout italiano, americano o altro.

## Com'è fatto

```
src/
  core/      loop a timestep fisso, input, matematica
  render/    assets, camere, split-screen, particelle, sfondo
  game/      tilemap+collisioni, player, porta ad accordo, livelli
  ui/        HUD e overlay di debug
```

Punti non ovvi:

- **Loop a passo fisso** (1/120 s) con interpolazione in rendering: la fisica
  è identica su 60 e 144 Hz, il disegno resta fluido.
- **Split-screen**: il mondo viene disegnato due volte su due render texture,
  ricomposte con due maschere poligonali. A `t = 0` le due camere coincidono,
  quindi la cucitura è invisibile e l'apertura non ha stacchi. La linea è
  perpendicolare al segmento fra i due personaggi e ruota con continuità.
  Isteresi sulle soglie per non far sfarfallare l'apertura.
- **Tile "cotti"**: i tile vengono renderizzati una volta sola in un'unica
  texture. A zoom non interi, sprite adiacenti lascerebbero fessure di 1px.
- **Autotiling**: ogni set del tileset Kenney è
  `[singolo, bordo sinistro, centro, bordo destro]`; solo il *centro* si
  ripete senza cuciture (verificato con `/striptest.html`).
- **Feel del salto**: coyote time, jump buffer, salto variabile, gravità
  ridotta all'apice, squash & stretch, polvere all'atterraggio.

## Strumenti di sviluppo

- `/tileset.html` — tutti i tile con il loro indice numerico.
- `/striptest.html` — banco di prova per le cuciture fra tile.
- In console: `__tandem.teleport(0, x, y)`, `__tandem.mass.balance = 0.9`,
  e `__tandem.game.fixedUpdate(1/120)` per far avanzare la fisica a mano
  (utile per provare una meccanica senza giocare in tempo reale).

## Asset

Kenney (CC0, pubblico dominio): Pixel Platformer, Pixel Platformer Industrial
Expansion, Particle Pack, UI Pack Pixel Adventure, Interface Sounds.
