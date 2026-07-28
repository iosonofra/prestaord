export function formatSelectedOrders(count) {
  return count === 1 ? '1 ordine selezionato' : `${count} ordini selezionati`;
}

export function getOrderSelectionStatus(count) {
  return count > 0
    ? { text: formatSelectedOrders(count), tone: 'ok' }
    : { text: 'Pronto', tone: 'neutral' };
}
