import { getCanonicalSuggestions } from './canonical-suggestions.js';

export function getCanonicalSelectionState(rows = [], groups = []) {
  const suggestions = getCanonicalSuggestions(rows);
  const motherProductIds = new Set(groups.map((group) => String(group.motherProductId)));
  const alreadyPrincipalRows = rows.filter(
    (row) => !row.canonicalization && motherProductIds.has(String(row.productId)),
  );
  const unassociatedRows = rows.filter(
    (row) => !row.canonicalization && !motherProductIds.has(String(row.productId)),
  );

  return {
    suggestions,
    alreadyPrincipalRows,
    unassociatedRows,
  };
}
