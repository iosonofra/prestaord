function identifier(value) {
  return String(value ?? '');
}

export function buildSuccessSummary({ data = {}, requestedRows = [], product = {} }) {
  const rowsById = new Map(requestedRows.map((row) => [identifier(row.id), row]));
  const updated = Array.isArray(data.updated) ? data.updated : [];
  const errors = Array.isArray(data.errors) ? data.errors : [];

  const successfulRows = updated.map((result) => {
    const id = identifier(result.orderDetailId);
    const requestedRow = rowsById.get(id);
    return {
      id,
      orderId: requestedRow?.order?.id ? identifier(requestedRow.order.id) : '',
      oldProductName: requestedRow?.productName || 'Prodotto precedente',
      newProductName: result.productName || product.name || 'Prodotto sostitutivo',
      newProductId: identifier(result.productId || product.id),
    };
  });

  const failedRows = errors.map((result) => {
    const id = identifier(result.orderDetailId);
    const requestedRow = rowsById.get(id);
    return {
      id,
      orderId: requestedRow?.order?.id ? identifier(requestedRow.order.id) : '',
      productName: requestedRow?.productName || 'Riga ordine',
      message: result.error || 'Aggiornamento non riuscito.',
    };
  });

  return {
    requestedCount: requestedRows.length || successfulRows.length + failedRows.length,
    successfulRows,
    failedRows,
    product: {
      id: identifier(product.id),
      name: product.name || successfulRows[0]?.newProductName || 'Prodotto sostitutivo',
    },
  };
}
