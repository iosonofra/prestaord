import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrestashopClient } from './prestashopClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '..', 'app-config.json');
const orderCachePath = path.join(__dirname, '..', 'order-cache.json');
const productTemplatesPath = path.join(__dirname, '..', 'templates_export.csv');
const backupsPath = path.join(__dirname, '..', 'backups');
const logsPath = path.join(__dirname, '..', 'logs');
const changesLogPath = path.join(logsPath, 'changes.jsonl');
const app = express();
const port = Number(process.env.PORT || 3000);
const sessions = new Set();
const orderCacheSyncJobs = new Map();
let activeOrderCacheSyncJobId = '';
const orderCacheHourlyIntervalMs = 60 * 60 * 1000;
let orderCacheHourlyTimer = null;
let orderCacheHourlyNextRunAt = '';
let orderCacheHourlyLastRunAt = '';
let productTemplatesCache = {
  mtimeMs: 0,
  products: [],
};

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

async function readLocalConfig() {
  try {
    const content = await fs.readFile(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeLocalConfig(config) {
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function appendChangeLog(entry) {
  await fs.mkdir(logsPath, { recursive: true });
  await fs.appendFile(changesLogPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

async function backupOrderDetail(prepared) {
  await fs.mkdir(backupsPath, { recursive: true });
  const fileName = `order-detail-${prepared.orderDetailId}-${timestampId()}.json`;
  const filePath = path.join(backupsPath, fileName);
  await fs.writeFile(filePath, `${JSON.stringify(prepared.original, null, 2)}\n`, 'utf8');
  return fileName;
}

async function readRecentLogs(limit = 50) {
  try {
    const content = await fs.readFile(changesLogPath, 'utf8');
    const lines = content
      .trim()
      .split('\n')
      .filter(Boolean);
    return lines
      .map((line, index) => ({
        id: String(index + 1),
        ...JSON.parse(line),
      }))
      .slice(-limit)
      .reverse();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function safeBackupFileName(fileName) {
  const baseName = path.basename(String(fileName || ''));
  if (baseName !== fileName || !/^order-detail-\d+-[\w-]+\.json$/.test(baseName)) {
    return null;
  }
  return baseName;
}

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells.map((value) => value.trim());
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearch(value) {
  return String(value || '').toLocaleLowerCase('it-IT');
}

async function readProductTemplates() {
  try {
    const stat = await fs.stat(productTemplatesPath);
    if (productTemplatesCache.products.length && productTemplatesCache.mtimeMs === stat.mtimeMs) {
      return productTemplatesCache.products;
    }

    const content = await fs.readFile(productTemplatesPath, 'utf8');
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    const [headerLine, ...rows] = lines;
    const headers = parseCsvLine(headerLine).map((header) => normalizeSearch(header));
    const idIndex = headers.findIndex((header) => header === 'id');
    const nameIndex = headers.findIndex((header) => ['nome', 'name', 'sku'].includes(header));

    const products = rows.map((line) => {
      const cells = parseCsvLine(line);
      const id = String(cells[idIndex] || '').trim();
      const rawName = String(cells[nameIndex] || '').trim();
      const label = stripHtml(rawName);
      return {
        id,
        label,
        rawName,
        searchText: normalizeSearch(`${id} ${label} ${rawName}`),
      };
    }).filter((product) => /^\d+$/.test(product.id) && product.label);

    productTemplatesCache = {
      mtimeMs: stat.mtimeMs,
      products,
    };
    return products;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function searchProductTemplates(query, limit = 8) {
  const products = await readProductTemplates();
  const needle = normalizeSearch(query).trim();
  if (!needle) return [];
  const max = Math.min(Math.max(Number(limit || 8), 1), 20);

  return products
    .filter((product) => product.searchText.includes(needle))
    .slice(0, max)
    .map(({ id, label }) => ({ id, label }));
}

function cleanOrderStates(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values
    .map((item) => String(item || '').trim())
    .filter((item) => /^\d+$/.test(item)))];
}

function cleanBatchSize(value) {
  const parsed = Math.trunc(Number(value || 50));
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 50), 100);
}

function cleanMaxCacheOrders(value) {
  const parsed = Math.trunc(Number(value || 100));
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(parsed, 50), 1000);
}

async function readOrderCache() {
  try {
    const content = await fs.readFile(orderCachePath, 'utf8');
    const cache = JSON.parse(content);
    return {
      syncedAt: cache.syncedAt || '',
      filters: cache.filters || {},
      batchSize: cache.batchSize || '',
      maxOrders: cache.maxOrders || '',
      totalFound: cache.totalFound ?? null,
      hasMore: Boolean(cache.hasMore),
      syncMode: cache.syncMode || '',
      orders: Array.isArray(cache.orders) ? cache.orders.map(sanitizeOrderCacheEntry) : [],
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { syncedAt: '', filters: {}, orders: [] };
    throw error;
  }
}

async function writeOrderCache(cache) {
  const cleanCache = {
    ...cache,
    orders: Array.isArray(cache.orders) ? cache.orders.map(sanitizeOrderCacheEntry) : [],
  };
  await fs.writeFile(orderCachePath, `${JSON.stringify(cleanCache, null, 2)}\n`, 'utf8');
}

function sanitizeOrderCacheEntry(order) {
  const {
    note,
    notesLoaded,
    notesUnavailable,
    messages,
    messagesUnavailable,
    ...cleanOrder
  } = order || {};
  return cleanOrder;
}

function cacheSearch(orders, query, limit) {
  const trimmed = String(query || '').trim().toLocaleLowerCase('it-IT');
  const max = Math.min(Math.max(Number(limit || 20), 1), 1000);
  if (!trimmed) return orders.slice(0, max);

  return orders.filter((order) => {
    return String(order.id || '').toLocaleLowerCase('it-IT').includes(trimmed)
      || String(order.reference || '').toLocaleLowerCase('it-IT').includes(trimmed);
  }).slice(0, max);
}

function hasOrderProducts(order) {
  return Array.isArray(order?.products) && order.products.length > 0;
}

function hasOrderCustomer(order) {
  return Boolean(String(order?.customerName || '').trim());
}

async function enrichOrderProducts(client, orders, limit = 50) {
  const max = Math.min(Math.max(Number(limit || 0), 0), orders.length);
  const enriched = [];

  for (let index = 0; index < orders.length; index += 1) {
    const order = orders[index];
    if (index >= max || hasOrderProducts(order)) {
      enriched.push(order);
      continue;
    }

    try {
      const details = await client.getOrderDetails(order.id, { timeoutMs: 12000 });
      const products = details.rows.map((row) => ({
        id: row.id,
        productId: row.productId,
        productName: row.productName,
        productReference: row.productReference,
        productQuantity: row.productQuantity,
      }));
      enriched.push({
        ...order,
        customerId: order.customerId || details.customerId,
        products,
      });
    } catch {
      enriched.push({ ...order, products: [] });
    }
  }

  return enriched;
}

function isPrestashopTimeout(error) {
  return String(error?.message || '').includes('PrestaShop non ha risposto entro');
}

function isPrestashopRecoverableListError(error) {
  return isPrestashopTimeout(error) || Number(error?.status || 0) >= 500;
}

function sortOrdersDesc(orders) {
  return [...orders].sort((a, b) => {
    const idDelta = Number(b.id || 0) - Number(a.id || 0);
    if (idDelta) return idDelta;
    return String(b.dateAdd || '').localeCompare(String(a.dateAdd || ''));
  });
}

function dedupeOrdersById(orders) {
  const seen = new Set();
  const result = [];

  for (const order of orders) {
    const id = String(order?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(order);
  }

  return result;
}

async function listOrdersPageAdaptive(client, filters, { offset = 0, limit = 50 } = {}, onProgress = () => {}) {
  let currentLimit = Math.min(Math.max(Math.trunc(Number(limit || 50)), 1), 100);
  let lastError = null;

  while (currentLimit >= 10) {
    try {
      const page = await client.listOrdersPage(filters, { offset, limit: currentLimit });
      return { page, batchLimit: currentLimit };
    } catch (error) {
      lastError = error;
      if (!isPrestashopRecoverableListError(error) || currentLimit <= 10) break;
      currentLimit = Math.max(10, Math.floor(currentLimit / 2));
      onProgress({
        phase: 'retrying',
        lastBatchCount: 0,
        batchSize: currentLimit,
      });
    }
  }

  throw lastError;
}

async function enrichOrderCustomers(client, orders, limit = 100) {
  const max = Math.min(Math.max(Number(limit || 0), 0), orders.length);
  const targetOrders = orders
    .slice(0, max)
    .filter((order) => !hasOrderCustomer(order) && String(order.customerId || '').trim());
  const customerIds = targetOrders.map((order) => order.customerId);

  if (!customerIds.length) return orders;

  try {
    const customers = await client.listCustomersByIds(customerIds);
    const customerById = new Map(customers.map((customer) => [String(customer.id), customer]));
    return orders.map((order) => {
      const customer = customerById.get(String(order.customerId));
      if (!customer?.name) return order;
      return { ...order, customerName: customer.name };
    });
  } catch {
    return orders;
  }
}

async function enrichOrderSummaries(client, orders, limit = 50) {
  const withCustomers = await enrichOrderCustomers(client, orders, limit);
  return enrichOrderProducts(client, withCustomers, limit);
}

function orderMatchesQueryFilters(order, filters = {}) {
  const states = cleanOrderStates(filters.orderStates || filters.orderState);
  const dateFrom = String(filters.orderDateFrom || '').trim();
  const dateTo = String(filters.orderDateTo || '').trim();
  const dateAdd = String(order.dateAdd || order.date_add || '').slice(0, 10);

  if (states.length && !states.includes(String(order.currentState || order.current_state || ''))) return false;
  if (dateFrom && dateAdd && dateAdd < dateFrom) return false;
  if (dateTo && dateAdd && dateAdd > dateTo) return false;
  return true;
}

function cleanOrderFeedLimit(value, fallback) {
  const parsed = Math.trunc(Number(value || fallback || 20));
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(parsed, 1), 1000);
}

function sameStringArray(a = [], b = []) {
  const left = [...a].map(String).sort();
  const right = [...b].map(String).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function cacheMatchesConfig(cache, config) {
  return sameStringArray(cache.filters?.orderStates || [], config.orderStates || [])
    && String(cache.filters?.orderDateFrom || '') === String(config.orderDateFrom || '')
    && String(cache.filters?.orderDateTo || '') === String(config.orderDateTo || '');
}

async function getConfig() {
  const localConfig = await readLocalConfig();
  const orderStates = cleanOrderStates(localConfig.orderStates || localConfig.orderState);
  const defaultOrderState = cleanOrderStates(localConfig.defaultOrderState)[0] || '';
  return {
    baseUrl: localConfig.baseUrl || process.env.PRESTASHOP_URL || '',
    apiKey: localConfig.apiKey || process.env.PRESTASHOP_API_KEY || '',
    languageId: localConfig.languageId || '1',
    shopId: localConfig.shopId || '',
    orderState: orderStates[0] || '',
    orderStates,
    defaultOrderState: orderStates.includes(defaultOrderState) ? defaultOrderState : '',
    orderDateFrom: localConfig.orderDateFrom || '',
    orderDateTo: localConfig.orderDateTo || '',
    orderLimit: localConfig.orderLimit || '20',
    cacheAutoSync: Boolean(localConfig.cacheAutoSync),
    cacheHourlySync: Boolean(localConfig.cacheHourlySync),
    cacheBatchSize: String(cleanBatchSize(localConfig.cacheBatchSize)),
    cacheMaxOrders: String(cleanMaxCacheOrders(localConfig.cacheMaxOrders)),
    requireConfirmCheck: localConfig.requireConfirmCheck !== false,
    appPassword: localConfig.appPassword || '',
  };
}

async function getClient() {
  const config = await getConfig();
  return new PrestashopClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    languageId: config.languageId,
  });
}

async function syncOrderCache(config = null, onProgress = () => {}) {
  const effectiveConfig = config || await getConfig();
  if (!effectiveConfig.orderStates.length) {
    throw new Error('Seleziona almeno uno stato ordine prima di sincronizzare la cache.');
  }
  const client = await getClient();
  const batchSize = cleanBatchSize(effectiveConfig.cacheBatchSize);
  const maxOrders = cleanMaxCacheOrders(effectiveConfig.cacheMaxOrders);
  const filters = {
    orderStates: effectiveConfig.orderStates,
    orderDateFrom: effectiveConfig.orderDateFrom,
    orderDateTo: effectiveConfig.orderDateTo,
  };
  const orders = [];
  let offset = 0;
  let totalFound = 0;
  let lastBatchCount = 0;
  let exhausted = false;

  onProgress({
    phase: 'start',
    foundCount: 0,
    savedCount: 0,
    batchSize,
    maxOrders,
    filters,
  });

  while (orders.length < maxOrders) {
    onProgress({
      phase: 'fetching',
      foundCount: totalFound,
      savedCount: orders.length,
      offset,
      batchSize,
      maxOrders,
      filters,
    });
    const { page, batchLimit: actualBatchSize } = await listOrdersPageAdaptive(client, filters, {
      offset,
      limit: Math.min(batchSize, maxOrders - orders.length),
    }, (progress) => onProgress({
      ...progress,
      foundCount: totalFound,
      savedCount: orders.length,
      offset,
      maxOrders,
      filters,
    }));
    lastBatchCount = page.length;
    totalFound += page.length;

    onProgress({
      phase: 'enriching',
      foundCount: totalFound,
      savedCount: orders.length,
      offset,
      batchSize: actualBatchSize,
      lastBatchCount,
      maxOrders,
      filters,
    });
    const enrichedPage = await enrichOrderSummaries(client, page, page.length);
    orders.push(...enrichedPage);

    onProgress({
      phase: 'saving',
      foundCount: totalFound,
      savedCount: orders.length,
      offset,
      batchSize,
      lastBatchCount,
      maxOrders,
      filters,
    });

    if (page.length < actualBatchSize) {
      exhausted = true;
      break;
    }
    offset += page.length;
  }

  let hasMore = false;
  if (!exhausted && orders.length >= maxOrders && lastBatchCount > 0) {
    const { page: nextPage } = await listOrdersPageAdaptive(client, filters, {
      offset: orders.length,
      limit: 1,
    });
    hasMore = nextPage.length > 0;
    exhausted = !hasMore;
  }

  const cache = {
    syncedAt: new Date().toISOString(),
    filters,
    batchSize,
    maxOrders,
    hasMore,
    totalFound: exhausted ? orders.length : null,
    orders,
  };
  await writeOrderCache(cache);
  onProgress({
    phase: 'done',
    foundCount: totalFound,
    savedCount: orders.length,
    batchSize,
    lastBatchCount,
    maxOrders,
    hasMore,
    totalFound: cache.totalFound,
    filters,
  });
  return cache;
}

async function syncOrderCacheIncremental(config = null, onProgress = () => {}) {
  const effectiveConfig = config || await getConfig();
  if (!effectiveConfig.orderStates.length) {
    throw new Error('Seleziona almeno uno stato ordine prima di sincronizzare la cache.');
  }

  const client = await getClient();
  const currentCache = await readOrderCache();
  const batchSize = cleanBatchSize(effectiveConfig.cacheBatchSize);
  const maxOrders = cleanMaxCacheOrders(effectiveConfig.cacheMaxOrders);
  const filters = {
    orderStates: effectiveConfig.orderStates,
    orderDateFrom: effectiveConfig.orderDateFrom,
    orderDateTo: effectiveConfig.orderDateTo,
  };
  const existingOrders = currentCache.orders.filter((order) => orderMatchesQueryFilters(order, filters));
  const existingIds = new Set(existingOrders.map((order) => String(order.id)));
  const newOrders = [];
  let offset = 0;
  let totalFound = 0;
  let lastBatchCount = 0;
  let exhausted = false;

  onProgress({
    phase: 'start',
    foundCount: 0,
    savedCount: existingOrders.length,
    batchSize,
    maxOrders,
    filters,
  });

  while (newOrders.length < maxOrders) {
    const savedCount = Math.min(existingOrders.length + newOrders.length, maxOrders);
    onProgress({
      phase: 'fetching',
      foundCount: totalFound,
      savedCount,
      offset,
      batchSize,
      maxOrders,
      filters,
    });

    const { page, batchLimit: actualBatchSize } = await listOrdersPageAdaptive(client, filters, {
      offset,
      limit: Math.min(batchSize, maxOrders - newOrders.length),
    }, (progress) => onProgress({
      ...progress,
      foundCount: totalFound,
      savedCount,
      offset,
      maxOrders,
      filters,
    }));
    lastBatchCount = page.length;
    totalFound += page.length;

    const missingPage = page.filter((order) => {
      const id = String(order.id || '');
      return id && !existingIds.has(id);
    });

    if (!missingPage.length) {
      exhausted = page.length < actualBatchSize;
      break;
    }

    onProgress({
      phase: 'enriching',
      foundCount: totalFound,
      savedCount,
      offset,
      batchSize: actualBatchSize,
      lastBatchCount,
      maxOrders,
      filters,
    });

    const slotsLeft = Math.max(maxOrders - newOrders.length, 0);
    const enrichedPage = await enrichOrderSummaries(client, missingPage.slice(0, slotsLeft), slotsLeft);
    for (const order of enrichedPage) {
      existingIds.add(String(order.id));
      newOrders.push(order);
    }

    onProgress({
      phase: 'saving',
      foundCount: totalFound,
      savedCount: Math.min(existingOrders.length + newOrders.length, maxOrders),
      offset,
      batchSize: actualBatchSize,
      lastBatchCount,
      maxOrders,
      filters,
    });

    if (page.length < actualBatchSize) {
      exhausted = true;
      break;
    }
    offset += page.length;
  }

  const mergedOrders = dedupeOrdersById(sortOrdersDesc([...newOrders, ...existingOrders])).slice(0, maxOrders);
  const hasMore = !exhausted && mergedOrders.length >= maxOrders;
  const cache = {
    syncedAt: new Date().toISOString(),
    filters,
    batchSize,
    maxOrders,
    hasMore,
    totalFound: hasMore ? null : mergedOrders.length,
    syncMode: 'incremental',
    orders: mergedOrders,
  };

  await writeOrderCache(cache);
  onProgress({
    phase: 'done',
    foundCount: totalFound,
    savedCount: mergedOrders.length,
    newCount: newOrders.length,
    batchSize,
    lastBatchCount,
    maxOrders,
    hasMore,
    totalFound: cache.totalFound,
    filters,
  });
  return cache;
}

function publicSyncJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    foundCount: job.foundCount,
    savedCount: job.savedCount,
    totalFound: job.totalFound,
    hasMore: job.hasMore,
    batchSize: job.batchSize,
    maxOrders: job.maxOrders,
    lastBatchCount: job.lastBatchCount,
    offset: job.offset,
    filters: job.filters,
    trigger: job.trigger,
    incremental: Boolean(job.incremental),
    newCount: job.newCount || 0,
  };
}

function startOrderCacheSyncJob(config, options = {}) {
  const activeJob = orderCacheSyncJobs.get(activeOrderCacheSyncJobId);
  if (activeJob?.status === 'running') return activeJob;

  const incremental = Boolean(options.incremental);
  const job = {
    id: randomToken(),
    status: 'running',
    phase: 'queued',
    error: '',
    trigger: options.trigger || 'manual',
    incremental,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    foundCount: 0,
    savedCount: 0,
    newCount: 0,
    totalFound: null,
    hasMore: false,
    batchSize: cleanBatchSize(config.cacheBatchSize),
    maxOrders: cleanMaxCacheOrders(config.cacheMaxOrders),
    lastBatchCount: 0,
    offset: 0,
    filters: {
      orderStates: config.orderStates,
      orderDateFrom: config.orderDateFrom,
      orderDateTo: config.orderDateTo,
    },
  };

  orderCacheSyncJobs.set(job.id, job);
  activeOrderCacheSyncJobId = job.id;

  const syncRunner = incremental ? syncOrderCacheIncremental : syncOrderCache;
  syncRunner(config, (progress) => {
    Object.assign(job, progress);
  }).then((cache) => {
    Object.assign(job, {
      status: 'done',
      phase: 'done',
      finishedAt: cache.syncedAt,
      foundCount: cache.orders.length,
      savedCount: cache.orders.length,
      newCount: job.newCount || 0,
      totalFound: cache.totalFound,
      hasMore: cache.hasMore,
      batchSize: cache.batchSize,
      maxOrders: cache.maxOrders,
    });
  }).catch((error) => {
    Object.assign(job, {
      status: 'error',
      phase: 'error',
      error: error.message,
      finishedAt: new Date().toISOString(),
    });
  }).finally(() => {
    if (activeOrderCacheSyncJobId === job.id) activeOrderCacheSyncJobId = '';
    setTimeout(() => orderCacheSyncJobs.delete(job.id), 10 * 60 * 1000);
  });

  return job;
}

async function runHourlyOrderCacheSync() {
  const config = await getConfig();
  orderCacheHourlyLastRunAt = new Date().toISOString();
  orderCacheHourlyNextRunAt = new Date(Date.now() + orderCacheHourlyIntervalMs).toISOString();

  if (!config.cacheHourlySync || !config.baseUrl || !config.apiKey || !config.orderStates.length) return null;

  const activeJob = orderCacheSyncJobs.get(activeOrderCacheSyncJobId);
  if (activeJob?.status === 'running') return activeJob;

  return startOrderCacheSyncJob(config, {
    incremental: true,
    trigger: 'hourly',
  });
}

async function refreshOrderCacheHourlySchedule(config = null) {
  if (orderCacheHourlyTimer) {
    clearInterval(orderCacheHourlyTimer);
    orderCacheHourlyTimer = null;
  }

  const effectiveConfig = config || await getConfig();
  if (!effectiveConfig.cacheHourlySync) {
    orderCacheHourlyNextRunAt = '';
    return;
  }

  orderCacheHourlyNextRunAt = new Date(Date.now() + orderCacheHourlyIntervalMs).toISOString();
  orderCacheHourlyTimer = setInterval(() => {
    runHourlyOrderCacheSync().catch((error) => {
      console.error('Sincronizzazione cache oraria non riuscita:', error);
    });
  }, orderCacheHourlyIntervalMs);
  orderCacheHourlyTimer.unref?.();
}

function randomToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function requestToken(req) {
  return String(req.headers['x-app-session'] || '');
}

async function isAuthorized(req) {
  const config = await getConfig();
  if (!config.appPassword) return true;
  return sessions.has(requestToken(req));
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

app.get('/api/health', asyncRoute(async (req, res) => {
  const config = await getConfig();
  res.json({
    ok: true,
    configured: Boolean(config.baseUrl && config.apiKey),
  });
}));

app.get('/api/settings', asyncRoute(async (req, res) => {
  const config = await getConfig();
  const authorized = await isAuthorized(req);

  if (config.appPassword && !authorized) {
    res.json({
      locked: true,
      settings: {
        appPasswordEnabled: true,
      },
      configured: Boolean(config.baseUrl && config.apiKey),
    });
    return;
  }

  res.json({
    locked: false,
    settings: {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      orderState: config.orderState,
      orderStates: config.orderStates,
      defaultOrderState: config.defaultOrderState,
      orderDateFrom: config.orderDateFrom,
      orderDateTo: config.orderDateTo,
      orderLimit: config.orderLimit,
      cacheAutoSync: config.cacheAutoSync,
      cacheHourlySync: config.cacheHourlySync,
      cacheBatchSize: config.cacheBatchSize,
      cacheMaxOrders: config.cacheMaxOrders,
      requireConfirmCheck: config.requireConfirmCheck,
      appPasswordEnabled: Boolean(config.appPassword),
    },
    configured: Boolean(config.baseUrl && config.apiKey),
  });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const config = await getConfig();
  const password = String(req.body?.password || '');

  if (!config.appPassword) {
    const token = randomToken();
    sessions.add(token);
    res.json({ ok: true, token });
    return;
  }

  if (password !== config.appPassword) {
    res.status(401).json({ error: 'Password non valida.' });
    return;
  }

  const token = randomToken();
  sessions.add(token);
  res.json({ ok: true, token });
}));

app.post('/api/settings', asyncRoute(async (req, res) => {
  const currentConfig = await getConfig();
  if (currentConfig.appPassword && !(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const {
    baseUrl,
    apiKey,
    orderState,
    orderStates,
    defaultOrderState,
    orderDateFrom,
    orderDateTo,
    orderLimit,
    cacheAutoSync,
    cacheHourlySync,
    cacheBatchSize,
    cacheMaxOrders,
    requireConfirmCheck,
    appPassword,
  } = req.body || {};
  const existingConfig = await readLocalConfig();
  const cleanBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  const cleanApiKey = String(apiKey || '').trim();
  const cleanStates = cleanOrderStates(orderStates || orderState);
  const cleanDefaultOrderState = cleanOrderStates(defaultOrderState)[0] || cleanStates[0] || '';
  const cleanLimit = Math.min(Math.max(Number(orderLimit || 20), 1), 1000);

  if (!cleanBaseUrl || !cleanApiKey) {
    res.status(400).json({ error: 'URL negozio e API key sono obbligatori.' });
    return;
  }

  await writeLocalConfig({
    ...existingConfig,
    baseUrl: cleanBaseUrl,
    apiKey: cleanApiKey,
    orderState: cleanStates[0] || '',
    orderStates: cleanStates,
    defaultOrderState: cleanStates.includes(cleanDefaultOrderState) ? cleanDefaultOrderState : cleanStates[0] || '',
    orderDateFrom: String(orderDateFrom || '').trim(),
    orderDateTo: String(orderDateTo || '').trim(),
    orderLimit: String(Number.isFinite(cleanLimit) ? cleanLimit : 20),
    cacheAutoSync: Boolean(cacheAutoSync),
    cacheHourlySync: Boolean(cacheHourlySync),
    cacheBatchSize: String(cleanBatchSize(cacheBatchSize)),
    cacheMaxOrders: String(cleanMaxCacheOrders(cacheMaxOrders)),
    requireConfirmCheck: requireConfirmCheck !== false,
    appPassword: String(appPassword || '').trim(),
  });

  await refreshOrderCacheHourlySchedule();

  res.json({ ok: true });
}));

app.get('/api/order-states', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const client = await getClient();
  const states = await client.listOrderStates();
  res.json({ states });
}));

app.get('/api/order-cache/status', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const cache = await readOrderCache();
  const activeJob = orderCacheSyncJobs.get(activeOrderCacheSyncJobId);
  res.json({
    syncedAt: cache.syncedAt,
    count: cache.orders.length,
    filters: cache.filters,
    batchSize: cache.batchSize,
    maxOrders: cache.maxOrders,
    totalFound: cache.totalFound,
    hasMore: cache.hasMore,
    activeSync: publicSyncJob(activeJob),
    hourlySync: {
      enabled: Boolean((await getConfig()).cacheHourlySync),
      intervalMinutes: Math.round(orderCacheHourlyIntervalMs / 60000),
      lastRunAt: orderCacheHourlyLastRunAt,
      nextRunAt: orderCacheHourlyNextRunAt,
    },
  });
}));

app.post('/api/order-cache/sync', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const config = await getConfig();
  if (!config.orderStates.length) {
    res.status(400).json({ error: 'Seleziona almeno uno stato ordine prima di sincronizzare la cache.' });
    return;
  }

  const job = startOrderCacheSyncJob(config);
  res.status(job.status === 'running' ? 202 : 200).json({
    ok: true,
    job: publicSyncJob(job),
  });
}));

app.get('/api/order-cache/sync/:jobId', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const job = orderCacheSyncJobs.get(String(req.params.jobId || ''));
  if (!job) {
    res.status(404).json({ error: 'Sincronizzazione non trovata o gia archiviata.' });
    return;
  }

  res.json({ job: publicSyncJob(job) });
}));

app.get('/api/orders', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const config = await getConfig();
  const cache = await readOrderCache();
  const sourceMode = String(req.query.source || 'auto');
  const query = String(req.query.q || '').trim();
  const requestedLimit = req.query.limit
    ? cleanOrderFeedLimit(req.query.limit, config.orderLimit)
    : config.orderLimit;
  const requestedOrderStates = cleanOrderStates(req.query.orderStates || req.query.orderState);
  const quickFilters = {
    orderStates: requestedOrderStates,
    orderDateFrom: String(req.query.dateFrom || '').trim(),
    orderDateTo: String(req.query.dateTo || '').trim(),
  };
  const effectiveFilters = {
    orderStates: requestedOrderStates.length ? requestedOrderStates : config.orderStates,
    orderDateFrom: quickFilters.orderDateFrom || config.orderDateFrom,
    orderDateTo: quickFilters.orderDateTo || config.orderDateTo,
    orderLimit: requestedLimit,
  };
  const canUseCache = cache.orders.length && cacheMatchesConfig(cache, config);
  const cacheOrders = canUseCache
    ? cache.orders.filter((order) => orderMatchesQueryFilters(order, quickFilters))
    : [];

  if (sourceMode === 'cache') {
    let orders = cacheSearch(cacheOrders, query, requestedLimit);
    if (orders.some((order) => !hasOrderProducts(order) || !hasOrderCustomer(order))) {
      const client = await getClient();
      orders = await enrichOrderSummaries(client, orders, Math.min(requestedLimit, 50));
    }
    res.json({
      orders,
      source: 'cache',
      cache: canUseCache ? {
        syncedAt: cache.syncedAt,
        count: cache.orders.length,
      } : null,
    });
    return;
  }

  if (sourceMode !== 'live' && canUseCache) {
    let orders = cacheSearch(cacheOrders, query, requestedLimit);
    if (orders.some((order) => !hasOrderProducts(order) || !hasOrderCustomer(order))) {
      const client = await getClient();
      orders = await enrichOrderSummaries(client, orders, Math.min(requestedLimit, 50));
    }
    res.json({
      orders,
      source: 'cache',
      cache: {
        syncedAt: cache.syncedAt,
        count: cache.orders.length,
      },
    });
    return;
  }

  const client = await getClient();
  const orders = query
    ? await client.searchOrders(query, effectiveFilters)
    : await client.listOrdersPage(effectiveFilters, { limit: requestedLimit });
  const enrichedOrders = await enrichOrderSummaries(client, orders, Math.min(requestedLimit, 50));
  res.json({ orders: enrichedOrders, source: 'live' });
}));

app.get('/api/orders/:id', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const client = await getClient();
  const order = await client.getOrderDetails(req.params.id);
  res.json({ order });
}));

app.get('/api/products', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const client = await getClient();
  const products = await client.searchProducts(req.query.q);
  res.json({ products });
}));

app.get('/api/product-templates', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const products = await searchProductTemplates(req.query.q, req.query.limit);
  res.json({ products });
}));

app.get('/api/logs', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const logs = await readRecentLogs(50);
  res.json({ logs });
}));

app.delete('/api/logs', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  await fs.rm(changesLogPath, { force: true });
  res.json({ ok: true });
}));

app.use('/api/backups', (req, res, next) => {
  if (/%2f|%5c/i.test(req.url)) {
    res.status(400).json({ error: 'Nome backup non valido.' });
    return;
  }
  next();
});

app.get('/api/backups/:fileName', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const fileName = safeBackupFileName(req.params.fileName);
  if (!fileName) {
    res.status(400).json({ error: 'Nome backup non valido.' });
    return;
  }

  const filePath = path.join(backupsPath, fileName);
  await fs.access(filePath);
  res.download(filePath, fileName);
}));

app.post('/api/order-details/preview-replace-product', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const { orderDetailIds, productId } = req.body || {};

  if (!Array.isArray(orderDetailIds) || orderDetailIds.length === 0) {
    res.status(400).json({ error: 'Seleziona almeno una riga ordine.' });
    return;
  }

  if (!productId) {
    res.status(400).json({ error: 'Seleziona il prodotto da inserire.' });
    return;
  }

  const client = await getClient();
  const previews = [];

  for (const orderDetailId of orderDetailIds) {
    const prepared = await client.prepareOrderRowProductReplacement(orderDetailId, productId);
    previews.push(prepared.preview);
  }

  const productKeys = new Set(previews.map((preview) => `${preview.oldProductId}|${preview.oldProductReference}`));
  res.json({
    previews,
    sameOriginalProduct: productKeys.size <= 1,
  });
}));

app.post('/api/order-details/replace-product', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const { orderDetailIds, productId, simulate = false } = req.body || {};

  if (!Array.isArray(orderDetailIds) || orderDetailIds.length === 0) {
    res.status(400).json({ error: 'Seleziona almeno una riga ordine.' });
    return;
  }

  if (!productId) {
    res.status(400).json({ error: 'Seleziona il prodotto da inserire.' });
    return;
  }

  const client = await getClient();
  const results = [];
  const errors = [];

  for (const orderDetailId of orderDetailIds) {
    const startedAt = new Date().toISOString();

    try {
      const prepared = await client.prepareOrderRowProductReplacement(orderDetailId, productId);
      let backupFile = null;
      let result = null;

      if (!simulate) {
        backupFile = await backupOrderDetail(prepared);
        result = await client.replacePreparedOrderRowProduct(prepared);
      }

      const entry = {
        at: startedAt,
        simulate: Boolean(simulate),
        status: 'ok',
        backupFile,
        preview: prepared.preview,
      };
      await appendChangeLog(entry);

      results.push({
        ok: true,
        simulated: Boolean(simulate),
        backupFile,
        ...(result || {
          orderDetailId: prepared.orderDetailId,
          productId: prepared.newProduct.id,
          productName: prepared.newProduct.name,
          productReference: prepared.newProduct.reference,
        }),
      });
    } catch (error) {
      const entry = {
        at: startedAt,
        simulate: Boolean(simulate),
        status: 'error',
        orderDetailId: String(orderDetailId),
        productId: String(productId),
        error: error.message,
      };
      await appendChangeLog(entry);

      errors.push({
        ok: false,
        orderDetailId: String(orderDetailId),
        error: error.message,
      });
    }
  }

  res.json({
    updated: results,
    errors,
  });
}));

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: error.message || 'Errore inatteso.',
  });
});

app.listen(port, async () => {
  console.log(`Web app disponibile su http://localhost:${port}`);
  try {
    await refreshOrderCacheHourlySchedule();
  } catch (error) {
    console.error('Pianificazione cache ordini non riuscita:', error);
  }
});
