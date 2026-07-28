function numericProductId(value, label) {
  const id = String(value || '').trim();
  if (!/^\d+$/.test(id)) {
    const error = new Error(`${label} deve essere un ID prodotto numerico.`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function linkedIds(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || '').split(/[\s,;]+/);
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

export function normalizeCanonicalGroup(payload = {}, existing = {}) {
  const motherProductId = numericProductId(
    payload.motherProductId ?? payload.mother_product_id ?? existing.motherProductId,
    'Il prodotto principale',
  );
  const productIds = linkedIds(
    payload.linkedProductIds ?? payload.product_ids ?? existing.linkedProductIds,
  ).map((id) => numericProductId(id, 'Ogni prodotto collegato'));

  if (!productIds.length) {
    const error = new Error('Inserisci almeno un ID prodotto collegato.');
    error.statusCode = 400;
    throw error;
  }
  if (productIds.includes(motherProductId)) {
    const error = new Error('Il prodotto principale non può comparire tra gli ID collegati.');
    error.statusCode = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const validProductIds = new Set([motherProductId, ...productIds]);
  const productNames = Object.fromEntries(
    Object.entries(existing.productNames || {})
      .map(([id, name]) => [String(id), String(name || '').trim()])
      .filter(([id, name]) => validProductIds.has(id) && name),
  );
  return {
    id: String(existing.id || payload.id || '').trim(),
    name: String(payload.name ?? existing.name ?? '').trim() || `Gruppo #${motherProductId}`,
    motherProductId,
    linkedProductIds: productIds,
    productNames,
    createdAt: existing.createdAt || now,
    updatedAt: payload.updatedAt || existing.updatedAt || now,
  };
}

export function validateCanonicalGroups(groups = []) {
  const claimedIds = new Map();
  for (const group of groups) {
    const normalized = normalizeCanonicalGroup(group, group);
    for (const productId of [normalized.motherProductId, ...normalized.linkedProductIds]) {
      const owner = claimedIds.get(productId);
      if (owner && owner !== normalized.id) {
        const error = new Error(`L’ID prodotto ${productId} appartiene già a un altro gruppo di prodotti.`);
        error.statusCode = 409;
        throw error;
      }
      claimedIds.set(productId, normalized.id);
    }
  }
  return groups;
}

export function buildCanonicalLookup(groups = []) {
  const lookup = new Map();
  for (const group of groups) {
    for (const productId of group.linkedProductIds || []) {
      lookup.set(String(productId), group);
    }
  }
  return lookup;
}

export function canonicalizeProductRow(row = {}, lookup = new Map(), labelsById = new Map()) {
  const originalProductId = String(row.productId || '');
  const group = lookup.get(originalProductId);
  if (!group) return row;

  return {
    ...row,
    originalProductId,
    canonicalization: {
      groupId: group.id,
      groupName: group.name,
      originalProductId,
      motherProductId: group.motherProductId,
      motherProductName: labelsById.get(String(group.motherProductId)) || '',
    },
  };
}

export function canonicalizeOrder(order = {}, groups = [], labelsById = new Map()) {
  const lookup = buildCanonicalLookup(groups);
  return {
    ...order,
    ...(Array.isArray(order.products)
      ? { products: order.products.map((row) => canonicalizeProductRow(row, lookup, labelsById)) }
      : {}),
    ...(Array.isArray(order.rows)
      ? { rows: order.rows.map((row) => canonicalizeProductRow(row, lookup, labelsById)) }
      : {}),
  };
}

export function canonicalizeOrders(orders = [], groups = [], labelsById = new Map()) {
  const lookup = buildCanonicalLookup(groups);
  return orders.map((order) => ({
    ...order,
    products: Array.isArray(order.products)
      ? order.products.map((row) => canonicalizeProductRow(row, lookup, labelsById))
      : order.products,
  }));
}
