const state = {
  selectedOrders: new Map(),
  visibleOrders: [],
  selectedProduct: null,
  selectedRows: new Set(),
  lastPreview: null,
  lastSimulationSignature: '',
  lastSimulationResult: null,
  lastResultSummary: '',
  logs: [],
  logFilter: 'all',
  logQuery: '',
  sessionToken: localStorage.getItem('appSessionToken') || '',
  requireConfirmCheck: true,
};

const els = {
  status: document.querySelector('#status'),
  sidebarCacheMeta: document.querySelector('#sidebarCacheMeta'),
  topCacheMeta: document.querySelector('#topCacheMeta'),
  topSelectionMeta: document.querySelector('#topSelectionMeta'),
  ordersPage: document.querySelector('#ordersPage'),
  settingsPage: document.querySelector('#settingsPage'),
  logsPage: document.querySelector('#logsPage'),
  ordersPageButton: document.querySelector('#ordersPageButton'),
  settingsPageButton: document.querySelector('#settingsPageButton'),
  logsPageButton: document.querySelector('#logsPageButton'),
  pageTitle: document.querySelector('#pageTitle'),
  pageLead: document.querySelector('.pageLead'),
  toast: document.querySelector('#toast'),
  settingsForm: document.querySelector('#settingsForm'),
  settingsConnectionSummary: document.querySelector('#settingsConnectionSummary'),
  settingsStatesSummary: document.querySelector('#settingsStatesSummary'),
  settingsDefaultSummary: document.querySelector('#settingsDefaultSummary'),
  settingsCacheSummary: document.querySelector('#settingsCacheSummary'),
  showApiKey: document.querySelector('#showApiKey'),
  baseUrl: document.querySelector('#baseUrl'),
  apiKey: document.querySelector('#apiKey'),
  orderState: document.querySelector('#orderState'),
  orderStatesList: document.querySelector('#orderStatesList'),
  defaultOrderState: document.querySelector('#defaultOrderState'),
  refreshOrderStates: document.querySelector('#refreshOrderStates'),
  orderLimit: document.querySelector('#orderLimit'),
  orderDateFrom: document.querySelector('#orderDateFrom'),
  orderDateTo: document.querySelector('#orderDateTo'),
  cacheAutoSync: document.querySelector('#cacheAutoSync'),
  cacheHourlySync: document.querySelector('#cacheHourlySync'),
  cacheBatchSize: document.querySelector('#cacheBatchSize'),
  cacheMaxOrders: document.querySelector('#cacheMaxOrders'),
  cacheStatus: document.querySelector('#cacheStatus'),
  cacheProgress: document.querySelector('#cacheProgress'),
  cacheProgressTitle: document.querySelector('#cacheProgressTitle'),
  cacheProgressMeta: document.querySelector('#cacheProgressMeta'),
  cacheProgressBar: document.querySelector('#cacheProgressBar'),
  cacheProgressDetails: document.querySelector('#cacheProgressDetails'),
  syncOrderCache: document.querySelector('#syncOrderCache'),
  saveSyncNotice: document.querySelector('#saveSyncNotice'),
  appPassword: document.querySelector('#appPassword'),
  requireConfirmCheck: document.querySelector('#requireConfirmCheck'),
  orderSearch: document.querySelector('#orderSearch'),
  orderStateQuick: document.querySelector('#orderStateQuick'),
  orderDateFromQuick: document.querySelector('#orderDateFromQuick'),
  orderDateToQuick: document.querySelector('#orderDateToQuick'),
  orderFeedLimit: document.querySelector('#orderFeedLimit'),
  orderFeedBar: document.querySelector('#orderFeedBar'),
  orderFeedMeta: document.querySelector('#orderFeedMeta'),
  ordersListTitle: document.querySelector('#ordersListTitle'),
  resetOrderFilters: document.querySelector('#resetOrderFilters'),
  productSearch: document.querySelector('#productSearch'),
  productTemplateSuggestions: document.querySelector('#productTemplateSuggestions'),
  searchOrders: document.querySelector('#searchOrders'),
  searchProducts: document.querySelector('#searchProducts'),
  selectVisibleOrders: document.querySelector('#selectVisibleOrders'),
  clearOrders: document.querySelector('#clearOrders'),
  selectionActionBar: document.querySelector('#selectionActionBar'),
  selectionActionTitle: document.querySelector('#selectionActionTitle'),
  selectionActionMeta: document.querySelector('#selectionActionMeta'),
  barSelectSameRows: document.querySelector('#barSelectSameRows'),
  barSimulateButton: document.querySelector('#barSimulateButton'),
  barPreviewButton: document.querySelector('#barPreviewButton'),
  selectSameRows: document.querySelector('#selectSameRows'),
  simulateButton: document.querySelector('#simulateButton'),
  orders: document.querySelector('#orders'),
  products: document.querySelector('#products'),
  rowsPanel: document.querySelector('.rowsPanel'),
  productPanel: document.querySelector('.productPanel'),
  selectedOrderTitle: document.querySelector('#selectedOrderTitle'),
  orderRows: document.querySelector('#orderRows'),
  replaceButton: document.querySelector('#replaceButton'),
  ordersCount: document.querySelector('#ordersCount'),
  rowsCount: document.querySelector('#rowsCount'),
  targetProduct: document.querySelector('#targetProduct'),
  simulationState: document.querySelector('#simulationState'),
  selectionSummary: document.querySelector('#selectionSummary'),
  previewPanel: document.querySelector('#previewPanel'),
  previewTitle: document.querySelector('#previewTitle'),
  previewMeta: document.querySelector('#previewMeta'),
  previewWarning: document.querySelector('#previewWarning'),
  previewRows: document.querySelector('#previewRows'),
  closePreview: document.querySelector('#closePreview'),
  confirmReplace: document.querySelector('#confirmReplace'),
  drawerSimulate: document.querySelector('#drawerSimulate'),
  simulationGate: document.querySelector('#simulationGate'),
  confirmCheck: document.querySelector('#confirmCheck'),
  confirmTextWrap: document.querySelector('#confirmTextWrap'),
  confirmText: document.querySelector('#confirmText'),
  resultPanel: document.querySelector('#resultPanel'),
  resultTitle: document.querySelector('#resultTitle'),
  resultRows: document.querySelector('#resultRows'),
  resultActions: document.querySelector('#resultActions'),
  closeResult: document.querySelector('#closeResult'),
  openLogsAfterResult: document.querySelector('#openLogsAfterResult'),
  copyResultSummary: document.querySelector('#copyResultSummary'),
  newOperation: document.querySelector('#newOperation'),
  logsList: document.querySelector('#logsList'),
  refreshLogs: document.querySelector('#refreshLogs'),
  clearLogs: document.querySelector('#clearLogs'),
  logSearch: document.querySelector('#logSearch'),
  logFilterButtons: document.querySelectorAll('[data-log-filter]'),
  unlockDialog: document.querySelector('#unlockDialog'),
  unlockForm: document.querySelector('#unlockForm'),
  unlockPassword: document.querySelector('#unlockPassword'),
  unlockError: document.querySelector('#unlockError'),
  cancelUnlock: document.querySelector('#cancelUnlock'),
};

state.orderStates = [];
state.selectedOrderStates = [];
state.defaultOrderState = '';
state.autoSyncStarted = false;
state.productTemplateTimer = null;
state.productSearchRequestId = 0;
state.orderSearchRequestId = 0;
state.cacheSyncTimer = null;

function orderFeedLimit() {
  const parsed = Math.trunc(Number(els.orderFeedLimit?.value || 20));
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(parsed, 20), 1000);
}

function activeOrderStateFilter() {
  return String(els.orderStateQuick?.value || '').trim();
}

function orderFilterParams() {
  const params = new URLSearchParams({
    q: els.orderSearch.value.trim(),
    source: 'cache',
    limit: String(orderFeedLimit()),
  });
  if (activeOrderStateFilter()) params.set('orderState', activeOrderStateFilter());
  if (els.orderDateFromQuick.value) params.set('dateFrom', els.orderDateFromQuick.value);
  if (els.orderDateToQuick.value) params.set('dateTo', els.orderDateToQuick.value);
  return params;
}

function orderLiveParams() {
  const params = orderFilterParams();
  params.set('source', 'live');
  return params;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function setStatus(message, type = 'neutral') {
  els.status.textContent = message;
  els.status.className = `status ${type === 'neutral' ? '' : type}`.trim();
  if (type === 'error') showToast(message, type);
}

function setSelectValue(select, value, fallback = '') {
  if (!select) return;
  const nextValue = String(value || fallback || '');
  if (nextValue && ![...select.options].some((option) => option.value === nextValue)) {
    const option = document.createElement('option');
    option.value = nextValue;
    option.textContent = `${nextValue} (attuale)`;
    select.appendChild(option);
  }
  select.value = nextValue;
}

function setSettingsSummary(element, text, tone = '') {
  if (!element) return;
  element.textContent = text;
  element.className = `settingsSummaryPill ${tone}`.trim();
}

function updateConnectionSummary(configured) {
  setSettingsSummary(
    els.settingsConnectionSummary,
    configured ? 'Connessione configurata' : 'Connessione incompleta',
    configured ? 'ok' : 'warn',
  );
}

function updateSaveSyncNotice() {
  if (!els.saveSyncNotice) return;
  els.saveSyncNotice.hidden = !els.cacheAutoSync?.checked;
}

function selectedOrderStateIds() {
  return [...document.querySelectorAll('#orderStatesList input[type="checkbox"]:checked')]
    .map((input) => input.value);
}

function preferredDefaultOrderStateId(selectedIds = state.selectedOrderStates) {
  const selectedSet = new Set(selectedIds.map(String));
  const rosate = state.orderStates.find((item) => {
    const name = String(item.name || '').toLocaleLowerCase('it-IT');
    return selectedSet.has(String(item.id)) && name.includes('magazzino') && name.includes('rosate');
  });
  return String(rosate?.id || selectedIds[0] || '');
}

function enabledOrderStates() {
  const selectedSet = new Set(selectedOrderStateIds().map(String));
  return state.orderStates.filter((item) => selectedSet.has(String(item.id)));
}

function updateOrderSettingsSummary() {
  const selectedIds = selectedOrderStateIds();
  const total = state.orderStates.length;
  const defaultId = String(els.defaultOrderState?.value || state.defaultOrderState || '');
  const defaultState = state.orderStates.find((item) => String(item.id) === defaultId);
  const defaultLabel = defaultState?.name || (defaultId ? `Stato ${defaultId}` : 'nessuno');

  if (!total) {
    setSettingsSummary(els.settingsStatesSummary, 'Stati non caricati', 'warn');
    if (els.settingsDefaultSummary) {
      els.settingsDefaultSummary.textContent = 'Carica gli stati da PrestaShop per abilitarli in ricerca e cache.';
    }
    return;
  }

  setSettingsSummary(
    els.settingsStatesSummary,
    selectedIds.length ? `${selectedIds.length}/${total} stati attivi` : 'Nessuno stato attivo',
    selectedIds.length ? 'ok' : 'warn',
  );
  if (els.settingsDefaultSummary) {
    els.settingsDefaultSummary.textContent = selectedIds.length
      ? `Default: ${defaultLabel}. Gli stati selezionati alimentano ricerca e cache.`
      : 'Seleziona almeno uno stato per usare ricerca e cache ordini.';
  }
}

function renderDefaultOrderStateOptions(defaultId = state.defaultOrderState) {
  if (!els.defaultOrderState) return;
  const enabledStates = enabledOrderStates();
  const preferredId = defaultId && enabledStates.some((item) => String(item.id) === String(defaultId))
    ? String(defaultId)
    : preferredDefaultOrderStateId(enabledStates.map((item) => String(item.id)));

  els.defaultOrderState.innerHTML = enabledStates.length
    ? ''
    : '<option value="">Nessuno stato abilitato</option>';
  for (const orderState of enabledStates) {
    const option = document.createElement('option');
    option.value = String(orderState.id);
    option.textContent = orderState.name || `Stato ${orderState.id}`;
    els.defaultOrderState.appendChild(option);
  }
  els.defaultOrderState.value = preferredId;
  state.defaultOrderState = preferredId;
  updateOrderSettingsSummary();
}

function renderQuickOrderStateOptions(defaultId = state.defaultOrderState) {
  if (!els.orderStateQuick) return;
  const enabledStates = enabledOrderStates();
  const preferredId = defaultId && enabledStates.some((item) => String(item.id) === String(defaultId))
    ? String(defaultId)
    : preferredDefaultOrderStateId(enabledStates.map((item) => String(item.id)));

  els.orderStateQuick.innerHTML = '<option value="">Tutti gli stati abilitati</option>';
  for (const orderState of enabledStates) {
    const option = document.createElement('option');
    option.value = String(orderState.id);
    option.textContent = orderState.name || `Stato ${orderState.id}`;
    els.orderStateQuick.appendChild(option);
  }
  els.orderStateQuick.value = preferredId;
}

function refreshOrderStateControls(defaultId = state.defaultOrderState) {
  state.selectedOrderStates = selectedOrderStateIds().map(String);
  renderDefaultOrderStateOptions(defaultId);
  renderQuickOrderStateOptions(state.defaultOrderState);
  updateOrderSettingsSummary();
}

function renderOrderStates(states, selectedIds = [], defaultId = state.defaultOrderState) {
  state.orderStates = states;
  state.selectedOrderStates = selectedIds.map(String);
  state.defaultOrderState = String(defaultId || '');
  els.orderStatesList.innerHTML = '';

  if (!states.length) {
    els.orderStatesList.innerHTML = '<span class="mutedText">Nessuno stato disponibile.</span>';
    refreshOrderStateControls('');
    updateOrderSettingsSummary();
    return;
  }

  const selectedSet = new Set(state.selectedOrderStates);
  for (const orderState of states) {
    const label = document.createElement('label');
    label.className = 'choiceItem';
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(orderState.id)}" ${selectedSet.has(String(orderState.id)) ? 'checked' : ''} />
      <span>${escapeHtml(orderState.name || `Stato ${orderState.id}`)}</span>
    `;
    label.querySelector('input').addEventListener('change', () => refreshOrderStateControls());
    els.orderStatesList.appendChild(label);
  }

  refreshOrderStateControls(defaultId);
}

async function loadOrderStates(selectedIds = state.selectedOrderStates, defaultId = state.defaultOrderState) {
  setStatus('Carico stati ordine...');
  const { states } = await api('/api/order-states');
  renderOrderStates(states, selectedIds, defaultId);
  setStatus(`${states.length} stati caricati`, 'ok');
}

function renderCacheStatus(status) {
  const hourlyText = status?.hourlySync?.enabled
    ? ` Sync oraria attiva, prossimo controllo ${status.hourlySync.nextRunAt ? new Date(status.hourlySync.nextRunAt).toLocaleString('it-IT') : "tra meno di un'ora"}.`
    : '';

  if (!status?.count) {
    els.cacheStatus.textContent = `Cache non ancora sincronizzata.${hourlyText}`;
    setSettingsSummary(els.settingsCacheSummary, status?.activeSync ? 'Cache in sincronizzazione' : 'Cache non sincronizzata', status?.activeSync ? '' : 'warn');
    const cacheText = status?.activeSync ? 'Cache in sync' : 'Cache non sincronizzata';
    if (els.topCacheMeta) els.topCacheMeta.textContent = cacheText;
    if (els.sidebarCacheMeta) els.sidebarCacheMeta.textContent = cacheText;
    if (status?.activeSync) renderCacheSyncProgress(status.activeSync);
    return;
  }

  const date = status.syncedAt ? new Date(status.syncedAt).toLocaleString('it-IT') : 'data non disponibile';
  const totalText = status.hasMore
    ? `almeno ${status.count} trovati`
    : status.totalFound
      ? `${status.totalFound} trovati`
      : `${status.count} in cache`;
  els.cacheStatus.textContent = `${status.count} ordini in cache - ${totalText} - ultimo sync ${date}.${hourlyText}`;
  setSettingsSummary(
    els.settingsCacheSummary,
    status.hourlySync?.enabled ? `${status.count} in cache, sync oraria` : `${status.count} ordini in cache`,
    'ok',
  );
  const cacheText = status.hourlySync?.enabled ? `${status.count} in cache · oraria` : `${status.count} in cache`;
  if (els.topCacheMeta) els.topCacheMeta.textContent = cacheText;
  if (els.sidebarCacheMeta) els.sidebarCacheMeta.textContent = cacheText;
  if (status.activeSync) renderCacheSyncProgress(status.activeSync);
}

async function loadCacheStatus() {
  const status = await api('/api/order-cache/status');
  renderCacheStatus(status);
  return status;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function orderStateLabels(ids = []) {
  const labels = ids.map((id) => {
    const match = state.orderStates.find((item) => String(item.id) === String(id));
    return match?.name || `Stato ${id}`;
  });
  return labels.length ? labels.join(', ') : 'Stati configurati';
}

function cacheSyncPhaseLabel(phase) {
  return ({
    queued: 'In coda',
    start: 'Preparazione',
    fetching: 'Scaricamento ordini',
    retrying: 'PrestaShop lento, riduco il batch',
    enriching: 'Carico dettagli prodotti e clienti',
    saving: 'Salvataggio cache',
    done: 'Completata',
    error: 'Errore',
  })[phase] || 'Sincronizzazione';
}

function cacheSyncProgressPercent(job) {
  if (!job) return 0;
  const target = Number(job.totalFound || job.maxOrders || 0);
  if (!target) return 4;
  return Math.min(100, Math.max(4, Math.round((Number(job.savedCount || 0) / target) * 100)));
}

function renderCacheSyncProgress(job) {
  if (!job || !els.cacheProgress) return;
  const percent = cacheSyncProgressPercent(job);
  const foundText = job.hasMore
    ? `almeno ${job.savedCount || job.foundCount || 0}`
    : job.totalFound
      ? String(job.totalFound)
      : String(job.foundCount || 0);
  const savedText = String(job.savedCount || 0);
  const maxText = String(job.maxOrders || els.cacheMaxOrders.value || 0);
  const batchText = job.lastBatchCount ? `${job.lastBatchCount} nell'ultimo batch` : `batch da ${job.batchSize || els.cacheBatchSize.value || 0}`;
  const statesText = orderStateLabels(job.filters?.orderStates || state.selectedOrderStates);
  const newText = job.incremental ? ` Nuovi aggiunti: ${job.newCount || 0}.` : '';

  els.cacheProgress.hidden = false;
  els.cacheProgressTitle.textContent = cacheSyncPhaseLabel(job.phase);
  els.cacheProgressMeta.textContent = job.status === 'done'
    ? `${savedText} salvati`
    : `${percent}%`;
  els.cacheProgressBar.style.width = `${percent}%`;
  els.cacheProgressDetails.textContent = `Stati: ${statesText}. Trovati: ${foundText}. Salvati: ${savedText}/${maxText}. ${batchText}.${newText}`;

  if (job.status === 'error') {
    els.cacheProgressTitle.textContent = 'Sincronizzazione non riuscita';
    els.cacheProgressMeta.textContent = 'Errore';
    els.cacheProgressDetails.textContent = job.error || 'Errore durante lo scaricamento ordini.';
  }
}

async function waitForCacheSync(jobId) {
  let currentJob = null;
  while (true) {
    await delay(800);
    const { job } = await api(`/api/order-cache/sync/${encodeURIComponent(jobId)}`);
    currentJob = job;
    renderCacheSyncProgress(job);
    if (job.status === 'done') return job;
    if (job.status === 'error') throw new Error(job.error || 'Sincronizzazione cache non riuscita.');
  }
}

async function syncOrderCache() {
  setStatus('Sincronizzazione cache ordini...');
  const { job } = await api('/api/order-cache/sync', { method: 'POST', body: '{}' });
  renderCacheSyncProgress(job);
  const finalJob = await waitForCacheSync(job.id);
  const status = await loadCacheStatus();
  renderCacheStatus(status);
  const totalText = finalJob.hasMore ? `almeno ${finalJob.savedCount}` : `${finalJob.totalFound || finalJob.savedCount}`;
  setStatus(`${finalJob.savedCount} ordini salvati in cache (${totalText} trovati)`, 'ok');
  showToast(`${finalJob.savedCount} ordini salvati in cache`, 'ok');
  if (!els.ordersPage.hidden && !els.orderSearch.value.trim()) {
    await searchOrders();
  }
  return finalJob;
}

function renderProductTemplateSuggestions(products, query) {
  els.productTemplateSuggestions.innerHTML = '';
  els.productTemplateSuggestions.hidden = !products.length;
  if (!products.length) return;

  const title = document.createElement('div');
  title.className = 'suggestionTitle';
  title.textContent = `Anteprima da templates_export.csv per "${query}"`;
  els.productTemplateSuggestions.appendChild(title);

  for (const product of products) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestionItem';
    button.setAttribute('aria-label', `Seleziona prodotto ${product.id}: ${product.label}`);
    button.dataset.tooltip = `#${product.id} - ${product.label}`;
    button.innerHTML = `
      <span class="suggestionId">#${escapeHtml(product.id)}</span>
      <span class="suggestionName">${escapeHtml(product.label)}</span>
    `;
    button.addEventListener('click', () => {
      els.productSearch.value = product.id;
      els.productTemplateSuggestions.hidden = true;
      runWithBusy(els.searchProducts, 'Cerco...', () => searchProducts(product.id)).catch((error) => setStatus(error.message, 'error'));
    });
    els.productTemplateSuggestions.appendChild(button);
  }
}

async function loadProductTemplateSuggestions() {
  const q = els.productSearch.value.trim();
  if (q.length < 2) {
    renderProductTemplateSuggestions([], q);
    return;
  }

  const requestId = ++state.productSearchRequestId;
  const { products } = await api(`/api/product-templates?q=${encodeURIComponent(q)}&limit=8`);
  if (requestId !== state.productSearchRequestId || q !== els.productSearch.value.trim()) return;
  renderProductTemplateSuggestions(products, q);
  if (!products.length && q.length >= 4) {
    await searchProducts('', { silent: true, expectedQuery: q, requestId });
  }
}

function scheduleProductTemplateSuggestions() {
  window.clearTimeout(state.productTemplateTimer);
  state.productTemplateTimer = window.setTimeout(() => {
    loadProductTemplateSuggestions().catch(() => renderProductTemplateSuggestions([], ''));
  }, 160);
}

function showToast(message, type = 'neutral') {
  els.toast.textContent = message;
  els.toast.hidden = false;
  els.toast.className = `toast ${type}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, type === 'error' ? 5600 : 3200);
}

function money(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(number);
}

function setButtonBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.idleLabel = button.textContent;
    button.dataset.wasDisabled = String(button.disabled);
    button.textContent = busyLabel || button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    return;
  }

  if (button.dataset.idleLabel) {
    button.textContent = button.dataset.idleLabel;
    delete button.dataset.idleLabel;
  }
  button.disabled = button.dataset.wasDisabled === 'true';
  delete button.dataset.wasDisabled;
  button.removeAttribute('aria-busy');
}

async function runWithBusy(button, busyLabel, action) {
  setButtonBusy(button, true, busyLabel);
  try {
    return await action();
  } finally {
    setButtonBusy(button, false);
    updateReplaceState();
  }
}

async function api(path, options = {}) {
  let response;
  const headers = {
    'Content-Type': 'application/json',
    ...(state.sessionToken ? { 'X-App-Session': state.sessionToken } : {}),
    ...(options.headers || {}),
  };

  try {
    response = await fetch(path, {
      ...options,
      headers,
    });
  } catch (error) {
    throw new Error('Connessione al server locale interrotta. Riavvia npm run dev e riprova.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Operazione non riuscita.');
  return data;
}

function operationSignature() {
  if (!state.selectedProduct || state.selectedRows.size === 0) return '';
  return JSON.stringify({
    productId: String(state.selectedProduct.id),
    rowIds: [...state.selectedRows].map(String).sort(),
  });
}

function isActiveProduct(product) {
  return String(product?.active ?? '1') === '1';
}

function needsTypedConfirm() {
  return state.selectedRows.size >= 2;
}

function invalidateSafetyState({ hidePreview = true } = {}) {
  state.lastPreview = null;
  state.lastSimulationSignature = '';
  state.lastSimulationResult = null;
  els.confirmCheck.checked = false;
  els.confirmText.value = '';
  if (hidePreview) els.previewPanel.hidden = true;
  updateReplaceState();
}

function validateCurrentSelection() {
  if (!state.selectedProduct) throw new Error('Seleziona il prodotto destinazione.');
  if (state.selectedRows.size === 0) throw new Error('Seleziona almeno una riga ordine.');
  if (!isActiveProduct(state.selectedProduct)) {
    throw new Error('Il prodotto destinazione non risulta attivo. Scegli un prodotto attivo prima di procedere.');
  }
}

function previewWarnings(previews, sameOriginalProduct) {
  const warnings = [];
  const blocking = [];

  if (!sameOriginalProduct) {
    warnings.push('Le righe selezionate non hanno tutte lo stesso prodotto di partenza.');
  }

  if (!isActiveProduct(state.selectedProduct)) {
    blocking.push('Il prodotto destinazione non risulta attivo.');
  }

  const selectedId = String(state.selectedProduct?.id || '');
  const selectedReference = String(state.selectedProduct?.reference || '');
  const alreadyTarget = previews.some((preview) => {
    const sameId = selectedId && String(preview.oldProductId || '') === selectedId;
    const sameReference = selectedReference && String(preview.oldProductReference || '') === selectedReference;
    return sameId || sameReference;
  });

  if (alreadyTarget) {
    blocking.push('Una o piu righe selezionate hanno gia il prodotto destinazione.');
  }

  return { warnings, blocking };
}

function updateSafetyGate() {
  const signature = operationSignature();
  const hasSelection = Boolean(signature);
  const simulationMatches = hasSelection && state.lastSimulationSignature === signature;
  const simulationOk = simulationMatches && state.lastSimulationResult && (state.lastSimulationResult.errors || []).length === 0;
  const requiresText = needsTypedConfirm();
  const textOk = !requiresText || els.confirmText.value.trim().toUpperCase() === 'CONFERMA';
  const checkedOk = !state.requireConfirmCheck || els.confirmCheck.checked;
  const blockedByPreview = Boolean(state.lastPreview?.blocking?.length);
  const canConfirm = simulationOk && checkedOk && textOk && !blockedByPreview;
  const confirmCheckWrap = els.confirmCheck.closest('.confirmCheck');

  if (confirmCheckWrap) confirmCheckWrap.hidden = !state.requireConfirmCheck || !simulationOk || blockedByPreview;
  els.confirmTextWrap.hidden = !simulationOk || blockedByPreview || !requiresText;
  els.confirmReplace.disabled = !canConfirm;
  els.confirmReplace.hidden = !simulationOk || blockedByPreview;
  els.drawerSimulate.disabled = !hasSelection || blockedByPreview;
  els.drawerSimulate.hidden = simulationOk || blockedByPreview;

  els.simulationState.className = '';
  if (!hasSelection) {
    els.simulationState.textContent = 'Non eseguita';
    els.simulationGate.textContent = 'Seleziona righe e prodotto, poi apri la modifica.';
    els.simulationGate.className = 'gateNotice';
    return;
  }

  if (blockedByPreview) {
    els.simulationState.textContent = 'Bloccata';
    els.simulationState.classList.add('blocked');
    els.simulationGate.textContent = `${state.lastPreview.blocking.join(' ')} Scegli un prodotto destinazione diverso per procedere.`;
    els.simulationGate.className = 'gateNotice error';
    return;
  }

  if (!state.lastSimulationResult) {
    els.simulationState.textContent = 'Non eseguita';
    els.simulationGate.textContent = 'Pronto per la modifica reale. Prima faccio una verifica tecnica senza scrivere su PrestaShop.';
    els.simulationGate.className = 'gateNotice';
    return;
  }

  if (!simulationMatches) {
    els.simulationState.textContent = 'Da rifare';
    els.simulationGate.textContent = 'La selezione e cambiata: verifica di nuovo prima di applicare la modifica reale.';
    els.simulationGate.className = 'gateNotice';
    return;
  }

  if (!simulationOk) {
    els.simulationState.textContent = 'Fallita';
    els.simulationState.classList.add('error');
    els.simulationGate.textContent = 'La verifica ha restituito errori. Correggi la selezione prima di procedere.';
    els.simulationGate.className = 'gateNotice error';
    return;
  }

  els.simulationState.textContent = 'Riuscita';
  els.simulationState.classList.add('ok');
  els.simulationGate.textContent = requiresText
    ? 'Verifica riuscita. Ora puoi applicare la modifica reale dopo il controllo finale.'
    : 'Verifica riuscita. Ora puoi applicare la modifica reale.';
  els.simulationGate.className = 'gateNotice ok';
}

async function loadSettings() {
  const { settings, configured, locked } = await api('/api/settings');

  if (locked) {
    await unlockApp();
    return loadSettings();
  }

  els.baseUrl.value = settings.baseUrl || '';
  els.apiKey.value = settings.apiKey || '';
  state.selectedOrderStates = (settings.orderStates || (settings.orderState ? [settings.orderState] : [])).map(String);
  state.defaultOrderState = String(settings.defaultOrderState || '');
  els.orderDateFrom.value = settings.orderDateFrom || '';
  els.orderDateTo.value = settings.orderDateTo || '';
  els.orderDateFromQuick.value = settings.orderDateFrom || '';
  els.orderDateToQuick.value = settings.orderDateTo || '';
  setSelectValue(els.orderLimit, settings.orderLimit, '20');
  els.orderFeedLimit.value = [...els.orderFeedLimit.options].some((option) => option.value === String(settings.orderLimit || '20'))
    ? String(settings.orderLimit || '20')
    : '20';
  els.cacheAutoSync.checked = Boolean(settings.cacheAutoSync);
  els.cacheHourlySync.checked = Boolean(settings.cacheHourlySync);
  state.requireConfirmCheck = settings.requireConfirmCheck !== false;
  els.requireConfirmCheck.checked = state.requireConfirmCheck;
  setSelectValue(els.cacheBatchSize, settings.cacheBatchSize, '50');
  setSelectValue(els.cacheMaxOrders, settings.cacheMaxOrders, '100');
  els.appPassword.value = '';
  els.appPassword.placeholder = settings.appPasswordEnabled ? 'Password impostata: scrivi per sostituire' : 'Vuota = nessuna password';
  updateConnectionSummary(configured);
  updateSaveSyncNotice();
  await Promise.all([
    loadOrderStates(state.selectedOrderStates, state.defaultOrderState).catch((error) => {
      els.orderStatesList.innerHTML = `<span class="mutedText">${escapeHtml(error.message)}</span>`;
    }),
    loadCacheStatus().catch(() => {}),
  ]);
  if (settings.cacheAutoSync && !state.autoSyncStarted) {
    state.autoSyncStarted = true;
    syncOrderCache().catch((error) => setStatus(error.message, 'error'));
  }
  setStatus(configured ? 'Connessione configurata' : 'Configura la connessione', configured ? 'ok' : 'neutral');
  if (configured) {
    await searchOrders();
  }
}

function unlockApp() {
  els.unlockDialog.hidden = false;
  els.unlockPassword.value = '';
  els.unlockError.hidden = true;
  els.unlockError.textContent = '';
  window.setTimeout(() => els.unlockPassword.focus(), 0);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      els.unlockDialog.hidden = true;
      els.unlockForm.removeEventListener('submit', handleSubmit);
      els.cancelUnlock.removeEventListener('click', handleCancel);
    };

    const handleCancel = () => {
      cleanup();
      reject(new Error('Password locale richiesta.'));
    };

    const handleSubmit = async (event) => {
      event.preventDefault();
      els.unlockError.hidden = true;
      setButtonBusy(els.unlockForm.querySelector('button[type="submit"]'), true, 'Verifica...');

      try {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ password: els.unlockPassword.value }),
        });
        state.sessionToken = data.token;
        localStorage.setItem('appSessionToken', data.token);
        cleanup();
        resolve();
      } catch (error) {
        els.unlockError.textContent = error.message;
        els.unlockError.hidden = false;
        els.unlockPassword.select();
      } finally {
        setButtonBusy(els.unlockForm.querySelector('button[type="submit"]'), false);
      }
    };

    els.unlockForm.addEventListener('submit', handleSubmit);
    els.cancelUnlock.addEventListener('click', handleCancel);
  });
}

async function saveSettings(event) {
  event.preventDefault();
  setStatus('Salvataggio impostazioni...');
  await api('/api/settings', {
    method: 'POST',
    body: JSON.stringify({
      baseUrl: els.baseUrl.value,
      apiKey: els.apiKey.value,
      orderStates: selectedOrderStateIds(),
      defaultOrderState: els.defaultOrderState.value,
      orderDateFrom: els.orderDateFrom.value,
      orderDateTo: els.orderDateTo.value,
      orderLimit: els.orderLimit.value,
      cacheAutoSync: els.cacheAutoSync.checked,
      cacheHourlySync: els.cacheHourlySync.checked,
      cacheBatchSize: els.cacheBatchSize.value,
      cacheMaxOrders: els.cacheMaxOrders.value,
      requireConfirmCheck: els.requireConfirmCheck.checked,
      appPassword: els.appPassword.value,
    }),
  });
  state.defaultOrderState = els.defaultOrderState.value;
  state.requireConfirmCheck = els.requireConfirmCheck.checked;
  setStatus('Impostazioni salvate', 'ok');
  showToast('Impostazioni salvate', 'ok');
  updateSaveSyncNotice();
  if (els.cacheAutoSync.checked) {
    setStatus('Impostazioni salvate, avvio sincronizzazione cache...', 'neutral');
    await syncOrderCache();
  } else {
    await loadCacheStatus().catch(() => {});
  }
}

function showPage(pageName) {
  const pageCopy = {
    orders: {
      title: 'Ordini',
      lead: 'Seleziona, simula e conferma sostituzioni prodotto sugli ordini PrestaShop.',
    },
    settings: {
      title: 'Impostazioni',
      lead: 'Gestisci connessione, stati ordine, cache e protezione locale.',
    },
    logs: {
      title: 'Log operazioni',
      lead: 'Controlla simulazioni, modifiche reali, backup generati ed errori.',
    },
  };

  els.ordersPage.hidden = pageName !== 'orders';
  els.settingsPage.hidden = pageName !== 'settings';
  els.logsPage.hidden = pageName !== 'logs';
  els.ordersPageButton.classList.toggle('active', pageName === 'orders');
  els.settingsPageButton.classList.toggle('active', pageName === 'settings');
  els.logsPageButton.classList.toggle('active', pageName === 'logs');
  for (const [button, name] of [
    [els.ordersPageButton, 'orders'],
    [els.settingsPageButton, 'settings'],
    [els.logsPageButton, 'logs'],
  ]) {
    if (pageName === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  els.pageTitle.textContent = pageCopy[pageName].title;
  els.pageLead.textContent = pageCopy[pageName].lead;

  if (pageName === 'logs') loadLogs().catch((error) => setStatus(error.message, 'error'));
}

function toggleApiKeyVisibility() {
  const isPassword = els.apiKey.type === 'password';
  els.apiKey.type = isPassword ? 'text' : 'password';
  els.showApiKey.textContent = isPassword ? 'Nascondi key' : 'Mostra key';
}

function updateFlowState() {
  const selectedOrders = state.selectedOrders.size > 0;
  const selectedRows = state.selectedRows.size > 0;
  const selectedProduct = Boolean(state.selectedProduct);
  const simulationOk = state.lastSimulationSignature === operationSignature() && state.lastSimulationResult && !state.lastSimulationResult.errors?.length;
  const activeStep = simulationOk
    ? 'review'
    : selectedRows && selectedProduct
      ? 'review'
      : selectedRows
        ? 'product'
        : selectedOrders
          ? 'rows'
          : 'orders';
  const status = {
    orders: { done: selectedOrders, active: !selectedOrders },
    rows: { done: selectedRows, active: selectedOrders && !selectedRows },
    product: { done: selectedProduct, active: selectedRows && !selectedProduct },
    review: { done: simulationOk, active: selectedRows && selectedProduct },
  };

  els.ordersPage.dataset.activeStep = activeStep;
  els.rowsPanel.classList.toggle('isCurrentStep', activeStep === 'rows' || activeStep === 'review');
  els.productPanel.classList.toggle('isCurrentStep', activeStep === 'product' || activeStep === 'review');
  els.orderFeedBar?.classList.toggle('isCompact', selectedOrders || state.visibleOrders.length > 0);

  document.querySelectorAll('.flowStep').forEach((step) => {
    const stepStatus = status[step.dataset.step];
    step.classList.toggle('done', Boolean(stepStatus?.done));
    step.classList.toggle('active', Boolean(stepStatus?.active));
  });
}

function focusEditWorkspace(target = 'rows') {
  const panel = target === 'product' ? els.productPanel : els.rowsPanel;
  if (!panel) return;
  window.setTimeout(() => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (target === 'product' && !state.selectedProduct) {
      window.setTimeout(() => els.productSearch.focus({ preventScroll: true }), 220);
    }
  }, 80);
}

function updateReplaceState() {
  const disabled = !state.selectedProduct || state.selectedRows.size === 0;
  els.replaceButton.disabled = disabled;
  els.simulateButton.disabled = disabled;
  els.selectSameRows.disabled = state.selectedRows.size === 0;
  els.barPreviewButton.disabled = disabled;
  els.barSimulateButton.disabled = disabled;
  els.barSelectSameRows.disabled = state.selectedRows.size === 0;
  els.rowsPanel.classList.toggle('isActive', state.selectedOrders.size > 0);
  els.productPanel.classList.toggle('isActive', state.selectedRows.size > 0 || Boolean(state.selectedProduct));
  const selectionText = `${state.selectedOrders.size} ordini selezionati - ${state.selectedRows.size} righe selezionate`;
  els.selectionSummary.textContent = selectionText;
  els.topSelectionMeta.textContent = state.selectedOrders.size
    ? `${state.selectedOrders.size} ordini · ${state.selectedRows.size} righe`
    : 'Nessuna selezione';
  els.selectionActionBar.hidden = state.selectedOrders.size === 0;
  els.selectionActionTitle.textContent = state.selectedProduct
    ? `Pronto per modifica con ${state.selectedRows.size} righe`
    : state.selectedRows.size
      ? 'Scegli il prodotto destinazione'
      : 'Seleziona le righe da modificare';
  els.selectionActionMeta.textContent = selectionText;
  els.ordersCount.textContent = state.selectedOrders.size;
  els.rowsCount.textContent = state.selectedRows.size;
  els.targetProduct.textContent = state.selectedProduct
    ? `#${state.selectedProduct.id} - ${state.selectedProduct.name}`
    : 'Nessuno';
  updateFlowState();
  updateSafetyGate();
}

function selectedOrderIds() {
  return [...state.selectedOrders.keys()];
}

function updateSelectedOrderTitle() {
  const count = state.selectedOrders.size;
  if (count === 0) {
    els.selectedOrderTitle.textContent = 'Nessun ordine selezionato';
    return;
  }

  if (count === 1) {
    const order = [...state.selectedOrders.values()][0];
    els.selectedOrderTitle.textContent = `Ordine #${order.id} - ${order.reference}`;
    return;
  }

  els.selectedOrderTitle.textContent = `${count} ordini selezionati`;
}

function renderSelectedOrderRows() {
  els.orderRows.innerHTML = '';
  updateSelectedOrderTitle();

  const orders = [...state.selectedOrders.values()];
  const rows = orders.flatMap((order) => order.rows.map((row) => ({ ...row, order })));

  if (!rows.length) {
    els.orderRows.innerHTML = '<tr><td colspan="7" class="empty">Seleziona uno o piu ordini con righe prodotto.</td></tr>';
    updateReplaceState();
    return;
  }

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.className = `detailRow ${state.selectedRows.has(row.id) ? 'active' : ''}`;
    tr.innerHTML = `
      <td class="checkCell" data-label="Seleziona"><input class="rowCheck" type="checkbox" value="${escapeHtml(row.id)}" ${state.selectedRows.has(row.id) ? 'checked' : ''} /></td>
      <td data-label="Ordine">#${escapeHtml(row.order.id)}<br>${escapeHtml(row.order.reference)}</td>
      <td data-label="Prodotto">${escapeHtml(row.productName)}</td>
      <td data-label="Riferimento">${escapeHtml(row.productReference || '-')}</td>
      <td data-label="Qta">${escapeHtml(row.productQuantity)}</td>
      <td data-label="Unitario" class="numCol">${money(row.unitPriceTaxIncl)}</td>
      <td data-label="Totale" class="numCol">${money(row.totalPriceTaxIncl)}</td>
    `;
    tr.querySelector('input').addEventListener('change', (event) => {
      if (event.target.checked) state.selectedRows.add(row.id);
      else state.selectedRows.delete(row.id);
      tr.classList.toggle('active', event.target.checked);
      invalidateSafetyState();
      if (event.target.checked && !state.selectedProduct) focusEditWorkspace('product');
    });
    els.orderRows.appendChild(tr);
  }

  updateReplaceState();
}

function selectedRowObjects() {
  return [...state.selectedOrders.values()]
    .flatMap((order) => order.rows.map((row) => ({ ...row, order })))
    .filter((row) => state.selectedRows.has(row.id));
}

function selectRowsByProduct(productId, productReference) {
  state.selectedRows.clear();

  for (const order of state.selectedOrders.values()) {
    for (const row of order.rows) {
      const sameId = productId && row.productId === productId;
      const sameReference = productReference && row.productReference === productReference;
      if (sameId || sameReference) state.selectedRows.add(row.id);
    }
  }

  invalidateSafetyState();
  renderSelectedOrderRows();
}

function renderPreview(previews, sameOriginalProduct) {
  const checks = previewWarnings(previews, sameOriginalProduct);
  state.lastPreview = {
    signature: operationSignature(),
    previews,
    sameOriginalProduct,
    warnings: checks.warnings,
    blocking: checks.blocking,
  };

  els.previewPanel.hidden = false;
  const orderCount = new Set(previews.map((preview) => String(preview.orderId))).size;
  const rowLabel = previews.length === 1 ? '1 riga' : `${previews.length} righe`;
  const orderLabel = orderCount === 1 ? '1 ordine' : `${orderCount} ordini`;
  const selectedLabel = previews.length === 1 ? 'selezionata' : 'selezionate';
  els.previewTitle.textContent = previews.length === 1 ? 'Modifica prodotto ordine' : 'Modifica prodotti ordini';
  els.previewMeta.textContent = `${rowLabel} ${selectedLabel} su ${orderLabel}. Controlla il cambio e applica quando e sbloccato.`;
  els.previewRows.innerHTML = '';
  els.previewWarning.hidden = !checks.warnings.length || checks.blocking.length > 0;
  els.previewWarning.textContent = checks.warnings.join(' ');

  for (const preview of previews) {
    const item = document.createElement('article');
    item.className = checks.blocking.length ? 'previewItem isBlocked' : 'previewItem';
    item.innerHTML = `
      <div class="previewItemHeader">
        <div>
          <strong>Ordine #${escapeHtml(preview.orderId)}</strong>
          <span class="itemMeta">Riga ${escapeHtml(preview.orderDetailId || '-')}</span>
        </div>
        <div class="previewFacts" aria-label="Dati riga">
          <span>Qta ${escapeHtml(preview.productQuantity)}</span>
          <span>Unitario ${money(preview.unitPriceTaxIncl)}</span>
          <span>Totale ${money(preview.totalPriceTaxIncl)}</span>
        </div>
      </div>
      <div class="previewProducts">
        <div class="productDelta productDeltaOld">
          <span>Prodotto attuale</span>
          <strong>${escapeHtml(preview.oldProductName)}</strong>
          <p class="itemMeta">${escapeHtml(preview.oldProductReference || '-')}</p>
        </div>
        <div class="deltaArrow" aria-hidden="true">&rarr;</div>
        <div class="productDelta productDeltaNew">
          <span>Nuovo prodotto</span>
          <strong>${escapeHtml(preview.newProductName)}</strong>
          <p class="itemMeta">${escapeHtml(preview.newProductReference || '-')}</p>
        </div>
      </div>
    `;
    els.previewRows.appendChild(item);
  }

  updateSafetyGate();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  els.previewPanel.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
}

function logMatches(entry) {
  if (state.logFilter === 'real' && (entry.simulate || entry.status !== 'ok')) return false;
  if (state.logFilter === 'simulation' && !entry.simulate) return false;
  if (state.logFilter === 'error' && entry.status !== 'error') return false;
  if (!state.logQuery) return true;

  const preview = entry.preview || {};
  const haystack = [
    entry.at,
    entry.status,
    entry.error,
    entry.backupFile,
    entry.orderDetailId,
    entry.productId,
    preview.orderId,
    preview.orderDetailId,
    preview.oldProductName,
    preview.oldProductReference,
    preview.newProductName,
    preview.newProductReference,
  ].join(' ').toLowerCase();
  return haystack.includes(state.logQuery.toLowerCase());
}

function renderLogs() {
  const logs = state.logs.filter(logMatches);
  els.logsList.innerHTML = '';

  if (!logs.length) {
    els.logsList.innerHTML = '<div class="item"><span class="itemTitle">Nessun log per i filtri correnti</span></div>';
    return;
  }

  for (const entry of logs) {
    const preview = entry.preview || {};
    const details = document.createElement('details');
    details.className = `item logEntry ${entry.status === 'ok' ? 'resultOk' : 'resultError'}`;
    const kind = entry.status !== 'ok' ? 'Errore' : entry.simulate ? 'Simulazione' : 'Modifica reale';
    details.innerHTML = `
      <summary>
        <span>
          <span class="itemTitle">${escapeHtml(kind)} - ${escapeHtml(entry.at || '')}</span>
          <span class="itemMeta">Ordine ${escapeHtml(preview.orderId || '-')} - Riga ${escapeHtml(preview.orderDetailId || entry.orderDetailId || '-')}</span>
        </span>
        <span class="logBadge ${entry.status === 'ok' ? 'ok' : 'error'}">${entry.status === 'ok' ? 'OK' : 'Errore'}</span>
      </summary>
      <div class="logDetail">
        <dl>
          <dt>Da</dt>
          <dd>${escapeHtml(preview.oldProductName || '-')} (${escapeHtml(preview.oldProductReference || '-')})</dd>
          <dt>A</dt>
          <dd>${escapeHtml(preview.newProductName || '-')} (${escapeHtml(preview.newProductReference || '-')})</dd>
          <dt>Backup</dt>
          <dd>${escapeHtml(entry.backupFile || '-')}</dd>
          <dt>Errore</dt>
          <dd>${escapeHtml(entry.error || '-')}</dd>
        </dl>
        <div class="logActions">
          ${entry.backupFile ? `<button type="button" data-backup="${escapeHtml(entry.backupFile)}">Scarica backup</button>` : ''}
          <button type="button" data-copy-log="${escapeHtml(entry.id || '')}">Copia riepilogo</button>
        </div>
      </div>
    `;
    els.logsList.appendChild(details);
  }
}

async function loadLogs() {
  setStatus('Carico log...');
  const { logs } = await api('/api/logs');
  state.logs = logs;
  renderLogs();
  setStatus(`${logs.length} log caricati`, logs.length ? 'ok' : 'neutral');
}

async function clearLogs() {
  if (!window.confirm('Eliminare tutti i log presenti? Backup e impostazioni non verranno modificati.')) return;
  setStatus('Svuoto log...');
  await api('/api/logs', { method: 'DELETE' });
  state.logs = [];
  renderLogs();
  setStatus('Log eliminati', 'ok');
  showToast('Log eliminati', 'ok');
}

function buildResultSummary(data, simulated = false) {
  const updated = data.updated || [];
  const errors = data.errors || [];
  const mode = simulated ? 'Simulazione' : 'Modifica reale';
  return [
    `${mode}: ${updated.length} riuscite, ${errors.length} errori`,
    ...updated.map((item) => `OK riga ${item.orderDetailId}${item.backupFile ? ` backup ${item.backupFile}` : ''}`),
    ...errors.map((item) => `ERRORE riga ${item.orderDetailId}: ${item.error}`),
  ].join('\n');
}

function renderResult(data, simulated = false) {
  els.resultPanel.hidden = false;
  els.resultActions.hidden = false;
  els.resultTitle.textContent = simulated ? 'Simulazione completata' : 'Sostituzione completata';
  els.resultRows.innerHTML = '';
  state.lastResultSummary = buildResultSummary(data, simulated);

  for (const item of data.updated || []) {
    const div = document.createElement('div');
    div.className = 'item resultOk';
    div.innerHTML = `
      <span class="itemTitle">Riga ${escapeHtml(item.orderDetailId)} ${simulated ? 'simulata' : 'aggiornata'}</span>
      <span class="itemMeta">${simulated ? 'Nessuna modifica scritta' : `Backup: ${escapeHtml(item.backupFile || '-')}`}</span>
    `;
    els.resultRows.appendChild(div);
  }

  for (const item of data.errors || []) {
    const div = document.createElement('div');
    div.className = 'item resultError';
    div.innerHTML = `
      <span class="itemTitle">Riga ${escapeHtml(item.orderDetailId)} non aggiornata</span>
      <span class="itemMeta">${escapeHtml(item.error)}</span>
    `;
    els.resultRows.appendChild(div);
  }
}

async function previewReplacement() {
  validateCurrentSelection();
  setStatus('Preparo modifica...');
  const data = await api('/api/order-details/preview-replace-product', {
    method: 'POST',
    body: JSON.stringify({
      orderDetailIds: [...state.selectedRows],
      productId: state.selectedProduct.id,
    }),
  });
  renderPreview(data.previews, data.sameOriginalProduct);
  setStatus('Modifica pronta', 'ok');
  return data;
}

async function ensureCurrentPreview() {
  if (state.lastPreview?.signature === operationSignature()) return state.lastPreview;
  await previewReplacement();
  return state.lastPreview;
}

async function simulateReplacement({ showResult = true } = {}) {
  validateCurrentSelection();
  const preview = await ensureCurrentPreview();
  if (preview.blocking.length) throw new Error(preview.blocking.join(' '));

  setStatus('Verifica in corso...');
  const signature = operationSignature();
  const data = await api('/api/order-details/replace-product', {
    method: 'POST',
    body: JSON.stringify({
      orderDetailIds: [...state.selectedRows],
      productId: state.selectedProduct.id,
      simulate: true,
    }),
  });
  state.lastSimulationSignature = signature;
  state.lastSimulationResult = data;
  if (showResult) renderResult(data, true);
  setStatus(data.errors?.length ? 'Verifica con errori' : 'Verifica completata', data.errors?.length ? 'error' : 'ok');
  if (!data.errors?.length) showToast('Verifica completata', 'ok');
  updateSafetyGate();
  return data;
}

async function toggleOrderSelection(orderSummary, checked) {
  if (!checked) {
    const removed = state.selectedOrders.get(orderSummary.id);
    state.selectedOrders.delete(orderSummary.id);
    if (removed?.rows) {
      for (const row of removed.rows) state.selectedRows.delete(row.id);
    }
    invalidateSafetyState();
    renderSelectedOrderRows();
    return;
  }

  setStatus('Carico righe ordine...');
  const { order } = await api(`/api/orders/${orderSummary.id}`);
  state.selectedOrders.set(order.id, order);
  invalidateSafetyState();
  renderSelectedOrderRows();
  setStatus(`${state.selectedOrders.size} ordini selezionati`, 'ok');
  focusEditWorkspace('rows');
}

async function refreshSelectedOrders() {
  const ids = selectedOrderIds();
  state.selectedRows.clear();
  state.selectedOrders.clear();

  for (const id of ids) {
    const { order } = await api(`/api/orders/${id}`);
    state.selectedOrders.set(order.id, order);
  }

  invalidateSafetyState();
  renderSelectedOrderRows();
}

function orderStateName(order) {
  const stateName = state.orderStates.find((item) => String(item.id) === String(order.currentState))?.name;
  return stateName || (order.currentState ? `Stato ${order.currentState}` : 'Stato non disponibile');
}

function formatOrderDate(value) {
  if (!value) return '-';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function orderProducts(order) {
  const products = Array.isArray(order.products) && order.products.length
    ? order.products
    : Array.isArray(order.rows)
      ? order.rows
      : [];
  return products.filter((product) => product.productName || product.productReference);
}

function renderOrderProducts(order) {
  const products = orderProducts(order);
  if (!products.length) return '<span class="mutedText">Prodotti non caricati</span>';

  return `
    <div class="orderProducts">
      ${products.slice(0, 4).map((product) => {
        const quantity = Number(product.productQuantity || 1);
        const quantityLabel = Number.isFinite(quantity) && quantity > 0 ? `${quantity}x` : '1x';
        const name = product.productName || product.productReference || 'Prodotto senza nome';
        return `
          <span class="orderProductLine" title="${escapeHtml(name)}">
            <span class="qtyBadge">${escapeHtml(quantityLabel)}</span>
            <span class="orderProductName">${escapeHtml(name)}</span>
          </span>
        `;
      }).join('')}
      ${products.length > 4 ? `<span class="orderProductMore">+${products.length - 4} altri</span>` : ''}
    </div>
  `;
}

function renderOrderCustomer(order) {
  const customerName = String(order.customerName || '').replace(/\s+/g, ' ').trim();
  if (!customerName) return '<span class="mutedText">-</span>';
  return `<span class="customerName" title="${escapeHtml(customerName)}">${escapeHtml(customerName)}</span>`;
}

function updateOrderFeedMeta({ count = 0, source = '', cache = null, query = '' } = {}) {
  if (!els.orderFeedMeta) return;
  const limit = orderFeedLimit();
  const noun = count === 1 ? 'ordine' : 'ordini';
  const sourceText = source === 'cache' && cache?.count
    ? `cache locale, ${cache.count} salvati`
    : source === 'live'
      ? 'PrestaShop live'
      : 'cache locale';
  const visibleCount = count ? Math.min(count, limit) : 0;
  els.orderFeedMeta.textContent = query
    ? `${count} ${noun} trovati per "${query}" da ${sourceText}.`
    : `Mostro gli ultimi ${visibleCount} ${noun} da ${sourceText}.`;
}

function renderOrdersLoading(message = 'Carico ordini...', rows = 6) {
  state.visibleOrders = [];
  if (els.ordersListTitle) els.ordersListTitle.textContent = 'Carico ordini';
  if (els.orderFeedMeta) els.orderFeedMeta.textContent = message;
  els.orders.setAttribute('aria-busy', 'true');
  els.orders.innerHTML = Array.from({ length: rows }, (_, index) => `
    <tr class="loadingRow" aria-hidden="true">
      <td class="checkCell"><span class="skeletonBox skeletonCheck"></span></td>
      <td><span class="skeletonLine skeletonShort"></span></td>
      <td><span class="skeletonLine skeletonPill"></span></td>
      <td><span class="skeletonLine skeletonMedium"></span></td>
      <td><span class="skeletonLine skeletonMedium"></span></td>
      <td>
        <span class="skeletonLine skeletonProduct"></span>
        ${index % 3 === 0 ? '<span class="skeletonLine skeletonProduct skeletonProductSub"></span>' : ''}
      </td>
      <td><span class="skeletonLine skeletonPill"></span></td>
      <td class="numCol"><span class="skeletonLine skeletonAmount"></span></td>
    </tr>
  `).join('');
  updateFlowState();
}

function renderOrdersList(orders) {
  state.visibleOrders = orders;
  els.orders.removeAttribute('aria-busy');
  els.orders.innerHTML = '';
  if (els.ordersListTitle) {
    els.ordersListTitle.textContent = orders.length === 1 ? 'Trovato 1 ordine' : `Trovati ${orders.length} ordini`;
  }

  if (!orders.length) {
    els.orders.innerHTML = '<tr><td colspan="8" class="empty">Nessun ordine trovato. Prova una ricerca specifica o aggiorna la cache dalle impostazioni.</td></tr>';
    updateFlowState();
    return false;
  }

  for (const order of orders) {
    const tr = document.createElement('tr');
    tr.className = `orderRow ${state.selectedOrders.has(order.id) ? 'active' : ''}`;
    tr.innerHTML = `
      <td class="checkCell" data-label="Seleziona"><input class="orderSelect" type="checkbox" value="${escapeHtml(order.id)}" ${state.selectedOrders.has(order.id) ? 'checked' : ''} aria-label="Seleziona ordine ${escapeHtml(order.id)}" /></td>
      <td data-label="ID ordine">#${escapeHtml(order.id)}</td>
      <td data-label="Riferimento"><span class="referencePill">${escapeHtml(order.reference || '-')}</span></td>
      <td data-label="Data ordine">${escapeHtml(formatOrderDate(order.dateAdd))}</td>
      <td class="customerCell" data-label="Cliente">${renderOrderCustomer(order)}</td>
      <td class="productsCell" data-label="Prodotti">${renderOrderProducts(order)}</td>
      <td data-label="Stato ordine"><span class="orderStateBadge">${escapeHtml(orderStateName(order))}</span></td>
      <td data-label="Importo totale" class="numCol">${money(order.totalPaid)}</td>
    `;
    tr.querySelector('input').addEventListener('change', (event) => {
      tr.classList.toggle('active', event.target.checked);
      toggleOrderSelection(order, event.target.checked).catch((error) => {
        event.target.checked = false;
        tr.classList.remove('active');
        setStatus(error.message, 'error');
      });
    });
    tr.addEventListener('click', (event) => {
      if (event.target.closest('input')) return;
      const checkbox = tr.querySelector('input');
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    els.orders.appendChild(tr);
  }

  updateFlowState();
  return true;
}

function mergeOrders(primary, secondary) {
  const byId = new Map();
  for (const order of [...primary, ...secondary]) {
    byId.set(String(order.id), order);
  }
  return [...byId.values()];
}

function shouldSearchOrdersLive(query, cachedCount) {
  if (!query) return cachedCount === 0;
  if (/^\d+$/.test(query)) return true;
  return query.length >= 3 || cachedCount === 0;
}

async function searchOrders() {
  const q = els.orderSearch.value.trim();
  const params = orderFilterParams();
  const expectedFilters = params.toString();
  const requestId = ++state.orderSearchRequestId;
  const initialMessage = q ? `Cerco "${q}" negli ordini...` : 'Carico gli ultimi ordini disponibili...';
  renderOrdersLoading(initialMessage);
  setStatus(q ? 'Ricerca ordini in cache...' : 'Carico ultimi ordini...');
  const { orders, source, cache } = await api(`/api/orders?${params.toString()}`);
  if (requestId !== state.orderSearchRequestId || expectedFilters !== orderFilterParams().toString()) return;

  renderOrdersList(orders);
  updateOrderFeedMeta({ count: orders.length, source, cache, query: q });
  const sourceText = source === 'cache' && cache?.count ? ` da cache (${cache.count})` : ' live';
  setStatus(orders.length ? `${orders.length} ordini trovati${sourceText}` : 'Nessun risultato in cache', orders.length ? 'ok' : 'neutral');

  if (!shouldSearchOrdersLive(q, orders.length)) return;

  setStatus(orders.length ? `${orders.length} ordini da cache - verifico PrestaShop...` : 'Cerco automaticamente su PrestaShop...');
  if (!orders.length) renderOrdersLoading('Cerco ordini su PrestaShop live...');
  const live = await api(`/api/orders?${orderLiveParams().toString()}`);
  if (requestId !== state.orderSearchRequestId || expectedFilters !== orderFilterParams().toString()) return;

  const merged = mergeOrders(orders, live.orders || []);
  renderOrdersList(merged);
  updateOrderFeedMeta({ count: merged.length, source: live.source || 'live', cache: live.cache, query: q });
  const added = merged.length - orders.length;
  if (!merged.length) {
    setStatus('Nessun ordine trovato', 'neutral');
    return;
  }
  setStatus(added > 0
    ? `${merged.length} ordini trovati: cache + ${added} live`
    : `${merged.length} ordini trovati - confermati live`, 'ok');
}

async function selectVisibleOrders() {
  if (!state.visibleOrders.length) return;
  setStatus('Carico ordini visibili...');

  for (const order of state.visibleOrders) {
    if (!state.selectedOrders.has(order.id)) {
      const { order: details } = await api(`/api/orders/${order.id}`);
      state.selectedOrders.set(details.id, details);
    }
  }

  document.querySelectorAll('#orders .orderSelect').forEach((checkbox) => {
    checkbox.checked = true;
    checkbox.closest('tr')?.classList.add('active');
  });
  invalidateSafetyState();
  renderSelectedOrderRows();
  setStatus(`${state.selectedOrders.size} ordini selezionati`, 'ok');
  focusEditWorkspace('rows');
}

function clearOrders(options = {}) {
  const { silent = false } = options;
  state.selectedOrders.clear();
  state.selectedRows.clear();
  state.selectedProduct = null;
  document.querySelectorAll('#orders .orderSelect, #products .item').forEach((item) => {
    if ('checked' in item) item.checked = false;
    item.classList?.remove('active');
    item.closest?.('.item')?.classList.remove('active');
    item.closest?.('tr')?.classList.remove('active');
  });
  invalidateSafetyState();
  renderSelectedOrderRows();
  if (!silent) setStatus('Selezione svuotata');
}

function resetOrderFilters() {
  els.orderSearch.value = '';
  els.orderStateQuick.value = state.defaultOrderState || '';
  els.orderDateFromQuick.value = '';
  els.orderDateToQuick.value = '';
  els.orderFeedLimit.value = [...els.orderFeedLimit.options].some((option) => option.value === String(els.orderLimit.value || '20'))
    ? String(els.orderLimit.value || '20')
    : '20';
  runWithBusy(els.searchOrders, 'Aggiorno...', searchOrders).catch((error) => setStatus(error.message, 'error'));
}

function resetOrderFiltersToInitial() {
  els.orderSearch.value = '';
  els.orderStateQuick.value = state.defaultOrderState || '';
  els.orderDateFromQuick.value = els.orderDateFrom.value || '';
  els.orderDateToQuick.value = els.orderDateTo.value || '';
  els.orderFeedLimit.value = [...els.orderFeedLimit.options].some((option) => option.value === String(els.orderLimit.value || '20'))
    ? String(els.orderLimit.value || '20')
    : '20';
}

async function resetOrdersPageForNewOperation() {
  clearOrders({ silent: true });
  state.selectedProduct = null;
  els.productSearch.value = '';
  els.products.innerHTML = '';
  els.productTemplateSuggestions.hidden = true;
  els.resultPanel.hidden = true;
  els.previewPanel.hidden = true;
  resetOrderFiltersToInitial();
  await searchOrders();
  setStatus('Pronto per una nuova operazione', 'ok');
}

async function searchProducts(autoSelectId = '', options = {}) {
  const q = els.productSearch.value.trim();
  const requestId = options.requestId || ++state.productSearchRequestId;
  els.productTemplateSuggestions.hidden = true;
  if (!options.silent) setStatus('Ricerca prodotti...');
  else els.products.innerHTML = '<div class="item"><span class="itemTitle">Nessun suggerimento locale</span><span class="itemMeta">Cerco automaticamente su PrestaShop...</span></div>';
  const { products } = await api(`/api/products?q=${encodeURIComponent(q)}`);
  if (options.expectedQuery && options.expectedQuery !== els.productSearch.value.trim()) return;
  if (requestId !== state.productSearchRequestId) return;
  els.products.innerHTML = '';

  if (!products.length) {
    els.products.innerHTML = '<div class="item"><span class="itemTitle">Nessun prodotto trovato</span></div>';
    setStatus('Nessun risultato');
    return;
  }

  let autoSelectButton = null;
  for (const product of products) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item';
    button.innerHTML = `
      <span class="itemTitle">#${escapeHtml(product.id)} - ${escapeHtml(product.name)}</span>
      <span class="itemMeta">${escapeHtml(product.reference || 'Senza riferimento')} - ${product.active === '1' ? 'Attivo' : 'Non attivo'}</span>
    `;
    button.addEventListener('click', () => {
      state.selectedProduct = product;
      document.querySelectorAll('#products .item').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      invalidateSafetyState();
      setStatus('Prodotto selezionato', 'ok');
      showToast(`Prodotto selezionato: ${product.name}`, 'ok');
    });
    if (autoSelectId && String(product.id) === String(autoSelectId)) {
      autoSelectButton = button;
    }
    els.products.appendChild(button);
  }

  setStatus(`${products.length} prodotti trovati`, 'ok');
  if (autoSelectButton) autoSelectButton.click();
}

async function replaceProduct() {
  await previewReplacement();
}

async function confirmReplacement() {
  validateCurrentSelection();
  const signature = operationSignature();
  if (state.lastSimulationSignature !== signature || !state.lastSimulationResult || state.lastSimulationResult.errors?.length) {
    throw new Error('Esegui una simulazione riuscita sulla selezione corrente prima della modifica reale.');
  }
  if (state.requireConfirmCheck && !els.confirmCheck.checked) throw new Error('Spunta il controllo di verifica prima di confermare.');
  if (needsTypedConfirm() && els.confirmText.value.trim().toUpperCase() !== 'CONFERMA') {
    throw new Error('Scrivi CONFERMA per abilitare la modifica reale.');
  }

  setStatus('Aggiornamento in corso...');
  const data = await api('/api/order-details/replace-product', {
    method: 'POST',
    body: JSON.stringify({
      orderDetailIds: [...state.selectedRows],
      productId: state.selectedProduct.id,
      simulate: false,
    }),
  });

  renderResult(data, false);
  setStatus(data.errors?.length ? 'Operazione completata con errori' : 'Operazione completata', data.errors?.length ? 'error' : 'ok');
  if (!data.errors?.length) showToast('Operazione completata', 'ok');
  els.previewPanel.hidden = true;
  if (data.errors?.length) {
    await refreshSelectedOrders();
    return;
  }
  await resetOrdersPageForNewOperation();
}

async function copyText(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function logSummary(entry) {
  const preview = entry.preview || {};
  return [
    `${entry.status === 'ok' ? 'OK' : 'Errore'} - ${entry.simulate ? 'Simulazione' : 'Modifica reale'} - ${entry.at || ''}`,
    `Ordine ${preview.orderId || '-'} - Riga ${preview.orderDetailId || entry.orderDetailId || '-'}`,
    `Da ${preview.oldProductReference || '-'} a ${preview.newProductReference || '-'}`,
    entry.backupFile ? `Backup ${entry.backupFile}` : entry.error || '',
  ].filter(Boolean).join('\n');
}

async function downloadBackup(fileName) {
  const response = await fetch(`/api/backups/${encodeURIComponent(fileName)}`, {
    headers: state.sessionToken ? { 'X-App-Session': state.sessionToken } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Backup non disponibile.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

els.searchOrders.addEventListener('click', () => runWithBusy(els.searchOrders, 'Cerco...', searchOrders).catch((error) => setStatus(error.message, 'error')));
els.searchProducts.addEventListener('click', () => runWithBusy(els.searchProducts, 'Cerco...', () => searchProducts()).catch((error) => setStatus(error.message, 'error')));
els.replaceButton.addEventListener('click', () => runWithBusy(els.replaceButton, 'Preparo...', replaceProduct).catch((error) => setStatus(error.message, 'error')));
els.simulateButton.addEventListener('click', () => runWithBusy(els.simulateButton, 'Simulo...', simulateReplacement).catch((error) => setStatus(error.message, 'error')));
els.barPreviewButton.addEventListener('click', () => els.replaceButton.click());
els.barSimulateButton.addEventListener('click', () => els.simulateButton.click());
els.drawerSimulate.addEventListener('click', () => runWithBusy(els.drawerSimulate, 'Verifico...', () => simulateReplacement({ showResult: false })).catch((error) => setStatus(error.message, 'error')));
els.confirmReplace.addEventListener('click', () => runWithBusy(els.confirmReplace, 'Aggiorno...', confirmReplacement).catch((error) => setStatus(error.message, 'error')));
els.closePreview.addEventListener('click', () => { els.previewPanel.hidden = true; });
els.closeResult.addEventListener('click', () => { els.resultPanel.hidden = true; });
els.selectVisibleOrders.addEventListener('click', () => runWithBusy(els.selectVisibleOrders, 'Carico...', selectVisibleOrders).catch((error) => setStatus(error.message, 'error')));
els.clearOrders.addEventListener('click', clearOrders);
els.selectSameRows.addEventListener('click', () => {
  const first = selectedRowObjects()[0];
  if (first) selectRowsByProduct(first.productId, first.productReference);
});
els.barSelectSameRows.addEventListener('click', () => els.selectSameRows.click());
els.settingsForm.addEventListener('submit', (event) => runWithBusy(els.settingsForm.querySelector('button[type="submit"]'), 'Salvo...', () => saveSettings(event)).catch((error) => setStatus(error.message, 'error')));
els.ordersPageButton.addEventListener('click', () => showPage('orders'));
els.settingsPageButton.addEventListener('click', () => showPage('settings'));
els.logsPageButton.addEventListener('click', () => showPage('logs'));
els.refreshLogs.addEventListener('click', () => runWithBusy(els.refreshLogs, 'Aggiorno...', loadLogs).catch((error) => setStatus(error.message, 'error')));
els.clearLogs.addEventListener('click', () => runWithBusy(els.clearLogs, 'Svuoto...', clearLogs).catch((error) => setStatus(error.message, 'error')));
els.showApiKey.addEventListener('click', toggleApiKeyVisibility);
els.refreshOrderStates.addEventListener('click', () => runWithBusy(els.refreshOrderStates, 'Carico...', () => loadOrderStates(selectedOrderStateIds(), els.defaultOrderState.value)).catch((error) => setStatus(error.message, 'error')));
els.defaultOrderState.addEventListener('change', () => {
  state.defaultOrderState = els.defaultOrderState.value;
  renderQuickOrderStateOptions(state.defaultOrderState);
  updateOrderSettingsSummary();
});
els.cacheAutoSync.addEventListener('change', updateSaveSyncNotice);
els.cacheHourlySync.addEventListener('change', updateSaveSyncNotice);
[els.baseUrl, els.apiKey].forEach((input) => {
  input.addEventListener('input', () => updateConnectionSummary(Boolean(els.baseUrl.value.trim() && els.apiKey.value.trim())));
});
els.syncOrderCache.addEventListener('click', () => runWithBusy(els.syncOrderCache, 'Sincronizzo...', syncOrderCache).catch((error) => setStatus(error.message, 'error')));
els.confirmCheck.addEventListener('change', updateSafetyGate);
els.confirmText.addEventListener('input', updateSafetyGate);
els.openLogsAfterResult.addEventListener('click', () => showPage('logs'));
els.copyResultSummary.addEventListener('click', () => copyText(state.lastResultSummary).then(() => {
  setStatus('Riepilogo copiato', 'ok');
  showToast('Riepilogo copiato', 'ok');
}).catch((error) => setStatus(error.message, 'error')));
els.newOperation.addEventListener('click', () => {
  clearOrders();
  els.resultPanel.hidden = true;
});
els.logSearch.addEventListener('input', () => {
  state.logQuery = els.logSearch.value.trim();
  renderLogs();
});
els.logFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.logFilter = button.dataset.logFilter;
    els.logFilterButtons.forEach((item) => item.classList.toggle('active', item === button));
    renderLogs();
  });
});
els.logsList.addEventListener('click', (event) => {
  const backupButton = event.target.closest('[data-backup]');
  if (backupButton) {
    downloadBackup(backupButton.dataset.backup).catch((error) => setStatus(error.message, 'error'));
    return;
  }

  const copyButton = event.target.closest('[data-copy-log]');
  if (copyButton) {
    const entry = state.logs.find((item) => String(item.id || '') === copyButton.dataset.copyLog);
    if (entry) copyText(logSummary(entry)).then(() => {
      setStatus('Log copiato', 'ok');
      showToast('Log copiato', 'ok');
    }).catch((error) => setStatus(error.message, 'error'));
  }
});
els.orderSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runWithBusy(els.searchOrders, 'Cerco...', searchOrders).catch((error) => setStatus(error.message, 'error'));
});
els.orderFeedLimit.addEventListener('change', () => runWithBusy(els.searchOrders, 'Aggiorno...', searchOrders).catch((error) => setStatus(error.message, 'error')));
els.orderStateQuick.addEventListener('change', () => runWithBusy(els.searchOrders, 'Aggiorno...', searchOrders).catch((error) => setStatus(error.message, 'error')));
els.orderDateFromQuick.addEventListener('change', () => runWithBusy(els.searchOrders, 'Aggiorno...', searchOrders).catch((error) => setStatus(error.message, 'error')));
els.orderDateToQuick.addEventListener('change', () => runWithBusy(els.searchOrders, 'Aggiorno...', searchOrders).catch((error) => setStatus(error.message, 'error')));
els.resetOrderFilters.addEventListener('click', resetOrderFilters);
els.productSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runWithBusy(els.searchProducts, 'Cerco...', () => searchProducts()).catch((error) => setStatus(error.message, 'error'));
});
els.productSearch.addEventListener('input', scheduleProductTemplateSuggestions);

updateReplaceState();
loadSettings().catch((error) => setStatus(error.message, 'error'));
