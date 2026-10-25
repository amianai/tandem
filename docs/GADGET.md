# TANDEM: gadget nuovi e fattore morte

Documento di design. Cosa chiede l'utente, in sintesi:

1. I personaggi devono poter **morire**, e quando uno muore il livello non si
   finisce da soli: la morte deve creare interdipendenza vera, senza frustrare.
2. **Zavorra e Mantice vanno sostituiti alla radice** con gadget dinamici,
   dopaminergici, coinvolgenti e versatili, ma ragionati: legati alla
   Bilancia, ai ruoli, alla co-op e allo schermo diviso.

Restano fissi la Bilancia (massa totale 1 divisa fra i due), l'accordo `Q`+`.`,
i ruoli (Schianto solo da pesante, Scatto solo da leggero) e gli elementi di
livello che ci sono già. Sono esclusi in partenza: corde o legami fra i
personaggi, scambio di tasti o di mani, timer di livello.

---

## In breve

- Sono state studiate **10 coppie di gadget**, una per ogni spazio di design
  (movimento, proiettili, campi, tempo, piattaforme, posizione, ambiente, massa,
  fusione, soccorso), e valutate su **10 criteri pesati**.
- **Le tre finaliste**:
  1. **Lancio & Risucchio**, 94,6/100. GHISA scaglia SOFFIO; SOFFIO risucchia
     GHISA. Regola d'oro: *chi pesa meno vola*.
  2. **Braci & Tiraggio**, 91,2/100. GHISA semina tizzoni, SOFFIO ci soffia
     sopra e li fa esplodere; le esplosioni sparano in alto chi è leggero.
  3. **Colata & Tempra**, 86,6/100. GHISA sputa ghisa fusa, SOFFIO la tempra
     con un soffio gelido: ponti, gradini e croste sulla scoria, costruiti
     mentre si corre.
- **La prima da prototipare è Lancio & Risucchio**: ha il punteggio più alto,
  costa meno, corregge in modo più diretto entrambi i difetti visti
  dall'utente, e mette subito alla prova Bilancia, accordo e sistema morte.
- **Fattore morte, regola comune**: chi muore diventa uno *spirito* che guida
  lui stesso; rinasce solo se il compagno lo raggiunge e fanno l'accordo
  insieme, o se il compagno lo colpisce col proprio gadget. Si perde (e si
  riparte dall'ultimo checkpoint) solo se morite tutti e due.
- **Una sola modifica ai tasti**: lo Schianto passa su `S` in aria; `E` diventa
  il gadget di GHISA, sempre, a terra e in aria. SOFFIO non cambia niente.
- **Proposta strategica**: non serve sceglierne una sola. La Bilancia resta il
  nucleo fisso e ogni coppia di gadget diventa il tema di una zona della
  fonderia, come i capitoli di *It Takes Two*.

---

## 1. Perché Zavorra e Mantice non funzionano

- **La Zavorra non si capisce.** Crea un terzo posto dove sta la massa (GHISA,
  SOFFIO e il blocco) e rompe il modello mentale che piace all'utente: *quello
  che prendi tu lo perde l'altro*. In più svuota GHISA di colpo (tutta la massa
  oltre il minimo), gli toglie lo Schianto senza un segnale forte e lo obbliga
  a tornare a piedi a riprenderla: un'azione che costa tempo e non dà niente.
- **Il Mantice è lento.** Il ciclo è posa, carica (serve un pesante che ci
  atterri, quasi sempre con lo Schianto), salta, richiama. Quattro passi per un
  lancio, e la ricompensa arriva secondi dopo l'input.
- **Tutti e due sono statici.** Sono oggetti da posare: mentre li sistemi il
  gioco si ferma. In un livello da 40-60 s ogni secondo da fermi pesa.
- **GHISA ha meno *swag* di SOFFIO.** Lo Scatto è veloce ed espressivo; lo
  Schianto è potente ma raro, e la Zavorra rendeva GHISA più debole. A GHISA
  serve un verbo spettacolare da usare spesso.

**Lezione**: i nuovi gadget devono essere **verbi, non oggetti**.

### Numeri di oggi (riferimento per tutto il documento)

| | valore attuale |
|---|---|
| Tile | 18 px |
| Corsa | ~6 tile/s (più veloce da leggeri, più lenta da pesanti) |
| Salto | ~7 tile a massa 0,1 · ~3,5 a 0,5 · ~2 a 0,9 |
| Scatto | ~3 tile in 0,16 s, una volta per volo |
| Tira massa | 0,62 al secondo: da 0,5 a 0,9 in ~0,65 s |
| Accordo | finestra 0,18 s, poi 0,7 s di attesa |
| Schermo diviso | si apre oltre ~29 tile in orizzontale o ~12 in verticale; si richiude sotto ~26 e ~11 |
| Ogni metà a schermo diviso | ~12×13 tile col taglio verticale, ~24×7 tile col taglio orizzontale |

Stati di massa: **leggero** ≤ 0,4 · **medio** fra 0,4 e 0,6 · **pesante** ≥ 0,6.

---

## 2. Ricerca: cosa prendiamo dagli altri

| Riferimento | Cosa fa | Cosa ne prendiamo |
|---|---|---|
| **It Takes Two** | Ogni livello introduce una meccanica nuova costruita sulle abilità complementari dei due: martello e chiodi, pistola di linfa e fiammiferi. Fares dice che la varietà non è fine a sé stessa e che una meccanica spesso vive per un solo livello. | Coppie asimmetriche che funzionano solo insieme; lo schema "innesco + detonatore" (Braci & Tiraggio); una coppia di gadget per zona. |
| **Portal 2 co-op** | Wolpaw: un puzzle co-op che si risolve da soli "non passa". Lo strumento per segnalare (*ping*) nasce perché nei test i giocatori perdevano minuti a spiegarsi dov'era "qui". | Ogni stanza deve richiedere entrambi. I gadget devono essere visibili su tutte e due le metà dello schermo, e fare anche da segnale. |
| **Celeste** | Tolleranze invisibili: coyote time, jump buffer, correzione d'angolo durante lo scatto, gravità dimezzata all'apice. | Finestre di tolleranza su prese, agganci e rinascite; una piccola spinta verso l'alto all'arrivo del Risucchio per salire sui bordi. |
| **Hollow Knight** | L'Anima si riempie colpendo i nemici e si spende per curarsi o per gli incantesimi: premia chi attacca, non chi aspetta. | Risorse che si ricaricano facendo, in meno di un secondo: braci, fiato, sputi. |
| **Super Meat Boy** | McMillen: la difficoltà percepita è probabilità di morire × prezzo della morte. Via le vite, rientro rapidissimo, livelli corti. | Si muore spesso, ma il prezzo sono pochi secondi: niente vite, rinascita in 1-3 s, checkpoint vicini. |
| **Rayman Origins / Legends** | Chi cade diventa una bolla che galleggia e torna in gioco se un compagno la colpisce; se finiscono tutti in bolla, si riparte dal checkpoint. | Lo spirito che galleggia, la rinascita data dal compagno, la sconfitta solo se cadete tutti e due. |
| **Cuphead** | In co-op si rianima il compagno parando il suo fantasma, con una finestra di tempo stretta. | La rinascita come gesto di abilità (l'accordo sul battito), ma **senza** il fantasma che scompare: niente conti alla rovescia. |
| **Pico Park** | Il livello finisce solo quando tutti arrivano alla porta; quasi ogni livello aggiunge una trovata per più giocatori. | La bandiera vuole due corpi **vivi**: uno spirito non conta. |
| **Overcooked** | Nasce attorno alla comunicazione sotto pressione e al caos della cucina. | Caos controllato, momenti in cui ci si urla "tienimi!" o "adesso!". |
| **Unravel Two** | Interdipendenza costruita sul filo che lega i due (ponti, trampolini, altalene). | Solo come contro-esempio: il loro legame è fisico, il nostro deve nascere dalla Bilancia. |
| **Juice** (Jonasson & Purho; Nijman) | Massimo riscontro per il minimo input: squash & stretch, scossa, particelle, suono. Il juice va dosato. | Una ricetta di feedback comune a tutti i gadget (vedi §3). |
| **Ricompensa variabile** | I programmi a rapporto variabile tengono alta e costante la risposta. Va usata con cautela: è la stessa leva delle slot machine. | Catene di lunghezza variabile, la rinascita perfetta, le prese al volo: varietà che nasce dall'abilità, mai dal caso che punisce. |

Le fonti sono in fondo al documento.

---

## 3. Principi per i nuovi gadget

1. **Verbo, non oggetto.** O il gadget agisce subito, o quello che crea vive
   pochi secondi e sparisce da solo. Non si torna mai a riprendere niente.
2. **Ricarica sotto il secondo**, oppure una riserva a cariche **visibile sul
   corpo** (come i capelli di Madeline in Celeste): niente barre da leggere
   nell'HUD durante l'azione.
3. **La Bilancia cambia l'effetto, e si vede.** Tre stati (leggero, medio,
   pesante), tre versioni riconoscibili del gadget.
4. **Almeno un uso forte esiste solo in coppia**: il compagno è il bersaglio o
   il complice.
5. **La massa resta nei due corpi.** Il totale 1 si divide sempre e solo fra
   GHISA e SOFFIO: niente terzo posto (è l'errore della Zavorra).
6. **Raggio d'azione entro ~8 tile**: l'effetto cade quasi sempre
   nell'inquadratura di chi lo usa, anche a schermo diviso.
7. **Si spiega in una frase.**
8. **Ogni gadget è anche un soccorso**: serve a salvare o a far rinascere
   il compagno (vedi §4).

**Ricetta del feedback** (uguale per tutti, a strati):
- *istante*: 40-80 ms di hit-stop e un suono secco;
- *corpo*: squash & stretch, colore del personaggio che si accende;
- *mondo*: particelle e luce del colore di chi agisce (arancio GHISA, ciano
  SOFFIO);
- *camera*: scossa solo nella metà di chi agisce, mai a schermo intero
  (vincolo già fissato in `GRAFICA.md`).

---

## 4. Il fattore morte (regole comuni a tutte le opzioni)

### 4.1 Cosa uccide

Oggi nel gioco non si muore (si torna allo spawn solo cadendo fuori mappa).
Servono pericoli, e ognuno deve dialogare con la Bilancia:

| Pericolo | Cosa fa | Legame con la Bilancia |
|---|---|---|
| **Scoria** | Vasca di metallo fuso: morte al contatto. | Uguale per tutti: è il pericolo base. |
| **Sfiato** | Getto di vapore a intervalli, con 0,5 s di preavviso (sbuffi, sibilo). Non uccide: spinge via, tanto più forte quanto più sei leggero. | Il pesante fa da scudo: chi gli sta dietro è al riparo. Il leggero viene sbalzato, magari dentro la scoria. |
| **Lamiera** | Passerella sottile sopra la scoria: sotto un pesante si piega e cede in 0,4 s (scricchiola prima). | Per passare bisogna sistemare la Bilancia, e chi è pesante passa per un'altra strada. |
| **Maglio** | Pressa a ciclo fisso: sale in 1,2 s, scende in 0,2 s. | Morte per tutti. Variante avanzata: una piastra premuta lo blocca in alto. |
| **Vuoto** | Cadere fuori dalla mappa. | Uguale per tutti. |

**Tolleranza** (come in Celeste): le zone mortali sono 2-3 px più piccole del
disegno, e la scoria uccide solo quando i piedi ci affondano di 3 px.

### 4.2 Morire

- **Istantaneo, mai una schermata.** 80 ms di hit-stop, scossa solo nella metà
  di chi muore, e il corpo si spezza nel suo **spirito**: GHISA diventa il
  **Tizzone** (una brace con due occhi), SOFFIO lo **Sbuffo** (un anello di
  vapore).
- Lo spirito compare **sopra l'ultimo punto sicuro**: l'ultima posizione su un
  terreno stabile, lontano dai pericoli. Mai dentro la scoria.
- **Il morto guida il suo spirito** con le proprie frecce o WASD: vola libero,
  senza gravità, a ~4,5 tile/s, attraversa i pericoli ma non i muri. Non resta
  a guardare: va incontro al compagno. Se il vivo si allontana oltre la soglia
  dello schermo diviso, lo spirito accelera ×2 verso di lui.
- **La Bilancia si ferma**: il vivo tiene la massa che aveva in quel momento;
  `Q` e `.` non tirano niente.
- **Da soli non si finisce niente**: la bandiera vuole due corpi vivi, e le
  **Forge** (i checkpoint, bracieri che si accendono passandoci) si accendono
  solo se ci passate vivi tutti e due.
- **Nessun conto alla rovescia**: lo spirito non svanisce. La pressione nasce
  dal fatto che il vivo è solo, spesso nella forma sbagliata, in mezzo ai
  pericoli.

### 4.3 Rinascere

- **Accordo di rinascita** (sempre disponibile): quando lo spirito è entro
  1,5 tile dal vivo, sopra di lui compaiono i due tasti; `Q` e `.` premuti
  insieme lo fanno rinascere accanto. Anche il morto deve premere: si rinasce
  in due.
- **Rinascita perfetta**: lo spirito pulsa ogni 0,8 s (il battito). Se
  l'accordo cade sul battito (±0,1 s), la rinascita è perfetta: 1 s di
  invulnerabilità, Schianto o Scatto e riserve del gadget ricaricati, e una
  piccola onda che spinge le casse. È un momento di dopamina dentro l'errore.
- **Rinascita col gadget**: ogni coppia ha un modo per rianimare **a distanza**
  col proprio gadget (vedi le opzioni). Di solito ci vogliono 1-1,5 s: premia
  chi padroneggia i gadget.
- Alla rinascita la Bilancia riparte da dove si era fermata.

### 4.4 Perdere

- Se muore anche il secondo: **"Colata persa"**, 0,8 s di dissolvenza, e si
  riparte dall'ultima Forgia accesa. Le gemme già prese restano.
- Una Forgia ogni 15-20 s di gioco: un livello da 40-60 s ne ha 1 o 2. Il
  costo massimo di un disastro è di circa 20 secondi.

### 4.5 Perché non frustra

- Il prezzo della morte sono **secondi**, non vite (la formula di McMillen).
- Il morto **gioca** anche da morto: guida lo spirito, preme l'accordo.
- La rinascita è un **gesto di abilità** con una versione perfetta, non
  un'attesa.
- Si perde solo cadendo in due, e si riparte da vicino.
- A fine livello le morti si contano e si festeggiano (insieme alle rinascite
  perfette), non si nascondono.

### 4.6 Alternative scartate

- **Al vivo tutta la massa del morto**: asimmetria brutale. Se sopravvive
  GHISA diventa più forte, se sopravvive SOFFIO diventa inutile.
- **Lo spirito che svanisce dopo N secondi** (come il fantasma di Cuphead):
  troppo vicino al timer escluso, e punisce il morto per la lentezza del
  compagno.
- **Il morto che riappare da solo al checkpoint**: uccide l'interdipendenza.

---

## 5. Comandi 2.0 (comuni alle finaliste)

Il vincolo resta: frecce o WASD più due tasti per giocatore. Il gadget deve
funzionare **anche in aria**, altrimenti torna a essere statico. Per liberare
`E` basta spostare un'abilità sola.

| | Movimento | Salto | Tira massa | Gadget | Abilità di ruolo |
|---|---|---|---|---|---|
| **GHISA** | `A` `D` | `W` | `Q` tenuto | **`E` sempre**, a terra e in aria | **`S` in aria = Schianto** (se pesante) |
| **SOFFIO** | `←` `→` | `↑` | `.` tenuto | `-` a terra (anche sulle spalle di GHISA) | `-` in aria = Scatto (se leggero), **come oggi** |

- `Q` + `.` insieme: inversione delle masse, come oggi. Se uno dei due è
  morto, lo stesso accordo diventa la rinascita.
- `S` in aria serve una **pressione nuova**: chi tiene `S` per scendere da una
  piattaforma attraversabile non fa lo Schianto per sbaglio.
- **Perché lo Schianto su `S`**: "giù = picchiata" si capisce senza spiegarlo
  (è il *ground pound* di Mario). SOFFIO invece non cambia, perché il suo
  gadget funziona benissimo da terra e lo Scatto è la sua mossa di stile.
- **Mira**: tenendo premuto il tasto gadget, GHISA si pianta e orienta la
  traiettoria con WASD (si vede a puntini); al rilascio lancia. Un tocco rapido
  lancia nella direzione standard. SOFFIO orienta verso il basso con `↓` e per
  il resto ha la mira automatica (`↑` farebbe saltare).
- **Alternativa conservativa**, se l'utente non vuole spostare lo Schianto:
  `E` in aria resta Schianto, tranne quando GHISA ha qualcosa in spalla o un
  bersaglio a portata (allora usa il gadget). Funziona, ma è più contestuale
  e meno leggibile.
- **Da provare in playtest**: `↓` + `-` in aria come gadget di SOFFIO verso il
  basso (utile a Braci e Colata).

---

## 6. Le 10 opzioni

| # | Coppia | Spazio di design |
|---|---|---|
| 1 | Braci & Tiraggio | proiettili, reazioni a catena |
| 2 | Lancio & Risucchio | movimento: il compagno è il proiettile |
| 3 | Pozzo & Nube | campi e zone |
| 4 | Stampo & Controvento | manipolazione del tempo |
| 5 | Rivetti & Scia | piattaforme temporanee e correnti |
| 6 | Ancora & Refolo | scambi di posizione |
| 7 | Colata & Tempra | interazione con l'ambiente (caldo e freddo) |
| 8 | Lingotto & Soffiata | la massa diventa un oggetto da passarsi |
| 9 | Morsa & Turbina | fusione in un corpo solo |
| 10 | Campana & Bolla | salvataggio e rianimazione |

Tutti i numeri sono indicativi: servono a fissare l'ordine di grandezza, non
la taratura finale.

---

### 6.1 BRACI & TIRAGGIO · proiettili, reazioni a catena

> *GHISA semina tizzoni ardenti, SOFFIO ci soffia sopra e la fonderia esplode a comando.*

**Input**
- GHISA `E`: lancia una brace (tocco = arco medio in avanti; tenuto = mira con
  WASD e traiettoria visibile). A terra con `S` tenuto: la lascia ai piedi.
- SOFFIO `-` a terra: **Tiraggio**, un soffio a cono davanti; `↓` + `-` verso
  il basso. In aria `-` resta lo Scatto, e lo Scatto che attraversa una brace
  la accende.

**Effetto**
- *Braci*: si attaccano alla prima superficie (muro, soffitto, pavimento,
  cassa) e rimbalzano sui personaggi. Riserva di 3, ognuna si ricarica in
  0,7 s; si vedono come tre tizzoni sulla schiena di GHISA. Al massimo 3
  attive: la quarta spegne la più vecchia.
- *Tiraggio*: cono di 5 tile × 40°, arriva in 0,15 s. Accende ogni brace nel
  cono in ordine di distanza, a 0,06 s l'una ("ta-ta-TAM"); spinge i corpi
  leggeri, sposta una cassa di 1 tile. Ricarica 0,45 s.
- *Esplosione*: raggio 2-3 tile; spinta di 560 × (1 − massa) px/s dal centro,
  sempre almeno per metà verso l'alto. SOFFIO a 0,1 vola ~8 tile, a 0,2 ~6; un
  pesante a 0,8 fa un saltello. Non ferisce mai nessuno. Accende le braci
  entro 1,5 tile (micce), sbalza le casse come lo Schianto, abbatte i **Muri di
  loppa** e accende i **Fornelli** (elementi nuovi: un fornello acceso apre il
  suo cancello).

**Bilancia e ruoli**
- GHISA pesante lancia la *Brace grossa* (gittata 4 tile, raggio 3), medio
  6 tile e raggio 2,5, leggero la *Favilla* (8 tile, raggio 2).
- SOFFIO leggero ha un cono lungo e stretto (7 tile); pesante un cono corto
  (4 tile) che sposta le casse di 2 tile.
- La spinta premia chi è leggero: la Bilancia decide chi decolla.
- *Schianto incendiario*: lo Schianto di GHISA accende le braci sul pavimento
  entro 3 tile. Se SOFFIO, leggero, ci sta sopra, decolla.
- *Scatto-razzo*: SOFFIO che scatta attraverso una brace la accende alle
  spalle e va più lontano del 50%.
- *Accordo a mezz'aria*: GHISA leggero sparato in alto da una brace fa
  l'accordo all'apice, torna pesante e cade con lo Schianto da 8 tile.

**Momento dopamina**: tre braci in fila sul muro, un soffio solo, tre scoppi a
crescendo con la scossa che sale, e il compagno che vola in cima al pozzo.

**Esempio**: pozzo verticale di 10 tile. GHISA mette una brace a terra e una
sul muro a 6 tile. SOFFIO ci sale sopra e soffia in basso: decolla di 6 tile,
all'apice scatta attraverso la seconda brace, sale altri 3 tile e plana sul
bordo.

**Schermo diviso**: le braci sono oggetti del mondo e si vedono su entrambe le
metà quando sono inquadrate; fuori campo diventano tacche arancio sul bordo
della metà di SOFFIO, che così sa sempre dove GHISA ha seminato. Il cono
agisce quasi sempre nell'inquadratura di chi soffia. Una catena può
attraversare la cucitura: ogni scoppio si vede nella metà che lo inquadra.

**Fattore morte**: le esplosioni non uccidono, ma possono spingere il compagno
nella scoria (una colpa che fa ridere). Rinascita col gadget: SOFFIO soffia
sul Tizzone di GHISA e lo *riattizza*; GHISA centra lo Sbuffo di SOFFIO con una
brace e SOFFIO rinasce come aria calda, con un balzo verso l'alto. Tutte e due
a distanza, in circa 1 s.

---

### 6.2 LANCIO & RISUCCHIO · il compagno è il proiettile

> *GHISA scaglia SOFFIO come un peso olimpico; SOFFIO risucchia GHISA come un aspiratore da fonderia. Chi pesa meno vola.*

**Input**
- GHISA `E` vicino a SOFFIO, a una cassa o allo spirito di SOFFIO (entro
  1 tile): **afferra** e se lo mette in spalla. `E` con qualcosa in spalla:
  **lancia** (tocco = 55° in avanti; tenuto = GHISA si pianta, mira con WASD,
  vede la traiettoria a puntini e lancia al rilascio). `E` a vuoto: **presa al
  volo**, mani aperte per 0,25 s.
- SOFFIO `-` tenuto, a terra o sulle spalle di GHISA: **Risucchio**, con mira
  automatica sul bersaglio valido più vicino davanti a lui (cono di 120°,
  preferisce GHISA; con `↓` preferisce quelli in basso). `-` in aria: Scatto.
  `↑` sulle spalle: salta giù con 1 tile di bonus.

**Effetto**
- *Lancio*: velocità = 240 + 400 × (massa GHISA − massa del bersaglio) px/s,
  fino a 500. Con la Bilancia al massimo (0,9/0,1): ~8 tile in alto o ~12 in
  lungo. A 0,8/0,2: ~6,5 in alto. A 0,6/0,4: ~2,5, quasi niente. Se GHISA pesa
  meno del bersaglio non ce la fa: vacilla e sbuffa scintille. Il lancio
  **ricarica lo Scatto** di SOFFIO. Con SOFFIO in spalla GHISA va all'85%
  della velocità, e sulle piastre contano tutti e due (1,0).
- *Risucchio*: aggancia entro 8 tile, in linea di vista. **Chi pesa meno vola
  verso l'altro** a 380 px/s (8 tile in 0,4 s); a masse pari (±0,05) si vengono
  incontro. La direzione si decide al momento dell'aggancio e resta finché tieni
  premuto. *Fiato*: 1 s di risucchio, si ricarica in 0,8 s (anello ciano
  attorno a SOFFIO). Se molli prima dell'arrivo, chi vola tiene il 60% della
  velocità (effetto fionda). All'arrivo, una piccola spinta verso l'alto per
  salire sui bordi. Gemme e spiriti vanno sempre verso SOFFIO; una cassa
  (0,35) viene da SOFFIO se lui pesa di più, altrimenti è SOFFIO a volare sulla
  cassa (rampino).

**Bilancia e ruoli**: è la coppia che sfrutta di più la Bilancia. L'accordo
diventa l'interruttore di direzione del duo.

| Stato | Lancio di GHISA | Risucchio di SOFFIO |
|---|---|---|
| GHISA pesante, SOFFIO leggero | forte: SOFFIO vola lontano | SOFFIO vola da GHISA (ritorno rapido) o sulle casse (rampino) |
| GHISA leggero, SOFFIO pesante | impossibile | GHISA vola da SOFFIO; le casse arrivano a SOFFIO |
| tutti e due medi | debole | si vengono incontro |

- *Ciclo L-S-R* (lancia, scambia, risucchia): GHISA pesante lancia SOFFIO su
  una mensola, accordo, SOFFIO ora pesante risucchia su GHISA leggero. Tre
  input, due secondi.
- *Meteora*: accordo mentre SOFFIO è in volo. SOFFIO diventa pesante a
  mezz'aria, la parabola si spezza e piomba giù: preme subito le piastre e
  sbalza le casse entro 2 tile. I solai fragili restano dello Schianto.
- *Risucchio-Schianto*: GHISA leggero tirato in alto, accordo a metà volo,
  arriva pesante sopra il bersaglio e preme `S`.
- *Carica il lancio*: se GHISA tiene `Q` con SOFFIO in spalla, vede la
  traiettoria allungarsi in diretta.

**Momento dopamina**: il lancio in tandem. Lanci SOFFIO, lui scatta all'apice e
atterra a 14 tile; oppure il risucchio che strappa GHISA dal bordo della
scoria all'ultimo istante.

**Esempio**: canale di scoria di 12 tile con uno sfiato a metà. GHISA (0,9)
lancia SOFFIO teso; lo sfiato lo alza, SOFFIO corregge con lo Scatto e
atterra. Accordo. SOFFIO risucchia GHISA (0,1) sopra la scoria; lo sfiato lo
sposta fuori traiettoria, SOFFIO tiene il fiato e lo riaggancia.

**Schermo diviso**: il lancio è il gadget che apre lo schermo nel modo più
spettacolare, ma con queste gittate resta quasi sempre sotto la soglia: si
apre solo con lanci lunghi e voluti (per esempio dentro una colonna d'aria).
Il risucchio è il gesto che lo richiude: l'arrivo di GHISA chiude la cucitura
di scatto. Il risucchio vuole linea di vista, quindi non aggancia mai niente
fuori campo.

**Fattore morte**: lanciare il compagno nella scoria lo uccide (risate
garantite, colpa tua, si rimedia in 1 s). Rinascita col gadget: GHISA afferra
lo spirito di SOFFIO e SOFFIO rinasce sulle sue spalle, pronto per un lancio;
SOFFIO risucchia lo spirito di GHISA da 8 tile e GHISA rinasce accanto a lui.
Salvataggi: presa al volo su SOFFIO che cade, risucchio su GHISA leggero che
precipita.

---

### 6.3 POZZO & NUBE · campi e zone

> *GHISA scaglia un nocciolo che fa pesare tutto il doppio; SOFFIO soffia una nube in cui tutto pesa un terzo.*

**Input**: GHISA `E` lancia il Pozzo (arco di 6 tile; tenuto = mira). SOFFIO
`-` a terra soffia la Nube 2 tile davanti a sé.

**Effetto**
- *Pozzo*: campo di raggio 2,5 tile per 2,5 s. Dentro, tutto pesa il doppio
  (piastre, salto, correnti, casse) e i corpi leggeri vengono attirati verso il
  centro (120 px/s). Ricarica 2,5 s.
- *Nube*: raggio 2,5 tile per 2,5 s. Dentro, tutto pesa un terzo; chi risulta
  leggero sale piano, come in una colonna d'aria. Ricarica 2,5 s.
- Due campi sovrapposti si annullano.

**Bilancia e ruoli**: la Bilancia diventa locale. Una cassa (0,35) nel Pozzo
pesa 0,7 e preme la piastra da sola. GHISA a 0,5 nella Nube pesa 0,17: plana e
sale nelle correnti. GHISA a 0,35 nel Pozzo pesa 0,7 e può fare lo Schianto.
Per 2,5 s tutti e due possono essere al massimo della forma.

**Momento dopamina**: le casse che decollano nella nube; lo Schianto fatto "in
prestito" dentro il Pozzo.

**Esempio**: piastra da 0,6 con una sola cassa: Pozzo sulla cassa, il cancello
si apre per 2,5 s e SOFFIO ci passa di corsa.

**Schermo diviso**: campi locali e ben visibili, nessun problema.

**Fattore morte**: la Nube rallenta le cadute (salvataggi sopra la scoria); il
Pozzo attira lo spirito come una calamita e rende più rapido l'accordo di
rinascita. Non c'è una rinascita propria del gadget.

---

### 6.4 STAMPO & CONTROVENTO · manipolazione del tempo

> *GHISA chiude le cose in un guscio di ghisa che le ferma nel tempo; SOFFIO soffia contro il tempo e le riavvolge.*

**Input**: GHISA `E` spara un getto dritto (600 px/s, 10 tile; tenuto = mira).
SOFFIO `-` a terra: Controvento, un'onda a cono di 6 tile.

**Effetto**
- *Stampo*: il primo corpo colpito (cassa, compagno, maglio, piattaforma
  mobile) resta fermo nel tempo e solido per 2 s. Al massimo 2 alla volta,
  ricarica 1 s. I colpi che un corpo ingessato riceve si accumulano (una
  freccia che cresce): quando il guscio si rompe, parte con tutta quella
  spinta.
- *Controvento*: il primo corpo colpito ripercorre all'indietro i suoi ultimi
  2 s in 0,5 s. Ricarica 1,5 s.

**Bilancia e ruoli**: lo Stampo dura 3 s se GHISA è pesante, 2 se è medio, 1,2
se è leggero; il Controvento riavvolge 3 s se SOFFIO è leggero, 2 se medio, 1
se pesante. *Il pesante ferma, il leggero riavvolge.* GHISA può ingessare
SOFFIO a metà salto, salirci sopra e fare lo Schianto sul guscio: quando si
rompe, SOFFIO parte con quella spinta.

**Momento dopamina**: una cassa bloccata a mezz'aria mentre cade, usata come
gradino; il compagno riavvolto fuori dalla scoria.

**Esempio**: un maglio scende ogni 2 s davanti a un corridoio: Stampo sul
maglio e si passa. Una cassa caduta nel vuoto: Controvento e torna su.

**Schermo diviso**: il riavvolgimento può spostare un corpo di molti tile in
mezzo secondo, e la cucitura salta di conseguenza: va attenuato.

**Fattore morte**: il Controvento entro 1,5 s da una morte la annulla (il corpo
torna indietro, lo spirito si ricompone). Massima indulgenza, ma rischia di
togliere peso alla morte. Lo Stampo ferma i pericoli per proteggere il
compagno.

---

### 6.5 RIVETTI & SCIA · piattaforme temporanee e correnti

> *GHISA inchioda pioli roventi nei muri, SOFFIO disegna correnti d'aria nel vuoto: costruite il percorso mentre lo fate.*

**Input**: GHISA `E` spara un rivetto dritto (700 px/s, 10 tile; tenuto =
mira). SOFFIO `-` a terra: una colonna d'aria davanti a sé (2×7 tile); `-`
tenuto 0,3 s: un corridoio d'aria orizzontale (7×2 tile).

**Effetto**: il rivetto diventa un piolo di 1 tile (una piattaforma
attraversabile dal basso, come `=`) per 5 s, al massimo 3. La corrente dura
3 s, una alla volta, ricarica 1 s, e segue la regola delle colonne d'aria di
oggi: solleva o spinge solo chi è leggero.

**Bilancia e ruoli**: un pesante sul piolo lo piega: ci resta 0,3 s, poi
scivola giù come su una rampa. GHISA pesante può anche inchiodare una cassa al
muro (gradino fisso). Le correnti servono solo ai leggeri: con l'accordo si
decide chi sale.

**Momento dopamina**: una scala di pioli sparata in corsa; GHISA leggero che
plana dentro una corrente di 7 tile.

**Esempio**: parete liscia di 9 tile. Tre rivetti a 3 tile l'uno e SOFFIO sale.
Accordo: SOFFIO crea una colonna e GHISA, ora leggero, sale anche lui.

**Schermo diviso**: tutto locale, nessun problema.

**Fattore morte**: un piolo o una corrente messi sotto chi cade lo salvano;
dentro le correnti lo spirito vola al doppio della velocità. Poco altro.

---

### 6.6 ANCORA & REFOLO · scambi di posizione

> *SOFFIO scambia il suo posto con qualunque cosa colpisca; GHISA si tira verso un'ancora magnetica come un ariete.*

**Input**: SOFFIO `-` a terra spara un refolo dritto nella direzione in cui
guarda (700 px/s, 12 tile; con `↓` in diagonale verso il basso). GHISA `E`
lancia l'ancora (arco di 7 tile); `E` di nuovo: GHISA si tira verso l'ancora
in linea retta (420 px/s).

**Effetto**: il primo corpo colpito dal refolo (GHISA, cassa, ancora, spirito)
si scambia di posto con SOFFIO all'istante; ricarica 1,2 s. L'ancora si pianta
su muri e pavimenti, una alla volta; mentre si tira, GHISA pesante è un ariete
(sbalza le casse, sfonda le Lamiere).

**Bilancia e ruoli**: il refolo arriva a 14 tile se SOFFIO è leggero, a 8 se è
pesante. *Scambio totale*: un accordo entro 0,3 s da un refolo che ha colpito
GHISA scambia anche le masse. GHISA che si tira all'ancora da pesante arriva
con lo Schianto pronto.

**Momento dopamina**: lo schiocco del teletrasporto, e la cucitura dello
schermo che fa mezzo giro.

**Esempio**: piastra dall'altra parte di un baratro, cassa da questa. SOFFIO
colpisce la cassa: lui finisce di là, la cassa al suo posto. Poi colpisce
GHISA, e la cassa resta sulla piastra.

**Schermo diviso**: lo scambio con GHISA inverte le due metà: la linea ruota di
180° e serve uno stacco animato. Alto rischio di disorientamento.

**Fattore morte**: un refolo che colpisce uno spirito lo porta da SOFFIO e lo
fa rinascere. L'ancora non ha un ruolo nella morte.

---

### 6.7 COLATA & TEMPRA · ambiente: caldo e freddo

> *GHISA sputa ghisa fusa, SOFFIO la tempra con un soffio gelido: ponti, gradini e croste sulla scoria, costruiti di corsa.*

**Input**: GHISA `E` sputa un getto di colata (a terra: arco in avanti, tenuto
= mira; in aria: cade dritto sotto di lui). SOFFIO `-` a terra: **Tempra**, un
soffio gelido a cono (5 tile, ampio 30°, con `↓` verso il basso).

**Effetto**
- *Colata*: dove tocca, il getto diventa un blocco fuso allineato alla
  griglia, che brilla per 1,2 s (non regge nessuno; chi lo tocca fa un balzo
  "scottato", senza morire), poi si solidifica in un blocco di ghisa per 10 s e
  si sgretola (lampeggia un secondo prima). Ogni blocco pesa 0,2 sulle piastre.
  Riserva di 3 sputi, ricarica 0,8 s; al massimo 3 blocchi, il quarto fa
  sgretolare il più vecchio.
- *Tempra*: il metallo fuso a terra diventa solido subito (PSSSH); un getto
  ancora in volo si **fissa dove si trova** e resta sospeso come gradino per
  6 s; la scoria delle vasche si copre di una **crosta** (fino a 4 tile, per
  3 s) che regge solo chi non è pesante; gli sfiati restano tappati per 2 s.
  Ricarica 0,5 s.
- *Spruzzo*: lo Schianto di GHISA su un blocco ancora fuso lo spalma in una
  lastra di 5 tile (un ponte), da temprare entro 1,2 s: sopra la scoria, se
  non la tempri, affonda.

**Bilancia e ruoli**: i blocchi cambiano con la massa di GHISA (pesante 3×1
tile vicino, medio 2×1, leggero 1×1 ma con gittata doppia). La crosta regge
solo chi non è pesante, quindi per attraversarla bisogna sistemare la
Bilancia; chi resta pesante passa sui blocchi di GHISA. Lo Spruzzo esiste solo
con lo Schianto, quindi solo con GHISA pesante.

**Momento dopamina**: il sibilo del vapore, il rosso che diventa grigio sotto
i piedi, e il pavimento che si crea un attimo prima di caderci.

**Esempio**: fiume di scoria di 8 tile. SOFFIO leggero ci corre sopra temprando
la crosta davanti a sé; GHISA pesante sputa due isole a 2 tile l'una e salta
d'isola in isola.

**Schermo diviso**: la Tempra deve raggiungere il getto (5 tile), quindi i due
restano vicini e lo schermo resta quasi sempre unico. Croste e blocchi sono
oggetti del mondo, visibili da entrambe le metà.

**Fattore morte**: la scoria diventa il pericolo protagonista e i gadget sono
il modo di domarla. Rinascita col gadget: SOFFIO tempra il Tizzone di GHISA e
GHISA esce "ricolato", fumante; GHISA sputa una colata sullo Sbuffo di SOFFIO
che, scaldato, rinasce con un balzo.

---

### 6.8 LINGOTTO & SOFFIATA · la massa diventa un oggetto

> *La massa non si travasa soltanto: si lancia. Chi prende il lingotto al volo cambia forma all'istante.*

**Input**: GHISA `E` espelle un lingotto con 0,3 della sua massa (a terra arco
in avanti, tenuto = mira). SOFFIO `-` a terra: una soffiata a cono (5 tile) che
devia il lingotto, i corpi leggeri e le casse; se SOFFIO ha appena preso il
lingotto, `-` lo risputa dritto (500 px/s, 8 tile).

**Effetto**: GHISA perde 0,3 all'istante (serve almeno 0,4). Il lingotto vola,
preme le piastre (conta 0,3), e chi lo tocca lo prende e guadagna 0,3. Se
nessuno lo prende entro 2,5 s dall'atterraggio, torna da solo a GHISA. Un
lingotto alla volta. La soffiata ha una ricarica di 0,5 s.

**Bilancia e ruoli**: un lingotto porta da leggero a pesante (0,3 → 0,6). Solo
di GHISA: a 0,7 lancia il lingotto in alto, diventa leggero, salta altissimo,
lo riprende all'apice e torna pesante, poi fa lo Schianto. In coppia: GHISA
lo passa a SOFFIO sulla piastra (SOFFIO diventa pesante e la preme), mentre
GHISA, alleggerito, sale nella corrente.

**Momento dopamina**: la presa al volo, un CLANG e il corpo che cambia forma a
mezz'aria; i passaggi in catena.

**Esempio**: piastra in fondo a un pozzo e solaio fragile in cima. SOFFIO (0,3)
riceve il lingotto sulla piastra e la preme; GHISA (0,4) sale nella colonna
d'aria; SOFFIO gli risputa il lingotto in verticale, GHISA lo prende, torna
pesante e sfonda il solaio.

**Schermo diviso**: il lingotto attraversa le metà e ha sempre una freccia sul
bordo; il ritorno automatico garantisce che non si perda mai.

**Fattore morte**: *passagli la vita*. Lo spirito rinasce quando prende il
lingotto: ogni rinascita è un passaggio.

**Attenzione**: è lo stesso principio della Zavorra (massa parcheggiata fuori
dai corpi), in versione dinamica. Vedi la valutazione.

---

### 6.9 MORSA & TURBINA · fusione in un corpo solo

> *I due si fondono in una macchina a due teste: un solo corpo da 1,0 con tutte e due le mosse.*

**Input**: GHISA `E` su SOFFIO (entro 1,5 tile) aggancia; SOFFIO accetta con
`-` entro 0,5 s (una stretta di mano, per evitare scherzi). Durante la fusione:
GHISA guida (`A` `D` e `W`), fa lo Schianto con `S` e si sgancia con `E`;
SOFFIO orienta la turbina con le frecce (8 direzioni) e dà spinte con `-` (3
cariche, ricaricate a terra).

**Effetto**: il corpo fuso pesa 1,0: preme qualunque piastra, non sale nelle
correnti. Ogni spinta della turbina vale 260 px/s nella direzione scelta. Lo
*Schianto totale* ha raggio doppio; l'*Ariete* (una spinta contro un muro di
lamiera) lo sfonda. La *Scissione* sbalza i due in direzioni opposte (5 tile
ciascuno).

**Bilancia e ruoli**: la fusione è l'unico momento in cui la massa è tutta in
un posto e si hanno entrambe le abilità. Il prezzo è che si è lenti e
ingombranti.

**Momento dopamina**: la trasformazione, e il pilotaggio a quattro mani.

**Esempio**: un muro di lamiera sopra un baratro. Fusione, GHISA salta, SOFFIO
spinge in avanti: il muro si sfonda. Scissione sul bordo opposto.

**Schermo diviso**: da fusi lo schermo è sempre unico; la Scissione lo può
aprire di colpo.

**Fattore morte**: il corpo fuso che tocca un pericolo si scinde invece di
morire (una volta per fusione): la fusione fa da scudo.

**Attenzione**: dividersi il controllo di un corpo solo è parente stretto
dello "scambiarsi i tasti", che l'utente ha già scartato.

---

### 6.10 CAMPANA & BOLLA · salvataggio e rianimazione

> *GHISA è lo scudo, SOFFIO il salvagente: i gadget servono soprattutto a non far morire l'altro.*

**Input**: GHISA `E` lancia una campana di ghisa (arco di 5 tile, tenuto =
mira); `E` di nuovo, il *rintocco*: la campana salta verso GHISA lanciando in
alto chi ci sta sopra (5 tile). SOFFIO `-` a terra soffia una bolla dritta
(400 px/s, 8 tile).

**Effetto**: la campana atterra a bocca in giù (2×2 tile). Chi sta sotto è
protetto da tutto per 3 s (il maglio si ferma sopra, gli sfiati si
infrangono); sopra è una piattaforma solida e sulle piastre pesa 0,3. La bolla
avvolge il primo corpo colpito (GHISA, cassa, spirito) e lo fa salire per
2,5 s, immune a cadute e pericoli; chi è dentro sterza piano e la fa scoppiare
saltando. La bolla si ricarica in 1,5 s.

**Bilancia e ruoli**: la bolla sale a 120 × (1 − massa) px/s, quindi un GHISA
pesante resta quasi sospeso e uno leggero vola via. La campana di GHISA
pesante cade come un maglio (onda che spinge le casse); quella di GHISA
leggero va più lontano ma è piccola (1×1).

**Momento dopamina**: il salvataggio all'ultimo istante, il "ti ho preso!" del
divano co-op. Il DONG della campana.

**Esempio**: GHISA sbalzato da uno sfiato cade verso la scoria; SOFFIO gli
spara una bolla e lo riporta su. Un corridoio di magli: GHISA lancia la campana
su SOFFIO e lui ci cammina sotto, protetto, fino alla fine.

**Schermo diviso**: tutto entro 8 tile, nessun problema.

**Fattore morte**: è l'opzione costruita sulla morte. La bolla cattura lo
spirito e lo porta al compagno; la campana posata sopra uno spirito lo fa
rinascere in 0,5 s.

---

## 7. Valutazione

### 7.1 La griglia

| # | Criterio | Peso | 1 = ... | 5 = ... |
|---|---|---|---|---|
| C1 | Frequenza d'uso momento per momento | 12 | si usa una volta per stanza | si usa ogni pochi secondi |
| C2 | Intensità del feedback, juice | 10 | effetto sobrio | effetto che si sente nelle mani |
| C3 | Interdipendenza co-op | 14 | si gioca bene da soli | senza l'altro il gadget non vive |
| C4 | Combinatoria (altro gadget, ruoli, elementi) | 12 | poche interazioni | combo con tutto |
| C5 | Leggibilità al primo uso | 12 | va spiegata a parole | si capisce provandola |
| C6 | Skill expression | 8 | esito fisso | mira, tempo e stile contano |
| C7 | Coerenza con la Bilancia e col tema | 10 | incollata | nasce dalla Bilancia e dalla fonderia |
| C8 | Schermo diviso e 2 tasti extra | 7 | crea problemi | ne approfitta |
| C9 | Integrazione col fattore morte | 8 | indifferente | rende la morte co-op |
| C10 | Costo e rischio d'implementazione (AABB semplice) | 7 | caro e rischioso | economico e sicuro |

Punteggio finale = somma di (voto × peso) / 5, su 100.

### 7.2 Punteggi

| # | Coppia | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | **Totale** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | **Lancio & Risucchio** | 4 | 5 | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 4 | **94,6** |
| 1 | **Braci & Tiraggio** | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 4 | 4 | 4 | **91,2** |
| 7 | **Colata & Tempra** | 4 | 5 | 4 | 5 | 4 | 4 | 5 | 4 | 5 | 3 | **86,6** |
| 8 | Lingotto & Soffiata | 4 | 4 | 4 | 5 | 2 | 5 | 5 | 4 | 5 | 4 | 82,8 |
| 10 | Campana & Bolla | 3 | 4 | 5 | 3 | 5 | 4 | 3 | 4 | 5 | 4 | 80,0 |
| 5 | Rivetti & Scia | 4 | 3 | 4 | 4 | 5 | 3 | 4 | 4 | 2 | 5 | 77,0 |
| 4 | Stampo & Controvento | 4 | 4 | 4 | 4 | 3 | 5 | 2 | 4 | 5 | 3 | 75,4 |
| 9 | Morsa & Turbina | 2 | 5 | 5 | 3 | 3 | 4 | 4 | 4 | 3 | 2 | 70,8 |
| 6 | Ancora & Refolo | 4 | 4 | 3 | 4 | 4 | 4 | 2 | 2 | 3 | 4 | 68,8 |
| 3 | Pozzo & Nube | 3 | 3 | 4 | 4 | 2 | 3 | 4 | 4 | 3 | 3 | 66,2 |

**Tenuta dell'ordine**: i primi tre restano gli stessi anche raddoppiando il
peso della leggibilità, della Bilancia o del costo. L'unico confronto stretto
è fra Colata (3ª) e Lingotto (4ª), ed è deciso dalla leggibilità (vedi §8).

### 7.3 Pro e contro

**1. Braci & Tiraggio** (91,2)
- Pro: il juice più alto di tutti (scoppi, catene, razzi); interdipendenza
  netta (GHISA arma, SOFFIO accende); combo con Schianto, Scatto, accordo,
  casse; ricarica rapidissima.
- Contro: caos visivo se le braci si accumulano; i razzi possono scavalcare i
  livelli; da solo GHISA lancia braci che non fanno niente, e questo a volte
  delude.

**2. Lancio & Risucchio** (94,6)
- Pro: agisce direttamente sul compagno; "chi pesa meno vola" si capisce in un
  tentativo; l'accordo diventa il cuore del duo; ogni stato della Bilancia dà
  un significato a tutti e due i gadget; costa poco.
- Contro: il lancio vuole i due vicini; SOFFIO in spalla può sentirsi un
  passeggero; lanci lunghi possono saltare pezzi di livello; lanciare il
  compagno nella scoria può far litigare (o ridere).

**3. Pozzo & Nube** (66,2)
- Pro: è la Bilancia resa locale; molte combinazioni con piastre e casse.
- Contro: i numeri moltiplicati non si vedono (stesso problema della Zavorra);
  campi da posare e aspettare; rompe la tensione centrale "mai tutti e due al
  massimo".

**4. Stampo & Controvento** (75,4)
- Pro: versatile e molto espressivo; annullare una morte è un momento
  fortissimo.
- Contro: legame con la Bilancia incollato; il riavvolgimento confonde (chi si
  è mosso, e perché?); ingessare il compagno si presta a dispetti; stato di
  piastre e cancelli durante il riavvolgimento delicato da gestire.

**5. Rivetti & Scia** (77,0)
- Pro: chiarissima; riusa piattaforme attraversabili e colonne d'aria che ci
  sono già; la più economica.
- Contro: ricade nel "posa e usa"; poco juice; morte quasi assente.

**6. Ancora & Refolo** (68,8)
- Pro: teletrasporto immediato e soddisfacente.
- Contro: lo scambio inverte le metà dello schermo e disorienta; molti usi da
  soli; legame debole con la Bilancia; costringe a progettare livelli contro le
  scorciatoie.

**7. Colata & Tempra** (86,6)
- Pro: tema perfetto (colare e temprare *sono* la fonderia); trasforma la
  scoria nel pericolo protagonista; crosta e blocchi incastrano la Bilancia;
  costruire sotto i piedi del compagno è adrenalina pura.
- Contro: il più caro dei tre (celle dinamiche, croste che dipendono dalla
  massa); costruire troppo può aggirare il livello; SOFFIO ha un ruolo un po'
  più di supporto.

**8. Lingotto & Soffiata** (82,8)
- Pro: è la Bilancia fatta oggetto, un'idea unica di TANDEM; combo
  bellissime; rinascita elegante.
- Contro: rimette la massa in un terzo posto, cioè il principio che ha reso
  incomprensibile la Zavorra; GHISA ha combo che si fa da solo; si sovrappone
  ai "lanci" delle altre finaliste.

**9. Morsa & Turbina** (70,8)
- Pro: è il nome del gioco; massima co-op; trasformazione spettacolare.
- Contro: si usa di rado; chi controlla cosa va spiegato; è vicino allo
  scambio di comandi scartato; costoso.

**10. Campana & Bolla** (80,0)
- Pro: i salvataggi al volo sono il picco emotivo del co-op da divano;
  chiarissima; la morte è il suo centro.
- Contro: è reattiva (vive quando c'è pericolo, quindi si usa meno); poca
  combinatoria con Bilancia ed elementi.

---

## 8. Scrematura: perché vincono queste tre

**Lancio & Risucchio** vince perché è l'unica opzione in cui **tutti e due i
gadget agiscono sul compagno** e in cui **la Bilancia decide l'esito di ogni
uso**. L'accordo, che all'utente piace, smette di essere un'azione a parte e
diventa l'interruttore del duo (chi lancia, chi vola). Non posa niente, non
carica niente: corregge in modo diretto sia la Zavorra sia il Mantice.

**Braci & Tiraggio** è la più dopaminergica: è lo schema innesco-detonatore di
It Takes Two portato nella fonderia (il mantice che soffia sul fuoco), con
ricariche sotto il secondo e catene di lunghezza variabile. Prende l'unica
cosa buona del Mantice (*più sei leggero, più voli*) e la rende istantanea.

**Colata & Tempra** è la più ricca di tema e di ambiente: è l'unica che
**costruisce il livello mentre lo si gioca**, e fa nascere il pericolo della
morte (la scoria) insieme ai gadget che servono a domarlo. Batte il Lingotto
di un soffio: il Lingotto ha combo eccellenti ma rimette la massa fuori dai
corpi, cioè proprio l'idea che l'utente non ha capito nella Zavorra. È un
rischio che non conviene correre come terza scelta.

**Le altre** perdono su almeno un criterio pesante:
- Pozzo, Stampo e Ancora sulla leggibilità o sul legame con la Bilancia;
- Rivetti sulla dinamicità (torna il "posa e aspetta");
- Campana sulla frequenza;
- Morsa sulla frequenza e sulla vicinanza a un'idea già scartata.

**Cosa recuperare dalle scartate**:
- la **presa al volo** (da Campana & Bolla) è già dentro Lancio & Risucchio;
- la **rinascita sul battito** prende da Cuphead e da Stampo il gusto del
  tempismo, senza il conto alla rovescia;
- le **correnti temporanee** di Rivetti & Scia possono diventare un elemento
  di livello;
- il **Lingotto** resta una buona candidata per una zona avanzata, quando i
  giocatori avranno già interiorizzato la Bilancia.

---

## 9. Le finaliste in dettaglio

### 9.1 LANCIO & RISUCCHIO

#### Descrizione completa

Una regola sola, scritta sul mondo: **chi pesa meno vola**.

**GHISA: il Lancio.** GHISA diventa il lanciatore della coppia, il regista dei
voli.
- *Afferra* (`E` vicino, entro 1 tile, a terra o in aria): SOFFIO, una cassa o
  lo spirito di SOFFIO finiscono sulle spalle di GHISA, che si piega un attimo
  sotto il peso. Sopra SOFFIO compare l'icona `E` quando è a portata: non si
  afferra mai niente per sbaglio.
- *Presa al volo* (`E` a vuoto): mani aperte per 0,25 s, poi 0,3 s di attesa.
  Se SOFFIO, una cassa o uno spirito ci passano dentro, sono presi. Serve a
  salvare SOFFIO che cade.
- *Lancia* (`E` con qualcosa in spalla): tocco = lancio standard a 55° in
  avanti; tenuto = GHISA si pianta, mira con WASD e vede la traiettoria a
  puntini; al rilascio lancia. Velocità = 240 + 400 × (massa GHISA − massa del
  bersaglio) px/s, fino a 500. Il lancio ricarica lo Scatto di SOFFIO.
- *Carica il lancio*: tenendo `Q` con SOFFIO in spalla, GHISA tira massa e la
  traiettoria si allunga sotto i suoi occhi.
- *In spalla*: GHISA va all'85% della velocità; sulle piastre i due pesano 1,0.
  SOFFIO può saltare giù (`↑`, con 1 tile di bonus), tirare massa (`.`) o usare
  il Risucchio dalle spalle, come una torretta.

**SOFFIO: il Risucchio.** SOFFIO diventa un aspiratore da fonderia.
- *Risucchio* (`-` tenuto, a terra o sulle spalle): un imbuto d'aria aggancia
  il bersaglio valido più vicino davanti a lui (cono di 120°, entro 8 tile, in
  linea di vista; preferisce GHISA, con `↓` preferisce i bersagli in basso).
- *Chi pesa meno vola* verso l'altro a 380 px/s; a masse pari si vengono
  incontro. Le particelle dell'imbuto scorrono sempre verso chi resta fermo, e
  questo rende leggibile la direzione. Decisa all'aggancio, la direzione non
  cambia finché si tiene premuto.
- *Fiato*: 1 s di risucchio continuo, ricarica completa in 0,8 s; un anello
  ciano attorno a SOFFIO si svuota e si riempie.
- *Fionda*: mollando prima dell'arrivo, chi vola tiene il 60% della velocità.
- *Arrivo*: piccola spinta verso l'alto per salire sui bordi (la correzione
  d'angolo di Celeste).
- *Bersagli*: GHISA, casse (rampino se SOFFIO pesa meno di 0,35), gemme,
  spiriti.

**Combo con ruoli e accordo**
- *L-S-R*: lancia, scambia, risucchia. È il passo base della coppia.
- *Meteora*: accordo mentre SOFFIO vola. SOFFIO diventa pesante, piomba sulla
  piastra e sbalza le casse.
- *Risucchio-Schianto*: GHISA leggero tirato su, accordo a metà volo, arriva
  pesante e preme `S`.
- *Lancio in corrente*: SOFFIO lanciato dentro una colonna d'aria sale
  altissimo (è uno dei pochi casi in cui lo schermo si apre).

**Elementi di livello**: bastano scoria, sfiati, lamiere e soffitti bassi
(che costringono a lanci tesi). Piastre, solai fragili, casse e correnti di
oggi funzionano tutti con questa coppia.

#### Ciclo base

- **Ogni 5 secondi**: si sistema la Bilancia (`Q`, `.` o accordo) e si fa un
  lancio o un risucchio. Un ciclo L-S-R completo dura circa 3 s.
- **Ogni 30 secondi**: una stanza che combina una traversata (muro, canale,
  mensola), un problema di peso (piastra, solaio) e un pericolo (scoria,
  sfiato). Si mettono in conto 0-2 morti e altrettante rinascite al volo.
- **In un livello (45-60 s)**: due stanze note più una stanza "firma" con una
  variante (soffitto basso, Meteora, cassa-rampino, presa al volo), con una
  Forgia a metà.

#### Sequenza d'esempio: "La gettata" (~50 s)

| Tempo | Battuta | Masse GHISA/SOFFIO |
|---|---|---|
| 0-6 s | **Il primo lancio.** Mensola a 7 tile. GHISA tiene `Q` per 0,6 s. `E`: SOFFIO in spalla. `E`: lancio. SOFFIO sale di ~8 tile, prende la gemma sulla traiettoria e atterra sulla mensola. | 0,5/0,5 → 0,9/0,1 |
| 6-10 s | **Scambia e risucchia.** Accordo. SOFFIO tiene `-`: l'imbuto aggancia GHISA, che vola su in 0,4 s e atterra accanto. Il ciclo L-S-R è imparato. | 0,1/0,9 |
| 10-18 s | **Il canale.** Scoria per 12 tile, soffitto a 5 tile. Accordo. GHISA prende SOFFIO e tiene `E`: mira bassa, la traiettoria passa sotto il soffitto. Rilascio: SOFFIO vola teso e alla fine scatta (lo Scatto è ricaricato) fino all'altra riva. | 0,9/0,1 |
| 18-26 s | **Il ritorno e la prima morte.** Accordo. SOFFIO risucchia GHISA sopra la scoria; a metà uno sfiato spara e sbalza GHISA (leggero) fuori dall'imbuto. SOFFIO molla, GHISA cade nella scoria. Il Tizzone compare sulla riva di partenza; il giocatore di GHISA lo guida sopra la scoria; entro 8 tile SOFFIO lo risucchia e GHISA rinasce accanto a lui in ~1,5 s (perfetta se l'aggancio cade sul battito). | 0,1/0,9 (ferme durante la morte) |
| 26-34 s | **Meteora.** Piastra su una mensola alta 6 tile e lontana 8, collegata a un cancello che resta aperto. Accordo, lancio alto; a metà volo secondo accordo: la parabola si spezza e SOFFIO piomba sulla piastra (CLANG). Il cancello si blocca aperto, GHISA ora leggero ci passa e SOFFIO salta giù dalla mensola. | 0,9/0,1 → 0,1/0,9 |
| 34-42 s | **Solaio.** Il percorso scende attraverso un solaio fragile. Accordo; GHISA salta e preme `S`: Schianto, il solaio cede, cadono in un pozzo con sfiati laterali. | 0,9/0,1 |
| 42-50 s | **Presa al volo.** SOFFIO, leggero, cade più piano; uno sfiato lo spinge verso una vasca. GHISA, già a terra, preme `E` mentre SOFFIO gli passa sopra: presa al volo, salvo. GHISA porta SOFFIO in spalla fino alla bandiera: arrivano insieme. | 0,9/0,1 |

#### Come risolve i difetti

- **Zavorra incomprensibile**: la massa resta **sempre nei due corpi**. La sola
  regola nuova è "chi pesa meno vola", e si vede (chi si muove, chi resta
  piantato). Niente terzo posto, niente da riprendere.
- **Mantice lento**: il lancio è **istantaneo** (afferra e lancia in 0,3 s),
  senza carica e senza oggetto da posare. Resta l'idea buona del Mantice, il
  leggero che vola più in alto, ma diventa una regola dei corpi e non di un
  attrezzo.
- **Statici**: entrambi i gadget si usano in movimento e sul compagno.
- **Swag di GHISA**: GHISA diventa il lanciatore, quello che decide dove
  atterra l'altro e che lo salva al volo.

#### Morte e rinascita consigliate

- Regole comuni di §4 (spirito guidato, Bilancia ferma, accordo di rinascita,
  rinascita perfetta, Forge).
- **Rinascite col gadget**: GHISA afferra lo Sbuffo e SOFFIO rinasce **sulle
  sue spalle**, pronto per essere lanciato; SOFFIO risucchia il Tizzone da
  8 tile e GHISA rinasce **accanto a lui**. Tempo tipico 1-1,5 s.
- **Salvataggi**: presa al volo su SOFFIO che cade, risucchio su GHISA leggero
  che precipita.
- **Fuoco amico**: lanciare il compagno nella scoria lo uccide. È voluto: è
  comico, la colpa è chiara, e si rimedia in un secondo.

#### Tasti

- GHISA: lo Schianto passa su `S` in aria; `E` = afferra, lancia, presa al
  volo, sempre.
- SOFFIO: nessuna modifica (`-` a terra o sulle spalle = Risucchio; `-` in aria
  = Scatto).

#### Rischi

- **Scorciatoie**: un lancio da 8 tile scavalca i puzzle. Contromisure:
  soffitti bassi, la gittata massima solo con la Bilancia agli estremi (che
  rende GHISA lento e SOFFIO incapace di premere piastre), il risucchio che
  vuole linea di vista.
- **SOFFIO passeggero**: SOFFIO può scendere quando vuole, usa il Risucchio
  dalle spalle ed è lui quello che vola, scatta e plana.
- **Direzione a masse quasi pari**: va resa visibile (particelle, suono
  diverso) o evitata con una piccola zona morta (±0,05).
- **Loop infiniti** L-S-R per salire ovunque: sono il verbo voluto; li limitano
  l'attesa dell'accordo (0,7 s), il fiato e la struttura dei livelli.

#### Complessità stimata

| Pezzo | Giorni |
|---|---|
| Afferra, in spalla, presa al volo | 1 |
| Lancio con mira e traiettoria | 1 |
| Risucchio (aggancio, regola della massa, fiato, fionda, spinta sui bordi) | 1-1,5 |
| Meteora, rinascite col gadget | 0,5 |
| Juice e suoni | 0,5 |
| **Totale gadget** | **4-4,5** |

Rischio tecnico **basso**: si appoggia a cose che il motore ha già (lancio a
un'altezza data, corpi spingibili, rilevatore d'accordo, appoggio sui corpi).
A questo si sommano i 4-4,5 giorni del sistema morte comune (§10).

---

### 9.2 BRACI & TIRAGGIO

#### Descrizione completa

Una regola: **GHISA arma, SOFFIO accende, il leggero decolla**.

**GHISA: le Braci.**
- `E`: lancia una brace (tocco = arco medio in avanti; tenuto = mira con
  traiettoria visibile; a terra con `S` tenuto = ai piedi).
- La brace si attacca alla prima superficie: muro, soffitto, pavimento, cassa.
  Sui personaggi rimbalza.
- Riserva di 3, una nuova ogni 0,7 s, visibili come tre tizzoni sulla schiena
  di GHISA (si spengono quando le lanci e si riaccendono quando tornano). Al
  massimo 3 attive.
- Con la massa: pesante = Brace grossa (4 tile, raggio 3); medio = 6 tile,
  raggio 2,5; leggero = Favilla (8 tile, raggio 2).

**SOFFIO: il Tiraggio.**
- `-` a terra: soffio a cono (5 tile × 40°; `↓` verso il basso). Accende le
  braci nel cono una dopo l'altra (0,06 s di distanza), spinge i leggeri,
  sposta le casse. Ricarica 0,45 s.
- Con la massa: leggero = cono lungo 7 tile e stretto; pesante = 4 tile, sposta
  le casse di 2.
- In aria resta lo Scatto: attraversare una brace la accende alle spalle e
  allunga lo Scatto del 50%.

**L'esplosione**: raggio 2-3 tile, spinta di 560 × (1 − massa) px/s, sempre
almeno per metà verso l'alto, mai danni. Accende le braci vicine (micce),
sbalza le casse, abbatte i Muri di loppa, accende i Fornelli.

**Combo**
- *Razzo*: brace ai piedi del leggero, soffio verso il basso, 6-8 tile di
  volo.
- *Doppio razzo a tempo*: il leggero salta, il compagno accende una brace sul
  muro mentre ci passa accanto.
- *Miccia*: braci a 1,5 tile l'una, un soffio solo, catena lungo il corridoio.
- *Schianto incendiario*: lo Schianto accende le braci sul pavimento entro
  3 tile.
- *Scatto-razzo*.
- *Accordo a mezz'aria*: decollo da leggero, Schianto da pesante.

**Elementi nuovi**: Muro di loppa (lo abbattono solo le esplosioni: i solai
fragili restano dello Schianto) e Fornello (interruttore a fuoco: acceso apre
il suo cancello; versione a tempo solo nelle zone avanzate).

#### Ciclo base

- **Ogni 5 secondi**: GHISA semina 1-3 braci dove servono (muro, sotto i piedi
  del compagno, lungo una miccia); SOFFIO le accende col soffio o con lo
  Scatto. La riserva si riempie in 2,1 s.
- **Ogni 30 secondi**: una stanza con un razzo (verticale), una miccia
  (catena verso i fornelli), un muro di loppa e un pericolo; almeno una combo
  con Schianto o accordo.
- **In un livello**: tre stanze brevi, una Forgia a metà, un finale con una
  catena lunga.

#### Sequenza d'esempio: "La fornace" (~45 s)

| Tempo | Battuta | Masse GHISA/SOFFIO |
|---|---|---|
| 0-5 s | **Il primo scoppio.** Muro di loppa. GHISA `E`: brace sul muro. SOFFIO `-`: BUM, il muro crolla. | 0,5/0,5 |
| 5-13 s | **Il razzo.** Pozzo di 10 tile. GHISA tira massa. Con `S`+`E` lascia una brace ai piedi di SOFFIO; tenendo `E` ne mira una sul muro a 6 tile. SOFFIO `↓`+`-`: decolla di ~6 tile, all'apice scatta attraverso la seconda brace e plana sul bordo. Accordo. GHISA, ora leggero, salta (7 tile) accanto a una terza brace sul muro; SOFFIO, dall'alto, soffia giù al momento giusto: doppio razzo e GHISA è su. | 0,8/0,2 → 0,2/0,8 |
| 13-21 s | **La miccia.** Corridoio con tre fornelli e un cancello. GHISA semina tre braci a 1,5 tile l'una (una ogni 0,7 s); SOFFIO soffia sulla prima: "ta-ta-ta" lungo la miccia, i fornelli si accendono, il cancello si apre. | 0,2/0,8 |
| 21-29 s | **Lo sfiato traditore.** Pista sopra la scoria con due sfiati. Accordo, poi SOFFIO (leggero) passa mentre uno sfiato soffia: volato via, finisce nella scoria. Lo Sbuffo compare sulla riva; GHISA (pesante) ci lancia contro una brace grossa: SOFFIO rinasce come aria calda, con un balzo. Poi GHISA cammina davanti a SOFFIO e lo sfiato si infrange su di lui. | 0,8/0,2 |
| 29-37 s | **Schianto incendiario.** Solaio fragile con un muro di loppa sotto. GHISA mette una brace sul solaio, salta, `S`: il solaio cede, la brace accesa cade e scoppia contro la loppa. Doppio sfondamento. SOFFIO, che stava accanto, viene sparato in alto e prende la gemma in cima. | 0,8/0,2 |
| 37-45 s | **La volata.** Baratro con una colonna d'aria a metà; la bandiera è oltre. GHISA, pesante, nella colonna non salirebbe: lascia una brace ai piedi. Accordo (GHISA leggero, SOFFIO pesante); SOFFIO, accanto a lui sul bordo, soffia: GHISA decolla dentro la colonna e la corrente lo porta alla bandiera. Accordo di nuovo all'arrivo: SOFFIO, tornato leggero, salta nella corrente e lo raggiunge. | 0,8/0,2 → 0,2/0,8 → 0,8/0,2 |

#### Come risolve i difetti

- **Zavorra incomprensibile**: niente massa fuori dai corpi. Le braci sono
  fuoco, non peso.
- **Mantice lento**: il lancio è un'esplosione, istantanea; la ricarica è di
  0,7 s; l'idea buona del Mantice (il leggero vola di più) diventa la regola
  della spinta.
- **Statici**: le braci si lanciano in corsa e in aria, e il Tiraggio si usa
  ogni mezzo secondo.
- **Swag di GHISA**: GHISA diventa il granatiere della fornace; lo Schianto
  incendiario è la sua mossa da poster.

#### Morte e rinascita consigliate

- Regole comuni di §4.
- **Rinascite col gadget**: SOFFIO soffia sul Tizzone (entro 5 tile) e GHISA
  si *riattizza* in una fiammata; GHISA centra lo Sbuffo con una brace e SOFFIO
  rinasce come aria calda, con un balzo verso l'alto. ~1 s.
- **Rinascita perfetta col gadget**: la fiammata della rinascita esplode come
  una brace (spinge le casse, abbatte la loppa).
- Le esplosioni non uccidono mai: il pericolo viene solo dall'ambiente, spesso
  da una spinta finita male.

#### Tasti

- GHISA: Schianto su `S` in aria; `E` = brace, sempre.
- SOFFIO: invariato. Da provare `↓` + `-` in aria per il razzo a mezz'aria.

#### Rischi

- **Caos visivo**: al massimo 3 braci, effetti locali, colori fissi (arancio
  armato, bianco quando scoppia).
- **Abuso dei razzi**: tre razzi di fila fanno 18-24 tile; servono soffitti e
  pericoli in alto.
- **GHISA che lancia a vuoto**: senza SOFFIO vicino le braci restano lì;
  lo Schianto incendiario gli dà comunque un uso, da pesante.
- **Taratura della spinta**: va regolata con la massa (curva, minimo verso
  l'alto) in sessioni dedicate.

#### Complessità stimata

| Pezzo | Giorni |
|---|---|
| Brace: lancio, aggancio alle superfici, riserva sul corpo | 1,5 |
| Tiraggio: cono, accensione in ordine, catene | 1 |
| Esplosione con spinta dipendente dalla massa | 0,5 |
| Scatto-razzo, Schianto incendiario | 0,5 |
| Muro di loppa, Fornello | 1 |
| Juice e suoni | 1 |
| **Totale gadget** | **5,5** |

Rischio tecnico **basso-medio**: il motore ha già lo sbalzo delle casse dello
Schianto; la difficoltà vera è la taratura.

---

### 9.3 COLATA & TEMPRA

#### Descrizione completa

Una regola: **GHISA cola, SOFFIO tempra: il caldo crea, il freddo fissa**.

**GHISA: la Colata.**
- `E` a terra: sputa un getto di ghisa fusa in avanti (tenuto = mira). `E` in
  aria: il getto cade dritto sotto di lui (la piattaforma d'emergenza).
- Il getto diventa un blocco allineato alla griglia: pesante 3×1 tile e
  vicino, medio 2×1, leggero 1×1 ma con gittata doppia.
- Fuso per 1,2 s: brilla di rosso, non regge nessuno e scotta (balzo
  all'indietro, nessuna morte). Poi diventa grigio e solido per 10 s, e si
  sgretola con un lampeggio d'avviso.
- Ogni blocco pesa 0,2 sulle piastre. Riserva di 3 sputi (bagliore sulla
  pancia di GHISA), ricarica 0,8 s; al massimo 3 blocchi.
- *Spruzzo*: Schianto su un blocco ancora fuso, che diventa una lastra di
  5 tile.

**SOFFIO: la Tempra.**
- `-` a terra: soffio gelido a cono (5 tile, ampio 30°; `↓` verso il basso).
  Ricarica 0,5 s.
- *Su metallo fuso a terra*: solido all'istante, con una nuvola di vapore.
- *Su un getto in volo*: il getto si fissa nell'aria come gradino sospeso per
  6 s (è il cuore delle combo).
- *Sulla scoria*: crosta fino a 4 tile, per 3 s; regge solo chi non è pesante
  e si crepa visibilmente (crepe che si allargano 0,4 s prima di cedere) sotto
  chi pesa troppo.
- *Sugli sfiati*: tappati per 2 s.
- *Sui corpi leggeri*: una piccola spinta.

**Combo**
- *Gradini al volo*: GHISA lancia in alto, SOFFIO tempra all'apice: un gradino
  dove serve.
- *Isole*: getti di GHISA pesante nella scoria, che reggono anche lui.
- *Corsa sulla crosta*: SOFFIO leggero corre temprando davanti a sé.
- *Spruzzo + Tempra*: un ponte di 5 tile in mezzo secondo.
- *Pavimento d'emergenza*: GHISA cade, sputa sotto di sé, SOFFIO tempra.
- *Piastra*: due blocchi (0,4) più SOFFIO leggero (0,2) = 0,6.

**Elementi nuovi**: la scoria con la crosta, le cascate di colata dal soffitto
(uccidono; la Tempra le congela in stalattiti per 3 s).

#### Ciclo base

- **Ogni 5 secondi**: GHISA sputa un getto (blocco, isola, gradino); SOFFIO lo
  tempra o crea una crosta.
- **Ogni 30 secondi**: una traversata di scoria, una costruzione (scala o
  ponte) e un pericolo da tappare.
- **In un livello**: due o tre stanze, una Forgia a metà, un momento Spruzzo.

#### Sequenza d'esempio: "Il getto" (~50 s)

| Tempo | Battuta | Masse GHISA/SOFFIO |
|---|---|---|
| 0-6 s | **Il primo gradino.** Muro di 3 tile. GHISA `E`: il getto cade ai piedi del muro e brilla. SOFFIO `-`: PSSSH, solido subito. GHISA ci sale e scavalca; SOFFIO salta da solo. | 0,5/0,5 |
| 6-14 s | **Il fiume.** Scoria per 8 tile. GHISA tira massa. SOFFIO soffia: crosta di 4 tile, ci corre sopra, a metà soffia di nuovo, è dall'altra parte. GHISA pesante romperebbe la crosta: sputa due isole (3×1) a 2 tile l'una e salta d'isola in isola. | 0,8/0,2 |
| 14-22 s | **La scala nel vuoto.** Pozzo di 8 tile senza appigli. GHISA mira in alto e sputa; SOFFIO tempra all'apice: gradino sospeso. Tre volte, a 2 tile l'uno: una scala. GHISA sale, SOFFIO plana. | 0,8/0,2 |
| 22-30 s | **La piastra.** Piastra da 0,6 davanti a un cancello che resta aperto. GHISA sputa due blocchi sulla piastra (0,4); SOFFIO ci sale sopra (0,2): 0,6, il cancello si apre. | 0,8/0,2 |
| 30-40 s | **Lo Spruzzo e la morte.** Baratro di scoria di 9 tile. GHISA sputa sul bordo, salta, `S` sul metallo fuso: lastra di 5 tile. SOFFIO tempra in ritardo: metà lastra affonda e GHISA ci cade dentro. Il Tizzone compare sulla riva; SOFFIO lo tempra e GHISA esce "ricolato", fumante. Secondo tentativo: Spruzzo e Tempra subito, ponte di 5 tile. Per gli ultimi 4 tile GHISA sputa un'isola nella scoria, che regge tutti e due. | 0,8/0,2 (ferme durante la morte) |
| 40-50 s | **Lo sfiato.** Ultimo salto verso la bandiera sotto uno sfiato che spinge via chi è leggero. SOFFIO lo tappa con la Tempra (2 s), tutti e due saltano: bandiera. | 0,8/0,2 |

#### Come risolve i difetti

- **Zavorra incomprensibile**: la funzione buona della Zavorra (fare da
  gradino, pesare sulla piastra) sopravvive nei blocchi, ma **senza toccare la
  Bilancia**: un blocco è un blocco, pesa sempre 0,2, e sparisce da solo.
- **Mantice lento**: un blocco è pronto in 1,2 s da solo, all'istante con la
  Tempra; niente da caricare, niente da richiamare.
- **Statici**: si costruisce correndo e saltando, spesso sotto i piedi del
  compagno.
- **Swag di GHISA**: GHISA diventa il fabbro che crea il pavimento; lo Spruzzo
  è il suo colpo d'effetto.

#### Morte e rinascita consigliate

- Regole comuni di §4. La scoria è il pericolo principale e la crosta lo rende
  leggibile: chi è pesante sa che non deve calpestarla, e se lo fa la crosta
  si crepa prima di cedere.
- **Rinascite col gadget**: SOFFIO tempra il Tizzone (GHISA esce "ricolato");
  GHISA sputa sullo Sbuffo (SOFFIO, scaldato, rinasce con un balzo).
- Il metallo fuso di GHISA non uccide mai il compagno: scotta e respinge.

#### Tasti

- GHISA: Schianto su `S` in aria; `E` = colata, sempre (in aria cade sotto di
  lui).
- SOFFIO: invariato. Da provare `↓` + `-` in aria per temprare sotto di sé.

#### Rischi

- **Costruire troppo**: le scale di blocchi aggirano il livello. Contromisure:
  3 blocchi al massimo, 10 s di vita, gradini sospesi di 6 s, zone in cui la
  colata non attecchisce (lamiere calde).
- **Leggibilità della crosta**: la regola "regge solo chi non è pesante" si
  impara crepandola una volta; le crepe devono comparire già sotto i medi.
- **Tecnica**: celle che compaiono e spariscono sopra un terreno pre-cotto (il
  gioco lo fa già per cancelli e solai), croste che dipendono dalla massa,
  blocchi che compaiono addosso a un personaggio.
- **SOFFIO di supporto**: il suo gadget è più reattivo; il vapore e i gradini
  al volo devono essere spettacolari quanto lo Scatto.

#### Complessità stimata

| Pezzo | Giorni |
|---|---|
| Getto e blocchi sulla griglia (celle dinamiche) | 1,5 |
| Stati fuso, solido, sgretolato; limite di 3 | 1 |
| Tempra: cono, gradini sospesi, sfiati | 1 |
| Crosta che dipende dalla massa | 1 |
| Spruzzo | 0,5 |
| Sicurezza (blocchi addosso ai personaggi, incastri) | 0,5 |
| Juice (vapore, raffreddamento, crepe) | 1 |
| **Totale gadget** | **6,5-7** |

Rischio tecnico **medio**.

---

## 10. Raccomandazione e piano di prototipo

### Da prototipare per prima: **Lancio & Risucchio**

1. Ha il punteggio più alto e il rischio tecnico più basso.
2. Corregge **tutti e due** i difetti nel modo più diretto: niente massa fuori
   dai corpi, niente carica.
3. È la più legata a ciò che all'utente piace già: la Bilancia decide ogni
   uso, l'accordo diventa l'interruttore del duo.
4. Mette subito alla prova il sistema morte: lanci finiti male, salvataggi,
   rinascite col gadget.

### Ordine di lavoro

1. **Sistema morte comune** (4-4,5 giorni): spirito guidato, ultimo punto
   sicuro, accordo e rinascita perfetta, Forge e "Colata persa", Scoria e
   Sfiato (poi Lamiera). Si prova anche con i gadget di oggi.
2. **Lancio e Risucchio nella forma minima**: lancio senza mira, risucchio
   senza fiato. Primo playtest di 10 minuti: i giocatori capiscono "chi pesa
   meno vola" senza spiegazioni?
3. **Aggiunte**: mira tenendo `E`, fiato, fionda, Meteora, presa al volo,
   rinascite col gadget.
4. **Una stanza** nel Laboratorio con la sequenza "La gettata" (§9.1).

### Cosa misurare nel playtest

| Metrica | Obiettivo |
|---|---|
| Usi del gadget al minuto, per giocatore | ≥ 6 |
| Usi che coinvolgono il compagno | ≥ 60% |
| Tempo mediano di rinascita | ≤ 3 s |
| "Colate perse" per livello | ≤ 1 |
| Dopo 2 minuti, alla domanda "quando SOFFIO aspira, chi vola?" | risposta giusta da tutti e due |
| Osservazione libera | risate, urla di avvertimento, "rifacciamolo" |

### Dopo

Se Lancio & Risucchio regge, **Braci & Tiraggio** diventa la coppia della
seconda zona della fonderia e **Colata & Tempra** della terza. La Bilancia e
l'accordo restano la costante; i gadget cambiano zona per zona, e ogni zona ha
la sua fantasia (il lanciatore, il granatiere, il fabbro). Il Lingotto resta in
riserva per una zona avanzata.

---

## Fonti

- *It Takes Two*: [Wikipedia](https://en.wikipedia.org/wiki/It_Takes_Two_(video_game));
  [TechRadar, intervista a Josef Fares](https://www.techradar.com/news/josef-fares-it-take-two-handles-divorce-in-the-sweetest-way-possible);
  [God is a Geek, intervista a Josef Fares](https://godisageek.com/?p=247354).
- *Portal 2* co-op: [Game Developer, intervista a Erik Wolpaw](https://www.gamedeveloper.com/design/synthesizing-i-portal-2-i-);
  [Portal Wiki, strumento Ping](https://theportalwiki.com/wiki/Ping).
- *Celeste*: [Maddy Thorson, *Celeste & Forgiveness*](https://maddymakesgames.com/articles/celeste_and_forgiveness/).
- *Hollow Knight*: [Hollow Knight Wiki, SOUL](https://hollowknight.wiki/w/Soul);
  [That Nintendo Quality, *Hollow Knight's Soul Meter*](https://thatnintendoquality.substack.com/p/hollow-knights-soul-meter).
- *Super Meat Boy*: [Game Developer, McMillen spiega perché è così difficile](https://www.gamedeveloper.com/game-platforms/-i-super-meat-boy-i-s-mcmillen-explains-why-so-hard-);
  [GameDev.net, *Raw Meat: game design tips*](https://gamedev.net/tutorials/game-design/game-design-and-theory/raw-meat-game-design-tips-from-team-meats-edmund-mcmillen-r2868).
- *Rayman Legends / Origins*: [Co-Optimus, recensione co-op](https://co-optimus.com/review/1347/page/2/rayman-legends-co-op-review.html);
  [RaymanPC Wiki, Slap](https://raymanpc.com/wiki/en/Slap).
- *Cuphead*: [Prima Games, parry e rianimazione in multigiocatore](https://primagames.com/tips/cuphead-parry-controls).
- *Pico Park*: [pagina Steam](https://store.steampowered.com/app/1509960/).
- *Overcooked*: [Game Developer, *Road to the IGF: Overcooked*](https://gamedeveloper.com/design/road-to-the-igf-ghost-town-games-i-overcooked-i-);
  [Co-Optimus, intervista a Ghost Town Games](https://co-optimus.com/interview/1838/page/1/indie-ana-co-op-and-the-overcooked-interview.html).
- *Unravel Two*: [TheSixthAxis, prova con Martin Sahlin](https://www.thesixthaxis.com/2018/06/09/hands-on-unravel-twos-co-op-platforming-with-martin-sahlin/).
- *Juice*: [Jonasson & Purho, *Juice it or lose it*](https://www.gamedeveloper.com/design/video-is-your-game-juicy-enough-)
  (già citato in `GRAFICA.md`).
- Ricompensa variabile: [scheda divulgativa sui premi variabili](https://concepts.dsebastien.net/concept/variable-rewards/).
  Fonte di livello divulgativo: per approfondire servono gli studi
  originali sui programmi di rinforzo e sui *near miss*.
