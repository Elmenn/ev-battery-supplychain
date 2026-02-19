// Minimal in-memory wallet state for railgun-clean helper modules

let state = {
  connected: false,
  eoa: null,
  lastUpdated: null,
};

export function getWalletState() {
  return { ...state };
}

export function updateWalletState(partial = {}) {
  state = { ...state, ...partial, lastUpdated: Date.now() };
  return getWalletState();
}

export function resetWalletState() {
  state = { connected: false, eoa: null, lastUpdated: Date.now() };
  return getWalletState();
}

const railgunWalletStateApi = {
  getWalletState,
  updateWalletState,
  resetWalletState,
};

export default railgunWalletStateApi;
