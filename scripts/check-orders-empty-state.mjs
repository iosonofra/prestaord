import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { createServer } from 'vite';

const projectRoot = path.resolve(import.meta.dirname, '..');
const vite = await createServer({
  configFile: path.join(projectRoot, 'frontend', 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const {
    OrdersEmptyState,
    initialFilters,
    resetOrderSearch,
  } = await vite.ssrLoadModule('/src/main.jsx');

  const noop = () => {};
  const filteredMarkup = renderToStaticMarkup(React.createElement(OrdersEmptyState, {
    filters: { ...initialFilters, q: 'ordine inesistente', dateFrom: '2026-07-01' },
    configured: true,
    onReset: noop,
    onRetry: noop,
    onOpenSettings: noop,
  }));
  const defaultMarkup = renderToStaticMarkup(React.createElement(OrdersEmptyState, {
    filters: initialFilters,
    configured: true,
    onReset: noop,
    onRetry: noop,
    onOpenSettings: noop,
  }));
  const unconfiguredMarkup = renderToStaticMarkup(React.createElement(OrdersEmptyState, {
    filters: initialFilters,
    configured: false,
    onReset: noop,
    onRetry: noop,
    onOpenSettings: noop,
  }));

  let filtersApplied;
  let filtersSearched;
  resetOrderSearch(
    (filters) => { filtersApplied = filters; },
    (filters) => { filtersSearched = filters; },
  );

  const checks = {
    semanticEmptyState: filteredMarkup.includes('aria-labelledby="ordersEmptyTitle"')
      && filteredMarkup.includes('aria-hidden="true"'),
    filteredRecovery: filteredMarkup.includes('Nessun ordine con questi filtri')
      && filteredMarkup.includes('Azzera filtri e cerca')
      && filteredMarkup.includes('Controlla impostazioni'),
    defaultRecovery: defaultMarkup.includes('Nessun ordine disponibile')
      && defaultMarkup.includes('Riprova ricerca')
      && defaultMarkup.includes('controllare gli ordini sincronizzati nelle impostazioni'),
    configurationRecovery: unconfiguredMarkup.includes('Configura la connessione PrestaShop')
      && unconfiguredMarkup.includes('Configura PrestaShop'),
    resetUsesInitialFilters: JSON.stringify(filtersApplied) === JSON.stringify(initialFilters)
      && JSON.stringify(filtersSearched) === JSON.stringify(initialFilters),
    resetUsesSameSnapshot: filtersApplied === filtersSearched
      && filtersApplied !== initialFilters,
  };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ pass, ...checks }));
  if (!pass) process.exitCode = 1;
} finally {
  await vite.close();
}
