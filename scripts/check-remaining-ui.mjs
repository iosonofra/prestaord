import fs from 'node:fs/promises';
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
const noop = () => {};

try {
  const {
    CacheStatusCard,
    ConfigurationBanner,
    LogsPage,
    OrderLinesList,
    ProductTemplatesPage,
  } = await vite.ssrLoadModule('/src/main.jsx');

  const emptyCache = renderToStaticMarkup(React.createElement(CacheStatusCard, {
    cacheStatus: { count: 0, activeSync: null },
    starting: false,
    onSync: noop,
  }));
  const runningCache = renderToStaticMarkup(React.createElement(CacheStatusCard, {
    cacheStatus: {
      count: 0,
      activeSync: {
        id: 'job-1',
        status: 'running',
        phase: 'enriching',
        processedCount: 17,
        importTotal: 50,
        foundCount: 50,
      },
    },
    starting: false,
    onSync: noop,
  }));
  const populatedCache = renderToStaticMarkup(React.createElement(CacheStatusCard, {
    cacheStatus: { count: 145, activeSync: null },
    starting: false,
    onSync: noop,
  }));

  const missingConfiguration = renderToStaticMarkup(React.createElement(ConfigurationBanner, {
    settings: { baseUrl: '', apiKeyConfigured: false },
    onOpenSettings: noop,
  }));
  const missingApiKey = renderToStaticMarkup(React.createElement(ConfigurationBanner, {
    settings: { baseUrl: 'https://shop.example', apiKeyConfigured: false },
    onOpenSettings: noop,
  }));
  const completeConfiguration = renderToStaticMarkup(React.createElement(ConfigurationBanner, {
    settings: { baseUrl: 'https://shop.example', apiKeyConfigured: true },
    onOpenSettings: noop,
  }));

  const rowsWhileLoading = renderToStaticMarkup(React.createElement(OrderLinesList, {
    rows: [{
      id: 10,
      productName: 'Riga già caricata',
      productReference: 'REF-10',
      productQuantity: 2,
      totalPriceTaxIncl: 49.8,
      order: { id: 501, reference: 'ORDER-501' },
    }],
    selectedRows: new Set(),
    loading: true,
    onToggleRow: noop,
  }));
  const firstOrderLoading = renderToStaticMarkup(React.createElement(OrderLinesList, {
    rows: [],
    selectedRows: new Set(),
    loading: true,
    onToggleRow: noop,
  }));

  const logsError = renderToStaticMarkup(React.createElement(LogsPage, {
    logs: [],
    logFilter: 'all',
    logQuery: '',
    setLogFilter: noop,
    setLogQuery: noop,
    onRefresh: noop,
    busy: '',
    error: 'Connessione non disponibile',
    hasAnyLogs: false,
  }));
  const logsEmpty = renderToStaticMarkup(React.createElement(LogsPage, {
    logs: [],
    logFilter: 'all',
    logQuery: '',
    setLogFilter: noop,
    setLogQuery: noop,
    onRefresh: noop,
    busy: '',
    error: '',
    hasAnyLogs: false,
  }));
  const logsFiltered = renderToStaticMarkup(React.createElement(LogsPage, {
    logs: [],
    logFilter: 'error',
    logQuery: 'missing',
    setLogFilter: noop,
    setLogQuery: noop,
    onRefresh: noop,
    busy: '',
    error: '',
    hasAnyLogs: true,
  }));
  const logsPaginated = renderToStaticMarkup(React.createElement(LogsPage, {
    logs: [{
      id: '42',
      at: '2026-07-28T10:00:00.000Z',
      status: 'ok',
      simulate: false,
      preview: { orderId: '501', orderDetailId: '10' },
    }],
    logFilter: 'real',
    logQuery: '501',
    logDateFrom: '2026-07-01',
    logDateTo: '2026-07-31',
    pagination: {
      page: 2,
      pageSize: 20,
      totalItems: 45,
      totalPages: 3,
      totalAll: 80,
      hasPrevious: true,
      hasNext: true,
    },
    setLogQuery: noop,
    setLogDateFrom: noop,
    setLogDateTo: noop,
    onFilterChange: noop,
    onSearch: noop,
    onClear: noop,
    onPageChange: noop,
    onRefresh: noop,
    busy: '',
    error: '',
    hasAnyLogs: true,
  }));
  const productTemplatesPage = renderToStaticMarkup(React.createElement(ProductTemplatesPage, {
    items: [
      { id: '101', name: 'Prodotto Alpha' },
      { id: '102', name: 'Prodotto Beta' },
    ],
    query: '',
    setQuery: noop,
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: 52,
      totalPages: 3,
      hasPrevious: false,
      hasNext: true,
    },
    status: { count: 52 },
    busy: '',
    error: '',
    onSearch: noop,
    onClear: noop,
    onPageChange: noop,
    onSave: noop,
    onDelete: noop,
    onOpenSettings: noop,
  }));

  const css = await fs.readFile(path.join(projectRoot, 'frontend', 'src', 'styles.css'), 'utf8');
  const cardRule = css.match(/\.orderCard,\s*\.lineItem\s*\{[\s\S]*?transition:\s*([\s\S]*?);\s*\}/)?.[1] || '';

  const checks = {
    cacheActionStates: emptyCache.includes('Ordini sincronizzati')
      && emptyCache.includes('Sincronizza ordini')
      && runningCache.includes('Sincronizzazione…')
      && runningCache.includes('17 di 50 in importazione')
      && runningCache.includes('value="17"')
      && runningCache.includes('max="50"')
      && runningCache.includes('aria-label="17 ordini importati su 50"')
      && runningCache.includes('aria-busy="true"')
      && runningCache.includes('disabled=""')
      && populatedCache.includes('145 ordini disponibili')
      && !populatedCache.includes('sidebarCacheAction'),
    onboardingStates: missingConfiguration.includes('URL del negozio e API key Webservice')
      && missingApiKey.includes('Aggiungi API key Webservice')
      && missingConfiguration.includes('Vai alle impostazioni')
      && completeConfiguration === '',
    incrementalSkeleton: rowsWhileLoading.includes('Riga già caricata')
      && rowsWhileLoading.includes('aria-label="Caricamento righe ordine"')
      && rowsWhileLoading.includes('aria-busy="true"')
      && firstOrderLoading.includes('skeletonCard'),
    logsStates: logsError.includes('role="alert"')
      && logsError.includes('Connessione non disponibile')
      && logsError.includes('Riprova')
      && logsEmpty.includes('Nessun log disponibile')
      && logsFiltered.includes('Nessun log corrisponde ai filtri')
      && logsPaginated.includes('Archivio permanente')
      && logsPaginated.includes('type="date"')
      && logsPaginated.includes('value="2026-07-01"')
      && logsPaginated.includes('value="2026-07-31"')
      && logsPaginated.includes('Pagina 2 di 3')
      && logsPaginated.includes('45 risultati')
      && logsPaginated.includes('aria-current="page"')
      && logsPaginated.includes('Pagina precedente')
      && logsPaginated.includes('Pagina successiva'),
    productTemplateCrud: productTemplatesPage.includes('Catalogo risultati rapidi')
      && productTemplatesPage.includes('52 prodotti disponibili')
      && productTemplatesPage.includes('Prodotto Alpha')
      && productTemplatesPage.includes('#101')
      && productTemplatesPage.includes('Aggiungi prodotto')
      && productTemplatesPage.includes('Modifica')
      && productTemplatesPage.includes('Elimina')
      && productTemplatesPage.includes('Pagina 1 di 3')
      && productTemplatesPage.includes('Paginazione risultati rapidi'),
    cardTransitions: cardRule.includes('background-color')
      && cardRule.includes('border-color')
      && cardRule.includes('box-shadow')
      && cardRule.includes('transform')
      && cardRule.includes('color')
      && css.includes('@media (prefers-reduced-motion: reduce)'),
  };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ pass, ...checks }));
  if (!pass) process.exitCode = 1;
} finally {
  await vite.close();
}
