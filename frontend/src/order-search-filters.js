export const initialFilters = {
  q: '',
  orderState: '',
  dateFrom: '',
  dateTo: '',
  limit: '20',
};

export function getInitialOrderFilters(settings = {}) {
  return {
    q: '',
    orderState: settings.defaultOrderState || '',
    dateFrom: settings.orderDateFrom || '',
    dateTo: settings.orderDateTo || '',
    limit: settings.orderLimit || '20',
  };
}

export function resetOrderSearch(setFilters, onSearchOrders) {
  const nextFilters = { ...initialFilters };
  setFilters(nextFilters);
  onSearchOrders(nextFilters);
}
