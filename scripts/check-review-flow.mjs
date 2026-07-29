import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { createServer } from 'vite';

const projectRoot = path.resolve(import.meta.dirname, '..');
const vite = await createServer({
  configFile: path.join(projectRoot, 'frontend', 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
});

const noop = () => {};
const baseProps = {
  selectedRows: [{ id: 10 }, { id: 11 }],
  selectedProduct: { id: 99, name: 'Prodotto nuovo' },
  preview: {
    data: {
      previews: [{
        orderDetailId: 10,
        orderId: 501,
        oldProductName: 'Prodotto precedente',
        oldProductReference: 'OLD',
        newProductName: 'Prodotto nuovo',
        newProductReference: 'NEW',
        productQuantity: 1,
        totalPriceTaxIncl: 24.9,
      }],
    },
  },
  needsTypedConfirm: true,
  verificationRequired: true,
  requireConfirmCheck: true,
  confirmChecked: false,
  confirmText: '',
  canConfirm: false,
  readyToConfirm: false,
  busy: '',
  onPreview: noop,
  onSimulate: noop,
  onConfirm: noop,
  onConfirmChecked: noop,
  onConfirmText: noop,
};

try {
  const { ReviewPanel, SettingsPage } = await vite.ssrLoadModule('/src/main.jsx');
  const beforeVerification = renderToStaticMarkup(React.createElement(ReviewPanel, {
    ...baseProps,
    simulationOk: false,
  }));
  const afterVerification = renderToStaticMarkup(React.createElement(ReviewPanel, {
    ...baseProps,
    simulationOk: true,
    readyToConfirm: true,
  }));
  const invalidConfirmation = renderToStaticMarkup(React.createElement(ReviewPanel, {
    ...baseProps,
    simulationOk: true,
    readyToConfirm: true,
    confirmText: 'NO',
  }));
  const readyToApply = renderToStaticMarkup(React.createElement(ReviewPanel, {
    ...baseProps,
    simulationOk: true,
    readyToConfirm: true,
    confirmChecked: true,
    confirmText: 'CONFERMA',
    canConfirm: true,
  }));
  const verificationDisabled = renderToStaticMarkup(React.createElement(ReviewPanel, {
    ...baseProps,
    simulationOk: false,
    verificationRequired: false,
    readyToConfirm: true,
    confirmChecked: true,
    confirmText: 'CONFERMA',
    canConfirm: true,
  }));
  const blockedButton = afterVerification.match(/<button[^>]*class="btn btn-danger"[^>]*>/)?.[0] || '';
  const enabledButton = readyToApply.match(/<button[^>]*class="btn btn-danger"[^>]*>/)?.[0] || '';
  const directButton = verificationDisabled.match(/<button[^>]*class="btn btn-danger"[^>]*>/)?.[0] || '';
  const settingsBase = {
    baseUrl: 'https://shop.example',
    apiKeyConfigured: true,
    apiKeyHint: '••••-key',
    orderStates: [],
    defaultOrderState: '',
    orderDateFrom: '',
    orderDateTo: '',
    orderLimit: '20',
    cacheAutoSync: false,
    cacheHourlySync: false,
    cacheBatchSize: '50',
    cacheMaxOrders: '100',
    productTemplateLimit: '8',
    requireConfirmCheck: true,
    appPasswordEnabled: false,
  };
  const optionalSetting = renderToStaticMarkup(React.createElement(SettingsPage, {
    settings: { ...settingsBase, requirePreflightCheck: false },
    orderStates: [],
    busy: '',
    onSave: noop,
    onLoadStates: noop,
    onSyncCache: noop,
  }));
  const requiredSetting = renderToStaticMarkup(React.createElement(SettingsPage, {
    settings: { ...settingsBase, requirePreflightCheck: true },
    orderStates: [],
    busy: '',
    onSave: noop,
    onLoadStates: noop,
    onSyncCache: noop,
  }));
  const templateSetting = renderToStaticMarkup(React.createElement(SettingsPage, {
    settings: { ...settingsBase, requirePreflightCheck: true },
    orderStates: [],
    busy: '',
    templateStatus: {
      configured: true,
      fileName: 'templates_export.csv',
      count: 325,
      updatedAt: '2026-07-28T10:00:00.000Z',
    },
    onSave: noop,
    onLoadStates: noop,
    onSyncCache: noop,
    onImportTemplates: noop,
  }));
  const optionalCheckbox = optionalSetting.match(/<input[^>]*name="requirePreflightCheck"[^>]*>/)?.[0] || '';
  const requiredCheckbox = requiredSetting.match(/<input[^>]*name="requirePreflightCheck"[^>]*>/)?.[0] || '';

  const checks = {
    previewIsReadOnly: beforeVerification.includes('Confronto in sola lettura')
      && beforeVerification.includes('Non invia modifiche a PrestaShop')
      && beforeVerification.includes('Confronta prodotti (anteprima)'),
    verificationIsClear: beforeVerification.includes('Verifica senza modificare')
      && beforeVerification.includes('senza modificare ordini o righe su PrestaShop')
      && beforeVerification.includes('Controlla senza applicare modifiche'),
    realActionInitiallyHidden: !beforeVerification.includes('id="realActionTitle"')
      && !beforeVerification.includes('Applica modifica reale'),
    realActionAfterVerification: afterVerification.includes('id="realActionTitle"')
      && afterVerification.includes('Verifica completata. Nessun dato è stato modificato.')
      && afterVerification.includes('Scrittura su PrestaShop')
      && afterVerification.includes('Applica modifica reale'),
    directModeSkipsVerification: verificationDisabled.includes('verifica senza modificare è disattivata')
      && !verificationDisabled.includes('id="verificationActionTitle"')
      && verificationDisabled.includes('id="realActionTitle"')
      && directButton
      && !directButton.includes('disabled=""'),
    settingControlsRequirement: optionalSetting.includes('Richiedi verifica senza modificare')
      && optionalCheckbox
      && !optionalCheckbox.includes('checked=""')
      && requiredCheckbox.includes('checked=""'),
    templateManagementIsAvailable: templateSetting.includes('Risultati rapidi prodotti')
      && templateSetting.includes('templates_export.csv')
      && templateSetting.includes('325 prodotti')
      && templateSetting.includes('type="file"')
      && templateSetting.includes('accept=".csv,text/csv"')
      && templateSetting.includes('name="productTemplateLimit"')
      && templateSetting.includes('Importa CSV')
      && templateSetting.includes('versione precedente viene copiata nei backup'),
    confirmationRiskVisible: afterVerification.includes('Stai per modificare 2')
      && afterVerification.includes('righe ordine')
      && afterVerification.includes('Webservice PrestaShop')
      && afterVerification.includes('backup JSON')
      && afterVerification.includes('ripristino non è automatico')
      && afterVerification.includes('placeholder="CONFERMA"'),
    confirmationIsAccessible: invalidConfirmation.includes('aria-invalid="true"')
      && invalidConfirmation.includes('aria-describedby="confirmRiskDescription confirmInputHint"')
      && invalidConfirmation.includes('Il testo deve corrispondere esattamente a CONFERMA.'),
    requirementsControlAction: blockedButton.includes('disabled=""')
      && afterVerification.includes('seleziona la dichiarazione di verifica')
      && afterVerification.includes('digita CONFERMA')
      && enabledButton
      && !enabledButton.includes('disabled=""')
      && readyToApply.includes('Controlli completati: la modifica reale può essere applicata.'),
  };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ pass, ...checks }));
  if (!pass) process.exitCode = 1;
} finally {
  await vite.close();
}
