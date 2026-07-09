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
- sincronizzazione cache ordini opzionale
- dimensione batch cache, tra 50 e 100 ordini per richiesta
- password locale opzionale della web app

Le impostazioni vengono salvate nel file locale `app-config.json`, ignorato da Git.

## Sicurezza operativa

Prima di una sostituzione puoi usare **Simula** per controllare il risultato senza scrivere nulla su PrestaShop.

Quando confermi una sostituzione reale, l'app:

- crea un backup JSON della riga ordine originale in `backups/`
- scrive un log dell'operazione in `logs/changes.jsonl`
- restituisce l'esito per ogni singola riga aggiornata

Se imposti una password locale nelle impostazioni, le API della web app richiedono lo sblocco prima di cercare o modificare dati.

## Interfaccia

L'app e organizzata come console operativa:

- **Ordini**: ricerca, multi-selezione ordini, selezione righe e anteprima laterale.
- **Impostazioni**: connessione Webservice, stati ordine PrestaShop, filtri, cache ordini e password locale.
- **Log**: ultime simulazioni, modifiche reali ed errori registrati.

## Cache ordini

Dalle **Impostazioni** puoi caricare gli stati disponibili da PrestaShop, selezionarne piu di uno e sincronizzare una cache locale degli ordini.

La cache:

- usa gli stati e l'intervallo date configurati
- scarica ordini a batch configurabili tra 50 e 100
- puo partire automaticamente all'avvio e dopo il salvataggio impostazioni
- viene usata dalla ricerca ordini quando i filtri correnti coincidono con quelli della cache
- viene salvata in `order-cache.json`, ignorato da Git

## Anteprima prodotti da CSV

Se nella root e presente `templates_export.csv`, la ricerca del prodotto destinazione mostra suggerimenti immediati mentre digiti.

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
PRESTASHOP_URL=https://www.tuo-negozio.it
PRESTASHOP_API_KEY=la_tua_api_key
```

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

## Nota operativa

La sostituzione aggiorna la riga `order_detail` con ID, nome, riferimento e codici del nuovo prodotto. I campi prezzo e totale della riga non vengono ricalcolati, cosi l'ordine mantiene lo stesso prezzo gia registrato.
