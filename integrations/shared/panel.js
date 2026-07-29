(function initPrestaOrderPanel(global) {
  const STYLE = `
    :host{all:initial;display:inline-flex;margin-inline-start:12px;vertical-align:middle;color:#092343;font:14px/1.45 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    :host([data-placement="title"]){position:relative;top:-2px}
    :host([data-placement="edge"]){position:fixed;right:0;top:50%;z-index:2147483646;margin:0;transform:translateY(-50%)}
    *{box-sizing:border-box}.launcher{position:static;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;border:1px solid #72a8ff;border-radius:9px;background:#eef7ff;color:#0758c7;padding:7px 11px;font:700 12px/1.2 inherit;box-shadow:none;cursor:pointer;white-space:nowrap;transition:background .15s ease,border-color .15s ease,transform .15s ease}.launcher:hover{border-color:#0866e9;background:#dfefff;transform:translateY(-1px)}.launcher:focus-visible{outline:3px solid #72a8ff;outline-offset:2px}.launcherIcon{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    :host([data-placement="edge"]) .launcher{width:46px;height:48px;min-height:48px;padding:0;border-color:#0758c7;border-right:0;border-radius:13px 0 0 13px;background:#0866e9;color:#fff;box-shadow:0 7px 22px #06162e3d}:host([data-placement="edge"]) .launcher:hover{background:#0758c7}:host([data-placement="edge"]) .launcherLabel{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
    .overlay{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:#07182e8f;backdrop-filter:blur(4px);animation:fadeIn .16s ease-out}.drawer{position:relative;width:min(1120px,calc(100vw - 40px));max-height:min(780px,calc(100vh - 40px));background:#f5f9fd;border:1px solid #b9d3ef;border-radius:20px;box-shadow:0 28px 90px #06162e66;display:flex;flex-direction:column;overflow:hidden;animation:dialogIn .2s ease-out}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes dialogIn{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
    .hidden{display:none!important}.head{display:flex;align-items:center;justify-content:space-between;padding:13px 18px;background:#fff;border-bottom:1px solid #d8e5f2}.head h2{margin:0;font-size:18px}.head p{margin:1px 0 0;color:#58708e;font-size:11px}.iconbtn{border:0;background:#edf4fb;width:34px;height:34px;border-radius:10px;cursor:pointer;font-size:19px}.iconbtn:hover,.iconbtn:focus{background:#dfeeff;outline:2px solid #72a8ff;outline-offset:2px}
    .body{padding:12px;overflow:hidden;display:grid;gap:10px}.workspace{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(350px,.85fr);gap:10px;align-items:start;min-height:0}.leftColumn,.rightColumn{display:grid;gap:10px;min-width:0;min-height:0}.card{background:#fff;border:1px solid #d6e4f2;border-radius:13px;padding:12px;display:grid;gap:8px}.card h3{margin:0;font-size:14px}.rows{max-height:430px;overflow:auto;scrollbar-gutter:stable}.row{display:flex;gap:9px;align-items:flex-start}.row input[type=checkbox]{margin-top:4px}.grow{flex:1;min-width:0}.title{display:-webkit-box;overflow:hidden;font-weight:700;-webkit-box-orient:vertical;-webkit-line-clamp:2}.meta{display:block;color:#58708e;font-size:11px;margin-top:2px}.id{color:#0758c7;font-weight:750}.suggest{border-color:#72a8ff;background:#eef7ff}.suggest-grid{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}.product{padding:9px;border:1px solid #cfe0ef;border-radius:10px;background:#fff}.product.target{background:#e4f2ff;border-color:#4f94f5}.arrow{color:#0866e9;font-size:20px}
    .searchBox{position:relative}.search{display:grid;grid-template-columns:1fr auto;gap:8px}.search input,.config input{width:100%;border:1px solid #b9cfe5;border-radius:10px;padding:11px 12px;font:inherit;outline:none}.search input:focus{border-color:#0866e9;box-shadow:0 0 0 3px #0866e924}.btn{border:1px solid #b9cfe5;border-radius:10px;background:#fff;color:#092343;padding:10px 13px;font:700 13px inherit;cursor:pointer}.btn.primary{background:#0866e9;border-color:#0866e9;color:#fff}.btn.danger{background:#c62828;border-color:#c62828;color:#fff}.btn:disabled{opacity:.48;cursor:not-allowed}.results{position:static;display:grid;gap:5px;max-height:min(290px,36vh);overflow:auto;margin-top:8px;padding:6px;border:1px solid #b9d3ef;border-radius:12px;background:#f8fbff;box-shadow:inset 0 0 0 1px #fff;scrollbar-gutter:stable}.resultsHeader{position:sticky;top:-6px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:-6px -6px 1px;padding:9px 11px;border-bottom:1px solid #d6e4f2;background:#fff}.resultsHeader strong{font-size:12px}.resultsHeader span{color:#58708e;font-size:11px}.result{text-align:left;padding:10px 11px;display:grid;gap:3px;min-width:0}.result>span:not(.sourceBadge){overflow-wrap:anywhere}.result:hover,.result:focus{border-color:#72a8ff;background:#eef7ff;outline:none}.selected{border:2px solid #0866e9;background:#eef7ff}.steps{display:grid;gap:8px}.step{display:flex;align-items:center;justify-content:space-between;padding:10px;border-radius:10px;background:#f1f6fb}.ok{color:#087a45;font-weight:700}.error{color:#b42318}.notice{padding:10px;border-radius:10px;background:#fff3d7;color:#704b00}.status{padding:11px;border-radius:10px;background:#e8f7ef;color:#087a45}.footer{position:static;background:#f5f9fd;padding:0;display:grid;gap:7px}.confirm{display:flex;gap:8px;align-items:flex-start;font-size:12px}.loading{opacity:.65;pointer-events:none}
    .eyebrow{color:#0758c7;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.suggest{border-color:#4f94f5;background:linear-gradient(135deg,#f0f8ff,#e5f3ff)}.suggestHead{display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:1px solid #b9d8fb}.suggestIcon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#0866e9;color:#fff;font-size:18px;box-shadow:0 7px 18px #0866e938}.suggestItem{display:grid;gap:9px}.suggestItem+.suggestItem{padding-top:10px;border-top:1px solid #c4ddf6}.product.target{background:linear-gradient(145deg,#1372ed,#064fc1);border-color:#0758c7;color:#fff;box-shadow:0 8px 20px #0758c733}.product.target .meta,.product.target .id{color:#fff}.suggest .use-suggest{justify-self:end}.suggestionSummary{display:flex;align-items:center;gap:10px;border-color:#72a8ff;background:#eef7ff}.summaryIcon{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:#0866e9;color:#fff}.availability{display:inline-flex;align-items:center;width:max-content;margin-top:6px;padding:3px 7px;border-radius:999px;background:#e6f2ff;color:#0758c7;font-size:11px;font-weight:750}.sourceBadge{display:inline-flex;width:max-content;padding:2px 7px;border-radius:999px;background:#e8f2ff;color:#0758c7;font-size:10px;font-weight:800;text-transform:uppercase}.sourceBadge.live{background:#eef2f6;color:#58708e}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.metric{padding:9px;border:1px solid #d6e4f2;border-radius:11px;background:#f5f9fd}.metric span{display:block;color:#58708e;font-size:10px}.metric strong{display:block;margin-top:2px;font-size:13px}
    .workflowProgress{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;padding:8px 18px;border-bottom:1px solid #d8e5f2;background:#fff}.progressStep{position:relative;display:flex;align-items:center;gap:7px;min-width:0;color:#71839a;font-size:11px;font-weight:750}.progressStep:not(:last-child)::after{content:"";position:absolute;left:31px;right:8px;bottom:-4px;height:2px;background:#d8e5f2}.progressIndex{position:relative;z-index:1;display:grid;width:23px;height:23px;flex:0 0 auto;place-items:center;border:1px solid #b9cfe5;border-radius:50%;background:#fff}.progressStep.active{color:#0758c7}.progressStep.active .progressIndex{border-color:#0866e9;background:#e8f2ff;color:#0758c7}.progressStep.done{color:#087a45}.progressStep.done .progressIndex{border-color:#15945c;background:#e8f7ef;color:#087a45}.progressStep.done:not(:last-child)::after{background:#54b989}.workflowView{display:grid;gap:10px;min-height:0;overflow:hidden}.previewCard{border-color:#72a8ff}.previewList{display:grid;gap:7px}.previewRow{display:grid;gap:6px;padding:8px;border:1px solid #d6e4f2;border-radius:10px;background:#f8fbff}.previewRowHead{display:flex;justify-content:space-between;gap:8px;color:#58708e;font-size:10px}.previewFlow{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:7px;align-items:center}.previewProduct{padding:8px;border-radius:9px;background:#fff;border:1px solid #d6e4f2}.previewProduct.new{border-color:#72a8ff;background:#eef7ff}.previewProduct span{display:block;color:#58708e;font-size:10px}.previewProduct strong{display:-webkit-box;overflow:hidden;margin-top:2px;font-size:11px;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:3}.previewProduct small{display:block;margin-top:2px;color:#58708e;font-size:10px}.previewArrow{color:#0866e9;font-size:17px}.stepCopy{display:grid;gap:1px}.stepCopy small{color:#58708e;font-size:10px}.stepState{display:inline-flex;align-items:center;gap:5px}.choiceHead{display:flex;align-items:center;justify-content:space-between;gap:10px}.choiceProduct{display:flex;align-items:center;gap:8px;padding:8px 10px}.choiceProduct .title{flex:1}.changeProduct{padding:7px 10px}.finalSummary{display:grid;gap:8px;padding:12px;border:1px solid #f0b25b;border-radius:12px;background:#fff7e8}.finalSummaryHead{display:flex;align-items:flex-start;gap:9px}.finalSummaryHead>div{display:grid;gap:2px}.finalSummaryIcon{display:grid;width:30px;height:30px;flex:0 0 auto;place-items:center;border-radius:9px;background:#fff0d2;color:#8a5600;font-size:17px}.finalSummary strong{font-size:13px}.finalSummary .targetLine{display:grid;gap:4px;padding:8px;border-radius:9px;background:#fff;color:#092343;font-size:12px}.targetLine span:first-child{color:#58708e}.footerHint{margin:0;color:#58708e;font-size:11px;text-align:center}.confirm{padding:10px;border:1px solid #f0b25b;border-radius:10px;background:#fff}.confirm span{display:grid;gap:2px}.confirm strong{color:#092343}.confirm small{color:#58708e}.completion{display:grid;min-height:350px;place-items:center;align-content:center;text-align:center;padding:24px}.completionIcon{display:grid;width:58px;height:58px;place-items:center;border-radius:50%;background:#e8f7ef;color:#087a45;font-size:28px;box-shadow:0 0 0 9px #f2fbf6}.completion h2{margin:16px 0 4px;font-size:22px}.completion>p{margin:0;color:#58708e}.completionSummary{width:min(620px,100%);margin-top:16px;padding:13px;border:1px solid #cfe0ef;border-radius:14px;background:#fff;text-align:left}.completionFlow{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:10px;align-items:center}.completionProduct{padding:10px;border-radius:10px;background:#f5f9fd}.completionProduct.new{background:#e8f7ef;border:1px solid #81cca5}.completionProduct span{display:block;color:#58708e;font-size:10px}.completionProduct strong{display:block;margin-top:2px;overflow-wrap:anywhere}.completionMeta{display:flex;justify-content:center;flex-wrap:wrap;gap:7px;margin-top:12px}.completionBadge{padding:4px 8px;border-radius:999px;background:#e8f7ef;color:#087a45;font-size:11px;font-weight:750}.refreshNotice{display:flex;align-items:center;gap:10px;width:min(620px,100%);margin-top:10px;padding:10px 12px;border:1px solid #9dc4f6;border-radius:12px;background:#eef7ff;color:#174d8d;text-align:left}.refreshNoticeIcon{display:grid;width:30px;height:30px;flex:0 0 auto;place-items:center;border-radius:9px;background:#dcecff;color:#0758c7;font-size:18px}.refreshNotice strong{display:block;color:#092343;font-size:12px}.refreshNotice span:last-child{display:block;margin-top:1px;font-size:11px}.completionActions{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin-top:14px}
    .drawer[data-stage="check"] .searchCard,.drawer[data-stage="apply"] .searchCard{display:none}.drawer[data-stage="check"] .metrics,.drawer[data-stage="check"] .status{display:none!important}.drawer[data-stage="check"][data-preview="ready"] .previewStep{display:none}.drawer[data-stage="check"] .previewCard>div:first-child{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.drawer[data-stage="check"] .previewCard>div:first-child .meta{display:none}.drawer[data-stage="check"] .previewProduct strong{-webkit-line-clamp:2}.drawer[data-stage="check"][data-preview="ready"] .steps>div:first-child .meta{display:none}.drawer[data-stage="apply"] .previewCard,.drawer[data-stage="apply"] .steps,.drawer[data-stage="apply"] .metrics{display:none!important}.drawer[data-stage="apply"] .workspace{grid-template-columns:minmax(0,1fr) minmax(380px,.8fr)}
    @media(max-width:860px){.overlay{padding:10px}.drawer{width:calc(100vw - 20px);max-height:calc(100vh - 20px);border-radius:16px}.body,.workflowView{overflow:auto}.workspace{grid-template-columns:1fr}.suggest-grid,.previewFlow,.completionFlow{grid-template-columns:1fr}.arrow,.previewArrow{transform:rotate(90deg);text-align:center}.workflowProgress{padding-inline:14px}.progressStep{justify-content:center}.progressLabel{display:none}}
    @media(max-width:520px){.overlay{padding:0}.drawer{width:100vw;height:100vh;border:0;border-radius:0}.head{padding:14px 16px}.body{padding:12px}.metrics{grid-template-columns:1fr 1fr}.metric:last-child{grid-column:1/-1}}
  `;

  function cleanProduct(product) {
    return {
      id: String(product?.id || ''),
      name: String(product?.name || product?.label || product?.displayName || `Prodotto ${product?.id || ''}`),
      reference: String(product?.reference || product?.productReference || ''),
      source: String(product?.source || ''),
    };
  }

  function detectOrderId(location = global.location, document = global.document) {
    const url = new URL(location.href);
    const queryId = url.searchParams.get('id_order') || url.searchParams.get('orderId');
    if (/^\d+$/.test(queryId || '')) return queryId;
    const pathMatch = url.pathname.match(/(?:orders?|sell\/orders)\/(\d+)(?:\/view)?/i);
    if (pathMatch) return pathMatch[1];
    const candidate = document.querySelector('[data-order-id],input[name="id_order"]');
    const domId = candidate?.dataset?.orderId || candidate?.value;
    return /^\d+$/.test(domId || '') ? domId : '';
  }

  function findOrderHeading(document) {
    const candidates = [
      ...document.querySelectorAll('h1,h2,h3'),
      ...document.querySelectorAll('.page-title'),
    ];
    return candidates.find((element) => {
      const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
      return text.length < 180 && /^(ordine|order)\b/i.test(text);
    }) || null;
  }

  function mount({ api, orderId = detectOrderId(), onConfigure = null }) {
    if (!orderId || document.querySelector('presta-order-console')) return null;
    const host = document.createElement('presta-order-console');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <button class="launcher" type="button" aria-label="Sostituisci prodotto nell’ordine" title="Sostituisci prodotto">
        <svg class="launcherIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"/><path d="m21 3-6 6"/><path d="M8 21H3v-5"/><path d="m3 21 6-6"/><path d="M14 5H8a3 3 0 0 0-3 3v3"/><path d="M10 19h6a3 3 0 0 0 3-3v-3"/></svg>
        <span class="launcherLabel">Sostituisci prodotto</span>
      </button>
      <div class="overlay hidden">
        <section class="drawer" role="dialog" aria-modal="true" aria-labelledby="prestaOrderDialogTitle">
          <header class="head"><div><h2 id="prestaOrderDialogTitle">Ordine <span data-order></span></h2><p>Sostituzione prodotto guidata · integrazione v1.3.3</p></div><button class="iconbtn close" aria-label="Chiudi">×</button></header>
          <div class="workflowProgress" aria-label="Avanzamento sostituzione">
            <div class="progressStep active" data-progress="rows"><span class="progressIndex">1</span><span class="progressLabel">Righe</span></div>
            <div class="progressStep" data-progress="product"><span class="progressIndex">2</span><span class="progressLabel">Prodotto</span></div>
            <div class="progressStep" data-progress="check"><span class="progressIndex">3</span><span class="progressLabel">Controllo</span></div>
            <div class="progressStep" data-progress="apply"><span class="progressIndex">4</span><span class="progressLabel">Conferma</span></div>
          </div>
          <main class="body"><section class="completion hidden" role="status" aria-live="polite"></section><div class="workflowView"><div class="status hidden"></div><div class="notice hidden"></div><div class="workspace">
            <div class="leftColumn"><section class="suggestionSummary card hidden"></section><section class="rows card"></section><section class="suggest card hidden"></section></div>
            <div class="rightColumn"><section class="searchCard card"><div><span class="eyebrow">Catalogo prodotti</span><h3>Cerca prodotto sostitutivo</h3></div><div class="searchBox"><div class="search"><input placeholder="Nome, riferimento o ID" aria-label="Cerca prodotto" autocomplete="off" role="combobox" aria-expanded="false"><button class="btn searchbtn">Cerca</button></div><div class="results hidden" role="listbox" aria-live="polite"></div></div><span class="meta">I risultati rapidi compaiono mentre scrivi; Cerca interroga anche PrestaShop.</span></section>
            <section class="choice card hidden"></section><section class="metrics hidden"></section><section class="previewCard card hidden"></section><section class="steps card hidden"></section>
            <div class="footer"><section class="finalSummary hidden"></section><label class="confirm hidden"><input type="checkbox"><span><strong>Confermo la sostituzione reale</strong><small>Ho controllato il confronto. La modifica sarà inviata a PrestaShop e registrata nel log.</small></span></label><p class="footerHint">Seleziona almeno una riga per iniziare.</p><button class="btn danger apply" disabled>Completa i passaggi precedenti</button><button class="btn config hidden">Configura connessione</button></div></div>
          </div></div></main>
        </section>
      </div>`;
    const orderHeading = findOrderHeading(document);
    if (orderHeading) {
      host.dataset.placement = 'title';
      orderHeading.appendChild(host);
    } else {
      host.dataset.placement = 'edge';
      document.documentElement.appendChild(host);
    }

    const q = (selector) => root.querySelector(selector);
    const state = { order: null, config: {}, selectedRows: new Set(), product: null, preview: null, verified: false, completed: null, searchTimer: null, searchSequence: 0 };
    q('[data-order]').textContent = orderId;
    let previouslyFocused = null;
    let previousPageOverflow = '';
    function openDialog() {
      previouslyFocused = global.document.activeElement;
      previousPageOverflow = global.document.documentElement.style.overflow;
      global.document.documentElement.style.overflow = 'hidden';
      q('.overlay').classList.remove('hidden');
      q('.close').focus();
      load();
    }
    function closeDialog() {
      q('.overlay').classList.add('hidden');
      global.document.documentElement.style.overflow = previousPageOverflow;
      previouslyFocused?.focus?.();
      if (state.completed) resetWorkflow();
    }
    q('.launcher').onclick = openDialog;
    q('.close').onclick = closeDialog;
    q('.overlay').onclick = (event) => {
      if (event.target === q('.overlay')) closeDialog();
    };
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !q('.overlay').classList.contains('hidden')) {
        event.preventDefault();
        closeDialog();
      } else if (event.key === 'Tab' && !q('.overlay').classList.contains('hidden')) {
        const focusable = [...q('.drawer').querySelectorAll('button:not(:disabled),input:not(:disabled),[href],[tabindex]:not([tabindex="-1"])')]
          .filter((element) => !element.closest('.hidden'));
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && root.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && root.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    });
    q('.config').onclick = () => onConfigure?.();

    function message(text, tone = 'ok') {
      const node = tone === 'error' ? q('.notice') : q('.status');
      const other = tone === 'error' ? q('.status') : q('.notice');
      other.classList.add('hidden');
      node.textContent = text;
      node.classList.remove('hidden');
    }

    async function busy(task) {
      q('.drawer').classList.add('loading');
      try { return await task(); }
      catch (error) {
        message(error.message || 'Operazione non riuscita.', 'error');
        if (/configur|token|connessione/i.test(error.message || '')) q('.config').classList.remove('hidden');
        throw error;
      } finally { q('.drawer').classList.remove('loading'); }
    }

    async function load() {
      if (state.order) return;
      await busy(async () => {
        const [config, result] = await Promise.all([api('config'), api('order', { orderId })]);
        state.config = config;
        state.order = result.order;
        renderRows();
        renderSuggestionSummary();
        renderProgress();
        updateApply();
      }).catch(() => {});
    }

    function verificationSatisfied() {
      return state.config.requirePreflightCheck === false || state.verified;
    }

    function renderProgress() {
      const steps = [...root.querySelectorAll('[data-progress]')];
      let activeIndex = 0;
      if (state.completed) activeIndex = steps.length;
      else if (!state.selectedRows.size) activeIndex = 0;
      else if (!state.product) activeIndex = 1;
      else if (!state.preview || !verificationSatisfied()) activeIndex = 2;
      else activeIndex = 3;
      q('.drawer').dataset.stage = state.completed ? 'complete' : ['rows', 'product', 'check', 'apply'][activeIndex];
      q('.drawer').dataset.preview = state.preview ? 'ready' : 'pending';

      steps.forEach((step, index) => {
        const done = state.completed || index < activeIndex;
        step.classList.toggle('done', Boolean(done));
        step.classList.toggle('active', !state.completed && index === activeIndex);
        step.querySelector('.progressIndex').textContent = done ? '✓' : String(index + 1);
      });
    }

    function resetSafety() {
      state.preview = null;
      state.verified = false;
      q('.confirm input').checked = false;
      q('.previewCard').classList.add('hidden');
    }

    function renderRows() {
      const rows = state.order?.rows || [];
      q('.rows').innerHTML = `<h3>${rows.length} righe nell’ordine</h3>${rows.map((row) => `
        <label class="row"><input type="checkbox" data-row="${row.id}"><span class="grow"><span class="title">${escapeHtml(row.productName)}</span>
        <span class="meta">ID prodotto <span class="id">${escapeHtml(row.productId)}</span>${row.productReference ? ` · Rif. ${escapeHtml(row.productReference)}` : ''} · Qtà ${escapeHtml(row.productQuantity)}</span>
        ${row.canonicalization ? `<span class="availability">✨ Suggerimento automatico disponibile</span><span class="meta">Originale ${escapeHtml(row.canonicalization.originalProductId)} → principale ${escapeHtml(row.canonicalization.motherProductId)}</span>` : ''}</span></label>`).join('') || '<p>Nessuna riga modificabile.</p>'}`;
      q('.rows').querySelectorAll('[data-row]').forEach((input) => {
        input.onchange = () => {
          input.checked ? state.selectedRows.add(input.dataset.row) : state.selectedRows.delete(input.dataset.row);
          resetSafety();
          renderSuggestion();
          renderMetrics();
          renderPreview();
          renderSteps();
          renderProgress();
        };
      });
    }

    function renderSuggestionSummary() {
      const suggestedRows = (state.order?.rows || []).filter((row) => row.canonicalization);
      const box = q('.suggestionSummary');
      if (!suggestedRows.length) { box.classList.add('hidden'); return; }
      box.innerHTML = `<span class="summaryIcon">✨</span><div><strong>${suggestedRows.length === 1 ? 'Suggerimento automatico disponibile' : `${suggestedRows.length} suggerimenti automatici disponibili`}</strong><div class="meta">Seleziona ${suggestedRows.length === 1 ? 'la riga evidenziata' : 'una riga evidenziata'} per vedere il prodotto principale consigliato.</div></div>`;
      box.classList.remove('hidden');
    }

    function selectedRowObjects() {
      return (state.order?.rows || []).filter((row) => state.selectedRows.has(String(row.id)));
    }

    function renderSuggestion() {
      const suggestions = new Map();
      selectedRowObjects().forEach((row) => {
        if (row.canonicalization) suggestions.set(row.canonicalization.motherProductId, row);
      });
      const box = q('.suggest');
      if (!suggestions.size) { box.classList.add('hidden'); return; }
      const entries = [...suggestions.values()];
      box.innerHTML = `<div class="suggestHead"><span class="suggestIcon">✨</span><div><span class="eyebrow">Suggerimento automatico</span><h3>${entries.length === 1 ? 'Prodotto principale consigliato' : 'Prodotti principali consigliati'}</h3></div></div>${entries.map((row, index) => {
        const c = row.canonicalization;
        return `<article class="suggestItem"><div class="suggest-grid"><div class="product"><span class="meta">Prodotto nell’ordine</span><div class="id">${escapeHtml(row.productId)}</div><div>${escapeHtml(row.productName)}</div></div><span class="arrow">→</span><div class="product target"><span class="meta">Prodotto consigliato</span><div class="id">${escapeHtml(c.motherProductId)}</div><div>${escapeHtml(c.motherProductName || c.groupName)}</div></div></div><span class="meta">Associazione ${escapeHtml(c.groupName)} · 1 riga coinvolta</span><button class="btn primary use-suggest" data-suggestion="${index}">✓ Usa questo prodotto</button></article>`;
      }).join('')}`;
      box.classList.remove('hidden');
      box.querySelectorAll('[data-suggestion]').forEach((button) => {
        button.onclick = () => {
          const row = entries[Number(button.dataset.suggestion)];
          const c = row.canonicalization;
          chooseProduct({ id: c.motherProductId, name: c.motherProductName || c.groupName, source: 'suggestion' });
        };
      });
    }

    function renderResults(products, mode) {
      const results = q('.results');
      results.innerHTML = products.length
        ? `<div class="resultsHeader"><strong>${products.length} ${products.length === 1 ? 'prodotto trovato' : 'prodotti trovati'}</strong><span>${mode === 'quick' ? 'Risultati rapidi' : 'Catalogo completo'}</span></div>${products.map((product, index) => `<button class="btn result" role="option" data-index="${index}"><span class="sourceBadge ${product.source === 'prestashop' ? 'live' : ''}">${product.source === 'prestashop' ? 'PrestaShop' : 'Risultato rapido'}</span><span><span class="id">${escapeHtml(product.id)}</span> · ${escapeHtml(product.name)}</span>${product.reference ? `<span class="meta">Rif. ${escapeHtml(product.reference)}</span>` : ''}</button>`).join('')}`
        : `<p class="meta">${mode === 'quick' ? 'Nessun risultato rapido. Premi Cerca per interrogare PrestaShop.' : 'Nessun prodotto trovato.'}</p>`;
      results.classList.remove('hidden');
      q('.search input').setAttribute('aria-expanded', 'true');
      results.querySelectorAll('[data-index]').forEach((button) => { button.onclick = () => chooseProduct(products[Number(button.dataset.index)]); });
    }

    async function search(mode = 'all') {
      const query = q('.search input').value.trim();
      if (query.length < 2) {
        q('.results').classList.add('hidden');
        q('.search input').setAttribute('aria-expanded', 'false');
        if (mode === 'all') message('Inserisci almeno 2 caratteri.', 'error');
        return;
      }
      const sequence = ++state.searchSequence;
      const execute = async () => {
        const result = await api('products', { query, source: mode === 'quick' ? 'quick' : 'all' });
        if (sequence !== state.searchSequence) return;
        const products = (result.products || []).map(cleanProduct);
        renderResults(products, mode);
      };
      if (mode === 'quick') execute().catch(() => {});
      else await busy(execute).catch(() => {});
    }
    q('.searchbtn').onclick = () => search('all');
    q('.search input').oninput = () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => search('quick'), 220);
    };
    q('.search input').onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        search('all');
      } else if (event.key === 'Escape') {
        q('.results').classList.add('hidden');
        q('.search input').setAttribute('aria-expanded', 'false');
      }
    };
    root.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.searchBox')) {
        q('.results').classList.add('hidden');
        q('.search input').setAttribute('aria-expanded', 'false');
      }
    });

    function chooseProduct(product) {
      state.product = cleanProduct(product);
      resetSafety();
      q('.choice').innerHTML = `<div class="choiceHead"><div><span class="eyebrow">Prodotto sostitutivo</span><h3>Prodotto scelto</h3></div><button class="btn changeProduct" type="button">Cambia</button></div><div class="selected product choiceProduct"><span class="id">${escapeHtml(state.product.id)}</span><div class="title">${escapeHtml(state.product.name)}</div>${state.product.reference ? `<span class="meta">Rif. ${escapeHtml(state.product.reference)}</span>` : ''}</div>`;
      q('.choice').classList.remove('hidden');
      q('.choice .changeProduct').onclick = clearProductSelection;
      q('.suggest').classList.add('hidden');
      q('.suggestionSummary').classList.add('hidden');
      q('.results').classList.add('hidden');
      q('.search input').setAttribute('aria-expanded', 'false');
      renderMetrics();
      renderPreview();
      renderSteps();
      renderProgress();
    }

    function clearProductSelection() {
      state.product = null;
      resetSafety();
      q('.choice').classList.add('hidden');
      q('.status').classList.add('hidden');
      renderMetrics();
      renderPreview();
      renderSteps();
      renderProgress();
      q('.search input').focus();
    }

    function renderMetrics() {
      const box = q('.metrics');
      if (!state.selectedRows.size) { box.classList.add('hidden'); return; }
      const verificationLabel = state.verified ? 'OK' : state.config.requirePreflightCheck === false ? 'Facoltativa' : 'Da fare';
      box.innerHTML = `<div class="metric"><span>Righe</span><strong>${state.selectedRows.size}</strong></div><div class="metric"><span>Prodotto</span><strong>${state.product?.id || '-'}</strong></div><div class="metric"><span>Verifica</span><strong class="${state.verified ? 'ok' : ''}">${verificationLabel}</strong></div>`;
      box.classList.remove('hidden');
    }

    function renderSteps() {
      const box = q('.steps');
      if (!state.selectedRows.size || !state.product) {
        box.classList.add('hidden');
        updateApply();
        return;
      }
      const requireVerify = state.config.requirePreflightCheck !== false;
      box.innerHTML = `<div><span class="eyebrow">Passaggio 3</span><h3>Controlla la sostituzione</h3><span class="meta">Prima confronta i prodotti, poi esegui la verifica prevista dalle impostazioni.</span></div>
        <div class="step previewStep"><span class="stepCopy"><strong>Confronto prodotti</strong><small>${state.preview ? `${state.preview.previews?.length || 0} righe confrontate` : 'Mostra cosa cambierà prima di procedere'}</small></span><button class="btn preview">${state.preview ? 'Aggiorna confronto' : 'Confronta'}</button></div>
        <div class="step verifyStep"><span class="stepCopy"><strong>Verifica senza modificare</strong><small>${requireVerify ? 'Obbligatoria prima della conferma reale' : 'Facoltativa nelle impostazioni correnti'}</small></span>${state.verified ? '<span class="stepState ok">✓ Completata</span>' : `<button class="btn verify" ${!state.preview ? 'disabled' : ''}>${requireVerify ? 'Esegui verifica' : 'Verifica comunque'}</button>`}</div>`;
      box.classList.remove('hidden');
      box.querySelector('.preview').onclick = preview;
      const verifyButton = box.querySelector('.verify'); if (verifyButton) verifyButton.onclick = verify;
      updateApply();
    }

    function renderPreview() {
      const box = q('.previewCard');
      const previews = state.preview?.previews || [];
      if (!previews.length) {
        box.classList.add('hidden');
        return;
      }
      box.innerHTML = `<div><span class="eyebrow">Anteprima in sola lettura</span><h3>Cosa cambierà</h3><span class="meta">Quantità e prezzi restano invariati.</span></div><div class="previewList">${previews.map((item) => `
        <article class="previewRow">
          <div class="previewRowHead"><span>Ordine ${escapeHtml(item.orderId)} · Riga ${escapeHtml(item.orderDetailId)}</span><span>Qtà ${escapeHtml(item.productQuantity)} · ${escapeHtml(item.totalPriceTaxIncl)} €</span></div>
          <div class="previewFlow">
            <div class="previewProduct"><span>Prodotto attuale</span><strong>${escapeHtml(item.oldProductId)} · ${escapeHtml(item.oldProductName)}</strong>${item.oldProductReference ? `<small>Rif. ${escapeHtml(item.oldProductReference)}</small>` : ''}</div>
            <span class="previewArrow">→</span>
            <div class="previewProduct new"><span>Nuovo prodotto</span><strong>${escapeHtml(item.newProductId)} · ${escapeHtml(item.newProductName)}</strong>${item.newProductReference ? `<small>Rif. ${escapeHtml(item.newProductReference)}</small>` : ''}</div>
          </div>
        </article>`).join('')}</div>`;
      box.classList.remove('hidden');
    }

    async function preview() {
      await busy(async () => {
        state.preview = await api('preview', { orderDetailIds: [...state.selectedRows], productId: state.product.id });
        state.verified = false;
        message(`Anteprima pronta per ${state.preview.previews?.length || 0} righe.`);
        renderMetrics();
        renderPreview();
        renderSteps();
        renderProgress();
      }).catch(() => {});
    }

    async function verify() {
      await busy(async () => {
        const result = await api('verify', { orderDetailIds: [...state.selectedRows], productId: state.product.id });
        if (result.errors?.length) throw new Error(result.errors.map((item) => item.error).join(' · '));
        state.verified = true;
        message('Verifica completata: nessun dato è stato modificato.');
        renderMetrics();
        renderSteps();
        renderProgress();
      }).catch(() => {});
    }

    function updateApply() {
      const verified = verificationSatisfied();
      const confirmed = state.config.requireConfirmCheck === false || q('.confirm input').checked;
      const ready = Boolean(state.preview && verified && state.selectedRows.size && state.product);
      const count = state.selectedRows.size;
      const summary = q('.finalSummary');
      const confirm = q('.confirm');
      const hint = q('.footerHint');
      const apply = q('.apply');

      if (ready) {
        const firstPreview = state.preview?.previews?.[0];
        const oldProduct = count === 1 && firstPreview
          ? `${firstPreview.oldProductId} · ${firstPreview.oldProductName}`
          : `${count} righe selezionate`;
        summary.innerHTML = `<div class="finalSummaryHead"><span class="finalSummaryIcon">!</span><div><span class="eyebrow">Ultimo passaggio</span><strong>Stai per modificare realmente ${count} ${count === 1 ? 'riga' : 'righe'} su PrestaShop</strong></div></div><div class="targetLine"><span>Da: <strong>${escapeHtml(oldProduct)}</strong></span><span>A: <strong>${escapeHtml(state.product.id)} · ${escapeHtml(state.product.name)}</strong></span></div><span class="meta">Prima della scrittura verrà creato un backup; l’esito resterà disponibile nel registro modifiche.</span>`;
        summary.classList.remove('hidden');
        confirm.classList.toggle('hidden', state.config.requireConfirmCheck === false);
        hint.textContent = state.config.requireConfirmCheck !== false && !confirmed
          ? 'Spunta la conferma dopo aver controllato il riepilogo.'
          : 'Tutti i controlli richiesti sono completati.';
        apply.textContent = `Sostituisci ${count} ${count === 1 ? 'riga' : 'righe'} su PrestaShop`;
      } else {
        summary.classList.add('hidden');
        confirm.classList.add('hidden');
        if (!state.selectedRows.size) hint.textContent = 'Seleziona almeno una riga per iniziare.';
        else if (!state.product) hint.textContent = 'Scegli il prodotto sostitutivo.';
        else if (!state.preview) hint.textContent = 'Esegui il confronto dei prodotti.';
        else hint.textContent = 'Completa la verifica senza modificare.';
        apply.textContent = 'Completa i passaggi precedenti';
      }
      apply.disabled = !(ready && confirmed);
    }
    q('.confirm input').onchange = updateApply;

    function renderCompletion() {
      const completed = state.completed;
      if (!completed) return;
      const count = completed.result.updated?.length || completed.rows.length;
      const previews = completed.previews || [];
      const firstOld = previews[0];
      const oldLabel = previews.length > 1
        ? `${previews.length} righe selezionate`
        : `${firstOld?.oldProductId || completed.rows[0]?.productId || '-'} · ${firstOld?.oldProductName || completed.rows[0]?.productName || 'Prodotto precedente'}`;
      const backupCount = (completed.result.updated || []).filter((item) => item.backupFile).length;
      const box = q('.completion');
      box.innerHTML = `<span class="completionIcon">✓</span><h2>Sostituzione completata</h2><p>${count} ${count === 1 ? 'riga aggiornata' : 'righe aggiornate'} nell’ordine ${escapeHtml(orderId)}.</p>
        <div class="completionSummary"><div class="completionFlow"><div class="completionProduct"><span>Prima</span><strong>${escapeHtml(oldLabel)}</strong></div><span class="previewArrow">→</span><div class="completionProduct new"><span>Adesso</span><strong>${escapeHtml(completed.product.id)} · ${escapeHtml(completed.product.name)}</strong></div></div><div class="completionMeta"><span class="completionBadge">✓ ${backupCount || count} backup salvati</span><span class="completionBadge">✓ Registro aggiornato</span></div></div>
        <div class="refreshNotice" role="note"><span class="refreshNoticeIcon">↻</span><span><strong>Aggiorna la pagina dell’ordine</strong><span>PrestaShop potrebbe mostrare ancora il prodotto precedente finché la pagina non viene ricaricata.</span></span></div>
        <div class="completionActions"><button class="btn primary refreshPage" type="button">↻ Aggiorna pagina ora</button><button class="btn another" type="button">Modifica un altro prodotto</button><button class="btn finish" type="button">Chiudi</button></div>`;
      q('.workflowView').classList.add('hidden');
      box.classList.remove('hidden');
      q('.body').scrollTop = 0;
      renderProgress();
      box.querySelector('.another').onclick = async () => {
        resetWorkflow();
        await load();
      };
      box.querySelector('.refreshPage').onclick = () => global.location.reload();
      box.querySelector('.finish').onclick = closeDialog;
    }

    function resetWorkflow() {
      state.order = null;
      state.selectedRows.clear();
      state.product = null;
      state.preview = null;
      state.verified = false;
      state.completed = null;
      state.searchSequence += 1;
      q('.search input').value = '';
      q('.confirm input').checked = false;
      ['.status', '.notice', '.choice', '.metrics', '.previewCard', '.steps', '.finalSummary', '.confirm', '.results', '.completion', '.suggestionSummary', '.suggest'].forEach((selector) => q(selector).classList.add('hidden'));
      q('.workflowView').classList.remove('hidden');
      q('.rows').innerHTML = '<p class="meta">Caricamento righe ordine…</p>';
      renderProgress();
      updateApply();
    }

    q('.apply').onclick = async () => {
      await busy(async () => {
        const completedRows = selectedRowObjects().map((row) => ({ ...row }));
        const completedProduct = { ...state.product };
        const completedPreviews = [...(state.preview?.previews || [])];
        const result = await api('apply', { orderDetailIds: [...state.selectedRows], productId: state.product.id });
        if (result.errors?.length) throw new Error(result.errors.map((item) => item.error).join(' · '));
        state.completed = {
          result,
          rows: completedRows,
          product: completedProduct,
          previews: completedPreviews,
        };
        renderCompletion();
      }).catch(() => {});
    };
    return { host, orderId };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  global.PrestaOrderPanel = { mount, detectOrderId };
})(globalThis);
