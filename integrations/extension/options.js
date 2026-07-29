const ext = globalThis.browser || globalThis.chrome;
const form = document.querySelector('form');
const output = document.querySelector('output');

function permissionPattern(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}/*`;
}

ext.storage.local.get(['backendUrl', 'integrationToken', 'prestashopOrigin']).then((values) => {
  for (const [key, value] of Object.entries(values)) {
    if (form.elements[key]) form.elements[key].value = value || '';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  output.textContent = '';
  const values = Object.fromEntries(new FormData(form));
  const backendOrigin = new URL(values.backendUrl).origin;
  const prestashopOrigin = new URL(values.prestashopOrigin).origin;
  const origins = [permissionPattern(backendOrigin), permissionPattern(prestashopOrigin)];
  const granted = await ext.permissions.request({ origins });
  if (!granted) {
    output.textContent = 'Autorizzazione ai due indirizzi non concessa.';
    return;
  }
  await ext.storage.local.set({
    backendUrl: values.backendUrl.replace(/\/+$/, ''),
    integrationToken: values.integrationToken.trim(),
    prestashopOrigin,
  });
  const existing = await ext.scripting.getRegisteredContentScripts();
  if (existing.some((script) => script.id === 'presta-order-console')) {
    await ext.scripting.unregisterContentScripts({ ids: ['presta-order-console'] });
  }
  await ext.scripting.registerContentScripts([{
    id: 'presta-order-console',
    matches: [permissionPattern(prestashopOrigin)],
    js: ['panel.js', 'content.js'],
    runAt: 'document_idle',
    persistAcrossSessions: true,
  }]);
  const test = await ext.runtime.sendMessage({ type: 'presta-order-api', action: 'config', payload: {} });
  if (!test?.ok) {
    output.textContent = `Configurazione salvata, ma il collegamento non riesce: ${test?.error || 'errore sconosciuto'}`;
    return;
  }
  output.textContent = 'Collegamento verificato. Ricarica la pagina dell’ordine.';
});
