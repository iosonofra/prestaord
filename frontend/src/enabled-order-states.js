export function filterEnabledOrderStates(orderStates = [], enabledStateIds = []) {
  const enabled = new Set(enabledStateIds.map(String));
  return orderStates.filter((state) => enabled.has(String(state.id)));
}
