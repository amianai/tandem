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

## I gadget: Braci & Tiraggio

Una regola: **GHISA arma, SOFFIO accende, il leggero decolla.**

**BRACI (GHISA, `E`, a terra e in aria)** — lancia una brace che si attacca
alla prima superficie che tocca: muro, soffitto, pavimento, cassa. Con `W`
tenuto la lancia in alto, con `S` la lascia ai piedi (in aria: in picchiata).
Ne ha 3 in riserva, una nuova ogni 0,7 s; al massimo 3 accese nel mondo. Più
GHISA è pesante, più la brace è grossa (scoppio più ampio) ma vola meno.

**TIRAGGIO (SOFFIO, `-`)** — a terra soffia un cono d'aria: le braci nel cono
si accendono una dopo l'altra e scoppiano. Con `↓` soffia verso il basso
(anche in aria). In aria, se è leggero, `-` resta lo Scatto: attraversare una
brace la accende e allunga lo Scatto. Leggero = getto lungo e stretto,
pesante = corto, largo e più forte. Il soffio spinge le casse, gli Scoriatori e
il compagno **se è in aria** (chi plana può essere soffiato oltre un baratro).

**Lo scoppio** non ferisce mai: spinge, tanto più forte quanto più sei
leggero, sempre almeno per metà verso l'alto. Accende le braci vicine (micce),
sbalza le casse, abbatte i muri di loppa, accende i fornelli. Brace ai piedi
di SOFFIO leggerissimo + soffio verso il basso = **razzo** di ~10 tile. Lo
Schianto di GHISA accende le braci a terra lì intorno.

## Il fattore morte

- Si muore nella **scoria**, nel **vuoto**, sotto un **maglio** e toccando uno
  **Scoriatore**. La **lamiera** cede sotto chi è
  pesante, lo **sfiato** di vapore spinge via i leggeri (il pesante davanti fa
  da scudo): spesso si muore per una spinta finita male.
- Chi muore diventa uno **spirito** (Tizzone per GHISA, Sbuffo per SOFFIO) e lo
  guida con i propri tasti di direzione: vola, attraversa i pericoli, non i
  muri. Intanto la Bilancia è ferma.
- **Si rinasce in due**: spirito vicino al compagno e `Q` + `.` insieme. Se
  l'accordo cade sul battito dello spirito la rinascita è **perfetta** (riserve
  ricaricate, un secondo di invulnerabilità). Oppure a distanza col gadget:
  SOFFIO soffia sul Tizzone, GHISA centra lo Sbuffo con una brace (o uno
  scoppio).
- Bandiera e **forge** (checkpoint) vogliono tutti e due vivi. Se morite
  entrambi: "colata persa", si riparte dall'ultima forgia accesa.

## Risonanza e Fusione

Sotto la Bilancia c'è una barra d'oro, la **Risonanza**: si riempie con quello
che fate insieme. Razzi (+22%), scoppi, fornelli accesi, Scoriatori sciolti,
gemme, inversioni e soprattutto rinascite (perfette +30%). Ogni razzo
riuscito fa anche trattenere il fiato al mondo: un istante di tempo sospeso.

Quando la Risonanza è piena, standovi vicini, l'accordo `Q` + `.` non inverte
le masse: **vi fonde in un solo personaggio, TANDEM**. GHISA è il corpo, SOFFIO
il motore:

| | cosa comanda |
|---|---|
| **GHISA** | `A` `D` cammina, `W` salta, `S` in aria Schianto, `E` **spara** |
| **SOFFIO** | frecce **mirano**, `-` **getto** di vapore nella direzione del mirino (3, si ricaricano a terra), `.` tenuto **vela** (caduta lenta) |

Cosa ci guadagnate:

- **un corpo pesante che vola**: pesa quanto tutti e due insieme (preme ogni
  piastra, lo Schianto sfonda), ma con i getti sale di oltre 200 px;
- **il cannone**: la brace parte dritta dove mira SOFFIO e scoppia all'impatto,
  senza bisogno del soffio: loppa, fornelli e Scoriatori da lontano;
- **lo scudo**: un colpo mortale (scoria, maglio, Scoriatore) spezza la lega
  invece di uccidere, e vi sbalza fuori separati e intoccabili per un attimo.

Ci si separa con lo stesso accordo, oppure da soli dopo 12 secondi.

## La campagna

Tre livelli brevi, uno dopo l'altro, senza suggerimenti a schermo: ognuno
introduce una cosa nuova e la combina con le precedenti. Finito l'ultimo,
schermata di vittoria con tempo, gemme, cadute e rinascite perfette.

1. **Il Crogiolo** — il fuoco: loppa, fornelli, razzo (anche per GHISA),
   Schianto che accende le braci.
2. **Le Presse** — il **maglio**: pressa a ciclo che schiaccia; una piastra
   collegata lo blocca in alto, e quello che schiaccia (braci comprese) scoppia.
3. **La Colata** — lo **Scoriatore**: grumo di scoria che pattuglia e brucia
   al contatto. Non si colpisce: il soffio (più forte se SOFFIO è pesante) o uno
   scoppio lo spingono nella scoria. Lo Schianto vicino lo stordisce.

Il **lingotto** è una cassa di ghisa da 0,6: da solo basta a una piastra, ma lo
sposta solo chi è pesante. I personaggi salgono da soli i gradini di pochi
pixel (bordi delle fosse, casse a filo del pavimento).

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
| **GHISA** | `A` `D` | `W` | `Q` | `E` brace · `S` in aria = Schianto |
| **SOFFIO** | `←` `→` | `↑` | `.` | `-` soffio · in aria Scatto |

`Q` + `.` premuti **insieme** = inversione delle masse.
Mentre uno dei due è morto, `Q` + `.` insieme fanno rinascere.

Livelli: `?level=0..2` campagna (Crogiolo, Presse, Colata), `?level=3` La
Fornace (prova), `?level=4` Sandbox 01. `Shift+N` passa al successivo. `Shift+R` riparte dall'ultima forgia.

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
  `__tandem.embers`, `__tandem.kill(0)`, `__tandem.crates`,
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
