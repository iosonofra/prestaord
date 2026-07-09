import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  format: true,
  suppressEmptyNode: true,
});

function cleanBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (value == null) return '';
  if (typeof value === 'object' && '#text' in value) return String(value['#text'] ?? '');
  return String(value);
}

function languageValue(value, languageId) {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  const languages = toArray(value.language);
  const preferred = languages.find((entry) => String(entry['@_id']) === String(languageId));
  return textValue(preferred || languages[0] || value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = textValue(item.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function mapOrderSummary(order) {
  return {
    id: textValue(order.id),
    reference: textValue(order.reference),
    customerId: textValue(order.id_customer),
    dateAdd: textValue(order.date_add),
    totalPaid: textValue(order.total_paid),
    currentState: textValue(order.current_state),
    products: mapOrderRowsSummary(order),
  };
}

function mapOrderState(orderState, languageId) {
  return {
    id: textValue(orderState.id),
    name: languageValue(orderState.name, languageId),
    color: textValue(orderState.color),
  };
}

function mapCustomerSummary(customer) {
  const firstName = textValue(customer.firstname).trim();
  const lastName = textValue(customer.lastname).trim();
  return {
    id: textValue(customer.id),
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(' ').trim(),
  };
}

function mapOrderDetail(orderDetail) {
  return {
    id: textValue(orderDetail.id),
    orderId: textValue(orderDetail.id_order),
    productId: textValue(orderDetail.product_id),
    productAttributeId: textValue(orderDetail.product_attribute_id),
    productName: textValue(orderDetail.product_name),
    productReference: textValue(orderDetail.product_reference),
    productQuantity: textValue(orderDetail.product_quantity),
    unitPriceTaxIncl: textValue(orderDetail.unit_price_tax_incl),
    unitPriceTaxExcl: textValue(orderDetail.unit_price_tax_excl),
    totalPriceTaxIncl: textValue(orderDetail.total_price_tax_incl),
    totalPriceTaxExcl: textValue(orderDetail.total_price_tax_excl),
  };
}

function mapOrderRowsSummary(order) {
  const rows = toArray(order?.associations?.order_rows?.order_row);
  return rows.map((row) => ({
    id: textValue(row.id),
    productId: textValue(row.product_id),
    productName: textValue(row.product_name),
    productReference: textValue(row.product_reference),
    productQuantity: textValue(row.product_quantity),
  })).filter((row) => row.productName || row.productReference);
}

function cleanLimit(value) {
  const parsed = Number(value || 20);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function cleanOrderStates(filters = {}) {
  const values = Array.isArray(filters.orderStates)
    ? filters.orderStates
    : String(filters.orderState || '').split(',');
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => /^\d+$/.test(value));
}

function addOrderFilters(params, filters = {}) {
  const next = { ...params, limit: cleanLimit(filters.orderLimit) };
  const states = cleanOrderStates(filters);
  const dateFrom = String(filters.orderDateFrom || '').trim();
  const dateTo = String(filters.orderDateTo || '').trim();

  if (states.length === 1) {
    next['filter[current_state]'] = `[${states[0]}]`;
  } else if (states.length > 1) {
    next['filter[current_state]'] = `[${states.join('|')}]`;
  }

  if (dateFrom || dateTo) {
    next.date = 1;
    next['filter[date_add]'] = `[${dateFrom || '1970-01-01'},${dateTo || '2999-12-31'}]`;
  }

  return next;
}

function isWebserviceServerError(error) {
  return Number(error?.status || 0) >= 500;
}

export class PrestashopClient {
  constructor({ baseUrl, apiKey, languageId = 1 }) {
    this.baseUrl = cleanBaseUrl(baseUrl);
    this.apiKey = apiKey;
    this.languageId = languageId;

    if (!this.baseUrl || !this.apiKey) {
      throw new Error('PRESTASHOP_URL e PRESTASHOP_API_KEY sono obbligatori.');
    }
  }

  buildUrl(resource, params = {}) {
    const url = new URL(`${this.baseUrl}/api/${resource}`);
    url.searchParams.set('ws_key', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    }
    return url;
  }

  async request(resource, { method = 'GET', params = {}, body, timeoutMs = 45000 } = {}) {
    const url = this.buildUrl(resource, params);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/xml',
          'Content-Type': 'application/xml',
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`PrestaShop non ha risposto entro ${Math.round(timeoutMs / 1000)} secondi. Riprova con un batch piu piccolo o controlla URL negozio, HTTPS e Webservice.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`PrestaShop Webservice ${response.status}: ${text || response.statusText}`);
      error.status = response.status;
      error.body = text;
      throw error;
    }

    return text ? parser.parse(text) : {};
  }

  async list(resource, params = {}, options = {}) {
    const data = await this.request(resource, { params, ...options });
    const entries = data?.prestashop?.[resource]?.[resource.slice(0, -1)] || data?.prestashop?.[resource]?.[resource];
    return toArray(entries);
  }

  async get(resource, id, options = {}) {
    const data = await this.request(`${resource}/${id}`, options);
    const singular = resource.endsWith('s') ? resource.slice(0, -1) : resource;
    return data?.prestashop?.[singular];
  }

  async put(resource, id, entityName, entity) {
    const xml = builder.build({
      prestashop: {
        '@_xmlns:xlink': 'http://www.w3.org/1999/xlink',
        [entityName]: entity,
      },
    });

    return this.request(`${resource}/${id}`, {
      method: 'PUT',
      body: xml,
    });
  }

  async searchOrders(query, filters = {}) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];

    const baseParams = addOrderFilters({
      display: '[id,reference,id_customer,date_add,total_paid,current_state]',
      sort: '[id_DESC]',
    }, filters);

    const found = [];

    if (/^\d+$/.test(trimmed)) {
      try {
        const order = await this.get('orders', trimmed);
        if (order?.id) found.push(order);
      } catch (error) {
        if (!String(error.message).includes('404')) throw error;
      }
    }

    const referenceFilters = [
      `[${trimmed}]`,
      `%${trimmed}%`,
      `%[${trimmed}]%`,
    ];

    for (const referenceFilter of referenceFilters) {
      const orders = await this.list('orders', {
        ...baseParams,
        'filter[reference]': referenceFilter,
      });
      found.push(...orders);
      if (orders.length > 0) break;
    }

    return uniqueById(found).map(mapOrderSummary).slice(0, cleanLimit(filters.orderLimit));
  }

  async listOrderStates() {
    const states = await this.list('order_states', {
      display: '[id,name,color]',
      sort: '[id_ASC]',
      limit: 100,
    });
    return states.map((orderState) => mapOrderState(orderState, this.languageId));
  }

  async listOrdersPage(filters = {}, { offset = 0, limit = 50 } = {}) {
    const batchLimit = Math.min(Math.max(Math.trunc(Number(limit || 50)), 1), 100);
    const params = addOrderFilters({
      display: '[id,reference,id_customer,date_add,total_paid,current_state]',
      sort: '[id_DESC]',
    }, {
      ...filters,
      orderLimit: `${Math.max(Math.trunc(Number(offset || 0)), 0)},${batchLimit}`,
    });
    params.limit = `${Math.max(Math.trunc(Number(offset || 0)), 0)},${batchLimit}`;
    try {
      const orders = await this.list('orders', params, { timeoutMs: 60000 });
      return orders.map(mapOrderSummary);
    } catch (error) {
      const states = cleanOrderStates(filters);
      if (!isWebserviceServerError(error) || states.length <= 1) throw error;
      return this.listOrdersPageByState(filters, { offset, limit: batchLimit });
    }
  }

  async listOrdersPageByState(filters = {}, { offset = 0, limit = 50 } = {}) {
    const states = cleanOrderStates(filters);
    if (!states.length) throw new Error('Nessuno stato ordine valido per la sincronizzazione.');

    const perStateLimit = Math.min(Math.max(Math.trunc(Number(offset || 0)) + Math.trunc(Number(limit || 50)), 1), 100);
    const settledPages = await Promise.allSettled(states.map(async (orderState) => {
      const params = addOrderFilters({
        display: '[id,reference,id_customer,date_add,total_paid,current_state]',
        sort: '[id_DESC]',
      }, {
        ...filters,
        orderStates: [orderState],
        orderLimit: `0,${perStateLimit}`,
      });
      params.limit = `0,${perStateLimit}`;
      const orders = await this.list('orders', params, { timeoutMs: 60000 });
      return orders.map(mapOrderSummary);
    }));
    const pages = settledPages
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);

    if (!pages.length) {
      const firstError = settledPages.find((result) => result.status === 'rejected')?.reason;
      throw firstError || new Error('Nessun ordine scaricato dagli stati configurati.');
    }

    return pages
      .flat()
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      .slice(Math.max(Math.trunc(Number(offset || 0)), 0), Math.max(Math.trunc(Number(offset || 0)), 0) + Math.trunc(Number(limit || 50)));
  }

  async getOrderDetails(orderId, options = {}) {
    const order = await this.get('orders', orderId, options);
    const rows = toArray(order?.associations?.order_rows?.order_row);

    return {
      id: textValue(order.id),
      reference: textValue(order.reference),
      customerId: textValue(order.id_customer),
      rows: rows.map((row) => ({
        id: textValue(row.id),
        productId: textValue(row.product_id),
        productAttributeId: textValue(row.product_attribute_id),
        productName: textValue(row.product_name),
        productReference: textValue(row.product_reference),
        productQuantity: textValue(row.product_quantity),
        unitPriceTaxIncl: textValue(row.unit_price_tax_incl),
        unitPriceTaxExcl: textValue(row.unit_price_tax_excl),
        totalPriceTaxIncl: textValue(row.total_price_tax_incl),
        totalPriceTaxExcl: textValue(row.total_price_tax_excl),
      })),
    };
  }

  async getOrderProducts(orderId, options = {}) {
    const details = await this.getOrderDetails(orderId, options);
    return details.rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.productName,
      productReference: row.productReference,
      productQuantity: row.productQuantity,
    }));
  }

  async listCustomersByIds(customerIds = []) {
    const ids = [...new Set(customerIds.map((id) => String(id || '').trim()).filter((id) => /^\d+$/.test(id)))];
    if (!ids.length) return [];

    const customers = await this.list('customers', {
      display: '[id,firstname,lastname]',
      'filter[id]': `[${ids.join('|')}]`,
      limit: ids.length,
    }, { timeoutMs: 30000 });
    return customers.map(mapCustomerSummary);
  }

  async searchProducts(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];

    const params = {
      display: '[id,id_default_image,reference,name,active]',
      limit: 30,
    };

    if (/^\d+$/.test(trimmed)) {
      params['filter[id]'] = `[${trimmed}]`;
    } else {
      params['filter[reference]'] = `%[${trimmed}]%`;
    }

    let products = await this.list('products', params);

    if (!/^\d+$/.test(trimmed) && products.length === 0) {
      products = await this.list('products', {
        display: '[id,id_default_image,reference,name,active]',
        sort: '[id_DESC]',
        limit: 100,
      });
    }

    return products.map((product) => ({
      id: textValue(product.id),
      reference: textValue(product.reference),
      name: languageValue(product.name, this.languageId),
      active: textValue(product.active),
      imageId: textValue(product.id_default_image),
    })).filter((product) => {
      if (/^\d+$/.test(trimmed)) return true;
      const needle = trimmed.toLocaleLowerCase('it-IT');
      return product.name.toLocaleLowerCase('it-IT').includes(needle)
        || product.reference.toLocaleLowerCase('it-IT').includes(needle);
    }).slice(0, 30);
  }

  async getProduct(productId) {
    const product = await this.get('products', productId);
    return {
      id: textValue(product.id),
      reference: textValue(product.reference),
      ean13: textValue(product.ean13),
      isbn: textValue(product.isbn),
      upc: textValue(product.upc),
      mpn: textValue(product.mpn),
      name: languageValue(product.name, this.languageId),
    };
  }

  async prepareOrderRowProductReplacement(orderDetailId, productId) {
    const [orderDetail, product] = await Promise.all([
      this.get('order_details', orderDetailId),
      this.getProduct(productId),
    ]);

    if (!orderDetail?.id) {
      throw new Error(`Riga ordine ${orderDetailId} non trovata.`);
    }

    const updated = cloneJson(orderDetail);
    delete updated.associations;
    delete updated.id_order_invoice;
    delete updated.download_hash;
    delete updated.download_deadline;

    updated.product_id = product.id;
    updated.product_attribute_id = '0';
    updated.product_name = product.name;
    updated.product_reference = product.reference;
    updated.product_ean13 = product.ean13;
    updated.product_isbn = product.isbn;
    updated.product_upc = product.upc;
    updated.product_mpn = product.mpn;

    return {
      orderDetailId: String(orderDetailId),
      original: orderDetail,
      updated,
      oldRow: mapOrderDetail(orderDetail),
      newProduct: product,
      preview: {
        orderDetailId: String(orderDetailId),
        orderId: textValue(orderDetail.id_order),
        oldProductId: textValue(orderDetail.product_id),
        oldProductName: textValue(orderDetail.product_name),
        oldProductReference: textValue(orderDetail.product_reference),
        newProductId: product.id,
        newProductName: product.name,
        newProductReference: product.reference,
        productQuantity: textValue(orderDetail.product_quantity),
        unitPriceTaxIncl: textValue(orderDetail.unit_price_tax_incl),
        totalPriceTaxIncl: textValue(orderDetail.total_price_tax_incl),
      },
    };
  }

  async replacePreparedOrderRowProduct(prepared) {
    await this.put('order_details', prepared.orderDetailId, 'order_detail', prepared.updated);

    return {
      orderDetailId: prepared.orderDetailId,
      productId: prepared.newProduct.id,
      productName: prepared.newProduct.name,
      productReference: prepared.newProduct.reference,
    };
  }

  async replaceOrderRowProduct(orderDetailId, productId) {
    const prepared = await this.prepareOrderRowProductReplacement(orderDetailId, productId);
    return this.replacePreparedOrderRowProduct(prepared);
  }
}
