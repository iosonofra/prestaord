const CONFIG_KEY = 'prestashop-order-console-config';
let config = JSON.parse(GM_getValue(CONFIG_KEY, '{}'));

function configure() {
  const backendUrl = prompt('URL della web app Order Console', config.backendUrl || 'http://192.168.1.20:3000');
  if (!backendUrl) return;
  const token = prompt('Token integrazione (Impostazioni → Integrazione browser)', config.token || '');
  if (!token) return;
  config = { backendUrl: backendUrl.replace(/\/+$/, ''), token: token.trim() };
  GM_setValue(CONFIG_KEY, JSON.stringify(config));
  location.reload();
}

function api(action, payload = {}) {
  if (!config.backendUrl || !config.token) return Promise.reject(new Error('Configura URL e token dell’integrazione.'));
  const routes = {
    config: ['/api/integration/config', 'GET'],
    order: [`/api/integration/orders/${encodeURIComponent(payload.orderId)}`, 'GET'],
    products: [`/api/integration/products?q=${encodeURIComponent(payload.query)}&source=${payload.source === 'quick' ? 'quick' : 'all'}`, 'GET'],
    preview: ['/api/integration/order-details/preview', 'POST'],
    verify: ['/api/integration/order-details/verify', 'POST'],
    apply: ['/api/integration/order-details/apply', 'POST'],
  };
  const route = routes[action];
  if (!route) return Promise.reject(new Error('Azione non consentita.'));
  const url = `${config.backendUrl}${route[0]}`;
  const requestOptions = {
    method: route[1],
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    ...(route[1] === 'POST' ? { body: JSON.stringify(payload) } : {}),
    targetAddressSpace: 'local',
  };

  return fetch(url, requestOptions).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Errore HTTP ${response.status}`);
    return data;
  }).catch((fetchError) => new Promise((resolve, reject) => GM_xmlhttpRequest({
    method: route[1],
    url,
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    data: route[1] === 'POST' ? JSON.stringify(payload) : undefined,
    timeout: 15000,
    onload(response) {
      let data = {};
      try { data = JSON.parse(response.responseText || '{}'); } catch {}
      response.status >= 200 && response.status < 300 ? resolve(data) : reject(new Error(data.error || `Errore HTTP ${response.status}`));
    },
    ontimeout: () => reject(new Error(`Timeout collegandosi a ${config.backendUrl}.`)),
    onerror: () => reject(new Error(
      `Web app non raggiungibile dallo userscript. Consenti l’accesso alla rete locale per questo sito. Dettaglio: ${fetchError.message}`,
    )),
  })));
}

GM_registerMenuCommand('Configura PrestaShop Order Console', configure);
PrestaOrderPanel.mount({ api, onConfigure: configure });
