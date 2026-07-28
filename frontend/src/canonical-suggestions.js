export function getCanonicalSuggestions(rows = []) {
  const suggestions = new Map();

  for (const row of rows) {
    const canonicalization = row?.canonicalization;
    if (!canonicalization?.motherProductId) continue;
    const key = String(canonicalization.motherProductId);
    const current = suggestions.get(key);
    const originalProductId = String(
      canonicalization.originalProductId || row.originalProductId || row.productId || '',
    );

    if (current) {
      current.matchedRowCount += 1;
      if (originalProductId && !current.originalProductIds.includes(originalProductId)) {
        current.originalProductIds.push(originalProductId);
        current.originalProducts.push({
          id: originalProductId,
          name: row.productName || '',
        });
      }
      continue;
    }

    suggestions.set(key, {
      ...canonicalization,
      originalProductIds: originalProductId ? [originalProductId] : [],
      originalProducts: originalProductId
        ? [{ id: originalProductId, name: row.productName || '' }]
        : [],
      matchedRowCount: 1,
    });
  }

  return [...suggestions.values()];
}
