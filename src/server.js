import 'dotenv/config';
import express from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrestashopClient } from './prestashopClient.js';
import {
  canonicalizeOrder,
  canonicalizeOrders,
  normalizeCanonicalGroup,
  validateCanonicalGroups,
} from './productCanonicalization.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const dataRoot = process.env.APP_DATA_DIR ? path.resolve(process.env.APP_DATA_DIR) : projectRoot;
const configPath = path.join(dataRoot, 'app-config.json');
const orderCachePath = path.join(dataRoot, 'order-cache.json');
const productTemplatesPath = path.join(dataRoot, 'templates_export.csv');
const productCanonicalGroupsPath = path.join(dataRoot, 'product-canonical-groups.json');
const backupsPath = path.join(dataRoot, 'backups');
const logsPath = path.join(dataRoot, 'logs');
const changesLogPath = path.join(logsPath, 'changes.jsonl');
const builtFrontendPath = path.join(projectRoot, 'dist', 'app');
const legacyPublicPath = path.join(projectRoot, 'public');
const app = express();
const port = Number(process.env.PORT || 3000);
const bindHost = String(process.env.HOST || '127.0.0.1').trim();
const requestedSessionTtlMinutes = Number(process.env.APP_SESSION_TTL_MINUTES || 480);
const requestedSessionTtlMs = Number(process.env.APP_SESSION_TTL_MS);
const sessionTtlMs = Number.isFinite(requestedSessionTtlMs) && requestedSessionTtlMs > 0
  ? Math.max(requestedSessionTtlMs, 10)
  : Math.min(
    Math.max(Number.isFinite(requestedSessionTtlMinutes) ? requestedSessionTtlMinutes : 480, 1),
    24 * 60,
  ) * 60 * 1000;
const sessions = new Map();
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

app.use(express.json({ limit: '6mb' }));
app.use(express.static(builtFrontendPath));
app.use(express.static(legacyPublicPath));

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
  await fs.mkdir(dataRoot, { recursive: true });
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

function cleanLogDate(value) {
  const date = String(value || '').trim();
  if (!date) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return null;
  return date;
}

function logMatchesType(entry, type) {
  if (type === 'real') return !entry.simulate && entry.status === 'ok';
  if (type === 'simulation') return Boolean(entry.simulate);
  if (type === 'error') return entry.status === 'error';
  return true;
}

function logMatchesDate(entry, dateFrom, dateTo) {
  const timestamp = new Date(entry.at);
  if (Number.isNaN(timestamp.getTime())) return !dateFrom && !dateTo;
  if (dateFrom && timestamp < new Date(`${dateFrom}T00:00:00`)) return false;
  if (dateTo && timestamp > new Date(`${dateTo}T23:59:59.999`)) return false;
  return true;
}

async function readLogsPage({
  page = 1,
  pageSize = 20,
  type = 'all',
  query = '',
  dateFrom = '',
  dateTo = '',
} = {}) {
  try {
    const content = await fs.readFile(changesLogPath, 'utf8');
    const lines = content
      .trim()
      .split('\n')
      .filter(Boolean);
    const allLogs = lines.flatMap((line, index) => {
      try {
        return [{
          id: String(index + 1),
          ...JSON.parse(line),
        }];
      } catch {
        return [];
      }
    });
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase('it-IT');
    const filteredLogs = allLogs.filter((entry) => (
      logMatchesType(entry, type)
      && logMatchesDate(entry, dateFrom, dateTo)
      && (!normalizedQuery || JSON.stringify(entry).toLocaleLowerCase('it-IT').includes(normalizedQuery))
    )).reverse();
    const totalItems = filteredLogs.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const start = (currentPage - 1) * pageSize;

    return {
      logs: filteredLogs.slice(start, start + pageSize),
      pagination: {
        page: currentPage,
        pageSize,
        totalItems,
        totalPages,
        totalAll: allLogs.length,
        hasPrevious: currentPage > 1,
        hasNext: currentPage < totalPages,
      },
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        logs: [],
        pagination: {
          page: 1,
          pageSize,
          totalItems: 0,
          totalPages: 1,
          totalAll: 0,
          hasPrevious: false,
          hasNext: false,
        },
      };
    }
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

function parseCsvLine(line, delimiter = ',') {
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
    } else if (char === delimiter && !inQuotes) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells.map((value) => value.trim());
}

function parseProductTemplatesCsv(content, { strict = false } = {}) {
  const normalizedContent = String(content || '').replace(/^\uFEFF/, '');
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    if (strict) throw new Error('Il file CSV è vuoto.');
    return [];
  }

  const delimiter = parseCsvLine(lines[0], ';').length > parseCsvLine(lines[0], ',').length ? ';' : ',';
  const [headerLine, ...rows] = lines;
  const headers = parseCsvLine(headerLine, delimiter).map((header) => normalizeSearch(header));
  const idIndex = headers.findIndex((header) => header === 'id');
  const nameIndex = headers.findIndex((header) => ['nome', 'name', 'sku'].includes(header));
  if (idIndex < 0 || nameIndex < 0) {
    if (strict) throw new Error('Il CSV deve contenere le colonne ID e Nome, Name oppure SKU.');
    return [];
  }

  const seenIds = new Set();
  const products = rows.flatMap((line) => {
    const cells = parseCsvLine(line, delimiter);
    const id = String(cells[idIndex] || '').trim();
    const rawName = String(cells[nameIndex] || '').trim();
    const label = stripHtml(rawName);
    if (!/^\d+$/.test(id) || !label || seenIds.has(id)) return [];
    seenIds.add(id);
    return [{
      id,
      label,
      rawName,
      searchText: normalizeSearch(`${id} ${label} ${rawName}`),
    }];
  });

  if (strict && !products.length) {
    throw new Error('Il CSV non contiene prodotti validi con ID numerico e nome.');
  }
  return products;
}

function parseProductTemplatesDocument(content, { strict = false } = {}) {
  const normalizedContent = String(content || '').replace(/^\uFEFF/, '');
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    if (strict) throw new Error('Il file CSV è vuoto.');
    return {
      delimiter: ',',
      headers: ['ID', 'Nome'],
      idIndex: 0,
      nameIndex: 1,
      rows: [],
    };
  }

  const delimiter = parseCsvLine(lines[0], ';').length > parseCsvLine(lines[0], ',').length ? ';' : ',';
  const headers = parseCsvLine(lines[0], delimiter);
  const normalizedHeaders = headers.map((header) => normalizeSearch(header));
  const idIndex = normalizedHeaders.findIndex((header) => header === 'id');
  const nameIndex = normalizedHeaders.findIndex((header) => ['nome', 'name', 'sku'].includes(header));
  if (idIndex < 0 || nameIndex < 0) {
    if (strict) throw new Error('Il CSV deve contenere le colonne ID e Nome, Name oppure SKU.');
    return {
      delimiter,
      headers,
      idIndex,
      nameIndex,
      rows: [],
    };
  }

  return {
    delimiter,
    headers,
    idIndex,
    nameIndex,
    rows: lines.slice(1).map((line) => parseCsvLine(line, delimiter)),
  };
}

function serializeCsvCell(value, delimiter) {
  const text = String(value ?? '');
  if (!text.includes(delimiter) && !/["\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function serializeProductTemplatesDocument(document) {
  return [document.headers, ...document.rows]
    .map((row) => row.map((cell) => serializeCsvCell(cell, document.delimiter)).join(document.delimiter))
    .join('\n')
    .concat('\n');
}

function cleanProductTemplateItem(id, name) {
  const cleanId = String(id || '').trim();
  const cleanName = stripHtml(name);
  if (!/^\d+$/.test(cleanId)) {
    const error = new Error('L’ID prodotto deve contenere soltanto numeri.');
    error.statusCode = 400;
    throw error;
  }
  if (!cleanName) {
    const error = new Error('Inserisci il nome del prodotto.');
    error.statusCode = 400;
    throw error;
  }
  return { id: cleanId, name: cleanName };
}

async function backupAndWriteProductTemplates(csvContent) {
  let backupFile = '';
  try {
    await fs.access(productTemplatesPath);
    await fs.mkdir(backupsPath, { recursive: true });
    backupFile = `templates_export-${timestampId()}-${randomBytes(3).toString('hex')}.csv`;
    await fs.copyFile(productTemplatesPath, path.join(backupsPath, backupFile));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const temporaryPath = `${productTemplatesPath}.importing`;
  try {
    await fs.writeFile(temporaryPath, csvContent, 'utf8');
    await fs.rename(temporaryPath, productTemplatesPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
  productTemplatesCache = { mtimeMs: 0, products: [] };
  return backupFile;
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
    const products = parseProductTemplatesCsv(content);

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

async function productTemplatesStatus() {
  try {
    const stat = await fs.stat(productTemplatesPath);
    const products = await readProductTemplates();
    return {
      configured: true,
      fileName: path.basename(productTemplatesPath),
      count: products.length,
      updatedAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        configured: false,
        fileName: path.basename(productTemplatesPath),
        count: 0,
        updatedAt: '',
        sizeBytes: 0,
      };
    }
    throw error;
  }
}

async function importProductTemplatesCsv(fileName, content) {
  const safeFileName = path.basename(String(fileName || ''));
  if (safeFileName !== fileName || !/\.csv$/i.test(safeFileName)) {
    throw new Error('Seleziona un file CSV valido.');
  }
  const csvContent = String(content || '');
  if (Buffer.byteLength(csvContent, 'utf8') > 5 * 1024 * 1024) {
    throw new Error('Il file CSV supera il limite di 5 MB.');
  }

  const products = parseProductTemplatesCsv(csvContent, { strict: true });
  const backupFile = await backupAndWriteProductTemplates(csvContent);

  return {
    ...(await productTemplatesStatus()),
    importedCount: products.length,
    backupFile,
  };
}

async function readProductTemplateItems({ query = '', page = 1, pageSize = 25 } = {}) {
  const products = await readProductTemplates();
  const needle = normalizeSearch(query).trim();
  const filtered = needle
    ? products.filter((product) => product.searchText.includes(needle))
    : products;
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize).map(({ id, label }) => ({ id, name: label })),
    pagination: {
      page: currentPage,
      pageSize,
      totalItems,
      totalPages,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages,
    },
  };
}

async function mutateProductTemplateItem(action, currentId, payload = {}) {
  let content = '';
  try {
    content = await fs.readFile(productTemplatesPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT' || action !== 'create') throw error;
  }
  const document = parseProductTemplatesDocument(content, { strict: Boolean(content) });
  const rowIndex = document.rows.findIndex((row) => String(row[document.idIndex] || '').trim() === String(currentId || ''));

  if (action === 'delete') {
    if (rowIndex < 0) {
      const error = new Error('Risultato rapido non trovato.');
      error.statusCode = 404;
      throw error;
    }
    document.rows.splice(rowIndex, 1);
  } else {
    const item = cleanProductTemplateItem(payload.id, payload.name);
    const duplicateIndex = document.rows.findIndex(
      (row, index) => index !== rowIndex && String(row[document.idIndex] || '').trim() === item.id,
    );
    if (duplicateIndex >= 0) {
      const error = new Error(`Esiste già un risultato rapido con ID ${item.id}.`);
      error.statusCode = 409;
      throw error;
    }

    if (action === 'create') {
      const row = Array.from({ length: document.headers.length }, () => '');
      row[document.idIndex] = item.id;
      row[document.nameIndex] = item.name;
      document.rows.push(row);
    } else {
      if (rowIndex < 0) {
        const error = new Error('Risultato rapido non trovato.');
        error.statusCode = 404;
        throw error;
      }
      document.rows[rowIndex][document.idIndex] = item.id;
      document.rows[rowIndex][document.nameIndex] = item.name;
    }
  }

  const backupFile = await backupAndWriteProductTemplates(serializeProductTemplatesDocument(document));
  return {
    status: await productTemplatesStatus(),
    backupFile,
  };
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

async function readCanonicalGroups() {
  try {
    const document = JSON.parse(await fs.readFile(productCanonicalGroupsPath, 'utf8'));
    const groups = Array.isArray(document) ? document : document.groups;
    if (!Array.isArray(groups)) return [];
    const normalized = groups.map((group) => normalizeCanonicalGroup({
      ...group,
      id: group.id || `canonical-${group.motherProductId || group.mother_product_id}`,
    }, group));
    validateCanonicalGroups(normalized);
    return normalized;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeCanonicalGroups(groups) {
  validateCanonicalGroups(groups);
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(productCanonicalGroupsPath, `${JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    groups,
  }, null, 2)}\n`, 'utf8');
}

async function canonicalProductLabels() {
  const products = await readProductTemplates();
  return new Map(products.map((product) => [String(product.id), product.label]));
}

async function resolveCanonicalGroupProductNames(group) {
  const labels = await canonicalProductLabels();
  const productIds = [group.motherProductId, ...group.linkedProductIds];
  const productNames = { ...(group.productNames || {}) };
  const missingIds = [];

  for (const productId of productIds) {
    const catalogName = labels.get(String(productId));
    if (catalogName) productNames[productId] = catalogName;
    else if (!productNames[productId]) missingIds.push(productId);
  }

  if (missingIds.length) {
    try {
      const client = await getClient();
      const results = await Promise.allSettled(
        missingIds.map((productId) => client.getProduct(productId)),
      );
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        const product = result.value;
        if (String(product?.id || '') === String(missingIds[index]) && product?.name) {
          productNames[missingIds[index]] = String(product.name).trim();
        }
      });
    } catch {
      // The association remains valid even if PrestaShop is temporarily unavailable.
    }
  }

  return {
    ...group,
    productNames: Object.fromEntries(
      productIds
        .filter((productId) => productNames[productId])
        .map((productId) => [productId, productNames[productId]]),
    ),
  };
}

async function presentCanonicalGroups(groups) {
  const labels = await canonicalProductLabels();
  return groups.map((group) => ({
    ...group,
    motherProductName: labels.get(String(group.motherProductId))
      || group.productNames?.[group.motherProductId]
      || '',
    linkedProducts: group.linkedProductIds.map((productId) => ({
      id: productId,
      name: labels.get(String(productId)) || group.productNames?.[productId] || '',
    })),
  }));
}

async function applyCanonicalizationToOrders(orders) {
  const [groups, labels] = await Promise.all([
    readCanonicalGroups(),
    canonicalProductLabels(),
  ]);
  return canonicalizeOrders(orders, groups, labels);
}

async function applyCanonicalizationToOrder(order) {
  const [groups, labels] = await Promise.all([
    readCanonicalGroups(),
    canonicalProductLabels(),
  ]);
  return canonicalizeOrder(order, groups, labels);
}

async function mutateCanonicalGroup(action, currentId, payload = {}) {
  const groups = await readCanonicalGroups();
  const groupIndex = groups.findIndex((group) => group.id === String(currentId || ''));

  if (action === 'delete') {
    if (groupIndex < 0) {
      const error = new Error('Gruppo di prodotti non trovato.');
      error.statusCode = 404;
      throw error;
    }
    groups.splice(groupIndex, 1);
  } else if (action === 'create') {
    const group = await resolveCanonicalGroupProductNames(normalizeCanonicalGroup({
      ...payload,
      id: `canonical-${randomBytes(8).toString('hex')}`,
    }));
    groups.push(group);
  } else {
    if (groupIndex < 0) {
      const error = new Error('Gruppo di prodotti non trovato.');
      error.statusCode = 404;
      throw error;
    }
    groups[groupIndex] = await resolveCanonicalGroupProductNames({
      ...normalizeCanonicalGroup(payload, groups[groupIndex]),
      updatedAt: new Date().toISOString(),
    });
  }

  validateCanonicalGroups(groups);
  await writeCanonicalGroups(groups);
  return groups;
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

function cleanProductTemplateLimit(value) {
  const parsed = Math.trunc(Number(value || 8));
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(Math.max(parsed, 1), 20);
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

async function enrichOrderProducts(client, orders, limit = 50, onProgress = () => {}) {
  const max = Math.min(Math.max(Number(limit || 0), 0), orders.length);
  const enriched = [];

  for (let index = 0; index < orders.length; index += 1) {
    const order = orders[index];
    if (index >= max || hasOrderProducts(order)) {
      enriched.push(order);
      onProgress({ processedInBatch: index + 1, totalInBatch: max });
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
    onProgress({ processedInBatch: index + 1, totalInBatch: max });
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

async function enrichOrderSummaries(client, orders, limit = 50, onProgress = () => {}) {
  const withCustomers = await enrichOrderCustomers(client, orders, limit);
  return enrichOrderProducts(client, withCustomers, limit, onProgress);
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
    productTemplateLimit: String(cleanProductTemplateLimit(localConfig.productTemplateLimit)),
    requirePreflightCheck: localConfig.requirePreflightCheck !== false,
    requireConfirmCheck: localConfig.requireConfirmCheck !== false,
    appPassword: localConfig.appPassword || process.env.APP_PASSWORD || '',
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
    throw new Error('Seleziona almeno uno stato ordine prima di sincronizzare gli ordini.');
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
  let processedCount = 0;
  let importTotal = 0;
  let lastBatchCount = 0;
  let exhausted = false;

  onProgress({
    phase: 'start',
    foundCount: 0,
    savedCount: 0,
    processedCount: 0,
    importTotal: 0,
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
    importTotal += page.length;

    onProgress({
      phase: 'enriching',
      foundCount: totalFound,
      savedCount: orders.length,
      processedCount,
      importTotal,
      offset,
      batchSize: actualBatchSize,
      lastBatchCount,
      maxOrders,
      filters,
    });
    const enrichedPage = await enrichOrderSummaries(client, page, page.length, ({ processedInBatch }) => {
      processedCount = orders.length + processedInBatch;
      onProgress({
        phase: 'enriching',
        foundCount: totalFound,
        savedCount: orders.length,
        processedCount,
        importTotal,
        offset,
        batchSize: actualBatchSize,
        lastBatchCount,
        maxOrders,
        filters,
      });
    });
    orders.push(...enrichedPage);
    processedCount = orders.length;

    onProgress({
      phase: 'saving',
      foundCount: totalFound,
      savedCount: orders.length,
      processedCount,
      importTotal,
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
    try {
      const { page: nextPage } = await listOrdersPageAdaptive(client, filters, {
        offset: orders.length,
        limit: 1,
      });
      hasMore = nextPage.length > 0;
      exhausted = !hasMore;
    } catch (error) {
      hasMore = true;
      exhausted = false;
      console.warn('Controllo finale degli ordini sincronizzati non riuscito; salvo comunque i dati:', errorMessage(error));
    }
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
    processedCount,
    importTotal,
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
    throw new Error('Seleziona almeno uno stato ordine prima di sincronizzare gli ordini.');
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
  let processedCount = 0;
  let importTotal = 0;
  let lastBatchCount = 0;
  let exhausted = false;

  onProgress({
    phase: 'start',
    foundCount: 0,
    savedCount: existingOrders.length,
    processedCount: 0,
    importTotal: 0,
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

    const importPage = missingPage.slice(0, Math.max(maxOrders - newOrders.length, 0));
    importTotal += importPage.length;

    onProgress({
      phase: 'enriching',
      foundCount: totalFound,
      savedCount,
      processedCount,
      importTotal,
      offset,
      batchSize: actualBatchSize,
      lastBatchCount,
      maxOrders,
      filters,
    });

    const enrichedPage = await enrichOrderSummaries(client, importPage, importPage.length, ({ processedInBatch }) => {
      processedCount = newOrders.length + processedInBatch;
      onProgress({
        phase: 'enriching',
        foundCount: totalFound,
        savedCount,
        processedCount,
        importTotal,
        offset,
        batchSize: actualBatchSize,
        lastBatchCount,
        maxOrders,
        filters,
      });
    });
    for (const order of enrichedPage) {
      existingIds.add(String(order.id));
      newOrders.push(order);
    }
    processedCount = newOrders.length;

    onProgress({
      phase: 'saving',
      foundCount: totalFound,
      savedCount: Math.min(existingOrders.length + newOrders.length, maxOrders),
      processedCount,
      importTotal,
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
    processedCount,
    importTotal,
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
    processedCount: job.processedCount,
    importTotal: job.importTotal,
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
    processedCount: 0,
    importTotal: 0,
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
      processedCount: job.processedCount || 0,
      importTotal: job.importTotal || 0,
      newCount: job.newCount || 0,
      totalFound: cache.totalFound,
      hasMore: cache.hasMore,
      batchSize: cache.batchSize,
      maxOrders: cache.maxOrders,
    });
  }).catch((error) => {
    const message = errorMessage(error, 'Sincronizzazione ordini non riuscita.');
    console.error('Sincronizzazione ordini non riuscita:', message);
    Object.assign(job, {
      status: 'error',
      phase: 'error',
      error: message,
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
      console.error('Aggiornamento orario degli ordini non riuscito:', errorMessage(error));
    });
  }, orderCacheHourlyIntervalMs);
  orderCacheHourlyTimer.unref?.();
}

function randomToken() {
  return randomBytes(32).toString('base64url');
}

function safeSecretEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function apiKeyHint(apiKey) {
  const value = String(apiKey || '');
  return value ? `••••${value.slice(-4)}` : '';
}

function isLoopbackHost(host) {
  const normalized = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function createSession() {
  const token = randomToken();
  const expiresAt = Date.now() + sessionTtlMs;
  sessions.set(token, { expiresAt });
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

function errorMessage(error, fallback = 'Errore inatteso.') {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function requestToken(req) {
  return String(req.headers['x-app-session'] || '');
}

function isAuthorized(req) {
  const token = requestToken(req);
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error || new Error('Errore inatteso.'));
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

app.get('/api/auth/status', asyncRoute(async (req, res) => {
  const config = await getConfig();
  res.json({
    authenticated: isAuthorized(req),
    passwordRequired: Boolean(config.appPassword),
    configured: Boolean(config.baseUrl && config.apiKey),
  });
}));

app.get('/api/settings', asyncRoute(async (req, res) => {
  const config = await getConfig();
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Sessione non valida o scaduta.' });
    return;
  }

  res.json({
    settings: {
      baseUrl: config.baseUrl,
      apiKeyConfigured: Boolean(config.apiKey),
      apiKeyHint: apiKeyHint(config.apiKey),
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
      productTemplateLimit: config.productTemplateLimit,
      requirePreflightCheck: config.requirePreflightCheck,
      requireConfirmCheck: config.requireConfirmCheck,
      appPasswordEnabled: Boolean(config.appPassword),
    },
    configured: Boolean(config.baseUrl && config.apiKey),
  });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const config = await getConfig();
  const password = String(req.body?.password || '');

  if (config.appPassword && !safeSecretEqual(password, config.appPassword)) {
    res.status(401).json({ error: 'Password non valida.' });
    return;
  }

  res.json({ ok: true, ...createSession() });
}));

app.post('/api/auth/logout', (req, res) => {
  sessions.delete(requestToken(req));
  res.json({ ok: true });
});

app.post('/api/settings', asyncRoute(async (req, res) => {
  const currentConfig = await getConfig();
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Sessione non valida o scaduta.' });
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
    productTemplateLimit,
    requirePreflightCheck,
    requireConfirmCheck,
    appPassword,
    removeAppPassword,
  } = req.body || {};
  const existingConfig = await readLocalConfig();
  const cleanBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  const cleanApiKey = String(apiKey || '').trim();
  const effectiveApiKey = cleanApiKey || existingConfig.apiKey || process.env.PRESTASHOP_API_KEY || '';
  const cleanAppPassword = String(appPassword || '').trim();
  const effectiveAppPassword = removeAppPassword
    ? ''
    : cleanAppPassword || currentConfig.appPassword;
  const cleanStates = cleanOrderStates(orderStates || orderState);
  const cleanDefaultOrderState = cleanOrderStates(defaultOrderState)[0] || cleanStates[0] || '';
  const cleanLimit = Math.min(Math.max(Number(orderLimit || 20), 1), 1000);

  if (!cleanBaseUrl || !effectiveApiKey) {
    res.status(400).json({ error: 'URL negozio e API key sono obbligatori.' });
    return;
  }

  if (!isLoopbackHost(bindHost) && !effectiveAppPassword) {
    res.status(400).json({
      error: 'Una password applicativa è obbligatoria quando HOST non è locale.',
    });
    return;
  }

  const passwordChanged = effectiveAppPassword !== currentConfig.appPassword;
  await writeLocalConfig({
    ...existingConfig,
    baseUrl: cleanBaseUrl,
    apiKey: cleanApiKey || existingConfig.apiKey || '',
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
    productTemplateLimit: String(cleanProductTemplateLimit(productTemplateLimit)),
    requirePreflightCheck: requirePreflightCheck !== false,
    requireConfirmCheck: requireConfirmCheck !== false,
    appPassword: effectiveAppPassword,
  });

  await refreshOrderCacheHourlySchedule();
  if (passwordChanged) sessions.clear();

  res.json({ ok: true, reauthRequired: passwordChanged });
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
    res.status(400).json({ error: 'Seleziona almeno uno stato ordine prima di sincronizzare gli ordini.' });
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
  const disabledRequestedStates = requestedOrderStates.filter((stateId) => !config.orderStates.includes(stateId));
  if (disabledRequestedStates.length) {
    res.status(400).json({
      error: 'Lo stato ordine richiesto non è abilitato nelle impostazioni.',
    });
    return;
  }
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
    orders = await applyCanonicalizationToOrders(orders);
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
    orders = await applyCanonicalizationToOrders(orders);
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
  res.json({ orders: await applyCanonicalizationToOrders(enrichedOrders), source: 'live' });
}));

app.get('/api/orders/:id', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const client = await getClient();
  const order = await client.getOrderDetails(req.params.id);
  res.json({ order: await applyCanonicalizationToOrder(order) });
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

app.get('/api/product-templates/status', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  res.json({ status: await productTemplatesStatus() });
}));

app.post('/api/product-templates/import', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  try {
    const status = await importProductTemplatesCsv(req.body?.fileName, req.body?.content);
    res.json({ ok: true, status });
  } catch (error) {
    if (
      /CSV|5 MB|colonne ID|prodotti validi/i.test(errorMessage(error))
    ) {
      res.status(400).json({ error: errorMessage(error) });
      return;
    }
    throw error;
  }
}));

app.get('/api/product-templates/items', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const requestedPage = Math.trunc(Number(req.query.page || 1));
  const requestedPageSize = Math.trunc(Number(req.query.pageSize || 25));
  const result = await readProductTemplateItems({
    query: String(req.query.q || '').slice(0, 200),
    page: Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1,
    pageSize: Number.isFinite(requestedPageSize)
      ? Math.min(Math.max(requestedPageSize, 1), 100)
      : 25,
  });
  res.json({
    ...result,
    status: await productTemplatesStatus(),
  });
}));

app.post('/api/product-templates/items', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }
  const result = await mutateProductTemplateItem('create', '', req.body);
  res.status(201).json({ ok: true, ...result });
}));

app.put('/api/product-templates/items/:id', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }
  const result = await mutateProductTemplateItem('update', req.params.id, req.body);
  res.json({ ok: true, ...result });
}));

app.delete('/api/product-templates/items/:id', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }
  const result = await mutateProductTemplateItem('delete', req.params.id);
  res.json({ ok: true, ...result });
}));

app.get('/api/product-canonical-groups', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }
  const groups = await readCanonicalGroups();
  res.json({ groups: await presentCanonicalGroups(groups), count: groups.length });
}));

app.post('/api/product-canonical-groups', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }
  const groups = await mutateCanonicalGroup('create', '', req.body);
  res.status(201).json({ ok: true, groups: await presentCanonicalGroups(groups), count: groups.length });
}));

app.put('/api/product-canonical-groups/:id', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }
  const groups = await mutateCanonicalGroup('update', req.params.id, req.body);
  res.json({ ok: true, groups: await presentCanonicalGroups(groups), count: groups.length });
}));

app.delete('/api/product-canonical-groups/:id', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }
  const groups = await mutateCanonicalGroup('delete', req.params.id);
  res.json({ ok: true, groups: await presentCanonicalGroups(groups), count: groups.length });
}));

app.get('/api/logs', asyncRoute(async (req, res) => {
  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Password locale richiesta.' });
    return;
  }

  const requestedPage = Math.trunc(Number(req.query.page || 1));
  const requestedPageSize = Math.trunc(Number(req.query.pageSize || 20));
  const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1;
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(Math.max(requestedPageSize, 1), 100)
    : 20;
  const type = ['all', 'real', 'simulation', 'error'].includes(String(req.query.type || 'all'))
    ? String(req.query.type || 'all')
    : 'all';
  const dateFrom = cleanLogDate(req.query.dateFrom);
  const dateTo = cleanLogDate(req.query.dateTo);
  if (dateFrom === null || dateTo === null) {
    res.status(400).json({ error: 'Inserisci date valide nel formato AAAA-MM-GG.' });
    return;
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    res.status(400).json({ error: 'La data iniziale non può essere successiva alla data finale.' });
    return;
  }

  const result = await readLogsPage({
    page,
    pageSize,
    type,
    query: String(req.query.q || '').slice(0, 200),
    dateFrom,
    dateTo,
  });
  res.json(result);
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
        error: errorMessage(error),
      };
      await appendChangeLog(entry);

      errors.push({
        ok: false,
        orderDetailId: String(orderDetailId),
        error: errorMessage(error),
      });
    }
  }

  res.json({
    updated: results,
    errors,
  });
}));

app.use((error, req, res, next) => {
  const statusCode = Number(error?.statusCode || 500);
  if (statusCode >= 500) console.error(error);
  res.status(statusCode).json({
    error: errorMessage(error),
  });
});

async function startServer({ host = bindHost, listenPort = port } = {}) {
  const config = await getConfig();
  if (!isLoopbackHost(host) && !config.appPassword) {
    throw new Error(
      `Avvio rifiutato su HOST=${host}: configura una password applicativa prima di esporre la console in rete.`,
    );
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(listenPort, host, async () => {
      const address = server.address();
      const activePort = typeof address === 'object' && address ? address.port : listenPort;
      console.log(`Web app disponibile su http://${host}:${activePort}`);
      try {
        await refreshOrderCacheHourlySchedule();
      } catch (error) {
        console.error('Pianificazione cache ordini non riuscita:', error);
      }
      resolve(server);
    });
    server.once('error', reject);
  });
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  startServer().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}

export { app, startServer };
