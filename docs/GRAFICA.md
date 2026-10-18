# TANDEM — direzione grafica

Documento di lavoro: ricerca, tre direzioni possibili, quella scelta e come
è stata realizzata nel ramo `gfx`. Richiesta dell'utente, in sintesi: *meno
gioco per bambini, niente effetti da bambini, grafica curata e ragionata,
con un po' di swag; 2D (non 3D) con dettaglio, animazioni e principi di game
design; leggera*.

---

## 1. Cosa non andava

- **Personaggi**: due astronauti tondi con il casco a bolla (Kenney Pixel
  Platformer). Simpatici, ma sono esattamente "il gioco per bambini".
- **Ambiente**: tile di terra e prato arancio/verde saturi, cielo viola
  uniforme, due colline piatte. Nessuna profondità, nessuna luce.
- **Particelle**: texture morbide da 512 px rimpicciolite a 0.1. A zoom
  2–3 diventano macchie rumorose, fuori scala rispetto ai pixel del mondo
  (pixel di dimensioni diverse sullo stesso schermo: "mixel").
- **Zoom non intero** (2.05–3) con filtro *nearest*: pixel larghi a volte 2
  e a volte 3 px schermo, che sfarfallano quando la camera scorre.
- **Carattere dell'HUD**: Press Start 2P, il font "8-bit" per antonomasia.

---

## 2. Ricerca: cosa fanno i 2D curati

| Riferimento | Cosa prendere | Fonte |
|---|---|---|
| **Celeste** | Risoluzione bassissima (320x180) e luci 2D economiche: maschere per luce in una texture, due passaggi di GPU in tutto. Lo stato del personaggio si legge **sul personaggio** (i capelli di Madeline cambiano colore quando lo scatto è disponibile). | [Noel Berry, *Remaking Celeste's Lighting*](https://noelberry.ca/posts/celeste_lighting) |
| **Dead Cells** | Personaggi modellati e animati in 3D, poi renderizzati **piccoli e senza antialiasing** in pixel art, con normal map per la luce: animazione ricca senza ridisegnare a mano ogni fotogramma. | T. Vasseur, *Art Design Deep Dive: Using a 3D pipeline for 2D animation in Dead Cells* (Game Developer, [archivio](https://gamedeveloper.com/program/gama-archive)); [80.lv](https://80.lv/articles/case-study-dead-cells-character-art-pipeline/) |
| **Animal Well** | Pixel art disegnata a mano + strati di luce composti sopra, normal map, effetti simulati riportati "a soglia" dentro la palette per restare pixel art. | [PlayStation Blog](https://blog.playstation.com/?p=367113) |
| **Hyper Light Drifter** | Sfondi scuri e desaturati, accenti al neon pochi e ripetuti; sfumature morbide che piegano le regole della pixel art classica; coerenza di palette in tutto il mondo. | [A.V. Club](https://avclub.com/hyper-light-drifter-blended-past-and-present-to-become-1798255620) |
| **Sable** | Leggibilità prima di tutto: profondità costruita a strati con **luce, nebbia e linee**; la nebbia lontana è "fondamentale" per leggere la distanza. | [Game Developer](https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability) |
| **Inside / Limbo** | Atmosfera da volumetrie e nebbia, sagome scure in primo piano, colore usato con parsimonia. | [GDC: *Low Complexity, High Fidelity – INSIDE Rendering*](https://gdcvault.com/play/1023002/Low-Complexity-High-Fidelity-INSIDE) |
| **Katana Zero** | Pixel art + effetti intensi (bagliori, scossa dello schermo, schegge), palette neo-noir al neon. | [GamesBeat](https://gamesbeat.com/katana-zero-is-more-than-swords-and-style/) |
| **"Juice"** | Massimo riscontro per minimo input: squash & stretch, scossa, particelle, tween. Ma il juice va dosato: troppo toglie immersione. | [Jonasson & Purho, *Juice it or lose it*](https://www.gamedeveloper.com/design/video-is-your-game-juicy-enough-); [sintesi](https://roblog.co.uk/2024/03/juicy-games/); J. W. Nijman, *The Art of Screenshake* ([lista Kenney](https://kenney.nl/learn/must-see-videos-for-indie-developers), [analisi](https://infovore.org/?p=5275)) |
| **Camera** | Scossa "a trauma" (accumulo che decade, ampiezza al quadrato), traslazione + rotazione in 2D. Già usata nel gioco. | [S. Eiserloh, *Juicing Your Cameras With Math*](https://www.gamedeveloper.com/programming/video-sprucing-up-cameras-with-math) |
| **Luce 2D** | Lightmap: buffer nero (o colore ambiente), luci in somma additiva, poi moltiplicazione sulla scena. Normal map sugli sprite per luce direzionale. | [Construct](https://www.construct.net/fr/tutorials/multiple-colored-shadow-1107), [Unity Learn: 2D lighting for pixel art](https://learn.unity.com/course/2d-lighting-for-pixel-art/tutorial/improve-your-scene-s-quality), [SpriteIlluminator](https://www.codeandweb.com/spriteilluminator/tutorials/how-to-create-dynamically-lit-2d-scenes-for-unity) |
| **Pixel a zoom non intero** | Filtro "sharp bilinear": blocchi pieni e solo il bordo sfumato di un pixel schermo; niente sfarfallio. | [rsn8887/sharp-bilinear-shaders](https://github.com/rsn8887/sharp-bilinear-shaders/releases) (da TheMaister) |
| **PixiJS v8** | Filtri e shader personalizzati (`GlProgram`, `resources`), `pixi-filters` v6 compatibile con Pixi v8. | [Guida filtri v8](https://pixijs.com/8.x/guides/components/filters), [pixijs/filters](https://github.com/pixijs/filters) |

**Cosa NON fare** (i co-op da browser tipo *Fireboy & Watergirl*, *Bad
Ice-Cream*): colori primari pieni ovunque, contorni spessi e arrotondati,
facce sorridenti, fondali piatti senza piani, effetti "stellina" e
cuoricini. Il loro pregio da tenere è uno solo, ed è importante: **ogni
giocatore è un colore**, sempre, ovunque.

### Vincoli di game design per due giocatori a schermo diviso

1. **Ritrovarsi in un istante.** Tre segnali ridondanti per personaggio:
   *tinta* (complementari), *sagoma* (blocco squadrato contro figura
   sottile con sciarpa) e *luce propria* (ognuno si porta dietro la sua
   pozza di luce e un alone). Basta uno dei tre per riconoscersi.
2. **Daltonismo.** Arancio/ciano è la coppia più robusta per deuteranopia e
   protanopia; il vecchio verde acqua/rosa lo era molto meno.
3. **Gli effetti di uno non accecano l'altro.** Niente lampi a schermo
   intero: onde d'urto, aberrazione e bagliori sono locali all'epicentro e
   proiettati con la camera della metà giusta.
4. **Gerarchia visiva fissa.** Ambiente (scuro, desaturato) < meccanismi
   (acciaio + spia di segnale lime) < personaggi (saturi, illuminati).
5. **Lo stato si legge sul mondo**, non solo nell'HUD: massa sul corpo,
   carico sulle piastre, carica sul Mantice, massa nella Zavorra.

---

## 3. Tre direzioni

### A. **Fonderia notturna** — pixel art 1:1, luci 2D, post-processing *(scelta)*

- **Mood**: zona industriale di notte. Ghisa, ruggine, vapore, luna
  velata, altoforni all'orizzonte. Malinconico ma vivo; i due personaggi
  sono le uniche cose sature. È coerente col lessico del gioco: *ghisa*,
  *soffio*, *zavorra*, *mantice* (il mantice è proprio lo strumento che
  alimenta il fuoco della fonderia).
- **Palette**: ~35 colori in `src/render/theme.ts`. Blu-ardesia scuri per
  l'ambiente; arancio brace (GHISA) e ciano aria (SOFFIO); lime di segnale
  per i meccanismi; viola per le gemme; ottone e ruggine come accenti caldi
  a bassa saturazione.
- **Tecnica in Pixi v8**: mondo disegnato a 1:1 in una texture piccola per
  camera e ingrandito con uno shader sharp-bilinear; lightmap moltiplicata
  a mezza risoluzione; post-processing unico (bloom a 1/4, grading,
  vignettatura, grana, onde d'urto locali); personaggi come rig
  procedurali disegnati a ogni frame (la "pipeline Dead Cells" senza 3D:
  rig → render piccolo senza antialiasing); tutto il resto dipinto in codice.
- **Costo**: misurato sotto (§5). JS invariato rispetto a prima, GPU ~1 ms.
- **Rischi**: troppo buio (mitigato da luce ambiente, luci dei personaggi e
  aloni); personaggi piccoli (16 px) da rendere espressivi con poche
  forme; la pixel art procedurale richiede gusto nei numeri.

### B. **Carta e vento** — vettoriale piatto, gradienti, nebbia

- **Mood**: minimale e luminoso (alla *Alto's Adventure* / *Sable*): forme
  geometriche piatte, cieli a gradiente, nebbia a strati, ombre lunghe.
- **Tecnica**: Graphics vettoriali a piena risoluzione con antialiasing,
  niente pixel art, niente `image-rendering: pixelated`; luce come
  gradienti e maschere.
- **Costo**: basso, ma Graphics ricostruite ogni frame costano più CPU.
- **Rischi**: facile scivolare nel "casual da telefono"; bisogna rifare da
  zero ogni elemento e rinunciare alla griglia di pixel; meno "swag".

### C. **Pixel HD con normal map** — luce direzionale su sprite disegnati

- **Mood**: pixel art più grande (32–48 px per personaggio) con luce
  dinamica direzionale per pixel, alla *Dead Cells* / *Animal Well*.
- **Tecnica**: ogni sprite con la sua normal map (disegnata o generata),
  shader di illuminazione per sprite (in Pixi v8 vuol dire Mesh/shader
  personalizzati e batching a mano), luci come uniform.
- **Costo**: GPU moderato, ma soprattutto **costo di produzione** alto
  (ogni asset ×2) e dipendenza da asset esterni; con i tile Kenney il look
  resterebbe "carino".
- **Rischi**: tempo; incoerenza fra asset di fonti diverse.

### Raccomandazione

**A**, perché è l'unica che risolve tutti i problemi di §1 insieme senza
asset esterni, resta leggera e si appoggia al tema del gioco. **C** è la sua
evoluzione naturale: i rig procedurali possono generare anche le normali
(sono forme note), quindi la luce direzionale si può aggiungere più avanti
senza rifare l'arte.

### Cambiare motore?

| | Pro | Contro |
|---|---|---|
| **Restare su PixiJS v8** | Shader e render texture già in uso, bundle piccolo, zero migrazione, controllo totale della pipeline split-screen | Luci e normal map vanno scritte a mano (fatto: ~400 righe) |
| Phaser | Sistema di luci e filtri pronti, scena e input inclusi | Riscrivere loop, split-screen, rendering; si perde il controllo fine dei passaggi per camera |
| Godot 4 (export web) | Luci 2D, normal map, particelle GPU di serie | Il wasm del motore pesa diversi MB anche compresso, avvio più lento, i thread chiedono gli header COOP/COEP: contrario a "non pesante"; e si riscrive tutto in GDScript |
| three.js in 2D | Post-processing maturo | Ci si scrive comunque tutto il 2D; nessun vantaggio rispetto a Pixi |

Conclusione: **restare su PixiJS v8**. `pixi-filters` (v6.x, peer
`pixi.js >= 8`) è stato valutato ma non serve: i quattro shader scritti a
mano (ingrandimento, bright pass, composizione, contorno) costano meno dei
filtri generici a piena risoluzione e sono più controllabili. Resta
un'opzione per esperimenti (GodrayFilter, ShockwaveFilter).

---

## 4. Cosa è stato realizzato (ramo `gfx`)

### Pipeline di rendering

```
per ogni camera (1 o 2):
  sfondo (4 piani di parallasse) → scenografia → terreno → elementi
  → personaggi → [overlay luci: MOLTIPLICA] → particelle → effetti emissivi
  → cenere  ⇒  texture del mondo 1:1 (≈ 645x371)
  ⇒ quad con shader sharp-bilinear, zoom/scossa/sub-pixel sul quad
maschere dello split + divisore colorato ⇒ texture di scena 1280x720
bright pass 320x180 → blur ⇒ bloom
composizione: onde d'urto, aberrazione locale, bloom, grading, vignetta, grana
HUD sopra, pulito
```

- `src/render/splitScreen.ts` — passaggi a bassa risoluzione, quad di
  ingrandimento, divisore con il filo del colore di ciascun giocatore.
- `src/render/shaders.ts` — GLSL: ingrandimento sharp-bilinear, bright
  pass a 4 campioni, composizione finale, contorno/luce di taglio.
- `src/render/lighting.ts` — lightmap: registro luci immediato
  (`sceneLights.put(x, y, raggio, colore, intensità)`), texture a metà
  risoluzione del mondo, overlay in moltiplicazione.
- `src/render/post.ts` — post-processing unico a schermo.
- `src/render/pipeline.ts` — orchestrazione; in `game.ts` restano poche
  righe. In sviluppo espone `__gfx` (vedi §6).

### Arte

- **Terreno** (`art/terrain.ts`): dipinto pixel per pixel in una sola
  texture; ogni pixel conosce la distanza dall'aria in 4 direzioni:
  lamiera chiodata con filo di luce lunare sulle superfici, fianchi chiari
  a sinistra e scuri a destra, ventre in ombra, muratura che scurisce con
  la profondità (occlusione ambientale), colature di ruggine sotto i
  chiodi, griglie d'aerazione, detriti; piattaforme come travi reticolari.
- **Sfondo** (`background.ts`): cielo retinato con bagliore d'altoforno,
  luna, fari che spazzano il cielo, skyline (ciminiere con luci rosse
  intermittenti, torri di raffreddamento, capannoni a shed), piano medio
  (altoforni, nastri, serbatoi), piano vicino (tralicci, gru, recinzioni),
  foschia retinata fra i piani, fumi animati.
- **Scenografia** (`art/scenery.ts`): lampioni con cono di luce retinato
  (uno su quattro sfarfalla), catene con gancio che oscillano, pannelli
  informativi sui marker dei suggerimenti, portale d'uscita con fascio di
  luce sulla bandiera, cenere e braci nell'aria.
- **Personaggi** (`art/characters.ts`): rig procedurali a 1:1.
  - *GHISA*: secchio di ghisa con visiera a feritoia, spallaccio, griglia
    del forno sul petto. Più è pesante più si allarga e si arroventa
    (griglia, visiera, fumo dallo sfiato).
  - *SOFFIO*: figura incappucciata con maschera di porcellana a un occhio,
    mantello sfrangiato, sciarpa ciano simulata (catena verlet). Più è
    leggero più è snello e la sciarpa si allunga e fluttua; in planata il
    mantello si apre ad ala.
  - Comuni: squash & stretch dal salto, corsa con gambe e braccia
    alternate, respiro, inclinazione nella direzione del moto, battito di
    ciglia, scie nello Scatto e nello Schianto, contorno scuro + filo di
    luna in alto + filo del colore del giocatore sul retro (shader).
- **Elementi** (`art/elementsArt.ts`): piastra con LED del carico (si vede
  quanto peso manca), saracinesca a doghe con guide e spia, solaio di ghisa
  crepata con brace nelle crepe (colore di GHISA: è lui che lo sfonda),
  bocchetta con ventola e strie d'aria.
- **Particelle** (`particles.ts`): le vecchie texture restano "chiavi", ma
  vengono ridisegnate in stili pixel (scintilla 3→2→1 px con strie veloci,
  polvere a disco retinato, schegge). Posizioni su pixel interi.
- **Gemma**: cristallo viola sfaccettato (`art/props.ts`).

### Juice (`fx.ts`, regista degli effetti)

Legge i cambi di stato dei personaggi, senza toccare la logica:

| Evento | Effetto |
|---|---|
| Schianto (atterraggio in picchiata) | anello schiacciato a terra + anello di polvere, lampo di luce, onda d'urto a schermo, aberrazione locale, schegge, sbuffi radenti |
| Inizio picchiata / Scatto | anello e lampo nel colore del giocatore; scia (strie / sagome) |
| Atterraggio pesante | sbuffi laterali proporzionali alla velocità, anello se pesante |
| Abilità disponibile | anello + scintille quando GHISA diventa pesante o SOFFIO leggero |
| Inversione delle masse | saetta fra i due che scambia i colori, anelli, lampi, piccola onda per ciascuno sulla propria metà |
| Si tira massa | granelli che volano in arco dal donatore al ricevente |
| Piastra attivata | sbuffi, anello, lampo lime |
| Cancello | scintille sulle guide mentre si muove, sbuffo e lampo all'apertura, tonfo alla chiusura |
| Solaio rotto | schegge di ruggine e ardesia, polvere, lampo di brace |

Gli elementi segnalano gli eventi con `fxBus.emit(...)` dal loro `draw()`.

### HUD (`src/ui/hud.ts`)

Chakra Petch (Google Fonts) al posto di Press Start 2P, targhette scure con
filo d'accento, tastini a placca con lo spessore, prompt con staffe agli
angoli. La struttura di `MassBar` è invariata (eredita solo il carattere).

### Kit oggetti (`src/render/art/objects.ts`)

`ZavorraView`, `ManticeView`, `CassaView`: ognuna `{ container, update(stato,
tempo) }`, stati documentati nel file. Prova: **`/art.html`** (anche con
`?zoom=8&cx=..&cy=..` per giudicare i pixel).

---

## 5. Prestazioni (misurate)

Macchina: MacBook M3 Pro, Chrome (ANGLE/Metal). 240 frame per misura,
mediana.

| | prima (Kenney) | dopo, schermo unico | dopo, diviso |
|---|---|---|---|
| `game.render` (JS) | 0.2 ms | 0.2 ms | 0.2 ms |
| `game.present` (JS) | 0.5 ms | 0.5 ms | 0.6 ms (p90 3.1 ms) |
| GPU per frame (timer query) | — | ~1.2 ms | ~1.1 ms |
| Avvio: pittura terreno + sfondo + scenografia | — | ~85 ms una tantum | |

Il budget (< 6 ms di JS per frame con split) è rispettato con ampio margine.
Il mondo costa meno di prima in riempimento: si disegna a ~645x371 invece
che a 1280x720 per camera.

---

## 6. Strumenti

- `/art.html` — kit oggetti e foglio dei personaggi.
- In console (solo sviluppo): `__gfx.inspectWorld(x, y, w, h)` mostra
  ingrandita una zona del mondo dall'ultimo frame (clic per chiudere);
  `__gfx.post.settings` (bloom, vignette, grain, …) e
  `__gfx.post.enabled`, `__gfx.lights.enabled`, `__gfx.lights.ambient` per
  regolare e confrontare dal vivo.

---

## 7. Problemi aperti e passi successivi

- **Hit-stop**: 40–60 ms di fermo sullo Schianto darebbero più peso
  all'impatto, ma tocca la simulazione: da fare lato logica (un contatore
  che salta `fixedUpdate`).
- **Normal map procedurali** per i personaggi (direzione C): luce
  direzionale dei lampioni sul corpo.
- **Ombre**: nessuna ombra portata (scelta di costo). Un'ombra a contatto
  sotto i personaggi è economica e aiuterebbe a leggere i salti.
- **Jitter sub-pixel**: i personaggi stanno su pixel interi e la camera
  scorre di frazioni; a velocità basse il personaggio può "tremare" di un
  pixel di mondo rispetto allo sfondo. Rimedio possibile: agganciare il
  resto frazionario della camera al personaggio inseguito.
- **Sfondo per livello**: i piani sono generati con semi fissi; con più
  livelli conviene variare seme, palette dell'orizzonte e densità.
- **HUD**: testo vettoriale ingrandito con `pixelated` dal CSS; su schermi
  molto grandi andrebbe disegnato a risoluzione nativa.
- **Audio**: il juice visivo chiede suoni coerenti (clang, sibili, tonfi).
