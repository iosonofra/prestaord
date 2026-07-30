# Web app sostituzione prodotti ordine PrestaShop

App Node.js per cercare ordini PrestaShop tramite riferimento o ID, selezionare una o piu righe ordine e sostituire il prodotto associato con un prodotto preso dal catalogo, mantenendo i prezzi gia presenti nell'ordine.

## Requisiti PrestaShop

Nel pannello PrestaShop abilita **Parametri Avanzati > Webservice** e crea una chiave API con permessi almeno su:

- `orders`: `GET`
- `order_details`: `GET`, `PUT`
- `products`: `GET`

## Configurazione dalla web app

Apri la pagina e usa il pannello **Impostazioni** per inserire:

- URL negozio
- API key Webservice
- stati ordine da includere nella ricerca
- intervallo date ordine
- limite massimo risultati
- sincronizzazione ordini opzionale
- dimensione dei blocchi di importazione, tra 50 e 100 ordini per richiesta
- verifica senza modificare obbligatoria o facoltativa prima della scrittura reale
- password locale della web app, opzionale solo quando l'app resta su localhost

Le impostazioni vengono salvate nel file locale `app-config.json`, ignorato da Git.

## Sicurezza operativa

Prima di una sostituzione puoi usare **Verifica senza modificare** per
controllare il risultato senza scrivere nulla su PrestaShop. La verifica è
obbligatoria per impostazione predefinita; se la disattivi nelle Impostazioni,
dopo l'anteprima puoi passare direttamente alla modifica reale.

Quando confermi una sostituzione reale, l'app:

- crea un backup JSON della riga ordine originale in `backups/`
- scrive un log dell'operazione in `logs/changes.jsonl`
- restituisce l'esito per ogni singola riga aggiornata

Tutte le API operative richiedono una sessione temporanea. In uso strettamente
locale, se non hai configurato una password, la sessione viene aperta
automaticamente dal browser. Se configuri una password, devi sbloccare la
console e puoi chiudere la sessione con **Esci**.

La API key PrestaShop non viene mai restituita integralmente al browser: la
pagina Impostazioni mostra soltanto se è configurata e le ultime quattro
posizioni. Lasciando vuoto il campo di sostituzione, la chiave esistente viene
mantenuta.

Per impostazione predefinita il server ascolta soltanto su `127.0.0.1`. Se
imposti `HOST` su un'interfaccia di rete, l'avvio viene rifiutato finché non è
configurata una password applicativa.

## Estensione Chrome, Firefox e userscript

In **Impostazioni → Integrazione browser** puoi creare un token revocabile e
scaricare i tre client per modificare i prodotti direttamente dalla pagina
ordine di PrestaShop. I pacchetti vengono generati automaticamente da
`npm install`; per rigenerarli manualmente usa:

```sh
npm run integrations:build
```

La guida di installazione e le indicazioni per l'uso tramite IP, anche senza
Cloudflare Access, sono in
[docs/INTEGRAZIONI-BROWSER.md](docs/INTEGRAZIONI-BROWSER.md).

## Interfaccia

L'app e organizzata come console operativa:

- **Ordini**: ricerca, multi-selezione ordini, selezione righe e anteprima laterale.
- **Impostazioni**: connessione Webservice, risultati rapidi da CSV, stati ordine PrestaShop, filtri, ordini sincronizzati e password locale.
- **Risultati rapidi**: catalogo completo dei prodotti del CSV, con ricerca, paginazione, aggiunta, modifica ed eliminazione.
- **Log**: archivio permanente di verifiche, modifiche reali ed errori registrati.

Il **Registro modifiche** viene salvato in modo permanente nel file
`logs/changes.jsonl`: non ha scadenza, non applica limiti di conservazione e
non viene cancellato dall'app. L'interfaccia permette di consultare l'intero
archivio con paginazione, ricerca testuale, tipo di operazione e intervallo di
date. Il file resta disponibile finché non viene rimosso manualmente dal disco.

Lo stile dell'interfaccia è mantenuto in un unico layer
`frontend/src/styles.css`; colori, spaziature, tipografia, raggi e ombre sono
centralizzati in `frontend/src/tokens.css`.

## Ordini sincronizzati

Dalle **Impostazioni** puoi caricare gli stati disponibili da PrestaShop, selezionarne più di uno e sincronizzare gli ordini da usare nell’app.

La sincronizzazione:

- usa gli stati e l'intervallo date configurati
- scarica ordini a batch configurabili tra 50 e 100
- pagina separatamente ogni stato attivo, senza perdere gli ordini oltre i primi 100
- durante gli aggiornamenti incrementali attraversa tutta la finestra configurata e recupera eventuali buchi
- riprova e completa automaticamente prodotti o clienti rimasti incompleti per errori temporanei
- puo partire automaticamente all'avvio e dopo il salvataggio impostazioni
- se l'aggiornamento orario è attivo, recupera all'avvio una sincronizzazione scaduta senza attendere un'altra ora
- impedisce la sovrapposizione tra sincronizzazioni manuali e pianificate
- mostra durante l’importazione quanti ordini sono già stati elaborati e quanti sono in attesa
- mostra nelle impostazioni ultimo aggiornamento riuscito, prossima esecuzione ed eventuali errori dello scheduler
- rende gli ordini disponibili alla ricerca quando i filtri correnti coincidono con quelli configurati
- salva tecnicamente i dati in `order-cache.json`, ignorato da Git

La ricerca combina cache e PrestaShop. Quando inserisci un ID o un riferimento,
la consultazione diretta non è limitata dall'intervallo date usato per la
sincronizzazione; restano invece rispettati gli stati ordine abilitati e le
eventuali date inserite esplicitamente nel modulo di ricerca.

## Anteprima prodotti da CSV

Se nella root è presente `templates_export.csv`, la ricerca del prodotto destinazione mostra suggerimenti immediati mentre digiti.

Dalla sezione **Risultati rapidi prodotti** nelle Impostazioni puoi:

- vedere quanti prodotti contiene il file attivo e quando è stato aggiornato
- scegliere quanti suggerimenti mostrare, da 5 a 20
- importare un nuovo CSV fino a 5 MB
- usare file separati da virgola oppure punto e virgola

L'importazione valida il file prima di sostituire quello attuale. Quando
`templates_export.csv` esiste già, ne viene conservata una copia nella cartella
`backups`.

La pagina **Risultati rapidi** permette inoltre di gestire direttamente ogni
elemento del catalogo. Creazione, modifica ed eliminazione aggiornano il CSV e
generano sempre un backup preventivo del file precedente.

Il file deve contenere almeno:

```csv
ID,Nome
305330,Garanzia3 Grpd3500 Estensione Garanzia 3 Anni Per Prodotti Fino A 500 Euro
```

I suggerimenti sono una cache locale per velocizzare la scelta: quando clicchi un suggerimento, l'app cerca comunque il prodotto reale su PrestaShop tramite ID prima di selezionarlo.

## Configurazione alternativa con `.env`

Duplica `.env.example` in `.env` e compila:

```env
PORT=3000
HOST=127.0.0.1
APP_SESSION_TTL_MINUTES=480
APP_PASSWORD=
PRESTASHOP_URL=https://www.tuo-negozio.it
PRESTASHOP_API_KEY=la_tua_api_key
```

`APP_SESSION_TTL_MINUTES` accetta un valore tra 1 e 1440 minuti. Per consentire
accesso dalla rete locale imposta `HOST=0.0.0.0` e valorizza
`APP_PASSWORD` con una password lunga e univoca. La password configurata
dall'interfaccia ha precedenza su quella nell'ambiente. Il server rifiuta
l'avvio su rete se nessuna password è disponibile. Per esposizioni oltre la
rete locale usa sempre un reverse proxy con TLS e controllo degli accessi.

## Avvio

```bash
npm install --cache .npm-cache
npm run dev
```

Poi apri:

```text
http://localhost:3000
```

Su Windows puoi anche avviare l'app con `avvia-app.bat`.

## Test

```bash
npm test
```

I test di sicurezza verificano accesso anonimo, login valido e non valido,
protezione della API key, mantenimento della chiave durante il salvataggio,
logout, scadenza sessione e rifiuto dell'esposizione di rete senza password.

Per verificare automaticamente overflow, controlli tagliati e semantica
accessibile della navigazione alle larghezze 320, 375, 414, 768, 1024 e
1440 px:

```bash
npm run check:responsive
```

Il comando usa Chrome o Edge headless. Se il browser non è in una posizione
standard, imposta `CHROME_PATH`.

Per verificare in un ambiente isolato la semantica del dialog di sblocco, il
focus iniziale e il ciclo con Tab e Shift+Tab:

```bash
npm run check:dialog
```

Il controllo usa una configurazione e una password temporanee, senza modificare
`app-config.json`.

Per verificare struttura, conteggi, risultati parziali e azioni del riepilogo
post-sostituzione:

```bash
npm run check:success-dialog
```

Per verificare testi, ordine, avviso di rischio, validazione di `CONFERMA` e
condizioni di accesso alle tre fasi operative:

```bash
npm run check:review-flow
```

Per verificare gli stati vuoti della lista ordini e il reset atomico dei
filtri:

```bash
npm run check:orders-empty
```

Per verificare widget cache, onboarding, skeleton incrementale, stati dei log
e micro-interazioni:

```bash
npm run check:remaining-ui
```

## Nota operativa

La sostituzione aggiorna la riga `order_detail` con ID, nome, riferimento e codici del nuovo prodotto. I campi prezzo e totale della riga non vengono ricalcolati, cosi l'ordine mantiene lo stesso prezzo gia registrato.
