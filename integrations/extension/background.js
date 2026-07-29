const ext = globalThis.browser || globalThis.chrome;
const ACTIONS = {
  config: () => ({ path: '/api/integration/config', method: 'GET' }),
  order: ({ orderId }) => ({ path: `/api/integration/orders/${encodeURIComponent(orderId)}`, method: 'GET' }),
  products: ({ query, source = 'all' }) => ({
    path: `/api/integration/products?q=${encodeURIComponent(query)}&source=${source === 'quick' ? 'quick' : 'all'}`,
    method: 'GET',
  }),
  preview: (payload) => ({ path: '/api/integration/order-details/preview', method: 'POST', body: payload }),
  verify: (payload) => ({ path: '/api/integration/order-details/verify', method: 'POST', body: payload }),
  apply: (payload) => ({ path: '/api/integration/order-details/apply', method: 'POST', body: payload }),
};

ext.action?.onClicked.addListener(() => ext.runtime.openOptionsPage());

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'presta-order-api') return false;
  (async () => {
    const config = await ext.storage.local.get(['backendUrl', 'integrationToken']);
    if (!config.backendUrl || !config.integrationToken) throw new Error('Configura URL e token dell’integrazione.');
    const factory = ACTIONS[message.action];
    if (!factory) throw new Error('Azione integrazione non consentita.');
    const request = factory(message.payload || {});
    const response = await fetch(`${String(config.backendUrl).replace(/\/+$/, '')}${request.path}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${config.integrationToken}`,
        'Content-Type': 'application/json',
      },
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Errore HTTP ${response.status}`);
    return data;
  })().then((data) => sendResponse({ ok: true, data }), (error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
