export function getReplacementGate({
  preview,
  simulation,
  operationSignature,
  requirePreflightCheck,
  requireConfirmCheck,
  confirmChecked,
  confirmText,
  selectedRowCount,
}) {
  const previewReady = preview?.signature === operationSignature
    && Boolean(preview?.data?.previews?.length);
  const simulationOk = simulation?.signature === operationSignature
    && !simulation?.data?.errors?.length;
  const verificationRequired = requirePreflightCheck !== false;
  const verificationSatisfied = !verificationRequired || simulationOk;
  const readyToConfirm = previewReady && verificationSatisfied;
  const needsTypedConfirm = selectedRowCount >= 2;
  const confirmationMatches = String(confirmText || '').trim().toUpperCase() === 'CONFERMA';
  const canConfirm = readyToConfirm
    && (!requireConfirmCheck || confirmChecked)
    && (!needsTypedConfirm || confirmationMatches);

  return {
    previewReady,
    simulationOk,
    verificationRequired,
    readyToConfirm,
    needsTypedConfirm,
    canConfirm,
  };
}
