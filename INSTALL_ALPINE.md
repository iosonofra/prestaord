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

Se usi GitHub invece dello zip:

```sh
git clone https://github.com/TUO-UTENTE/TUO-REPO.git /opt/prestashop-order-console
cd /opt/prestashop-order-console
chown -R prestashop-console:prestashop-console /opt/prestashop-order-console
su prestashop-console -s /bin/sh -c 'npm ci --omit=dev'
```

## Configurazione

Puoi configurare tutto dall'interfaccia web in **Impostazioni**. In alternativa:

```sh
cp .env.example .env
vi .env
chown prestashop-console:prestashop-console .env
chmod 600 .env
```

Avvio manuale:

```sh
su prestashop-console -s /bin/sh -c 'PORT=3000 npm start'
```

Apri:

```text
http://IP_DEL_SERVER:3000
```

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
cp -a app-config.json order-cache.json templates_export.csv backups logs /root/prestashop-console-backup/ 2>/dev/null || true
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
cp -a /root/prestashop-console-backup/app-config.json /root/prestashop-console-backup/order-cache.json /root/prestashop-console-backup/templates_export.csv /root/prestashop-console-backup/backups /root/prestashop-console-backup/logs /opt/prestashop-order-console/ 2>/dev/null || true
cd /opt/prestashop-order-console
npm ci --omit=dev
chown -R prestashop-console:prestashop-console /opt/prestashop-order-console
rc-service prestashop-order-console start
```

## File da non pubblicare su GitHub

Non caricare mai:

- `.env`
- `app-config.json`
- `order-cache.json`
- `backups/`
- `logs/`

Valuta anche se pubblicare `templates_export.csv`: puo contenere dati reali del catalogo.

