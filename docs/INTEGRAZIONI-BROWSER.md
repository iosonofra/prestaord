# Integrazioni browser

L’integrazione permette di sostituire un prodotto restando nella pagina ordine del back office PrestaShop. Usa le stesse regole della web app: associazioni prodotto, anteprima, verifica facoltativa/obbligatoria, conferma, backup e log permanente.

## Preparazione

1. Aggiorna e ricostruisci la web app:

   ```sh
   git pull
   npm install
   rc-service prestashop-order-console restart
   ```

2. Apri **Impostazioni → Integrazione browser**.
3. Crea un token, assegnandogli un nome riconoscibile.
4. Copia subito il token: la web app conserva solo il suo hash e non potrà mostrarlo nuovamente.

Il token può usare soltanto le API operative necessarie all’integrazione. Non può leggere API key PrestaShop, password, impostazioni o log amministrativi. La revoca è immediata.

## Chrome

La versione corrente dell’integrazione è **1.3.5**.

1. Scarica `chrome.zip` dalle impostazioni della web app.
2. Estrai l’archivio in una cartella stabile.
3. Apri `chrome://extensions`.
4. Attiva **Modalità sviluppatore** e scegli **Carica estensione non pacchettizzata**.
5. Seleziona la cartella estratta.
6. Premi l’icona dell’estensione e configura:
   - URL della web app, per esempio `http://192.168.1.20:3000`;
   - token integrazione;
   - origine del back office PrestaShop.
7. Ricarica la pagina dell’ordine.

Per una distribuzione Chrome gestita o pubblica, il pacchetto deve essere firmato/pubblicato tramite Chrome Web Store.

Per aggiornare un’installazione non pacchettizzata, sostituisci i file nella cartella stabile e premi **Ricarica** nella scheda `chrome://extensions`.

## Firefox

1. Scarica `firefox.zip`.
2. Per una prova apri `about:debugging#/runtime/this-firefox`.
3. Seleziona **Carica componente aggiuntivo temporaneo** e scegli `manifest.json` dall’archivio estratto.
4. Apri le preferenze dell’estensione e inserisci URL, token e origine PrestaShop.

Un’estensione Firefox installabile in modo permanente deve essere firmata tramite Mozilla Add-ons.

## Userscript

La versione corrente dello userscript è **1.3.5**.

1. Installa un gestore userscript compatibile, per esempio Tampermonkey o Violentmonkey.
2. Apri dalla web app **Installa userscript**.
3. Dal menu del gestore esegui **Configura PrestaShop Order Console**.
4. Inserisci URL web app e token.
5. Ricarica la pagina ordine.

Se era già installato, apri il nuovo file `.user.js`: il gestore riconoscerà la versione superiore e proporrà l’aggiornamento mantenendo la configurazione salvata.

## Uso senza Cloudflare Access

Cloudflare Access non è richiesto. In rete locale puoi indicare direttamente `http://IP-ALPINE:3000`; il processo deve ascoltare su `0.0.0.0` e la porta deve essere raggiungibile dal computer.

Il token protegge l’autorizzazione ma HTTP non cifra il traffico. Se la web app viene esposta fuori dalla LAN, usa HTTPS tramite un reverse proxy o Cloudflare Tunnel prima di usare l’integrazione.

## Rilevamento dell’ordine

L’integrazione riconosce l’ID da:

- parametro `id_order`;
- parametri `orderId` e `idOrder`;
- URL nel formato `/orders/123/view`;
- percorsi o parametri presenti dopo `#` nelle pagine con navigazione dinamica;
- attributo `data-order-id` o campo `id_order` della pagina.

Il rilevamento resta attivo anche dopo il caricamento iniziale: intercetta modifiche del DOM, cambi URL e navigazioni dinamiche del back office senza richiedere più tentativi o ricaricamenti manuali.

Se il pulsante **Modifica prodotti** non compare su una specifica versione del back office, occorre aggiungere il relativo formato URL al rilevatore condiviso in `integrations/shared/panel.js`.
