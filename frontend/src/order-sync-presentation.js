const phaseLabels = {
  queued: 'Preparazione importazione…',
  start: 'Preparazione importazione…',
  fetching: 'Ricerca ordini su PrestaShop…',
  retrying: 'Nuovo tentativo di collegamento…',
  enriching: 'Importazione dettagli degli ordini…',
  saving: 'Salvataggio ordini sincronizzati…',
};

export function getOrderSyncPresentation(cacheStatus = {}) {
  const job = cacheStatus.activeSync;
  const running = job?.status === 'running';
  const count = Number(cacheStatus.count || 0);
  const processedCount = Number(job?.processedCount || 0);
  const importTotal = Number(job?.importTotal || 0);
  const foundCount = Number(job?.foundCount || 0);

  if (!running) {
    return {
      running,
      count,
      processedCount: 0,
      importTotal: 0,
      title: count ? `${count} ordini disponibili` : 'Nessun ordine sincronizzato',
      detail: count
        ? cacheStatus.syncMode === 'incremental'
          ? `${Number(cacheStatus.newCount || 0)} nuovi · ${Number(cacheStatus.refreshedCount || 0)} verificati nell’ultimo aggiornamento.`
          : 'Sincronizzazione completa disponibile per ricerca e selezione.'
        : 'Avvia la prima sincronizzazione.',
      badge: count ? `${count} sincronizzati` : 'Ordini da sincronizzare',
      phaseLabel: '',
    };
  }

  return {
    running,
    count,
    processedCount,
    importTotal,
    title: importTotal
      ? `${processedCount} di ${importTotal} in importazione`
      : foundCount
        ? `${foundCount} ordini trovati`
        : 'Importazione in avvio',
    detail: phaseLabels[job.phase] || 'Sincronizzazione ordini in corso…',
    badge: importTotal
      ? `${processedCount}/${importTotal} in importazione`
      : 'Importazione in corso',
    phaseLabel: phaseLabels[job.phase] || 'Sincronizzazione ordini in corso…',
  };
}
