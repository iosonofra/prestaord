import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileClock,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  LogOut,
  PackageSearch,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import './styles.css';
import { buildSuccessSummary } from './success-summary.js';
import { getReplacementGate } from './replacement-gate.js';
import { formatSelectedOrders, getOrderSelectionStatus } from './order-selection-status.js';
import { getOrderSyncPresentation } from './order-sync-presentation.js';
import { filterEnabledOrderStates } from './enabled-order-states.js';
import { getCanonicalSelectionState } from './canonical-selection.js';
import {
  getInitialOrderFilters,
  initialFilters,
  resetOrderSearch,
} from './order-search-filters.js';

export { getInitialOrderFilters, initialFilters, resetOrderSearch };

const emptySettings = {
  baseUrl: '',
  apiKeyConfigured: false,
  apiKeyHint: '',
  orderStates: [],
  defaultOrderState: '',
  orderDateFrom: '',
  orderDateTo: '',
  orderLimit: '20',
  cacheAutoSync: false,
  cacheHourlySync: false,
  cacheBatchSize: '50',
  cacheMaxOrders: '100',
  productTemplateLimit: '8',
  requirePreflightCheck: true,
  requireConfirmCheck: true,
  appPasswordEnabled: false,
};

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function money(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function shortDate(value) {
  if (!value) return '-';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function useSessionApi() {
  const [token, setToken] = useState(() => localStorage.getItem('appSessionToken') || '');

  async function request(path, options = {}) {
    const { sessionToken, ...fetchOptions } = options;
    const activeToken = sessionToken === undefined ? token : sessionToken;
    const response = await fetch(path, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(activeToken ? { 'X-App-Session': activeToken } : {}),
        ...(fetchOptions.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Operazione non riuscita.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function saveToken(nextToken) {
    if (nextToken) localStorage.setItem('appSessionToken', nextToken);
    else localStorage.removeItem('appSessionToken');
    setToken(nextToken);
  }

  return { request, token, saveToken };
}

function IconButton({ children, icon: Icon, busy, variant = 'default', ...props }) {
  return (
    <button className={cx('btn', `btn-${variant}`)} disabled={busy || props.disabled} aria-busy={busy || undefined} {...props}>
      {busy
        ? <Loader2 className="icon spin" aria-hidden="true" />
        : Icon ? <Icon className="icon" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

function Badge({ children, tone = 'neutral', ...props }) {
  return <span className={cx('badge', `badge-${tone}`)} {...props}>{children}</span>;
}

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function useDialogFocusTrap(dialogRef, initialFocusRef) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previouslyFocused = document.activeElement;
    const focusableElements = () => [...dialog.querySelectorAll(focusableSelector)]
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    const focusFirst = () => {
      const target = initialFocusRef?.current || focusableElements()[0] || dialog;
      target.focus();
    };

    focusFirst();

    function handleKeyDown(event) {
      if (event.key !== 'Tab') return;
      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focusIsOutside = !dialog.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || focusIsOutside)) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleFocusIn(event) {
      if (!dialog.contains(event.target)) focusFirst();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [dialogRef, initialFocusRef]);
}

export function SuccessDialog({ result, onViewLogs, onNewOperation }) {
  const summary = buildSuccessSummary(result);
  const { requestedCount, successfulRows, failedRows, product } = summary;
  const hasErrors = failedRows.length > 0;
  const hasSuccesses = successfulRows.length > 0;
  const dialogRef = useRef(null);
  useDialogFocusTrap(dialogRef);

  return (
    <div className="modalBackdrop">
      <section
        ref={dialogRef}
        className="modal successModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="successTitle"
        aria-describedby="successDescription"
        tabIndex={-1}
      >
        <div className="modalTitle">
          {hasErrors
            ? <AlertTriangle className="titleIcon" aria-hidden="true" />
            : <ShieldCheck className="titleIcon" aria-hidden="true" />}
          <div>
            <h2 id="successTitle">
              {hasSuccesses
                ? hasErrors ? 'Completata con errori' : 'Sostituzione completata'
                : 'Nessuna riga modificata'}
            </h2>
            <p id="successDescription">
              {successfulRows.length} di {requestedCount}{' '}
              {requestedCount === 1 ? 'riga modificata' : 'righe modificate'} con{' '}
              <strong>{product.id} {product.name}</strong>
            </p>
          </div>
        </div>
        {hasSuccesses && (
          <section className="successGroup" aria-labelledby="updatedRowsTitle">
            <h3 id="updatedRowsTitle">
              Righe modificate <Badge tone="ok">{successfulRows.length}</Badge>
            </h3>
            <div className="successList" role="list">
              {successfulRows.map((row) => (
                <div key={row.id} className="successRow" role="listitem">
                  <Badge tone="ok">
                    {row.orderId ? `Ordine ${row.orderId}` : `Riga ${row.id}`}
                  </Badge>
                  <div className="successRowBody">
                    <span>{row.oldProductName}</span>
                    <span className="successRowFlow">
                      <ChevronRight className="icon" aria-hidden="true" />
                      <strong>{row.newProductId} {row.newProductName}</strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {hasErrors && (
          <section className="successGroup successGroupError" aria-labelledby="failedRowsTitle">
            <h3 id="failedRowsTitle">
              Non modificate <Badge tone="error">{failedRows.length}</Badge>
            </h3>
            <div className="successList" role="list">
              {failedRows.map((row) => (
                <div key={row.id} className="successRow successRowError" role="listitem">
                  <Badge tone="error">
                    {row.orderId ? `Ordine ${row.orderId}` : `Riga ${row.id}`}
                  </Badge>
                  <div className="successRowBody">
                    <span>{row.productName}</span>
                    <strong>{row.message}</strong>
                  </div>
                </div>
              ))}
            </div>
            <p className="successErrorHint" role="alert">
              Controlla il registro attività per i dettagli tecnici.
            </p>
          </section>
        )}
        <div className="modalActions" style={{ gap: 8, justifyContent: 'space-between' }}>
          <IconButton icon={FileClock} variant="ghost" onClick={onViewLogs}>
            Vedi registro attività
          </IconButton>
          <IconButton icon={RotateCcw} variant="primary" onClick={onNewOperation}>
            Nuova operazione
          </IconButton>
        </div>
      </section>
    </div>
  );
}
function UnlockDialog({ request, onUnlocked, onStatus }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);

  useDialogFocusTrap(dialogRef, inputRef);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      onUnlocked(data.token);
      onStatus('App sbloccata', 'ok');
    } catch (err) {
      setError(err.message);
      inputRef.current?.select();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalBackdrop">
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlockTitle"
        aria-describedby="unlockDescription"
        tabIndex={-1}
      >
        <form onSubmit={submit}>
          <div className="modalTitle">
            <KeyRound className="titleIcon" />
            <div>
              <h2 id="unlockTitle">Sblocco app</h2>
              <p id="unlockDescription">Inserisci la password locale per accedere ai dati PrestaShop.</p>
            </div>
          </div>
          <Field label="Password locale">
            <input
              ref={inputRef}
              id="unlockPassword"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'unlockError' : 'unlockDescription'}
            />
          </Field>
          {error ? <div id="unlockError" className="alert alert-error" role="alert">{error}</div> : null}
          <div className="modalActions">
            <IconButton type="submit" icon={ShieldCheck} busy={busy} variant="primary">Sblocca</IconButton>
          </div>
        </form>
      </section>
    </div>
  );
}

function App() {
  const { request, saveToken } = useSessionApi();
  const [page, setPage] = useState('orders');
  const [locked, setLocked] = useState(false);
  const [settings, setSettings] = useState(emptySettings);
  const [orderStates, setOrderStates] = useState([]);
  const [cacheStatus, setCacheStatus] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [orders, setOrders] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState(new Map());
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateStatus, setTemplateStatus] = useState(null);
  const [templateItems, setTemplateItems] = useState([]);
  const [templateItemsQuery, setTemplateItemsQuery] = useState('');
  const [templateItemsPage, setTemplateItemsPage] = useState(1);
  const [templateItemsPagination, setTemplateItemsPagination] = useState({
    page: 1,
    pageSize: 25,
    totalItems: 0,
    totalPages: 1,
    hasPrevious: false,
    hasNext: false,
  });
  const [templateItemsError, setTemplateItemsError] = useState('');
  const [canonicalGroups, setCanonicalGroups] = useState([]);
  const [canonicalGroupsError, setCanonicalGroupsError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [preview, setPreview] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('all');
  const [logQuery, setLogQuery] = useState('');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [logPagination, setLogPagination] = useState({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
    totalAll: 0,
    hasPrevious: false,
    hasNext: false,
  });
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState('');
  const [status, setStatusState] = useState({ text: 'Pronto', tone: 'neutral' });
  const [logsError, setLogsError] = useState('');
  const [successResult, setSuccessResult] = useState(null);
  const orderSearchSequence = useRef(0);

  const selectedRowObjects = useMemo(() => {
    return [...selectedOrders.values()]
      .flatMap((order) => (order.rows || []).map((row) => ({ ...row, order })))
      .filter((row) => selectedRows.has(String(row.id)));
  }, [selectedOrders, selectedRows]);

  const enabledOrderStates = useMemo(
    () => filterEnabledOrderStates(orderStates, settings.orderStates),
    [orderStates, settings.orderStates],
  );

  const operationSignature = useMemo(() => {
    if (!selectedProduct || selectedRows.size === 0) return '';
    return JSON.stringify({
      productId: String(selectedProduct.id),
      rowIds: [...selectedRows].map(String).sort(),
    });
  }, [selectedProduct, selectedRows]);

  const {
    simulationOk,
    verificationRequired,
    readyToConfirm,
    needsTypedConfirm,
    canConfirm,
  } = getReplacementGate({
    preview,
    simulation,
    operationSignature,
    requirePreflightCheck: settings.requirePreflightCheck,
    requireConfirmCheck: settings.requireConfirmCheck,
    confirmChecked,
    confirmText,
    selectedRowCount: selectedRows.size,
  });

  function setStatus(text, tone = 'neutral') {
    setStatusState({ text, tone });
  }

  function invalidateSafety() {
    setPreview(null);
    setSimulation(null);
    setConfirmChecked(false);
    setConfirmText('');
  }

  async function run(key, action) {
    setBusy(key);
    try {
      return await action();
    } catch (err) {
      if (err.status === 401) {
        saveToken('');
        setLocked(true);
      }
      setStatus(err.message, 'error');
      throw err;
    } finally {
      setBusy('');
    }
  }

  async function bootstrap(sessionToken) {
    try {
      const auth = await request('/api/auth/status', { sessionToken });
      let activeToken = sessionToken;

      if (!auth.authenticated && auth.passwordRequired) {
        saveToken('');
        setLocked(true);
        return;
      }

      if (!auth.authenticated) {
        const login = await request('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ password: '' }),
          sessionToken: '',
        });
        activeToken = login.token;
        saveToken(login.token);
      }

      const data = await request('/api/settings', { sessionToken: activeToken });
      setLocked(false);
      const nextSettings = { ...emptySettings, ...(data.settings || {}) };
      setSettings(nextSettings);
      const nextFilters = getInitialOrderFilters(nextSettings);
      setFilters(nextFilters);
      setStatus(data.configured ? 'Connessione configurata' : 'Configura la connessione', data.configured ? 'ok' : 'neutral');
      await Promise.allSettled([
        loadCacheStatus(activeToken),
        loadOrderStates(activeToken),
        loadTemplateStatus(activeToken),
        loadCanonicalGroups(activeToken),
      ]);
      await searchOrders(nextFilters, activeToken);
    } catch (err) {
      if (err.status === 401) {
        saveToken('');
        setLocked(true);
      }
      setStatus(err.message, 'error');
    }
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const activeSync = cacheStatus?.activeSync;
    if (!activeSync?.id || activeSync.status !== 'running') return undefined;

    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const data = await request(`/api/order-cache/sync/${encodeURIComponent(activeSync.id)}`);
        if (cancelled) return;
        if (data.job?.status === 'running') {
          setCacheStatus((current) => ({ ...(current || {}), activeSync: data.job }));
          return;
        }

        const nextStatus = await request('/api/order-cache/status');
        if (cancelled) return;
        setCacheStatus(nextStatus);
        setStatus(
          data.job?.status === 'done'
            ? data.job.incremental
              ? `Ordini aggiornati: ${data.job.newCount || 0} nuovi · ${data.job.refreshedCount || 0} verificati`
              : `Sincronizzazione completa: ${nextStatus.count || 0} ordini`
            : data.job?.error || 'Sincronizzazione ordini non riuscita',
          data.job?.status === 'done' ? 'ok' : 'error',
        );
        if (data.job?.status === 'done') await searchOrders(filters);
      } catch (err) {
        if (!cancelled) {
          setCacheStatus((current) => ({
            ...(current || {}),
            activeSync: { ...(current?.activeSync || {}), status: 'error', error: err.message },
          }));
          setStatus(err.message, 'error');
        }
      }
    }, 1200);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Poll only when the active job identity or state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheStatus?.activeSync?.id, cacheStatus?.activeSync?.status]);

  async function loadOrderStates(sessionToken) {
    try {
      const data = await request('/api/order-states', { sessionToken });
      setOrderStates(data.states || []);
    } catch (err) {
      if (err.status === 401) throw err;
      setOrderStates([]);
    }
  }

  async function loadCacheStatus(sessionToken) {
    const data = await request('/api/order-cache/status', { sessionToken });
    setCacheStatus(data);
    return data;
  }

  async function loadTemplateStatus(sessionToken) {
    const data = await request('/api/product-templates/status', { sessionToken });
    setTemplateStatus(data.status || null);
    return data.status;
  }

  async function loadCanonicalGroups(sessionToken) {
    setCanonicalGroupsError('');
    try {
      const data = await request('/api/product-canonical-groups', { sessionToken });
      setCanonicalGroups(data.groups || []);
      return data.groups || [];
    } catch (error) {
      setCanonicalGroupsError(error.message);
      throw error;
    }
  }

  async function suggestCatalogProducts(query) {
    const term = String(query || '').trim();
    if (term.length < 2) return [];
    const data = await request(
      `/api/product-templates?q=${encodeURIComponent(term)}&limit=10`,
    );
    const suggestions = (data.products || []).map((product) => ({
      ...product,
      source: 'catalog',
    }));
    const hasExactCatalogMatch = suggestions.some((product) => String(product.id) === term);

    if (/^\d+$/.test(term) && !hasExactCatalogMatch) {
      try {
        const prestashopData = await request(`/api/products?q=${encodeURIComponent(term)}`);
        const exactProduct = (prestashopData.products || [])
          .find((product) => String(product.id) === term);
        if (exactProduct) {
          suggestions.unshift({
            id: exactProduct.id,
            label: exactProduct.name,
            source: 'prestashop',
          });
        }
      } catch {
        // Keep the catalog suggestions and allow direct ID entry while PrestaShop is unavailable.
      }
    }

    return suggestions;
  }

  async function importProductTemplates(file) {
    return run('templates-import', async () => {
      const content = await file.text();
      const data = await request('/api/product-templates/import', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          content,
        }),
      });
      setTemplateStatus(data.status || null);
      setTemplates([]);
      setStatus(`${data.status?.importedCount || 0} risultati rapidi importati`, 'ok');
      return data.status;
    });
  }

  async function loadTemplateItems(overrides = {}) {
    const query = overrides.query ?? templateItemsQuery;
    const pageNumber = overrides.page ?? templateItemsPage;
    setTemplateItemsError('');
    try {
      const params = new URLSearchParams({
        q: query,
        page: String(pageNumber),
        pageSize: '25',
      });
      const data = await request(`/api/product-templates/items?${params.toString()}`);
      setTemplateItems(data.items || []);
      setTemplateItemsPagination(data.pagination || {});
      setTemplateItemsPage(data.pagination?.page || 1);
      if (data.status) setTemplateStatus(data.status);
      return data;
    } catch (error) {
      setTemplateItemsError(error.message);
      throw error;
    }
  }

  async function saveTemplateItem(item) {
    return run('template-item-save', async () => {
      const editing = item.mode === 'edit';
      const data = await request(
        editing
          ? `/api/product-templates/items/${encodeURIComponent(item.originalId)}`
          : '/api/product-templates/items',
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify({ id: item.id, name: item.name }),
        },
      );
      if (data.status) setTemplateStatus(data.status);
      await loadTemplateItems({ page: editing ? templateItemsPage : 1 });
      setStatus(editing ? 'Risultato rapido aggiornato' : 'Risultato rapido aggiunto', 'ok');
      return data;
    });
  }

  async function deleteTemplateItem(item) {
    return run('template-item-delete', async () => {
      const data = await request(`/api/product-templates/items/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      if (data.status) setTemplateStatus(data.status);
      await loadTemplateItems({ page: templateItemsPage });
      setStatus('Risultato rapido eliminato', 'ok');
      return data;
    });
  }

  async function saveCanonicalGroup(group) {
    return run('canonical-group-save', async () => {
      const editing = group.mode === 'edit';
      const data = await request(
        editing
          ? `/api/product-canonical-groups/${encodeURIComponent(group.id)}`
          : '/api/product-canonical-groups',
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify({
            name: group.name,
            motherProductId: group.motherProductId,
            linkedProductIds: group.linkedProductIds,
          }),
        },
      );
      setCanonicalGroups(data.groups || []);
      setCanonicalGroupsError('');
      setStatus(editing ? 'Gruppo di prodotti aggiornato' : 'Gruppo di prodotti creato', 'ok');
      return data;
    });
  }

  async function deleteCanonicalGroup(group) {
    return run('canonical-group-delete', async () => {
      const data = await request(`/api/product-canonical-groups/${encodeURIComponent(group.id)}`, {
        method: 'DELETE',
      });
      setCanonicalGroups(data.groups || []);
      setCanonicalGroupsError('');
      setStatus('Gruppo di prodotti eliminato', 'ok');
      return data;
    });
  }

  async function syncCache() {
    return run('cache', async () => {
      const data = await request('/api/order-cache/sync', { method: 'POST', body: '{}' });
      setStatus(
        data.job?.incremental
          ? 'Aggiornamento incrementale degli ordini avviato'
          : 'Prima sincronizzazione completa avviata',
        'ok',
      );
      setCacheStatus((current) => ({ ...(current || {}), activeSync: data.job }));
    });
  }

  async function searchOrders(nextFilters = filters, sessionToken) {
    const searchSequence = orderSearchSequence.current + 1;
    orderSearchSequence.current = searchSequence;
    await run('orders', async () => {
      setStatus(nextFilters.q ? 'Cerco in ordini sincronizzati e PrestaShop...' : 'Carico ultimi ordini...');
      const params = new URLSearchParams({
        q: nextFilters.q,
        source: 'auto',
        limit: nextFilters.limit,
      });
      if (nextFilters.orderState) params.set('orderState', nextFilters.orderState);
      if (nextFilters.dateFrom) params.set('dateFrom', nextFilters.dateFrom);
      if (nextFilters.dateTo) params.set('dateTo', nextFilters.dateTo);
      const data = await request(`/api/orders?${params.toString()}`, { sessionToken });
      if (searchSequence !== orderSearchSequence.current) return;
      setOrders(data.orders || []);
      const sourceLabel = data.source === 'hybrid'
        ? ' · cache + PrestaShop'
        : data.source === 'live'
          ? ' · PrestaShop'
          : data.fallback
            ? ' · cache (PrestaShop non raggiungibile)'
            : '';
      setStatus(
        data.orders?.length ? `${data.orders.length} ordini caricati${sourceLabel}` : 'Nessun ordine trovato',
        data.fallback ? 'warning' : data.orders?.length ? 'ok' : 'neutral',
      );
    });
  }

  async function toggleOrder(order, checked) {
    if (!checked) {
      const nextOrders = new Map(selectedOrders);
      const removed = nextOrders.get(String(order.id));
      nextOrders.delete(String(order.id));
      const nextRows = new Set(selectedRows);
      for (const row of removed?.rows || []) nextRows.delete(String(row.id));
      setSelectedOrders(nextOrders);
      setSelectedRows(nextRows);
      const nextStatus = getOrderSelectionStatus(nextOrders.size);
      setStatus(nextStatus.text, nextStatus.tone);
      invalidateSafety();
      return;
    }

    await run(`order-${order.id}`, async () => {
      setStatus('Carico righe ordine...');
      const data = await request(`/api/orders/${encodeURIComponent(order.id)}`);
      const next = new Map(selectedOrders);
      next.set(String(data.order.id), data.order);
      setSelectedOrders(next);
      const nextStatus = getOrderSelectionStatus(next.size);
      setStatus(nextStatus.text, nextStatus.tone);
      invalidateSafety();
    });
  }

  function toggleRow(rowId, checked) {
    const next = new Set(selectedRows);
    if (checked) next.add(String(rowId));
    else next.delete(String(rowId));
    setSelectedRows(next);
    invalidateSafety();
  }

  function selectSameProduct() {
    const first = selectedRowObjects[0];
    if (!first) return;
    const next = new Set();
    for (const order of selectedOrders.values()) {
      for (const row of order.rows || []) {
        if ((first.productId && row.productId === first.productId) || (first.productReference && row.productReference === first.productReference)) {
          next.add(String(row.id));
        }
      }
    }
    setSelectedRows(next);
    invalidateSafety();
  }

  async function loadTemplates(query) {
    setProductQuery(query);
    setSelectedProduct(null);
    invalidateSafety();
    if (query.trim().length < 2) {
      setTemplates([]);
      return;
    }
    const data = await request(`/api/product-templates?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(settings.productTemplateLimit || '8')}`).catch(() => ({ products: [] }));
    setTemplates(data.products || []);
  }

  async function searchProducts(query = productQuery) {
    await run('products', async () => {
      setStatus('Ricerca prodotti...');
      const data = await request(`/api/products?q=${encodeURIComponent(query.trim())}`);
      setProducts(data.products || []);
      setStatus(data.products?.length ? `${data.products.length} prodotti trovati` : 'Nessun prodotto trovato', data.products?.length ? 'ok' : 'neutral');
    });
  }

  function chooseProduct(product) {
    setSelectedProduct(product);
    setStatus(`Prodotto selezionato: ${product.name}`, 'ok');
    invalidateSafety();
  }

  async function chooseTemplate(item) {
    setProductQuery(item.id);
    setTemplates([]);
    await run('products', async () => {
      setStatus('Caricamento prodotto reale...');
      const data = await request(`/api/products?q=${encodeURIComponent(item.id)}`);
      const matchedProducts = data.products || [];
      setProducts(matchedProducts);
      const exactMatch = matchedProducts.find(p => String(p.id) === String(item.id));
      if (exactMatch) {
        setSelectedProduct(exactMatch);
        setStatus(`Prodotto selezionato: ${exactMatch.name}`, 'ok');
      } else if (matchedProducts.length === 1) {
        setSelectedProduct(matchedProducts[0]);
        setStatus(`Prodotto selezionato: ${matchedProducts[0].name}`, 'ok');
      } else {
        setStatus('Prodotto non trovato su PrestaShop', 'error');
      }
      invalidateSafety();
    });
  }

  async function preparePreview() {
    if (!selectedProduct) throw new Error('Seleziona il prodotto destinazione.');
    if (!selectedRows.size) throw new Error('Seleziona almeno una riga ordine.');
    await run('preview', async () => {
      setStatus('Preparo revisione...');
      const data = await request('/api/order-details/preview-replace-product', {
        method: 'POST',
        body: JSON.stringify({ orderDetailIds: [...selectedRows], productId: selectedProduct.id }),
      });
      setPreview({ signature: operationSignature, data });
      setStatus('Revisione pronta', 'ok');
    });
  }

  async function simulate() {
    if (!preview || preview.signature !== operationSignature) await preparePreview();
    await run('simulate', async () => {
      setStatus('Verifica in corso...');
      const data = await request('/api/order-details/replace-product', {
        method: 'POST',
        body: JSON.stringify({ orderDetailIds: [...selectedRows], productId: selectedProduct.id, simulate: true }),
      });
      setSimulation({ signature: operationSignature, data });
      setStatus(data.errors?.length ? 'Verifica con errori' : 'Verifica completata', data.errors?.length ? 'error' : 'ok');
    });
  }

  async function confirmReplacement() {
    if (!canConfirm) return;
    await run('confirm', async () => {
      setStatus('Aggiornamento in corso...');
      const data = await request('/api/order-details/replace-product', {
        method: 'POST',
        body: JSON.stringify({ orderDetailIds: [...selectedRows], productId: selectedProduct.id, simulate: false }),
      });
      setSuccessResult({
        data,
        requestedRows: [...selectedRowObjects],
        product: selectedProduct,
        resetApplied: !data.errors?.length && Boolean(data.updated?.length),
      });
      if (!data.errors?.length && data.updated?.length) {
        await resetCompletedWorkflow();
      }
      setStatus(data.errors?.length ? 'Operazione completata con errori' : 'Sostituzione completata', data.errors?.length ? 'error' : 'ok');
      await loadLogs();
    });
  }

  function clearOperation() {
    setSelectedOrders(new Map());
    setSelectedRows(new Set());
    setSelectedProduct(null);
    setProductQuery('');
    setProducts([]);
    setTemplates([]);
    invalidateSafety();
  }

  async function resetCompletedWorkflow({ reloadOrders = true } = {}) {
    clearOperation();
    setPage('orders');
    const nextFilters = getInitialOrderFilters(settings);
    setFilters(nextFilters);
    setOrders([]);
    if (reloadOrders) {
      await searchOrders(nextFilters).catch(() => {});
    }
  }

  async function startNewOperation() {
    const alreadyReset = Boolean(successResult?.resetApplied);
    setSuccessResult(null);
    if (alreadyReset) {
      setPage('orders');
      return;
    }
    await resetCompletedWorkflow();
  }

  async function viewLogsAfterOperation() {
    const alreadyReset = Boolean(successResult?.resetApplied);
    setSuccessResult(null);
    if (!alreadyReset) await resetCompletedWorkflow();
    setPage('logs');
  }

  async function loadLogs(overrides = {}) {
    setLogsError('');
    const nextFilters = {
      type: overrides.type ?? logFilter,
      q: overrides.q ?? logQuery,
      dateFrom: overrides.dateFrom ?? logDateFrom,
      dateTo: overrides.dateTo ?? logDateTo,
      page: overrides.page ?? logPage,
    };
    try {
      const params = new URLSearchParams({
        type: nextFilters.type,
        q: nextFilters.q,
        dateFrom: nextFilters.dateFrom,
        dateTo: nextFilters.dateTo,
        page: String(nextFilters.page),
        pageSize: '20',
      });
      const data = await request(`/api/logs?${params.toString()}`);
      setLogs(data.logs || []);
      setLogPagination(data.pagination || {});
      setLogPage(data.pagination?.page || 1);
    } catch (err) {
      if (err.status === 401) {
        saveToken('');
        setLocked(true);
      }
      setLogsError(err.message);
    }
  }

  async function logout() {
    try {
      await request('/api/auth/logout', { method: 'POST', body: '{}' });
    } finally {
      saveToken('');
      clearOperation();
      setLocked(true);
      setStatus('Sessione chiusa', 'neutral');
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    await run('settings', async () => {
      const data = new FormData(event.currentTarget);
      const orderStatesValues = data.getAll('orderStates').map(String);
      const result = await request('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
          baseUrl: data.get('baseUrl'),
          apiKey: data.get('apiKey'),
          orderStates: orderStatesValues,
          defaultOrderState: data.get('defaultOrderState'),
          orderDateFrom: data.get('orderDateFrom'),
          orderDateTo: data.get('orderDateTo'),
          orderLimit: data.get('orderLimit'),
          cacheAutoSync: data.get('cacheAutoSync') === 'on',
          cacheHourlySync: data.get('cacheHourlySync') === 'on',
          cacheBatchSize: data.get('cacheBatchSize'),
          cacheMaxOrders: data.get('cacheMaxOrders'),
          productTemplateLimit: data.get('productTemplateLimit'),
          requirePreflightCheck: data.get('requirePreflightCheck') === 'on',
          requireConfirmCheck: data.get('requireConfirmCheck') === 'on',
          appPassword: data.get('appPassword'),
          removeAppPassword: data.get('removeAppPassword') === 'on',
        }),
      });
      setStatus('Impostazioni salvate', 'ok');
      if (result.reauthRequired) saveToken('');
      await bootstrap(result.reauthRequired ? '' : undefined);
    });
  }

  if (locked) {
    return <UnlockDialog request={request} onUnlocked={(token) => { saveToken(token); setLocked(false); bootstrap(token); }} onStatus={setStatus} />;
  }

  const orderSync = getOrderSyncPresentation(cacheStatus || {});

  if (successResult) {
    return (
      <>
        <div className="appShell opacity-30 pointer-events-none" aria-hidden="true" inert="">
          <aside className="sidebar">
            <div className="brand">
              <span className="brandMark">PS</span>
              <div>
                <strong>Order Console</strong>
                <small>Sostituzione prodotti</small>
              </div>
            </div>
            <nav className="nav" aria-label="Sezioni">
              <button
                aria-label="Ordini"
                aria-current={page === 'orders' ? 'page' : undefined}
                title="Ordini"
                className={cx(page === 'orders' && 'active')}
                onClick={() => setPage('orders')}
              >
                <ShoppingCart className="icon" aria-hidden="true" />
                <span className="navLabel">Ordini</span>
              </button>
            </nav>
          </aside>
          <main className="main" />
        </div>
        <SuccessDialog
          result={successResult}
          onViewLogs={viewLogsAfterOperation}
          onNewOperation={startNewOperation}
        />
      </>
    );
  }

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark">PS</span>
          <div>
            <strong>Order Console</strong>
            <small>Sostituzione prodotti</small>
          </div>
        </div>
        <nav className="nav" aria-label="Sezioni">
          <button
            aria-label="Ordini"
            aria-current={page === 'orders' ? 'page' : undefined}
            title="Ordini"
            className={cx(page === 'orders' && 'active')}
            onClick={() => setPage('orders')}
          >
            <ShoppingCart className="icon" aria-hidden="true" />
            <span className="navLabel">Ordini</span>
          </button>
          <button
            aria-label="Impostazioni"
            aria-current={page === 'settings' ? 'page' : undefined}
            title="Impostazioni"
            className={cx(page === 'settings' && 'active')}
            onClick={() => setPage('settings')}
          >
            <Settings className="icon" aria-hidden="true" />
            <span className="navLabel">Impostazioni</span>
          </button>
          <button
            aria-label="Risultati rapidi"
            aria-current={page === 'templates' ? 'page' : undefined}
            title="Risultati rapidi"
            className={cx(page === 'templates' && 'active')}
            onClick={() => {
              setPage('templates');
              loadTemplateItems({ page: 1 }).catch((error) => setStatus(error.message, 'error'));
              loadCanonicalGroups().catch((error) => setStatus(error.message, 'error'));
            }}
          >
            <PackageSearch className="icon" aria-hidden="true" />
            <span className="navLabel">Rapidi</span>
          </button>
          <button
            aria-label="Registro attività"
            aria-current={page === 'logs' ? 'page' : undefined}
            title="Registro attività"
            className={cx(page === 'logs' && 'active')}
            onClick={() => { setPage('logs'); loadLogs().catch((err) => setStatus(err.message, 'error')); }}
          >
            <FileClock className="icon" aria-hidden="true" />
            <span className="navLabel">Log</span>
          </button>
        </nav>
        <CacheStatusCard
          cacheStatus={cacheStatus}
          starting={busy === 'cache'}
          onSync={syncCache}
        />
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>
              {page === 'orders'
                ? 'Sostituzioni ordini'
                : page === 'settings'
                  ? 'Impostazioni operative'
                  : page === 'templates'
                    ? 'Risultati rapidi prodotti'
                    : 'Log'}
            </h1>
            <p>
              {page === 'orders'
                ? selectedOrders.size
                  ? `${formatSelectedOrders(selectedOrders.size)} · ${selectedRows.size} righe pronte`
                  : 'Filtra gli ordini, scegli le righe e indica il prodotto sostitutivo.'
                : page === 'templates'
                  ? `${templateStatus?.count || 0} prodotti rapidi · ${canonicalGroups.length} gruppi di prodotti.`
                  : page === 'settings'
                    ? 'Configura connessione, sincronizzazione, risultati rapidi e sicurezza.'
                    : 'Consulta lo storico permanente delle operazioni.'}
            </p>
          </div>
          <div className="statusCluster">
            <Badge
              tone={orderSync.running ? 'accent' : cacheStatus?.count ? 'ok' : 'warning'}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {orderSync.badge}
            </Badge>
            <Badge tone={selectedRows.size ? 'accent' : 'neutral'}>{selectedRows.size} righe</Badge>
            <div className={cx('status', `status-${status.tone}`)} role="status" aria-live="polite">{status.text}</div>
            {settings.appPasswordEnabled ? (
              <IconButton icon={LogOut} variant="ghost" onClick={logout}>Esci</IconButton>
            ) : null}
          </div>
        </header>

        {page === 'orders' ? (
          <OrdersWorkbench
            filters={filters}
            setFilters={setFilters}
            orderStates={enabledOrderStates}
            orders={orders}
            selectedOrders={selectedOrders}
            selectedRows={selectedRows}
            selectedRowObjects={selectedRowObjects}
            canonicalGroups={canonicalGroups}
            selectedProduct={selectedProduct}
            productQuery={productQuery}
            products={products}
            templates={templates}
            preview={preview}
            simulationOk={simulationOk}
            readyToConfirm={readyToConfirm}
            verificationRequired={verificationRequired}
            needsTypedConfirm={needsTypedConfirm}
            settings={settings}
            confirmChecked={confirmChecked}
            confirmText={confirmText}
            canConfirm={canConfirm}
            busy={busy}
            onFilterChange={setFilters}
            onSearchOrders={searchOrders}
            onToggleOrder={toggleOrder}
            onToggleRow={toggleRow}
            onSelectSame={selectSameProduct}
            onProductQuery={loadTemplates}
            onSearchProducts={searchProducts}
            onChooseProduct={chooseProduct}
            onPreview={preparePreview}
            onSimulate={simulate}
            onConfirm={confirmReplacement}
            onConfirmChecked={setConfirmChecked}
            onConfirmText={setConfirmText}
            onClear={clearOperation}
            onNavigate={setPage}
            onChooseTemplate={chooseTemplate}
            onChooseCanonical={(canonicalization) => chooseTemplate({
              id: canonicalization.motherProductId,
              label: canonicalization.motherProductName || canonicalization.groupName,
            })}
          />
        ) : null}

        {page === 'settings' ? (
          <SettingsPage
            settings={settings}
            orderStates={orderStates}
            busy={busy}
            templateStatus={templateStatus}
            onSave={saveSettings}
            onLoadStates={() => run('states', loadOrderStates)}
            onSyncCache={syncCache}
            onImportTemplates={importProductTemplates}
            onLoadIntegrationTokens={() => request('/api/integration-tokens')}
            onCreateIntegrationToken={(label) => request('/api/integration-tokens', {
              method: 'POST',
              body: JSON.stringify({ label }),
            })}
            onDeleteIntegrationToken={(id) => request(`/api/integration-tokens/${encodeURIComponent(id)}`, {
              method: 'DELETE',
            })}
          />
        ) : null}

        {page === 'logs' ? (
          <LogsPage
            logs={logs}
            logFilter={logFilter}
            logQuery={logQuery}
            logDateFrom={logDateFrom}
            logDateTo={logDateTo}
            pagination={logPagination}
            setLogQuery={setLogQuery}
            setLogDateFrom={setLogDateFrom}
            setLogDateTo={setLogDateTo}
            onFilterChange={(value) => {
              setLogFilter(value);
              setLogPage(1);
              run('logs', () => loadLogs({ type: value, page: 1 }));
            }}
            onSearch={() => {
              setLogPage(1);
              return run('logs', () => loadLogs({ page: 1 }));
            }}
            onClear={() => {
              setLogFilter('all');
              setLogQuery('');
              setLogDateFrom('');
              setLogDateTo('');
              setLogPage(1);
              return run('logs', () => loadLogs({
                type: 'all',
                q: '',
                dateFrom: '',
                dateTo: '',
                page: 1,
              }));
            }}
            onPageChange={(nextPage) => run('logs', () => loadLogs({ page: nextPage }))}
            onRefresh={() => run('logs', loadLogs)}
            busy={busy}
            error={logsError}
            hasAnyLogs={logPagination.totalAll > 0}
          />
        ) : null}

        {page === 'templates' ? (
          <ProductTemplatesPage
            items={templateItems}
            query={templateItemsQuery}
            setQuery={setTemplateItemsQuery}
            pagination={templateItemsPagination}
            status={templateStatus}
            busy={busy}
            error={templateItemsError}
            canonicalGroups={canonicalGroups}
            canonicalError={canonicalGroupsError}
            onSearch={() => {
              setTemplateItemsPage(1);
              return run('template-items', () => loadTemplateItems({ page: 1 }));
            }}
            onClear={() => {
              setTemplateItemsQuery('');
              setTemplateItemsPage(1);
              return run('template-items', () => loadTemplateItems({ query: '', page: 1 }));
            }}
            onPageChange={(nextPage) => run('template-items', () => loadTemplateItems({ page: nextPage }))}
            onSave={saveTemplateItem}
            onDelete={deleteTemplateItem}
            onSaveCanonicalGroup={saveCanonicalGroup}
            onDeleteCanonicalGroup={deleteCanonicalGroup}
            onSuggestCatalogProducts={suggestCatalogProducts}
            onOpenSettings={() => setPage('settings')}
          />
        ) : null}
      </main>
    </div>
  );
}

function OrdersWorkbench(props) {
  const {
    filters, setFilters, orderStates, orders, selectedOrders, selectedRows, selectedRowObjects,
    canonicalGroups = [], selectedProduct, productQuery, products, templates, preview, simulationOk, readyToConfirm,
    verificationRequired, needsTypedConfirm,
    settings, confirmChecked, confirmText, canConfirm, busy,
    onSearchOrders, onToggleOrder, onToggleRow, onSelectSame, onProductQuery, onSearchProducts,
    onChooseProduct, onPreview, onSimulate, onConfirm, onConfirmChecked, onConfirmText, onClear,
    onNavigate, onChooseTemplate, onChooseCanonical,
  } = props;
  const selectedOrderList = [...selectedOrders.values()];
  const currentRows = selectedOrderList.flatMap((order) => (order.rows || []).map((row) => ({ ...row, order })));
  const {
    suggestions: canonicalSuggestions,
    alreadyPrincipalRows,
    unassociatedRows,
  } = getCanonicalSelectionState(selectedRowObjects, canonicalGroups);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const unassociatedProductIds = [...new Set(unassociatedRows.map((row) => String(row.productId)))];
  const showProductPicker = !selectedProduct || productPickerOpen;
  const loadingOrderRows = String(busy).startsWith('order-');
  const stage = readyToConfirm ? 'confirm' : selectedProduct ? 'review' : selectedRows.size ? 'product' : selectedOrders.size ? 'rows' : 'orders';
  const stageCopy = {
    orders: ['Scegli gli ordini', 'Filtra e seleziona uno o più ordini da modificare.'],
    rows: ['Seleziona le righe', 'Apri il dettaglio e marca solo le righe prodotto da sostituire.'],
    product: ['Scegli il sostitutivo', 'Cerca il nuovo prodotto e controlla riferimento e stato.'],
    review: ['Apri la revisione', 'Confronta prodotto attuale e nuovo prima della verifica.'],
    confirm: [
      'Pronto per applicare',
      verificationRequired
        ? 'La verifica è riuscita: puoi confermare la modifica reale.'
        : 'L’anteprima è pronta: puoi confermare la modifica reale.',
    ],
  };

  return (
    <section className="workbench operationConsole">
      <ConfigurationBanner
        settings={settings}
        onOpenSettings={() => onNavigate('settings')}
      />
      <header className="operationHeader panel">
        <div className="operationLead">
          <span className="eyebrow">Operazione guidata</span>
          <h2>{stageCopy[stage][0]}</h2>
          <p>{stageCopy[stage][1]}</p>
        </div>
        <div className="operationSteps" aria-label="Avanzamento operazione">
          {[
            ['orders', 'Ordini', selectedOrders.size > 0],
            ['rows', 'Righe', selectedRows.size > 0],
            ['product', 'Prodotto', Boolean(selectedProduct)],
            ['confirm', verificationRequired ? 'Verifica' : 'Anteprima', readyToConfirm],
          ].map(([key, label, done], index) => (
            <div key={label} className={cx('operationStep', done && 'done', (stage === key || (stage === 'review' && key === 'confirm')) && 'current')}>
              <span className="operationStepIndex">{done ? <Check className="icon" /> : index + 1}</span>
              <span className="operationStepLabel">{label}</span>
            </div>
          ))}
        </div>
        <IconButton icon={RotateCcw} variant="ghost" onClick={onClear}>Nuova operazione</IconButton>
      </header>

      <div className="operationFilters panel">
        <Field label="Ordine">
          <input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') onSearchOrders(); }} placeholder="ID, riferimento o cliente" />
        </Field>
        <Field label="Stato">
          <select value={filters.orderState} onChange={(event) => setFilters({ ...filters, orderState: event.target.value })}>
            <option value="">Tutti gli stati abilitati</option>
            {orderStates.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
          </select>
        </Field>
        <Field label="Da">
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
        </Field>
        <Field label="A">
          <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
        </Field>
        <Field label="Limite">
          <select value={filters.limit} onChange={(event) => setFilters({ ...filters, limit: event.target.value })}>
            {['20', '50', '100', '250', '500', '1000'].map((value) => <option key={value} value={value}>Primi {value}</option>)}
          </select>
        </Field>
        <IconButton icon={Search} busy={busy === 'orders'} onClick={onSearchOrders} variant="primary">Cerca</IconButton>
      </div>

      <div className="consoleGrid">
        <section className="panel orderQueue">
          <PanelHeader
            title={`Coda ordini (${orders.length})`}
            subtitle={selectedOrders.size ? formatSelectedOrders(selectedOrders.size) : 'Nessun ordine selezionato'}
          />
          <div className="orderList">
            {busy === 'orders' ? <SkeletonCards count={6} /> : orders.map((order) => {
              const products = order.products || [];
              return (
                <label key={order.id} className={cx('orderCard', selectedOrders.has(String(order.id)) && 'selected')}>
                  <input type="checkbox" checked={selectedOrders.has(String(order.id))} onChange={(event) => onToggleOrder(order, event.target.checked)} aria-label={`Seleziona ordine ${order.id}`} />
                  <span className="orderCardBody">
                    <span className="orderCardTop">
                      <strong>{order.id}</strong>
                      <span>{money(order.totalPaid)}</span>
                    </span>
                    <span className="orderCardMeta">{order.reference} · {shortDate(order.dateAdd)}</span>
                    <span className="orderCardCustomer">{order.customerName || 'Cliente non disponibile'}</span>
                    <span className="orderCardProducts">
                      {products.slice(0, 2).map((product) => (
                        <span key={product.id}>
                          <Badge tone="warning">{product.productQuantity}x</Badge>
                          <span className="orderCardProductInfo">
                            <span>{product.productName}</span>
                            <small>
                              ID prodotto {product.productId || '-'} · Rif. {product.productReference || '-'}
                            </small>
                          </span>
                        </span>
                      ))}
                      {products.length > 2 ? <small>+{products.length - 2} altri articoli</small> : null}
                    </span>
                  </span>
                </label>
              );
            })}
            {!orders.length && busy !== 'orders' ? (
              <OrdersEmptyState
                filters={filters}
                configured={Boolean(settings.baseUrl && settings.apiKeyConfigured)}
                onReset={() => resetOrderSearch(setFilters, onSearchOrders)}
                onRetry={() => onSearchOrders(filters)}
                onOpenSettings={() => onNavigate('settings')}
              />
            ) : null}
          </div>
        </section>

        <section className="panel orderDetail">
          <PanelHeader
            title={selectedOrders.size
              ? `${selectedOrders.size} ordini in lavorazione`
              : loadingOrderRows ? 'Caricamento righe ordine' : 'Dettaglio righe'}
            subtitle={selectedOrders.size
              ? `${currentRows.length} righe disponibili · ${selectedRows.size} selezionate`
              : loadingOrderRows
                ? 'Recupero i prodotti dell’ordine selezionato.'
                : 'Seleziona un ordine dalla coda per vedere le righe prodotto.'}
            action={<IconButton icon={ClipboardCheck} disabled={!selectedRowObjects.length} onClick={onSelectSame} variant="ghost">Usa prodotto attuale</IconButton>}
          />
          {selectedOrders.size ? (
            <section className="workbenchOrderSelection" aria-labelledby="workbenchOrdersTitle">
              <div className="workbenchOrderSelectionHeader">
                <div>
                  <strong id="workbenchOrdersTitle">Ordini inclusi</strong>
                  <span>Rimuovi quelli che non vuoi più modificare.</span>
                </div>
                <Badge>{selectedOrders.size}</Badge>
              </div>
              <div className="workbenchOrderChips">
                {selectedOrderList.map((order) => {
                  const selectedCount = (order.rows || [])
                    .filter((row) => selectedRows.has(String(row.id)))
                    .length;
                  return (
                    <div key={order.id} className={cx('workbenchOrderChip', selectedCount && 'has-selected-rows')}>
                      <div>
                        <strong>Ordine {order.id}</strong>
                        <small>
                          {selectedCount
                            ? `${selectedCount} ${selectedCount === 1 ? 'riga selezionata' : 'righe selezionate'}`
                            : 'Nessuna riga selezionata'}
                        </small>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleOrder(order, false)}
                        aria-label={`Rimuovi ordine ${order.id} dalla lavorazione`}
                        title="Rimuovi dalla lavorazione"
                      >
                        <X className="icon" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          {selectedOrders.size || loadingOrderRows ? (
            <OrderLinesList
              rows={currentRows}
              selectedRows={selectedRows}
              loading={loadingOrderRows}
              onToggleRow={onToggleRow}
            />
          ) : (
            <div className="emptyState emptyStateLarge">
              <ShoppingCart className="titleIcon" />
              <strong>Nessun ordine selezionato</strong>
              <span>La coda a sinistra è il punto di partenza. Dopo la selezione, qui compariranno solo le righe modificabili.</span>
            </div>
          )}
        </section>

        <aside className={cx('panel actionDrawer', selectedRows.size && 'is-open')}>
          <PanelHeader
            title="Azione"
            subtitle={selectedRows.size ? 'Scegli prodotto, verifica e applica.' : 'Si attiva dopo la selezione delle righe.'}
            action={unassociatedRows.length ? (
              <div className="canonicalNoticePopover">
                <button
                  type="button"
                  className="canonicalNoticeTrigger"
                  aria-label="Mostra prodotti senza associazione"
                  aria-haspopup="dialog"
                >
                  <AlertTriangle className="icon" aria-hidden="true" />
                  <span>{unassociatedProductIds.length}</span>
                </button>
                <section
                  className="canonicalNoticeContent"
                  role="dialog"
                  aria-labelledby="canonicalUnassociatedTitle"
                >
                  <div className="canonicalNoticeMessage">
                    <span className="canonicalNoticeIcon">
                      <AlertTriangle className="icon" aria-hidden="true" />
                    </span>
                    <div>
                      <strong id="canonicalUnassociatedTitle">Associazione mancante</strong>
                      <span>
                        {unassociatedProductIds.length === 1 ? 'Il prodotto' : 'I prodotti'}
                        {' '}
                        {unassociatedProductIds.join(', ')}
                        {' '}
                        {unassociatedProductIds.length === 1 ? 'non appartiene' : 'non appartengono'}
                        {' '}
                        ancora a un gruppo.
                      </span>
                    </div>
                  </div>
                  <IconButton type="button" icon={Settings} variant="ghost" onClick={() => onNavigate('templates')}>
                    Gestisci associazioni
                  </IconButton>
                </section>
              </div>
            ) : null}
          />
          {selectedRows.size ? (
            <>
              {canonicalSuggestions.length && showProductPicker ? (
                <section className="canonicalSuggestions" aria-labelledby="canonicalSuggestionsTitle">
                  <header className="canonicalSuggestionsHeader">
                    <span className="canonicalSuggestionsIcon">
                      <Sparkles className="icon" aria-hidden="true" />
                    </span>
                    <div>
                      <span className="eyebrow">Suggerimento automatico</span>
                      <strong id="canonicalSuggestionsTitle">
                        {canonicalSuggestions.length === 1 ? 'Prodotto principale consigliato' : 'Prodotti principali consigliati'}
                      </strong>
                    </div>
                  </header>
                  {canonicalSuggestions.map((suggestion) => (
                    <article key={suggestion.motherProductId} className="canonicalSuggestion">
                      <div className="canonicalMatch">
                        <div className="canonicalMatchProduct canonicalMatchSource">
                          <span>{suggestion.originalProducts.length === 1 ? 'Prodotto nell’ordine' : 'Prodotti nell’ordine'}</span>
                          <strong>{suggestion.originalProductIds.join(', ')}</strong>
                          <small>
                            {[...new Set(suggestion.originalProducts.map((product) => product.name).filter(Boolean))].join(' · ') || 'Nome non disponibile'}
                          </small>
                        </div>
                        <span className="canonicalMatchArrow" aria-hidden="true">
                          <ArrowRight className="icon" />
                        </span>
                        <div className="canonicalMatchProduct canonicalMatchTarget">
                          <span>Prodotto consigliato</span>
                          <strong>{suggestion.motherProductId}</strong>
                          <small>{suggestion.motherProductName || suggestion.groupName}</small>
                        </div>
                      </div>
                      <div className="canonicalSuggestionFooter">
                        <span>
                          Associazione
                          {' '}
                          <strong>{suggestion.groupName}</strong>
                          {' · '}
                          {suggestion.matchedRowCount}
                          {' '}
                          {suggestion.matchedRowCount === 1 ? 'riga coinvolta' : 'righe coinvolte'}
                        </span>
                        <IconButton
                          type="button"
                          icon={Check}
                          variant="primary"
                          onClick={() => {
                            onChooseCanonical(suggestion);
                            setProductPickerOpen(false);
                          }}
                        >
                          Usa questo prodotto
                        </IconButton>
                      </div>
                    </article>
                  ))}
                </section>
              ) : null}
              {alreadyPrincipalRows.length && showProductPicker ? (
                <section className="canonicalSelectionNotice canonicalSelectionNoticeOk">
                  <Check className="icon" aria-hidden="true" />
                  <div>
                    <strong>Prodotto già principale</strong>
                    <span>
                      {alreadyPrincipalRows
                        .map((row) => String(row.productId))
                        .filter((id, index, values) => values.indexOf(id) === index)
                        .join(', ')}
                      {' '}
                      non richiede un suggerimento.
                    </span>
                  </div>
                </section>
              ) : null}
              {selectedProduct && !showProductPicker ? (
                <section className="selectedProductSummary" aria-label="Prodotto sostitutivo selezionato">
                  <span className="selectedProductSummaryIcon">
                    <Check className="icon" aria-hidden="true" />
                  </span>
                  <div>
                    <span>Prodotto sostitutivo</span>
                    <strong>{selectedProduct.id} · {selectedProduct.name}</strong>
                    <small>{selectedProduct.reference || 'Senza riferimento'} · {selectedProduct.active === '1' ? 'Attivo' : 'Non attivo'}</small>
                  </div>
                  <IconButton type="button" icon={Pencil} variant="ghost" onClick={() => setProductPickerOpen(true)}>
                    Cambia
                  </IconButton>
                </section>
              ) : (
                <>
                  <div className="commandSearch">
                    <input value={productQuery} onChange={(event) => onProductQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSearchProducts(); }} placeholder="Cerca per nome, riferimento o ID" />
                    <IconButton icon={PackageSearch} busy={busy === 'products'} onClick={() => onSearchProducts()}>Cerca</IconButton>
                  </div>
                  {templates.filter(t => !products.some(p => String(p.id) === String(t.id))).length ? (
                    <div className="suggestions">
                      {templates
                        .filter(t => !products.some(p => String(p.id) === String(t.id)))
                        .map((item) => (
                          <button key={item.id} onClick={() => {
                            onChooseTemplate(item);
                            setProductPickerOpen(false);
                          }}>
                            <strong>{item.id}</strong><span>{item.label}</span>
                          </button>
                        ))}
                    </div>
                  ) : null}
                  <div className="productList">
                    {products.map((product) => (
                      <button
                        key={product.id}
                        className={cx('productChoice', selectedProduct?.id === product.id && 'active')}
                        onClick={() => {
                          onChooseProduct(product);
                          setProductPickerOpen(false);
                        }}
                      >
                        <strong>{product.id}</strong>
                        <span>{product.name}</span>
                        <span>{product.reference || 'Senza riferimento'} · {product.active === '1' ? 'Attivo' : 'Non attivo'}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="drawerHint">
              <ChevronRight className="titleIcon" />
              <strong>Prima scegli le righe</strong>
              <span>Il prodotto sostitutivo e la revisione vengono mostrati solo quando l’operazione ha un contesto.</span>
            </div>
          )}
          {selectedRows.size ? (
            <ReviewPanel
              selectedRows={selectedRowObjects}
              selectedProduct={selectedProduct}
              preview={preview}
              simulationOk={simulationOk}
              readyToConfirm={readyToConfirm}
              verificationRequired={verificationRequired}
              needsTypedConfirm={needsTypedConfirm}
              requireConfirmCheck={settings.requireConfirmCheck}
              confirmChecked={confirmChecked}
              confirmText={confirmText}
              canConfirm={canConfirm}
              busy={busy}
              onPreview={onPreview}
              onSimulate={onSimulate}
              onConfirm={onConfirm}
              onConfirmChecked={onConfirmChecked}
              onConfirmText={onConfirmText}
            />
          ) : null}
        </aside>
      </div>
    </section>
  );
}

export function OrderLinesList({ rows, selectedRows, loading, onToggleRow }) {
  return (
    <div className="lineList" aria-busy={loading || undefined}>
      {rows.map(({ order, ...row }) => (
        <label key={row.id} className={cx('lineItem', selectedRows.has(String(row.id)) && 'selected')}>
          <input
            type="checkbox"
            checked={selectedRows.has(String(row.id))}
            onChange={(event) => onToggleRow(row.id, event.target.checked)}
            aria-label={`Seleziona riga ${row.id} dell'ordine ${order.id}: ${row.productName}`}
          />
          <span className="lineMain">
            <span className="lineTitle">{row.productName}</span>
            <span className="lineMeta">
              Ordine {order.id} · {order.reference} · ID prodotto {row.productId || '-'} · Rif. {row.productReference || '-'}
            </span>
            {row.canonicalization ? (
              <span className="lineCanonical">
                ID originale {row.canonicalization.originalProductId}
                <ChevronRight className="icon" aria-hidden="true" />
                Principale {row.canonicalization.motherProductId}
              </span>
            ) : null}
          </span>
          <span className="lineNumbers">
            <Badge>{row.productQuantity}x</Badge>
            <strong>{money(row.totalPriceTaxIncl)}</strong>
          </span>
        </label>
      ))}
      {loading ? (
        <div className="skeletonGroup" role="status" aria-label="Caricamento righe ordine">
          <SkeletonCards count={rows.length ? 2 : 4} />
        </div>
      ) : null}
    </div>
  );
}

export function OrdersEmptyState({ filters, configured, onReset, onRetry, onOpenSettings }) {
  const hasActiveFilters = Boolean(
    filters.q
    || filters.orderState
    || filters.dateFrom
    || filters.dateTo
    || filters.limit !== initialFilters.limit
  );

  return (
    <section className="emptyState emptyStateLarge" aria-labelledby="ordersEmptyTitle">
      <PackageSearch className="titleIcon" aria-hidden="true" />
      <strong id="ordersEmptyTitle">
        {hasActiveFilters ? 'Nessun ordine con questi filtri' : 'Nessun ordine disponibile'}
      </strong>
      <span>
        {hasActiveFilters
          ? 'Amplia l’intervallo di date, cambia stato oppure riparti dai filtri iniziali.'
          : configured
            ? 'La ricerca non ha restituito ordini. Puoi riprovare o controllare gli ordini sincronizzati nelle impostazioni.'
            : 'Configura la connessione PrestaShop prima di cercare gli ordini.'}
      </span>
      <div className="emptyStateActions">
        {hasActiveFilters ? (
          <IconButton icon={X} variant="ghost" onClick={onReset}>
            Azzera filtri e cerca
          </IconButton>
        ) : (
          <IconButton icon={RefreshCw} variant="primary" onClick={onRetry}>
            Riprova ricerca
          </IconButton>
        )}
        <IconButton icon={Settings} variant="ghost" onClick={onOpenSettings}>
          {configured ? 'Controlla impostazioni' : 'Configura PrestaShop'}
        </IconButton>
      </div>
    </section>
  );
}

export function CacheStatusCard({ cacheStatus, starting, onSync }) {
  const sync = getOrderSyncPresentation(cacheStatus || {});
  const { running, count } = sync;
  const showAction = count === 0;

  return (
    <div className="sidebarCard orderSyncCard" aria-label="Stato ordini sincronizzati">
      <span>Ordini sincronizzati</span>
      <strong aria-live="polite" aria-atomic="true">{sync.title}</strong>
      <small>{sync.detail}</small>
      {running ? (
        <progress
          className="orderSyncProgress"
          value={sync.importTotal ? sync.processedCount : undefined}
          max={sync.importTotal || undefined}
          aria-label={sync.importTotal
            ? `${sync.processedCount} ordini importati su ${sync.importTotal}`
            : sync.phaseLabel}
        />
      ) : null}
      {showAction ? (
        <button
          className="sidebarCacheAction"
          onClick={onSync}
          disabled={starting || running}
          aria-label={running ? 'Sincronizzazione ordini in corso' : 'Sincronizza ordini'}
          aria-busy={starting || running || undefined}
        >
          {starting || running
            ? <Loader2 className="icon spin" aria-hidden="true" />
            : <RefreshCw className="icon" aria-hidden="true" />}
          {starting || running ? 'Sincronizzazione…' : 'Sincronizza ordini'}
        </button>
      ) : null}
    </div>
  );
}

export function ConfigurationBanner({ settings, onOpenSettings }) {
  const missingUrl = !settings.baseUrl;
  const missingApiKey = !settings.apiKeyConfigured;
  if (!missingUrl && !missingApiKey) return null;

  const missing = [
    missingUrl ? 'URL del negozio' : '',
    missingApiKey ? 'API key Webservice' : '',
  ].filter(Boolean);

  return (
    <section className="configurationBanner alert alert-warning" aria-labelledby="configurationBannerTitle">
      <AlertTriangle className="icon" aria-hidden="true" />
      <span>
        <strong id="configurationBannerTitle">Configurazione incompleta.</strong>{' '}
        Aggiungi {missing.join(' e ')} per collegare la console a PrestaShop.
      </span>
      <IconButton icon={Settings} variant="primary" onClick={onOpenSettings}>
        Vai alle impostazioni
      </IconButton>
    </section>
  );
}

function PanelHeader({ title, subtitle, action }) {
  return (
    <header className="panelHeader">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

function SkeletonRows({ cols }) {
  return Array.from({ length: 6 }, (_, row) => (
    <tr key={row} className="skeletonRow">
      {Array.from({ length: cols }, (_, col) => <td key={col}><span /></td>)}
    </tr>
  ));
}

function SkeletonCards({ count = 5 }) {
  return Array.from({ length: count }, (_, index) => (
    <div key={index} className="skeletonCard">
      <span />
      <span />
      <span />
    </div>
  ));
}

export function ReviewPanel(props) {
  const {
    selectedRows, selectedProduct, preview, simulationOk, readyToConfirm, verificationRequired,
    needsTypedConfirm, requireConfirmCheck,
    confirmChecked, confirmText, canConfirm, busy, onPreview, onSimulate, onConfirm, onConfirmChecked, onConfirmText,
  } = props;
  const previewRows = preview?.data?.previews || [];
  const confirmationMatches = confirmText.trim().toUpperCase() === 'CONFERMA';
  const missingRequirements = [
    requireConfirmCheck && !confirmChecked ? 'seleziona la dichiarazione di verifica' : '',
    needsTypedConfirm && !confirmationMatches ? 'digita CONFERMA' : '',
  ].filter(Boolean);

  return (
    <section className="reviewPanel">
      <div className="reviewStats">
        <div><span>Righe</span><strong>{selectedRows.length}</strong></div>
        <div><span>Prodotto</span><strong>{selectedProduct ? selectedProduct.id : '-'}</strong></div>
        <div>
          <span>Verifica</span>
          <strong className={readyToConfirm ? 'okText' : ''}>
            {!verificationRequired ? 'Facoltativa' : simulationOk ? 'OK' : 'Da fare'}
          </strong>
        </div>
      </div>

      {!selectedRows.length || !selectedProduct ? (
        <div className="alert"><ChevronRight className="icon" />Seleziona almeno una riga e un prodotto sostitutivo.</div>
      ) : !previewRows.length ? (
        <section className="reviewAction" aria-labelledby="previewActionTitle">
          <header>
            <span className="reviewActionIndex" aria-hidden="true">1</span>
            <div>
              <h3 id="previewActionTitle">Confronto in sola lettura</h3>
              <p>Mostra prodotto attuale, sostitutivo, quantità e prezzo. Non invia modifiche a PrestaShop.</p>
            </div>
          </header>
          <IconButton icon={ClipboardCheck} busy={busy === 'preview'} onClick={onPreview} variant="primary">
            Confronta prodotti (anteprima)
          </IconButton>
        </section>
      ) : (
        <section className="reviewStepStatus reviewStepStatusComplete" aria-label="Confronto completato">
          <span className="reviewActionIndex"><Check className="icon" aria-hidden="true" /></span>
          <div>
            <strong>Confronto completato</strong>
            <small>{previewRows.length} {previewRows.length === 1 ? 'riga controllata' : 'righe controllate'}</small>
          </div>
          <IconButton icon={RefreshCw} busy={busy === 'preview'} onClick={onPreview} variant="ghost">
            Aggiorna
          </IconButton>
        </section>
      )}

      {previewRows.length ? (
        <div className="previewList">
          {previewRows.map((item) => (
            <article key={item.orderDetailId} className="previewItem">
              <header><strong>Ordine {item.orderId}</strong><Badge>Riga {item.orderDetailId}</Badge></header>
              <div className="delta">
                <div><span>Attuale</span><strong>{item.oldProductName}</strong><small>{item.oldProductReference || '-'}</small></div>
                <ChevronRight className="icon" aria-hidden="true" />
                <div><span>Nuovo</span><strong>{item.newProductName}</strong><small>{item.newProductReference || '-'}</small></div>
              </div>
              <footer><Badge tone="warning">Qta {item.productQuantity}</Badge><Badge>{money(item.totalPriceTaxIncl)}</Badge></footer>
            </article>
          ))}
        </div>
      ) : null}

      {previewRows.length && verificationRequired && !simulationOk ? (
        <section className="reviewAction" aria-labelledby="verificationActionTitle">
          <header>
            <span className="reviewActionIndex" aria-hidden="true">2</span>
            <div>
              <h3 id="verificationActionTitle">Verifica senza modificare</h3>
              <p>Controlla che la sostituzione possa essere eseguita senza modificare ordini o righe su PrestaShop.</p>
            </div>
          </header>
          <div className="alert alert-warning">
            <AlertTriangle className="icon" aria-hidden="true" />
            Verifica ancora da eseguire: l’applicazione reale resta bloccata.
          </div>
          <IconButton icon={PlayCircle} busy={busy === 'simulate'} onClick={onSimulate} variant="primary">
            Controlla senza applicare modifiche
          </IconButton>
        </section>
      ) : null}

      {previewRows.length && verificationRequired && simulationOk ? (
        <section className="reviewStepStatus reviewStepStatusComplete" aria-label="Verifica completata">
          <span className="reviewActionIndex"><ShieldCheck className="icon" aria-hidden="true" /></span>
          <div>
            <strong>Verifica completata</strong>
            <small>Nessun dato è stato modificato.</small>
          </div>
          <IconButton icon={RefreshCw} busy={busy === 'simulate'} onClick={onSimulate} variant="ghost">
            Ripeti
          </IconButton>
        </section>
      ) : null}

      {previewRows.length && !verificationRequired ? (
        <div className="alert alert-warning verificationSkipped" role="note">
          <AlertTriangle className="icon" aria-hidden="true" />
          <span>
            La verifica senza modificare è disattivata nelle impostazioni.
            Puoi passare direttamente alla modifica reale.
          </span>
        </div>
      ) : null}

      {readyToConfirm ? (
        <section className="reviewAction dangerZone" aria-labelledby="realActionTitle">
          <header>
            <span className="reviewActionIndex" aria-hidden="true">{verificationRequired ? 3 : 2}</span>
            <div>
              <h3 id="realActionTitle">Applicazione reale</h3>
              <p>
                Questa fase scrive direttamente sulle righe ordine.
                Procedi soltanto dopo aver controllato il confronto
                {verificationRequired ? ' e completato la verifica.' : '.'}
              </p>
            </div>
          </header>
          {requireConfirmCheck ? (
            <label className="checkLine">
              <input type="checkbox" checked={confirmChecked} onChange={(event) => onConfirmChecked(event.target.checked)} />
              Ho verificato prodotto, quantità e prezzo mantenuto.
            </label>
          ) : null}
          {needsTypedConfirm ? (
            <div className="confirmZone" role="group" aria-labelledby="confirmRiskTitle">
              <div className="alert alert-warning" role="note">
                <AlertTriangle className="icon" aria-hidden="true" />
                <span id="confirmRiskDescription">
                  <strong id="confirmRiskTitle">
                    Stai per modificare {selectedRows.length}{' '}
                    {selectedRows.length === 1 ? 'riga ordine' : 'righe ordine'}.
                  </strong>{' '}
                  La scrittura avviene tramite Webservice PrestaShop. Prima di ogni modifica viene creato
                  un backup JSON, ma il ripristino non è automatico e deve essere eseguito manualmente.
                </span>
              </div>
              <Field label='Scrivi "CONFERMA" per procedere'>
                <input
                  value={confirmText}
                  onChange={(event) => onConfirmText(event.target.value)}
                  placeholder="CONFERMA"
                  autoComplete="off"
                  spellCheck="false"
                  aria-invalid={Boolean(confirmText) && !confirmationMatches}
                  aria-describedby="confirmRiskDescription confirmInputHint"
                />
                <small id="confirmInputHint" className={cx('confirmInputHint', confirmationMatches && 'okText')} aria-live="polite">
                  {confirmationMatches ? 'Conferma valida.' : 'Il testo deve corrispondere esattamente a CONFERMA.'}
                </small>
              </Field>
            </div>
          ) : null}
          <div className="dangerZoneActions">
            <div className="dangerZoneDivider">
              <span>Scrittura su PrestaShop</span>
            </div>
            <p id="realActionRequirements" className={cx('dangerRequirements', canConfirm && 'okText')} aria-live="polite">
              {canConfirm
                ? 'Controlli completati: la modifica reale può essere applicata.'
                : `Per abilitare la modifica: ${missingRequirements.join(' e ')}.`}
            </p>
            <IconButton
              icon={ShieldCheck}
              busy={busy === 'confirm'}
              disabled={!canConfirm}
              onClick={onConfirm}
              variant="danger"
              aria-describedby="realActionRequirements"
            >
              Applica modifica reale
            </IconButton>
          </div>
        </section>
      ) : null}
    </section>
  );
}

export function SettingsPage({
  settings,
  orderStates,
  busy,
  templateStatus = null,
  onSave,
  onLoadStates,
  onSyncCache,
  onImportTemplates = async () => null,
  onLoadIntegrationTokens = async () => ({ tokens: [] }),
  onCreateIntegrationToken = async () => null,
  onDeleteIntegrationToken = async () => null,
}) {
  const selectedStateSet = new Set((settings.orderStates || []).map(String));
  const [replaceApiKey, setReplaceApiKey] = useState(!settings.apiKeyConfigured);
  const [templateFile, setTemplateFile] = useState(null);
  const [templateImportFeedback, setTemplateImportFeedback] = useState({ tone: '', text: '' });
  const [integrationTokens, setIntegrationTokens] = useState([]);
  const [integrationLabel, setIntegrationLabel] = useState('Browser PrestaShop');
  const [newIntegrationToken, setNewIntegrationToken] = useState('');
  const [integrationFeedback, setIntegrationFeedback] = useState({ tone: '', text: '' });
  const [integrationBusy, setIntegrationBusy] = useState('');
  const [activeSettingsSection, setActiveSettingsSection] = useState('connection');
  const [settingsFormError, setSettingsFormError] = useState('');
  const templateFileRef = useRef(null);
  const loadIntegrationTokensRef = useRef(onLoadIntegrationTokens);
  loadIntegrationTokensRef.current = onLoadIntegrationTokens;

  useEffect(() => {
    setReplaceApiKey(!settings.apiKeyConfigured);
  }, [settings.apiKeyConfigured, settings.apiKeyHint]);

  useEffect(() => {
    let cancelled = false;
    loadIntegrationTokensRef.current()
      .then((result) => {
        if (!cancelled) setIntegrationTokens(result?.tokens || []);
      })
      .catch((error) => {
        if (!cancelled) setIntegrationFeedback({ tone: 'error', text: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createIntegrationToken() {
    setIntegrationBusy('create');
    setIntegrationFeedback({ tone: '', text: '' });
    try {
      const result = await onCreateIntegrationToken(integrationLabel);
      setIntegrationTokens((current) => [...current, result.integration]);
      setNewIntegrationToken(result.token);
      setIntegrationFeedback({
        tone: 'ok',
        text: 'Token creato. Copialo ora: per sicurezza non sarà mostrato di nuovo.',
      });
    } catch (error) {
      setIntegrationFeedback({ tone: 'error', text: error.message });
    } finally {
      setIntegrationBusy('');
    }
  }

  async function deleteIntegrationToken(id) {
    setIntegrationBusy(id);
    try {
      await onDeleteIntegrationToken(id);
      setIntegrationTokens((current) => current.filter((item) => item.id !== id));
      setNewIntegrationToken('');
      setIntegrationFeedback({ tone: 'ok', text: 'Accesso revocato immediatamente.' });
    } catch (error) {
      setIntegrationFeedback({ tone: 'error', text: error.message });
    } finally {
      setIntegrationBusy('');
    }
  }

  async function handleTemplateImport() {
    if (!templateFile) {
      setTemplateImportFeedback({ tone: 'error', text: 'Seleziona un file CSV da importare.' });
      return;
    }
    setTemplateImportFeedback({ tone: '', text: '' });
    try {
      const result = await onImportTemplates(templateFile);
      setTemplateImportFeedback({
        tone: 'ok',
        text: `${result?.importedCount || 0} prodotti importati correttamente.`,
      });
      setTemplateFile(null);
      if (templateFileRef.current) templateFileRef.current.value = '';
    } catch (error) {
      setTemplateImportFeedback({ tone: 'error', text: error.message });
    }
  }

  const settingsNavigation = [
    { id: 'connection', label: 'Connessione', icon: Database },
    { id: 'orders', label: 'Ordini sincronizzati', icon: ShoppingCart },
    { id: 'workflow', label: 'Procedura di modifica', icon: ClipboardCheck },
    { id: 'catalog', label: 'Catalogo rapido', icon: PackageSearch },
    { id: 'security', label: 'Sicurezza', icon: ShieldCheck },
    { id: 'browser', label: 'Browser e userscript', icon: KeyRound },
  ];

  function activateSettingsSection(sectionId, { scroll = false } = {}) {
    setActiveSettingsSection(sectionId);
    setSettingsFormError('');
    if (scroll && globalThis.matchMedia?.('(max-width: 1280px)').matches) {
      requestAnimationFrame(() => {
        document.getElementById(`settings-${sectionId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  }

  function handleSettingsTabKeyDown(event, currentIndex) {
    const lastIndex = settingsNavigation.length - 1;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    else return;

    event.preventDefault();
    const nextSection = settingsNavigation[nextIndex];
    activateSettingsSection(nextSection.id);
    document.getElementById(`settings-tab-${nextSection.id}`)?.focus();
  }

  function handleSettingsSubmit(event) {
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (!settings.apiKeyConfigured && !String(formData.get('apiKey') || '').trim()) {
      event.preventDefault();
      setActiveSettingsSection('connection');
      setSettingsFormError('Inserisci la API key PrestaShop prima di salvare.');
      requestAnimationFrame(() => form.querySelector('[name="apiKey"]')?.focus());
      return;
    }
    setSettingsFormError('');
    onSave(event);
  }

  return (
    <form className="settingsPage" onSubmit={handleSettingsSubmit} noValidate>
      <header className="settingsHero panel">
        <div className="settingsHeroCopy">
          <span className="eyebrow">Configurazione</span>
          <h2>Panoramica configurazione</h2>
          <p>Connessioni, ordini e sicurezza organizzati per area. Le modifiche diventano attive solo dopo il salvataggio.</p>
        </div>
        <div className="settingsHealth" aria-label="Riepilogo configurazione">
          <span className={cx('settingsHealthItem', settings.apiKeyConfigured && settings.baseUrl && 'ready')}>
            <ShieldCheck className="icon" aria-hidden="true" />
            <span><small>PrestaShop</small><strong>{settings.apiKeyConfigured && settings.baseUrl ? 'Connesso' : 'Da configurare'}</strong></span>
          </span>
          <span className={cx('settingsHealthItem', (settings.orderStates || []).length && 'ready')}>
            <ShoppingCart className="icon" aria-hidden="true" />
            <span><small>Stati attivi</small><strong>{(settings.orderStates || []).length}</strong></span>
          </span>
          <span className={cx('settingsHealthItem', templateStatus?.configured && 'ready')}>
            <FileSpreadsheet className="icon" aria-hidden="true" />
            <span><small>Catalogo rapido</small><strong>{templateStatus?.configured ? `${templateStatus.count} prodotti` : 'Da importare'}</strong></span>
          </span>
        </div>
      </header>

      <div className="settingsLayout">
        <nav className="settingsIndex panel" aria-label="Sezioni impostazioni" role="tablist" aria-orientation="vertical">
          <span className="settingsIndexLabel" role="presentation">Scegli una sezione</span>
          {settingsNavigation.map((section, index) => {
            const SectionIcon = section.icon;
            const active = activeSettingsSection === section.id;
            return (
              <button
                key={section.id}
                id={`settings-tab-${section.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`settings-${section.id}`}
                tabIndex={active ? 0 : -1}
                className={cx(active && 'active')}
                onClick={() => activateSettingsSection(section.id, { scroll: true })}
                onKeyDown={(event) => handleSettingsTabKeyDown(event, index)}
              >
                <SectionIcon className="icon" aria-hidden="true" />
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="settingsContent">
          <section className="panel settingsSection" id="settings-connection" role="tabpanel" aria-labelledby="settings-tab-connection" hidden={activeSettingsSection !== 'connection'}>
            <header className="settingsSectionHeader">
              <span className="settingsSectionIcon"><Database aria-hidden="true" /></span>
              <div>
                <span className="eyebrow">01 · Collegamento</span>
                <h2>Connessione PrestaShop</h2>
                <p>Credenziali Webservice usate per ordini, prodotti e stati.</p>
              </div>
            </header>
            <div className="formGrid">
              <Field label="URL negozio" hint="Indirizzo principale del negozio, senza /api finale.">
                <input name="baseUrl" defaultValue={settings.baseUrl} placeholder="https://www.tuo-negozio.it" />
              </Field>
              <div className="field">
                <span>API key Webservice</span>
                {settings.apiKeyConfigured && !replaceApiKey ? (
                  <div className="alert alert-ok settingsCredential">
                    <ShieldCheck className="icon" />
                    <span>Configurata {settings.apiKeyHint}</span>
                    <IconButton type="button" variant="ghost" onClick={() => setReplaceApiKey(true)}>
                      Sostituisci
                    </IconButton>
                  </div>
                ) : (
                  <>
                    <input
                      name="apiKey"
                      type="password"
                      autoComplete="off"
                      placeholder={settings.apiKeyConfigured ? 'Inserisci la nuova API key' : 'API key Webservice PrestaShop'}
                      aria-required={!settings.apiKeyConfigured}
                      onChange={() => setSettingsFormError('')}
                    />
                    {settings.apiKeyConfigured ? (
                      <IconButton type="button" variant="ghost" onClick={() => setReplaceApiKey(false)}>
                        Mantieni quella attuale
                      </IconButton>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            {settingsFormError ? <div className="alert alert-error" role="alert">{settingsFormError}</div> : null}
          </section>

          <section className="panel settingsSection" id="settings-orders" role="tabpanel" aria-labelledby="settings-tab-orders" hidden={activeSettingsSection !== 'orders'}>
            <header className="settingsSectionHeader">
              <span className="settingsSectionIcon"><ShoppingCart aria-hidden="true" /></span>
              <div>
                <span className="eyebrow">02 · Ordini</span>
                <h2>Ricerca e sincronizzazione</h2>
                <p>Definisci quali ordini mantenere disponibili e con quale frequenza aggiornarli.</p>
              </div>
              <IconButton type="button" icon={RefreshCw} busy={busy === 'states'} onClick={onLoadStates}>Aggiorna stati</IconButton>
            </header>
            <div className="settingsSubsection">
              <div className="settingsSubsectionTitle">
                <h3>Stati inclusi</h3>
                <p>Solo gli ordini negli stati selezionati saranno mostrati e sincronizzati.</p>
              </div>
              <div className="choiceGrid">
                {orderStates.map((state) => (
                  <label key={state.id} className="checkCard">
                    <input type="checkbox" name="orderStates" value={state.id} defaultChecked={selectedStateSet.has(String(state.id))} />
                    {state.name}
                  </label>
                ))}
                {!orderStates.length ? <p className="empty">Carica gli stati da PrestaShop.</p> : null}
              </div>
            </div>
            <div className="settingsSubsection">
              <div className="settingsSubsectionTitle">
                <h3>Intervallo e capacità</h3>
                <p>Controlla il filtro iniziale e la dimensione dell’archivio sincronizzato.</p>
              </div>
              <div className="formGrid settingsOrderGrid">
                <Field label="Stato predefinito"><select name="defaultOrderState" defaultValue={settings.defaultOrderState}>{orderStates.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></Field>
                <Field label="Risultati per ricerca"><select name="orderLimit" defaultValue={settings.orderLimit}>{['20', '50', '100', '250', '500', '1000'].map((v) => <option key={v} value={v}>Primi {v}</option>)}</select></Field>
                <Field label="Ordini dal"><input type="date" name="orderDateFrom" defaultValue={settings.orderDateFrom} /></Field>
                <Field label="Ordini fino al"><input type="date" name="orderDateTo" defaultValue={settings.orderDateTo} /></Field>
                <Field label="Ordini per blocco"><select name="cacheBatchSize" defaultValue={settings.cacheBatchSize}>{['50', '60', '80', '100'].map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
                <Field label="Massimo ordini conservati"><select name="cacheMaxOrders" defaultValue={settings.cacheMaxOrders}>{['100', '250', '500', '1000'].map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
              </div>
            </div>
            <div className="toggleGrid settingsToggleGrid">
              <label className="settingsToggle">
                <input type="checkbox" name="cacheAutoSync" defaultChecked={settings.cacheAutoSync} />
                <span><strong>Sincronizza al salvataggio</strong><small>Aggiorna gli ordini subito dopo aver salvato queste impostazioni.</small></span>
              </label>
              <label className="settingsToggle">
                <input type="checkbox" name="cacheHourlySync" defaultChecked={settings.cacheHourlySync} />
                <span><strong>Aggiornamento ogni ora</strong><small>Mantiene automaticamente aggiornati gli ordini sincronizzati.</small></span>
              </label>
            </div>
            <div className="settingsInlineAction">
              <div><strong>Sincronizzazione manuale</strong><small>Avvia ora un aggiornamento senza salvare altre modifiche.</small></div>
              <IconButton type="button" icon={Database} busy={busy === 'cache'} onClick={onSyncCache}>Sincronizza ora</IconButton>
            </div>
          </section>

          <section className="panel settingsSection" id="settings-workflow" role="tabpanel" aria-labelledby="settings-tab-workflow" hidden={activeSettingsSection !== 'workflow'}>
            <header className="settingsSectionHeader">
              <span className="settingsSectionIcon"><ClipboardCheck aria-hidden="true" /></span>
              <div>
                <span className="eyebrow">03 · Controlli</span>
                <h2>Procedura di modifica</h2>
                <p>Scegli quali controlli richiedere prima di scrivere realmente su PrestaShop.</p>
              </div>
            </header>
            <div className="toggleGrid settingsToggleGrid">
              <label className="settingsToggle">
                <input type="checkbox" name="requirePreflightCheck" defaultChecked={settings.requirePreflightCheck} />
                <span><strong>Verifica senza modificare</strong><small>Controlla prima che la sostituzione sia eseguibile. Se disattivata, dopo l’anteprima puoi procedere direttamente.</small></span>
              </label>
              <label className="settingsToggle">
                <input type="checkbox" name="requireConfirmCheck" defaultChecked={settings.requireConfirmCheck} />
                <span><strong>Conferma manuale finale</strong><small>Richiede una conferma esplicita prima dell’applicazione reale.</small></span>
              </label>
            </div>
          </section>

          <section className="panel settingsSection templateSettings" id="settings-catalog" role="tabpanel" aria-labelledby="settings-tab-catalog" hidden={activeSettingsSection !== 'catalog'}>
            <header className="settingsSectionHeader">
              <span className="settingsSectionIcon"><PackageSearch aria-hidden="true" /></span>
              <div>
                <span className="eyebrow">04 · Prodotti</span>
                <h2>Catalogo risultati rapidi</h2>
                <p>Gestisci i suggerimenti mostrati durante la ricerca del prodotto sostitutivo.</p>
              </div>
            </header>
            <div className="templateStatusCard" aria-live="polite">
              <FileSpreadsheet className="titleIcon" aria-hidden="true" />
              <div>
                <span>File attivo</span>
                <strong>{templateStatus?.fileName || 'templates_export.csv'}</strong>
                <small>
                  {templateStatus?.configured
                    ? `${templateStatus.count} prodotti · aggiornato ${shortDate(templateStatus.updatedAt)}`
                    : 'Nessun file importato. Puoi aggiungere un CSV qui sotto.'}
                </small>
              </div>
              <Badge tone={templateStatus?.configured ? 'ok' : 'warning'}>
                {templateStatus?.configured ? 'Attivo' : 'Da configurare'}
              </Badge>
            </div>
            <div className="templateImportGrid">
              <Field label="File CSV" hint="Colonne richieste: ID e Nome, Name oppure SKU. Dimensione massima 5 MB.">
                <input
                  ref={templateFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    setTemplateFile(event.target.files?.[0] || null);
                    setTemplateImportFeedback({ tone: '', text: '' });
                  }}
                  aria-describedby="templateCsvHint"
                />
              </Field>
              <Field label="Suggerimenti mostrati" hint="Numero massimo visualizzato mentre digiti.">
                <select name="productTemplateLimit" defaultValue={settings.productTemplateLimit || '8'}>
                  {['5', '8', '10', '15', '20'].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <IconButton type="button" icon={Upload} busy={busy === 'templates-import'} onClick={handleTemplateImport} variant="primary">
                Importa CSV
              </IconButton>
            </div>
            <p id="templateCsvHint" className="templateFileNote">
              L’importazione aggiorna <strong>templates_export.csv</strong>. La versione precedente viene conservata nei backup.
            </p>
            {templateImportFeedback.text ? (
              <div className={cx('alert', templateImportFeedback.tone === 'error' ? 'alert-error' : 'alert-ok')} role={templateImportFeedback.tone === 'error' ? 'alert' : 'status'}>
                {templateImportFeedback.text}
              </div>
            ) : null}
          </section>

          <section className="panel settingsSection" id="settings-security" role="tabpanel" aria-labelledby="settings-tab-security" hidden={activeSettingsSection !== 'security'}>
            <header className="settingsSectionHeader">
              <span className="settingsSectionIcon"><ShieldCheck aria-hidden="true" /></span>
              <div>
                <span className="eyebrow">05 · Accesso</span>
                <h2>Sicurezza locale</h2>
                <p>Protegge la console sul computer o sulla rete dove viene eseguita.</p>
              </div>
              <Badge tone={settings.appPasswordEnabled ? 'ok' : 'warning'}>{settings.appPasswordEnabled ? 'Protetta' : 'Senza password'}</Badge>
            </header>
            <Field
              label={settings.appPasswordEnabled ? 'Nuova password locale' : 'Password locale app'}
              hint={settings.appPasswordEnabled ? 'Lascia vuoto per mantenere la password attuale.' : 'Consigliata; obbligatoria se la console viene esposta in rete.'}
            >
              <input type="password" name="appPassword" autoComplete="new-password" placeholder={settings.appPasswordEnabled ? 'Lascia vuoto per non cambiarla' : 'Imposta una password'} />
            </Field>
            {settings.appPasswordEnabled ? (
              <label className="checkLine settingsDangerChoice">
                <input type="checkbox" name="removeAppPassword" />
                Rimuovi la password locale al salvataggio
              </label>
            ) : null}
          </section>

          <section className="panel settingsSection integrationSettings" id="settings-browser" role="tabpanel" aria-labelledby="settings-tab-browser" hidden={activeSettingsSection !== 'browser'}>
            <header className="settingsSectionHeader">
              <span className="settingsSectionIcon"><KeyRound aria-hidden="true" /></span>
              <div>
                <span className="eyebrow">06 · Integrazioni</span>
                <h2>Browser e userscript</h2>
                <p>Autorizza i client senza condividere password o API key PrestaShop.</p>
              </div>
              <Badge tone={integrationTokens.length ? 'ok' : 'neutral'}>{integrationTokens.length} autorizzati</Badge>
            </header>
            <div className="integrationDownloads">
              <a className="btn btn-ghost" href="/integrations/chrome.zip" download>Scarica Chrome</a>
              <a className="btn btn-ghost" href="/integrations/firefox.zip" download>Scarica Firefox</a>
              <a className="btn btn-ghost" href="/integrations/prestashop-order-console.user.js">Installa userscript</a>
            </div>
            <div className="settingsSubsection">
              <div className="settingsSubsectionTitle">
                <h3>Nuova autorizzazione</h3>
                <p>Crea un token separato per ogni browser o postazione.</p>
              </div>
              <div className="integrationCreate">
                <Field label="Nome accesso" hint="Esempio: Chrome ufficio oppure Firefox magazzino.">
                  <input value={integrationLabel} maxLength="80" onChange={(event) => setIntegrationLabel(event.target.value)} />
                </Field>
                <IconButton type="button" icon={KeyRound} variant="primary" busy={integrationBusy === 'create'} onClick={createIntegrationToken}>
                  Crea token
                </IconButton>
              </div>
            </div>
            {newIntegrationToken ? (
              <div className="integrationSecret" role="status">
                <div><span>Token da copiare</span><code>{newIntegrationToken}</code></div>
                <IconButton type="button" icon={ClipboardCheck} onClick={async () => {
                  await navigator.clipboard.writeText(newIntegrationToken);
                  setIntegrationFeedback({ tone: 'ok', text: 'Token copiato negli appunti.' });
                }}>Copia</IconButton>
              </div>
            ) : null}
            <div className="integrationList">
              {integrationTokens.map((item) => (
                <div className="integrationRow" key={item.id}>
                  <KeyRound className="icon" aria-hidden="true" />
                  <div><strong>{item.label}</strong><small>Creato {shortDate(item.createdAt)}</small></div>
                  <IconButton type="button" icon={Trash2} variant="danger" busy={integrationBusy === item.id} onClick={() => deleteIntegrationToken(item.id)}>Revoca</IconButton>
                </div>
              ))}
              {!integrationTokens.length ? <p className="empty">Nessun browser autorizzato.</p> : null}
            </div>
            {integrationFeedback.text ? (
              <div className={cx('alert', integrationFeedback.tone === 'error' ? 'alert-error' : 'alert-ok')}>{integrationFeedback.text}</div>
            ) : null}
          </section>
        </div>
      </div>
      <div className="stickyActions">
        <span>Salva per applicare le modifiche a tutte le aree.</span>
        <IconButton type="submit" icon={Check} busy={busy === 'settings'} variant="primary">Salva impostazioni</IconButton>
      </div>
    </form>
  );
}

export function CatalogProductAutocomplete({
  id,
  value,
  onChange,
  onSuggest,
  multiple = false,
  placeholder,
  required,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasFocus, setHasFocus] = useState(false);
  const [queryRequested, setQueryRequested] = useState(false);
  const inputRef = useRef(null);
  const suggestRef = useRef(onSuggest);
  suggestRef.current = onSuggest;

  const searchTerm = multiple
    ? String(value || '').split(/[\s,;]+/).at(-1)?.trim() || ''
    : String(value || '').trim();
  const listboxId = `${id}-suggestions`;

  useEffect(() => {
    if (!hasFocus || !queryRequested || searchTerm.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const products = await suggestRef.current(searchTerm);
        if (cancelled) return;
        const selectedIds = new Set(
          multiple
            ? String(value || '').split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean)
            : [],
        );
        setSuggestions((products || []).filter((product) => !selectedIds.has(String(product.id))));
        setActiveIndex(-1);
        setOpen(true);
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // The query value is the only trigger; the callback is kept current through suggestRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, hasFocus, queryRequested]);

  function selectProduct(product) {
    if (multiple) {
      const tokens = String(value || '').split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
      if (searchTerm && tokens.at(-1) === searchTerm) tokens.pop();
      if (!tokens.includes(String(product.id))) tokens.push(String(product.id));
      onChange(`${tokens.join(', ')}${tokens.length ? ', ' : ''}`);
    } else {
      onChange(String(product.id));
    }
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    setQueryRequested(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (!open || (!suggestions.length && !loading)) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectProduct(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  }

  const listboxOpen = open && suggestions.length > 0;

  return (
    <div className="catalogAutocomplete">
      <div className="catalogAutocompleteControl">
        <Search className="catalogAutocompleteIcon" aria-hidden="true" />
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(event) => {
            setQueryRequested(true);
            onChange(event.target.value);
          }}
          onFocus={() => setHasFocus(true)}
          onBlur={() => {
            setHasFocus(false);
            setQueryRequested(false);
            setOpen(false);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listboxOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          inputMode={multiple ? 'text' : undefined}
          pattern={multiple ? undefined : '[0-9]+'}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
        />
        {loading ? <Loader2 className="icon spin catalogAutocompleteLoader" aria-label="Ricerca in corso" /> : null}
      </div>
      {listboxOpen ? (
        <div className="catalogSuggestions" id={listboxId} role="listbox" aria-label="Prodotti del catalogo rapido">
          {suggestions.map((product, index) => (
            <button
              id={`${listboxId}-${index}`}
              key={product.id}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              className={cx(activeIndex === index && 'active')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectProduct(product)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <strong>{product.id}</strong>
              <span>{product.label}</span>
              <small>
                {product.source === 'prestashop' ? 'PrestaShop' : 'Catalogo rapido'}
                {' · '}
                {multiple ? 'Aggiungi agli ID collegati' : 'Imposta come prodotto principale'}
              </small>
            </button>
          ))}
        </div>
      ) : null}
      {open && !loading && !suggestions.length ? (
        <div className="catalogAutocompleteMessage" role="status">
          Nessun prodotto trovato. Puoi comunque inserire direttamente l’ID.
        </div>
      ) : null}
    </div>
  );
}

export function CanonicalGroupsPanel({
  groups = [],
  busy,
  error,
  onSave,
  onDelete,
  onSuggestProducts,
}) {
  const [editor, setEditor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState('');

  function openCreate() {
    setDeleteTarget(null);
    setActionError('');
    setEditor({
      mode: 'create',
      id: '',
      name: '',
      motherProductId: '',
      linkedProductIdsText: '',
    });
  }

  function openEdit(group) {
    setDeleteTarget(null);
    setActionError('');
    setEditor({
      mode: 'edit',
      id: group.id,
      name: group.name,
      motherProductId: group.motherProductId,
      linkedProductIdsText: (group.linkedProductIds || []).join(', '),
    });
  }

  async function submit(event) {
    event.preventDefault();
    setActionError('');
    try {
      await onSave({
        ...editor,
        linkedProductIds: editor.linkedProductIdsText
          .split(/[\s,;]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      });
      setEditor(null);
    } catch (saveError) {
      setActionError(saveError.message);
    }
  }

  async function confirmDelete() {
    setActionError('');
    try {
      await onDelete(deleteTarget);
      setDeleteTarget(null);
    } catch (deleteError) {
      setActionError(deleteError.message);
    }
  }

  return (
    <section className="canonicalManager" aria-labelledby="canonicalManagerTitle">
      <div className="canonicalManagerHeader">
        <div>
          <span className="eyebrow">Associazione prodotti</span>
          <h3 id="canonicalManagerTitle">Gruppi di prodotti equivalenti</h3>
          <p>Collega varianti o vecchi ID a un unico prodotto principale.</p>
        </div>
        <div className="canonicalManagerSummary">
          <Badge tone={groups.length ? 'accent' : 'neutral'}>{groups.length} gruppi</Badge>
          <IconButton type="button" icon={Plus} onClick={openCreate} variant="primary">Nuovo gruppo</IconButton>
        </div>
      </div>

      {editor ? (
        <form className="canonicalEditor" onSubmit={submit}>
          <Field label="Nome gruppo" hint="Un nome interno per riconoscere la famiglia.">
            <input
              value={editor.name}
              onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              placeholder="Es. Climatizzatore 12.000 BTU"
            />
          </Field>
          <div className="field">
            <label htmlFor="canonical-mother-product">Prodotto principale</label>
            <CatalogProductAutocomplete
              id="canonical-mother-product"
              value={editor.motherProductId}
              onChange={(value) => setEditor({ ...editor, motherProductId: value })}
              onSuggest={onSuggestProducts}
              placeholder="Cerca per nome o inserisci l’ID"
              required
            />
            <small>Scegli dal catalogo rapido oppure inserisci direttamente l’ID.</small>
          </div>
          <div className="field">
            <label htmlFor="canonical-linked-products">Prodotti collegati</label>
            <CatalogProductAutocomplete
              id="canonical-linked-products"
              value={editor.linkedProductIdsText}
              onChange={(value) => setEditor({ ...editor, linkedProductIdsText: value })}
              onSuggest={onSuggestProducts}
              multiple
              placeholder="Cerca prodotti o inserisci più ID"
              required
            />
            <small>Seleziona più prodotti oppure separa gli ID con virgole, spazi o punto e virgola.</small>
          </div>
          <div className="canonicalEditorActions">
            <IconButton type="submit" icon={Check} busy={busy === 'canonical-group-save'} variant="primary">
              {editor.mode === 'create' ? 'Crea gruppo' : 'Salva gruppo'}
            </IconButton>
            <IconButton type="button" icon={X} onClick={() => setEditor(null)} variant="ghost">Annulla</IconButton>
          </div>
        </form>
      ) : null}

      {actionError || error ? (
        <div className="alert alert-error" role="alert">
          <AlertTriangle className="icon" aria-hidden="true" />
          {actionError || error}
        </div>
      ) : null}

      {groups.length ? (
        <div className="canonicalGroupList">
          {groups.map((group) => (
            <article key={group.id} className="canonicalGroupCard">
              <div className="canonicalMother">
                <span>Prodotto principale</span>
                <strong>{group.motherProductId}</strong>
                <small className={cx(!group.motherProductName && 'catalogNameMissing')}>
                  {group.motherProductName || 'Nome non presente nel catalogo rapido'}
                </small>
                <span className="canonicalGroupName">{group.name}</span>
              </div>
              <ChevronRight className="canonicalArrow" aria-hidden="true" />
              <div className="canonicalLinked">
                <span>{group.linkedProductIds.length} ID collegati</span>
                <div className="canonicalLinkedList">
                  {(group.linkedProducts || group.linkedProductIds.map((id) => ({ id, name: '' }))).map((product) => (
                    <div key={product.id} className="canonicalLinkedProduct">
                      <strong>{product.id}</strong>
                      <span className={cx(!product.name && 'catalogNameMissing')}>
                        {product.name || 'Nome non presente nel catalogo rapido'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="canonicalGroupActions">
                {deleteTarget?.id === group.id ? (
                  <>
                    <IconButton type="button" icon={Trash2} busy={busy === 'canonical-group-delete'} onClick={confirmDelete} variant="danger">Conferma</IconButton>
                    <IconButton type="button" icon={X} onClick={() => setDeleteTarget(null)} variant="ghost">Annulla</IconButton>
                  </>
                ) : (
                  <>
                    <IconButton type="button" icon={Pencil} onClick={() => openEdit(group)} variant="ghost">Modifica</IconButton>
                    <IconButton type="button" icon={Trash2} onClick={() => { setEditor(null); setDeleteTarget(group); }} variant="subtleDanger">Elimina</IconButton>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : editor ? null : (
        <div className="canonicalEmpty">
          <Database className="titleIcon" aria-hidden="true" />
          <div>
            <strong>Nessun gruppo configurato</strong>
            <span>Gli ordini continueranno a mostrare soltanto gli ID originali finché non crei un gruppo.</span>
          </div>
        </div>
      )}
    </section>
  );
}

export function ProductTemplatesPage({
  items,
  query,
  setQuery,
  pagination,
  status,
  busy,
  error,
  canonicalGroups,
  canonicalError,
  onSearch,
  onClear,
  onPageChange,
  onSave,
  onDelete,
  onSaveCanonicalGroup,
  onDeleteCanonicalGroup,
  onSuggestCatalogProducts,
  onOpenSettings,
}) {
  const [editor, setEditor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState('');

  function openCreate() {
    setDeleteTarget(null);
    setActionError('');
    setEditor({ mode: 'create', originalId: '', id: '', name: '' });
  }

  function openEdit(item) {
    setDeleteTarget(null);
    setActionError('');
    setEditor({ mode: 'edit', originalId: item.id, id: item.id, name: item.name });
  }

  async function submitEditor(event) {
    event.preventDefault();
    setActionError('');
    try {
      await onSave(editor);
      setEditor(null);
    } catch (saveError) {
      setActionError(saveError.message);
    }
  }

  async function confirmDelete() {
    setActionError('');
    try {
      await onDelete(deleteTarget);
      setDeleteTarget(null);
      if (editor?.originalId === deleteTarget?.id) setEditor(null);
    } catch (deleteError) {
      setActionError(deleteError.message);
    }
  }

  return (
    <section className="panel productTemplatesPage">
      <PanelHeader
        title="Catalogo risultati rapidi"
        subtitle={`${status?.count || pagination.totalItems || 0} prodotti disponibili in templates_export.csv.`}
        action={<IconButton type="button" icon={Plus} onClick={openCreate} variant="primary">Aggiungi prodotto</IconButton>}
      />

      <CanonicalGroupsPanel
        groups={canonicalGroups}
        busy={busy}
        error={canonicalError}
        onSave={onSaveCanonicalGroup}
        onDelete={onDeleteCanonicalGroup}
        onSuggestProducts={onSuggestCatalogProducts}
      />

      <form className="templateCatalogToolbar" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
        <div className="templateCatalogSearch">
          <label htmlFor="template-catalog-search">Cerca nel catalogo</label>
          <div className="templateSearchControl">
            <Search className="templateSearchIcon" aria-hidden="true" />
            <input
              id="template-catalog-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca per ID o nome prodotto…"
              autoComplete="off"
            />
            {query ? (
              <button
                className="templateSearchClear"
                type="button"
                onClick={onClear}
                aria-label="Azzera ricerca"
                title="Azzera ricerca"
              >
                <X className="icon" aria-hidden="true" />
              </button>
            ) : null}
            <IconButton type="submit" icon={Search} busy={busy === 'template-items'} variant="primary">Cerca</IconButton>
          </div>
          <small>Cerca anche una parte del nome oppure inserisci l’ID numerico.</small>
        </div>
        <div className="templateCatalogUtility">
          <IconButton type="button" icon={Upload} onClick={onOpenSettings} variant="ghost">Gestisci CSV</IconButton>
        </div>
      </form>

      {editor ? (
        <form className="templateEditor" onSubmit={submitEditor}>
          <header className="templateEditorHeader">
            <span className="templateEditorIcon" aria-hidden="true">
              {editor.mode === 'create' ? <Plus /> : <Pencil />}
            </span>
            <div>
              <span className="eyebrow">{editor.mode === 'create' ? 'Nuovo prodotto' : 'Modifica prodotto'}</span>
              <strong>{editor.mode === 'create' ? 'Aggiungi un risultato rapido' : `Prodotto ${editor.originalId}`}</strong>
              <p>{editor.mode === 'create' ? 'Inserisci l’ID PrestaShop e il nome mostrato nei risultati.' : 'Aggiorna i dati utilizzati nella ricerca rapida.'}</p>
            </div>
          </header>
          <div className="templateEditorFields">
            <Field label="ID prodotto" hint="ID numerico presente in PrestaShop.">
              <input
                value={editor.id}
                onChange={(event) => setEditor({ ...editor, id: event.target.value })}
                inputMode="numeric"
                pattern="[0-9]+"
                placeholder="Es. 609287"
                required
              />
            </Field>
            <Field label="Nome visualizzato" hint="È il testo che apparirà nei risultati rapidi.">
              <input
                value={editor.name}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                placeholder="Nome completo del prodotto"
                required
              />
            </Field>
          </div>
          <div className="templateEditorActions">
            <IconButton type="submit" icon={Check} busy={busy === 'template-item-save'} variant="primary">
              {editor.mode === 'create' ? 'Aggiungi' : 'Salva modifiche'}
            </IconButton>
            <IconButton type="button" icon={X} onClick={() => setEditor(null)} variant="ghost">Annulla</IconButton>
          </div>
        </form>
      ) : null}

      {actionError || error ? (
        <div className="alert alert-error" role="alert">
          <AlertTriangle className="icon" aria-hidden="true" />
          {actionError || error}
        </div>
      ) : null}

      {items.length ? (
        <div className="templateTableWrap">
          <table className="templateTable">
            <colgroup>
              <col className="templateIdColumn" />
              <col />
              <col className="templateActionsColumn" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">ID prodotto</th>
                <th scope="col">Nome visualizzato</th>
                <th scope="col">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="ID"><span className="templateProductId">{item.id}</span></td>
                  <td data-label="Nome"><span className="templateProductName">{item.name}</span></td>
                  <td className="templateActionsCell">
                    <div className="templateRowActions">
                      {deleteTarget?.id === item.id ? (
                        <div className="templateDeleteConfirm" role="group" aria-label={`Conferma eliminazione di ${item.name}`}>
                          <span>Eliminare?</span>
                          <IconButton
                            type="button"
                            icon={Trash2}
                            busy={busy === 'template-item-delete'}
                            onClick={confirmDelete}
                            variant="danger"
                          >
                            Conferma
                          </IconButton>
                          <IconButton type="button" icon={X} onClick={() => setDeleteTarget(null)} variant="ghost">Annulla</IconButton>
                        </div>
                      ) : (
                        <>
                          <IconButton type="button" icon={Pencil} onClick={() => openEdit(item)} variant="ghost">Modifica</IconButton>
                          <IconButton
                            type="button"
                            icon={Trash2}
                            onClick={() => {
                              setEditor(null);
                              setActionError('');
                              setDeleteTarget(item);
                            }}
                            variant="subtleDanger"
                          >
                            Elimina
                          </IconButton>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <div className="emptyState">
          <PackageSearch className="titleIcon" aria-hidden="true" />
          <strong>{query ? 'Nessun prodotto corrisponde alla ricerca' : 'Nessun risultato rapido disponibile'}</strong>
          <span>{query ? 'Prova con un altro ID o nome.' : 'Aggiungi il primo prodotto oppure importa un file CSV dalle impostazioni.'}</span>
          {query
            ? <IconButton type="button" icon={X} onClick={onClear} variant="ghost">Azzera ricerca</IconButton>
            : <IconButton type="button" icon={Plus} onClick={openCreate} variant="primary">Aggiungi prodotto</IconButton>}
        </div>
      ) : null}

      {pagination.totalItems > 0 ? (
        <nav className="templatePagination" aria-label="Paginazione risultati rapidi">
          <span aria-live="polite">
            Pagina {pagination.page} di {pagination.totalPages} · {pagination.totalItems} risultati
          </span>
          <div>
            <IconButton
              type="button"
              icon={ChevronLeft}
              disabled={!pagination.hasPrevious}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              Indietro
            </IconButton>
            <IconButton
              type="button"
              icon={ChevronRight}
              disabled={!pagination.hasNext}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              Avanti
            </IconButton>
          </div>
        </nav>
      ) : null}
    </section>
  );
}

export function LogsPage({
  logs,
  logFilter,
  logQuery,
  logDateFrom = '',
  logDateTo = '',
  pagination = {
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
    totalAll: 0,
    hasPrevious: false,
    hasNext: false,
  },
  setLogQuery,
  setLogDateFrom = () => {},
  setLogDateTo = () => {},
  onFilterChange = () => {},
  onSearch = () => {},
  onClear = () => {},
  onPageChange = () => {},
  onRefresh,
  busy,
  error,
  hasAnyLogs = false,
}) {
  const filtersActive = logFilter !== 'all' || Boolean(logQuery || logDateFrom || logDateTo);
  const firstPage = Math.max(1, pagination.page - 2);
  const lastPage = Math.min(pagination.totalPages, pagination.page + 2);
  const visiblePages = Array.from(
    { length: Math.max(lastPage - firstPage + 1, 0) },
    (_, index) => firstPage + index,
  );

  return (
    <section className="panel logsPage">
      <PanelHeader title="Registro modifiche" subtitle="Archivio permanente di verifiche, modifiche reali, errori e backup." action={<IconButton icon={RefreshCw} busy={busy === 'logs'} onClick={onRefresh}>Aggiorna</IconButton>} />
      <form className="logToolbar" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
        <div className="segments">
          {['all', 'real', 'simulation', 'error'].map((value) => (
            <button
              type="button"
              key={value}
              className={logFilter === value ? 'active' : ''}
              aria-pressed={logFilter === value}
              onClick={() => onFilterChange(value)}
            >
              {value === 'all' ? 'Tutti' : value === 'real' ? 'Reali' : value === 'simulation' ? 'Verifiche' : 'Errori'}
            </button>
          ))}
        </div>
        <label className="logSearchField">
          <span>Cerca</span>
          <input value={logQuery} onChange={(event) => setLogQuery(event.target.value)} placeholder="Ordine, riga, prodotto o backup" />
        </label>
        <label className="logDateField">
          <span>Dal</span>
          <input type="date" value={logDateFrom} max={logDateTo || undefined} onChange={(event) => setLogDateFrom(event.target.value)} />
        </label>
        <label className="logDateField">
          <span>Al</span>
          <input type="date" value={logDateTo} min={logDateFrom || undefined} onChange={(event) => setLogDateTo(event.target.value)} />
        </label>
        <IconButton type="submit" icon={Search} busy={busy === 'logs'} variant="primary">Cerca</IconButton>
        {filtersActive ? <IconButton type="button" icon={X} onClick={onClear} variant="ghost">Azzera</IconButton> : null}
      </form>
      <div className="logList">
        {error ? (
          <div className="emptyState" role="alert" aria-labelledby="logsErrorTitle">
            <AlertTriangle className="titleIcon" aria-hidden="true" />
            <strong id="logsErrorTitle">Impossibile caricare i log</strong>
            <span>{error}</span>
            <IconButton icon={RefreshCw} busy={busy === 'logs'} onClick={onRefresh} variant="primary">
              Riprova
            </IconButton>
          </div>
        ) : logs.length ? (
          logs.map((entry) => {
            const preview = entry.preview || {};
            const result = entry.status === 'ok' ? 'OK' : 'Errore';
            return (
              <details key={entry.id} className="logEntry">
                <summary>
                  <span className="logSummaryMain">
                    <span className="logSummaryTitle">
                      <Badge tone={entry.status === 'ok' ? 'ok' : 'error'}>{result}</Badge>
                      <strong>{entry.simulate ? 'Verifica senza modifiche' : 'Modifica reale'}</strong>
                    </span>
                    <span className="logSummaryMeta">
                      {shortDate(entry.at)} · Ordine {preview.orderId || '-'} · Riga {preview.orderDetailId || entry.orderDetailId || '-'}
                    </span>
                  </span>
                  <span className="logExpandHint">Dettagli</span>
                </summary>
                <div className="logDetail">
                  <div className="logDetailGrid">
                    <div><span>Ordine</span><strong>{preview.orderId || '-'}</strong></div>
                    <div><span>Riga ordine</span><strong>{preview.orderDetailId || entry.orderDetailId || '-'}</strong></div>
                    <div><span>Quantità</span><strong>{preview.productQuantity || '-'}</strong></div>
                    <div><span>Prezzo mantenuto</span><strong>{money(preview.totalPriceTaxIncl)}</strong></div>
                  </div>
                  <div className="logChange">
                    <div><span>Prodotto precedente</span><strong>{preview.oldProductName || '-'}</strong><small>{preview.oldProductReference || 'Senza riferimento'}</small></div>
                    <ChevronRight className="icon" aria-hidden="true" />
                    <div><span>Prodotto nuovo</span><strong>{preview.newProductName || '-'}</strong><small>{preview.newProductReference || 'Senza riferimento'}</small></div>
                  </div>
                  {entry.backupFile ? <div className="logDetailNote"><Archive className="icon" /><span>Backup: <strong>{entry.backupFile}</strong></span></div> : null}
                  {entry.error ? <div className="alert alert-error"><AlertTriangle className="icon" />{entry.error}</div> : null}
                </div>
              </details>
            );
          })
        ) : (
          <div className="emptyState logEmptyState">
            <FileClock className="titleIcon" aria-hidden="true" />
            <strong>{hasAnyLogs ? 'Nessun log corrisponde ai filtri' : 'Nessun log disponibile'}</strong>
            <span>
              {hasAnyLogs
                ? 'Cambia tipo di operazione, testo o intervallo di date.'
                : 'Verifiche, modifiche reali ed errori compariranno qui.'}
            </span>
          </div>
        )}
      </div>
      {!error && pagination.totalItems > 0 ? (
        <nav className="logPagination" aria-label="Paginazione registro modifiche">
          <span className="logPaginationSummary" aria-live="polite">
            Pagina {pagination.page} di {pagination.totalPages} · {pagination.totalItems} risultati
          </span>
          <div className="logPaginationControls">
            <IconButton
              type="button"
              icon={ChevronLeft}
              disabled={!pagination.hasPrevious}
              onClick={() => onPageChange(pagination.page - 1)}
              aria-label="Pagina precedente"
            >
              Indietro
            </IconButton>
            {visiblePages.map((pageNumber) => (
              <button
                type="button"
                key={pageNumber}
                className={cx('logPageButton', pageNumber === pagination.page && 'active')}
                aria-current={pageNumber === pagination.page ? 'page' : undefined}
                aria-label={`Pagina ${pageNumber}`}
                onClick={() => onPageChange(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
            <IconButton
              type="button"
              icon={ChevronRight}
              disabled={!pagination.hasNext}
              onClick={() => onPageChange(pagination.page + 1)}
              aria-label="Pagina successiva"
            >
              Avanti
            </IconButton>
          </div>
        </nav>
      ) : null}
    </section>
  );
}

if (typeof document !== 'undefined') {
  createRoot(document.getElementById('root')).render(<App />);
}
