# Installazione e aggiornamento su Alpine Linux

Questa app e una console locale Node.js/Express per modificare righe ordine PrestaShop via Webservice.

## Requisiti minimi

- Alpine Linux 3.19 o superiore
- Node.js 20 LTS o superiore
- npm incluso con Node.js
- 1 vCPU
- 512 MB RAM per uso leggero; 1 GB consigliato se sincronizzi cache fino a 1000 ordini
- 300 MB disco liberi per app, dipendenze, cache, log e backup
- Accesso HTTPS dal server Alpine verso il dominio PrestaShop
- Webservice PrestaShop attivo con permessi:
  - `orders`: `GET`
  - `order_details`: `GET`, `PUT`
  - `products`: `GET`
  - `customers`: `GET`
  - `order_states`: `GET`

## Installazione pulita

```sh
apk update
apk add nodejs npm git unzip openrc

addgroup -S prestashop-console
adduser -S -G prestashop-console -h /opt/prestashop-order-console prestashop-console

mkdir -p /opt/prestashop-order-console
cd /opt/prestashop-order-console
```

Carica lo zip oppure clona il repository GitHub, poi installa:

```sh
unzip prestashop-order-product-swapper-alpine.zip -d /opt/prestashop-order-console
chown -R prestashop-console:prestashop-console /opt/prestashop-order-console

su prestashop-console -s /bin/sh -c 'npm ci --omit=dev'
```

`npm ci` esegue automaticamente anche la compilazione del frontend. Il
pacchetto contiene comunque una build pronta in `dist/app`.

Se usi GitHub invece dello zip:

```sh
git clone https://github.com/TUO-UTENTE/TUO-REPO.git /opt/prestashop-order-console
cd /opt/prestashop-order-console
chown -R prestashop-console:prestashop-console /opt/prestashop-order-console
su prestashop-console -s /bin/sh -c 'npm ci --omit=dev'
```

## Configurazione

Prepara la configurazione di rete prima del primo avvio:

```sh
cp .env.example .env
vi .env
chown prestashop-console:prestashop-console .env
chmod 600 .env
```

Per rendere la console raggiungibile direttamente sull'IP Alpine, imposta
almeno:

```env
PORT=3000
HOST=0.0.0.0
APP_PASSWORD=INSERISCI_QUI_UNA_PASSWORD_LUNGA_E_UNIVOCA
```

URL e API key PrestaShop possono essere inseriti successivamente dalla pagina
**Impostazioni**. Non lasciare `APP_PASSWORD` vuota: quando `HOST` non è locale,
il server rifiuta l'avvio senza password.

Avvio manuale:

```sh
su prestashop-console -s /bin/sh -c 'npm start'
```

Apri `http://IP_DEL_SERVER:3000` e accedi con `APP_PASSWORD`. Per accessi da
Internet usa un reverse proxy HTTPS.

## Servizio OpenRC

```sh
cp deploy/openrc/prestashop-order-console /etc/init.d/prestashop-order-console
chmod +x /etc/init.d/prestashop-order-console

rc-update add prestashop-order-console default
rc-service prestashop-order-console start
rc-service prestashop-order-console status
```

Log servizio:

```sh
tail -f /var/log/prestashop-order-console.log
tail -f /var/log/prestashop-order-console.err
```

## Aggiornamento pulito

Prima salva i dati locali:

```sh
cd /opt/prestashop-order-console
mkdir -p /root/prestashop-console-backup
cp -a .env app-config.json order-cache.json templates_export.csv product-canonical-groups.json backups logs /root/prestashop-console-backup/ 2>/dev/null || true
```

Poi aggiorna da GitHub:

```sh
rc-service prestashop-order-console stop
cd /opt/prestashop-order-console
git pull --ff-only
npm ci --omit=dev
chown -R prestashop-console:prestashop-console /opt/prestashop-order-console
rc-service prestashop-order-console start
```

Oppure aggiorna da zip:

```sh
rc-service prestashop-order-console stop
cd /opt
mv prestashop-order-console prestashop-order-console.old
mkdir prestashop-order-console
unzip prestashop-order-product-swapper-alpine.zip -d prestashop-order-console
cp -a /root/prestashop-console-backup/.env /root/prestashop-console-backup/app-config.json /root/prestashop-console-backup/order-cache.json /root/prestashop-console-backup/templates_export.csv /root/prestashop-console-backup/product-canonical-groups.json /root/prestashop-console-backup/backups /root/prestashop-console-backup/logs /opt/prestashop-order-console/ 2>/dev/null || true
cd /opt/prestashop-order-console
npm ci --omit=dev
chown -R prestashop-console:prestashop-console /opt/prestashop-order-console
rc-service prestashop-order-console start
```

Se il frontend non cambia dopo un aggiornamento, verifica che esista
`frontend/vite.config.js`, esegui `npm run frontend:build`, riavvia OpenRC e
ricarica il browser senza cache.

## File da non pubblicare su GitHub

Non caricare mai:

- `.env`
- `app-config.json`
- `order-cache.json`
- `product-canonical-groups.json`
- `backups/`
- `logs/`

Valuta anche se pubblicare `templates_export.csv`: puo contenere dati reali del catalogo.
