const prestaOrderExtension = globalThis.browser || globalThis.chrome;
PrestaOrderPanel.mount({
  api(action, payload = {}) {
    return prestaOrderExtension.runtime.sendMessage({ type: 'presta-order-api', action, payload })
      .then((result) => {
        if (!result?.ok) throw new Error(result?.error || 'Estensione non raggiungibile.');
        return result.data;
      });
  },
  onConfigure() {
    prestaOrderExtension.runtime.sendMessage({ type: 'open-options' }).catch(() => {});
    prestaOrderExtension.runtime.openOptionsPage?.();
  },
});
