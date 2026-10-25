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

## Gli oggetti

Ogni personaggio ha un oggetto suo, costruito sulla Bilancia e sul proprio
ruolo. Uno **trattiene** la massa, l'altro la **trasforma in movimento**.

**ZAVORRA (GHISA)** — un blocco di ghisa portato sulla schiena. Posato a
terra, GHISA ci scarica dentro tutta la sua massa: il blocco pesa quanto
pesava lui, preme le piastre da solo e fa da gradino. È l'unico modo per
essere **leggeri tutti e due** nello stesso momento. In cambio GHISA resta
senza Schianto finché non torna a riprenderlo: è troppo pesante per essere
richiamato a distanza.

**MANTICE (SOFFIO)** — un mantice pneumatico basso. Un corpo pesante che ci
atterra sopra lo carica (lo Schianto di GHISA lo riempie quasi del tutto);
chi ci salta sopra quando è carico viene sparato in alto con tutta l'energia
accumulata, e a parità di energia più è leggero più vola. Chi pesa lo carica,
chi è leggero lo usa. È leggero: SOFFIO lo richiama da qualsiasi distanza,
ma così perde la carica.

**CASSE** — pesano 0,35. Per spingerle serve un peso di 0,3 per ogni cassa
della fila: due casse a contatto si spingono insieme e chiedono 0,6, e se si
spinge in due dallo stesso lato i pesi si sommano. Chi è pesante le spinge più
svelto. Lo Schianto di GHISA vicino a una cassa la sbalza via: è il modo di
separarne due incastrate contro un muro. Le piastre sommano il peso di tutto
ciò che ci sta sopra: due casse bastano, oppure una cassa più un giocatore
leggero.

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
Tasto abilità **a terra** = posa, riprendi o richiama il proprio oggetto;
**in aria** = Schianto o Scatto.

Livelli: `Shift+N` passa al successivo, oppure `?level=0` (Laboratorio) e
`?level=1` (Sandbox 01) nell'URL.

`F1` pannello diagnostico · `Shift+R` respawn di entrambi.

I binding usano `KeyboardEvent.code`, cioè la **posizione fisica** del tasto:
funzionano identici su layout italiano, americano o altro.

## Com'è fatto

```
src/
  core/      loop a timestep fisso, input, matematica
  render/    pipeline, split-screen, luci, post, effetti, tema; art/ = arte in codice
  game/      tilemap+collisioni, player, porta ad accordo, livelli
  ui/        HUD e overlay di debug
```

Punti non ovvi:

- **Loop a passo fisso** (1/120 s) con interpolazione in rendering: la fisica
  è identica su 60 e 144 Hz, il disegno resta fluido.
- **Split-screen**: il mondo viene disegnato una volta per camera, a 1:1
  (un pixel di texture = un pixel di mondo), in una texture piccola che un
  quad ingrandisce allo zoom della camera con uno shader *sharp bilinear*:
  pixel tutti uguali a ogni zoom e camera che scorre di frazioni di pixel.
  Le due metà si ricompongono con due maschere poligonali. A `t = 0` le due
  camere coincidono, quindi la cucitura è invisibile e l'apertura non ha
  stacchi. La linea è perpendicolare al segmento fra i due personaggi e
  ruota con continuità. Isteresi sulle soglie per non far sfarfallare
  l'apertura.
- **Grafica**: tutto ciò che si vede è dipinto in codice (terreno, sfondi,
  personaggi, oggetti, particelle), con luci 2D a lightmap e un solo
  passaggio di post-processing a schermo (bloom, grading, vignettatura,
  grana, onde d'urto). Direzione, ricerca e dettagli tecnici in
  [`docs/GRAFICA.md`](docs/GRAFICA.md); colori in `src/render/theme.ts`.
- **Terreno "cotto"**: dipinto pixel per pixel in un'unica texture (niente
  tile accostati, quindi niente fessure né ripetizioni).
- **Feel del salto**: coyote time, jump buffer, salto variabile, gravità
  ridotta all'apice, squash & stretch, polvere all'atterraggio.

## Strumenti di sviluppo

- `/art.html` — kit artistico: Zavorra, Mantice e Casse in tutti gli stati,
  più il foglio dei personaggi (`?zoom=8&cx=..&cy=..` per ingrandire).
- `__gfx.inspectWorld(x, y, w, h)` in console: zona del mondo ingrandita
  dall'ultimo frame; `__gfx.post.settings`, `__gfx.lights.ambient` per
  regolare il look dal vivo.
- `/tileset.html`, `/striptest.html` — strumenti del vecchio tileset Kenney
  (non più usato a schermo).
- In console: `__tandem.teleport(0, x, y)`, `__tandem.setMass(0.9)` (massa di GHISA),
  `__tandem.ballast`, `__tandem.bellows`, `__tandem.crates`,
  e `__tandem.game.fixedUpdate(1/120)` per far avanzare la fisica a mano
  (utile per provare una meccanica senza giocare in tempo reale).

## Asset

L'arte a schermo è generata in codice (nessun file nuovo). Restano nel
progetto, da Kenney (CC0, pubblico dominio): Pixel Platformer, Pixel
Platformer Industrial Expansion, Particle Pack, UI Pack Pixel Adventure,
Interface Sounds; le texture delle particelle servono solo da "chiavi" per
gli stili pixel art (vedi `src/render/particles.ts`).

Carattere dell'HUD: [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch)
(Cadson Demak, SIL Open Font License 1.1), caricato da Google Fonts.
