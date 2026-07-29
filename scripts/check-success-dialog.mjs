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

try {
  const { SuccessDialog } = await vite.ssrLoadModule('/src/main.jsx');
  const markup = renderToStaticMarkup(React.createElement(SuccessDialog, {
    result: {
      data: {
        updated: [{
          orderDetailId: '10',
          productId: '99',
          productName: 'Prodotto nuovo',
        }],
        errors: [{
          orderDetailId: '11',
          error: 'Aggiornamento rifiutato',
        }],
      },
      requestedRows: [
        { id: 10, productName: 'Prodotto precedente A', order: { id: 501 } },
        { id: 11, productName: 'Prodotto precedente B', order: { id: 502 } },
      ],
      product: { id: 99, name: 'Prodotto nuovo' },
    },
    onViewLogs() {},
    onNewOperation() {},
  }));

  const checks = {
    dialogSemantics: markup.includes('role="dialog"')
      && markup.includes('aria-modal="true"')
      && markup.includes('aria-describedby="successDescription"'),
    accurateCount: markup.includes('1 di 2') && markup.includes('righe modificate'),
    successSection: markup.includes('Righe modificate')
      && markup.includes('Ordine #501')
      && markup.includes('Prodotto precedente A')
      && markup.includes('#99 Prodotto nuovo'),
    errorSection: markup.includes('Non modificate')
      && markup.includes('Ordine #502')
      && markup.includes('Prodotto precedente B')
      && markup.includes('Aggiornamento rifiutato'),
    actions: markup.includes('Vedi registro attività')
      && markup.includes('Nuova operazione'),
    listItems: (markup.match(/role="listitem"/g) || []).length === 2,
  };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ pass, ...checks }));
  if (!pass) process.exitCode = 1;
} finally {
  await vite.close();
}
